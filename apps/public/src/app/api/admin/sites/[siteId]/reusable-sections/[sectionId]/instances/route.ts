/**
 * Admin reusable section instance registry and propagation endpoint.
 *
 * GET  /api/admin/sites/[siteId]/reusable-sections/[sectionId]/instances
 * POST /api/admin/sites/[siteId]/reusable-sections/[sectionId]/instances
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/adminAccess";
import { recordAdminAudit } from "@/lib/adminAudit";
import { readReusableSectionInventory, ReusableSectionInventoryError } from "@/lib/reusableSectionInventory";
import {
  applyReusableSectionPropagation,
  getCollectionByIdOrSlug,
  listCollectionRecords,
  getAdminPageById,
  getBlogPosts,
  getReusableSectionByIdOrSlug,
  getSiteByIdOrSlug,
  getPageSummary,
} from "@/lib/backyStore";
import { recordSiteCacheInvalidation } from "@/lib/cacheInvalidation";
import {
  listReusableSectionInstancesInContent,
  refreshReusableSectionInstancesInContent,
  type ReusableSectionInstance,
  ReusableSectionSourceRootError,
} from "@/lib/reusableSectionInstances";
import {
  getRequiredDatabaseRepositories,
  shouldUseDemoStoreFallback,
} from "@/lib/repositoryRuntime";
import { editorMediaMutationErrorResponse } from "@/lib/editorMediaMutationError";
import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";
import { buildReusableSectionReviewedPreview, isReusableSectionReviewedPreview, sameReusableSectionReviewedPreview } from '@/lib/reusableSectionPropagation';
import { productCanvasDesign } from "@backy-cms/core";
import type {
  BackyContentDocument,
  BackyReusableSectionPropagationInput,
  BackyReusableSectionPropagationTarget,
  BackyReusableSection,
  BackyPage,
  BackyPost,
  BackyJsonValue,
  Site,
} from "@backy-cms/core";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{
    siteId: string;
    sectionId: string;
  }>;
}

type InstanceTargetType = "page" | "post" | "product";

type ContentTarget = {
  type: InstanceTargetType;
  id: string;
  title: string;
  slug: string;
  status?: string;
  updatedAt?: string;
  content: unknown;
  collectionId?: string;
  values?: Record<string, unknown>;
};

type AdminPage = NonNullable<ReturnType<typeof getAdminPageById>>;

const isAdminPage = (
  value: ReturnType<typeof getAdminPageById>,
): value is AdminPage => Boolean(value);

type InstanceTargetReport = {
  type: InstanceTargetType;
  id: string;
  title: string;
  slug: string;
  status?: string;
  updatedAt?: string;
  instances: ReusableSectionInstance[];
};

const makeRequestId = () =>
  `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (
  status: number,
  code: string,
  message: string,
  requestId: string,
) =>
  NextResponse.json(
    { success: false, requestId, error: { code, message } },
    { status },
  );

const parseJsonBody = async (
  request: NextRequest,
): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const targetTypeFilter = (
  value: string | null | undefined,
): InstanceTargetType | "all" =>
  value === "page" || value === "post" || value === "product" ? value : "all";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

// Products store the same canvas in record values, not page/post content.
const productTarget = (record: {
  id: string;
  collectionId: string;
  slug: string;
  status: string;
  updatedAt: string;
  values: Record<string, unknown>;
}): ContentTarget => {
  const values = record.values;
  const design = productCanvasDesign(values);
  const document = isRecord(design.contentDocument)
    ? design.contentDocument
    : {};
  return {
    type: "product",
    id: record.id,
    collectionId: record.collectionId,
    title: typeof values.title === "string" ? values.title : record.slug,
    slug: record.slug,
    status: record.status,
    updatedAt: record.updatedAt,
    values,
    content: {
      elements: Array.isArray(design.elements)
        ? design.elements
        : document.elements || [],
    },
  };
};

const refreshedProductValues = (target: ContentTarget, content: unknown) => {
  const values = target.values || {};
  const elements = isRecord(content) ? content.elements : [];
  const design = productCanvasDesign(values);
  const document = isRecord(design.contentDocument)
    ? design.contentDocument
    : null;
  const withElements = (value: unknown) => ({
    ...(isRecord(value) ? value : document || {}),
    elements,
  });
  return {
    ...values,
    frontendDesignElements: elements,
    ...(document
      ? {
          frontendDesignContentDocument: withElements(
            values.frontendDesignContentDocument,
          ),
        }
      : {}),
    ...(isRecord(values.design)
      ? {
          design: {
            ...values.design,
            elements,
            frontendDesignElements: elements,
            ...(document
              ? {
                  contentDocument: withElements(values.design.contentDocument),
                  frontendDesignContentDocument: withElements(
                    values.design.frontendDesignContentDocument,
                  ),
                }
              : {}),
          },
        }
      : {}),
  };
};

// Keep page-only readers/editors working without exposing or changing products.
// Explicit product requests must pass both existing collection and commerce gates.
const productAccess = async (
  request: NextRequest,
  requestId: string,
  targetType: InstanceTargetType | "all",
  operation: "view" | "edit",
): Promise<boolean | NextResponse> => {
  if (targetType !== "all" && targetType !== "product") return false;
  for (const permission of [
    `collections.${operation}`,
    `commerce.${operation}`,
  ]) {
    const access = await requireAdminAccess(request, requestId, { permission });
    if (access instanceof NextResponse)
      return targetType === "product" ? access : false;
  }
  return true;
};

const productTargets = async (
  siteId: string,
  repositories?: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
): Promise<ContentTarget[]> => {
  const collection = repositories
    ? await repositories.collections.getBySlug(siteId, "products")
    : getCollectionByIdOrSlug(siteId, "products", { includeUnpublished: true });
  if (!collection) return [];
  const records = await readReusableSectionInventory<Parameters<typeof productTarget>[0] & { siteId: string }>(siteId, async pagination => {
    const input = { includeUnpublished: true, ...pagination };
    if (repositories) return repositories.collections.listRecords({ ...input, siteId, collectionId: collection.id });
    const result = listCollectionRecords(siteId, collection.id, input);
    return { items: result.records, pagination: result.pagination };
  }, record => record.collectionId === collection.id);
  return records.map(productTarget);
};

const targetMatches = (
  target: ContentTarget,
  filter: {
    targetType: InstanceTargetType | "all";
    targetId?: string;
  },
): boolean => {
  if (filter.targetType !== "all" && target.type !== filter.targetType)
    return false;
  if (
    filter.targetId &&
    target.id !== filter.targetId &&
    target.slug !== filter.targetId
  )
    return false;
  return true;
};

const reportInstances = (
  targets: ContentTarget[],
  section: Parameters<typeof listReusableSectionInstancesInContent>[1],
): InstanceTargetReport[] =>
  targets.flatMap((target) => {
    const instances = listReusableSectionInstancesInContent(
      target.content,
      section,
    );
    return instances.length > 0
      ? [
          {
            type: target.type,
            id: target.id,
            title: target.title,
            slug: target.slug,
            status: target.status,
            updatedAt: target.updatedAt,
            instances,
          },
        ]
      : [];
  });

const deliverReusableSectionInstancesWebhook = async (params: {
  repositories?: Awaited<
    ReturnType<typeof getRequiredDatabaseRepositories>
  > | null;
  site: Site;
  section: { id: string; name: string; slug: string; updatedAt?: string };
  refreshedTargets: Array<{
    type: InstanceTargetType;
    id: string;
    title: string;
    slug: string;
    refreshed: number;
  }>;
  targetType: InstanceTargetType | "all";
  targetId?: string | null;
  updatedBy: string;
  requestId: string;
  actor?: string | null;
}) =>
  deliverSiteWebhooks({
    repositories: params.repositories,
    site: params.site,
    kind: "site-updated",
    requestId: params.requestId,
    actor: params.actor,
    reason: "reusableSection.instances.refreshed",
    data: {
      resourceType: "reusableSectionInstances",
      section: {
        id: params.section.id,
        name: params.section.name,
        slug: params.section.slug,
        updatedAt: params.section.updatedAt || null,
      },
      targets: params.refreshedTargets,
      totals: {
        targets: params.refreshedTargets.length,
        instances: params.refreshedTargets.reduce(
          (total, target) => total + target.refreshed,
          0,
        ),
      },
    },
    metadata: {
      action: "reusableSection.instances.refreshed",
      changedKeys: ["content"],
      source: "admin-reusable-section-instances-api",
      resourceType: "reusableSectionInstances",
      resourceId: params.section.id,
      slug: params.section.slug,
      targetType: params.targetType,
      targetId: params.targetId || null,
      updatedBy: params.updatedBy,
      targets: params.refreshedTargets.length,
      instances: params.refreshedTargets.reduce(
        (total, target) => total + target.refreshed,
        0,
      ),
    },
  });

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();
  const access = await requireAdminAccess(request, requestId, {
    permission: "pages.view",
  });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, sectionId } = await params;
    const { searchParams } = new URL(request.url);
    const targetType = targetTypeFilter(
      searchParams.get("targetType") || searchParams.get("type"),
    );
    const targetId = searchParams.get("targetId") || undefined;
    const includeProducts = await productAccess(
      request,
      requestId,
      targetType,
      "view",
    );
    if (includeProducts instanceof NextResponse) return includeProducts;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site =
        (await repositories.sites.getById(siteId)) ||
        (await repositories.sites.getBySlug(siteId));
      if (!site) {
        return errorResponse(
          404,
          "SITE_NOT_FOUND",
          "Site not found",
          requestId,
        );
      }
      const section =
        (await repositories.reusableSections.getById(site.id, sectionId)) ||
        (await repositories.reusableSections.getBySlug(site.id, sectionId));
      if (!section) {
        return errorResponse(
          404,
          "REUSABLE_SECTION_NOT_FOUND",
          "Reusable section not found",
          requestId,
        );
      }

      const [pages, posts] = await Promise.all([
        targetType !== "all" && targetType !== "page"
          ? Promise.resolve({ items: [] })
          : readReusableSectionInventory(site.id, pagination => repositories.pages.list({
              siteId: site.id,
              includeUnpublished: true,
              status: "all",
              ...pagination,
            })).then(items => ({ items })),
        targetType !== "all" && targetType !== "post"
          ? Promise.resolve({ items: [] })
          : readReusableSectionInventory(site.id, pagination => repositories.posts.list({
              siteId: site.id,
              includeUnpublished: true,
              status: "all",
              ...pagination,
            })).then(items => ({ items })),
      ]);
      const targets: ContentTarget[] = [
        ...(includeProducts ? await productTargets(site.id, repositories) : []),
        ...pages.items.map((page) => ({
          type: "page" as const,
          id: page.id,
          title: page.title,
          slug: page.slug,
          status: page.status,
          updatedAt: page.updatedAt,
          content: page.content,
        })),
        ...posts.items.map((post) => ({
          type: "post" as const,
          id: post.id,
          title: post.title,
          slug: post.slug,
          status: post.status,
          updatedAt: post.updatedAt,
          content: post.content,
        })),
      ].filter((target) => targetMatches(target, { targetType, targetId }));
      const targetReports = reportInstances(targets, section);

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          sectionId: section.id,
          sourceUpdatedAt: section.updatedAt,
          targets: targetReports,
          totals: {
            targets: targetReports.length,
            instances: targetReports.reduce(
              (total, target) => total + target.instances.length,
              0,
            ),
            stale: targetReports.reduce(
              (total, target) =>
                total +
                target.instances.filter((instance) => instance.stale).length,
              0,
            ),
          },
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }
    const section = getReusableSectionByIdOrSlug(site.id, sectionId);
    if (!section) {
      return errorResponse(
        404,
        "REUSABLE_SECTION_NOT_FOUND",
        "Reusable section not found",
        requestId,
      );
    }

    const pageTargets: ContentTarget[] =
      targetType !== "all" && targetType !== "page"
        ? []
        : getPageSummary(site.id, { includeUnpublished: true })
            .map((page) => getAdminPageById(site.id, page.id))
            .filter(isAdminPage)
            .map((page) => ({
              type: "page" as const,
              id: page.id,
              title: page.title,
              slug: page.slug,
              status: page.status,
              updatedAt: page.updatedAt,
              content: page.content,
            }));
    const postTargets: ContentTarget[] =
      targetType !== "all" && targetType !== "post"
        ? []
        : (await readReusableSectionInventory(site.id, async pagination => {
            const result = getBlogPosts(site.id, { includeUnpublished: true, ...pagination });
            if (!result.pagination) throw new ReusableSectionInventoryError();
            return { items: result.posts, pagination: result.pagination };
          })).map((post) => ({
            type: "post" as const,
            id: post.id,
            title: post.title,
            slug: post.slug,
            status: post.status,
            updatedAt: post.updatedAt,
            content: post.content,
          }));
    const targetReports = reportInstances(
      [
        ...pageTargets,
        ...postTargets,
        ...(includeProducts ? await productTargets(site.id) : []),
      ].filter((target) => targetMatches(target, { targetType, targetId })),
      section,
    );

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        sectionId: section.id,
        sourceUpdatedAt: section.updatedAt,
        targets: targetReports,
        totals: {
          targets: targetReports.length,
          instances: targetReports.reduce(
            (total, target) => total + target.instances.length,
            0,
          ),
          stale: targetReports.reduce(
            (total, target) =>
              total +
              target.instances.filter((instance) => instance.stale).length,
            0,
          ),
        },
      },
    });
  } catch (error) {
    if (error instanceof ReusableSectionInventoryError) return errorResponse(503, error.code, error.message, requestId);
    if (error instanceof ReusableSectionSourceRootError) return errorResponse(409, error.code, error.message, requestId);
    console.error("Admin reusable section instances API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.edit' });
  if (access instanceof NextResponse) return access;
  try {
    const { siteId, sectionId } = await params;
    const body = await parseJsonBody(request);
    const targetType = targetTypeFilter(typeof body.targetType === 'string' ? body.targetType : undefined);
    const targetId = typeof body.targetId === 'string' && body.targetId.trim() ? body.targetId.trim() : undefined;
    const dryRun = body.dryRun === true;
    const includeProducts = await productAccess(request, requestId, targetType, 'edit');
    if (includeProducts instanceof NextResponse) return includeProducts;
    const repositories = shouldUseDemoStoreFallback() ? undefined : await getRequiredDatabaseRepositories();
    const site = repositories ? (await repositories.sites.getById(siteId)) || (await repositories.sites.getBySlug(siteId)) : getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    const section = repositories ? (await repositories.reusableSections.getById(site.id, sectionId)) || (await repositories.reusableSections.getBySlug(site.id, sectionId)) : getReusableSectionByIdOrSlug(site.id, sectionId);
    if (!section) return errorResponse(404, 'REUSABLE_SECTION_NOT_FOUND', 'Reusable section not found', requestId);
    const targets: ContentTarget[] = [];
    for (const type of ['page','post'] as const) {
      if (targetType !== 'all' && targetType !== type) continue;
      if (repositories) {
        const items = await readReusableSectionInventory<BackyPage | BackyPost>(site.id, pagination => (type === 'page' ? repositories.pages : repositories.posts).list({ siteId: site.id, includeUnpublished: true, status: 'all', ...pagination }));
        targets.push(...items.map(item => ({ type, id: item.id, title: item.title, slug: item.slug, status: item.status, updatedAt: item.updatedAt, content: item.content })));
      } else if (type === 'page') {
        targets.push(...getPageSummary(site.id, { includeUnpublished: true }).map(page => getAdminPageById(site.id, page.id)).filter(isAdminPage).map(item => ({ type, id: item.id, title: item.title, slug: item.slug, status: item.status, updatedAt: item.updatedAt, content: item.content })));
      } else {
        const items = await readReusableSectionInventory(site.id, async pagination => {
          const result = getBlogPosts(site.id, { includeUnpublished: true, ...pagination });
          if (!result.pagination) throw new ReusableSectionInventoryError();
          return { items: result.posts, pagination: result.pagination };
        });
        targets.push(...items.map(item => ({ type, id: item.id, title: item.title, slug: item.slug, status: item.status, updatedAt: item.updatedAt, content: item.content })));
      }
    }
    if (includeProducts) targets.push(...await productTargets(site.id, repositories));
    const selected = targets.filter(target => targetMatches(target, { targetType, targetId }));
    if (selected.length > 100000) throw new ReusableSectionInventoryError();
    const inventory: BackyReusableSectionPropagationTarget[] = selected.map(target => ({ type: target.type, id: target.id, collectionId: target.collectionId, updatedAt: target.updatedAt || '', ...(target.type === 'product' ? { values: target.values } : { content: target.content }) }));
    const scope = { targetType, targetId: targetId || null, includeProducts };
    const reviewedPreview = buildReusableSectionReviewedPreview(site.id, section, scope, inventory);
    const plans = selected.map(target => ({ target, result: refreshReusableSectionInstancesInContent(target.content, section) })).filter(plan => plan.result.refreshed > 0);
    const refreshedTargets = plans.map(({ target, result }) => ({ type: target.type, id: target.id, title: target.title, slug: target.slug, refreshed: result.refreshed }));
    if (!dryRun && !isReusableSectionReviewedPreview(body.reviewedPreview)) return errorResponse(400, 'VALIDATION_ERROR', 'A reviewed dry-run preview is required before refreshing instances.', requestId);
    if (!dryRun && !sameReusableSectionReviewedPreview(body.reviewedPreview as Parameters<typeof sameReusableSectionReviewedPreview>[0], reviewedPreview)) return errorResponse(409, 'REUSABLE_SECTION_PREVIEW_CONFLICT', 'The source, scope, or target inventory changed. Reload and review the dry-run preview.', requestId);
    const productCollection = includeProducts ? repositories ? await repositories.collections.getBySlug(site.id, 'products') : getCollectionByIdOrSlug(site.id, 'products', { includeUnpublished: true }) : undefined;
    const input: BackyReusableSectionPropagationInput = { source: section as unknown as BackyReusableSection, scope: { targetType, targetId, includeProducts, productCollectionId: productCollection?.id }, inventory,
      mutations: plans.map(({ target, result }) => ({ expected: inventory.find(item => item.type === target.type && item.id === target.id)!, ...(target.type === 'product' ? { values: refreshedProductValues(target, result.content) as Record<string, BackyJsonValue> } : { content: result.content as BackyContentDocument }) })),
    };
    const completionWarnings: string[] = [];
    let cacheInvalidation: unknown = null;
    const updatedBy = access.session?.user.id || 'api-key';
    if (!dryRun) {
      if (repositories) {
        if (typeof repositories.reusableSections.applyPropagation !== 'function') return errorResponse(503, 'REUSABLE_SECTION_PROPAGATION_UNAVAILABLE', 'Atomic section propagation is unavailable on this repository adapter.', requestId);
        await repositories.reusableSections.applyPropagation(site.id, input);
        try { cacheInvalidation = await recordSiteCacheInvalidation(repositories, { siteId: site.id, scope: 'content', entity: 'reusableSection', entityId: section.id, reason: 'reusable-section-instances-refreshed', requestId }); }
        catch { completionWarnings.push('Content committed; cache invalidation needs retry.'); }
      } else completionWarnings.push(...applyReusableSectionPropagation(site.id, input, updatedBy));
      try { await recordAdminAudit({ repositories, siteId: site.id, entity: 'reusableSection', entityId: section.id, action: 'reusableSection.instances.refresh', after: { refreshedTargets }, metadata: { targetType, targetId: targetId || null, updatedBy, targets: refreshedTargets.length, instances: refreshedTargets.reduce((sum, target) => sum + target.refreshed, 0) }, requestId }); }
      catch { completionWarnings.push('Content committed; audit recording needs retry.'); }
      if (refreshedTargets.length > 0) {
        try { await deliverReusableSectionInstancesWebhook({ repositories, site: site as unknown as Site, section, refreshedTargets, targetType, targetId, updatedBy, requestId, actor: access.session?.user.id }); }
        catch { completionWarnings.push('Content committed; webhook delivery needs retry.'); }
      }
    }
    return NextResponse.json({ success: true, requestId, data: { dryRun, sectionId: section.id, sourceUpdatedAt: section.updatedAt, reviewedPreview, refreshedTargets,
      totals: { targets: refreshedTargets.length, instances: refreshedTargets.reduce((sum, target) => sum + target.refreshed, 0) }, cacheInvalidation,
      outcome: completionWarnings.length ? 'partial' : 'complete', completionWarnings: [...new Set(completionWarnings)],
      concurrencyBoundary: repositories ? 'database-serializable-transaction' : 'demo-single-process',
    } });
  } catch (error) {
    if (error instanceof ReusableSectionInventoryError) return errorResponse(503, error.code, error.message, requestId);
    if (error instanceof ReusableSectionSourceRootError) return errorResponse(409, error.code, error.message, requestId);
    if (error && typeof error === 'object' && (error as { code?: string }).code === 'REUSABLE_SECTION_PROPAGATION_CONFLICT') return errorResponse(409, 'REUSABLE_SECTION_PROPAGATION_CONFLICT', 'The source or targets changed during apply. Reload and review the preview; no refresh writes committed.', requestId);
    if (error && typeof error === 'object' && (error as { code?: string }).code === 'REUSABLE_SECTION_PROPAGATION_UNAVAILABLE') return errorResponse(503, 'REUSABLE_SECTION_PROPAGATION_UNAVAILABLE', 'Serializable section propagation requires the PostgreSQL adapter.', requestId);
    const mediaAdmissionError = editorMediaMutationErrorResponse(error, requestId);
    if (mediaAdmissionError) return mediaAdmissionError;
    console.error('Admin reusable section propagation error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Section propagation failed; its content transaction did not commit.', requestId);
  }
}
