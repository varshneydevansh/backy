/**
 * Admin media retained-version endpoint.
 *
 * POST   /api/admin/sites/[siteId]/media/[mediaId]/versions/[versionId] (restore)
 * DELETE /api/admin/sites/[siteId]/media/[mediaId]/versions/[versionId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { getMediaById, getSiteByIdOrSlug, updateMediaItem } from '@/lib/backyStore';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';
import { getMediaStorageAdapter } from '@/lib/mediaStorage';
import { deleteGeneratedTransformFiles } from '@/lib/mediaTransformGeneration';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import type { BackyRepositories, MediaItem, MediaVersion } from '@backy-cms/core';

export const runtime = 'nodejs';

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
  type: MediaItem['type'];
  url: string;
  thumbnailUrl: string | null;
  storagePath: string | null;
  storageProvider: string | null;
  binaryFingerprint?: unknown;
};

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const MAX_REPLACEMENT_VERSIONS = 20;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
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
  )
);

const replacementVersionsFromMetadata = (metadata: MediaItem['metadata'] | undefined): RetainedVersion[] => (
  metadata && Array.isArray(metadata.replacementVersions)
    ? metadata.replacementVersions.filter((version): version is RetainedVersion => (
        !!version && typeof version === 'object' && !Array.isArray(version)
      ))
    : []
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

const parseJsonBody = async (request: NextRequest): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
};

const textFromBody = (body: Record<string, unknown>, key: string): string | null => {
  const value = body[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
};

const retainedMetadataVersionId = (version: MediaVersion): string | null => (
  isRecord(version.metadata) && typeof version.metadata.retainedMetadataVersionId === 'string'
    ? version.metadata.retainedMetadataVersionId
    : null
);

const removeVersionFromMetadata = (
  metadata: MediaItem['metadata'] | undefined,
  versionIds: string[],
) => {
  const ids = new Set(versionIds.filter(Boolean));
  const versions = replacementVersionsFromMetadata(metadata);
  const nextVersions = versions.filter((item) => (
    typeof item.id !== 'string' || !ids.has(item.id)
  ));

  return {
    ...(metadata || {}),
    replacementVersions: nextVersions,
    replacementCount: nextVersions.length,
  };
};

const prependVersionInMetadata = (
  metadata: MediaItem['metadata'] | undefined,
  retainedVersion: RetainedVersion,
  removedVersionIds: string[],
): MediaItem['metadata'] => {
  const ids = new Set(removedVersionIds.filter(Boolean));
  const versions = replacementVersionsFromMetadata(metadata)
    .filter((item) => typeof item.id !== 'string' || !ids.has(item.id));
  const nextVersions = [retainedVersion, ...versions].slice(0, MAX_REPLACEMENT_VERSIONS);

  return {
    ...(metadata || {}),
    replacementVersions: nextVersions,
    replacementCount: nextVersions.length,
  };
};

const versionStoragePath = (siteId: string, version: RetainedVersion | MediaVersion): string | null => {
  const storagePath = version.storagePath;
  const normalized = typeof storagePath === 'string' ? storagePath.trim() : '';
  return normalized.length > 0 && normalized.startsWith(`sites/${siteId}/`)
    ? normalized
    : null;
};

const storagePathFromMedia = (siteId: string, media: MediaItem): string | null => {
  const storagePath = isRecord(media.metadata) && typeof media.metadata.storagePath === 'string'
    ? media.metadata.storagePath.trim()
    : '';
  return storagePath.length > 0 && storagePath.startsWith(`sites/${siteId}/`)
    ? storagePath
    : null;
};

const storageProviderFromMetadata = (metadata: MediaItem['metadata'] | undefined): string | null => (
  isRecord(metadata) && typeof metadata.storageProvider === 'string' && metadata.storageProvider.trim().length > 0
    ? metadata.storageProvider.trim()
    : null
);

const mediaTypeFromVersion = (version: RetainedVersion | MediaVersion, fallback: MediaItem['type']): MediaItem['type'] => {
  const value = version.type;
  return value === 'image' || value === 'video' || value === 'audio' || value === 'document' || value === 'font' || value === 'other'
    ? value
    : fallback;
};

const stringFromVersion = (version: RetainedVersion | MediaVersion, key: keyof RestorableVersion): string | null => {
  const value = version[key as keyof typeof version];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
};

const versionBinaryFingerprint = (version: RetainedVersion | MediaVersion): unknown => {
  if (isRecord(version) && version.binaryFingerprint) {
    return version.binaryFingerprint;
  }
  if ('metadata' in version && isRecord(version.metadata) && version.metadata.binaryFingerprint) {
    return version.metadata.binaryFingerprint;
  }
  return null;
};

const restorableVersionFromRecord = (
  siteId: string,
  media: MediaItem,
  version: RetainedVersion | MediaVersion,
): RestorableVersion | null => {
  const filename = stringFromVersion(version, 'filename');
  const originalName = stringFromVersion(version, 'originalName') || filename;
  const mimeType = stringFromVersion(version, 'mimeType');
  const url = stringFromVersion(version, 'url');
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
    thumbnailUrl: stringFromVersion(version, 'thumbnailUrl'),
    storagePath: versionStoragePath(siteId, version),
    storageProvider: stringFromVersion(version, 'storageProvider'),
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
  binaryFingerprint: isRecord(media.metadata) ? media.metadata.binaryFingerprint || null : null,
  createdAt: media.updatedAt || media.createdAt,
  replacedAt: input.restoredAt,
  replacedBy: input.restoredBy,
  reason: input.reason,
  restoredFromVersionId: input.restoredFromVersionId,
});

const deleteStoredVersionFile = async (siteId: string, version: RetainedVersion | MediaVersion) => {
  const storagePath = versionStoragePath(siteId, version);
  if (!storagePath) {
    return;
  }

  try {
    const storage = await getMediaStorageAdapter();
    await storage.delete(storagePath);
  } catch {
    // Missing retained files should not block catalog cleanup.
  }
};

const listRepositoryVersions = async (
  repositories: BackyRepositories,
  siteId: string,
  mediaId: string,
) => (
  await repositories.media.listVersions({
    siteId,
    mediaId,
    limit: 200,
    offset: 0,
  })
).items;

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'media.edit' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, mediaId, versionId } = await params;
    const body = await parseJsonBody(request);
    const restoredAt = new Date().toISOString();
    const restoredBy = textFromBody(body, 'restoredBy') || 'admin';
    const reason = textFromBody(body, 'reason') || 'Restored retained media version';

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const media = await repositories.media.getById(site.id, mediaId);
      if (!media) {
        return errorResponse(404, 'MEDIA_NOT_FOUND', 'Media item not found', requestId);
      }

      const versions = await listRepositoryVersions(repositories, site.id, mediaId);
      const version = versions.find((item) => item.id === versionId);
      if (!version) {
        return errorResponse(404, 'MEDIA_VERSION_NOT_FOUND', 'Media version not found', requestId);
      }

      const restoredVersion = restorableVersionFromRecord(site.id, media, version);
      if (!restoredVersion) {
        return errorResponse(409, 'MEDIA_VERSION_NOT_RESTORABLE', 'Media version is missing required file metadata', requestId);
      }

      const retainedCurrentVersion = buildCurrentVersion(site.id, media, {
        restoredAt,
        restoredBy,
        reason,
        restoredFromVersionId: version.id,
      });

      await deleteGeneratedTransformFiles(media.metadata).catch(() => undefined);
      const retainedCurrentRecord = await repositories.media.createVersion({
        siteId: site.id,
        mediaId,
        filename: media.filename,
        originalName: media.originalName,
        mimeType: media.mimeType,
        sizeBytes: media.sizeBytes,
        type: media.type,
        url: media.url,
        thumbnailUrl: media.thumbnailUrl,
        storagePath: storagePathFromMedia(site.id, media),
        storageProvider: storageProviderFromMetadata(media.metadata),
        replacedAt: restoredAt,
        replacedBy: restoredBy,
        reason,
        metadata: {
          source: 'media.version.restore',
          restoredFromVersionId: version.id,
          retainedMetadataVersionId: typeof retainedCurrentVersion.id === 'string' ? retainedCurrentVersion.id : null,
          binaryFingerprint: retainedCurrentVersion.binaryFingerprint,
        },
      });
      await repositories.media.deleteVersion({
        siteId: site.id,
        mediaId,
        versionId,
      });
      const metadata = prependVersionInMetadata(media.metadata, retainedCurrentVersion, [
        versionId,
        retainedMetadataVersionId(version) || '',
      ]);
      delete metadata.generatedTransforms;
      const updatedMedia = await repositories.media.update(site.id, mediaId, {
        filename: restoredVersion.filename,
        originalName: restoredVersion.originalName,
        mimeType: restoredVersion.mimeType,
        size: restoredVersion.sizeBytes,
        type: restoredVersion.type,
        url: restoredVersion.url,
        thumbnailUrl: restoredVersion.thumbnailUrl,
        metadata: {
          ...metadata,
          storagePath: restoredVersion.storagePath,
          storageProvider: restoredVersion.storageProvider,
          binaryFingerprint: restoredVersion.binaryFingerprint || null,
          thumbnailUrl: restoredVersion.thumbnailUrl,
          lastRestoredAt: restoredAt,
          lastRestoredBy: restoredBy,
          restoredFromVersionId: version.id,
        },
      });

      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: 'media',
        entityId: media.id,
        action: 'media.version.restore',
        before: media,
        after: updatedMedia.item,
        metadata: {
          restoredFilename: restoredVersion.originalName,
          retainedFilename: media.originalName || media.filename,
          restoredVersionId: version.id,
          retainedVersionId: retainedCurrentRecord.item.id,
          reason,
          source: 'database',
        },
        requestId,
      });
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'media',
        entity: 'media',
        entityId: media.id,
        reason: 'media-version-restored',
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          restored: true,
          mediaId,
          versionId,
          source: 'database',
          media: updatedMedia.item,
          restoredVersion: version,
          retainedVersion: retainedCurrentRecord.item,
          cacheInvalidation,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const media = getMediaById(site.id, mediaId);
    if (!media) {
      return errorResponse(404, 'MEDIA_NOT_FOUND', 'Media item not found', requestId);
    }

    const versions = replacementVersionsFromMetadata(media.metadata);
    const version = versions.find((item) => item.id === versionId);
    if (!version) {
      return errorResponse(404, 'MEDIA_VERSION_NOT_FOUND', 'Media version not found', requestId);
    }

    const restoredVersion = restorableVersionFromRecord(site.id, media, version);
    if (!restoredVersion) {
      return errorResponse(409, 'MEDIA_VERSION_NOT_RESTORABLE', 'Media version is missing required file metadata', requestId);
    }

    const retainedCurrentVersion = buildCurrentVersion(site.id, media, {
      restoredAt,
      restoredBy,
      reason,
      restoredFromVersionId: versionId,
    });
    await deleteGeneratedTransformFiles(media.metadata).catch(() => undefined);
    const metadata = prependVersionInMetadata(media.metadata, retainedCurrentVersion, [versionId]);
    delete metadata.generatedTransforms;
    const updated = updateMediaItem(site.id, mediaId, {
      filename: restoredVersion.filename,
      originalName: restoredVersion.originalName,
      mimeType: restoredVersion.mimeType,
      sizeBytes: restoredVersion.sizeBytes,
      type: restoredVersion.type,
      url: restoredVersion.url,
      thumbnailUrl: restoredVersion.thumbnailUrl,
      metadata: {
        ...metadata,
        storagePath: restoredVersion.storagePath,
        storageProvider: restoredVersion.storageProvider,
        binaryFingerprint: restoredVersion.binaryFingerprint || null,
        thumbnailUrl: restoredVersion.thumbnailUrl,
        lastRestoredAt: restoredAt,
        lastRestoredBy: restoredBy,
        restoredFromVersionId: versionId,
      },
    });

    await recordAdminAudit({
      siteId: site.id,
      entity: 'media',
      entityId: media.id,
      action: 'media.version.restore',
      before: media,
      after: updated,
      metadata: {
        restoredFilename: restoredVersion.originalName,
        retainedFilename: media.originalName || media.filename,
        restoredVersionId: versionId,
        retainedVersionId: typeof retainedCurrentVersion.id === 'string' ? retainedCurrentVersion.id : null,
        reason,
        source: 'metadata',
      },
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        restored: true,
        mediaId,
        versionId,
        source: 'metadata',
        media: updated,
        restoredVersion: version,
        retainedVersion: retainedCurrentVersion,
      },
    });
  } catch (error) {
    console.error('Admin media retained-version restore API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'media.delete' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, mediaId, versionId } = await params;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const media = await repositories.media.getById(site.id, mediaId);
      if (!media) {
        return errorResponse(404, 'MEDIA_NOT_FOUND', 'Media item not found', requestId);
      }

      const versions = await listRepositoryVersions(repositories, site.id, mediaId);
      const version = versions.find((item) => item.id === versionId);
      if (!version) {
        return errorResponse(404, 'MEDIA_VERSION_NOT_FOUND', 'Media version not found', requestId);
      }

      await deleteStoredVersionFile(site.id, version);
      await repositories.media.deleteVersion({
        siteId: site.id,
        mediaId,
        versionId,
      });
      const updatedMedia = await repositories.media.update(site.id, mediaId, {
        metadata: removeVersionFromMetadata(media.metadata, [
          versionId,
          retainedMetadataVersionId(version) || '',
        ]),
      });

      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: 'media',
        entityId: media.id,
        action: 'media.version.delete',
        before: version,
        after: updatedMedia.item,
        metadata: {
          filename: version.originalName || version.filename,
          sizeBytes: version.sizeBytes,
          storagePath: versionStoragePath(site.id, version),
          source: 'database',
        },
        requestId,
      });
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'media',
        entity: 'media',
        entityId: media.id,
        reason: 'media-version-deleted',
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          deleted: true,
          mediaId,
          versionId,
          source: 'database',
          version,
          media: updatedMedia.item,
          cacheInvalidation,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const media = getMediaById(site.id, mediaId);
    if (!media) {
      return errorResponse(404, 'MEDIA_NOT_FOUND', 'Media item not found', requestId);
    }

    const versions = replacementVersionsFromMetadata(media.metadata);
    const version = versions.find((item) => item.id === versionId);
    if (!version) {
      return errorResponse(404, 'MEDIA_VERSION_NOT_FOUND', 'Media version not found', requestId);
    }

    await deleteStoredVersionFile(site.id, version);
    const updated = updateMediaItem(site.id, mediaId, {
      metadata: removeVersionFromMetadata(media.metadata, [versionId]),
    });

    await recordAdminAudit({
      siteId: site.id,
      entity: 'media',
      entityId: media.id,
      action: 'media.version.delete',
      before: version,
      after: updated,
      metadata: {
        filename: typeof version.originalName === 'string'
          ? version.originalName
          : typeof version.filename === 'string'
            ? version.filename
            : 'Retained version',
        sizeBytes: Number(version.sizeBytes) || 0,
        storagePath: versionStoragePath(site.id, version),
        source: 'metadata',
      },
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        deleted: true,
        mediaId,
        versionId,
        source: 'metadata',
        version,
        media: updated,
      },
    });
  } catch (error) {
    console.error('Admin media retained-version delete API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
