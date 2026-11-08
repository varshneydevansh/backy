import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isBackyDataFigureKey, loadBackyPublicDataFigureRecords, type BackyDataFigureConfig } from '@backy-cms/core';
import { DataFigure } from '@backy-cms/editor/data-figure';
import type { BackyInteractiveComponentNode, BackyInteractiveRegistryEntry } from '@backy-cms/editor';
import { blogInteractiveInitPayload, blogInteractiveSandboxUrl, registeredBlogComponent } from './blogAuthoringInteractive';

function RoundsPreview({ node, measurement = false }: { node: BackyInteractiveComponentNode; measurement?: boolean }): React.ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [paused, setPaused] = useState(false);
  const [round, setRound] = useState(1);
  const value = (key: string) => node.props?.[key] ?? node.controls?.find((control) => control && control.key === key)?.value ?? node.controls?.find((control) => control && control.key === key)?.defaultValue;
  const count = Math.max(1, Math.min(12, Math.round(Number(value('rounds')) || 4)));
  const speed = value('speed');
  useEffect(() => { if (measurement) return; const media = window.matchMedia('(prefers-reduced-motion: reduce)'); const update = () => setReducedMotion(media.matches); update(); media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, [measurement]);
  useEffect(() => { if (measurement || !host.current) return; if (typeof IntersectionObserver === 'undefined') { setInView(true); return; } const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.1 }); observer.observe(host.current); return () => observer.disconnect(); }, [measurement]);
  useEffect(() => { setRound((current) => Math.min(current, count)); }, [count]);
  useEffect(() => { if (measurement || !inView || reducedMotion || paused || speed === 'paused') return; const timer = window.setInterval(() => setRound((current) => current >= count ? 1 : current + 1), speed === 'fast' ? 1100 : speed === 'slow' ? 2600 : 1700); return () => window.clearInterval(timer); }, [count, inView, paused, reducedMotion, speed, measurement]);
  return <div ref={host} data-testid="article-component-native-preview"><svg viewBox="0 0 600 130" role="img" aria-label={`Communication round ${round} of ${count}`} className="block h-auto w-full"><line x1="30" y1="48" x2="570" y2="48" stroke="#cbd5e1" strokeWidth="2" />{Array.from({ length: count }, (_, index) => { const x = count === 1 ? 300 : 30 + index * 540 / (count - 1); return <g key={index}><circle cx={x} cy="48" r={index + 1 === round ? 16 : 10} fill={index + 1 <= round ? '#0f766e' : '#cbd5e1'} /><text x={x} y="91" textAnchor="middle" fill="#475569" fontSize="13">{`Round ${index + 1}`}</text></g>; })}</svg><div className="flex min-w-0 flex-wrap items-center gap-2"><button type="button" disabled={reducedMotion} onClick={() => setPaused((current) => !current)} className="min-h-11 rounded-md border border-slate-300 px-3 text-sm">{paused || reducedMotion ? 'Play' : 'Pause'}</button><button type="button" onClick={() => { setPaused(true); setRound((current) => current >= count ? 1 : current + 1); }} className="min-h-11 rounded-md border border-slate-300 px-3 text-sm">Next round</button><span role="status" className="text-xs text-slate-500">{reducedMotion ? 'Reduced motion: use Next round.' : `Round ${round} of ${count}`}</span></div></div>;
}
function SandboxPreview({ node, src, onHeightChange }: { node: BackyInteractiveComponentNode; src: string; onHeightChange?: (height: number) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const timeoutRef = useRef<number>();
  const [height, setHeight] = useState(300);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [epoch, setEpoch] = useState(0);
  useEffect(() => { onHeightChange?.(height); }, [height, onHeightChange]);
  const payload = useMemo(() => blogInteractiveInitPayload(node), [node]);
  const initialize = useCallback(() => frame.current?.contentWindow?.postMessage(payload, '*'), [payload]);
  useEffect(() => { setStatus('loading'); setError(''); timeoutRef.current = window.setTimeout(() => { setStatus('error'); setError('The component preview did not respond. Check its registered bundle and try again.'); }, 12000); return () => window.clearTimeout(timeoutRef.current); }, [src, epoch]);
  useEffect(() => { initialize(); }, [initialize]);
  useEffect(() => {
    const message = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || !event.data || typeof event.data !== 'object' || event.data.protocol !== 'backy.interactive-component.v1' || event.data.componentKey !== node.componentKey || event.data.version !== node.version) return;
      if (event.data.type === 'backy.interactive-component.ready') { window.clearTimeout(timeoutRef.current); initialize(); }
      else if (event.data.type === 'backy.interactive-component.rendered') { window.clearTimeout(timeoutRef.current); setStatus('ready'); setError(''); }
      else if (event.data.type === 'backy.interactive-component.error') { setStatus('error'); setError('The registered component could not start. Check its reviewed bundle and try again.'); }
      else if (event.data.type === 'backy.interactive-component.resize' && Number.isFinite(event.data.height)) setHeight(Math.max(160, Math.min(1600, event.data.height)));
    };
    window.addEventListener('message', message); return () => window.removeEventListener('message', message);
  }, [initialize, node.componentKey, node.version]);
  return <div data-testid="article-component-sandbox-preview"><iframe key={`${src}:${epoch}`} ref={frame} src={src} title={typeof node.fallback?.title === 'string' ? node.fallback.title : node.componentKey} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" onLoad={initialize} style={{ display: 'block', width: '100%', height, border: 0 }} />{status === 'loading' && <p role="status" className="mt-2 text-xs text-slate-500">Loading registered component…</p>}{status === 'error' && <div role="alert" className="mt-2 text-xs text-red-700">{error}<button type="button" onClick={() => setEpoch((current) => current + 1)} className="ml-2 min-h-11 rounded-md border border-slate-300 px-3 text-slate-700">Retry preview</button></div>}</div>;
}
export function BlogInteractivePreview({ node, entries, apiBaseUrl, siteId, loading, error, measurement = false, measuredHeight, onHeightChange }: { node: BackyInteractiveComponentNode; entries: BackyInteractiveRegistryEntry[]; apiBaseUrl: string; siteId: string; loading?: boolean; error?: string; measurement?: boolean; measuredHeight?: number; onHeightChange?: (height: number) => void }) {
  const entry = registeredBlogComponent(node, entries);
  if (loading) return <p role="status">Loading site components…</p>;
  if (!entry) return <p role="status">{error || 'This component version is unavailable for this site. Its saved configuration is retained.'}</p>;
  if (entry.runtimeAvailable === false && entry.type === 'codeComponent' && entry.renderMode === 'sandbox-iframe') return <div><p role="status">Custom code execution is disabled for this site. This component uses its saved fallback.</p>{typeof node.fallback?.text === 'string' && node.fallback.text && <p>{node.fallback.text}</p>}</div>;
  if (entry.type === 'interactiveFigure' && entry.renderMode === 'trusted-component' && isBackyDataFigureKey(entry.componentKey)) return <DataFigure config={{ ...node.props, componentKey: entry.componentKey } as BackyDataFigureConfig} loadRecords={measurement ? undefined : (collectionId, options) => loadBackyPublicDataFigureRecords({ apiBaseUrl, siteId, collectionId, ...options })} />;
  if (entry.type === 'interactiveFigure' && entry.renderMode === 'trusted-component' && entry.componentKey === 'backy.figure.rounds') return <RoundsPreview node={node} measurement={measurement} />;
  if (measurement && entry.renderMode === 'sandbox-iframe') return <div style={{ height: Number.isFinite(measuredHeight) ? measuredHeight : 300 }} />;
  const src = typeof window === 'undefined' ? '' : blogInteractiveSandboxUrl(apiBaseUrl, siteId, entry, window.location.origin);
  if (src) return <SandboxPreview key={`${siteId}:${entry.componentKey}:${entry.version}`} node={node} src={src} onHeightChange={onHeightChange} />;
  return <p role="status">{typeof node.fallback?.text === 'string' && node.fallback.text || 'This component uses its static fallback in this editor.'}</p>;
}
