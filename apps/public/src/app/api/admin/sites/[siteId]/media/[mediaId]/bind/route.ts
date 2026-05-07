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
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import type { MediaItem } from '@backy-cms/core';

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

const buildMediaBindingUpdate = (
  media: MediaItem,
  input: {
    mediaId: string;
    targetType: 'page' | 'post';
    targetId: string;
    action: 'bind' | 'unbind';
    usageType: string;
    attachedBy: string | null;
  },
) => {
  const now = new Date().toISOString();
  const nextPageIds = new Set(media.pageIds || []);
  const nextPostIds = new Set(media.postIds || []);
  let bindings = toBindingRecords(media.metadata?.bindings);

  if (input.action === 'bind') {
    if (input.targetType === 'page') {
      nextPageIds.add(input.targetId);
    } else {
      nextPostIds.add(input.targetId);
    }

    const existingIndex = bindings.findIndex((binding) => (
      binding.scope === input.targetType && binding.targetId === input.targetId
    ));
    const nextBinding: BindingRecord = {
      id: existingIndex >= 0 ? bindings[existingIndex].id : `binding_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      mediaId: input.mediaId,
      scope: input.targetType,
      targetId: input.targetId,
      usageType: input.usageType,
      attachedBy: input.attachedBy,
      createdAt: existingIndex >= 0 ? bindings[existingIndex].createdAt : now,
      updatedAt: now,
    };

    bindings = existingIndex >= 0
      ? bindings.map((binding, index) => (index === existingIndex ? nextBinding : binding))
      : [...bindings, nextBinding];
  } else {
    if (input.targetType === 'page') {
      nextPageIds.delete(input.targetId);
    } else {
      nextPostIds.delete(input.targetId);
    }
    bindings = bindings.filter((binding) => !(binding.scope === input.targetType && binding.targetId === input.targetId));
  }

  return {
    pageIds: [...nextPageIds],
    postIds: [...nextPostIds],
    bindings,
  };
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, mediaId } = await params;
    const repositories = !shouldUseDemoStoreFallback() ? await getRequiredDatabaseRepositories() : null;
    const repositorySite = repositories ? await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId) : null;
    const site = repositorySite || getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const media = repositories
      ? await repositories.media.getById(site.id, mediaId)
      : getMediaById(site.id, mediaId);

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
      ? repositories
        ? !!await repositories.pages.getById(site.id, targetId)
        : !!getAdminPageById(site.id, targetId)
      : repositories
        ? !!await repositories.posts.getById(site.id, targetId)
        : !!getAdminBlogPostById(site.id, targetId);

    if (!targetExists) {
      return errorResponse(404, 'TARGET_NOT_FOUND', `${targetType === 'page' ? 'Page' : 'Post'} not found`, requestId);
    }

    if (action !== 'bind' && action !== 'unbind') {
      return errorResponse(400, 'VALIDATION_ERROR', 'action must be bind or unbind', requestId);
    }

    const key = targetType === 'page' ? 'pageIds' : 'postIds';
    const bindingUpdate = buildMediaBindingUpdate(media, {
      mediaId,
      targetType,
      targetId,
      action: action as 'bind' | 'unbind',
      usageType,
      attachedBy,
    });

    const updated = repositories
      ? (await repositories.media.update(site.id, media.id, {
          metadata: {
            ...media.metadata,
            pageIds: bindingUpdate.pageIds,
            postIds: bindingUpdate.postIds,
            bindings: bindingUpdate.bindings,
          },
        })).item
      : updateMediaItem(site.id, media.id, {
          pageIds: bindingUpdate.pageIds,
          postIds: bindingUpdate.postIds,
          metadata: {
            bindings: bindingUpdate.bindings,
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
          ? bindingUpdate.bindings.find((binding) => binding.scope === targetType && binding.targetId === targetId) || null
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
