#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { inspectAdminRoute } from './admin-rbac-delegation-evidence.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function routes(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? routes(file) : entry.name === 'route.ts' ? [file] : [];
  });
}
let negativeControls = 0, delegatedMethods = 0, credentialContextMethods = 0, ownerResourceMethods = 0, decoratedResourceMethods = 0;
for (const file of routes(path.join(appRoot, 'src/app/api/admin'))) {
  const source = fs.readFileSync(file, 'utf8');
  const baseline = inspectAdminRoute({ file, source, appRoot });
  for (const method of baseline.filter(item => item.kind === 'delegated')) {
    delegatedMethods++;
    const helperFile = path.join(appRoot, method.helper), helperSource = fs.readFileSync(helperFile, 'utf8');
    const reject = (label, routeSource = source, helperOverride = helperSource, missing = false) => {
      const evidence = inspectAdminRoute({ file, source: routeSource, appRoot, readSource: target => {
        if (missing) throw new Error('Helper path unavailable');
        return target === helperFile ? helperOverride : fs.readFileSync(target, 'utf8');
      } });
      assert.equal(evidence.find(item => item.method === method.method)?.guarded, false, `${method.path || file} ${method.method}: ${label} must fail`);
      negativeControls++;
    };
    reject('missing shared guard', source, helperSource.replace(/\brequireAdminAccess\s*\(/g, 'unguardedAccess('));
    reject('helper guards a different request', source, helperSource.replace(/requireAdminAccess\s*\(\s*request\s*,/g, 'requireAdminAccess(otherRequest,'));
    reject('missing immediate denial', source, helperSource.replace(/\bif\s*\(\s*access\s+instanceof\s+NextResponse\s*\)/g, 'if (false)'));
    reject('missing capability', source, helperSource.replace(/\bpermissions?\b/g, 'roles'));
    reject('empty capability branch', source, helperSource.replace(/\bpermissions?\b(?=\s*[:,}])/g, matched => `${matched}: (false ? 'sites.view' : []), discarded`));
    reject('missing imported helper file', source, helperSource, true);
    reject('broken imported helper path', source.replace(`@/lib/${path.basename(method.helper, '.ts')}`, '@/lib/missingGuardedHelper'));
    reject('removed delegation', source.replace(new RegExp(`return\\s+(?:await\\s+)?${method.function}\\s*\\(`, 'g'), 'return unguardedHandler('));
    reject('substituted request', source.replace(new RegExp(`${method.function}\\s*\\(\\s*request\\s*,`, 'g'), `${method.function}(new Request('http://localhost/'),`));
    const routeTree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const routeFunction = routeTree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === method.method);
    const call = routeFunction.body.statements.at(-1).expression;
    const actualCall = ts.isAwaitExpression(call) ? call.expression : call;
    const lastArgs = actualCall.arguments.slice(1);
    const withoutSite = source.slice(0, lastArgs[0].getStart(routeTree)) + "'other-site'" + source.slice(lastArgs.at(-1).end);
    reject('discarded site params', withoutSite);
    const helperTree = ts.createSourceFile(helperFile, helperSource, ts.ScriptTarget.Latest, true);
    const helperFunction = helperTree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === method.function);
    const insert = helperFunction.body.getStart(helperTree) + 1;
    reject('repository side effect before guard', source, helperSource.slice(0, insert) + '\nawait unsafeRepositoryWrite();\n' + helperSource.slice(insert));
    // Exercise the actual context-forwarding and fail-closed credential shape,
    // without granting admission based on a route family or helper name.
    if (actualCall.arguments.some(argument => ts.isIdentifier(argument) && argument.text === 'context')) {
      credentialContextMethods++;
      const mutateCurrentHelper=(before,after)=>{const text=helperFunction.getText(helperTree),changed=text.replace(before,after);assert.notEqual(changed,text,'Negative mutation must affect the current exported helper');return helperSource.slice(0,helperFunction.getStart(helperTree))+changed+helperSource.slice(helperFunction.end);};
      assert.deepEqual(method.capabilities, method.function === 'siteMailboxSendingRoute' && /operation: 'send'/.test(helperSource) ? ['sites.view', 'settings.view', 'settings.configure'] : /settings\.configure/.test(helperFunction.getText(helperTree)) ? ['sites.view', 'settings.view', 'settings.configure'] : ['sites.view', 'settings.view'], 'Mailbox delegates must expose every actual required capability');
      const helperCall = helperFunction.body.statements.find(ts.isTryStatement).tryBlock.statements.find(statement => ts.isVariableStatement(statement) && statement.getText(helperTree).includes('requireAdminAccess('));
      assert(helperCall, 'Credential-context helper must have its actual access declaration');
      reject('removed gate declaration', source, helperSource.slice(0, helperCall.getStart(helperTree)) + helperSource.slice(helperCall.end));
      const guards=[]; const findGuard=node=>{if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='requireAdminAccess')guards.push(node);ts.forEachChild(node,findGuard);};findGuard(helperCall);
      const accessOptions=guards[0]?.arguments[2];assert(accessOptions&&ts.isObjectLiteralExpression(accessOptions));const permission=accessOptions.properties.find(property=>ts.isPropertyAssignment(property)&&['permission','permissions'].includes(property.name.getText(helperTree).replace(/[\"']/g,'')));assert(permission&&ts.isPropertyAssignment(permission));
      reject('empty permissions',source,helperSource.slice(0,permission.initializer.getStart(helperTree))+'[]'+helperSource.slice(permission.initializer.end));
      const guardDenial=helperFunction.body.statements.find(ts.isTryStatement).tryBlock.statements.find(statement=>ts.isIfStatement(statement)&&statement.expression.getText(helperTree).replace(/\s+/g,'')==='accessinstanceofNextResponse');assert(guardDenial,'Actual central denial');
      const replaceDenial=text=>helperSource.slice(0,guardDenial.getStart(helperTree))+text+helperSource.slice(guardDenial.end);
      reject('denial falls through',source,replaceDenial('if (access instanceof NextResponse) {}'));
      reject('denial performs provider work', source, replaceDenial('if (access instanceof NextResponse) { await unsafeProviderCall(); return access; }'));
      reject('denial has an unguarded else branch', source, replaceDenial('if (access instanceof NextResponse) return access; else return Response.json({unguarded:true});'));
      reject('substituted route context', source.replace(actualCall.expression.getText(routeTree)+'(request, context', actualCall.expression.getText(routeTree)+"(request, { params: Promise.resolve({siteId:'other-site'}) }"));
      const declarations=[];const findParams=node=>{if(ts.isVariableDeclaration(node)&&node.initializer&&ts.isAwaitExpression(node.initializer)&&node.initializer.expression.getText(helperTree)==='context.params')declarations.push(node);ts.forEachChild(node,findParams);};findParams(helperFunction);assert(declarations.length,'Actual context params declaration');const paramsDeclaration=declarations[0];
      reject('helper discards forwarded params',source,helperSource.slice(0,paramsDeclaration.initializer.getStart(helperTree))+"{siteId:'other-site'}"+helperSource.slice(paramsDeclaration.initializer.end));
      reject('helper discards forwarded siteId', source, mutateCurrentHelper(/params\.siteId/g, "'other-site'"));
      reject('provider call hidden in credential condition', source, mutateCurrentHelper("request.cookies.get('backy_admin_session')", 'unsafeProviderCall()'));
      reject('provider call hidden in some callback', source, mutateCurrentHelper('request.headers.has(header)', 'unsafeProviderCall(header)'));
      reject('provider call used as header argument', source, mutateCurrentHelper('request.headers.has(header)', 'request.headers.has(unsafeProviderCall())'));
      reject('provider call used as cookie argument', source, mutateCurrentHelper("request.cookies.get('backy_admin_session')", 'request.cookies.get(unsafeProviderCall())'));
      reject('dormant forwarded params decoy', source, helperSource.slice(0,paramsDeclaration.initializer.getStart(helperTree))+"((async()=>{const originalParams=await context.params;return originalParams.siteId;}), {siteId:'other-site'})"+helperSource.slice(paramsDeclaration.initializer.end));
      reject('credential denial returns provider output', source, mutateCurrentHelper('return adminAccessError(403,', 'return unsafeProviderCall(403,'));
      reject('credential denial uses counterfeit auth import', source, helperSource.replace("from './adminAccess'", "from './counterfeitAccess'"));
      reject('request ID executes provider work', source, mutateCurrentHelper('Math.random()', 'unsafeProviderCall()'));
      reject('credential check executes work before returning', source, mutateCurrentHelper(/return\s+adminAccessError\(403,\s*'OWNER_SESSION_REQUIRED'/, "await unsafeProviderCall(); return adminAccessError(403, 'OWNER_SESSION_REQUIRED'"));
    }
    // Inspect the actual named resource argument and literal-header denial loop.
    // This branch selects syntax from the parsed helper, never a route whitelist.
    const memberPosition = helperFunction.parameters.findIndex(parameter => ts.isIdentifier(parameter.name) && parameter.name.text === 'memberId');
    if (memberPosition > 0 && helperSource.includes('Object.entries(headers)')) {
      ownerResourceMethods++;
      assert.equal(method.capabilities.length, 1);
      assert(['users.view', 'users.delete'].includes(method.capabilities[0]));
      const mutatedHelper = (label, before, after) => {
        const changed = helperSource.replace(before, after);
        assert.notEqual(changed, helperSource, `${label}: fixture mutation must change actual source`);
        reject(label, source, changed);
      };
      mutatedHelper('Owner predicate removed', 'if(!isOwnerAdminSession(access))', 'if(false)');
      mutatedHelper('Owner predicate inverted', 'if(!isOwnerAdminSession(access))', 'if(isOwnerAdminSession(access))');
      mutatedHelper('Owner uses different admission', 'isOwnerAdminSession(access)', 'isOwnerAdminSession(otherAccess)');
      const ownerDenial=helperSource.match(/if\(!isOwnerAdminSession\(access\)\)return (adminAccessError\(403,'OWNER_SESSION_REQUIRED','[^']*',requestId\);)/)?.[1];
      assert(ownerDenial);
      mutatedHelper('Owner error falls through', ownerDenial, '{}');
      mutatedHelper('usage writes enabled', 'recordUsage:false', 'recordUsage:true');
      const cookieDenial=helperSource.match(/if\(!request\.cookies\.get\('backy_admin_session'\)\?\.value\?\.trim\(\)\)return adminAccessError\(401,'UNAUTHORIZED','[^']*',requestId\);/)?.[0];
      assert(cookieDenial);
      mutatedHelper('cookie refusal removed', cookieDenial, '');
      mutatedHelper('cookie refusal polarity inverted', "if(!request.cookies.get('backy_admin_session')", "if(request.cookies.get('backy_admin_session')");
      mutatedHelper('wrong cookie accepted', "request.cookies.get('backy_admin_session')", "request.cookies.get('foreign_cookie')");
      mutatedHelper('explicit key refusal omitted', "'x-api-key'", "'unrelated-header'");
      mutatedHelper('credential presence uses empty-value bypass', 'request.headers.has(header)', 'request.headers.get(header)');
      mutatedHelper('credential refusal polarity inverted', "if(['authorization'", "if(!['authorization'");
      mutatedHelper('provider work in credential predicate', 'request.headers.has(header)', 'unsafeProviderCall(header)');
      mutatedHelper('provider work before denial header decoration', 'for(const[key,value]of Object.entries(headers))', 'await unsafeProviderCall();for(const[key,value]of Object.entries(headers))');
      mutatedHelper('provider work inside denial header decoration', 'access.headers.set(key,value);', '{access.headers.set(key,value);await unsafeProviderCall();}');
      mutatedHelper('provider response header source', "const headers={'cache-control'", "const headers=unsafeProviderCall();const unusedHeaders={'cache-control'");
      mutatedHelper('mutable response header source', "const headers={'cache-control'", "let headers={'cache-control'");
      mutatedHelper('shadowed response header source', 'if(access instanceof NextResponse){', "if(access instanceof NextResponse){const headers={'cache-control':'public'};");
      mutatedHelper('shadowed Object.entries implementation', 'const requestId=', 'const Object={entries:unsafeProviderCall};const requestId=');
      mutatedHelper('module shadows Object.entries implementation', "const headers={'cache-control'", "const Object={entries:unsafeProviderCall};const headers={'cache-control'");
      mutatedHelper('denial redirects header writes', 'access.headers.set(key,value)', 'otherAccess.headers.set(key,value)');
      const memberArgument = actualCall.arguments[memberPosition];
      assert(memberArgument && ts.isIdentifier(memberArgument) && memberArgument.text === 'memberId');
      const replaceMember = value => source.slice(0, memberArgument.getStart(routeTree)) + value + source.slice(memberArgument.end);
      reject('foreign member substituted', replaceMember("'foreign-member'"));
      reject('site passed as member', replaceMember('siteId'));
      reject('dormant member parameter decoy', source.replace(/const\s*\{\s*siteId\s*,\s*memberId\s*\}\s*=\s*await\s+context\.params\s*;/, "async function dormant(){const {memberId}=await context.params;return memberId;}const {siteId}=await context.params;const memberId='foreign-member';"));
    }
    if (helperFunction.parameters.some(parameter => ts.isIdentifier(parameter.name) && parameter.name.text === 'bindingId') && helperSource.includes('return secure(access)')) {
      decoratedResourceMethods++;
      assert.deepEqual(method.capabilities, ['sites.view', 'settings.view']);
      const mutate = (label, before, after) => { const changed = helperSource.replace(before, after); assert.notEqual(changed, helperSource, label + ' must mutate actual helper'); reject(label, source, changed); };
      mutate('decorated denial replaced', 'return secure(access)', 'return secure(otherAccess)');
      mutate('decorator performs provider work', "const secure = (response:NextResponse) => {", "const secure = (response:NextResponse) => { unsafeProviderCall();");
      mutate('decorator replaces exact response', 'return response;', 'return NextResponse.json({unguarded:true});');
      mutate('decorator uses nonliteral private headers', "'private, no-store'", 'unsafeProviderCall()');
      mutate('decorator mutates another response', 'response.headers.set', 'otherResponse.headers.set');
      mutate('decorator has async side effects', 'const secure = (response:NextResponse)', 'const secure = async (response:NextResponse)');
      mutate('decorator parameter shadow', 'attachmentId?:string)', 'attachmentId?:string,secure?:any)');
      mutate('decorator local shadow', 'const requestId=', 'const secure=(value:NextResponse)=>unsafeProviderCall(value);const requestId=');
      mutate('Owner predicate removed through decorator', 'if(!isOwnerAdminSession(access))', 'if(false)');
      mutate('usage write enabled through decorator', 'recordUsage:false', 'recordUsage:true');
      mutate('cookie wrong through decorator', "request.cookies.get('backy_admin_session')", "request.cookies.get('foreign_cookie')");
      mutate('header key presence missing through decorator', "'x-api-key'", "'foreign_header'");
      mutate('provider credential predicate through decorator', 'request.headers.has(header)', 'unsafeProviderCall(header)');
      for (const name of ['siteId', 'bindingId', 'uid', 'attachmentId']) {
        const position = helperFunction.parameters.findIndex(parameter => ts.isIdentifier(parameter.name) && parameter.name.text === name);
        const argument = actualCall.arguments[position];
        if (!argument) continue;
        assert(ts.isIdentifier(argument) && argument.text === name);
        reject('foreign ' + name + ' substituted', source.slice(0, argument.getStart(routeTree)) + "'foreign-resource'" + source.slice(argument.end));
      }
    }
    const newMethod = baseline.some(item => item.method === 'PUT') ? 'OPTIONS' : 'PUT';
    const extra = inspectAdminRoute({ file, source: source + `\nexport async function ${newMethod}(request: Request) { return Response.json({unguarded:true}); }`, appRoot });
    assert.equal(extra.find(item => item.method === newMethod)?.guarded, false, 'A guarded sibling method must not admit a new unguarded method');
    negativeControls++;
  }
}
assert(delegatedMethods >= 25, 'All original delegates and new mailbox methods must be exercised');
assert.equal(decoratedResourceMethods, 2, 'Both actual attachment resource delegates must exercise exact denial decoration/scope controls');
assert.equal(ownerResourceMethods, 3, 'Impact and both erasure Owner-cookie member delegates must exercise structural negative controls');
assert.equal(credentialContextMethods, 12, 'Original inbox, sending/thread and management context delegates must all exercise negative controls');
const directFixture = path.join(appRoot, 'src/app/api/admin/sites/[siteId]/negative-control/route.ts');
const inspect = source => inspectAdminRoute({ file: directFixture, source, appRoot });
const ownGuard = `import { requireAdminAccess } from '@/lib/adminAccess';\nexport async function GET(request: Request) { const access = await requireAdminAccess(request, 'id', { permission: 'sites.view' }); return access; }`;
assert.equal(inspect(ownGuard)[0].guarded, true);
assert.equal(inspect(ownGuard.replace('await requireAdminAccess(', 'await fakeAccess('))[0].guarded, false);
assert.equal(inspect(`export async function GET(request: Request) { /* requireAdminAccess(request) */ return Response.json({}); }`)[0].guarded, false);
assert.equal(inspect(`import { requireAdminAccess } from '@/lib/adminAccess'; export async function GET(request: Request) { async function dormant() { await requireAdminAccess(request, 'id', {permission:'sites.view'}); } return Response.json({}); }`)[0].guarded, false);
assert.equal(inspect(`export const POST = async (request: Request) => Response.json({unguarded:true});`)[0].guarded, false);
negativeControls += 4;
console.log(JSON.stringify({ ok: true, delegatedMethods, credentialContextMethods, ownerResourceMethods, decoratedResourceMethods, negativeControls, controls: ['guard', 'denial', 'capability', 'helper file/path', 'delegation', 'request/site/context forwarding', 'pre-admission credential predicates', 'pre-admission side effect', 'unguarded sibling', 'comment/dormant decoys'] }, null, 2));
