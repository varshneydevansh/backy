import type { SiteSettings } from '@backy-cms/core';

type FrontendDesignContract = NonNullable<SiteSettings['frontendDesign']>;
type FrontendDesignTemplate = FrontendDesignContract['templates'][number];
type FrontendDesignTemplateType = FrontendDesignTemplate['type'];
type FrontendDesignEditableMapEntry = FrontendDesignContract['editableMap'][number];

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

const cloneRecord = (value: unknown): Record<string, unknown> | undefined => (
  isRecord(value) ? JSON.parse(JSON.stringify(value)) as Record<string, unknown> : undefined
);

const cloneArray = <T>(value: T[]): T[] => (
  JSON.parse(JSON.stringify(value)) as T[]
);

const mergeRecord = (
  base: unknown,
  next: unknown,
): Record<string, unknown> | undefined => {
  const baseRecord = cloneRecord(base) || {};
  const nextRecord = cloneRecord(next) || {};
  const merged = { ...baseRecord, ...nextRecord };
  return Object.keys(merged).length > 0 ? merged : undefined;
};

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

const contentCanvasSize = (content: unknown): { width: number; height: number } | undefined => {
  const contentRecord = isRecord(content) ? content : {};
  const metadata = isRecord(contentRecord.metadata) ? contentRecord.metadata : {};
  const canvasSize = isRecord(contentRecord.canvasSize)
    ? contentRecord.canvasSize
    : isRecord(metadata.canvasSize)
      ? metadata.canvasSize
      : undefined;

  if (!canvasSize) return undefined;

  return {
    width: Number(canvasSize.width) || 1200,
    height: Number(canvasSize.height) || 900,
  };
};

const contentCustomCss = (content: unknown): string | undefined => {
  const contentRecord = isRecord(content) ? content : {};
  const metadata = isRecord(contentRecord.metadata) ? contentRecord.metadata : {};
  return stringValue(contentRecord.customCSS)
    || stringValue(contentRecord.customCss)
    || stringValue(metadata.customCSS)
    || stringValue(metadata.customCss);
};

const contentElements = (content: unknown): unknown[] => {
  const contentRecord = isRecord(content) ? content : {};
  if (Array.isArray(contentRecord.elements)) return cloneArray(contentRecord.elements);
  const contentDocument = isRecord(contentRecord.contentDocument) ? contentRecord.contentDocument : undefined;
  if (Array.isArray(contentDocument?.elements)) return cloneArray(contentDocument.elements);
  return [];
};

const contentTemplatePayload = (content: unknown) => {
  const contentRecord = isRecord(content) ? content : {};
  const contentDocument = isRecord(contentRecord.contentDocument)
    ? cloneRecord(contentRecord.contentDocument)
    : isRecord(contentRecord) && Array.isArray(contentRecord.elements) && isRecord(contentRecord.metadata)
      ? cloneRecord(contentRecord)
      : undefined;
  const canvasSize = contentCanvasSize(content) || { width: 1200, height: 900 };
  const customCSS = contentCustomCss(content);

  return {
    elements: contentElements(content),
    canvasSize,
    ...(customCSS ? { customCSS } : {}),
    ...(contentDocument ? { contentDocument } : {}),
  };
};

const inferEditableMapFromElements = (
  elements: unknown[],
  entries: FrontendDesignEditableMapEntry[] = [],
) => {
  for (const element of elements) {
    if (!isRecord(element)) continue;

    const elementId = stringValue(element.id);
    const elementType = stringValue(element.type);
    const props = isRecord(element.props) ? element.props : {};
    const binding = stringValue(props.binding);
    if (binding) {
      entries.push({
        elementId,
        role: elementType,
        binding,
        fields: [binding.split('.').filter(Boolean).at(-1)].filter((field): field is string => Boolean(field)),
      });
    }

    if (Array.isArray(element.dataBindings)) {
      for (const bindingEntry of element.dataBindings) {
        if (!isRecord(bindingEntry)) continue;
        const source = stringValue(bindingEntry.source);
        entries.push({
          elementId,
          role: elementType,
          binding: source,
          fields: Array.isArray(bindingEntry.fields)
            ? bindingEntry.fields.map(stringValue).filter((field): field is string => Boolean(field))
            : undefined,
        });
      }
    }

    if (Array.isArray(element.children)) {
      inferEditableMapFromElements(element.children, entries);
    }
  }

  return entries;
};

