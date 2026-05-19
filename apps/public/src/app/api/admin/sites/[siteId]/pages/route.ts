/**
 * Admin pages endpoint.
 *
 * GET  /api/admin/sites/[siteId]/pages
 * POST /api/admin/sites/[siteId]/pages
 */

import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_SITE_SETTINGS,
  canvasElementsToBackyContentDocument,
  isBackyContentDocument,
  type BackyJsonObject,
  type BackyContentDocument,
  type BackyPage,
  type Site,
} from "@backy-cms/core";
import {
  createAdminPage,
  getAdminSettings,
  getPageByPath,
  getPageSummary,
  getSiteByIdOrSlug,
  listCollections,
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
import { findPageRouteConflict } from "@/lib/routeConflicts";
import { recordSiteCacheInvalidation } from "@/lib/cacheInvalidation";
import { seedInputFromFrontendDesignTemplate } from "@/lib/frontendDesignContract";
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
    {
      success: false,
      requestId,
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
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
): "draft" | "published" | "scheduled" | "archived" =>
  value === "published" || value === "scheduled" || value === "archived"
    ? value
    : "draft";

const hasBodyKey = (body: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(body, key);

const isPageStatusInput = (
  value: unknown,
): value is "draft" | "published" | "scheduled" | "archived" =>
  value === "draft" ||
  value === "published" ||
  value === "scheduled" ||
  value === "archived";

const contentElementsFromInput = (rawContent: unknown): unknown[] => {
  if (isRecord(rawContent) && Array.isArray(rawContent.elements)) {
    return rawContent.elements;
  }

  return Array.isArray(rawContent) ? rawContent : [];
};

const contentDocumentFromInput = (
  rawContent: unknown,
  input: {
    id: string;
    title: string;
    slug: string;
    status: "draft" | "published" | "scheduled" | "archived";
  },
): BackyContentDocument => {
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
    id: input.id,
    kind: "page",
    title: input.title,
    slug: input.slug,
    status: input.status,
    elements: contentElementsFromInput(rawContent),
    canvasSize: isRecord(rawContent) ? rawContent.canvasSize : undefined,
    customCSS:
      isRecord(rawContent) && typeof rawContent.customCSS === "string"
        ? rawContent.customCSS
        : undefined,
  });
};

