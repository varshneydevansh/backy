// Disposable DOM proof. No API calls, storage, real identities or private content.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BackyPage } from '../../../examples/custom-frontend-next/src/lib/render';
import { BackyFrontendInspection } from '../../../examples/custom-frontend-next/src/lib/inspection';
import { captureBackyFrontendDom } from '../../../examples/custom-frontend-next/src/lib/frontend-observation';
import { FrontendCompatibilityPanel } from '../src/components/sites/FrontendCompatibilityPanel';
import { parseFrontendObservationFile } from '../src/lib/frontendObservationImport';
import '../src/index.css';

function Fixture() {
  const [mode, setMode] = useState('complete');
  const [result, setResult] = useState('');
  const payload = { site: { id: 'fixture-site' }, route: { path: '/proof' }, navigation: { primary: [] }, assets: { media: [] }, interactions: {}, seo: {}, content: {
    contentDocument: { version: mode === 'revision' ? '' : 'fixture-r1' }, canvas: { width: 800, height: 420 }, elements: [{ id: 'parent', type: 'container', x: 20, y: 20, width: 600, height: 300,
      children: [{ id: 'child', type: mode === 'unknown' ? 'unknownWidget' : 'text', parentId: 'incorrect-saved-parent', x: 30, y: 40, width: 220, height: 50, responsive: { mobile: { x: 12, width: 160 } }, visible: mode !== 'hidden', props: { content: 'Synthetic public proof text' } },
        ...(mode === 'duplicate' ? [{ id: 'child', type: 'text', props: { content: 'Second marker' } }] : [])] }] } };
  const capture = () => {
    const root = document.querySelector<HTMLElement>('main[data-backy-site-id]')!;
    const value = captureBackyFrontendDom(root, { expectedIds: ['parent', 'child'], ...(mode === 'limit' ? { maxElements: 1 } : {}) });
    const serialized = JSON.stringify(value);
    let imported = '';
    try { imported = parseFrontendObservationFile(serialized, 'fixture-site').siteId; } catch (cause) { imported = String(cause); }
    setResult(JSON.stringify({ capture: value, imported, safe: !serialized.includes('synthetic-input-secret'), domParentProven: value.observation?.elements.find(e => e.id === 'child')?.parentId === 'parent' }, null, 2));
  };
  return <div style={{ padding: 24 }}>
    <h1>Rendered observation fixture</h1><p>Actual starter frames plus actual capture and admin import; storage/delivery are not invoked.</p>
    <label>Capture scenario <select value={mode} onChange={e => { setMode(e.target.value); setResult(''); }}><option value="complete">Complete marked tree</option><option value="hidden">Hidden conditional child</option><option value="duplicate">Duplicate ID</option><option value="revision">Missing revision</option><option value="limit">Inventory cap</option><option value="identity">Missing frontend identity</option><option value="unknown">Unknown mapping</option></select></label>
    <button type="button" onClick={capture}>Run capture proof</button>
    <label>Excluded private input <input defaultValue="synthetic-input-secret" /></label>
    <pre role="status" data-testid="capture-proof-result" style={{ maxHeight: 320, overflow: 'auto', fontSize: 12 }}>{result}</pre>
    {mode === 'identity' ? <main data-backy-site-id="fixture-site" data-backy-route="/proof" data-backy-revision="fixture-r1" style={{ position: 'relative', height: 100 }}><div data-backy-element-id="parent" data-backy-element-type="container"><div data-backy-element-id="child" data-backy-element-type="text"><input defaultValue="synthetic-input-secret" /></div></div><BackyFrontendInspection expectedIds={['parent', 'child']} /></main> : <BackyPage payload={payload} inspect />}
    <FrontendCompatibilityPanel siteId="fixture-site" design={{ schemaVersion: 'backy.frontend-design.v1', templates: [], runtime: { schemaVersion: 'backy.frontend-runtime.v1', frontendId: 'backy-custom-frontend-next-starter', version: '0.1.0', capabilities: {} } } as any} canConfigure={false} onUpdated={() => {}} />
  </div>;
}
const app = createRoot(document.getElementById('root')!); app.render(<Fixture />);
if (import.meta.hot) import.meta.hot.dispose(() => app.unmount());
