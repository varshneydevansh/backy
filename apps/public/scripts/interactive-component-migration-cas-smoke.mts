import assert from 'node:assert/strict';
import { assertMigrationContract } from './component-migration-contract.mts';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { NextResponse } from 'next/server';
import * as coreModule from '@backy-cms/core';
const { BackyContentConflictError } = coreModule.default || coreModule;
import * as inventoryModule from '../src/lib/interactiveComponentInventory';
import * as propsModule from '../src/lib/componentMigrationProps';
const propsAdmission = propsModule.default || propsModule;
const inventory = inventoryModule.default || inventoryModule;
const require = createRequire(import.meta.url), cwd = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'backy-migration-cas-'));
process.chdir(directory); let checks = 0;
function load(mocks: Record<string, any>) {
  const filename = fileURLToPath(new URL('../src/app/api/admin/sites/[siteId]/interactive-components/[componentKey]/[version]/migrate/route.ts', import.meta.url));
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, module = { exports: {} as any };
  vm.runInNewContext(compiled, { module, exports: module.exports, Request, Response, Headers, URL, Buffer, process, console: { error() {} }, require: (id: string) => id in mocks ? mocks[id] : require(id) }, { filename }); return module.exports;
}
try {
  const imported = await import('../src/lib/backyStore'); const store: any = imported.default || imported;
  for (const demo of [true, false]) {
    const site = store.createAdminSite({ id: 'cas-' + demo, slug: 'cas-slug-' + demo, name: 'CAS fixture' });
    store.createInteractiveComponent(site.id, { componentKey: 'fixture.widget', version: '2.0.0', displayName: 'Target', status: 'active', reviewStatus: 'approved', type: 'interactiveFigure', source: 'registry', renderMode: 'trusted-component' });
    const widget = { type: 'interactive_component', componentKey: 'fixture.widget', version: '1.0.0', props: { nested: { keep: [1, 2], author: 'initial' } }, fallback: { text: 'Keep fallback' }, dataBindings: [{ source: { collectionId: 'fixture-collection' } }], children: [{ text: '' }] };
    const content = { elements: [{ id: 'rich', type: 'paragraph', props: { content: [widget] } }] };
    const pages = [0, 1].map(i => store.createAdminPage(site.id, { title: 'Page ' + i, slug: 'page-' + i, content }));
    const posts = [0, 1].map(i => store.createAdminBlogPost(site.id, { title: 'Post ' + i, slug: 'post-' + i, content }));
    let interleave = true, failPost = true, failAudit = false, cacheCalls = 0, webhookCalls = 0, writes = 0;
    const updatePage = (s: string, id: string, input: any) => {
      assert.equal(s, site.id); assert.ok(input.expectedContent); assert.ok(input.expectedUpdatedAt);
      if (id === pages[0].id && interleave) {
        interleave = false;
        // Real persisted author edit after inventory, deliberately unchanged timestamp.
        const filename = join(directory, 'data/backy/admin-content.json'), saved = JSON.parse(readFileSync(filename, 'utf8'));
        const row = saved.pages.find((row: any) => row.id === id);
        row.content.elements[0].props.content[0].props.nested.author = 'newer author';
        row.content.contentDocument.elements[0].props.content[0].props.nested.author = 'newer author';
        writeFileSync(filename, JSON.stringify(saved));
      }
      let result; try { result = store.updateAdminPage(s, id, input); } catch (error: any) { if (!demo && error.code === 'CONTENT_REVISION_CONFLICT') throw Object.assign(new Error('Untrusted error text must not leak'), { code: 'CONTENT_REVISION_CONFLICT' }); throw error; } writes++; return result;
    };
    const updatePost = (s: string, id: string, input: any) => { assert.equal(s, site.id); if (id === posts[0].id && failPost) throw Error('PRIVATE_PROVIDER_DETAIL'); const result = store.updateAdminBlogPost(s, id, input); writes++; return result; };
    const paginated = (items: any[], p: any) => ({ items: structuredClone(items.slice(p.offset, p.offset + p.limit)), pagination: { total: items.length, offset: p.offset, limit: p.limit, hasMore: p.offset + p.limit < items.length } });
    const repositories: any = { sites: { getById: async (id: string) => id === site.id ? site : null, getBySlug: async (id: string) => id === site.slug ? site : null }, interactiveComponents: { getByKeyVersion: async (s: string, key: string, version: string) => store.getInteractiveComponent(s, key, version) }, pages: { list: async (p: any) => paginated(store.listAdminPages(site.id, { includeUnpublished: true }), p), update: async (s: string, id: string, input: any) => ({ item: updatePage(s, id, input) }) }, posts: { list: async (p: any) => { const data = store.getBlogPosts(site.id, { includeUnpublished: true, limit: p.limit, offset: p.offset }); return { items: data.posts, pagination: data.pagination }; }, update: async (s: string, id: string, input: any) => ({ item: updatePost(s, id, input) }) }, auditLogs: { record: async () => { if (failAudit) throw Error('PRIVATE_AUDIT_DETAIL'); } }, cacheInvalidations: { record: async () => { cacheCalls++; } } };
    const route = load({ '@/lib/backyStore': { ...store, updateAdminPage: updatePage, updateAdminBlogPost: updatePost, recordAdminAuditLog: (...args: any[]) => { if (failAudit) throw Error('PRIVATE_AUDIT_DETAIL'); return store.recordAdminAuditLog(...args); } }, '@/lib/componentMigrationProps': propsAdmission, '@/lib/interactiveComponentInventory': inventory, '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => demo, getRequiredDatabaseRepositories: async () => repositories }, '@/lib/adminAccess': { requireAdminAccess: async () => ({ session: { user: { id: 'fixture-actor' } } }) }, '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: async () => { webhookCalls++; return []; } } });
    async function call(dryRun: boolean) {
      const response = await route.POST(new Request('http://fixture.invalid/migrate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ targetVersion: '2.0.0', dryRun }) }), { params: Promise.resolve({ siteId: site.slug, componentKey: 'fixture.widget', version: '1.0.0' }) });
      assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.success, true); assertMigrationContract(200, body); checks++; return body.data;
    }
    const preview = await call(true); assert.equal(preview.migratedTargets.length, 4); assert.equal(writes, 0);
    assert.equal(preview.reviewedPreview.siteId, site.id);
    assert.equal(preview.reviewedPreview.targets.length, 4);
    assert(preview.reviewedPreview.targets.every((row: any) => /^[a-f0-9]{64}$/.test(row.contentFingerprint)));
    async function rejectedReview(review: any, status = 409) {
      const before = writes;
      const response = await route.POST(new Request('http://fixture.invalid/migrate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ targetVersion: '2.0.0', dryRun: false, reviewedPreview: review }) }), { params: Promise.resolve({ siteId: site.slug, componentKey: 'fixture.widget', version: '1.0.0' }) });
      assertMigrationContract(status, await response.clone().json());
      assert.equal(response.status, status); assert.equal((await response.json()).error.code, status === 400 ? 'INVALID_MIGRATION_PREVIEW' : 'MIGRATION_PREVIEW_CONFLICT');
      assert.equal(writes, before, 'Preview drift cannot begin document writes'); checks++;
    }
    await rejectedReview({ ...preview.reviewedPreview, targets: [...preview.reviewedPreview.targets, preview.reviewedPreview.targets[0]] }, 400);
    await rejectedReview({ ...preview.reviewedPreview, siteId: 'foreign' });
    await rejectedReview({ ...preview.reviewedPreview, source: { componentKey: 'fixture.widget', version: 'other' } });
    await rejectedReview({ ...preview.reviewedPreview, targets: preview.reviewedPreview.targets.slice(1) });
    const added = store.createAdminPage(site.id, { title: 'Not reviewed', slug: 'not-reviewed', content });
    await rejectedReview(preview.reviewedPreview); store.deleteAdminPage(site.id, added.id);
    const filename = join(directory, 'data/backy/admin-content.json'), originalFile = readFileSync(filename, 'utf8'), changed = JSON.parse(originalFile);
    const changedPage = changed.pages.find((row: any) => row.id === pages[0].id);
    changedPage.content.elements[0].props.content[0].props.nested.author = 'unreviewed author';
    changedPage.content.contentDocument.elements[0].props.content[0].props.nested.author = 'unreviewed author';
    writeFileSync(filename, JSON.stringify(changed)); await rejectedReview(preview.reviewedPreview); writeFileSync(filename, originalFile);
    store.updateInteractiveComponent(site.id, 'fixture.widget', '2.0.0', { description: 'Changed registry definition after author review' });
    await rejectedReview(preview.reviewedPreview);
    const currentPreview = await call(true);
    assertMigrationContract('request', { targetVersion: '2.0.0', dryRun: false, reviewedPreview: currentPreview.reviewedPreview });
    assert.throws(() => assertMigrationContract('request', { targetVersion: '2.0.0', reviewedPreview: { ...currentPreview.reviewedPreview, targetFingerprint: 'invalid' } }));
    // A valid reviewed apply preserves existing apply-time CAS conflict reporting.
    const applied = await route.POST(new Request('http://fixture.invalid/migrate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ targetVersion: '2.0.0', dryRun: false, reviewedPreview: currentPreview.reviewedPreview }) }), { params: Promise.resolve({ siteId: site.slug, componentKey: 'fixture.widget', version: '1.0.0' }) });
    assert.equal(applied.status, 200); assertMigrationContract(200, await applied.clone().json()); const result = (await applied.json()).data; checks++;
 assert.equal(result.outcome, 'partial'); assert.equal(result.migratedTargets.length, 2); assert.equal(result.failedTargets.length, 2); assert.deepEqual(new Set(result.failedTargets.map((row: any) => row.code)), new Set(['CONTENT_REVISION_CONFLICT', 'MIGRATION_WRITE_FAILED'])); assert.equal(result.summary.targets, 2); assert.equal(result.retry.reloadPreview, true); assert.equal(result.concurrencyBoundary, demo ? 'demo-single-process' : 'database-row-lock'); assert(!JSON.stringify(result).includes('PRIVATE_PROVIDER_DETAIL')); assert(!JSON.stringify(result).includes('Untrusted error text'));
    const current = store.getAdminPageById(site.id, pages[0].id); assert.equal(current.updatedAt, pages[0].updatedAt); assert.equal(current.content.elements[0].props.content[0].props.nested.author, 'newer author'); assert.equal(current.content.elements[0].props.content[0].version, '1.0.0');
    for (const [get, id] of [[store.getAdminPageById, pages[1].id], [store.getAdminBlogPostById, posts[1].id]] as any[]) assert.equal(get(site.id, id).content.elements[0].props.content[0].version, '2.0.0');
    failPost = false; failAudit = true;
    const retryPreview = await call(true); assert.equal(retryPreview.migratedTargets.length, 2, 'Retry skips confirmed previous commits');
    const retry = await call(false); assert.equal(retry.failedTargets.length, 0); assert.equal(retry.migratedTargets.length, 2); assert.equal(retry.completionWarnings.length, 1); assert.equal(retry.outcome, 'partial'); assert.equal(retry.retry.required, false); assert(!JSON.stringify(retry).includes('PRIVATE_AUDIT_DETAIL')); assert.equal(webhookCalls, 2, 'Audit failure does not prevent other completion notifications'); if (!demo) assert.equal(cacheCalls, 2);
    const migrated = store.getAdminPageById(site.id, pages[0].id); assert.equal(migrated.content.elements[0].props.content[0].props.nested.author, 'newer author'); assert.deepEqual(migrated.content.elements[0].props.content[0].fallback, widget.fallback); assert.deepEqual(migrated.content.elements[0].props.content[0].dataBindings, widget.dataBindings);
    const last = await call(false); assert.equal(last.migratedTargets.length, 0); assert.equal(last.outcome, 'complete');
    // Direct actual demo-store CAS rejects stale page/post snapshots and preserves the winner.
    for (const [get, update, id] of [[store.getAdminPageById, store.updateAdminPage, pages[0].id], [store.getAdminBlogPostById, store.updateAdminBlogPost, posts[0].id]] as any[]) {
      const snapshot = get(site.id, id), expectation = { expectedContent: snapshot.content, expectedUpdatedAt: snapshot.updatedAt };
      update(site.id, id, { ...expectation, content: { ...snapshot.content, metadata: { authorWinner: true } } });
      assert.throws(() => update(site.id, id, { ...expectation, content: snapshot.content }), BackyContentConflictError);
      assert.equal(get(site.id, id).content.metadata.authorWinner, true);
      assert.throws(() => update('foreign-site', id, { ...expectation, content: snapshot.content }), BackyContentConflictError); checks++;
    }
  }
  console.log(`Component migration CAS checks passed: ${checks}; actual handler + persisted demo store, both route adapters, same-timestamp author conflict, mixed commit/failure, reviewed retry, independent notifications, no secret errors.`);
} finally { process.chdir(cwd); rmSync(directory, { recursive: true, force: true }); }
