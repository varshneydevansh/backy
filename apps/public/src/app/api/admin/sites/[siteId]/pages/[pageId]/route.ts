/**
 * Admin page detail endpoint.
 *
 * GET    /api/admin/sites/[siteId]/pages/[pageId]
 * PATCH  /api/admin/sites/[siteId]/pages/[pageId]
 * DELETE /api/admin/sites/[siteId]/pages/[pageId]
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  canvasElementsToBackyContentDocument,
  isBackyContentDocument,
  type BackyContentDocument,
  type BackyPage,
} from '@backy-cms/core';
import {
  deleteAdminPage,
  getAdminPageById,
  getPageBySlug,
  getSiteByIdOrSlug,
  updateAdminPage,
} from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { pageRevisionSnapshot } from '@/lib/repositoryContentWorkflow';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    pageId: string;
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

const statusFromInput = (value: unknown): 'draft' | 'published' | 'scheduled' | 'archived' | undefined => (
  value === 'draft' || value === 'published' || value === 'scheduled' || value === 'archived' ? value : undefined
);

const contentDocumentFromInput = (
  rawContent: unknown,
  fallback: BackyPage,
  input: {
    title: string;
    slug: string;
    status: 'draft' | 'published' | 'scheduled' | 'archived';
  },
): BackyContentDocument | undefined => {
  if (rawContent === undefined) {
    return undefined;
  }
  if (isBackyContentDocument(rawContent)) {
    return rawContent;
  }
  if (isRecord(rawContent) && isBackyContentDocument(rawContent.contentDocument)) {
    return rawContent.contentDocument;
  }

  return canvasElementsToBackyContentDocument({
    id: fallback.id,
    kind: 'page',
    title: input.title,
    slug: input.slug,
    status: input.status,
    elements: isRecord(rawContent) ? rawContent : [],
    canvasSize: isRecord(rawContent) ? rawContent.canvasSize : undefined,
    customCSS: isRecord(rawContent) && typeof rawContent.customCSS === 'string' ? rawContent.customCSS : undefined,
  });
};

const adminPageFromRepositoryPage = (page: BackyPage) => {
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
    const { siteId, pageId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const page = await repositories.pages.getById(site.id, pageId);

      if (!page) {
        return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          page: adminPageFromRepositoryPage(page),
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const page = getAdminPageById(site.id, pageId);

    if (!page) {
      return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        page,
      },
    });
  } catch (error) {
    console.error('Admin page detail API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, pageId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const page = await repositories.pages.getById(site.id, pageId);

      if (!page) {
        return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
      }

      const body = await parseJsonBody(request);
      const nextSlug = body.slug === undefined ? page.slug : normalizeSlug(body.slug);

      if (body.slug !== undefined && !nextSlug) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Page slug is required', requestId);
      }

      if (nextSlug && nextSlug !== page.slug) {
        const conflict = await repositories.pages.checkSlug({ siteId: site.id, slug: nextSlug, excludePageId: page.id });
        if (!conflict.available) {
          return errorResponse(409, 'SLUG_CONFLICT', 'A page with this slug already exists', requestId);
        }
      }

      const status = statusFromInput(body.status) || page.status;
      const title = typeof body.title === 'string' ? body.title : page.title;
      const content = contentDocumentFromInput(body.content, page, { title, slug: nextSlug, status });
      await repositories.contentWorkflows.createRevision({
        siteId: site.id,
        targetType: 'page',
        targetId: page.id,
        snapshot: pageRevisionSnapshot(page),
        note: typeof body.revisionNote === 'string' && body.revisionNote.trim().length > 0
          ? body.revisionNote
          : 'Before update',
        createdBy: request.headers.get('x-backy-actor') || 'admin',
      });
      const updated = await repositories.pages.update(site.id, page.id, {
        title: body.title === undefined ? undefined : title,
        slug: body.slug === undefined ? undefined : nextSlug,
        description: typeof body.description === 'string' || body.description === null ? body.description : undefined,
        status: statusFromInput(body.status),
        scheduledAt: typeof body.scheduledAt === 'string' || body.scheduledAt === null ? body.scheduledAt : undefined,
        isHomepage: typeof body.isHomepage === 'boolean' ? body.isHomepage : undefined,
        content,
        meta: isRecord(body.meta) ? body.meta : undefined,
        revisionNote: typeof body.revisionNote === 'string' ? body.revisionNote : undefined,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          page: adminPageFromRepositoryPage(updated.item),
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const page = getAdminPageById(site.id, pageId);

    if (!page) {
      return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
    }

    const body = await parseJsonBody(request);
    const nextSlug = body.slug === undefined ? '' : normalizeSlug(body.slug);

    if (body.slug !== undefined && !nextSlug) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Page slug is required', requestId);
    }

    if (nextSlug && nextSlug !== page.slug) {
      const conflict = getPageBySlug(site.id, nextSlug, { includeUnpublished: true });
      if (conflict && conflict.id !== page.id) {
        return errorResponse(409, 'SLUG_CONFLICT', 'A page with this slug already exists', requestId);
      }
    }

    const updated = updateAdminPage(site.id, page.id, {
      ...body,
      ...(nextSlug ? { slug: nextSlug } : {}),
    });

    if (!updated) {
      return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        page: updated,
      },
    });
  } catch (error) {
    console.error('Admin page update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, pageId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      await repositories.contentWorkflows.deletePreviewTokensForTarget(site.id, 'page', pageId);
      const deleted = await repositories.pages.delete(site.id, pageId);

      if (!deleted) {
        return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          deleted: true,
          pageId,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const deleted = deleteAdminPage(site.id, pageId);

    if (!deleted) {
      return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        deleted: true,
        pageId,
      },
    });
  } catch (error) {
    console.error('Admin page delete API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
