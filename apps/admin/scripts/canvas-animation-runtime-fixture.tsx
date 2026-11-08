/** Real saved editor/runtime browser harness. Local fixture only; no API/provider writes. */
import React,{useEffect,useState} from 'react';
import { createRoot } from 'react-dom/client';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CanvasEditor, type CanvasEditorProps } from '../src/components/editor/CanvasEditor';
import type { CanvasElement } from '../src/types/editor';
const elements:CanvasElement[]=[
 {id:'actual-parent',name:'Authored parent',type:'container',x:60,y:60,width:720,height:300,props:{backgroundColor:'#fef3c7',childLayout:'free',borderRadius:14},children:[
  {id:'nested-load',name:'Nested load motion',type:'button',x:30,y:35,width:210,height:70,rotation:15,props:{label:'Nested load layer',backgroundColor:'#0f766e',opacity:.8},animation:{type:'custom',duration:.35,delay:0,easing:'linear',trigger:'load',from:{x:0,opacity:.2},to:{x:135,opacity:.45,rotation:50}}},
  {id:'nested-hover',name:'Nested hover and focus',type:'button',x:30,y:170,width:220,height:70,rotation:12,props:{label:'Focus or hover this layer',backgroundColor:'#334155',opacity:.9},animation:{type:'custom',duration:.25,delay:0,easing:'linear',trigger:'hover',from:{x:0,opacity:.9},to:{x:95,opacity:.4,rotation:60}}},
 ]},
 {id:'actual-scroll',name:'Actual offscreen scroll layer',type:'button',x:80,y:1150,width:260,height:90,props:{label:'Actual scroll layer',backgroundColor:'#0f766e'},animation:{type:'custom',duration:.3,delay:0,easing:'linear',trigger:'scroll',from:{x:0,opacity:.1},to:{x:150,opacity:1},scrollTrigger:{start:'top 85%',end:'top 30%',scrub:true}}},
];
const initialSettings:CanvasEditorProps['initialSettings']={title:'Actual Canvas animation preview',slug:'motion-fixture',status:'draft',meta:{title:'Motion fixture',description:'Disposable actual layout proof',keywords:[],jsonLd:[]}};
function App(){
 const[shown,setShown]=useState(true),[proof,setProof]=useState<unknown>(),[saved,setSaved]=useState<CanvasElement[]>(),[epoch,setEpoch]=useState(0);
 useEffect(()=>{const timer=setInterval(()=>{const root=document.querySelector('[data-testid="editor-canvas"]');setProof({mode:root?.getAttribute('data-preview-animation-runtime')||'edit-resting-layout',reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,scopedScrollTriggers:ScrollTrigger.getAll().filter(t=>t.trigger&&root?.contains(t.trigger)).map(t=>({layer:t.trigger?.getAttribute('data-element-id'),scroller:(t.scroller as HTMLElement)?.getAttribute?.('data-testid'),progress:t.progress})),layers:['nested-load','nested-hover','actual-scroll'].map(id=>{const layer=[...document.querySelectorAll<HTMLElement>('[data-element-id]')].find(node=>node.getAttribute('data-element-id')===id);return{id,present:Boolean(layer),hovered:layer?.matches(':hover')||false,focusWithin:layer?.contains(document.activeElement)||false,x:layer?gsap.getProperty(layer,'x'):null,rotation:layer?gsap.getProperty(layer,'rotation'):null,opacity:layer?gsap.getProperty(layer,'opacity'):null,animation:layer?.getAttribute('data-animation')||null};}),allScrollTriggers:ScrollTrigger.getAll().length,savedCount:saved?.length||0});},150);return()=>clearInterval(timer);},[saved]);
 return <main><header style={{padding:12,background:'#fff',borderBottom:'1px solid #ddd'}}><h1 style={{fontWeight:600}}>Actual Canvas motion acceptance</h1><p>Actual CanvasEditor / inspector / nested layout / shared GSAP. Local disposable content; no provider or public page certification.</p><button onClick={()=>setShown(v=>!v)}>{shown?'Unmount actual editor':'Mount actual editor'}</button><button onClick={()=>{setEpoch(v=>v+1);setShown(true)}}>Reopen saved fixture</button></header>{shown&&<CanvasEditor key={epoch} initialElements={saved||elements} initialSettings={initialSettings} initialSize={{width:900,height:1700}} initialSelectedElementId="nested-load" hideNavigation hideSettings onSave={(next)=>setSaved(next)} canViewMedia={false} canCreateMedia={false} canViewCollections={false}/>}<details open style={{padding:12}}><summary>Actual DOM and GSAP evidence</summary><pre data-testid="actual-motion-proof" style={{fontSize:12,whiteSpace:'pre-wrap'}}>{JSON.stringify(proof,null,2)}</pre></details></main>;
}
const appRoot=createRoot(document.getElementById('root')!);
appRoot.render(<App/>);
// Vite may replace this fixture module during source work; release its owned root.
import.meta.hot?.dispose(()=>appRoot.unmount());
