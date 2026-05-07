import {
  getCanonicalPathForPage,
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  getMediaList,
  listCollectionRecords,
  listFormsBySite,
  getSiteNavigation,
  type StoreBlogPost,
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

interface DatasetManifest extends JsonObject {
  id: string;
  collectionId: string;
  query?: JsonObject;
  pagination?: JsonObject;
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

const DATA_BINDING_MODES = ['text', 'html', 'image', 'video', 'audio', 'url', 'boolean', 'number', 'json'];
const DATA_BINDING_SOURCE_KINDS = ['collection', 'page', 'post', 'site', 'route', 'query', 'auth', 'static'];

const bindingModeForField = (field: string): string => {
  const normalized = field.toLowerCase();
  if (normalized.includes('image') || normalized.includes('photo') || normalized.includes('avatar')) {
    return 'image';
  }
  if (normalized.includes('video')) {
    return 'video';
  }
  if (normalized.includes('audio')) {
    return 'audio';
  }
  if (normalized.includes('url') || normalized.includes('href') || normalized.includes('link')) {
    return 'url';
  }
  if (normalized.includes('count') || normalized.includes('total') || normalized.includes('rank') || normalized.includes('number')) {
    return 'number';
  }
  return normalized.includes('html') || normalized.includes('rich') ? 'html' : 'text';
};

const normalizeBindingMode = (mode: unknown, field: string): string => (
  typeof mode === 'string' && DATA_BINDING_MODES.includes(mode) ? mode : bindingModeForField(field)
);

const normalizeBindingSource = (value: unknown): JsonObject | null => {
  if (!isRecord(value) || typeof value.kind !== 'string' || !DATA_BINDING_SOURCE_KINDS.includes(value.kind)) {
    return null;
  }

  const source: JsonObject = {
    kind: value.kind,
  };

  if (typeof value.collectionId === 'string') {
    source.collectionId = value.collectionId;
  }
  if (typeof value.field === 'string') {
    source.field = value.field;
  }
  if (typeof value.recordId === 'string') {
    source.recordId = value.recordId;
  }
  if (typeof value.path === 'string') {
    source.path = value.path;
  }

  return source;
};

const normalizeBindingWriteBack = (value: unknown): JsonObject | null => {
  if (!isRecord(value) || typeof value.enabled !== 'boolean') {
    return null;
  }

  const writeBack: JsonObject = {
    enabled: value.enabled,
  };
  if (typeof value.permission === 'string') {
    writeBack.permission = value.permission;
  }
  if (typeof value.endpoint === 'string') {
    writeBack.endpoint = value.endpoint;
  }

  return writeBack;
};

const normalizeBindingPagination = (value: unknown): JsonObject | null => {
  if (!isRecord(value)) {
    return null;
  }

  const pagination: JsonObject = {};
  if (typeof value.limit === 'number' && Number.isInteger(value.limit) && value.limit > 0) {
    pagination.limit = value.limit;
  }
  if (typeof value.cursor === 'string') {
    pagination.cursor = value.cursor;
  }

  return Object.keys(pagination).length > 0 ? pagination : null;
};

const normalizeSchemaBinding = (binding: JsonObject, element: RenderElement, index: number): JsonObject | null => {
  const source = normalizeBindingSource(binding.source);
  if (!source) {
    return null;
  }

  const sourceField = typeof source.field === 'string' && source.field.length > 0 ? source.field : null;
  const targetPath = typeof binding.targetPath === 'string' && binding.targetPath.length > 0 ? binding.targetPath : 'props.content';
  const normalized: JsonObject = {
    id: typeof binding.id === 'string' && binding.id.length > 0
      ? binding.id
      : `binding_${element.id}_${sourceField || index}`,
    elementId: typeof binding.elementId === 'string' && binding.elementId.length > 0 ? binding.elementId : element.id,
    targetPath,
    source,
    mode: normalizeBindingMode(binding.mode, sourceField || targetPath),
  };

  if ('fallback' in binding) {
    normalized.fallback = binding.fallback;
  }
  if (isRecord(binding.format)) {
    normalized.format = binding.format;
  }

  const writeBack = normalizeBindingWriteBack(binding.writeBack);
  if (writeBack) {
    normalized.writeBack = writeBack;
  }

  return normalized;
};

const normalizeCollectionBinding = (binding: JsonObject, element: RenderElement, index: number): JsonObject | null => {
  const source = isRecord(binding.source) ? binding.source : {};
  const collectionId = typeof source.collectionId === 'string' && source.collectionId.length > 0
    ? source.collectionId
    : typeof binding.collectionId === 'string' && binding.collectionId.length > 0
      ? binding.collectionId
      : null;
  const field = typeof source.field === 'string' && source.field.length > 0
    ? source.field
    : typeof binding.field === 'string' && binding.field.length > 0
      ? binding.field
      : null;

  if (!collectionId || !field) {
    return null;
  }

  const normalizedSource: JsonObject = {
    kind: 'collection',
    collectionId,
    field,
  };
  if (typeof source.recordId === 'string' && source.recordId.length > 0) {
    normalizedSource.recordId = source.recordId;
  }
  if (typeof source.path === 'string' && source.path.length > 0) {
    normalizedSource.path = source.path;
  }

  const normalized: JsonObject = {
    id: typeof binding.id === 'string' && binding.id.length > 0
      ? binding.id
      : `binding_${element.id}_${field}_${index}`,
    elementId: typeof binding.elementId === 'string' && binding.elementId.length > 0 ? binding.elementId : element.id,
    targetPath: typeof binding.targetPath === 'string' && binding.targetPath.length > 0 ? binding.targetPath : 'props.content',
    source: normalizedSource,
    mode: normalizeBindingMode(binding.mode, field),
  };

  if ('fallback' in binding) {
    normalized.fallback = binding.fallback;
  }
  if (isRecord(binding.format)) {
    normalized.format = binding.format;
  }

  const writeBack = normalizeBindingWriteBack(binding.writeBack);
  if (writeBack) {
    normalized.writeBack = writeBack;
  }

  return normalized;
};

const normalizeElementForPayload = (element: RenderElement): RenderElement => ({
  ...element,
  children: element.children.map(normalizeElementForPayload),
  dataBindings: element.dataBindings
    ?.map((binding, index) => normalizeCollectionBinding(binding, element, index) || normalizeSchemaBinding(binding, element, index))
    .filter((binding): binding is JsonObject => !!binding) ?? [],
});

const normalizeResolvedCollectionFields = (fields: unknown): JsonObject[] => (
  Array.isArray(fields)
    ? fields.filter(isRecord).map((field) => ({
        key: typeof field.key === 'string' ? field.key : '',
        label: typeof field.label === 'string' ? field.label : typeof field.key === 'string' ? field.key : 'Field',
        type: typeof field.type === 'string' ? field.type : 'text',
        required: field.required === true,
        unique: field.unique === true,
      })).filter((field) => field.key.length > 0)
    : []
);

const normalizeResolvedCollectionRecords = (records: unknown): JsonObject[] => (
  Array.isArray(records)
    ? records.filter(isRecord).map((record) => ({
        id: typeof record.id === 'string' ? record.id : '',
        slug: typeof record.slug === 'string' ? record.slug : '',
        status: typeof record.status === 'string' ? record.status : 'published',
        values: isRecord(record.values) ? record.values : {},
        updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
      })).filter((record) => record.id.length > 0 && record.updatedAt.length > 0)
    : []
);

const hydrateDatasetRecords = (siteId: string, dataset: DatasetManifest): DatasetManifest => {
  const collection = getCollectionByIdOrSlug(siteId, dataset.collectionId);
  if (!collection) {
    return dataset;
  }

  const query = isRecord(dataset.query) ? dataset.query : {};
  const recordId = typeof query.recordId === 'string' && query.recordId.length > 0 ? query.recordId : null;
  const slug = typeof query.slug === 'string' && query.slug.length > 0 ? query.slug : null;
  const limit = isRecord(dataset.pagination) && typeof dataset.pagination.limit === 'number'
    ? dataset.pagination.limit
    : typeof query.limit === 'number'
      ? query.limit
      : 50;
  const records = recordId
    ? [getCollectionRecordByIdOrSlug(siteId, collection.id, recordId)].filter(Boolean)
    : listCollectionRecords(siteId, collection.id, {
        slug: slug || undefined,
        limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 50,
      }).records;

  return {
    ...dataset,
    collectionId: collection.id,
    fields: normalizeResolvedCollectionFields(collection.fields),
    records: normalizeResolvedCollectionRecords(records),
  };
};

const collectDataBindingManifest = (siteId: string, elements: RenderElement[]) => {
  const bindings: JsonObject[] = [];
  const datasets = new Map<string, DatasetManifest>();

  walkElements(elements, (element) => {
    element.dataBindings?.forEach((binding, index) => {
      const source = isRecord(binding.source) ? binding.source : {};
      const collectionId = typeof source.collectionId === 'string' && source.collectionId.length > 0
        ? source.collectionId
        : typeof binding.collectionId === 'string' && binding.collectionId.length > 0
          ? binding.collectionId
          : null;
      const normalizedBinding = normalizeCollectionBinding(binding, element, index);

      if (!collectionId || !normalizedBinding) {
        const schemaBinding = normalizeSchemaBinding(binding, element, index);
        if (schemaBinding) {
          bindings.push(schemaBinding);
        }
        return;
      }

      const datasetId = typeof binding.datasetId === 'string' && binding.datasetId.length > 0
        ? binding.datasetId
        : `dataset_${collectionId}`;
      const query = isRecord(binding.query)
        ? { ...binding.query }
        : isRecord(source.query)
          ? { ...source.query }
          : {};
      const pagination = normalizeBindingPagination(binding.pagination);
      const sourceRecordId = isRecord(normalizedBinding.source) && typeof normalizedBinding.source.recordId === 'string'
        ? normalizedBinding.source.recordId
        : null;

      if (sourceRecordId && !('recordId' in query)) {
        query.recordId = sourceRecordId;
      }

      datasets.set(datasetId, {
        id: datasetId,
        collectionId,
        ...(Object.keys(query).length > 0 ? { query } : {}),
        ...(pagination ? { pagination } : {}),
      });
      bindings.push(normalizedBinding);
    });
  });

  return {
    schemaVersion: 'backy.bindings.v1',
    datasets: [...datasets.values()].map((dataset) => hydrateDatasetRecords(siteId, dataset)),
    bindings,
  };
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

    element.dataBindings?.forEach((binding, index) => {
      const normalizedBinding = normalizeCollectionBinding(binding, element, index);
      const source = isRecord(normalizedBinding?.source) ? normalizedBinding.source : null;
      const field = typeof source?.field === 'string' ? source.field : null;

      if (!normalizedBinding || !source || !field) {
        return;
      }

      editableMap[`collection.${source.collectionId}.${element.id}.${field}`] = {
        elementId: element.id,
        field: normalizedBinding.targetPath,
        editable: true,
        label: `${element.type} ${field}`,
        valueType: normalizedBinding.mode === 'image' ? 'image' : normalizedBinding.mode === 'html' ? 'richText' : 'string',
        scope: 'collectionRecord',
        collectionId: source.collectionId,
        recordId: source.recordId,
        sourceField: field,
      };
    });
  });

  return editableMap;
};

