/**
 * Admin media detail endpoint.
 *
 * PATCH  /api/admin/sites/[siteId]/media/[mediaId]
 * DELETE /api/admin/sites/[siteId]/media/[mediaId]
 * POST   /api/admin/sites/[siteId]/media/[mediaId] (multipart replacement)
 */

import { createHash } from "node:crypto";
import { extname } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/adminAccess";
import { recordAdminAudit } from "@/lib/adminAudit";
import {
  deleteMediaItem,
  getAdminSettings,
  getMediaById,
  getMediaList,
  getSiteByIdOrSlug,
  listMediaFolders,
  updateMediaItem,
} from "@/lib/backyStore";
import { recordSiteCacheInvalidation } from "@/lib/cacheInvalidation";
import {
  getMediaSecurityPolicy,
  MediaSafetyError,
  scanMediaUploadWithProviders,
} from "@/lib/mediaSafety";
import {
  buildMediaScopeMetadataPatch,
  mediaScopeRequiresTarget,
} from "@/lib/mediaScope";
import {
  getMediaStorageAdapter,
  getMediaStoragePath,
  getMediaStoragePathFromMedia,
} from "@/lib/mediaStorage";
import {
  deleteGeneratedTransformFiles,
  generatedTransformBytes,
  generatedTransformStoragePaths,
} from "@/lib/mediaTransformGeneration";
import {
  isUploadAllowedByFileType,
  mediaQuotaPayload,
  readMediaBillingLimit,
  resolveMediaUploadPolicy,
} from "@/lib/mediaUploadPolicy";
import {
  getRequiredDatabaseRepositories,
  shouldUseDemoStoreFallback,
} from "@/lib/repositoryRuntime";
import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";
import type { BackyJsonObject, MediaItem, Site } from "@backy-cms/core";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{
    siteId: string;
    mediaId: string;
  }>;
}

