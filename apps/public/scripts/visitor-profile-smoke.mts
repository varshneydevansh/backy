import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import { memoryVisitorFixture } from './visitor-auth-smoke.mts';
const require = createRequire(import.meta.url);
function compile(relative: string, mocks: Record<string, any>) {
 const filename = fileURLToPath(new URL(relative, import.meta.url)), module = { exports: {} as any };
 vm.runInNewContext(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { module, exports: module.exports, require: (id: string) => id in mocks ? mocks[id] : require(id), process, Buffer, TextDecoder, URL, Date, console }, { filename });
 return module.exports;
}
export async function runVisitorProfileProof(repositories: any, sites: any[]) {
 const repository = repositories.visitorAccounts, [site, otherSite] = sites;
 assert.equal(typeof repository.updateProfile, 'function');
 const originalUpdate = repository.updateProfile, sessions = compile('../src/lib/visitor-auth/session.ts', {});
 let providerCalls = 0, updateCalls = 0, beforeUpdate: (() => Promise<void>) | undefined, sequence = 0, checks = 0;
 const provider = new Proxy({}, { get: () => () => { providerCalls++; throw new Error('Profile editing must not call a provider'); } });
 const helpers = compile('../src/lib/visitor-auth/routes.ts', { '@/lib/repositoryRuntime': { getRequiredDatabaseRepositories: async () => repositories }, './provider': provider, './session': sessions });
 const wrapper = compile('../src/app/api/sites/[siteId]/visitor-auth/profile/route.ts', { '@/lib/visitor-auth/routes': helpers });
 const identity = { issuer: 'fixture-profile', subject: randomUUID(), email: `profile-${randomUUID()}@example.test` };
 const member = await repository.enroll(site.id, identity, 'Original name');
 const other = await repository.enroll(otherSite.id, { ...identity, subject: randomUUID() }, 'Other site name');
 const issue = async (target = member) => { const token = sessions.newVisitorToken(); assert(await repository.createSession({ siteId:target.siteId,memberId:target.id,tokenHash:sessions.visitorTokenHash(token),expiresAt:new Date(Date.now()+3600000).toISOString(),createdAt:new Date().toISOString() })); return token; };
 let token = await issue();
 repository.updateProfile = async (...args: any[]) => { updateCalls++; if (beforeUpdate) { const action=beforeUpdate;beforeUpdate=undefined;await action(); } return originalUpdate.apply(repository,args); };
 const send = async (body: any = { displayName:'Updated' }, options: { siteKey?:string;method?:string;headers?:Record<string,string>;raw?:string|Uint8Array } = {}) => {
  const key=options.siteKey||site.id,method=options.method||'PATCH';
  const request=new NextRequest(`http://backy.local/api/sites/${key}/visitor-auth/profile`,{method,headers:{origin:'https://site-a.example.com','content-type':'application/json',authorization:`Bearer ${token}`,'x-forwarded-for':`192.0.2.${++sequence}`,...options.headers},body:options.raw??JSON.stringify(body)});
  const response=await wrapper.PATCH(request,{params:Promise.resolve({siteId:key})});
  assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('pragma'),'no-cache');assert.match(response.headers.get('vary')!,/Origin.*Cookie.*Authorization/);assert.equal(response.headers.get('set-cookie'),null);
  return response;
 };
 const deny=async(status:number,body:any,options:Parameters<typeof send>[1]={})=>{ const before=updateCalls,current=await repository.getByIdentity(site.id,identity),beforeName=current.displayName;const response=await send(body,options);assert.equal(response.status,status,await response.clone().text());assert.equal(updateCalls,before,'Invalid route admission/payload must not call the profile writer');assert.equal((await repository.getByIdentity(site.id,identity)).displayName,beforeName);checks++; };
 try {
  assert.deepEqual(Object.keys(wrapper).sort(),['PATCH','dynamic']);
  const before=await repository.getByIdentity(site.id,identity),success=await send({displayName:'  Updated profile  '},{siteKey:site.slug});assert.equal(success.status,200,await success.clone().text());
  const saved=(await success.json()).data.member;assert.equal(saved.displayName,'Updated profile');assert.deepEqual(Object.keys(saved).sort(),['createdAt','displayName','email','id','siteId','status','updatedAt']);for(const field of ['id','siteId','email','status','createdAt'])assert.equal(saved[field],before[field]);assert.equal((await repository.getByIdentity(site.id,identity)).displayName,saved.displayName);checks++;
  const cleared=await send({displayName:'   '});assert.equal(cleared.status,200);assert.equal((await cleared.json()).data.member.displayName,'');checks++;
  assert.equal((await send({displayName:'a'.repeat(120)})).status,200);checks++;
  const padded=await send({displayName:' '.repeat(80)+'a'.repeat(120)+' '.repeat(80)});assert.equal(padded.status,200);assert.equal((await padded.json()).data.member.displayName.length,120);checks++;
  assert.equal((await send({displayName:'😀'.repeat(60)})).status,200);checks++;
  await deny(400,{displayName:'😀'.repeat(61)});
  for(const name of ['email','providerIssuer','providerSubject','subject','status','role','roles','memberId','siteId','unknown'])await deny(400,{displayName:'Forbidden',[name]:'unsafe'});
  for(const body of [{},{displayName:123},{displayName:null},{displayName:{}},[],{displayName:'a'.repeat(121)},{displayName:'Line\nname'},{displayName:'\tName'},{displayName:'Name\u007f'},{displayName:'Name\u0085'}])await deny(400,body);
  for(const raw of ['{"displayName":"first","displayName":"second"}','{"displayName":"broken"','{"displayName":"good","em\\u0061il":"spoof"}'])await deny(400,{}, {raw});
  await deny(400,{}, {raw:new Uint8Array([123,34,100,105,115,112,108,97,121,78,97,109,101,34,58,34,255,34,125])});
  await deny(413,{displayName:'a'.repeat(20000)});await deny(415,{displayName:'Good'},{headers:{'content-type':'application/json-not-json'}});await deny(405,{displayName:'Good'},{method:'POST'});
  await deny(403,{displayName:'Good'},{headers:{origin:'https://unapproved.example.test'}});await deny(403,{displayName:'Good'},{headers:{origin:''}});await deny(404,{displayName:'Good'},{siteKey:randomUUID()});
  await deny(401,{displayName:'Good'},{headers:{authorization:'',cookie:'backy_admin_session=operator-session','x-backy-admin-key':'operator-key','x-backy-admin-session':token}});
  await deny(401,{displayName:'Good'},{headers:{authorization:'Bearer provider-access-token'}});await deny(401,{displayName:'Good'},{headers:{authorization:`Bearer ${await issue(other)}`}});
  const update=repository.updateProfile;delete repository.updateProfile;try{await deny(503,{displayName:'Unavailable adapter'});}finally{repository.updateProfile=update;}
  const consumeRate=repository.consumeRateLimit;repository.consumeRateLimit=async()=>false;try{await deny(429,{displayName:'Rate denied'});}finally{repository.consumeRateLimit=consumeRate;}
  const priorName=(await repository.getByIdentity(site.id,identity)).displayName;beforeUpdate=()=>repository.revokeSession(site.id,sessions.visitorTokenHash(token));
  const raced=await send({displayName:'Revoked between admission and write'});assert.equal(raced.status,401);assert.equal((await raced.json()).error.code,'VISITOR_AUTHENTICATION_REQUIRED');assert.equal((await repository.getByIdentity(site.id,identity)).displayName,priorName);checks++;
  await deny(401,{displayName:'Already revoked'});token=await issue();
  assert.equal((await send({displayName:'Authenticated visitor'},{headers:{authorization:'','x-backy-visitor-session':token}})).status,200);checks++;
  assert.equal((await send({displayName:'Cookie visitor'},{headers:{authorization:'',cookie:`${sessions.visitorCookieName(site.id)}=${token}`}})).status,200);checks++;
  assert.equal(providerCalls,0);return{checks,member,token,sessions,identity};
 }finally{repository.updateProfile=originalUpdate;}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const fixture=memoryVisitorFixture(),repository:any=fixture.repositories.visitorAccounts;
 repository.updateProfile=async(siteId:string,memberId:string,tokenHash:string,input:{displayName:string})=>{const member=await repository.resolveSession(siteId,tokenHash,new Date().toISOString());if(!member||member.id!==memberId||await repository.isOperatorIdentity(member))return null;member.displayName=input.displayName;member.updatedAt=new Date().toISOString();return member;};
 const result=await runVisitorProfileProof(fixture.repositories,fixture.sites);console.log(JSON.stringify({ok:true,mode:'actual-handler-with-synthetic-repository',visitorProfileChecks:result.checks}));
}
