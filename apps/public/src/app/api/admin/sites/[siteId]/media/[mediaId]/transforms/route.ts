import { mediaStorageUsageWithPending, mediaStorageRetirementFiles, withDynamicJournaledMediaStorageMutation, mediaStorageRecoveryErrorResponse, MediaStorageRecoveryError } from '@/lib/mediaStorageRecovery';
import { withMediaStorageMutation } from '@/lib/mediaStorageMutation';
import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/adminAccess";
import { recordAdminAudit } from "@/lib/adminAudit";
import {
  getAdminSettings,
  getMediaById,
  getMediaList,
  getSiteByIdOrSlug,
  updateMediaItem,
} from "@/lib/backyStore";
import { recordSiteCacheInvalidation } from "@/lib/cacheInvalidation";
import {
  DEFAULT_IMAGE_VARIANT_QUALITY,
  DEFAULT_IMAGE_VARIANT_WIDTHS,
} from "@/lib/mediaResponsive";
import {
  deleteGeneratedTransformFiles,
  generatedTransformBytes,
  generateImageTransformManifest,
  MediaTransformGenerationError,
} from "@/lib/mediaTransformGeneration";
import {
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

const normalizeWidths = (value: unknown): number[] => {
  const rawWidths = Array.isArray(value) ? value : DEFAULT_IMAGE_VARIANT_WIDTHS;
  const widths = rawWidths
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
    .map((item) => Math.max(16, Math.min(3840, Math.floor(item))));

  return Array.from(new Set(widths))
    .slice(0, 10)
    .sort((a, b) => a - b);
};

const normalizeQuality = (value: unknown): number => {
  const quality = Number(value);
  if (!Number.isFinite(quality)) {
    return DEFAULT_IMAGE_VARIANT_QUALITY;
  }

  return Math.max(1, Math.min(100, Math.floor(quality)));
};

const replacementVersionBytes = (metadata: unknown): number => {
  const record =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : null;
  const versions = Array.isArray(record?.replacementVersions)
    ? record.replacementVersions
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

const mediaUsageBytes = (
  items: Array<{ sizeBytes?: number; metadata?: unknown }>,
) =>
  items.reduce(
    (total, item) =>
      total +
      Math.max(0, Number(item.sizeBytes) || 0) +
      replacementVersionBytes(item.metadata) +
      generatedTransformBytes(item.metadata),
    0,
  );

const mediaTransformWebhookSnapshot = (media: MediaItem): BackyJsonObject => ({
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
  generatedTransformBytes: generatedTransformBytes(media.metadata),
  updatedAt: media.updatedAt,
});

const deliverMediaTransformWebhook = async (params: {
  repositories?: Awaited<
    ReturnType<typeof getRequiredDatabaseRepositories>
  > | null;
  site: Site;
  before: MediaItem;
  after: MediaItem;
  widths: number[];
  quality: number;
  sizes: string;
  preparedBy: string;
  generatedBytes: number;
  storageProvider?: string | null;
  format?: string | null;
  requestId: string;
  actor?: string | null;
}) =>
  deliverSiteWebhooks({
    repositories: params.repositories,
    site: params.site,
    kind: "site-updated",
    requestId: params.requestId,
    actor: params.actor,
    reason: "media.transforms.prepared",
    data: {
      resourceType: "media",
      before: mediaTransformWebhookSnapshot(params.before),
      after: mediaTransformWebhookSnapshot(params.after),
      responsive: {
        widths: params.widths,
        quality: params.quality,
        sizes: params.sizes,
        generatedBytes: params.generatedBytes,
        storageProvider: params.storageProvider || null,
        format: params.format || null,
      },
    },
    metadata: {
      action: "media.transforms.prepared",
      changedKeys: ["media"],
      source: "admin-media-transforms-api",
      resourceType: "media",
      resourceId: params.after.id,
      filename: params.after.originalName || params.after.filename,
      mimeType: params.after.mimeType,
      type: params.after.type,
      visibility: params.after.visibility || "public",
      folderId: params.after.folderId || null,
      widths: params.widths,
      quality: params.quality,
      generatedBytes: params.generatedBytes,
      storageProvider: params.storageProvider || null,
      format: params.format || null,
      preparedBy: params.preparedBy,
    },
  });

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
    const body = await parseJsonBody(request);
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

    if (beforeMedia.visibility !== "public") {
      return errorResponse(
        400,
        "MEDIA_TRANSFORM_PRIVATE",
        "Only public images can prepare responsive variants.",
        requestId,
      );
    }

    if (
      beforeMedia.type !== "image" ||
      !beforeMedia.mimeType.startsWith("image/")
    ) {
      return errorResponse(
        400,
        "MEDIA_TRANSFORM_UNSUPPORTED",
        "Only image media can prepare responsive variants.",
        requestId,
      );
    }

    const widths = normalizeWidths(body.widths);
    if (widths.length === 0) {
      return errorResponse(
        400,
        "INVALID_TRANSFORM_WIDTHS",
        "At least one valid width is required.",
        requestId,
      );
    }

    const quality = normalizeQuality(body.quality);
    const sizes =
      typeof body.sizes === "string" && body.sizes.trim().length > 0
        ? body.sizes.trim()
        : "(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px";
    const preparedAt = new Date().toISOString();
    const preparedBy =
      typeof body.preparedBy === "string" && body.preparedBy.trim().length > 0
        ? body.preparedBy.trim()
        : "admin";
    const settings = repositories
      ? await repositories.settings.get()
      : getAdminSettings();
    const uploadPolicy = resolveMediaUploadPolicy(settings);
    const siteMediaQuotaBytes = uploadPolicy.quotaBytes;
    const currentMedia = await readCompleteMediaInventory(site.id, async pagination => {
      if (repositories) return repositories.media.list({ siteId: site.id, type: 'all', visibility: 'all', ...pagination });
      const result = getMediaList(site.id, pagination);
      return { items: result.media, pagination: result.pagination };
    });
    const currentUsageBytes = await mediaStorageUsageWithPending(site.id, repositories);
    return withDynamicJournaledMediaStorageMutation({ siteId: site.id, mediaId: beforeMedia.id, operation: 'transforms', requestId }, repositories, async beginJournal => {
    let journalRecorded = false;
    const generatedTransforms = await generateImageTransformManifest({
      siteId: site.id,
      media: beforeMedia,
      widths,
      quality,
      sizes,
      preparedAt,
      preparedBy,
      beforeUpload: async files => {
        const plannedBytes = files.reduce((sum, file) => sum + file.bytes, 0);
        const peakUsage = currentUsageBytes + plannedBytes;
        if (readMediaBillingLimit(site.settings, settings, peakUsage).blocked) throw new MediaStorageRecoveryError('BILLING_MEDIA_LIMIT', 'Preparing responsive variants would exceed the site billing storage limit while prior variants are retained.');
        if (peakUsage > siteMediaQuotaBytes) throw new MediaStorageRecoveryError('SITE_MEDIA_QUOTA_EXCEEDED', 'Preparing responsive variants would exceed the storage quota while prior variants are retained.');
        const retired = mediaStorageRetirementFiles(site.id, beforeMedia).filter(file => file.path.includes(`/generated/media/${beforeMedia.id}/`));
        await beginJournal([...files.map(file => ({ ...file, purpose: 'write' as const })), ...retired]);
        journalRecorded = true;
      },
    });
    if (!journalRecorded) throw new MediaStorageRecoveryError('MEDIA_STORAGE_JOURNAL_UNAVAILABLE', 'Responsive variant writes could not be verified against their durable journal.');
    const nextUsageBytes =
      currentUsageBytes -
      generatedTransformBytes(beforeMedia.metadata) +
      generatedTransformBytes({ generatedTransforms });
    const billingLimit = readMediaBillingLimit(
      site.settings,
      settings,
      nextUsageBytes,
    );

    if (billingLimit.blocked) {
      await deleteGeneratedTransformFiles({ generatedTransforms }, undefined, { siteId: site.id, mediaId: beforeMedia.id });
      return errorResponse(
        402,
        "BILLING_MEDIA_LIMIT",
        `The ${billingLimit.policy.billingPlan} site plan allows ${billingLimit.policy.mediaLimitGb} GB of media storage. Update the site billing quota before preparing responsive variants.`,
        requestId,
        mediaQuotaPayload(billingLimit.limitBytes, currentUsageBytes),
      );
    }

    if (nextUsageBytes > siteMediaQuotaBytes) {
      await deleteGeneratedTransformFiles({ generatedTransforms }, undefined, { siteId: site.id, mediaId: beforeMedia.id });
      return errorResponse(
        413,
        "SITE_MEDIA_QUOTA_EXCEEDED",
        "Preparing responsive variants would exceed the site media storage quota.",
        requestId,
        mediaQuotaPayload(siteMediaQuotaBytes, currentUsageBytes, uploadPolicy),
      );
    }

    const metadata = {
      generatedTransforms,
    };
    const updated = repositories
      ? (await repositories.media.update(site.id, beforeMedia.id, { metadata }))
          .item
      : updateMediaItem(site.id, beforeMedia.id, { metadata });

    if (!updated) {
      return errorResponse(
        404,
        "MEDIA_NOT_FOUND",
        "Media item not found",
        requestId,
      );
    }

    // Preserve the currently referenced variants until replacement metadata is saved.
    // The durable journal reconciles retired variants after metadata commit.
    const completionWarnings: string[] = [];
    // The metadata write above has committed. Failures in follow-up work must not report a rollback.
    try {
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: "media",
        entityId: updated.id,
        action: "media.transforms.prepare",
        before: beforeMedia,
        after: updated,
        metadata: {
          widths,
          quality,
          sizes,
          preparedBy,
          generatedBytes: generatedTransforms.generatedBytes,
          storageProvider: generatedTransforms.storageProvider,
          format: generatedTransforms.format,
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
            reason: "media-transforms-prepared",
            requestId,
          })
        : undefined;
    } catch { completionWarnings.push('MEDIA_CACHE_INVALIDATION_PENDING'); }
    try {
      await deliverMediaTransformWebhook({
        repositories,
        site: site as Site,
        before: beforeMedia,
        after: updated,
        widths,
        quality,
        sizes,
        preparedBy,
        generatedBytes: generatedTransforms.generatedBytes,
        storageProvider: generatedTransforms.storageProvider,
        format: generatedTransforms.format,
        requestId,
        actor: access.session?.user.id,
      });
    } catch { completionWarnings.push('MEDIA_WEBHOOK_DELIVERY_PENDING'); }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        media: updated,
        responsive: generatedTransforms,
        completionWarnings,
        quota: mediaQuotaPayload(siteMediaQuotaBytes, nextUsageBytes),
        cacheInvalidation,
      },
    });
    });
    });
  } catch (error) {
    const recoveryError = mediaStorageRecoveryErrorResponse(error, requestId); if (recoveryError) return recoveryError;
    if (error instanceof MediaInventoryIncompleteError) return errorResponse(503, error.code, error.message, requestId);
    if (error instanceof MediaTransformGenerationError) {
      return errorResponse(
        422,
        error.code,
        error.message,
        requestId,
        error.details,
      );
    }

    console.error("Admin media transform preparation API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}
