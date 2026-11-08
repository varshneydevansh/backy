/** Existing-domain provider handoff only. Mail-scoped tokens never grant account provisioning. */
import { createHash } from 'node:crypto';
import { BackyMailboxSendError } from '@backy-cms/core';
import { demoMailboxManagementJournal } from './demoMailboxManagementJournal';
import { getSiteMailboxBindings } from './siteMailboxes';
import { createHostingerManagedAlias, createHostingerManagedMailbox, inspectHostingerMailManagement, HostingerMailManagementError, validHostingerManagementLocalPart, validHostingerManagementPassword } from './hostingerMailManagement';
import { NextRequest, NextResponse } from 'next/server';
import { adminAccessError, isOwnerAdminSession, requireAdminAccess } from './adminAccess';
import { getSiteByIdOrSlug } from './backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from './repositoryRuntime';
import { isCanonicalEmailSiteId } from './emailSenderPolicy';
export const HOSTINGER_MAIL_DASHBOARD = 'https://hpanel.hostinger.com';
export interface SiteMailboxManagementBinding { id: string; siteId: string; domain: string; dashboardUrl: string; orderId?: string }
class ManagementError extends Error { constructor(public code: string, public status: number, message: string) { super(message); } }
const invalid = (): never => { throw new ManagementError('MAILBOX_MANAGEMENT_CONFIGURATION_INVALID', 503, 'Repair the explicit server site/domain management bindings.'); };
export function getSiteMailboxManagementBindings(env: Record<string, string | undefined> = process.env): SiteMailboxManagementBinding[] {
  const raw = env.BACKY_HOSTINGER_MAIL_MANAGEMENT_BINDINGS?.trim(); if (!raw) return [];
  if (Buffer.byteLength(raw, 'utf8') > 65536) return invalid();
  let input: unknown; try { input = JSON.parse(raw); } catch { return invalid(); }
  if (!Array.isArray(input) || input.length > 200) return invalid();
  const ids = new Set<string>(), domains = new Set<string>();
  return input.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(key => !['id', 'siteId', 'domain', 'dashboardUrl', 'orderId'].includes(key))
      || typeof row.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(row.id) || !isCanonicalEmailSiteId(row.siteId)
      || typeof row.domain !== 'string' || row.domain.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(row.domain)
      || row.orderId !== undefined && (typeof row.orderId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(row.orderId))
      || typeof row.dashboardUrl !== 'string' || row.dashboardUrl.length > 2048) return invalid();
    let url: URL; try { url = new URL(row.dashboardUrl); } catch { return invalid(); }
    // Copy a reviewed existing-domain URL from hPanel, never a signed URL or a caller-supplied destination.
    if (url.origin !== HOSTINGER_MAIL_DASHBOARD || url.username || url.password || url.search || url.hash || !/^\/emails(?:\/[^?#\s\\]*)?$/.test(url.pathname) || /%0[0-9a-f]|%1[0-9a-f]|%7f/i.test(url.pathname) || url.href !== row.dashboardUrl) return invalid();
    const domain = row.domain.toLowerCase(); if (ids.has(row.id) || domains.has(domain)) return invalid(); ids.add(row.id); domains.add(domain);
    return { id: row.id, siteId: row.siteId, domain, dashboardUrl: row.dashboardUrl, ...(row.orderId ? { orderId: row.orderId } : {}) };
  });
}
const managementResponse = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
const managementFailure = (requestId: string, status: number, code: string, message: string) => managementResponse({ success: false, requestId, error: { code, message } }, status);
export async function siteMailboxManagementRoute(request: NextRequest, context: { params: Promise<{ siteId: string }> }) {
  const requestId = `mail_management_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    if (['authorization', 'x-backy-admin-session', 'x-backy-admin-key', 'x-api-key'].some(header => request.headers.has(header))) return adminAccessError(403, 'OWNER_SESSION_REQUIRED', 'Mailbox management requires an Owner cookie session without explicit credentials.', requestId);
    if (!request.cookies.get('backy_admin_session')?.value?.trim()) return adminAccessError(401, 'UNAUTHORIZED', 'Mailbox management requires a current Owner cookie session.', requestId);
    const access = await requireAdminAccess(request, requestId, { permissions: ['sites.view', 'settings.view'], recordUsage: false });
    if (access instanceof NextResponse) return access;
    if (!isOwnerAdminSession(access)) return adminAccessError(403, 'OWNER_SESSION_REQUIRED', 'Mailbox management requires an active Owner session.', requestId);
    const respond = managementResponse, error = (status: number, code: string, message: string) => managementFailure(requestId, status, code, message);
    if (request.method !== 'GET') return error(405, 'MAILBOX_MANAGEMENT_METHOD_NOT_ALLOWED', 'This operation describes provider management only; it never creates a mailbox or alias.');
    if (new URL(request.url).searchParams.size || request.body) return error(400, 'MAILBOX_REQUEST_INVALID', 'Management domains and destinations are owned by the server.');
    const params = await context.params;
    const siteId = params.siteId, repositories = shouldUseDemoStoreFallback() ? null : await getRequiredDatabaseRepositories();
    const site = repositories ? await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId) : getSiteByIdOrSlug(siteId);
    if (!site) return error(404, 'SITE_NOT_FOUND', 'Site not found.');
    const domains = getSiteMailboxManagementBindings().filter(row => row.siteId === site.id).map(({ id, domain, dashboardUrl, orderId }) => ({ id, domain, dashboardUrl, nativeConfigured: Boolean(orderId && process.env.BACKY_HOSTINGER_ACCOUNT_API_TOKEN?.trim()), aliasTargets: getSiteMailboxBindings().filter(row => row.siteId === site.id && row.address.endsWith('@' + domain)).map(({ id, address }) => ({ id, address })) }));
    return respond({ success: true, requestId, data: { schema: 'backy.mailbox-management.v1', siteId: site.id, provider: 'hostinger', mode: domains.some(row => row.nativeConfigured) ? 'native-management' : 'provider-dashboard', nativeProvisioning: domains.some(row => row.nativeConfigured), domains,
      providerDashboardUrl: HOSTINGER_MAIL_DASHBOARD, managementApiDocumented: true, managementAuthorityVerified: false, mailboxTokenProvisioning: false,
      accountApiOrigin: 'https://developers.hostinger.com', prerequisite: 'A separate hPanel account API token, exact mail order/domain binding and current plan quotas are required for native mailbox or alias creation; configured operations verify the exact active free plan and capacity before creating. The existing Mail API token reads and sends existing mailboxes only.',
      planBoundary: 'Use the existing email plan and remaining mailbox or alias capacity. Extra mailboxes or plan upgrades are not part of this handoff.' } });
  } catch (failure) { if (failure instanceof ManagementError) return managementFailure(requestId, failure.status, failure.code, failure.message); return managementFailure(requestId, 503, 'MAILBOX_WORKSPACE_UNAVAILABLE', 'Mailbox management handoff is unavailable. Check the server domain binding.'); }
}

async function managementBody(request: NextRequest, operation: 'inspect' | 'mailboxes' | 'aliases'): Promise<Record<string, string>> {
  if (!request.body || request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new ManagementError('MAILBOX_MANAGEMENT_REQUEST_INVALID',400,'Use bounded JSON management fields.');
  const length=request.headers.get('content-length'); if(length!==null&&(!/^\d+$/.test(length)||Number(length)>8192)) throw new ManagementError('MAILBOX_MANAGEMENT_REQUEST_INVALID',400,'Management request is too large.');
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0,timer:ReturnType<typeof setTimeout>|undefined;
  try {
    await Promise.race([(async()=>{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192)throw Error();chunks.push(value);}})(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error()),5000);})]);
    const raw=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
    if(operation==='inspect'){if(!/^\s*\{\s*\}\s*$/.test(raw))throw Error();return {};}
    if(!/^\s*\{\s*"(?:[^"\\]|\\.)*"\s*:\s*"(?:[^"\\]|\\.)*"(?:\s*,\s*"(?:[^"\\]|\\.)*"\s*:\s*"(?:[^"\\]|\\.)*")*\s*\}\s*$/.test(raw))throw Error();
    const keys=[...raw.matchAll(/("(?:[^"\\]|\\.)*")\s*:\s*("(?:[^"\\]|\\.)*")/g)].map(match=>JSON.parse(match[1]));if(new Set(keys).size!==keys.length)throw Error();
    const input=JSON.parse(raw),allowed=operation==='mailboxes'?['idempotencyKey','localPart','password']:['idempotencyKey','localPart','targetBindingId'];
    if(keys.length!==allowed.length||keys.some(key=>!allowed.includes(key))||!/^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/.test(input.idempotencyKey)||!validHostingerManagementLocalPart(input.localPart)||operation==='mailboxes'&&!validHostingerManagementPassword(input.password)||operation==='aliases'&&!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(input.targetBindingId))throw Error();
    return input;
  } catch { throw new ManagementError('MAILBOX_MANAGEMENT_REQUEST_INVALID',400,'Use supported local-part, creation identity and transient password or exact bound alias target fields.'); }
  finally{clearTimeout(timer);void reader.cancel().catch(()=>{});}
}
const projectManagementAttempt=({id,idempotencyKey,operation,address,targetBindingId,state,statusCode,createdAt,updatedAt}:any)=>({id,idempotencyKey,operation,address,targetBindingId,state,statusCode,createdAt,updatedAt});
export async function siteMailboxManagementActionRoute(request:NextRequest,context:{params:Promise<{siteId:string;managementBindingId:string}>},operation:'inspect'|'mailboxes'|'aliases'|'attempts'){
 const requestId=`mail_manage_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
 try{
  if(['authorization','x-backy-admin-session','x-backy-admin-key','x-api-key'].some(header=>request.headers.has(header)))return adminAccessError(403,'OWNER_SESSION_REQUIRED','Management requires an Owner cookie session without explicit credentials.',requestId);
  if(!request.cookies.get('backy_admin_session')?.value?.trim())return adminAccessError(401,'UNAUTHORIZED','Management requires a current Owner cookie session.',requestId);
  const access=await requireAdminAccess(request,requestId,{permissions:operation==='attempts'?['sites.view','settings.view']:['sites.view','settings.view','settings.configure'],recordUsage:false});
  if(access instanceof NextResponse)return access;if(!isOwnerAdminSession(access))return adminAccessError(403,'OWNER_SESSION_REQUIRED','Management requires an active Owner session.',requestId);
  const respond=managementResponse,error=(status:number,code:string,message:string)=>managementFailure(requestId,status,code,message);
  if(request.method!==(operation==='attempts'?'GET':'POST'))return error(405,'MAILBOX_MANAGEMENT_METHOD_NOT_ALLOWED','Use an explicit management action.');
  if(new URL(request.url).searchParams.size)return error(400,'MAILBOX_MANAGEMENT_REQUEST_INVALID','Order and domain identity are server-owned.');
  const params=await context.params,repositories=shouldUseDemoStoreFallback()?null:await getRequiredDatabaseRepositories();
  const site=repositories?await repositories.sites.getById(params.siteId)||await repositories.sites.getBySlug(params.siteId):getSiteByIdOrSlug(params.siteId);if(!site)return error(404,'SITE_NOT_FOUND','Site not found.');
  const binding=getSiteMailboxManagementBindings().find(row=>row.siteId===site.id&&row.id===params.managementBindingId);if(!binding)return error(404,'MAILBOX_MANAGEMENT_BINDING_NOT_FOUND','Management binding not found for this site.');
  const journal=repositories?repositories.mailboxManagement:demoMailboxManagementJournal,scope={siteId:site.id,bindingId:binding.id};
  if(operation==='attempts'){if(!journal)return error(503,'MAILBOX_MANAGEMENT_JOURNAL_UNAVAILABLE','Durable management history is unavailable.');const result=await journal.list({...scope,limit:20,offset:0});return respond({success:true,requestId,data:{schema:'backy.mailbox-management-attempts.v1',...scope,attempts:result.items.map(projectManagementAttempt)}});}
  const input=await managementBody(request,operation),apiToken=process.env.BACKY_HOSTINGER_ACCOUNT_API_TOKEN?.trim();
  if(!apiToken||!binding.orderId)return error(503,'HOSTINGER_MANAGEMENT_NOT_CONFIGURED','Configure the separate account API token and exact existing order/domain binding. Use the existing-domain hPanel handoff meanwhile.');
  const config={apiToken,orderId:binding.orderId,domain:binding.domain};
  if(operation==='inspect'){
   const snapshot=await inspectHostingerMailManagement(config);
   const targets=getSiteMailboxBindings().filter(row=>row.siteId===site.id&&row.address.endsWith('@'+binding.domain)&&snapshot.mailboxes.some(box=>box.id===row.mailboxId&&box.address===row.address&&box.status==='active')).map(row=>({id:row.id,address:row.address,remainingAliases:Math.max(0,snapshot.aliasQuotaPerMailbox-snapshot.aliases.filter(alias=>alias.mailboxId===row.mailboxId).length)}));
   return respond({success:true,requestId,data:{schema:'backy.mailbox-management-inspect.v1',...scope,domain:binding.domain,plan:snapshot.plan,remainingMailboxes:snapshot.remainingMailboxes,remainingAliases:snapshot.remainingAliases,aliasTargets:targets,authorityVerified:true,checkedAt:new Date().toISOString(),automaticUpgrade:false}});
  }
  const target=operation==='aliases'?getSiteMailboxBindings().find(row=>row.siteId===site.id&&row.id===input.targetBindingId&&row.address.endsWith('@'+binding.domain)):null;
  if(operation==='aliases'&&!target)return error(404,'MAILBOX_BINDING_NOT_FOUND','Alias target binding not found for this exact site and domain.');
  if(!journal)return error(503,'MAILBOX_MANAGEMENT_JOURNAL_UNAVAILABLE','Durable management admission is unavailable. No provider request was made.');
  // Creation identity excludes passwords entirely: replay never changes an existing mailbox credential.
  const fingerprint=createHash('sha256').update(JSON.stringify({orderId:binding.orderId,domain:binding.domain,operation,localPart:input.localPart,target:target?{id:target.id,mailboxId:target.mailboxId,address:target.address}:null})).digest('hex');
  const admission=await journal.admit({...scope,idempotencyKey:input.idempotencyKey,fingerprint,operation:operation==='mailboxes'?'mailbox':'alias',address:input.localPart+'@'+binding.domain,targetBindingId:target?.id||null});
  let attempt=admission.attempt,outcomePersisted=true;
  if(admission.admitted){let state:'accepted'|'rejected'|'uncertain'='rejected',statusCode:number|undefined;
   try{const snapshot=await inspectHostingerMailManagement(config);if(operation==='mailboxes')await createHostingerManagedMailbox(config,{localPart:input.localPart,password:input.password},snapshot);else await createHostingerManagedAlias(config,{localPart:input.localPart,mailboxId:target!.mailboxId,address:target!.address},snapshot);state='accepted';statusCode=201;}
   catch(failure){if(failure instanceof HostingerMailManagementError){state=failure.uncertain?'uncertain':'rejected';statusCode=failure.providerStatus||failure.status;}else state='uncertain';}
   try{attempt=await journal.settle(site.id,binding.id,attempt.id,{state,statusCode});}catch{outcomePersisted=false;}
  }
  return respond({success:true,requestId,data:{schema:'backy.mailbox-management-create.v1',...scope,attempt:projectManagementAttempt(attempt),replayed:!admission.admitted,outcomePersisted,providerCreated:outcomePersisted&&attempt.state==='accepted',automaticRetry:false,automaticUpgrade:false,inboxBindingCreated:false}});
 }catch(failure){if(failure instanceof ManagementError||failure instanceof BackyMailboxSendError||failure instanceof HostingerMailManagementError)return managementFailure(requestId,failure.status,failure.code,failure.message);return managementFailure(requestId,503,'MAILBOX_WORKSPACE_UNAVAILABLE','Management is unavailable. Check server configuration.');}
}
