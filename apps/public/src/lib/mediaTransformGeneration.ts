import type { StorageAdapter } from '@backy/storage';
import type { MediaItem } from '@backy-cms/core';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { getMediaStorageAdapter, getMediaStoragePathFromMedia } from '@/lib/mediaStorage';
import { mediaTransformPath, publicMediaFilePath } from '@/lib/mediaResponsive';

export type GeneratedImageVariant = {
  width: number;
  quality: number;
  url: string;
  storagePath: string;
  bytes: number;
  mimeType: 'image/webp';
  format: 'webp';
  generatedAt: string;
};

export type GeneratedImageManifest = {
  src: string;
  srcSet: string;
  sizes: string;
  variants: GeneratedImageVariant[];
  preparedAt: string;
  preparedBy: string;
  format: 'webp';
  generatedBytes: number;
  storageProvider: StorageAdapter['provider'];
};

export class MediaTransformGenerationError extends Error {
  code = 'MEDIA_TRANSFORM_GENERATION_FAILED';
  details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'MediaTransformGenerationError';
    this.details = details;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const generatedTransformsRecord = (metadata: unknown): Record<string, unknown> | null => {
  if (!isRecord(metadata) || !isRecord(metadata.generatedTransforms)) {
    return null;
  }

  return metadata.generatedTransforms;
};

export const generatedTransformStoragePaths = (metadata: unknown): string[] => {
  const generated = generatedTransformsRecord(metadata);
  const variants = Array.isArray(generated?.variants) ? generated.variants : [];

  return Array.from(new Set(variants
    .filter((variant): variant is Record<string, unknown> => isRecord(variant))
    .map((variant) => variant.storagePath)
    .filter((path): path is string => typeof path === 'string' && path.trim().length > 0)));
};

export const generatedTransformBytes = (metadata: unknown): number => {
  const generated = generatedTransformsRecord(metadata);
  if (Number.isFinite(Number(generated?.generatedBytes))) {
    return Math.max(0, Number(generated?.generatedBytes));
  }

  const variants = Array.isArray(generated?.variants) ? generated.variants : [];
  return variants.reduce((total, variant) => {
    if (!isRecord(variant)) {
      return total;
    }

    return total + Math.max(0, Number(variant.bytes) || 0);
  }, 0);
};

export interface GeneratedTransformCleanupOutcome {
  status: 'complete' | 'pending' | 'blocked';
  deletedPaths: string[];
  failedPaths: string[];
}

export const deleteGeneratedTransformFiles = async (
  metadata: unknown,
  storage?: StorageAdapter,
  scope?: { siteId: string; mediaId: string },
): Promise<GeneratedTransformCleanupOutcome> => {
  const paths = generatedTransformStoragePaths(metadata);
  if (!paths.length) return { status: 'complete', deletedPaths: [], failedPaths: [] };
  const prefix = scope ? `sites/${scope.siteId}/generated/media/${scope.mediaId}/` : '';
  const owned = (path: string) => Boolean(prefix && path.startsWith(prefix)
    && !/[\\%?#\x00-\x1f]/.test(path)
    && path.split('/').every(segment => segment && segment !== '.' && segment !== '..'));
  // Validate the whole manifest before touching storage. Metadata is editable;
  // it cannot authorize deletion outside this canonical site and media item.
  if (paths.some(path => !owned(path))) return { status: 'blocked', deletedPaths: [], failedPaths: paths };
  let adapter: StorageAdapter;
  try { adapter = storage || await getMediaStorageAdapter(); }
  catch { return { status: 'pending', deletedPaths: [], failedPaths: paths }; }
  const outcomes = await Promise.all(paths.map(async path => {
    try { await adapter.delete(path); return { path, deleted: true }; }
    catch { return { path, deleted: false }; }
  }));
  const deletedPaths = outcomes.filter(item => item.deleted).map(item => item.path);
  const failedPaths = outcomes.filter(item => !item.deleted).map(item => item.path);
  return { status: failedPaths.length ? 'pending' : 'complete', deletedPaths, failedPaths };
};

const normalizeVariantWidths = (input: {
  widths: number[];
  originalWidth?: number;
}) => {
  const normalized = input.widths
    .map((width) => Math.max(16, Math.min(3840, Math.floor(width))))
    .map((width) => (input.originalWidth && input.originalWidth > 0 ? Math.min(width, input.originalWidth) : width))
    .filter((width) => Number.isFinite(width) && width > 0);

  return Array.from(new Set(normalized)).sort((a, b) => a - b);
};

const generatedBatchId = (preparedAt: string) => {
  const millis = Date.parse(preparedAt);
  return `${Number.isFinite(millis) ? millis.toString(36) : Date.now().toString(36)}-${randomUUID()}`;
};

export const generateImageTransformManifest = async (input: {
  siteId: string;
  media: MediaItem;
  widths: number[];
  quality: number;
  sizes: string;
  preparedAt: string;
  preparedBy: string;
  /** Persist the complete path/byte journal before the first provider write. */
  beforeUpload?: (files: Array<{ path: string; bytes: number }>) => Promise<void>;
}): Promise<GeneratedImageManifest> => {
  const storage = await getMediaStorageAdapter();
  const sourcePath = getMediaStoragePathFromMedia(input.siteId, input.media);

  if (!sourcePath) {
    throw new MediaTransformGenerationError('Media item does not have a readable storage path.', {
      mediaId: input.media.id,
    });
  }

  const original = await storage.read(sourcePath);
  const image = sharp(original, { animated: false, limitInputPixels: 80_000_000 });
  const metadata = await image.metadata();
  const widths = normalizeVariantWidths({
    widths: input.widths,
    originalWidth: metadata.width,
  });

  if (widths.length === 0) {
    throw new MediaTransformGenerationError('No valid transform widths could be generated.', {
      mediaId: input.media.id,
    });
  }

  const batchId = generatedBatchId(input.preparedAt);
  const variants: GeneratedImageVariant[] = [];
  const planned: Array<{ width: number; buffer: Buffer; filename: string; storagePath: string }> = [];
  let plannedBytes = 0;

  for (const width of widths) {
    const buffer = await sharp(original, { animated: false, limitInputPixels: 80_000_000 })
      .rotate().resize({ width, withoutEnlargement: true }).webp({ quality: input.quality, effort: 4 }).toBuffer();
    plannedBytes += buffer.length;
    if (plannedBytes > 64 * 1024 * 1024) throw new MediaTransformGenerationError('Responsive variants exceed the bounded generation buffer limit.');
    const filename = `${input.media.id}-${width}w-q${input.quality}.webp`;
    planned.push({ width, buffer, filename, storagePath: `sites/${input.siteId}/generated/media/${input.media.id}/${batchId}/${filename}` });
  }
  await input.beforeUpload?.(planned.map(file => ({ path: file.storagePath, bytes: file.buffer.length })));

  try {
    for (const { width, buffer: variantBuffer, filename, storagePath } of planned) {
      const upload = await storage.upload(variantBuffer, {
        path: storagePath,
        filename,
        mimeType: 'image/webp',
        cacheControl: 'public, max-age=31536000, immutable',
        metadata: {
          siteId: input.siteId,
          sourceMediaId: input.media.id,
          sourceStoragePath: sourcePath,
          width: String(width),
          quality: String(input.quality),
          generatedAt: input.preparedAt,
        },
      });
      if (upload.path !== storagePath || upload.size !== variantBuffer.length) throw new Error('Storage adapter returned an unverified planned write.');

      variants.push({
        width,
        quality: input.quality,
        url: mediaTransformPath(input.siteId, input.media.id, width, input.quality),
        storagePath: upload.path,
        bytes: upload.size,
        mimeType: 'image/webp',
        format: 'webp',
        generatedAt: input.preparedAt,
      });
    }
  } catch {
    const cleanup = await deleteGeneratedTransformFiles({ generatedTransforms: { variants } }, storage, { siteId: input.siteId, mediaId: input.media.id });
    throw new MediaTransformGenerationError('Responsive variants could not be prepared.', {
      storageCleanup: {
        status: cleanup.status,
        deletedFiles: cleanup.deletedPaths.length,
        remainingFiles: cleanup.failedPaths.length,
      },
    });
  }

  return {
    src: publicMediaFilePath(input.siteId, input.media.id),
    srcSet: variants.map((variant) => `${variant.url} ${variant.width}w`).join(', '),
    sizes: input.sizes,
    variants,
    preparedAt: input.preparedAt,
    preparedBy: input.preparedBy,
    format: 'webp',
    generatedBytes: variants.reduce((total, variant) => total + variant.bytes, 0),
    storageProvider: storage.provider,
  };
};