const dedupeEditableMap = (entries: FrontendDesignEditableMapEntry[]) => {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = [entry.selector || '', entry.elementId || '', entry.role || '', entry.binding || ''].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(entry.selector || entry.elementId || entry.binding || entry.role);
  });
};

export const buildFrontendDesignContractFromContentTemplate = (input: {
  frontendDesign?: SiteSettings['frontendDesign'];
  resource: {
    id: string;
    type: 'page' | 'blogPost';
    title: string;
    slug: string;
    description?: string | null;
    content: unknown;
    meta?: Record<string, unknown>;
  };
  templateId?: string;
  templateName?: string;
  routePattern?: string;
  source?: Record<string, unknown>;
  bindingHints?: Array<Record<string, unknown>>;
  editableMap?: Array<Record<string, unknown>>;
  updatedAt?: string;
}): FrontendDesignContract => {
  const updatedAt = input.updatedAt || new Date().toISOString();
  const current = normalizeFrontendDesignContract(input.frontendDesign || emptyFrontendDesignContract(), { updatedAt });
  const meta = input.resource.meta || {};
  const content = contentTemplatePayload(input.resource.content);
  const templateId = input.templateId
    || stringValue(meta.frontendDesignTemplateId)
    || `${input.resource.type}-${input.resource.id}`;
  const routePattern = input.routePattern
    || stringValue(meta.frontendDesignRoutePattern)
    || (input.resource.type === 'blogPost' ? `/blog/${input.resource.slug}` : `/${input.resource.slug}`);
  const sourceInput = mergeRecord(current.source, meta.frontendDesignSource);
  const normalizedSource = normalizeFrontendDesignContract({
    source: mergeRecord(sourceInput, input.source) || {
      type: 'custom-frontend',
      label: 'Captured content template',
    },
  }, { updatedAt }).source;
  const customCss = content.customCSS || stringValue(meta.frontendDesignCustomCss) || current.tokens.customCss;
  const tokens = {
    ...current.tokens,
    ...(isRecord(meta.frontendDesignTokens) ? cloneRecord(meta.frontendDesignTokens) : {}),
    ...(customCss ? { customCss } : {}),
  };
  const chrome = {
    ...current.chrome,
    ...(isRecord(meta.frontendDesignChrome) ? cloneRecord(meta.frontendDesignChrome) : {}),
  };
  const inferredEditableMap = inferEditableMapFromElements(content.elements);
  const explicitEditableMap = Array.isArray(input.editableMap)
    ? input.editableMap.filter(isRecord).map((entry) => ({ ...entry }))
    : [];
  const bindingHints = Array.isArray(input.bindingHints)
    ? input.bindingHints.filter(isRecord).map((hint) => ({ ...hint }))
    : Array.isArray(meta.frontendDesignBindingHints)
      ? meta.frontendDesignBindingHints.filter(isRecord).map((hint) => ({ ...hint }))
      : inferredEditableMap
          .filter((entry) => entry.binding)
          .map((entry) => ({
            elementId: entry.elementId,
            role: entry.role,
            binding: entry.binding,
            fields: entry.fields,
          }));
  const template: FrontendDesignTemplate = {
    id: templateId,
    type: input.resource.type,
    name: input.templateName || stringValue(meta.frontendDesignTemplateName) || input.resource.title,
    routePattern,
    description: input.resource.description || `Captured from ${input.resource.title}.`,
    canvasSize: content.canvasSize,
    content,
    bindingHints: bindingHints.length > 0 ? bindingHints : undefined,
  };

  return {
    ...current,
    status: 'captured',
    source: normalizedSource,
    tokens,
    chrome,
    templates: [
      ...current.templates.filter((candidate) => candidate.id !== template.id),
      template,
    ],
    editableMap: dedupeEditableMap([
      ...current.editableMap,
      ...inferredEditableMap,
      ...explicitEditableMap,
    ]),
    notes: current.notes || 'Captured from content so new pages and posts can retain frontend design details.',
    updatedAt,
  };
};

