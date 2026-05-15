import type { SiteSettings } from '@backy-cms/core';

type FrontendDesignContract = NonNullable<SiteSettings['frontendDesign']>;
type FrontendDesignTemplate = FrontendDesignContract['templates'][number];

type BlogArchiveTemplateContent = {
  elements: unknown[];
  canvasSize: { width: number; height: number };
  customCSS?: string;
  contentDocument?: Record<string, unknown>;
};

export type BlogArchiveTemplatePost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  href: string;
  publishedAt: string | null;
  updatedAt: string;
  featuredImageUrl?: string;
  authorName?: string;
  categoryNames?: string[];
  tagNames?: string[];
};

export type BlogArchiveTemplateData = {
  siteName: string;
  basePath: string;
  title: string;
  description: string;
  activeTitle: string;
  total: number;
  page: number;
  totalPages: number;
  filters: Record<string, string | number>;
  posts: BlogArchiveTemplatePost[];
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const clone = <T>(value: T): T => {
  if (value === undefined || value === null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const normalizedRoute = (value: unknown): string => {
  const route = typeof value === 'string' ? value.trim() : '';
  if (!route) {
    return '';
  }
  const withoutQuery = route.split('?')[0].split('#')[0].trim();
  const normalized = withoutQuery.replace(/^\/+|\/+$/g, '');
  return normalized ? `/${normalized}` : '/';
};

const templateMatchesBlogArchive = (template: FrontendDesignTemplate) => {
  const route = normalizedRoute(template.routePattern);
  const id = template.id.toLowerCase();
  const name = template.name.toLowerCase();

  return (
    template.type === 'page'
    && (
      route === '/blog'
      || route === '/posts'
      || id === 'blog-archive'
      || id === 'blog_archive'
      || name.includes('blog archive')
    )
  );
};

const canvasFromContent = (value: unknown, template?: FrontendDesignTemplate): BlogArchiveTemplateContent | null => {
  const content = isRecord(value) ? value : null;
  if (!content || !Array.isArray(content.elements)) {
    return null;
  }

  const contentDocument = isRecord(content.contentDocument) ? clone(content.contentDocument) : undefined;
  const metadata = isRecord(contentDocument?.metadata)
    ? contentDocument.metadata
    : isRecord(content.metadata)
      ? content.metadata
      : {};
  const rawCanvasSize = isRecord(content.canvasSize)
    ? content.canvasSize
    : isRecord(metadata.canvasSize)
      ? metadata.canvasSize
      : template?.canvasSize;
  const canvasSize = {
    width: Number(rawCanvasSize?.width) || 1200,
    height: Number(rawCanvasSize?.height) || 900,
  };
  const customCSS = typeof content.customCSS === 'string' && content.customCSS.trim().length > 0
    ? content.customCSS
    : typeof content.customCss === 'string' && content.customCss.trim().length > 0
      ? content.customCss
      : typeof metadata.customCSS === 'string' && metadata.customCSS.trim().length > 0
        ? metadata.customCSS
        : undefined;

  return {
    elements: clone(content.elements),
    canvasSize,
    ...(customCSS ? { customCSS } : {}),
    ...(contentDocument ? { contentDocument } : {}),
  };
};

const templateCanvas = (template: FrontendDesignTemplate): BlogArchiveTemplateContent | null => {
  const content = isRecord(template.content) ? template.content : {};
  for (const key of ['blogArchiveTemplate', 'archiveTemplate', 'blogArchive', 'archive', 'listTemplate']) {
    const candidate = canvasFromContent(content[key], template);
    if (candidate) {
      return candidate;
    }
  }

  return canvasFromContent(content, template);
};

const archiveValue = (data: BlogArchiveTemplateData, path: string): unknown => {
  switch (path) {
    case 'archive.title':
    case 'blogArchive.title':
      return data.title;
    case 'archive.description':
    case 'blogArchive.description':
      return data.description;
    case 'archive.activeTitle':
    case 'blogArchive.activeTitle':
      return data.activeTitle;
    case 'archive.total':
    case 'blogArchive.total':
      return data.total;
    case 'archive.page':
    case 'blogArchive.page':
      return data.page;
    case 'archive.totalPages':
    case 'blogArchive.totalPages':
      return data.totalPages;
    case 'archive.basePath':
    case 'blogArchive.basePath':
      return data.basePath;
    case 'site.name':
      return data.siteName;
    default:
      if (path.startsWith('filters.')) {
        return data.filters[path.slice('filters.'.length)] ?? '';
      }
      return undefined;
  }
};

const stringValue = (value: unknown): string => {
  if (value === undefined || value === null) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.map(stringValue).filter(Boolean).join(', ');
  }
  return String(value);
};

const interpolate = (value: string, data: BlogArchiveTemplateData): string => (
  value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, path: string) => stringValue(archiveValue(data, path.trim())))
);

