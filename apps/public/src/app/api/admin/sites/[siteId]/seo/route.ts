/**
 * Admin site SEO defaults endpoint.
 *
 * GET   /api/admin/sites/[siteId]/seo
 * PATCH /api/admin/sites/[siteId]/seo
 */

import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_SITE_SETTINGS, type SiteSettings } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import {
  listCollectionRecords,
  listCollections,
  getSiteByIdOrSlug,
  updateAdminSite,
} from '@/lib/backyStore';
import {
  buildCollectionItemPath,
  buildCollectionListPath,
} from '@/lib/collectionRoutes';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { recordSiteCacheInvalidation, type PublicCacheInvalidation } from '@/lib/cacheInvalidation';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

interface SeoPreviewRoute {
  type: 'dynamicList' | 'dynamicItem';
  title: string;
  description: string;
  canonical: string;
  sourceTitle: string;
  sourceDescription: string;
  variables: Record<string, string>;
}

interface SeoPreview {
  supportedVariables: string[];
  routes: SeoPreviewRoute[];
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const text = (value: unknown): string | undefined => (
  typeof value === 'string' ? value.trim() : undefined
);

const bool = (value: unknown, fallback: boolean) => (
  typeof value === 'boolean' ? value : fallback
);

const numberInRange = (value: unknown, fallback: number) => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
};

const applyTitleTemplate = (
  title: string,
  siteName: string,
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
    .replace(/\{siteName\}/g, siteName);
};

const recordText = (values: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = values[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return '';
};

const previewDescription = (
  sourceDescription: string,
  seo: Partial<SiteSettings['seo']> | undefined,
) => sourceDescription || seo?.defaultDescription || '';

const buildPreviewRoute = (
  input: {
    type: SeoPreviewRoute['type'];
    sourceTitle: string;
    sourceDescription: string;
    canonical: string;
    variables: Record<string, string>;
  },
  site: { name: string; settings?: SiteSettings },
): SeoPreviewRoute => {
  const seo = site.settings?.seo;
  const title = applyTitleTemplate(input.sourceTitle, site.name, seo);
  const description = previewDescription(input.sourceDescription, seo);

  return {
    type: input.type,
    title,
    description,
    canonical: input.canonical,
    sourceTitle: input.sourceTitle,
    sourceDescription: input.sourceDescription,
    variables: {
      title: input.sourceTitle,
      siteName: site.name,
      ...input.variables,
    },
  };
};

const normalizeJsonLd = (
  value: unknown,
): { ok: true; value: Array<Record<string, unknown>> } | { ok: false; message: string } => {
  if (!Array.isArray(value)) {
    return { ok: false, message: 'JSON-LD must be an array of objects' };
  }

  const entries: Array<Record<string, unknown>> = [];
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) {
      return { ok: false, message: `JSON-LD entry ${index + 1} must be an object` };
    }
    entries.push(entry);
  }

  return { ok: true, value: entries };
};

