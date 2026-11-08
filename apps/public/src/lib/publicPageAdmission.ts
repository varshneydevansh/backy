import type { BackyPageRouteMetadata } from '@backy-cms/core';
import { getSiteByIdOrSlug } from './backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from './repositoryRuntime';
import { getRepositoryPageRouteMetadataByPublicPath } from './repositoryPages';
import { isRepositoryContentPubliclyReadable } from './repositoryRouteResolver';
import { normalizeRoutePath, resolveSiteRoute } from './routeResolver';
import { resolveLocalizedRoutePath } from './siteLocalization';
import { resolveRedirectRoute } from './redirectRules';
import { normalizePublicRouteHost } from './publicRouteHost';
import { publicContractJson } from './publicContractResponse';

export const PAGE_ADMISSION_PROFILE = 'page-admission.v1';
const allowed = new Set(['profile', 'path', 'host', 'domain']);
const identity = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 1024 && !/\p{Cc}/u.test(value);

/** Fresh page-only route authority. No navigation, canvases, template state or collection fallback. */
export async function publicPageAdmission(request: Request, siteIdentifier: string, requestId: string) {
  const error = (status: number, code: string, message: string) => publicContractJson({ success: false, requestId, error: { code, message } }, { status, requestId, cache: 'error' });
  const params = new URL(request.url).searchParams;
  if (params.get('profile') !== 'page-admission' || [...params.keys()].some(key => !allowed.has(key) || params.getAll(key).length !== 1)
    || !identity(siteIdentifier) || !identity(params.get('path')) || params.has('host') && params.has('domain')
    || ['host', 'domain'].some(key => params.has(key) && !identity(params.get(key)))) return error(400, 'INVALID_PAGE_ADMISSION_QUERY', 'Choose one public page path and host.');
  const path = normalizeRoutePath(params.get('path')!);
  const host = normalizePublicRouteHost(params.get('host') || params.get('domain') || request.headers.get('x-forwarded-host') || request.headers.get('host'));
  try {
    const demo = shouldUseDemoStoreFallback(), repositories = demo ? null : await getRequiredDatabaseRepositories();
    if (repositories && !repositories.sites.getRouteMetadataByIdOrSlug) throw Error('Routing metadata unavailable');
    const site = repositories ? await repositories.sites.getRouteMetadataByIdOrSlug!(siteIdentifier) : getSiteByIdOrSlug(siteIdentifier);
    if (!site || site.isPublished !== true) return error(404, 'SITE_NOT_FOUND', 'Site not found.');
    if (!identity(site.id) || !identity(site.slug)) throw Error('Invalid route identity');
    const localized = resolveLocalizedRoutePath(site.settings, path, { host });
    const redirect = resolveRedirectRoute(site.settings, localized.path);
    let route: { type: string; path: string; status: string; resourceId?: string };
    if (redirect) {
      route = { type: redirect.type, path: localized.originalPath, status: redirect.status };
    } else if (repositories) {
      // A post/collection route must never admit a page with a coincident slug.
      if (/^\/blog\/[^/]+$/.test(localized.path)) return error(404, 'PAGE_NOT_FOUND', 'Public page not found.');
      const page: BackyPageRouteMetadata | null = await getRepositoryPageRouteMetadataByPublicPath(repositories.pages, site.id, localized.path);
      if (!page || page.siteId !== site.id || !isRepositoryContentPubliclyReadable(page)) return error(404, 'PAGE_NOT_FOUND', 'Public page not found.');
      if (!identity(page.id)) throw Error('Invalid page identity');
      route = { type: 'page', path: localized.originalPath, status: page.status, resourceId: page.id };
    } else {
      const resolved = resolveSiteRoute(site as Parameters<typeof resolveSiteRoute>[0], path, { host });
      if (!resolved || resolved.type !== 'page') return error(404, 'PAGE_NOT_FOUND', 'Public page not found.');
      route = { type: 'page', path: resolved.path, status: resolved.status, resourceId: resolved.resource?.id };
    }
    return publicContractJson({ success: route.type !== 'gone', requestId, data: {
      site: { id: site.id, slug: site.slug, status: 'published' }, route,
      responseProfile: { schemaVersion: 'backy.page-admission-profile.v1', name: 'page-admission' },
    } }, { status: route.type === 'gone' ? 410 : 200, requestId, request, cache: route.type === 'gone' ? 'error' : 'render', siteId: site.id,
      headers: { 'x-backy-page-admission-profile': PAGE_ADMISSION_PROFILE },
    });
  } catch { return error(503, 'PAGE_ADMISSION_UNAVAILABLE', 'Public page admission is unavailable. Please try again later.'); }
}