const archiveRecords = (data: BlogArchiveTemplateData) => data.posts.map((post) => ({
  id: post.id,
  slug: post.slug,
  title: post.title,
  name: post.title,
  excerpt: post.excerpt,
  summary: post.excerpt,
  href: post.href,
  publishedAt: post.publishedAt,
  updatedAt: post.updatedAt,
  author: post.authorName || '',
  categories: post.categoryNames || [],
  tags: post.tagNames || [],
  image: post.featuredImageUrl || '',
  cover_image: post.featuredImageUrl || '',
}));

const hydrateProps = (
  rawProps: Record<string, unknown>,
  data: BlogArchiveTemplateData,
  elementType: string,
): Record<string, unknown> => {
  const props = Object.fromEntries(
    Object.entries(rawProps).map(([key, value]) => [
      key,
      typeof value === 'string' ? interpolate(value, data) : clone(value),
    ]),
  );
  const binding = typeof props.binding === 'string' ? props.binding : '';
  const recordsBinding = binding === 'blogArchive.posts' || binding === 'archive.posts' || binding === 'posts';

  if ((elementType === 'repeater' || recordsBinding) && !Array.isArray(props.records)) {
    props.records = archiveRecords(data);
    props.titleField = typeof props.titleField === 'string' ? props.titleField : 'title';
    props.descriptionField = typeof props.descriptionField === 'string' ? props.descriptionField : 'excerpt';
    props.imageField = typeof props.imageField === 'string' ? props.imageField : 'image';
    props.emptyMessage = typeof props.emptyMessage === 'string' ? props.emptyMessage : 'No published posts match the current archive filters.';
  }

  if (binding && binding !== 'blogArchive.posts' && binding !== 'archive.posts' && binding !== 'posts') {
    const value = archiveValue(data, binding);
    if (value !== undefined && !('content' in props)) {
      props.content = value;
    }
  }

  return props;
};

const hydrateElements = (elements: unknown[], data: BlogArchiveTemplateData): unknown[] => (
  elements.map((element) => {
    if (!isRecord(element)) {
      return element;
    }
    const type = typeof element.type === 'string' ? element.type : '';
    const props = isRecord(element.props) ? element.props : {};
    return {
      ...clone(element),
      props: hydrateProps(props, data, type),
      ...(Array.isArray(element.children) ? { children: hydrateElements(element.children, data) } : {}),
    };
  })
);

export function buildBlogArchiveTemplateContent(
  siteSettings: SiteSettings | undefined,
  data: BlogArchiveTemplateData,
): BlogArchiveTemplateContent | null {
  const frontendDesign = siteSettings?.frontendDesign;
  if (!frontendDesign) {
    return null;
  }

  const template = frontendDesign.templates.find(templateMatchesBlogArchive);
  if (!template) {
    return null;
  }

  const canvas = templateCanvas(template);
  if (!canvas) {
    return null;
  }

  return {
    ...canvas,
    customCSS: canvas.customCSS || frontendDesign.tokens.customCss,
    elements: hydrateElements(canvas.elements, data),
  };
}
