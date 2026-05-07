/**
 * Admin media binding endpoint.
 *
 * POST /api/admin/sites/[siteId]/media/[mediaId]/bind
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getAdminBlogPostById,
  getAdminPageById,
  getMediaById,
  getSiteByIdOrSlug,
  updateMediaItem,
} from '@/lib/backyStore';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    mediaId: string;
  }>;
}

interface BindingRecord {
  id: string;
  mediaId: string;
  scope: 'page' | 'post';
  targetId: string;
  usageType: string;
  attachedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string, details?: unknown) => (
  NextResponse.json({ success: false, requestId, error: { code, message, details } }, { status })
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

const sanitizeString = (value: unknown) => (
  typeof value === 'string' ? value.trim() : ''
);

const toBindingRecords = (value: unknown): BindingRecord[] => (
  Array.isArray(value)
    ? value.filter((item): item is BindingRecord => (
        item &&
        typeof item === 'object' &&
        ('targetId' in item) &&
        ('scope' in item)
      ))
    : []
);

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, mediaId } = await params;
    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const media = getMediaById(site.id, mediaId);
    if (!media) {
      return errorResponse(404, 'MEDIA_NOT_FOUND', 'Media item not found', requestId);
    }

    const body = await parseJsonBody(request);
    const targetType = sanitizeString(body.targetType);
    const targetId = sanitizeString(body.targetId);
    const action = sanitizeString(body.action) || 'bind';
    const usageType = sanitizeString(body.usageType) || 'content';
    const attachedBy = sanitizeString(body.attachedBy) || 'admin';

    if (targetType !== 'page' && targetType !== 'post') {
      return errorResponse(400, 'VALIDATION_ERROR', 'targetType must be page or post', requestId);
    }

    if (!targetId) {
      return errorResponse(400, 'VALIDATION_ERROR', 'targetId is required', requestId);
    }

    const targetExists = targetType === 'page'
      ? !!getAdminPageById(site.id, targetId)
      : !!getAdminBlogPostById(site.id, targetId);

    if (!targetExists) {
      return errorResponse(404, 'TARGET_NOT_FOUND', `${targetType === 'page' ? 'Page' : 'Post'} not found`, requestId);
    }

    if (action !== 'bind' && action !== 'unbind') {
      return errorResponse(400, 'VALIDATION_ERROR', 'action must be bind or unbind', requestId);
    }

    const now = new Date().toISOString();
    const key = targetType === 'page' ? 'pageIds' : 'postIds';
    const nextPageIds = new Set(media.pageIds || []);
    const nextPostIds = new Set(media.postIds || []);
    let bindings = toBindingRecords(media.metadata?.bindings);

    if (action === 'bind') {
      if (targetType === 'page') {
        nextPageIds.add(targetId);
      } else {
        nextPostIds.add(targetId);
      }

      const existingIndex = bindings.findIndex((binding) => binding.scope === targetType && binding.targetId === targetId);
      const nextBinding: BindingRecord = {
        id: existingIndex >= 0 ? bindings[existingIndex].id : `binding_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        mediaId,
        scope: targetType,
        targetId,
        usageType,
        attachedBy,
        createdAt: existingIndex >= 0 ? bindings[existingIndex].createdAt : now,
        updatedAt: now,
      };

      bindings = existingIndex >= 0
        ? bindings.map((binding, index) => (index === existingIndex ? nextBinding : binding))
        : [...bindings, nextBinding];
    } else {
      if (targetType === 'page') {
        nextPageIds.delete(targetId);
      } else {
        nextPostIds.delete(targetId);
      }
      bindings = bindings.filter((binding) => !(binding.scope === targetType && binding.targetId === targetId));
    }

    const updated = updateMediaItem(site.id, media.id, {
      pageIds: [...nextPageIds],
      postIds: [...nextPostIds],
      metadata: {
        bindings,
      },
    });

    if (!updated) {
      return errorResponse(404, 'MEDIA_NOT_FOUND', 'Media item not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        media: updated,
        binding: action === 'bind'
          ? bindings.find((binding) => binding.scope === targetType && binding.targetId === targetId) || null
          : null,
        target: {
          type: targetType,
          id: targetId,
          bound: action === 'bind',
          referenceKey: key,
        },
      },
    });
  } catch (error) {
    console.error('Admin media bind API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
