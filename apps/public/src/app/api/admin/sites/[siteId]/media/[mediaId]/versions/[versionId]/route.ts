/**
 * Admin media retained-version endpoint.
 *
 * DELETE /api/admin/sites/[siteId]/media/[mediaId]/versions/[versionId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { getMediaById, getSiteByIdOrSlug, updateMediaItem } from '@/lib/backyStore';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';
import { getMediaStorageAdapter } from '@/lib/mediaStorage';
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

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

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

const versionStoragePath = (siteId: string, version: RetainedVersion | MediaVersion): string | null => {
  const storagePath = version.storagePath;
  const normalized = typeof storagePath === 'string' ? storagePath.trim() : '';
  return normalized.length > 0 && normalized.startsWith(`sites/${siteId}/`)
    ? normalized
    : null;
};

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

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'media.delete' });
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
