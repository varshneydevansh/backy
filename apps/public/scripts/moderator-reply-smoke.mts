import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import Ajv from 'ajv/dist/2020.js';
import { NextRequest, NextResponse } from 'next/server';
import { verifyModeratorReplies } from './moderator-reply-handler-fixture.mts';
import { fixture, serviceScopes } from './admin-access-test-fixtures.mts';

const source = ts.createSourceFile('openapi.ts', readFileSync(new URL('../src/app/api/sites/[siteId]/openapi/route.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const nodes = new Map<string, ts.Expression>();
let operation: any;
function walk(node: ts.Node) {
  if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'schemas' && ts.isObjectLiteralExpression(node.initializer)) {
    for (const prop of node.initializer.properties) if (ts.isPropertyAssignment(prop) && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))) nodes.set(prop.name.text, prop.initializer);
  }
  if (ts.isObjectLiteralExpression(node)) {
    const id = node.properties.find(prop => ts.isPropertyAssignment(prop) && prop.name.getText(source).replaceAll('"', '') === 'operationId' && prop.initializer.getText(source) === '"createAdminCommentReply"');
    if (id) operation = vm.runInNewContext('(' + node.getText(source) + ')');
  }
  ts.forEachChild(node, walk);
}
walk(source); assert(operation);
const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false }), registered = new Set<string>();
function register(name: string) {
  if (registered.has(name)) return; registered.add(name);
  assert(nodes.has(name), name);
  const schema = vm.runInNewContext('(' + nodes.get(name)!.getText(source) + ')', { envelopeSchema: (data: any) => ({ type: 'object', required: ['success', 'requestId', 'data'], properties: { success: { const: true }, requestId: { type: 'string' }, data } }) });
  for (const match of JSON.stringify(schema).matchAll(/#\/components\/schemas\/(\w+)/g)) register(match[1]);
  ajv.addSchema(schema, '#/components/schemas/' + name);
}
for (const name of ['ModeratorCommentReplyRequest', 'CommentSubmissionEnvelope', 'ErrorEnvelope']) register(name);
function validate(status: number, payload: any) {
  const fn = ajv.getSchema(operation.responses[String(status)].content['application/json'].schema.$ref)!;
  assert(fn(payload), ajv.errorsText(fn.errors));
}
assert.equal(operation['x-backy-permission'], 'comments.manage');
assert.equal(operation['x-backy-sdk-method'], 'createAdminCommentReply');
for (const extra of ['userId', 'skipActivity', 'rateLimitBypass', 'parentId']) assert.equal(ajv.getSchema('#/components/schemas/ModeratorCommentReplyRequest')!({ content: 'Reply', [extra]: 'forged' }), false);
let checks = 6;
// Real authorization code on the new path, with synthetic stored scope records.
for (const demo of [false, true]) {
  const f = fixture({ demo, actorRole: 'owner' });
  const scope = { version: 1, revision: 1, mode: 'selected-sites', siteIds: [f.site.id], permissions: ['comments.manage'], expiresAt: null };
  const issued = await f.call('settings', 'POST', { action: 'issue-admin-api-key', label: 'Moderator fixture', scope });
  assert.equal(issued.status, 200, JSON.stringify(issued.body));
  const key = issued.body.data.issuedKey.adminApiKey;
  const authorize = (site: string, permission = 'comments.manage') => f.access.requireAdminAccess(new NextRequest(`http://fixture.invalid/api/admin/sites/${site}/comments/parent/replies`, { method: 'POST', headers: { 'x-backy-admin-key': key, 'content-type': 'application/json' }, body: '{}' }), 'moderator-scope', { permission });
  assert.equal(serviceScopes.serviceKeySiteRouteIsClassified(`http://fixture.invalid/api/admin/sites/${f.site.id}/comments/parent/replies`), true);
  assert.equal((await authorize(f.site.slug)).type, 'api-key');
  for (const site of [f.otherSite.id, 'missing-site']) { const denied = await authorize(site); assert(denied instanceof NextResponse); assert.equal(denied.status, site === 'missing-site' ? 404 : 403); }
  const denied = await authorize(f.site.id, 'comments.view'); assert(denied instanceof NextResponse); assert.equal(denied.status, 403);
  checks += 8;
  const cookieRequest = new NextRequest(`http://fixture.invalid/api/admin/sites/${f.site.slug}/comments/parent/replies`, {method:'POST',headers:{cookie:'backy_admin_session=fixture-session',origin:'https://foreign.invalid'},body:'{}'});
  const originDenied = await f.access.requireAdminAccess(cookieRequest,'moderator-origin',{permission:'comments.manage'});
  assert(originDenied instanceof NextResponse);assert.equal(originDenied.status,403);assert.equal((await originDenied.json()).error.code,'ADMIN_COOKIE_ORIGIN_DENIED');checks+=3;
  for (const actorRole of ['owner','viewer'] as const) {
    const operator = fixture({demo,actorRole});
    const request = new NextRequest(`http://fixture.invalid/api/admin/sites/${operator.site.slug}/comments/parent/replies`,{method:'POST',headers:{origin:'http://fixture.invalid'},body:'{}'});
    const access = await operator.access.requireAdminAccess(request,'moderator-permission',{permission:'comments.manage'});
    if(actorRole==='owner')assert.equal(access.type,'session');else {assert(access instanceof NextResponse);assert.equal(access.status,403);}checks++;
  }
}
const previousCwd = process.cwd(), scratch = mkdtempSync('/tmp/backy-moderator-reply-');
const previousMode = process.env.BACKY_DATA_MODE;
process.chdir(scratch); process.env.BACKY_DATA_MODE = 'demo';
try {
  const imported: any = await import('../src/lib/backyStore.ts'), store = imported.default || imported;
  const site = store.getSiteByIdOrSlug('site-demo'); assert(site);
  const other = store.getSites().find((row: any) => row.id !== site.id) || store.createAdminSite({ name: 'Other moderator fixture', slug: 'other-moderator' });
  const targets: any[] = [];
  for (const type of ['page', 'post']) for (const status of ['draft', 'archived', 'published']) {
    const input = { title: 'Moderator ' + type + ' ' + status, slug: 'moderator-' + type + '-' + status, status, content: { elements: [], editableMap: {} } };
    const target = type === 'page' ? store.createAdminPage(site.id, input) : store.createAdminBlogPost(site.id, input);
    targets.push({ ...target, type });
  }
  checks += await verifyModeratorReplies({ demo: true, store, site, other, targets, validate });
  console.log(`Moderator reply actual persisted demo/handler/schema and real service-key scope PASS ${checks} checks; archived/draft pages+posts, pending/approved, target/thread/identity assertions, foreign/missing/auth no-write, atomic stale parent, saved followup warnings, no public intake relaxation. Owned scratch; no provider calls.`);
} finally {
  process.chdir(previousCwd); if (previousMode === undefined) delete process.env.BACKY_DATA_MODE; else process.env.BACKY_DATA_MODE = previousMode;
  rmSync(scratch, { recursive: true, force: true });
}
