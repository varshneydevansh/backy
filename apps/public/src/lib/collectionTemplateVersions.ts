import { NextRequest, NextResponse } from 'next/server';
import { collectionTemplateDesignFields, collectionTemplateSchemaConflicts, withCollectionTemplateDesign, type BackyCollection } from '@backy-cms/core';
import { requireCommerceCollectionAccess, commerceCollectionPermissions } from './adminCommerceCollectionAccess';
import { requireAdminAccess } from './adminAccess';
import { shouldUseDemoStoreFallback, getRequiredDatabaseRepositories } from './repositoryRuntime';
import { getSiteByIdOrSlug, getCollectionByIdOrSlug, listCollectionDesignRevisions, getCollectionDesignRevision, updateAdminCollection } from './backyStore';
import { collectionDefinitionVersion, collectionDefinitionWithVersion } from './collectionDefinitionVersion';
import { isValidCollectionTemplateInstancePin, assertTemplateInstanceContentSafe } from './templateInstanceProvenance';
import { recordAdminAudit } from './adminAudit';
import { recordSiteCacheInvalidation } from './cacheInvalidation';
import { syncCollectionTemplateMediaReferences } from './collectionTemplateMediaReferences';
const headers = { 'cache-control': 'private, no-store' };
const json = (requestId: string, data: unknown) => NextResponse.json({ success: true, requestId, data }, { headers });
const fail = (requestId: string, status: number, code: string) => NextResponse.json({ success: false, requestId, error: { code, message: code === 'COLLECTION_DEFINITION_CONFLICT' ? 'The collection changed. Reload before restoring its design.' : 'The collection design recovery could not complete.' } }, { status, headers });
export async function handleCollectionDesignVersions(request: NextRequest, params: { siteId: string; collectionId: string; revisionId?: string }, restore = false) {
 const requestId = request.headers.get('x-request-id') || `req_${Date.now().toString(36)}`;
 const permissions = ['collections.view', ...(restore ? ['collections.edit'] : [])];
 const access = await requireAdminAccess(request, requestId, { permissions, recordUsage: false });
 if (access instanceof NextResponse) return access;
 const actorId = access.session?.user.id;
 try {
  let expectedVersion: string | undefined;
  if (restore) {
   const raw = await request.text(); if (Buffer.byteLength(raw) > 4096) return fail(requestId, 413, 'COLLECTION_DESIGN_REVISION_LIMIT');
   const body = JSON.parse(raw);
   if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.expectedVersion !== 'string' || !/^collection-v1:[a-f0-9]{64}$/.test(body.expectedVersion) || !params.revisionId) return fail(requestId, 400, 'INVALID_COLLECTION_DESIGN_RESTORE_REQUEST');
   expectedVersion = body.expectedVersion;
  }
  const repositories = shouldUseDemoStoreFallback() ? null : await getRequiredDatabaseRepositories();
  const site = repositories ? await repositories.sites.getById(params.siteId) || await repositories.sites.getBySlug(params.siteId) : getSiteByIdOrSlug(params.siteId);
  if (!site) return fail(requestId, 404, 'SITE_NOT_FOUND');
  const collection = repositories ? await repositories.collections.getById(site.id, params.collectionId) : getCollectionByIdOrSlug(site.id, params.collectionId,{includeUnpublished:true}) as unknown as BackyCollection|null;
  if (!collection || collection.id !== params.collectionId || collection.siteId !== site.id) return fail(requestId, 404, 'COLLECTION_NOT_FOUND');
  for (const operation of restore ? ['view', 'configure'] as const : ['view'] as const) {
   const denied = await requireCommerceCollectionAccess(request, requestId, collection.slug, operation, { recordUsage: false });
   if (denied) return denied;
  }
  const admitted = await requireAdminAccess(request, requestId, { permissions: [...permissions, ...commerceCollectionPermissions(collection.slug, restore ? ['view', 'configure'] : ['view'])] });
  if (admitted instanceof NextResponse) return admitted;
  if (!restore) {
   const query = new URL(request.url).searchParams, offsetValue = query.get('offset') ?? '0', limitValue = query.get('limit') ?? '100';
   if (!/^(0|[1-9][0-9]*)$/.test(offsetValue) || !/^[1-9][0-9]*$/.test(limitValue) || !Number.isSafeInteger(Number(offsetValue)) || Number(offsetValue) > 1000000 || Number(limitValue) > 100) return fail(requestId, 400, 'INVALID_COLLECTION_DESIGN_HISTORY_REQUEST');
   const offset = Number(offsetValue), limit = Number(limitValue);
   if (repositories && !repositories.collections.listCollectionDesignRevisions) return fail(requestId, 503, 'COLLECTION_DESIGN_HISTORY_UNAVAILABLE');
   const revisions = repositories ? await repositories.collections.listCollectionDesignRevisions!(site.id, collection.id, { offset, limit }) : listCollectionDesignRevisions(site.id, collection.id, { offset, limit });
   return json(requestId, { siteId: site.id, collectionId: collection.id, currentVersion: collectionDefinitionVersion(collection), pagination: { offset, limit, hasMore: revisions.length > limit, nextOffset: revisions.length > limit ? offset + limit : null }, revisions: revisions.slice(0, limit).map(item => ({ id: item.id, createdAt: item.createdAt, operation: item.operation, templateId: item.templateId ?? null, targetRevisionId: item.targetRevisionId ?? null, hasPinnedBaseline: isValidCollectionTemplateInstancePin(item.snapshot.pin) })) });
  }
  if (collectionDefinitionVersion(collection) !== expectedVersion) return fail(requestId, 409, 'COLLECTION_DEFINITION_CONFLICT');
  if (repositories && (!repositories.collections.getCollectionDesignRevision || !repositories.collections.withDefinitionWriteLock)) return fail(requestId, 503, 'COLLECTION_DESIGN_HISTORY_UNAVAILABLE');
  const revision = repositories ? await repositories.collections.getCollectionDesignRevision!(site.id, collection.id, params.revisionId!) : getCollectionDesignRevision(site.id, collection.id, params.revisionId!);
  if (!revision || revision.siteId !== site.id || revision.collectionId !== collection.id) return fail(requestId, 404, 'COLLECTION_DESIGN_REVISION_NOT_FOUND');
  if (revision.snapshot.schemaVersion !== 'backy.collection-design-version.v1') return fail(requestId, 422, 'COLLECTION_DESIGN_REVISION_INVALID');
  assertTemplateInstanceContentSafe(revision.snapshot.design);
  if (collectionTemplateSchemaConflicts(collection.fields, collectionTemplateDesignFields(revision.snapshot.design)).length) return fail(requestId, 422, 'COLLECTION_TEMPLATE_SCHEMA_INCOMPATIBLE');
  if (revision.snapshot.pin !== null && !isValidCollectionTemplateInstancePin(revision.snapshot.pin)) return fail(requestId,422,'COLLECTION_DESIGN_REVISION_INVALID');
  const pin = revision.snapshot.pin;
  if(pin && revision.templateId && pin.templateId!==revision.templateId)return fail(requestId,422,'COLLECTION_DESIGN_REVISION_INVALID');
  const input = { ...withCollectionTemplateDesign(collection, revision.snapshot.design, pin), expectedCollection: collection, beforeUpdateCollectionDesignRevision: { operation: 'restore' as const, templateId: revision.templateId, targetRevisionId: revision.id, actorId, requestId } };
  const saved = repositories ? await repositories.collections.withDefinitionWriteLock!(site.id, collection.id, async (writer, _locked, scoped) => {
   const saved = (await writer.update(site.id, collection.id, input)).item;
   await syncCollectionTemplateMediaReferences(scoped.media, saved);
   return saved;
  }) : updateAdminCollection(site.id, collection.id, input);
  if (!saved) return fail(requestId, 503, 'COLLECTION_DESIGN_HISTORY_UNAVAILABLE');
  const completionWarnings: string[] = [];
  try { await recordAdminAudit({ repositories, siteId: site.id, actorId, entity: 'collection', entityId: collection.id, action: 'frontendDesign.collectionDesignRestore', metadata: { revisionId: revision.id }, requestId }); } catch { completionWarnings.push('COLLECTION_DESIGN_RESTORE_AUDIT_PENDING'); }
  if (repositories) try { await recordSiteCacheInvalidation(repositories, { siteId: site.id, scope: 'content', entity: 'site', entityId: site.id, reason: 'collection-design-restore', requestId }); } catch { completionWarnings.push('COLLECTION_DESIGN_RESTORE_CACHE_PENDING'); }
  return json(requestId, { siteId: site.id, collectionId: collection.id, restoredFromRevisionId: revision.id, collection: collectionDefinitionWithVersion(saved as BackyCollection), completionWarnings });
 } catch (cause: any) {
  if (cause instanceof SyntaxError) return fail(requestId, 400, 'INVALID_COLLECTION_DESIGN_RESTORE_REQUEST');
  if (cause?.code === 'COLLECTION_DEFINITION_CONFLICT') return fail(requestId, 409, cause.code);
  if (/LIMIT/.test(cause?.message || '')) return fail(requestId, 413, 'COLLECTION_DESIGN_REVISION_LIMIT');
  if (/INCOMPATIBLE/.test(cause?.message || '')) return fail(requestId, 422, 'COLLECTION_TEMPLATE_SCHEMA_INCOMPATIBLE');
  if (/INVALID|UNSAFE/.test(cause?.message || '')) return fail(requestId, 422, 'COLLECTION_DESIGN_REVISION_INVALID');
  return fail(requestId, 503, 'COLLECTION_DESIGN_HISTORY_UNAVAILABLE');
 }
}
