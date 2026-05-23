import { NextRequest, NextResponse } from "next/server";
import type { BackyJsonObject, BackyPage, Site } from "@backy-cms/core";
import { requireAdminAccess } from "@/lib/adminAccess";
import {
  archiveAdminPage,
  getAdminPageById,
  getSiteByIdOrSlug,
} from "@/lib/backyStore";
import {
  getRequiredDatabaseRepositories,
  shouldUseDemoStoreFallback,
} from "@/lib/repositoryRuntime";
import { pageRevisionSnapshot } from "@/lib/repositoryContentWorkflow";
import { recordSiteCacheInvalidation } from "@/lib/cacheInvalidation";
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
  details?: unknown,
) =>
  NextResponse.json(
    { success: false, requestId, error: { code, message, details } },
    { status },
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseJsonBody = async (
  request: NextRequest,
): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
};

const adminPageFromRepositoryPage = (page: BackyPage) => {
  const canvasSize = isRecord(page.content.metadata?.canvasSize)
    ? page.content.metadata.canvasSize
    : { width: 1200, height: 900 };
  return {
    ...page,
    content: {
      elements: page.content.elements,
      canvasSize,
      customCSS:
        typeof page.content.metadata?.customCSS === "string"
          ? page.content.metadata.customCSS
          : undefined,
      customJS:
        typeof page.content.metadata?.customJS === "string"
          ? page.content.metadata.customJS
          : undefined,
      contentDocument: page.content,
    },
  };
};

const pageArchiveWebhookSnapshot = (page: {
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

const deliverPageArchiveWebhook = async (params: {
  repositories?: Awaited<
    ReturnType<typeof getRequiredDatabaseRepositories>
  > | null;
  site: Site;
  before: Parameters<typeof pageArchiveWebhookSnapshot>[0];
  after: Parameters<typeof pageArchiveWebhookSnapshot>[0];
  requestId: string;
  actor?: string | null;
}) =>
  deliverSiteWebhooks({
    repositories: params.repositories,
    site: params.site,
    kind: "site-updated",
    requestId: params.requestId,
    actor: params.actor,
    reason: "page.archived",
    data: {
      resourceType: "page",
      before: pageArchiveWebhookSnapshot(params.before),
      after: pageArchiveWebhookSnapshot(params.after),
    },
    metadata: {
      action: "page.archived",
      changedKeys: ["content"],
      source: "admin-page-archive-api",
      resourceType: "page",
      resourceId: params.after.id,
      slug: params.after.slug,
      status: params.after.status,
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
    const expectedUpdatedAt =
      typeof body.expectedUpdatedAt === "string"
        ? body.expectedUpdatedAt.trim()
        : "";
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

      const currentPage = await repositories.pages.getById(site.id, pageId);

      if (!currentPage) {
        return errorResponse(
          404,
          "PAGE_NOT_FOUND",
          "Page not found",
          requestId,
        );
      }

      if (expectedUpdatedAt && expectedUpdatedAt !== currentPage.updatedAt) {
        return errorResponse(
          409,
          "PAGE_VERSION_CONFLICT",
          "Page has changed since the editor loaded it",
          requestId,
          {
            pageId: currentPage.id,
            expectedUpdatedAt,
            currentUpdatedAt: currentPage.updatedAt,
            currentPage: adminPageFromRepositoryPage(currentPage),
          },
        );
      }

      await repositories.contentWorkflows.createRevision({
        siteId: site.id,
        targetType: "page",
        targetId: currentPage.id,
        snapshot: pageRevisionSnapshot(currentPage),
        note: "Before archive",
        operation: "archive",
        createdBy: request.headers.get("x-backy-actor") || "admin",
      });
      const archived = await repositories.pages.archive(site.id, pageId);
      const cacheInvalidation = await recordSiteCacheInvalidation(
        repositories,
        {
          siteId: site.id,
          scope: "content",
          entity: "page",
          entityId: pageId,
          reason: "page-archived",
          requestId,
        },
      );
      await deliverPageArchiveWebhook({
        repositories,
        site,
        before: currentPage,
        after: archived.item,
        requestId,
        actor: access.session?.user.id,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          page: adminPageFromRepositoryPage(archived.item),
          cacheInvalidation,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }

    const currentPage = getAdminPageById(site.id, pageId);

    if (!currentPage) {
      return errorResponse(404, "PAGE_NOT_FOUND", "Page not found", requestId);
    }

    if (expectedUpdatedAt && expectedUpdatedAt !== currentPage.updatedAt) {
      return errorResponse(
        409,
        "PAGE_VERSION_CONFLICT",
        "Page has changed since the editor loaded it",
        requestId,
        {
          pageId: currentPage.id,
          expectedUpdatedAt,
          currentUpdatedAt: currentPage.updatedAt,
          currentPage,
        },
      );
    }

    const page = archiveAdminPage(
      site.id,
      pageId,
      request.headers.get("x-backy-actor") || "admin",
    );

    if (!page) {
      return errorResponse(404, "PAGE_NOT_FOUND", "Page not found", requestId);
    }
    await deliverPageArchiveWebhook({
      site: site as unknown as Site,
      before: currentPage,
      after: page,
      requestId,
      actor: access.session?.user.id,
    });

    return NextResponse.json({ success: true, requestId, data: { page } });
  } catch (error) {
    console.error("Admin page archive API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}
