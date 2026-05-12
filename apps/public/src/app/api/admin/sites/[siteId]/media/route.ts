/**
 * Admin media endpoint.
 *
 * GET  /api/admin/sites/[siteId]/media
 * POST /api/admin/sites/[siteId]/media
 */

import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { createMediaItem, getMediaList, getSiteByIdOrSlug, listMediaFolders } from '@/lib/backyStore';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';
import { MediaSafetyError, scanMediaUploadWithProviders } from '@/lib/mediaSafety';
import {
  booleanQueryFlag,
  buildMediaScopeMetadataPatch,
  mediaMatchesScopeFilters,
  mediaScopeRequiresTarget,
  normalizeMediaScope,
  normalizeScopeTargetId,
} from '@/lib/mediaScope';
import { getMediaStorageAdapter, getMediaStoragePath } from '@/lib/mediaStorage';
import { generatedTransformBytes } from '@/lib/mediaTransformGeneration';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import type { MediaItem } from '@backy-cms/core';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const DEFAULT_SITE_MEDIA_QUOTA_BYTES = 500 * 1024 * 1024;

const MIME_TYPE_TO_MEDIA_TYPE: Array<{
  test: (mimeType: string, extension: string) => boolean;
  type: MediaItem['type'];
}> = [
  { test: (mimeType) => mimeType.startsWith('image/'), type: 'image' },
  { test: (mimeType) => mimeType.startsWith('video/'), type: 'video' },
  { test: (mimeType) => mimeType.startsWith('audio/'), type: 'audio' },
  {
    test: (mimeType, extension) => (
      mimeType === 'application/pdf' ||
      ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv'].includes(extension)
    ),
    type: 'document',
  },
  {
    test: (mimeType, extension) => (
      mimeType.startsWith('font/') ||
      mimeType === 'application/font-woff' ||
      mimeType === 'application/x-font-ttf' ||
      mimeType === 'application/vnd.ms-fontobject' ||
      ['.woff', '.woff2', '.ttf', '.otf', '.eot'].includes(extension)
    ),
    type: 'font',
  },
];

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const buildMediaBinaryFingerprint = (buffer: Buffer) => {
  const value = createHash('sha256').update(buffer).digest('hex');
  return {
    algorithm: 'sha256',
    value,
    shortValue: value.slice(0, 12),
    sizeBytes: buffer.length,
  };
};

const safePathSegment = (value: string) => (
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'asset'
);

const cleanFontFamily = (value: string) => (
  value
    .trim()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    || 'Uploaded Font'
);

const toStringValue = (value: FormDataEntryValue | null): string | null => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
);

const toStringList = (value: FormDataEntryValue | null): string[] => {
  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const parseMetadata = (value: FormDataEntryValue | null): Record<string, unknown> => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const parseVisibility = (value: FormDataEntryValue | null): MediaItem['visibility'] => (
  value === 'private' ? 'private' : 'public'
);

const parseFontDisplay = (value: FormDataEntryValue | null) => (
  value === 'auto' ||
  value === 'block' ||
  value === 'fallback' ||
  value === 'optional' ||
  value === 'swap'
    ? value
    : 'swap'
);

const mediaTypeFromInput = (value: string | null): MediaItem['type'] | undefined => (
  value === 'image' ||
  value === 'video' ||
  value === 'audio' ||
  value === 'document' ||
  value === 'font' ||
  value === 'other'
    ? value
    : undefined
);

const visibilityFromInput = (value: string | null): MediaItem['visibility'] | 'all' | undefined => (
  value === 'public' || value === 'private' || value === 'all' ? value : undefined
);

const paginateMedia = (items: MediaItem[], limit: number, offset: number) => ({
  media: items.slice(offset, offset + limit),
  pagination: {
    total: items.length,
    limit,
    offset,
    hasMore: offset + limit < items.length,
  },
});

const getMediaType = (mimeType: string, originalName: string): MediaItem['type'] => {
  const extension = extname(originalName).toLowerCase();
  return MIME_TYPE_TO_MEDIA_TYPE.find((candidate) => candidate.test(mimeType, extension))?.type ?? 'other';
};

const mediaFolderForType = (type: MediaItem['type']) => {
  if (type === 'font') return 'fonts';
  if (type === 'image') return 'images';
  if (type === 'video') return 'videos';
  if (type === 'audio') return 'audio';
  if (type === 'document') return 'documents';
  return 'files';
};

const configuredSiteMediaQuotaBytes = () => {
  const configured = Number(process.env.BACKY_SITE_MEDIA_QUOTA_BYTES);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_SITE_MEDIA_QUOTA_BYTES;
  }

  return Math.floor(configured);
};

const replacementVersionBytes = (metadata: MediaItem['metadata'] | undefined): number => {
  const versions = metadata && Array.isArray(metadata.replacementVersions)
    ? metadata.replacementVersions
    : [];

  return versions.reduce((total, version) => {
    if (!version || typeof version !== 'object' || Array.isArray(version)) {
      return total;
    }

    return total + Math.max(0, Number((version as Record<string, unknown>).sizeBytes) || 0);
  }, 0);
};

