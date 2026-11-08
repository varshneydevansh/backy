/** Actual public render HTTP handler + owned durable demo data; no provider/production access. */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import * as coreModule from '@backy-cms/core';
import * as contractModule from '../src/lib/frontendDesignContract';
import * as provenanceModule from '../src/lib/templateInstanceProvenance';
const core=(coreModule as any).default||coreModule,contract=(contractModule as any).default||contractModule,provenance=(provenanceModule as any).default||provenanceModule;
const { withCollectionTemplateDesign, canvasElementsToBackyContentDocument } = core;
const { normalizeFrontendDesignContract, seedCollectionInputFromFrontendDesignTemplate, buildFrontendCollectionTemplateBaseline } = contract;
const { pinTemplateInstance, isValidCollectionTemplateInstancePin } = provenance;
const cwd=process.cwd(), scratch=mkdtempSync(join(tmpdir(),'backy-collection-saved-render-'));
const previous={mode:process.env.BACKY_DATA_MODE,node:process.env.NODE_ENV};
process.chdir(scratch);process.env.BACKY_DATA_MODE='demo';process.env.NODE_ENV='test';
let checks=0;
const eq=(actual:unknown,expected:unknown,message?:string)=>{assert.deepEqual(actual,expected,message);checks++;};
const node=(width:number,id='saved-root')=>({id,type:'section',x:0,y:0,width,height:360,responsive:{mobile:{width:280}},props:{extension:[false,0,null]},children:[{id:id+'-title',type:'heading',x:30,y:30,width:560,height:70,props:{content:'Placeholder',binding:'record.title'}}]});
const fields=[{id:'title',key:'title',label:'Title',type:'text',required:true,unique:false}];
const template=(version:number)=>({id:'render-collection-template',type:'collection',name:'Saved collection',version,content:{fields,elements:[node(version===1?640:720)],canvasSize:{width:1200,height:800,layout:'fluid'},customCSS:'.saved { color: teal; }',assets:{fonts:[{id:'fixture-font'}]},animations:{enter:{type:'fade'}},interactions:{onClick:{keep:false}},themeTokenRefs:{body:'font.body'},dataBindings:{extension:{count:0}},editableMap:{'saved-root':{width:true}},metadata:{extension:[false,0,null]}}});
try{
 const imported:any=await import('../src/lib/backyStore'),store=imported.default||imported;
 const runtime:any=await import('../src/lib/repositoryRuntimePolicy');assert((runtime.default||runtime).shouldUseDemoStoreFallback());
 const v1:any=normalizeFrontendDesignContract({templates:[template(1)]}),v2:any=normalizeFrontendDesignContract({templates:[template(2)]});
 const site=store.createAdminSite({id:'saved-render-site',slug:'saved-render-site',name:'Synthetic saved render',isPublished:true,status:'published',settings:{frontendDesign:v1}});
 const seeded:any=seedCollectionInputFromFrontendDesignTemplate({siteSettings:site.settings,body:{frontendDesignTemplateId:'render-collection-template',name:'Saved collection',slug:'saved-collection',status:'published',permissions:{publicRead:true,publicCreate:false},routePattern:'/saved-collection/:recordSlug',listRoutePattern:'/saved-collection'}});
 assert(seeded.ok);seeded.body.metadata.frontendDesignAssets={fonts:[{id:'fixture-font',type:'font'}]};let collection=store.createAdminCollection(site.id,seeded.body);
 eq(isValidCollectionTemplateInstancePin(collection.metadata.frontendTemplateInstance),true);
 const record=store.createAdminCollectionRecord(site.id,collection.id,{slug:'entry',status:'published',values:{title:'Current retained entry',extension:[false,0,null]}});
 const historyModule:any=await import('../src/lib/templateHistory'),history=historyModule.default||historyModule;await history.persistFrontendDesignWithHistory(site,v2,{source:'fixture-render',requestId:'fixture-v2'});
 const target:any=v2.templates[0],design=buildFrontendCollectionTemplateBaseline(v2,target);
 collection=store.updateAdminCollection(site.id,collection.id,{...withCollectionTemplateDesign(collection,design,pinTemplateInstance(target,design,'collection')),expectedCollection:collection,beforeUpdateCollectionDesignRevision:{operation:'template-upgrade',templateId:target.id,requestId:'fixture-upgrade'}});
 const preimage=store.listCollectionDesignRevisions(site.id,collection.id,{offset:0,limit:100})[0];
 collection=store.updateAdminCollection(site.id,collection.id,{...withCollectionTemplateDesign(collection,preimage.snapshot.design,preimage.snapshot.pin),expectedCollection:collection,beforeUpdateCollectionDesignRevision:{operation:'restore',templateId:target.id,targetRevisionId:preimage.id,requestId:'fixture-restore'}});
 eq(collection.metadata.frontendTemplateInstance,preimage.snapshot.pin);eq(collection.metadata.frontendTemplateInstance.templateVersion,1);
 const routeModule:any=await import('../src/app/api/sites/[siteId]/render/route');const route=routeModule.default||routeModule;
 async function render(path:string){const response=await route.GET(new NextRequest('http://fixture.invalid/api/sites/'+site.id+'/render?path='+encodeURIComponent(path)),{params:Promise.resolve({siteId:site.id})});const body=await response.json();eq(response.status,200,JSON.stringify(body));return body.data;}
 for(const path of ['/saved-collection','/saved-collection/entry']){
  const result=await render(path);eq(result.content.elements[0].width,640,'Saved restored v1 must render rather than registry v2');eq(result.content.elements[0].responsive.mobile.width,280);eq(result.content.elements[0].props.extension,[false,0,null]);
  eq(result.content.customCSS,'.saved { color: teal; }');eq(result.content.assets,{fonts:[{id:'fixture-font',type:'font'}]});eq(result.content.animations,{enter:{type:'fade'}});eq(result.content.interactions,{onClick:{keep:false}});eq(result.content.themeTokenRefs,{body:'font.body'});eq(result.content.canvasSize.layout,'fluid');
  eq(result.content.metadata.extension,[false,0,null]);assert(!JSON.stringify(result).includes('baseContentFingerprint'));checks++;
  eq(result.content.dataBindings,{extension:{count:0}});eq(result.content.editableMap['saved-root'],{width:true,field:'saved-root',targetPath:'saved-root',editable:true,valueType:'json'});
  if(path.endsWith('/entry'))eq(result.content.elements[0].children[0].props.content,'Current retained entry');
 }
 eq(store.getCollectionRecordByIdOrSlug(site.id,collection.id,record.id),record,'Render must not mutate current records');
 // A valid saved canonical document wins over stale flat aliases; its unknown fields survive.
 const document:any=canvasElementsToBackyContentDocument({id:'saved-document',kind:'page',title:'Saved document',status:'published',elements:[node(612,'document-root')],metadata:{canvasSize:{width:1024,height:900,layout:'fluid'},extension:[false,0,null]}} as any);
 document.metadata={...document.metadata,canvasSize:{width:1024,height:900,layout:'fluid'},extension:[false,0,null]};
 collection=store.updateAdminCollection(site.id,collection.id,{metadata:{...collection.metadata,frontendDesignContentDocument:document,frontendDesignElements:[node(999,'stale-flat-root')]}});
 for(const path of ['/saved-collection','/saved-collection/entry']){const result=await render(path);eq(result.content.elements[0].id,'document-root');eq(result.content.elements[0].width,612);eq(result.content.canvasSize.width,1024);eq(result.content.contentDocument.elements[0].width,612);}
 const documentOnly={...collection.metadata};delete documentOnly.frontendDesignElements;delete documentOnly.frontendDesignCanvasSize;
 collection=store.updateAdminCollection(site.id,collection.id,{metadata:documentOnly});
 for(const path of ['/saved-collection','/saved-collection/entry']){const result=await render(path);eq(result.content.elements[0].width,612);eq(result.content.canvasSize.width,1024);}
 const emptyDocument={...document,elements:[]};
 collection=store.updateAdminCollection(site.id,collection.id,{metadata:{...collection.metadata,frontendDesignContentDocument:emptyDocument,frontendDesignElements:[node(999,'stale-flat-root')]}});
 for(const path of ['/saved-collection','/saved-collection/entry'])eq((await render(path)).content.elements,[],'Intentional empty saved document must not invent registry/generated content');
 // A deliberately captured route canvas retains priority over the collection-wide design.
 collection=store.updateAdminCollection(site.id,collection.id,{metadata:{...collection.metadata,dynamicTemplates:{list:{authoredCanvas:{elements:[node(660,'captured-list')],canvasSize:{width:1100,height:700}}},item:{authoredCanvas:{elements:[node(680,'captured-item')],canvasSize:{width:1150,height:750}}}}}});
 eq((await render('/saved-collection')).content.elements[0].width,660);eq((await render('/saved-collection/entry')).content.elements[0].width,680);
 // Legacy template identity without a saved canvas still uses the registered template.
 store.updateAdminCollection(site.id,collection.id,{metadata:{frontendDesignTemplateId:target.id}});eq((await render('/saved-collection')).content.elements[0].width,720);eq((await render('/saved-collection/entry')).content.elements[0].width,720);
 // No template/canvas keeps ordinary generated routes functional.
 store.updateAdminCollection(site.id,collection.id,{metadata:{}});await history.persistFrontendDesignWithHistory(store.getSiteByIdOrSlug(site.id),normalizeFrontendDesignContract({templates:[]}),{source:'fixture-render',requestId:'fixture-clear'});
 for(const path of ['/saved-collection','/saved-collection/entry']){const result=await render(path);assert(result.content.elements.length>0);checks++;assert(!['saved-root','captured-list','captured-item'].includes(result.content.elements[0].id));checks++;}
 console.log(`Collection saved design actual public render handlers passed ${checks} checks: restored pin/current aliases, canonical document, complete canvas metadata, bindings, captured-page precedence, legacy registry/generated fallback; owned demo only.`);
}finally{process.chdir(cwd);rmSync(scratch,{recursive:true,force:true});if(previous.mode===undefined)delete process.env.BACKY_DATA_MODE;else process.env.BACKY_DATA_MODE=previous.mode;if(previous.node===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous.node;}
