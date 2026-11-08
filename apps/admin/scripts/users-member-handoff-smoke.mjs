/** Executes actual Users handoff producers and controls without a browser. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require = createRequire(import.meta.url);
const routePath = new URL('../src/routes/users.tsx', import.meta.url);
const source = readFileSync(routePath, 'utf8');
const ast = ts.createSourceFile('users.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const list = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'UsersListView');
const declaration = name => {
  const nodes = [...ast.statements, ...list.body.statements];
  const found = nodes.find(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(ast) === name));
  assert.ok(found, `Actual Users declaration ${name}`);
  return found.getText(ast);
};
function execute(code, context = {}) {
  const compiled = ts.transpileModule(code, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {exports,module:{exports},require,URL,Date,console,...context});
  return exports;
}
const constants = ['MEMBER_ACCESS_HANDOFF_SCHEMA_VERSION','MEMBERSHIP_EDITABLE_REGIONS','MEMBERSHIP_DATA_BINDINGS','MEMBERSHIP_ACTION_BINDINGS','MEMBERSHIP_FLOW_SYSTEMS','MEMBERSHIP_HANDOFF_STEPS','MEMBERSHIP_AUTH_BOUNDARIES','ROLE_OPTIONS','ROLE_ACCESS_SUMMARY','ROLE_CAPABILITIES','STATUS_OPTIONS'].map(declaration).join('\n');
const fixture = {useMemo:fn=>fn(),membershipSiteId:'site-a',encodedMembershipSiteId:'site-a',membershipSite:{id:'site-a',name:'Private label',slug:'site-a'},publicFormsUrl:'https://api.fixture/api/sites/site-a/forms',publicRegistrationDefinitionUrl:'definition',publicRegistrationSubmitUrl:'submit',publicContactsUrl:'contacts',usersListUrl:'https://admin.fixture/api/admin/users',userDetailUrl:'detail'};
// This assertion failed against the previous actual route before the repair.
let helper = {};
try { helper = execute(readFileSync(new URL('../src/lib/usersMembershipHandoff.ts', import.meta.url),'utf8'), {require:id => id === '@backy-cms/core' ? execute(readFileSync(new URL('../../../packages/core/src/visitor-accounts.ts', import.meta.url),'utf8')) : id === '@/lib/siteSelection' ? execute(readFileSync(new URL('../src/lib/siteSelection.ts',import.meta.url),'utf8')) : require(id)}); } catch(error) { if (error.code !== 'ENOENT') throw error; }
const visitorAccounts = helper.buildUsersVisitorAccountHandoff?.(fixture.membershipSite,'https://api.fixture');
let member = execute(`${constants}\n${declaration('memberAccessHandoff')}\nexports.value=memberAccessHandoff`, {...fixture,visitorAccounts}).value;
assert.equal(member.visitorAccounts?.implementation,'source-implemented','Copied member handoff must expose implemented visitor auth, independently of provider readiness');
console.log('Baseline gap repaired: actual member handoff includes visitorAccounts.');
let checks = 1;
const check = (condition, message) => {assert.ok(condition,message); checks++;};
const a = {id:'internal-a',publicSiteId:'site-a',slug:'alpha',name:'SECRET_LABEL',status:'published',settings:{visitorAccounts:{enabled:false,registrationEnabled:false,allowedOrigins:[],returnUrls:[],password:'SECRET_PASSWORD',providerSubject:'SECRET_SUBJECT'}}};
const b = {id:'internal-b',publicSiteId:'site-b',slug:'beta',name:'SECRET_OTHER_LABEL',status:'published',settings:{visitorAccounts:{enabled:true,registrationEnabled:true,allowedOrigins:['https://website.fixture'],returnUrls:['https://website.fixture/account'],accessToken:'SECRET_TOKEN'}}};
check(helper.resolveUsersMembershipSite([a,b],'beta') === b,'Known alias resolves to the selected canonical site');
check(helper.resolveUsersMembershipSite([a,b],'unknown') === undefined,'Unknown explicit scope never borrows the first site');
check(helper.resolveUsersMembershipSite([],'') === undefined,'Empty store never invents demo membership');
check(helper.resolveUsersMembershipSite([{...a,publicSiteId:'private@mail.fixture'}],'internal-a') === undefined,'Identity-like canonical IDs cannot enter copied contracts');
for (const base of ['https://user:SECRET_PASSWORD@api.fixture','https://api.fixture?token=SECRET_TOKEN','https://api.fixture/#SECRET_TOKEN','javascript:SECRET_TOKEN']) check(helper.safeUsersHandoffBaseUrl(base)==='','Credentialed/query/fragment/unsafe base rejected');
const disabled = helper.buildUsersVisitorAccountHandoff(a,'https://api.fixture');
const enabled = helper.buildUsersVisitorAccountHandoff(b,'https://api.fixture');
check(disabled.connection.policyState === 'disabled' && disabled.implementation === 'source-implemented','Disabled admission does not reclassify API implementation as unshipped');
check(enabled.connection.policyState === 'enabled-requires-live-verification' && enabled.connection.productionProviderProof === 'pending','Enabled policy never certifies provider connection');
check(helper.buildUsersVisitorAccountHandoff({...b,status:'draft'},'https://api.fixture').connection.policyState === 'site-not-published','Unpublished site admission remains unavailable');
check(helper.buildUsersVisitorAccountHandoff({...b,settings:{}},'https://api.fixture').connection.policyState === 'unknown-read-canonical-handoff','Missing cached policy is unknown, not enabled');
check(helper.buildUsersVisitorAccountHandoff({...b,settings:{visitorAccounts:{enabled:true,allowedOrigins:['https://website.fixture'],returnUrls:['https://unapproved.fixture/account']}}},'https://api.fixture').connection.policyState==='configuration-required','Invalid exact return policy remains a connection gap');
const unknown = helper.buildUsersVisitorAccountHandoff(undefined,'https://api.fixture');
check(unknown.scope.siteId===null && unknown.discovery.agentHandoff===null && Object.keys(unknown.endpoints).length===0,'Unknown scope has no executable visitor endpoints');
const canonical = execute(readFileSync(new URL('../../../packages/core/src/visitor-accounts.ts', import.meta.url),'utf8')).buildBackyVisitorAccountHandoff('site-b');
check(JSON.stringify(enabled.methods)===JSON.stringify(canonical.methods),'Methods mirror actual canonical producer');
for(const [key,path] of Object.entries(canonical.endpoints)) check(enabled.endpoints[key]===`https://api.fixture${path}`,`Actual canonical endpoint ${key}`);
check(disabled.connection.registrationEnabled === false && enabled.connection.registrationEnabled === true,'Registration enablement follows selected-site observation, never unconditional availability');
check(enabled.discovery.agentHandoff==='https://api.fixture/api/sites/site-b/agent-handoff' && enabled.discovery.visitorAccountsPath==='data.handoff.visitorAccounts','Canonical direct read points to exact selected site');
check(enabled.discovery.manifestPath==='data.contract.customFrontendAgentHandoff.visitorAccounts' && enabled.discovery.openapiPath==='x-backy-custom-frontend-agent-handoff.visitorAccounts','Mirror pointers retain real response shapes');
const sdkSource = readFileSync(new URL('../../../packages/sdk-js/src/index.ts', import.meta.url),'utf8');
for (const name of enabled.sdk.helpers) check(sdkSource.includes(`  ${name}(`),`Checked SDK helper ${name}`);
const bffSource = readFileSync(new URL('../../../examples/custom-frontend-next/src/lib/visitor-bff.ts', import.meta.url),'utf8');
check(bffSource.includes("from 'node:crypto'") && bffSource.includes("from 'next/server'") && bffSource.includes('process.env.BACKY_VISITOR_FRONTEND_ORIGIN'),'Account bridge pointer refers to actual Next server runtime');
check(JSON.stringify(enabled).includes('/api/backy-account/:operation') && enabled.starter.accountPage==='/account','Checked account route and server bridge advertised');
for(const payload of [disabled,enabled,unknown]) check(!/SECRET_|private@mail|website\.fixture/.test(JSON.stringify(payload)),'Allowlisted visitor handoff omits credentials, subjects, labels, raw members and cached URL values');

// Re-render the actual selected-site memos with stable sites and changed search.
const hooks=[]; let cursor=0;
const useMemo=(fn,deps)=>{const i=cursor++; if(!hooks[i] || !deps.every((v,j)=>Object.is(v,hooks[i].deps[j]))) hooks[i]={deps,value:fn()}; return hooks[i].value;};
const scopeCode=['selectedMembershipSiteId','membershipSite','membershipSiteId','visitorAccounts','membershipScopeDisabledReason'].map(declaration).join('\n')+'\nexports.value={membershipSiteId,visitorAccounts,membershipScopeDisabledReason};';
const sites=[a,b];
function scope(siteId){cursor=0;return execute(scopeCode,{...helper,useMemo,routeSearch:{siteId},sites,publicBaseUrl:'https://api.fixture',getSiteSelectionFromSearch:()=>{throw Error('Explicit route must own site selection');}}).value;}
check(scope('internal-a').membershipSiteId==='site-a','Actual route uses canonical A scope');
check(scope('beta').visitorAccounts.discovery.agentHandoff.endsWith('/site-b/agent-handoff'),'Actual memo updates on site switch without store replacement');
check(scope('unknown').membershipScopeDisabledReason && scope('unknown').membershipSiteId==='','Actual route denies unknown scope instead of silently changing sites');

const rawUsers=[{id:'private-id',fullName:'SECRET_NAME',email:'PRIVATE_MAIL@mail.fixture',role:'owner',status:'active',lastActive:'SECRET_TOKEN',password:'SECRET_PASSWORD',member:{subject:'SECRET_SUBJECT'}}];
const outerContext={...fixture,visitorAccounts:disabled,memberAccessHandoff:member,accessReadiness:{score:0,checks:[]},users:rawUsers,data:rawUsers,userAuthority:{activeOwners:[],activeAdmins:[],activePrivilegedCount:0,state:'ready',currentBackyUser:{role:'owner'}},currentAdmin:{role:'owner'},searchQuery:'PRIVATE_MAIL@mail.fixture',roleFilter:'all',statusFilter:'all',reviewFilter:'all',currentPage:1,totalPages:1,totalItems:1};
const outer=execute(`${constants}\n${declaration('userHandoff')}\nexports.value=userHandoff`,outerContext).value;
check(outer.membership.visitorAccounts.implementation==='source-implemented' && outer.membership.frontendHandoff.visitorAccounts.implementation==='source-implemented','Both actual copy producers expose visitor implementation');
check(!outer.membership.authBoundary.notYetShipped.includes('credentialed-login'),'Credentialed API implementation is not marked unshipped');
check(!/SECRET_|PRIVATE_MAIL|private-id/.test(JSON.stringify(outer)),'Whole Users handoff excludes search identity and raw account records');
check(outer.filters.searchActive===true && outer.users.length===0 && outer.filters.search==='' ,'User projection keeps aggregate/filter state only');
check(member.schemaVersion==='backy.member-access-handoff.v1' && Object.keys(member.site).sort().join(',')==='id,name,slug' && member.authProviderGate.providerFamily==='supabase-auth-or-compatible','Existing v1 schema/site/provider keys retained without private metadata');
check(member.pageTemplates.registration.includes('template=registration') && member.publicApis.formsCatalog===fixture.publicFormsUrl && member.editableRegions.length===3,'Existing lead form/template/binding contract preserved');

const findJsx=testId=>{let found; const visit=n=>{if((ts.isJsxElement(n)||ts.isJsxSelfClosingElement(n)) && (ts.isJsxElement(n)?n.openingElement:n).attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.getText(ast)==='data-testid'&&p.initializer?.text===testId)) found=n;ts.forEachChild(n,visit);};visit(list);assert.ok(found);return found.getText(ast);};
const Button=({iconStart,size,variant,...props})=>React.createElement('button',props,props.children);
const uiContext={...outerContext,isUsersBusy:false,canViewUsers:true,membershipScopeDisabledReason:'',memberAccessHandoffText:JSON.stringify(member),MEMBER_ACCESS_HANDOFF_SCHEMA_VERSION:'backy.member-access-handoff.v1',Button,Copy:()=>null,UserApiStat:()=>null,UserApiSnippet:props=>React.createElement('code',null,`${props.label}: ${props.value}`)};
const uiCode=`${constants}\nexports.value=(${findJsx('users-member-access-handoff')});`;
let copied=[],notices=[];
const copyContext={navigator:{clipboard:{writeText:async text=>copied.push(text)}},setNotice:text=>notices.push(text)};
function renderControls(overrides={}) {return execute(`${constants}\n${declaration('copyUserApiText')}\nexports.value=(${findJsx('users-member-access-handoff')});`,{...uiContext,...copyContext,...overrides}).value;}
function findButton(tree){if(tree?.type===Button)return tree;for(const child of React.Children.toArray(tree?.props?.children)){const found=findButton(child);if(found)return found;}}
const ui = renderControls();
const html=renderToStaticMarkup(ui);
check(html.includes('all account API operations') && html.includes('Policy: disabled') && html.includes('Provider proof: pending') && html.includes('server-only account BFF'),'Actual rendered panel distinguishes implementation/policy/provider proof');
check(!html.includes('Self-service profile/email changes') && !html.includes('Self-service email changes and privacy erasure') && html.includes('Verified email change and Owner mailbox reading are implemented in source') && html.includes('privacy erasure, mailbox compose/reply and payments remain separate work'),'Actual visible panel distinguishes implemented profile/email/inbox from unfinished privacy/compose/payment workflows');
await findButton(ui).props.onClick(); await Promise.resolve();
check(copied.length===1 && JSON.parse(copied[0]).visitorAccounts.implementation==='source-implemented','Actual copy action writes the updated member contract');
for(const overrides of [{isUsersBusy:true},{canViewUsers:false},{membershipScopeDisabledReason:'Select a known site'}]){const before=copied.length;await findButton(renderControls(overrides)).props.onClick();await Promise.resolve();check(copied.length===before,'Actual handler blocks busy, denied-view and unknown-scope calls even if invoked directly');}
check(findButton(renderControls({membershipScopeDisabledReason:'Select a known site'})).props.disabled,'Unknown scope is visibly disabled');
let navigated=[];
const stepCode=`${declaration('openMembershipStep')}\nexports.action=openMembershipStep;`;
for(const id of ['site-a','site-b']){const action=execute(stepCode,{isUsersBusy:false,canViewUsers:true,membershipScopeDisabledReason:'',membershipSiteId:id,setNotice:text=>notices.push(text),navigate:input=>navigated.push(input)}).action;action({to:'/pages/new',template:'member-login'});check(navigated.at(-1).search.siteId===id && navigated.at(-1).search.template==='member-login','Actual template action retains exact selected site');}
const before=navigated.length;execute(stepCode,{isUsersBusy:false,canViewUsers:true,membershipScopeDisabledReason:'Select a known site',setNotice:text=>notices.push(text),navigate:input=>navigated.push(input)}).action({to:'/pages/new',template:'registration'});
check(navigated.length===before,'Actual unknown scope cannot navigate to a borrowed template');
const userCopyCode=`${declaration('copyUserApiText')}\nexports.value=(${findJsx('users-command-copy-manifest')});`;
const outerText=JSON.stringify(outer);
const userButton=execute(userCopyCode,{...uiContext,...copyContext,userHandoffText:outerText,usersCommandCopyDisabledReason:'',usersCommandSecondaryActionStatusId:'status',usersCommandCopyActionStatus:'Copy available'}).value;
await userButton.props.onClick();await Promise.resolve();
check(JSON.parse(copied.at(-1)).membership.visitorAccounts.implementation==='source-implemented' && !/SECRET_|PRIVATE_MAIL/.test(copied.at(-1)),'Actual Users manifest copy writes sanitized visitor-aware producer');
let downloadBlob,downloadClicks=0;
const anchor={click:()=>downloadClicks++,remove:()=>{}};
class DownloadURL extends URL {static createObjectURL(blob){downloadBlob=blob;return 'blob:fixture';} static revokeObjectURL(){}}
const downloadContext={isUsersBusy:false,canViewUsers:true,userHandoffText:outerText,Blob,URL:DownloadURL,document:{createElement:()=>anchor,body:{append:()=>{}}},setNotice:text=>notices.push(text)};
execute(`${declaration('downloadUserHandoff')}\nexports.action=downloadUserHandoff;`,downloadContext).action();
check(downloadClicks===1 && JSON.parse(await downloadBlob.text()).membership.visitorAccounts.implementation==='source-implemented','Actual download contains same sanitized visitor-aware handoff');
for(const overrides of [{isUsersBusy:true},{canViewUsers:false}]){execute(`${declaration('downloadUserHandoff')}\nexports.action=downloadUserHandoff;`,{...downloadContext,...overrides}).action();check(downloadClicks===1,'Actual download guard denies busy/view-disabled calls');}
check(JSON.stringify(enabled.pending).includes('self-service email') && JSON.stringify(enabled.pending).includes('mailbox and payments'),'Unsupported self-service/mailbox/payments are not promised');
console.log(`Users member handoff: ${checks} actual producer, render/copy/action, site-switch, privacy and contract assertions passed.`);
