/**
 * Admin page detail endpoint.
 *
 * GET    /api/admin/sites/[siteId]/pages/[pageId]
 * PATCH  /api/admin/sites/[siteId]/pages/[pageId]
 * DELETE /api/admin/sites/[siteId]/pages/[pageId]
 */

import { NextRequest, NextResponse } from "next/server";
import {
  canvasElementsToBackyContentDocument,
  isBackyContentDocument,
  type BackyJsonObject,
  type BackyContentDocument,
  type BackyPage,
  type Site,
} from "@backy-cms/core";
import {
  deleteAdminPage,
  getAdminPageById,
  getPageByPath,
  getSiteByIdOrSlug,
  listCollections,
  updateAdminPage,
  type StorePage,
} from "@/lib/backyStore";
import { requireAdminAccess } from "@/lib/adminAccess";
import {
  normalizeScheduledAtInput,
  statusRequiresPublishPermission,
  validateScheduledContentStatus,
} from "@/lib/adminContentStatusPolicy";
import {
  getRequiredDatabaseRepositories,
  shouldUseDemoStoreFallback,
} from "@/lib/repositoryRuntime";
import { pageRevisionSnapshot } from "@/lib/repositoryContentWorkflow";
import { findPageRouteConflict } from "@/lib/routeConflicts";
import { recordSiteCacheInvalidation } from "@/lib/cacheInvalidation";
import { recordAdminAudit } from "@/lib/adminAudit";
import { getRepositoryPageByPublicPath } from "@/lib/repositoryPages";
import {
  buildPageReadiness,
  buildRepositoryPageReadiness,
  readinessBlockingChecks,
} from "@/lib/siteReadiness";
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
  details?: Record<string, unknown>,
) =>
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

const normalizeSlug = (value: unknown): string =>
  typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    : "";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const statusFromInput = (
  value: unknown,
): "draft" | "published" | "scheduled" | "archived" | undefined =>
  value === "draft" ||
  value === "published" ||
  value === "scheduled" ||
  value === "archived"
    ? value
    : undefined;

