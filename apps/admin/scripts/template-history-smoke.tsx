import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTemplateHistory, restoreTemplateRevision } from '../src/lib/templateHistoryClient';
import { TemplateHistoryPanel } from '../src/components/sites/TemplateHistoryPanel';

async function main() {
 const design = 'a'.repeat(64), current = 'b'.repeat(64);
 const snapshot = { id: 'article', type: 'blogPost' as const, name: 'Article', version: 1, content: { elements: [{ id: 'body', props: { content: 'Retain' } }] } };
 const rows = Array.from({ length: 205 }, (_, index) => ({ schemaVersion: 'backy.template-revision.v1', id: `revision-${index}`, siteId: 'draft-site', templateId: 'article', snapshot: structuredClone(snapshot), fingerprint: current, source: 'frontendDesign.update', operation: 'save', createdAt: '2026-01-01T00:00:00.000Z' }));
 const calls: Array<{ url: string; init?: RequestInit }> = [];
 const data = (offset: number) => ({ siteId: 'draft-site', revisions: rows.slice(offset, offset + 100), currentDesignFingerprint: design, currentTemplateFingerprint: current, pagination: { total: 205, limit: 100, offset, hasMore: offset + 100 < 205 } });
 const request: typeof fetch = async (url, init) => { calls.push({ url: String(url), init }); const offset = Number(new URL(String(url), 'http://fixture.invalid').searchParams.get('offset')); return Response.json({ success: true, data: data(offset) }); };
 const signal = new AbortController().signal;
 const loaded = await loadTemplateHistory('draft-site', 'article', signal, request);
 assert.equal(loaded.revisions.length, 205); assert.equal(loaded.pagination.total, 205);
 assert.deepEqual(calls.map(call => new URL(call.url, 'http://fixture.invalid').searchParams.get('offset')), ['0', '100', '200']);
 assert(calls.every(call => call.init?.credentials === 'include' && call.init?.signal === signal && call.url.includes('/sites/draft-site/templates/article/revisions')));
 for (const [name, change] of [
  ['changed fingerprint', (value: any) => { value.currentDesignFingerprint = 'c'.repeat(64); }],
  ['changed count', (value: any) => { value.pagination.total++; }],
  ['duplicate identity', (value: any) => { value.revisions[0] = structuredClone(rows[0]); }],
  ['foreign template', (value: any) => { value.revisions[0].templateId = 'private-other-template'; }],
  ['wrong site', (value: any) => { value.siteId = 'foreign'; }],
  ['missing snapshot', (value: any) => { delete value.revisions[0].snapshot; }],
  ['silent truncation', (value: any) => { value.pagination.hasMore = false; }],
 ] as const) {
  await assert.rejects(loadTemplateHistory('draft-site', 'article', signal, async url => { const offset = Number(new URL(String(url), 'http://fixture.invalid').searchParams.get('offset')); const value = data(offset); if (offset) change(value); return Response.json({ success: true, data: value }); }), undefined, name);
 }
 await assert.rejects(loadTemplateHistory('draft-site', 'article', signal, async () => Response.json({ success: false, error: { message: 'History storage unavailable' } }, { status: 503 })), /History storage unavailable/);
 const controller = new AbortController(); controller.abort(); let requests = 0;
 await assert.rejects(loadTemplateHistory('draft-site', 'article', controller.signal, async () => { requests++; return Response.json({}); })); assert.equal(requests, 0);
 let sent: RequestInit | undefined, address = '';
 const result = await restoreTemplateRevision('draft-site', 'article', 'registered-revision', design, signal, async (url, init) => { address = String(url); sent = init; return Response.json({ success: true, data: { restoredFromRevisionId: 'registered-revision' } }); });
 assert(address.endsWith('/sites/draft-site/templates/article/revisions/registered-revision/restore')); assert.equal(sent?.credentials, 'include');
 assert.deepEqual(JSON.parse(String(sent?.body)), { expectedDesignFingerprint: design }, 'Restore sends stored identity and conflict token, never a client snapshot'); assert.equal(result.restoredFromRevisionId, 'registered-revision');
 await assert.rejects(restoreTemplateRevision('draft-site', 'article', 'registered-revision', design, signal, async () => Response.json({ success: false, error: { message: 'The site design changed. Reload.' } }, { status: 409 })), /site design changed/);
 const html = renderToStaticMarkup(<TemplateHistoryPanel siteId="draft-site" templates={[snapshot]} canConfigure={false} onUpdated={() => {}} />);
 assert(html.includes('Template history') && html.includes('Article · blogPost') && html.includes('Reload history'));
 assert.equal((html.match(/<button/g) || []).length, (html.match(/type="button"/g) || []).length, 'Nested settings forms cannot submit through panel controls');
 console.log('Template history authoring passed: complete205pagination, stale/foreign/malformed/duplicate failure, cancellation, safe identity-only restore and production panel SSR controls. Live interactions use the browser fixture separately.');
}
void main();
