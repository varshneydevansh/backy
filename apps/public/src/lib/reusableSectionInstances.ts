type JsonRecord = Record<string, unknown>;

export type ReusableSectionSource = {
  id: string;
  slug: string;
  name: string;
  updatedAt: string;
  content: unknown;
};

export type ReusableSectionInstance = {
  elementId: string;
  elementType: string;
  path: string;
  mode: string;
  sourceUpdatedAt?: string;
  stale: boolean;
};

export type ReusableSectionContentRefresh = {
  content: unknown;
  refreshed: number;
};

const isRecord = (value: unknown): value is JsonRecord => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const sanitizeIdPart = (value: unknown, fallback: string): string => {
  const normalized = typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
    : '';
  return normalized || fallback;
};

const contentElements = (content: unknown): JsonRecord[] => {
  if (!isRecord(content)) return [];
  if (Array.isArray(content.elements)) {
    return content.elements.filter(isRecord);
  }
  const contentDocument = isRecord(content.contentDocument) ? content.contentDocument : null;
  return Array.isArray(contentDocument?.elements)
    ? contentDocument.elements.filter(isRecord)
    : [];
};

const sourceRootElement = (section: ReusableSectionSource): JsonRecord | null => (
  contentElements(section.content)[0] || null
);

const reusableSectionMeta = (element: JsonRecord): JsonRecord | null => {
  const props = isRecord(element.props) ? element.props : {};
  const meta = props.reusableSection;
  return isRecord(meta) ? meta : null;
};

const isSyncedInstanceForSection = (element: JsonRecord, section: ReusableSectionSource): boolean => {
  const meta = reusableSectionMeta(element);
  if (!meta || meta.mode === 'detached') return false;
  return meta.sectionId === section.id || meta.sectionId === section.slug || meta.slug === section.slug;
};

const withUpdatedContentElements = (content: unknown, elements: JsonRecord[]): unknown => {
  if (!isRecord(content)) return content;
  const nextContent: JsonRecord = {
    ...content,
    elements,
  };

  if (isRecord(content.contentDocument)) {
    nextContent.contentDocument = {
      ...content.contentDocument,
      elements,
      version: new Date().toISOString(),
    };
  }

  return nextContent;
};

const cloneSourceNode = (
  node: JsonRecord,
  target: JsonRecord,
  section: ReusableSectionSource,
  input: {
    isRoot: boolean;
    parentId?: string | null;
    path: string;
  },
): JsonRecord => {
  const source = cloneJson(node);
  const nextId = input.isRoot
    ? String(target.id || source.id || `section-${section.id}`)
    : `${String(target.id || section.id)}-${sanitizeIdPart(source.id, 'child')}-${input.path}`;
  const sourceProps = isRecord(source.props) ? source.props : {};
  const nextProps: JsonRecord = input.isRoot
    ? {
        ...sourceProps,
        reusableSection: {
          mode: 'synced',
          sectionId: section.id,
          slug: section.slug,
          name: section.name,
          sourceUpdatedAt: section.updatedAt,
        },
      }
    : sourceProps;

  const children = Array.isArray(source.children) ? source.children.filter(isRecord) : [];
  const nextNode: JsonRecord = {
    ...source,
    id: nextId,
    props: nextProps,
    children: children.map((child, index) => cloneSourceNode(child, target, section, {
      isRoot: false,
      parentId: nextId,
      path: `${input.path}-${index}`,
    })),
  };

  if (input.isRoot) {
    nextNode.x = target.x;
    nextNode.y = target.y;
    nextNode.zIndex = target.zIndex;
    if (target.parentId !== undefined) {
      nextNode.parentId = target.parentId;
    } else {
      delete nextNode.parentId;
    }
  } else if (input.parentId) {
    nextNode.parentId = input.parentId;
  }

  return nextNode;
};

const refreshElements = (
  elements: JsonRecord[],
  section: ReusableSectionSource,
  input: {
    pathPrefix?: string;
    sourceRoot: JsonRecord;
  },
): {
  elements: JsonRecord[];
  refreshed: number;
} => {
  let refreshed = 0;
  const nextElements = elements.map((element, index) => {
    const path = input.pathPrefix ? `${input.pathPrefix}.children.${index}` : `${index}`;
    if (isSyncedInstanceForSection(element, section)) {
      refreshed += 1;
      return cloneSourceNode(input.sourceRoot, element, section, {
        isRoot: true,
        path,
      });
    }

    if (Array.isArray(element.children)) {
      const result = refreshElements(element.children.filter(isRecord), section, {
        ...input,
        pathPrefix: path,
      });
      refreshed += result.refreshed;
      if (result.refreshed > 0) {
        return {
          ...element,
          children: result.elements,
        };
      }
    }

    return element;
  });

  return { elements: nextElements, refreshed };
};

export const refreshReusableSectionInstancesInContent = (
  content: unknown,
  section: ReusableSectionSource,
): ReusableSectionContentRefresh => {
  const sourceRoot = sourceRootElement(section);
  const elements = contentElements(content);
  if (!sourceRoot || elements.length === 0) {
    return { content, refreshed: 0 };
  }

  const result = refreshElements(elements, section, { sourceRoot });
  return {
    content: result.refreshed > 0 ? withUpdatedContentElements(content, result.elements) : content,
    refreshed: result.refreshed,
  };
};

const collectInstances = (
  elements: JsonRecord[],
  section: ReusableSectionSource,
  pathPrefix = '',
): ReusableSectionInstance[] => (
  elements.flatMap((element, index) => {
    const path = pathPrefix ? `${pathPrefix}.children.${index}` : `${index}`;
    const meta = reusableSectionMeta(element);
    const current: ReusableSectionInstance[] = isSyncedInstanceForSection(element, section)
      ? [{
          elementId: String(element.id || ''),
          elementType: String(element.type || 'unknown'),
          path,
          mode: String(meta?.mode || 'synced'),
          sourceUpdatedAt: typeof meta?.sourceUpdatedAt === 'string' ? meta.sourceUpdatedAt : undefined,
          stale: typeof meta?.sourceUpdatedAt === 'string' ? meta.sourceUpdatedAt !== section.updatedAt : true,
        }]
      : [];
    const childInstances = Array.isArray(element.children)
      ? collectInstances(element.children.filter(isRecord), section, path)
      : [];
    return [...current, ...childInstances];
  })
);

export const listReusableSectionInstancesInContent = (
  content: unknown,
  section: ReusableSectionSource,
): ReusableSectionInstance[] => collectInstances(contentElements(content), section);
