/** Verify captured CUA journey evidence; does not automate browser actions. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=process.argv[2];if(!file)throw Error('Pass the captured nested browser evidence JSON path.');
const evidence=JSON.parse(readFileSync(file,'utf8')),page=evidence.pages[0],persisted=evidence.persistedPages.find(p=>p.id===page.id);
assert(page&&persisted);assert.equal(page.status,'draft');
assert.equal(evidence.frontendDesign.templates.find(t=>t.id==='guided-browser-template').version,'1.3');
assert.equal(page.meta.frontendDesignTemplateId,'guided-browser-template');
assert.deepEqual(page.content.canvasSize.responsive.mobile,{width:375,height:812});assert.equal(page.content.canvasSize.width,1200);
const walk=(elements)=>elements.flatMap(e=>[e,...walk(e.children||[])]),all=walk(page.content.elements),get=id=>all.find(e=>e.id===id);
assert.equal(all.length,5);assert.deepEqual(new Set(all.map(e=>e.id)),new Set(['imported-header','imported-navigation','imported-hero','imported-heading','imported-media']));
for(const tree of [page.content.elements,page.content.contentDocument.elements,persisted.content.elements,persisted.content.contentDocument.elements]){
 const check=(elements,parent)=>{for(const e of elements){assert.equal(e.parentId,parent);assert.equal(e.metadata?.parentId,parent);check(e.children||[],e.id);}};check(tree,undefined);
}
const image=get('imported-media'),title=get('imported-heading');assert.equal(title.parentId,'imported-hero');assert.deepEqual([image.x,image.y,image.width,image.height],[20,130,400,260]);assert.deepEqual(image.responsive.mobile,{width:300,height:210,x:18});assert.equal(title.responsive.mobile.width,340);
assert.equal(get('imported-hero').unknownFrontendSlots.title,'imported-heading');assert.equal(page.content.editableMap.title.elementId,'imported-heading');
for(const [id,name,type] of [[image.props.mediaId,'proof-owner-image.png','image'],[title.props.fontMediaId,'Proof-Local-Arial.ttf','font']]){
 const asset=evidence.mediaInventory.find(m=>m.id===id);assert(asset);assert.equal(asset.originalName,name);assert.equal(asset.type,type);assert.equal(asset.siteId,page.siteId);assert.equal(asset.scope,'page');assert.equal(asset.scopeTargetId,page.id);assert(asset.sizeBytes>0);
 assert(evidence.requests.some(r=>r.method==='GET'&&r.path===new URL(asset.url).pathname&&r.status===200&&r.bytes===asset.sizeBytes));
}
assert.equal(title.props.fontRegistration.mediaId,title.props.fontMediaId);assert.equal(title.props.fontRegistration.url,title.props.fontFileUrl);
assert(title.assetIds.includes(title.props.fontMediaId));assert(image.assetIds.includes(image.props.mediaId));
assert(evidence.requests.filter(r=>r.method==='POST'&&r.path.endsWith('/media')&&r.status===201).length>=2);assert(evidence.requests.some(r=>r.method==='PATCH'&&r.path.endsWith('/'+title.props.fontMediaId)&&r.status===200));
assert(evidence.requests.some(r=>r.method==='PATCH'&&r.path.endsWith('/'+page.id)&&r.status===200&&r.body.expectedUpdatedAt));assert(evidence.requests.some(r=>r.method==='GET'&&r.path.endsWith('/'+page.id)&&r.status===200));
for(const dom of [evidence.dom.desktop,evidence.dom.mobile,evidence.dom.narrow]){assert(dom.fonts.some(f=>f.family==='Proof Local Arial'&&f.status==='loaded'));const t=dom.elements.find(e=>e.id==='imported-heading');assert.equal(t.parentId,'imported-hero');assert(t.family.includes('Proof Local Arial'));}
assert.equal(evidence.dom.desktop.elements.find(e=>e.id==='imported-media').width,'400');assert.equal(evidence.dom.mobile.elements.find(e=>e.id==='imported-media').width,'300');
assert.deepEqual(evidence.console,[]);
console.log('Captured browser evidence PASS: actual composition registration/apply, guarded save/reopen, stable nested ancestry, desktop/mobile geometry, uploaded image/font delivery and loaded FontFace. CUA actions were performed separately; auth, scanner and storage provider are synthetic.');
