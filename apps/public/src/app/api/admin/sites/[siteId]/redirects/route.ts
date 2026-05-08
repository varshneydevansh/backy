/**
 * Admin site redirects endpoint.
 *
 * GET   /api/admin/sites/[siteId]/redirects
 * PATCH /api/admin/sites/[siteId]/redirects
 */

import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_SITE_SETTINGS, type SiteSettings } from '@backy-cms/core';
import {
  getSiteByIdOrSlug,
  updateAdminSite,
} from '@/lib/backyStore';
import { normalizeRedirectRules, type RedirectStatusCode } from '@/lib/redirectRules';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

type RedirectRules = SiteSettings['redirectRules'];

const REDIRECT_STATUS_CODES = new Set<RedirectStatusCode>([301, 302, 307, 308, 410]);

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const normalizeRoutePath = (rawPath: string): string => {
  const pathOnly = rawPath.split('?')[0].split('#')[0].trim();
  const normalized = pathOnly.replace(/^\/+|\/+$/g, '');
  return normalized ? `/${normalized}` : '/';
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

const requestRedirectInput = (body: Record<string, unknown>): unknown => {
  if (Array.isArray(body.redirectRules)) return body.redirectRules;
  if (Array.isArray(body.rules)) return body.rules;
  if (isRecord(body.redirects) && Array.isArray(body.redirects.rules)) return body.redirects.rules;
  return undefined;
};

const validateRedirectInput = (value: unknown): { ok: true; rules: RedirectRules } | { ok: false; details: unknown } => {
  if (!Array.isArray(value)) {
    return { ok: false, details: { message: 'redirectRules must be an array' } };
  }

  const issues: Array<{ index: number; field: string; message: string }> = [];
  const enabledSources = new Set<string>();

  value.forEach((rule, index) => {
    if (!isRecord(rule)) {
      issues.push({ index, field: 'rule', message: 'Rule must be an object' });
      return;
    }

    const from = text(rule.from);
    const to = text(rule.to) || text(rule.destination);
    const statusCode = REDIRECT_STATUS_CODES.has(Number(rule.statusCode) as RedirectStatusCode)
      ? Number(rule.statusCode) as RedirectStatusCode
      : rule.permanent === true
        ? 301
        : 302;

    if (!from) {
      issues.push({ index, field: 'from', message: 'Source path is required' });
    }

    if (statusCode !== 410 && !to) {
      issues.push({ index, field: 'to', message: 'Destination is required unless statusCode is 410' });
    }

    if (from && to && !/^[a-z][a-z0-9+.-]*:/i.test(to) && normalizeRoutePath(from) === normalizeRoutePath(to)) {
      issues.push({ index, field: 'to', message: 'Destination cannot be the same route as the source' });
    }

    const normalizedFrom = from ? normalizeRoutePath(from) : '';
    if (rule.enabled !== false && normalizedFrom) {
      if (enabledSources.has(normalizedFrom)) {
        issues.push({ index, field: 'from', message: 'Enabled redirect sources must be unique' });
      }
      enabledSources.add(normalizedFrom);
    }
  });

  if (issues.length > 0) {
    return { ok: false, details: { issues } };
  }

  return { ok: true, rules: normalizeRedirectRules(value) };
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
      redirects: {
        rules: settings.redirectRules || [],
      },
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
    console.error('Admin site redirects API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const body = await parseJsonBody(request);
    const validation = validateRedirectInput(requestRedirectInput(body));
    if (!validation.ok) {
      return errorResponse(400, 'REDIRECT_VALIDATION', 'Redirect rules are invalid', requestId, validation.details);
    }

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const updated = await repositories.sites.update(site.id, {
        settings: {
          ...site.settings,
          redirectRules: validation.rules,
        },
      });

      return responsePayload(requestId, updated.item);
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const updated = updateAdminSite(site.id, {
      settings: {
        ...(site.settings || {}),
        redirectRules: validation.rules,
      },
    });

    if (!updated) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    return responsePayload(requestId, updated);
  } catch (error) {
    console.error('Admin site redirects update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
