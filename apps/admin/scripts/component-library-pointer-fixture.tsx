// Development-only actual component regression. No application route or saved content writes.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ComponentLibrary } from '../src/components/editor/ComponentLibrary';
import '../src/index.css';
function Fixture() {
 const [inserted, setInserted] = useState<string[]>([]);
 const [capture, setCapture] = useState('Ready');
 return <main className="flex gap-6 p-4 font-sans text-slate-800">
  <div style={{ height: 780, width: 300 }}><ComponentLibrary onAddItem={item => setInserted(current => [...current, item.name])} /></div>
  <div className="w-96"><h1>Actual component library pointer regression</h1><p className="my-3" data-testid="pointer-insert-count">Inserted {inserted.length}: {inserted.join(', ')}</p>
   <button type="button" className="rounded border px-4 py-2" onClick={() => { const list = document.querySelector('[data-testid="editor-component-list"]')!; const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-component-add]')]; setCapture(JSON.stringify({ height: list.getBoundingClientRect().height, scrollHeight: list.scrollHeight, buttons: buttons.map(button => ({ name: button.getAttribute('aria-label'), y: Math.round(button.getBoundingClientRect().y) })) })); }}>Capture geometry</button>
   <pre className="mt-2 whitespace-pre-wrap text-xs" data-testid="pointer-geometry">{capture}</pre>
  </div>
 </main>;
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<Fixture />);
