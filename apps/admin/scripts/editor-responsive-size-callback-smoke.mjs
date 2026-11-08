// Execute the actual shared parent's callback bodies, not copies of sizing logic.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),core=require('@backy-cms/core');
const source=fs.readFileSync(new URL('../src/components/editor/CanvasEditor.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('CanvasEditor.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),expressions=new Map();let heightCallback;
function walk(node){if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer){let value=node.initializer;if(ts.isCallExpression(value)&&value.expression.getText(ast)==='useCallback')value=value.arguments[0];expressions.set(node.name.text,value.getText(ast));}if(ts.isJsxAttribute(node)&&node.name.getText(ast)==='onSizeChange'&&node.initializer&&ts.isJsxExpression(node.initializer))heightCallback=node.initializer.expression.getText(ast);ts.forEachChild(node,walk);}walk(ast);
const plain=v=>JSON.parse(JSON.stringify(v));let checks=0;
for(const breakpoint of ['mobile','tablet','desktop']){
 let stored={width:1200,height:800},saved;const elements=[{id:'nav',type:'nav',x:0,y:0,width:1200,height:72,props:{}},{id:'heading',type:'heading',x:16,y:124,width:300,height:80,props:{content:'Mobile heading'},responsive:{mobile:{x:16,width:300}}}];const original=JSON.stringify(elements);
 const context={...core,breakpoint,CANVAS_CONTENT_PADDING:48,isCanvasMutationDisabled:false,elements,pageSettings:{title:'Preserve author'},editDisabledReason:'',setEditorNotice:()=>{},setBreakpoint:()=>{},markChanges:()=>{},clampCanvasDimension:(value)=>value,setSize:(next)=>{stored=plain(typeof next==='function'?next(stored):next);},onChange:(_elements,_settings,size)=>{saved=plain(size);}};vm.createContext(context);
 const define=(name)=>{const expression=expressions.get(name);assert(expression,'Missing actual callback/helper '+name);vm.runInContext(ts.transpile(`var ${name}=${expression}`,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}),context);};
 define('collectCanvasContentBounds');define('expandCanvasSizeToContent');define('growCanvasSizeForElements');
 context.growCanvasSizeForElements([...elements,{id:'lower',type:'text',x:16,y:1600,width:300,height:100,props:{content:'Keep full height'}}]);
 assert.equal(core.resolveBackyCanvasBreakpointSize(stored,breakpoint).height,1748,'Automatic content growth still extends vertical height');checks++;
 assert.equal(stored.width,1200);assert.equal(core.resolveBackyCanvasBreakpointSize(stored,breakpoint).width,breakpoint==='desktop'?1200:breakpoint==='mobile'?375:768,`${breakpoint} inherited nav must not become saved viewport width`);checks+=2;
 context.canvasSourceSize=stored;context.size=core.resolveBackyCanvasBreakpointSize(stored,breakpoint);
 define('applyCanvasSize');if(heightCallback!=='applyCanvasSize')define(heightCallback);
 context[heightCallback]({...context.size,width:1200,height:2000});
 assert.equal(saved.width,1200);const reopened=JSON.parse(JSON.stringify(saved)),viewport=core.resolveBackyCanvasBreakpointSize(reopened,breakpoint);
 assert.equal(viewport.width,breakpoint==='mobile'?375:breakpoint==='tablet'?768:1200,'Actual Canvas automatic-height callback must not save render-only overflow width');assert.equal(viewport.height,2000);assert.equal(JSON.stringify(elements),original);checks+=4;
 // Explicit author viewport edits remain intentional, distinct from Canvas height growth.
 context.canvasSourceSize=reopened;context.size=viewport;define('applyCanvasSize');context.applyCanvasSize({...viewport,width:breakpoint==='mobile'?414:breakpoint==='tablet'?820:1440});
 assert.equal(core.resolveBackyCanvasBreakpointSize(saved,breakpoint).width,breakpoint==='mobile'?414:breakpoint==='tablet'?820:1440);checks++;
 context.growCanvasSizeForElements([{...elements[0],width:1500},elements[1]]);assert.equal(core.resolveBackyCanvasBreakpointSize(stored,breakpoint).width,breakpoint==='desktop'?1500:breakpoint==='mobile'?414:820,'Desktop can grow while smaller explicit viewport dimensions remain authored');checks++;
}
console.log(`PASS actual shared CanvasEditor callbacks (${checks} checks): fallback375/768 preserved through inherited-nav growth, expanded-frame height callback, save/reopen; desktop growth and explicit width editing retained. DOM browser proof separate.`);
