import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const bundle = path => buildSync({ entryPoints: [new URL(path, import.meta.url).pathname], bundle: true, write: false, format: 'cjs', platform: 'browser', define: { 'import.meta.env': '{}' }, logLevel: 'silent' }).outputFiles[0].text;
const clone = value => JSON.parse(JSON.stringify(value));
const records = ['one', 'two', 'three'].map(id => ({ id, siteId: 'site', collectionId: 'collection', slug: id, status: 'draft', values: { extension: { keep: [false, 0] } }, createdAt: '2026-01-01', updatedAt: '2026-01-01', version: 'record-v1:' + 'a'.repeat(64) }));
let response, calls = 0;
const apiModule = { exports: {} };
vm.runInNewContext(bundle('../src/lib/adminContentApi.ts'), { module: apiModule, exports: apiModule.exports, console, URL, Headers, Request, Response, fetch: async (_url, init) => { calls++; assert.equal(init.method, 'POST'); return Response.json(response.body, { status: response.status }); } });
const helperModule = { exports: {} };
vm.runInNewContext(bundle('../src/lib/collectionBulkOutcome.ts'), { module: helperModule, exports: helperModule.exports });
const source = ts.createSourceFile('collections.tsx', readFileSync(new URL('../src/routes/collections.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), handlers = new Map();
function visit(node) { if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && ['handleBulkDeleteRecords', 'handleBulkUpdateStatus'].includes(node.name.text)) handlers.set(node.name.text, node.initializer.getText(source)); ts.forEachChild(node, visit); }
visit(source); assert.equal(handlers.size, 2);
let currentRecords, selection, notice, closed, selected, errors;
const context = {
  exports: {}, activeCollection: { id: 'collection' }, activeSiteId: 'site', isCollectionsBusy: false, canDeleteCollections: true, canEditCollections: true,
  selectedRecordIds: ['one', 'two', 'three'], selectedRecordId: 'two',
  bulkUpdateCollectionRecords: apiModule.exports.bulkUpdateCollectionRecords, collectionBulkOutcome: helperModule.exports.collectionBulkOutcome,
  setIsSavingRecord() {}, setError(value) { if (value) errors.push(value); }, setValidationDetails() {}, setNotice(value) { notice = value; },
  setRecords(fn) { currentRecords = fn(currentRecords); }, setSelectedRecordIds(value) { selection = clone(value); },
  setSelectedRecordId(value) { selected = value; }, updateCollectionsRouteSearch() {}, setPendingBulkDelete(value) { closed = !value; },
  loadRecords: async () => {}, loadCollectionAuditLogs: async () => {}, showPermissionDenied() { assert.fail('Unexpected permission denial'); }, showApiError(error) { errors.push(error.message); },
};
vm.runInNewContext(ts.transpileModule([...handlers].map(([name, expression]) => `exports.${name} = ${expression};`).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
const base = action => ({ action, deleted: action === 'delete' ? 1 : 0, updated: action === 'updateStatus' ? 1 : 0, skipped: 0, records: action === 'delete' ? [] : [{ ...records[0], status: 'published', version: 'record-v1:' + 'b'.repeat(64) }], outcome: 'partial', appliedRecordIds: ['one'], failedTargets: [{ recordId: 'two', code: 'COLLECTION_RECORD_WRITE_FAILED' }], notAttemptedRecordIds: ['three'], completionWarnings: ['COLLECTION_BULK_APPLY_INCOMPLETE'], reloadRequired: true, concurrencyBoundary: 'database-per-record-transaction' });
const reset = () => { currentRecords = clone(records); selection = ['one', 'two', 'three']; notice = ''; selected = 'two'; closed = false; errors = []; };
reset(); response = { status: 200, body: { success: true, data: base('delete') } }; await context.exports.handleBulkDeleteRecords();
assert.deepEqual(currentRecords.map(record => record.id), ['two', 'three']); assert.deepEqual(selection, ['two', 'three']); assert.equal(selected, 'two'); assert.equal(closed, true); assert.match(notice, /1 records deleted, 1 failed, 1 not attempted/); assert.equal(errors.length, 0);
reset(); response.body.data = base('updateStatus'); await context.exports.handleBulkUpdateStatus('published');
assert.equal(currentRecords[0].status, 'published'); assert.equal(currentRecords[1].status, 'draft'); assert.equal(currentRecords[0].version, 'record-v1:' + 'b'.repeat(64)); assert.deepEqual(currentRecords[0].values.extension, { keep: [false, 0] }); assert.deepEqual(selection, ['two', 'three']); assert.match(notice, /1 failed, 1 not attempted/);
reset(); response.body.data = { ...base('delete'), failedTargets: [], notAttemptedRecordIds: [], completionWarnings: ['COLLECTION_BULK_AUDIT_PENDING'] }; await context.exports.handleBulkDeleteRecords();
assert.deepEqual(currentRecords.map(record => record.id), ['two', 'three']); assert.match(notice, /do not repeat successful writes/); assert.equal(selection.length, 0);
// Older responses remain supported. A failed request does not change selection or rows.
reset(); response.body.data = { action: 'delete', deleted: 3, updated: 0, skipped: 0, records: [] }; await context.exports.handleBulkDeleteRecords(); assert.equal(currentRecords.length, 0);
reset(); response = { status: 503, body: { success: false, error: { code: 'MEDIA_STORAGE_MUTATION_BUSY', message: 'Try later.' } } }; await context.exports.handleBulkDeleteRecords(); assert.deepEqual(currentRecords, records); assert.deepEqual(selection, ['one', 'two', 'three']); assert.deepEqual(errors, ['Try later.']);
assert.equal(calls, 5, 'One request per explicit action; no automatic replay');
console.log('Actual bundled admin adapter + actual collection UI callbacks PASS partial deletion/update, remaining selection, version/extensions, committed follow-up notice, legacy response and503/no retry. Browser rendering separate.');
