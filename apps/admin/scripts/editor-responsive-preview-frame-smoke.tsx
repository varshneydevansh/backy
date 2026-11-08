import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {resolveEditorCanvasFrame} from '../src/lib/editorCanvasFrame';
import {Canvas} from '../src/components/editor/Canvas';
import {resolveBackyCanvasBreakpointSize} from '@backy-cms/core';
import {normalizeSavedCanvasContent,serializeCanvasContent} from '../src/components/editor/editorCatalog';
import type {CanvasElement} from '../src/types/editor';
const original:CanvasElement[]=[
 {id:'desktop-nav',type:'nav',x:0,y:0,width:1200,height:72,props:{},children:[]},
 {id:'heading',type:'heading',x:40,y:140,width:900,height:80,props:{content:'Authored heading'},responsive:{mobile:{x:16,width:300},tablet:{x:24,width:650}}},
 {id:'lower-copy',type:'text',x:16,y:1600,width:300,height:100,props:{content:'Lower authored content remains reachable'}},
];
const sourceJSON=JSON.stringify(original),base={width:1200,height:800,responsive:{mobile:{width:375,height:812},tablet:{width:768,height:1024}}};
const saved=serializeCanvasContent(original,base),reopened=normalizeSavedCanvasContent(saved);
const reopenedJSON=JSON.stringify(reopened);
for(const [breakpoint,width] of [['mobile',375],['tablet',768],['desktop',1200]] as const){
 const size=resolveBackyCanvasBreakpointSize(reopened.canvasSize!,breakpoint);
 const elements=reopened.elements.map(element=>({...element,...(breakpoint==='desktop'?{}:element.responsive?.[breakpoint])}));
 const bounds={maxX:Math.max(...elements.map(e=>e.x+e.width)),maxY:Math.max(...elements.map(e=>e.y+e.height))};
 const previewFrame=resolveEditorCanvasFrame(size,bounds,true);
 const editFrame=resolveEditorCanvasFrame(size,bounds,false);
 const render=(preview:boolean,frame:typeof size)=>renderToStaticMarkup(<Canvas elements={elements} size={frame} onElementsChange={()=>{throw Error('Rendering must not change authored layers');}} onSelect={()=>{}} selectedId={null} isPreview={preview}/>);
 const preview=render(true,previewFrame),edit=render(false,editFrame);
 const canvasTag=preview.match(/<div[^>]*data-testid="editor-canvas"[^>]*>/)?.[0];assert(canvasTag);
 assert(canvasTag.includes(`width:${width}px`),`${breakpoint} actual Canvas preview must render selected width ${width}; got ${canvasTag}`);
 assert(canvasTag.includes('height:1748px'),'Deep content expands height and stays reachable');
 assert(preview.includes('width:1200px'),'Inherited desktop navigation remains visibly overflowing; preview must not shrink authored content');
 assert(preview.includes('Lower authored content remains reachable'));
 assert(edit.match(/<div[^>]*data-testid="editor-canvas"[^>]*>/)?.[0].includes('width:1200px'),'Edit negative control retains expanded overflow/pan width');
 if(breakpoint==='mobile')assert(preview.includes('left:16px')&&preview.includes('width:300px'),'Mobile heading geometry remains authored');
 assert.equal(previewFrame.width,width);assert.equal(editFrame.width,1200);assert.equal(previewFrame.height,1748);
}
assert.equal(JSON.stringify(reopened),reopenedJSON);assert.equal(JSON.stringify(original),sourceJSON);assert.equal(base.width,1200);assert.equal(base.responsive.mobile.width,375);
const source=readFileSync(new URL('../src/components/editor/CanvasEditor.tsx',import.meta.url),'utf8');
assert(source.includes('resolveEditorCanvasFrame(size, displayedContentBounds, isPreview, CANVAS_CONTENT_PADDING)'),'Shared parent must use viewport projection, not just tested child');
assert(source.includes('[displayedContentBounds, isPreview, size]'),'Toggling preview must recompute frame');
assert(source.includes('size={renderedCanvasSize}')&&source.includes('width: renderedCanvasSize.width'),'Real surface and real Canvas share resolved dimensions');
console.log('PASS actual Canvas preview SSR: mobile375/tablet768/desktop1200 selected width, deep1748 height, unresized overflowing desktop nav, authored mobile heading, edit1200 negative control, source immutability and shared parent wiring. Browser CSS/scroll proof separate.');
