/**
 * Admin pages endpoint.
 *
 * GET  /api/admin/sites/[siteId]/pages
 * POST /api/admin/sites/[siteId]/pages
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  canvasElementsToBackyContentDocument,
  isBackyContentDocument,
  type BackyContentDocument,
  type BackyPage,
} from '@backy-cms/core';
import {
  createAdminPage,
  getPageBySlug,
  getPageSummary,
  getSiteByIdOrSlug,
  listCollections,
} from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { findPageRouteConflict } from '@/lib/routeConflicts';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';
import { seedInputFromFrontendDesignTemplate } from '@/lib/frontendDesignContract';

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

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const statusFromInput = (value: unknown): 'draft' | 'published' | 'scheduled' | 'archived' => (
  value === 'published' || value === 'scheduled' || value === 'archived' ? value : 'draft'
);

const contentElementsFromInput = (rawContent: unknown): unknown[] => {
  if (isRecord(rawContent) && Array.isArray(rawContent.elements)) {
    return rawContent.elements;
  }

  return Array.isArray(rawContent) ? rawContent : [];
};

const contentDocumentFromInput = (
  rawContent: unknown,
  input: {
    id: string;
    title: string;
    slug: string;
    status: 'draft' | 'published' | 'scheduled' | 'archived';
  },
): BackyContentDocument => {
  if (isBackyContentDocument(rawContent)) {
    return rawContent;
  }
  if (isRecord(rawContent) && isBackyContentDocument(rawContent.contentDocument)) {
    return rawContent.contentDocument;
  }

  return canvasElementsToBackyContentDocument({
    id: input.id,
    kind: 'page',
    title: input.title,
    slug: input.slug,
    status: input.status,
    elements: contentElementsFromInput(rawContent),
    canvasSize: isRecord(rawContent) ? rawContent.canvasSize : undefined,
    customCSS: isRecord(rawContent) && typeof rawContent.customCSS === 'string' ? rawContent.customCSS : undefined,
  });
};

const adminPageFromRepositoryPage = (page: BackyPage, includeContent = true) => {
  const base = {
    ...page,
    content: undefined,
  };
  if (!includeContent) {
    const { content, ...summary } = base;
    void content;
    return summary;
  }
  const canvasSize = isRecord(page.content.metadata?.canvasSize)
    ? page.content.metadata.canvasSize
    : { width: 1200, height: 900 };
  return {
    ...page,
    content: {
      elements: page.content.elements,
      canvasSize,
      customCSS: typeof page.content.metadata?.customCSS === 'string' ? page.content.metadata.customCSS : undefined,
      contentDocument: page.content,
    },
  };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const includeUnpublished = searchParams.get('includeUnpublished') !== 'false';
      const result = await repositories.pages.list({
        siteId: site.id,
        includeUnpublished,
        status: includeUnpublished ? 'all' : 'published',
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          pages: result.items.map((page) => adminPageFromRepositoryPage(page, false)),
          pagination: result.pagination,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const includeUnpublished = searchParams.get('includeUnpublished') !== 'false';
    const pages = getPageSummary(site.id, { includeUnpublished });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        pages,
        pagination: {
          total: pages.length,
          limit: pages.length,
          offset: 0,
          hasMore: false,
        },
      },
    });
  } catch (error) {
    console.error('Admin pages list API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const body = await parseJsonBody(request);
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const slug = normalizeSlug(body.slug || title);
      const status = statusFromInput(body.status);

      if (!title) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Page title is required', requestId);
      }
      if (!slug) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Page slug is required', requestId);
      }

      const slugCheck = await repositories.pages.checkSlug({ siteId: site.id, slug });
      if (!slugCheck.available) {
        return errorResponse(409, 'SLUG_CONFLICT', 'A page with this slug already exists', requestId);
      }

      const collections = await repositories.collections.list({
        siteId: site.id,
        includeUnpublished: true,
        status: 'all',
        limit: 100,
        offset: 0,
      });
      const routeConflict = findPageRouteConflict({ slug, title }, collections.items);
      if (routeConflict) {
        return errorResponse(409, 'ROUTE_CONFLICT', routeConflict.message, requestId);
      }

      const seeded = seedInputFromFrontendDesignTemplate({
        siteSettings: site.settings,
        body,
        templateType: 'page',
        kind: 'page',
        title,
        description: typeof body.description === 'string' ? body.description : null,
      });

      if (!seeded.ok) {
        return errorResponse(400, seeded.code, seeded.message, requestId);
      }

      const createBody = seeded.body;
      const pageId = typeof createBody.id === 'string' && createBody.id.trim().length > 0 ? createBody.id.trim() : `page_${slug}`;
      const created = await repositories.pages.create({
        siteId: site.id,
        title,
        slug,
        description: typeof createBody.description === 'string' ? createBody.description : null,
        status,
        scheduledAt: typeof createBody.scheduledAt === 'string' ? createBody.scheduledAt : null,
        isHomepage: typeof createBody.isHomepage === 'boolean' ? createBody.isHomepage : false,
        parentId: typeof createBody.parentId === 'string' ? createBody.parentId : null,
        content: contentDocumentFromInput(createBody.content, { id: pageId, title, slug, status }),
        meta: isRecord(createBody.meta) ? createBody.meta : undefined,
      });
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'page',
        entityId: created.item.id,
        reason: 'page-created',
        requestId,
      });

      return NextResponse.json(
        {
          success: true,
          requestId,
          data: {
            page: adminPageFromRepositoryPage(created.item),
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

    const body = await parseJsonBody(request);
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const slug = normalizeSlug(body.slug || title);

    if (!title) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Page title is required', requestId);
    }

    if (!slug) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Page slug is required', requestId);
    }

    if (getPageBySlug(site.id, slug, { includeUnpublished: true })) {
      return errorResponse(409, 'SLUG_CONFLICT', 'A page with this slug already exists', requestId);
    }

    const routeConflict = findPageRouteConflict({ slug, title }, listCollections(site.id, { includeUnpublished: true }));
    if (routeConflict) {
      return errorResponse(409, 'ROUTE_CONFLICT', routeConflict.message, requestId);
    }

    const seeded = seedInputFromFrontendDesignTemplate({
      siteSettings: site.settings,
      body,
      templateType: 'page',
      kind: 'page',
      title,
      description: typeof body.description === 'string' ? body.description : null,
    });

    if (!seeded.ok) {
      return errorResponse(400, seeded.code, seeded.message, requestId);
    }

    const page = createAdminPage(site.id, {
      ...seeded.body,
      title,
      slug,
    });

    return NextResponse.json(
      {
        success: true,
        requestId,
        data: {
          page,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Admin page create API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
