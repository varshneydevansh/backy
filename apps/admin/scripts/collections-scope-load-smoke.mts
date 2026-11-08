import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { transformSync, buildSync } from 'esbuild';
import { createWorkspaceLoadAuthority } from '../src/lib/workspaceLoadAuthority';
import { adminPermissionRule, isAdminPermissionDeniedError } from '../src/lib/adminPermissionUi';
import { AdminContentApiError } from '../src/lib/adminContentApi';

// Execute the actual route expressions and callbacks, including held transports.
const source = readFileSync(process.env.BACKY_COLLECTIONS_SOURCE_FILE || new URL('../src/routes/collections.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('collections.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map<string, ts.VariableDeclaration>();
function visit(node: ts.Node) { if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) declarations.set(node.name.text, node); ts.forEachChild(node, visit); }
visit(ast);
function expression(name: string) { const node = declarations.get(name); assert(node?.initializer, name); return node.initializer.getText(ast); }
function execute(code: string, context: any) { return vm.runInNewContext(transformSync(code, { loader:'tsx' }).code, context); }
let checks = 0; const failures: string[] = [];
function check(name: string, pass: boolean) { checks++; if (!pass) failures.push(name); }
const scopeContext: any = { selectedSiteId:'foreign-site', sites:[{id:'allowed-site'}], useMemo:(read:()=>any)=>read(), siteMatchesIdentifier:(site:any,id:string)=>site.id===id, routeSearch:{siteId:'foreign-site'} };
scopeContext.activeSite = execute(expression('activeSite'), scopeContext);
check('foreign requested site never substitutes first authorized site', scopeContext.activeSite === undefined || scopeContext.activeSite === null);
check('foreign API target remains requested foreign site', execute(expression('activeSiteId'), scopeContext) === 'foreign-site');
scopeContext.selectedSiteId = 'allowed-site'; scopeContext.activeSite = execute(expression('activeSite'), scopeContext);
check('known requested site remains available', scopeContext.activeSite?.id === 'allowed-site');
scopeContext.selectedSiteId='';scopeContext.routeSearch={};scopeContext.activeSite=execute(expression('activeSite'),scopeContext);
check('unrequested initial workspace may choose first authorized site', scopeContext.activeSite?.id==='allowed-site');
let autoSelection = '';
const autoScope:any={sites:[{id:'allowed-site'}],selectedSiteId:'foreign-site',routeSearch:{siteId:'foreign-site'},siteMatchesIdentifier:scopeContext.siteMatchesIdentifier,setSelectedSiteId:(id:string)=>{autoSelection=id;}};
function findEffect(node:ts.Node) { if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.arguments[0]?.getText(ast).includes('setSelectedSiteId(sites[0]')) return node.arguments[0].getText(ast);let found:string|undefined;ts.forEachChild(node,child=>{found ||= findEffect(child);});return found; }
const autoEffect=findEffect(ast);assert(autoEffect);execute(`(${autoEffect})()`,autoScope);
check('site inventory effect never rewrites an explicit foreign request',autoSelection==='');
autoScope.selectedSiteId='';autoScope.routeSearch={};execute(`(${autoEffect})()`,autoScope);
check('site inventory effect chooses initial site when no request exists',autoSelection==='allowed-site');
const permissionContext:any={Boolean,adminPermissionRule,COLLECTION_PERMISSION_ROLE_DEFAULTS:{'collections.view':['owner','admin','editor','viewer']}};
execute(`const collectionPermissionRule=${expression('collectionPermissionRule')};globalThis.allowed=${expression('isCollectionPermissionAllowed')};`,permissionContext);
const matrix:any={userId:'user-a',canSignIn:true,role:'viewer',groups:[{permissions:[{key:'collections.view',allowed:true},{key:'collections.edit',allowed:true}]}],siteAccess:{status:'selected-sites',scope:{mode:'selected-sites',grants:[{siteId:'site-a',permissions:['collections.view']},{siteId:'site-b',permissions:['collections.edit']}]}}};
check('current own site view grant permits reads',permissionContext.allowed(matrix,{id:'user-a',role:'viewer'},'collections.view','site-a'));
check('different site edit grant cannot enable current site writes',!permissionContext.allowed(matrix,{id:'user-a',role:'viewer'},'collections.edit','site-a'));
check('other user permission matrix cannot enable reads',!permissionContext.allowed(matrix,{id:'user-b',role:'viewer'},'collections.view','site-a'));
check('previous role permission matrix cannot enable reads',!permissionContext.allowed(matrix,{id:'user-a',role:'editor'},'collections.view','site-a'));
check('role defaults cannot replace a missing permission matrix',!permissionContext.allowed(null,{id:'user-a',role:'owner'},'collections.view','site-a'));
check('inactive permission metadata cannot enable reads',!permissionContext.allowed({...matrix,canSignIn:false},{id:'user-a',role:'viewer'},'collections.view','site-a'));

