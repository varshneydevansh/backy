import type { MediaItem } from '@backy-cms/core';

export const DEFAULT_IMAGE_VARIANT_WIDTHS = [320, 640, 960, 1280, 1920] as const;
export const DEFAULT_IMAGE_VARIANT_QUALITY = 75;

export type MediaResponsiveVariant = {
  width: number;
  quality: number;
  url: string;
  storagePath?: string;
  bytes?: number;
  mimeType?: string;
  format?: string;
  generatedAt?: string;
};

export type MediaResponsiveManifest = {
  src: string;
  srcSet: string;
  sizes: string;
  variants: MediaResponsiveVariant[];
  preparedAt?: string;
  preparedBy?: string;
  format?: string;
  generatedBytes?: number;
  storageProvider?: string;
};

export type MediaWithResponsiveManifest = MediaItem & {
  deliveryUrl?: string;
  downloadUrl?: string;
  responsive?: MediaResponsiveManifest;
};

export const publicMediaFilePath = (
  siteId: string,
  mediaId: string,
  options: { disposition?: 'inline' | 'attachment' } = {},
) => {
  const searchParams = new URLSearchParams();
  if (options.disposition) {
    searchParams.set('disposition', options.disposition);
  }

  const query = searchParams.toString();
  return `/api/sites/${encodeURIComponent(siteId)}/media/${encodeURIComponent(mediaId)}/file${query ? `?${query}` : ''}`;
};

export const mediaTransformPath = (
  siteId: string,
  mediaId: string,
  width: number,
  quality = DEFAULT_IMAGE_VARIANT_QUALITY,
) => {
  const searchParams = new URLSearchParams({
    width: String(width),
    quality: String(quality),
  });

  return `/api/sites/${encodeURIComponent(siteId)}/media/${encodeURIComponent(mediaId)}/transform?${searchParams.toString()}`;
};

const generatedManifestFromMetadata = (
  siteId: string,
  media: MediaItem,
): MediaResponsiveManifest | undefined => {
  const generated = media.metadata?.generatedTransforms;
  if (!generated || typeof generated !== 'object' || Array.isArray(generated)) {
    return undefined;
  }

  const record = generated as Record<string, unknown>;
  const variants = Array.isArray(record.variants)
    ? record.variants
        .filter((variant): variant is Record<string, unknown> => (
          !!variant && typeof variant === 'object' && !Array.isArray(variant)
        ))
        .map((variant): MediaResponsiveVariant | null => {
          const width = Number(variant.width);
          const quality = Number(variant.quality);
          if (!Number.isFinite(width) || width <= 0) {
            return null;
          }

          const bytes = Number(variant.bytes);
          return {
            width: Math.floor(width),
            quality: Number.isFinite(quality) && quality > 0 ? Math.floor(quality) : DEFAULT_IMAGE_VARIANT_QUALITY,
            url: mediaTransformPath(siteId, media.id, Math.floor(width), Number.isFinite(quality) ? Math.floor(quality) : DEFAULT_IMAGE_VARIANT_QUALITY),
            ...(typeof variant.storagePath === 'string' ? { storagePath: variant.storagePath } : {}),
            ...(Number.isFinite(bytes) ? { bytes } : {}),
            ...(typeof variant.mimeType === 'string' ? { mimeType: variant.mimeType } : {}),
            ...(typeof variant.format === 'string' ? { format: variant.format } : {}),
            ...(typeof variant.generatedAt === 'string' ? { generatedAt: variant.generatedAt } : {}),
          };
        })
        .filter((variant): variant is MediaResponsiveVariant => !!variant)
    : [];

  if (variants.length === 0) {
    return undefined;
  }

  return {
    src: publicMediaFilePath(siteId, media.id),
    srcSet: variants.map((variant) => `${variant.url} ${variant.width}w`).join(', '),
    sizes: typeof record.sizes === 'string' && record.sizes.trim().length > 0
      ? record.sizes
      : '(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px',
    variants,
    preparedAt: typeof record.preparedAt === 'string' ? record.preparedAt : undefined,
    preparedBy: typeof record.preparedBy === 'string' ? record.preparedBy : undefined,
    format: typeof record.format === 'string' ? record.format : undefined,
    generatedBytes: Number.isFinite(Number(record.generatedBytes)) ? Number(record.generatedBytes) : undefined,
    storageProvider: typeof record.storageProvider === 'string' ? record.storageProvider : undefined,
  };
};

export const buildImageResponsiveManifest = (
  siteId: string,
  media: MediaItem,
): MediaResponsiveManifest | undefined => {
  if (media.type !== 'image' || media.visibility !== 'public') {
    return undefined;
  }

  const generated = generatedManifestFromMetadata(siteId, media);
  if (generated) {
    return generated;
  }

  const variants = DEFAULT_IMAGE_VARIANT_WIDTHS.map((width) => ({
    width,
    quality: DEFAULT_IMAGE_VARIANT_QUALITY,
    url: mediaTransformPath(siteId, media.id, width),
  }));

  return {
    src: publicMediaFilePath(siteId, media.id),
    srcSet: variants.map((variant) => `${variant.url} ${variant.width}w`).join(', '),
    sizes: '(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px',
    variants,
  };
};

export const withResponsiveMediaManifest = (
  siteId: string,
  media: MediaItem,
): MediaWithResponsiveManifest => {
  const deliveryUrl = publicMediaFilePath(siteId, media.id);
  const downloadUrl = publicMediaFilePath(siteId, media.id, { disposition: 'attachment' });
  const responsive = buildImageResponsiveManifest(siteId, media);
  const publicMedia = {
    ...media,
    url: deliveryUrl,
    thumbnailUrl: media.type === 'image' ? deliveryUrl : media.thumbnailUrl,
    deliveryUrl,
    downloadUrl,
  };

  return responsive
    ? { ...publicMedia, responsive }
    : publicMedia;
};
