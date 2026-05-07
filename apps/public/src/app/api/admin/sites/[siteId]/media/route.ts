/**
 * Admin media endpoint.
 *
 * GET  /api/admin/sites/[siteId]/media
 * POST /api/admin/sites/[siteId]/media
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { createMediaItem, getMediaList, getSiteByIdOrSlug } from '@/lib/backyStore';
import type { MediaItem } from '@backy-cms/core';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

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

const parseScope = (value: FormDataEntryValue | null): MediaItem['scope'] => {
  if (value === 'page' || value === 'post') {
    return value;
  }

  return 'global';
};

const parseVisibility = (value: FormDataEntryValue | null): MediaItem['visibility'] => (
  value === 'private' ? 'private' : 'public'
);

const getMediaType = (mimeType: string, originalName: string): MediaItem['type'] | null => {
  const extension = extname(originalName).toLowerCase();
  return MIME_TYPE_TO_MEDIA_TYPE.find((candidate) => candidate.test(mimeType, extension))?.type ?? null;
};

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

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
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
      postId: searchParams.get('postId') || undefined,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: payload,
    });
  } catch (error) {
    console.error('Admin media list API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const site = getSiteByIdOrSlug(siteId);

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

    if (!mediaType) {
      return errorResponse(415, 'UNSUPPORTED_MEDIA_TYPE', `Unsupported file type: ${mimeType}`, requestId);
    }

    const scope = parseScope(formData.get('scope'));
    const visibility = parseVisibility(formData.get('visibility'));
    const scopeTargetId = toStringValue(formData.get('scopeTargetId'));
    const extension = extname(originalName).toLowerCase();
    const safeName = safePathSegment(extension ? originalName.slice(0, -extension.length) : originalName);
    const storedFilename = `${Date.now().toString(36)}-${safeName}${extension}`;
    const mediaFolder = mediaType === 'font' ? 'fonts' : `${mediaType}s`;
    const relativePath = `/uploads/sites/${site.id}/${mediaFolder}/${storedFilename}`;
    const absolutePath = join(process.cwd(), 'public', relativePath);
    const metadata = parseMetadata(formData.get('metadata'));

    await mkdir(join(process.cwd(), 'public', 'uploads', 'sites', site.id, mediaFolder), { recursive: true });
    await writeFile(absolutePath, Buffer.from(await file.arrayBuffer()));

    const media = createMediaItem(site.id, {
      filename: storedFilename,
      originalName,
      mimeType,
      sizeBytes: file.size,
      type: mediaType,
      url: relativePath,
      thumbnailUrl: mediaType === 'image' ? relativePath : null,
      pageIds: scope === 'page' && scopeTargetId ? [scopeTargetId] : [],
      postIds: scope === 'post' && scopeTargetId ? [scopeTargetId] : [],
      tags: toStringList(formData.get('tags')),
      metadata: {
        ...metadata,
        extension: extension.replace(/^\./, ''),
        ...(mediaType === 'font'
          ? {
              fontFamily: toStringValue(formData.get('fontFamily')) || cleanFontFamily(originalName),
              fontWeight: toStringValue(formData.get('fontWeight')) || '400',
              fontStyle: toStringValue(formData.get('fontStyle')) || 'normal',
            }
          : {}),
      },
      altText: toStringValue(formData.get('altText')),
      caption: toStringValue(formData.get('caption')),
      uploadedBy: toStringValue(formData.get('uploadedBy')) || 'admin',
      scope,
      scopeTargetId,
      visibility,
    });

    return NextResponse.json(
      {
        success: true,
        requestId,
        data: {
          media,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Admin media upload API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
