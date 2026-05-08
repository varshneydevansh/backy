/**
 * Admin blog tag detail endpoint.
 *
 * GET    /api/admin/sites/[siteId]/blog/tags/[tagId]
 * PATCH  /api/admin/sites/[siteId]/blog/tags/[tagId]
 * DELETE /api/admin/sites/[siteId]/blog/tags/[tagId]
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  deleteAdminBlogTag,
  getBlogTagByIdOrSlug,
  getSiteByIdOrSlug,
  updateAdminBlogTag,
} from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { resolveRepositorySite } from '@/lib/repositoryContentWorkflow';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    tagId: string;
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

const normalizeSlug = (value: unknown): string => (
  typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    : ''
);

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, tagId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const tag = await repositories.blogTaxonomy.getTagByIdOrSlug(site.id, tagId);

      if (!tag) {
        return errorResponse(404, 'TAG_NOT_FOUND', 'Tag not found', requestId);
      }

      return NextResponse.json({ success: true, requestId, data: { tag } });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const tag = getBlogTagByIdOrSlug(site.id, tagId);

    if (!tag) {
      return errorResponse(404, 'TAG_NOT_FOUND', 'Tag not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        tag,
      },
    });
  } catch (error) {
    console.error('Admin blog tag detail API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, tagId } = await params;
    const body = await parseJsonBody(request);
    const nextSlug = body.slug === undefined ? '' : normalizeSlug(body.slug);

    if (body.slug !== undefined && !nextSlug) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Tag slug is required', requestId);
    }

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const tag = await repositories.blogTaxonomy.getTagByIdOrSlug(site.id, tagId);

      if (!tag) {
        return errorResponse(404, 'TAG_NOT_FOUND', 'Tag not found', requestId);
      }

      if (nextSlug && nextSlug !== tag.slug) {
        const conflict = await repositories.blogTaxonomy.getTagByIdOrSlug(site.id, nextSlug);
        if (conflict && conflict.id !== tag.id) {
          return errorResponse(409, 'SLUG_CONFLICT', 'A tag with this slug already exists', requestId);
        }
      }

      const updated = await repositories.blogTaxonomy.updateTag(site.id, tag.id, {
        name: typeof body.name === 'string' ? body.name : undefined,
        slug: nextSlug || undefined,
        description: typeof body.description === 'string' || body.description === null ? body.description : undefined,
      });
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'blogTag',
        entityId: updated.item.id,
        reason: 'blog-tag-updated',
        requestId,
      });

      return NextResponse.json({ success: true, requestId, data: { tag: updated.item, cacheInvalidation } });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const tag = getBlogTagByIdOrSlug(site.id, tagId);

    if (!tag) {
      return errorResponse(404, 'TAG_NOT_FOUND', 'Tag not found', requestId);
    }

    if (nextSlug && nextSlug !== tag.slug) {
      const conflict = getBlogTagByIdOrSlug(site.id, nextSlug);
      if (conflict && conflict.id !== tag.id) {
        return errorResponse(409, 'SLUG_CONFLICT', 'A tag with this slug already exists', requestId);
      }
    }

    const updated = updateAdminBlogTag(site.id, tag.id, {
      ...body,
      ...(nextSlug ? { slug: nextSlug } : {}),
    });

    if (!updated) {
      return errorResponse(404, 'TAG_NOT_FOUND', 'Tag not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        tag: updated,
      },
    });
  } catch (error) {
    console.error('Admin blog tag update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, tagId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const tag = await repositories.blogTaxonomy.getTagByIdOrSlug(site.id, tagId);

      if (!tag) {
        return errorResponse(404, 'TAG_NOT_FOUND', 'Tag not found', requestId);
      }

      const deleted = await repositories.blogTaxonomy.deleteTag(site.id, tag.id);

      if (!deleted) {
        return errorResponse(404, 'TAG_NOT_FOUND', 'Tag not found', requestId);
      }
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'blogTag',
        entityId: tag.id,
        reason: 'blog-tag-deleted',
        requestId,
      });

      return NextResponse.json({ success: true, requestId, data: { deleted: true, tagId: tag.id, cacheInvalidation } });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const tag = getBlogTagByIdOrSlug(site.id, tagId);

    if (!tag) {
      return errorResponse(404, 'TAG_NOT_FOUND', 'Tag not found', requestId);
    }

    const deleted = deleteAdminBlogTag(site.id, tag.id);

    if (!deleted) {
      return errorResponse(404, 'TAG_NOT_FOUND', 'Tag not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        deleted: true,
        tagId: tag.id,
      },
    });
  } catch (error) {
    console.error('Admin blog tag delete API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
