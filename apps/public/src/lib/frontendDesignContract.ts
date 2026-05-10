import type { SiteSettings } from '@backy-cms/core';

type FrontendDesignContract = NonNullable<SiteSettings['frontendDesign']>;

const SCHEMA_VERSION = 'backy.frontend-design.v1';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const stringValue = (value: unknown): string | undefined => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
);

const stringRecord = (value: unknown): Record<string, string> | undefined => {
  if (!isRecord(value)) return undefined;

  const entries = Object.entries(value).filter((entry): entry is [string, string] => (
    typeof entry[1] === 'string' && entry[1].trim().length > 0
  ));

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const objectRecord = (value: unknown): Record<string, unknown> | undefined => (
  isRecord(value) ? { ...value } : undefined
);

const normalizeStatus = (value: unknown): FrontendDesignContract['status'] => (
  value === 'captured' || value === 'synced' || value === 'stale' || value === 'unconfigured'
    ? value
    : 'captured'
);

const normalizeSourceType = (value: unknown): FrontendDesignContract['source']['type'] => (
  value === 'managed-site' || value === 'custom-frontend' || value === 'manual'
    ? value
    : 'custom-frontend'
);

const normalizeTemplateType = (value: unknown): FrontendDesignContract['templates'][number]['type'] => (
  value === 'blogPost' || value === 'form' || value === 'product' || value === 'collection' || value === 'section'
    ? value
    : 'page'
);

export const emptyFrontendDesignContract = (): FrontendDesignContract => ({
  schemaVersion: SCHEMA_VERSION,
  status: 'unconfigured',
  source: {
    type: 'manual',
    label: 'No custom frontend connected',
  },
  tokens: {},
  chrome: {},
  templates: [],
  editableMap: [],
  notes: 'Connect or import a frontend design contract so Backy can preserve site chrome, tokens, templates, and editable bindings for new content.',
});

export const normalizeFrontendDesignContract = (
  value: unknown,
  options: { updatedAt?: string; fallback?: FrontendDesignContract } = {},
): FrontendDesignContract => {
  if (!isRecord(value)) {
    return options.fallback ? { ...options.fallback } : emptyFrontendDesignContract();
  }

  const sourceInput = isRecord(value.source) ? value.source : {};
  const tokensInput = isRecord(value.tokens) ? value.tokens : {};
  const chromeInput = isRecord(value.chrome) ? value.chrome : {};

  return {
    schemaVersion: stringValue(value.schemaVersion) || SCHEMA_VERSION,
    status: normalizeStatus(value.status),
    source: {
      type: normalizeSourceType(sourceInput.type),
      label: stringValue(sourceInput.label),
      url: stringValue(sourceInput.url),
      repository: stringValue(sourceInput.repository),
      branch: stringValue(sourceInput.branch),
      capturedAt: stringValue(sourceInput.capturedAt) || options.updatedAt,
    },
    tokens: {
      colors: stringRecord(tokensInput.colors),
      fonts: stringRecord(tokensInput.fonts),
      spacing: objectRecord(tokensInput.spacing),
      radii: objectRecord(tokensInput.radii),
      shadows: objectRecord(tokensInput.shadows),
      customCss: stringValue(tokensInput.customCss),
    },
    chrome: {
      header: objectRecord(chromeInput.header),
      navigation: objectRecord(chromeInput.navigation),
      footer: objectRecord(chromeInput.footer),
    },
    templates: Array.isArray(value.templates)
      ? value.templates
          .filter(isRecord)
          .map((template, index) => {
            const canvasSize = isRecord(template.canvasSize)
              ? {
                  width: Number(template.canvasSize.width) || 1200,
                  height: Number(template.canvasSize.height) || 900,
                }
              : undefined;

            return {
              id: stringValue(template.id) || `template-${index + 1}`,
              type: normalizeTemplateType(template.type),
              name: stringValue(template.name) || `Template ${index + 1}`,
              routePattern: stringValue(template.routePattern),
              description: stringValue(template.description),
              canvasSize,
              content: objectRecord(template.content),
              bindingHints: Array.isArray(template.bindingHints)
                ? template.bindingHints.filter(isRecord).map((hint) => ({ ...hint }))
                : undefined,
            };
          })
      : [],
    editableMap: Array.isArray(value.editableMap)
      ? value.editableMap
          .filter(isRecord)
          .map((entry) => ({
            selector: stringValue(entry.selector),
            elementId: stringValue(entry.elementId),
            role: stringValue(entry.role),
            binding: stringValue(entry.binding),
            fields: Array.isArray(entry.fields) ? entry.fields.map(stringValue).filter((field): field is string => Boolean(field)) : undefined,
          }))
      : [],
    notes: stringValue(value.notes),
    updatedAt: options.updatedAt || stringValue(value.updatedAt),
  };
};

export const buildSiteDefaultFrontendDesignContract = (input: {
  site: { name: string; slug: string; customDomain?: string | null; theme?: unknown; settings?: SiteSettings };
  pageTemplates?: Array<{ id: string; title: string; slug: string; type?: 'page' | 'blogPost' }>;
  updatedAt?: string;
}): FrontendDesignContract => {
  const updatedAt = input.updatedAt || new Date().toISOString();
  const theme = isRecord(input.site.theme) ? input.site.theme : {};
  const navigation = input.site.settings?.navigation;

  return normalizeFrontendDesignContract({
    schemaVersion: SCHEMA_VERSION,
    status: 'captured',
    source: {
      type: 'managed-site',
      label: `${input.site.name} Backy managed design`,
      url: input.site.customDomain || `/${input.site.slug}`,
      capturedAt: updatedAt,
    },
    tokens: {
      colors: isRecord(theme.colors) ? theme.colors : undefined,
      fonts: isRecord(theme.fonts) ? theme.fonts : undefined,
      spacing: isRecord(theme.spacing) ? theme.spacing : undefined,
      customCss: stringValue(theme.customCSS),
    },
    chrome: {
      header: {
        ...(navigation?.layout?.header || {}),
        primaryItemCount: navigation?.primary.length || 0,
      },
      navigation: {
        primary: navigation?.primary || [],
        footer: navigation?.footer || [],
      },
      footer: {
        ...(navigation?.layout?.footer || {}),
        footerItemCount: navigation?.footer?.length || 0,
      },
    },
    templates: (input.pageTemplates || []).map((template) => ({
      id: template.id,
      type: template.type || 'page',
      name: template.title,
      routePattern: template.slug === 'home' || template.slug === 'index' ? '/' : `/${template.slug}`,
      description: 'Captured from the current Backy site structure.',
    })),
    editableMap: [
      { role: 'site.header', binding: 'site.navigation.primary', fields: ['label', 'href', 'children'] },
      { role: 'site.footer', binding: 'site.navigation.footer', fields: ['label', 'href', 'children'] },
      { role: 'site.tokens', binding: 'site.theme', fields: ['colors', 'fonts', 'spacing'] },
    ],
    notes: 'Captured from the current Backy site so new pages and posts can inherit the same chrome and design tokens.',
  }, { updatedAt });
};
