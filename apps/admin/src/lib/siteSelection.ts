import type { Site } from '@/stores/mockStore';

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
