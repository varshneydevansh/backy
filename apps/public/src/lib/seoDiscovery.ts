import {
  getBlogPosts,
  getCanonicalPathForPage,
  getPageSummary,
  listCollectionRecords,
  listCollections,
  type StoreSite,
} from '@/lib/backyStore';
import { buildCollectionItemPath, buildCollectionListPath } from '@/lib/collectionRoutes';
import type { SiteSettings } from '@backy-cms/core';

export interface SeoRoute {
  type: 'page' | 'post' | 'dynamicList' | 'dynamicItem';
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

export interface SeoDiscovery {
  site: {
    id: string;
    slug: string;
    name: string;
  };
  defaults: {
    title: string;
    description: string;
    jsonLd: Array<Record<string, unknown>>;
    robots: {
      index: boolean;
      follow: boolean;
    };
  };
  routes: SeoRoute[];
  sitemap: {
    url: string;
    count: number;
    enabled: boolean;
    includeDynamicRoutes: boolean;
  };
  robots: {
    url: string;
    index: boolean;
    follow: boolean;
    extraRules?: string;
  };
}

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

const applyTitleTemplate = (
  title: string,
  site: { name: string },
  seo: Partial<SiteSettings['seo']> | undefined,
) => {
  const template = typeof seo?.titleTemplate === 'string' && seo.titleTemplate.trim().length > 0
    ? seo.titleTemplate.trim()
    : '';

  if (!template) {
    return title;
  }

  return template
    .replace(/%s/g, title)
    .replace(/\{title\}/g, title)
    .replace(/\{siteName\}/g, site.name);
};

export const applySeoDefaults = (
  route: SeoRoute,
  site: { name: string; description?: string | null; settings?: Pick<SiteSettings, 'seo'> },
): SeoRoute => {
  const seo = site.settings?.seo;
  const description = route.description || seo?.defaultDescription || '';
  const title = applyTitleTemplate(route.title, site, seo);
  const image = route.openGraph.image || seo?.defaultOgImage || undefined;

  return {
    ...route,
    title,
    description,
    openGraph: {
      ...route.openGraph,
      title,
      description,
      image,
    },
  };
};

const clampPriority = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(0, Math.min(1, value));
};

const isHomepageRoute = (route: SeoRoute) => route.type === 'page' && route.canonical === '/';

export const siteJsonLd = (
  seo: Partial<SiteSettings['seo']> | undefined,
): Array<Record<string, unknown>> => (
  Array.isArray(seo?.jsonLd)
    ? seo.jsonLd.filter((entry): entry is Record<string, unknown> => (
        typeof entry === 'object' && entry !== null && !Array.isArray(entry)
      ))
    : []
);

export const applySeoSitemapAndRobotsSettings = (
  routes: SeoRoute[],
  site: { settings?: Pick<SiteSettings, 'seo'> },
): SeoRoute[] => {
  const seo = site.settings?.seo;
  const robotsIndex = seo?.robots?.index !== false;
  const robotsFollow = seo?.robots?.follow !== false;
  const includeDynamicRoutes = seo?.sitemap?.includeDynamicRoutes !== false;
  const defaultPriority = clampPriority(seo?.sitemap?.defaultPriority);
  const defaultChangeFrequency = seo?.sitemap?.defaultChangeFrequency;

  return routes
    .filter((route) => includeDynamicRoutes || (route.type !== 'dynamicItem' && route.type !== 'dynamicList'))
    .map((route) => ({
      ...route,
      priority: defaultPriority === undefined || isHomepageRoute(route) ? route.priority : defaultPriority,
      changeFrequency: defaultChangeFrequency && !isHomepageRoute(route) ? defaultChangeFrequency : route.changeFrequency,
      robots: {
        index: route.robots.index && robotsIndex,
        follow: route.robots.follow && robotsFollow,
      },
    }));
};

export const sitemapRoutes = (discovery: SeoDiscovery): SeoRoute[] => (
  discovery.sitemap.enabled ? discovery.routes.filter((route) => route.robots.index) : []
);

