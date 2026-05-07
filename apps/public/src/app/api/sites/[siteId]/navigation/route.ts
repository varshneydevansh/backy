/**
 * Public navigation contract for custom frontends.
 *
 * GET /api/sites/[siteId]/navigation
 */

import { NextRequest, NextResponse } from 'next/server';
import type { BackyPage } from '@backy-cms/core';
import { getSiteByIdOrSlug, getSiteNavigation } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

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

const isPubliclyReadable = (item: { status: string; scheduledAt?: string | null }) => (
  item.status === 'published' && (!item.scheduledAt || new Date(item.scheduledAt).getTime() <= Date.now())
);

const canonicalPathForRepositoryPage = (page: Pick<BackyPage, 'isHomepage' | 'slug' | 'meta'>) => {
  if (page.isHomepage || page.slug === 'index') {
    return '/';
  }

  return typeof page.meta?.canonical === 'string' && page.meta.canonical.length > 0
    ? page.meta.canonical
    : `/${page.slug}`;
};

const navigationFromRepositoryPages = (pages: BackyPage[]) => ({
  primary: pages
    .filter(isPubliclyReadable)
    .map((page) => ({
      id: `nav_${page.id}`,
      type: 'page' as const,
      pageId: page.id,
      label: page.title,
      title: page.title,
      slug: page.slug,
      path: canonicalPathForRepositoryPage(page),
      status: page.status,
      isHomepage: page.isHomepage,
      children: [],
    }))
    .sort((a, b) => {
      if (a.isHomepage !== b.isHomepage) {
        return a.isHomepage ? -1 : 1;
      }

      return a.label.localeCompare(b.label) || a.path.localeCompare(b.path);
    }),
});

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site || !site.isPublished) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const pages = await repositories.pages.list({
        siteId: site.id,
        includeUnpublished: false,
        status: 'published',
        limit: 100,
        offset: 0,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          site: {
            id: site.id,
            slug: site.slug,
            name: site.name,
          },
          navigation: navigationFromRepositoryPages(pages.items),
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
        site: {
          id: site.id,
          slug: site.slug,
          name: site.name,
        },
        navigation: getSiteNavigation(site.id),
      },
    });
  } catch (error) {
    console.error('Navigation API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
