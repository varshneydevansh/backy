const record = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

/** Only the saved custom website may receive an existing scoped draft bearer.
 * Source repository/demo URLs, arbitrary request destinations and subdirectory
 * deployments cannot become preview destinations through this helper.
 */
export function customFrontendPreviewUrl(site: unknown, status: unknown, path: string, token: string): string | undefined {
  if (status !== 'draft' || !record(site) || typeof site.customDomain !== 'string'
    || !record(site.settings) || !record(site.settings.frontendDesign)) return;
  const design = site.settings.frontendDesign;
  if (!['captured', 'synced'].includes(String(design.status)) || !record(design.source)
    || design.source.type !== 'custom-frontend' || typeof design.source.url !== 'string') return;
  const domain = site.customDomain;
  if (domain !== domain.trim() || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain)
    || /\.(?:localhost|local|internal)$/i.test(domain)) return;
  if (!/^preview_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(token)) return;
  try {
    const origin = `https://${domain.toLowerCase()}`;
    const source = new URL(design.source.url);
    if (source.origin !== origin || source.username || source.password || source.pathname !== '/'
      || source.search || source.hash || design.source.url.trim() !== design.source.url) return;
    if (!path.startsWith('/') || path.startsWith('//') || /[?#\\\u0000-\u0020\u007f]/.test(path)) return;
    const decoded = decodeURIComponent(path);
    if (/[?#\\\u0000-\u0020\u007f]/.test(decoded) || decoded.includes('//')
      || decoded.split('/').some(part => part === '.' || part === '..')
      || /%(?:2f|5c)/i.test(path)) return;
    const url = new URL(path, origin);
    if (url.origin !== origin || url.pathname !== path) return;
    url.searchParams.set('previewToken', token);
    return url.href;
  } catch {
    return;
  }
}
