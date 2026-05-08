/**
 * Admin blog category detail endpoint.
 *
 * GET    /api/admin/sites/[siteId]/blog/categories/[categoryId]
 * PATCH  /api/admin/sites/[siteId]/blog/categories/[categoryId]
 * DELETE /api/admin/sites/[siteId]/blog/categories/[categoryId]
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  deleteAdminBlogCategory,
  getBlogCategoryByIdOrSlug,
  getSiteByIdOrSlug,
  updateAdminBlogCategory,
} from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { resolveRepositorySite } from '@/lib/repositoryContentWorkflow';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    categoryId: string;
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
    const { siteId, categoryId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const category = await repositories.blogTaxonomy.getCategoryByIdOrSlug(site.id, categoryId);

      if (!category) {
        return errorResponse(404, 'CATEGORY_NOT_FOUND', 'Category not found', requestId);
      }

      return NextResponse.json({ success: true, requestId, data: { category } });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const category = getBlogCategoryByIdOrSlug(site.id, categoryId);

    if (!category) {
      return errorResponse(404, 'CATEGORY_NOT_FOUND', 'Category not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        category,
      },
    });
  } catch (error) {
    console.error('Admin blog category detail API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, categoryId } = await params;
    const body = await parseJsonBody(request);
    const nextSlug = body.slug === undefined ? '' : normalizeSlug(body.slug);

    if (body.slug !== undefined && !nextSlug) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Category slug is required', requestId);
    }

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const category = await repositories.blogTaxonomy.getCategoryByIdOrSlug(site.id, categoryId);

      if (!category) {
        return errorResponse(404, 'CATEGORY_NOT_FOUND', 'Category not found', requestId);
      }

      if (nextSlug && nextSlug !== category.slug) {
        const conflict = await repositories.blogTaxonomy.getCategoryByIdOrSlug(site.id, nextSlug);
        if (conflict && conflict.id !== category.id) {
          return errorResponse(409, 'SLUG_CONFLICT', 'A category with this slug already exists', requestId);
        }
      }

      const updated = await repositories.blogTaxonomy.updateCategory(site.id, category.id, {
        name: typeof body.name === 'string' ? body.name : undefined,
        slug: nextSlug || undefined,
        description: typeof body.description === 'string' || body.description === null ? body.description : undefined,
        color: typeof body.color === 'string' || body.color === null ? body.color : undefined,
        sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : undefined,
      });
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'blogCategory',
        entityId: updated.item.id,
        reason: 'blog-category-updated',
        requestId,
      });

      return NextResponse.json({ success: true, requestId, data: { category: updated.item, cacheInvalidation } });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const category = getBlogCategoryByIdOrSlug(site.id, categoryId);

    if (!category) {
      return errorResponse(404, 'CATEGORY_NOT_FOUND', 'Category not found', requestId);
    }

    if (nextSlug && nextSlug !== category.slug) {
      const conflict = getBlogCategoryByIdOrSlug(site.id, nextSlug);
      if (conflict && conflict.id !== category.id) {
        return errorResponse(409, 'SLUG_CONFLICT', 'A category with this slug already exists', requestId);
      }
    }

    const updated = updateAdminBlogCategory(site.id, category.id, {
      ...body,
      ...(nextSlug ? { slug: nextSlug } : {}),
    });

    if (!updated) {
      return errorResponse(404, 'CATEGORY_NOT_FOUND', 'Category not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        category: updated,
      },
    });
  } catch (error) {
    console.error('Admin blog category update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, categoryId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const category = await repositories.blogTaxonomy.getCategoryByIdOrSlug(site.id, categoryId);

      if (!category) {
        return errorResponse(404, 'CATEGORY_NOT_FOUND', 'Category not found', requestId);
      }

      const deleted = await repositories.blogTaxonomy.deleteCategory(site.id, category.id);

      if (!deleted) {
        return errorResponse(404, 'CATEGORY_NOT_FOUND', 'Category not found', requestId);
      }
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'blogCategory',
        entityId: category.id,
        reason: 'blog-category-deleted',
        requestId,
      });

      return NextResponse.json({ success: true, requestId, data: { deleted: true, categoryId: category.id, cacheInvalidation } });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const category = getBlogCategoryByIdOrSlug(site.id, categoryId);

    if (!category) {
      return errorResponse(404, 'CATEGORY_NOT_FOUND', 'Category not found', requestId);
    }

    const deleted = deleteAdminBlogCategory(site.id, category.id);

    if (!deleted) {
      return errorResponse(404, 'CATEGORY_NOT_FOUND', 'Category not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        deleted: true,
        categoryId: category.id,
      },
    });
  } catch (error) {
    console.error('Admin blog category delete API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
