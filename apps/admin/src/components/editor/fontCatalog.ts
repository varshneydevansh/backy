import { type MediaAsset } from '@/stores/mockStore';

export type FontSource = 'system' | 'google' | 'custom';
export type FontDisplay = 'auto' | 'block' | 'swap' | 'fallback' | 'optional';

export interface FontFaceDefinition {
  mediaId?: string;
  url: string;
  format?: string;
  weight: string;
  style: 'normal' | 'italic' | 'oblique';
  display: FontDisplay;
}

export interface FontOption {
  value: string;
  label: string;
  source: FontSource;
  mediaId?: string;
  url?: string;
  format?: string;
  weight?: string;
  style?: string;
  display?: FontDisplay;
  faces?: FontFaceDefinition[];
}

const FONT_EXTENSIONS = ['woff', 'woff2', 'ttf', 'otf', 'eot', 'svg'] as const;
const FONT_DISPLAY_VALUES: FontDisplay[] = ['auto', 'block', 'swap', 'fallback', 'optional'];

const GOOGLE_FONT_LIST: FontOption[] = [
  { value: 'Inter, sans-serif', label: 'Inter', source: 'google' },
  { value: 'Roboto, sans-serif', label: 'Roboto', source: 'google' },
  { value: 'Open Sans, sans-serif', label: 'Open Sans', source: 'google' },
  { value: 'Lato, sans-serif', label: 'Lato', source: 'google' },
  { value: 'Poppins, sans-serif', label: 'Poppins', source: 'google' },
  { value: 'Montserrat, sans-serif', label: 'Montserrat', source: 'google' },
  { value: 'Playfair Display, serif', label: 'Playfair Display', source: 'google' },
  { value: 'Merriweather, serif', label: 'Merriweather', source: 'google' },
];

const DEFAULT_FONT_LIST: FontOption[] = [
  { value: 'inherit', label: 'Default (Inherit)', source: 'system' },
  { value: 'Georgia, serif', label: 'Georgia', source: 'system' },
  { value: 'Times New Roman, serif', label: 'Times New Roman', source: 'system' },
  { value: 'Courier New, monospace', label: 'Courier New', source: 'system' },
  { value: 'Arial, sans-serif', label: 'Arial', source: 'system' },
  { value: 'Helvetica, sans-serif', label: 'Helvetica', source: 'system' },
  { value: 'Fira Code, monospace', label: 'Fira Code', source: 'system' },
];

const FONT_FORMAT_MAP: Record<string, string> = {
  woff: 'woff',
  woff2: 'woff2',
  ttf: 'truetype',
  otf: 'opentype',
  eot: 'embedded-opentype',
  svg: 'svg',
};