export const getHostedRouteUrl = (origin: string, siteSlug: string, canonical: string): string => {
  const normalizedCanonical = canonical === '/' ? '' : canonical.startsWith('/') ? canonical : `/${canonical}`;
  return `${origin.replace(/\/$/, '')}/sites/${siteSlug}${normalizedCanonical}`;
};

export const buildSitemapXml = (
  routes: SeoRoute[],
  resolveLocation: (route: SeoRoute) => string = (route) => route.canonical,
) => {
  const urls = routes
    .filter((route) => route.robots.index)
    .map((route) => [
      '  <url>',
      `    <loc>${escapeXml(resolveLocation(route))}</loc>`,
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

export const buildRobotsTxt = (sitemapUrl: string) => [
  'User-agent: *',
  'Allow: /',
  `Sitemap: ${sitemapUrl}`,
  '',
].join('\n');

export const buildRobotsTxtFromDiscovery = (discovery: SeoDiscovery) => [
  'User-agent: *',
  discovery.robots.index ? 'Allow: /' : 'Disallow: /',
  discovery.sitemap.enabled ? `Sitemap: ${discovery.sitemap.url}` : '',
  discovery.robots.extraRules || '',
  '',
].filter((line, index, lines) => line.length > 0 || index === lines.length - 1).join('\n');

export const buildSeoRoutes = (siteId: string): SeoRoute[] => {
  const pages: SeoRoute[] = getPageSummary(siteId).map((page) => {
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

  const posts: SeoRoute[] = getBlogPosts(siteId, { limit: 1000 }).posts.map((post) => {
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

  const collections = listCollections(siteId);
  const dynamicLists: SeoRoute[] = collections.map((collection) => {
    const canonical = buildCollectionListPath(collection);
    return {
      type: 'dynamicList' as const,
      id: collection.id,
      title: collection.name,
      description: collection.description || '',
      path: canonical,
      canonical,
      status: collection.status,
      updatedAt: collection.updatedAt,
      priority: 0.65,
      changeFrequency: 'weekly' as const,
      robots: {
        index: true,
        follow: true,
      },
      openGraph: {
        title: collection.name,
        description: collection.description || '',
      },
      keywords: [collection.slug],
    };
  });

  const dynamicItems: SeoRoute[] = collections.flatMap((collection) => (
    listCollectionRecords(siteId, collection.id, { limit: 1000 }).records.map((record) => {
      const canonical = buildCollectionItemPath(collection, record.slug);
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

  return [...pages, ...posts, ...dynamicLists, ...dynamicItems].sort((left, right) => {
    if (left.priority !== right.priority) return right.priority - left.priority;
    return left.canonical.localeCompare(right.canonical);
  });
};

export const buildSeoDiscovery = (site: StoreSite): SeoDiscovery => {
  const routes = applySeoSitemapAndRobotsSettings(
    buildSeoRoutes(site.id).map((route) => applySeoDefaults(route, site)),
    site,
  );
  const seo = site.settings?.seo;
  const sitemapEnabled = seo?.sitemap?.enabled !== false;

  return {
    site: {
      id: site.id,
      slug: site.slug,
      name: site.name,
    },
    defaults: {
      title: applyTitleTemplate(site.name, site, seo),
      description: seo?.defaultDescription || site.description || '',
      jsonLd: siteJsonLd(seo),
      robots: {
        index: seo?.robots?.index !== false,
        follow: seo?.robots?.follow !== false,
      },
    },
    routes,
    sitemap: {
      url: `/api/sites/${site.id}/seo?format=sitemap`,
      count: sitemapEnabled ? routes.filter((route) => route.robots.index).length : 0,
      enabled: sitemapEnabled,
      includeDynamicRoutes: seo?.sitemap?.includeDynamicRoutes !== false,
    },
    robots: {
      url: `/api/sites/${site.id}/seo?format=robots`,
      index: seo?.robots?.index !== false,
      follow: seo?.robots?.follow !== false,
      extraRules: seo?.robots?.extraRules || undefined,
    },
  };
};
