import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { ReusableSectionPropagationPreview, canApplyReusableSectionPropagation } from '../src/components/editor/ReusableSectionPropagationPreview';
import { refreshReusableSectionInstances, type ReusableSectionInstancesRefreshResult } from '../src/lib/adminContentApi';

const preview: ReusableSectionInstancesRefreshResult = {
  dryRun: true, sectionId: 'section-proof', reviewedPreview: { schemaVersion: 'backy.reusable-section-propagation-preview.v1', siteId: 'site-proof', sectionId: 'section-proof', sourceFingerprint: 'a'.repeat(64), inventoryFingerprint: 'b'.repeat(64), scope: { targetType: 'all', targetId: null, includeProducts: true }, targets: [{ type: 'page', id: 'page-proof', updatedAt: '2026-01-01T00:00:00.000Z', contentFingerprint: 'c'.repeat(64) }] },
  refreshedTargets: [{ type: 'page', id: 'page-proof', title: '<Saved page>', slug: 'saved-page', refreshed: 2 }], totals: { targets: 1, instances: 2 }, outcome: 'complete', completionWarnings: [], concurrencyBoundary: 'database-serializable-transaction',
};
assert.equal(canApplyReusableSectionPropagation(null, 'site-proof','section-proof'),false);
assert.equal(canApplyReusableSectionPropagation(preview, 'site-proof','section-proof'),true);
assert.equal(canApplyReusableSectionPropagation(preview, 'other-site','section-proof'),false);
assert.equal(canApplyReusableSectionPropagation(preview, 'site-proof','other-section'),false);
assert.equal(canApplyReusableSectionPropagation({...preview,dryRun:false}, 'site-proof','section-proof'),false);
const markup = renderToStaticMarkup(<ReusableSectionPropagationPreview preview={preview}/>);
assert(markup.includes('2 instances across 1 targets') && markup.includes('&lt;Saved page&gt;'));
assert(markup.includes('complete selected inventory') && markup.includes('one serializable transaction'));
const demo = renderToStaticMarkup(<ReusableSectionPropagationPreview preview={{...preview,concurrencyBoundary:'demo-single-process'}}/>);
assert(demo.includes('within one process') && demo.includes('Use PostgreSQL'));
const originalFetch = globalThis.fetch, calls: RequestInit[] = [];
try {
  globalThis.fetch = async (_url, init) => { calls.push(init!); return Response.json({success:true,data:preview}); };
  await refreshReusableSectionInstances('site-proof','section-proof',{dryRun:true});
  await refreshReusableSectionInstances('site-proof','section-proof',{reviewedPreview:preview.reviewedPreview});
  assert.equal(calls[0].credentials,'include');
  assert.deepEqual(JSON.parse(String(calls[0].body)),{dryRun:true});
  assert.deepEqual(JSON.parse(String(calls[1].body)),{reviewedPreview:preview.reviewedPreview});
} finally { globalThis.fetch = originalFetch; }
const source=readFileSync(new URL('../src/routes/reusable-sections.tsx',import.meta.url),'utf8');
assert(source.includes('reviewedPreview: propagationPreview!.reviewedPreview'));
assert(source.includes('setPropagationPreview(dryRun ? result : null)'));
assert(source.includes('canApplyReusableSectionPropagation(propagationPreview, activeSection?.siteId, activeSection?.id)'));
assert(source.includes('result.completionWarnings.join'));
console.log('Reusable propagation admin rendered/transport gate passed: reviewed target list, escaped authored title, honest transaction/demo boundary, no apply before matching preview, canonical snapshot forwarding with authenticated transport and preview reset/postcommit warnings. Browser route remains a separate gate.');
