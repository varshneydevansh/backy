import type { SiteSettings } from '@backy-cms/core';

type NavigationPage = {
  id: string;
  title: string;
  slug: string;
  status: string;
  isHomepage: boolean;
  scheduledAt?: string | null;
  meta?: {
    canonical?: string | null;
  };
};

export interface PublicNavigationItem {
  id: string;
  type: 'page' | 'route' | 'url';
  label: string;
  title?: string;
  pageId?: string;
  slug?: string;
  path?: string;
  href?: string;
  target?: '_self' | '_blank';
  status?: string;
  isHomepage?: boolean;
  children: PublicNavigationItem[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const toText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizePath = (value: unknown): string | undefined => {
  const text = toText(value);
  if (!text) {
    return undefined;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) {
    return text;
  }

  const normalized = text.replace(/^\/+|\/+$/g, '');
  return normalized ? `/${normalized}` : '/';
};

const isPubliclyReadable = (page: NavigationPage) => (
  page.status === 'published' && (!page.scheduledAt || new Date(page.scheduledAt).getTime() <= Date.now())
);

const canonicalPathForPage = (page: NavigationPage) => {
  if (page.isHomepage || page.slug === 'index') {
    return '/';
  }

  return typeof page.meta?.canonical === 'string' && page.meta.canonical.length > 0
    ? page.meta.canonical
    : `/${page.slug}`;
};

const fallbackNavigationFromPages = (pages: NavigationPage[]): PublicNavigationItem[] => (
  pages
    .filter(isPubliclyReadable)
    .map((page) => ({
      id: `nav_${page.id}`,
      type: 'page' as const,
      pageId: page.id,
      label: page.title,
      title: page.title,
      slug: page.slug,
      path: canonicalPathForPage(page),
      status: page.status,
      isHomepage: page.isHomepage,
      children: [],
    }))
    .sort((left, right) => {
      if (left.isHomepage !== right.isHomepage) {
        return left.isHomepage ? -1 : 1;
      }

      return left.label.localeCompare(right.label) || (left.path || '').localeCompare(right.path || '');
    })
);

function normalizeConfiguredItem(
  raw: unknown,
  pagesById: Map<string, NavigationPage>,
  depth: number,
  index: number,
): PublicNavigationItem | null {
  if (!isRecord(raw) || depth > 4 || raw.visible === false) {
    return null;
  }

  const type = raw.type === 'url' || raw.type === 'route' || raw.type === 'page' ? raw.type : 'route';
  const children = Array.isArray(raw.children)
    ? raw.children
        .map((child, childIndex) => normalizeConfiguredItem(child, pagesById, depth + 1, childIndex))
        .filter((item): item is PublicNavigationItem => !!item)
    : [];

  if (type === 'page') {
    const pageId = toText(raw.pageId);
    const page = pageId ? pagesById.get(pageId) : undefined;
    if (!page || !isPubliclyReadable(page)) {
      return null;
    }

    return {
      id: toText(raw.id) || `nav_${page.id}`,
      type: 'page',
      pageId: page.id,
      label: toText(raw.label) || page.title,
      title: page.title,
      slug: page.slug,
      path: canonicalPathForPage(page),
      target: raw.target === '_blank' ? '_blank' : '_self',
      status: page.status,
      isHomepage: page.isHomepage,
      children,
    };
  }

  if (type === 'url') {
    const href = toText(raw.href);
    const label = toText(raw.label);
    if (!href || !label) {
      return null;
    }

    return {
      id: toText(raw.id) || `nav_url_${index}`,
      type: 'url',
      label,
      href,
      target: raw.target === '_blank' ? '_blank' : '_self',
      children,
    };
  }

  const path = normalizePath(raw.path || raw.href);
  const label = toText(raw.label);
  if (!path || !label) {
    return null;
  }

  return {
    id: toText(raw.id) || `nav_route_${index}`,
    type: 'route',
    label,
    path,
    href: path,
    target: raw.target === '_blank' ? '_blank' : '_self',
    children,
  };
}

const normalizeConfiguredMenu = (
  items: unknown,
  pagesById: Map<string, NavigationPage>,
): PublicNavigationItem[] => (
  Array.isArray(items)
    ? items
        .map((item, index) => normalizeConfiguredItem(item, pagesById, 0, index))
        .filter((item): item is PublicNavigationItem => !!item)
    : []
);

export function buildSiteNavigation(
  settings: Pick<SiteSettings, 'navigation'> | undefined | null,
  pages: NavigationPage[],
): { primary: PublicNavigationItem[]; footer: PublicNavigationItem[] } {
  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const configuredPrimary = normalizeConfiguredMenu(settings?.navigation?.primary, pagesById);
  const configuredFooter = normalizeConfiguredMenu(settings?.navigation?.footer, pagesById);

  return {
    primary: configuredPrimary.length > 0 ? configuredPrimary : fallbackNavigationFromPages(pages),
    footer: configuredFooter,
  };
}