const errorResponse = (status: number, code: string, message: string, requestId: string, details?: unknown) => (
  NextResponse.json(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
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

const defaultSiteSettings = (): SiteSettings => ({
  seo: { ...DEFAULT_SITE_SETTINGS.seo },
  analytics: {},
  social: {},
  redirectRules: [],
  navigation: {
    primary: [],
    footer: [],
  },
});

const buildDemoSeoPreview = (site: { id: string; name: string; settings?: SiteSettings }): SeoPreview => {
  const collections = listCollections(site.id, { includeUnpublished: true });
  const routes: SeoPreviewRoute[] = [];

  for (const collection of collections.slice(0, 6)) {
    routes.push(buildPreviewRoute({
      type: 'dynamicList',
      sourceTitle: collection.name,
      sourceDescription: collection.description || '',
      canonical: buildCollectionListPath(collection),
      variables: {
        collectionName: collection.name,
        collectionSlug: collection.slug,
      },
    }, site));

    const record = listCollectionRecords(site.id, collection.id, {
      includeUnpublished: true,
      limit: 1,
      offset: 0,
    }).records[0];
    if (record) {
      const recordTitle = recordText(record.values, ['title', 'name', 'heading']) || record.slug;
      routes.push(buildPreviewRoute({
        type: 'dynamicItem',
        sourceTitle: recordTitle,
        sourceDescription: recordText(record.values, ['description', 'summary', 'excerpt']),
        canonical: buildCollectionItemPath(collection, record.slug),
        variables: {
          collectionName: collection.name,
          collectionSlug: collection.slug,
          recordTitle,
          recordSlug: record.slug,
        },
      }, site));
    }
  }

  return {
    supportedVariables: ['%s', '{title}', '{siteName}', '{collectionName}', '{collectionSlug}', '{recordTitle}', '{recordSlug}'],
    routes,
  };
};

const buildRepositorySeoPreview = async (
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  site: { id: string; name: string; settings?: SiteSettings },
): Promise<SeoPreview> => {
  const collections = await repositories.collections.list({
    siteId: site.id,
    includeUnpublished: true,
    status: 'all',
    limit: 6,
    offset: 0,
  });
  const routes: SeoPreviewRoute[] = [];

  for (const collection of collections.items) {
    routes.push(buildPreviewRoute({
      type: 'dynamicList',
      sourceTitle: collection.name,
      sourceDescription: collection.description || '',
      canonical: buildCollectionListPath(collection),
      variables: {
        collectionName: collection.name,
        collectionSlug: collection.slug,
      },
    }, site));

    const records = await repositories.collections.listRecords({
      siteId: site.id,
      collectionId: collection.id,
      includeUnpublished: true,
      status: 'all',
      limit: 1,
      offset: 0,
    });
    const record = records.items[0];
    if (record) {
      const recordTitle = recordText(record.values, ['title', 'name', 'heading']) || record.slug;
      routes.push(buildPreviewRoute({
        type: 'dynamicItem',
        sourceTitle: recordTitle,
        sourceDescription: recordText(record.values, ['description', 'summary', 'excerpt']),
        canonical: buildCollectionItemPath(collection, record.slug),
        variables: {
          collectionName: collection.name,
          collectionSlug: collection.slug,
          recordTitle,
          recordSlug: record.slug,
        },
      }, site));
    }
  }

  return {
    supportedVariables: ['%s', '{title}', '{siteName}', '{collectionName}', '{collectionSlug}', '{recordTitle}', '{recordSlug}'],
    routes,
  };
};

const normalizeSeoInput = (
  input: unknown,
  current: SiteSettings['seo'],
): { ok: true; seo: SiteSettings['seo'] } | { ok: false; details: unknown } => {
  if (!isRecord(input)) {
    return { ok: false, details: { message: 'seo must be an object' } };
  }

  const titleTemplate = text(input.titleTemplate);
  const sitemapInput = isRecord(input.sitemap) ? input.sitemap : {};
  const robotsInput = isRecord(input.robots) ? input.robots : {};
  const issues: Array<{ field: string; message: string }> = [];
  const jsonLdInput = input.jsonLd === undefined ? undefined : normalizeJsonLd(input.jsonLd);

  if (titleTemplate && !titleTemplate.includes('%s') && !titleTemplate.includes('{title}')) {
    issues.push({ field: 'titleTemplate', message: 'Title template must include %s or {title}' });
  }

  if (jsonLdInput && !jsonLdInput.ok) {
    issues.push({ field: 'jsonLd', message: jsonLdInput.message });
  }

  if (
    sitemapInput.defaultChangeFrequency !== undefined
    && sitemapInput.defaultChangeFrequency !== 'daily'
    && sitemapInput.defaultChangeFrequency !== 'weekly'
    && sitemapInput.defaultChangeFrequency !== 'monthly'
  ) {
    issues.push({ field: 'sitemap.defaultChangeFrequency', message: 'Change frequency must be daily, weekly, or monthly' });
  }

  if (issues.length > 0) {
    return { ok: false, details: { issues } };
  }

  return {
    ok: true,
    seo: {
      ...current,
      titleTemplate: input.titleTemplate === undefined ? current.titleTemplate : titleTemplate || '',
      defaultDescription: input.defaultDescription === undefined ? current.defaultDescription : text(input.defaultDescription) || '',
      defaultOgImage: input.defaultOgImage === undefined ? current.defaultOgImage : text(input.defaultOgImage) || '',
      favicon: input.favicon === undefined ? current.favicon : text(input.favicon) || '',
      jsonLd: input.jsonLd === undefined ? current.jsonLd || [] : jsonLdInput && jsonLdInput.ok ? jsonLdInput.value : [],
      sitemap: input.sitemap === undefined
        ? current.sitemap
        : {
            ...current.sitemap,
            enabled: bool(sitemapInput.enabled, current.sitemap?.enabled !== false),
            defaultChangeFrequency: sitemapInput.defaultChangeFrequency === 'daily' || sitemapInput.defaultChangeFrequency === 'weekly' || sitemapInput.defaultChangeFrequency === 'monthly'
              ? sitemapInput.defaultChangeFrequency
              : current.sitemap?.defaultChangeFrequency || 'weekly',
            defaultPriority: numberInRange(sitemapInput.defaultPriority, current.sitemap?.defaultPriority ?? 0.7),
            includeDynamicRoutes: bool(sitemapInput.includeDynamicRoutes, current.sitemap?.includeDynamicRoutes !== false),
          },
      robots: input.robots === undefined
        ? current.robots
        : {
            ...current.robots,
            index: bool(robotsInput.index, current.robots?.index !== false),
            follow: bool(robotsInput.follow, current.robots?.follow !== false),
            extraRules: robotsInput.extraRules === undefined ? current.robots?.extraRules || '' : text(robotsInput.extraRules) || '',
          },
    },
  };
};

const responsePayload = (
  requestId: string,
  site: { id: string; slug: string; name: string; settings?: SiteSettings },
  preview: SeoPreview,
  cacheInvalidation?: PublicCacheInvalidation,
) => {
  const settings = site.settings || defaultSiteSettings();
  return NextResponse.json({
    success: true,
    requestId,
    data: {
      site: {
        id: site.id,
        slug: site.slug,
        name: site.name,
      },
      seo: settings.seo || defaultSiteSettings().seo,
      preview,
      ...(cacheInvalidation ? { cacheInvalidation } : {}),
    },
  });
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'pages.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      return responsePayload(requestId, site, await buildRepositorySeoPreview(repositories, site));
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    return responsePayload(requestId, site, buildDemoSeoPreview(site));
  } catch (error) {
    console.error('Admin site SEO API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'pages.edit' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId } = await params;
    const body = await parseJsonBody(request);

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const validation = normalizeSeoInput(body.seo || body, site.settings.seo);
      if (!validation.ok) {
        return errorResponse(400, 'SEO_VALIDATION', 'SEO defaults are invalid', requestId, validation.details);
      }

      const updated = await repositories.sites.update(site.id, {
        settings: {
          ...site.settings,
          seo: validation.seo,
        },
      });
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'seo',
        entity: 'site',
        entityId: site.id,
        reason: 'site-seo-updated',
        requestId,
      });

      return responsePayload(
        requestId,
        updated.item,
        await buildRepositorySeoPreview(repositories, updated.item),
        cacheInvalidation,
      );
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const settings = site.settings || defaultSiteSettings();
    const validation = normalizeSeoInput(body.seo || body, settings.seo);
    if (!validation.ok) {
      return errorResponse(400, 'SEO_VALIDATION', 'SEO defaults are invalid', requestId, validation.details);
    }

    const updated = updateAdminSite(site.id, {
      settings: {
        ...settings,
        seo: validation.seo,
      },
    });

    if (!updated) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    return responsePayload(requestId, updated, buildDemoSeoPreview(updated));
  } catch (error) {
    console.error('Admin site SEO update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
