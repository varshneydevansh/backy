/** Pure canonical delivery URLs. No store, preview token, or request-provided host inference. */
const UNSAFE_TEXT = /[\p{Cc}\p{Cf}\p{Cs}\s\\]/u;
const SCHEME = /^[a-z][a-z\d+.-]*:/i;
const invalid = (): never => { throw new Error('Invalid canonical route URL'); };

function siteSlug(value: string): string {
  if (typeof value !== 'string' || !/^[a-z0-9](?:[a-z0-9_-]{0,199})$/i.test(value)) return invalid();
  return value;
}
function originUrl(value: string, httpsOnly = false): URL {
  if (typeof value !== 'string' || !value || value.length > 2048 || UNSAFE_TEXT.test(value) || /[?#%@]/.test(value)) return invalid();
  let url: URL;
  try { url = new URL(value); } catch { return invalid(); }
  if ((!['https:', 'http:'].includes(url.protocol)) || (httpsOnly && url.protocol !== 'https:')
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return invalid();
  const hostname = url.hostname;
  if (!hostname || !(hostname.startsWith('[') && hostname.endsWith(']')) && (hostname.length > 253 || hostname.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)))) return invalid();
  // URL accepts a missing slash after the scheme; an explicit authority is required here.
  if (!/^https?:\/\/[^/]+\/?$/i.test(value)) return invalid();
  return url;
}
function customOrigin(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return invalid();
  const hostAndPort = /^(?:(?:[a-z0-9-]+\.)+[a-z0-9-]+|localhost):\d+$/i.test(value);
  if (SCHEME.test(value) && !/^https:\/\//i.test(value) && !hostAndPort) return invalid();
  const source = /^https:\/\//i.test(value) ? value : `https://${value}`;
  return originUrl(source, true).origin;
}
function canonicalPath(value: string): string {
  if (typeof value !== 'string' || !value || value.length > 4096 || UNSAFE_TEXT.test(value) || /[?#]/.test(value) || value.startsWith('//') || SCHEME.test(value)) return invalid();
  const pathname = value.startsWith('/') ? value : `/${value}`;
  if (pathname.includes('//')) return invalid();
  for (const part of pathname.split('/')) {
    let decoded = part;
    // Never allow later URL/router decoding to introduce traversal, separators,
    // controls or a scheme. Retain the authored encoding; decoding is admission only.
    for (let depth = 0; depth <= 8; depth++) {
      if (decoded === '.' || decoded === '..' || UNSAFE_TEXT.test(decoded) || /[/:?#]/.test(decoded) || SCHEME.test(decoded)) return invalid();
      if (!decoded.includes('%')) break;
      if (depth === 8) return invalid();
      try { decoded = decodeURIComponent(decoded); } catch { return invalid(); }
    }
  }
  // Encode valid Unicode without letting URL silently remove a dot segment.
  return new URL(pathname, 'https://canonical.invalid').pathname;
}

export function getSiteCanonicalBaseUrl(origin: string, site: { slug: string; customDomain?: string | null }): string {
  const host = originUrl(origin).origin;
  const slug = siteSlug(site.slug);
  return customOrigin(site.customDomain) || `${host}/sites/${slug}`;
}

export function getHostedRouteUrl(origin: string, slug: string, canonical: string, customDomain?: string | null): string {
  const base = getSiteCanonicalBaseUrl(origin, { slug, customDomain });
  const custom = customOrigin(customDomain);
  if (typeof canonical !== 'string' || !canonical || canonical.length > 4096 || UNSAFE_TEXT.test(canonical) || /[?#]/.test(canonical) || canonical.startsWith('//')) return invalid();
  if (SCHEME.test(canonical)) {
    const match = /^https:\/\/([^/]+)(\/.*)?$/i.exec(canonical);
    if (!match) return invalid();
    // Validate raw path BEFORE URL can normalize encoded or literal dot segments.
    const pathname = canonicalPath(match[2] || '/');
    const absoluteAuthority = originUrl(`https://${match[1]}`, true);
    let absolute: URL;
    try { absolute = new URL(canonical); } catch { return invalid(); }
    if (absoluteAuthority.origin !== absolute.origin) return invalid();
    if (absolute.protocol !== 'https:' || absolute.username || absolute.password || absolute.origin !== new URL(base).origin) return invalid();
    if (custom) return `${custom}${pathname}`;
    const basePath = new URL(base).pathname;
    if (pathname !== basePath && !pathname.startsWith(basePath + '/')) return invalid();
    return pathname === basePath || pathname === basePath + '/' ? base : `${absolute.origin}${pathname}`;
  }
  const pathname = canonicalPath(canonical);
  return pathname === '/' && !custom ? base : `${base}${pathname}`;
}
