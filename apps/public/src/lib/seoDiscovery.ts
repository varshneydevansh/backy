import {
  getBlogPosts,
  getCanonicalPathForPage,
  getPageSummary,
  listCollectionRecords,
  listCollections,
  type StoreSite,
} from '@/lib/backyStore';
import { buildCollectionItemPath, buildCollectionListPath } from '@/lib/collectionRoutes';
import { frontendDesignProvenanceFromMetadata } from '@/lib/frontendDesignContract';
import type { SiteSettings } from '@backy-cms/core';

export interface SeoRoute {
  type: 'page' | 'post' | 'dynamicList' | 'dynamicItem';
  id: string;
  title: string;
  description: string;
  path: string;
  canonical: string;
  canonicalUrl?: string;
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
  jsonLd: Array<Record<string, unknown>>;
  frontendDesign?: ReturnType<typeof frontendDesignProvenanceFromMetadata>;
  collectionFrontendDesign?: ReturnType<typeof frontendDesignProvenanceFromMetadata>;
}

export interface SeoDiscovery {
  site: {
    id: string;
    slug: string;
    name: string;
    customDomain?: string | null;
    canonicalBaseUrl?: string;
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
    publicUrl?: string;
    count: number;
    enabled: boolean;
    includeDynamicRoutes: boolean;
  };
  robots: {
    url: string;
    publicUrl?: string;
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

const routeOverrideMatches = (
  override: NonNullable<SiteSettings['seo']['routeOverrides']>[number],
  route: SeoRoute,
) => {
  const match = override.match.trim();
  return match === route.canonical ||
    match === route.path ||
    match === route.id ||
    match === `${route.type}:${route.id}`;
};

export const applySeoRouteOverrides = (
  routes: SeoRoute[],
  site: { settings?: Pick<SiteSettings, 'seo'> },
): SeoRoute[] => {
  const overrides = site.settings?.seo?.routeOverrides || [];
  if (overrides.length === 0) {
    return routes;
  }

  return routes.map((route) => {
    const override = overrides.find((candidate) => (
      candidate.enabled !== false && routeOverrideMatches(candidate, route)
    ));
    if (!override) {
      return route;
    }

    const title = override.title || route.title;
    const description = override.description || route.description;
    const canonical = override.canonical || route.canonical;

    return {
      ...route,
      title,
      description,
      path: canonical,
      canonical,
      priority: typeof override.priority === 'number' && Number.isFinite(override.priority)
        ? Math.max(0, Math.min(1, override.priority))
        : route.priority,
      changeFrequency: override.changeFrequency || route.changeFrequency,
      robots: {
        index: override.robots?.index ?? route.robots.index,
        follow: override.robots?.follow ?? route.robots.follow,
      },
      openGraph: {
        ...route.openGraph,
        title,
        description,
        image: override.ogImage || route.openGraph.image,
      },
      keywords: override.keywords && override.keywords.length > 0 ? override.keywords : route.keywords,
      jsonLd: override.jsonLd && override.jsonLd.length > 0 ? override.jsonLd : route.jsonLd,
    };
  });
};

const clampPriority = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(0, Math.min(1, value));
};

const isHomepageRoute = (route: SeoRoute) => route.type === 'page' && route.canonical === '/';

export const jsonLdObjects = (
  value: unknown,
): Array<Record<string, unknown>> => (
  Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => (
        typeof entry === 'object' && entry !== null && !Array.isArray(entry)
      ))
    : []
);

export const siteJsonLd = (
  seo: Partial<SiteSettings['seo']> | undefined,
): Array<Record<string, unknown>> => jsonLdObjects(seo?.jsonLd);

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
  const routeOverrides = seo?.routeOverrides || [];

  return routes
    .filter((route) => includeDynamicRoutes || (route.type !== 'dynamicItem' && route.type !== 'dynamicList'))
    .map((route) => {
      const activeOverride = routeOverrides.find((candidate) => (
        candidate.enabled !== false && (
          routeOverrideMatches(candidate, route) ||
          (typeof candidate.canonical === 'string' && candidate.canonical === route.canonical)
        )
      ));

      return {
        ...route,
        priority: defaultPriority === undefined || isHomepageRoute(route) || activeOverride?.priority !== undefined
          ? route.priority
          : defaultPriority,
        changeFrequency: defaultChangeFrequency && !isHomepageRoute(route) && !activeOverride?.changeFrequency
          ? defaultChangeFrequency
          : route.changeFrequency,
        robots: {
          index: route.robots.index && robotsIndex,
          follow: route.robots.follow && robotsFollow,
        },
      };
    });
};