const makeRequestId = () =>
  `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const MAX_REPLACEMENT_VERSIONS = 20;

const buildMediaBinaryFingerprint = (buffer: Buffer) => {
  const value = createHash("sha256").update(buffer).digest("hex");
  return {
    algorithm: "sha256",
    value,
    shortValue: value.slice(0, 12),
    sizeBytes: buffer.length,
  };
};

const MIME_TYPE_TO_MEDIA_TYPE: Array<{
  test: (mimeType: string, extension: string) => boolean;
  type: MediaItem["type"];
}> = [
  { test: (mimeType) => mimeType.startsWith("image/"), type: "image" },
  { test: (mimeType) => mimeType.startsWith("video/"), type: "video" },
  { test: (mimeType) => mimeType.startsWith("audio/"), type: "audio" },
  {
    test: (mimeType, extension) =>
      mimeType === "application/pdf" ||
      [
        ".pdf",
        ".doc",
        ".docx",
        ".xls",
        ".xlsx",
        ".ppt",
        ".pptx",
        ".txt",
        ".csv",
      ].includes(extension),
    type: "document",
  },
  {
    test: (mimeType, extension) =>
      mimeType.startsWith("font/") ||
      mimeType === "application/font-woff" ||
      mimeType === "application/x-font-ttf" ||
      mimeType === "application/vnd.ms-fontobject" ||
      [".woff", ".woff2", ".ttf", ".otf", ".eot"].includes(extension),
    type: "font",
  },
];

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

const safePathSegment = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "asset";

const cleanFontFamily = (value: string) =>
  value
    .trim()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ") || "Uploaded Font";

const toStringValue = (value: FormDataEntryValue | null): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const metadataString = (
  metadata: Record<string, unknown>,
  key: string,
): string | null => {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
};

const parseFontDisplay = (value: unknown) =>
  value === "auto" ||
  value === "block" ||
  value === "fallback" ||
  value === "optional" ||
  value === "swap"
    ? value
    : "swap";

const getMediaType = (
  mimeType: string,
  originalName: string,
): MediaItem["type"] => {
  const extension = extname(originalName).toLowerCase();
  return (
    MIME_TYPE_TO_MEDIA_TYPE.find((candidate) =>
      candidate.test(mimeType, extension),
    )?.type ?? "other"
  );
};

const mediaFolderForType = (type: MediaItem["type"]) => {
  if (type === "font") return "fonts";
  if (type === "image") return "images";
  if (type === "video") return "videos";
  if (type === "audio") return "audio";
  if (type === "document") return "documents";
  return "files";
};

const replacementVersionBytes = (
  metadata: MediaItem["metadata"] | undefined,
): number => {
  const versions =
    metadata && Array.isArray(metadata.replacementVersions)
      ? metadata.replacementVersions
      : [];

  return versions.reduce((total, version) => {
    if (!version || typeof version !== "object" || Array.isArray(version)) {
      return total;
    }

    return (
      total +
      Math.max(0, Number((version as Record<string, unknown>).sizeBytes) || 0)
    );
  }, 0);
};

const mediaUsageBytes = (items: MediaItem[]) =>
  items.reduce(
    (total, item) =>
      total +
      Math.max(0, Number(item.sizeBytes) || 0) +
      replacementVersionBytes(item.metadata) +
      generatedTransformBytes(item.metadata),
    0,
  );

const replacementVersionsFromMetadata = (
  metadata: MediaItem["metadata"] | undefined,
): Record<string, unknown>[] =>
  metadata && Array.isArray(metadata.replacementVersions)
    ? metadata.replacementVersions.filter(
        (version): version is Record<string, unknown> =>
          !!version && typeof version === "object" && !Array.isArray(version),
      )
    : [];

const buildPreviousVersion = (
  media: MediaItem,
  input: {
    replacedAt: string;
    replacedBy: string | null;
    reason: string | null;
  },
) => ({
  id: `version_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
  filename: media.filename,
  originalName: media.originalName,
  mimeType: media.mimeType,
  sizeBytes: media.sizeBytes,
  type: media.type,
  url: media.url,
  thumbnailUrl: media.thumbnailUrl,
  storagePath:
    typeof media.metadata?.storagePath === "string"
      ? media.metadata.storagePath
      : null,
  storageProvider:
    typeof media.metadata?.storageProvider === "string"
      ? media.metadata.storageProvider
      : null,
  binaryFingerprint: media.metadata?.binaryFingerprint || null,
  createdAt: media.updatedAt || media.createdAt,
  replacedAt: input.replacedAt,
  replacedBy: input.replacedBy,
  reason: input.reason,
});

const addScopedStoragePath = (
  siteId: string,
  storagePaths: Set<string>,
  value: unknown,
) => {
  const storagePath = typeof value === "string" ? value.trim() : "";
  if (storagePath.length > 0 && storagePath.startsWith(`sites/${siteId}/`)) {
    storagePaths.add(storagePath);
  }
};

const collectMediaStoragePaths = (
  siteId: string,
  media: { url?: string | null; metadata?: unknown },
) => {
  const storagePaths = new Set<string>();
  addScopedStoragePath(
    siteId,
    storagePaths,
    getMediaStoragePathFromMedia(siteId, media),
  );

  if (
    media.metadata &&
    typeof media.metadata === "object" &&
    !Array.isArray(media.metadata)
  ) {
    generatedTransformStoragePaths(media.metadata).forEach((path) => {
      addScopedStoragePath(siteId, storagePaths, path);
    });

    const versions = (media.metadata as Record<string, unknown>)
      .replacementVersions;
    if (Array.isArray(versions)) {
      versions.forEach((version) => {
        if (version && typeof version === "object" && !Array.isArray(version)) {
          addScopedStoragePath(
            siteId,
            storagePaths,
            (version as Record<string, unknown>).storagePath,
          );
        }
      });
    }
  }

  return storagePaths;
};

const collectRetainedVersionStoragePaths = (
  siteId: string,
  versions: Array<{
    url?: string | null;
    metadata?: unknown;
    storagePath?: string | null;
  }>,
) => {
  const storagePaths = new Set<string>();

  versions.forEach((version) => {
    addScopedStoragePath(siteId, storagePaths, version.storagePath);
    addScopedStoragePath(
      siteId,
      storagePaths,
      getMediaStoragePathFromMedia(siteId, version),
    );
  });

  return Array.from(storagePaths);
};

