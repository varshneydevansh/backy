import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectAdminRoute } from './admin-rbac-delegation-evidence.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const helperFile = path.join(appRoot, 'src/lib/adminVisitorErasure.ts');
const helper = fs.readFileSync(helperFile, 'utf8');
let controls = 0;
for (const operation of ['preview', 'confirm']) {
  const file = path.join(appRoot, `src/app/api/admin/sites/[siteId]/visitors/members/[memberId]/privacy-erasure/${operation}/route.ts`);
  const source = fs.readFileSync(file, 'utf8');
  const inspect = (routeSource = source, helperSource = helper) => inspectAdminRoute({ file, source: routeSource, appRoot, readSource: target => target === helperFile ? helperSource : fs.readFileSync(target, 'utf8') })[0];
  assert.equal(inspect().guarded, true);
  assert.deepEqual(inspect().capabilities, ['users.delete']);
  const reject = (label, before, after, route = false) => {
    const original = route ? source : helper, changed = original.replace(before, after);
    assert.notEqual(changed, original, label + ' must mutate actual source');
    assert.equal((route ? inspect(changed) : inspect(source, changed)).guarded, false, label);
    controls++;
  };
  reject('central admission omitted', 'requireAdminAccess(request,', 'unguardedAccess(request,');
  reject('wrong request admitted', 'requireAdminAccess(request,', 'requireAdminAccess(otherRequest,');
  reject('capability omitted', "permission:'users.delete'", "roles:['owner']");
  reject('denial removed', 'if(access instanceof NextResponse)', 'if(false)');
  reject('Owner predicate removed', 'if(!isOwnerAdminSession(access))', 'if(false)');
  reject('Owner uses foreign admission', 'isOwnerAdminSession(access)', 'isOwnerAdminSession(otherAccess)');
  reject('usage writes enabled', 'recordUsage:false', 'recordUsage:true');
  reject('wrong cookie', "cookies.get('backy_admin_session')", "cookies.get('foreign_cookie')");
  reject('explicit credentials bypassed', "'x-api-key'", "'unrelated-header'");
  reject('provider hidden before admission', 'const requestId=', 'const unsafe=unsafeProviderCall();const requestId=');
  reject('provider hidden in header predicate', 'request.headers.has(header)', 'unsafeProviderCall(header)');
  reject('counterfeit central guard', "from './adminAccess'", "from './counterfeitAccess'");
  reject('foreign site forwarded', 'handleAdminVisitorErasure(request,siteId,memberId,', "handleAdminVisitorErasure(request,'foreign-site',memberId,", true);
  reject('foreign member forwarded', 'handleAdminVisitorErasure(request,siteId,memberId,', "handleAdminVisitorErasure(request,siteId,'foreign-member',", true);
  reject('new unguarded sibling', 'return handleAdminVisitorErasure(', 'return unguardedHandler(', true);
}
console.log(`Visitor erasure structural RBAC PASS: actual users.delete delegates and ${controls} fail-closed negative controls; no route exemptions.`);
