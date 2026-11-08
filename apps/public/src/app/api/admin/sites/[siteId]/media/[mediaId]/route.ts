import type { MediaVersion } from '@backy-cms/core';
import { mediaStorageUsageWithPending, mediaStorageRetirementFiles, mediaStorageAssetRetirementFiles, withJournaledMediaStorageMutation, mediaStorageRecoveryErrorResponse } from '@/lib/mediaStorageRecovery';
import { isDeepStrictEqual } from 'node:util';
import { withMediaStorageMutation } from '@/lib/mediaStorageMutation';
/**
 * Admin media detail endpoint.
 *
 * PATCH  /api/admin/sites/[siteId]/media/[mediaId]
 * DELETE /api/admin/sites/[siteId]/media/[mediaId]
 * POST   /api/admin/sites/[siteId]/media/[mediaId] (multipart replacement)
 */

import { createHash, randomUUID } from "node:crypto";
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
  getBlogPosts,
  listAdminPages,
  listCollections,
  listCollectionRecords,
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
import { buildPublicMediaOrganization } from "@/lib/publicMediaResource";
import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";
import { authorizeMediaDeletion, repositoryMediaDeletionReferences, MediaDeletionSafetyError } from "@/lib/mediaDeletionSafety";
import { CollectionExportIncompleteError } from "@/lib/collectionExportPagination";
import type { BackyJsonObject, MediaFolder, MediaItem, Site } from "@backy-cms/core";

import { readCompleteMediaInventory, MediaInventoryIncompleteError } from '@/lib/mediaInventory';

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

const withAdminMediaOrganization = (
  media: MediaItem,
  folders: MediaFolder[] = [],
) => ({
  ...media,
  organization: buildPublicMediaOrganization(media, folders),
});

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

