import {
  getCanonicalPathForPage,
  getMediaList,
  listFormsBySite,
  type StorePage,
  type StoreSite,
} from './backyStore';

type JsonObject = Record<string, unknown>;

interface RenderPayloadOptions {
  requestId: string;
  path: string;
}

interface RenderElement extends JsonObject {
  id: string;
  type: string;
  children: RenderElement[];
  props: JsonObject;
  styles?: JsonObject;
  actions?: JsonObject[];
  dataBindings?: JsonObject[];
}

const isRecord = (value: unknown): value is JsonObject => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const toStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
);

const normalizeElement = (raw: unknown): RenderElement | null => {
  if (!isRecord(raw)) {
    return null;
  }

  const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : null;
  const type = typeof raw.type === 'string' && raw.type.length > 0 ? raw.type : null;

  if (!id || !type) {
    return null;
  }

  const children = Array.isArray(raw.children)
    ? raw.children.map(normalizeElement).filter((child): child is RenderElement => !!child)
    : [];

  return {
    ...raw,
    id,
    type,
    children,
    props: isRecord(raw.props) ? raw.props : {},
    styles: isRecord(raw.styles) ? raw.styles : {},
    actions: Array.isArray(raw.actions) ? raw.actions.filter(isRecord) : [],
    dataBindings: Array.isArray(raw.dataBindings) ? raw.dataBindings.filter(isRecord) : [],
  };
};

const walkElements = (elements: RenderElement[], visit: (element: RenderElement) => void) => {
  for (const element of elements) {
    visit(element);
    walkElements(element.children, visit);
  }
};

const collectElementActions = (elements: RenderElement[]): JsonObject[] => {
  const actions: JsonObject[] = [];
  walkElements(elements, (element) => {
    if (Array.isArray(element.actions)) {
      actions.push(...element.actions);
    }

    const props = element.props;
    const href = typeof props.href === 'string' ? props.href : null;
    const actionUrl = typeof props.actionUrl === 'string' ? props.actionUrl : null;
    const formId = typeof props.formId === 'string' ? props.formId : null;

    if (href) {
      actions.push({
        id: `action_${element.id}_link`,
        type: href.startsWith('/') ? 'route' : 'link',
        label: typeof props.label === 'string' ? props.label : undefined,
        target: href,
        href,
      });
    }

    if (formId || actionUrl) {
      actions.push({
        id: `action_${element.id}_submit`,
        type: 'submitForm',
        formId: formId || undefined,
        method: 'POST',
        target: actionUrl || undefined,
      });
    }
  });

  return actions;
};

const collectElementBindings = (elements: RenderElement[]): JsonObject[] => {
  const bindings: JsonObject[] = [];
  walkElements(elements, (element) => {
    if (Array.isArray(element.dataBindings)) {
      bindings.push(...element.dataBindings);
    }
  });
  return bindings;
};

const buildThemeTokens = (site: StoreSite) => ({
  schemaVersion: 'backy.theme.v1',
  colors: site.theme.colors,
  typography: {
    families: site.theme.fonts,
    scale: {
      h1: '44px',
      h2: '32px',
      body: '16px',
    },
    lineHeights: {
      tight: 1.15,
      body: 1.6,
    },
    weights: {
      regular: 400,
      medium: 500,
      bold: 700,
    },
  },
  spacing: {
    xs: `${site.theme.spacing?.unit ?? 4}px`,
    sm: `${(site.theme.spacing?.unit ?? 4) * 2}px`,
    md: `${(site.theme.spacing?.unit ?? 4) * 4}px`,
    lg: `${(site.theme.spacing?.unit ?? 4) * 8}px`,
  },
  radii: {
    sm: '4px',
    md: '8px',
    lg: '12px',
  },
  shadows: {
    page: '0 18px 55px rgba(15,23,42,0.16)',
  },
  breakpoints: {
    mobile: 390,
    tablet: 768,
    desktop: pageDefaultWidth,
    wide: 1440,
  },
  customCss: site.theme.customCSS,
});

const pageDefaultWidth = 1200;

const buildEditableMap = (elements: RenderElement[]): Record<string, JsonObject> => {
  const editableMap: Record<string, JsonObject> = {};

  walkElements(elements, (element) => {
    const props = element.props;
    if ('content' in props) {
      editableMap[`element.${element.id}.content`] = {
        elementId: element.id,
        field: 'props.content',
        editable: true,
        label: `${element.type} content`,
        valueType: Array.isArray(props.content) ? 'richText' : 'string',
        scope: 'element',
      };
    }

    if ('src' in props || 'mediaId' in props || 'assetId' in props) {
      editableMap[`element.${element.id}.asset`] = {
        elementId: element.id,
        field: 'props.assetId',
        editable: true,
        label: `${element.type} asset`,
        valueType: element.type === 'video' ? 'video' : 'image',
        scope: 'element',
      };
    }
  });

  return editableMap;
};

export function buildPublicRenderPayload(site: StoreSite, page: StorePage, options: RenderPayloadOptions) {
  const elements = page.content.elements
    .map(normalizeElement)
    .filter((element): element is RenderElement => !!element);
  const mediaPayload = getMediaList(site.id, {
    pageId: page.id,
    visibility: 'public',
    limit: 100,
  });
  const forms = listFormsBySite(site.id, { pageId: page.id });
  const canonical = page.isHomepage ? '/' : page.meta.canonical || getCanonicalPathForPage(page);
  const actions = collectElementActions(elements);
  const bindings = collectElementBindings(elements);

  return {
    success: true,
    requestId: options.requestId,
    data: {
      site: {
        id: site.id,
        slug: site.slug,
        name: site.name,
        locale: 'en',
        status: site.status,
        assetsBaseUrl: '',
        themeTokens: buildThemeTokens(site),
      },
      route: {
        type: 'page',
        path: options.path,
        status: page.status,
        canonical,
        params: {},
      },
      content: {
        schemaVersion: 'backy.content.v1',
        id: page.id,
        kind: 'page',
        title: page.title,
        locale: 'en',
        version: page.updatedAt,
        elements,
      },
      assets: {
        media: mediaPayload.media,
        fonts: (site.theme.fonts.custom || []).map((font) => ({
          id: `font_${font.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
          family: font.name,
          source: 'uploaded',
          url: font.url,
        })),
      },
      interactions: {
        forms: forms.map((form) => ({
          id: form.id,
          endpoint: `/api/sites/${site.id}/forms/${form.id}/submissions`,
          method: 'POST',
          fields: form.fields,
        })),
        comments: [
          {
            id: `thread_${page.id}`,
            targetType: 'page',
            targetId: page.id,
            endpoint: `/api/sites/${site.id}/pages/${page.id}/comments`,
            moderationMode: 'manual',
            count: 0,
          },
        ],
        actions: {
          schemaVersion: 'backy.actions.v1',
          actions,
        },
      },
      seo: {
        title: page.meta.title || page.title,
        description: page.meta.description || page.description || '',
        canonical,
        keywords: toStringArray(page.meta.keywords),
        robots: {
          index: !page.meta.noIndex,
          follow: !page.meta.noFollow,
        },
        openGraph: {
          title: page.meta.title || page.title,
          description: page.meta.description || page.description || '',
          image: page.meta.ogImage || undefined,
        },
        jsonLd: [],
      },
      dataBindings: {
        schemaVersion: 'backy.bindings.v1',
        datasets: [],
        bindings,
      },
      editableMap: buildEditableMap(elements),
    },
  };
}
