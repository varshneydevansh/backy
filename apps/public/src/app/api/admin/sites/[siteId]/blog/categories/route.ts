/**
 * Admin blog categories endpoint.
 *
 * GET  /api/admin/sites/[siteId]/blog/categories
 * POST /api/admin/sites/[siteId]/blog/categories
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminBlogCategory,
  getBlogCategoryByIdOrSlug,
  getSiteByIdOrSlug,
  listBlogCategories,
} from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { resolveRepositorySite } from '@/lib/repositoryContentWorkflow';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
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
    const { siteId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          categories: await repositories.blogTaxonomy.listCategories(site.id),
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        categories: listBlogCategories(site.id),
      },
    });
  } catch (error) {
    console.error('Admin blog categories list API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const body = await parseJsonBody(request);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const slug = normalizeSlug(body.slug || name);

    if (!name) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Category name is required', requestId);
    }

    if (!slug) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Category slug is required', requestId);
    }

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      if (await repositories.blogTaxonomy.getCategoryByIdOrSlug(site.id, slug)) {
        return errorResponse(409, 'SLUG_CONFLICT', 'A category with this slug already exists', requestId);
      }

      const created = await repositories.blogTaxonomy.createCategory({
        siteId: site.id,
        name,
        slug,
        description: typeof body.description === 'string' || body.description === null ? body.description : undefined,
        color: typeof body.color === 'string' || body.color === null ? body.color : undefined,
        sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : undefined,
      });
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'blogCategory',
        entityId: created.item.id,
        reason: 'blog-category-created',
        requestId,
      });

      return NextResponse.json(
        {
          success: true,
          requestId,
          data: {
            category: created.item,
            cacheInvalidation,
          },
        },
        { status: 201 },
      );
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    if (getBlogCategoryByIdOrSlug(site.id, slug)) {
      return errorResponse(409, 'SLUG_CONFLICT', 'A category with this slug already exists', requestId);
    }

    const category = createAdminBlogCategory(site.id, {
      ...body,
      name,
      slug,
    });

    return NextResponse.json(
      {
        success: true,
        requestId,
        data: {
          category,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Admin blog category create API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
