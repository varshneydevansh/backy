/** Served canonical handlers with a restricted cookie session and persisted grants.
 * Starts/cleans its own fixture unless BACKY_COLLECTION_DESIGN_RESTRICTED_URL is supplied.
 * All seeded writes stay in the fixture's private owned demo directory. */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'../../..');
let fixture:ChildProcess|undefined;
let base=process.env.BACKY_COLLECTION_DESIGN_RESTRICTED_URL;
const observations:any[]=[];
let assertions=0;
const same=(actual:unknown,expected:unknown,message:string)=>{assert.deepEqual(actual,expected,message);assertions++;};
try {
 if(!base){
  fixture=spawn(resolve(root,'node_modules/.bin/tsx'),['--tsconfig',resolve(root,'apps/public/tsconfig.json'),resolve(root,'apps/admin/scripts/collection-design-browser-fixture.mts')],{cwd:root,env:{...process.env,BACKY_COLLECTION_DESIGN_RESTRICTED:'1'},stdio:['ignore','pipe','pipe']});
  base=await new Promise<string>((done,reject)=>{
   let output='',diagnostics='';const timer=setTimeout(()=>reject(Error('Restricted collection fixture readiness timeout')),45000);
   fixture!.stderr!.on('data',chunk=>{diagnostics=(diagnostics+String(chunk)).slice(-4000);});
   fixture!.stdout!.on('data',chunk=>{output+=String(chunk);const lines=output.split('\n');output=lines.pop()||'';for(const line of lines){try{const ready=JSON.parse(line);if(ready.ready){clearTimeout(timer);console.log(JSON.stringify({fixturePid:fixture!.pid,scratch:ready.scratch,restricted:ready.restricted}));done(new URL(ready.url).origin);}}catch{}}});
   fixture!.once('exit',code=>{clearTimeout(timer);reject(Error(`Restricted collection fixture exited ${code}: ${diagnostics}`));});fixture!.once('error',reject);
  });
 }
 const url=new URL(base!);assert.equal(url.hostname,'127.0.0.1','Only the owned local fixture is supported');
 let cookie='';
 const request=async(path:string,method='GET',body?:unknown)=>{const response=await fetch(new URL(path,base),{method,headers:{origin:base!,...(cookie?{cookie}:{}),...(body!==undefined?{'content-type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {response,payload:await response.json()};};
 const marker=(await request('/fixture/evidence')).payload;same(marker.fixtureContract,'backy.collection-design-owned-fixture.v1','Existing URL identifies the owned collection fixture before any mutation');same(marker.dataMode,'demo','Only private demo persistence allowed');same(marker.restricted,true,'Only a restricted fixture may be checked');
 const login=await request('/fixture/login','POST');same(login.response.status,200,'Synthetic restricted login succeeds');same(login.payload.data.restricted,true,'Restricted mode required');cookie=login.response.headers.get('set-cookie')!.split(';')[0];assert(cookie.startsWith('backy_admin_session='));assertions++;
 const seed=login.payload.data.seed,{allowed,foreign,allowedOther}=seed;
 const durable=async()=>(await request('/fixture/durable-state')).payload;
 const persisted=await durable();same(persisted.grant.scope.mode,'selected-sites','Selected-site grants are persisted');same(persisted.grant.scope.grants.map((row:any)=>row.siteId).sort(),[allowed.siteId,allowedOther.siteId].sort(),'Exactly two granted sites');
 for(const grant of persisted.grant.scope.grants)same([...grant.permissions].sort(),['collections.view','sites.view'],'Persisted grants contain exactly the two read permissions');
 const auth=await request('/api/admin/auth/session');same(auth.response.status,200,'Shared central session restores');same(auth.payload.data.user.id,login.payload.data.user.id,'Central auth restores the restricted user');
 const historyPath=(target:any)=>`/api/admin/sites/${target.siteId}/collections/${target.collectionId}/design-versions`;
 const histories:any[]=[];
 for(const target of [allowed,allowedOther]){
  const history=await request(historyPath(target));same(history.response.status,200,'Granted site history is readable');same(history.payload.data.revisions.length,1,'Actual seeded upgrade retained one private before-image');same(history.payload.data.revisions[0].id,target.revisionId,'History retains the actual upgrade before-image');same(history.payload.data.currentVersion,target.currentVersion,'Unchanged current definition');same(history.payload.data.revisions[0].operation,'template-upgrade','History was created by the actual upgrade handler');same('snapshot' in history.payload.data.revisions[0],false,'History summaries do not disclose the private before-image');histories.push(history.payload.data);
 }
 const reviewBody={targetType:'collection',action:'review',targetRevisionId:allowed.targetRevisionId,selection:[{type:'collection',id:allowed.collectionId}]};
 const review=await request(`/api/admin/sites/${allowed.siteId}/templates/${allowed.templateId}/instances`,'POST',reviewBody);same(review.response.status,200,'Read-only editor may review collection instances');
 const cases=[
  {name:'restore-without-edit',path:historyPath(allowed)+`/${allowed.revisionId}/restore`,method:'POST',body:{expectedVersion:allowed.currentVersion},status:403,code:'FORBIDDEN_OPERATOR_SITE_PERMISSION'},
  {name:'template-apply-without-edit',path:`/api/admin/sites/${allowed.siteId}/templates/${allowed.templateId}/instances`,method:'POST',body:{...reviewBody,action:'apply',reviewVersion:review.payload.data.reviewVersion},status:403,code:'FORBIDDEN_OPERATOR_SITE_PERMISSION'},
  {name:'ungranted-site-history',path:historyPath(foreign),status:403,code:'FORBIDDEN_SITE_SCOPE'},
  {name:'ungranted-site-template-review',path:`/api/admin/sites/${foreign.siteId}/templates/${foreign.templateId}/instances`,method:'POST',body:{...reviewBody,targetRevisionId:foreign.targetRevisionId,selection:[{type:'collection',id:foreign.collectionId}]},status:403,code:'FORBIDDEN_SITE_SCOPE'},
  {name:'foreign-entity-in-granted-site',path:`/api/admin/sites/${allowed.siteId}/collections/${foreign.collectionId}/design-versions`,status:404,code:'COLLECTION_NOT_FOUND'},
  {name:'foreign-granted-entity-in-first-site',path:`/api/admin/sites/${allowed.siteId}/collections/${allowedOther.collectionId}/design-versions`,status:404,code:'COLLECTION_NOT_FOUND'},
 ];
 for(const check of cases){
  const before=await durable(),result=await request(check.path,check.method,check.body),after=await durable();
  same(result.response.status,check.status,`${check.name} refused by the actual handler`);same(result.payload.success,false,`${check.name} reports refusal`);same(result.payload.error?.code,check.code,`${check.name} preserves the intended denial boundary`);same(after,before,`${check.name} must leave every persisted data file byte-identical, including grants/session/audit`);
  observations.push({name:check.name,status:result.response.status,code:result.payload.error?.code,persistedFiles:Object.keys(before.files).length,fullPersistedBytesUnchanged:true});
 }
 const evidence=(await request('/fixture/evidence')).payload;same(evidence.outboundRequests,0,'No outbound provider access');same(evidence.collections[0].metadata.frontendTemplateInstance.templateVersion,2,'Denied recovery preserves the v2 pin');same(evidence.collections[0].metadata.frontendDesignElements[0].width,720,'Denied recovery preserves current geometry');same(evidence.records[0].records.length,1,'Existing record retained');same(evidence.records[0].history.length,1,'Denied operations add no history');
 const proof={ok:true,assertions,boundary:evidence.boundary,restrictedCentralSession:true,persistedSelectedSiteGrants:true,actualUpgradeHistory:true,allowedHistoryStatus:histories.map(()=>200),readOnlyTemplateReviewStatus:review.response.status,observations,outboundRequests:0,browserControlsAndColdReopen:'Observe separately in the served ordinary Collections route',production:false,nativeSql:false};
 writeFileSync('/tmp/backy-collection-design-restricted-proof.json',JSON.stringify(proof,null,2),{mode:0o600});console.log(JSON.stringify(proof,null,2));
} finally {
 if(fixture&&!fixture.killed){fixture.kill('SIGTERM');await new Promise<void>(done=>{if(fixture!.exitCode!==null)return done();const timer=setTimeout(()=>{fixture!.kill('SIGKILL');done();},5000);fixture!.once('exit',()=>{clearTimeout(timer);done();});});}
}
