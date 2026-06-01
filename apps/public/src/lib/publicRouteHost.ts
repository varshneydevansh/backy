import type { SiteSettings } from '@backy-cms/core';
import { normalizeSiteLocalization } from './siteLocalization';

type PublicRouteHostSite = {
  customDomain?: string | null;
  settings?: Pick<SiteSettings, 'domainVerification' | 'domainAliases' | 'localization'> | null;
};

type PublicRouteHostMatchOptions = {
  allowUnverifiedCustomHosts?: boolean;
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

export const publicRouteHostAliasesForSite = (
  settings: Pick<SiteSettings, 'domainAliases'> | null | undefined,
) => (
  (Array.isArray(settings?.domainAliases) ? settings.domainAliases : [])
    .map((alias) => {
      const host = normalizePublicRouteHost(alias?.host);
      if (!host) return null;

      return {
        ...alias,
        host,
        status: alias?.status || 'pending',
      };
    })
    .filter((alias): alias is NonNullable<typeof alias> => Boolean(alias))
);

export const publicRouteHostIsVerifiedForSite = (
  site: PublicRouteHostSite,
  host: string | null | undefined,
): boolean => {
  const normalizedHost = normalizePublicRouteHost(host);
  if (!normalizedHost) return false;

  const verification = site.settings?.domainVerification;
  return Boolean(
    (
      verification?.status === 'verified'
      && hostsEqual(verification.domain, normalizedHost)
    )
    || publicRouteHostAliasesForSite(site.settings).some((alias) => (
      alias.status === 'verified' && hostsEqual(alias.host, normalizedHost)
    )),
  );
};

export const publicRouteHostMatchesSite = (
  site: PublicRouteHostSite,
  host: string | null | undefined,
  options: PublicRouteHostMatchOptions = {},
): boolean => {
  const normalizedHost = normalizePublicRouteHost(host);
  if (!normalizedHost) return false;
  const allowsUnverified = options.allowUnverifiedCustomHosts === true;
  const verified = allowsUnverified || publicRouteHostIsVerifiedForSite(site, normalizedHost);
  const domainAlias = publicRouteHostAliasesForSite(site.settings).find((alias) =>
    hostsEqual(alias.host, normalizedHost),
  );

  if (domainAlias) {
    return allowsUnverified || domainAlias.status === 'verified';
  }

  if (
    hostsEqual(site.customDomain, normalizedHost)
    || hostsEqual(site.settings?.domainVerification?.domain, normalizedHost)
  ) {
    return verified;
  }

  return normalizeSiteLocalization(site.settings).locales.some((locale) => (
    hostsEqual(locale.domain, normalizedHost) && verified
  ));
};