const deleteUploadedFile = async (
  siteId: string,
  media: { url?: string | null; metadata?: unknown },
  retainedStoragePaths: string[] = [],
) => {
  const storagePaths = collectMediaStoragePaths(siteId, media);
  retainedStoragePaths.forEach((path) => {
    addScopedStoragePath(siteId, storagePaths, path);
  });

  if (storagePaths.size === 0) {
    return;
  }

  try {
    const storage = await getMediaStorageAdapter();
    await Promise.all(
      Array.from(storagePaths).map((path) => storage.delete(path)),
    );
  } catch {
    // Missing storage objects should not make catalog deletion fail.
  }
};

const stringArrayFromInput = (value: unknown): string[] | undefined =>
  Array.isArray(value)
    ? Array.from(
        new Map(
          value
            .flatMap((item) =>
              typeof item === "string" ? item.split(/[,\n]/g) : [],
            )
            .map((item) => item.trim().replace(/\s+/g, " "))
            .filter(Boolean)
            .map((item) => [item.toLowerCase(), item]),
        ).values(),
      )
    : undefined;

const metadataFromInput = (
  value: unknown,
): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const visibilityFromInput = (
  value: unknown,
): "public" | "private" | undefined =>
  value === "public" || value === "private" ? value : undefined;

const hasBodyKey = (body: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(body, key);

const isMediaScopeInput = (
  value: unknown,
): value is "global" | "page" | "post" =>
  value === "global" || value === "page" || value === "post";

const mediaUpdateValidationError = (
  body: Record<string, unknown>,
  requestId: string,
) => {
  if (
    hasBodyKey(body, "visibility") &&
    body.visibility !== undefined &&
    !visibilityFromInput(body.visibility)
  ) {
    return errorResponse(
      400,
      "INVALID_MEDIA_VISIBILITY",
      "Invalid media visibility. Use public or private.",
      requestId,
    );
  }

  if (
    hasBodyKey(body, "scope") &&
    body.scope !== undefined &&
    !isMediaScopeInput(body.scope)
  ) {
    return errorResponse(
      400,
      "INVALID_MEDIA_SCOPE",
      "Invalid media scope. Use global, page, or post.",
      requestId,
    );
  }

  if (
    hasBodyKey(body, "scopeTargetId") &&
    body.scopeTargetId !== undefined &&
    body.scopeTargetId !== null &&
    typeof body.scopeTargetId !== "string"
  ) {
    return errorResponse(
      400,
      "INVALID_MEDIA_SCOPE_TARGET",
      "Invalid media scope target. Use a string id or null.",
      requestId,
    );
  }

  if (
    hasBodyKey(body, "folderId") &&
    body.folderId !== undefined &&
    body.folderId !== null &&
    typeof body.folderId !== "string"
  ) {
    return errorResponse(
      400,
      "INVALID_MEDIA_FOLDER",
      "Invalid media folder. Use a folder id string or null.",
      requestId,
    );
  }

  if (
    hasBodyKey(body, "metadata") &&
    body.metadata !== undefined &&
    (body.metadata === null ||
      typeof body.metadata !== "object" ||
      Array.isArray(body.metadata))
  ) {
    return errorResponse(
      400,
      "INVALID_MEDIA_METADATA",
      "Invalid media metadata. Use a JSON object.",
      requestId,
    );
  }

  if (
    hasBodyKey(body, "tags") &&
    body.tags !== undefined &&
    (body.tags === null || !Array.isArray(body.tags))
  ) {
    return errorResponse(
      400,
      "INVALID_MEDIA_TAGS",
      "Invalid media tags. Use an array of strings.",
      requestId,
    );
  }

  return null;
};

const nullableStringFromBody = (value: unknown): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return typeof value === "string" ? value.trim() || null : undefined;
};

