import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {loadMediaFixture} from './media-storage-recovery-fixture.mts';
const require=createRequire(import.meta.url),core=require('../../../packages/core/src/index.ts');
const root=mkdtempSync('/tmp/backy-delivery-site-lifecycle-'),cwd=process.cwd();process.chdir(root);
let rows:any[]=[],total=0,fault='',checks=0;
const journal={list:async(input:any)=>{assert.deepEqual(JSON.parse(JSON.stringify(input)),{siteId:'owned-site',limit:1,offset:0});if(fault==='read')throw Error('private credential must not escape');const response:any={items:rows,pagination:{total,limit:1,offset:0,hasMore:total>1}};if(fault==='limit')response.pagination.limit=100;if(fault==='pagination')delete response.pagination;if(fault==='foreign')response.items=[{siteId:'foreign'}];return response;}};
const helper=loadMediaFixture('../src/lib/siteCommentDeliveryLifecycle.ts',{'@backy-cms/core':core,'./demoCommentDeliveryJournal':{demoCommentDeliveryJournal:journal}});
try{
 for(const repo of [null,{commentDeliveries:journal}]){
  assert.equal(await helper.siteCommentDeliveryDeletionResponse('owned-site',repo,'owned-request'),null);checks++;
  for(const state of ['pending','uncertain','failed','succeeded']){rows=[{siteId:'owned-site',state}];total=1;const response=await helper.siteCommentDeliveryDeletionResponse('owned-site',repo,'owned-request');assert.equal(response.status,409);assert.equal((await response.json()).error.code,'SITE_COMMENT_DELIVERY_EVIDENCE_REMAINS');assert.equal(response.headers.get('cache-control'),'private, no-store');checks+=3;}
  rows=[];total=0;for(fault of ['read','limit','pagination','foreign']){const response=await helper.siteCommentDeliveryDeletionResponse('owned-site',repo,'owned-request');assert.equal(response.status,503);assert(!(await response.text()).includes('credential'));checks+=2;}fault='';
  total=4;assert.equal((await helper.siteCommentDeliveryDeletionResponse('owned-site',repo,'owned-request')).status,503);checks++;total=0;
 }
 assert.equal((await helper.siteCommentDeliveryDeletionResponse('owned-site',{},'owned-request')).status,503);checks++;
 assert.equal(helper.siteCommentDeliveryDeletionErrorResponse({cause:{code:'23503',constraint_name:'comment_delivery_attempts_site_id_fkey'}},'owned-request').status,409);assert.equal(helper.siteCommentDeliveryDeletionErrorResponse({cause:{code:'23503',constraint_name:'unrelated_fk'}},'owned-request'),null);checks+=2;
 const imported=await import('../src/lib/backyStore.ts'),store:any=imported.default||imported,actualJournal=require('../src/lib/demoCommentDeliveryJournal.ts').demoCommentDeliveryJournal;
 const site=store.createAdminSite({id:'owned-delivery-site',name:'Owned delivery site',slug:'owned-delivery-site'}),page=store.createAdminPage(site.id,{title:'Page',slug:'page',content:{elements:[]}}),comment=store.createComment({siteId:site.id,targetType:'page',targetId:page.id,content:'Retained',authorName:'Synthetic',authorEmail:'private@example.invalid',status:'approved'});
 const attempt=await actualJournal.admit({siteId:site.id,commentId:comment.id,kind:'comment-status',channel:'email',target:'mailto:recipient@example.invalid',requestId:'owned-request',reason:null,actor:null});
 assert.throws(()=>store.deleteAdminSite(site.id),(error:any)=>error.code==='SITE_COMMENT_DELIVERY_EVIDENCE_REMAINS');assert(store.getSiteByIdOrSlug(site.id));await actualJournal.settle(site.id,attempt.id,{state:'succeeded'});assert.throws(()=>store.deleteAdminSite(site.id),(error:any)=>error.code==='SITE_COMMENT_DELIVERY_EVIDENCE_REMAINS');checks+=3;
 const other=store.createAdminSite({id:'owned-no-evidence',name:'No evidence',slug:'owned-no-evidence'}),otherPage=store.createAdminPage(other.id,{title:'Page',slug:'page',content:{elements:[]}}),oldComment=store.createComment({siteId:other.id,targetType:'page',targetId:otherPage.id,content:'Retained old attribution',authorName:'Synthetic',status:'approved'});assert.equal(store.deleteAdminSite(other.id),true);await assert.rejects(()=>actualJournal.admit({siteId:other.id,commentId:oldComment.id,kind:'comment-status',channel:'email',target:'mailto:recipient@example.invalid',requestId:'owned-request',reason:null,actor:null}),(error:any)=>error.code==='COMMENT_NOT_FOUND');checks+=2;
 writeFileSync(join(root,'data/backy/private-comment-delivery/attempts.json'),'{corrupt');assert.throws(()=>store.deleteAdminSite(site.id),(error:any)=>error.code==='SITE_COMMENT_DELIVERY_INVENTORY_UNAVAILABLE');assert(store.getSiteByIdOrSlug(site.id));checks+=2;
 console.log(`PASS ${checks} actual site-comment-delivery lifecycle guard checks; pending/uncertain/terminal evidence retained, malformed/foreign/unavailable inventory refuses deletion. Guard journal adapters isolated; actual strict demo journal/store exercised, real FK proof separate.`);
}finally{process.chdir(cwd);rmSync(root,{recursive:true,force:true});}
