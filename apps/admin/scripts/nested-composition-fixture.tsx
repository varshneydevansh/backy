// Development-only shared editor proof. Persistence uses one synthetic localStorage key.
import React, { useCallback, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CanvasEditor } from '../src/components/editor/CanvasEditor';
import { CANVAS_COMPONENT_LIBRARY, createCanvasElementFromLibraryItem } from '../src/components/editor/editorCatalog';
import type { PageSettings } from '../src/components/editor/PageSettingsModal';
import type { CanvasElement, CanvasSize } from '../src/types/editor';
import '../src/index.css';

const storageKey = 'backy-dev-nested-composition-proof-v1';
type Snapshot = { elements: CanvasElement[]; settings: PageSettings; size: CanvasSize };
function seed(): Snapshot {
  const elements = ['site-header-section', 'hero-section'].map((id, index) => {
    const item = CANVAS_COMPONENT_LIBRARY.find(candidate => candidate.id === id)!;
    return createCanvasElementFromLibraryItem(item, 0, index === 0 ? 0 : 88, { name: index === 0 ? 'Proof header' : 'Proof hero' });
  });
  return { elements, settings: { title: 'Synthetic nested composition', slug: 'synthetic-nested-composition', status: 'draft', meta: {} }, size: { width: 1200, height: 900, minWidth: 320, maxWidth: 1920 } };
}
function Fixture() {
  const [snapshot, setSnapshot] = useState(seed);
  const latest = useRef(snapshot);
  const [epoch, setEpoch] = useState(0);
  const [status, setStatus] = useState('Seeded concrete header and hero. Local fixture; no API writes.');
  const [capture, setCapture] = useState('');
  const changed = useCallback((elements: CanvasElement[], settings: PageSettings, size?: CanvasSize) => {
    latest.current = { elements, settings, size: size || latest.current.size };
  }, []);
  const saved = useCallback((elements: CanvasElement[], settings: PageSettings, size?: CanvasSize) => {
    const value = { elements, settings, size: size || latest.current.size };
    localStorage.setItem(storageKey, JSON.stringify(value));
    latest.current = value;
    setStatus('Saved synthetic fixture to its dedicated localStorage key.');
  }, []);
  return <main>
    <div className="sticky top-0 z-[110] flex items-center gap-3 border-b bg-white px-4 py-2 text-xs">
      <strong>Shared nested composition · local proof</strong>
      <button type="button" className="rounded border px-3 py-2" onClick={() => {
        const raw = localStorage.getItem(storageKey);
        if (!raw) { setStatus('Save the fixture before reopening.'); return; }
        const next = JSON.parse(raw) as Snapshot;
        latest.current = next; setSnapshot(next); setEpoch(value => value + 1);
        setStatus('Reopened saved synthetic fixture in a newly mounted shared editor.');
      }}>Reopen saved fixture</button>
      <button type="button" className="rounded border px-3 py-2" onClick={() => setCapture(JSON.stringify(latest.current, null, 2))}>Capture authored tree</button>
      <button type="button" className="rounded border px-3 py-2" onClick={() => {
        const tree = document.querySelector<HTMLElement>('[role="tree"][aria-label="Canvas layers"]');
        const pane = document.querySelector<HTMLElement>('[data-testid="editor-inspector-content"]');
        setCapture(JSON.stringify({
          panel: pane?.dataset.activePanel,
          paneHeight: pane?.clientHeight,
          treeHeight: tree?.clientHeight,
          treeScrollHeight: tree?.scrollHeight,
          scrollable: tree ? getComputedStyle(tree).overflowY === 'auto' : false,
          usableTree: !!tree && tree.clientHeight >= 200,
        }, null, 2));
      }}>Capture layer viewport</button>
      <span role="status">{status}</span>
    </div>
    <CanvasEditor key={epoch} initialElements={snapshot.elements} initialSettings={snapshot.settings} initialSize={snapshot.size} onChange={changed} onSave={saved} hideNavigation hideSettings canViewMedia={false} canCreateMedia={false} canViewCollections={false} />
    {capture && <details className="p-4" open><summary>Authored tree including breakpoint overrides</summary><pre data-testid="nested-proof-tree" className="max-h-80 overflow-auto whitespace-pre-wrap text-xs">{capture}</pre></details>}
  </main>;
}
if (import.meta.env.DEV) {
  const root = createRoot(document.getElementById('root')!);
  root.render(<Fixture />);
  import.meta.hot?.dispose(() => root.unmount());
}
