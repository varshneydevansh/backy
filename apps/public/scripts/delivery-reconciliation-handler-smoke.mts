// Actual handlers, history serializers and disposable on-disk journals. Synthetic admission/audit only.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import Ajv from 'ajv';
import { NextRequest, NextResponse } from 'next/server';
import { loadMediaFixture } from './media-storage-recovery-fixture.mts';

const ast = ts.createSourceFile('openapi.ts', readFileSync(new URL('../src/app/api/sites/[siteId]/openapi/route.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const nodes = new Map<string, ts.Expression>(), schemas: Record<string, unknown> = {};
function walk(node: ts.Node) { if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'schemas' && ts.isObjectLiteralExpression(node.initializer)) for (const p of node.initializer.properties) if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) nodes.set(p.name.text, p.initializer); ts.forEachChild(node, walk); } walk(ast);
function resolve(name: string) { if (schemas[name]) return; const node = nodes.get(name); assert(node, name); const value = vm.runInNewContext(`(${node.getText(ast)})`); schemas[name] = value; for (const match of JSON.stringify(value).matchAll(/#\/components\/schemas\/(\w+)/g)) resolve(match[1]); }
for (const name of ['DeliveryReconciliationRequest', 'CommentDeliveryReconciliationEnvelope', 'AdminFormDeliveryReconciliationEnvelope']) resolve(name);
const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false }); ajv.addSchema({ components: { schemas } }, 'review-contract');
const validators = Object.fromEntries(['Comment', 'AdminForm'].map(prefix => [prefix, ajv.compile({ $ref: `review-contract#/components/schemas/${prefix}DeliveryReconciliationEnvelope` })]));
const requestValidator = ajv.compile({ $ref: 'review-contract#/components/schemas/DeliveryReconciliationRequest' });
const previous = process.cwd(), scratch = mkdtempSync('/tmp/backy-review-handler-');
const savedEnv = { mode: process.env.BACKY_DATA_MODE, node: process.env.NODE_ENV };
process.chdir(scratch); process.env.BACKY_DATA_MODE = 'demo'; process.env.NODE_ENV = 'test';
try {
  const imported = await import('../src/lib/backyStore.ts'), store: any = (imported as any).default || imported;
  const comment = store.createComment({ siteId: 'site-demo', blogPostId: 'fixture-post', authorName: 'Synthetic', authorEmail: 'fixture@example.invalid', content: 'Synthetic', status: 'visible' });
  const form = store.createAdminForm({ siteId: 'site-demo', name: 'Synthetic review form', fields: [] });
  const submission = store.createFormSubmission({ siteId: 'site-demo', formId: form.id, values: {}, status: 'pending' });
  // Use the real owner predicate; the fixture controls only the central admission result.
  const accessSource = readFileSync(new URL('../src/lib/adminAccess.ts', import.meta.url), 'utf8');
  const predicateDependencies = Object.fromEntries([...accessSource.matchAll(/from '(@\/[^']+)'/g)].map(match => [match[1], {}]));
  const { isOwnerAdminSession } = loadMediaFixture('../src/lib/adminAccess.ts', predicateDependencies);
  let access: any = { type: 'session', session: { user: { id: 'fixture-owner', role: 'owner', status: 'active' } } }, deny = 0, auditFail = false;
  const admissions: string[] = [], audits: any[] = [];
  const mocks: any = { '@/lib/backyStore': store, '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => true },
    '@/lib/adminAccess': { isOwnerAdminSession, requireAdminAccess: async (_request: any, _id: any, options: any) => { admissions.push(options.permission); return deny ? NextResponse.json({ success: false, error: { code: 'ADMISSION_DENIED' } }, { status: deny, headers: { 'Cache-Control': 'private, no-store' } }) : access; } },
    '@/lib/adminAudit': { recordAdminAudit: async (input: any) => { if (auditFail) throw Error('Private synthetic credential'); audits.push(input); } } };
  for (const name of ['demoCommentDeliveryJournal', 'demoFormDeliveryJournal', 'commentDeliveryHistory', 'formDeliveryHistory', 'deliveryReconciliationHandler']) mocks['@/lib/' + name] = loadMediaFixture('../src/lib/' + name + '.ts', mocks);
  const routes = {
    comment: loadMediaFixture('../src/app/api/sites/[siteId]/comments/[commentId]/delivery-attempts/[attemptId]/reconciliation/route.ts', mocks),
    form: loadMediaFixture('../src/app/api/admin/sites/[siteId]/forms/[formId]/submissions/[submissionId]/delivery-attempts/[attemptId]/reconciliation/route.ts', mocks),
  };
  let checks = 0;
  for (const kind of ['comment', 'form'] as const) {
    const journal = mocks[kind === 'comment' ? '@/lib/demoCommentDeliveryJournal' : '@/lib/demoFormDeliveryJournal'][kind === 'comment' ? 'demoCommentDeliveryJournal' : 'demoFormDeliveryJournal'];
    const identity = kind === 'comment' ? { siteId: 'site-demo', commentId: comment.id, kind: 'comment-status' } : { siteId: 'site-demo', formId: form.id, submissionId: submission.id, kind: 'form-submission' };
    let row = await journal.admit({ ...identity, channel: 'webhook', target: 'https://provider.invalid/synthetic', requestId: 'original-request', actor: null, reason: null });
    const params = kind === 'comment' ? { siteId: 'site-demo', commentId: comment.id, attemptId: row.id } : { siteId: 'site-demo', formId: form.id, submissionId: submission.id, attemptId: row.id };
    const input = () => ({ expectedUpdatedAt: row.updatedAt, expectedState: row.state, expectedReviewVersion: row.reconciliationVersion, evidence: 'outcome-unavailable', disposition: 'retain-without-resend' });
    const call = async (body: any = input(), override: any = {}) => {
      const actual = { ...params, ...override };
      const path = kind === 'comment' ? `/api/sites/${actual.siteId}/comments/${actual.commentId}/delivery-attempts/${actual.attemptId}/reconciliation` : `/api/admin/sites/${actual.siteId}/forms/${actual.formId}/submissions/${actual.submissionId}/delivery-attempts/${actual.attemptId}/reconciliation`;
      const response = await routes[kind].POST(new NextRequest('https://fixture.invalid' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-request-id': 'owner-review' }, body: JSON.stringify(body) }), { params: Promise.resolve(actual) });
      const parsed = await response.json(); assert.equal(response.headers.get('cache-control'), 'private, no-store');
      if (response.status === 200) { const validate = validators[kind === 'comment' ? 'Comment' : 'AdminForm']; assert(validate(parsed), ajv.errorsText(validate.errors)); }
      assert(!JSON.stringify(parsed).includes('credential')); checks += 2; return { response, parsed };
    };
    for (const nonOwner of [{ type: 'api-key', session: null }, { type: 'session', session: { user: { id: 'fixture-admin', role: 'admin', status: 'active' } } }, { type: 'session', session: { user: { id: 'fixture-owner', role: 'owner', status: 'disabled' } } }]) { access = nonOwner; assert.equal((await call()).response.status, 403); checks++; }
    access = { type: 'session', session: { user: { id: 'fixture-owner', role: 'owner', status: 'active' } } };
    for (deny of [401, 403]) { assert.equal((await call()).response.status, deny); checks++; } deny = 0;
    for (const invalid of [null, [], { ...input(), actorId: 'forged' }, { ...input(), notes: 'private note' }, { ...input(), requestId: 'forged' }, { ...input(), expectedReviewVersion: -1 }, { ...input(), expectedReviewVersion: 0.5 }, { ...input(), expectedState: 'succeeded' }, { ...input(), disposition: 'resend' }, { ...input(), evidence: 'confirmed-success' }]) { assert.equal((await call(invalid)).response.status, 400); checks++; }
    assert(requestValidator(input())); assert.equal((await call(input(), { attemptId: 'missing' })).response.status, 404); checks += 2;
    assert.equal((await call(input(), kind === 'comment' ? { commentId: 'foreign-comment' } : { submissionId: 'foreign-submission' })).response.status, 404); checks++;
    assert.equal((await call(input(), { siteId: 'missing-site' })).response.status, 404); checks++;
    const snapshot = input(); auditFail = true;
    let result = await call(); assert.equal(result.response.status, 200); assert.equal(result.parsed.data.attempt.status, 'pending'); assert.equal(result.parsed.data.attempt.updatedAt, row.updatedAt); assert.equal(result.parsed.data.reconciliation.actorId, 'fixture-owner'); assert.equal(result.parsed.data.reconciliation.requestId, 'owner-review'); assert.equal(result.parsed.data.completionWarnings[0].code, 'DELIVERY_RECONCILIATION_AUDIT_PENDING'); checks += 6; auditFail = false;
    assert.equal((await call(snapshot)).response.status, 409); checks++;
    row = kind === 'comment' ? await journal.get('site-demo', comment.id, row.id) : await journal.get('site-demo', form.id, submission.id, row.id);
    assert.equal(row.reconciliationVersion, 1); assert.equal(row.state, 'pending'); assert.equal(row.retryAttemptId, undefined); checks += 3;
    result = await call(); assert.equal(result.response.status, 200); assert.equal(result.parsed.data.reconciliation.version, 2); assert.deepEqual(result.parsed.data.completionWarnings, []); checks += 3;
    const beforeSettle = { ...input(), expectedReviewVersion: 2 };
    row = await journal.settle('site-demo', row.id, { state: 'uncertain', providerEvidence: { provider: 'webhook', observedAt: new Date().toISOString(), statusCode: 202, providerMessageId: 'safe_id', secret: 'credential' } });
    assert.equal((await call(beforeSettle)).response.status, 409); checks++;
    result = await call(); assert.equal(result.response.status, 200); assert.equal(result.parsed.data.attempt.status, 'uncertain'); assert.equal(result.parsed.data.attempt.providerEvidence.providerMessageId, 'safe_id'); assert.equal(result.parsed.data.attempt.reconciliations.length, 3); checks += 4;
    const cold = loadMediaFixture('../src/lib/' + (kind === 'comment' ? 'demoCommentDeliveryJournal' : 'demoFormDeliveryJournal') + '.ts', mocks)[kind === 'comment' ? 'demoCommentDeliveryJournal' : 'demoFormDeliveryJournal'];
    const reopened = kind === 'comment' ? await cold.get('site-demo', comment.id, row.id) : await cold.get('site-demo', form.id, submission.id, row.id); assert.equal(reopened.reconciliationVersion, 3); assert.equal(reopened.state, 'uncertain'); checks += 2;
    const lock = join(scratch, 'data/backy/private-' + (kind === 'comment' ? 'comment' : 'form') + '-delivery/attempts.json.lock'); writeFileSync(lock, 'Owned fixture lock'); assert.equal((await call({ ...input(), expectedReviewVersion: 3 })).response.status, 503); unlinkSync(lock); checks++;
    for (const state of ['failed', 'succeeded']) { const terminal = await journal.admit({ ...identity, channel: 'webhook', target: 'https://provider.invalid/synthetic', requestId: 'terminal-' + state, actor: null, reason: null }); await journal.settle('site-demo', terminal.id, { state }); assert.equal((await call({ ...input(), expectedUpdatedAt: terminal.updatedAt, expectedState: 'pending', expectedReviewVersion: 0 }, { attemptId: terminal.id })).response.status, 409); checks++; }
  }
  assert(admissions.includes('comments.manage') && admissions.includes('forms.manage')); assert.equal(audits.length, 4); checks += 2;
  console.log(`Delivery reconciliation handler PASS ${checks}: actual route/helper/owner predicate/journal/cold reopen + OpenAPI AJV; synthetic central admission and audit failures. No provider request, configured DB or browser proof.`);
} finally { process.chdir(previous); if (savedEnv.mode === undefined) delete process.env.BACKY_DATA_MODE; else process.env.BACKY_DATA_MODE = savedEnv.mode; if (savedEnv.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = savedEnv.node; rmSync(scratch, { recursive: true, force: true }); }
