import assert from 'node:assert/strict';
import { createBackyClient, BackyApiError } from '../dist/index.js';
const calls = [];
let status = 200, code = 'NAVIGATION_INVENTORY_INCOMPLETE';
const client = createBackyClient({ baseUrl: 'https://backy.example', siteId: 'site/a', fetch: async (input, init) => {
 calls.push({ url: new URL(input), init });
 return Response.json(status === 200 ? { success: true, requestId: 'fixture', data: { nested: { retained: true } } } : { success: false, requestId: 'failure', error: { code, message: 'Retry later' } }, { status });
} });
const options = { adminSession: 'synthetic-fixture-session', credentials: 'include', requestId: 'configuration-request' };
const nav = { navigation: { primary: [{ type: 'page', pageId: 'page/tail', label: 'Tail', children: [{ type: 'route', path: '/child', label: 'Child' }] }], layout: { header: { showSearch: true } } } };
const seo = { seo: { defaultDescription: null, sitemap: { defaultPriority: '2' }, routeOverrides: [{ match: '/articles/*', keywords: 'first, second' }] } };
const rules = [{ from: '/old', to: '/new', permanent: true }, { from: '/gone', statusCode: 410 }];
await client.adminNavigation(options); await client.updateAdminNavigation({ ...nav, requestId: 'body-id' }, options);
await client.adminSeo(options); await client.updateAdminSeo({ ...seo, requestId: 'body-id' }, options);
await client.adminRedirects(options); await client.previewAdminRedirects(rules, options); await client.updateAdminRedirects({ redirects: { rules }, requestId: 'body-id' }, options);
const paths = ['navigation', 'navigation', 'seo', 'seo', 'redirects', 'redirects', 'redirects'];
for (const [index, call] of calls.entries()) {
 assert.equal(call.url.pathname, '/api/admin/sites/site%2Fa/' + paths[index]);
 assert.equal(call.init.headers.get('x-backy-admin-session'), options.adminSession);
 assert.equal(call.init.headers.get('x-backy-admin-key'), null); assert.equal(call.init.headers.get('x-request-id'), options.requestId); assert.equal(call.init.credentials, 'include');
}
assert.deepEqual(calls.map(call => call.init.method), ['GET', 'PATCH', 'GET', 'PATCH', 'GET', 'POST', 'PATCH']);
assert.deepEqual(JSON.parse(calls[1].init.body), nav); assert.deepEqual(JSON.parse(calls[3].init.body), seo);
assert.deepEqual(JSON.parse(calls[5].init.body), { redirectRules: rules }); assert.deepEqual(JSON.parse(calls[6].init.body), { redirects: { rules } });
status = 503;
await assert.rejects(client.updateAdminNavigation(nav, options), error => error instanceof BackyApiError && error.status === 503 && error.code === code);
code = 'REDIRECT_INVENTORY_INCOMPLETE';
await assert.rejects(client.updateAdminRedirects([], options), error => error instanceof BackyApiError && error.status === 503 && error.code === code);
assert.equal(calls.length, 9, 'Incomplete inventory errors do not trigger automatic saves/retries');
console.log('SDK site configuration transport passed: all seven methods, encoded site, session/cookie headers, nested navigation/SEO preservation, redirect array compatibility/aliases and typed503 without retries. Mock transport; no real credentials.');
