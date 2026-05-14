/**
 * Admin media versions endpoint.
 *
 * GET /api/admin/sites/[siteId]/media/[mediaId]/versions
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { getMediaById, getSiteByIdOrSlug } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import type { MediaItem } from '@backy-cms/core';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    mediaId: string;
  }>;
}

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

const parseBoundedInteger = (value: string | null, fallback: number, min: number, max: number) => {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const replacementVersionsFromMetadata = (metadata: MediaItem['metadata'] | undefined) => (
  metadata && Array.isArray(metadata.replacementVersions)
    ? metadata.replacementVersions.filter((version): version is Record<string, unknown> => (
        !!version && typeof version === 'object' && !Array.isArray(version)
      ))
    : []
);

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'media.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, mediaId } = await params;
    const limit = parseBoundedInteger(request.nextUrl.searchParams.get('limit'), 50, 1, 200);
    const offset = parseBoundedInteger(request.nextUrl.searchParams.get('offset'), 0, 0, 100000);

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

      const versions = await repositories.media.listVersions({
        siteId: site.id,
        mediaId,
        limit,
        offset,
      });
      if (versions.items.length === 0) {
        const metadataVersions = replacementVersionsFromMetadata(media.metadata);
        const pagedMetadataVersions = metadataVersions.slice(offset, offset + limit);

        return NextResponse.json({
          success: true,
          requestId,
          data: {
            mediaId,
            source: 'metadata',
            versions: pagedMetadataVersions,
            pagination: {
              total: metadataVersions.length,
              limit,
              offset,
              hasMore: offset + limit < metadataVersions.length,
            },
          },
        });
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          mediaId,
          source: 'database',
          versions: versions.items,
          pagination: versions.pagination,
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
    const pagedVersions = versions.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        mediaId,
        source: 'metadata',
        versions: pagedVersions,
        pagination: {
          total: versions.length,
          limit,
          offset,
          hasMore: offset + limit < versions.length,
        },
      },
    });
  } catch (error) {
    console.error('Admin media versions API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
