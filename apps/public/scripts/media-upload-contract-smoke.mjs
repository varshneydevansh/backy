#!/usr/bin/env node

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (relativePath) => fs.readFileSync(
  fileURLToPath(new URL(relativePath, import.meta.url)),
  'utf8',
);

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const mediaRoute = read('../src/app/api/admin/sites/[siteId]/media/route.ts');
const mediaDetailRoute = read('../src/app/api/admin/sites/[siteId]/media/[mediaId]/route.ts');
const mediaFoldersRoute = read('../src/app/api/admin/sites/[siteId]/media/folders/route.ts');
const mediaFolderDetailRoute = read('../src/app/api/admin/sites/[siteId]/media/folders/[folderId]/route.ts');
const adminSignedMediaUrlRoute = read('../src/app/api/admin/sites/[siteId]/media/[mediaId]/signed-url/route.ts');
const publicMediaRoute = read('../src/app/api/sites/[siteId]/media/route.ts');
const publicMediaDetailRoute = read('../src/app/api/sites/[siteId]/media/[mediaId]/route.ts');
const publicMediaFoldersRoute = read('../src/app/api/sites/[siteId]/media/folders/route.ts');
const publicFontManifestRoute = read('../src/app/api/sites/[siteId]/media/fonts/route.ts');
const publicMediaFileRoute = read('../src/app/api/sites/[siteId]/media/[mediaId]/file/route.ts');
const publicMediaTransformRoute = read('../src/app/api/sites/[siteId]/media/[mediaId]/transform/route.ts');
const openApiRoute = read('../src/app/api/sites/[siteId]/openapi/route.ts');
const mediaDeliveryCache = read('../src/lib/mediaDeliveryCache.ts');
const uploadPolicy = read('../src/lib/mediaUploadPolicy.ts');
const publicMediaResource = read('../src/lib/publicMediaResource.ts');
const repositoryRuntime = read('../src/lib/repositoryRuntime.ts');
const repositoryMediaReferenceSync = read('../src/lib/repositoryMediaReferenceSync.ts');
const adminCollectionRecordsRoute = read('../src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/route.ts');
const adminCollectionRecordDetailRoute = read('../src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/[recordId]/route.ts');
const adminCollectionRecordBulkRoute = read('../src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/bulk/route.ts');
const adminCollectionRecordImportRoute = read('../src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/import/route.ts');
const adminCollectionsImportRoute = read('../src/app/api/admin/sites/[siteId]/collections/import/route.ts');
const publicCollectionRecordsRoute = read('../src/app/api/sites/[siteId]/collections/[collectionId]/records/route.ts');
const publicCollectionRecordDetailRoute = read('../src/app/api/sites/[siteId]/collections/[collectionId]/records/[recordId]/route.ts');
const adminMediaApi = read('../../../apps/admin/src/lib/mediaApi.ts');
const adminMediaModal = read('../../../apps/admin/src/components/editor/MediaLibraryModal.tsx');
const adminMediaPage = read('../../../apps/admin/src/routes/media.tsx');
const coreTypes = read('../../../packages/core/src/types/index.ts');
const dbSchema = read('../../../packages/db/src/schema/index.ts');
const dbMediaRepository = read('../../../packages/db/src/repositories/media.ts');
const backyStore = read('../src/lib/backyStore.ts');
const sdkSource = read('../../../packages/sdk-js/src/index.ts');
const generatedSdkSource = read('../../../packages/sdk-js/src/generated-contract-types.ts');
const generatedSdkSmoke = read('../../../packages/sdk-js/scripts/generated-contract-types.ts');
const apiContracts = read('../../../specs/backy-api-contracts.md');
const hasOrderedMediaEnum = (source) => {
  const windows = source.split('enum:').slice(1);
  return windows.filter((window) => {
    const snippet = window.slice(0, 320);
    return ['image', 'video', 'audio', 'document', 'font', 'other'].every((value) => (
      snippet.includes(`"${value}"`) || snippet.includes(`'${value}'`)
    ));
  }).length;
};