const buildFontAssets = (site: StoreSite) => (
  (site.theme.fonts.custom || []).map((font) => ({
    id: `font_${font.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    family: font.name,
    source: 'uploaded',
    url: font.url,
  }))
);

const normalizePostElements = (post: StoreBlogPost): RenderElement[] => {
  const content = post.content;
  const rawElements = Array.isArray(content.elements) ? content.elements : [];
  const elements = rawElements
    .map(normalizeElement)
    .filter((element): element is RenderElement => !!element);

  if (elements.length) {
    return elements;
  }

  const html = typeof content.html === 'string' ? content.html : '';
  const legacyElement: RenderElement = {
    id: `${post.id}_legacy_content`,
    type: html ? 'html' : 'text',
    children: [],
    props: html
      ? { html }
      : {
          content: post.excerpt || post.title,
          fontSize: 18,
          lineHeight: 1.7,
          color: '#334155',
        },
    styles: {},
    actions: [],
    dataBindings: [],
  };

  return [legacyElement];
};

export function buildPublicRenderPayload(site: StoreSite, page: StorePage, options: RenderPayloadOptions) {
  const elements = page.content.elements
    .map(normalizeElement)
    .filter((element): element is RenderElement => !!element);
  const payloadElements = elements.map(normalizeElementForPayload);
  const mediaPayload = getMediaList(site.id, {
    pageId: page.id,
    visibility: 'public',
    limit: 100,
  });
  const forms = listFormsBySite(site.id, { pageId: page.id });
  const canonical = page.isHomepage ? '/' : page.meta.canonical || getCanonicalPathForPage(page);
  const actions = collectElementActions(elements);
  const dataBindings = collectDataBindingManifest(site.id, elements);
  const navigation = getSiteNavigation(site.id);

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
      navigation,
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
        elements: payloadElements,
      },
      assets: {
        media: mediaPayload.media,
        fonts: buildFontAssets(site),
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
        ...dataBindings,
      },
      editableMap: buildEditableMap(elements),
    },
  };
}

export function buildPublicBlogPostRenderPayload(
  site: StoreSite,
  post: StoreBlogPost,
  options: RenderPayloadOptions,
) {
  const elements = normalizePostElements(post);
  const payloadElements = elements.map(normalizeElementForPayload);
  const mediaPayload = getMediaList(site.id, {
    postId: post.id,
    visibility: 'public',
    limit: 100,
  });
  const forms = listFormsBySite(site.id, { postId: post.id });
  const canonical = post.meta?.canonical || `/blog/${post.slug}`;
  const actions = collectElementActions(elements);
  const dataBindings = collectDataBindingManifest(site.id, elements);
  const navigation = getSiteNavigation(site.id);

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
      navigation,
      route: {
        type: 'post',
        path: options.path,
        status: post.status,
        canonical,
        params: {
          slug: post.slug,
        },
      },
      content: {
        schemaVersion: 'backy.content.v1',
        id: post.id,
        kind: 'post',
        title: post.title,
        locale: 'en',
        version: post.updatedAt,
        elements: payloadElements,
      },
      assets: {
        media: mediaPayload.media,
        fonts: buildFontAssets(site),
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
            id: `thread_${post.id}`,
            targetType: 'post',
            targetId: post.id,
            endpoint: `/api/sites/${site.id}/blog/${post.id}/comments`,
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
        title: post.meta?.title || post.title,
        description: post.meta?.description || post.excerpt || '',
        canonical,
        keywords: toStringArray(post.meta?.keywords),
        robots: {
          index: !post.meta?.noIndex,
          follow: !post.meta?.noFollow,
        },
        openGraph: {
          title: post.meta?.title || post.title,
          description: post.meta?.description || post.excerpt || '',
          image: post.meta?.ogImage || undefined,
        },
        jsonLd: [],
      },
      dataBindings: {
        ...dataBindings,
      },
      editableMap: buildEditableMap(elements),
    },
  };
}