const templateRequestId = (input: Record<string, unknown>): string | undefined => {
  const meta = isRecord(input.meta) ? input.meta : {};
  return stringValue(input.frontendDesignTemplateId)
    || stringValue(input.designTemplateId)
    || stringValue(meta.frontendDesignTemplateId);
};

export const findFrontendDesignTemplate = (
  frontendDesign: SiteSettings['frontendDesign'] | undefined,
  type: FrontendDesignTemplateType,
  templateId: string,
): FrontendDesignTemplate | undefined => (
  frontendDesign?.templates?.find((template) => template.type === type && template.id === templateId)
);

const templateContent = (
  frontendDesign: FrontendDesignContract,
  template: FrontendDesignTemplate,
  input: {
    kind: 'page' | 'post';
    title: string;
    description?: string | null;
    excerpt?: string | null;
  },
) => {
  const content = cloneRecord(template.content) || {};
  const contentDocument = cloneRecord(content.contentDocument);
  const metadata = cloneRecord(contentDocument?.metadata);
  const contentCanvasSize = cloneRecord(content.canvasSize);
  const metadataCanvasSize = cloneRecord(metadata?.canvasSize);
  const canvasSize = contentCanvasSize
    || metadataCanvasSize
    || (template.canvasSize ? { ...template.canvasSize } : undefined)
    || { width: 1200, height: 900 };
  const customCSS = stringValue(content.customCSS)
    || stringValue(content.customCss)
    || stringValue(metadata?.customCSS)
    || frontendDesign.tokens.customCss;

  if (Array.isArray(content.elements)) {
    return {
      elements: cloneArray(content.elements),
      canvasSize,
      customCSS,
      contentDocument,
    };
  }

  if (contentDocument && Array.isArray(contentDocument.elements)) {
    return {
      elements: cloneArray(contentDocument.elements),
      canvasSize,
      customCSS,
      contentDocument,
    };
  }

  const isPost = input.kind === 'post';
  const titleBinding = isPost ? 'post.title' : 'page.title';
  const bodyBinding = isPost ? 'post.content' : 'page.content';
  const summaryBinding = isPost ? 'post.excerpt' : 'page.description';
  const summary = stringValue(input.excerpt)
    || stringValue(input.description)
    || template.description
    || (isPost
      ? 'This article was seeded from the connected frontend design contract.'
      : 'This page was seeded from the connected frontend design contract.');

  return {
    elements: [
      {
        id: `frontend-template-${template.id}`,
        type: 'section',
        x: 0,
        y: 0,
        width: Number(canvasSize.width) || 1200,
        height: Math.max(620, Number(canvasSize.height) || 900),
        props: {
          backgroundColor: '#ffffff',
          borderRadius: 0,
          padding: 0,
          frontendTemplateId: template.id,
          frontendTemplateName: template.name,
          routePattern: template.routePattern,
        },
        dataBindings: [
          {
            source: isPost ? 'blog' : 'page',
            mode: 'current',
            fields: isPost
              ? ['title', 'excerpt', 'author', 'publishedAt', 'coverImage', 'content']
              : ['title', 'description', 'content'],
          },
        ],
        children: [
          {
            id: `frontend-template-${template.id}-title`,
            type: 'heading',
            x: 72,
            y: 96,
            width: Math.min(760, (Number(canvasSize.width) || 1200) - 144),
            height: 112,
            props: {
              content: input.title || template.name,
              level: 'h1',
              fontSize: 52,
              fontWeight: '800',
              lineHeight: 1.08,
              color: frontendDesign.tokens.colors?.text || '#111827',
              binding: titleBinding,
            },
          },
          {
            id: `frontend-template-${template.id}-summary`,
            type: 'paragraph',
            x: 76,
            y: 238,
            width: Math.min(680, (Number(canvasSize.width) || 1200) - 152),
            height: 92,
            props: {
              content: summary,
              fontSize: 18,
              lineHeight: 1.6,
              color: '#4b5563',
              binding: summaryBinding,
            },
          },
          {
            id: `frontend-template-${template.id}-body`,
            type: 'box',
            x: 76,
            y: 388,
            width: Math.min(860, (Number(canvasSize.width) || 1200) - 152),
            height: 240,
            props: {
              backgroundColor: '#f8fafc',
              borderColor: '#cbd5e1',
              borderWidth: 1,
              borderStyle: 'solid',
              borderRadius: 8,
              binding: bodyBinding,
              bindingHints: template.bindingHints || [],
            },
            children: [
              {
                id: `frontend-template-${template.id}-body-copy`,
                type: 'paragraph',
                x: 28,
                y: 30,
                width: Math.min(760, (Number(canvasSize.width) || 1200) - 220),
                height: 96,
                props: {
                  content: isPost
                    ? 'Replace this placeholder with article content, embeds, or reusable frontend sections.'
                    : 'Replace this placeholder with editable sections captured from your frontend design.',
                  fontSize: 16,
                  lineHeight: 1.5,
                  color: '#334155',
                },
              },
            ],
          },
        ],
      },
    ],
    canvasSize,
    customCSS,
  };
};

