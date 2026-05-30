import type { Site } from '@/stores/mockStore';

export type SiteSwitchSettingsTab =
  | 'general'
  | 'appearance'
  | 'seo'
  | 'delivery'
  | 'infrastructure'
  | 'commerce'
  | 'notifications'
  | 'security';

export type SiteSwitchTarget =
  | { type: 'dashboard'; siteId: string }
  | { type: 'siteDetail'; siteId: string }
  | { type: 'sites'; siteId: string }
  | { type: 'pages'; siteId: string }
  | { type: 'pagesNew'; siteId: string }
  | { type: 'blog'; siteId: string }
  | { type: 'blogNew'; siteId: string }
  | { type: 'media'; siteId: string }
  | { type: 'collections'; siteId: string }
  | { type: 'reusableSections'; siteId: string }
  | { type: 'products'; siteId: string }
  | { type: 'orders'; siteId: string }
  | { type: 'forms'; siteId: string }
  | { type: 'newsletter'; siteId: string }
  | { type: 'contacts'; siteId: string }
  | { type: 'comments'; siteId: string }
  | { type: 'teams'; siteId: string }
  | { type: 'users'; siteId: string }
  | { type: 'help'; siteId: string }
  | { type: 'settings'; siteId: string; tab?: SiteSwitchSettingsTab };

const SITE_SWITCH_SETTINGS_TABS = new Set<SiteSwitchSettingsTab>([
  'general',
  'appearance',
  'seo',
  'delivery',
  'infrastructure',
  'commerce',
  'notifications',
  'security',
]);

export const getSiteSearchParam = (): string => {
  if (typeof window === 'undefined') {
    return '';
  }

  return new URLSearchParams(window.location.search).get('siteId')?.trim() || '';
};

export const siteMatchesIdentifier = (site: Site, identifier: string): boolean => (
  site.publicSiteId === identifier || site.id === identifier || site.slug === identifier
);

export const getSiteSelectionFromSearch = (sites: Site[], fallbackSiteId = 'site-demo'): string => {
  const requestedSiteId = getSiteSearchParam();
  const matchedSite = requestedSiteId
    ? sites.find((site) => siteMatchesIdentifier(site, requestedSiteId))
    : undefined;

  return matchedSite?.publicSiteId || matchedSite?.id || requestedSiteId || sites[0]?.publicSiteId || sites[0]?.id || fallbackSiteId;
};

export const getSiteRouteSearch = (site: Site | null | undefined): { siteId: string } | undefined => {
  const siteId = site?.publicSiteId || site?.id;
  return siteId ? { siteId } : undefined;
};

export const isSiteSwitchSettingsTab = (value: unknown): value is SiteSwitchSettingsTab => (
  typeof value === 'string' && SITE_SWITCH_SETTINGS_TABS.has(value as SiteSwitchSettingsTab)
);

export const getSiteSwitchTarget = ({
  pathname,
  search,
  requestedSiteId,
  sites,
}: {
  pathname: string;
  search?: Record<string, unknown>;
  requestedSiteId: string;
  sites: Site[];
}): SiteSwitchTarget => {
  const nextSite = sites.find((site) => siteMatchesIdentifier(site, requestedSiteId));
  const siteId = nextSite?.publicSiteId || nextSite?.id || requestedSiteId;

  if (pathname.startsWith('/sites/') && pathname !== '/sites/new' && nextSite?.id) {
    return { type: 'siteDetail', siteId: nextSite.id };
  }

  if (pathname.startsWith('/sites')) return { type: 'sites', siteId };
  if (pathname.startsWith('/pages/new')) return { type: 'pagesNew', siteId };
  if (pathname.startsWith('/pages')) return { type: 'pages', siteId };
  if (pathname.startsWith('/blog/new')) return { type: 'blogNew', siteId };
  if (pathname.startsWith('/blog')) return { type: 'blog', siteId };
  if (pathname.startsWith('/media')) return { type: 'media', siteId };
  if (pathname.startsWith('/collections')) return { type: 'collections', siteId };
  if (pathname.startsWith('/reusable-sections')) return { type: 'reusableSections', siteId };
  if (pathname.startsWith('/products')) return { type: 'products', siteId };
  if (pathname.startsWith('/orders')) return { type: 'orders', siteId };
  if (pathname.startsWith('/forms')) return { type: 'forms', siteId };
  if (pathname.startsWith('/newsletter')) return { type: 'newsletter', siteId };
  if (pathname.startsWith('/contacts')) return { type: 'contacts', siteId };
  if (pathname.startsWith('/comments')) return { type: 'comments', siteId };
  if (pathname.startsWith('/teams')) return { type: 'teams', siteId };
  if (pathname.startsWith('/users')) return { type: 'users', siteId };
  if (pathname.startsWith('/help')) return { type: 'help', siteId };

  if (pathname.startsWith('/settings')) {
    const tab = isSiteSwitchSettingsTab(search?.tab) ? search.tab : undefined;
    return { type: 'settings', siteId, ...(tab ? { tab } : {}) };
  }

  return { type: 'dashboard', siteId };
};
