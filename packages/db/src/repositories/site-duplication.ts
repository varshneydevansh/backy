import {randomUUID} from 'node:crypto';import {eq,asc,getTableColumns} from 'drizzle-orm';
import {prepareSiteDuplication,SiteCreationAdmissionError,SITE_DUPLICATION_SCOPE,SITE_DUPLICATION_PAGE_LIMIT,type BackySiteDuplicationRepository,type Site} from '@backy-cms/core';
import type {DatabaseInstance} from '../adapters';import {sites,pages} from '../schema';import {withSiteCreationAdmission} from './site-creation-admission';
export function createSiteDuplicationRepository(db:DatabaseInstance,adapterType:string):BackySiteDuplicationRepository{return{async duplicate(input){return withSiteCreationAdmission(db,adapterType,async tx=>{
 const deadline=Date.now()+20000,checkDeadline=()=>{if(Date.now()>deadline)throw new SiteCreationAdmissionError('SITE_CREATION_BUSY',503,'Duplication exceeded its bounded work window. Reload sites and retry.');};
 const uuid=/^[0-9a-f-]{36}$/i.test(input.sourceSiteId),[source]=await tx.select().from(sites).where(uuid?eq(sites.id,input.sourceSiteId):eq(sites.slug,input.sourceSiteId)).for('update');if(!source)throw new SiteCreationAdmissionError('SITE_NOT_FOUND',404,'Site not found.');
 const sourcePages=await tx.select().from(pages).where(eq(pages.siteId,source.id)).orderBy(asc(pages.id)).limit(SITE_DUPLICATION_PAGE_LIMIT+1),slugs=await tx.select({slug:sites.slug}).from(sites);
 const prepared=prepareSiteDuplication(JSON.parse(JSON.stringify(source)),JSON.parse(JSON.stringify(sourcePages)),input,new Set(slugs.map(site=>site.slug)),randomUUID,new Date().toISOString());
 const values=(table:any,row:Record<string,any>)=>Object.fromEntries(Object.entries(getTableColumns(table)).flatMap(([key,column])=>row[key]===undefined?[]:[[key,(column as any).dataType==='date'&&row[key]!==null?new Date(row[key]):row[key]]]));
 checkDeadline();await tx.insert(sites).values(values(sites,prepared.site) as typeof sites.$inferInsert);
 for(let i=0;i<prepared.pages.length;i+=100){checkDeadline();await tx.insert(pages).values(prepared.pages.slice(i,i+100).map(page=>values(pages,{...page,parentId:null})) as typeof pages.$inferInsert[]);}
 for(const page of prepared.pages)if(page.parentId){checkDeadline();await tx.update(pages).set({parentId:page.parentId}).where(eq(pages.id,page.id));}checkDeadline();
 return{site:prepared.site as unknown as Site,pagesCopied:prepared.pages.length,copiedResourceScope:SITE_DUPLICATION_SCOPE,concurrencyBoundary:'postgres-table-locks' as const,completionWarnings:[]};
 },true);}};}
