/**
 * Admin site SEO defaults endpoint.
 *
 * GET   /api/admin/sites/[siteId]/seo
 * PATCH /api/admin/sites/[siteId]/seo
 */

import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_SITE_SETTINGS, type SiteSettings } from '@backy-cms/core';
import {
  getSiteByIdOrSlug,
  updateAdminSite,
} from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
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

const responsePayload = (requestId: string, site: { id: string; slug: string; name: string; settings?: SiteSettings }) => {
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
    },
  });
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      return responsePayload(requestId, site);
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    return responsePayload(requestId, site);
  } catch (error) {
    console.error('Admin site SEO API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

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

      return responsePayload(requestId, updated.item);
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

    return responsePayload(requestId, updated);
  } catch (error) {
    console.error('Admin site SEO update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