const mediaScopeValidationError = (
  scopePatch: ReturnType<typeof buildMediaScopeMetadataPatch>,
  requestId: string,
) => {
  if (!mediaScopeRequiresTarget(scopePatch.scope) || scopePatch.scopeTargetId) {
    return null;
  }

  return errorResponse(
    400,
    "MEDIA_SCOPE_TARGET_REQUIRED",
    "Page and post scoped media require a scopeTargetId.",
    requestId,
    { scope: scopePatch.scope },
  );
};

const mediaAssetWebhookSnapshot = (media: MediaItem): BackyJsonObject => ({
  mediaId: media.id,
  filename: media.filename,
  originalName: media.originalName || null,
  mimeType: media.mimeType,
  type: media.type,
  url: media.url,
  thumbnailUrl: media.thumbnailUrl || null,
  sizeBytes: media.sizeBytes,
  visibility: media.visibility || "public",
  folderId: media.folderId || null,
  tagCount: Array.isArray(media.tags) ? media.tags.length : 0,
  altText: media.altText || null,
  caption: media.caption || null,
  createdAt: media.createdAt,
  updatedAt: media.updatedAt,
});

const deliverMediaAssetWebhook = async (params: {
  repositories?: Awaited<
    ReturnType<typeof getRequiredDatabaseRepositories>
  > | null;
  site: Site;
  action: "media.updated" | "media.replaced" | "media.deleted";
  before?: MediaItem;
  after?: MediaItem;
  changedFields?: string[];
  requestId: string;
  actor?: string | null;
}) => {
  const current = params.after || params.before;

  return deliverSiteWebhooks({
    repositories: params.repositories,
    site: params.site,
    kind: "site-updated",
    requestId: params.requestId,
    actor: params.actor,
    reason: params.action,
    data: {
      resourceType: "media",
      ...(params.before
        ? { before: mediaAssetWebhookSnapshot(params.before) }
        : {}),
      ...(params.after
        ? { after: mediaAssetWebhookSnapshot(params.after) }
        : {}),
    },
    metadata: {
      action: params.action,
      changedKeys: ["media"],
      source: "admin-media-detail-api",
      resourceType: "media",
      resourceId: current?.id || null,
      filename: current ? current.originalName || current.filename : null,
      mimeType: current?.mimeType || null,
      type: current?.type || null,
      visibility: current?.visibility || "public",
      folderId: current?.folderId || null,
      sizeBytes: current?.sizeBytes || 0,
      changedFields: params.changedFields || [],
    },
  });
};

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();
  const access = await requireAdminAccess(request, requestId, {
    permission: "media.edit",
  });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, mediaId } = await params;
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

      const beforeMedia = await repositories.media.getById(site.id, mediaId);
      if (!beforeMedia) {
        return errorResponse(
          404,
          "MEDIA_NOT_FOUND",
          "Media item not found",
          requestId,
        );
      }

      const body = await parseJsonBody(request);
      const validationError = mediaUpdateValidationError(body, requestId);
      if (validationError) {
        return validationError;
      }
      const folderId = nullableStringFromBody(body.folderId);
      const inputMetadata = metadataFromInput(body.metadata);
      const scopePatch = buildMediaScopeMetadataPatch(
        {
          scope: body.scope,
          scopeTargetId: body.scopeTargetId,
          pageIds: body.pageIds,
          postIds: body.postIds,
        },
        beforeMedia,
      );
      const scopeError = mediaScopeValidationError(scopePatch, requestId);
      if (scopeError) {
        return scopeError;
      }
      const scopedMetadata = {
        ...(inputMetadata || {}),
        ...scopePatch,
      };
      const requestedVisibility = visibilityFromInput(body.visibility);
      const nextMetadata = {
        ...(beforeMedia.metadata || {}),
        ...scopedMetadata,
      };
      const nextSecurity = getMediaSecurityPolicy(nextMetadata);
      const nextVisibility =
        nextSecurity.status === "quarantined" ? "private" : requestedVisibility;
      if (folderId) {
        const folder = await repositories.media.getFolderById(
          site.id,
          folderId,
        );
        if (!folder) {
          return errorResponse(
            404,
            "FOLDER_NOT_FOUND",
            "Media folder not found",
            requestId,
          );
        }
      }

      const updated = await repositories.media.update(site.id, mediaId, {
        filename: typeof body.filename === "string" ? body.filename : undefined,
        originalName:
          typeof body.originalName === "string" ? body.originalName : undefined,
        folderId,
        altText:
          typeof body.altText === "string" || body.altText === null
            ? body.altText
            : undefined,
        caption:
          typeof body.caption === "string" || body.caption === null
            ? body.caption
            : undefined,
        visibility: nextVisibility,
        metadata: scopedMetadata,
        tags: stringArrayFromInput(body.tags),
      });
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: "media",
        entityId: updated.item.id,
        action: "update",
        before: beforeMedia,
        after: updated.item,
        metadata: {
          changedKeys: Object.keys(body),
        },
        requestId,
      });
      const cacheInvalidation = await recordSiteCacheInvalidation(
        repositories,
        {
          siteId: site.id,
          scope: "media",
          entity: "media",
          entityId: updated.item.id,
          reason: "media-updated",
          requestId,
        },
      );
      await deliverMediaAssetWebhook({
        repositories,
        site,
        action: "media.updated",
        before: beforeMedia,
        after: updated.item,
        changedFields: Object.keys(body),
        requestId,
        actor: access.session?.user.id,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: { media: updated.item, cacheInvalidation },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }

    const beforeMedia = getMediaById(site.id, mediaId);
    if (!beforeMedia) {
      return errorResponse(
        404,
        "MEDIA_NOT_FOUND",
        "Media item not found",
        requestId,
      );
    }

    const body = await parseJsonBody(request);
    const validationError = mediaUpdateValidationError(body, requestId);
    if (validationError) {
      return validationError;
    }
    const folderId = nullableStringFromBody(body.folderId);
    const inputMetadata = metadataFromInput(body.metadata);
    const scopePatch = buildMediaScopeMetadataPatch(
      {
        scope: body.scope,
        scopeTargetId: body.scopeTargetId,
        pageIds: body.pageIds,
        postIds: body.postIds,
      },
      beforeMedia,
    );
    const scopeError = mediaScopeValidationError(scopePatch, requestId);
    if (scopeError) {
      return scopeError;
    }
    const scopedMetadata = {
      ...(inputMetadata || {}),
      ...scopePatch,
    };
    const requestedVisibility = visibilityFromInput(body.visibility);
    const nextMetadata = {
      ...(beforeMedia.metadata || {}),
      ...scopedMetadata,
    };
    const nextSecurity = getMediaSecurityPolicy(nextMetadata);
    const nextVisibility =
      nextSecurity.status === "quarantined" ? "private" : requestedVisibility;
    if (folderId) {
      const folder = listMediaFolders(site.id).find(
        (item) => item.id === folderId,
      );
      if (!folder) {
        return errorResponse(
          404,
          "FOLDER_NOT_FOUND",
          "Media folder not found",
          requestId,
        );
      }
    }

    const media = updateMediaItem(site.id, mediaId, {
      ...body,
      ...(nextVisibility ? { visibility: nextVisibility } : {}),
      metadata: scopedMetadata,
    });

    if (!media) {
      return errorResponse(
        404,
        "MEDIA_NOT_FOUND",
        "Media item not found",
        requestId,
      );
    }

    await recordAdminAudit({
      siteId: site.id,
      entity: "media",
      entityId: media.id,
      action: "update",
      before: beforeMedia,
      after: media,
      metadata: {
        changedKeys: Object.keys(body),
      },
      requestId,
    });
    await deliverMediaAssetWebhook({
      site: site as unknown as Site,
      action: "media.updated",
      before: beforeMedia,
      after: media,
      changedFields: Object.keys(body),
      requestId,
      actor: access.session?.user.id,
    });

    return NextResponse.json({ success: true, requestId, data: { media } });
  } catch (error) {
    console.error("Admin media update API error:", error);
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
    permission: "media.edit",
  });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, mediaId } = await params;
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

    const beforeMedia = repositories
      ? await repositories.media.getById(site.id, mediaId)
      : getMediaById(site.id, mediaId);

    if (!beforeMedia) {
      return errorResponse(
        404,
        "MEDIA_NOT_FOUND",
        "Media item not found",
        requestId,
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return errorResponse(
        400,
        "MISSING_FILE",
        "Replacement must include a file field",
        requestId,
      );
    }

    if (file.size <= 0) {
      return errorResponse(
        400,
        "EMPTY_FILE",
        "Replacement file is empty",
        requestId,
      );
    }

    const originalName = file.name || "replacement.bin";
    const mimeType = file.type || "application/octet-stream";
    const extension = extname(originalName).toLowerCase();
    const mediaType = getMediaType(mimeType, originalName);
    const settings = repositories
      ? await repositories.settings.get()
      : getAdminSettings();
    const uploadPolicy = resolveMediaUploadPolicy(settings);

    if (file.size > uploadPolicy.maxUploadBytes) {
      return errorResponse(
        413,
        "FILE_TOO_LARGE",
        `Replacement file exceeds the configured ${Math.floor(uploadPolicy.maxUploadBytes / (1024 * 1024))} MB limit.`,
        requestId,
        { maxUploadBytes: uploadPolicy.maxUploadBytes },
      );
    }

    if (
      !isUploadAllowedByFileType(uploadPolicy, {
        filename: originalName,
        mimeType,
      })
    ) {
      return errorResponse(
        415,
        "FILE_TYPE_NOT_ALLOWED",
        "Replacement file type is not allowed by the configured storage policy.",
        requestId,
        {
          allowedFileTypes: uploadPolicy.allowedFileTypes,
          mimeType,
          extension,
        },
      );
    }

    if (mediaType !== beforeMedia.type) {
      return errorResponse(
        400,
        "MEDIA_TYPE_MISMATCH",
        `Replacement must keep the same media type (${beforeMedia.type}).`,
        requestId,
        {
          currentType: beforeMedia.type,
          replacementType: mediaType,
        },
      );
    }

    const siteMediaQuotaBytes = uploadPolicy.quotaBytes;
    const currentMedia = repositories
      ? (
          await repositories.media.list({
            siteId: site.id,
            type: "all",
            visibility: "all",
            limit: 10000,
            offset: 0,
          })
        ).items
      : getMediaList(site.id, {
          limit: 10000,
          offset: 0,
        }).media;
    const currentUsageBytes = mediaUsageBytes(currentMedia);
    const nextUsageBytes = currentUsageBytes + file.size;
    const billingLimit = readMediaBillingLimit(
      site.settings,
      settings,
      nextUsageBytes,
    );

    if (billingLimit.blocked) {
      return errorResponse(
        402,
        "BILLING_MEDIA_LIMIT",
        `The ${billingLimit.policy.billingPlan} site plan allows ${billingLimit.policy.mediaLimitGb} GB of media storage. Update the site billing quota before replacing this asset.`,
        requestId,
        mediaQuotaPayload(billingLimit.limitBytes, currentUsageBytes),
      );
    }

    if (nextUsageBytes > siteMediaQuotaBytes) {
      return errorResponse(
        413,
        "SITE_MEDIA_QUOTA_EXCEEDED",
        "Replacing this file would exceed the site media storage quota because previous versions are retained.",
        requestId,
        mediaQuotaPayload(siteMediaQuotaBytes, currentUsageBytes, uploadPolicy),
      );
    }

    const safeName = safePathSegment(
      extension ? originalName.slice(0, -extension.length) : originalName,
    );
    const storedFilename = `${Date.now().toString(36)}-${safeName}${extension}`;
    const storagePath = getMediaStoragePath({
      siteId: site.id,
      mediaFolder: mediaFolderForType(mediaType),
      storedFilename,
    });
    const uploadBuffer = Buffer.from(await file.arrayBuffer());
    const binaryFingerprint = buildMediaBinaryFingerprint(uploadBuffer);
    const safetyScan = await scanMediaUploadWithProviders({
      buffer: uploadBuffer,
      originalName,
      mimeType,
      mediaType,
    });
    const storage = await getMediaStorageAdapter();
    const upload = await storage.upload(uploadBuffer, {
      path: storagePath,
      filename: storedFilename,
      mimeType,
      metadata: {
        siteId: site.id,
        mediaType,
        originalName,
        replacesMediaId: beforeMedia.id,
      },
    });
    const replacedAt = new Date().toISOString();
    const replacedBy = toStringValue(formData.get("replacedBy")) || "admin";
    const reason = toStringValue(formData.get("reason"));
    const previousVersion = buildPreviousVersion(beforeMedia, {
      replacedAt,
      replacedBy,
      reason,
    });
    const replacementVersions = [
      previousVersion,
      ...replacementVersionsFromMetadata(beforeMedia.metadata),
    ].slice(0, MAX_REPLACEMENT_VERSIONS);
    await deleteGeneratedTransformFiles(beforeMedia.metadata).catch(
      () => undefined,
    );
    const metadataWithoutGeneratedTransforms = {
      ...(beforeMedia.metadata || {}),
    };
    delete metadataWithoutGeneratedTransforms.generatedTransforms;
    const metadata = {
      ...metadataWithoutGeneratedTransforms,
      extension: extension.replace(/^\./, ""),
      storagePath: upload.path,
      storageProvider: storage.provider,
      binaryFingerprint,
      safetyScan,
      thumbnailUrl: mediaType === "image" ? upload.url : null,
      replacementVersions,
      replacementCount: replacementVersions.length,
      lastReplacedAt: replacedAt,
      lastReplacedBy: replacedBy,
      ...(mediaType === "font"
        ? {
            fontFamily:
              toStringValue(formData.get("fontFamily")) ||
              metadataString(
                metadataWithoutGeneratedTransforms,
                "fontFamily",
              ) ||
              cleanFontFamily(originalName),
            fontWeight:
              toStringValue(formData.get("fontWeight")) ||
              metadataString(
                metadataWithoutGeneratedTransforms,
                "fontWeight",
              ) ||
              "400",
            fontStyle:
              toStringValue(formData.get("fontStyle")) ||
              metadataString(metadataWithoutGeneratedTransforms, "fontStyle") ||
              "normal",
            fontFallback:
              toStringValue(formData.get("fontFallback")) ||
              metadataString(
                metadataWithoutGeneratedTransforms,
                "fontFallback",
              ) ||
              "system-ui, sans-serif",
            fontDisplay: parseFontDisplay(
              toStringValue(formData.get("fontDisplay")) ||
                metadataString(
                  metadataWithoutGeneratedTransforms,
                  "fontDisplay",
                ),
            ),
          }
        : {}),
    };
    const updated = repositories
      ? (
          await repositories.media.update(site.id, mediaId, {
            filename: storedFilename,
            originalName,
            mimeType,
            size: upload.size,
            type: mediaType,
            url: upload.url,
            thumbnailUrl: mediaType === "image" ? upload.url : null,
            metadata,
          })
        ).item
      : updateMediaItem(site.id, mediaId, {
          filename: storedFilename,
          originalName,
          mimeType,
          sizeBytes: upload.size,
          type: mediaType,
          url: upload.url,
          thumbnailUrl: mediaType === "image" ? upload.url : null,
          metadata,
        });

    if (!updated) {
      return errorResponse(
        404,
        "MEDIA_NOT_FOUND",
        "Media item not found",
        requestId,
      );
    }

    const versionRecord = repositories
      ? (
          await repositories.media.createVersion({
            siteId: site.id,
            mediaId,
            filename: previousVersion.filename,
            originalName: previousVersion.originalName,
            mimeType: previousVersion.mimeType,
            sizeBytes: previousVersion.sizeBytes,
            type: previousVersion.type,
            url: previousVersion.url,
            thumbnailUrl: previousVersion.thumbnailUrl,
            storagePath: previousVersion.storagePath,
            storageProvider: previousVersion.storageProvider,
            replacedAt,
            replacedBy,
            reason,
            metadata: {
              source: "media.replace",
              retainedMetadataVersionId: previousVersion.id,
              binaryFingerprint: previousVersion.binaryFingerprint,
            },
          })
        ).item
      : null;

    await recordAdminAudit({
      repositories,
      siteId: site.id,
      entity: "media",
      entityId: updated.id,
      action: "media.replace",
      before: beforeMedia,
      after: updated,
      metadata: {
        previousFilename: beforeMedia.originalName || beforeMedia.filename,
        replacementFilename: updated.originalName || updated.filename,
        previousSizeBytes: beforeMedia.sizeBytes,
        replacementSizeBytes: updated.sizeBytes,
        retainedVersions: replacementVersions.length,
        safetyStatus: safetyScan.status,
        reason,
      },
      requestId,
    });
    const cacheInvalidation = repositories
      ? await recordSiteCacheInvalidation(repositories, {
          siteId: site.id,
          scope: "media",
          entity: "media",
          entityId: updated.id,
          reason: "media-replaced",
          requestId,
        })
      : undefined;
    await deliverMediaAssetWebhook({
      repositories,
      site: site as unknown as Site,
      action: "media.replaced",
      before: beforeMedia,
      after: updated,
      changedFields: ["file", "metadata", "replacementVersions"],
      requestId,
      actor: access.session?.user.id,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        media: updated,
        cacheInvalidation,
        quota: mediaQuotaPayload(siteMediaQuotaBytes, nextUsageBytes),
        replacement: {
          previousVersion,
          versionRecord,
          retainedVersions: replacementVersions.length,
        },
      },
    });
  } catch (error) {
    if (error instanceof MediaSafetyError) {
      return errorResponse(
        415,
        error.code,
        error.message,
        requestId,
        error.details,
      );
    }

    console.error("Admin media replace API error:", error);
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
    permission: "media.delete",
  });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, mediaId } = await params;
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

      const media = await repositories.media.getById(site.id, mediaId);

      if (!media) {
        return errorResponse(
          404,
          "MEDIA_NOT_FOUND",
          "Media item not found",
          requestId,
        );
      }

      const retainedVersionStoragePaths = collectRetainedVersionStoragePaths(
        site.id,
        (
          await repositories.media.listVersions({
            siteId: site.id,
            mediaId,
            limit: 200,
            offset: 0,
          })
        ).items,
      );

      await repositories.media.delete(site.id, mediaId);
      await deleteUploadedFile(site.id, media, retainedVersionStoragePaths);
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: "media",
        entityId: media.id,
        action: "delete",
        before: media,
        metadata: {
          filename: media.originalName || media.filename,
          mimeType: media.mimeType,
          type: media.type,
          visibility: media.visibility || "public",
        },
        requestId,
      });
      const cacheInvalidation = await recordSiteCacheInvalidation(
        repositories,
        {
          siteId: site.id,
          scope: "media",
          entity: "media",
          entityId: media.id,
          reason: "media-deleted",
          requestId,
        },
      );
      await deliverMediaAssetWebhook({
        repositories,
        site,
        action: "media.deleted",
        before: media,
        requestId,
        actor: access.session?.user.id,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          deleted: true,
          mediaId,
          cacheInvalidation,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }

    const media = deleteMediaItem(site.id, mediaId);

    if (!media) {
      return errorResponse(
        404,
        "MEDIA_NOT_FOUND",
        "Media item not found",
        requestId,
      );
    }

    await deleteUploadedFile(site.id, media);
    await recordAdminAudit({
      siteId: site.id,
      entity: "media",
      entityId: media.id,
      action: "delete",
      before: media,
      metadata: {
        filename: media.originalName || media.filename,
        mimeType: media.mimeType,
        type: media.type,
        visibility: media.visibility || "public",
      },
      requestId,
    });
    await deliverMediaAssetWebhook({
      site: site as unknown as Site,
      action: "media.deleted",
      before: media,
      requestId,
      actor: access.session?.user.id,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        deleted: true,
        mediaId,
      },
    });
  } catch (error) {
    console.error("Admin media delete API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}
