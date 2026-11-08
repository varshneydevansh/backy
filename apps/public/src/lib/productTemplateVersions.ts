import { NextRequest, NextResponse } from 'next/server';
import { restoreProductTemplateDesign, type BackyCollectionRecord, type Site } from '@backy-cms/core';
import { requireAdminAccess } from './adminAccess';
import { shouldUseDemoStoreFallback, getRequiredDatabaseRepositories } from './repositoryRuntime';
import { getSiteByIdOrSlug, getCollectionByIdOrSlug, getCollectionRecordByIdOrSlug, listProductDesignRevisions, getProductDesignRevision, updateAdminCollectionRecord } from './backyStore';
import { collectionRecordVersion, collectionRecordWithVersion } from './collectionRecordVersion';
import { isValidProductTemplateInstancePin } from './templateInstanceProvenance';
import { syncRepositoryCollectionRecordMediaReferences } from './repositoryMediaReferenceSync';
import { deliverSiteWebhooks } from './siteWebhookDelivery';
import { recordAdminAudit } from './adminAudit';
import { recordSiteCacheInvalidation } from './cacheInvalidation';
const headers = { 'cache-control': 'private, no-store' };
const json = (requestId: string, data: unknown) => NextResponse.json({ success: true, requestId, data }, { headers });
const fail = (requestId: string, status: number, code: string) => NextResponse.json({ success: false, requestId, error: { code, message: code === 'COLLECTION_RECORD_CONFLICT' ? 'The product changed. Reload and review the current version before restoring.' : 'The product design recovery could not complete.' } }, { status, headers });
export async function handleProductDesignVersions(request: NextRequest, params: { siteId: string; productId: string; revisionId?: string }, restore = false) {
 const requestId = request.headers.get('x-request-id') || `req_${Date.now().toString(36)}`;
 const permissions = ['collections.view', 'commerce.view', ...(restore ? ['collections.edit', 'commerce.edit'] : [])];
 const access = await requireAdminAccess(request, requestId, { permissions });
 if (access instanceof NextResponse) return access;
 const actorId = access.session?.user.id;
 try {
  let expectedVersion: string | undefined;
  if (restore) {
   const raw = await request.text(); if (Buffer.byteLength(raw) > 4096) return fail(requestId, 413, 'PRODUCT_DESIGN_REVISION_LIMIT');
   const body = JSON.parse(raw);
   if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.expectedVersion !== 'string' || !/^record-v1:[a-f0-9]{64}$/.test(body.expectedVersion) || !params.revisionId) return fail(requestId,400,'INVALID_PRODUCT_DESIGN_RESTORE_REQUEST');
   expectedVersion = body.expectedVersion;
  }
  const repositories = shouldUseDemoStoreFallback() ? null : await getRequiredDatabaseRepositories();
  const site = (repositories ? await repositories.sites.getById(params.siteId) || await repositories.sites.getBySlug(params.siteId) : getSiteByIdOrSlug(params.siteId)) as Site | null;
  if (!site) return fail(requestId,404,'SITE_NOT_FOUND');
  const collection = repositories ? await repositories.collections.getBySlug(site.id,'products') : getCollectionByIdOrSlug(site.id,'products',{includeUnpublished:true});
  if (!collection) return fail(requestId,404,'PRODUCT_NOT_FOUND');
  const record = (repositories ? await repositories.collections.getRecordById(site.id,collection.id,params.productId) : getCollectionRecordByIdOrSlug(site.id,collection.id,params.productId,{includeUnpublished:true})) as BackyCollectionRecord | null;
  if (!record || record.id !== params.productId || record.siteId !== site.id || record.collectionId !== collection.id) return fail(requestId,404,'PRODUCT_NOT_FOUND');
  if (!restore) {
   const query = new URL(request.url).searchParams;
   const offsetValue = query.get('offset') ?? '0', limitValue = query.get('limit') ?? '100';
   if (!/^(0|[1-9][0-9]*)$/.test(offsetValue) || !/^[1-9][0-9]*$/.test(limitValue) || !Number.isSafeInteger(Number(offsetValue)) || Number(offsetValue) > 1000000 || Number(limitValue) > 100) return fail(requestId,400,'INVALID_PRODUCT_DESIGN_HISTORY_REQUEST');
   const offset = Number(offsetValue), limit = Number(limitValue);
   if (repositories && !repositories.collections.listProductDesignRevisions) return fail(requestId,503,'PRODUCT_DESIGN_HISTORY_UNAVAILABLE');
   const revisions = repositories ? await repositories.collections.listProductDesignRevisions!(site.id,collection.id,record.id,{offset,limit}) : listProductDesignRevisions(site.id,collection.id,record.id,{offset,limit});
   return json(requestId,{ siteId: site.id, collectionId: collection.id, productId: record.id, currentVersion: collectionRecordVersion(record), pagination:{offset,limit,hasMore:revisions.length>limit,nextOffset:revisions.length>limit?offset+limit:null}, revisions: revisions.slice(0,limit).map(item => ({ id:item.id,createdAt:item.createdAt,operation:item.operation,templateId:item.templateId,targetRevisionId:item.targetRevisionId,hasPinnedBaseline:isValidProductTemplateInstancePin(item.snapshot.pin) })) });
  }
  if (collectionRecordVersion(record) !== expectedVersion) return fail(requestId,409,'COLLECTION_RECORD_CONFLICT');
  if (repositories && (!repositories.collections.getProductDesignRevision || !repositories.collections.withRecordWriteLock)) return fail(requestId,503,'PRODUCT_DESIGN_HISTORY_UNAVAILABLE');
  const revision = repositories ? await repositories.collections.getProductDesignRevision!(site.id,collection.id,record.id,params.revisionId!) : getProductDesignRevision(site.id,collection.id,record.id,params.revisionId!);
  if (!revision || revision.siteId !== site.id || revision.collectionId !== collection.id || revision.recordId !== record.id) return fail(requestId,404,'PRODUCT_DESIGN_REVISION_NOT_FOUND');
  // Invalid or legacy provenance is removed, never invented from geometry or table presence.
  const snapshot = { ...revision.snapshot, pin: isValidProductTemplateInstancePin(revision.snapshot.pin) ? revision.snapshot.pin : null };
  const input: any = { expectedRecord: record, values: restoreProductTemplateDesign(record.values,snapshot), beforeUpdateProductDesignRevision: { operation:'restore',templateId:revision.templateId,targetRevisionId:revision.id,actorId,requestId } };
  const saved = repositories ? await repositories.collections.withRecordWriteLock(site.id,collection.id,async (repository,lockedCollection,admission) => {
   if (lockedCollection.slug !== 'products') throw Object.assign(Error('Reload'),{code:'COLLECTION_RECORD_CONFLICT'});
   const result = await repository.updateRecord(site.id,collection.id,record.id,input);
   if (!result.item) throw Error('PRODUCT_DESIGN_HISTORY_UNAVAILABLE');
   await syncRepositoryCollectionRecordMediaReferences({mediaRepository:admission.media as import("@backy-cms/core").BackyMediaRepository,siteId:site.id,collectionId:collection.id,recordId:record.id,values:result.item.values}); return result.item;
  }) : updateAdminCollectionRecord(site.id,collection.id,record.id,input);
  if (!saved) return fail(requestId,503,'PRODUCT_DESIGN_HISTORY_UNAVAILABLE');
  const completionWarnings: string[] = [];
  try { await recordAdminAudit({repositories,siteId:site.id,actorId,entity:'collectionRecord',entityId:record.id,action:'frontendDesign.productDesignRestore',metadata:{collectionId:collection.id,revisionId:revision.id},requestId}); } catch { completionWarnings.push('PRODUCT_DESIGN_RESTORE_AUDIT_PENDING'); }
  if (repositories) try { await recordSiteCacheInvalidation(repositories,{siteId:site.id,scope:'content',entity:'site',entityId:site.id,reason:'product-design-restore',requestId}); } catch { completionWarnings.push('PRODUCT_DESIGN_RESTORE_CACHE_PENDING'); }
  try { const deliveries=await deliverSiteWebhooks({repositories,site,kind:'site-updated',requestId,actor:actorId,reason:'frontendDesign.productDesignRestore',data:{resourceType:'productDesignRestore',collectionId:collection.id,productId:record.id,restoredFromRevisionId:revision.id},metadata:{action:'frontendDesign.productDesignRestore',source:'admin-product-design-restore-api',changedKeys:['values.design','values.frontendTemplateInstance'],resourceType:'collectionRecord',resourceId:record.id}}); if(deliveries.some(delivery=>delivery.status==='failed')) completionWarnings.push('PRODUCT_DESIGN_RESTORE_WEBHOOK_PENDING'); } catch { completionWarnings.push('PRODUCT_DESIGN_RESTORE_WEBHOOK_PENDING'); }
  return json(requestId,{siteId:site.id,collectionId:collection.id,productId:record.id,restoredFromRevisionId:revision.id,record:collectionRecordWithVersion(saved),completionWarnings});
 } catch (cause: any) {
  if (cause instanceof SyntaxError) return fail(requestId,400,'INVALID_PRODUCT_DESIGN_RESTORE_REQUEST');
  if (cause?.code === 'COLLECTION_RECORD_CONFLICT') return fail(requestId,409,cause.code);
  if (/LIMIT/.test(cause?.message || '')) return fail(requestId,413,'PRODUCT_DESIGN_REVISION_LIMIT');
  if (/INVALID/.test(cause?.message || '')) return fail(requestId,422,'PRODUCT_DESIGN_REVISION_INVALID');
  return fail(requestId,503,'PRODUCT_DESIGN_HISTORY_UNAVAILABLE');
 }
}
