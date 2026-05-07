import { NextRequest, NextResponse } from 'next/server';
import { createPreviewToken, getAdminPageById, getSiteByIdOrSlug } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { resolveRepositorySite } from '@/lib/repositoryContentWorkflow';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    pageId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({ success: false, requestId, error: { code, message } }, { status })
);

const encodePath = (path: string) => (
  path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
);

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId, pageId } = await params;
    const body = await request.json().catch(() => ({})) as { ttlSeconds?: number };

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const page = await repositories.pages.getById(site.id, pageId);

      if (!page) {
        return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
      }

      const preview = await repositories.contentWorkflows.createPreviewToken({
        siteId: site.id,
        targetType: 'page',
        targetId: page.id,
        ttlSeconds: body.ttlSeconds,
        createdBy: request.headers.get('x-backy-actor') || 'admin',
      });
      const origin = new URL(request.url).origin;
      const encodedToken = encodeURIComponent(preview.token);
      const encodedSlug = encodePath(page.slug || 'index');
      const hostedPath = page.slug === 'index' || !page.slug ? '' : `/${encodedSlug}`;
      const hostedUrl = `${origin}/sites/${encodeURIComponent(site.slug || site.id)}${hostedPath}?previewToken=${encodedToken}`;
      const renderUrl = `${origin}/api/sites/${encodeURIComponent(site.slug || site.id)}/render?path=/${encodedSlug}&previewToken=${encodedToken}`;
      const pageApiUrl = `${origin}/api/sites/${encodeURIComponent(site.slug || site.id)}/pages?slug=${encodedSlug}&previewToken=${encodedToken}`;

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          previewToken: preview.token,
          expiresAt: preview.expiresAt,
          targetType: preview.targetType,
          targetId: preview.targetId,
          hostedUrl,
          renderUrl,
          pageApiUrl,
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

    const preview = createPreviewToken(
      site.id,
      'page',
      page.id,
      body.ttlSeconds,
      request.headers.get('x-backy-actor') || 'admin',
    );
    const origin = new URL(request.url).origin;
    const encodedToken = encodeURIComponent(preview.token);
    const encodedSlug = encodePath(page.slug || 'index');
    const hostedPath = page.slug === 'index' || !page.slug ? '' : `/${encodedSlug}`;
    const hostedUrl = `${origin}/sites/${encodeURIComponent(site.slug || site.id)}${hostedPath}?previewToken=${encodedToken}`;
    const renderUrl = `${origin}/api/sites/${encodeURIComponent(site.slug || site.id)}/render?path=/${encodedSlug}&previewToken=${encodedToken}`;
    const pageApiUrl = `${origin}/api/sites/${encodeURIComponent(site.slug || site.id)}/pages?slug=${encodedSlug}&previewToken=${encodedToken}`;

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        previewToken: preview.token,
        expiresAt: preview.expiresAt,
        targetType: preview.targetType,
        targetId: preview.targetId,
        hostedUrl,
        renderUrl,
        pageApiUrl,
      },
    });
  } catch (error) {
    console.error('Admin page preview API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
