import type { SiteSettings } from '@backy-cms/core';

export type PublicLocaleDiscovery = {
  code: string;
  label?: string;
  default: boolean;
  direction: 'ltr' | 'rtl';
  pathPrefix: string;
  domain?: string | null;
};

export type PublicLocalizationDiscovery = {
  defaultLocale: string;
  localeStrategy: 'none' | 'path-prefix' | 'domain';
  locales: PublicLocaleDiscovery[];
};

export type ResolvedLocalizedRoutePath = {
  originalPath: string;
  path: string;
  locale: PublicLocaleDiscovery;
  localeStrategy: PublicLocalizationDiscovery['localeStrategy'];
  matchedBy: 'path-prefix' | 'domain' | 'default';
};

export type PublicRoutePattern = {
  type: string;
  pattern: string;
  resolveUrl: string;
  renderUrl: string;
  [key: string]: unknown;
};

const LOCALE_CODE_PATTERN = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;

const normalizeLocaleCode = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const [language = '', region = ''] = trimmed.replace(/_/g, '-').split('-');
  const normalized = region
    ? `${language.toLowerCase()}-${region.toUpperCase()}`
    : language.toLowerCase();
  return LOCALE_CODE_PATTERN.test(normalized) ? normalized : '';
};

const normalizePathPrefix = (value: unknown, code: string, strategy: PublicLocalizationDiscovery['localeStrategy'], isDefault: boolean): string => {
  if (typeof value === 'string' && value.trim()) {
    const clean = value.trim().replace(/^\/+|\/+$/g, '');
    return clean ? `/${clean}` : '';
  }

  if (strategy === 'path-prefix' && !isDefault) {
    return `/${code.toLowerCase()}`;
  }

  return '';
};

const normalizeDomain = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const host = value.trim().replace(/^https?:\/\//i, '').split('/')[0]?.replace(/\/+$/g, '').toLowerCase();
  return host || null;
};

const normalizeRoutePath = (rawPath: string | null | undefined): string => {
  const pathOnly = (rawPath || '/').split('?')[0].split('#')[0].trim();
  const normalized = pathOnly.replace(/^\/+|\/+$/g, '');
  return normalized ? `/${normalized}` : '/';
};

