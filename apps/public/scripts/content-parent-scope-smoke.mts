/** Actual core + persisted demo parent ancestry, including contradictory legacy metadata. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as coreModule from '@backy-cms/core';
const core=(coreModule as any).default||coreModule;
const cwd=process.cwd(),directory=mkdtempSync(join(tmpdir(),'backy-parent-scopes-'));process.chdir(directory);
try{
 const storeModule=await import('../src/lib/backyStore');const store=storeModule.default||storeModule;
 const site=store.createAdminSite({id:'parent-scope-proof',slug:'parent-scope-proof',name:'Disposable ancestry proof'});
 const leaf={id:'leaf',type:'text',parentId:'stale-parent',props:{content:'Editable title'},metadata:{parentId:'contradictory-parent',unknown:{retain:[false,0]}},responsive:{mobile:{width:300}},children:[]};
 const partial=core.normalizeBackyContentElement({...leaf,parentId:'external-owner'});assert.equal(partial.parentId,'external-owner');assert.equal(partial.metadata.parentId,'external-owner');
 const parents=[{id:'first',type:'section',props:{},children:[leaf]},{id:'second',type:'section',props:{},children:[]}];
 const normalized=core.createBackyContentDocument({id:'proof',kind:'page',title:'Proof',slug:'proof',status:'draft',elements:parents as any});
 assert.equal(normalized.elements[0].children[0].parentId,'first');assert.equal(normalized.elements[0].children[0].metadata?.parentId,'first');assert.deepEqual(normalized.elements[0].children[0].metadata?.unknown,leaf.metadata.unknown);
 for(const kind of ['page','post'] as const){
 const create=kind==='page'?store.createAdminPage:store.createAdminBlogPost;const get=kind==='page'?store.getAdminPageById:store.getAdminBlogPostById;const update=kind==='page'?store.updateAdminPage:store.updateAdminBlogPost;
 const page=create(site.id,{title:'Parent scopes',slug:`parent-scopes-${kind}`,content:{elements:parents,canvasSize:{width:1200,height:700}}});
 const reopened=get(site.id,page.id)!;const initial=reopened.content.elements as any[];
 assert.equal(initial[0].children[0].parentId,'first');assert.equal(initial[0].children[0].metadata.parentId,'first');
 // An actual authored reparent retains old metadata until the shared normalization boundary.
 const moved=structuredClone(initial);const movedLeaf=moved[0].children.pop();movedLeaf.parentId='second';moved[1].children.push(movedLeaf);
 update(site.id,page.id,{expectedUpdatedAt:page.updatedAt,content:{...reopened.content,elements:moved}});
 const saved=get(site.id,page.id)!;
 for(const elements of [saved.content.elements,saved.content.contentDocument?.elements]){assert.equal((elements as any[])[1].children[0].parentId,'second');assert.equal((elements as any[])[1].children[0].metadata.parentId,'second');assert.deepEqual((elements as any[])[1].children[0].metadata.unknown,leaf.metadata.unknown);assert.equal((elements as any[])[1].children[0].responsive.mobile.width,300);}
 const disk=JSON.parse(readFileSync(join(directory,'data/backy/admin-content.json'),'utf8'))[kind==='page'?'pages':'blogPosts'].find((p:any)=>p.id===page.id);assert.equal(disk.content.elements[1].children[0].metadata.parentId,'second');
 // Undo-like prior tree and redo-like moved tree both normalize from concrete nesting.
 for(const elements of [initial,moved]){const before=get(site.id,page.id)!;update(site.id,page.id,{expectedUpdatedAt:before.updatedAt,content:{...before.content,elements}});const next=get(site.id,page.id)!;for(const parent of next.content.elements as any[]){for(const child of parent.children){assert.equal(child.parentId,parent.id);assert.equal(child.metadata.parentId,parent.id);}}}
 const rootLeaf=structuredClone(moved[1].children[0]);delete rootLeaf.parentId;const outdented=[{...moved[0],children:[]},{...moved[1],children:[]},rootLeaf];const direct=core.canvasContentPayloadToBackyContentDocument({id:page.id,kind,rawContent:{elements:outdented,metadata:{unknownDocument:{retained:true}}}});assert.equal(direct.elements[2].parentId,undefined);assert.equal(direct.elements[2].metadata?.parentId,undefined);assert.deepEqual(direct.elements[2].metadata?.unknown,leaf.metadata.unknown);const canonicalRaw={...direct,elements:outdented};const canonicalAgain=core.canvasContentPayloadToBackyContentDocument({id:page.id,kind,rawContent:canonicalRaw});assert.equal(canonicalAgain.elements[2].parentId,undefined);assert.equal(canonicalAgain.elements[2].metadata?.parentId,undefined);const before=get(site.id,page.id)!;update(site.id,page.id,{expectedUpdatedAt:before.updatedAt,content:{...before.content,elements:outdented}});const root=get(site.id,page.id)!;for(const tree of [root.content.elements,root.content.contentDocument?.elements]){assert.equal((tree as any[])[2].parentId,undefined);assert.equal((tree as any[])[2].metadata.parentId,undefined);assert.deepEqual((tree as any[])[2].metadata.unknown,leaf.metadata.unknown);}
 const cold=JSON.parse(execFileSync(process.execPath,['--import',import.meta.resolve('tsx'),'--input-type=module','-e',`const imported=await import(${JSON.stringify(new URL('../src/lib/backyStore.ts',import.meta.url).href)});const store=imported.default||imported;process.stdout.write(JSON.stringify(store.${kind==='page'?'getAdminPageById':'getAdminBlogPostById'}(${JSON.stringify(site.id)},${JSON.stringify(page.id)}).content));`],{cwd:directory,env:{...process.env,TSX_TSCONFIG_PATH:new URL('../tsconfig.json',import.meta.url).pathname},encoding:'utf8'}));assert.deepEqual(cold,JSON.parse(JSON.stringify(root.content)));
 }
 console.log('Parent ancestry checks PASS: contradictory metadata, actual demo create/save/disk/cold-process reopen, canonical + legacy tree, retained extensions/mobile and undo/redo trees. Process-local storage boundary.');
}finally{process.chdir(cwd);rmSync(directory,{recursive:true,force:true});}
