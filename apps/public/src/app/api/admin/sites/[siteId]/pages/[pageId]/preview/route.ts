import { customFrontendPreviewUrl } from '@/lib/customFrontendPreview';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { createPreviewToken, getAdminPageById, getPageByPath, getPageSummary, getSiteByIdOrSlug } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { resolveRepositorySite } from '@/lib/repositoryContentWorkflow';
import { getRepositoryPageByPublicPath } from '@/lib/repositoryPages';
import { PAGE_HIERARCHY_MAX_DEPTH, pageHierarchyPath, type PageHierarchyNode } from '@/lib/pageHierarchy';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    pageId: string;
  }>;
}

// Preview URLs contain a bearer token and must never enter shared or browser caches.
const privatePreviewResponse = (response: NextResponse) => {
  response.headers.set('cache-control', 'private, no-store');
  return response;
};
const privatePreviewJson = (body: unknown, init?: ResponseInit) => (
  privatePreviewResponse(NextResponse.json(body, init))
);

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  privatePreviewJson({ success: false, requestId, error: { code, message } }, { status })
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
  publicPath: string,
  encodedToken: string,
) => {
  const publicSlug = publicPath === '/' ? 'index' : publicPath.slice(1);
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

const repositoryPreviewPath = async (
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  siteId: string,
  page: PageHierarchyNode,
): Promise<string | null> => {
  const byId = new Map<string, PageHierarchyNode>([[page.id, page]]);
  let current = page;
  for (let depth = 0; current.parentId && depth < PAGE_HIERARCHY_MAX_DEPTH; depth++) {
    const parentId = current.parentId;
    if (byId.has(parentId)) return null;
    const parent = await repositories.pages.getById(siteId, parentId);
    if (!parent || parent.id !== parentId || parent.siteId !== siteId) return null;
    byId.set(parent.id, parent);
    current = parent;
  }
  const path = pageHierarchyPath(page, siteId, byId);
  // Reuse the public resolver's collision/homepage rules before minting a bearer.
  return path && (await getRepositoryPageByPublicPath(repositories, siteId, path))?.id === page.id ? path : null;
};

const demoPreviewPath = (siteId: string, pageId: string): string | null => {
  const pages = getPageSummary(siteId, { includeUnpublished: true });
  const byId = new Map<string, PageHierarchyNode | null>();
  for (const page of pages) byId.set(page.id, byId.has(page.id) ? null : page);
  const page = byId.get(pageId);
  const path = page ? pageHierarchyPath(page, siteId, byId) : null;
  return path && getPageByPath(siteId, path, { includeUnpublished: true })?.id === pageId ? path : null;
};

const previewActorId = (access: Exclude<Awaited<ReturnType<typeof requireAdminAccess>>, NextResponse>) => (
  access.session?.user.id || (access.type === 'api-key' ? 'admin-api-key' : 'admin')
);

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.publish' });
  if (access instanceof NextResponse) {
    return privatePreviewResponse(access);
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

      if (!page || page.id !== pageId || page.siteId !== site.id) {
        return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
      }

      const publicPath = await repositoryPreviewPath(repositories, site.id, page);
      if (!publicPath) {
        return errorResponse(409, 'PAGE_HIERARCHY_INVALID', 'Page hierarchy is unavailable or ambiguous', requestId);
      }

      const actorId = previewActorId(access);
      const preview = await repositories.contentWorkflows.createPreviewToken({
        siteId: site.id,
        targetType: 'page',
        targetId: page.id,
        ttlSeconds: body.ttlSeconds,
        createdBy: actorId,
      });
      const origin = new URL(request.url).origin;
      const encodedToken = encodeURIComponent(preview.token);
      const previewUrls = previewUrlsForPage(origin, site.slug || site.id, publicPath, encodedToken);

      await recordAdminAudit({
        repositories,
        siteId: site.id,
        actorId,
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
          createdBy: actorId,
          tokenStored: false,
        },
        requestId,
      });

      return privatePreviewJson({
        success: true,
        requestId,
        data: {
          previewToken: preview.token,
          expiresAt: preview.expiresAt,
          targetType: preview.targetType,
          targetId: preview.targetId,
          hostedUrl: previewUrls.hostedUrl,
          customFrontendUrl: customFrontendPreviewUrl(site, page.status, encodePath(publicPath), preview.token),
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
    if (!page || page.id !== pageId || page.siteId !== site.id) {
      return errorResponse(404, 'PAGE_NOT_FOUND', 'Page not found', requestId);
    }

    const publicPath = demoPreviewPath(site.id, page.id);
    if (!publicPath) {
      return errorResponse(409, 'PAGE_HIERARCHY_INVALID', 'Page hierarchy is unavailable or ambiguous', requestId);
    }

    const actorId = previewActorId(access);
    const preview = createPreviewToken(
      site.id,
      'page',
      page.id,
      body.ttlSeconds,
      actorId,
    );
    const origin = new URL(request.url).origin;
    const encodedToken = encodeURIComponent(preview.token);
    const previewUrls = previewUrlsForPage(origin, site.slug || site.id, publicPath, encodedToken);

    await recordAdminAudit({
      siteId: site.id,
      actorId,
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
        createdBy: actorId,
        tokenStored: false,
      },
      requestId,
    });

    return privatePreviewJson({
      success: true,
      requestId,
      data: {
        previewToken: preview.token,
        expiresAt: preview.expiresAt,
        targetType: preview.targetType,
        targetId: preview.targetId,
        hostedUrl: previewUrls.hostedUrl,
        customFrontendUrl: customFrontendPreviewUrl(site, page.status, encodePath(publicPath), preview.token),
        renderUrl: previewUrls.renderUrl,
        pageApiUrl: previewUrls.pageApiUrl,
      },
    });
  } catch (error) {
    console.error('Admin page preview API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
