/**
 * Admin site redirects endpoint.
 *
 * GET   /api/admin/sites/[siteId]/redirects
 * POST  /api/admin/sites/[siteId]/redirects
 * PATCH /api/admin/sites/[siteId]/redirects
 */

import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_SITE_SETTINGS, type SiteSettings } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import {
  getBlogPosts,
  getPageSummary,
  getSiteByIdOrSlug,
  listCollections,
  updateAdminSite,
} from '@/lib/backyStore';
import {
  buildCollectionListPath,
  matchCollectionItemRoute,
  matchCollectionListRoute,
} from '@/lib/collectionRoutes';
import { normalizeRedirectRules, type RedirectStatusCode } from '@/lib/redirectRules';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { recordSiteCacheInvalidation, type PublicCacheInvalidation } from '@/lib/cacheInvalidation';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

type RedirectRules = SiteSettings['redirectRules'];

type RedirectConflictKind = 'source-route-conflict' | 'target-route-missing';

interface RedirectConflict {
  index: number;
  ruleId?: string;
  from: string;
  to?: string;
  kind: RedirectConflictKind;
  severity: 'warning';
  message: string;
  route?: {
    type: 'page' | 'post' | 'dynamicList' | 'dynamicItem';
    id: string;
    path: string;
    title: string;
  };
}

interface RouteCandidate {
  type: 'page' | 'post' | 'dynamicList';
  id: string;
  path: string;
  title: string;
}

interface RoutedCollection {
  id: string;
  name: string;
  slug: string;
  routePattern?: string | null;
  listRoutePattern?: string | null;
}

const REDIRECT_STATUS_CODES = new Set<RedirectStatusCode>([301, 302, 307, 308, 410]);

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const isExternalUrl = (value: string): boolean => /^[a-z][a-z0-9+.-]*:/i.test(value);

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

const routeTitle = (value: unknown, fallback: string): string => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
);

const pagePath = (page: { slug: string; isHomepage?: boolean; meta?: { canonical?: string | null } }): string => {
  if (page.isHomepage) {
    return '/';
  }

  if (typeof page.meta?.canonical === 'string' && page.meta.canonical.trim().length > 0) {
    return normalizeRoutePath(page.meta.canonical);
  }

  return normalizeRoutePath(`/${page.slug}`);
};

const postPath = (post: { slug: string; meta?: { canonical?: string | null } }): string => {
  if (typeof post.meta?.canonical === 'string' && post.meta.canonical.trim().length > 0) {
    return normalizeRoutePath(post.meta.canonical);
  }

  return normalizeRoutePath(`/blog/${post.slug}`);
};

const dynamicItemRoute = (
  path: string,
  collections: RoutedCollection[],
): RedirectConflict['route'] | null => {
  const match = matchCollectionItemRoute(path, collections);
  return match
    ? {
        type: 'dynamicItem',
        id: match.collection.id,
        path: match.canonical,
        title: `${match.collection.name} item route`,
      }
    : null;
};

const findRouteCandidate = (
  path: string,
  routes: RouteCandidate[],
  collections: RoutedCollection[],
): RedirectConflict['route'] | null => {
  const normalizedPath = normalizeRoutePath(path);
  const exact = routes.find((route) => route.path === normalizedPath);
  if (exact) {
    return exact;
  }

  const dynamicList = matchCollectionListRoute(normalizedPath, collections);
  if (dynamicList) {
    return {
      type: 'dynamicList',
      id: dynamicList.collection.id,
      path: dynamicList.canonical,
      title: `${dynamicList.collection.name} list route`,
    };
  }

  return dynamicItemRoute(normalizedPath, collections);
};

const redirectConflicts = (
  rules: RedirectRules,
  routes: RouteCandidate[],
  collections: RoutedCollection[],
): RedirectConflict[] => (
  normalizeRedirectRules(rules).flatMap((rule, index) => {
    if (!rule.enabled) {
      return [];
    }

    const conflicts: RedirectConflict[] = [];
    const sourceRoute = findRouteCandidate(rule.from, routes, collections);
    if (sourceRoute) {
      conflicts.push({
        index,
        ruleId: rule.id,
        from: rule.from,
        to: rule.to,
        kind: 'source-route-conflict',
        severity: 'warning',
        message: `${rule.from} already resolves to a ${sourceRoute.type} route and will be shadowed by this ${rule.statusCode === 410 ? '410 gone rule' : 'redirect'}.`,
        route: sourceRoute,
      });
    }

    if (rule.statusCode !== 410 && rule.to && !isExternalUrl(rule.to)) {
      const target = normalizeRoutePath(rule.to);
      const targetRoute = findRouteCandidate(target, routes, collections);
      if (!targetRoute) {
        conflicts.push({
          index,
          ruleId: rule.id,
          from: rule.from,
          to: target,
          kind: 'target-route-missing',
          severity: 'warning',
          message: `${rule.from} points to ${target}, but that route does not currently resolve to a page, post, or dynamic collection route.`,
        });
      }
    }

    return conflicts;
  })
);

