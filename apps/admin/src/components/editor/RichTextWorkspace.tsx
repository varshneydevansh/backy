import React, { useId } from 'react';

/** A normal-scale, transient editor surface; geometry changes require explicit Fit. */
export function RichTextWorkspace({ elementId, children, onDone, onFit }: {
 elementId?: string; children: React.ReactNode; onDone: () => void; onFit?: () => void;
}): React.ReactElement {
 const descriptionId = useId();
 return <section
  role="dialog" aria-modal="false" aria-label="Canvas text editing workspace" aria-describedby={descriptionId}
  data-backy-canvas-text-workspace="true" data-element-id={elementId}
  className="ignore-click-outside/toolbar fixed z-[95] flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-300 bg-white text-slate-800 shadow-2xl"
  style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'min(720px, calc(100vw - 32px))', height: 'min(640px, calc(100dvh - 32px))' }}
  onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}
  onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onDone(); } }}
 >
  <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
   <div><h2 className="text-sm font-semibold text-slate-900">Text workspace</h2><p id={descriptionId} className="mt-1 text-xs text-slate-500">Edit at normal scale. Fit the block when you want to change its Canvas height.</p></div>
   <div className="flex items-center gap-2">
    {onFit && <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onFit} className="min-h-11 rounded-md border border-slate-300 px-3 text-sm font-medium">Fit block to content</button>}
    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onDone} className="min-h-11 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white">Done</button>
   </div>
  </header>
  <div className="min-h-0 flex-1 p-3" data-backy-text-workspace-body="true">{children}</div>
 </section>;
}
