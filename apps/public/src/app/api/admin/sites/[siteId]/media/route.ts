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
import { createMediaItem, getAdminSettings, getMediaList, getSiteByIdOrSlug, listMediaFolders } from '@/lib/backyStore';
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
import { isUploadAllowedByFileType, mediaQuotaPayload, resolveMediaUploadPolicy } from '@/lib/mediaUploadPolicy';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { DEFAULT_SITE_SETTINGS, type MediaItem } from '@backy-cms/core';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

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

const toRecord = <TRecord extends Record<string, unknown>>(value: unknown): TRecord | undefined => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as TRecord
    : undefined
);

const readMediaBillingPolicy = (siteSettings: unknown, workspaceSettings: unknown) => {
  const siteRoot = toRecord<Record<string, unknown>>(siteSettings) || {};
  const workspaceRoot = toRecord<Record<string, unknown>>(workspaceSettings) || {};
  const integrations = toRecord<Record<string, unknown>>(workspaceRoot.integrations) || {};
  const commerce = toRecord<Record<string, unknown>>(integrations.commerce) || {};
  const billingQuota = toRecord<Record<string, unknown>>(siteRoot.billingQuota) || {};
  const limits = toRecord<Record<string, unknown>>(billingQuota.limits) || {};
  const mediaGb = Number(limits.mediaGb);

  return {
    overageMode: typeof commerce.overageMode === 'string' ? commerce.overageMode : 'warn',
    mediaLimitGb: Number.isFinite(mediaGb) && mediaGb >= 0
      ? mediaGb
      : DEFAULT_SITE_SETTINGS.billingQuota.limits.mediaGb,
    billingPlan: typeof billingQuota.plan === 'string'
      ? billingQuota.plan
      : DEFAULT_SITE_SETTINGS.billingQuota.plan,
  };
};

const enforceMediaBillingLimit = (
  siteSettings: unknown,
  workspaceSettings: unknown,
  nextUsageBytes: number,
  currentUsageBytes: number,
  requestId: string,
) => {
  const policy = readMediaBillingPolicy(siteSettings, workspaceSettings);
  const limitBytes = Math.floor(policy.mediaLimitGb * 1024 * 1024 * 1024);
  if (policy.overageMode === 'block' && nextUsageBytes > limitBytes) {
    return errorResponse(
      402,
      'BILLING_MEDIA_LIMIT',
      `The ${policy.billingPlan} site plan allows ${policy.mediaLimitGb} GB of media storage. Update the site billing quota before uploading another asset.`,
      requestId,
      mediaQuotaPayload(limitBytes, currentUsageBytes),
    );
  }

  return null;
};

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
  const access = await requireAdminAccess(request, requestId, { permission: 'media.view' });
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
      const settings = await repositories.settings.get();
      const uploadPolicy = resolveMediaUploadPolicy(settings);

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          ...payload,
          quota: mediaQuotaPayload(uploadPolicy.quotaBytes, mediaUsageBytes(allMedia), uploadPolicy),
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

    const uploadPolicy = resolveMediaUploadPolicy(getAdminSettings());

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        ...payload,
        quota: mediaQuotaPayload(uploadPolicy.quotaBytes, mediaUsageBytes(getMediaList(site.id, {
          limit: 10000,
          offset: 0,
        }).media), uploadPolicy),
      },
    });
  } catch (error) {
    console.error('Admin media list API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'media.create' });
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

    const originalName = file.name || 'upload.bin';
    const mimeType = file.type || 'application/octet-stream';
    const extension = extname(originalName).toLowerCase();
    const mediaType = getMediaType(mimeType, originalName);
    const settings = repositories ? await repositories.settings.get() : getAdminSettings();
    const uploadPolicy = resolveMediaUploadPolicy(settings);

    if (file.size > uploadPolicy.maxUploadBytes) {
      return errorResponse(
        413,
        'FILE_TOO_LARGE',
        `Uploaded file exceeds the configured ${Math.floor(uploadPolicy.maxUploadBytes / (1024 * 1024))} MB limit.`,
        requestId,
        { maxUploadBytes: uploadPolicy.maxUploadBytes },
      );
    }

    if (!isUploadAllowedByFileType(uploadPolicy, { filename: originalName, mimeType })) {
      return errorResponse(
        415,
        'FILE_TYPE_NOT_ALLOWED',
        'Uploaded file type is not allowed by the configured storage policy.',
        requestId,
        {
          allowedFileTypes: uploadPolicy.allowedFileTypes,
          mimeType,
          extension,
        },
      );
    }

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
    const nextUsageBytes = currentUsageBytes + file.size;
    const billingLimitError = enforceMediaBillingLimit(
      site.settings,
      settings,
      nextUsageBytes,
      currentUsageBytes,
      requestId,
    );
    if (billingLimitError) {
      return billingLimitError;
    }

    if (nextUsageBytes > siteMediaQuotaBytes) {
      return errorResponse(
        413,
        'SITE_MEDIA_QUOTA_EXCEEDED',
        'Uploading this file would exceed the site media storage quota.',
        requestId,
        mediaQuotaPayload(siteMediaQuotaBytes, currentUsageBytes, uploadPolicy),
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
