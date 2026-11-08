/** Actual PropertyPanel and HTTP preset handlers, isolated synthetic persistence only. */
/// <reference types="vite/client" />
import { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PropertyPanel } from '../src/components/editor/PropertyPanel';
import { LEGACY_COLLECTION_PRESET_KEY } from '../src/components/editor/collectionBindingPresetCache';
import type { CanvasElement } from '../src/types/editor';
const legacy = JSON.stringify([{id:'legacy-never-attach',name:'Legacy must not resurrect',collectionId:'collection-a',fieldKey:'title',targetPath:'props.content'}]);
localStorage.setItem(LEGACY_COLLECTION_PRESET_KEY, legacy);
const seed = (site: string): CanvasElement => ({id:'preset-proof-text',name:'Bound text',type:'text',x:0,y:0,width:360,height:80,zIndex:0,props:{content:'Synthetic bound text'},dataBindings:[{source:{kind:'collection',collectionId:`collection-${site}`,field:'title'},targetPath:'props.content'}]});
function Fixture() {
 const [site,setSite]=useState('a'),[epoch,setEpoch]=useState(0),[element,setElement]=useState(()=>seed('a')),[evidence,setEvidence]=useState('');
 const captureSummary=evidence?(()=>{const value=JSON.parse(evidence);return JSON.stringify({canonicalCounts:Object.fromEntries(Object.values(value.transport.sites).map((site:any)=>[site.id,site.settings.editor.collectionBindingPresets.length])),patches:value.transport.requests.filter((request:any)=>request.method==='PATCH').map((request:any)=>({path:request.path,count:request.body.presets.length,status:request.status})),cacheCounts:Object.fromEntries(Object.entries(value.cache).map(([key,value]:[string,any])=>[key,value.length])),legacyUntouched:value.legacyUntouched},null,2);})():'';
 const changed=useCallback((updates:Partial<CanvasElement>)=>setElement(current=>({...current,...updates})),[]);
 const capture=async()=>setEvidence(JSON.stringify({transport:await(await fetch('/fixture/evidence')).json(),cache:Object.fromEntries(Object.keys(localStorage).filter(key=>key.startsWith(LEGACY_COLLECTION_PRESET_KEY)).map(key=>[key,JSON.parse(localStorage.getItem(key)!)])),legacyUntouched:localStorage.getItem(LEGACY_COLLECTION_PRESET_KEY)===legacy,element},null,2));
 return <main className="p-4 text-sm">
  <h1 className="font-semibold">Actual collection preset browser acceptance</h1><p>Actual PropertyPanel and preset HTTP handlers. Synthetic owner/repository; no provider or production persistence proof.</p>
  <nav className="my-3 flex flex-wrap gap-2">
   {['a','b'].map(id=><button type="button" className="border px-3 py-2" key={id} onClick={()=>{setSite(id);setElement(seed(id));}}>Switch to site {id.toUpperCase()}</button>)}
   <button type="button" className="border px-3 py-2" onClick={()=>setEpoch(value=>value+1)}>Reopen inspector</button>
   <button type="button" className="border px-3 py-2" onClick={async()=>{await fetch(`/fixture/fill?site=${site}`,{method:'POST'});setEpoch(value=>value+1);}}>Seed 48 server presets</button>
   <button type="button" className="border px-3 py-2" onClick={async()=>{await fetch('/fixture/hold',{method:'POST'});setEpoch(value=>value+1);}}>Hold next preset read</button>
   <button type="button" className="border px-3 py-2" onClick={()=>fetch('/fixture/release',{method:'POST'})}>Release held read</button>
   <button type="button" className="border px-3 py-2" onClick={()=>fetch(`/fixture/drop?site=${site}`,{method:'POST'})}>Remove first on server only</button>
   <button type="button" className="border px-3 py-2" onClick={capture}>Capture transport and cache</button>
  </nav><p role="status">Selected alias: preset-{site}-alias</p>
  <div className="flex items-start gap-5"><div style={{width:520,height:740}}><PropertyPanel key={epoch} element={element} onChange={changed} mediaContext={{siteId:`preset-${site}-alias`,scope:'page',targetId:'preset-proof'}} canViewMedia={false} canCreateMedia={false} interactiveComponents={[]} /></div><div style={{width:580}}><pre data-testid="preset-evidence-summary" className="whitespace-pre-wrap text-xs">{captureSummary}</pre><details><summary>Raw observed transport and cache</summary><pre data-testid="preset-browser-evidence" style={{maxHeight:400,overflow:'auto'}} className="whitespace-pre-wrap text-xs">{evidence}</pre></details></div></div>
 </main>;
}
if(import.meta.env.DEV) { const root=createRoot(document.getElementById('root')!); root.render(<Fixture/>); import.meta.hot?.dispose(()=>root.unmount()); }
