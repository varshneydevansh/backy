import assert from 'node:assert/strict';
import { createBackyClient, BackyApiError } from '../dist/index.js';
// Model an HTTP cache which can serve the previously published response within
// its freshness window. The normal client must contact the authority instead.
let title = 'Before publication edit', published = true, browserSnapshot;
const calls = [];
const client = createBackyClient({ baseUrl: 'https://fixture.invalid', siteId: 'site/owned', fetch: async (url, init) => {
  const path = new URL(url).pathname, headers = new Headers(init.headers);
  calls.push({ path, init, headers });
  if (init.method === 'PATCH') {
    const input = JSON.parse(init.body);
    if (input.title) title = input.title;
    if (input.status === 'archived') published = false;
    return Response.json({ success: true, requestId: 'mutation', data: { page: { id: 'page', title, status: published ? 'published' : 'archived' } } });
  }
  if (init.cache !== 'no-store' && browserSnapshot) return Response.json(browserSnapshot);
  if (!published) return Response.json({ success: false, requestId: 'withdrawn', error: { code: 'ROUTE_NOT_FOUND', message: 'Route not found' } }, { status: 404 });
  const etag = '"' + title + '"';
  if (headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { etag } });
  browserSnapshot = { success: true, requestId: 'read', data: { page: { id: 'page', title } } };
  return Response.json(browserSnapshot, { headers: { etag, 'cache-control': 'public, max-age=30, stale-while-revalidate=120' } });
} });
const initial = await client.render('/article'); assert.equal(initial.data.page.title, title);
await client.updateAdminPage('page', { title: 'Updated published title' }, { adminSession: 'synthetic-session', credentials: 'include' });
const updated = await client.render('/article'); assert.equal(updated.data.page.title, title, 'Ordinary render rereads the published update');
const cached = await client.renderCached('/article'); assert.equal(cached.notModified, false); assert.equal(cached.body.data.page.title, title);
const unchanged = await client.renderCached('/article', { etag: cached.meta.etag }); assert.equal(unchanged.notModified, true); assert.equal(unchanged.status, 304); assert.equal(unchanged.body, null);
await client.updateAdminPage('page', { status: 'archived' }, { adminSession: 'synthetic-session', credentials: 'include' });
for (const read of [() => client.render('/article'), () => client.renderCached('/article', { etag: cached.meta.etag })]) {
  const count = calls.length;
  await assert.rejects(read(), error => error instanceof BackyApiError && error.status === 404);
  assert.equal(calls.length, count + 1, 'Withdrawn response is not retried or replaced with cached content');
}
assert.equal(calls.length, 8);
for (const call of calls) assert.equal(call.init.cache, 'no-store');
const mutation = calls.find(call => call.init.method === 'PATCH'); assert.equal(mutation.headers.get('x-backy-admin-session'), 'synthetic-session'); assert.equal(mutation.init.credentials, 'include');
assert.equal(calls[0].path, '/api/sites/site%2Fowned/render');
console.log('SDK publishing freshness transport PASS: ordinary render updates/withdrawal, explicit ETag304, encoded site, authenticated mutations and no replay. HTTP cache model; browser/provider cache certification remains separate.');
// Browsers require native Window.fetch to receive its owning global receiver.
// Node's native fetch is permissive, so model the stricter receiver explicitly.
const savedFetch = globalThis.fetch;
let nativeCalls = 0;
try {
  globalThis.fetch = function(url, init) {
    assert.ok(this === globalThis, 'Default fetch receives its owning global receiver');
    assert.equal(init.cache, 'no-store'); nativeCalls++;
    return Promise.resolve(Response.json({ success: true, requestId: 'native', data: { page: { title: 'Native default fetch' } } }));
  };
  const nativeClient = createBackyClient({ baseUrl: 'https://fixture.invalid', siteId: 'owned' });
  assert.equal((await nativeClient.render('/native')).data.page.title, 'Native default fetch');
  assert.equal(nativeCalls, 1);
  let customCalls = 0;
  const customClient = createBackyClient({ baseUrl: 'https://fixture.invalid', siteId: 'owned', fetch: async () => {
    customCalls++; return Response.json({ success: true, requestId: 'custom', data: { page: { title: 'Custom transport' } } });
  } });
  assert.equal((await customClient.render('/custom')).data.page.title, 'Custom transport');
  assert.equal(customCalls, 1); assert.equal(nativeCalls, 1, 'Explicit custom transport remains authoritative');
} finally { globalThis.fetch = savedFetch; }
console.log('SDK default native fetch receiver and explicit custom transport PASS. Actual browser proof remains separate.');
