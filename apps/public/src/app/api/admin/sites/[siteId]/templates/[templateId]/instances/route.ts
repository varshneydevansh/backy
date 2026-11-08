import { handleProductTemplateInstances } from "@/lib/productTemplateInstances";
import { handleCollectionTemplateInstances } from '@/lib/collectionTemplateInstances';
import { handleFormTemplateInstances } from "@/lib/formTemplateInstances";
import { NextRequest, NextResponse } from "next/server";
import type {
  BackyTemplateInstanceOutcome,
  Site,
  BackyContentDocument,
  BackyJsonObject,
} from "@backy-cms/core";
import { requireAdminAccess } from "@/lib/adminAccess";
import {
  getSiteByIdOrSlug,
  listAdminPages,
  getBlogPosts,
  getAdminPageById,
  getAdminBlogPostById,
  updateAdminPage,
  updateAdminBlogPost,
  listReusableSections,
  getReusableSectionByIdOrSlug,
  updateReusableSection,
} from "@/lib/backyStore";
import {
  shouldUseDemoStoreFallback,
  getRequiredDatabaseRepositories,
} from "@/lib/repositoryRuntime";
import {
  collectCompleteExportPages,
  CollectionExportIncompleteError,
} from "@/lib/collectionExportPagination";
import { getRetainedTemplateRevision } from "@/lib/templateHistory";
import {
  planTemplateInstance,
  templateInstanceIdentity,
  templateInstanceMetadata,
  templateInstanceDocumentFingerprint,
  type TemplateInstanceDocument,
} from "@/lib/templateInstances";
import { templateInstanceFingerprint } from "@/lib/templateInstanceProvenance";
import { buildReusableSectionUpdateMetadata } from "@/lib/reusableSectionVersions";
import { recordAdminAudit } from "@/lib/adminAudit";
import { recordSiteCacheInvalidation } from "@/lib/cacheInvalidation";
import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";

export const runtime = "nodejs";
const headers = { "cache-control": "private, no-store" };
const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const error = (
  status: number,
  code: string,
  message: string,
  requestId: string,
) =>
  NextResponse.json(
    { success: false, requestId, error: { code, message } },
    { status, headers },
  );
