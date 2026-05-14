import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { createPreviewToken, getAdminPageById, getSiteByIdOrSlug } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { resolveRepositorySite } from '@/lib/repositoryContentWorkflow';
import { repositoryPagePublicPath, repositoryPagePublicSlug } from '@/lib/repositoryPages';

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

const previewUrlsForPage = (
  origin: string,
  siteIdentifier: string,
  page: { slug: string; isHomepage?: boolean },
  encodedToken: string,
) => {
  const publicSlug = repositoryPagePublicSlug({ ...page, isHomepage: page.isHomepage === true });
  const publicPath = repositoryPagePublicPath({ ...page, isHomepage: page.isHomepage === true });
  const encodedSlug = encodePath(publicSlug);
  const encodedPath = encodePath(publicPath);
  const hostedPath = publicPath === '/' ? '' : encodedPath;

  return {
    publicSlug,
    publicPath,
    hostedPath,
    hostedUrl: `${origin}/sites/${encodeURIComponent(siteIdentifier)}${hostedPath}?previewToken=${encodedToken}`,
    renderUrl: `${origin}/api/sites/${encodeURIComponent(siteIdentifier)}/render?path=${encodedPath}&previewToken=${encodedToken}`,
    pageApiUrl: `${origin}/api/sites/${encodeURIComponent(siteIdentifier)}/pages?slug=${encodedSlug}&previewToken=${encodedToken}`,
  };
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.publish' });
  if (access instanceof NextResponse) {
    return access;
  }

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
      const previewUrls = previewUrlsForPage(origin, site.slug || site.id, page, encodedToken);

      await recordAdminAudit({
        repositories,
        siteId: site.id,
        actorId: access.session?.user.id || request.headers.get('x-backy-actor') || 'admin-api',
        entity: 'page',
        entityId: page.id,
        action: 'previewToken.create',
        metadata: {
          targetType: preview.targetType,
          targetId: preview.targetId,
          slug: page.slug || 'index',
          ttlSeconds: body.ttlSeconds || null,
          expiresAt: preview.expiresAt,
          publicPath: previewUrls.publicPath,
          hostedPath: `/sites/${encodeURIComponent(site.slug || site.id)}${previewUrls.hostedPath}`,
          renderPath: `/api/sites/${encodeURIComponent(site.slug || site.id)}/render?path=${encodePath(previewUrls.publicPath)}`,
          pageApiPath: `/api/sites/${encodeURIComponent(site.slug || site.id)}/pages?slug=${encodePath(previewUrls.publicSlug)}`,
          tokenStored: false,
        },
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          previewToken: preview.token,
          expiresAt: preview.expiresAt,
          targetType: preview.targetType,
          targetId: preview.targetId,
          hostedUrl: previewUrls.hostedUrl,
          renderUrl: previewUrls.renderUrl,
          pageApiUrl: previewUrls.pageApiUrl,
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
    const previewUrls = previewUrlsForPage(origin, site.slug || site.id, page, encodedToken);

    await recordAdminAudit({
      siteId: site.id,
      actorId: access.session?.user.id || request.headers.get('x-backy-actor') || 'admin-api',
      entity: 'page',
      entityId: page.id,
      action: 'previewToken.create',
      metadata: {
        targetType: preview.targetType,
        targetId: preview.targetId,
        slug: page.slug || 'index',
        ttlSeconds: body.ttlSeconds || null,
        expiresAt: preview.expiresAt,
        publicPath: previewUrls.publicPath,
        hostedPath: `/sites/${encodeURIComponent(site.slug || site.id)}${previewUrls.hostedPath}`,
        renderPath: `/api/sites/${encodeURIComponent(site.slug || site.id)}/render?path=${encodePath(previewUrls.publicPath)}`,
        pageApiPath: `/api/sites/${encodeURIComponent(site.slug || site.id)}/pages?slug=${encodePath(previewUrls.publicSlug)}`,
        tokenStored: false,
      },
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        previewToken: preview.token,
        expiresAt: preview.expiresAt,
        targetType: preview.targetType,
        targetId: preview.targetId,
        hostedUrl: previewUrls.hostedUrl,
        renderUrl: previewUrls.renderUrl,
        pageApiUrl: previewUrls.pageApiUrl,
      },
    });
  } catch (error) {
    console.error('Admin page preview API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