const hasBodyKey = (body: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(body, key);

const pageStatusValidationError = (
  body: Record<string, unknown>,
  requestId: string,
) => {
  if (
    hasBodyKey(body, "status") &&
    body.status !== undefined &&
    !statusFromInput(body.status)
  ) {
    return errorResponse(
      400,
      "INVALID_PAGE_STATUS",
      "Invalid page status. Use draft, published, scheduled, or archived.",
      requestId,
    );
  }

  if (
    hasBodyKey(body, "scheduledAt") &&
    body.scheduledAt !== undefined &&
    body.scheduledAt !== null &&
    (typeof body.scheduledAt !== "string" ||
      (body.scheduledAt.trim().length > 0 &&
        Number.isNaN(Date.parse(body.scheduledAt))))
  ) {
    return errorResponse(
      400,
      "SCHEDULED_AT_INVALID",
      "scheduledAt must be a valid date-time string.",
      requestId,
    );
  }

  return null;
};

const pageStatusMutationRequiresPublishPermission = (
  currentStatus: "draft" | "published" | "scheduled" | "archived",
  nextStatus: "draft" | "published" | "scheduled" | "archived",
) =>
  statusRequiresPublishPermission(nextStatus) ||
  ((currentStatus === "published" || currentStatus === "scheduled") &&
    nextStatus === "draft");

const contentDocumentFromInput = (
  rawContent: unknown,
  fallback: BackyPage,
  input: {
    title: string;
    slug: string;
    status: "draft" | "published" | "scheduled" | "archived";
  },
): BackyContentDocument | undefined => {
  if (rawContent === undefined) {
    return undefined;
  }
  if (isBackyContentDocument(rawContent)) {
    return rawContent;
  }
  if (
    isRecord(rawContent) &&
    isBackyContentDocument(rawContent.contentDocument)
  ) {
    return rawContent.contentDocument;
  }

  return canvasElementsToBackyContentDocument({
    id: fallback.id,
    kind: "page",
    title: input.title,
    slug: input.slug,
    status: input.status,
    elements:
      isRecord(rawContent) && Array.isArray(rawContent.elements)
        ? rawContent.elements
        : Array.isArray(rawContent)
          ? rawContent
          : [],
    canvasSize: isRecord(rawContent) ? rawContent.canvasSize : undefined,
    customCSS:
      isRecord(rawContent) && typeof rawContent.customCSS === "string"
        ? rawContent.customCSS
        : undefined,
  });
};

const storePageContentFromInput = (
  rawContent: unknown,
  fallback: StorePage["content"],
): StorePage["content"] => {
  if (rawContent === undefined) {
    return fallback;
  }

  const contentInput = isRecord(rawContent) ? rawContent : {};
  const canvasSizeInput = isRecord(contentInput.canvasSize)
    ? contentInput.canvasSize
    : {};

  return {
    elements: (isRecord(rawContent) && Array.isArray(rawContent.elements)
      ? rawContent.elements
      : Array.isArray(rawContent)
        ? rawContent
        : []) as StorePage["content"]["elements"],
    canvasSize: {
      width:
        Number(canvasSizeInput.width) || fallback.canvasSize?.width || 1200,
      height:
        Number(canvasSizeInput.height) || fallback.canvasSize?.height || 900,
    },
    customCSS:
      typeof contentInput.customCSS === "string"
        ? contentInput.customCSS
        : fallback.customCSS,
    customJS:
      typeof contentInput.customJS === "string"
        ? contentInput.customJS
        : fallback.customJS,
    contentDocument: isBackyContentDocument(rawContent)
      ? rawContent
      : isBackyContentDocument(contentInput.contentDocument)
        ? contentInput.contentDocument
        : fallback.contentDocument,
  };
};

const pageContentValidationError = (
  rawContent: unknown,
  requestId: string,
) => {
  if (rawContent === undefined) {
    return null;
  }

  if (Array.isArray(rawContent) || isBackyContentDocument(rawContent)) {
    return null;
  }

  if (!isRecord(rawContent)) {
    return errorResponse(
      400,
      "INVALID_PAGE_CONTENT",
      "Page content must be a canvas content object, content document, or element array.",
      requestId,
    );
  }

  if (rawContent.elements !== undefined && !Array.isArray(rawContent.elements)) {
    return errorResponse(
      400,
      "INVALID_PAGE_CONTENT_ELEMENTS",
      "Page content elements must be an array.",
      requestId,
    );
  }

  if (rawContent.canvasSize !== undefined) {
    if (!isRecord(rawContent.canvasSize)) {
      return errorResponse(
        400,
        "INVALID_PAGE_CANVAS_SIZE",
        "Page canvasSize must include positive numeric width and height.",
        requestId,
      );
    }

    const width = Number(rawContent.canvasSize.width);
    const height = Number(rawContent.canvasSize.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return errorResponse(
        400,
        "INVALID_PAGE_CANVAS_SIZE",
        "Page canvasSize must include positive numeric width and height.",
        requestId,
      );
    }
  }

  return null;
};

const rejectIfReadinessBlocked = (
  status: "draft" | "published" | "scheduled" | "archived",
  readiness: ReturnType<typeof buildPageReadiness>,
  requestId: string,
) => {
  if (!statusRequiresPublishPermission(status)) {
    return null;
  }

  const checks = readinessBlockingChecks(readiness);
  return checks.length > 0
    ? errorResponse(
        400,
        "READINESS_BLOCKED",
        "Resolve page readiness errors before publishing",
        requestId,
        { readiness, checks },
      )
    : null;
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
      contentDocument: page.content,
    },
  };
};

const pageAuditMetadata = (page: {
  id: string;
  title: string;
  slug: string;
  status: string;
  scheduledAt?: string | null;
  isHomepage?: boolean;
  parentId?: string | null;
}): BackyJsonObject => ({
  pageId: page.id,
  title: page.title,
  slug: page.slug,
  status: page.status,
  scheduledAt: page.scheduledAt || null,
  isHomepage: page.isHomepage === true,
  parentId: page.parentId || null,
});

