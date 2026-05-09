import type { SiteNavigationLayoutConfig, SiteSettings } from '@backy-cms/core';

export type SiteNavigationConfig = SiteSettings['navigation'];
export type SiteNavigationConfigItem = SiteSettings['navigation']['primary'][number];

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

export interface PublicSiteNavigation {
  primary: PublicNavigationItem[];
  footer: PublicNavigationItem[];
  layout: SiteNavigationLayoutConfig;
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

const HEADER_VARIANTS = new Set(['minimal', 'centered', 'split', 'commerce']);
const HEADER_POSITIONS = new Set(['static', 'sticky', 'transparent']);
const HEADER_WIDTHS = new Set(['contained', 'full']);
const FOOTER_VARIANTS = new Set(['simple', 'columns', 'mega']);

const DEFAULT_NAVIGATION_LAYOUT: SiteNavigationLayoutConfig = {
  header: {
    variant: 'minimal',
    position: 'sticky',
    width: 'contained',
    showBrand: true,
    showSearch: false,
    showAccount: false,
    showCart: false,
  },
  footer: {
    variant: 'columns',
    width: 'contained',
    showSocial: true,
    showNewsletter: false,
  },
};

const enumValue = <T extends string>(value: unknown, allowed: Set<string>, fallback: T): T => (
  typeof value === 'string' && allowed.has(value) ? value as T : fallback
);

const booleanValue = (value: unknown, fallback: boolean): boolean => (
  typeof value === 'boolean' ? value : fallback
);

export function normalizeNavigationLayout(input: unknown, current: SiteNavigationLayoutConfig = DEFAULT_NAVIGATION_LAYOUT): SiteNavigationLayoutConfig {
  const source = isRecord(input) ? input : {};
  const sourceHeader = isRecord(source.header) ? source.header : {};
  const sourceFooter = isRecord(source.footer) ? source.footer : {};
  const currentHeader = current.header || DEFAULT_NAVIGATION_LAYOUT.header || {};
  const currentFooter = current.footer || DEFAULT_NAVIGATION_LAYOUT.footer || {};

  return {
    header: {
      variant: enumValue(sourceHeader.variant, HEADER_VARIANTS, currentHeader.variant || 'minimal'),
      position: enumValue(sourceHeader.position, HEADER_POSITIONS, currentHeader.position || 'sticky'),
      width: enumValue(sourceHeader.width, HEADER_WIDTHS, currentHeader.width || 'contained'),
      showBrand: booleanValue(sourceHeader.showBrand, currentHeader.showBrand !== false),
      showSearch: booleanValue(sourceHeader.showSearch, Boolean(currentHeader.showSearch)),
      showAccount: booleanValue(sourceHeader.showAccount, Boolean(currentHeader.showAccount)),
      showCart: booleanValue(sourceHeader.showCart, Boolean(currentHeader.showCart)),
      ctaLabel: toText(sourceHeader.ctaLabel) || currentHeader.ctaLabel,
      ctaHref: toText(sourceHeader.ctaHref) || currentHeader.ctaHref,
    },
    footer: {
      variant: enumValue(sourceFooter.variant, FOOTER_VARIANTS, currentFooter.variant || 'columns'),
      width: enumValue(sourceFooter.width, HEADER_WIDTHS, currentFooter.width || 'contained'),
      showSocial: booleanValue(sourceFooter.showSocial, currentFooter.showSocial !== false),
      showNewsletter: booleanValue(sourceFooter.showNewsletter, Boolean(currentFooter.showNewsletter)),
      note: toText(sourceFooter.note) || currentFooter.note,
    },
  };
}

export function normalizeNavigationConfig(
  input: unknown,
  current: SiteNavigationConfig = { primary: [], footer: [] },
): SiteNavigationConfig {
  if (!isRecord(input)) {
    return current;
  }

  const normalizeItems = (value: unknown): SiteNavigationConfigItem[] => (
    Array.isArray(value)
      ? value.filter(isRecord).map((item, index) => {
          const type: SiteNavigationConfigItem['type'] = item.type === 'page' || item.type === 'url' || item.type === 'route'
            ? item.type
            : 'route';
          const target: SiteNavigationConfigItem['target'] = item.target === '_blank' ? '_blank' : '_self';
          const children = normalizeItems(item.children);

          return {
            id: toText(item.id) || `nav_${type}_${index}`,
            type,
            label: toText(item.label) || '',
            pageId: toText(item.pageId),
            path: type === 'route' ? normalizePath(item.path || item.href) : toText(item.path),
            href: type === 'url' ? toText(item.href) : toText(item.href || item.path),
            target,
            visible: typeof item.visible === 'boolean' ? item.visible : undefined,
            children,
          };
        }).filter((item) => item.type === 'page' || item.label.length > 0)
      : []
  );

  return {
    primary: input.primary === undefined ? current.primary : normalizeItems(input.primary),
    footer: input.footer === undefined ? current.footer || [] : normalizeItems(input.footer),
    layout: input.layout === undefined
      ? normalizeNavigationLayout(current.layout)
      : normalizeNavigationLayout(input.layout, current.layout),
  };
}

export function buildSiteNavigation(
  settings: Pick<SiteSettings, 'navigation'> | undefined | null,
  pages: NavigationPage[],
): PublicSiteNavigation {
  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const configuredPrimary = normalizeConfiguredMenu(settings?.navigation?.primary, pagesById);
  const configuredFooter = normalizeConfiguredMenu(settings?.navigation?.footer, pagesById);

  return {
    primary: configuredPrimary.length > 0 ? configuredPrimary : fallbackNavigationFromPages(pages),
    footer: configuredFooter,
    layout: normalizeNavigationLayout(settings?.navigation?.layout),
  };
}
