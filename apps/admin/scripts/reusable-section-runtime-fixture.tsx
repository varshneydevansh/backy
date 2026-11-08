/** Disposable actual editor proof. Library HTTP is a synthetic fixture, not operator/provider proof. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CanvasEditor } from '../src/components/editor/CanvasEditor';
import type { CanvasElement } from '../src/types/editor';

const seed: CanvasElement[] = [{ id: 'retained-second', type: 'button', name: 'Retained second root', x: 140, y: 160, width: 240, height: 70,
  props: { label: 'Old second root', reusableSection: { sectionId: 'section-204', siteId: 'site-section-proof', mode: 'synced', rootIndex: 1, sourceElementId: 'source-second', extension: { retain: true } } } }];
const initialSettings = { title: 'Actual reusable section proof', slug: 'section-proof', status: 'draft' as const, meta: { title: 'Section proof', description: '', keywords: [], jsonLd: [] } };
function App() {
  const [elements, setElements] = useState(seed), [epoch, setEpoch] = useState(0), [current, setCurrent] = useState(seed), [saved, setSaved] = useState<CanvasElement[]>();
  const [sourceMode, setSourceMode] = useState('current');
  async function mode(value: string) { await fetch(`/fixture/source-mode?mode=${value}`, { method: 'POST' }); setSourceMode(value); }
  return <main><header style={{ padding: 8, position: 'fixed', bottom: 0, left: 280, zIndex: 1000, background: '#fff', border: '1px solid #aaa' }}><h1>Actual reusable section acceptance</h1><p>Actual CanvasEditor; synthetic library HTTP and local save.</p>
    <button onClick={() => mode('reordered')}>Reorder source and update second</button>{' '}
    <button onClick={() => mode('missing')}>Remove saved source</button>{' '}
    <button onClick={() => { const next = saved || current; setElements(structuredClone(next)); setEpoch(v => v + 1); }}>Reopen saved composition</button>
    <p data-testid="source-mode">Source mode: {sourceMode}</p></header>
    <CanvasEditor key={epoch} initialElements={elements} initialSettings={initialSettings} initialSize={{ width: 900, height: 700 }} initialSelectedElementId="retained-second" hideNavigation hideSettings
      mediaContext={{ siteId: 'site-section-proof' }} canViewMedia={false} canCreateMedia={false} canViewCollections={false}
      onChange={next => setCurrent(next)} onSave={next => { const snapshot = structuredClone(next); localStorage.setItem('backy-section-proof-save', JSON.stringify(snapshot)); setSaved(snapshot); }} />
    <pre data-testid="section-composition-proof" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify({ current, saved }, null, 2)}</pre>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
