import type { BackyRepositories, Site } from '@backy-cms/core';
import { createPublicCacheRevision } from './publicContractResponse';
import { applySeoDefaults, applySeoRouteOverrides, type SeoRoute } from './seoDiscovery';
import { getHostedRouteUrl, getSiteCanonicalBaseUrl } from './canonicalRouteUrl';
import { resolveRedirectRoute } from './redirectRules';

export class PublicDiscoveryIncompleteError extends Error {
  constructor() { super('The complete public discovery response could not be verified. Retry after content changes finish.'); }
}
export class PublicDiscoveryWithdrawnError extends Error {}
export type PublicDiscoverySite = Pick<Site, 'slug' | 'name'> & Partial<Pick<Site, 'description' | 'customDomain' | 'settings'>>;

export const isDiscoveryReadable = (item: { status: string; scheduledAt?: string | null }, now = Date.now()) => (
  item.status === 'published' || item.status === 'scheduled'
    && typeof item.scheduledAt === 'string' && Number.isFinite(Date.parse(item.scheduledAt))
    && Date.parse(item.scheduledAt) <= now
);

/** Optimistic site/revision admission, not a database transaction or provider certification. */
export async function withPublicDiscoveryRead<T>(
  repositories: Pick<BackyRepositories, 'sites' | 'cacheInvalidations'>,
  initialSite: Site,
  read: (site: Site) => Promise<T>,
) {
  if (typeof repositories.cacheInvalidations?.latestRevision !== 'function') throw new PublicDiscoveryIncompleteError();
  const before = await repositories.cacheInvalidations.latestRevision({ siteId: initialSite.id });
  const site = await repositories.sites.getById(initialSite.id);
  if (!site?.isPublished) throw new PublicDiscoveryWithdrawnError();
  if (site.id !== initialSite.id) throw new PublicDiscoveryIncompleteError();
  const fingerprint = createPublicCacheRevision(site);
  const value = await read(site);
  const finalSite = await repositories.sites.getById(site.id);
  const after = await repositories.cacheInvalidations.latestRevision({ siteId: site.id });
  if (!finalSite?.isPublished) throw new PublicDiscoveryWithdrawnError();
  if (before !== after || fingerprint !== createPublicCacheRevision(finalSite)) throw new PublicDiscoveryIncompleteError();
  return { site: finalSite, value, revision: after };
}

/** Natural resources and effective canonicals must both survive managed redirect/gone rules. */
export function admitPublicDiscoveryRoutes(routes: SeoRoute[], site: PublicDiscoverySite, origin: string): SeoRoute[] {
  const base = new URL(getSiteCanonicalBaseUrl(origin, site));
  const result: SeoRoute[] = [];
  for (const route of routes) {
    if (resolveRedirectRoute(site.settings, route.path)) continue;
    const naturalPath = route.path;
    const projected = applySeoDefaults(applySeoRouteOverrides([route], site)[0], site);
    let canonicalUrl: string;
    try {
      getHostedRouteUrl(origin, site.slug, naturalPath, site.customDomain);
      canonicalUrl = getHostedRouteUrl(origin, site.slug, projected.canonical, site.customDomain);
    } catch { throw new PublicDiscoveryIncompleteError(); }
    const pathname = new URL(canonicalUrl).pathname;
    const localPath = !site.customDomain && base.pathname !== '/'
      ? pathname.slice(base.pathname.length) || '/' : pathname;
    if (resolveRedirectRoute(site.settings, localPath)) continue;
    result.push({ ...projected, path: naturalPath, canonicalUrl, robots: {
      index: projected.robots.index && site.settings?.seo?.robots?.index !== false,
      follow: projected.robots.follow && site.settings?.seo?.robots?.follow !== false,
    } });
  }
  return result;
}
