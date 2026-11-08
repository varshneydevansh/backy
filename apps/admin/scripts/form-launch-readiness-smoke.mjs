import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL('../src/routes/forms.tsx', import.meta.url), 'utf8');
const names = new Set(['normalizeFormContactShare', 'normalizeContactShareFieldReference', 'formFieldKeySet', 'normalizeFieldKey', 'formRequiresContactIdentity', 'formHasRequiredIdentity', 'formHasSpamGuard', 'formHasDestination', 'getFormLaunchReadinessScore', 'summarizeFormLaunchStatus', 'buildFormLaunchActionPlan', 'buildFormLaunchReadinessHandoff', 'getFormSource']);
const ast = ts.createSourceFile('forms.tsx', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
const declarations = ast.statements.filter(node => ts.isFunctionDeclaration(node) ? names.has(node.name?.text || '') : ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name) && names.has(declaration.name.text)));
assert.equal(declarations.length, names.size, 'Test must execute every actual route readiness helper');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(declarations.map(node => node.getText(ast)).join('\n') + '\nmodule.exports={formHasRequiredIdentity,getFormLaunchReadinessScore,buildFormLaunchReadinessHandoff};', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  module, exports: module.exports, Date, FORM_PERSISTENCE_OPERATOR_GATE: 'database proof required',
  buildFormSubmissionExample: require('@backy-cms/core').buildFormSubmissionExample,
});
const helpers = module.exports;
const inbox = { id: 'form-file', siteId: 'site-a', name: 'Private documents', title: 'Private documents', isActive: true, audience: 'public', fields: [{ key: 'documents', type: 'file', label: 'Documents', required: true }], enableHoneypot: true, moderationMode: 'manual', contactShare: { enabled: false } };
const build = (form, deliveryMetrics = { total: 0 }) => helpers.buildFormLaunchReadinessHandoff({ activeSiteId: 'site-a', form, readiness: { score: helpers.getFormLaunchReadinessScore(form), checks: [] }, persistenceCertification: { schemaVersion: 'test', status: 'unverified', runtime: { readyForCertification: false, missing: ['database URL'] } }, definitionUrl: 'https://example.com/definition', submitUrl: 'https://example.com/submit', contactsUrl: 'https://example.com/contacts', analytics: null, deliveryMetrics, consentMetrics: {}, samplePayload: { values: {} } });
let passed = 0;
function check(name, action) { try { action(); passed++; } catch (error) { throw new Error(`${name}: ${error}`); } }
check('inbox-only file form has no invented lead identity blocker', () => {
  const result = build(inbox);
  assert.equal(result.checks.find(check => check.key === 'identity-routing').status, 'ready');
  assert.equal(result.actionPlan.blockers.length, 0); assert.notEqual(result.actionPlan.nextAction, 'add-identity-field');
  assert.equal(helpers.getFormLaunchReadinessScore(inbox), 83);
  assert.equal(result.submissionTransport.contentType, 'multipart/form-data');
});
check('collection-only arbitrary fields do not require email or phone', () => {
  const form = { ...inbox, collectionTarget: { enabled: true, collectionId: 'documents', fieldMap: { documents: 'documents' } } };
  assert.equal(helpers.getFormLaunchReadinessScore(form), 100); assert.equal(build(form).actionPlan.blockers.length, 0);
});
check('restricted audience does not invent submitted email requirement', () => {
  for (const audience of ['authenticated', 'adminOnly']) assert.equal(build({ ...inbox, audience }).checks.find(check => check.key === 'identity-routing').status, 'ready');
});
check('enabled contact routing with no identity stays blocked', () => {
  const result = build({ ...inbox, contactShare: { enabled: true } });
  assert.equal(result.checks.find(check => check.key === 'identity-routing').status, 'blocked'); assert.equal(result.actionPlan.nextAction, 'add-identity-field');
});
check('unmapped email cannot silently satisfy contact routing', () => {
  const result = build({ ...inbox, fields: [...inbox.fields, { key: 'email', type: 'email' }], contactShare: { enabled: true } });
  assert.equal(result.checks.find(check => check.key === 'identity-routing').status, 'blocked');
});
check('canonical mapping normalization preserves usable aliases', () => {
  const form = { ...inbox, fields: [...inbox.fields, { key: 'reply_to', type: 'email' }], contactShare: { enabled: true, emailField: 'Reply To' } };
  assert.equal(helpers.formHasRequiredIdentity(form), true);
});
check('deleted mapped fields and binary fields cannot satisfy contact identity', () => {
  for (const emailField of ['deleted', 'documents']) assert.equal(helpers.formHasRequiredIdentity({ ...inbox, contactShare: { enabled: true, emailField } }), false);
});
check('current custom-key email or phone mapping satisfies contact routing', () => {
  for (const mapping of ['emailField', 'phoneField']) {
    const form = { ...inbox, fields: [...inbox.fields, { key: 'reply_to', type: 'text' }], contactShare: { enabled: true, [mapping]: 'reply_to' } };
    assert.equal(helpers.formHasRequiredIdentity(form), true); assert.equal(build(form).actionPlan.blockers.length, 0);
  }
});
check('existing inactive and empty schema blockers remain', () => {
  assert.equal(build({ ...inbox, isActive: false }).actionPlan.nextAction, 'activate-form');
  assert.equal(build({ ...inbox, fields: [] }).actionPlan.nextAction, 'add-fields');
});
check('provider and database proof remain explicit attention', () => {
  const checks = build(inbox).checks;
  assert.equal(checks.find(check => check.key === 'delivery-handoff').status, 'attention');
  assert.equal(checks.find(check => check.key === 'persistence-certification').status, 'attention');
  assert.match(checks.find(check => check.key === 'persistence-certification').detail, /database URL/);
  assert.equal(build({ ...inbox, enableHoneypot: false }).checks.find(check => check.key === 'spam-moderation').status, 'attention');
});
check('selected UI uses contextual identity readiness and truthful copy', () => {
  assert.match(source, /const requiresIdentity = formRequiresContactIdentity\(selectedForm\)/);
  assert.match(source, /ready: hasRequiredIdentity/);
  assert.match(source, /Inbox and collection submissions do not require contact identity\./);
  assert.doesNotMatch(source, /Email or phone data is available for contact, account/);
});
check('durable pending and uncertain outcomes do not certify delivery readiness', () => {
  for (const state of ['pending', 'uncertain', 'queued']) {
    const result = build({ ...inbox, notificationWebhook: 'https://provider.invalid/notify' }, { total: 1, [state]: 1 });
    const delivery = result.checks.find(check => check.key === 'delivery-handoff');
    assert.equal(delivery.status, 'attention'); assert.match(delivery.detail, /unverified provider completion/); assert.match(delivery.detail, /do not replay/);
  }
  assert.equal(build({ ...inbox, notificationWebhook: 'https://provider.invalid/notify' }, { total: 1, failed: 1 }).checks.find(check => check.key === 'delivery-handoff').status, 'attention');
  assert.equal(build({ ...inbox, notificationWebhook: 'https://provider.invalid/notify' }, { total: 1, succeeded: 1 }).checks.find(check => check.key === 'delivery-handoff').status, 'ready');
});
console.log(`Forms launch readiness checks passed: ${passed} (actual route helpers).`);