const mediaUsageBytes = (items: MediaItem[]) => (
  items.reduce((total, item) => (
    total
    + Math.max(0, Number(item.sizeBytes) || 0)
    + replacementVersionBytes(item.metadata)
    + generatedTransformBytes(item.metadata)
  ), 0)
);

const mediaQuotaPayload = (limitBytes: number, usedBytes: number) => ({
  limitBytes,
  usedBytes,
  remainingBytes: Math.max(0, limitBytes - usedBytes),
});

const mediaTagMatches = (tags: string[], tag: string | null) => {
  if (!tag) {
    return true;
  }

  const normalizedTag = tag.trim().toLowerCase();
  if (!normalizedTag) {
    return true;
  }

  return tags.some((item) => item.trim().toLowerCase() === normalizedTag);
};

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

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'media.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit') || 50)));
      const offset = Math.max(0, Number(searchParams.get('offset') || 0));
      const scope = searchParams.get('scope');
      const pageId = searchParams.get('pageId');
      const postId = searchParams.get('postId') || searchParams.get('blogId');
      const globalOnly = booleanQueryFlag(searchParams.get('global'));
      const tag = searchParams.get('tag');
      const result = await repositories.media.list({
        siteId: site.id,
        type: mediaTypeFromInput(searchParams.get('type')) || 'all',
        visibility: visibilityFromInput(searchParams.get('visibility')) || 'all',
        search: searchParams.get('search') || undefined,
        folderId: searchParams.has('folderId') ? searchParams.get('folderId') : undefined,
        limit: 10000,
        offset: 0,
      });
      const filtered = result.items
        .filter((item) => mediaMatchesScopeFilters(item, { scope, pageId, postId, globalOnly }))
        .filter((item) => mediaTagMatches(item.tags, tag));
      const payload = paginateMedia(filtered, limit, offset);
      const allMedia = (await repositories.media.list({
        siteId: site.id,
        type: 'all',
        visibility: 'all',
        limit: 10000,
        offset: 0,
      })).items;

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          ...payload,
          quota: mediaQuotaPayload(configuredSiteMediaQuotaBytes(), mediaUsageBytes(allMedia)),
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit') || 50)));
    const offset = Math.max(0, Number(searchParams.get('offset') || 0));
    const payload = getMediaList(site.id, {
      type: searchParams.get('type') || undefined,
      scope: searchParams.get('scope') || undefined,
      visibility: searchParams.get('visibility') || undefined,
      search: searchParams.get('search') || undefined,
      tag: searchParams.get('tag') || undefined,
      folderId: searchParams.has('folderId') ? searchParams.get('folderId') : undefined,
      pageId: searchParams.get('pageId') || undefined,
      postId: searchParams.get('postId') || searchParams.get('blogId') || undefined,
      global: booleanQueryFlag(searchParams.get('global')),
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        ...payload,
        quota: mediaQuotaPayload(configuredSiteMediaQuotaBytes(), mediaUsageBytes(getMediaList(site.id, {
          limit: 10000,
          offset: 0,
        }).media)),
      },
    });
  } catch (error) {
    console.error('Admin media list API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'media.create' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId } = await params;
    const repositories = !shouldUseDemoStoreFallback() ? await getRequiredDatabaseRepositories() : null;
    const repositorySite = repositories ? await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId) : null;
    const site = repositorySite || getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return errorResponse(400, 'MISSING_FILE', 'Upload must include a file field', requestId);
    }

    if (file.size <= 0) {
      return errorResponse(400, 'EMPTY_FILE', 'Uploaded file is empty', requestId);
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return errorResponse(413, 'FILE_TOO_LARGE', 'Uploaded file exceeds the 50 MB limit', requestId);
    }

    const originalName = file.name || 'upload.bin';
    const mimeType = file.type || 'application/octet-stream';
    const mediaType = getMediaType(mimeType, originalName);

    const siteMediaQuotaBytes = configuredSiteMediaQuotaBytes();
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
    const nextUsageBytes = currentUsageBytes + file.size;
    if (nextUsageBytes > siteMediaQuotaBytes) {
      return errorResponse(
        413,
        'SITE_MEDIA_QUOTA_EXCEEDED',
        'Uploading this file would exceed the site media storage quota.',
        requestId,
        mediaQuotaPayload(siteMediaQuotaBytes, currentUsageBytes),
      );
    }

    const scope = normalizeMediaScope(formData.get('scope'), 'global');
    const visibility = parseVisibility(formData.get('visibility'));
    const scopeTargetId = normalizeScopeTargetId(formData.get('scopeTargetId'));
    if (mediaScopeRequiresTarget(scope) && !scopeTargetId) {
      return errorResponse(
        400,
        'MEDIA_SCOPE_TARGET_REQUIRED',
        'Page and post scoped media uploads require a scopeTargetId.',
        requestId,
        { scope },
      );
    }
    const scopeMetadata = buildMediaScopeMetadataPatch({ scope, scopeTargetId });
    const folderId = toStringValue(formData.get('folderId'));
    if (folderId) {
      const folder = repositories
        ? await repositories.media.getFolderById(site.id, folderId)
        : listMediaFolders(site.id).find((item) => item.id === folderId);

      if (!folder) {
        return errorResponse(404, 'FOLDER_NOT_FOUND', 'Media folder not found', requestId);
      }
    }
    const extension = extname(originalName).toLowerCase();
    const safeName = safePathSegment(extension ? originalName.slice(0, -extension.length) : originalName);
    const storedFilename = `${Date.now().toString(36)}-${safeName}${extension}`;
    const mediaFolder = mediaFolderForType(mediaType);
    const storagePath = getMediaStoragePath({ siteId: site.id, mediaFolder, storedFilename });
    const metadata = parseMetadata(formData.get('metadata'));
    const uploadBuffer = Buffer.from(await file.arrayBuffer());
    const binaryFingerprint = buildMediaBinaryFingerprint(uploadBuffer);
    const safetyScan = await scanMediaUploadWithProviders({
      buffer: uploadBuffer,
      originalName,
      mimeType,
      mediaType,
    });
    const storage = await getMediaStorageAdapter();
    const upload = await storage.upload(uploadBuffer, {
      path: storagePath,
      filename: storedFilename,
      mimeType,
      metadata: {
        siteId: site.id,
        mediaType,
        originalName,
      },
    });

    const mediaInput = {
      filename: storedFilename,
      originalName,
      mimeType,
      sizeBytes: upload.size,
      type: mediaType,
      url: upload.url,
      thumbnailUrl: mediaType === 'image' ? upload.url : null,
      pageIds: scopeMetadata.pageIds,
      postIds: scopeMetadata.postIds,
      tags: toStringList(formData.get('tags')),
      metadata: {
        ...metadata,
        extension: extension.replace(/^\./, ''),
        storagePath: upload.path,
        storageProvider: storage.provider,
        binaryFingerprint,
        safetyScan,
        thumbnailUrl: mediaType === 'image' ? upload.url : null,
        tags: toStringList(formData.get('tags')),
        ...scopeMetadata,
        ...(mediaType === 'font'
          ? {
              fontFamily: toStringValue(formData.get('fontFamily')) || cleanFontFamily(originalName),
              fontWeight: toStringValue(formData.get('fontWeight')) || '400',
              fontStyle: toStringValue(formData.get('fontStyle')) || 'normal',
              fontFallback: toStringValue(formData.get('fontFallback')) || 'system-ui, sans-serif',
              fontDisplay: parseFontDisplay(formData.get('fontDisplay')),
            }
          : {}),
      },
      altText: toStringValue(formData.get('altText')),
      caption: toStringValue(formData.get('caption')),
      uploadedBy: toStringValue(formData.get('uploadedBy')) || 'admin',
      folderId,
      scope: scopeMetadata.scope,
      scopeTargetId: scopeMetadata.scopeTargetId,
      visibility,
    };
    const media = repositories
      ? (await repositories.media.create({
          siteId: site.id,
          filename: mediaInput.filename,
          originalName: mediaInput.originalName,
          mimeType: mediaInput.mimeType,
          size: mediaInput.sizeBytes,
          type: mediaInput.type,
          url: mediaInput.url,
          folderId: mediaInput.folderId,
          altText: mediaInput.altText,
          caption: mediaInput.caption,
          visibility: mediaInput.visibility,
          metadata: mediaInput.metadata,
          uploadedBy: mediaInput.uploadedBy,
        })).item
      : createMediaItem(site.id, mediaInput);
    await recordAdminAudit({
      repositories,
      siteId: site.id,
      entity: 'media',
      entityId: media.id,
      action: 'create',
      after: media,
      metadata: {
        filename: media.originalName || media.filename,
        mimeType: media.mimeType,
        type: media.type,
        visibility: media.visibility || 'public',
        sizeBytes: media.sizeBytes,
        safetyStatus: safetyScan.status,
        ...(typeof media.metadata?.storageProvider === 'string' ? { storageProvider: media.metadata.storageProvider } : {}),
        ...(typeof media.metadata?.storagePath === 'string' ? { storagePath: media.metadata.storagePath } : {}),
      },
      requestId,
    });
    const cacheInvalidation = repositories
      ? await recordSiteCacheInvalidation(repositories, {
          siteId: site.id,
          scope: 'media',
          entity: 'media',
          entityId: media.id,
          reason: 'media-created',
          requestId,
        })
      : undefined;

    return NextResponse.json(
      {
        success: true,
        requestId,
        data: {
          media,
          cacheInvalidation,
          quota: mediaQuotaPayload(siteMediaQuotaBytes, nextUsageBytes),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof MediaSafetyError) {
      return errorResponse(415, error.code, error.message, requestId, error.details);
    }

    console.error('Admin media upload API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