function held() { let resolve!:(value:any)=>void, reject!:(value:any)=>void; const promise=new Promise<any>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject}; }
function findCleanup(node:ts.Node) { if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.arguments[0]?.getText(ast).includes('collectionLoadAuthority.current.invalidate()')) return node.arguments[0].getText(ast);let found:string|undefined;ts.forEachChild(node,child=>{found ||= findCleanup(child);});return found; }
const cleanup=findCleanup(ast);assert(cleanup);
function fixture(name:string) {
 const pending=held(), detail=held(), events:any[]=[];let detailCalls=0; const context:any={JSON,Error,Boolean,
  activeSiteId:'site-a', currentAdmin:{id:'user-a',role:'viewer'},routeSearch:{siteId:'site-a',collectionId:'collection-a',recordId:''},
  selectedCollectionId:'collection-a',isCollectionsBusy:false,isCollectionMutationPending:false,isRecordMutationPending:false,isPermissionMatrixPending:false,canViewCollections:true,canExportCollections:true,
  viewPermissionTitle:'Forbidden scope',collectionDraftModeRef:{current:false},collectionInteractionVersionRef:{current:0},recordInteractionVersionRef:{current:0},
  recordFilters:{search:'',status:'',fieldKey:'',fieldValue:'',sortBy:'updatedAt',sortDirection:'desc'},recordPagination:{limit:20,offset:0},
  collectionLoadAuthority:{current:createWorkspaceLoadAuthority()},recordLoadAuthority:{current:createWorkspaceLoadAuthority()},collectionAuditLoadAuthority:{current:createWorkspaceLoadAuthority()},
  collectionReadScope:{current:{context:'',epoch:0}},collectionReadContext:'',permissionMatrix:{siteAccess:null},isPermissionsLoading:false,
  cancelled:false,listCollections:()=>pending.promise,listCollectionRecords:()=>pending.promise,getCollectionRecord:()=>{detailCalls++;return detail.promise;},
  getSiteFrontendDesign:()=>pending.promise,listPages:()=>pending.promise,
  listAdminAuditLogs:()=>pending.promise,selectCollection:(value:any)=>events.push(['selectCollection',value]),resetCollectionForm:()=>events.push(['resetCollectionForm']),
  AdminContentApiError,isAdminPermissionDeniedError,clearUserPermissionsCache:()=>events.push(['clearUserPermissionsCache']),
 };
 const renderStart=source.indexOf('  const collectionReadContext =');
 const renderEnd=source.indexOf('  const recordDraftDirty',renderStart);
 const render=renderStart>=0?source.slice(renderStart,renderEnd):'';
 execute(`globalThis.syncAuthority=()=>{${render}};`,context);context.syncAuthority();context.scope=context.collectionReadScope.current;
 const callback=expression(name),clearDenied=expression('clearDeniedCollectionWorkspace');
 for(const setter of new Set([...(callback+clearDenied).matchAll(/\b(set[A-Z]\w*)\(/g)].map(match=>match[1]))) context[setter]=(value:any)=>events.push([setter,value]);
 execute(`const isCollectionAccessDeniedError=${expression('isCollectionAccessDeniedError')};const clearDeniedCollectionWorkspace=${clearDenied};globalThis.invoke=${callback};`,context);
 const change=(kind:string)=>{if(kind==='site'){context.activeSiteId='site-b';context.routeSearch={...context.routeSearch,siteId:'site-b'};}else if(kind==='user'){context.currentAdmin={id:'user-b',role:'viewer'};}else if(kind==='role'){context.currentAdmin={id:'user-a',role:'editor'};}else if(kind==='revocation'){context.canViewCollections=false;}else if(kind==='record'){context.selectedCollectionId='collection-b';}else if(kind==='filter'){context.recordFilters={...context.recordFilters,search:'new query'};}else if(kind==='away-and-back'){context.activeSiteId='site-b';context.syncAuthority();context.activeSiteId='site-a';}context.syncAuthority();};
 return {context,pending,detail,events,change,detailStarted:()=>detailCalls>0};
}
async function awaitDetailStart(f:ReturnType<typeof fixture>){for(let attempt=0;attempt<20&&!f.detailStarted();attempt++)await Promise.resolve();assert(f.detailStarted(),'Actual nested detail transport must be entered before completing it.');}
const collection={id:'collection-a',siteId:'site-a',slug:'articles'};
const records={records:[{id:'record-a',siteId:'site-a',collectionId:'collection-a',values:{text:'private row'}}],pagination:{limit:20,offset:0,total:1,hasMore:false}};
const resultFor=(name:string)=>name==='loadCollections'?[collection]:name==='loadRecords'?records:name==='loadFrontendDesign'?{frontendDesign:{templates:[]}}:name==='loadPageTemplates'?[{id:'private-page',status:'draft'}]:{logs:[{id:'audit'}]};
for(const name of ['loadCollections','loadRecords','loadCollectionAuditLogs','loadFrontendDesign','loadPageTemplates']) {
 for(const transition of ['site','user','role','revocation','away-and-back',...(name==='loadRecords'?['record','filter']:[])]) {
  for(const outcome of ['success','denial']) {
   const f=fixture(name), operation=f.context.invoke('collection-a'); const before=f.events.length;f.change(transition);
   if(outcome==='denial')f.pending.reject(new Error('Forbidden previous scope'));else f.pending.resolve(resultFor(name));
   await operation;check(`${name} ${transition} ${outcome} cannot publish or finalize previous scope`,f.events.length===before);
  }
 }
 const f=fixture(name),operation=f.context.invoke('collection-a');f.pending.resolve(resultFor(name));await operation;
 check(`${name} current read can publish`,f.events.some(row=>['setCollections','setRecords','setCollectionAuditLogs','setFrontendDesign','setPages'].includes(row[0])));
 for(const outcome of ['success','denial']) { const unmounted=fixture(name),read=unmounted.context.invoke('collection-a'),count=unmounted.events.length;execute(`(${cleanup})()`,unmounted.context)();if(outcome==='success')unmounted.pending.resolve(resultFor(name));else unmounted.pending.reject(new Error('Forbidden prior unmounted scope'));await read;check(`${name} unmounted ${outcome} cannot publish or finalize`,unmounted.events.length===count); }
 const newest=fixture(name),oldRead=held(),newRead=held();let calls=0;const read=()=>calls++===0?oldRead.promise:newRead.promise;
 for(const transport of ['listCollections','listCollectionRecords','listAdminAuditLogs','getSiteFrontendDesign','listPages']) newest.context[transport]=read;
 if(name==='loadCollections'||name==='loadRecords') { const first=newest.context.invoke('collection-a'),second=newest.context.invoke('collection-a');newRead.resolve(resultFor(name));await second;const count=newest.events.length;oldRead.resolve(resultFor(name));await first;check(`${name} newer same-scope read suppresses old success/finalizer`,newest.events.length===count); }
}
const deep=fixture('loadRecords');deep.context.routeSearch.recordId='record-deep';const operation=deep.context.invoke('collection-a');deep.pending.resolve({...records,records:[]});await awaitDetailStart(deep);const before=deep.events.length;deep.change('user');deep.detail.resolve({id:'record-deep',siteId:'site-a',collectionId:'collection-a'});await operation;
check('late nested record detail cannot publish after user transition',deep.events.length===before);
const denied=fixture('loadCollections'),denyOperation=denied.context.invoke();denied.pending.reject(new AdminContentApiError('This operator policy does not grant access to this site.',undefined,'FORBIDDEN_SITE_SCOPE'));await denyOperation;
for(const setter of ['setCollections','setRecords','setPages','setCollectionAuditLogs']) check(`actual structured scope denial clears ${setter}`,denied.events.some(([name,value])=>name===setter&&Array.isArray(value)&&value.length===0));
check('actual scope denial removes editor/private design and permission cache',denied.events.some(row=>row[0]==='resetCollectionForm')&&denied.events.some(([name,value])=>name==='setFrontendDesign'&&value===null)&&denied.events.some(row=>row[0]==='clearUserPermissionsCache'));
// Actual collection transport must retain central error codes for the real callback.
const client:any={exports:{}};let status=403,code='FORBIDDEN_SITE_SCOPE',message='This operator policy does not grant access to this site.';
execute(buildSync({entryPoints:[new URL('../src/lib/adminContentApi.ts',import.meta.url).pathname],bundle:true,write:false,format:'cjs',platform:'browser',define:{'import.meta.env':'{}'},logLevel:'silent'}).outputFiles[0].text,{module:client,exports:client.exports,console,URL,URLSearchParams,Headers,Request,Response,fetch:async()=>Response.json({success:false,error:{code,message}},{status})});
for(const unauthorized of [false,true]) {
 if(unauthorized){status=401;code='UNAUTHORIZED';message='A valid admin session or admin API key is required.';}
 for(const read of ['listCollections','listCollectionRecords']) {
  let error:any;try{await client.exports[read]('site-a','collection-a');}catch(cause){error=cause;}
  check(`${read} actual ${status} transport retains central code`,error instanceof client.exports.AdminContentApiError&&error.code===code);
  const callback=fixture('loadCollections');callback.context.AdminContentApiError=client.exports.AdminContentApiError;const readOperation=callback.context.invoke();callback.pending.reject(error);await readOperation;
  check(`${read} actual ${status} error clears cached collection/editor through actual callback`,callback.events.some(([name,value])=>name==='setCollections'&&Array.isArray(value)&&value.length===0)&&callback.events.some(row=>row[0]==='resetCollectionForm'));
 }
 let detailError:any;try{await client.exports.getCollectionRecord('site-a','collection-a','record-deep');}catch(cause){detailError=cause;}
 check(`nested record actual ${status} client preserves central code`,detailError instanceof client.exports.AdminContentApiError&&detailError.code===code);
 for(const stale of [false,true]) {
  const detail=fixture('loadRecords');detail.context.AdminContentApiError=client.exports.AdminContentApiError;detail.context.routeSearch.recordId='record-deep';const operation=detail.context.invoke('collection-a');detail.pending.resolve(records);await awaitDetailStart(detail);const count=detail.events.length;if(stale)detail.change('user');detail.detail.reject(detailError);await operation;
  if(stale) check(`nested record stale ${status} cannot clear current workspace`,detail.events.length===count);
  else {
   check(`nested record current ${status} clears collection/records/editor/cache`,detail.events.some(([name,value])=>name==='setCollections'&&Array.isArray(value)&&value.length===0)&&detail.events.some(([name,value])=>name==='setRecords'&&Array.isArray(value)&&value.length===0)&&detail.events.some(row=>row[0]==='resetCollectionForm')&&detail.events.some(row=>row[0]==='clearUserPermissionsCache'));
   check(`nested record current ${status} never republishes successful list pagination`,!detail.events.some(([name,value])=>name==='setRecordPagination'&&value===records.pagination));
  }
 }
}
status=404;code='RECORD_NOT_FOUND';message='Record not found';let missingError:any;try{await client.exports.getCollectionRecord('site-a','collection-a','record-deep');}catch(cause){missingError=cause;}
const missing=fixture('loadRecords');missing.context.AdminContentApiError=client.exports.AdminContentApiError;missing.context.routeSearch.recordId='record-deep';const missingRead=missing.context.invoke('collection-a');missing.pending.resolve(records);await awaitDetailStart(missing);missing.detail.reject(missingError);await missingRead;
check('missing nested record preserves permitted list without clearing collection',missing.events.some(([name,value])=>name==='setRecordPagination'&&value===records.pagination)&&!missing.events.some(row=>row[0]==='resetCollectionForm'));
if(failures.length) { console.error(JSON.stringify({checks,failures},null,2)); process.exitCode=1; } else console.log(`Collections requested scope and actual held read callbacks: PASS ${checks}.`);
