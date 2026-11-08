import assert from 'node:assert/strict';
import { createBackyClient, BackyApiError } from '../dist/index.js';
const calls = [];
let status = 200;
const client = createBackyClient({ baseUrl: 'https://backy.example', siteId: 'site/a', fetch: async (input, init) => {
 calls.push({ url: new URL(input), init });
 return Response.json(status === 200 ? { success: true, requestId: 'fixture', data: { preserved: { nested: true } } } : { success: false, requestId: 'conflict', error: { code: 'TEMPLATE_HISTORY_CONFLICT', message: 'Reload before saving' } }, { status });
} });
const options = { adminSession: 'synthetic-fixture-session', credentials: 'include', requestId: 'fixture-request' };
await client.adminTemplates({ ...options, type: 'page', search: 'Research notes' });
assert.equal(calls[0].url.pathname, '/api/admin/sites/site%2Fa/templates');
assert.equal(calls[0].url.searchParams.get('type'), 'page'); assert.equal(calls[0].url.searchParams.get('search'), 'Research notes');
await client.adminFrontendDesign(options);
const design = { templates: [{ id: 'nested', content: { elements: [{ id: 'parent', children: [{ id: 'child', extension: { keep: [0, false] } }] }] } }] };
await client.importAdminFrontendDesign({ contract: design, requestId: 'body-request' }, options);
await client.captureAdminSiteDefaults(options);
await client.captureAdminContentTemplate({ resourceType: 'page', resourceId: 'resource/a', templateId: 'copy', requestId: 'body-request' }, options);
await client.runAdminFrontendDesignAction({ action: 'connect-custom-frontend', manifest: { data: { site: { frontendDesign: design } } } }, options);
await client.updateAdminFrontendDesign({ frontendDesign: design, requestId: 'body-request' }, options);
for (const call of calls) {
 assert.equal(call.init.headers.get('x-backy-admin-session'), options.adminSession);
 assert.equal(call.init.headers.get('x-backy-admin-key'), null);
 assert.equal(call.init.headers.get('x-request-id'), options.requestId);
 assert.equal(call.init.credentials, 'include');
}
for (const call of calls.slice(1)) assert.equal(call.url.pathname, '/api/admin/sites/site%2Fa/frontend-design');
assert.equal(calls[0].init.method, 'GET'); assert.equal(calls[0].init.body, undefined);
assert.equal(calls[1].init.method, 'GET');
assert.deepEqual(JSON.parse(calls[2].init.body), { action: 'import-frontend-contract', contract: design });
assert.deepEqual(JSON.parse(calls[3].init.body), { action: 'capture-site-defaults' });
assert.deepEqual(JSON.parse(calls[4].init.body), { action: 'capture-content-template', resourceType: 'page', resourceId: 'resource/a', templateId: 'copy' });
assert.deepEqual(JSON.parse(calls[5].init.body), { action: 'connect-custom-frontend', manifest: { data: { site: { frontendDesign: design } } } });
assert.equal(calls[6].init.method, 'PATCH'); assert.deepEqual(JSON.parse(calls[6].init.body), { frontendDesign: design });
status = 409;
await assert.rejects(client.runAdminFrontendDesignAction({ action: 'capture-site-defaults' }, options), error => error instanceof BackyApiError && error.status === 409 && error.code === 'TEMPLATE_HISTORY_CONFLICT');
assert.equal(calls.length, 8, 'Conflict does not automatically retry a capture/import');
console.log('SDK design/template transport passed: encoded site, filters, session/cookie headers, preserved nested import JSON, all action methods, PATCH compatibility, typed409 without retry. Mock fetch; no live credentials.');
