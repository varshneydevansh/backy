import type { MediaItem } from '@backy-cms/core';

export interface PublicFontVariant {
  id: string;
  mediaId: string;
  family: string;
  weight: string;
  style: string;
  display: string;
  fallbackStack: string;
  cssFamily: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  originalName: string;
  folderId: string | null;
  tags: string[];
}

export interface PublicFontFamily {
  family: string;
  fallbackStack: string;
  display: string;
  cssFamily: string;
  variants: PublicFontVariant[];
  assetIds: string[];
}

export interface PublicFontManifest {
  schemaVersion: 'backy.font-manifest.v1';
  generatedAt: string;
  siteId: string;
  families: PublicFontFamily[];
  fonts: PublicFontVariant[];
  css: string;
  counts: {
    families: number;
    variants: number;
  };
}

const getStringMetadata = (metadata: Record<string, unknown> | undefined, key: string) => {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
};

const cleanCssString = (value: string) => value.replace(/["\\\r\n]/g, '');

const fontFamilyFromMedia = (font: MediaItem) => (
  getStringMetadata(font.metadata, 'fontFamily') ||
  font.originalName.replace(/\.[a-z0-9]+$/i, '') ||
  font.filename.replace(/\.[a-z0-9]+$/i, '') ||
  'Uploaded font'
);

const fontFormat = (font: MediaItem) => {
  const mime = font.mimeType.toLowerCase();
  const name = `${font.originalName || font.filename}`.toLowerCase();

  if (mime.includes('woff2') || name.endsWith('.woff2')) return 'woff2';
  if (mime.includes('woff') || name.endsWith('.woff')) return 'woff';
  if (mime.includes('opentype') || name.endsWith('.otf')) return 'opentype';
  if (mime.includes('truetype') || name.endsWith('.ttf')) return 'truetype';
  return '';
};

export const publicFontFilePath = (siteId: string, mediaId: string) => (
  `/api/sites/${encodeURIComponent(siteId)}/media/${encodeURIComponent(mediaId)}/file`
);

export const buildPublicFontManifest = (
  siteId: string,
  fonts: MediaItem[],
): PublicFontManifest => {
  const variants = fonts
    .filter((font) => font.type === 'font' && (font.visibility || 'public') === 'public')
    .map((font): PublicFontVariant => {
      const family = fontFamilyFromMedia(font);
      const fallbackStack = getStringMetadata(font.metadata, 'fontFallback') || 'system-ui, sans-serif';
      const display = getStringMetadata(font.metadata, 'fontDisplay') || 'swap';
      const weight = getStringMetadata(font.metadata, 'fontWeight') || '400';
      const style = getStringMetadata(font.metadata, 'fontStyle') || 'normal';

      return {
        id: `${font.id}:${weight}:${style}`,
        mediaId: font.id,
        family,
        weight,
        style,
        display,
        fallbackStack,
        cssFamily: `"${cleanCssString(family)}", ${fallbackStack}`,
        url: publicFontFilePath(siteId, font.id),
        mimeType: font.mimeType,
        sizeBytes: font.sizeBytes,
        originalName: font.originalName,
        folderId: font.folderId,
        tags: font.tags,
      };
    })
    .sort((left, right) => (
      left.family.localeCompare(right.family) ||
      left.weight.localeCompare(right.weight) ||
      left.style.localeCompare(right.style)
    ));

  const grouped = new Map<string, PublicFontFamily>();
  variants.forEach((variant) => {
    const key = variant.family.toLowerCase();
    const current = grouped.get(key) || {
      family: variant.family,
      fallbackStack: variant.fallbackStack,
      display: variant.display,
      cssFamily: variant.cssFamily,
      variants: [],
      assetIds: [],
    };

    current.variants.push(variant);
    current.assetIds.push(variant.mediaId);
    grouped.set(key, current);
  });

  const families = Array.from(grouped.values()).map((family) => ({
    ...family,
    assetIds: Array.from(new Set(family.assetIds)),
  }));

  const css = variants
    .map((variant) => {
      const format = fontFormat({
        ...fonts.find((font) => font.id === variant.mediaId)!,
        mimeType: variant.mimeType,
      });
      const formatPart = format ? ` format("${format}")` : '';

      return [
        '@font-face {',
        `  font-family: "${cleanCssString(variant.family)}";`,
        `  src: url("${variant.url}")${formatPart};`,
        `  font-weight: ${variant.weight};`,
        `  font-style: ${variant.style};`,
        `  font-display: ${variant.display};`,
        '}',
      ].join('\n');
    })
    .join('\n\n');

  return {
    schemaVersion: 'backy.font-manifest.v1',
    generatedAt: new Date().toISOString(),
    siteId,
    families,
    fonts: variants,
    css,
    counts: {
      families: families.length,
      variants: variants.length,
    },
  };
};
