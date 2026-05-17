/**
 * Admin media provider analytics ingestion endpoint.
 *
 * POST /api/admin/sites/[siteId]/media/provider-analytics
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/adminAccess";
import { recordAdminAudit } from "@/lib/adminAudit";
import {
  getMediaList,
  getSiteByIdOrSlug,
  updateMediaItem,
} from "@/lib/backyStore";
import { recordSiteCacheInvalidation } from "@/lib/cacheInvalidation";
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

type ProviderAnalyticsEntry = {
  mediaId?: string;
  storagePath?: string;
  url?: string;
  totalRequests: number;
  bytesServed: number;
  conversions: number;
  conversionValue: number;
  source?: string;
  reportingWindow?: string;
  currency?: string;
  attributionWindow?: string;
  lastDeliveredAt?: string;
};

type ProviderAnalyticsMatch = {
  mediaId: string;
  matchedBy: string;
  totalRequests: number;
  bytesServed: number;
  conversions: number;
  conversionValue: number;
};

const makeRequestId = () =>
  `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const MAX_PROVIDER_ANALYTICS_ENTRIES = 500;

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

const textValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

const metricValue = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
};

const decimalMetricValue = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};

const currencyValue = (value: unknown): string | undefined => {
  const text = textValue(value);
  return text ? text.toUpperCase().slice(0, 8) : undefined;
};

const isoValue = (value: unknown): string | undefined => {
  const text = textValue(value);
  if (!text) return undefined;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : undefined;
};

const normalizeEntry = (value: unknown): ProviderAnalyticsEntry | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const mediaId = textValue(record.mediaId);
  const storagePath = textValue(record.storagePath);
  const url = textValue(record.url);
  if (!mediaId && !storagePath && !url) {
    return null;
  }

  return {
    mediaId,
    storagePath,
    url,
    totalRequests: metricValue(record.totalRequests ?? record.requests),
    bytesServed: metricValue(record.bytesServed ?? record.bytes),
    conversions: metricValue(record.conversions ?? record.conversionCount),
    conversionValue: decimalMetricValue(
      record.conversionValue ?? record.revenue ?? record.value,
    ),
    source: textValue(record.source),
    reportingWindow: textValue(record.reportingWindow),
    currency: currencyValue(record.currency),
    attributionWindow: textValue(record.attributionWindow),
    lastDeliveredAt: isoValue(record.lastDeliveredAt),
  };
};

const providerDeliveryFromMetadata = (
  metadata: MediaItem["metadata"] | undefined,
) => {
  const delivery = metadata?.providerDelivery;
  return delivery && typeof delivery === "object" && !Array.isArray(delivery)
    ? (delivery as Record<string, unknown>)
    : {};
};

const matchesStoragePath = (
  media: MediaItem,
  storagePath: string | undefined,
) =>
  !!storagePath &&
  typeof media.metadata?.storagePath === "string" &&
  media.metadata.storagePath === storagePath;

const matchesUrl = (media: MediaItem, url: string | undefined) =>
  !!url && media.url === url;

const matchMediaForEntry = (
  mediaItems: MediaItem[],
  entry: ProviderAnalyticsEntry,
): MediaItem | null =>
  mediaItems.find((item) => entry.mediaId && item.id === entry.mediaId) ||
  mediaItems.find((item) => matchesStoragePath(item, entry.storagePath)) ||
  mediaItems.find((item) => matchesUrl(item, entry.url)) ||
  null;

const normalizeMergeMode = (value: unknown): "replace" | "increment" =>
  value === "increment" ? "increment" : "replace";

const conversionRate = (conversions: number, totalRequests: number): number =>
  totalRequests > 0
    ? Number(((conversions / totalRequests) * 100).toFixed(4))
    : 0;

const providerAnalyticsMediaWebhookSnapshot = (
  media: MediaItem,
): BackyJsonObject => ({
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
  providerDelivery: providerDeliveryFromMetadata(
    media.metadata,
  ) as BackyJsonObject,
  updatedAt: media.updatedAt,
});

const deliverMediaProviderAnalyticsWebhook = async (params: {
  repositories?: Awaited<
    ReturnType<typeof getRequiredDatabaseRepositories>
  > | null;
  site: Site;
  before: MediaItem[];
  after: MediaItem[];
  matched: ProviderAnalyticsMatch[];
  unmatchedCount: number;
  source: string;
  reportingWindow: string;
  mergeMode: "replace" | "increment";
  requestId: string;
  actor?: string | null;
}) =>
  deliverSiteWebhooks({
    repositories: params.repositories,
    site: params.site,
    kind: "site-updated",
    requestId: params.requestId,
    actor: params.actor,
    reason: "media.provider-analytics.ingest",
    data: {
      resourceType: "media",
      before: params.before.map(providerAnalyticsMediaWebhookSnapshot),
      after: params.after.map(providerAnalyticsMediaWebhookSnapshot),
      analytics: {
        source: params.source,
        reportingWindow: params.reportingWindow,
        mergeMode: params.mergeMode,
        matchedCount: params.matched.length,
        unmatchedCount: params.unmatchedCount,
        matched: params.matched,
      },
    },
    metadata: {
      action: "media.provider-analytics.ingest",
      changedKeys: ["media"],
      source: "admin-media-provider-analytics-api",
      resourceType: "media",
      resourceIds: params.matched.map((item) => item.mediaId).slice(0, 100),
      matchedCount: params.matched.length,
      unmatchedCount: params.unmatchedCount,
      reportingWindow: params.reportingWindow,
      ingestSource: params.source,
      mergeMode: params.mergeMode,
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
    const { siteId } = await params;
    const body = await parseJsonBody(request);
    const source = textValue(body.source) || "provider-ingest";
    const reportingWindow =
      textValue(body.reportingWindow) || "provider-export";
    const mergeMode = normalizeMergeMode(body.mergeMode);
    const entries = (Array.isArray(body.entries) ? body.entries : [])
      .slice(0, MAX_PROVIDER_ANALYTICS_ENTRIES)
      .map(normalizeEntry)
      .filter((entry): entry is ProviderAnalyticsEntry => Boolean(entry));

    if (entries.length === 0) {
      return errorResponse(
        400,
        "PROVIDER_ANALYTICS_ENTRIES_REQUIRED",
        "At least one provider analytics entry is required.",
        requestId,
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

      const mediaItems = (
        await repositories.media.list({
          siteId: site.id,
          type: "all",
          visibility: "all",
          limit: 10000,
          offset: 0,
        })
      ).items;
      const matched: ProviderAnalyticsMatch[] = [];
      const unmatched: ProviderAnalyticsEntry[] = [];
      const updatedIds = new Set<string>();
      const webhookBefore: MediaItem[] = [];
      const webhookAfter: MediaItem[] = [];

      for (const entry of entries) {
        const media = matchMediaForEntry(mediaItems, entry);
        if (!media) {
          unmatched.push(entry);
          continue;
        }

        const existingDelivery = providerDeliveryFromMetadata(media.metadata);
        const totalRequests =
          mergeMode === "increment"
            ? metricValue(existingDelivery.totalRequests) + entry.totalRequests
            : entry.totalRequests;
        const bytesServed =
          mergeMode === "increment"
            ? metricValue(existingDelivery.bytesServed) + entry.bytesServed
            : entry.bytesServed;
        const conversions =
          mergeMode === "increment"
            ? metricValue(existingDelivery.conversions) + entry.conversions
            : entry.conversions;
        const conversionValue =
          mergeMode === "increment"
            ? decimalMetricValue(existingDelivery.conversionValue) +
              entry.conversionValue
            : entry.conversionValue;
        const lastSyncedAt = new Date().toISOString();
        const nextProviderDelivery = {
          ...existingDelivery,
          totalRequests,
          bytesServed,
          conversions,
          conversionValue,
          conversionRate: conversionRate(conversions, totalRequests),
          currency:
            entry.currency ||
            textValue(existingDelivery.currency) ||
            currencyValue(body.currency) ||
            "USD",
          attributionWindow:
            entry.attributionWindow ||
            textValue(existingDelivery.attributionWindow) ||
            textValue(body.attributionWindow) ||
            "not specified",
          source: entry.source || source,
          reportingWindow: entry.reportingWindow || reportingWindow,
          lastSyncedAt,
          lastDeliveredAt:
            entry.lastDeliveredAt || existingDelivery.lastDeliveredAt,
          ingestMode: mergeMode,
          matchedBy: entry.mediaId
            ? "mediaId"
            : entry.storagePath
              ? "storagePath"
              : "url",
        };
        const updated = await repositories.media.update(site.id, media.id, {
          metadata: {
            providerDelivery: nextProviderDelivery,
          },
        });
        updatedIds.add(updated.item.id);
        webhookBefore.push(media);
        webhookAfter.push(updated.item);
        matched.push({
          mediaId: updated.item.id,
          matchedBy: nextProviderDelivery.matchedBy,
          totalRequests,
          bytesServed,
          conversions,
          conversionValue,
        });

        await recordAdminAudit({
          repositories,
          siteId: site.id,
          entity: "media",
          entityId: updated.item.id,
          action: "media.provider-analytics.ingest",
          before: media,
          after: updated.item,
          metadata: {
            source: nextProviderDelivery.source,
            reportingWindow: nextProviderDelivery.reportingWindow,
            mergeMode,
            totalRequests,
            bytesServed,
            conversions,
            conversionValue,
            currency: nextProviderDelivery.currency,
            attributionWindow: nextProviderDelivery.attributionWindow,
            conversionRate: nextProviderDelivery.conversionRate,
            matchedBy: nextProviderDelivery.matchedBy,
          },
          requestId,
        });
      }

      const cacheInvalidation =
        updatedIds.size > 0
          ? await recordSiteCacheInvalidation(repositories, {
              siteId: site.id,
              scope: "media",
              entity: "media",
              reason: "media-provider-analytics-ingested",
              requestId,
            })
          : undefined;

      if (matched.length > 0) {
        await deliverMediaProviderAnalyticsWebhook({
          repositories,
          site,
          before: webhookBefore,
          after: webhookAfter,
          matched,
          unmatchedCount: unmatched.length,
          source,
          reportingWindow,
          mergeMode,
          requestId,
          actor: access.session?.user.id,
        });
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          source,
          reportingWindow,
          mergeMode,
          matchedCount: matched.length,
          unmatchedCount: unmatched.length,
          matched,
          unmatched,
          cacheInvalidation,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }

    const mediaItems = getMediaList(site.id, {
      limit: 10000,
      offset: 0,
    }).media;
    const matched: ProviderAnalyticsMatch[] = [];
    const unmatched: ProviderAnalyticsEntry[] = [];
    const webhookBefore: MediaItem[] = [];
    const webhookAfter: MediaItem[] = [];

    for (const entry of entries) {
      const media = matchMediaForEntry(mediaItems, entry);
      if (!media) {
        unmatched.push(entry);
        continue;
      }

      const existingDelivery = providerDeliveryFromMetadata(media.metadata);
      const totalRequests =
        mergeMode === "increment"
          ? metricValue(existingDelivery.totalRequests) + entry.totalRequests
          : entry.totalRequests;
      const bytesServed =
        mergeMode === "increment"
          ? metricValue(existingDelivery.bytesServed) + entry.bytesServed
          : entry.bytesServed;
      const conversions =
        mergeMode === "increment"
          ? metricValue(existingDelivery.conversions) + entry.conversions
          : entry.conversions;
      const conversionValue =
        mergeMode === "increment"
          ? decimalMetricValue(existingDelivery.conversionValue) +
            entry.conversionValue
          : entry.conversionValue;
      const matchedBy = entry.mediaId
        ? "mediaId"
        : entry.storagePath
          ? "storagePath"
          : "url";
      const updated = updateMediaItem(site.id, media.id, {
        metadata: {
          ...(media.metadata || {}),
          providerDelivery: {
            ...existingDelivery,
            totalRequests,
            bytesServed,
            conversions,
            conversionValue,
            conversionRate: conversionRate(conversions, totalRequests),
            currency:
              entry.currency ||
              textValue(existingDelivery.currency) ||
              currencyValue(body.currency) ||
              "USD",
            attributionWindow:
              entry.attributionWindow ||
              textValue(existingDelivery.attributionWindow) ||
              textValue(body.attributionWindow) ||
              "not specified",
            source: entry.source || source,
            reportingWindow: entry.reportingWindow || reportingWindow,
            lastSyncedAt: new Date().toISOString(),
            lastDeliveredAt:
              entry.lastDeliveredAt || existingDelivery.lastDeliveredAt,
            ingestMode: mergeMode,
            matchedBy,
          },
        },
      });
      if (!updated) {
        unmatched.push(entry);
        continue;
      }

      matched.push({
        mediaId: updated.id,
        matchedBy,
        totalRequests,
        bytesServed,
        conversions,
        conversionValue,
      });
      webhookBefore.push(media);
      webhookAfter.push(updated);

      await recordAdminAudit({
        siteId: site.id,
        entity: "media",
        entityId: updated.id,
        action: "media.provider-analytics.ingest",
        before: media,
        after: updated,
        metadata: {
          source: entry.source || source,
          reportingWindow: entry.reportingWindow || reportingWindow,
          mergeMode,
          totalRequests,
          bytesServed,
          conversions,
          conversionValue,
          currency:
            entry.currency ||
            textValue(existingDelivery.currency) ||
            currencyValue(body.currency) ||
            "USD",
          attributionWindow:
            entry.attributionWindow ||
            textValue(existingDelivery.attributionWindow) ||
            textValue(body.attributionWindow) ||
            "not specified",
          conversionRate: conversionRate(conversions, totalRequests),
          matchedBy,
        },
        requestId,
      });
    }

    if (matched.length > 0) {
      await deliverMediaProviderAnalyticsWebhook({
        site: site as unknown as Site,
        before: webhookBefore,
        after: webhookAfter,
        matched,
        unmatchedCount: unmatched.length,
        source,
        reportingWindow,
        mergeMode,
        requestId,
        actor: access.session?.user.id,
      });
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        source,
        reportingWindow,
        mergeMode,
        matchedCount: matched.length,
        unmatchedCount: unmatched.length,
        matched,
        unmatched,
      },
    });
  } catch (error) {
    console.error("Admin media provider analytics ingest API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}
