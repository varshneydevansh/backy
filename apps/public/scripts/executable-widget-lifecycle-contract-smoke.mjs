/** Actual registry handlers plus source OpenAPI/schema producer mirrors; no browser or storage writes. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {NextRequest} from 'next/server.js';
import ts from 'typescript';
import {load} from './collection-import-postgres-handlers.mjs';
const require=createRequire(import.meta.url),Ajv=require('ajv/dist/2020.js').default;
const site={id:'lifecycle-contract-site',slug:'lifecycle-contract-site',name:'Lifecycle contract fixture',isPublished:true,theme:{},settings:{}};
const row={siteId:site.id,componentKey:'fixture.control',version:'1.0.0',displayName:'Control fixture',type:'interactiveFigure',status:'active',reviewStatus:'approved',source:'custom',renderMode:'static-fallback',fallback:{required:true,title:'Fixture',text:'Authored fallback'}};
const page={items:[],pagination:{total:0,limit:100,offset:0,hasMore:false}};
const settings={apiKeys:{},auth:{},integrations:{}};
const repositories={sites:{getById:async id=>id===site.id?site:null,getBySlug:async()=>null},interactiveComponents:{list:async()=>({...page,items:[row],pagination:{...page.pagination,total:1}}),getByKeyVersion:async(id,key,version)=>id===site.id&&key===row.componentKey&&version===row.version?row:null},cacheInvalidations:{latestRevision:async()=>null},pages:{list:async()=>page},posts:{list:async()=>page},blogTaxonomy:{listCategories:async()=>[],listTags:async()=>[],listAuthors:async()=>[]},collections:{list:async()=>page},reusableSections:{list:async()=>page},forms:{list:async()=>page},media:{list:async()=>page},settings:{get:async()=>settings},users:{getById:async()=>null}};
const mocks={'@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>false,getRequiredDatabaseRepositories:async()=>repositories},'@/lib/backyStore':{getSiteByIdOrSlug:()=>site,getAdminSettings:()=>settings,getCommentReportReasons:()=>[]},'@/lib/adminAccess':{requireAdminAccess:async()=>({session:{user:{id:'synthetic-author'}}})}};
const cache=new Map();
const catalog=load('../src/app/api/sites/[siteId]/interactive-components/route.ts',mocks,cache);
const params={params:Promise.resolve({siteId:site.id})};
const request=path=>new NextRequest(`http://fixture.invalid${path}`);
let checks=0;
const response=await catalog.GET(request(`/api/sites/${site.id}/interactive-components`),params);
assert.equal(response.status,200);const body=await response.json();checks++;
const lifecycle=body.data.contract.renderContract.lifecycle;
assert(lifecycle,'Served registry must explain active successful rendered completion, readiness and disposal');checks++;
const exact=load('../src/app/api/sites/[siteId]/interactive-components/[componentKey]/[version]/route.ts',mocks,cache);
const exactResponse=await exact.GET(request(`/api/sites/${site.id}/interactive-components/${row.componentKey}/${row.version}`),{params:Promise.resolve({siteId:site.id,componentKey:row.componentKey,version:row.version})});
assert.equal(exactResponse.status,200);assert.deepEqual((await exactResponse.json()).data.contract.renderContract.lifecycle,lifecycle);checks+=2;
assert.deepEqual(body.registry.contract.renderContract.lifecycle,lifecycle,'Registry response aliases retain the same lifecycle producer');checks++;
const authoring=load('../src/app/api/admin/sites/[siteId]/interactive-components/discovery/route.ts',mocks,cache);
const authoringResponse=await authoring.GET(request(`/api/admin/sites/${site.id}/interactive-components/discovery`),params);
assert.equal(authoringResponse.status,200);assert.deepEqual((await authoringResponse.json()).data.contract.renderContract.lifecycle,lifecycle);checks+=2;

// Inspect schema declarations included by the actual OpenAPI producer, not a copied expectation.
const apiSource=readFileSync(new URL('../src/app/api/sites/[siteId]/openapi/route.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('openapi.ts',apiSource,ts.ScriptTarget.Latest,true);
const apiSchemas={};
function visit(node){if(ts.isPropertyAssignment(node)&&['InteractiveComponentLifecycleContract','InteractiveComponentManifestContract'].includes(node.name.getText(ast)))apiSchemas[node.name.getText(ast)]=Function(`return (${node.initializer.getText(ast)});`)();ts.forEachChild(node,visit)}visit(ast);
const manifest=JSON.parse(readFileSync(new URL('../../../specs/ai-frontend-contract/frontend-manifest.schema.json',import.meta.url),'utf8'));
let manifestInteractive;
function find(node){if(!node||typeof node!=='object')return;if(node.properties?.renderContract&&node.properties?.schemaVersion?.const==='backy.interactive-components.v1')manifestInteractive=node;for(const value of Object.values(node))find(value)}find(manifest);
assert.deepEqual(manifestInteractive.properties.renderContract.properties.lifecycle,apiSchemas.InteractiveComponentLifecycleContract,'Manifest schema and served OpenAPI producer must advertise identical lifecycle metadata');checks++;
assert.deepEqual(apiSchemas.InteractiveComponentManifestContract.properties.renderContract.properties.lifecycle,{$ref:'#/components/schemas/InteractiveComponentLifecycleContract'});checks++;
assert.equal(apiSchemas.InteractiveComponentManifestContract.properties.renderContract.required.includes('lifecycle'),false,'Older contracts may omit additive lifecycle metadata');checks++;
const ajv=new Ajv({strict:false,allErrors:true});
const validLifecycle=ajv.compile(apiSchemas.InteractiveComponentLifecycleContract);
assert(validLifecycle(lifecycle),JSON.stringify(validLifecycle.errors));checks++;
const rendered=lifecycle.messages.rendered;
assert.equal(rendered.type,'backy.interactive-component.rendered');assert.equal(rendered.successfulRender,true);assert.equal(lifecycle.messages.ready.successfulRender,false);assert.equal(lifecycle.messages.resize.successfulRender,false);assert.equal(lifecycle.completionIsDiagnosticTelemetry,false);checks+=5;
for(const patch of [
 value=>{value.messages.ready.successfulRender=true},
 value=>{value.messages.resize.successfulRender=true},
 value=>{value.messages.rendered.successfulRender=false},
 value=>{value.messages.rendered.type='backy.interactive-component.ready'},
 value=>{value.receiverValidation.hostReplySource='any-window'},
 value=>{value.receiverValidation.identityMatch='latest-version'},
 value=>{value.receiverValidation.identityFields=['origin']},
 value=>{value.completionIsDiagnosticTelemetry=true},
 value=>{value.cleanup.disposeOnce=false},
 value=>{value.review.proactiveRunningFrameRevocation=true},
]){const invalid=structuredClone(lifecycle);patch(invalid);assert.equal(validLifecycle(invalid),false,'Schema must reject lifecycle metadata that contradicts the runtime');checks++}
const extension=structuredClone(lifecycle);extension.extension={preserve:[false,0]};extension.messages.rendered.extension={future:'retained'};assert(validLifecycle(extension),JSON.stringify(validLifecycle.errors));checks++;
const validateRender=ajv.compile({...apiSchemas.InteractiveComponentManifestContract.properties.renderContract,properties:{...apiSchemas.InteractiveComponentManifestContract.properties.renderContract.properties,lifecycle:apiSchemas.InteractiveComponentLifecycleContract}});
assert(validateRender(body.data.contract.renderContract),JSON.stringify(validateRender.errors));checks++;
const legacy=structuredClone(body.data.contract.renderContract);delete legacy.lifecycle;assert(validateRender(legacy),JSON.stringify(validateRender.errors));checks++;
const extended=structuredClone(body.data.contract.renderContract);extended.extension={preserve:[false,0]};extended.bundleModule.extension={future:true};assert(validateRender(extended),JSON.stringify(validateRender.errors));checks++;
// Completion is control traffic and is rejected by the actual diagnostic endpoint before storage.
const telemetryHandler=load('../src/app/api/sites/[siteId]/interactive-components/runtime-events/route.ts',mocks,cache);
const telemetryResponse=await telemetryHandler.POST(new NextRequest(`http://fixture.invalid/api/sites/${site.id}/interactive-components/runtime-events`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'backy.interactive-component.rendered',componentKey:row.componentKey,version:row.version,message:'Control completion cannot be telemetry'})}),params);
assert.equal(telemetryResponse.status,400);assert.equal((await telemetryResponse.json()).error.code,'INVALID_EVENT_TYPE');checks+=2;
const coreHandoff=load('../../../packages/core/src/custom-frontend-agent-handoff.ts',{},new Map());
mocks['@backy-cms/core']={...require('@backy-cms/core'),...coreHandoff};
const openApi=load('../src/app/api/sites/[siteId]/openapi/route.ts',mocks,cache);
const openApiResponse=await openApi.GET(request(`/api/sites/${site.id}/openapi`),params);
const openApiBody=await openApiResponse.json();
assert.equal(openApiResponse.status,200,JSON.stringify(openApiBody));
assert.deepEqual(openApiBody.components.schemas.InteractiveComponentLifecycleContract,apiSchemas.InteractiveComponentLifecycleContract,'Actual served OpenAPI uses the declared lifecycle schema');checks+=2;
const servedHandoff=openApiBody['x-backy-custom-frontend-agent-handoff'];
const instructions=servedHandoff.componentApiContract.richTextContract.interactiveComponent;
assert.equal(instructions.lifecycleContractPointer,'data.contract.renderContract.lifecycle');assert.match(instructions.sandboxReceiverRule,/rendered.*active successful mount\/update/);assert.match(instructions.disposalBoundary,/not proactively revoked/);checks+=3;
const manifestHandler=load('../src/app/api/sites/[siteId]/manifest/route.ts',mocks,cache);
const manifestResponse=await manifestHandler.GET(request(`/api/sites/${site.id}/manifest`),params);
const servedManifest=await manifestResponse.json();
assert.equal(manifestResponse.status,200,JSON.stringify(servedManifest));
assert.deepEqual(servedManifest.data.modules.interactiveComponents.renderContract.lifecycle,lifecycle,'Actual manifest uses the same registry lifecycle producer');checks+=2;
assert.deepEqual(servedManifest.data.contract.customFrontendAgentHandoff.componentApiContract.richTextContract.interactiveComponent,instructions,'Manifest handoff carries the same receiver guidance as OpenAPI');checks++;
const handoffHandler=load('../src/app/api/sites/[siteId]/agent-handoff/route.ts',mocks,cache);
const handoffResponse=await handoffHandler.GET(request(`/api/sites/${site.id}/agent-handoff`),params);
const servedAgent=await handoffResponse.json();assert.equal(handoffResponse.status,200,JSON.stringify(servedAgent));
assert.deepEqual(servedAgent.data.handoff.componentApiContract.richTextContract.interactiveComponent,instructions,'Actual agent handoff carries the same receiver guidance');checks+=2;
console.log(`Executable widget lifecycle contract passed ${checks} checks: actual catalog/exact/authoring/manifest/OpenAPI/handoff handler mirrors, schema producer equality, optional legacy metadata, retained extensions, negative success/identity/telemetry/revocation controls. Metadata does not certify production widgets or running-frame revocation.`);
