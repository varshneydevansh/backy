import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ComponentMigrationPanel, ComponentMigrationResults } from '../src/components/sites/ComponentMigrationPanel';
import { migrateComponentVersion, loadComponentMigrationRegistry, canApplyComponentMigration, type ComponentMigrationData } from '../src/lib/componentMigrationClient';
import { AdminContentApiError } from '../src/lib/adminContentApi';
async function main() {
 const source = { componentKey: 'fixture.widget', version: '1.0.0' }, target = { componentKey: 'fixture.widget', version: '2.0.0' };
 const review = { siteId: 'site/a', source, target, targetFingerprint: 'a'.repeat(64), targets: [{ targetType: 'page' as const, targetId: 'page/a', contentFingerprint: 'b'.repeat(64) }, { targetType: 'post' as const, targetId: 'post/a', contentFingerprint: 'c'.repeat(64) }] };
 const row = (targetType: 'page' | 'post', targetId: string) => ({ targetType, targetId, title: targetType === 'page' ? 'Saved page' : 'Saved post', slug: targetId, status: 'draft', migrated: 1, elementPaths: ['elements[0].props.content[0]'] });
 const data: ComponentMigrationData = { dryRun: true, source, target, reviewedPreview: review, migratedTargets: [row('page', 'page/a'), row('post', 'post/a')], failedTargets: [], completionWarnings: [], outcome: 'complete', retry: { required: false, reloadPreview: false, message: null }, concurrencyBoundary: 'database-row-lock', summary: { targets: 2, elements: 2, scanned: { pages: 3, posts: 2 } } };
 const calls: Array<{ url: string; init?: RequestInit }> = [];
 const signal = new AbortController().signal;
 const response = (value: unknown) => Response.json({ success: true, requestId: 'fixture', data: value });
 const request: typeof fetch = async (url, init) => { calls.push({ url: String(url), init }); return response(data); };
 const preview = await migrateComponentVersion('site/a', { source, target, dryRun: true }, signal, request);
 assert.equal(preview.migratedTargets.length, 2); assert(calls[0].url.includes('/sites/site%2Fa/interactive-components/fixture.widget/1.0.0/migrate'));
 assert.equal(calls[0].init?.credentials, 'include'); assert.equal(calls[0].init?.signal, signal); assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { targetComponentKey: target.componentKey, targetVersion: target.version, dryRun: true });
 assert.equal(canApplyComponentMigration(preview, false), false); assert.equal(canApplyComponentMigration(preview, true), true);
 const partial: ComponentMigrationData = { ...data, dryRun: false, outcome: 'partial', migratedTargets: [row('page', 'page/a')], failedTargets: [{ targetType: 'post', targetId: 'post/a', code: 'CONTENT_REVISION_CONFLICT', message: 'Reload the preview.' }], completionWarnings: ['Cache invalidation unavailable; confirmed document retained.'], retry: { required: true, reloadPreview: true, message: 'Reload before retrying; confirmed instances skipped.' }, summary: { ...data.summary, targets: 1, elements: 1 } };
 const applied = await migrateComponentVersion('site/a', { source, target, dryRun: false, reviewedPreview: review }, signal, async (url, init) => { calls.push({ url: String(url), init }); return response(partial); });
 assert.deepEqual(JSON.parse(String(calls.at(-1)?.init?.body)).reviewedPreview, review, 'Apply carries exact server snapshot and target fingerprint');
 const unreviewed = structuredClone(partial); unreviewed.reviewedPreview.targets[0].contentFingerprint = 'd'.repeat(64);
 await assert.rejects(migrateComponentVersion('site/a', { source, target, dryRun: false, reviewedPreview: review }, signal, async () => response(unreviewed)), /differs from the reviewed snapshot/);
 assert.equal(applied.outcome, 'partial'); assert.equal(canApplyComponentMigration(applied, true), false, 'Applied results cannot be reused as previews');
 let forbiddenCalls = 0;
 await assert.rejects(migrateComponentVersion('site/a', { source, target, dryRun: false }, signal, async () => { forbiddenCalls++; return response(data); }), /review a migration preview/); assert.equal(forbiddenCalls, 0);
 await assert.rejects(migrateComponentVersion('site/a', { source, target, dryRun: false, reviewedPreview: review }, signal, async () => Response.json({ success: false, error: { code: 'MIGRATION_PREVIEW_CONFLICT', message: 'Changed documents. Reload preview.' } }, { status: 409 })), cause => cause instanceof AdminContentApiError && cause.code === 'MIGRATION_PREVIEW_CONFLICT');
 await assert.rejects(migrateComponentVersion('site/a', { source, target, dryRun: true }, signal, async () => Response.json({success:false,error:{code:'MIGRATION_PROPS_INCOMPATIBLE',message:'Fix authored props.',details:{findings:[{targetType:'page',targetId:'page/a',elementPath:'elements[0].props',instancePath:'/count',keyword:'type'}]}}},{status:422})), cause => cause instanceof AdminContentApiError && cause.code === 'MIGRATION_PROPS_INCOMPATIBLE' && cause.message.includes('page/a · elements[0].props/count (type)'));
 for (const mutate of [
  (value: any) => { delete value.reviewedPreview; },
  (value: any) => { value.reviewedPreview.siteId = 'foreign'; },
  (value: any) => { value.reviewedPreview.targetFingerprint = 'invalid'; },
  (value: any) => { value.target.version = 'unrequested'; },
  (value: any) => { value.summary.targets = 999; },
  (value: any) => { value.migratedTargets[0].targetId = 'unreviewed'; },
  (value: any) => { value.reviewedPreview.targets.push(value.reviewedPreview.targets[0]); },
  (value: any) => { value.failedTargets = [{ targetType: 'page', targetId: 'page/a', code: 'CONTENT_REVISION_CONFLICT', message: 'Already applied' }]; },
 ]) { const altered = structuredClone(data); mutate(altered); await assert.rejects(migrateComponentVersion('site/a', { source, target, dryRun: true }, signal, async () => response(altered))); }
 const controller = new AbortController(); controller.abort(); await assert.rejects(migrateComponentVersion('site/a', { source, target, dryRun: true }, controller.signal, request));
 const entries = Array.from({ length: 103 }, (_, index) => ({ componentKey: 'fixture.widget', version: String(index), status: 'active', displayName: 'Widget', type: 'interactiveFigure', renderMode: 'trusted-component', source: 'registry' }));
 const registryCalls: string[] = [];
 const registry = await loadComponentMigrationRegistry('site/a', signal, async (url, init) => { registryCalls.push(String(url)); assert.equal(init?.credentials, 'include'); const offset = Number(new URL(String(url), 'https://fixture.invalid').searchParams.get('offset')); return response({ siteId: 'site/a', components: entries.slice(offset, offset + 100), pagination: { total: 103, offset, limit: 100, hasMore: offset + 100 < 103 } }); });
 assert.equal(registry.components.length, 103); assert.equal(registryCalls.length, 2);
 const view = renderToStaticMarkup(<ComponentMigrationPanel siteId="site/a" canView={true} canEdit={false} />);
 assert(view.includes('Component version migrations') && view.includes('Page edit permission') && view.includes('Preview migration'));
 assert.equal((view.match(/<button/g) || []).length, (view.match(/type="button"/g) || []).length, 'Panel never submits parent settings forms');
 const previewHtml = renderToStaticMarkup(<ComponentMigrationResults siteId="site/a" data={data} />);
 assert(previewHtml.includes('Preview only') && previewHtml.includes('Exact reference locations') && previewHtml.includes('elements[0].props.content[0]') && previewHtml.includes('/pages/page%2Fa/edit?siteId=site%2Fa'));
 const partialHtml = renderToStaticMarkup(<ComponentMigrationResults siteId="site/a" data={partial} />);
 for (const text of ['Partial outcome', 'Failed documents retained', 'CONTENT_REVISION_CONFLICT', 'Completion warnings', 'confirmed document retained', 'confirmed instances skipped']) assert(partialHtml.includes(text));
 console.log('Admin component migration passed: complete discovery pagination, readonly preview/apply manifest transport, no unreviewed apply, drift409, partial result accounting, incompatible/foreign response denial, cancellation and production result/permission/form-safe controls. Browser interaction proof remains separate.');
}
void main();
