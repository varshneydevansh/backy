/**
 * Admin reusable section import endpoint.
 *
 * POST /api/admin/sites/[siteId]/reusable-sections/import?upsert=true
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/adminAccess";
import { recordAdminAudit } from "@/lib/adminAudit";
import {
  applyReusableSectionBatch,
  getReusableSectionByIdOrSlug,
  getSiteByIdOrSlug,
} from "@/lib/backyStore";
import { recordSiteCacheInvalidation } from "@/lib/cacheInvalidation";
import {
  getRequiredDatabaseRepositories,
  shouldUseDemoStoreFallback,
} from "@/lib/repositoryRuntime";
import {
  buildInitialReusableSectionMetadata,
  buildReusableSectionUpdateMetadata,
} from "@/lib/reusableSectionVersions";
import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";
import type { BackyReusableSectionBatchMutation, BackyJsonObject, Site } from "@backy-cms/core";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

type ImportSection = {
  name: string;
  slug: string;
  description?: string | null;
  category?: string;
  status?: "active" | "archived";
  tags?: string[];
  content: BackyJsonObject;
  metadata?: BackyJsonObject;
  sourceElementId?: string | null;
};

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
      error: { code, message, ...(details ? { details } : {}) },
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const normalizeSlug = (value: unknown): string =>
  typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    : "";

const parseTags = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
          .filter(Boolean),
      ),
    );
  }
  if (typeof value === "string") {
    return Array.from(
      new Set(
        value
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    );
  }
  return [];
};

const parseMetadata = (value: unknown): BackyJsonObject | undefined =>
  isRecord(value) ? (value as BackyJsonObject) : undefined;

const parseContent = (value: unknown): BackyJsonObject =>
  isRecord(value) ? (value as BackyJsonObject) : {};

const hasElements = (value: unknown): boolean =>
  isRecord(value) && Array.isArray(value.elements) && value.elements.length > 0;

const sectionsFromBody = (body: Record<string, unknown>): unknown[] => {
  if (Array.isArray(body.sections)) return body.sections;
  const data = isRecord(body.data) ? body.data : {};
  if (Array.isArray(data.sections)) return data.sections;
  if (isRecord(body.section)) return [body.section];
  return [];
};

const normalizeImportSection = (value: unknown): ImportSection | null => {
  if (!isRecord(value)) return null;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const slug = normalizeSlug(value.slug || name);
  const content = parseContent(value.content);
  if (!name || !slug || !hasElements(content)) {
    return null;
  }

  return {
    name,
    slug,
    description:
      typeof value.description === "string"
        ? value.description.trim() || null
        : null,
    category:
      typeof value.category === "string" && value.category.trim()
        ? value.category.trim()
        : "general",
    status: value.status === "archived" ? "archived" : "active",
    tags: parseTags(value.tags),
    content,
    metadata: parseMetadata(value.metadata),
    sourceElementId:
      typeof value.sourceElementId === "string"
        ? value.sourceElementId.trim() || null
        : null,
  };
};

const reusableSectionImportSnapshot = (section: {
  id: string;
  name: string;
  slug: string;
  status: string;
  category?: string | null;
  tags?: string[] | null;
  updatedAt?: string;
}): BackyJsonObject => ({
  sectionId: section.id,
  name: section.name,
  slug: section.slug,
  status: section.status,
  category: section.category || null,
  tags: Array.isArray(section.tags) ? section.tags : [],
  updatedAt: section.updatedAt || null,
});

const deliverReusableSectionImportWebhook = async (params: {
  repositories?: Awaited<
    ReturnType<typeof getRequiredDatabaseRepositories>
  > | null;
  site: Site;
  before: unknown[];
  after: Array<Parameters<typeof reusableSectionImportSnapshot>[0]>;
  created: number;
  updated: number;
  upsert: boolean;
  requestId: string;
  actor?: string | null;
}) =>
  deliverSiteWebhooks({
    repositories: params.repositories,
    site: params.site,
    kind: "site-updated",
    requestId: params.requestId,
    actor: params.actor,
    reason: "reusableSection.imported",
    data: {
      resourceType: "reusableSectionImport",
      before: params.before
        .filter(
          (
            section,
          ): section is Parameters<typeof reusableSectionImportSnapshot>[0] =>
            isRecord(section) &&
            typeof section.id === "string" &&
            typeof section.name === "string" &&
            typeof section.slug === "string" &&
            typeof section.status === "string",
        )
        .map(reusableSectionImportSnapshot),
      after: params.after.map(reusableSectionImportSnapshot),
      summary: {
        created: params.created,
        updated: params.updated,
        total: params.after.length,
        upsert: params.upsert,
      },
    },
    metadata: {
      action: "reusableSection.imported",
      changedKeys: ["content"],
      source: "admin-reusable-section-import-api",
      resourceType: "reusableSectionImport",
      created: params.created,
      updated: params.updated,
      total: params.after.length,
      upsert: params.upsert,
      sectionIds: params.after.map((section) => section.id),
      slugs: params.after.map((section) => section.slug),
    },
  });

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();
  const access = await requireAdminAccess(request, requestId, {
    permission: "pages.edit",
  });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const upsert = searchParams.get("upsert") === "true";
    const body = await parseJsonBody(request);
    const actor =
      typeof body.importedBy === "string" && body.importedBy.trim()
        ? body.importedBy.trim()
        : "admin";
    const rawSections = sectionsFromBody(body);
    const parsedSections = rawSections.map(normalizeImportSection);
    const sections = parsedSections as ImportSection[];

    if (sections.length === 0 || parsedSections.some(section => !section)) {
      return errorResponse(
        400,
        "VALIDATION_ERROR",
        "Every imported section requires a name, slug and nonempty content.elements",
        requestId,
      );
    }

    const duplicateSlug = sections.find(
      (section, index) =>
        sections.findIndex((item) => item.slug === section.slug) !== index,
    );
    if (duplicateSlug) {
      return errorResponse(
        400,
        "VALIDATION_ERROR",
        "Reusable section import contains duplicate slugs",
        requestId,
        { slug: duplicateSlug.slug },
      );
    }

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

      const operations: BackyReusableSectionBatchMutation[] = [];
      let created = 0;
      let updated = 0;
      const beforeSections = new Map<string, unknown>();
      for (const section of sections) {
        const existing = await repositories.reusableSections.getBySlug(
          site.id,
          section.slug,
        );
        if (existing && !upsert) {
          return errorResponse(
            409,
            "SLUG_CONFLICT",
            "A reusable section with this slug already exists",
            requestId,
            { slug: section.slug },
          );
        }

        if (existing) {
          beforeSections.set(existing.id, existing);
          operations.push({ type: 'update', sectionId: existing.id, input: {
              expectedSection: existing,
              name: section.name,
              description: section.description ?? null,
              category: section.category || "general",
              status: section.status || "active",
              tags: section.tags || [],
              content: section.content,
              metadata: buildReusableSectionUpdateMetadata(
                existing,
                section.metadata,
                { actor, requestId },
              ) as BackyJsonObject,
              sourceElementId: section.sourceElementId ?? null,
              updatedBy: actor,
            } });
          updated += 1;
        } else {
          operations.push({ type: 'create', input: {
              siteId: site.id,
              name: section.name,
              slug: section.slug,
              description: section.description ?? null,
              category: section.category || "general",
              status: section.status || "active",
              tags: section.tags || [],
              content: section.content,
              metadata: buildInitialReusableSectionMetadata(section.metadata, {
                actor,
                requestId,
              }) as BackyJsonObject,
              sourceElementId: section.sourceElementId ?? null,
              createdBy: actor,
              updatedBy: actor,
            } });
          created += 1;
        }
      }

      const imported = await repositories.reusableSections.applyBatch(site.id, operations);
      const cacheInvalidation = await recordSiteCacheInvalidation(
        repositories,
        {
          siteId: site.id,
          scope: "content",
          entity: "reusableSection",
          reason: "reusable-section-imported",
          requestId,
        },
      );
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: "reusableSection",
        entityId: imported.length === 1 ? imported[0].id : "bulk",
        action: "reusableSection.import",
        before: {
          sections: imported
            .map((section) => beforeSections.get(section.id))
            .filter(Boolean),
        },
        after: {
          sections: imported,
        },
        metadata: {
          created,
          updated,
          total: imported.length,
          upsert,
          sectionIds: imported.map((section) => section.id),
          slugs: imported.map((section) => section.slug),
        },
        requestId,
      });
      await deliverReusableSectionImportWebhook({
        repositories,
        site,
        before: imported
          .map((section) => beforeSections.get(section.id))
          .filter(Boolean),
        after: imported,
        created,
        updated,
        upsert,
        requestId,
        actor: access.session?.user.id,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          import: { created, updated, total: imported.length },
          sections: imported,
          cacheInvalidation,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }

    const operations: BackyReusableSectionBatchMutation[] = [];
    let created = 0;
    let updated = 0;
    const beforeSections = new Map<string, unknown>();
    for (const section of sections) {
      const existing = getReusableSectionByIdOrSlug(site.id, section.slug);
      if (existing && !upsert) {
        return errorResponse(
          409,
          "SLUG_CONFLICT",
          "A reusable section with this slug already exists",
          requestId,
          { slug: section.slug },
        );
      }

      if (existing) {
        beforeSections.set(existing.id, existing);
        operations.push({ type: 'update', sectionId: existing.id, input: {
          expectedSection: existing as unknown as import('@backy-cms/core').BackyReusableSection,
          name: section.name,
          description: section.description ?? null,
          category: section.category || "general",
          status: section.status || "active",
          tags: section.tags || [],
          content: section.content,
          metadata: buildReusableSectionUpdateMetadata(
            existing,
            section.metadata,
            { actor, requestId },
          ) as BackyJsonObject,
          sourceElementId: section.sourceElementId ?? null,
          updatedBy: actor,
        } });
        updated += 1;
      } else {
        operations.push({ type: 'create', input: {
            siteId: site.id,
            name: section.name,
            slug: section.slug,
            description: section.description ?? null,
            category: section.category || "general",
            status: section.status || "active",
            tags: section.tags || [],
            content: section.content,
            metadata: buildInitialReusableSectionMetadata(section.metadata, {
              actor,
              requestId,
            }) as BackyJsonObject,
            sourceElementId: section.sourceElementId ?? null,
            createdBy: actor,
            updatedBy: actor,
          } });
        created += 1;
      }
    }
    const imported = applyReusableSectionBatch(site.id, operations);
    await recordAdminAudit({
      siteId: site.id,
      entity: "reusableSection",
      entityId: imported.length === 1 ? imported[0].id : "bulk",
      action: "reusableSection.import",
      before: {
        sections: imported
          .map((section) => beforeSections.get(section.id))
          .filter(Boolean),
      },
      after: {
        sections: imported,
      },
      metadata: {
        created,
        updated,
        total: imported.length,
        upsert,
        sectionIds: imported.map((section) => section.id),
        slugs: imported.map((section) => section.slug),
      },
      requestId,
    });
    await deliverReusableSectionImportWebhook({
      site: site as unknown as Site,
      before: imported
        .map((section) => beforeSections.get(section.id))
        .filter(Boolean),
      after: imported,
      created,
      updated,
      upsert,
      requestId,
      actor: access.session?.user.id,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        import: { created, updated, total: imported.length },
        sections: imported,
      },
    });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : undefined;
    const causeCode = cause && typeof cause === 'object' && 'code' in cause ? cause.code : undefined;
    if (code === 'REUSABLE_SECTION_VERSION_CONFLICT') return errorResponse(409, code, 'Reusable section changed during import. Reload and retry. No import writes were committed.', requestId);
    if (code === '23505' || causeCode === '23505') return errorResponse(409, 'SLUG_CONFLICT', 'A reusable section slug changed during import. Reload and retry. No import writes were committed.', requestId);
    console.error("Admin reusable section import API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}
