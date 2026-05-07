/**
 * Public route resolver for custom frontends.
 *
 * GET /api/sites/[siteId]/resolve?path=/about
 */

import { NextRequest, NextResponse } from 'next/server';
import type { BackyCollectionRecord, BackyPage, Site } from '@backy-cms/core';
import { getSiteByIdOrSlug, getSiteNavigation } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { normalizeRoutePath, resolveSiteRoute } from '@/lib/routeResolver';
import { matchCollectionItemRoute } from '@/lib/collectionRoutes';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string, path?: string) => (
  NextResponse.json(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
      },
      data: path
        ? {
            route: {
              type: 'notFound',
              path,
              status: 'archived',
              canonical: path,
              params: {},
            },
          }
        : undefined,
    },
    { status },
  )
);

const isPubliclyReadable = (item: { status: string; scheduledAt?: string | null }) => (
  item.status === 'published' && (!item.scheduledAt || new Date(item.scheduledAt).getTime() <= Date.now())
);

const siteStatus = (site: Site) => (site.isPublished ? 'published' : 'draft');

const canonicalPathForRepositoryPage = (page: Pick<BackyPage, 'isHomepage' | 'slug' | 'meta'>) => {
  if (page.isHomepage || page.slug === 'index') {
    return '/';
  }

  return typeof page.meta?.canonical === 'string' && page.meta.canonical.length > 0
    ? page.meta.canonical
    : `/${page.slug}`;
};

const collectionRecordTitle = (record: BackyCollectionRecord): string => {
  const title = record.values.title;
  if (typeof title === 'string' && title.length > 0) {
    return title;
  }

  const name = record.values.name;
  if (typeof name === 'string' && name.length > 0) {
    return name;
  }

  return record.slug;
};

const repositoryNavigation = async (
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  siteId: string,
) => {
  const result = await repositories.pages.list({
    siteId,
    includeUnpublished: false,
    status: 'published',
    limit: 100,
    offset: 0,
  });

  return {
    primary: result.items
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
  };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const path = normalizeRoutePath(searchParams.get('path') || searchParams.get('slug') || '/');
    const previewToken = searchParams.get('previewToken');

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId, path);
      }

      const blogMatch = path.match(/^\/blog\/([^/]+)$/);
      if (blogMatch) {
        const slug = decodeURIComponent(blogMatch[1]);
        const post = await repositories.posts.getBySlug(site.id, slug);
        const canPreview = post && previewToken
          ? await repositories.contentWorkflows.validatePreviewToken(site.id, 'post', post.id, previewToken)
          : false;

        if (!post || (!isPubliclyReadable(post) && !canPreview)) {
          return errorResponse(404, 'ROUTE_NOT_FOUND', 'Route not found', requestId, path);
        }

        const canonical = typeof post.meta?.canonical === 'string' && post.meta.canonical.length > 0
          ? post.meta.canonical
          : `/blog/${post.slug}`;

        return NextResponse.json({
          success: true,
          requestId,
          data: {
            site: {
              id: site.id,
              slug: site.slug,
              name: site.name,
              status: siteStatus(site),
            },
            route: {
              type: 'post',
              path,
              status: post.status,
              canonical,
              params: { slug: post.slug },
              resource: {
                id: post.id,
                kind: 'post',
                title: post.title,
                slug: post.slug,
                apiUrl: `/api/sites/${site.id}/blog?slug=${encodeURIComponent(post.slug)}`,
                hostedPath: canonical,
              },
            },
            navigation: await repositoryNavigation(repositories, site.id),
          },
        });
      }

      const pagePath = path === '/' ? 'index' : path.slice(1);
      const page = await repositories.pages.getBySlug(site.id, pagePath);
      const canPreviewPage = page && previewToken
        ? await repositories.contentWorkflows.validatePreviewToken(site.id, 'page', page.id, previewToken)
        : false;
      if (!page || (!isPubliclyReadable(page) && !canPreviewPage)) {
        const collections = await repositories.collections.list({
          siteId: site.id,
          status: 'published',
          includeUnpublished: false,
          limit: 100,
          offset: 0,
        });
        const dynamicItemMatch = matchCollectionItemRoute(
          path,
          collections.items.filter((collection) => collection.status === 'published' && collection.permissions.publicRead),
        );
        if (!dynamicItemMatch) {
          return errorResponse(404, 'ROUTE_NOT_FOUND', 'Route not found', requestId, path);
        }

        const { collection, recordSlug, params, canonical } = dynamicItemMatch;
        const record = await repositories.collections.getRecordBySlug(site.id, collection.id, recordSlug);

        if (
          !record
          || collection.status !== 'published'
          || !collection.permissions.publicRead
          || !isPubliclyReadable(record)
        ) {
          return errorResponse(404, 'ROUTE_NOT_FOUND', 'Route not found', requestId, path);
        }

        return NextResponse.json({
          success: true,
          requestId,
          data: {
            site: {
              id: site.id,
              slug: site.slug,
              name: site.name,
              status: siteStatus(site),
            },
            route: {
              type: 'dynamicItem',
              path,
              status: record.status,
              canonical,
              params: {
                ...params,
                recordSlug: record.slug,
              },
              resource: {
                id: record.id,
                kind: 'dynamicItem',
                title: collectionRecordTitle(record),
                slug: record.slug,
                collectionId: collection.id,
                collectionSlug: collection.slug,
                collectionName: collection.name,
                apiUrl: `/api/sites/${site.id}/collections/${collection.id}/records?slug=${encodeURIComponent(record.slug)}`,
                renderUrl: `/api/sites/${site.id}/render?path=${encodeURIComponent(canonical)}`,
                hostedPath: canonical,
              },
            },
            navigation: await repositoryNavigation(repositories, site.id),
          },
        });
      }

      const canonical = canonicalPathForRepositoryPage(page);
      return NextResponse.json({
        success: true,
        requestId,
        data: {
          site: {
            id: site.id,
            slug: site.slug,
            name: site.name,
            status: siteStatus(site),
          },
          route: {
            type: 'page',
            path,
            status: page.status,
            canonical,
            params: {},
            resource: {
              id: page.id,
              kind: 'page',
              title: page.title,
              slug: page.slug,
              apiUrl: `/api/sites/${site.id}/pages?path=${encodeURIComponent(path)}`,
              renderUrl: `/api/sites/${site.id}/render?path=${encodeURIComponent(path)}`,
            },
          },
          navigation: await repositoryNavigation(repositories, site.id),
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId, path);
    }

    const route = resolveSiteRoute(site, path, { previewToken });
    if (!route) {
      return errorResponse(404, 'ROUTE_NOT_FOUND', 'Route not found', requestId, path);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        site: {
          id: site.id,
          slug: site.slug,
          name: site.name,
          status: site.status,
        },
        route,
        navigation: getSiteNavigation(site.id),
      },
    });
  } catch (error) {
    console.error('Route resolve API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
