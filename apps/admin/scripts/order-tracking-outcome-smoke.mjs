import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const output = buildSync({
  entryPoints: [new URL('../src/lib/adminContentApi.ts', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'browser',
  define: { 'import.meta.env': '{}' }, logLevel: 'silent',
}).outputFiles[0].text;
const module = { exports: {} };
const record = { id: 'order', siteId: 'site', collectionId: 'orders', slug: 'order', status: 'published', values: { notes: 'Current notes', extension: { nested: [false, 0] } }, createdAt: '2026-01-01', updatedAt: '2026-01-01' };
const warnings = ['CACHE_INVALIDATION_PENDING', 'AUDIT_PENDING', 'WEBHOOK_DELIVERY_PENDING'].map(code => ({ code, message: 'Saved; follow-up pending.' }));
let calls = 0, warningMode = true, conflict = false;
vm.runInNewContext(output, {
  module, exports: module.exports, console, URL, Headers, Request, Response,
  fetch: async (url, init) => {
    calls++; assert.match(url, /sites\/site\/commerce\/orders\/order\/tracking$/);
    assert.equal(init.method, 'POST');
    if (conflict) return Response.json({ success: false, error: { code: 'ORDER_RECORD_CONFLICT', message: 'Reload the order.', details: { reloadRequired: true } } }, { status: 409 });
    return Response.json({ success: true, data: { record, tracking: { status: 'updated', provider: 'manual', trackingNumber: 'proof', trackingUrl: '', checkedAt: '2026-01-01' }, ...(warningMode ? { completionWarnings: warnings } : {}) } });
  },
});
const api = module.exports;
const result = await api.refreshOrderTracking('site', 'order', { provider: 'manual' });
assert.deepEqual(result.completionWarnings, warnings);
assert.deepEqual(result.record.values, record.values);
warningMode = false;
assert.equal((await api.refreshOrderTracking('site', 'order')).completionWarnings.length, 0);
conflict = true;
await assert.rejects(api.refreshOrderTracking('site', 'order'), /Reload the order/);
assert.equal(calls, 3, 'No automatic retry after saved follow-up or conflict');
console.log('Actual admin tracking adapter preserves saved warnings, legacy success, current nested values and conflict/no-retry behavior. Fetch is synthetic; served UI proof separate.');
