import type { SiteSettings } from '@backy-cms/core';
import { normalizeSiteLocalization } from './siteLocalization';

type PublicRouteHostSite = {
  customDomain?: string | null;
  settings?: Pick<SiteSettings, 'domainVerification' | 'localization'> | null;
};

export const normalizePublicRouteHost = (value: string | null | undefined): string | null => {
  if (!value?.trim()) return null;
  const host = value
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .split(/[/?#]/)[0]
    .split('@')
    .pop()
    ?.split(':')[0]
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/\.$/, '');
  return host || null;
};

const hostsEqual = (left: string | null | undefined, right: string | null | undefined) => {
  const normalizedLeft = normalizePublicRouteHost(left);
  const normalizedRight = normalizePublicRouteHost(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
};

export const publicRouteHostMatchesSite = (
  site: PublicRouteHostSite,
  host: string | null | undefined,
): boolean => {
  const normalizedHost = normalizePublicRouteHost(host);
  if (!normalizedHost) return false;

  if (
    hostsEqual(site.customDomain, normalizedHost)
    || hostsEqual(site.settings?.domainVerification?.domain, normalizedHost)
  ) {
    return true;
  }

  return normalizeSiteLocalization(site.settings).locales.some((locale) => (
    hostsEqual(locale.domain, normalizedHost)
  ));
};