const key = (value: { type: string; id: string }) =>
  value.type + ":" + value.id;
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ siteId: string; templateId: string }> },
) {
  // Explicit product intent has collection/commerce authority, independent of page grants.
  try {
    if (Number(request.headers.get('content-length') || 0) <= 65536) {
      const raw = await request.clone().text();
      if (Buffer.byteLength(raw) <= 65536 && JSON.parse(raw)?.targetType === 'product') return handleProductTemplateInstances(request, context);
      if (Buffer.byteLength(raw) <= 65536 && JSON.parse(raw)?.targetType === 'collection') return handleCollectionTemplateInstances(request, context);
      if (Buffer.byteLength(raw) <= 65536 && JSON.parse(raw)?.targetType === 'form') return handleFormTemplateInstances(request, context);
    }
  } catch { /* Legacy request/auth/error handling remains authoritative. */ }
  const requestId =
    request.headers.get("x-request-id") || `req_${Date.now().toString(36)}`;
  const access = await requireAdminAccess(request, requestId, {
    permission: "pages.view",
    recordUsage: false,
  });
  if (access instanceof NextResponse) return access;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 65536)
      return error(
        413,
        "TEMPLATE_INSTANCE_LIMIT",
        "The selected instance request exceeds its limit.",
        requestId,
      );
    const body: unknown = JSON.parse(raw);
    if (
      !object(body) ||
      body.targetType !== undefined ||
      !["review", "apply"].includes(body.action) ||
      typeof body.targetRevisionId !== "string" ||
      !/^(?:template_revision_)?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        body.targetRevisionId,
      ) ||
      !Array.isArray(body.selection) ||
      body.selection.length > 200 ||
      body.selection.some(
        (item: unknown) =>
          !object(item) ||
          !["page", "post", "section"].includes(item.type) ||
          typeof item.id !== "string" ||
          !item.id ||
          item.id.length > 128,
      ) ||
      new Set(body.selection.map(key)).size !== body.selection.length
    )
      return error(
        400,
        "INVALID_TEMPLATE_INSTANCE_REQUEST",
        "Choose a retained revision and an explicit unique page/post/section selection (maximum 200).",
        requestId,
      );
    if (body.action === "apply") {
      const edit = await requireAdminAccess(request, requestId, {
        permissions: ["pages.view", "pages.edit"],
        recordUsage: false,
      });
      if (edit instanceof NextResponse) return edit;
      if (
        typeof body.reviewVersion !== "string" ||
        !/^template-instances-v1:[a-f0-9]{64}$/.test(body.reviewVersion)
      )
        return error(
          400,
          "TEMPLATE_INSTANCE_REVIEW_REQUIRED",
          "Review the selected instances before applying.",
          requestId,
        );
    }
    const { siteId, templateId } = await context.params;
    const repositories = shouldUseDemoStoreFallback()
      ? null
      : await getRequiredDatabaseRepositories();
    const site = (
      repositories
        ? (await repositories.sites.getById(siteId)) ||
          (await repositories.sites.getBySlug(siteId))
        : getSiteByIdOrSlug(siteId)
    ) as Site | null;
    if (!site)
      return error(404, "SITE_NOT_FOUND", "Site not found.", requestId);
    const revision = await getRetainedTemplateRevision(
      site.id,
      templateId,
      body.targetRevisionId,
    );
    if (
      !revision ||
      revision.siteId !== site.id ||
      revision.templateId !== templateId ||
      revision.snapshot.id !== templateId ||
      revision.fingerprint !== templateInstanceFingerprint(revision.snapshot)
    )
      return error(
        404,
        "TEMPLATE_REVISION_NOT_FOUND",
        "Retained revision not found for this site and template.",
        requestId,
      );
    if (!["page", "blogPost", "section"].includes(revision.snapshot.type))
      return error(
        422,
        "TEMPLATE_INSTANCE_TYPE_UNSUPPORTED",
        "Instance upgrades currently support page, blog post and reusable section templates.",
        requestId,
      );
    const read = async (type: "page" | "post") => {
      if (!repositories && type === "page") {
        const items = listAdminPages(site.id, { includeUnpublished: true });
        if (
          !Array.isArray(items) ||
          items.length > 100000 ||
          items.some((item) => item.siteId !== site.id) ||
          new Set(items.map((item) => item.id)).size !== items.length
        )
          throw new CollectionExportIncompleteError();
        return items;
      }
      return collectCompleteExportPages(
        async (options) => {
          const result = repositories
            ? await (
                type === "page" ? repositories.pages : repositories.posts
              ).list({
                siteId: site.id,
                includeUnpublished: true,
                ...options,
              } as any)
            : (() => {
                const page = getBlogPosts(site.id, {
                  includeUnpublished: true,
                  ...options,
                });
                return { items: page.posts, pagination: page.pagination };
              })();
          if (!result.pagination || result.pagination.total > 100000)
            throw new CollectionExportIncompleteError();
          return { items: result.items, pagination: result.pagination };
        },
        (item: any) => item.siteId === site.id,
      );
    };
    const sectionTemplate = revision.snapshot.type === "section";
    const [pages, posts] = sectionTemplate ? [[], []] : await Promise.all([read("page"), read("post")]);
    const sections = !sectionTemplate ? [] : repositories
      ? await collectCompleteExportPages(async options => {
          const result = await repositories.reusableSections.list({ siteId: site.id, status: "all", ...options });
          if (!result.pagination || result.pagination.total > 100000) throw new CollectionExportIncompleteError();
          return result;
        }, (item: any) => item.siteId === site.id)
      : listReusableSections(site.id, { status: "all" });
    if (!Array.isArray(sections) || sections.length > 100000 || sections.some(item => item.siteId !== site.id)
      || new Set(sections.map(item => item.id)).size !== sections.length) throw new CollectionExportIncompleteError();
    const documents = [
      ...pages.map((item: any) => ({ ...item, type: "page" as const })),
      ...posts.map((item: any) => ({ ...item, type: "post" as const })),
      ...sections.map(item => ({ ...item, title: item.name, type: "section" as const })),
    ] as TemplateInstanceDocument[];
    const matching = documents.filter(
      (document) => templateInstanceIdentity(document) === templateId,
    );
    if (matching.length > 2000)
      return error(
        413,
        "TEMPLATE_INSTANCE_LIMIT",
        "More than 2000 matching documents require a smaller site inventory.",
        requestId,
      );
    let reviewedBytes = 0;
    for (const document of matching) {
      reviewedBytes += Buffer.byteLength(
        JSON.stringify({
          content: document.content,
          baseline: templateInstanceMetadata(document)?.frontendTemplateInstance?.baseContent,
          target: revision.snapshot.content,
        }),
        "utf8",
      );
      if (reviewedBytes > 64 * 1024 * 1024)
        return error(
          413,
          "TEMPLATE_INSTANCE_LIMIT",
          "The complete instance review exceeds its 64 MiB content limit. No writes started.",
          requestId,
        );
    }
    const plans = matching.map((document) => {
      if (
        (document.type === "section" ? "section" : document.type === "page" ? "page" : "blogPost") !==
        revision.snapshot.type
      )
        return {
          document,
          summary: {
            type: document.type,
            id: document.id,
            title: document.title,
            status: document.status,
            pinnedFingerprint: null,
            contentFingerprint: templateInstanceDocumentFingerprint(document),
            changedPaths: [],
            conflicts: [
              {
                path: "/meta/frontendTemplateInstance",
                code: "INVALID_PROVENANCE" as const,
              },
            ],
            state: "blocked" as const,
          },
        };
      return { document, ...planTemplateInstance(document, site, revision) };
    });
    const selected = plans.filter((plan) =>
      body.selection.some((item: any) => key(item) === key(plan.summary)),
    );
    if (selected.length !== body.selection.length)
      return error(
        400,
        "INVALID_TEMPLATE_INSTANCE_SELECTION",
        "Every selected document must belong to this site and template.",
        requestId,
      );
    const reviewVersion =
      "template-instances-v1:" +
      templateInstanceFingerprint({
        siteId: site.id,
        templateId,
        revision,
        design: site.settings.frontendDesign,
        selection: body.selection,
        targets: plans.map((plan) => plan.summary),
      });
    const data: BackyTemplateInstanceOutcome = {
      action: body.action,
      siteId: site.id,
      templateId,
      targetRevisionId: revision.id,
      targetFingerprint: revision.fingerprint,
      reviewVersion,
      targets: plans.map((plan) => plan.summary),
      canApply:
        selected.length > 0 &&
        selected.every((plan) => plan.summary.state !== "blocked"),
      scanned: { pages: pages.length, posts: posts.length, ...(sectionTemplate ? { sections: sections.length } : {}) },
      appliedTargets: [],
      failedTargets: [],
      completionWarnings: [],
      outcome: "complete",
      concurrencyBoundary: repositories
        ? "database-per-document-row-lock"
        : "demo-single-process",
    };
    if (body.action === "review") {
      const admitted = await requireAdminAccess(request, requestId, { permission: "pages.view" });
      if (admitted instanceof NextResponse) return admitted;
      return NextResponse.json({ success: true, requestId, data }, { headers });
    }
    if (body.reviewVersion !== reviewVersion)
      return error(
        409,
        "TEMPLATE_INSTANCE_REVIEW_STALE",
        "The selected documents or site design changed. Review current instances again. No upgrade writes started.",
        requestId,
      );
    if (!data.canApply)
      return error(
        422,
        "TEMPLATE_INSTANCE_CONFLICT",
        "Resolve the selected instance conflicts or remove those documents from the selection, then review again. No upgrade writes started.",
        requestId,
      );
    const requiredPermissions = ["pages.view", "pages.edit"];
    if (selected.some(plan => plan.document.type !== "section" && ["published", "scheduled"].includes(plan.document.status))) requiredPermissions.push("pages.publish");
    const admitted = await requireAdminAccess(request, requestId, { permissions: requiredPermissions });
    if (admitted instanceof NextResponse) return admitted;
    if (
      repositories &&
      (sectionTemplate
        ? !repositories.reusableSections?.update || !repositories.reusableSections?.getById
        : !repositories.pages.update || !repositories.posts.update || !repositories.pages.getById || !repositories.posts.getById)
    )
      return error(
        503,
        "TEMPLATE_INSTANCE_WRITE_UNAVAILABLE",
        "Guarded instance writes are unavailable. No upgrade writes started.",
        requestId,
      );
    for (const plan of selected) {
      if (plan.summary.state === "current") continue;
      try {
        const latest = plan.document.type === "section"
          ? repositories ? await repositories.reusableSections.getById(site.id, plan.document.id) : getReusableSectionByIdOrSlug(site.id, plan.document.id)
          : repositories
          ? await (
              plan.document.type === "page"
                ? repositories.pages
                : repositories.posts
            ).getById(site.id, plan.document.id)
          : plan.document.type === "page"
            ? getAdminPageById(site.id, plan.document.id)
            : getAdminBlogPostById(site.id, plan.document.id);
        if (
          !latest ||
          templateInstanceDocumentFingerprint({
            ...latest,
            type: plan.document.type,
          } as TemplateInstanceDocument) !== plan.summary.contentFingerprint
        )
          throw Object.assign(Error("Reload"), {
            code: "CONTENT_REVISION_CONFLICT",
          });
        const input = {
          content: plan.content as unknown as BackyContentDocument,
          meta: plan.meta as BackyJsonObject,
          expectedContent: plan.document.content,
          expectedUpdatedAt: plan.document.updatedAt,
          beforeUpdateRevision: {
            snapshot: plan.document as unknown as BackyJsonObject,
            operation: "update" as const,
            note: `Before template ${templateId} instance upgrade`,
          },
          revisionNote: `Before template ${templateId} instance upgrade`,
        };
        const { type: _type, title: _displayTitle, ...expectedSection } = plan.document;
        const sectionInput = plan.document.type === "section" ? {
          expectedSection: expectedSection as any,
          content: plan.content as BackyJsonObject,
          metadata: buildReusableSectionUpdateMetadata(expectedSection as any, plan.meta, {
            actor: access.session?.user.id, requestId,
          }) as BackyJsonObject,
          updatedBy: access.session?.user.id,
        } : undefined;
        const saved = sectionInput
          ? repositories ? await repositories.reusableSections.update(site.id, plan.document.id, sectionInput)
            : { item: updateReusableSection(site.id, plan.document.id, sectionInput) }
          : repositories
          ? await (
              plan.document.type === "page"
                ? repositories.pages
                : repositories.posts
            ).update(site.id, plan.document.id, input)
          : {
              item:
                plan.document.type === "page"
                  ? updateAdminPage(site.id, plan.document.id, input)
                  : updateAdminBlogPost(site.id, plan.document.id, input),
            };
        if (!saved.item) throw Error("Write unavailable");
        data.appliedTargets.push({
          type: plan.document.type,
          id: plan.document.id,
        });
        try {
          await recordAdminAudit({
            repositories,
            siteId: site.id,
            actorId: access.session?.user.id,
            entity: plan.document.type === "section" ? "reusableSection" : plan.document.type,
            entityId: plan.document.id,
            action: "frontendDesign.templateInstanceUpgrade",
            before: templateInstanceMetadata(plan.document)?.frontendTemplateInstance,
            after: plan.meta?.frontendTemplateInstance,
            metadata: { templateId, targetRevisionId: revision.id },
            requestId,
          });
        } catch {
          data.completionWarnings.push("TEMPLATE_INSTANCE_AUDIT_PENDING");
        }
      } catch (cause) {
        const code =
          object(cause) &&
          typeof cause.code === "string" &&
          /CONFLICT/.test(cause.code)
            ? "CONTENT_CONFLICT"
            : "WRITE_FAILED";
        data.failedTargets.push({
          type: plan.document.type,
          id: plan.document.id,
          code,
        });
      }
    }
    if (repositories && data.appliedTargets.length)
      try {
        await recordSiteCacheInvalidation(repositories, {
          siteId: site.id,
          scope: "content",
          entity: "site",
          entityId: site.id,
          reason: "template-instance-upgrade",
          requestId,
        });
      } catch {
        data.completionWarnings.push("TEMPLATE_INSTANCE_CACHE_PENDING");
      }
    if (data.appliedTargets.length)
      try {
        const deliveries = await deliverSiteWebhooks({
          repositories,
          site,
          kind: "site-updated",
          requestId,
          actor: access.session?.user.id,
          reason: "frontendDesign.templateInstanceUpgrade",
          data: {
            resourceType: "templateInstanceUpgrade",
            templateId,
            targetRevisionId: revision.id,
            targetFingerprint: revision.fingerprint,
            appliedTargets: data.appliedTargets,
            summary: {
              appliedTargets: data.appliedTargets.length,
              failedTargets: data.failedTargets.length,
              scanned: data.scanned,
            },
          },
          metadata: {
            action: "frontendDesign.templateInstanceUpgrade",
            source: "admin-template-instance-upgrade-api",
            changedKeys: ["content", sectionTemplate ? "metadata.frontendTemplateInstance" : "meta.frontendTemplateInstance"],
            resourceType: "template",
            resourceId: templateId,
            targetRevisionId: revision.id,
            appliedTargets: data.appliedTargets.length,
          },
        });
        if (deliveries.some((delivery) => delivery.status === "failed"))
          data.completionWarnings.push("TEMPLATE_INSTANCE_WEBHOOK_PENDING");
      } catch {
        data.completionWarnings.push("TEMPLATE_INSTANCE_WEBHOOK_PENDING");
      }
    data.completionWarnings = [...new Set(data.completionWarnings)];
    data.outcome =
      data.failedTargets.length || data.completionWarnings.length
        ? "partial"
        : "complete";
    data.canApply = false;
    return NextResponse.json({ success: true, requestId, data }, { headers });
  } catch (cause) {
    if (cause instanceof SyntaxError)
      return error(
        400,
        "INVALID_TEMPLATE_INSTANCE_REQUEST",
        "Provide a valid JSON review/apply request.",
        requestId,
      );
    if (cause instanceof CollectionExportIncompleteError)
      return error(
        503,
        "TEMPLATE_INSTANCE_INVENTORY_INCOMPLETE",
        "A complete consistent site inventory could not be read. Retry after changes finish.",
        requestId,
      );
    if (cause instanceof Error && cause.message === "TEMPLATE_INSTANCE_LIMIT")
      return error(
        413,
        "TEMPLATE_INSTANCE_LIMIT",
        "Instance content exceeds safe review limits.",
        requestId,
      );
    if (cause instanceof Error && cause.message === "TEMPLATE_INSTANCE_UNSAFE")
      return error(
        422,
        "TEMPLATE_INSTANCE_CONTENT_UNSUPPORTED",
        "An instance baseline contains unsafe credential or prototype fields. Remove them before reviewing again.",
        requestId,
      );
    return error(
      500,
      "INTERNAL_SERVER_ERROR",
      "The template instance review could not complete. Try again.",
      requestId,
    );
  }
}
