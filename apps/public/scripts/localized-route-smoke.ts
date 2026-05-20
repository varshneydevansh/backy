import assert from 'node:assert/strict';
import type { SiteSettings } from '@backy-cms/core';
import {
  applyLocalePrefixToPath,
  resolveLocalizedRoutePath,
} from '../src/lib/siteLocalization';
import {
  normalizePublicRouteHost,
  publicRouteHostMatchesSite,
} from '../src/lib/publicRouteHost';
import {
  withLocalizedResolvedRoute,
  type ResolvedSiteRoute,
} from '../src/lib/routeResolver';

const pathPrefixSettings: Pick<SiteSettings, 'localization'> = {
  localization: {
    defaultLocale: 'en',
    localeStrategy: 'path-prefix',
    locales: [
      { code: 'en', label: 'English', default: true, direction: 'ltr', pathPrefix: '' },
      { code: 'fr', label: 'French', default: false, direction: 'ltr', pathPrefix: '/fr' },
      { code: 'ar', label: 'Arabic', default: false, direction: 'rtl', pathPrefix: '/ar' },
    ],
  },
};

const prefixed = resolveLocalizedRoutePath(pathPrefixSettings, '/fr/about?utm=ignored');

assert.equal(prefixed.originalPath, '/fr/about');
assert.equal(prefixed.path, '/about');
assert.equal(prefixed.locale.code, 'fr');
assert.equal(prefixed.locale.pathPrefix, '/fr');
assert.equal(prefixed.matchedBy, 'path-prefix');
assert.equal(applyLocalePrefixToPath('/about', prefixed), '/fr/about');
assert.equal(applyLocalePrefixToPath('https://example.com/about', prefixed), 'https://example.com/about');

const domainSettings: Pick<SiteSettings, 'localization'> = {
  localization: {
    defaultLocale: 'en',
    localeStrategy: 'domain',
    locales: [
      { code: 'en', label: 'English', default: true, direction: 'ltr', domain: 'example.com' },
      { code: 'fr', label: 'French', default: false, direction: 'ltr', domain: 'fr.example.com' },
    ],
  },
};

const domainLocalized = resolveLocalizedRoutePath(domainSettings, '/about', {
  host: 'https://www.fr.example.com:443',
});

assert.equal(domainLocalized.originalPath, '/about');
assert.equal(domainLocalized.path, '/about');
assert.equal(domainLocalized.locale.code, 'fr');
assert.equal(domainLocalized.locale.domain, 'fr.example.com');
assert.equal(domainLocalized.matchedBy, 'domain');
assert.equal(applyLocalePrefixToPath('/about', domainLocalized), '/about');
assert.equal(normalizePublicRouteHost('https://www.fr.example.com:443/path'), 'fr.example.com');
assert.equal(publicRouteHostMatchesSite({
  customDomain: 'example.com',
  settings: domainSettings,
}, 'www.fr.example.com'), true);
assert.equal(publicRouteHostMatchesSite({
  customDomain: 'example.com',
  settings: domainSettings,
}, 'other.example.com'), false);

const routed = withLocalizedResolvedRoute({
  type: 'page',
  path: '/about',
  status: 'published',
  canonical: '/about',
  params: {},
  resource: {
    id: 'page-about',
    kind: 'page',
    title: 'About',
    slug: 'about',
    apiUrl: '/api/sites/site-demo/pages?path=%2Fabout',
    renderUrl: '/api/sites/site-demo/render?path=%2Fabout',
  },
} as any, prefixed) as ResolvedSiteRoute;

assert.equal(routed.path, '/fr/about');
assert.equal(routed.canonical, '/fr/about');
assert.equal(routed.params.locale, 'fr');
assert.equal(routed.locale?.code, 'fr');
assert.equal(routed.locale?.basePath, '/about');
assert.equal(routed.locale?.path, '/fr/about');
assert.equal(routed.locale?.matchedBy, 'path-prefix');
assert(routed.type === 'page', 'Localized smoke route should remain a page route');
assert.equal(routed.resource.renderUrl, '/api/sites/site-demo/render?path=%2Ffr%2Fabout');

const redirectRoute = withLocalizedResolvedRoute({
  type: 'redirect',
  path: '/old-about',
  status: 'published',
  canonical: '/about',
  params: {},
  resource: {
    id: 'redirect-old-about',
    kind: 'redirect',
    from: '/old-about',
    to: '/about',
    statusCode: 301,
  },
} as any, prefixed) as ResolvedSiteRoute;

assert.equal(redirectRoute.canonical, '/fr/about');
assert(redirectRoute.type === 'redirect', 'Localized redirect smoke route should remain a redirect route');
assert.equal(redirectRoute.resource.to, '/fr/about');

console.log(JSON.stringify({
  ok: true,
  contract: 'backy.localized-route.v1',
}, null, 2));