const normalizeRouteHost = (value: string | null | undefined): string | null => {
  if (!value?.trim()) return null;
  const host = value
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .split(/[/?#]/)[0]
    .split('@')
    .pop()
    ?.split(':')[0]
    .toLowerCase()
    .replace(/^www\./, '');
  return host || null;
};

export const normalizeSiteLocalization = (settings?: Pick<SiteSettings, 'localization'> | null): PublicLocalizationDiscovery => {
  const input = settings?.localization || {};
  const requestedStrategy = input.localeStrategy;
  const rawLocales = Array.isArray(input.locales) ? input.locales : [];
  const normalizedDefault = normalizeLocaleCode(input.defaultLocale);
  const seen = new Set<string>();
  const seededLocales = rawLocales.length > 0
    ? rawLocales
    : [{ code: normalizedDefault || 'en', label: 'English', default: true, direction: 'ltr' as const, pathPrefix: '' }];
  const candidateDefault = normalizedDefault || normalizeLocaleCode(seededLocales.find((locale) => locale.default)?.code) || 'en';
  const strategy: PublicLocalizationDiscovery['localeStrategy'] = requestedStrategy === 'domain'
    ? 'domain'
    : requestedStrategy === 'path-prefix'
      ? 'path-prefix'
      : 'none';

  const locales = seededLocales.reduce<PublicLocaleDiscovery[]>((acc, locale) => {
    const code = normalizeLocaleCode(locale.code);
    if (!code || seen.has(code)) return acc;
    seen.add(code);
    const isDefault = code === candidateDefault || locale.default === true;
    acc.push({
      code,
      label: typeof locale.label === 'string' && locale.label.trim() ? locale.label.trim() : undefined,
      default: isDefault,
      direction: locale.direction === 'rtl' ? 'rtl' : 'ltr',
      pathPrefix: normalizePathPrefix(locale.pathPrefix, code, strategy, isDefault),
      domain: normalizeDomain(locale.domain),
    });
    return acc;
  }, []);

  if (!locales.some((locale) => locale.code === candidateDefault)) {
    locales.unshift({
      code: candidateDefault,
      label: candidateDefault === 'en' ? 'English' : candidateDefault,
      default: true,
      direction: 'ltr',
      pathPrefix: '',
      domain: null,
    });
  }

  const defaultLocale = locales.find((locale) => locale.default)?.code || locales[0]?.code || 'en';
  return {
    defaultLocale,
    localeStrategy: locales.length > 1 ? strategy : 'none',
    locales: locales.map((locale) => ({
      ...locale,
      default: locale.code === defaultLocale,
      pathPrefix: locale.code === defaultLocale && strategy !== 'domain' ? '' : locale.pathPrefix,
    })),
  };
};

export const resolveLocalizedRoutePath = (
  settings: Pick<SiteSettings, 'localization'> | undefined | null,
  rawPath: string,
  options: { host?: string | null } = {},
): ResolvedLocalizedRoutePath => {
  const localization = normalizeSiteLocalization(settings);
  const originalPath = normalizeRoutePath(rawPath);
  const defaultLocale = localization.locales.find((locale) => locale.default) || localization.locales[0] || {
    code: localization.defaultLocale,
    default: true,
    direction: 'ltr' as const,
    pathPrefix: '',
  };
  const normalizedHost = normalizeRouteHost(options.host);

  if (localization.localeStrategy === 'domain' && normalizedHost) {
    const domainLocale = localization.locales.find((locale) => (
      normalizeRouteHost(locale.domain || null) === normalizedHost
    ));
    if (domainLocale) {
      return {
        originalPath,
        path: originalPath,
        locale: domainLocale,
        localeStrategy: localization.localeStrategy,
        matchedBy: 'domain',
      };
    }
  }

  if (localization.localeStrategy === 'path-prefix') {
    const prefixedLocale = localization.locales
      .filter((locale) => locale.pathPrefix)
      .sort((left, right) => right.pathPrefix.length - left.pathPrefix.length)
      .find((locale) => (
        originalPath === locale.pathPrefix || originalPath.startsWith(`${locale.pathPrefix}/`)
      ));

    if (prefixedLocale) {
      const strippedPath = originalPath.slice(prefixedLocale.pathPrefix.length);
      return {
        originalPath,
        path: strippedPath ? normalizeRoutePath(strippedPath) : '/',
        locale: prefixedLocale,
        localeStrategy: localization.localeStrategy,
        matchedBy: 'path-prefix',
      };
    }
  }

  return {
    originalPath,
    path: originalPath,
    locale: defaultLocale,
    localeStrategy: localization.localeStrategy,
    matchedBy: 'default',
  };
};

export const applyLocalePrefixToPath = (
  path: string,
  localized: ResolvedLocalizedRoutePath,
): string => {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path) || path.startsWith('//')) {
    return path;
  }

  const normalizedPath = normalizeRoutePath(path);
  if (localized.matchedBy !== 'path-prefix' || !localized.locale.pathPrefix) {
    return normalizedPath;
  }

  return `${localized.locale.pathPrefix}${normalizedPath === '/' ? '' : normalizedPath}` || '/';
};

const joinRoutePath = (prefix: string, pattern: string) => {
  if (!prefix) return pattern;
  const normalizedPattern = pattern.startsWith('/') ? pattern : `/${pattern}`;
  return `${prefix}${normalizedPattern === '/' ? '' : normalizedPattern}` || '/';
};

const withLocalePath = (url: string, pattern: string) => (
  url.replace(/path=([^&]+)/, `path=${encodeURIComponent(pattern)}`)
);

export const localizedRoutePatternVariants = (
  routePatterns: PublicRoutePattern[],
  localization: PublicLocalizationDiscovery,
) => {
  if (localization.locales.length <= 1 || localization.localeStrategy === 'none') {
    return [];
  }

  return localization.locales.map((locale) => ({
    locale: locale.code,
    default: locale.default,
    pathPrefix: locale.pathPrefix,
    domain: locale.domain || null,
    patterns: routePatterns.map((route) => {
      const pattern = joinRoutePath(locale.pathPrefix, route.pattern);
      return {
        ...route,
        locale: locale.code,
        basePattern: route.pattern,
        pattern,
        resolveUrl: withLocalePath(route.resolveUrl, pattern),
        renderUrl: withLocalePath(route.renderUrl, pattern),
      };
    }),
  }));
};
