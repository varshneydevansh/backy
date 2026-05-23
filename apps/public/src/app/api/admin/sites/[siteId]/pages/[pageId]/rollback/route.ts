import { NextRequest, NextResponse } from "next/server";
import type { BackyJsonObject, Site } from "@backy-cms/core";
import { requireAdminAccess } from "@/lib/adminAccess";
import {
  getAdminPageById,
  getSiteByIdOrSlug,
  rollbackAdminPage,
} from "@/lib/backyStore";
import {
  getRequiredDatabaseRepositories,
  shouldUseDemoStoreFallback,
} from "@/lib/repositoryRuntime";
import { recordSiteCacheInvalidation } from "@/lib/cacheInvalidation";
import {
  adminPageFromRepositoryPage,
  pageRevisionSnapshot,
  pageUpdateFromRevisionSnapshot,
  resolveRepositorySite,
} from "@/lib/repositoryContentWorkflow";
import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{
    siteId: string;
    pageId: string;
  }>;
}

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

const pageRollbackWebhookSnapshot = (page: {
  id: string;
  title: string;
  slug: string;
  status: string;
  isHomepage?: boolean;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  updatedAt?: string;
}): BackyJsonObject => ({
  pageId: page.id,
  title: page.title,
  slug: page.slug,
  status: page.status,
  isHomepage: page.isHomepage === true,
  scheduledAt: page.scheduledAt || null,
  publishedAt: page.publishedAt || null,
  updatedAt: page.updatedAt || null,
});

const deliverPageRollbackWebhook = async (params: {
  repositories?: Awaited<
    ReturnType<typeof getRequiredDatabaseRepositories>
  > | null;
  site: Site;
  before: Parameters<typeof pageRollbackWebhookSnapshot>[0];
  after: Parameters<typeof pageRollbackWebhookSnapshot>[0];
  revisionId: string;
  requestId: string;
  actor?: string | null;
}) =>
  deliverSiteWebhooks({
    repositories: params.repositories,
    site: params.site,
    kind: "site-updated",
    requestId: params.requestId,
    actor: params.actor,
    reason: "page.rolledBack",
    data: {
      resourceType: "page",
      before: pageRollbackWebhookSnapshot(params.before),
      after: pageRollbackWebhookSnapshot(params.after),
    },
    metadata: {
      action: "page.rolledBack",
      changedKeys: ["content"],
      source: "admin-page-rollback-api",
      resourceType: "page",
      resourceId: params.after.id,
      slug: params.after.slug,
      status: params.after.status,
      revisionId: params.revisionId,
    },
  });

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();
  const access = await requireAdminAccess(request, requestId, {
    permission: "pages.edit",
  });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, pageId } = await params;
    const body = await parseJsonBody(request);
    const revisionId =
      typeof body.revisionId === "string" ? body.revisionId.trim() : "";

    if (!revisionId) {
      return errorResponse(
        400,
        "VALIDATION_ERROR",
        "revisionId is required",
        requestId,
      );
    }

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);

      if (!site) {
        return errorResponse(
          404,
          "SITE_NOT_FOUND",
          "Site not found",
          requestId,
        );
      }

      const currentPage = await repositories.pages.getById(site.id, pageId);
      const revision = await repositories.contentWorkflows.getRevisionById(
        site.id,
        "page",
        pageId,
        revisionId,
      );

      if (!currentPage || !revision) {
        return errorResponse(
          404,
          "REVISION_NOT_FOUND",
          "Page or revision not found",
          requestId,
        );
      }

      await repositories.contentWorkflows.createRevision({
        siteId: site.id,
        targetType: "page",
        targetId: currentPage.id,
        snapshot: pageRevisionSnapshot(currentPage),
        note: `Before rollback to ${revisionId}`,
        operation: "rollback",
        restoreTargetRevisionId: revisionId,
        createdBy: request.headers.get("x-backy-actor") || "admin",
      });

      const rolledBack = await repositories.pages.update(
        site.id,
        currentPage.id,
        pageUpdateFromRevisionSnapshot(revision.snapshot, currentPage),
      );
      const cacheInvalidation = await recordSiteCacheInvalidation(
        repositories,
        {
          siteId: site.id,
          scope: "content",
          entity: "page",
          entityId: rolledBack.item.id,
          reason: "page-rolled-back",
          requestId,
        },
      );
      await deliverPageRollbackWebhook({
        repositories,
        site,
        before: currentPage,
        after: rolledBack.item,
        revisionId,
        requestId,
        actor: access.session?.user.id,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          page: adminPageFromRepositoryPage(rolledBack.item),
          cacheInvalidation,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }

    const currentPage = getAdminPageById(site.id, pageId);
    const page = rollbackAdminPage(
      site.id,
      pageId,
      revisionId,
      request.headers.get("x-backy-actor") || "admin",
    );

    if (!page) {
      return errorResponse(
        404,
        "REVISION_NOT_FOUND",
        "Page or revision not found",
        requestId,
      );
    }
    await deliverPageRollbackWebhook({
      site: site as unknown as Site,
      before: currentPage || page,
      after: page,
      revisionId,
      requestId,
      actor: access.session?.user.id,
    });

    return NextResponse.json({ success: true, requestId, data: { page } });
  } catch (error) {
    console.error("Admin page rollback API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}
