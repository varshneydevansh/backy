import { assertBulkOperatorBody } from './operator-authority-contract.mts';
import assert from 'node:assert/strict';
import { fixture } from './admin-access-test-fixtures.mts';
const baseline=process.argv.includes('--expect-known-partial');let checks=0;
for(const demo of [false,true])for(const action of ['updateStatus','delete']){
 const f=fixture({demo,actorRole:'owner'});f.users.set('skipped',{...f.target,id:'skipped',email:'skipped@fixture.test'});let writes=0;
 const method=action==='delete'?'delete':'update';
 if(!demo){const old=(f.repositories.users as any)[method];(f.repositories.users as any)[method]=async(...args:any[])=>{writes++;if(writes===2)throw Object.assign(Error('PRIVATE_WRITE_DETAIL'),{code:'LAST_ADMIN_AUTHORITY'});return old(...args);};}
 else{const key=action==='delete'?'deleteAdminUser':'updateAdminUser';const old=(f.mocks['@/lib/backyStore'] as any)[key];(f.mocks['@/lib/backyStore'] as any)[key]=(...args:any[])=>{writes++;if(writes===2)throw Object.assign(Error('PRIVATE_WRITE_DETAIL'),{code:'LAST_ADMIN_AUTHORITY'});return old(...args);};}
 const result=await f.call('users/bulk','POST',{action,userIds:['target','another-owner','skipped'],status:'suspended'});
 if(!baseline)assertBulkOperatorBody(result.status,result.body);
 assert.equal(writes,2);assert.equal(action==='delete'?f.users.has('target'):f.users.get('target')?.status,action==='delete'?false:'suspended');assert(!JSON.stringify(result.body).includes('PRIVATE_'));checks+=3;
 assert.equal(result.status,baseline?409:200);checks++;
 if(!baseline){assert.equal(result.body.data.outcome,'partial');assert.deepEqual(result.body.data.userIds,['target']);assert.equal(result.body.data.failedTargets[0].userId,'another-owner');assert.equal(result.body.data.failedTargets[0].code,'LAST_ADMIN_AUTHORITY');assert.equal(result.body.data.reloadRequired,true);assert.equal(result.body.data.failedTargets[1].userId,'skipped');assert.equal(result.body.data.failedTargets[1].code,'OPERATOR_NOT_ATTEMPTED');assert.equal(f.users.get('skipped')?.status,'active');checks+=8;}
}
console.log(`Operator actual bulk-handler ${baseline?'partial error reproduced':'outcome checks PASS'}: ${checks}; shared auth and explicit mutation adapters, no SQL/provider claim.`);
// The actual list adapter now reports full pagination, including late selections.
for(const invalid of [false,true]){
 const f=fixture({actorRole:'owner'});
 for(let i=0;i<205;i++)f.users.set('viewer-'+i,{...f.target,id:'viewer-'+i,email:`viewer-${i}@fixture.test`});
 if(invalid){const original=f.repositories.users.list;f.repositories.users.list=async(input:any)=>{const page=await original(input);return {...page,pagination:{...page.pagination,total:page.pagination.total+1}};};}
 const result=await f.call('users/bulk','POST',{action:'updateStatus',userIds:['viewer-204'],status:'suspended'});
 assertBulkOperatorBody(result.status,result.body);
 assert.equal(result.status,invalid?503:200);assert.equal(f.users.get('viewer-204')?.status,invalid?'active':'suspended');assert.equal(f.effects.writes,invalid?0:1);checks+=3;
}
const unavailable=fixture({actorRole:'owner'});unavailable.repositories.users.list=async()=>{throw Error('PRIVATE_INVENTORY');};const unreadable=await unavailable.call('users/bulk','POST',{action:'delete',userIds:['target']});assert.equal(unreadable.status,503);assert.equal(unavailable.effects.writes,0);assertBulkOperatorBody(unreadable.status,unreadable.body);checks+=2;
const denied=fixture({actorRole:'viewer'});const denial=await denied.call('users/bulk','POST',{action:'delete',userIds:['target']});assert.equal(denial.status,403);assert.equal(denied.effects.writes,0);checks+=2;
for(const demo of [false,true]){
 const f=fixture({demo,actorRole:'owner'});(f.mocks['@/lib/adminAudit'] as any).recordAdminAudit=async()=>{throw Error('PRIVATE_AUDIT');};
 const result=await f.call('users/bulk','POST',{action:'updateStatus',userIds:['target'],status:'suspended'});
 assertBulkOperatorBody(result.status,result.body);
 assert.equal(result.status,200);assert.equal(result.body.data.updated,1);assert.equal(result.body.data.outcome,'partial');assert.deepEqual(result.body.data.failedTargets,[]);assert.deepEqual(result.body.data.completionWarnings,['OPERATOR_BULK_AUDIT_PENDING']);checks+=5;
}
// Final demo repository mutation admission is exercised against owned disk only.
const {mkdtempSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
const cwd=process.cwd(),directory=mkdtempSync(join(tmpdir(),'backy-operator-authority-demo-'));process.chdir(directory);
try{
 const imported=await import('../src/lib/backyStore.ts');const store:any=imported.default||imported;
 const authorities=store.listAdminUsers().filter((user:any)=>(user.role==='owner'||user.role==='admin')&&user.status==='active');assert(authorities.length);
 const retained=authorities[authorities.length-1];for(const user of authorities.slice(0,-1))store.updateAdminUser(user.id,{role:'viewer'});
 assert.throws(()=>store.updateAdminUser(retained.id,{status:'suspended'}),(error:any)=>error.code==='LAST_ADMIN_AUTHORITY');assert.throws(()=>store.deleteAdminUser(retained.id),(error:any)=>error.code==='LAST_ADMIN_AUTHORITY');assert.equal(store.getAdminUserById(retained.id).status,'active');checks+=3;
}finally{process.chdir(cwd);rmSync(directory,{recursive:true,force:true});}
console.log(`Operator actual handler/inventory/demo checks complete: ${checks}; first committed/late failure disclosed, >100 tail selected, malformed inventory and permission deny before writes, direct store final-authority guard. No provider.`);
