import { NextRequest, NextResponse } from 'next/server';
import type { BackyPageCanvasSource } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { getPageSummary, getSiteByIdOrSlug } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';
type Context = { params: Promise<{ siteId: string }> };
const response = (status: number, body: unknown) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'x-backy-canvas-sources': 'metadata.v1' } });
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max && !/\p{Cc}/u.test(v);
const id = (v: unknown): v is string => text(v, 200) && !!v.trim();
export async function GET(request: NextRequest, { params }: Context) {
  const requestId = request.headers.get('x-request-id') || `req_${Date.now().toString(36)}`;
  const access = await requireAdminAccess(request, requestId, { permission: 'pages.view' });
  if (access instanceof NextResponse) return access;
  const error = (status: number, code: string, message: string) => response(status, { success: false, requestId, error: { code, message } });
  const query = new URL(request.url).searchParams;
  const integer = (name: string, fallback: number, min: number, max: number) => {
    const raw = query.get(name); if (raw === null) return fallback;
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < min || Number(raw) > max) throw Error('Invalid pagination');
    return Number(raw);
  };
  let limit: number, offset: number, search: string;
  try {
    if ([...query.keys()].some(key => !['q', 'limit', 'offset'].includes(key) || query.getAll(key).length !== 1)) throw Error('Invalid query');
    limit = integer('limit', 50, 1, 100); offset = integer('offset', 0, 0, 1000000); search = (query.get('q') || '').trim();
    if (!text(search, 200)) throw Error('Invalid search');
  } catch { return error(400, 'INVALID_CANVAS_SOURCE_QUERY', 'Choose one short search and a valid results page.'); }
  try {
    const { siteId } = await params;
    let site: { id: string; slug: string } | null;
    let result;
    if (shouldUseDemoStoreFallback()) {
      site = getSiteByIdOrSlug(siteId) || null;
      const candidates = site ? getPageSummary(site.id, { includeUnpublished: true }).filter(page => page.status !== 'archived'
        && `${page.title} ${page.slug}`.toLowerCase().includes(search.toLowerCase())).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id)) : [];
      result = { items: candidates.slice(offset, offset + limit), pagination: { total: candidates.length, limit, offset, hasMore: offset + limit < candidates.length } };
    } else {
      const repositories = await getRequiredDatabaseRepositories();
      if (!repositories.sites.getAccessScopeByIdOrSlug || !repositories.pages.listCanvasSourceMetadata) throw Error('Narrow canvas lookup unavailable');
      site = await repositories.sites.getAccessScopeByIdOrSlug(siteId);
      result = site ? await repositories.pages.listCanvasSourceMetadata({ siteId: site.id, search, limit, offset }) : null;
    }
    if (!site) return error(404, 'SITE_NOT_FOUND', 'Site not found.');
    if (!id(site.id) || !id(site.slug) || !result) throw Error('Invalid canvas source site');
    const p = result.pagination;
    if (!Number.isSafeInteger(p.total) || p.total < 0 || p.limit !== limit || p.offset !== offset || p.hasMore !== (offset + limit < p.total)
      || result.items.length !== Math.min(limit, Math.max(0, p.total - offset))) throw Error('Invalid source pagination');
    const seen = new Set<string>();
    const pages: BackyPageCanvasSource[] = result.items.map(page => {
      if (page.siteId !== site.id || !id(page.id) || !text(page.title, 2000) || !page.title.trim() || !text(page.slug, 1024) || seen.has(page.id)
        || !['published', 'draft', 'scheduled'].includes(page.status)) throw Error('Invalid canvas source');
      seen.add(page.id);
      return { id: page.id, siteId: site.id, title: page.title, slug: page.slug, status: page.status };
    });
    const data = { site: { id: site.id, slug: site.slug }, pages, pagination: p, filters: { q: search }, responseProfile: 'backy.canvas-sources.v1' };
    if (Buffer.byteLength(JSON.stringify(data), 'utf8') > 400000) throw Error('Source response exceeds its read budget');
    return response(200, { success: true, requestId, data });
  } catch { return error(503, 'CANVAS_SOURCES_UNAVAILABLE', 'Canvas source lookup is unavailable. Retry after checking access; no full-page fallback was used.'); }
}
