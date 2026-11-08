import { postgresResultRows } from '../adapters/postgres-result';
import {assertSiteCreationQuota,SiteCreationAdmissionError} from '@backy-cms/core';
import {eq,sql} from 'drizzle-orm';import type {NodePgDatabase} from 'drizzle-orm/node-postgres';import type {DatabaseInstance} from '../adapters';import * as schema from '../schema';
/** All ordinary creates and page-only duplication share fresh global quota/slug admission. */
export async function withSiteCreationAdmission<T>(db:DatabaseInstance,adapterType:string,run:(tx:NodePgDatabase<typeof schema>)=>Promise<T>,copyPages=false):Promise<T>{
 if(adapterType!=='postgres')throw new SiteCreationAdmissionError('SITE_CREATION_UNAVAILABLE',503,'Atomic site creation requires the PostgreSQL adapter.');
 try{return await (db as NodePgDatabase<typeof schema>).transaction(async tx=>{
  await tx.execute(sql.raw("SET LOCAL lock_timeout = '1500ms'"));await tx.execute(sql.raw("SET LOCAL statement_timeout = '30000ms'"));await tx.execute(sql.raw("SET LOCAL idle_in_transaction_session_timeout = '30000ms'"));
  // Sites first: global slug/count must be fresh across every source site.
  // Ordinary ROW EXCLUSIVE inserts and FK row admissions conflict with EXCLUSIVE.
  await tx.execute(sql.raw('LOCK TABLE public.sites IN EXCLUSIVE MODE'));await tx.execute(sql.raw('LOCK TABLE public.platform_settings IN SHARE MODE'));
  if(copyPages)await tx.execute(sql.raw('LOCK TABLE public.pages IN SHARE MODE'));
  const [settings]=await tx.select().from(schema.platformSettings).where(eq(schema.platformSettings.id,'default'));
  const result=await tx.execute(sql`SELECT count(*)::int AS count FROM public.sites`),count=Number(postgresResultRows<{count:number}>(result)[0]?.count);assertSiteCreationQuota(settings||{},count);
  return run(tx as unknown as NodePgDatabase<typeof schema>);
 },{isolationLevel:'serializable'});}catch(error){const code=(error as any)?.cause?.code||(error as any)?.code;if(['55P03','40001','40P01'].includes(code))throw new SiteCreationAdmissionError('SITE_CREATION_BUSY',503,'Site creation changed or admission is busy. Reload sites and retry; no automatic replay.');throw error;}
}
