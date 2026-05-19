import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/adminAccess";
import { recordAdminAudit } from "@/lib/adminAudit";
import {
  createMediaFolder,
  getSiteByIdOrSlug,
  listMediaFolders,
} from "@/lib/backyStore";
import { recordSiteCacheInvalidation } from "@/lib/cacheInvalidation";
import {
  getRequiredDatabaseRepositories,
  shouldUseDemoStoreFallback,
} from "@/lib/repositoryRuntime";
import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";
import type { BackyJsonObject, MediaFolder, Site } from "@backy-cms/core";

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

const nullableString = (value: unknown): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
};

const mediaFolderSortOrderFromInput = (
  value: unknown,
): { value?: number; invalid?: boolean } => {
  if (value === undefined || value === null || value === "") {
    return {};
  }

  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  if (!Number.isInteger(parsed) || parsed < 0) {
    return { invalid: true };
  }

  return { value: parsed };
};

const folderNameKey = (name: string) => name.trim().toLowerCase();

const hasSiblingFolderNameConflict = (
  folders: Array<{ name: string; parentId?: string | null }>,
  name: string,
  parentId: string | null | undefined,
) =>
  folders.some(
    (folder) =>
      (folder.parentId || null) === (parentId || null) &&
      folderNameKey(folder.name) === folderNameKey(name),
  );

const mediaFolderWebhookSnapshot = (folder: MediaFolder): BackyJsonObject => ({
  folderId: folder.id,
  name: folder.name,
  parentId: folder.parentId || null,
  sortOrder: folder.sortOrder ?? null,
  createdAt: folder.createdAt,
});

const deliverMediaFolderWebhook = async (params: {
  repositories?: Awaited<
    ReturnType<typeof getRequiredDatabaseRepositories>
  > | null;
  site: Site;
  action: "mediaFolder.created";
  after: MediaFolder;
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
      resourceType: "mediaFolder",
      after: mediaFolderWebhookSnapshot(params.after),
    },
    metadata: {
      action: params.action,
      changedKeys: ["media"],
      source: "admin-media-folders-api",
      resourceType: "mediaFolder",
      resourceId: params.after.id,
      name: params.after.name,
      parentId: params.after.parentId || null,
      sortOrder: params.after.sortOrder ?? null,
    },
  });

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();
  const access = await requireAdminAccess(request, requestId, {
    permission: "media.view",
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

      const folders = await repositories.media.listFolders(site.id);
      return NextResponse.json({ success: true, requestId, data: { folders } });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }

    const folders = listMediaFolders(site.id);

    return NextResponse.json({ success: true, requestId, data: { folders } });
  } catch (error) {
    console.error("Admin media folders list API error:", error);
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
    permission: "media.create",
  });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId } = await params;
    const repositories = !shouldUseDemoStoreFallback()
      ? await getRequiredDatabaseRepositories()
      : null;
    const repositorySite = repositories
      ? (await repositories.sites.getById(siteId)) ||
        (await repositories.sites.getBySlug(siteId))
      : null;
    const site = repositorySite || getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }

    const body = await parseJsonBody(request);
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name) {
      return errorResponse(
        400,
        "VALIDATION_ERROR",
        "Folder name is required",
        requestId,
      );
    }

    const parentId = nullableString(body.parentId);
    const folders = repositories
      ? await repositories.media.listFolders(site.id)
      : listMediaFolders(site.id);
    if (parentId) {
      if (!folders.some((folder) => folder.id === parentId)) {
        return errorResponse(
          404,
          "PARENT_FOLDER_NOT_FOUND",
          "Parent media folder not found",
          requestId,
        );
      }
    }
    if (hasSiblingFolderNameConflict(folders, name, parentId)) {
      return errorResponse(
        409,
        "FOLDER_NAME_CONFLICT",
        "A media folder with this name already exists in the selected parent folder.",
        requestId,
      );
    }
    const sortOrder = mediaFolderSortOrderFromInput(body.sortOrder);
    if (sortOrder.invalid) {
      return errorResponse(
        400,
        "INVALID_MEDIA_FOLDER_SORT_ORDER",
        "Media folder sortOrder must be an integer greater than or equal to 0.",
        requestId,
      );
    }

    const folder = repositories
      ? (
          await repositories.media.createFolder({
            siteId: site.id,
            name,
            parentId,
            sortOrder: sortOrder.value,
          })
        ).item
      : createMediaFolder(site.id, { name, parentId, sortOrder: sortOrder.value });
    await recordAdminAudit({
      repositories,
      siteId: site.id,
      entity: "mediaFolder",
      entityId: folder.id,
      action: "mediaFolder.create",
      after: folder,
      metadata: {
        name: folder.name,
        parentId: folder.parentId,
        sortOrder: folder.sortOrder,
      },
      requestId,
    });
    const cacheInvalidation = repositories
      ? await recordSiteCacheInvalidation(repositories, {
          siteId: site.id,
          scope: "media",
          entity: "mediaFolder",
          entityId: folder.id,
          reason: "media-folder-created",
          requestId,
        })
      : undefined;
    await deliverMediaFolderWebhook({
      repositories,
      site: site as unknown as Site,
      action: "mediaFolder.created",
      after: folder,
      requestId,
      actor: access.session?.user.id,
    });

    return NextResponse.json(
      { success: true, requestId, data: { folder, cacheInvalidation } },
      { status: 201 },
    );
  } catch (error) {
    console.error("Admin media folder create API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}
