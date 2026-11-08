import assert from 'node:assert/strict';import {readFileSync,mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createRequire} from 'node:module';import vm from 'node:vm';import ts from 'typescript';import {NextRequest,NextResponse} from 'next/server';
const require=createRequire(import.meta.url),cwd=process.cwd(),scratch=mkdtempSync(join(tmpdir(),'backy-form-tenant-'));process.chdir(scratch);let checks=0;const failures:string[]=[];
try{const imported=await import('../src/lib/backyStore.ts'),store:any=imported.default||imported;const a=store.createAdminSite({id:'form-site-a',slug:'form-a',name:'A'}),b=store.createAdminSite({id:'form-site-b',slug:'form-b',name:'B'});const create=(site:any)=>store.createAdminForm({siteId:site.id,id:'same-form-id',name:'Same form',audience:'public',isActive:true,fields:[{key:'email',type:'email',label:'Email'}]});const fa=create(a),fb=create(b);assert.equal(fa.id,fb.id);
const sa=store.createFormSubmission({siteId:a.id,formId:fa.id,values:{email:'a@example.test',privateMarker:'A'}}),sb=store.createFormSubmission({siteId:b.id,formId:fb.id,values:{email:'b@example.test',privateMarker:'B'}});const ca=store.createContactRecord({siteId:a.id,formId:fa.id,status:'new',email:'a@example.test',sourceValues:{privateMarker:'A'}}).contact,cb=store.createContactRecord({siteId:b.id,formId:fb.id,status:'new',email:'b@example.test',sourceValues:{privateMarker:'B'}}).contact;
const mocks:any={'next/server':{NextResponse},'@/lib/backyStore':store,'@/lib/adminAccess':{requireAdminAccess:async()=>({session:{user:{id:'fixture-owner'}}})},'@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>true,getRequiredDatabaseRepositories:async()=>{throw Error('Unexpected DB')}}};
function load(leaf:string){const module={exports:{} as any};const code=readFileSync(new URL('../src/app/api/admin/sites/[siteId]/forms/'+leaf+'/route.ts',import.meta.url),'utf8');vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,URL,process,console,require:(id:string)=>id in mocks?mocks[id]:id.startsWith('@/')?{}:require(id)});return module.exports;}
async function check(name:string,run:()=>Promise<void>|void){try{await run();checks++}catch(error){failures.push(name+': '+String(error))}}
for(const [site,ownSub,ownContact,foreignSub,foreignContact]of [[a,sa,ca,sb,cb],[b,sb,cb,sa,ca]]){
await check(site.id+' scoped list submissions',()=>assert.deepEqual(store.listFormSubmissions(fa.id,{siteId:site.id,limit:100}).data.map((v:any)=>v.id),[ownSub.id]));
await check(site.id+' scoped list contacts',()=>assert.deepEqual(store.listFormContacts(fa.id,{siteId:site.id,limit:100}).contacts.map((v:any)=>v.id),[ownContact.id]));
for(const leaf of ['[formId]/submissions','[formId]/contacts'])await check(site.id+' '+leaf,async()=>{const response=await load(leaf).GET(new NextRequest('http://fixture.invalid/?limit=100'),{params:Promise.resolve({siteId:site.slug,formId:fa.id})});assert.equal(response.status,200);const data=(await response.json()).data;const rows=leaf.endsWith('submissions')?data.submissions.data:data.contacts;assert.deepEqual(rows.map((v:any)=>v.id),[leaf.endsWith('submissions')?ownSub.id:ownContact.id]);});
await check(site.id+' foreign detail',async()=>assert.equal((await load('[formId]/submissions/[submissionId]').GET(new NextRequest('http://fixture.invalid/'),{params:Promise.resolve({siteId:site.slug,formId:fa.id,submissionId:foreignSub.id})})).status,404));
await check(site.id+' foreign review refused without write',async()=>{
const before=store.getSubmissionById(foreignSub.id);
const response=await load('[formId]/submissions/[submissionId]').PATCH(new NextRequest('http://fixture.invalid/',{method:'PATCH',body:JSON.stringify({status:'approved'})}),{params:Promise.resolve({siteId:site.slug,formId:fa.id,submissionId:foreignSub.id})});
assert.equal(response.status,404);assert.deepEqual(store.getSubmissionById(foreignSub.id),before);
});
}
for (const [site, foreignSubmission, foreignContact] of [[a,sb,cb],[b,sa,ca]]) {
await check(site.id+' foreign consent submission mutation refused',()=>{
const before=store.getSubmissionById(foreignSubmission.id);
assert.equal(store.anonymizeFormSubmissionConsentEvidence(fa.id,foreignSubmission.id,['email'],'fixture',site.id),undefined);
assert.deepEqual(store.getSubmissionById(foreignSubmission.id),before);
});
await check(site.id+' foreign consent contact mutation refused',()=>{
const before=store.getContactById(foreignContact.id);
assert.equal(store.anonymizeFormContactConsentEvidence(fa.id,foreignContact.id,['privateMarker'],'fixture',site.id),undefined);
assert.deepEqual(store.getContactById(foreignContact.id),before);
});
}
await check('ambiguous unscoped consent mutation refused',()=>{
assert.equal(store.anonymizeFormSubmissionConsentEvidence(fa.id,sa.id,['email'],'fixture'),undefined);
assert.equal(store.anonymizeFormContactConsentEvidence(fa.id,ca.id,['privateMarker'],'fixture'),undefined);
});
await check('ambiguous unscoped submission inventory fails closed',()=>assert.equal(store.listFormSubmissions(fa.id,{limit:100}).data.length,0));await check('ambiguous unscoped contact inventory fails closed',()=>assert.equal(store.listFormContacts(fa.id,{limit:100}).contacts.length,0));
}finally{process.chdir(cwd);rmSync(scratch,{recursive:true,force:true})}
if(failures.length){console.error(failures.join('\n'));if(!process.argv.includes('--expect-known-collision'))process.exitCode=1;else console.log('Known tenant collision reproduced: '+failures.length+' checks');}else console.log('Form tenant collision checks passed: '+checks);
