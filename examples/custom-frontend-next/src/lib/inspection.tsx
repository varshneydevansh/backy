'use client';
import { useRef, useState } from 'react';
import { captureBackyFrontendDom, type FrontendDomCapture } from './frontend-observation';

/** Explicit owner opt-in. Captures never run on page load or send data to Backy. */
export function BackyFrontendInspection({ expectedIds }: { expectedIds?: string[] }) {
  const host = useRef<HTMLElement>(null);
  const [capture, setCapture] = useState<FrontendDomCapture | null>(null);
  const [error, setError] = useState('');
  const inspect = () => {
    const root = host.current?.closest<HTMLElement>('[data-backy-site-id][data-backy-route]');
    if (!root) { setError('The rendered Backy root is unavailable.'); return; }
    setCapture(captureBackyFrontendDom(root, { expectedIds })); setError('');
  };
  const download = () => {
    if (!capture) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(capture, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'backy-rendered-observation.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return <aside ref={host} data-backy-inspection="" aria-label="Rendered observation capture" style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 2147483647, width: 'min(380px, calc(100vw - 32px))', padding: 16, background: '#fff', color: '#172124', border: '1px solid #cbd5d5', borderRadius: 8, boxShadow: '0 4px 20px #0002', font: '14px system-ui' }}>
    <strong>Rendered observation</strong><p>Capture marked IDs, DOM parents and geometry at this viewport. No content, input values or credentials are read. Animations and interactions need separate checks.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}><button type="button" onClick={inspect} style={{ minHeight: 44, padding: '8px 12px', borderRadius: 6, border: '1px solid #12645c', background: '#12645c', color: '#fff', font: 'inherit', cursor: 'pointer' }}>Capture current DOM</button>{capture && <button type="button" onClick={download} style={{ minHeight: 44, padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5d5', background: '#fff', color: '#172124', font: 'inherit', cursor: 'pointer' }}>Download observation JSON</button>}</div>
    {error && <p role="alert">{error}</p>}
    {capture && <p role="status">{capture.observation?.elements.length || 0} observed elements · {capture.observation?.breakpoint || 'Identity unavailable'} · {capture.observation?.complete ? 'Complete marked tree' : 'Incomplete evidence'}{capture.limitations.length ? '. ' + capture.limitations.join(', ') : ''}</p>}
    {capture?.observation === null && <p>Add a saved frontend runtime declaration and ensure the renderer supplies its identity before comparing this capture.</p>}
  </aside>;
}
