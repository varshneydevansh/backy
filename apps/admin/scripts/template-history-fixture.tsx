// Development-only browser regression: production panel, in-memory API, no saved user content.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TemplateHistoryPanel } from '../src/components/sites/TemplateHistoryPanel';
import type { BackyTemplateRevision, SiteFrontendDesignContract } from '@backy-cms/core';
import '../src/index.css';

const original: SiteFrontendDesignContract['templates'][number] = { id: 'article', type: 'blogPost', name: 'Article', version: 1, content: { elements: [{ id: 'copy', type: 'text', props: { content: 'Original article layout' }, width: 640, height: 110, animation: { type: 'fadeIn' } }], dataBindings: [{ targetPath: 'props.rows', source: { collectionId: 'public-records' } }], metadata: { retainedExtension: true } } };
const second = { ...structuredClone(original), version: 2, name: 'Article changed' };
let current = structuredClone(second), designFingerprint = 'a'.repeat(64), currentFingerprint = 'b'.repeat(64), revisionCounter = 3;
let denyRestore = false;
const requests: string[] = [];
let restores = 0;
const rows: BackyTemplateRevision[] = [
 { schemaVersion: 'backy.template-revision.v1', id: '00000000-0000-4000-8000-000000000002', siteId: 'fixture-site', templateId: 'article', fingerprint: currentFingerprint, snapshot: structuredClone(second), operation: 'save', source: 'frontendDesign.update', createdAt: '2026-01-02T12:00:00.000Z' },
 { schemaVersion: 'backy.template-revision.v1', id: '00000000-0000-4000-8000-000000000001', siteId: 'fixture-site', templateId: 'article', fingerprint: 'c'.repeat(64), snapshot: structuredClone(original), operation: 'baseline', source: 'frontendDesign.update', createdAt: '2026-01-01T12:00:00.000Z' },
];
const fixtureFetch: typeof fetch = async (input, init) => {
 const url = new URL(String(input), window.location.origin); requests.push(`${init?.method || 'GET'} ${url.pathname}`);
 const match = url.pathname.match(/^\/api\/admin\/sites\/([^/]+)\/templates\/(?:(article)\/)?revisions(?:\/([^/]+)\/restore)?$/);
 if (!match) throw new Error('Fixture blocked a request outside its isolated history API.');
 if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
 const [, siteId, templateId, revisionId] = match;
 if (revisionId) {
  if (siteId !== 'fixture-site' || templateId !== 'article') return Response.json({ success: false, error: { message: 'Template revision not found.' } }, { status: 404 });
  if (denyRestore || JSON.parse(String(init?.body)).expectedDesignFingerprint !== designFingerprint) return Response.json({ success: false, error: { message: 'The site design changed. Reload template history before restoring.' } }, { status: 409 });
  const stored = rows.find(row => row.id === revisionId)!; current = structuredClone(stored.snapshot); restores++; currentFingerprint = stored.fingerprint; designFingerprint = 'd'.repeat(64);
  rows.unshift({ ...structuredClone(stored), id: `00000000-0000-4000-8000-${String(revisionCounter++).padStart(12, '0')}`, operation: 'restore', restoredFromRevisionId: stored.id, source: 'frontendDesign.restoreTemplate' });
  return Response.json({ success: true, data: { restoredFromRevisionId: stored.id } });
 }
 const all = siteId === 'fixture-site' ? rows : [], offset = Number(url.searchParams.get('offset'));
 const selected = all.slice(offset, offset + 100).map(row => templateId ? row : { ...row, snapshot: undefined, name: row.snapshot.name, type: row.snapshot.type, version: row.snapshot.version });
 return Response.json({ success: true, data: { siteId, revisions: selected, currentDesignFingerprint: designFingerprint, currentTemplateFingerprint: currentFingerprint, pagination: { total: all.length, limit: 100, offset, hasMore: offset + 100 < all.length } } });
};
function Fixture() {
 const [siteId, setSiteId] = useState('fixture-site'), [canConfigure, setConfigure] = useState(true), [blocked, setBlocked] = useState(false), [updates, setUpdates] = useState(0), [submits, setSubmits] = useState(0);
 return <main className="mx-auto max-w-4xl p-5 text-foreground"><h1 className="text-lg font-semibold">Template history lifecycle regression</h1>
  <p className="mt-2 text-sm">This development fixture uses the production history panel with an isolated API. Review v1, inspect its full snapshot, simulate a conflict, then restore v1. No real content is changed.</p>
  <div className="mt-4 flex flex-wrap gap-4 text-sm"><label><input type="checkbox" checked={canConfigure} onChange={event => setConfigure(event.target.checked)} /> Configuration permission</label>
   <label><input type="checkbox" checked={blocked} onChange={event => { setBlocked(event.target.checked); denyRestore = event.target.checked; }} /> Simulate stale design conflict</label>
   <button type="button" onClick={() => setSiteId(value => value === 'fixture-site' ? 'empty-site' : 'fixture-site')}>Switch isolated site</button></div>
  <p className="mt-3 font-mono text-xs" data-testid="history-fixture-metrics">Site {siteId} · Current version {String(current.version)} · Restores {restores} · Update callbacks {updates} · Form submissions {submits} · Requests {requests.length}</p>
  <form onSubmit={event => { event.preventDefault(); setSubmits(value => value + 1); }}><TemplateHistoryPanel siteId={siteId} templates={siteId === 'fixture-site' ? [current] : []} canConfigure={canConfigure} onUpdated={() => setUpdates(value => value + 1)} /></form>
 </main>;
}
if (import.meta.env.DEV) { globalThis.fetch = fixtureFetch; createRoot(document.getElementById('root')!).render(<Fixture />); }
