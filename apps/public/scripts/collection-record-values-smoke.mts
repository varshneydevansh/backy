import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, chmodSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { load } from './admin-access-test-fixtures.mts';
import { createRequire } from 'node:module';
const { assertBackyCollectionRecordUpdateExpectation } = createRequire(import.meta.url)('@backy-cms/core');
const versions = load('../src/lib/collectionRecordVersion.ts');
const cwd = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'backy-record-values-'));
process.chdir(directory);
let checks = 0;
try {
  const imported = await import('../src/lib/backyStore.ts'), store = imported.default || imported;
  const site = store.createAdminSite({ id: 'record-values-site', slug: 'record-values-alias', name: 'Values' });
  const collection = store.createAdminCollection(site.id, { name: 'Entries', slug: 'typed-entries', fields: [
    { key: 'title', label: 'Title', type: 'text', required: true },
    { key: 'count', label: 'Count', type: 'number' }, { key: 'flag', label: 'Flag', type: 'boolean' },
    { key: 'defaults', label: 'Defaults', type: 'number', defaultValue: '7' },
    { key: 'json', label: 'JSON', type: 'json' }, { key: 'files', label: 'Files', type: 'file', validation: { multiple: true } }, { key: 'tags', label: 'Tags', type: 'tags' },
  ] });
  const inventory = load('../src/lib/collectionInventory.ts', { './collectionExportPagination': load('../src/lib/collectionExportPagination.ts') });
  const validation = load('../src/lib/collectionRecordValidation.ts', { '@/lib/backyStore': store, '@/lib/collectionInventory': inventory });
  for (const demo of [false, true]) {
    const records = new Map<string, any>(); let writes = 0, interleave = false;
    const getRecord = (sid: string, cid: string, id: string) => sid === site.id && cid === collection.id ? records.get(id) || null : null;
    const repositories: any = { settings: { get: async () => store.getAdminSettings() }, sites: { getById: async (id: string) => id === site.id ? site : null, getBySlug: async (slug: string) => slug === site.slug ? site : null },
      media: { getById: async () => null }, collections: {
        withRecordWriteLock: async (_sid: string, _cid: string, run: any) => run(repositories.collections, collection, { media: repositories.media, settings: repositories.settings, sites: repositories.sites }),
        getById: async (sid: string, id: string) => sid === site.id && id === collection.id ? collection : null, getBySlug: async () => null,
        getRecordById: async (...args: [string, string, string]) => getRecord(...args), getRecordBySlug: async () => null,
        listRecords: async () => ({ items: [...records.values()], pagination: { total: records.size, limit: 100, offset: 0, hasMore: false } }),
        createRecord: async (input: any) => { writes++; const record = { ...input, id: `db-${writes}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; records.set(record.id, record); return { item: record }; },
        updateRecord: async (sid: string, cid: string, id: string, input: any) => { if (interleave) { interleave = false; const current = getRecord(sid, cid, id); records.set(id, { ...current, values: { ...current.values, extension: { authorWinner: true } } }); writes++; }
          assertBackyCollectionRecordUpdateExpectation(sid, cid, id, input, getRecord(sid, cid, id), versions.collectionRecordVersion(getRecord(sid, cid, id))); writes++; const { expectedRecord, expectedUpdatedAt, expectedVersion, ...changes } = input; const record = { ...getRecord(sid, cid, id), ...changes, updatedAt: new Date(Math.max(Date.now(), Date.parse(getRecord(sid, cid, id).updatedAt) + 1)).toISOString() }; records.set(id, record); return { item: record }; },
      } };
    const mocks: any = { 'next/server': { NextResponse }, '@/lib/collectionRecordVersion': versions, '@/lib/collectionRecordAdmission': load('../src/lib/collectionRecordAdmission.ts'), '@/lib/backyStore': { ...store, updateAdminCollectionRecord: (sid: string, cid: string, id: string, input: any) => { if (interleave) { interleave = false; store.updateAdminCollectionRecord(sid, cid, id, { values: { extension: { authorWinner: true } } }); } return store.updateAdminCollectionRecord(sid, cid, id, input); } },
      '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => demo, getRequiredDatabaseRepositories: async () => repositories },
      '@/lib/adminAccess': { requireAdminAccess: async () => ({ session: { user: { id: 'fixture-owner' } } }) },
      '@/lib/adminCommerceCollectionAccess': { requireCommerceCollectionAccess: async () => null },
      '@/lib/frontendDesignContract': { seedCollectionRecordInputFromFrontendDesignTemplate: ({ body }: any) => ({ ok: true, body }), normalizeCollectionRecordInputFromDirectFrontendDesignEnvelope: (body: any) => body },
      '@/lib/collectionRecordValidation': validation, '@/lib/collectionInventory': inventory,
      '@/lib/adminAudit': { recordAdminAudit: async () => ({}) }, '@/lib/cacheInvalidation': { recordSiteCacheInvalidation: async () => ({}) },
      '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: async () => ({}) }, '@/lib/repositoryMediaReferenceSync': { syncRepositoryCollectionRecordMediaReferences: async () => ({}) },
      '@/lib/orderInventoryRestore': { applyDemoOrderInventoryRestore: ({ after }: any) => after, applyRepositoryOrderInventoryRestore: async ({ after }: any) => after },
    };
    const create = load('../src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/route.ts', mocks);
    const update = load('../src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/[recordId]/route.ts', mocks);
    const call = async (method: string, body: any, id = '') => {
      const response = await (method === 'POST' ? create : update)[method](new NextRequest('http://fixture.invalid/api/admin/sites/record-values-alias/collections/entries/records', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ siteId: site.slug, collectionId: collection.id, recordId: id }) });
      return { status: response.status, body: await response.json() };
    };
    const extension = { layout: { responsive: { mobile: { width: 320 } } }, nested: [false, 0, null] };
    const created = await call('POST', { slug: `typed-${demo}`, values: { title: ' Exact ', count: '12.5', flag: 'yes', json: extension, tags: 'a,b', unknown: extension } });
    assert.equal(created.status, 201, JSON.stringify(created.body.error));
    const record = created.body.data.record;
    assert.match(record.version, /^record-v1:[a-f0-9]{64}$/);
    assert.equal(record.version, versions.collectionRecordVersion(record)); checks++;
    assert.equal(record.values.count, 12.5); assert.equal(record.values.flag, true); assert.equal(record.values.defaults, 7); assert.equal(record.values.title, 'Exact');
    assert.deepEqual(record.values.json, extension); assert.deepEqual(record.values.unknown, extension); assert.deepEqual(record.values.tags, ['a', 'b']); checks++;
    const saved = await call('PATCH', { values: { count: '24', flag: 'false' } }, record.id);
    assert.equal(saved.status, 200, JSON.stringify(saved.body.error));
    assert.equal(saved.body.data.record.values.count, 24); assert.equal(saved.body.data.record.values.flag, false);
    assert.deepEqual(saved.body.data.record.values.unknown, extension); assert.deepEqual(saved.body.data.record.values.json, extension); assert.equal(saved.body.data.record.values.title, 'Exact'); checks++;
    for (const bad of [{ count: 'invalid' }, { count: {} }, { count: [1] }, { flag: 'maybe' }, { title: { nested: 'lossy' } }, { tags: ['valid', {}] }, { files: ['valid', {}] }]) {
      const before = writes;
      const rejected = await call('PATCH', { values: bad }, record.id);
      assert.equal(rejected.status, 400, `${demo}/${JSON.stringify(bad)} ${JSON.stringify(rejected.body.error)}`); assert.equal(rejected.body.error.code, 'VALIDATION_ERROR'); assert.equal(writes, before); checks++;
    }
    const reopened = demo ? store.getCollectionRecordByIdOrSlug(site.id, collection.id, record.id, { includeUnpublished: true }) : records.get(record.id);
    assert.equal(reopened.values.count, 24); assert.equal(reopened.values.title, 'Exact'); checks++;
    for (const bad of [null, [], 'bad']) {
      for (const method of ['POST', 'PATCH']) {
        const before = writes;
        assert.equal((await call(method, { slug: 'bad-shape', values: bad }, record.id)).status, 400);
        assert.equal(writes, before); checks++;
      }
    }
    assert.equal((await call('PATCH', { expectedVersion: 'bad', values: {} }, record.id)).status, 400); checks++;
    assert.equal((await call('PATCH', { expectedVersion: record.version, values: { title: 'Old snapshot' } }, record.id)).status, 409); checks++;
    const oldTimestamp = record.updatedAt;
    const stale = await call('PATCH', { expectedUpdatedAt: oldTimestamp, values: { title: 'Stale author' } }, record.id);
    assert.equal(stale.status, 409); assert.equal(stale.body.error.code, 'COLLECTION_RECORD_CONFLICT'); assert.equal(stale.body.error.details.reloadRequired, true); checks++;
    assert.equal((await call('PATCH', { expectedUpdatedAt: 'bad', values: {} }, record.id)).status, 400); checks++;
    interleave = true;
    const raced = await call('PATCH', { values: { title: 'Losing author' } }, record.id);
    assert.equal(raced.status, 409, JSON.stringify(raced.body.error)); assert.equal(raced.body.error.code, 'COLLECTION_RECORD_CONFLICT'); checks++;
    const winner = demo ? store.getCollectionRecordByIdOrSlug(site.id, collection.id, record.id, { includeUnpublished: true }) : records.get(record.id);
    assert.equal(winner.values.title, 'Exact'); assert.deepEqual(winner.values.extension, { authorWinner: true }); checks++;
    assert.equal((await call('PATCH', { expectedVersion: versions.collectionRecordVersion(reopened), values: { title: 'Long-open loser' } }, record.id)).status, 409); checks++;
    assert.equal(versions.collectionRecordVersion(winner), versions.collectionRecordVersion({ ...winner, values: Object.fromEntries(Object.entries(winner.values).reverse()) })); checks++;
    const fresh = await call('PATCH', { expectedUpdatedAt: winner.updatedAt, expectedVersion: versions.collectionRecordVersion(winner), values: { title: 'Fresh author' } }, record.id);
    assert.equal(fresh.status, 200); assert.deepEqual(fresh.body.data.record.values.extension, { authorWinner: true }); checks++;
    if (!demo) {
      const capability = repositories.collections.withRecordWriteLock;
      repositories.collections.withRecordWriteLock = undefined;
      const before = writes;
      const unavailable = await call('PATCH', { values: { title: 'Unsupported storage' } }, record.id);
      assert.equal(unavailable.status, 503); assert.equal(unavailable.body.error.code, 'COLLECTION_WRITE_UNAVAILABLE'); assert.equal(writes, before); checks++;
      repositories.collections.withRecordWriteLock = capability;
      const legacy = records.get(record.id);
      delete legacy.values.defaults; legacy.values.count = '33';
      const statusOnly = await call('PATCH', { status: 'draft' }, record.id);
      assert.equal(statusOnly.status, 200); assert.equal(statusOnly.body.data.record.values.defaults, 7); assert.equal(statusOnly.body.data.record.values.count, 33); assert.deepEqual(statusOnly.body.data.record.values.unknown, extension); checks++;
    }
    if (demo) {
      const uniqueFields = collection.fields.map((field: any) => field.key === 'title' ? { ...field, unique: true } : field);
      store.updateAdminCollection(site.id, collection.id, { fields: uniqueFields });
      const pair = await Promise.all([call('POST', { slug: 'unique-first', values: { title: 'Same admission', unknown: extension } }), call('POST', { slug: 'unique-second', values: { title: 'Same admission', unknown: extension } })]);
      assert.deepEqual(pair.map(result => result.status).sort(), [201, 400]);
      assert.equal(pair.find(result => result.status === 400)!.body.error.details[0].code, 'unique');
      const currentRows = store.listCollectionRecords(site.id, collection.id, { includeUnpublished: true, limit: 100 }).records;
      assert.equal(currentRows.filter((row: any) => row.values.title === 'Same admission').length, 1); checks++;
      assert.throws(() => store.createAdminCollectionRecord(site.id, collection.id, { slug: 'storage-duplicate', values: { title: ' same admission ' } }), (error: any) => error.code === 'COLLECTION_RECORD_VALIDATION'); checks++;
      const baseline = store.getCollectionRecordByIdOrSlug(site.id, collection.id, record.id, { includeUnpublished: true });
      const durable = readFileSync(join(directory, 'data/backy/admin-content.json'), 'utf8');
      const path = join(directory, 'data/backy'); chmodSync(path, 0o500);
      try { assert.throws(() => store.updateAdminCollectionRecord(site.id, collection.id, record.id, { expectedRecord: baseline, values: { title: 'Failed disk write' } }), /EACCES|EPERM/); }
      finally { chmodSync(path, 0o700); }
      assert.deepEqual(store.getCollectionRecordByIdOrSlug(site.id, collection.id, record.id, { includeUnpublished: true }), baseline);
      assert.equal(readFileSync(join(directory, 'data/backy/admin-content.json'), 'utf8'), durable); checks++;
    }

  }
} finally { process.chdir(cwd); rmSync(directory, { recursive: true, force: true }); }
console.log(`Collection record value handlers: ${checks} checks passed (actual demo store and database adapter fixture; no providers).`);
