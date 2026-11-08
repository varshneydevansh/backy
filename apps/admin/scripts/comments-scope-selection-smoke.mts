import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { transformSync } from 'esbuild';
const text = readFileSync(new URL('../src/routes/comments.tsx',import.meta.url),'utf8');
const source = ts.createSourceFile('comments.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const declarations = new Map<string,ts.VariableDeclaration>(); let inventoryEffect='';
function walk(node:ts.Node) {
 if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name))declarations.set(node.name.text,node);
 if(ts.isCallExpression(node)&&node.expression.getText(source)==='useEffect'&&node.arguments[0]?.getText(source).includes('setSelectedSiteId(sites[0]'))inventoryEffect=node.arguments[0].getText(source);
 ts.forEachChild(node,walk);
}
walk(source);
const expr=(name:string)=>{const initializer=declarations.get(name)?.initializer;assert(initializer,name);return initializer.getText(source)};
const run=(code:string,ctx:any)=>vm.runInNewContext(transformSync(code,{loader:'tsx'}).code,ctx);
const ctx:any={routeSearch:{siteId:'unknown-site'},selectedSiteId:'allowed-site',sites:[{id:'allowed-site',publicSiteId:'canonical-site'}],useMemo:(read:()=>any)=>read(),siteMatchesIdentifier:(site:any,id:string)=>site.id===id||site.publicSiteId===id,permissionMatrix:{},currentAdmin:{id:'owner'},isPermissionsLoading:false,isCommentPermissionAllowedForSite:()=>true,adminPermissionReason:()=>undefined};
let checks=0;
let initialization:ts.VariableDeclaration|undefined;
function findInitialization(node:ts.Node){if(ts.isVariableDeclaration(node)&&ts.isArrayBindingPattern(node.name)&&node.name.elements[0]?.name?.getText(source)==='selectedSiteId')initialization=node;ts.forEachChild(node,findInitialization);}
findInitialization(source);assert(initialization?.initializer);
const initial=run(initialization.initializer.getText(source),{routeSearch:{},sites:[],useState:(init:()=>string)=>[init()],getSiteSelectionFromSearch:(_sites:any[],fallback='site-demo')=>fallback});
assert.equal(initial[0],'');checks++;

function scope(){ctx.requestedSiteId=run(expr('requestedSiteId'),ctx);ctx.activeSite=run(expr('activeSite'),ctx);ctx.activeSiteId=run(expr('activeSiteId'),ctx);ctx.isCommentPermissionAllowed=run(expr('isCommentPermissionAllowed'),ctx);ctx.canViewComments=run(expr('canViewComments'),ctx);}
scope();assert.equal(ctx.activeSite,undefined);assert.equal(ctx.activeSiteId,'unknown-site');assert.equal(ctx.canViewComments,false);assert.match(run(expr('viewPermissionTitle'),ctx),/selected site is unavailable/);checks+=4;
let selection='';ctx.setSelectedSiteId=(id:string)=>{selection=id};assert(inventoryEffect);run(`(${inventoryEffect})()`,ctx);assert.equal(selection,'');checks++;
ctx.routeSearch={};ctx.selectedSiteId='unknown-site';scope();assert.equal(ctx.activeSite,undefined);assert.equal(ctx.canViewComments,false);run(`(${inventoryEffect})()`,ctx);assert.equal(selection,'');checks+=3;
ctx.selectedSiteId='';scope();assert.equal(ctx.activeSite.id,'allowed-site');assert.equal(ctx.activeSiteId,'canonical-site');assert.equal(ctx.canViewComments,true);run(`(${inventoryEffect})()`,ctx);assert.equal(selection,'canonical-site');checks+=4;
ctx.routeSearch={siteId:'canonical-site'};ctx.selectedSiteId='unknown-site';scope();assert.equal(ctx.activeSite.id,'allowed-site');assert.equal(ctx.canViewComments,true);checks+=2;
// Execute actual refusal branch: no transport may be reached under unknown scope.
ctx.routeSearch={siteId:'unknown-site'};scope();let calls=0;const events:any[]=[];
ctx.commentLoadAuthority={current:{invalidate:()=>{}}};ctx.deferredCommentLoad={current:true};ctx.isCommentMutationBusy=false;ctx.viewPermissionTitle=run(expr('viewPermissionTitle'),ctx);
for(const name of ['setIsLoading','setComments','setTargets','setCommentAnalytics','setCommentDeliveryEvents','setCommentAuditLogs','setBlocklist','setBlocklistCount','setError','setNotice'])ctx[name]=(value:any)=>events.push([name,value]);
ctx.listAllComments=()=>{calls++;throw new Error('Foreign scope must not load another site')};
await run(`(${expr('loadComments')})()`,ctx);assert.equal(calls,0);assert(events.some(([name,value])=>name==='setComments'&&value.length===0));assert(events.some(([name,value])=>name==='setTargets'&&value.length===0));assert(events.some(([name,value])=>name==='setError'&&value.includes('selected site is unavailable')));checks+=4;
console.log(`PASS comments scope selection ${checks}: explicit unknown scope never falls back, owner grant cannot override missing site, inventory effect preserves requests, actual load refusal clears rows without transport`);