export const sitemapRoutes = (discovery: SeoDiscovery): SeoRoute[] => (
  discovery.sitemap.enabled ? discovery.routes.filter((route) => route.robots.index) : []
);

const normalizeDomain = (domain: string | null | undefined): string | null => {
  if (typeof domain !== 'string' || domain.trim().length === 0) {
    return null;
  }

  const withoutProtocol = domain.trim().replace(/^https?:\/\//i, '');
  const hostname = withoutProtocol.split('/')[0]?.replace(/\/+$/, '').toLowerCase();
  return hostname || null;
};

const normalizeCanonicalPath = (canonical: string): string => {
  if (canonical === '/') {
    return '/';
  }

  return canonical.startsWith('/') ? canonical : `/${canonical}`;
};

export const getHostedRouteUrl = (
  origin: string,
  siteSlug: string,
  canonical: string,
  customDomain?: string | null,
): string => {
  const normalizedCanonical = normalizeCanonicalPath(canonical);
  const domain = normalizeDomain(customDomain);

  if (domain) {
    return `https://${domain}${normalizedCanonical}`;
  }

  const hostedPath = normalizedCanonical === '/' ? '' : normalizedCanonical;
  return `${origin.replace(/\/$/, '')}/sites/${siteSlug}${hostedPath}`;
};

export const getSiteCanonicalBaseUrl = (
  origin: string,
  site: { slug: string; customDomain?: string | null },
): string => {
  const domain = normalizeDomain(site.customDomain);

  if (domain) {
    return `https://${domain}`;
  }

  return `${origin.replace(/\/$/, '')}/sites/${site.slug}`;
};

const customDomainSitemapUrl = (site: { customDomain?: string | null }) => {
  const domain = normalizeDomain(site.customDomain);
  return domain ? `https://${domain}/sitemap.xml` : undefined;
};

const customDomainRobotsUrl = (site: { customDomain?: string | null }) => {
  const domain = normalizeDomain(site.customDomain);
  return domain ? `https://${domain}/robots.txt` : undefined;
};

const withCanonicalUrls = (
  discovery: SeoDiscovery,
  site: { slug: string; customDomain?: string | null },
  origin?: string,
): SeoDiscovery => {
  if (!origin) {
    return discovery;
  }

  const canonicalBaseUrl = getSiteCanonicalBaseUrl(origin, site);
  const sitemapPublicUrl = customDomainSitemapUrl(site);
  const robotsPublicUrl = customDomainRobotsUrl(site);

  return {
    ...discovery,
    site: {
      ...discovery.site,
      customDomain: site.customDomain || null,
      canonicalBaseUrl,
    },
    routes: discovery.routes.map((route) => ({
      ...route,
      canonicalUrl: getHostedRouteUrl(origin, site.slug, route.canonical, site.customDomain),
    })),
    sitemap: {
      ...discovery.sitemap,
      publicUrl: sitemapPublicUrl,
    },
    robots: {
      ...discovery.robots,
      publicUrl: robotsPublicUrl,
    },
  };
};

export const buildSitemapXml = (
  routes: SeoRoute[],
  resolveLocation: (route: SeoRoute) => string = (route) => route.canonicalUrl || route.canonical,
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
  discovery.sitemap.enabled ? `Sitemap: ${discovery.sitemap.publicUrl || discovery.sitemap.url}` : '',
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
      jsonLd: jsonLdObjects(page.meta.jsonLd),
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
      jsonLd: jsonLdObjects(post.meta?.jsonLd),
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
      jsonLd: [],
      frontendDesign: frontendDesignProvenanceFromMetadata(collection.metadata),
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
        jsonLd: [],
        frontendDesign: frontendDesignProvenanceFromMetadata(record.values),
        collectionFrontendDesign: frontendDesignProvenanceFromMetadata(collection.metadata),
      };
    })
  ));

  return [...pages, ...posts, ...dynamicLists, ...dynamicItems].sort((left, right) => {
    if (left.priority !== right.priority) return right.priority - left.priority;
    return left.canonical.localeCompare(right.canonical);
  });
};

export const buildSeoDiscovery = (site: StoreSite, options: { origin?: string } = {}): SeoDiscovery => {
  const routes = applySeoSitemapAndRobotsSettings(
    applySeoRouteOverrides(
      buildSeoRoutes(site.id).map((route) => applySeoDefaults(route, site)),
      site,
    ),
    site,
  );
  const seo = site.settings?.seo;
  const sitemapEnabled = seo?.sitemap?.enabled !== false;

  return withCanonicalUrls({
    site: {
      id: site.id,
      slug: site.slug,
      name: site.name,
      customDomain: site.customDomain || null,
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
  }, site, options.origin);
};
