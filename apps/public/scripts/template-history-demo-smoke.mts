import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as coreModule from '@backy-cms/core';
const core = (coreModule as any).default || coreModule;
const originalCwd = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'backy-template-history-'));
process.chdir(directory);
try {
 const module = await import('../src/lib/backyStore.ts'); const store = module.default || module;
 const fingerprint = (value: unknown) => createHash('sha256').update(core.serializeTemplateRevisionValue(value)).digest('hex');
 const site = store.getSiteByIdOrSlug('site-demo'); assert(site);
 const design = { schemaVersion: 'backy.frontend-design.v1', status: 'captured', source: { type: 'manual' }, tokens: {}, chrome: {}, editableMap: [], templates: [{ id: 'demo-template', type: 'blogPost', name: 'Initial', version: 1, content: { elements: [{ id: 'copy', type: 'text', props: { content: 'Preserved' }, animation: { type: 'fadeIn' } }] } }] };
 let saved = store.commitDemoFrontendDesign({ siteId: site.id, expectedDesignFingerprint: fingerprint(site.settings.frontendDesign ?? null), frontendDesign: design, source: 'demo-test' });
 const changed = structuredClone(design); changed.templates[0].version = 2;
 saved = store.commitDemoFrontendDesign({ siteId: site.id, expectedDesignFingerprint: fingerprint(saved.settings.frontendDesign), frontendDesign: changed, source: 'demo-test-change' });
 assert.throws(() => store.updateAdminSite(site.id, { settings: { frontendDesign: design } }), (error: any) => error.code === 'FRONTEND_DESIGN_HISTORY_REQUIRED');
 store.updateAdminSite(site.id, { settings: core.unrelatedSiteSettingsPatch({ ...site.settings, seo: { ...site.settings.seo, title: 'Updated generic title' } }) });
 assert.equal(store.getSiteByIdOrSlug(site.id).settings.frontendDesign.templates[0].version, 2, 'Stale generic demo settings preserve committed templates');
 const path = join(directory, 'data/backy/admin-content.json'), before = readFileSync(path, 'utf8'), persisted = JSON.parse(before);
 const retained = store.listTemplateRevisions(site.id, 'demo-template', { limit: 100 }); assert.equal(retained.items.length, 2);
 assert(persisted.templateRevisions.some((revision: any) => revision.snapshot.version === 1));
 const baseline = retained.items.find((revision: any) => revision.snapshot.version === 1); assert(baseline);
 retained.items[0].snapshot.name = 'Mutated response'; assert.notEqual(store.getTemplateRevision(site.id, 'demo-template', retained.items[0].id).snapshot.name, 'Mutated response');
 assert.throws(() => store.commitDemoFrontendDesign({ siteId: site.id, expectedDesignFingerprint: fingerprint(design), frontendDesign: design, source: 'stale' }), (error: any) => error.code === 'TEMPLATE_HISTORY_CONFLICT');
 // A real file-system failure must roll back both in-memory design and retained snapshots.
 const parent = join(directory, 'data/backy'); renameSync(parent, parent + '.saved'); writeFileSync(parent, 'Block directory creation');
 const third = structuredClone(changed); third.templates[0].version = 3;
 assert.throws(() => store.commitDemoFrontendDesign({ siteId: site.id, expectedDesignFingerprint: fingerprint(changed), frontendDesign: third, source: 'failed-file-write' }));
 assert.equal(store.getSiteByIdOrSlug(site.id).settings.frontendDesign.templates[0].version, 2); assert.equal(store.listTemplateRevisions(site.id, 'demo-template').items.length, 2);
 rmSync(parent); renameSync(parent + '.saved', parent);
 writeFileSync(path, '{malformed');
 assert.throws(() => store.commitDemoFrontendDesign({ siteId: site.id, expectedDesignFingerprint: fingerprint(changed), frontendDesign: third, source: 'failed-file-read' }));
 assert.equal(readFileSync(path, 'utf8'), '{malformed', 'Unreadable persisted history fails closed without overwriting the file');
 writeFileSync(path, before);
 // Simulate the ordinary audit cap and file reload using a changed file signature.
 persisted.adminAuditLogs = Array.from({ length: 1001 }, (_, index) => ({ id: `audit-${index}`, siteId: site.id, entity: 'site', entityId: site.id, action: 'test', metadata: {}, createdAt: new Date().toISOString() }));
 writeFileSync(path, JSON.stringify(persisted)); store.recordAdminAuditLog({ siteId: site.id, entity: 'site', entityId: site.id, action: 'audit-cap-test', metadata: {} });
 const capped = JSON.parse(readFileSync(path, 'utf8')); assert.equal(capped.adminAuditLogs.length, 1000); assert.deepEqual(capped.templateRevisions, persisted.templateRevisions, 'Ordinary audit pruning retains all template snapshots');
 capped.templateRevisions.push(...Array.from({ length: 205 }, (_, index) => ({ ...structuredClone(baseline), id: `template_revision_test-${index}` })));
 writeFileSync(path, JSON.stringify(capped)); const later = store.listTemplateRevisions(site.id, 'demo-template', { offset: 200, limit: 100 }); assert(later.items.length > 0); assert.equal(later.pagination.total, 207);
 assert.equal(store.getTemplateRevision('foreign-site', 'demo-template', baseline.id), null);
 console.log('Template demo persistence passed: real atomic-file write, snapshot reopen, cloned scoped reads, failed-file-write rollback, stale conflicts, audit1000cap independence and207retained revisions. Only a temporary directory was written.');
} finally { process.chdir(originalCwd); rmSync(directory, { recursive: true, force: true }); }