const getExtension = (value: string): string | null => {
  const sanitized = value.split(/[?#]/)[0].toLowerCase();
  const match = sanitized.match(/\.([a-z0-9]+)$/);
  if (!match || !match[1]) return null;
  return match[1];
};

const normalizeFontUrl = (value: string | undefined): string => {
  if (!value) return '';
  return value.split(/[?#]/)[0].trim();
};

const cleanFontNameFromFilename = (name: string): string => {
  const base = name.trim().replace(/\.[a-z0-9]+$/i, '');
  return base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
};

const getStringMetadata = (media: MediaAsset, key: string): string => {
  const value = media.metadata?.[key];
  return typeof value === 'string' ? value.trim() : '';
};

const escapeCssString = (value: string): string => value.replace(/["\\]/g, '');

const normalizeFontWeight = (value: string): string => {
  const normalized = value.trim().toLowerCase();
  if (['normal', 'bold', 'lighter', 'bolder'].includes(normalized)) {
    return normalized;
  }

  if (/^\d{1,4}$/.test(normalized)) {
    const numeric = Number(normalized);
    if (numeric >= 1 && numeric <= 1000) {
      return String(numeric);
    }
  }

  return '400';
};

const normalizeFontStyle = (value: string): FontFaceDefinition['style'] => {
  const normalized = value.trim().toLowerCase();
  return normalized === 'italic' || normalized === 'oblique' ? normalized : 'normal';
};

const normalizeFontDisplay = (value: string): FontDisplay => {
  const normalized = value.trim().toLowerCase();
  return FONT_DISPLAY_VALUES.includes(normalized as FontDisplay) ? normalized as FontDisplay : 'swap';
};

const toFontName = (media: MediaAsset): string | null => {
  const registeredFamily = getStringMetadata(media, 'fontFamily');
  if (registeredFamily) {
    return registeredFamily;
  }

  const candidate = (media.name || '').trim();
  const extension = getExtension(candidate) || getExtension(media.url || '');
  if (!extension || !FONT_EXTENSIONS.includes(extension as (typeof FONT_EXTENSIONS)[number])) return null;
  const name = cleanFontNameFromFilename(candidate);
  return name || null;
};

export const toFontFamilyStyle = (value: string): string => {
  const raw = (value || '').trim();
  if (!raw || raw === 'inherit') {
    return raw || 'inherit';
  }
  if (raw.includes(',')) {
    return raw;
  }
  if (raw.includes(' ')) {
    return `"${raw}"`;
  }
  return raw;
};

export const getGoogleFontFamilies = (fonts: FontOption[]): string[] => {
  const seen = new Set<string>();
  return fonts
    .filter((font) => font.source === 'google')
    .map((font) => font.value.split(',')[0]?.trim())
    .filter((name): name is string => {
      const normalized = name?.trim();
      if (!normalized) return false;
      if (seen.has(normalized.toLowerCase())) return false;
      seen.add(normalized.toLowerCase());
      return true;
    });
};

export const buildGoogleFontImportUrl = (fonts: FontOption[]): string => {
  const families = getGoogleFontFamilies(fonts);
  if (families.length === 0) return '';
  const weightParams = ':ital,wght@0,300;0,400;0,500;0,600;0,700;1,400';
  return `https://fonts.googleapis.com/css2?${families
    .map((name) => `family=${name.replace(/\\s+/g, '+')}${weightParams}`)
    .join('&')}&display=swap`;
};

export const getFontFamilyOptions = (media: MediaAsset[] = []): FontOption[] => {
  const options: FontOption[] = [...DEFAULT_FONT_LIST, ...GOOGLE_FONT_LIST];
  const seen = new Set<string>();
  const customOptionsByKey = new Map<string, FontOption>();

  for (const font of options) {
    seen.add(font.value.toLowerCase());
  }

  media.forEach((item) => {
    if (item.type !== 'font') {
      return;
    }

    const extension = getExtension(item.name || normalizeFontUrl(item.url));
    if (!extension || !FONT_EXTENSIONS.includes(extension as (typeof FONT_EXTENSIONS)[number])) {
      return;
    }

    const value = toFontName(item);
    if (!value) return;

    const key = value.toLowerCase();

    const format = FONT_FORMAT_MAP[extension];
    if (!format) return;
    const url = normalizeFontUrl(item.url);
    if (!url) return;

    const face: FontFaceDefinition = {
      mediaId: item.id,
      url,
      format,
      weight: normalizeFontWeight(getStringMetadata(item, 'fontWeight') || '400'),
      style: normalizeFontStyle(getStringMetadata(item, 'fontStyle') || 'normal'),
      display: normalizeFontDisplay(getStringMetadata(item, 'fontDisplay') || 'swap'),
    };

    const existing = customOptionsByKey.get(key);
    if (existing) {
      existing.faces = [...(existing.faces || []), face];
      return;
    }

    if (seen.has(key)) return;

    options.push({
      value,
      label: value,
      source: 'custom',
      mediaId: item.id,
      url,
      format,
      weight: face.weight,
      style: face.style,
      display: face.display,
      faces: [face],
    });
    customOptionsByKey.set(key, options[options.length - 1]);
    seen.add(key);
  });

  return options;
};

export const buildCustomFontFaces = (fonts: FontOption[]): string => {
  return fonts
    .filter((font) => font.source === 'custom')
    .flatMap((font) => {
      const faces = font.faces?.length
        ? font.faces
        : font.url
          ? [{
            mediaId: font.mediaId,
            url: font.url,
            format: font.format,
            weight: normalizeFontWeight(font.weight || '400'),
            style: normalizeFontStyle(font.style || 'normal'),
            display: normalizeFontDisplay(font.display || 'swap'),
          }]
          : [];

      return faces.map((face) => ({ font, face }));
    })
    .filter(({ face }) => !!face.url)
    .map(({ font, face }) => {
      const fontName = escapeCssString(font.value);
      const formatPart = face.format ? ` format("${escapeCssString(face.format)}")` : '';
      const weight = normalizeFontWeight(face.weight);
      const style = normalizeFontStyle(face.style);
      const display = normalizeFontDisplay(face.display);

      return `@font-face {
  font-family: "${fontName}";
  src: url("${escapeCssString(face.url)}")${formatPart};
  font-style: ${style};
  font-weight: ${weight};
  font-display: ${display};
}`.trim();
    })
    .join('\n');
};
