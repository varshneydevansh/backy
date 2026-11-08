// Development-only browser proof using the production controller and real GSAP.
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { acquireAnimationHydration } from '../../public/src/lib/animationHydration';
import '../src/index.css';
gsap.registerPlugin(ScrollTrigger);
const config = (trigger: string, to: object) => JSON.stringify({ type: 'custom', trigger, duration: .12, from: { x: 0, opacity: .5 }, to });
function Fixture() {
 const root = useRef<HTMLDivElement>(null), media = useRef(new EventTarget() as EventTarget & { matches: boolean }), stop = useRef<() => void>();
 const unrelated = useRef<ReturnType<typeof ScrollTrigger.create>>();
 const [reduced, setReduced] = useState(false), [dynamic, setDynamic] = useState(false), [result, setResult] = useState('Ready'), [active, setActive] = useState(true);
 useEffect(() => {
  media.current.matches = false;
  unrelated.current = ScrollTrigger.create({ trigger: '#unrelated-animation', start: 'top bottom' });
  stop.current = acquireAnimationHydration({ root: root.current!, engine: gsap, media: media.current as MediaQueryList });
  return () => { stop.current?.(); unrelated.current?.kill(); };
 }, []);
 const capture = () => setResult(JSON.stringify({ active, reduced, unrelatedAlive: ScrollTrigger.getAll().includes(unrelated.current!), triggers: ScrollTrigger.getAll().length, elements: ['load','hover','scroll','dynamic'].map(id => { const e=document.getElementById('animation-'+id); return e ? { id, x: Number(gsap.getProperty(e,'x')), opacity: Number(getComputedStyle(e).opacity) } : { id, absent:true }; }) }, null, 2));
 return <main style={{padding:24,fontFamily:'system-ui',color:'#1e293b'}}>
  <h1>Production animation runtime · browser proof</h1><p>Real GSAP and production hydration. Reduced-motion toggle simulates the media-query change signal; it does not change system settings.</p>
  <div style={{display:'flex',gap:12,margin:'20px 0',position:'sticky',top:0,background:'white',padding:12,zIndex:10}}>
   <button onClick={capture}>Capture rendered measurements</button>
   <label><input type="checkbox" checked={reduced} onChange={e=>{setReduced(e.target.checked);media.current.matches=e.target.checked;media.current.dispatchEvent(new Event('change'));}}/>Simulate reduced motion</label>
   <button onClick={()=>setDynamic(true)}>Insert dynamic animation</button>
   <button onClick={()=>document.getElementById('animation-scroll')?.scrollIntoView({block:'center'})}>Scroll to animated section</button>
   <button onClick={()=>{stop.current?.();setActive(false);}}>Dispose Backy controller</button>
  </div>
  <pre role="status" style={{whiteSpace:'pre-wrap',background:'#f8fafc',padding:12}}>{result}</pre>
  <div id="unrelated-animation">Independent widget’s ScrollTrigger must survive Backy cleanup.</div>
  <div ref={root}>
   <div id="animation-load" data-animation={config('load',{x:150,opacity:.4})} style={{background:'#e2e8f0',padding:20,margin:20,width:320}}>Load: authored X150, opacity0.4</div>
   <button id="animation-hover" data-animation={config('hover',{x:80,opacity:1})} style={{padding:20,margin:20}}>Focus or hover animation</button>
   {dynamic && <div id="animation-dynamic" data-animation={config('load',{x:60,opacity:.8})} style={{padding:20,margin:20}}>Dynamic: X60, opacity0.8</div>}
   <div style={{height:1000}}>Scroll target below the initial viewport.</div>
   <div id="animation-scroll" data-animation={config('scroll',{x:90,opacity:.9})} style={{background:'#ccfbf1',padding:24,width:320}}>Scroll: authored X90, opacity0.9</div>
   <div style={{height:700}}/>
  </div>
 </main>;
}
if(import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<Fixture/>);
