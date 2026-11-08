import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import Ajv2020 from 'ajv/dist/2020.js';
const source = ts.createSourceFile('openapi.ts', readFileSync(new URL('../src/app/api/sites/[siteId]/openapi/route.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const schemas = new Map<string, ts.Expression>(), operations = new Map<string, any>();
function visit(node: ts.Node) {
  if (ts.isPropertyAssignment(node)) {
    if (node.name.getText(source) === 'schemas' && ts.isObjectLiteralExpression(node.initializer)) for (const property of node.initializer.properties) if (ts.isPropertyAssignment(property) && (ts.isStringLiteral(property.name) || ts.isIdentifier(property.name))) schemas.set(property.name.text, property.initializer);
    if (ts.isComputedPropertyName(node.name) && node.name.expression.getText(source).startsWith('`/api/sites/${site.id}/visitor-auth/') && ts.isObjectLiteralExpression(node.initializer)) {
      const name = node.name.expression.getText(source).slice(1,-1).split('/').at(-1)!; operations.set(name, Object.values(vm.runInNewContext(`(${node.initializer.getText(source)})`))[0]);
    }
  }
  ts.forEachChild(node, visit);
}
visit(source);
const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true }), loaded = new Set<string>();
function register(name: string) {
  if (loaded.has(name)) return; loaded.add(name);
  const expression = schemas.get(name); assert.ok(expression, `Standard visitor schema ${name}`);
  const schema = vm.runInNewContext(`(${expression.getText(source)})`);
  for (const ref of JSON.stringify(schema).matchAll(/#\/components\/schemas\/(\w+)/g)) register(ref[1]);
  ajv.addSchema(schema, '#/components/schemas/' + name);
}
export function assertVisitorContract(operation: string, status: number | 'request', payload: unknown) {
  const op = operations.get(operation); assert.ok(op, `Documented visitor operation ${operation}`);
  const schema = status === 'request' ? op.requestBody?.content['application/json'].schema : op.responses[String(status)]?.content['application/json'].schema;
  assert.ok(schema, `Documented visitor ${operation} ${status}`); register(schema.$ref.split('/').at(-1));
  const validate = ajv.getSchema(schema.$ref)!; assert.ok(validate(payload), `Visitor ${operation} ${status} actual payload: ${ajv.errorsText(validate.errors)}`);
}
assert.equal(operations.size, 10);
for (const [name, op] of operations) {
  assert.equal(op['x-backy-auth-boundary'], 'site-visitor-only'); assert.doesNotMatch(JSON.stringify(op.security), /Admin/);
  assert.equal(op.parameters.find((p: any) => p.name === 'Origin').in, 'header');
  for (const status of ['401','403','404','429','503']) assert.equal(op.responses[status].content['application/json'].schema.$ref, '#/components/schemas/VisitorErrorEnvelope');
  assert.ok(op.operationId); assert.equal(op['x-backy-production-provider-proof'], 'pending');
}
assertVisitorContract('register', 'request', { email: 'member@example.com', password: 'correct-password', returnUrl: 'https://website.example/account' });
assertVisitorContract('register', 'request', { accessToken: 'verified-user-token' });
assertVisitorContract('reset-password', 'request', { accessToken: 'verified-user-token', recoveryToken: 'bkv_' + 'a'.repeat(43), password: 'correct-password' });
assert.throws(() => assertVisitorContract('register', 'request', { role: 'owner', email: 'member@example.com', password: 'correct-password', returnUrl: 'https://website.example/account' }));
assert.throws(() => assertVisitorContract('reset-password', 'request', { accessToken: 'verified-user-token', recoveryToken: 'admin-token', password: 'correct-password' }));

assert.equal(operations.get('profile').operationId, 'updateBackyVisitorProfile');
assert.equal(operations.get('profile').responses['405'].content, undefined, 'Framework method denial does not invent a JSON envelope');
assertVisitorContract('profile', 'request', { displayName: '  Visitor name  ' });
assertVisitorContract('profile', 'request', { displayName: '' });
for (const input of [{}, {displayName: null}, {displayName: 'bad\nname'}, {displayName: 'bad\u0085name'}, ...['email','status','roles','memberId','siteId','accessToken'].map(key => ({displayName:'Name', [key]:'injected'}))]) assert.throws(() => assertVisitorContract('profile', 'request', input));
console.log('Visitor OpenAPI: ten isolated account operations and strict profile request schema passed; trimmed UTF-16 bounds verified by real handler.');

assertVisitorContract('email-change', 'request', {newEmail:'new@example.invalid',currentPassword:'fresh-password',returnUrl:'https://website.example/account'});
assertVisitorContract('confirm-email-change', 'request', {email:'new@example.invalid',password:'fresh-password'});
for(const name of ['email-change','confirm-email-change']){ const input=name==='email-change'?{newEmail:'new@example.invalid',currentPassword:'fresh-password',returnUrl:'https://website.example/account'}:{email:'new@example.invalid',password:'fresh-password'};for(const extra of ['siteId','memberId','providerSubject','accessToken','role'])assert.throws(()=>assertVisitorContract(name,'request',{...input,[extra]:'injected'}));}
for (const [operation,status,flag] of [['email-change',202,'confirmationRequired'],['confirm-email-change',200,'emailChanged']] as const) {
  const data = {[flag]:true,signInRequired:true,message:'Use ordinary sign-in.'};
  assertVisitorContract(operation,status,{success:true,data}); // Native visitor envelopes do not require requestId.
  for(const invalid of [{...data,[flag]:false},{...data,signInRequired:false},{[flag]:true,message:'Incomplete'}, {...data,accessToken:'PRIVATE_SENTINEL'}]) assert.throws(()=>assertVisitorContract(operation,status,{success:true,data:invalid}));
  for(const denied of [400,401,403,404,409,413,415,429,503]) assertVisitorContract(operation,denied,{success:false,error:{code:'VISITOR_AUTHENTICATION_REQUIRED',message:'Unavailable'}});
}

assertVisitorContract('callback','request',{code:'provider-code',state:'bkv_'+'a'.repeat(43),returnUrl:'https://website.example/account'});
assertVisitorContract('reset-password','request',{code:'provider-code',state:'bkv_'+'a'.repeat(43),returnUrl:'https://website.example/account',password:'correct-password'});
assert.throws(()=>assertVisitorContract('callback','request',{code:'provider-code',state:'bad',returnUrl:'https://website.example/account'}));
assert.throws(()=>assertVisitorContract('reset-password','request',{code:'provider-code',state:'bkv_'+'a'.repeat(43),returnUrl:'https://website.example/account',password:'correct-password',accessToken:'mixed'}));
