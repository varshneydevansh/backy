import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import * as imported from '../../../packages/core/src/custom-frontend-agent-handoff.ts';
import { assertFormDesignContract, formContractValidator, formDesignOperations } from './form-template-contract-validation.mts';

const { buildCustomFrontendAgentHandoff } = (imported as any).default || imported;
const handoff = buildCustomFrontendAgentHandoff('site/a');
const schema = JSON.parse(readFileSync(new URL('../../../specs/ai-frontend-contract/frontend-manifest.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
ajv.addSchema(schema, 'frontend-manifest');
const validateHandoff = ajv.compile({ $ref: 'frontend-manifest#/$defs/customFrontendAgentHandoff' });
assert(validateHandoff(handoff), ajv.errorsText(validateHandoff.errors));
const validateOpenApiHandoff = formContractValidator('CustomFrontendAgentHandoff');
assert(validateOpenApiHandoff(handoff), ajv.errorsText(validateOpenApiHandoff.errors));
assert.deepEqual(handoff.templateInstanceUpgrades.unsupportedTemplateTypes, []);
assert(handoff.templateInstanceUpgrades.supportedTemplateTypes.includes('form'));
assert(handoff.templateInstanceUpgrades.selectionTypes.includes('form'));
assert.equal(handoff.endpoints.formDesignVersions, '/api/admin/sites/site/a/forms/{formId}/design-versions');
assert.equal(handoff.endpoints.formDesignVersionRestore, '/api/admin/sites/site/a/forms/{formId}/design-versions/{revisionId}/restore');
assert.equal(handoff.templateInstanceUpgrades.formRecovery.requiredCanonicalMigration, '026_form_design_revisions.sql');
assert.equal(handoff.templateInstanceUpgrades.formReviewVersion, 'template-form-instances-v1:<sha256>');
assert.deepEqual(handoff.templateInstanceUpgrades.formPermissions, { review: ['forms.view'], apply: ['forms.view', 'forms.edit'] });
for (const [key, method, id, permissions] of [
 ['history', 'get', 'listAdminFormDesignVersions', ['forms.view']],
 ['restore', 'post', 'restoreAdminFormDesignVersion', ['forms.view', 'forms.edit']],
] as const) {
 const op = formDesignOperations[key][method];
 assert.equal(op.operationId, id); assert.deepEqual(Array.from(op['x-backy-permissions']), Array.from(permissions));
 const file = key === 'history' ? '../src/app/api/admin/sites/[siteId]/forms/[formId]/design-versions/route.ts' : '../src/app/api/admin/sites/[siteId]/forms/[formId]/design-versions/[revisionId]/restore/route.ts';
 assert.match(readFileSync(new URL(file, import.meta.url), 'utf8'), new RegExp('export async function ' + method.toUpperCase()));
 assert(op.responses['409']); assert(op.responses['503']);
}
assert(formDesignOperations.restore.post.responses['422']);
assert.equal(formDesignOperations.history.get.parameters.find((p: any) => p.name === 'offset').schema.maximum, 1000000);
assert.equal(formDesignOperations.history.get.parameters.find((p: any) => p.name === 'limit').schema.maximum, 100);
const hash = 'a'.repeat(64), formVersion = 'form-v1:' + hash, reviewVersion = 'template-form-instances-v1:' + hash;
const request = { action: 'review', targetType: 'form', targetRevisionId: 'template_revision_11111111-1111-4111-8111-111111111111', selection: [{ type: 'form', id: 'form' }] };
const validateRequest = formContractValidator('TemplateInstanceRequest');
assert(validateRequest(request)); assert(validateRequest({ ...request, action: 'apply', reviewVersion }));
for (const invalid of [
 { ...request, targetType: undefined },
 { ...request, selection: [{ type: 'page', id: 'page' }] },
 { ...request, selection: [{ type: 'form', id: 'form', collectionId: 'catalog' }] },
 { ...request, action: 'apply' },
 { ...request, action: 'apply', reviewVersion: 'template-instances-v1:' + hash },
 { ...request, targetType: 'unknown', selection: [{ type: 'unknown', id: 'unknown' }] },
]) assert.equal(validateRequest(invalid), false, 'Reject unsupported/mixed target or wrong apply namespace');
const validateOutcome = formContractValidator('TemplateInstanceEnvelope');
const outcome = { success: true, requestId: 'fixture', data: { action: 'review', siteId: 'site/a', templateId: 'template', targetRevisionId: 'revision', targetFingerprint: hash, reviewVersion, targets: [{ type: 'form', id: 'form', title: 'Form', status: 'active', pinnedFingerprint: hash, contentFingerprint: hash, changedPaths: [], conflicts: [{ path: '/fields/email/type', code: 'SCHEMA_INCOMPATIBLE' }], state: 'blocked' }], canApply: false, scanned: { pages: 0, posts: 0, forms: 1 }, appliedTargets: [], failedTargets: [], completionWarnings: [], outcome: 'complete', concurrencyBoundary: 'demo-single-process' } };
assert(validateOutcome(outcome), ajv.errorsText(validateOutcome.errors));
const history = { success: true, requestId: 'fixture', data: { siteId: 'site/a', formId: 'form', currentVersion: formVersion, pagination: { offset: 100, limit: 100, hasMore: true, nextOffset: 200 }, revisions: [{ id: 'revision', createdAt: '2026-10-08T00:00:00Z', operation: 'template-upgrade', templateId: 'template', targetRevisionId: null, hasPinnedBaseline: true }] } };
assertFormDesignContract(200, history);
const validateHistory = formContractValidator('FormDesignVersionsEnvelope');
const leaked = structuredClone(history); (leaked.data.revisions[0] as any).snapshot = { design: {} }; assert.equal(validateHistory(leaked), false, 'Historical snapshots must not appear in summary responses');
assertFormDesignContract('request', { expectedVersion: formVersion }, true);
const validateRestore = formContractValidator('FormDesignRestoreRequest');
assert.equal(validateRestore({ expectedVersion: 'record-v1:' + hash }), false);
assert.equal(validateRestore({ expectedVersion: formVersion, extra: true }), false);
console.log('Form template contract PASS: compiled handoff + manifest schema, actual route declarations, generated OpenAPI form boundary/namespaces/conflict code and private recovery pagination; source proof only.');