const storePageContentFromInput = (
  rawContent: unknown,
): StorePage["content"] => {
  const contentInput = isRecord(rawContent) ? rawContent : {};
  const canvasSizeInput = isRecord(contentInput.canvasSize)
    ? contentInput.canvasSize
    : {};

  return {
    elements: contentElementsFromInput(
      rawContent,
    ) as StorePage["content"]["elements"],
    canvasSize: {
      width: Number(canvasSizeInput.width) || 1200,
      height: Number(canvasSizeInput.height) || 900,
    },
    customCSS:
      typeof contentInput.customCSS === "string"
        ? contentInput.customCSS
        : undefined,
    customJS:
      typeof contentInput.customJS === "string"
        ? contentInput.customJS
        : undefined,
    contentDocument: isBackyContentDocument(rawContent)
      ? rawContent
      : isBackyContentDocument(contentInput.contentDocument)
        ? contentInput.contentDocument
        : undefined,
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

const pageStatusValidationError = (
  body: Record<string, unknown>,
  requestId: string,
) => {
  if (
    hasBodyKey(body, "status") &&
    body.status !== undefined &&
    !isPageStatusInput(body.status)
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

const readPageBillingPolicy = (
  siteSettings: unknown,
  workspaceSettings: unknown,
) => {
  const siteRoot = isRecord(siteSettings) ? siteSettings : {};
  const workspaceRoot = isRecord(workspaceSettings) ? workspaceSettings : {};
  const integrations = isRecord(workspaceRoot.integrations)
    ? workspaceRoot.integrations
    : {};
  const commerce = isRecord(integrations.commerce) ? integrations.commerce : {};
  const billingQuota = isRecord(siteRoot.billingQuota)
    ? siteRoot.billingQuota
    : {};
  const limits = isRecord(billingQuota.limits) ? billingQuota.limits : {};
  const limit = Number(limits.pages);

  return {
    overageMode:
      typeof commerce.overageMode === "string" ? commerce.overageMode : "warn",
    pageLimit:
      Number.isFinite(limit) && limit >= 0
        ? Math.round(limit)
        : DEFAULT_SITE_SETTINGS.billingQuota.limits.pages,
    billingPlan:
      typeof billingQuota.plan === "string"
        ? billingQuota.plan
        : DEFAULT_SITE_SETTINGS.billingQuota.plan,
  };
};

const enforcePageBillingLimit = (
  siteSettings: unknown,
  workspaceSettings: unknown,
  currentPageCount: number,
  requestId: string,
) => {
  const policy = readPageBillingPolicy(siteSettings, workspaceSettings);
  if (policy.overageMode === "block" && currentPageCount >= policy.pageLimit) {
    return errorResponse(
      402,
      "BILLING_PAGE_LIMIT",
      `The ${policy.billingPlan} site plan allows ${policy.pageLimit} page${policy.pageLimit === 1 ? "" : "s"}. Update the site billing quota before creating another page.`,
      requestId,
    );
  }

  return null;
};

const adminPageFromRepositoryPage = (
  page: BackyPage,
  includeContent = true,
) => {
  const base = {
    ...page,
    content: undefined,
  };
  if (!includeContent) {
    const { content, ...summary } = base;
    void content;
    return summary;
  }
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

const deliverPageContentWebhook = async (params: {
  repositories?: Awaited<
    ReturnType<typeof getRequiredDatabaseRepositories>
  > | null;
  site: Site;
  action: "page.created";
  after: Parameters<typeof pageAuditMetadata>[0];
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
      after: pageAuditMetadata(params.after),
    },
    metadata: {
      action: params.action,
      changedKeys: ["content"],
      source: "admin-pages-api",
      resourceType: "page",
      resourceId: params.after.id,
      slug: params.after.slug,
      status: params.after.status,
    },
  });

const parseBoundedInteger = (
  value: string | null,
  fallback: number,
  min: number,
  max: number,
) => {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();
  const access = await requireAdminAccess(request, requestId, {
    permission: "pages.view",
  });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseBoundedInteger(searchParams.get("limit"), 100, 1, 200);
    const offset = parseBoundedInteger(
      searchParams.get("offset"),
      0,
      0,
      Number.MAX_SAFE_INTEGER,
    );
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

      const includeUnpublished =
        searchParams.get("includeUnpublished") !== "false";
      const result = await repositories.pages.list({
        siteId: site.id,
        includeUnpublished,
        status: includeUnpublished ? "all" : "published",
        limit,
        offset,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          pages: result.items.map((page) =>
            adminPageFromRepositoryPage(page, false),
          ),
          pagination: result.pagination,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }

    const includeUnpublished =
      searchParams.get("includeUnpublished") !== "false";
    const pages = getPageSummary(site.id, { includeUnpublished });
    const pagedPages = pages.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        pages: pagedPages,
        pagination: {
          total: pages.length,
          limit,
          offset,
          hasMore: offset + limit < pages.length,
        },
      },
    });
  } catch (error) {
    console.error("Admin pages list API error:", error);
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
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId } = await params;
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

      const body = await parseJsonBody(request);
      const statusValidationError = pageStatusValidationError(body, requestId);
      if (statusValidationError) {
        return statusValidationError;
      }
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const isHomepage = body.isHomepage === true;
      const slug = isHomepage ? "index" : normalizeSlug(body.slug || title);
      const status = statusFromInput(body.status);

      if (!title) {
        return errorResponse(
          400,
          "VALIDATION_ERROR",
          "Page title is required",
          requestId,
        );
      }
      if (!slug) {
        return errorResponse(
          400,
          "VALIDATION_ERROR",
          "Page slug is required",
          requestId,
        );
      }

      if (statusRequiresPublishPermission(status)) {
        const publishAccess = await requireAdminAccess(request, requestId, {
          permission: "pages.publish",
        });
        if (publishAccess instanceof NextResponse) {
          return publishAccess;
        }
      }

      const slugConflict = await getRepositoryPageByPublicPath(
        repositories,
        site.id,
        slug,
      );
      if (slugConflict) {
        return errorResponse(
          409,
          "SLUG_CONFLICT",
          "A page with this slug already exists",
          requestId,
        );
      }

      const collections = await repositories.collections.list({
        siteId: site.id,
        includeUnpublished: true,
        status: "all",
        limit: 100,
        offset: 0,
      });
      const routeConflict = findPageRouteConflict(
        { slug, title, isHomepage },
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

      const [settings, existingPages] = await Promise.all([
        repositories.settings.get(),
        repositories.pages.list({
          siteId: site.id,
          includeUnpublished: true,
          status: "all",
          limit: 1,
          offset: 0,
        }),
      ]);
      const billingLimitError = enforcePageBillingLimit(
        site.settings,
        settings,
        existingPages.pagination.total,
        requestId,
      );
      if (billingLimitError) {
        return billingLimitError;
      }

      const seeded = seedInputFromFrontendDesignTemplate({
        siteSettings: site.settings,
        body,
        templateType: "page",
        kind: "page",
        title,
        description:
          typeof body.description === "string" ? body.description : null,
      });

      if (!seeded.ok) {
        return errorResponse(400, seeded.code, seeded.message, requestId);
      }

      const createBody = seeded.body;
      const contentValidationError = pageContentValidationError(
        createBody.content,
        requestId,
      );
      if (contentValidationError) {
        return contentValidationError;
      }
      const scheduledAt = normalizeScheduledAtInput(createBody.scheduledAt);
      const scheduleValidation = validateScheduledContentStatus(
        status,
        scheduledAt,
      );
      if (!scheduleValidation.ok) {
        return errorResponse(
          400,
          scheduleValidation.code,
          scheduleValidation.message,
          requestId,
        );
      }
      const pageId =
        typeof createBody.id === "string" && createBody.id.trim().length > 0
          ? createBody.id.trim()
          : `page_${slug}`;
      const content = contentDocumentFromInput(createBody.content, {
        id: pageId,
        title,
        slug,
        status,
      });
      const now = new Date().toISOString();
      const readiness = buildRepositoryPageReadiness({
        id: pageId,
        siteId: site.id,
        title,
        slug,
        description:
          typeof createBody.description === "string"
            ? createBody.description
            : null,
        content,
        meta: isRecord(createBody.meta) ? createBody.meta : {},
        status,
        publishedAt: status === "published" ? now : null,
        scheduledAt: scheduledAt || null,
        isHomepage,
        parentId:
          typeof createBody.parentId === "string" ? createBody.parentId : null,
        sortOrder:
          typeof createBody.sortOrder === "number" ? createBody.sortOrder : 0,
        createdBy: null,
        updatedBy: null,
        createdAt: now,
        updatedAt: now,
      });
      const readinessError = rejectIfReadinessBlocked(
        status,
        readiness,
        requestId,
      );
      if (readinessError) {
        return readinessError;
      }
      const created = await repositories.pages.create({
        siteId: site.id,
        title,
        slug,
        description:
          typeof createBody.description === "string"
            ? createBody.description
            : null,
        status,
        scheduledAt: scheduledAt || null,
        isHomepage,
        parentId:
          typeof createBody.parentId === "string" ? createBody.parentId : null,
        content,
        meta: isRecord(createBody.meta) ? createBody.meta : undefined,
      });
      const cacheInvalidation = await recordSiteCacheInvalidation(
        repositories,
        {
          siteId: site.id,
          scope: "content",
          entity: "page",
          entityId: created.item.id,
          reason: "page-created",
          requestId,
        },
      );
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: "page",
        entityId: created.item.id,
        action: "create",
        after: pageAuditMetadata(created.item),
        metadata: pageAuditMetadata(created.item),
        requestId,
      });
      await deliverPageContentWebhook({
        repositories,
        site,
        action: "page.created",
        after: created.item,
        requestId,
        actor: access.session?.user.id,
      });

      return NextResponse.json(
        {
          success: true,
          requestId,
          data: {
            page: adminPageFromRepositoryPage(created.item),
            cacheInvalidation,
          },
        },
        { status: 201 },
      );
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }

    const body = await parseJsonBody(request);
    const statusValidationError = pageStatusValidationError(body, requestId);
    if (statusValidationError) {
      return statusValidationError;
    }
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const isHomepage = body.isHomepage === true;
    const slug = isHomepage ? "index" : normalizeSlug(body.slug || title);
    const status = statusFromInput(body.status);

    if (!title) {
      return errorResponse(
        400,
        "VALIDATION_ERROR",
        "Page title is required",
        requestId,
      );
    }

    if (!slug) {
      return errorResponse(
        400,
        "VALIDATION_ERROR",
        "Page slug is required",
        requestId,
      );
    }

    if (statusRequiresPublishPermission(status)) {
      const publishAccess = await requireAdminAccess(request, requestId, {
        permission: "pages.publish",
      });
      if (publishAccess instanceof NextResponse) {
        return publishAccess;
      }
    }

    if (getPageByPath(site.id, slug, { includeUnpublished: true })) {
      return errorResponse(
        409,
        "SLUG_CONFLICT",
        "A page with this slug already exists",
        requestId,
      );
    }

    const routeConflict = findPageRouteConflict(
      { slug, title, isHomepage },
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

    const existingPages = getPageSummary(site.id, { includeUnpublished: true });
    const billingLimitError = enforcePageBillingLimit(
      site.settings,
      getAdminSettings(),
      existingPages.length,
      requestId,
    );
    if (billingLimitError) {
      return billingLimitError;
    }

    const seeded = seedInputFromFrontendDesignTemplate({
      siteSettings: site.settings,
      body,
      templateType: "page",
      kind: "page",
      title,
      description:
        typeof body.description === "string" ? body.description : null,
    });

    if (!seeded.ok) {
      return errorResponse(400, seeded.code, seeded.message, requestId);
    }

    const scheduledAt = normalizeScheduledAtInput(seeded.body.scheduledAt);
    const contentValidationError = pageContentValidationError(
      seeded.body.content,
      requestId,
    );
    if (contentValidationError) {
      return contentValidationError;
    }
    const scheduleValidation = validateScheduledContentStatus(
      status,
      scheduledAt,
    );
    if (!scheduleValidation.ok) {
      return errorResponse(
        400,
        scheduleValidation.code,
        scheduleValidation.message,
        requestId,
      );
    }
    const now = new Date().toISOString();
    const previewPage = {
      id:
        typeof seeded.body.id === "string" && seeded.body.id.trim().length > 0
          ? seeded.body.id.trim()
          : `page_${slug}`,
      siteId: site.id,
      title,
      slug,
      description:
        typeof seeded.body.description === "string"
          ? seeded.body.description
          : null,
      status,
      isHomepage,
      parentId:
        typeof seeded.body.parentId === "string" ? seeded.body.parentId : null,
      sortOrder:
        typeof seeded.body.sortOrder === "number" ? seeded.body.sortOrder : 0,
      content: storePageContentFromInput(seeded.body.content),
      meta: isRecord(seeded.body.meta) ? seeded.body.meta : {},
      forms: [],
      createdAt: now,
      updatedAt: now,
      publishedAt: status === "published" ? now : null,
      scheduledAt: scheduledAt || null,
    } as StorePage;
    const readiness = buildPageReadiness(previewPage);
    const readinessError = rejectIfReadinessBlocked(
      status,
      readiness,
      requestId,
    );
    if (readinessError) {
      return readinessError;
    }

    const page = createAdminPage(site.id, {
      ...seeded.body,
      title,
      slug,
      status,
      isHomepage,
      scheduledAt: scheduledAt || null,
    });
    await recordAdminAudit({
      siteId: site.id,
      entity: "page",
      entityId: page.id,
      action: "create",
      after: pageAuditMetadata(page),
      metadata: pageAuditMetadata(page),
      requestId,
    });
    await deliverPageContentWebhook({
      site: site as unknown as Site,
      action: "page.created",
      after: page,
      requestId,
      actor: access.session?.user.id,
    });

    return NextResponse.json(
      {
        success: true,
        requestId,
        data: {
          page,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Admin page create API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}