const updateAuditMetadata = (
  page: Parameters<typeof pageAuditMetadata>[0],
  body: Record<string, unknown>,
): BackyJsonObject => ({
  ...pageAuditMetadata(page),
  changedFields: Object.keys(body).filter((key) => key !== "expectedUpdatedAt"),
});

const deliverPageContentWebhook = async (params: {
  repositories?: Awaited<
    ReturnType<typeof getRequiredDatabaseRepositories>
  > | null;
  site: Site;
  action: "page.updated" | "page.deleted";
  before?: Parameters<typeof pageAuditMetadata>[0];
  after?: Parameters<typeof pageAuditMetadata>[0];
  changedFields?: string[];
  requestId: string;
  actor?: string | null;
}) =>
  deliverSiteWebhooks({
    repositories: params.repositories,
    site: params.site,
    kind: "site-updated",
    requestId: params.requestId,
    actor: params.actor,
    reason: params.action,
    data: {
      resourceType: "page",
      ...(params.before ? { before: pageAuditMetadata(params.before) } : {}),
      ...(params.after ? { after: pageAuditMetadata(params.after) } : {}),
    },
    metadata: {
      action: params.action,
      changedKeys: ["content"],
      source: "admin-page-detail-api",
      resourceType: "page",
      resourceId: (params.after || params.before)?.id || null,
      slug: (params.after || params.before)?.slug || null,
      status: (params.after || params.before)?.status || null,
      changedFields: params.changedFields || [],
    },
  });

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();
  const access = await requireAdminAccess(request, requestId, {
    permission: "pages.view",
  });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, pageId } = await params;
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

      const page = await repositories.pages.getById(site.id, pageId);

      if (!page) {
        return errorResponse(
          404,
          "PAGE_NOT_FOUND",
          "Page not found",
          requestId,
        );
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          page: adminPageFromRepositoryPage(page),
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }

    const page = getAdminPageById(site.id, pageId);

    if (!page) {
      return errorResponse(404, "PAGE_NOT_FOUND", "Page not found", requestId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        page,
      },
    });
  } catch (error) {
    console.error("Admin page detail API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();
  const access = await requireAdminAccess(request, requestId, {
    permission: "pages.edit",
  });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, pageId } = await params;
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

      const page = await repositories.pages.getById(site.id, pageId);

      if (!page) {
        return errorResponse(
          404,
          "PAGE_NOT_FOUND",
          "Page not found",
          requestId,
        );
      }

      const body = await parseJsonBody(request);
      const statusValidationError = pageStatusValidationError(body, requestId);
      if (statusValidationError) {
        return statusValidationError;
      }
      const contentValidationError = pageContentValidationError(
        body.content,
        requestId,
      );
      if (contentValidationError) {
        return contentValidationError;
      }
      const expectedUpdatedAt =
        typeof body.expectedUpdatedAt === "string"
          ? body.expectedUpdatedAt.trim()
          : "";
      if (expectedUpdatedAt && expectedUpdatedAt !== page.updatedAt) {
        return errorResponse(
          409,
          "PAGE_VERSION_CONFLICT",
          "Page has changed since the editor loaded it",
          requestId,
          {
            pageId: page.id,
            expectedUpdatedAt,
            currentUpdatedAt: page.updatedAt,
            currentPage: adminPageFromRepositoryPage(page),
          },
        );
      }

      const nextIsHomepage =
        typeof body.isHomepage === "boolean"
          ? body.isHomepage
          : page.isHomepage;
      const nextSlug = nextIsHomepage
        ? "index"
        : body.slug === undefined
          ? page.slug
          : normalizeSlug(body.slug);

      if (!nextIsHomepage && body.slug !== undefined && !nextSlug) {
        return errorResponse(
          400,
          "VALIDATION_ERROR",
          "Page slug is required",
          requestId,
        );
      }

      if (
        nextSlug &&
        (nextSlug !== page.slug || nextIsHomepage !== page.isHomepage)
      ) {
        const conflict = await getRepositoryPageByPublicPath(
          repositories,
          site.id,
          nextSlug,
        );
        if (conflict && conflict.id !== page.id) {
          return errorResponse(
            409,
            "SLUG_CONFLICT",
            "A page with this slug already exists",
            requestId,
          );
        }
      }

      const status = statusFromInput(body.status) || page.status;
      const scheduledAt = normalizeScheduledAtInput(body.scheduledAt);
      const nextScheduledAt =
        scheduledAt === undefined ? page.scheduledAt || null : scheduledAt;
      if (
        body.status !== undefined &&
        pageStatusMutationRequiresPublishPermission(page.status, status)
      ) {
        const publishAccess = await requireAdminAccess(request, requestId, {
          permission: "pages.publish",
        });
        if (publishAccess instanceof NextResponse) {
          return publishAccess;
        }
      }
      const scheduleValidation = validateScheduledContentStatus(
        status,
        nextScheduledAt,
      );
      if (!scheduleValidation.ok) {
        return errorResponse(
          400,
          scheduleValidation.code,
          scheduleValidation.message,
          requestId,
        );
      }
      const title = typeof body.title === "string" ? body.title : page.title;
      const collections = await repositories.collections.list({
        siteId: site.id,
        includeUnpublished: true,
        status: "all",
        limit: 100,
        offset: 0,
      });
      const routeConflict = findPageRouteConflict(
        { id: page.id, slug: nextSlug, title, isHomepage: nextIsHomepage },
        collections.items,
      );
      if (routeConflict) {
        return errorResponse(
          409,
          "ROUTE_CONFLICT",
          routeConflict.message,
          requestId,
        );
      }
      const shouldUpdateSlug =
        body.slug !== undefined || (nextIsHomepage && page.slug !== "index");
      const content = contentDocumentFromInput(body.content, page, {
        title,
        slug: nextSlug,
        status,
      });
      const prospectivePage: BackyPage = {
        ...page,
        title,
        slug: nextSlug,
        description:
          typeof body.description === "string" || body.description === null
            ? body.description
            : page.description,
        status,
        scheduledAt: nextScheduledAt,
        isHomepage: nextIsHomepage,
        parentId:
          typeof body.parentId === "string" || body.parentId === null
            ? body.parentId
            : page.parentId,
        content: content || page.content,
        meta: isRecord(body.meta) ? body.meta : page.meta,
      };
      const readiness = buildRepositoryPageReadiness(prospectivePage);
      const readinessError =
        body.status !== undefined
          ? rejectIfReadinessBlocked(status, readiness, requestId)
          : null;
      if (readinessError) {
        return readinessError;
      }
      await repositories.contentWorkflows.createRevision({
        siteId: site.id,
        targetType: "page",
        targetId: page.id,
        snapshot: pageRevisionSnapshot(page),
        note:
          typeof body.revisionNote === "string" &&
          body.revisionNote.trim().length > 0
            ? body.revisionNote
            : "Before update",
        createdBy: request.headers.get("x-backy-actor") || "admin",
      });
      const updated = await repositories.pages.update(site.id, page.id, {
        title: body.title === undefined ? undefined : title,
        slug: shouldUpdateSlug ? nextSlug : undefined,
        description:
          typeof body.description === "string" || body.description === null
            ? body.description
            : undefined,
        status: statusFromInput(body.status),
        scheduledAt: scheduledAt === undefined ? undefined : scheduledAt,
        isHomepage:
          typeof body.isHomepage === "boolean" ? nextIsHomepage : undefined,
        parentId:
          typeof body.parentId === "string" || body.parentId === null
            ? body.parentId
            : undefined,
        content,
        meta: isRecord(body.meta) ? body.meta : undefined,
        revisionNote:
          typeof body.revisionNote === "string" ? body.revisionNote : undefined,
      });
      const cacheInvalidation = await recordSiteCacheInvalidation(
        repositories,
        {
          siteId: site.id,
          scope: "content",
          entity: "page",
          entityId: page.id,
          reason: "page-updated",
          requestId,
        },
      );
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: "page",
        entityId: page.id,
        action: "update",
        before: pageAuditMetadata(page),
        after: pageAuditMetadata(updated.item),
        metadata: updateAuditMetadata(updated.item, body),
        requestId,
      });
      await deliverPageContentWebhook({
        repositories,
        site,
        action: "page.updated",
        before: page,
        after: updated.item,
        changedFields: Object.keys(body).filter(
          (key) => key !== "expectedUpdatedAt",
        ),
        requestId,
        actor: access.session?.user.id,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          page: adminPageFromRepositoryPage(updated.item),
          cacheInvalidation,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }

    const page = getAdminPageById(site.id, pageId);

    if (!page) {
      return errorResponse(404, "PAGE_NOT_FOUND", "Page not found", requestId);
    }

    const body = await parseJsonBody(request);
    const statusValidationError = pageStatusValidationError(body, requestId);
    if (statusValidationError) {
      return statusValidationError;
    }
    const contentValidationError = pageContentValidationError(
      body.content,
      requestId,
    );
    if (contentValidationError) {
      return contentValidationError;
    }
    const expectedUpdatedAt =
      typeof body.expectedUpdatedAt === "string"
        ? body.expectedUpdatedAt.trim()
        : "";
    if (expectedUpdatedAt && expectedUpdatedAt !== page.updatedAt) {
      return errorResponse(
        409,
        "PAGE_VERSION_CONFLICT",
        "Page has changed since the editor loaded it",
        requestId,
        {
          pageId: page.id,
          expectedUpdatedAt,
          currentUpdatedAt: page.updatedAt,
          currentPage: page,
        },
      );
    }

    const nextIsHomepage =
      typeof body.isHomepage === "boolean" ? body.isHomepage : page.isHomepage;
    const nextSlug = nextIsHomepage
      ? "index"
      : body.slug === undefined
        ? page.slug
        : normalizeSlug(body.slug);

    if (!nextIsHomepage && body.slug !== undefined && !nextSlug) {
      return errorResponse(
        400,
        "VALIDATION_ERROR",
        "Page slug is required",
        requestId,
      );
    }

    if (
      nextSlug &&
      (nextSlug !== page.slug || nextIsHomepage !== page.isHomepage)
    ) {
      const conflict = getPageByPath(site.id, nextSlug, {
        includeUnpublished: true,
      });
      if (conflict && conflict.id !== page.id) {
        return errorResponse(
          409,
          "SLUG_CONFLICT",
          "A page with this slug already exists",
          requestId,
        );
      }
    }

    const routeConflict = findPageRouteConflict(
      {
        id: page.id,
        slug: nextSlug || page.slug,
        title: typeof body.title === "string" ? body.title : page.title,
        isHomepage: nextIsHomepage,
      },
      listCollections(site.id, { includeUnpublished: true }),
    );
    if (routeConflict) {
      return errorResponse(
        409,
        "ROUTE_CONFLICT",
        routeConflict.message,
        requestId,
      );
    }

    const status = statusFromInput(body.status) || page.status;
    const scheduledAt = normalizeScheduledAtInput(body.scheduledAt);
    const nextScheduledAt =
      scheduledAt === undefined ? page.scheduledAt || null : scheduledAt;
    if (
      body.status !== undefined &&
      pageStatusMutationRequiresPublishPermission(page.status, status)
    ) {
      const publishAccess = await requireAdminAccess(request, requestId, {
        permission: "pages.publish",
      });
      if (publishAccess instanceof NextResponse) {
        return publishAccess;
      }
    }
    const scheduleValidation = validateScheduledContentStatus(
      status,
      nextScheduledAt,
    );
    if (!scheduleValidation.ok) {
      return errorResponse(
        400,
        scheduleValidation.code,
        scheduleValidation.message,
        requestId,
      );
    }

    const shouldUpdateSlug =
      body.slug !== undefined || (nextIsHomepage && page.slug !== "index");
    const prospectivePage = {
      ...page,
      ...body,
      slug: nextSlug,
      title: typeof body.title === "string" ? body.title : page.title,
      description:
        typeof body.description === "string" || body.description === null
          ? body.description
          : page.description,
      status,
      scheduledAt: nextScheduledAt,
      isHomepage: nextIsHomepage,
      content: storePageContentFromInput(body.content, page.content),
      meta: isRecord(body.meta) ? body.meta : page.meta,
    } as StorePage;
    const readiness = buildPageReadiness(prospectivePage);
    const readinessError =
      body.status !== undefined
        ? rejectIfReadinessBlocked(status, readiness, requestId)
        : null;
    if (readinessError) {
      return readinessError;
    }
    const updated = updateAdminPage(site.id, page.id, {
      ...body,
      ...(shouldUpdateSlug ? { slug: nextSlug } : {}),
      ...(typeof body.isHomepage === "boolean"
        ? { isHomepage: nextIsHomepage }
        : {}),
      ...(scheduledAt !== undefined ? { scheduledAt } : {}),
    });

    if (!updated) {
      return errorResponse(404, "PAGE_NOT_FOUND", "Page not found", requestId);
    }
    await recordAdminAudit({
      siteId: site.id,
      entity: "page",
      entityId: page.id,
      action: "update",
      before: pageAuditMetadata(page),
      after: pageAuditMetadata(updated),
      metadata: updateAuditMetadata(updated, body),
      requestId,
    });
    await deliverPageContentWebhook({
      site: site as unknown as Site,
      action: "page.updated",
      before: page,
      after: updated,
      changedFields: Object.keys(body).filter(
        (key) => key !== "expectedUpdatedAt",
      ),
      requestId,
      actor: access.session?.user.id,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        page: updated,
      },
    });
  } catch (error) {
    console.error("Admin page update API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();
  const access = await requireAdminAccess(request, requestId, {
    permission: "pages.delete",
  });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, pageId } = await params;
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

      const page = await repositories.pages.getById(site.id, pageId);
      if (!page) {
        return errorResponse(
          404,
          "PAGE_NOT_FOUND",
          "Page not found",
          requestId,
        );
      }

      await repositories.contentWorkflows.deletePreviewTokensForTarget(
        site.id,
        "page",
        pageId,
      );
      const deleted = await repositories.pages.delete(site.id, pageId);

      if (!deleted) {
        return errorResponse(
          404,
          "PAGE_NOT_FOUND",
          "Page not found",
          requestId,
        );
      }
      const cacheInvalidation = await recordSiteCacheInvalidation(
        repositories,
        {
          siteId: site.id,
          scope: "content",
          entity: "page",
          entityId: pageId,
          reason: "page-deleted",
          requestId,
        },
      );
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: "page",
        entityId: pageId,
        action: "delete",
        before: pageAuditMetadata(page),
        metadata: pageAuditMetadata(page),
        requestId,
      });
      await deliverPageContentWebhook({
        repositories,
        site,
        action: "page.deleted",
        before: page,
        requestId,
        actor: access.session?.user.id,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          deleted: true,
          pageId,
          cacheInvalidation,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }

    const page = getAdminPageById(site.id, pageId);
    if (!page) {
      return errorResponse(404, "PAGE_NOT_FOUND", "Page not found", requestId);
    }

    const deleted = deleteAdminPage(site.id, pageId);

    if (!deleted) {
      return errorResponse(404, "PAGE_NOT_FOUND", "Page not found", requestId);
    }
    await recordAdminAudit({
      siteId: site.id,
      entity: "page",
      entityId: pageId,
      action: "delete",
      before: pageAuditMetadata(page),
      metadata: pageAuditMetadata(page),
      requestId,
    });
    await deliverPageContentWebhook({
      site: site as unknown as Site,
      action: "page.deleted",
      before: page,
      requestId,
      actor: access.session?.user.id,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        deleted: true,
        pageId,
      },
    });
  } catch (error) {
    console.error("Admin page delete API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}
