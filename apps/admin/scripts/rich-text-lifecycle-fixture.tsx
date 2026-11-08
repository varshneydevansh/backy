// Development-only browser regression. Served directly by Vite, never an app route.
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BackyEditor } from '@backy-cms/editor';
import { ActiveEditorProvider, useActiveEditor } from '../src/components/editor/ActiveEditorContext';
import { RichTextAuthoringProvider } from '../src/components/editor/RichTextAuthoringContext';
import { RichTextBlock } from '../src/components/editor/blocks/RichTextBlock';
import '../src/index.css';

const seed = [{ type: 'p', id: 'article-paragraph', children: [{ text: 'Saved lifecycle regression content', custom: 'retain' }] }];
const settle = () => new Promise<void>((resolve) => window.setTimeout(resolve, 80));
let renders = 0;
class Boundary extends React.Component<{ children: React.ReactNode }, { error: string }> {
 state = { error: '' };
 static getDerivedStateFromError(error: Error) { return { error: error.message }; }
 render() { return this.state.error ? <p role="alert" data-testid="lifecycle-status">Failed: {this.state.error}</p> : this.props.children; }
}
function Fixture() {
 const context = useActiveEditor();
 const [content, setContent] = useState<any[]>(() => structuredClone(seed));
 const [mounted, setMounted] = useState(true);
 const [pulse, setPulse] = useState(0);
 const [readyCalls, setReadyCalls] = useState(0);
 const [status, setStatus] = useState('Ready to run lifecycle checks');
 const [checking, setChecking] = useState(false);
 const initialClear = useRef(context.clearActiveEditor);
 const callbackChanges = useRef(0);
 if (initialClear.current !== context.clearActiveEditor) { callbackChanges.current++; initialClear.current = context.clearActiveEditor; }
 const snapshot = useRef({ context, readyCalls, content }); snapshot.current = { context, readyCalls, content };
 renders++;
 if (renders > 80) throw new Error('Registration loop exceeded the bounded render limit.');
 useEffect(() => { document.title = `Rich text lifecycle: ${status}`; }, [status]);
 const run = async () => {
  setChecking(true); setStatus('Checking mounted registration and host rerenders…');
  try {
   await settle();
   const before = snapshot.current;
   if (!before.context.activeEditor || before.context.activeEditorElementId !== 'text-lifecycle') throw new Error('Editable writer did not register.');
   for (let index = 0; index < 5; index++) { setPulse((value) => value + 1); await settle(); }
   if (snapshot.current.readyCalls !== before.readyCalls) throw new Error('A host closure rerender repeated editor readiness.');
   if (callbackChanges.current !== 0) throw new Error('Clearing callback changed during active registration.');
   if (snapshot.current.context.activeEditor !== before.context.activeEditor) throw new Error('Host rerenders replaced the active editor.');
   if (snapshot.current.context.selectionRevision > before.context.selectionRevision + 2) throw new Error('Registration repeatedly changed selection revision.');
   setStatus('Checking genuine unmount cleanup…'); setMounted(false); await settle();
   if (snapshot.current.context.activeEditor !== null || snapshot.current.context.activeEditorElementId !== null) throw new Error('Genuine unmount left the active registration behind.');
   setStatus('Checking reopen registration…'); setMounted(true); await settle();
   if (!snapshot.current.context.activeEditor || snapshot.current.context.activeEditorElementId !== 'text-lifecycle') throw new Error('Reopened writer did not register.');
   if (snapshot.current.readyCalls !== before.readyCalls) throw new Error('Unrelated probe editor was notified again during reopen.');
   if (JSON.stringify(snapshot.current.content) !== JSON.stringify(seed)) throw new Error('Registration lifecycle mutated saved content.');
   setStatus('Passed: stable readiness and clearing callbacks, 5 host rerenders, genuine unmount cleanup, reopen, and unchanged saved content.');
  } catch (error) { setStatus(`Failed: ${(error as Error).message}`); }
  finally { setChecking(false); }
 };
 return <RichTextAuthoringProvider entries={[]} apiBaseUrl="/api" mediaContext={{ siteId: 'lifecycle-fixture', scope: 'page', targetId: 'fixture-page' }} selectedId={mounted ? 'text-lifecycle' : null} disabled={false} canViewMedia={false} canCreateMedia={false}>
  <main className="p-4 font-sans text-slate-800">
   <h1 className="text-lg font-semibold">Shared rich text lifecycle regression</h1>
   <p role="status" data-testid="lifecycle-status" className="my-2">{status}</p>
   <button type="button" disabled={checking} onClick={() => void run()} className="min-h-11 rounded border border-slate-400 px-4">Run lifecycle checks</button>
   <p className="mt-2 text-sm" data-testid="lifecycle-metrics">Renders {renders} · Readiness {readyCalls} · Clearing callback changes {callbackChanges.current} · Host pulse {pulse} · Active owner {context.activeEditorElementId || 'none'}</p>
   <div hidden><BackyEditor readOnly value={seed} onEditorReady={() => setReadyCalls((value) => value + 1)} /></div>
   {mounted && <div style={{ width: 640, height: 110 }}><RichTextBlock elementId="text-lifecycle" content={content} isEditable authoredWidth={640} onRequestClose={() => setMounted(false)} onChange={(next) => setContent(next)} /></div>}
  </main>
 </RichTextAuthoringProvider>;
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<Boundary><ActiveEditorProvider><Fixture /></ActiveEditorProvider></Boundary>);
