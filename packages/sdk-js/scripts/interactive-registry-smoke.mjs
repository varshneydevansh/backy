import assert from 'node:assert/strict';
import { createBackyClient, BackyApiError } from '../dist/index.js';
const versions = Array.from({ length: 205 }, (_, index) => ({ componentKey: 'fixture/versioned', version: `1.0.${index}+review`, type: 'interactiveFigure', status: 'active', renderMode: 'static-fallback', defaultProps: { config: { values: [1, 2] } }, propsSchema: { properties: { config: { type: 'object' } } }, dataBindings: [{ source: { collectionId: 'public' } }], fallback: { required: true, html: '<strong>Fallback</strong>' } }));
const calls = [];
const fetchRegistry = async (input, init) => {
  const url = new URL(input); calls.push({ url, init });
  const admin = url.pathname.startsWith('/api/admin/');
  if (url.pathname.endsWith('/missing')) return Response.json({ success: false, error: { code: 'COMPONENT_NOT_FOUND', message: 'Component version not found' } }, { status: 404 });
  const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 100);
  const exact = url.pathname.includes('/fixture%2Fversioned/');
  return Response.json({ success: true, requestId: 'fixture', data: { siteId: 'site-draft', schemaVersion: 'backy.interactive-component-registry.v1', contract: { sandbox: { enabled: false } }, components: exact ? [versions[204]] : versions.slice(offset, offset + limit), pagination: exact ? { total: 1, limit: 1, offset: 0, hasMore: false } : { total: 205, limit, offset, hasMore: offset + limit < 205 }, authoring: admin } });
};
const client = createBackyClient({ baseUrl: 'https://backy.example', siteId: 'site-draft', credentials: 'include', fetch: fetchRegistry });
const first = await client.interactiveComponents(); assert.equal(first.data.components.length, 100); assert.equal(first.data.pagination.hasMore, true); assert.equal(calls[0].init.credentials, 'omit');
const last = await client.interactiveComponents('site-draft', { offset: 200, limit: 5 }); assert.equal(last.data.components.length, 5); assert.equal(calls.at(-1).url.searchParams.get('offset'), '200');
await client.interactiveComponentsCached({ limit: 5, offset: 200, etag: 'fixture-etag' }); assert.equal(calls.at(-1).init.headers.get('if-none-match'), 'fixture-etag'); assert.equal(calls.at(-1).url.searchParams.get('offset'), '200'); assert.equal(calls.at(-1).init.credentials, 'omit');
const before = calls.length;
const all = await client.allInteractiveComponents(); assert.equal(all.data.components.length, 205); assert.deepEqual(calls.slice(before).map(call => call.url.searchParams.get('offset')), ['0', '100', '200']); assert.equal(all.data.pagination.hasMore, false);
const exact = await client.interactiveComponent('fixture/versioned', '1.0.204+review'); assert.equal(exact.data.components[0].version, '1.0.204+review'); assert.equal(calls.at(-1).url.pathname, '/api/sites/site-draft/interactive-components/fixture%2Fversioned/1.0.204%2Breview'); assert.equal(calls.at(-1).init.credentials, 'omit');
await assert.rejects(client.interactiveComponent('fixture/versioned', 'missing'), error => error instanceof BackyApiError && error.status === 404);
await client.adminInteractiveComponentRegistry({ siteId: 'site-draft', limit: 20, offset: 100, adminSession: 'fixture-admin-session' }); assert.equal(calls.at(-1).url.pathname, '/api/admin/sites/site-draft/interactive-components/discovery'); assert.equal(calls.at(-1).url.searchParams.get('offset'), '100'); assert(calls.at(-1).init.headers.get('authorization')?.includes('fixture-admin-session') || calls.at(-1).init.headers.get('x-backy-admin-session') === 'fixture-admin-session');
await client.adminInteractiveComponents({ limit: 20, offset: 100 }); assert.equal(calls.at(-1).url.searchParams.get('offset'), '100');
for (const bad of ['changed', 'empty', 'duplicate', 'later-failure']) {
 const broken = createBackyClient({ baseUrl: 'https://backy.example', siteId: 'site-draft', fetch: async (url, init) => {
  if (!new URL(url).searchParams.get('offset') || new URL(url).searchParams.get('offset') === '0') return fetchRegistry(url, init);
  if (bad === 'later-failure') return Response.json({ success: false, error: { code: 'FAILURE', message: 'Unavailable' } }, { status: 500 });
  return Response.json({ success: true, requestId: 'fixture', data: { siteId: 'site-draft', components: bad === 'empty' ? [] : bad === 'duplicate' ? versions.slice(0, 100) : versions.slice(100, 200), pagination: { total: bad === 'changed' ? 206 : 205, offset: 100, hasMore: true } } });
 } });
 await assert.rejects(broken.allInteractiveComponents(), /changed|pagination|Unavailable/);
}
console.log('SDK registry passed: paginated/cached catalog, complete205versions, encoded exact lookup404, authenticated draft discovery and closed partial/stale failure.');