export const seedInputFromFrontendDesignTemplate = (
  input: {
    siteSettings?: SiteSettings;
    body: Record<string, unknown>;
    templateType: FrontendDesignTemplateType;
    kind: 'page' | 'post';
    title: string;
    description?: string | null;
    excerpt?: string | null;
  },
): { ok: true; body: Record<string, unknown>; template?: FrontendDesignTemplate } | { ok: false; code: string; message: string } => {
  const requestedTemplateId = templateRequestId(input.body);
  if (!requestedTemplateId) {
    return { ok: true, body: input.body };
  }

  const frontendDesign = input.siteSettings?.frontendDesign;
  const template = findFrontendDesignTemplate(frontendDesign, input.templateType, requestedTemplateId);
  const explicitRequest = Boolean(
    stringValue(input.body.frontendDesignTemplateId)
    || stringValue(input.body.designTemplateId),
  );

  if (!frontendDesign || !template) {
    if (explicitRequest) {
      return {
        ok: false,
        code: 'FRONTEND_TEMPLATE_NOT_FOUND',
        message: `Frontend design template "${requestedTemplateId}" is not configured for this site.`,
      };
    }

    return { ok: true, body: input.body };
  }

  const existingMeta = isRecord(input.body.meta) ? input.body.meta : {};
  const existingContent = isRecord(input.body.content) ? input.body.content : undefined;
  const shouldSeedContent = !existingContent
    || (!Array.isArray(existingContent.elements) && !isRecord(existingContent.contentDocument));

  return {
    ok: true,
    template,
    body: {
      ...input.body,
      content: shouldSeedContent
        ? templateContent(frontendDesign, template, input)
        : input.body.content,
      meta: {
        ...existingMeta,
        frontendDesignTemplateId: stringValue(existingMeta.frontendDesignTemplateId) || template.id,
        frontendDesignTemplateName: stringValue(existingMeta.frontendDesignTemplateName) || template.name,
        frontendDesignRoutePattern: stringValue(existingMeta.frontendDesignRoutePattern) || template.routePattern,
        frontendDesignSource: cloneRecord(existingMeta.frontendDesignSource) || cloneRecord(frontendDesign.source),
        frontendDesignTokens: cloneRecord(existingMeta.frontendDesignTokens) || cloneRecord(frontendDesign.tokens),
        frontendDesignChrome: cloneRecord(existingMeta.frontendDesignChrome) || cloneRecord(frontendDesign.chrome),
        frontendDesignCustomCss: stringValue(existingMeta.frontendDesignCustomCss) || frontendDesign.tokens.customCss,
        frontendDesignBindingHints: Array.isArray(existingMeta.frontendDesignBindingHints)
          ? cloneArray(existingMeta.frontendDesignBindingHints)
          : template.bindingHints ? cloneArray(template.bindingHints) : undefined,
      },
    },
  };
};