assert(
  mediaRoute.includes(')?.type ?? "other"') ||
    mediaRoute.includes(")?.type ?? 'other'") ||
    mediaRoute.includes("?.type ?? 'other'") ||
    mediaRoute.includes('?.type ?? "other"'),
  'Media upload route must classify unknown MIME/extension uploads as type other.',
);
assert(
  mediaRoute.includes('return "files";') ||
    mediaRoute.includes("return 'files';"),
  'Media upload route must store generic other files under the files storage folder.',
);
assert(
  mediaRoute.includes('"other"') &&
    mediaRoute.includes('mediaTypeValues.includes') &&
    mediaRoute.includes('normalized === "file"'),
  'Media list filters must accept type=other for generic files.',
);
assert(
  mediaRoute.includes('uploadVisibilityFromInput') &&
    mediaRoute.includes('uploadMediaScopeFromInput') &&
    mediaRoute.includes('mediaUploadTextFieldError') &&
    mediaRoute.includes('"INVALID_MEDIA_SCOPE"') &&
    mediaRoute.includes('"INVALID_MEDIA_VISIBILITY"') &&
    mediaRoute.includes('"INVALID_MEDIA_SCOPE_TARGET"') &&
    mediaRoute.includes('"INVALID_MEDIA_FOLDER"'),
  'Media upload route must reject invalid explicit scope, visibility, scopeTargetId, and folderId multipart fields instead of silently defaulting policy metadata.',
);
assert(
  mediaRoute.includes('"INVALID_MEDIA_METADATA"') &&
    mediaRoute.includes('parsedMetadata.invalid') &&
    mediaRoute.includes('Use a JSON object.'),
  'Media upload route must reject invalid metadata JSON instead of silently dropping upload metadata.',
);
assert(
  mediaRoute.includes('"INVALID_MEDIA_TYPE"') &&
    mediaRoute.includes('"INVALID_MEDIA_VISIBILITY"') &&
    mediaRoute.includes('"INVALID_MEDIA_SCOPE"') &&
    mediaRoute.includes('"INVALID_MEDIA_GLOBAL_FILTER"') &&
    mediaRoute.includes('"INVALID_MEDIA_LIMIT"') &&
    mediaRoute.includes('"INVALID_MEDIA_OFFSET"') &&
    mediaRoute.includes('integerQueryFromInput') &&
    mediaRoute.includes('booleanFilterFromInput'),
  'Admin media list route must reject invalid filter and pagination values instead of silently widening or clamping the media library query.',
);
assert(
  mediaFoldersRoute.includes('"INVALID_MEDIA_FOLDER_SORT_ORDER"') &&
    mediaFoldersRoute.includes('mediaFolderSortOrderFromInput') &&
    mediaFolderDetailRoute.includes('"INVALID_MEDIA_FOLDER_SORT_ORDER"') &&
    mediaFolderDetailRoute.includes('mediaFolderSortOrderFromInput'),
  'Admin media folder create/update routes must reject invalid sortOrder values instead of silently ignoring or storing unstable ordering metadata.',
);
assert(
  mediaFoldersRoute.includes('"INVALID_MEDIA_FOLDER_PARENT"') &&
    mediaFoldersRoute.includes('mediaFolderParentIdFromInput') &&
    mediaFolderDetailRoute.includes('"INVALID_MEDIA_FOLDER_PARENT"') &&
    mediaFolderDetailRoute.includes('mediaFolderParentIdFromInput') &&
    mediaFolderDetailRoute.includes('Folder name must be a non-empty string.'),
  'Admin media folder create/update routes must reject invalid parentId and explicit empty rename payloads.',
);
assert(
  mediaDetailRoute.includes('"INVALID_MEDIA_VISIBILITY"') &&
    mediaDetailRoute.includes('"INVALID_MEDIA_SCOPE"') &&
    mediaDetailRoute.includes('"INVALID_MEDIA_SCOPE_TARGET"') &&
    mediaDetailRoute.includes('"INVALID_MEDIA_FOLDER"') &&
    mediaDetailRoute.includes('"INVALID_MEDIA_METADATA"') &&
    mediaDetailRoute.includes('"INVALID_MEDIA_TAGS"') &&
    mediaDetailRoute.includes('mediaUpdateValidationError') &&
    mediaDetailRoute.includes('isMediaScopeInput'),
  'Admin media detail update route must reject invalid explicit visibility, scope, scopeTargetId, folderId, metadata, and tags payloads instead of silently keeping previous metadata.',
);
assert(
  adminSignedMediaUrlRoute.includes("'INVALID_MEDIA_DISPOSITION'") &&
    adminSignedMediaUrlRoute.includes('parseSignedUrlDisposition') &&
    adminSignedMediaUrlRoute.includes('disposition: disposition.value'),
  'Admin signed media URL route must reject invalid disposition values before minting delivery signatures.',
);
assert(
  adminSignedMediaUrlRoute.includes("'INVALID_MEDIA_EXPIRY'") &&
    adminSignedMediaUrlRoute.includes('parseSignedUrlExpiresIn') &&
    adminSignedMediaUrlRoute.includes('expiresInSeconds: expiresIn.value') &&
    adminSignedMediaUrlRoute.includes('MIN_SIGNED_URL_EXPIRES_IN_SECONDS = 30') &&
    adminSignedMediaUrlRoute.includes('MAX_SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60'),
  'Admin signed media URL route must reject invalid expiry values before minting delivery signatures.',
);
assert(
  publicMediaRoute.includes("'INVALID_MEDIA_TYPE'") &&
    publicMediaRoute.includes('mediaType.invalid') &&
    publicMediaRoute.includes('document, file, font, other') &&
    publicMediaRoute.includes("return { types: ['document', 'other'] };") &&
    publicMediaRoute.includes('mediaMatchesRequestedType'),
  'Public media list route must reject invalid media type filters instead of silently returning all assets.',
);
assert(
  publicMediaRoute.includes("'INVALID_MEDIA_SCOPE'") &&
    publicMediaRoute.includes('mediaScope.invalid') &&
    publicMediaRoute.includes('global, page, post'),
  'Public media list route must reject invalid media scope filters instead of silently returning all assets.',
);
assert(
  publicMediaResource.includes("scope: 'page' | 'post' | 'collectionRecord'") &&
    publicMediaResource.includes('collectionRecordIds') &&
    publicMediaResource.includes('collectionRecords: referenceTargets(collectionRecordIds, collectionRecordBindings)') &&
    openApiRoute.includes('collectionRecordCount') &&
    openApiRoute.includes('"collectionRecordIds"') &&
    openApiRoute.includes('"collectionRecords"') &&
    openApiRoute.includes('"collectionRecord"'),
  'Public media references must expose product/collection-record usage for custom storefront and CMS asset browsers.',
);
assert(
  repositoryMediaReferenceSync.includes('collectRepositoryMediaReferenceIds') &&
    repositoryMediaReferenceSync.includes('syncRepositoryCollectionRecordMediaReferences') &&
    repositoryMediaReferenceSync.includes('removeRepositoryCollectionRecordMediaReferences') &&
    repositoryMediaReferenceSync.includes("scope: 'collectionRecord'") &&
    repositoryMediaReferenceSync.includes("usageType: 'collection-record'") &&
    repositoryMediaReferenceSync.includes('mediaRepository.update') &&
    repositoryMediaReferenceSync.includes("parentKey && MEDIA_REFERENCE_ASSET_COLLECTION_KEYS.has(parentKey)"),
  'Repository collection-record media sync must track product/custom CMS design assets in Supabase/Postgres metadata bindings.',
);
assert(
  repositoryRuntime.includes('withRepositoryMediaReferenceSync') &&
    repositoryRuntime.includes('pages.create(input, context)') &&
    repositoryRuntime.includes('pages.update(siteId, pageId, input, context)') &&
    repositoryRuntime.includes('pages.delete(siteId, pageId, context)') &&
    repositoryRuntime.includes('posts.create(input, context)') &&
    repositoryRuntime.includes('posts.update(siteId, postId, input, context)') &&
    repositoryRuntime.includes('posts.delete(siteId, postId, context)') &&
    repositoryRuntime.includes('collections.createRecord(input, context)') &&
    repositoryRuntime.includes('collections.updateRecord(siteId, collectionId, recordId, input, context)') &&
    repositoryRuntime.includes('collections.deleteRecord(siteId, collectionId, recordId, context)') &&
    repositoryRuntime.includes('syncRepositoryPageMediaReferences') &&
    repositoryRuntime.includes('removeRepositoryPageMediaReferences') &&
    repositoryRuntime.includes('syncRepositoryPostMediaReferences') &&
    repositoryRuntime.includes('removeRepositoryPostMediaReferences') &&
    repositoryRuntime.includes('syncRepositoryCollectionRecordMediaReferences') &&
    repositoryRuntime.includes('removeRepositoryCollectionRecordMediaReferences') &&
    repositoryRuntime.includes('withRepositoryMediaReferenceSync(createDatabaseRepositories({ adapter }))'),
  'Database repository runtime must decorate page, post, and collection-record mutations with central media reference sync.',
);
assert(
  adminCollectionRecordsRoute.includes('syncRepositoryCollectionRecordMediaReferences') &&
    adminCollectionRecordDetailRoute.includes('syncRepositoryCollectionRecordMediaReferences') &&
    adminCollectionRecordDetailRoute.includes('removeRepositoryCollectionRecordMediaReferences') &&
    publicCollectionRecordsRoute.includes('syncRepositoryCollectionRecordMediaReferences') &&
    publicCollectionRecordDetailRoute.includes('syncRepositoryCollectionRecordMediaReferences') &&
    publicCollectionRecordDetailRoute.includes('removeRepositoryCollectionRecordMediaReferences') &&
    adminCollectionRecordBulkRoute.includes('removeRepositoryCollectionRecordMediaReferences') &&
    adminCollectionRecordBulkRoute.includes('syncRepositoryCollectionRecordMediaReferences') &&
    adminCollectionRecordImportRoute.includes('syncRepositoryCollectionRecordMediaReferences') &&
    adminCollectionsImportRoute.includes('syncRepositoryCollectionRecordMediaReferences'),
  'Admin and public repository collection-record mutation routes must sync media references after create/update/delete/bulk/import.',
);
assert(
  publicMediaRoute.includes("searchParams.has('folderId')") &&
    publicMediaRoute.includes("searchParams.has('folder')") &&
    publicMediaRoute.includes("searchParams.get('folder')"),
  'Public media list route must honor the documented folder alias for custom frontend media pickers.',
);
assert(
  publicMediaRoute.includes("'INVALID_MEDIA_GLOBAL_FILTER'") &&
    publicMediaRoute.includes('globalFilter.invalid') &&
    publicMediaRoute.includes('Use true or false'),
  'Public media list route must reject invalid global filters instead of silently returning all assets.',
);
assert(
  publicMediaRoute.includes('const visibleMedia = mediaPayload.media') &&
    publicMediaRoute.includes('filter((item) => mediaMatchesRequestedType(item, mediaType))') &&
    publicMediaRoute.includes('filter((item) => !isMediaQuarantined(item))') &&
    publicMediaRoute.includes('paginateMedia(site.id, visibleMedia, limit, offset, folders)'),
  'Public demo media list route must exclude quarantined assets before pagination totals and slices are computed.',
);
assert(
  publicMediaRoute.includes("'INVALID_MEDIA_LIMIT'") &&
    publicMediaRoute.includes("'INVALID_MEDIA_OFFSET'") &&
    publicMediaRoute.includes('integerQueryFromInput') &&
    publicMediaRoute.includes('MAX_MEDIA_LIMIT = 100'),
  'Public media list route must reject invalid pagination filters instead of silently clamping or defaulting them.',
);
assert(
  publicMediaFoldersRoute.includes("MEDIA_FOLDERS_SCHEMA_VERSION = 'backy.media-folders.v1'") &&
    publicMediaFoldersRoute.includes('publicContractJson') &&
    publicMediaFoldersRoute.includes('repositories.media.listFolders(site.id)') &&
    publicMediaFoldersRoute.includes('listMediaFolders(site.id)') &&
    publicMediaFoldersRoute.includes('!isMediaQuarantined(item)') &&
    publicMediaFoldersRoute.includes('includeFolderAndAncestors') &&
    publicMediaFoldersRoute.includes('directAssetCount') &&
    publicMediaFoldersRoute.includes('assetCount'),
  'Public media folder route must expose a cacheable read-only folder tree limited to folders with public, non-quarantined assets and their ancestors.',
);
assert(
  publicMediaResource.includes("schemaVersion: 'backy.media.organization.v1'") &&
    publicMediaResource.includes('export const buildPublicMediaOrganization') &&
    publicMediaResource.includes('folderSegments') &&
    publicMediaResource.includes('folderAncestors: Array<') &&
    publicMediaResource.includes('const folderAncestors = chain.map((folder) => ({') &&
    publicMediaResource.includes('folderPath: folderSegments.join') &&
    publicMediaResource.includes('missingFolder') &&
    publicMediaResource.includes('organization: buildPublicMediaOrganization(media, folders)'),
  'Public media assets must carry a versioned organization breadcrumb for custom frontend media pickers.',
);
assert(
  publicMediaRoute.includes('listMediaFolders') &&
    publicMediaRoute.includes('repositories.media.listFolders(site.id)') &&
    publicMediaRoute.includes('toPublicMediaAsset(siteId, item, folders)') &&
    publicMediaRoute.includes('paginateMedia(site.id, filtered, limit, offset, folders)'),
  'Public media list route must attach folder organization breadcrumbs to listed assets.',
);
assert(
  publicMediaDetailRoute.includes('listMediaFolders') &&
    publicMediaDetailRoute.includes('repositories.media.listFolders(site.id)') &&
    publicMediaDetailRoute.includes('toPublicMediaAsset(site.id, media, folders)'),
  'Public media detail route must attach folder organization breadcrumbs to individual assets.',
);
assert(
  mediaRoute.includes('buildPublicMediaOrganization') &&
    mediaRoute.includes('withAdminMediaOrganization') &&
    mediaRoute.includes('paginateMedia(filtered, limit, offset, folders)') &&
    mediaRoute.includes('media: withAdminMediaOrganization(') &&
    mediaDetailRoute.includes('buildPublicMediaOrganization') &&
    mediaDetailRoute.includes('withAdminMediaOrganization') &&
    mediaDetailRoute.includes('await repositories.media.listFolders(site.id)'),
  'Admin media list/upload/detail responses must mirror versioned organization breadcrumbs for the rich editor and custom frontend handoff.',
);
assert(
  publicFontManifestRoute.includes("from '@/lib/mediaSafety'") &&
    publicFontManifestRoute.includes('!isMediaQuarantined(item)') &&
    publicFontManifestRoute.includes('buildPublicFontManifest('),
  'Public font manifest route must exclude quarantined font assets before generating @font-face CSS.',
);
assert(
  publicMediaFileRoute.includes("jsonError(423, 'MEDIA_QUARANTINED'") &&
    publicMediaFileRoute.includes('This media asset is quarantined and cannot be delivered.'),
  'Public media file route must expose a distinct quarantined delivery error.',
);
assert(
  publicMediaFileRoute.includes("'INVALID_MEDIA_DISPOSITION'") &&
    publicMediaFileRoute.includes('parseContentDisposition') &&
    publicMediaFileRoute.includes('Use inline or attachment'),
  'Public media file route must reject invalid disposition values instead of silently serving inline.',
);
assert(
  mediaDeliveryCache.includes('buildMediaDeliveryCacheSeed') &&
    mediaDeliveryCache.includes('createMediaDeliveryEtag') &&
    mediaDeliveryCache.includes('createMediaDeliveryCacheRevision') &&
    mediaDeliveryCache.includes('requestMatchesMediaDeliveryEtag') &&
    mediaDeliveryCache.includes("entry === etag || entry === '*'"),
  'Public media delivery cache helper must keep stable ETag, cache revision, and If-None-Match matching support.',
);
assert(
  publicMediaFileRoute.includes("from '@/lib/mediaDeliveryCache'") &&
    publicMediaFileRoute.includes('mediaDeliveryCacheMetadata(request, site.id, media') &&
    publicMediaFileRoute.includes("status: 304") &&
    publicMediaFileRoute.includes("'x-backy-cache-revision': cacheMetadata.cacheRevision") &&
    publicMediaFileRoute.includes('etag: cacheMetadata.etag') &&
    publicMediaFileRoute.indexOf('if (isPrivateMedia && !verifySignedMediaAccess') < publicMediaFileRoute.indexOf('if (cacheMetadata.notModified)'),
  'Public media file delivery must authorize and validate safety before returning ETag-backed 304 responses with cache revision headers.',
);
assert(
  publicMediaTransformRoute.includes("'INVALID_TRANSFORM_WIDTH'") &&
    publicMediaTransformRoute.includes("'INVALID_TRANSFORM_QUALITY'") &&
    publicMediaTransformRoute.includes('Number.isInteger(parsed)') &&
    !publicMediaTransformRoute.includes('Math.max(min, Math.min(max'),
  'Public media transform route must reject invalid width/quality instead of clamping or defaulting invalid query values.',
);
assert(
  publicMediaTransformRoute.includes("errorResponse(423, 'MEDIA_QUARANTINED'") &&
    publicMediaTransformRoute.includes('cannot be transformed'),
  'Public media transform route must expose a distinct quarantined transform error.',
);
assert(
  publicMediaTransformRoute.includes("from '@/lib/mediaDeliveryCache'") &&
    publicMediaTransformRoute.includes("export const runtime = 'nodejs'") &&
    publicMediaTransformRoute.includes('mediaDeliveryCacheMetadata(request, site.id, media') &&
    publicMediaTransformRoute.includes("delivery: 'optimizer-transform'") &&
    publicMediaTransformRoute.includes("status: 304") &&
    publicMediaTransformRoute.includes("'x-backy-cache-revision': cacheMetadata.cacheRevision") &&
    publicMediaTransformRoute.includes('etag: cacheMetadata.etag') &&
    publicMediaTransformRoute.indexOf("if (isMediaQuarantined(media))") < publicMediaTransformRoute.indexOf('if (cacheMetadata.notModified)'),
  'Public media transform redirects must validate publish/type/quarantine checks before returning ETag-backed 304 responses with cache revision headers.',
);
assert(
  mediaRoute.includes('const mimeType = file.type || "application/octet-stream"') ||
    mediaRoute.includes("const mimeType = file.type || 'application/octet-stream'"),
  'Media upload route must preserve a safe default MIME type for generic file uploads.',
);
assert(
  mediaRoute.includes('scanMediaUploadWithProviders'),
  'Media upload route must keep safety scanning on generic file uploads.',
);
assert(
  uploadPolicy.includes('policy.allowedFileTypes.length === 0') &&
    uploadPolicy.includes('return true;'),
  'Media upload policy must allow generic file uploads when no allowlist is configured.',
);
assert(
  uploadPolicy.includes("rule.startsWith('.')") &&
    uploadPolicy.includes("rule.endsWith('/*')"),
  'Media upload policy must support extension and MIME-family allowlist rules for generic files.',
);
assert(
  uploadPolicy.includes('const fileMatchesMediaCategory =') &&
    uploadPolicy.includes("category === 'file'") &&
    uploadPolicy.includes("fileCategory === 'document' || fileCategory === 'other'") &&
    uploadPolicy.includes("'application/pdf': 'document'") &&
    uploadPolicy.includes("'.docx': 'document'") &&
    uploadPolicy.includes("'.txt': 'document'") &&
    uploadPolicy.includes("['image', 'video', 'audio', 'document', 'file', 'font', 'other'].includes(rule)") &&
    uploadPolicy.includes("rule === '*/*'"),
  'Media upload policy must support Backy media category allowlists like document/*, file/*, other/*, and explicit all uploads.',
);
assert(
  uploadPolicy.includes("'application/font-woff2': 'font'") &&
    uploadPolicy.includes("'.woff2': 'font'") &&
    uploadPolicy.includes('fileMatchesMimeFamily'),
  'Media upload policy must allow known font extensions and application font MIME types through font/* allowlist rules.',
);
assert(
  /export type MediaType\s*=\s*[\s\S]*["']image["'][\s\S]*["']video["'][\s\S]*["']audio["'][\s\S]*["']document["'][\s\S]*["']font["'][\s\S]*["']other["']/.test(coreTypes),
  'Core media type contract must include other.',
);
assert(
  dbSchema.includes("export type MediaType = 'image' | 'video' | 'audio' | 'document' | 'font' | 'other'"),
  'Database media type contract must include other.',
);
assert(
  (backyStore.includes('type: input.type') &&
    (backyStore.includes('input.type === "other"') ||
      backyStore.includes("input.type === 'other'"))),
  'Demo media store must persist type other.',
);
assert(
  backyStore.includes('a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)') &&
    dbMediaRepository.includes('orderBy(mediaFolders.sortOrder, mediaFolders.name)'),
  'Demo and DB media folder list ordering must both be deterministic by sortOrder then name.',
);
assert(
  hasOrderedMediaEnum(openApiRoute) >= 2,
  'Public OpenAPI media list filters and MediaAsset.type schema must advertise type other for custom frontends.',
);
assert(
  openApiRoute.includes('"400"') &&
    openApiRoute.includes('Invalid media type, scope, global, limit, or offset filter') &&
    openApiRoute.includes('#/components/schemas/ErrorEnvelope'),
  'Public OpenAPI media list route must document invalid media filter error envelopes.',
);
assert(
  openApiRoute.includes('name: "search"') &&
    openApiRoute.includes('name: "folder"') &&
    openApiRoute.includes('name: "folderId"') &&
    openApiRoute.includes('name: "scope"') &&
    openApiRoute.includes('"file"'),
  'Public OpenAPI media list route must document search/folder/scope filters and the type=file alias for custom frontend media pickers.',
);
assert(
  openApiRoute.includes('operationId: "listBackyMediaFolders"') &&
    openApiRoute.includes('MediaFolderListEnvelope') &&
    openApiRoute.includes('MediaFolderRoot') &&
    openApiRoute.includes('backy.media-folders.v1'),
  'Public OpenAPI must document public media folder discovery for custom frontend media pickers.',
);
assert(
  openApiRoute.includes('backy.media.organization.v1') &&
    openApiRoute.includes('folderSegments') &&
    openApiRoute.includes('"folderAncestors"') &&
    openApiRoute.includes('folderDepth') &&
    openApiRoute.includes('missingFolder') &&
    generatedSdkSource.includes('organization?: {') &&
    generatedSdkSource.includes('schemaVersion: "backy.media.organization.v1"') &&
    generatedSdkSource.includes('folderAncestors: Array<{') &&
    generatedSdkSmoke.includes('mediaOrganization'),
  'Public OpenAPI and generated SDK types must expose per-asset media organization breadcrumbs.',
);
assert(
  openApiRoute.includes('Fetch public, non-quarantined uploaded font families'),
  'Public OpenAPI font manifest route must advertise that quarantined fonts are excluded.',
);
assert(
  openApiRoute.includes('Invalid transform width/quality or unsupported media type'),
  'Public OpenAPI media transform route must document invalid width/quality errors.',
);
assert(
  openApiRoute.includes('Media asset is quarantined and cannot be transformed'),
  'Public OpenAPI media transform route must document quarantined transform errors.',
);
assert(
  openApiRoute.includes('"w"') &&
    openApiRoute.includes('Alias for width') &&
    openApiRoute.includes('"q"') &&
    openApiRoute.includes('Alias for quality'),
  'Public OpenAPI media transform route must advertise w/q aliases supported by the runtime and docs.',
);
assert(
  openApiRoute.includes('"423"') &&
    openApiRoute.includes('Media asset is quarantined and cannot be delivered'),
  'Public OpenAPI media file route must document quarantined delivery errors.',
);
assert(
  openApiRoute.includes('"400"') &&
    openApiRoute.includes('Invalid media file disposition'),
  'Public OpenAPI media file route must document invalid disposition errors.',
);
assert(
  openApiRoute.includes('Stable media file delivery validator for If-None-Match revalidation') &&
    openApiRoute.includes('Media file cache entry unchanged for the supplied ETag') &&
    openApiRoute.includes('Stable media transform redirect validator for If-None-Match revalidation') &&
    openApiRoute.includes('Media transform redirect unchanged for the supplied ETag') &&
    openApiRoute.includes('"X-Backy-Cache-Revision"'),
  'Public OpenAPI media file and transform routes must document ETag, 304, and cache revision headers for custom frontend revalidation.',
);
assert(
  sdkSource.includes('type?: "image" | "video" | "audio" | "document" | "file" | "font" | "other"') ||
    sdkSource.includes("type?: 'image' | 'video' | 'audio' | 'document' | 'file' | 'font' | 'other'"),
  'SDK media list options must allow type=other.',
);
assert(
  sdkSource.includes('type?: "image" | "video" | "audio" | "document" | "file" | "font" | "other"') &&
    sdkSource.includes('search?: string') &&
    sdkSource.includes('blogId?: string') &&
    sdkSource.includes('global?: boolean') &&
    sdkSource.includes('siteId?: string'),
  'SDK media list options must expose public route aliases for custom frontend media pickers.',
);
assert(
  adminMediaApi.includes("type MediaListType = 'image' | 'video' | 'audio' | 'document' | 'file' | 'font' | 'other'") &&
    adminMediaApi.includes('const toApiMediaListType = (type: MediaListType): MediaListType => type'),
  'Admin media API helper must preserve type=file so Backy endpoints return documents and arbitrary other files.',
);
assert(
  adminMediaPage.includes("const MEDIA_FILE_FILTER_TYPES = new Set<MediaAsset['type']>(['file', 'other'])") &&
    adminMediaPage.includes("if (filter === 'file') return MEDIA_FILE_FILTER_TYPES.has(mediaType)") &&
    adminMediaPage.includes('if (!mediaTypeMatchesFilter(file.type, typeFilter))') &&
    adminMediaPage.includes("type: typeFilter === 'all' ? undefined : typeFilter"),
  'Central Media page must load and display type=file as the same document/other file bucket advertised by the API.',
);
assert(
  adminMediaModal.includes("const FILE_BUCKET_MEDIA_TYPES = new Set<MediaAsset['type']>(['file', 'other'])") &&
    adminMediaModal.includes("if (allowedTypes === 'file') return new Set(['file', 'other'])") &&
    adminMediaModal.includes("allowedTypes === 'any' || allowedTypes === 'file'") &&
    adminMediaModal.includes("if (filter === 'file') return FILE_BUCKET_MEDIA_TYPES.has(type)") &&
    adminMediaModal.includes("!mediaTypeMatchesFilter(item.type, libraryTypeFilter)") &&
    adminMediaModal.includes('mediaTypeMatchesFilter(resolvedType, filterHint)'),
  'Editor media modal must align allowedTypes=file, library file filters, and upload file filters with the document/other backend file bucket.',
);
	assert(
	  adminMediaApi.includes("organization?: MediaAsset['organization']") &&
	    adminMediaApi.includes('organization: item.organization') &&
	    adminMediaPage.includes('const buildAdminMediaOrganization') &&
	    adminMediaPage.includes("schemaVersion: 'backy.media.organization.v1'") &&
	    adminMediaPage.includes('folderAncestors,') &&
	    adminMediaPage.includes('organization: buildAdminMediaOrganization(asset, folderOptions)') &&
	    adminMediaPage.includes('organization: selectedAssetOrganization') &&
	    adminMediaPage.includes("schemaVersion: 'backy.media-editor-binding.v1'") &&
	    adminMediaPage.includes('editorBinding: buildMediaEditorBinding') &&
	    adminMediaPage.includes('propsPatch') &&
	    adminMediaPage.includes('responsiveEditableTargets') &&
	    adminMediaPage.includes('bindingRequestTemplate') &&
	    adminMediaPage.includes("'props.mediaOrganization'") &&
	    adminMediaPage.includes("'props.downloadMediaIds'") &&
	    adminMediaPage.includes("'props.fontMediaId'"),
	  'Admin media client and placement handoff must preserve media organization breadcrumbs for reusable frontend design placement.',
	);