const buildDemoRouteCandidates = (siteId: string) => {
  const pages = getPageSummary(siteId, { includeUnpublished: true });
  const posts = getBlogPosts(siteId, { includeUnpublished: true, limit: 1000 }).posts;
  const collections = listCollections(siteId, { includeUnpublished: true });

  return {
    collections,
    routes: [
      ...pages.map((page) => ({
        type: 'page' as const,
        id: page.id,
        path: pagePath(page),
        title: routeTitle(page.title, page.slug),
      })),
      ...posts.map((post) => ({
        type: 'post' as const,
        id: post.id,
        path: postPath(post),
        title: routeTitle(post.title, post.slug),
      })),
      ...collections.map((collection) => ({
        type: 'dynamicList' as const,
        id: collection.id,
        path: normalizeRoutePath(buildCollectionListPath(collection)),
        title: `${collection.name} list route`,
      })),
    ],
  };
};

const buildRepositoryRouteCandidates = async (
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  siteId: string,
) => {
  const [pages, posts, collections] = await Promise.all([
    repositories.pages.list({
      siteId,
      includeUnpublished: true,
      status: 'all',
      limit: 1000,
      offset: 0,
    }),
    repositories.posts.list({
      siteId,
      includeUnpublished: true,
      status: 'all',
      limit: 1000,
      offset: 0,
    }),
    repositories.collections.list({
      siteId,
      includeUnpublished: true,
      status: 'all',
      limit: 1000,
      offset: 0,
    }),
  ]);

  const collectionItems = collections.items;
  return {
    collections: collectionItems,
    routes: [
      ...pages.items.map((page) => ({
        type: 'page' as const,
        id: page.id,
        path: pagePath(page),
        title: routeTitle(page.title, page.slug),
      })),
      ...posts.items.map((post) => ({
        type: 'post' as const,
        id: post.id,
        path: postPath(post),
        title: routeTitle(post.title, post.slug),
      })),
      ...collectionItems.map((collection) => ({
        type: 'dynamicList' as const,
        id: collection.id,
        path: normalizeRoutePath(buildCollectionListPath(collection)),
        title: `${collection.name} list route`,
      })),
    ],
  };
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

const responsePayload = (
  requestId: string,
  site: { id: string; slug: string; name: string; settings?: SiteSettings },
  conflicts: RedirectConflict[],
  options: { persisted?: boolean; cacheInvalidation?: PublicCacheInvalidation } = {},
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
      redirects: {
        rules: settings.redirectRules || [],
        conflicts,
        persisted: options.persisted !== false,
      },
      ...(options.cacheInvalidation ? { cacheInvalidation: options.cacheInvalidation } : {}),
    },
  });
};

const previewResponsePayload = (
  requestId: string,
  site: { id: string; slug: string; name: string },
  rules: RedirectRules,
  conflicts: RedirectConflict[],
) => NextResponse.json({
  success: true,
  requestId,
  data: {
    site: {
      id: site.id,
      slug: site.slug,
      name: site.name,
    },
    redirects: {
      rules,
      conflicts,
      persisted: false,
    },
  },
});

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'sites.view' });
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

      const routeCandidates = await buildRepositoryRouteCandidates(repositories, site.id);
      return responsePayload(
        requestId,
        site,
        redirectConflicts(site.settings?.redirectRules || [], routeCandidates.routes, routeCandidates.collections),
      );
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const routeCandidates = buildDemoRouteCandidates(site.id);
    return responsePayload(
      requestId,
      site,
      redirectConflicts(site.settings?.redirectRules || [], routeCandidates.routes, routeCandidates.collections),
    );
  } catch (error) {
    console.error('Admin site redirects API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'sites.configure' });
  if (access instanceof NextResponse) {
    return access;
  }

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

      const routeCandidates = await buildRepositoryRouteCandidates(repositories, site.id);
      return previewResponsePayload(
        requestId,
        site,
        validation.rules,
        redirectConflicts(validation.rules, routeCandidates.routes, routeCandidates.collections),
      );
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const routeCandidates = buildDemoRouteCandidates(site.id);
    return previewResponsePayload(
      requestId,
      site,
      validation.rules,
      redirectConflicts(validation.rules, routeCandidates.routes, routeCandidates.collections),
    );
  } catch (error) {
    console.error('Admin site redirect preview API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'sites.configure' });
  if (access instanceof NextResponse) {
    return access;
  }

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
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        teamId: site.teamId,
        actorId: access.session?.user.id,
        entity: 'site',
        entityId: site.id,
        action: 'site.redirects.updated',
        before: site.settings.redirectRules || [],
        after: updated.item.settings.redirectRules || [],
        metadata: {
          ruleCount: validation.rules.length,
          enabledCount: validation.rules.filter((rule) => rule.enabled !== false).length,
        },
        requestId,
      });
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'routing',
        entity: 'site',
        entityId: site.id,
        reason: 'site-redirects-updated',
        requestId,
      });

      const routeCandidates = await buildRepositoryRouteCandidates(repositories, site.id);
      return responsePayload(
        requestId,
        updated.item,
        redirectConflicts(validation.rules, routeCandidates.routes, routeCandidates.collections),
        { cacheInvalidation },
      );
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

    await recordAdminAudit({
      siteId: site.id,
      actorId: access.session?.user.id,
      entity: 'site',
      entityId: site.id,
      action: 'site.redirects.updated',
      before: site.settings?.redirectRules || [],
      after: updated.settings?.redirectRules || [],
      metadata: {
        ruleCount: validation.rules.length,
        enabledCount: validation.rules.filter((rule) => rule.enabled !== false).length,
      },
      requestId,
    });

    const routeCandidates = buildDemoRouteCandidates(site.id);
    return responsePayload(
      requestId,
      updated,
      redirectConflicts(validation.rules, routeCandidates.routes, routeCandidates.collections),
    );
  } catch (error) {
    console.error('Admin site redirects update API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
