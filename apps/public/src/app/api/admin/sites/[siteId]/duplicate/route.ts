/**
 * Admin site duplicate endpoint.
 *
 * POST /api/admin/sites/[siteId]/duplicate
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_SITE_SETTINGS,
  type BackyPage,
  type Site,
  type SiteNavigationConfig,
  type SiteNavigationConfigItem,
  type SiteSettings,
} from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import {
  createAdminPage,
  createAdminSite,
  getAdminSettings,
  getSiteByIdOrSlug,
  getSites,
  listAdminPages,
  updateAdminPage,
  updateAdminSite,
} from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

type Repositories = Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>;

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

const normalizeSlug = (value: unknown): string => (
  typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    : ''
);

const toRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const readBillingSitePolicy = (settings: unknown) => {
  const root = toRecord(settings);
  const integrations = toRecord(root.integrations);
  const commerce = toRecord(integrations.commerce);
  const limit = Number(commerce.siteLimit);
  const overageMode = typeof commerce.overageMode === 'string' ? commerce.overageMode : 'warn';

  return {
    siteLimit: Number.isFinite(limit) && limit >= 1 ? Math.round(limit) : 3,
    overageMode,
    billingPlan: typeof commerce.billingPlan === 'string' ? commerce.billingPlan : 'free',
  };
};

const enforceSiteBillingLimit = (
  settings: unknown,
  currentSiteCount: number,
  requestId: string,
) => {
  const policy = readBillingSitePolicy(settings);
  if (policy.overageMode === 'block' && currentSiteCount >= policy.siteLimit) {
    return errorResponse(
      402,
      'BILLING_SITE_LIMIT',
      `The ${policy.billingPlan} billing policy allows ${policy.siteLimit} site${policy.siteLimit === 1 ? '' : 's'}. Update Settings billing limits before duplicating another site.`,
      requestId,
    );
  }

  return null;
};

const duplicateSlugBase = (sourceSlug: string): string => {
  const suffix = Date.now().toString(36).slice(-6);
  return normalizeSlug(`${sourceSlug}-copy-${suffix}`) || `site-copy-${suffix}`;
};

const clonePlain = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const rewriteNavigationItem = (
  item: SiteNavigationConfigItem,
  pageIdMap: Map<string, string>,
): SiteNavigationConfigItem => ({
  ...item,
  pageId: item.pageId && pageIdMap.has(item.pageId) ? pageIdMap.get(item.pageId) : item.pageId,
  children: item.children?.map((child) => rewriteNavigationItem(child, pageIdMap)),
});

const rewriteNavigation = (
  navigation: SiteNavigationConfig | undefined,
  pageIdMap: Map<string, string>,
): SiteNavigationConfig => {
  const source = navigation || DEFAULT_SITE_SETTINGS.navigation;
  return {
    ...clonePlain(source),
    primary: source.primary.map((item) => rewriteNavigationItem(item, pageIdMap)),
    footer: source.footer?.map((item) => rewriteNavigationItem(item, pageIdMap)) || [],
  };
};

const duplicateSiteSettings = (
  settings: SiteSettings | undefined,
  pageIdMap: Map<string, string>,
): SiteSettings => {
  const defaults = clonePlain(DEFAULT_SITE_SETTINGS) as unknown as SiteSettings;
  const source = clonePlain(settings || defaults) as SiteSettings;

  return {
    ...source,
    domainVerification: defaults.domainVerification,
    vercelDeployment: defaults.vercelDeployment,
    billingQuota: defaults.billingQuota,
    navigation: rewriteNavigation(source.navigation, pageIdMap),
  };
};

const adminSiteFromRepositorySite = (site: Site | null) => {
  if (!site) return null;
  return {
    ...site,
    status: site.isPublished ? 'published' : 'draft',
  };
};

const resolveRepositoryDuplicateSlug = async (
  repositories: Repositories,
  teamId: string,
  desiredSlug: string,
): Promise<string> => {
  for (let index = 0; index < 100; index += 1) {
    const candidate = index === 0 ? desiredSlug : `${desiredSlug}-${index + 1}`;
    const check = await repositories.sites.checkSlug({ slug: candidate, teamId });
    if (check.available) {
      return candidate;
    }
  }

  throw new Error('Unable to find an available duplicate slug');
};

const resolveDemoDuplicateSlug = (desiredSlug: string): string => {
  for (let index = 0; index < 100; index += 1) {
    const candidate = index === 0 ? desiredSlug : `${desiredSlug}-${index + 1}`;
    if (!getSiteByIdOrSlug(candidate)) {
      return candidate;
    }
  }

  throw new Error('Unable to find an available duplicate slug');
};

const listAllRepositoryPages = async (
  repositories: Repositories,
  siteId: string,
): Promise<BackyPage[]> => {
  const pages: BackyPage[] = [];
  let offset = 0;
  const limit = 100;

  for (;;) {
    const result = await repositories.pages.list({
      siteId,
      status: 'all',
      includeUnpublished: true,
      limit,
      offset,
    });
    pages.push(...result.items);
    if (!result.pagination.hasMore) {
      return pages;
    }
    offset += limit;
  }
};

const remapPageMeta = <T extends { parentPageId?: string | null }>(
  meta: T,
  pageIdMap: Map<string, string>,
): T => {
  if (!meta.parentPageId || !pageIdMap.has(meta.parentPageId)) {
    return meta;
  }

  return {
    ...meta,
    parentPageId: pageIdMap.get(meta.parentPageId) || null,
  };
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'sites.create' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId } = await params;
    const body = await parseJsonBody(request);

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const source = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!source) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const desiredName = typeof body.name === 'string' && body.name.trim()
        ? body.name.trim()
        : `${source.name} Copy`;
      const desiredSlug = normalizeSlug(body.slug) || duplicateSlugBase(source.slug);
      const slug = await resolveRepositoryDuplicateSlug(repositories, source.teamId, desiredSlug);
      const [settings, existingSites] = await Promise.all([
        repositories.settings.get(),
        repositories.sites.list({ status: 'all', limit: 1, offset: 0 }),
      ]);
      const billingLimitError = enforceSiteBillingLimit(settings, existingSites.pagination.total, requestId);
      if (billingLimitError) {
        return billingLimitError;
      }
      const initialSettings = duplicateSiteSettings(source.settings, new Map());
      const created = await repositories.sites.create({
        teamId: source.teamId,
        name: desiredName,
        slug,
        description: source.description,
        customDomain: null,
        theme: clonePlain(source.theme),
        settings: initialSettings,
        status: 'draft',
      });
      const sourcePages = await listAllRepositoryPages(repositories, source.id);
      const pageIdMap = new Map<string, string>();
      const createdPages: BackyPage[] = [];

      for (const page of sourcePages) {
        const createdPage = await repositories.pages.create({
          siteId: created.item.id,
          title: page.title,
          slug: page.slug,
          description: page.description,
          status: 'draft',
          scheduledAt: null,
          isHomepage: page.isHomepage,
          parentId: null,
          sortOrder: page.sortOrder,
          content: clonePlain(page.content),
          meta: clonePlain(page.meta),
        });
        pageIdMap.set(page.id, createdPage.item.id);
        createdPages.push(createdPage.item);
      }

      for (const sourcePage of sourcePages) {
        const copiedPageId = pageIdMap.get(sourcePage.id);
        if (!copiedPageId) continue;
        const copiedParentId = sourcePage.parentId ? pageIdMap.get(sourcePage.parentId) || null : null;
        const copiedMeta = remapPageMeta(clonePlain(sourcePage.meta), pageIdMap);
        if (copiedParentId || copiedMeta.parentPageId !== sourcePage.meta.parentPageId) {
          await repositories.pages.update(created.item.id, copiedPageId, {
            parentId: copiedParentId,
            meta: copiedMeta,
          });
        }
      }

      const finalized = await repositories.sites.update(created.item.id, {
        settings: duplicateSiteSettings(source.settings, pageIdMap),
        status: 'draft',
        isPublished: false,
        publishedAt: null,
      });

      await recordAdminAudit({
        repositories,
        siteId: finalized.item.id,
        teamId: source.teamId,
        actorId: access.session?.user.id,
        entity: 'site',
        entityId: finalized.item.id,
        action: 'site.duplicated',
        before: adminSiteFromRepositorySite(source) || {},
        after: adminSiteFromRepositorySite(finalized.item) || {},
        metadata: {
          sourceSiteId: source.id,
          sourceSlug: source.slug,
          slug,
          pagesCopied: createdPages.length,
          source: 'admin-site-duplicate',
        },
        requestId,
      });

      return NextResponse.json(
        {
          success: true,
          requestId,
          data: {
            site: adminSiteFromRepositorySite(finalized.item),
            pagesCopied: createdPages.length,
          },
        },
        { status: 201 },
      );
    }

    const source = getSiteByIdOrSlug(siteId);

    if (!source) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const desiredName = typeof body.name === 'string' && body.name.trim()
      ? body.name.trim()
      : `${source.name} Copy`;
    const desiredSlug = normalizeSlug(body.slug) || duplicateSlugBase(source.slug);
    const slug = resolveDemoDuplicateSlug(desiredSlug);
    const billingLimitError = enforceSiteBillingLimit(getAdminSettings(), getSites({ includeUnpublished: true }).length, requestId);
    if (billingLimitError) {
      return billingLimitError;
    }
    const created = createAdminSite({
      name: desiredName,
      slug,
      description: source.description,
      customDomain: null,
      theme: clonePlain(source.theme),
      settings: duplicateSiteSettings(source.settings, new Map()),
      status: 'draft',
      isPublished: false,
    });
    const sourcePages = listAdminPages(source.id, { includeUnpublished: true });
    const pageIdMap = new Map<string, string>();

    for (const page of sourcePages) {
      const copied = createAdminPage(created.id, {
        title: page.title,
        slug: page.slug,
        description: page.description,
        status: 'draft',
        scheduledAt: null,
        isHomepage: page.isHomepage,
        parentId: null,
        sortOrder: page.sortOrder,
        content: clonePlain(page.content),
        meta: clonePlain(page.meta),
        forms: clonePlain(page.forms || []),
      });
      pageIdMap.set(page.id, copied.id);
    }

    for (const sourcePage of sourcePages) {
      const copiedPageId = pageIdMap.get(sourcePage.id);
      if (!copiedPageId) continue;
      const copiedParentId = sourcePage.parentId ? pageIdMap.get(sourcePage.parentId) || null : null;
      const copiedMeta = remapPageMeta(clonePlain(sourcePage.meta), pageIdMap);
      if (copiedParentId || copiedMeta.parentPageId !== sourcePage.meta.parentPageId) {
        updateAdminPage(created.id, copiedPageId, {
          parentId: copiedParentId,
          meta: copiedMeta,
        });
      }
    }

    const finalized = updateAdminSite(created.id, {
      settings: duplicateSiteSettings(source.settings, pageIdMap),
      status: 'draft',
      isPublished: false,
    }) || created;

    await recordAdminAudit({
      siteId: finalized.id,
      actorId: access.session?.user.id,
      entity: 'site',
      entityId: finalized.id,
      action: 'site.duplicated',
      before: source,
      after: finalized,
      metadata: {
        sourceSiteId: source.id,
        sourceSlug: source.slug,
        slug,
        pagesCopied: sourcePages.length,
        source: 'admin-site-duplicate',
      },
      requestId,
    });

    return NextResponse.json(
      {
        success: true,
        requestId,
        data: {
          site: finalized,
          pagesCopied: sourcePages.length,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Admin site duplicate API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
