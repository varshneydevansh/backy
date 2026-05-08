import type { MediaItem } from '@backy-cms/core';
import type { BackyRepositories } from '@backy-cms/core';
import { updateMediaItem } from '@/lib/backyStore';

export type MediaDeliveryType = 'file' | 'optimizer-transform';

export type MediaDeliveryAnalytics = {
  totalRequests: number;
  fileRequests: number;
  transformRequests: number;
  bytesServed: number;
  lastDeliveredAt: string;
  lastDeliveryType: MediaDeliveryType;
  lastRequestId?: string;
  daily: Array<{
    date: string;
    requests: number;
    bytesServed: number;
  }>;
  variants: Array<{
    key: string;
    width?: number;
    quality?: number;
    requests: number;
    lastDeliveredAt: string;
  }>;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const numberValue = (value: unknown) => (
  Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0
);

const existingDeliveryAnalytics = (metadata: unknown): MediaDeliveryAnalytics | null => {
  if (!isRecord(metadata) || !isRecord(metadata.mediaDelivery)) {
    return null;
  }

  const record = metadata.mediaDelivery;
  const lastDeliveredAt = typeof record.lastDeliveredAt === 'string'
    ? record.lastDeliveredAt
    : new Date().toISOString();
  const lastDeliveryType = record.lastDeliveryType === 'optimizer-transform'
    ? 'optimizer-transform'
    : 'file';

  return {
    totalRequests: numberValue(record.totalRequests),
    fileRequests: numberValue(record.fileRequests),
    transformRequests: numberValue(record.transformRequests),
    bytesServed: numberValue(record.bytesServed),
    lastDeliveredAt,
    lastDeliveryType,
    lastRequestId: typeof record.lastRequestId === 'string' ? record.lastRequestId : undefined,
    daily: Array.isArray(record.daily)
      ? record.daily
          .filter((entry): entry is Record<string, unknown> => isRecord(entry))
          .map((entry) => ({
            date: typeof entry.date === 'string' ? entry.date : lastDeliveredAt.slice(0, 10),
            requests: numberValue(entry.requests),
            bytesServed: numberValue(entry.bytesServed),
          }))
      : [],
    variants: Array.isArray(record.variants)
      ? record.variants
          .filter((entry): entry is Record<string, unknown> => isRecord(entry))
          .map((entry) => ({
            key: typeof entry.key === 'string' ? entry.key : 'file',
            width: Number.isFinite(Number(entry.width)) ? Number(entry.width) : undefined,
            quality: Number.isFinite(Number(entry.quality)) ? Number(entry.quality) : undefined,
            requests: numberValue(entry.requests),
            lastDeliveredAt: typeof entry.lastDeliveredAt === 'string' ? entry.lastDeliveredAt : lastDeliveredAt,
          }))
      : [],
  };
};

export const buildNextMediaDeliveryAnalytics = (
  metadata: unknown,
  input: {
    deliveryType: MediaDeliveryType;
    bytesServed?: number;
    width?: number;
    quality?: number;
    requestId?: string;
    deliveredAt?: string;
  },
): MediaDeliveryAnalytics => {
  const current = existingDeliveryAnalytics(metadata);
  const deliveredAt = input.deliveredAt || new Date().toISOString();
  const date = deliveredAt.slice(0, 10);
  const bytesServed = Math.max(0, input.bytesServed || 0);
  const daily = [...(current?.daily || [])];
  const dayIndex = daily.findIndex((entry) => entry.date === date);

  if (dayIndex === -1) {
    daily.push({ date, requests: 1, bytesServed });
  } else {
    daily[dayIndex] = {
      ...daily[dayIndex],
      requests: daily[dayIndex].requests + 1,
      bytesServed: daily[dayIndex].bytesServed + bytesServed,
    };
  }

  const variantKey = input.deliveryType === 'optimizer-transform'
    ? `${input.width || 'auto'}w:q${input.quality || 'auto'}`
    : 'file';
  const variants = [...(current?.variants || [])];
  const variantIndex = variants.findIndex((entry) => entry.key === variantKey);

  if (variantIndex === -1) {
    variants.push({
      key: variantKey,
      width: input.width,
      quality: input.quality,
      requests: 1,
      lastDeliveredAt: deliveredAt,
    });
  } else {
    variants[variantIndex] = {
      ...variants[variantIndex],
      requests: variants[variantIndex].requests + 1,
      lastDeliveredAt: deliveredAt,
    };
  }

  return {
    totalRequests: (current?.totalRequests || 0) + 1,
    fileRequests: (current?.fileRequests || 0) + (input.deliveryType === 'file' ? 1 : 0),
    transformRequests: (current?.transformRequests || 0) + (input.deliveryType === 'optimizer-transform' ? 1 : 0),
    bytesServed: (current?.bytesServed || 0) + bytesServed,
    lastDeliveredAt: deliveredAt,
    lastDeliveryType: input.deliveryType,
    lastRequestId: input.requestId,
    daily: daily
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30),
    variants: variants
      .sort((a, b) => b.requests - a.requests || a.key.localeCompare(b.key))
      .slice(0, 20),
  };
};

export const recordMediaDelivery = async (input: {
  repositories: BackyRepositories | null;
  siteId: string;
  media: MediaItem;
  deliveryType: MediaDeliveryType;
  bytesServed?: number;
  width?: number;
  quality?: number;
  requestId?: string;
}) => {
  const media = input.repositories
    ? await input.repositories.media.getById(input.siteId, input.media.id) || input.media
    : input.media;
  const mediaDelivery = buildNextMediaDeliveryAnalytics(media.metadata, {
    deliveryType: input.deliveryType,
    bytesServed: input.bytesServed,
    width: input.width,
    quality: input.quality,
    requestId: input.requestId,
  });
  const metadata = {
    ...(media.metadata || {}),
    mediaDelivery,
  };

  if (input.repositories) {
    await input.repositories.media.update(input.siteId, media.id, { metadata });
    return;
  }

  updateMediaItem(input.siteId, media.id, { metadata });
};
