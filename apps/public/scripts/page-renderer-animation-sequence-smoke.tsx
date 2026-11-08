/** Actual hosted HTML -> actual hydration controller/GSAP; controlled targets, not browser paint. */
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import gsap from 'gsap';
import { PageRenderer, type PageContent } from '../src/components/PageRenderer';
import { installAnimationHydration, parseAnimationConfig } from '../src/lib/animationHydration';
const sequence={version:1,steps:[
 {id:'entrance',label:'Entrance',at:0,duration:1,easing:'linear',from:{x:0,opacity:0},to:{x:80,opacity:1}},
 {id:'settle',label:'Settle',at:1,duration:1,easing:'linear',to:{x:0,scale:1}},
]};
const animation={type:'fadeIn',duration:.6,delay:0,easing:'power2.out',trigger:'load',sequence};
let checks=0;const eq=(actual:unknown,expected:unknown,message?:string)=>{assert.deepEqual(actual,expected,message);checks++;};
const layer=(motion:unknown,metadata?:unknown)=>({id:'imported-description',type:'text',x:20,y:30,width:600,height:100,props:{content:'Saved owner text'},animation:motion,metadata});
function html(elements:any[],contentDocument?:any){return renderToStaticMarkup(<PageRenderer content={{elements,canvasSize:{width:1200,height:800},...(contentDocument?{contentDocument}:{})} as PageContent}/>);}
function serialized(markup:string){const wrapper=markup.match(/<div\b[^>]*data-backy-element-id="imported-description"[^>]*>/)?.[0];assert(wrapper,'Hosted owner layer wrapper missing');const encoded=wrapper.match(/data-animation="([^"]*)"/)?.[1];return encoded===undefined?undefined:JSON.parse(encoded.replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&amp;/g,'&'));}
const authoredBefore=JSON.stringify(animation);
const emitted=serialized(html([layer(animation)]));eq(emitted.sequence,sequence,'Hosted PageRenderer must serialize the exact saved two-step sequence');eq(JSON.stringify(animation),authoredBefore,'HTML projection must not mutate authored animation');
eq(serialized(html([{id:'parent',type:'section',x:0,y:0,width:1200,height:800,props:{},children:[layer(animation)]}])).sequence,sequence);
eq(serialized(html([layer(undefined,{animation})])).sequence,sequence,'Legacy canonical metadata sequence remains available');
eq(serialized(html([],{schemaVersion:'backy.content.v1',id:'document',kind:'page',version:'1',elements:[layer(animation)],editableMap:{}})).sequence,sequence,'Document-only hosted sequence remains available');
const invalid=[{...sequence,version:2},{...sequence,steps:[]},{...sequence,steps:Array.from({length:25},(_,i)=>({...sequence.steps[0],id:String(i)}))},{...sequence,steps:[sequence.steps[0],sequence.steps[0]]},{...sequence,steps:[{...sequence.steps[0],at:-1}]},{...sequence,steps:[{...sequence.steps[0],duration:61}]},{...sequence,steps:[{...sequence.steps[0],at:179,duration:2}]},{...sequence,steps:[{...sequence.steps[0],to:{opacity:1.5}}]},{...sequence,steps:[{...sequence.steps[0],to:{x:Infinity}}]},{...sequence,steps:[{...sequence.steps[0],to:{onComplete:'unsafe'}}]}];
for(const rejected of invalid){eq(serialized(html([layer({...animation,sequence:rejected})])),undefined,'Invalid sequence must not become a silently simplified preset');eq(serialized(html([layer({...animation,sequence:rejected},{animation:{type:'fadeIn',duration:.6}})])),undefined,'Invalid explicit sequence must not fall back to metadata preset');}
eq(serialized(html([layer({type:'fadeIn',duration:0,delay:0,trigger:'load'})])),{type:'fadeIn',duration:0,delay:0,trigger:'load'},'Existing one-step animation is unchanged');
const config=parseAnimationConfig(JSON.stringify(emitted));eq(config?.sequence,sequence);
const target={x:0,opacity:1,scale:1,rotation:0,raw:JSON.stringify(emitted),ownerDocument:{activeElement:null},contains:()=>false,getAttribute(){return this.raw;},addEventListener(){},removeEventListener(){}};
const timelines:gsap.core.Timeline[]=[];
const engine={context:()=>gsap.context(()=>{}),getProperty:gsap.getProperty,set:gsap.set,fromTo:gsap.fromTo,timeline:(options?:gsap.TimelineVars)=>{const timeline=gsap.timeline({...options,paused:true});timelines.push(timeline);return timeline;}};
const root={nodeType:9,querySelectorAll:()=>[target]},media={matches:false,addEventListener(){},removeEventListener(){}},observer=()=>({observe(){},disconnect(){}});
const dispose=installAnimationHydration({root:root as unknown as Document,engine,media:media as unknown as MediaQueryList,createObserver:observer as any});
eq(timelines.length,1);const timeline=timelines[0];eq(timeline.duration(),2);eq(timeline.getChildren().map(step=>step.startTime()),[0,1]);
for(const [time,x,opacity]of [[0,0,0],[.5,40,.5],[1,80,1],[1.5,40,1],[2,0,1]]){timeline.seek(time);eq(target.x,x);eq(target.opacity,opacity);}
dispose();eq(target.x,0);eq(target.opacity,1,'Hydration cleanup restores resting owner appearance');
media.matches=true;const reduced=installAnimationHydration({root:root as unknown as Document,engine,media:media as unknown as MediaQueryList,createObserver:observer as any});eq(timelines.length,1,'Reduced motion creates no timeline');eq(target.x,0);eq(target.opacity,1);eq(target.scale,1);reduced();gsap.ticker.sleep();
console.log(`Hosted animation sequence HTML/hydration passed ${checks} checks: exact saved/nested/document/metadata sequence, whole invalid admission, preset compatibility, real GSAP fade/outward/return and reduced-motion/resting cleanup. Browser paint remains separate.`);
