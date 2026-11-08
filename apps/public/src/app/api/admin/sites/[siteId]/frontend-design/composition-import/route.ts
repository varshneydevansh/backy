import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/adminAccess";
import { getSiteByIdOrSlug } from "@/lib/backyStore";
import {
  getRequiredDatabaseRepositories,
  shouldUseDemoStoreFallback,
} from "@/lib/repositoryRuntime";
import {
  parseFrontendCompositionRequest,
  readCompositionInventory,
  readDemoCompositionInventory,
  reviewFrontendComposition,
  applyDemoFrontendComposition,
  applyRepositoryFrontendComposition,
} from "@/lib/frontendCompositionImport";
import { recordAdminAudit } from "@/lib/adminAudit";
import { editorMediaMutationErrorResponse } from "@/lib/editorMediaMutationError";
export const runtime = "nodejs";
const respond = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
/** Review is read-only. Apply requires both site configuration and the normal content-authoring permission. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const requestId =
    request.headers.get("x-request-id") || `req_${randomUUID()}`;
  const access = await requireAdminAccess(request, requestId, {
    permission: "sites.view",
  });
  if (access instanceof NextResponse) return access;
  try {
    if (Number(request.headers.get("content-length") || 0) > 2097152)
      return respond(
        {
          success: false,
          requestId,
          error: {
            code: "COMPOSITION_LIMIT",
            message: "Composition exceeds 2 MiB.",
          },
        },
        413,
      );
    const text = await request.text();
    if (Buffer.byteLength(text) > 2097152)
      return respond(
        {
          success: false,
          requestId,
          error: {
            code: "COMPOSITION_LIMIT",
            message: "Composition exceeds 2 MiB.",
          },
        },
        413,
      );
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return respond(
        {
          success: false,
          requestId,
          error: {
            code: "INVALID_COMPOSITION",
            message: "Use valid composition JSON.",
          },
        },
        400,
      );
    }
    const { request: input, issues } = parseFrontendCompositionRequest(body),
      { siteId: identifier } = await params;
    const demo = shouldUseDemoStoreFallback(),
      repositories = demo ? undefined : await getRequiredDatabaseRepositories();
    const site = demo
      ? getSiteByIdOrSlug(identifier)
      : (await repositories!.sites.getById(identifier)) ||
        (await repositories!.sites.getBySlug(identifier));
    if (!site)
      return respond(
        {
          success: false,
          requestId,
          error: { code: "SITE_NOT_FOUND", message: "Site not found." },
        },
        404,
      );
    if (input.action === "review") {
      const inventory = demo
        ? readDemoCompositionInventory(site.id)
        : await readCompositionInventory(site as any, repositories!);
      return respond({
        success: true,
        requestId,
        data: reviewFrontendComposition(input, inventory, issues),
      });
    }
    const configure = await requireAdminAccess(request, requestId, {
      permission: "sites.configure",
    });
    if (configure instanceof NextResponse) return configure;
    if (input.selection.some((id) => id.startsWith("route:"))) {
      const author = await requireAdminAccess(request, requestId, {
        permission: "pages.edit",
      });
      if (author instanceof NextResponse) return author;
    }
    const context = { actorId: access.session?.user?.id || null, requestId };
    const data = demo
      ? applyDemoFrontendComposition(input, site.id, context, issues)
      : await applyRepositoryFrontendComposition(
          input,
          site.id,
          repositories!,
          context,
          issues,
        );
    // Repository audit is transactional. The single-process demo audit is a postcommit event; authored content remains committed if this event is unavailable.
    if (demo)
      try {
        await recordAdminAudit({
          siteId: site.id,
          actorId: context.actorId,
          entity: "site",
          entityId: site.id,
          action: "update",
          requestId,
          metadata: {
            operation: "frontendDesign.compositionImport",
            reviewVersion: data.reviewVersion,
            draftIds: data.drafts.map((d) => d.id),
          },
        });
      } catch {}
    return respond({ success: true, requestId, data }, 201);
  } catch (cause) {
    const mediaAdmissionError = editorMediaMutationErrorResponse(cause, requestId);
    if (mediaAdmissionError) return mediaAdmissionError;
    const error = cause as { status?: number; code?: string; message?: string };
    const stale = [
      "40001",
      "40P01",
      "23505",
      "TEMPLATE_HISTORY_CONFLICT",
    ].includes(error.code || "");
    const status = stale
      ? 409
      : error.status ||
        ([
          "COLLECTION_INVENTORY_INCOMPLETE",
          "COLLECTION_INVENTORY_UNAVAILABLE",
        ].includes(error.code || "")
          ? 503
          : 500);
    return respond(
      {
        success: false,
        requestId,
        error: {
          code: stale
            ? "COMPOSITION_REVIEW_STALE"
            : error.code || "COMPOSITION_IMPORT_FAILED",
          message: stale
            ? "Site content changed while applying. Review again before retrying."
            : status === 500
              ? "Composition could not apply; no transactional changes were committed. Retry review."
              : error.message ||
                "Complete inventory is unavailable. Retry review.",
        },
      },
      status,
    );
  }
}