assert(
  sdkSource.includes('BackyMediaFolder') &&
    sdkSource.includes('BackyMediaFolderList') &&
    sdkSource.includes('mediaFolders(') &&
    sdkSource.includes('mediaFoldersCached('),
  'SDK must expose public media folder discovery helpers for custom frontend media pickers.',
);
assert(
  generatedSdkSource.includes('type?: "image" | "video" | "audio" | "document" | "font" | "other"'),
  'Generated SDK OpenAPI media asset type must include other.',
);
assert(
  (generatedSdkSmoke.includes("type: 'other'") ||
    generatedSdkSmoke.includes('type: "other"')) &&
    generatedSdkSmoke.includes('invalidOpenApiMediaAssetType') &&
    generatedSdkSmoke.includes('invalidSdkMediaListOptionType'),
  'Generated SDK smoke must include positive and negative generic file media contract cases.',
);
assert(
  apiContracts.includes('image/video/audio/document/font/other') &&
    apiContracts.includes('unknown safe files as `other`'),
  'API contract docs must describe generic other file uploads.',
);
assert(
  apiContracts.includes('Invalid public media type filters return `400 INVALID_MEDIA_TYPE`'),
  'API contract docs must describe invalid public media type filter errors.',
);
assert(
  apiContracts.includes('`type=file` remains a compatibility alias for downloadable file assets and returns both `document` and `other` media') &&
    apiContracts.includes('`type=file` returns both `document` and `other` media assets'),
  'API contract docs must describe broad document/other type=file media filter behavior.',
);
assert(
  apiContracts.includes('Invalid public media scope filters return `400 INVALID_MEDIA_SCOPE`'),
  'API contract docs must describe invalid public media scope filter errors.',
);
assert(
  apiContracts.includes('Invalid public media global filters return `400 INVALID_MEDIA_GLOBAL_FILTER`'),
  'API contract docs must describe invalid public media global filter errors.',
);
assert(
  apiContracts.includes('Invalid public media pagination filters return `400 INVALID_MEDIA_LIMIT` or `400 INVALID_MEDIA_OFFSET`'),
  'API contract docs must describe invalid public media pagination filter errors.',
);
assert(
  apiContracts.includes('Public font manifests exclude quarantined font assets'),
  'API contract docs must describe public font manifest quarantine filtering.',
);
assert(
  apiContracts.includes('Quarantined media file requests return `423 MEDIA_QUARANTINED`'),
  'API contract docs must describe quarantined public media file delivery errors.',
);
assert(
  apiContracts.includes('Invalid media file disposition values return `400 INVALID_MEDIA_DISPOSITION`'),
  'API contract docs must describe invalid public media file disposition errors.',
);
assert(
  apiContracts.includes('Public media file responses emit `ETag` and `x-backy-cache-revision`') &&
    apiContracts.includes('matching `If-None-Match` returns `304` without streaming bytes') &&
    apiContracts.includes('Transform redirects emit `ETag` and `x-backy-cache-revision`') &&
    apiContracts.includes('matching `If-None-Match` returns `304` without redirecting or counting another transform delivery'),
  'API contract docs must describe public media file and transform cache revalidation semantics.',
);
assert(
  apiContracts.includes('Signed media URL requests also reject invalid `disposition` values before minting tokens'),
  'API contract docs must describe signed media URL disposition validation.',
);
assert(
  apiContracts.includes('Signed media URL requests reject invalid `expiresInSeconds` values with `400 INVALID_MEDIA_EXPIRY`'),
  'API contract docs must describe signed media URL expiry validation.',
);
assert(
  apiContracts.includes('Invalid transform width values return `400 INVALID_TRANSFORM_WIDTH`') &&
    apiContracts.includes('invalid quality values return `400 INVALID_TRANSFORM_QUALITY`'),
  'API contract docs must describe invalid public media transform query errors.',
);
assert(
  apiContracts.includes('Quarantined media transform requests return `423 MEDIA_QUARANTINED`'),
  'API contract docs must describe quarantined public media transform errors.',
);

console.log(JSON.stringify({
  ok: true,
  contract: 'backy.media-upload.generic-files.v1',
}, null, 2));