const storageManagedMetadataKeys = [
  'storagePath', 'storageProvider', 'binaryFingerprint', 'safetyScan',
  'generatedTransforms', 'replacementVersions', 'resumableUploadId',
] as const;
const editableMediaMetadataFromInput = (value: unknown) => {
  const metadata = metadataFromInput(value);
  if (!metadata) return undefined;
  return Object.fromEntries(Object.entries(metadata).filter(([key]) => !storageManagedMetadataKeys.includes(key as typeof storageManagedMetadataKeys[number])));
};
const jsonValue = (value: unknown): unknown => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const mediaStorageMetadataValidationError = (body: Record<string, unknown>, current: MediaItem, requestId: string) => {
  const input = metadataFromInput(body.metadata);
  if (input && storageManagedMetadataKeys.some(key => hasBodyKey(input, key)
    && !isDeepStrictEqual(jsonValue(input[key]), jsonValue(current.metadata?.[key])))) {
    return errorResponse(400, 'INVALID_MEDIA_METADATA', 'Storage paths, scan evidence, generated variants and replacement history are managed by upload, replacement and transform operations.', requestId);
  }
  const managedFields: Record<string, unknown> = {
    url: current.url, size: current.sizeBytes, sizeBytes: current.sizeBytes,
    mimeType: current.mimeType, type: current.type,
  };
  if (Object.entries(managedFields).some(([key, value]) => hasBodyKey(body, key)
    && !isDeepStrictEqual(jsonValue(body[key]), jsonValue(value)))) {
    return errorResponse(400, 'INVALID_MEDIA_METADATA', 'Binary URL, size, MIME type and media type require a replacement upload.', requestId);
  }
  return null;
};

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

      const body = await parseJsonBody(request);
      const admitted = await withMediaStorageMutation(repositories.media, site.id, requestId, async () => {
        const beforeMedia = await repositories.media.getById(site.id, mediaId);
        if (!beforeMedia) {
          return errorResponse(
            404,
            "MEDIA_NOT_FOUND",
            "Media item not found",
            requestId,
          );
        }

        const validationError = mediaUpdateValidationError(body, requestId) || mediaStorageMetadataValidationError(body, beforeMedia, requestId);
        if (validationError) {
          return validationError;
        }
        const folderId = nullableStringFromBody(body.folderId);
        const inputMetadata = editableMediaMetadataFromInput(body.metadata);
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
        return { beforeMedia, updated };
      });
      if (admitted instanceof NextResponse) return admitted;
      const { beforeMedia, updated } = admitted;
      // These tasks run after the metadata write commits. A failed task must not
      // report a failed save or invite the caller to replay the mutation.
      const completionWarnings: string[] = [];
      const followUp = async <T>(code: string, operation: () => Promise<T>): Promise<T | undefined> => {
        try { return await operation(); }
        catch { completionWarnings.push(code); return undefined; }
      };
      await followUp("MEDIA_AUDIT_PENDING", () => recordAdminAudit({
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
      }));
      const cacheInvalidation = await followUp("MEDIA_CACHE_INVALIDATION_PENDING", () => recordSiteCacheInvalidation(
        repositories,
        {
          siteId: site.id,
          scope: "media",
          entity: "media",
          entityId: updated.item.id,
          reason: "media-updated",
          requestId,
        },
      ));
      await followUp("MEDIA_WEBHOOK_DELIVERY_PENDING", async () => {
        const outcomes = await deliverMediaAssetWebhook({
          repositories,
          site,
          action: "media.updated",
          before: beforeMedia,
          after: updated.item,
          changedFields: Object.keys(body),
          requestId,
          actor: access.session?.user.id,
        });
        if (outcomes.some(outcome => outcome.status === "failed")) throw new Error("Media update notification needs retry.");
      });
      let responseMedia = withAdminMediaOrganization(updated.item);
      await followUp("MEDIA_ORGANIZATION_PENDING", async () => {
        responseMedia = withAdminMediaOrganization(updated.item, await repositories.media.listFolders(site.id));
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          media: responseMedia,
          ...(cacheInvalidation === undefined ? {} : { cacheInvalidation }),
          completionWarnings,
        },
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
    const validationError = mediaUpdateValidationError(body, requestId) || mediaStorageMetadataValidationError(body, beforeMedia, requestId);
    if (validationError) {
      return validationError;
    }
    const folderId = nullableStringFromBody(body.folderId);
    const inputMetadata = editableMediaMetadataFromInput(body.metadata);
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
      filename: typeof body.filename === 'string' ? body.filename : undefined,
      originalName: typeof body.originalName === 'string' ? body.originalName : undefined,
      folderId,
      altText: typeof body.altText === 'string' || body.altText === null ? body.altText : undefined,
      caption: typeof body.caption === 'string' || body.caption === null ? body.caption : undefined,
      visibility: nextVisibility,
      metadata: scopedMetadata,
      tags: stringArrayFromInput(body.tags),
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

    return NextResponse.json({
      success: true,
      requestId,
      data: { media: withAdminMediaOrganization(media, listMediaFolders(site.id)) },
    });
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

    return await withMediaStorageMutation(repositories?.media || null, site.id, requestId, async () => {
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
    const currentMedia = await readCompleteMediaInventory(site.id, async pagination => {
      if (repositories) return repositories.media.list({ siteId: site.id, type: 'all', visibility: 'all', ...pagination });
      const result = getMediaList(site.id, pagination);
      return { items: result.media, pagination: result.pagination };
    });
    const currentUsageBytes = await mediaStorageUsageWithPending(site.id, repositories);
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
    const storedFilename = `${randomUUID()}-${safeName}${extension}`;
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
    }, { access, siteId: site.id });
    const responseFolders = repositories ? await repositories.media.listFolders(site.id) : listMediaFolders(site.id);
    const storage = await getMediaStorageAdapter();
    const retired = await mediaStorageAssetRetirementFiles(site.id, beforeMedia as MediaItem, repositories);
    return withJournaledMediaStorageMutation({ siteId: site.id, mediaId: beforeMedia.id, operation: 'replace', requestId, files: [{ path: storagePath, bytes: uploadBuffer.length, purpose: 'write' }, ...retired] }, repositories, async () => {
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
    if (upload.path !== storagePath || upload.size !== uploadBuffer.length) throw new Error('Storage adapter returned an unverified planned write.');
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
    const metadataWithoutGeneratedTransforms = {
      ...(beforeMedia.metadata || {}),
    };
    metadataWithoutGeneratedTransforms.generatedTransforms = null;
    const metadata = {
      generatedTransforms: null,
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

    const versionWarnings: string[] = [];
    let versionRecord: MediaVersion | null = null;
    try {
    versionRecord = repositories
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

    } catch { versionWarnings.push('MEDIA_VERSION_INDEX_PENDING'); }
    const completionWarnings: string[] = [...versionWarnings];
    try {
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
    } catch { completionWarnings.push('MEDIA_AUDIT_PENDING'); }
    let cacheInvalidation: Awaited<ReturnType<typeof recordSiteCacheInvalidation>> | undefined;
    try {
    cacheInvalidation = repositories
      ? await recordSiteCacheInvalidation(repositories, {
          siteId: site.id,
          scope: "media",
          entity: "media",
          entityId: updated.id,
          reason: "media-replaced",
          requestId,
        })
      : undefined;
    } catch { completionWarnings.push('MEDIA_CACHE_INVALIDATION_PENDING'); }
    try {
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

    } catch { completionWarnings.push('MEDIA_WEBHOOK_DELIVERY_PENDING'); }
    return NextResponse.json({
      success: true,
      requestId,
      data: {
        media: withAdminMediaOrganization(
          updated,
          responseFolders,
        ),
        completionWarnings,
        cacheInvalidation,
        quota: mediaQuotaPayload(siteMediaQuotaBytes, nextUsageBytes),
        replacement: {
          previousVersion,
          versionRecord,
          retainedVersions: replacementVersions.length,
        },
      },
    });
    });
    });
  } catch (error) {
    const recoveryError = mediaStorageRecoveryErrorResponse(error, requestId); if (recoveryError) return recoveryError;
    if (error instanceof MediaInventoryIncompleteError) return errorResponse(503, error.code, error.message, requestId);
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
    const deleteInput = await parseJsonBody(request);
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

      return await withMediaStorageMutation(repositories.media, site.id, requestId, async () => {
      const media = await repositories.media.getById(site.id, mediaId);

      if (!media) {
        return errorResponse(
          404,
          "MEDIA_NOT_FOUND",
          "Media item not found",
          requestId,
        );
      }

      const deletion = authorizeMediaDeletion(media, deleteInput, await repositoryMediaDeletionReferences(repositories, media));
      if (deletion.override) await recordAdminAudit({
        repositories, siteId: site.id, actorId: access.session?.user.id,
        entity: "media", entityId: media.id, action: "delete.override.authorized", requestId,
        metadata: { reason: deletion.override.reason, referenceFingerprint: deletion.impact.referenceFingerprint,
          references: deletion.impact.references, referenceCount: deletion.impact.referenceCount },
      });

      const currentMedia = await repositories.media.getById(site.id, mediaId);
      if (!currentMedia) return errorResponse(404, "MEDIA_NOT_FOUND", "Media item not found", requestId);
      authorizeMediaDeletion(currentMedia, deleteInput, await repositoryMediaDeletionReferences(repositories, currentMedia));
      const files = await mediaStorageAssetRetirementFiles(site.id, currentMedia, repositories);
      authorizeMediaDeletion(currentMedia, deleteInput, await repositoryMediaDeletionReferences(repositories, currentMedia));
      return withJournaledMediaStorageMutation({ siteId: site.id, mediaId, operation: 'delete', requestId, files }, repositories, async () => {
      await repositories.media.delete(site.id, mediaId);
      const completionWarnings: string[] = [];
      try { await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: "media",
        entityId: media.id,
        action: "delete",
        actorId: access.session?.user.id,
        before: media,
        metadata: {
          filename: media.originalName || media.filename,
          mimeType: media.mimeType,
          type: media.type,
          visibility: media.visibility || "public",
          referencedDeleteOverride: Boolean(deletion.override),
          ...(deletion.override ? { overrideReason: deletion.override.reason, referenceFingerprint: deletion.impact.referenceFingerprint,
            affectedReferences: deletion.impact.references } : {}),
        },
        requestId,
      });
      } catch { completionWarnings.push('MEDIA_AUDIT_PENDING'); }
      let cacheInvalidation: Awaited<ReturnType<typeof recordSiteCacheInvalidation>> | undefined;
      try { cacheInvalidation = await recordSiteCacheInvalidation(
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
      } catch { completionWarnings.push('MEDIA_CACHE_INVALIDATION_PENDING'); }
      try { await deliverMediaAssetWebhook({
        repositories,
        site,
        action: "media.deleted",
        before: media,
        requestId,
        actor: access.session?.user.id,
      });

      } catch { completionWarnings.push('MEDIA_WEBHOOK_DELIVERY_PENDING'); }
      return NextResponse.json({
        success: true,
        requestId,
        data: {
          deleted: true,
          mediaId,
          completionWarnings,
          cacheInvalidation,
        },
      });
      });
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }

    return await withMediaStorageMutation(null, site.id, requestId, async () => {
    const media = getMediaById(site.id, mediaId);

    if (!media) {
      return errorResponse(
        404,
        "MEDIA_NOT_FOUND",
        "Media item not found",
        requestId,
      );
    }

    const pageOf = <T,>(items: T[], input: { limit: number; offset: number }) => ({
      items: items.slice(input.offset, input.offset + input.limit),
      pagination: { total: items.length, limit: input.limit, offset: input.offset, hasMore: input.offset + input.limit < items.length },
    });
    const referenceSource = {
      pages: { list: async (input: { limit: number; offset: number }) => pageOf(listAdminPages(site.id, { includeUnpublished: true }), input) },
      posts: { list: async (input: { limit: number; offset: number }) => {
        const result = getBlogPosts(site.id, { includeUnpublished: true, ...input });
        if (!result.pagination) throw new CollectionExportIncompleteError();
        return { items: result.posts, pagination: result.pagination };
      } },
      collections: {
        list: async (input: { limit: number; offset: number }) => pageOf(listCollections(site.id, { includeUnpublished: true }), input),
        listRecords: async (input: { collectionId: string; limit: number; offset: number }) => {
          const result = listCollectionRecords(site.id, input.collectionId, { includeUnpublished: true, limit: input.limit, offset: input.offset });
          return { items: result.records, pagination: result.pagination };
        },
      },
    };
    const deletion = authorizeMediaDeletion(media, deleteInput, await repositoryMediaDeletionReferences(referenceSource, media));
    if (deletion.override) await recordAdminAudit({
      siteId: site.id, actorId: access.session?.user.id,
      entity: "media", entityId: media.id, action: "delete.override.authorized", requestId,
      metadata: { reason: deletion.override.reason, referenceFingerprint: deletion.impact.referenceFingerprint,
        references: deletion.impact.references, referenceCount: deletion.impact.referenceCount },
    });
    const currentMedia = getMediaById(site.id, mediaId);
    if (!currentMedia) return errorResponse(404, "MEDIA_NOT_FOUND", "Media item not found", requestId);
    authorizeMediaDeletion(currentMedia, deleteInput, await repositoryMediaDeletionReferences(referenceSource, currentMedia));
    const files = await mediaStorageAssetRetirementFiles(site.id, currentMedia as unknown as MediaItem, null);
    authorizeMediaDeletion(currentMedia, deleteInput, await repositoryMediaDeletionReferences(referenceSource, currentMedia));
    return withJournaledMediaStorageMutation({ siteId: site.id, mediaId, operation: 'delete', requestId, files }, null, async () => {
    deleteMediaItem(site.id, mediaId);
    const completionWarnings: string[] = [];
    try { await recordAdminAudit({
      siteId: site.id,
      entity: "media",
      entityId: media.id,
      action: "delete",
      actorId: access.session?.user.id,
      before: media,
      metadata: {
        filename: media.originalName || media.filename,
        mimeType: media.mimeType,
        type: media.type,
        visibility: media.visibility || "public",
        referencedDeleteOverride: Boolean(deletion.override),
        ...(deletion.override ? { overrideReason: deletion.override.reason, referenceFingerprint: deletion.impact.referenceFingerprint,
          affectedReferences: deletion.impact.references } : {}),
      },
      requestId,
    });
    } catch { completionWarnings.push('MEDIA_AUDIT_PENDING'); }
    try { await deliverMediaAssetWebhook({
      site: site as unknown as Site,
      action: "media.deleted",
      before: media,
      requestId,
      actor: access.session?.user.id,
    });

    } catch { completionWarnings.push('MEDIA_WEBHOOK_DELIVERY_PENDING'); }
    return NextResponse.json({
      success: true,
      requestId,
      data: {
        deleted: true,
        completionWarnings,
        mediaId,
      },
    });
    });
    });
  } catch (error) {
    const recoveryError = mediaStorageRecoveryErrorResponse(error, requestId); if (recoveryError) return recoveryError;
    if (error instanceof MediaDeletionSafetyError) return errorResponse(error.status, error.code, error.message, requestId, { ...error.impact });
    if (error instanceof CollectionExportIncompleteError) return errorResponse(409, "MEDIA_REFERENCE_CHECK_INCOMPLETE", "Unable to verify all content references. Retry after content changes finish.", requestId);
    console.error("Admin media delete API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}
