import { withMediaStorageMutation } from '@/lib/mediaStorageMutation';
import { mediaStorageRetirementFiles, mediaStorageVersionRetirementFiles, mediaStorageRecoveryErrorResponse, withJournaledMediaStorageMutation } from '@/lib/mediaStorageRecovery';
import { readCompleteMediaInventory } from '@/lib/mediaInventory';
/**
 * Admin media retained-version endpoint.
 *
 * POST   /api/admin/sites/[siteId]/media/[mediaId]/versions/[versionId] (restore)
 * DELETE /api/admin/sites/[siteId]/media/[mediaId]/versions/[versionId]
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/adminAccess";
import { recordAdminAudit } from "@/lib/adminAudit";
import {
  getMediaById,
  getSiteByIdOrSlug,
  updateMediaItem,
} from "@/lib/backyStore";
import { recordSiteCacheInvalidation } from "@/lib/cacheInvalidation";
import { getMediaStorageAdapter } from "@/lib/mediaStorage";
import { deleteGeneratedTransformFiles } from "@/lib/mediaTransformGeneration";
import {
  getRequiredDatabaseRepositories,
  shouldUseDemoStoreFallback,
} from "@/lib/repositoryRuntime";
import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";
import type {
  BackyJsonObject,
  BackyRepositories,
  MediaItem,
  MediaVersion,
  Site,
} from "@backy-cms/core";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{
    siteId: string;
    mediaId: string;
    versionId: string;
  }>;
}

type RetainedVersion = Record<string, unknown>;
type RestorableVersion = {
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  type: MediaItem["type"];
  url: string;
  thumbnailUrl: string | null;
  storagePath: string | null;
  storageProvider: string | null;
  binaryFingerprint?: unknown;
};

const makeRequestId = () =>
  `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const MAX_REPLACEMENT_VERSIONS = 20;

const errorResponse = (
  status: number,
  code: string,
  message: string,
  requestId: string,
) =>
  NextResponse.json(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
      },
    },
    { status },
  );

const replacementVersionsFromMetadata = (
  metadata: MediaItem["metadata"] | undefined,
): RetainedVersion[] =>
  metadata && Array.isArray(metadata.replacementVersions)
    ? metadata.replacementVersions.filter(
        (version): version is RetainedVersion =>
          !!version && typeof version === "object" && !Array.isArray(version),
      )
    : [];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const parseJsonBody = async (
  request: NextRequest,
): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
};

const textFromBody = (
  body: Record<string, unknown>,
  key: string,
): string | null => {
  const value = body[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
};

const retainedMetadataVersionId = (version: MediaVersion | RetainedVersion): string | null =>
  isRecord(version.metadata) &&
  typeof version.metadata.retainedMetadataVersionId === "string"
    ? version.metadata.retainedMetadataVersionId
    : null;

const removeVersionFromMetadata = (
  metadata: MediaItem["metadata"] | undefined,
  versionIds: string[],
) => {
  const ids = new Set(versionIds.filter(Boolean));
  const versions = replacementVersionsFromMetadata(metadata);
  const nextVersions = versions.filter(
    (item) => typeof item.id !== "string" || !ids.has(item.id),
  );

  return {
    replacementVersions: nextVersions,
    replacementCount: nextVersions.length,
  };
};

const prependVersionInMetadata = (
  metadata: MediaItem["metadata"] | undefined,
  retainedVersion: RetainedVersion,
  removedVersionIds: string[],
): MediaItem["metadata"] => {
  const ids = new Set(removedVersionIds.filter(Boolean));
  const versions = replacementVersionsFromMetadata(metadata).filter(
    (item) => typeof item.id !== "string" || !ids.has(item.id),
  );
  const nextVersions = [retainedVersion, ...versions].slice(
    0,
    MAX_REPLACEMENT_VERSIONS,
  );

  return {
    replacementVersions: nextVersions,
    replacementCount: nextVersions.length,
  };
};

const versionStoragePath = (
  siteId: string,
  version: RetainedVersion | MediaVersion,
): string | null => {
  const storagePath = version.storagePath;
  const normalized = typeof storagePath === "string" ? storagePath.trim() : "";
  return normalized.length > 0 && normalized.startsWith(`sites/${siteId}/`)
    ? normalized
    : null;
};

const storagePathFromMedia = (
  siteId: string,
  media: MediaItem,
): string | null => {
  const storagePath =
    isRecord(media.metadata) && typeof media.metadata.storagePath === "string"
      ? media.metadata.storagePath.trim()
      : "";
  return storagePath.length > 0 && storagePath.startsWith(`sites/${siteId}/`)
    ? storagePath
    : null;
};

const storageProviderFromMetadata = (
  metadata: MediaItem["metadata"] | undefined,
): string | null =>
  isRecord(metadata) &&
  typeof metadata.storageProvider === "string" &&
  metadata.storageProvider.trim().length > 0
    ? metadata.storageProvider.trim()
    : null;

const mediaTypeFromVersion = (
  version: RetainedVersion | MediaVersion,
  fallback: MediaItem["type"],
): MediaItem["type"] => {
  const value = version.type;
  return value === "image" ||
    value === "video" ||
    value === "audio" ||
    value === "document" ||
    value === "font" ||
    value === "other"
    ? value
    : fallback;
};

const stringFromVersion = (
  version: RetainedVersion | MediaVersion,
  key: keyof RestorableVersion,
): string | null => {
  const value = version[key as keyof typeof version];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
};

const versionBinaryFingerprint = (
  version: RetainedVersion | MediaVersion,
): unknown => {
  if (isRecord(version) && version.binaryFingerprint) {
    return version.binaryFingerprint;
  }
  if (
    "metadata" in version &&
    isRecord(version.metadata) &&
    version.metadata.binaryFingerprint
  ) {
    return version.metadata.binaryFingerprint;
  }
  return null;
};

const restorableVersionFromRecord = (
  siteId: string,
  media: MediaItem,
  version: RetainedVersion | MediaVersion,
): RestorableVersion | null => {
  const filename = stringFromVersion(version, "filename");
  const originalName = stringFromVersion(version, "originalName") || filename;
  const mimeType = stringFromVersion(version, "mimeType");
  const url = stringFromVersion(version, "url");
  const sizeBytes = Math.max(0, Number(version.sizeBytes) || 0);
  const type = mediaTypeFromVersion(version, media.type);

  if (!filename || !originalName || !mimeType || !url || sizeBytes <= 0) {
    return null;
  }

  return {
    filename,
    originalName,
    mimeType,
    sizeBytes,
    type,
    url,
    thumbnailUrl: stringFromVersion(version, "thumbnailUrl"),
    storagePath: versionStoragePath(siteId, version),
    storageProvider: stringFromVersion(version, "storageProvider"),
    binaryFingerprint: versionBinaryFingerprint(version),
  };
};

const buildCurrentVersion = (
  siteId: string,
  media: MediaItem,
  input: {
    restoredAt: string;
    restoredBy: string | null;
    reason: string | null;
    restoredFromVersionId: string;
  },
): RetainedVersion => ({
  id: `version_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
  filename: media.filename,
  originalName: media.originalName,
  mimeType: media.mimeType,
  sizeBytes: media.sizeBytes,
  type: media.type,
  url: media.url,
  thumbnailUrl: media.thumbnailUrl,
  storagePath: storagePathFromMedia(siteId, media),
  storageProvider: storageProviderFromMetadata(media.metadata),
  binaryFingerprint: isRecord(media.metadata)
    ? media.metadata.binaryFingerprint || null
    : null,
  createdAt: media.updatedAt || media.createdAt,
  replacedAt: input.restoredAt,
  replacedBy: input.restoredBy,
  reason: input.reason,
  restoredFromVersionId: input.restoredFromVersionId,
});

const listRepositoryVersions = (repositories: BackyRepositories, siteId: string, mediaId: string) =>
  readCompleteMediaInventory(siteId, pagination => repositories.media.listVersions({ siteId, mediaId, ...pagination }));

const mediaVersionAssetWebhookSnapshot = (
  media: MediaItem,
): BackyJsonObject => ({
  mediaId: media.id,
  filename: media.filename,
  originalName: media.originalName || null,
  mimeType: media.mimeType,
  type: media.type,
  url: media.url,
  thumbnailUrl: media.thumbnailUrl || null,
  sizeBytes: media.sizeBytes,
  visibility: media.visibility || "public",
  folderId: media.folderId || null,
  updatedAt: media.updatedAt,
});

const mediaVersionWebhookSnapshot = (
  version: RetainedVersion | MediaVersion,
): BackyJsonObject => ({
  versionId: typeof version.id === "string" ? version.id : null,
  filename: typeof version.filename === "string" ? version.filename : null,
  originalName:
    typeof version.originalName === "string" ? version.originalName : null,
  mimeType: typeof version.mimeType === "string" ? version.mimeType : null,
  sizeBytes: Math.max(0, Number(version.sizeBytes) || 0),
  type: typeof version.type === "string" ? version.type : null,
  url: typeof version.url === "string" ? version.url : null,
  thumbnailUrl:
    typeof version.thumbnailUrl === "string" ? version.thumbnailUrl : null,
  storagePath:
    versionStoragePath("", version) ||
    (typeof version.storagePath === "string" ? version.storagePath : null),
  storageProvider:
    typeof version.storageProvider === "string"
      ? version.storageProvider
      : null,
});

const deliverMediaVersionWebhook = async (params: {
  repositories?: Awaited<
    ReturnType<typeof getRequiredDatabaseRepositories>
  > | null;
  site: Site;
  action: "media.version.restored" | "media.version.deleted";
  before?: MediaItem;
  after?: MediaItem;
  version: RetainedVersion | MediaVersion;
  retainedVersion?: RetainedVersion | MediaVersion | null;
  requestId: string;
  actor?: string | null;
  source: "database" | "metadata";
}) => {
  const media = params.after || params.before;

  return deliverSiteWebhooks({
    repositories: params.repositories,
    site: params.site,
    kind: "site-updated",
    requestId: params.requestId,
    actor: params.actor,
    reason: params.action,
    data: {
      resourceType: "media",
      ...(params.before
        ? { before: mediaVersionAssetWebhookSnapshot(params.before) }
        : {}),
      ...(params.after
        ? { after: mediaVersionAssetWebhookSnapshot(params.after) }
        : {}),
      version: mediaVersionWebhookSnapshot(params.version),
      ...(params.retainedVersion
        ? {
            retainedVersion: mediaVersionWebhookSnapshot(
              params.retainedVersion,
            ),
          }
        : {}),
    },
    metadata: {
      action: params.action,
      changedKeys: ["media"],
      source: "admin-media-version-detail-api",
      resourceType: "media",
      resourceId: media?.id || null,
      filename: media ? media.originalName || media.filename : null,
      mimeType: media?.mimeType || null,
      type: media?.type || null,
      visibility: media?.visibility || "public",
      folderId: media?.folderId || null,
      versionId:
        typeof params.version.id === "string" ? params.version.id : null,
      versionFilename:
        typeof params.version.originalName === "string"
          ? params.version.originalName
          : typeof params.version.filename === "string"
            ? params.version.filename
            : null,
      versionSizeBytes: Math.max(0, Number(params.version.sizeBytes) || 0),
      storagePath: versionStoragePath(params.site.id, params.version),
      versionSource: params.source,
    },
  });
};

async function mutateVersion(request: NextRequest, { params }: RouteParams, action: 'restore' | 'delete') {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: action === 'restore' ? 'media.edit' : 'media.delete' });
  if (access instanceof NextResponse) return access;
  try {
    const { siteId, mediaId, versionId } = await params;
    const repositories = shouldUseDemoStoreFallback() ? null : await getRequiredDatabaseRepositories();
    const site = repositories ? (await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId)) : getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    return await withMediaStorageMutation(repositories?.media || null, site.id, requestId, async () => {
      const media = repositories ? await repositories.media.getById(site.id, mediaId) : getMediaById(site.id, mediaId);
      if (!media) return errorResponse(404, 'MEDIA_NOT_FOUND', 'Media item not found', requestId);
      const versions = repositories ? await listRepositoryVersions(repositories, site.id, mediaId) : replacementVersionsFromMetadata(media.metadata);
      const version = versions.find(item => item.id === versionId);
      if (!version) return errorResponse(404, 'MEDIA_VERSION_NOT_FOUND', 'Media version not found', requestId);
      const body = action === 'restore' ? await parseJsonBody(request) : {};
      const restoredAt = new Date().toISOString(), restoredBy = access.session?.user.id || 'api-key';
      const reason = textFromBody(body, 'reason') || 'Restored retained media version';
      const restored = action === 'restore' ? restorableVersionFromRecord(site.id, media as MediaItem, version) : null;
      if (action === 'restore' && !restored) return errorResponse(409, 'MEDIA_VERSION_NOT_RESTORABLE', 'Media version is missing required file metadata', requestId);
      // Record every potentially retired path before changing logical references. The complete
      // surviving inventory protects originals/history still referenced by this or another asset.
      const files = action === 'restore' ? mediaStorageRetirementFiles(site.id, media as MediaItem) : mediaStorageVersionRetirementFiles(site.id, version);
      return withJournaledMediaStorageMutation({ siteId: site.id, mediaId, operation: action === 'restore' ? 'version-restore' : 'version-delete', requestId, files }, repositories, async () => {
        let retainedVersion: RetainedVersion | MediaVersion | null = null;
        let metadata: MediaItem["metadata"] = removeVersionFromMetadata(media.metadata, [versionId, retainedMetadataVersionId(version) || '']);
        let updated: MediaItem | null;
        const completionWarnings: string[] = [];
        if (action === 'restore' && restored) {
          const current = buildCurrentVersion(site.id, media as MediaItem, { restoredAt, restoredBy, reason, restoredFromVersionId: versionId });
          metadata = prependVersionInMetadata(media.metadata, current, [versionId, retainedMetadataVersionId(version) || '']);
          metadata.generatedTransforms = null;
          const replacement = { filename: restored.filename, originalName: restored.originalName, mimeType: restored.mimeType, type: restored.type, url: restored.url, thumbnailUrl: restored.thumbnailUrl, metadata: { ...metadata, storagePath: restored.storagePath, storageProvider: restored.storageProvider, binaryFingerprint: restored.binaryFingerprint || null, thumbnailUrl: restored.thumbnailUrl, lastRestoredAt: restoredAt, lastRestoredBy: restoredBy, restoredFromVersionId: versionId } };
          updated = repositories ? (await repositories.media.update(site.id, mediaId, { ...replacement, size: restored.sizeBytes })).item : updateMediaItem(site.id, mediaId, { ...replacement, sizeBytes: restored.sizeBytes }) as MediaItem | null;
          if (!updated) return errorResponse(404, 'MEDIA_NOT_FOUND', 'Media item not found', requestId);
          // The metadata history already retains current bytes. Extra version indexing can retry
          // without invalidating the committed restore or deleting a still-live file.
          retainedVersion = current;
          if (repositories) try {
            retainedVersion = (await repositories.media.createVersion({ siteId: site.id, mediaId, filename: media.filename, originalName: media.originalName, mimeType: media.mimeType, sizeBytes: media.sizeBytes, type: media.type, url: media.url, thumbnailUrl: media.thumbnailUrl, storagePath: storagePathFromMedia(site.id, media as MediaItem), storageProvider: storageProviderFromMetadata(media.metadata), replacedAt: restoredAt, replacedBy: restoredBy, reason, metadata: { source: 'media.version.restore', restoredFromVersionId: versionId, retainedMetadataVersionId: typeof current.id === 'string' ? current.id : null, binaryFingerprint: current.binaryFingerprint } })).item;
          } catch { completionWarnings.push('MEDIA_VERSION_INDEX_PENDING'); }
        } else {
          updated = repositories ? (await repositories.media.update(site.id, mediaId, { metadata })).item : updateMediaItem(site.id, mediaId, { metadata }) as MediaItem | null;
          if (!updated) return errorResponse(404, 'MEDIA_NOT_FOUND', 'Media item not found', requestId);
        }
        // Remove the dedicated retained-version reference after the main metadata commit.
        if (repositories) try { await repositories.media.deleteVersion({ siteId: site.id, mediaId, versionId }); } catch { completionWarnings.push('MEDIA_VERSION_INDEX_PENDING'); }
        try { await recordAdminAudit({ repositories, siteId: site.id, actorId: access.session?.user.id, entity: 'media', entityId: mediaId, action: action === 'restore' ? 'media.version.restore' : 'media.version.delete', before: media, after: updated, metadata: { versionId, reason, source: repositories ? 'database' : 'metadata' }, requestId }); } catch { completionWarnings.push('MEDIA_AUDIT_PENDING'); }
        let cacheInvalidation: Awaited<ReturnType<typeof recordSiteCacheInvalidation>> | undefined;
        if (repositories) try { cacheInvalidation = await recordSiteCacheInvalidation(repositories, { siteId: site.id, scope: 'media', entity: 'media', entityId: mediaId, reason: action === 'restore' ? 'media-version-restored' : 'media-version-deleted', requestId }); } catch { completionWarnings.push('MEDIA_CACHE_INVALIDATION_PENDING'); }
        try { await deliverMediaVersionWebhook({ repositories, site: site as Site, action: action === 'restore' ? 'media.version.restored' : 'media.version.deleted', before: media as MediaItem, after: updated, version, ...(retainedVersion ? { retainedVersion } : {}), requestId, actor: access.session?.user.id, source: repositories ? 'database' : 'metadata' }); } catch { completionWarnings.push('MEDIA_WEBHOOK_DELIVERY_PENDING'); }
        return NextResponse.json({ success: true, requestId, data: { ...(action === 'restore' ? { restored: true, restoredVersion: version, retainedVersion } : { deleted: true, version }), mediaId, versionId, source: repositories ? 'database' : 'metadata', media: updated, completionWarnings: [...new Set(completionWarnings)], cacheInvalidation } });
      });
    });
  } catch (error) {
    const response = mediaStorageRecoveryErrorResponse(error, requestId); if (response) return response;
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
export async function POST(request: NextRequest, context: RouteParams) { return mutateVersion(request, context, 'restore'); }
export async function DELETE(request: NextRequest, context: RouteParams) { return mutateVersion(request, context, 'delete'); }
