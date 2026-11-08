/** Actual native per-record/HTTP acceptance, called only by its owned socket-only PostgreSQL runner. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
import Ajv from 'ajv/dist/2020.js';
import { load } from './collection-import-postgres-handlers.mjs';
import { editorMediaRuntimeFixture } from './editor-media-runtime-fixture.mjs';
const require = createRequire(import.meta.url), { NextRequest, NextResponse } = require('next/server');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

export async function verifyCollectionBulkMediaPostgres({ repositories, competing, sql, site }) {
  let checks = 0, deny = 0, repositoryReads = 0;
  const effects = { audit: 0, cache: 0, webhook: 0, provider: 0 }, proof = [], followups = { audit: false, cache: false, webhook: false, resolvedFailed: false };
  const source = ts.createSourceFile('openapi.ts', readFileSync(new URL('../src/app/api/sites/[siteId]/openapi/route.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true), schemas = new Map();
  function visit(node) { if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'schemas' && ts.isObjectLiteralExpression(node.initializer)) for (const p of node.initializer.properties) if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) schemas.set(p.name.text, p.initializer); ts.forEachChild(node, visit); }
  visit(source); const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false }), loaded = new Set();
  function register(name) { if (loaded.has(name)) return; loaded.add(name); assert(schemas.has(name), name); const value = vm.runInNewContext('(' + schemas.get(name).getText(source) + ')'); for (const match of JSON.stringify(value).matchAll(/#\/components\/schemas\/(\w+)/g)) register(match[1]); ajv.addSchema(value, '#/components/schemas/' + name); }
  register('AdminCollectionRecordBulkEnvelope'); const validate = ajv.getSchema('#/components/schemas/AdminCollectionRecordBulkEnvelope');
  const original = editorMediaRuntimeFixture(repositories);
  const collection = (await repositories.collections.create({ siteId: site.id, name: 'Bulk media proof', slug: 'bulk-media-proof', status: 'draft', fields: [{ id: 'asset', key: 'asset', label: 'Asset', type: 'json' }], permissions: { publicRead: false, publicCreate: false } })).item;
  const other = (await repositories.sites.create({ teamId: site.teamId, name: 'Other bulk proof', slug: 'other-bulk-proof', status: 'draft' })).item;
  const foreignCollection = (await repositories.collections.create({ siteId: other.id, name: 'Foreign', slug: 'foreign', status: 'draft', fields: [], permissions: {} })).item;
  const media = async name => (await repositories.media.create({ siteId: site.id, filename: name + '.png', originalName: name + '.png', type: 'image', mimeType: 'image/png', size: 128, url: '/fixture/' + name + '.png', metadata: { scope: 'global', visibility: 'public', authored: { keep: [false, 0, null] } } })).item;
  // Raw fixtures intentionally start without the derived binding; the real decorated
  // status update must add it inside its own transaction.
  const record = async (name, asset) => (await repositories.collections.createRecord({ siteId: site.id, collectionId: collection.id, slug: name, status: 'draft', values: { asset: { mediaId: asset.id }, unknown: { keep: [false, 0, null] } } })).item;
  const current = id => repositories.collections.getRecordById(site.id, collection.id, id);
  const bindings = async asset => (await repositories.media.getById(site.id, asset.id)).metadata.bindings || [];
  const mocks = runtime => ({
    'next/server': { NextRequest, NextResponse }, '@/lib/backyStore': {}, './backyStore': {},
    '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => false, getRequiredDatabaseRepositories: async () => { repositoryReads++; return runtime; } },
    '@/lib/adminAccess': { requireAdminAccess: async (_request, _id, options) => { assert(['collections.edit', 'collections.delete', 'media.delete'].includes(options.permission)); return deny ? NextResponse.json({ success: false }, { status: deny }) : { session: { user: { id: 'synthetic-owner' } } }; } },
    '@/lib/adminCommerceCollectionAccess': { requireCommerceCollectionAccess: async () => null },
    '@/lib/adminAudit': { recordAdminAudit: async () => { effects.audit++; if (followups.audit) throw Error('Private provider/audit identity'); return {}; } },
    '@/lib/cacheInvalidation': { recordSiteCacheInvalidation: async () => { effects.cache++; if (followups.cache) throw Error('Private cache configuration'); return {}; } },
    '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: async () => { effects.webhook++; if (followups.webhook) throw Error('Private webhook credential'); return followups.resolvedFailed ? [{ status: 'failed', error: 'Private destination' }] : []; } },
    '@/lib/mediaStorage': { getMediaStoragePathFromMedia: () => null, getMediaStorageAdapter: async () => { effects.provider++; throw Error('Provider calls forbidden'); } },
    './demoSiteBackupPersistence': { pendingDemoSiteBackupBytes: () => 0 },
  });
  const call = async (runtime, body, collectionId = collection.id) => {
    const route = load('../src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/bulk/route.ts', mocks(runtime));
    const response = await route.POST(new NextRequest(`http://fixture.invalid/api/admin/sites/${site.id}/collections/${collectionId}/records/bulk`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ siteId: site.id, collectionId }) });
    const payload = await response.json();
    if (response.status === 200) { assert(validate(payload), ajv.errorsText(validate.errors)); checks++; assert.equal(response.headers.get('cache-control'), 'private, no-store'); checks++; }
    return { status: response.status, body: payload };
  };
  await sql.unsafe("CREATE FUNCTION fixture_bulk_postcommit_read_failure() RETURNS void LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Private fixture postcommit inventory failure'; END $$");
  try {
    // The scoped native factory's essential sync is untouched. Only the obsolete
    // route-level second inventory read fails in actual SQL after that commit.
    let postcommitReads = 0;
    const failingTopLevel = { ...original, media: { ...original.media, list: async input => { postcommitReads++; await sql.unsafe('SELECT fixture_bulk_postcommit_read_failure()'); return original.media.list(input); } } };
    const a = await media('postcommit-status'), item = await record('postcommit-status', a), beforeEffects = structuredClone(effects);
    const saved = await call(failingTopLevel, { action: 'updateStatus', status: 'published', recordIds: [item.id] });
    assert.equal(saved.status, 200); assert.deepEqual(saved.body.data.appliedRecordIds, [item.id]); assert.equal(saved.body.data.outcome, 'complete'); assert.equal((await current(item.id)).status, 'published'); assert((await bindings(a)).some(b => b.targetId === item.id)); assert.equal(postcommitReads, 0); assert.equal(effects.audit, beforeEffects.audit + 1); assert(!JSON.stringify(saved.body).includes('Private fixture')); checks += 6;
    proof.push({ acceptance: 'obsolete-status-sync-not-called', httpStatus: saved.status, committedStatus: 'published', indexCommitted: true, topLevelInventoryReads: postcommitReads, responseReportsAppliedIds: true });
    postcommitReads = 0;
    const b = await media('postcommit-delete'), removed = await record('postcommit-delete', b);
    await original.collections.updateRecord(site.id, collection.id, removed.id, { status: 'published' });
    assert((await bindings(b)).some(binding => binding.targetId === removed.id)); checks++;
    const beforeDeleteEffects = structuredClone(effects);
    const deleted = await call(failingTopLevel, { action: 'delete', recordIds: [removed.id] });
    assert.equal(deleted.status, 200); assert.deepEqual(deleted.body.data.appliedRecordIds, [removed.id]); assert.equal(await current(removed.id), null); assert(!(await bindings(b)).some(binding => binding.targetId === removed.id)); assert.equal(postcommitReads, 0); assert.equal(effects.audit, beforeDeleteEffects.audit + 1); checks += 5;
    proof.push({ acceptance: 'obsolete-delete-sync-not-called', httpStatus: deleted.status, committedDeletion: true, indexRemovalCommitted: true, topLevelInventoryReads: postcommitReads, responseReportsAppliedIds: true });
  } finally { await sql.unsafe('DROP FUNCTION fixture_bulk_postcommit_read_failure()'); }

  // An essential index write fails on record two. Its own row/index roll back;
  // record one remains committed because the route has no whole-batch transaction.
  const firstAsset = await media('first-commit'), secondAsset = await media('second-rollback'), first = await record('first-commit', firstAsset), second = await record('second-rollback', secondAsset), secondBefore = await current(second.id), third = await record('not-attempted', firstAsset), thirdBefore = await current(third.id);
  await sql.unsafe(`CREATE FUNCTION fixture_bulk_index_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${secondAsset.id}'::uuid AND NEW.metadata->'bindings' IS DISTINCT FROM OLD.metadata->'bindings' THEN RAISE EXCEPTION 'Private fixture essential index rejection'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_bulk_index_failure BEFORE UPDATE ON media FOR EACH ROW EXECUTE FUNCTION fixture_bulk_index_failure()`);
  try {
    const beforeEffects = structuredClone(effects), result = await call(original, { action: 'updateStatus', status: 'published', recordIds: [first.id, second.id, third.id] });
    assert.equal(result.status, 200); assert.equal(result.body.data.outcome, 'partial'); assert.deepEqual(result.body.data.appliedRecordIds, [first.id]); assert.deepEqual(result.body.data.failedTargets, [{recordId:second.id,code:'COLLECTION_RECORD_WRITE_FAILED'}]); assert.deepEqual(result.body.data.notAttemptedRecordIds, [third.id]); assert.deepEqual(await current(third.id), thirdBefore); assert.match(result.body.data.records[0].version, /^record-v1:[0-9a-f]{64}$/); assert.equal((await current(first.id)).status, 'published'); assert.deepEqual(await current(second.id), secondBefore); assert((await bindings(firstAsset)).some(b => b.targetId === first.id)); assert(!(await bindings(secondAsset)).some(b => b.targetId === second.id)); assert.equal(effects.audit, beforeEffects.audit+1); assert(!JSON.stringify(result.body).includes('Private fixture')); checks += 7;
    proof.push({ acceptance: 'second-essential-index-write-reports-partial', httpStatus: result.status, firstStatus: 'published', firstIndexCommitted: true, secondRecordAndIndexRolledBack: true, responseReportsAppliedIds: true });
    // The same sequential boundary applies to deletes. The failed record and its
    // reference survive, while the earlier confirmed deletion is reported exactly.
    await sql.unsafe('ALTER TABLE media DISABLE TRIGGER fixture_bulk_index_failure');
    await original.collections.updateRecord(site.id, collection.id, second.id, { status: 'published' });
    await sql.unsafe('ALTER TABLE media ENABLE TRIGGER fixture_bulk_index_failure');
    const beforeDelete = await current(second.id), deleteEffects = structuredClone(effects);
    const partialDelete = await call(original, { action: 'delete', recordIds: [first.id, second.id, third.id] });
    assert.equal(partialDelete.status,200); assert.equal(partialDelete.body.data.deleted,1); assert.deepEqual(partialDelete.body.data.appliedRecordIds,[first.id]); assert.deepEqual(partialDelete.body.data.failedTargets,[{recordId:second.id,code:'COLLECTION_RECORD_WRITE_FAILED'}]); assert.deepEqual(partialDelete.body.data.notAttemptedRecordIds,[third.id]); assert.equal(await current(first.id),null); assert.deepEqual(await current(second.id),beforeDelete); assert.deepEqual(await current(third.id),thirdBefore); assert((await bindings(secondAsset)).some(b=>b.targetId===second.id)); assert.equal(effects.audit,deleteEffects.audit+1); checks+=10;
    const beforeFirstFailure = structuredClone(effects), firstFailure = await call(original,{action:'delete',recordIds:[second.id]}); assert.equal(firstFailure.status,500); assert.deepEqual(await current(second.id),beforeDelete); assert.deepEqual(effects,beforeFirstFailure); assert(!JSON.stringify(firstFailure.body).includes('Private fixture')); checks+=4;

  } finally { await sql.unsafe('DROP TRIGGER fixture_bulk_index_failure ON media; DROP FUNCTION fixture_bulk_index_failure()'); }

  // Pause only after the genuine decorated write/index, before its transaction
  // returns. Actual media DELETE must refuse while admission is held.
  const contendedAsset = await media('contended'), contended = await record('contended', contendedAsset), entered = deferred(), release = deferred();
  const held = editorMediaRuntimeFixture({ ...repositories, withMediaReferenceMutation: (siteId, operation) => repositories.withMediaReferenceMutation(siteId, async writer => { const result = await operation(writer); entered.resolve(); await release.promise; return result; }) });
  const pending = call(held, { action: 'updateStatus', status: 'published', recordIds: [contended.id] });
  await entered.promise;
  const deletion = load('../src/app/api/admin/sites/[siteId]/media/[mediaId]/route.ts', mocks(editorMediaRuntimeFixture(competing)));
  try {
    const response = await deletion.DELETE(new NextRequest(`http://fixture.invalid/api/admin/sites/${site.id}/media/${contendedAsset.id}`, { method: 'DELETE' }), { params: Promise.resolve({ siteId: site.id, mediaId: contendedAsset.id }) }), body = await response.json();
    assert.equal(response.status, 503); assert.equal(body.error.code, 'MEDIA_STORAGE_MUTATION_BUSY'); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(effects.provider, 0); checks += 4;
  } finally { release.resolve(); }
  assert.equal((await pending).status, 200); assert((await bindings(contendedAsset)).some(b => b.targetId === contended.id)); assert.deepEqual((await current(contended.id)).values.unknown, { keep: [false, 0, null] }); assert.deepEqual((await repositories.media.getById(site.id, contendedAsset.id)).metadata.authored, { keep: [false, 0, null] }); checks += 4;
  for (const status of [401, 403]) { deny = status; const beforeReads = repositoryReads; assert.equal((await call(original, { action: 'updateStatus', status: 'draft', recordIds: [contended.id] })).status, status); assert.equal(repositoryReads, beforeReads); checks += 2; }
  deny = 0;
  assert.equal((await call(original, { action: 'delete', recordIds: [contended.id] }, foreignCollection.id)).status, 404); assert.equal((await current(contended.id)).status, 'published'); checks += 2;
  // An author wins after the route reads the record. The admitted exact-row CAS
  // refuses without replaying the stale values/status or emitting follow-ups.
  const staleAsset = await media('stale-author'), staleRecord = await record('stale-author',staleAsset); let interleave = true;
  const staleRuntime = {...original,collections:{...original.collections,getRecordById:async(...args)=>{const found=await original.collections.getRecordById(...args);if(interleave&&args[2]===staleRecord.id){interleave=false;await competing.collections.updateRecord(site.id,collection.id,staleRecord.id,{values:{...found.values,unknown:{authorWinner:true}}});}return found;}}};
  const beforeStaleEffects=structuredClone(effects), staleResult=await call(staleRuntime,{action:'updateStatus',status:'published',recordIds:[staleRecord.id]});assert.equal(staleResult.status,409);assert.equal(staleResult.body.error.code,'COLLECTION_RECORD_CONFLICT');assert.equal((await current(staleRecord.id)).status,'draft');assert.deepEqual((await current(staleRecord.id)).values.unknown,{authorWinner:true});assert.deepEqual(effects,beforeStaleEffects);checks+=5;
  // Each postcommit task is independent; thrown and resolved webhook failures
  // are safe warnings and never replay successful writes.
  for (const mode of ['audit', 'cache', 'webhook', 'resolvedFailed', 'all']) {
    Object.keys(followups).forEach(key => { followups[key] = mode === 'all' || mode === key; });
    const beforeEffects = structuredClone(effects), result = await call(original, { action: 'updateStatus', status: 'archived', recordIds: [contended.id] });
    assert.equal(result.status, 200); assert.equal((await current(contended.id)).status, 'archived'); assert.deepEqual(result.body.data.appliedRecordIds, [contended.id]); assert.equal(result.body.data.outcome, 'partial'); assert.equal(result.body.data.failedTargets.length, 0); assert.equal(result.body.data.notAttemptedRecordIds.length, 0);
    const expected = mode === 'all' ? ['COLLECTION_BULK_AUDIT_PENDING','COLLECTION_BULK_CACHE_INVALIDATION_PENDING','COLLECTION_BULK_WEBHOOK_DELIVERY_PENDING'] : [mode === 'audit' ? 'COLLECTION_BULK_AUDIT_PENDING' : mode === 'cache' ? 'COLLECTION_BULK_CACHE_INVALIDATION_PENDING' : 'COLLECTION_BULK_WEBHOOK_DELIVERY_PENDING'];
    assert.deepEqual(result.body.data.completionWarnings, expected); assert(!JSON.stringify(result.body).includes('Private')); assert.equal(effects.audit, beforeEffects.audit+1); assert.equal(effects.cache, beforeEffects.cache+1); assert.equal(effects.webhook, beforeEffects.webhook+1); checks += 11;
  }
  Object.keys(followups).forEach(key => { followups[key] = false; });
  const skip = await call(original, { action: 'updateStatus', status: 'draft', recordIds: ['unknown-record', contended.id, contended.id] }); assert.equal(skip.body.data.skipped, 1); assert.deepEqual(skip.body.data.skippedRecordIds, ['unknown-record']); assert.deepEqual(skip.body.data.appliedRecordIds, [contended.id]); assert.equal(skip.body.data.completionWarnings.length, 0); checks += 4;
  // First failure still uses the normal safe unavailable response with no commits.
  const enteredFirst = deferred(), releasedFirst = deferred(); const lock = competing.media.withStorageMutationLock(site.id, async () => { enteredFirst.resolve(); await releasedFirst.promise; }); await enteredFirst.promise;
  const beforeBusy = await current(contended.id), beforeBusyEffects = structuredClone(effects);
  try { const busy = await call(original, { action: 'updateStatus', status: 'published', recordIds: [contended.id] }); assert.equal(busy.status,503); assert.equal(busy.body.error.code,'MEDIA_STORAGE_MUTATION_BUSY'); assert.deepEqual(await current(contended.id),beforeBusy); assert.deepEqual(effects,beforeBusyEffects); checks+=4; } finally { releasedFirst.resolve(); await lock; }
  const artifact = '/tmp/backy-collection-bulk-media-acceptance-20261012.json';
  writeFileSync(artifact, JSON.stringify({ schema: 'backy.collection-bulk-media-diagnostic.v1', checks, proof, configuredDatabaseUsed: false, providerCalls: effects.provider, productionWrites: 0, acceptance: 'local-source-native-sql-and-mocked-followups' }, null, 2) + '\n', { mode: 0o600 });
  console.log(`Collection bulk/media repaired acceptance PASS ${checks} checks; ${artifact}. Served browser/production proof separate.`);
  return checks;
}
