// Development-only browser fixture: generated portable module + real GSAP.
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { acquireAnimationHydration } from '../../../examples/custom-frontend-next/src/lib/portable-animation';
import '../src/index.css';
gsap.registerPlugin(ScrollTrigger);
const config = (trigger: string, to: object) => JSON.stringify({ type: 'custom', trigger, duration: .12, from: { x: 0, opacity: .5 }, to });
function Fixture() {
 const root = useRef<HTMLDivElement>(null), media = useRef(new EventTarget() as EventTarget & { matches: boolean }), stop = useRef<() => void>();
 const unrelated = useRef<ReturnType<typeof ScrollTrigger.create>>();
 const [reduced, setReduced] = useState(false), [dynamic, setDynamic] = useState(false), [version, setVersion] = useState(1), [result, setResult] = useState('Ready'), [active, setActive] = useState(true);
 useEffect(() => {
  media.current.matches = false;
  unrelated.current = ScrollTrigger.create({ trigger: '#portable-unrelated', start: 'top bottom' });
  stop.current = acquireAnimationHydration({ root: root.current!, engine: gsap, media: media.current as MediaQueryList });
  return () => { stop.current?.(); unrelated.current?.kill(); };
 }, []);
 const capture = () => {
  const header = { source: 'generated portable-animation.js', active, reduced, unrelatedAlive: ScrollTrigger.getAll().includes(unrelated.current!), triggers: ScrollTrigger.getAll().length };
  const rows = ['load','nested','hover','scroll','dynamic'].map(id => {
   const element = document.getElementById('portable-'+id);
   return element ? { id, x: Number(gsap.getProperty(element, 'x')), opacity: Number(getComputedStyle(element).opacity), authored: JSON.parse(element.getAttribute('data-animation') || '{}') } : { id, absent: true };
  });
  setResult(JSON.stringify(header, null, 2) + '\n' + rows.map(row => JSON.stringify(row)).join('\n'));
 };
 return <main style={{ padding:24, fontFamily:'system-ui', color:'#1e293b' }}>
  <h1>Portable generated animation · browser proof</h1>
  <p>Real GSAP with examples/custom-frontend-next/src/lib/portable-animation.js. This dev React fixture is separate from deployed Next hydration. The reduced-motion control simulates the media-query change signal.</p>
  <div style={{ display:'flex', flexWrap:'wrap', gap:12, margin:'20px 0', position:'sticky', top:0, background:'white', padding:12, zIndex:10 }}>
   <button type="button" onClick={capture}>Capture portable measurements</button>
   <label><input type="checkbox" checked={reduced} onChange={event => { setReduced(event.target.checked); media.current.matches = event.target.checked; media.current.dispatchEvent(new Event('change')); }} />Simulate reduced motion</label>
   <button type="button" onClick={() => setDynamic(true)}>Insert dynamic animation</button>
   <button type="button" onClick={() => setVersion(2)}>Change nested endpoints</button>
   <button type="button" onClick={() => setDynamic(false)}>Remove dynamic animation</button>
   <button type="button" onClick={() => document.getElementById('portable-scroll')?.scrollIntoView({ block:'center' })}>Scroll to portable animation</button>
   <button type="button" onClick={() => { stop.current?.(); setActive(false); }}>Dispose portable controller</button>
  </div>
  <pre role="status" style={{ whiteSpace:'pre-wrap', background:'#f8fafc', padding:12, fontSize:12 }}>{result}</pre>
  <div id="portable-unrelated">An independent widget ScrollTrigger must survive portable cleanup.</div>
  <div ref={root}>
   <div id="portable-load" data-animation={config('load', { x:150, opacity:.4 })} style={{ background:'#e2e8f0', padding:20, margin:20, width:320 }}>Parent: authored X150, opacity0.4
    <div id="portable-nested" data-animation={config('load', { x:version === 1 ? 55 : 105, opacity:.65 })} style={{ marginTop:10, padding:10, background:'white' }}>Nested: authored X{version === 1 ? 55 : 105}, opacity0.65</div>
   </div>
   <button id="portable-hover" type="button" data-animation={config('hover', { x:80, opacity:1 })} style={{ padding:20, margin:20 }}>Focus or hover portable animation</button>
   {dynamic && <div id="portable-dynamic" data-animation={config('load', { x:60, opacity:.8 })} style={{ padding:20, margin:20 }}>Dynamic: authored X60, opacity0.8</div>}
   <div style={{ height:1000 }}>The animated scroll section begins below the initial viewport.</div>
   <div id="portable-scroll" data-animation={config('scroll', { x:90, opacity:.9 })} style={{ background:'#ccfbf1', padding:24, width:320 }}>Scroll: authored X90, opacity0.9</div>
   <div style={{ height:700 }} />
  </div>
 </main>;
}
if (import.meta.env.DEV) {
 const reactRoot = createRoot(document.getElementById('root')!);
 reactRoot.render(<Fixture />);
 import.meta.hot?.dispose(() => reactRoot.unmount());
}
