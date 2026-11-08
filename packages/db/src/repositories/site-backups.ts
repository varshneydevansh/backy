import { postgresResultRows } from '../adapters/postgres-result';
import { assertSiteCreationQuota, assertSiteBackupGraph, SITE_BACKUP_LIMITS, SITE_BACKUP_TABLES, SiteBackupError, type BackySiteBackupRepository, type SiteBackupGraph, type SiteBackupRestoreJob, type SiteBackupRow } from '@backy-cms/core';
import { and, asc, eq, getTableColumns, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { DatabaseInstance } from '../adapters';
import * as schema from '../schema';

const unavailable = () => new SiteBackupError('SITE_BACKUP_UNAVAILABLE',503,'Whole-site recovery requires its PostgreSQL repository and migration.');
const activeJobLocks=new WeakMap<object,number>();
const toJob = (row: typeof schema.siteBackupRestoreJobs.$inferSelect): SiteBackupRestoreJob => ({...row,files:row.files as SiteBackupRestoreJob['files'],state:row.state as SiteBackupRestoreJob['state'],createdAt:row.createdAt.toISOString()});
export function createSiteBackupRepository(db: DatabaseInstance, adapterType: string): BackySiteBackupRepository {
  const database = db as NodePgDatabase<typeof schema>;
  const ensure = () => {if(adapterType!=='postgres') throw unavailable();};
  const tables = Object.fromEntries(SITE_BACKUP_TABLES.map(name => [name,schema[name]])) as Record<typeof SITE_BACKUP_TABLES[number],any>;
  const lock = async(tx:any,mode:'SHARE'|'EXCLUSIVE') => {
    await tx.execute(sql.raw("SET LOCAL lock_timeout = '1500ms'"));
    await tx.execute(sql.raw("SET LOCAL statement_timeout = '30000ms'"));
    await tx.execute(sql.raw("SET LOCAL idle_in_transaction_session_timeout = '30000ms'"));
    // Every ordinary writer conflicts with SHARE/EXCLUSIVE, including phantom inserts.
    // PostgreSQL acquires all tables in one canonical order before row/FK locks.
    const names = ['sites',...SITE_BACKUP_TABLES.map(name => ({blogPosts:'blog_posts',blogCategories:'blog_categories',blogTags:'blog_tags',mediaFolders:'media_folders',mediaVersions:'media_versions',contentCollections:'content_collections',contentCollectionRecords:'content_collection_records',siteVisitors:'site_visitors',formDefinitions:'form_definitions',formSubmissions:'form_submissions',formContacts:'form_contacts',reusableSections:'reusable_sections',interactiveComponents:'interactive_components',contentRevisions:'content_revisions',templateRevisions:'template_revisions',productDesignRevisions:'product_design_revisions',formDesignRevisions:'form_design_revisions',collectionDesignRevisions:'collection_design_revisions',commentBlocklist:'comment_blocklist'} as Record<string,string>)[name]||name)].sort((a,b)=>a==='sites'?-1:b==='sites'?1:a.localeCompare(b));
    await tx.execute(sql.raw(`LOCK TABLE ${names.map(name=>`public."${name}"`).join(',')} IN ${mode} MODE`));
  };
  return {
    async withJobLock(sourceSiteId,jobId,run) {
      ensure();const active=activeJobLocks.get(db)||0;if(active>=2)throw new SiteBackupError('SITE_BACKUP_BUSY',503,'Restore admission is busy. Retry later.');activeJobLocks.set(db,active+1);
      try{return await database.transaction(async tx=>{
        const result=await tx.execute(sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${`backy-site-backup:${sourceSiteId}:${jobId}`},0)) AS acquired`);
        if(!postgresResultRows<{acquired:boolean}>(result)[0]?.acquired)throw new SiteBackupError('SITE_BACKUP_BUSY',503,'This restore is active in another worker. Retry later.');
        return run();
      });}finally{const remaining=(activeJobLocks.get(db)||1)-1;if(remaining)activeJobLocks.set(db,remaining);else activeJobLocks.delete(db);}
    },
    async snapshot(siteId,read) {
      ensure(); return database.transaction(async tx => {
        await lock(tx,'SHARE');
        const [site] = await tx.select().from(schema.sites).where(eq(schema.sites.id,siteId));
        if(!site) throw new SiteBackupError('SITE_NOT_FOUND',404,'Site not found.');
        const graph: SiteBackupGraph = {site:JSON.parse(JSON.stringify(site)),tables:{} as SiteBackupGraph['tables']}; let remaining=SITE_BACKUP_LIMITS.maxRows;
        for(const name of SITE_BACKUP_TABLES) {
          const table=tables[name],rows=await tx.select().from(table).where(eq(table.siteId,siteId)).orderBy(asc(table.id)).limit(remaining+1);
          if(rows.length>remaining) throw new SiteBackupError('SITE_BACKUP_LIMIT_EXCEEDED',413,'The site exceeds the bounded recovery row limit.');
          remaining-=rows.length; graph.tables[name]=JSON.parse(JSON.stringify(rows));
        }
        assertSiteBackupGraph(graph,siteId); return read(graph);
      });
    },
    async createJob(input) {ensure(); const [row]=await database.insert(schema.siteBackupRestoreJobs).values({...input,remaining:input.files.length}).returning(); return toJob(row);},
    async getJob(sourceSiteId,id) {ensure();const [row]=await database.select().from(schema.siteBackupRestoreJobs).where(and(eq(schema.siteBackupRestoreJobs.sourceSiteId,sourceSiteId),eq(schema.siteBackupRestoreJobs.id,id)));return row?toJob(row):null;},
    async recordFileState(sourceSiteId,id,index,state){ensure();await database.transaction(async tx=>{const [row]=await tx.select().from(schema.siteBackupRestoreJobs).where(and(eq(schema.siteBackupRestoreJobs.sourceSiteId,sourceSiteId),eq(schema.siteBackupRestoreJobs.id,id))).for('update');if(!row||row.state!=='pending')throw unavailable();const files=structuredClone(row.files) as SiteBackupRestoreJob['files'];if(!Number.isSafeInteger(index)||!files[index]||files[index].writeState!==(state==='writing'?'planned':'writing'))throw unavailable();files[index].writeState=state;await tx.update(schema.siteBackupRestoreJobs).set({files,updatedAt:new Date()}).where(eq(schema.siteBackupRestoreJobs.id,id));});},
    async listJobs(sourceSiteId) {ensure();const rows=await database.select().from(schema.siteBackupRestoreJobs).where(eq(schema.siteBackupRestoreJobs.sourceSiteId,sourceSiteId)).orderBy(asc(schema.siteBackupRestoreJobs.createdAt)).limit(101);if(rows.length>100)throw new SiteBackupError('SITE_BACKUP_JOB_INVENTORY_INCOMPLETE',503,'Resolve earlier restore jobs before creating more.');return rows.map(toJob);},
    async commit(jobId,sourceSiteId,graph) {
      ensure();assertSiteBackupGraph(graph,String(graph.site.id));
      return database.transaction(async tx => {
        await lock(tx,'EXCLUSIVE');
        await tx.execute(sql.raw('LOCK TABLE public.platform_settings IN SHARE MODE'));
        const [policy]=await tx.select().from(schema.platformSettings).where(eq(schema.platformSettings.id,'default'));
        const count=await tx.execute(sql`SELECT count(*)::int AS count FROM public.sites`);
        try{assertSiteCreationQuota(policy||{},Number(postgresResultRows<{count:number}>(count)[0]?.count));}catch(error){if((error as any)?.code==='BILLING_SITE_LIMIT')throw new SiteBackupError('BILLING_SITE_LIMIT',402,(error as Error).message);throw error;}
        const [job]=await tx.select().from(schema.siteBackupRestoreJobs).where(and(eq(schema.siteBackupRestoreJobs.sourceSiteId,sourceSiteId),eq(schema.siteBackupRestoreJobs.id,jobId))).for('update');
        if(!job||job.state!=='pending'||job.targetSiteId!==graph.site.id) throw new SiteBackupError('SITE_BACKUP_JOB_INVALID',409,'The restore job is unavailable or already applied.');
        const [source]=await tx.select().from(schema.sites).where(eq(schema.sites.id,sourceSiteId));
        if(!source||source.teamId!==graph.site.teamId)throw new SiteBackupError('SITE_BACKUP_SCOPE_CHANGED',409,'The site ownership changed. Review the restore again.');
        const [conflict]=await tx.select({id:schema.sites.id}).from(schema.sites).where(eq(schema.sites.slug,String(graph.site.slug)));
        if(conflict)throw new SiteBackupError('SITE_BACKUP_SLUG_CONFLICT',409,'The requested draft site slug is already in use.');
        const values = (table:any,row:SiteBackupRow) => Object.fromEntries(Object.entries(getTableColumns(table)).flatMap(([key,column]) => row[key]===undefined?[]:[[key,(column as any).dataType==='date'&&row[key]!==null?new Date(String(row[key])):row[key]]]));
        await tx.insert(schema.sites).values(values(schema.sites,graph.site) as typeof schema.sites.$inferInsert);
        for(const name of SITE_BACKUP_TABLES) {
          // Contacts depend on submissions; comments have no parent FK. All row
          // identities are new, and the graph was validated before any write.
          const table=tables[name],hierarchy=name==='pages'||name==='mediaFolders';
          // Self-FK parents may be in a later batch (or form an existing cycle).
          // Create every node first, then restore its exact links in this transaction.
          for(let offset=0;offset<graph.tables[name].length;offset+=100)await tx.insert(table).values(graph.tables[name].slice(offset,offset+100).map(row=>values(table,hierarchy?{...row,parentId:null}:row)));
          if(hierarchy)for(const row of graph.tables[name])if(row.parentId!=null)await tx.update(table).set({parentId:row.parentId}).where(eq(table.id,String(row.id)));
        }
        await tx.update(schema.siteBackupRestoreJobs).set({state:'committed',updatedAt:new Date()}).where(eq(schema.siteBackupRestoreJobs.id,jobId));
      });
    },
    async settle(sourceSiteId,id,remaining) {ensure();await database.update(schema.siteBackupRestoreJobs).set({remaining,state:remaining?'pending':'settled',updatedAt:new Date()}).where(and(eq(schema.siteBackupRestoreJobs.sourceSiteId,sourceSiteId),eq(schema.siteBackupRestoreJobs.id,id)));},
    async pruneSettled(sourceSiteId){ensure();await database.delete(schema.siteBackupRestoreJobs).where(and(eq(schema.siteBackupRestoreJobs.sourceSiteId,sourceSiteId),eq(schema.siteBackupRestoreJobs.state,'settled')));},
  };
}
