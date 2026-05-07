/**
 * Public SEO discovery endpoint.
 *
 * GET /api/sites/[siteId]/seo
 * GET /api/sites/[siteId]/seo?format=sitemap
 * GET /api/sites/[siteId]/seo?format=robots
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getBlogPosts,
  getCanonicalPathForPage,
  getSiteByIdOrSlug,
  listCollectionRecords,
  listCollections,
  getPageSummary,
} from '@/lib/backyStore';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

interface SeoRoute {
  type: 'page' | 'post' | 'dynamicItem';
  id: string;
  title: string;
  description: string;
  path: string;
  canonical: string;
  status: string;
  updatedAt?: string;
  priority: number;
  changeFrequency: 'daily' | 'weekly' | 'monthly';
  robots: {
    index: boolean;
    follow: boolean;
  };
  openGraph: {
    title: string;
    description: string;
    image?: string;
  };
  keywords: string[];
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
      errorMessage: message,
    },
    { status },
  )
);

const toStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : typeof value === 'string' && value.trim().length > 0
      ? value.split(',').map((item) => item.trim()).filter(Boolean)
      : []
);

const escapeXml = (value: string): string => (
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
);

const recordTitle = (values: Record<string, unknown>, fallback: string): string => {
  const title = values.title || values.name || values.heading || values.slug;
  return typeof title === 'string' && title.trim().length > 0 ? title : fallback;
};

const recordDescription = (values: Record<string, unknown>): string => {
  const description = values.description || values.summary || values.excerpt;
  return typeof description === 'string' ? description : '';
};

const buildSitemapXml = (routes: SeoRoute[]) => {
  const urls = routes
    .filter((route) => route.robots.index)
    .map((route) => [
      '  <url>',
      `    <loc>${escapeXml(route.canonical)}</loc>`,
      route.updatedAt ? `    <lastmod>${escapeXml(route.updatedAt)}</lastmod>` : '',
      `    <changefreq>${route.changeFrequency}</changefreq>`,
      `    <priority>${route.priority.toFixed(1)}</priority>`,
      '  </url>',
    ].filter(Boolean).join('\n'))
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
  ].join('\n');
};

const buildRobotsTxt = (siteId: string) => [
  'User-agent: *',
  'Allow: /',
  `Sitemap: /api/sites/${siteId}/seo?format=sitemap`,
  '',
].join('\n');

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const site = getSiteByIdOrSlug(siteId);

    if (!site || !site.isPublished) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const pages: SeoRoute[] = getPageSummary(site.id).map((page) => {
      const canonical = page.isHomepage ? '/' : page.meta.canonical || getCanonicalPathForPage(page);
      const title = page.meta.title || page.title;
      const description = page.meta.description || page.description || '';
      return {
        type: 'page',
        id: page.id,
        title,
        description,
        path: canonical,
        canonical,
        status: page.status,
        updatedAt: page.updatedAt,
        priority: page.isHomepage ? 1 : 0.8,
        changeFrequency: page.isHomepage ? 'daily' : 'weekly',
        robots: {
          index: page.meta.noIndex !== true,
          follow: page.meta.noFollow !== true,
        },
        openGraph: {
          title,
          description,
          image: typeof page.meta.ogImage === 'string' ? page.meta.ogImage : undefined,
        },
        keywords: toStringArray(page.meta.keywords),
      };
    });

    const posts: SeoRoute[] = getBlogPosts(site.id, { limit: 1000 }).posts.map((post) => {
      const canonical = post.meta?.canonical || `/blog/${post.slug}`;
      const title = post.meta?.title || post.title;
      const description = post.meta?.description || post.excerpt || '';
      return {
        type: 'post',
        id: post.id,
        title,
        description,
        path: canonical,
        canonical,
        status: post.status,
        updatedAt: post.updatedAt,
        priority: 0.7,
        changeFrequency: 'weekly',
        robots: {
          index: post.meta?.noIndex !== true,
          follow: post.meta?.noFollow !== true,
        },
        openGraph: {
          title,
          description,
          image: typeof post.meta?.ogImage === 'string' ? post.meta.ogImage : undefined,
        },
        keywords: toStringArray(post.meta?.keywords),
      };
    });

    const dynamicItems: SeoRoute[] = listCollections(site.id).flatMap((collection) => (
      listCollectionRecords(site.id, collection.id, { limit: 1000 }).records.map((record) => {
        const canonical = `/${collection.slug}/${record.slug}`;
        const title = recordTitle(record.values, record.slug);
        const description = recordDescription(record.values);
        return {
          type: 'dynamicItem' as const,
          id: record.id,
          title,
          description,
          path: canonical,
          canonical,
          status: record.status,
          updatedAt: record.updatedAt,
          priority: 0.6,
          changeFrequency: 'weekly' as const,
          robots: {
            index: true,
            follow: true,
          },
          openGraph: {
            title,
            description,
          },
          keywords: [collection.slug, record.slug],
        };
      })
    ));

    const routes = [...pages, ...posts, ...dynamicItems].sort((left, right) => {
      if (left.priority !== right.priority) return right.priority - left.priority;
      return left.canonical.localeCompare(right.canonical);
    });

    const format = new URL(request.url).searchParams.get('format');
    if (format === 'sitemap') {
      return new NextResponse(buildSitemapXml(routes), {
        headers: {
          'content-type': 'application/xml; charset=utf-8',
          'cache-control': 'public, max-age=60, stale-while-revalidate=300',
          'x-backy-request-id': requestId,
          'x-backy-site-id': site.id,
        },
      });
    }

    if (format === 'robots') {
      return new NextResponse(buildRobotsTxt(site.id), {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'public, max-age=60, stale-while-revalidate=300',
          'x-backy-request-id': requestId,
          'x-backy-site-id': site.id,
        },
      });
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
        defaults: {
          title: site.name,
          description: site.description || '',
          robots: {
            index: true,
            follow: true,
          },
        },
        routes,
        sitemap: {
          url: `/api/sites/${site.id}/seo?format=sitemap`,
          count: routes.filter((route) => route.robots.index).length,
        },
        robots: {
          url: `/api/sites/${site.id}/seo?format=robots`,
        },
      },
      routes,
    });
  } catch (error) {
    console.error('Public SEO API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
