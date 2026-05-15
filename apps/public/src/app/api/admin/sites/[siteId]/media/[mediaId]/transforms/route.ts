import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { getAdminSettings, getMediaById, getMediaList, getSiteByIdOrSlug, updateMediaItem } from '@/lib/backyStore';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';
import {
  DEFAULT_IMAGE_VARIANT_QUALITY,
  DEFAULT_IMAGE_VARIANT_WIDTHS,
} from '@/lib/mediaResponsive';
import {
  deleteGeneratedTransformFiles,
  generatedTransformBytes,
  generateImageTransformManifest,
  MediaTransformGenerationError,
} from '@/lib/mediaTransformGeneration';
import { mediaQuotaPayload, resolveMediaUploadPolicy } from '@/lib/mediaUploadPolicy';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    mediaId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string, details?: Record<string, unknown>) => (
  NextResponse.json(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
    { status },
  )
);

const parseJsonBody = async (request: NextRequest): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const normalizeWidths = (value: unknown): number[] => {
  const rawWidths = Array.isArray(value) ? value : DEFAULT_IMAGE_VARIANT_WIDTHS;
  const widths = rawWidths
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
    .map((item) => Math.max(16, Math.min(3840, Math.floor(item))));

  return Array.from(new Set(widths)).slice(0, 10).sort((a, b) => a - b);
};

const normalizeQuality = (value: unknown): number => {
  const quality = Number(value);
  if (!Number.isFinite(quality)) {
    return DEFAULT_IMAGE_VARIANT_QUALITY;
  }

  return Math.max(1, Math.min(100, Math.floor(quality)));
};

const replacementVersionBytes = (metadata: unknown): number => {
  const record = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : null;
  const versions = Array.isArray(record?.replacementVersions) ? record.replacementVersions : [];

  return versions.reduce((total, version) => {
    if (!version || typeof version !== 'object' || Array.isArray(version)) {
      return total;
    }

    return total + Math.max(0, Number((version as Record<string, unknown>).sizeBytes) || 0);
  }, 0);
};

const mediaUsageBytes = (items: Array<{ sizeBytes?: number; metadata?: unknown }>) => (
  items.reduce((total, item) => (
    total
    + Math.max(0, Number(item.sizeBytes) || 0)
    + replacementVersionBytes(item.metadata)
    + generatedTransformBytes(item.metadata)
  ), 0)
);

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'media.edit' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, mediaId } = await params;
    const body = await parseJsonBody(request);
    const repositories = !shouldUseDemoStoreFallback() ? await getRequiredDatabaseRepositories() : null;
    const repositorySite = repositories ? await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId) : null;
    const site = repositorySite || getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const beforeMedia = repositories
      ? await repositories.media.getById(site.id, mediaId)
      : getMediaById(site.id, mediaId);

    if (!beforeMedia) {
      return errorResponse(404, 'MEDIA_NOT_FOUND', 'Media item not found', requestId);
    }

    if (beforeMedia.visibility !== 'public') {
      return errorResponse(400, 'MEDIA_TRANSFORM_PRIVATE', 'Only public images can prepare responsive variants.', requestId);
    }

    if (beforeMedia.type !== 'image' || !beforeMedia.mimeType.startsWith('image/')) {
      return errorResponse(400, 'MEDIA_TRANSFORM_UNSUPPORTED', 'Only image media can prepare responsive variants.', requestId);
    }

    const widths = normalizeWidths(body.widths);
    if (widths.length === 0) {
      return errorResponse(400, 'INVALID_TRANSFORM_WIDTHS', 'At least one valid width is required.', requestId);
    }

    const quality = normalizeQuality(body.quality);
    const sizes = typeof body.sizes === 'string' && body.sizes.trim().length > 0
      ? body.sizes.trim()
      : '(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px';
    const preparedAt = new Date().toISOString();
    const preparedBy = typeof body.preparedBy === 'string' && body.preparedBy.trim().length > 0
      ? body.preparedBy.trim()
      : 'admin';
    const generatedTransforms = await generateImageTransformManifest({
      siteId: site.id,
      media: beforeMedia,
      widths,
      quality,
      sizes,
      preparedAt,
      preparedBy,
    });
    const settings = repositories ? await repositories.settings.get() : getAdminSettings();
    const uploadPolicy = resolveMediaUploadPolicy(settings);
    const siteMediaQuotaBytes = uploadPolicy.quotaBytes;
    const currentMedia = repositories
      ? (await repositories.media.list({
          siteId: site.id,
          type: 'all',
          visibility: 'all',
          limit: 10000,
          offset: 0,
        })).items
      : getMediaList(site.id, {
          limit: 10000,
          offset: 0,
        }).media;
    const currentUsageBytes = mediaUsageBytes(currentMedia);
    const nextUsageBytes = currentUsageBytes
      - generatedTransformBytes(beforeMedia.metadata)
      + generatedTransformBytes({ generatedTransforms });

    if (nextUsageBytes > siteMediaQuotaBytes) {
      await deleteGeneratedTransformFiles({ generatedTransforms });
      return errorResponse(
        413,
        'SITE_MEDIA_QUOTA_EXCEEDED',
        'Preparing responsive variants would exceed the site media storage quota.',
        requestId,
        mediaQuotaPayload(siteMediaQuotaBytes, currentUsageBytes, uploadPolicy),
      );
    }

    await deleteGeneratedTransformFiles(beforeMedia.metadata);

    const metadata = {
      ...(beforeMedia.metadata || {}),
      generatedTransforms,
    };
    const updated = repositories
      ? (await repositories.media.update(site.id, beforeMedia.id, { metadata })).item
      : updateMediaItem(site.id, beforeMedia.id, { metadata });

    if (!updated) {
      return errorResponse(404, 'MEDIA_NOT_FOUND', 'Media item not found', requestId);
    }

    await recordAdminAudit({
      repositories,
      siteId: site.id,
      entity: 'media',
      entityId: updated.id,
      action: 'media.transforms.prepare',
      before: beforeMedia,
      after: updated,
      metadata: {
        widths,
        quality,
        sizes,
        preparedBy,
        generatedBytes: generatedTransforms.generatedBytes,
        storageProvider: generatedTransforms.storageProvider,
        format: generatedTransforms.format,
      },
      requestId,
    });
    const cacheInvalidation = repositories
      ? await recordSiteCacheInvalidation(repositories, {
          siteId: site.id,
          scope: 'media',
          entity: 'media',
          entityId: updated.id,
          reason: 'media-transforms-prepared',
          requestId,
        })
      : undefined;

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        media: updated,
        responsive: generatedTransforms,
        quota: mediaQuotaPayload(siteMediaQuotaBytes, nextUsageBytes),
        cacheInvalidation,
      },
    });
  } catch (error) {
    if (error instanceof MediaTransformGenerationError) {
      return errorResponse(422, error.code, error.message, requestId, error.details);
    }

    console.error('Admin media transform preparation API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
