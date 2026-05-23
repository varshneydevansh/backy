import { createHash } from 'node:crypto';
import type { MediaItem } from '@backy-cms/core';

const normalizeSeed = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(normalizeSeed);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'requestId' && key !== 'generatedAt')
      .map(([key, entry]) => [key, normalizeSeed(entry)]),
  );
};

const hashSeed = (value: unknown) => createHash('sha256')
  .update(JSON.stringify(normalizeSeed(value)))
  .digest('base64url');

const metadataText = (metadata: MediaItem['metadata'] | undefined, key: string) => {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
};

const binaryFingerprintValue = (metadata: MediaItem['metadata'] | undefined) => {
  const fingerprint = metadata?.binaryFingerprint;
  if (!fingerprint || typeof fingerprint !== 'object' || Array.isArray(fingerprint)) {
    return undefined;
  }

  const value = (fingerprint as Record<string, unknown>).value;
  const shortValue = (fingerprint as Record<string, unknown>).shortValue;
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : typeof shortValue === 'string' && shortValue.trim()
      ? shortValue.trim()
      : undefined;
};

export const buildMediaDeliveryCacheSeed = (
  siteId: string,
  media: MediaItem,
  variant: Record<string, unknown> = {},
) => ({
  siteId,
  mediaId: media.id,
  filename: media.filename,
  originalName: media.originalName || null,
  mimeType: media.mimeType || null,
  type: media.type,
  sizeBytes: media.sizeBytes,
  visibility: media.visibility || 'public',
  storagePath: metadataText(media.metadata, 'storagePath'),
  binaryFingerprint: binaryFingerprintValue(media.metadata),
  createdAt: media.createdAt || null,
  updatedAt: media.updatedAt || null,
  variant,
});

export const createMediaDeliveryEtag = (seed: unknown) => (
  `"backy-media-${hashSeed(seed).slice(0, 24)}"`
);

export const createMediaDeliveryCacheRevision = (seed: unknown) => (
  hashSeed(seed).slice(0, 20)
);

export const requestMatchesMediaDeliveryEtag = (request: Request, etag: string) => {
  const raw = request.headers.get('if-none-match');
  if (!raw) {
    return false;
  }

  return raw
    .split(',')
    .map((entry) => entry.trim())
    .some((entry) => entry === etag || entry === '*');
};

export const mediaDeliveryCacheMetadata = (
  request: Request,
  siteId: string,
  media: MediaItem,
  variant: Record<string, unknown> = {},
) => {
  const seed = buildMediaDeliveryCacheSeed(siteId, media, variant);
  const etag = createMediaDeliveryEtag(seed);

  return {
    etag,
    cacheRevision: createMediaDeliveryCacheRevision(seed),
    notModified: requestMatchesMediaDeliveryEtag(request, etag),
  };
};
