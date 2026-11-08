import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { PgDialect } from 'drizzle-orm/pg-core';
import { createTemplateRevisionRepository, createSiteRepository } from '../dist/repositories/index.js';
import { sites, templateRevisions } from '../dist/schema/index.js';
import { DEFAULT_SITE_SETTINGS, serializeTemplateRevisionValue, unrelatedSiteSettingsPatch } from '../../core/dist/index.mjs';
const fingerprint = value => createHash('sha256').update(serializeTemplateRevisionValue(value)).digest('hex');
const siteId = '00000000-0000-4000-8000-000000000001';
const initial = { schemaVersion: 'backy.frontend-design.v1', status: 'captured', source: { type: 'manual' }, tokens: { colors: { primary: 'teal' } }, chrome: { header: { id: 'keep-header' } }, editableMap: [], templates: [{ id: 'article', name: 'Article v1', type: 'blogPost', version: 1, content: { elements: [{ id: 'text', props: { content: 'Original' }, width: 640, animation: { type: 'fadeIn' } }], dataBindings: [{ source: { kind: 'collection', collectionId: 'published' }, targetPath: 'props.rows' }] } }] };
const state = { sites: [{ id: siteId, teamId: null, slug: 'history', name: 'History', theme: {}, settings: { ...structuredClone(DEFAULT_SITE_SETTINGS), frontendDesign: initial, privateProvider: { apiKey: 'KEEP_ONLY_IN_SETTINGS' } }, isPublished: false, createdAt: new Date(), updatedAt: new Date() }], revisions: [] };
const events = []; let failInsert = false, tail = Promise.resolve();
const dialect = new PgDialect();
const matches = (where, row) => {
 if (!where) return true;
 const query = dialect.sqlToQuery(where);
 const clauses = [...query.sql.matchAll(/"(?:sites|template_revisions)"\."([a-z_]+)"\s*=\s*\$(\d+)/g)];
 return clauses.every(([, column, n]) => row[column.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())] === query.params[Number(n) - 1]);
};
const tableRows = table => table === sites ? state.sites : table === templateRevisions ? state.revisions : assert.fail('Unexpected table');
const db = {
 select(fields) { return { from(table) { let condition, maximum, start = 0; const builder = {
  where(value) { condition = value; return builder; }, orderBy() { return builder; }, limit(value) { maximum = value; return builder; }, offset(value) { start = value; return builder; }, for(mode) { events.push(`lock:${mode}`); return builder; },
  then(resolve, reject) { const rows = tableRows(table).filter(row => matches(condition, row)); return Promise.resolve(fields?.total ? [{ total: rows.length }] : structuredClone(rows.slice(start, maximum === undefined ? undefined : start + maximum))).then(resolve, reject); },
 }; return builder; } }; },
 insert(table) { return { values(value) { let inserted; const run = () => { if (inserted) return inserted; if (failInsert) throw new Error('Snapshot storage unavailable'); events.push('snapshot'); inserted = { id: randomUUID(), createdAt: new Date(), ...structuredClone(value) }; tableRows(table).unshift(inserted); return inserted; }; return { then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); }, returning() { return Promise.resolve([run()]); } }; } }; },
 update(table) { return { set(value) { return { where(condition) { return { returning: async () => { events.push('save'); const rows = tableRows(table).filter(row => matches(condition, row)); for (const row of rows) Object.assign(row, structuredClone(value)); return structuredClone(rows); } }; } }; } }; },
 async transaction(fn) { const prior = tail; let release; tail = new Promise(resolve => { release = resolve; }); await prior; const before = structuredClone(state); events.push('begin'); try { const value = await fn(db); events.push('commit'); return value; } catch (cause) { state.sites = before.sites; state.revisions = before.revisions; events.push('rollback'); throw cause; } finally { release(); } },
};
const repository = createTemplateRevisionRepository(db);
const currentDesign = () => state.sites[0].settings.frontendDesign;
const desired = structuredClone(initial); desired.templates[0].name = 'Article v2'; desired.templates[0].version = 2; desired.templates[0].content.elements[0].props.content = 'Changed';
await repository.commitDesign({ siteId, expectedDesignFingerprint: fingerprint(initial), frontendDesign: desired, source: 'frontendDesign.update' });
assert.deepEqual(events, ['begin', 'lock:update', 'snapshot', 'snapshot', 'save', 'commit']);
assert.equal(state.revisions.length, 2); assert.equal(currentDesign().templates[0].version, 2);
assert.equal(state.sites[0].settings.privateProvider.apiKey, 'KEEP_ONLY_IN_SETTINGS'); assert(!JSON.stringify(state.revisions).includes('KEEP_ONLY_IN_SETTINGS'), 'Snapshots contain only templates, not provider/settings data');
const baseline = state.revisions.find(revision => revision.operation === 'baseline'); const retained = await repository.get(siteId, 'article', baseline.id); retained.snapshot.content.elements[0].props.content = 'Mutated copy';
assert.equal((await repository.get(siteId, 'article', baseline.id)).snapshot.content.elements[0].props.content, 'Original', 'Reads cannot mutate stored snapshots');
assert.equal(await repository.get('00000000-0000-4000-8000-000000000002', 'article', baseline.id), null);
assert.equal(await repository.get(siteId, 'wrong-template', baseline.id), null);
await assert.rejects(repository.commitDesign({ siteId, expectedDesignFingerprint: fingerprint(initial), frontendDesign: desired, source: 'stale' }), error => error.code === 'TEMPLATE_HISTORY_CONFLICT');
const third = structuredClone(desired); third.templates[0].version = 3; failInsert = true;
await assert.rejects(repository.commitDesign({ siteId, expectedDesignFingerprint: fingerprint(desired), frontendDesign: third, source: 'storage-failure' }), /storage unavailable/);
assert.deepEqual(currentDesign(), desired); assert.equal(state.revisions.length, 2, 'Snapshot failures roll back the entire design mutation'); failInsert = false;
const firstRace = structuredClone(desired), secondRace = structuredClone(desired); firstRace.templates[0].version = 3; secondRace.templates[0].version = 4;
const raced = await Promise.allSettled([firstRace, secondRace].map(frontendDesign => repository.commitDesign({ siteId, expectedDesignFingerprint: fingerprint(desired), frontendDesign, source: 'race' })));
assert.equal(raced.filter(result => result.status === 'fulfilled').length, 1); assert.equal(raced.filter(result => result.status === 'rejected' && result.reason.code === 'TEMPLATE_HISTORY_CONFLICT').length, 1, 'Row-locked optimistic concurrency rejects the stale writer');
const generic = createSiteRepository(db);
const staleGenericSettings = structuredClone(state.sites[0].settings), beforeGeneric = structuredClone(currentDesign()), nextTemplate = structuredClone(beforeGeneric); nextTemplate.templates[0].version = 5;
await repository.commitDesign({ siteId, expectedDesignFingerprint: fingerprint(beforeGeneric), frontendDesign: nextTemplate, source: 'template-before-generic' });
await generic.update(siteId, { settings: unrelatedSiteSettingsPatch({ ...staleGenericSettings, seo: { ...staleGenericSettings.seo, title: 'Generic title' } }) });
assert.equal(currentDesign().templates[0].version, 5, 'A stale generic settings copy cannot revert a committed template');
assert.equal(state.sites[0].settings.seo.title, 'Generic title'); assert.equal(state.sites[0].settings.privateProvider.apiKey, 'KEEP_ONLY_IN_SETTINGS');
await assert.rejects(generic.update(siteId, { settings: { frontendDesign: beforeGeneric } }), error => error.code === 'FRONTEND_DESIGN_HISTORY_REQUIRED', 'Direct repository design mutation fails explicitly');
const expected = fingerprint(currentDesign()), newerTemplate = structuredClone(currentDesign()); newerTemplate.templates[0].version = 6;
await generic.update(siteId, { settings: { seo: { description: 'New description' } } });
await repository.commitDesign({ siteId, expectedDesignFingerprint: expected, frontendDesign: newerTemplate, source: 'generic-before-template' });
assert.equal(state.sites[0].settings.seo.title, 'Generic title'); assert.equal(state.sites[0].settings.seo.description, 'New description', 'Template save retains settings updated after its design was loaded');
const concurrentDesign = structuredClone(currentDesign()); concurrentDesign.templates[0].version = 7;
await Promise.all([generic.update(siteId, { settings: { seo: { title: 'Concurrent title' } } }), repository.commitDesign({ siteId, expectedDesignFingerprint: fingerprint(currentDesign()), frontendDesign: concurrentDesign, source: 'concurrent-template-and-generic' })]);
assert.equal(currentDesign().templates[0].version, 7); assert.equal(state.sites[0].settings.seo.title, 'Concurrent title'); assert.equal(state.sites[0].settings.seo.description, 'New description');
assert.equal(events.filter(event => event === 'begin').length, events.filter(event => event === 'lock:update').length, 'Both settings and template writers acquire the same site row lock');
for (let index = 0; index < 205; index++) state.revisions.push({ ...structuredClone(baseline), id: randomUUID(), createdAt: new Date(), snapshot: { ...baseline.snapshot, version: index } });
const first = await repository.list({ siteId, templateId: 'article', limit: 100 }); const second = await repository.list({ siteId, templateId: 'article', limit: 100, offset: 100 }); const thirdPage = await repository.list({ siteId, templateId: 'article', limit: 100, offset: 200 });
assert.equal(first.pagination.total, state.revisions.length); assert(first.pagination.hasMore && second.pagination.hasMore && !thirdPage.pagination.hasMore); assert.equal(first.items.length + second.items.length + thirdPage.items.length, state.revisions.length);
console.log('Template revision repository passed: locked atomic snapshots/save, immutability, provider exclusion, scoped reads, failed storage rollback, competing-write conflict, template/generic settings interleavings and full205+history. PostgreSQL migration was inspected, not applied.');
