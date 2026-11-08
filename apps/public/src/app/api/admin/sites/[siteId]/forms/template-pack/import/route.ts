import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { FORM_TEMPLATE_PACK_MAX_BYTES } from "@backy-cms/core";
import { requireAdminAccess } from "@/lib/adminAccess";
import { getSiteByIdOrSlug } from "@/lib/backyStore";
import {
  getRequiredDatabaseRepositories,
  shouldUseDemoStoreFallback,
} from "@/lib/repositoryRuntime";
import {
  parseFormTemplatePackRequest,
  readFormPackInventory,
  reviewFormTemplatePack,
  applyFormTemplatePack,
  formPackRequiredResources,
  formPackError,
} from "@/lib/formTemplatePackImport";
import { recordAdminAudit } from "@/lib/adminAudit";
export const runtime = "nodejs";
const respond = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const requestId =
    request.headers.get("x-request-id") || `req_${randomUUID()}`;
  const initial = await requireAdminAccess(request, requestId, {
    permission: "forms.view",
  });
  if (initial instanceof NextResponse) return initial;
  try {
    if (
      Number(request.headers.get("content-length") || 0) >
      FORM_TEMPLATE_PACK_MAX_BYTES
    )
      throw formPackError(413, "FORM_TEMPLATE_LIMIT", "Pack exceeds 2 MiB.");
    const raw = await request.text();
    if (Buffer.byteLength(raw) > FORM_TEMPLATE_PACK_MAX_BYTES)
      throw formPackError(413, "FORM_TEMPLATE_LIMIT", "Pack exceeds 2 MiB.");
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw formPackError(
        400,
        "INVALID_FORM_TEMPLATE_PACK",
        "Choose a valid JSON form template pack.",
      );
    }
    const input = parseFormTemplatePackRequest(body),
      demo = shouldUseDemoStoreFallback(),
      repositories = demo ? undefined : await getRequiredDatabaseRepositories();
    if (input.action === "apply") {
      const access = await requireAdminAccess(request, requestId, {
        permission: "forms.create",
      });
      if (access instanceof NextResponse) return access;
    }
    const resources = formPackRequiredResources(input);
    for (const resource of resources) {
      const permission =
        resource === "collections"
          ? input.action === "apply"
            ? "collections.edit"
            : "collections.view"
          : resource === "media"
            ? "media.view"
            : "pages.view";
      const access = await requireAdminAccess(request, requestId, {
        permission,
      });
      if (access instanceof NextResponse) return access;
    }
    const { siteId: identifier } = await params,
      site = demo
        ? getSiteByIdOrSlug(identifier)
        : (await repositories!.sites.getById(identifier)) ||
          (await repositories!.sites.getBySlug(identifier));
    if (!site) throw formPackError(404, "SITE_NOT_FOUND", "Site not found.");
    if (input.action === "review")
      return respond({
        success: true,
        requestId,
        data: reviewFormTemplatePack(
          input,
          await readFormPackInventory(site.id, input, repositories),
        ),
      });
    const actorId = initial.session?.user?.id || null,
      data = await applyFormTemplatePack(input, site.id, actorId, repositories);
    try {
      await recordAdminAudit({
        siteId: site.id,
        actorId,
        entity: "form",
        entityId: data.forms[0]?.form.id || site.id,
        action: "create",
        requestId,
        metadata: {
          operation: "forms.templatePackImport",
          reviewVersion: data.reviewVersion,
          formIds: data.forms.map((x) => x.form.id),
        },
      });
    } catch {
      data.completionWarnings.push("FORM_TEMPLATE_AUDIT_PENDING");
    }
    return respond({ success: true, requestId, data }, 201);
  } catch (cause) {
    const error = cause as { code?: string; status?: number };
    const conflict = ["40001", "40P01", "23505"].includes(error.code || "");
    const code = conflict
      ? "FORM_TEMPLATE_REVIEW_STALE"
      : error.code === "FORM_TEMPLATE_IMPORT_UNAVAILABLE"
        ? "FORM_TEMPLATE_IMPORT_UNAVAILABLE"
        : error.status
          ? error.code
          : "FORM_TEMPLATE_IMPORT_FAILED";
    const status = conflict
      ? 409
      : error.code === "FORM_TEMPLATE_IMPORT_UNAVAILABLE"
        ? 503
        : error.status || 500;
    const messages: Record<number, string> = {
      400: "Invalid form template import request.",
      404: "Site not found.",
      409: "Package or current destination changed. Review again.",
      413: "Form template pack exceeds the import limits.",
      422: "Resolve blocking findings and acknowledge unverified behavior.",
      503: "Complete inventory or atomic form import is unavailable. Retry later.",
      500: "Form import could not be committed.",
    };
    return respond(
      {
        success: false,
        requestId,
        error: { code, message: messages[status] || "Form import failed." },
      },
      status,
    );
  }
}
