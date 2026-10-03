/**
 * Admin reusable section instance registry and propagation endpoint.
 *
 * GET  /api/admin/sites/[siteId]/reusable-sections/[sectionId]/instances
 * POST /api/admin/sites/[siteId]/reusable-sections/[sectionId]/instances
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/adminAccess";
import { recordAdminAudit } from "@/lib/adminAudit";
import {
  getCollectionByIdOrSlug,
  listCollectionRecords,
  updateAdminCollectionRecord,
  getAdminPageById,
  getBlogPosts,
  getReusableSectionByIdOrSlug,
  getSiteByIdOrSlug,
  getPageSummary,
  updateAdminBlogPost,
  updateAdminPage,
} from "@/lib/backyStore";
import { recordSiteCacheInvalidation } from "@/lib/cacheInvalidation";
import {
  listReusableSectionInstancesInContent,
  refreshReusableSectionInstancesInContent,
  type ReusableSectionInstance,
} from "@/lib/reusableSectionInstances";
import {
  getRequiredDatabaseRepositories,
  shouldUseDemoStoreFallback,
} from "@/lib/repositoryRuntime";
import { syncRepositoryCollectionRecordMediaReferences } from "@/lib/repositoryMediaReferenceSync";
import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";
import { productCanvasDesign } from "@backy-cms/core";
import type {
  BackyContentDocument,
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
  const targets: ContentTarget[] = [];
  let offset = 0;
  while (true) {
    const input = { includeUnpublished: true, limit: 100, offset };
    const result = repositories
      ? await repositories.collections.listRecords({
          ...input,
          siteId,
          collectionId: collection.id,
        })
      : listCollectionRecords(siteId, collection.id, input);
    const records = "items" in result ? result.items : result.records;
    targets.push(...records.map(productTarget));
    if (!result.pagination.hasMore || records.length === 0) break;
    offset += records.length;
  }
  return targets;
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
          : repositories.pages.list({
              siteId: site.id,
              includeUnpublished: true,
              status: "all",
              limit: 1000,
              offset: 0,
            }),
        targetType !== "all" && targetType !== "post"
          ? Promise.resolve({ items: [] })
          : repositories.posts.list({
              siteId: site.id,
              includeUnpublished: true,
              status: "all",
              limit: 1000,
              offset: 0,
            }),
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
        : getBlogPosts(site.id, {
            includeUnpublished: true,
            limit: 1000,
            offset: 0,
          }).posts.map((post) => ({
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
  const requestId = request.headers.get("x-request-id") || makeRequestId();
  const access = await requireAdminAccess(request, requestId, {
    permission: "pages.edit",
  });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, sectionId } = await params;
    const body = await parseJsonBody(request);
    const targetType = targetTypeFilter(
      typeof body.targetType === "string" ? body.targetType : undefined,
    );
    const targetId =
      typeof body.targetId === "string" && body.targetId.trim()
        ? body.targetId.trim()
        : undefined;
    const dryRun = body.dryRun === true;
    const includeProducts = await productAccess(
      request,
      requestId,
      targetType,
      "edit",
    );
    if (includeProducts instanceof NextResponse) return includeProducts;
    const updatedBy =
      typeof body.updatedBy === "string" && body.updatedBy.trim()
        ? body.updatedBy.trim()
        : "admin";

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
          : repositories.pages.list({
              siteId: site.id,
              includeUnpublished: true,
              status: "all",
              limit: 1000,
              offset: 0,
            }),
        targetType !== "all" && targetType !== "post"
          ? Promise.resolve({ items: [] })
          : repositories.posts.list({
              siteId: site.id,
              includeUnpublished: true,
              status: "all",
              limit: 1000,
              offset: 0,
            }),
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
      const refreshedTargets = [];
      for (const target of targets) {
        const result = refreshReusableSectionInstancesInContent(
          target.content,
          section,
        );
        if (result.refreshed === 0) continue;
        refreshedTargets.push({
          type: target.type,
          id: target.id,
          title: target.title,
          slug: target.slug,
          refreshed: result.refreshed,
        });
        if (dryRun) continue;
        if (target.type === "product" && target.collectionId) {
          const values = refreshedProductValues(
            target,
            result.content,
          ) as Record<string, BackyJsonValue>;
          await repositories.collections.updateRecord(
            site.id,
            target.collectionId,
            target.id,
            { values },
          );
          await syncRepositoryCollectionRecordMediaReferences({
            mediaRepository: repositories.media,
            siteId: site.id,
            collectionId: target.collectionId,
            recordId: target.id,
            values,
          });
        } else if (target.type === "page") {
          await repositories.pages.update(site.id, target.id, {
            content: result.content as BackyContentDocument,
            revisionNote: `Refresh reusable section ${section.name}`,
          });
        } else {
          await repositories.posts.update(site.id, target.id, {
            content: result.content as BackyContentDocument,
            revisionNote: `Refresh reusable section ${section.name}`,
          });
        }
      }
      const cacheInvalidation = dryRun
        ? null
        : await recordSiteCacheInvalidation(repositories, {
            siteId: site.id,
            scope: "content",
            entity: "reusableSection",
            entityId: section.id,
            reason: "reusable-section-instances-refreshed",
            requestId,
          });
      if (!dryRun) {
        await recordAdminAudit({
          repositories,
          siteId: site.id,
          entity: "reusableSection",
          entityId: section.id,
          action: "reusableSection.instances.refresh",
          after: {
            refreshedTargets,
          },
          metadata: {
            targetType,
            targetId: targetId || null,
            updatedBy,
            targets: refreshedTargets.length,
            instances: refreshedTargets.reduce(
              (total, target) => total + target.refreshed,
              0,
            ),
          },
          requestId,
        });
        if (refreshedTargets.length > 0) {
          await deliverReusableSectionInstancesWebhook({
            repositories,
            site,
            section,
            refreshedTargets,
            targetType,
            targetId,
            updatedBy,
            requestId,
            actor: access.session?.user.id,
          });
        }
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          dryRun,
          sectionId: section.id,
          sourceUpdatedAt: section.updatedAt,
          refreshedTargets,
          totals: {
            targets: refreshedTargets.length,
            instances: refreshedTargets.reduce(
              (total, target) => total + target.refreshed,
              0,
            ),
          },
          cacheInvalidation,
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
        : getBlogPosts(site.id, {
            includeUnpublished: true,
            limit: 1000,
            offset: 0,
          }).posts.map((post) => ({
            type: "post" as const,
            id: post.id,
            title: post.title,
            slug: post.slug,
            status: post.status,
            updatedAt: post.updatedAt,
            content: post.content,
          }));
    const targets = [
      ...pageTargets,
      ...postTargets,
      ...(includeProducts ? await productTargets(site.id) : []),
    ].filter((target) => targetMatches(target, { targetType, targetId }));
    const refreshedTargets = [];
    for (const target of targets) {
      const result = refreshReusableSectionInstancesInContent(
        target.content,
        section,
      );
      if (result.refreshed === 0) continue;
      refreshedTargets.push({
        type: target.type,
        id: target.id,
        title: target.title,
        slug: target.slug,
        refreshed: result.refreshed,
      });
      if (dryRun) continue;
      if (target.type === "product" && target.collectionId) {
        updateAdminCollectionRecord(site.id, target.collectionId, target.id, {
          values: refreshedProductValues(target, result.content),
        });
      } else if (target.type === "page") {
        updateAdminPage(site.id, target.id, {
          content: result.content,
          updatedBy,
          revisionNote: `Refresh reusable section ${section.name}`,
        });
      } else {
        updateAdminBlogPost(site.id, target.id, {
          content: result.content,
          updatedBy,
          revisionNote: `Refresh reusable section ${section.name}`,
        });
      }
    }
    if (!dryRun) {
      await recordAdminAudit({
        siteId: site.id,
        entity: "reusableSection",
        entityId: section.id,
        action: "reusableSection.instances.refresh",
        after: {
          refreshedTargets,
        },
        metadata: {
          targetType,
          targetId: targetId || null,
          updatedBy,
          targets: refreshedTargets.length,
          instances: refreshedTargets.reduce(
            (total, target) => total + target.refreshed,
            0,
          ),
        },
        requestId,
      });
      if (refreshedTargets.length > 0) {
        await deliverReusableSectionInstancesWebhook({
          site: site as unknown as Site,
          section,
          refreshedTargets,
          targetType,
          targetId,
          updatedBy,
          requestId,
          actor: access.session?.user.id,
        });
      }
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        dryRun,
        sectionId: section.id,
        sourceUpdatedAt: section.updatedAt,
        refreshedTargets,
        totals: {
          targets: refreshedTargets.length,
          instances: refreshedTargets.reduce(
            (total, target) => total + target.refreshed,
            0,
          ),
        },
      },
    });
  } catch (error) {
    console.error("Admin reusable section instances refresh API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}
