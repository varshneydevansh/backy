import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';
const output = buildSync({ entryPoints: [new URL('../src/lib/adminContentApi.ts', import.meta.url).pathname], bundle: true, write: false, format: 'cjs', platform: 'browser', define: { 'import.meta.env': '{}' }, logLevel: 'silent' }).outputFiles[0].text;
const module = { exports: {} };
let calls = [], mode = 'success', responseBody;
vm.runInNewContext(output, { module, exports: module.exports, console, URL, Headers, Request, Response, fetch: async (url, init) => {
  calls.push({ url, init });
  if (mode === 'stale' || mode === 'denied') return Response.json({ success: false, error: { code: mode === 'stale' ? 'DELIVERY_RECONCILIATION_CONFLICT' : 'OWNER_SESSION_REQUIRED', message: mode === 'stale' ? 'Reload the delivery history.' : 'An owner session is required.' } }, { status: mode === 'stale' ? 409 : 403 });
  return Response.json({ success: true, data: responseBody });
} });
const api = module.exports;
const original = { id: 'attempt/id', siteId: 'site/id', commentId: 'comment/id', kind: 'comment-status', target: 'retained-target', status: 'uncertain', createdAt: '2026-10-08T10:00:00.000Z', updatedAt: '2026-10-08T10:00:01.000Z', statusCode: 202, providerEvidence: { provider: 'smtp', observedAt: '2026-10-08T10:00:01.000Z', providerMessageId: 'synthetic-owned-id' }, reconciliationVersion: 0, reconciliations: [] };
const body = { expectedUpdatedAt: original.updatedAt, expectedState: 'uncertain', expectedReviewVersion: 0, evidence: 'outcome-unavailable', disposition: 'retain-without-resend' };
const review = { id: 'review-1', version: 1, actorId: 'owner-fixture', requestId: 'synthetic-review', createdAt: '2026-10-08T10:01:00.000Z', observedUpdatedAt: original.updatedAt, observedState: original.status, evidence: body.evidence, disposition: body.disposition };
const good = () => ({ attempt: { ...original, reconciliationVersion: 1, reconciliations: [review] }, reconciliation: review, completionWarnings: [{ code: 'DELIVERY_RECONCILIATION_AUDIT_PENDING', message: 'Audit recording is pending.' }] });
responseBody = good();
const result = await api.recordCommentDeliveryReview(original.siteId, original, body);
assert.equal(result.attempt.status, 'uncertain'); assert.equal(result.attempt.updatedAt, original.updatedAt);
assert.deepEqual(result.attempt.providerEvidence, original.providerEvidence); assert.deepEqual(result.reconciliation, review);
assert.equal(result.completionWarnings[0].code, 'DELIVERY_RECONCILIATION_AUDIT_PENDING');
assert.match(calls[0].url, /sites\/site%2Fid\/comments\/comment%2Fid\/delivery-attempts\/attempt%2Fid\/reconciliation$/);
assert.equal(calls[0].init.method, 'POST'); assert.deepEqual(JSON.parse(calls[0].init.body), body);
const form = { ...original, kind: 'form-submission', commentId: undefined, formId: 'form/id', submissionId: 'submission/id' };
responseBody = { ...good(), attempt: { ...form, reconciliationVersion: 1, reconciliations: [review] } };
await api.recordFormDeliveryReview(form.siteId, form.formId, form, body);
assert.match(calls[1].url, /admin\/sites\/site%2Fid\/forms\/form%2Fid\/submissions\/submission%2Fid\/delivery-attempts\/attempt%2Fid\/reconciliation$/);
let checks = 10;
for (const modeValue of ['stale', 'denied']) {
  mode = modeValue; const before = calls.length;
  await assert.rejects(api.recordCommentDeliveryReview(original.siteId, original, body), modeValue === 'stale' ? /Reload/ : /owner session/);
  assert.equal(calls.length, before + 1, 'Error does not replay write'); checks += 2;
}
mode = 'success';
for (const mutation of [
  value => { value.attempt.status = 'succeeded'; },
  value => { value.attempt.siteId = 'foreign'; },
  value => { value.attempt.providerEvidence = null; },
  value => { value.attempt.updatedAt = '2026-10-08T11:00:00.000Z'; },
  value => { value.attempt.target = 'different-target'; },
  value => { value.attempt.reconciliationVersion = 3; },
  value => { value.attempt.reconciliations = []; },
  value => { value.reconciliation = { ...review, disposition: 'resend' }; },
  value => { value.completionWarnings = ['unexpected']; },
]) {
  responseBody = good(); mutation(responseBody); const before = calls.length;
  await assert.rejects(api.recordCommentDeliveryReview(original.siteId, original, body), /write may have completed/);
  assert.equal(calls.length, before + 1, 'Unverifiable success does not replay'); checks += 2;
}
for (const [event, request] of [
  [{ ...original, status: 'failed' }, body], [{ ...original, updatedAt: undefined }, body],
  [original, { ...body, expectedReviewVersion: 1 }], [original, { ...body, evidence: 'arbitrary-provider-success' }],
  [original, { ...body, disposition: 'resend' }],
]) {
  const before = calls.length; await assert.rejects(api.recordCommentDeliveryReview(original.siteId, event, request), /Reload/);
  assert.equal(calls.length, before, 'Invalid snapshot/evidence never reaches I/O'); checks += 2;
}
const before = calls.length;
await assert.rejects(api.recordFormDeliveryReview('foreign-site', form.formId, form, body), /selected form/);
await assert.rejects(api.recordCommentDeliveryReview('foreign-site', original, body), /selected site/);
assert.equal(calls.length, before); checks += 3;
console.log(`Delivery review bundled admin adapter: ${checks} checks PASS; exact encoded POST/CAS, immutable provider status/evidence, preserved audit warnings, stale/owner denial and no replay. Fetch fixture only; served UI separate.`);
