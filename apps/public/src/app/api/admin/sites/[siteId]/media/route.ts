/**
 * Admin media endpoint.
 *
 * GET  /api/admin/sites/[siteId]/media
 * POST /api/admin/sites/[siteId]/media
 */

import { createHash } from "node:crypto";
import { extname } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/adminAccess";
import { recordAdminAudit } from "@/lib/adminAudit";
import {
  createMediaItem,
  getAdminSettings,
  getMediaList,
  getSiteByIdOrSlug,
  listMediaFolders,
} from "@/lib/backyStore";
import { recordSiteCacheInvalidation } from "@/lib/cacheInvalidation";
import {
  MediaSafetyError,
  scanMediaUploadWithProviders,
} from "@/lib/mediaSafety";
import {
  booleanQueryFlag,
  buildMediaScopeMetadataPatch,
  mediaMatchesScopeFilters,
  mediaScopeRequiresTarget,
  normalizeMediaScope,
  normalizeScopeTargetId,
} from "@/lib/mediaScope";
import {
  getMediaStorageAdapter,
  getMediaStoragePath,
} from "@/lib/mediaStorage";
import { generatedTransformBytes } from "@/lib/mediaTransformGeneration";
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
  }>;
}

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

const makeRequestId = () =>
  `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const buildMediaBinaryFingerprint = (buffer: Buffer) => {
  const value = createHash("sha256").update(buffer).digest("hex");
  return {
    algorithm: "sha256",
    value,
    shortValue: value.slice(0, 12),
    sizeBytes: buffer.length,
  };
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

const toStringList = (value: FormDataEntryValue | null): string[] => {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const parseMetadata = (
  value: FormDataEntryValue | null,
): Record<string, unknown> => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const uploadVisibilityFromInput = (
  value: FormDataEntryValue | null,
): { visibility: MediaItem["visibility"]; invalid?: boolean } => {
  if (value === null) {
    return { visibility: "public" };
  }

  if (typeof value !== "string") {
    return { visibility: "public", invalid: true };
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return { visibility: "public" };
  }

  if (normalized === "public" || normalized === "private") {
    return { visibility: normalized };
  }

  return { visibility: "public", invalid: true };
};

const uploadMediaScopeFromInput = (
  value: FormDataEntryValue | null,
): { scope: "global" | "page" | "post"; invalid?: boolean } => {
  if (value === null) {
    return { scope: "global" };
  }

  if (typeof value !== "string") {
    return { scope: "global", invalid: true };
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return { scope: "global" };
  }

  if (mediaScopeValues.includes(normalized as "global" | "page" | "post")) {
    return { scope: normalized as "global" | "page" | "post" };
  }

  return { scope: "global", invalid: true };
};

const mediaUploadTextFieldError = (
  value: FormDataEntryValue | null,
  field: string,
  requestId: string,
) => {
  if (value === null || typeof value === "string") {
    return null;
  }

  if (field === "scopeTargetId") {
    return errorResponse(
      400,
      "INVALID_MEDIA_SCOPE_TARGET",
      "Invalid media scope target. Use a string id.",
      requestId,
    );
  }

  return errorResponse(
    400,
    "INVALID_MEDIA_FOLDER",
    "Invalid media folder. Use a folder id string.",
    requestId,
  );
};

const parseFontDisplay = (value: FormDataEntryValue | null) =>
  value === "auto" ||
  value === "block" ||
  value === "fallback" ||
  value === "optional" ||
  value === "swap"
    ? value
    : "swap";

const mediaTypeValues = [
  "image",
  "video",
  "audio",
  "document",
  "font",
  "other",
] as const satisfies readonly MediaItem["type"][];
const mediaScopeValues = ["global", "page", "post"] as const;
const DEFAULT_MEDIA_LIMIT = 50;
const MAX_MEDIA_LIMIT = 100;

const mediaTypeFromInput = (
  value: string | null,
): { type?: MediaItem["type"] | "all"; invalid?: string } => {
  if (!value) {
    return {};
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return {};
  }

  if (normalized === "all") {
    return { type: "all" };
  }

  if (normalized === "file") {
    return { type: "document" };
  }

  if (mediaTypeValues.includes(normalized as MediaItem["type"])) {
    return { type: normalized as MediaItem["type"] };
  }

  return { invalid: value };
};

const visibilityFromInput = (
  value: string | null,
): { visibility?: MediaItem["visibility"] | "all"; invalid?: string } => {
  if (!value) {
    return {};
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return {};
  }

  if (
    normalized === "public" ||
    normalized === "private" ||
    normalized === "all"
  ) {
    return { visibility: normalized };
  }

  return { invalid: value };
};

const mediaScopeFromInput = (
  value: string | null,
): { scope?: "global" | "page" | "post" | "all"; invalid?: string } => {
  if (!value) {
    return {};
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return {};
  }

  if (normalized === "all") {
    return { scope: "all" };
  }

  if (mediaScopeValues.includes(normalized as "global" | "page" | "post")) {
    return { scope: normalized as "global" | "page" | "post" };
  }

  return { invalid: value };
};

const booleanFilterFromInput = (
  value: string | null,
): { value?: boolean; invalid?: string } => {
  if (value === null) {
    return {};
  }

  const parsed = booleanQueryFlag(value);
  if (parsed === undefined && value.trim().length > 0) {
    return { invalid: value };
  }

  return { value: parsed };
};

const integerQueryFromInput = (
  value: string | null,
  fallback: number,
  min: number,
  max?: number,
): { value: number; invalid?: string } => {
  if (value === null || value.trim() === "") {
    return { value: fallback };
  }

  const parsed = Number(value);
  if (
    !Number.isInteger(parsed) ||
    parsed < min ||
    (max !== undefined && parsed > max)
  ) {
    return { value: fallback, invalid: value };
  }

  return { value: parsed };
};

const paginateMedia = (items: MediaItem[], limit: number, offset: number) => ({
  media: items.slice(offset, offset + limit),
  pagination: {
    total: items.length,
    limit,
    offset,
    hasMore: offset + limit < items.length,
  },
});

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

const enforceMediaBillingLimit = (
  siteSettings: unknown,
  workspaceSettings: unknown,
  nextUsageBytes: number,
  currentUsageBytes: number,
  requestId: string,
) => {
  const { blocked, limitBytes, policy } = readMediaBillingLimit(
    siteSettings,
    workspaceSettings,
    nextUsageBytes,
  );
  if (blocked) {
    return errorResponse(
      402,
      "BILLING_MEDIA_LIMIT",
      `The ${policy.billingPlan} site plan allows ${policy.mediaLimitGb} GB of media storage. Update the site billing quota before uploading another asset.`,
      requestId,
      mediaQuotaPayload(limitBytes, currentUsageBytes),
    );
  }

  return null;
};

const mediaTagMatches = (tags: string[], tag: string | null) => {
  if (!tag) {
    return true;
  }

  const normalizedTag = tag.trim().toLowerCase();
  if (!normalizedTag) {
    return true;
  }

  return tags.some((item) => item.trim().toLowerCase() === normalizedTag);
};

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
  action: "media.created";
  after: MediaItem;
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
      resourceType: "media",
      after: mediaAssetWebhookSnapshot(params.after),
    },
    metadata: {
      action: params.action,
      changedKeys: ["media"],
      source: "admin-media-api",
      resourceType: "media",
      resourceId: params.after.id,
      filename: params.after.originalName || params.after.filename,
      mimeType: params.after.mimeType,
      type: params.after.type,
      visibility: params.after.visibility || "public",
      folderId: params.after.folderId || null,
      sizeBytes: params.after.sizeBytes,
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
    const { searchParams } = new URL(request.url);
    const mediaType = mediaTypeFromInput(searchParams.get("type"));
    if (mediaType.invalid) {
      return errorResponse(
        400,
        "INVALID_MEDIA_TYPE",
        "Invalid media type. Use one of: image, video, audio, document, file, font, other, all.",
        requestId,
      );
    }
    const type = mediaType.type === "all" ? undefined : mediaType.type;
    const mediaVisibility = visibilityFromInput(searchParams.get("visibility"));
    if (mediaVisibility.invalid) {
      return errorResponse(
        400,
        "INVALID_MEDIA_VISIBILITY",
        "Invalid media visibility. Use one of: public, private, all.",
        requestId,
      );
    }
    const visibility =
      mediaVisibility.visibility === "all"
        ? undefined
        : mediaVisibility.visibility;
    const mediaScope = mediaScopeFromInput(searchParams.get("scope"));
    if (mediaScope.invalid) {
      return errorResponse(
        400,
        "INVALID_MEDIA_SCOPE",
        "Invalid media scope. Use one of: global, page, post, all.",
        requestId,
      );
    }
    const scope = mediaScope.scope === "all" ? undefined : mediaScope.scope;
    const globalFilter = booleanFilterFromInput(searchParams.get("global"));
    if (globalFilter.invalid) {
      return errorResponse(
        400,
        "INVALID_MEDIA_GLOBAL_FILTER",
        "Invalid global media filter. Use true or false.",
        requestId,
      );
    }
    const globalOnly = globalFilter.value;
    const mediaLimit = integerQueryFromInput(
      searchParams.get("limit"),
      DEFAULT_MEDIA_LIMIT,
      1,
      MAX_MEDIA_LIMIT,
    );
    if (mediaLimit.invalid) {
      return errorResponse(
        400,
        "INVALID_MEDIA_LIMIT",
        "Invalid media limit. Use an integer from 1 to 100.",
        requestId,
      );
    }
    const limit = mediaLimit.value;
    const mediaOffset = integerQueryFromInput(searchParams.get("offset"), 0, 0);
    if (mediaOffset.invalid) {
      return errorResponse(
        400,
        "INVALID_MEDIA_OFFSET",
        "Invalid media offset. Use an integer greater than or equal to 0.",
        requestId,
      );
    }
    const offset = mediaOffset.value;

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

      const pageId = searchParams.get("pageId");
      const postId = searchParams.get("postId") || searchParams.get("blogId");
      const tag = searchParams.get("tag");
      const result = await repositories.media.list({
        siteId: site.id,
        type: type || "all",
        visibility: visibility || "all",
        search: searchParams.get("search") || undefined,
        folderId: searchParams.has("folderId")
          ? searchParams.get("folderId")
          : undefined,
        limit: 10000,
        offset: 0,
      });
      const filtered = result.items
        .filter((item) =>
          mediaMatchesScopeFilters(item, { scope, pageId, postId, globalOnly }),
        )
        .filter((item) => mediaTagMatches(item.tags, tag));
      const payload = paginateMedia(filtered, limit, offset);
      const allMedia = (
        await repositories.media.list({
          siteId: site.id,
          type: "all",
          visibility: "all",
          limit: 10000,
          offset: 0,
        })
      ).items;
      const settings = await repositories.settings.get();
      const uploadPolicy = resolveMediaUploadPolicy(settings);

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          ...payload,
          quota: mediaQuotaPayload(
            uploadPolicy.quotaBytes,
            mediaUsageBytes(allMedia),
            uploadPolicy,
          ),
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }

    const payload = getMediaList(site.id, {
      type: type || undefined,
      scope: scope || undefined,
      visibility: visibility || undefined,
      search: searchParams.get("search") || undefined,
      tag: searchParams.get("tag") || undefined,
      folderId: searchParams.has("folderId")
        ? searchParams.get("folderId")
        : undefined,
      pageId: searchParams.get("pageId") || undefined,
      postId:
        searchParams.get("postId") || searchParams.get("blogId") || undefined,
      global: globalOnly,
      limit,
      offset,
    });

    const uploadPolicy = resolveMediaUploadPolicy(getAdminSettings());

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        ...payload,
        quota: mediaQuotaPayload(
          uploadPolicy.quotaBytes,
          mediaUsageBytes(
            getMediaList(site.id, {
              limit: 10000,
              offset: 0,
            }).media,
          ),
          uploadPolicy,
        ),
      },
    });
  } catch (error) {
    console.error("Admin media list API error:", error);
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

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return errorResponse(
        400,
        "MISSING_FILE",
        "Upload must include a file field",
        requestId,
      );
    }

    if (file.size <= 0) {
      return errorResponse(
        400,
        "EMPTY_FILE",
        "Uploaded file is empty",
        requestId,
      );
    }

    const originalName = file.name || "upload.bin";
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
        `Uploaded file exceeds the configured ${Math.floor(uploadPolicy.maxUploadBytes / (1024 * 1024))} MB limit.`,
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
        "Uploaded file type is not allowed by the configured storage policy.",
        requestId,
        {
          allowedFileTypes: uploadPolicy.allowedFileTypes,
          mimeType,
          extension,
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
    const billingLimitError = enforceMediaBillingLimit(
      site.settings,
      settings,
      nextUsageBytes,
      currentUsageBytes,
      requestId,
    );
    if (billingLimitError) {
      return billingLimitError;
    }

    if (nextUsageBytes > siteMediaQuotaBytes) {
      return errorResponse(
        413,
        "SITE_MEDIA_QUOTA_EXCEEDED",
        "Uploading this file would exceed the site media storage quota.",
        requestId,
        mediaQuotaPayload(siteMediaQuotaBytes, currentUsageBytes, uploadPolicy),
      );
    }

    const uploadScope = uploadMediaScopeFromInput(formData.get("scope"));
    if (uploadScope.invalid) {
      return errorResponse(
        400,
        "INVALID_MEDIA_SCOPE",
        "Invalid media scope. Use global, page, or post.",
        requestId,
      );
    }
    const uploadVisibility = uploadVisibilityFromInput(
      formData.get("visibility"),
    );
    if (uploadVisibility.invalid) {
      return errorResponse(
        400,
        "INVALID_MEDIA_VISIBILITY",
        "Invalid media visibility. Use public or private.",
        requestId,
      );
    }
    const scope = normalizeMediaScope(uploadScope.scope, "global");
    const visibility = uploadVisibility.visibility;
    const scopeTargetValue = formData.get("scopeTargetId");
    const scopeTargetError = mediaUploadTextFieldError(
      scopeTargetValue,
      "scopeTargetId",
      requestId,
    );
    if (scopeTargetError) {
      return scopeTargetError;
    }
    const scopeTargetId = normalizeScopeTargetId(scopeTargetValue);
    if (mediaScopeRequiresTarget(scope) && !scopeTargetId) {
      return errorResponse(
        400,
        "MEDIA_SCOPE_TARGET_REQUIRED",
        "Page and post scoped media uploads require a scopeTargetId.",
        requestId,
        { scope },
      );
    }
    const scopeMetadata = buildMediaScopeMetadataPatch({
      scope,
      scopeTargetId,
    });
    const folderValue = formData.get("folderId");
    const folderError = mediaUploadTextFieldError(
      folderValue,
      "folderId",
      requestId,
    );
    if (folderError) {
      return folderError;
    }
    const folderId = toStringValue(folderValue);
    if (folderId) {
      const folder = repositories
        ? await repositories.media.getFolderById(site.id, folderId)
        : listMediaFolders(site.id).find((item) => item.id === folderId);

      if (!folder) {
        return errorResponse(
          404,
          "FOLDER_NOT_FOUND",
          "Media folder not found",
          requestId,
        );
      }
    }
    const safeName = safePathSegment(
      extension ? originalName.slice(0, -extension.length) : originalName,
    );
    const storedFilename = `${Date.now().toString(36)}-${safeName}${extension}`;
    const mediaFolder = mediaFolderForType(mediaType);
    const storagePath = getMediaStoragePath({
      siteId: site.id,
      mediaFolder,
      storedFilename,
    });
    const metadata = parseMetadata(formData.get("metadata"));
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
      },
    });

    const mediaInput = {
      filename: storedFilename,
      originalName,
      mimeType,
      sizeBytes: upload.size,
      type: mediaType,
      url: upload.url,
      thumbnailUrl: mediaType === "image" ? upload.url : null,
      pageIds: scopeMetadata.pageIds,
      postIds: scopeMetadata.postIds,
      tags: toStringList(formData.get("tags")),
      metadata: {
        ...metadata,
        extension: extension.replace(/^\./, ""),
        storagePath: upload.path,
        storageProvider: storage.provider,
        binaryFingerprint,
        safetyScan,
        thumbnailUrl: mediaType === "image" ? upload.url : null,
        tags: toStringList(formData.get("tags")),
        ...scopeMetadata,
        ...(mediaType === "font"
          ? {
              fontFamily:
                toStringValue(formData.get("fontFamily")) ||
                cleanFontFamily(originalName),
              fontWeight: toStringValue(formData.get("fontWeight")) || "400",
              fontStyle: toStringValue(formData.get("fontStyle")) || "normal",
              fontFallback:
                toStringValue(formData.get("fontFallback")) ||
                "system-ui, sans-serif",
              fontDisplay: parseFontDisplay(formData.get("fontDisplay")),
            }
          : {}),
      },
      altText: toStringValue(formData.get("altText")),
      caption: toStringValue(formData.get("caption")),
      uploadedBy: toStringValue(formData.get("uploadedBy")) || "admin",
      folderId,
      scope: scopeMetadata.scope,
      scopeTargetId: scopeMetadata.scopeTargetId,
      visibility,
    };
    const media = repositories
      ? (
          await repositories.media.create({
            siteId: site.id,
            filename: mediaInput.filename,
            originalName: mediaInput.originalName,
            mimeType: mediaInput.mimeType,
            size: mediaInput.sizeBytes,
            type: mediaInput.type,
            url: mediaInput.url,
            folderId: mediaInput.folderId,
            altText: mediaInput.altText,
            caption: mediaInput.caption,
            visibility: mediaInput.visibility,
            metadata: mediaInput.metadata,
            uploadedBy: mediaInput.uploadedBy,
          })
        ).item
      : createMediaItem(site.id, mediaInput);
    await recordAdminAudit({
      repositories,
      siteId: site.id,
      entity: "media",
      entityId: media.id,
      action: "create",
      after: media,
      metadata: {
        filename: media.originalName || media.filename,
        mimeType: media.mimeType,
        type: media.type,
        visibility: media.visibility || "public",
        sizeBytes: media.sizeBytes,
        safetyStatus: safetyScan.status,
        ...(typeof media.metadata?.storageProvider === "string"
          ? { storageProvider: media.metadata.storageProvider }
          : {}),
        ...(typeof media.metadata?.storagePath === "string"
          ? { storagePath: media.metadata.storagePath }
          : {}),
      },
      requestId,
    });
    const cacheInvalidation = repositories
      ? await recordSiteCacheInvalidation(repositories, {
          siteId: site.id,
          scope: "media",
          entity: "media",
          entityId: media.id,
          reason: "media-created",
          requestId,
        })
      : undefined;
    await deliverMediaAssetWebhook({
      repositories,
      site: site as unknown as Site,
      action: "media.created",
      after: media,
      requestId,
      actor: access.session?.user.id,
    });

    return NextResponse.json(
      {
        success: true,
        requestId,
        data: {
          media,
          cacheInvalidation,
          quota: mediaQuotaPayload(siteMediaQuotaBytes, nextUsageBytes),
        },
      },
      { status: 201 },
    );
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

    console.error("Admin media upload API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}
