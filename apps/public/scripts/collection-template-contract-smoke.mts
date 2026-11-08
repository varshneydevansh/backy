import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import * as imported from '../../../packages/core/src/custom-frontend-agent-handoff.ts';
import { assertCollectionDesignContract, collectionContractValidator, collectionDesignOperations } from './collection-template-contract-validation.mts';

const { buildCustomFrontendAgentHandoff } = (imported as any).default || imported;
const handoff = buildCustomFrontendAgentHandoff('site/a');
const schema = JSON.parse(readFileSync(new URL('../../../specs/ai-frontend-contract/frontend-manifest.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
ajv.addSchema(schema, 'frontend-manifest');
const validateHandoff = ajv.compile({ $ref: 'frontend-manifest#/$defs/customFrontendAgentHandoff' });
assert(validateHandoff(handoff), ajv.errorsText(validateHandoff.errors));
const validateOpenApiHandoff = collectionContractValidator('CustomFrontendAgentHandoff');
assert(validateOpenApiHandoff(handoff), ajv.errorsText(validateOpenApiHandoff.errors));
assert.deepEqual(handoff.templateInstanceUpgrades.unsupportedTemplateTypes, []);
assert(handoff.templateInstanceUpgrades.supportedTemplateTypes.includes('collection'));
assert(handoff.templateInstanceUpgrades.selectionTypes.includes('collection'));
assert.equal(handoff.endpoints.collectionDesignVersions, '/api/admin/sites/site/a/collections/{collectionId}/design-versions');
assert.equal(handoff.endpoints.collectionDesignVersionRestore, '/api/admin/sites/site/a/collections/{collectionId}/design-versions/{revisionId}/restore');
assert.equal(handoff.templateInstanceUpgrades.collectionRecovery.requiredCanonicalMigration, '027_collection_design_revisions.sql');
assert.equal(handoff.templateInstanceUpgrades.collectionReviewVersion, 'template-collection-instances-v1:<sha256>');
assert.deepEqual(handoff.templateInstanceUpgrades.collectionPermissions.review, ['collections.view']);
assert.deepEqual(handoff.templateInstanceUpgrades.collectionPermissions.apply, ['collections.view', 'collections.edit']);
assert.deepEqual(handoff.templateInstanceUpgrades.collectionPermissions.commerceCollections, { slugs: ['products','orders'], review: ['commerce.view'], apply: ['commerce.view','commerce.configure'] });
for (const [key, method, id, permissions] of [
 ['history', 'get', 'listAdminCollectionDesignVersions', ['collections.view']],
 ['restore', 'post', 'restoreAdminCollectionDesignVersion', ['collections.view', 'collections.edit']],
] as const) {
 const op = collectionDesignOperations[key][method];
 assert.equal(op.operationId, id); assert.deepEqual(Array.from(op['x-backy-permissions']), Array.from(permissions));
 const file = key === 'history' ? '../src/app/api/admin/sites/[siteId]/collections/[collectionId]/design-versions/route.ts' : '../src/app/api/admin/sites/[siteId]/collections/[collectionId]/design-versions/[revisionId]/restore/route.ts';
 assert.match(readFileSync(new URL(file, import.meta.url), 'utf8'), new RegExp('export async function ' + method.toUpperCase()));
 assert(op.responses['409']); assert(op.responses['503']);
 assert.deepEqual(Array.from(op['x-backy-conditional-permissions'].read), ['commerce.view']);
 if(key==='restore') assert.deepEqual(Array.from(op['x-backy-conditional-permissions'].mutation), ['commerce.configure']);
}
assert(collectionDesignOperations.restore.post.responses['422']);
assert.equal(collectionDesignOperations.history.get.parameters.find((p: any) => p.name === 'offset').schema.maximum, 1000000);
assert.equal(collectionDesignOperations.history.get.parameters.find((p: any) => p.name === 'limit').schema.maximum, 100);
const hash = 'a'.repeat(64), collectionVersion = 'collection-v1:' + hash, reviewVersion = 'template-collection-instances-v1:' + hash;
const request = { action: 'review', targetType: 'collection', targetRevisionId: 'template_revision_11111111-1111-4111-8111-111111111111', selection: [{ type: 'collection', id: 'collection' }] };
const validateRequest = collectionContractValidator('TemplateInstanceRequest');
assert(validateRequest(request)); assert(validateRequest({ ...request, action: 'apply', reviewVersion }));
for (const invalid of [
 { ...request, targetType: undefined },
 { ...request, selection: [{ type: 'page', id: 'page' }] },
 { ...request, selection: [{ type: 'collection', id: 'collection', recordId: 'entry' }] },
 { ...request, action: 'apply' },
 { ...request, action: 'apply', reviewVersion: 'template-instances-v1:' + hash },
 { ...request, targetType: 'unknown', selection: [{ type: 'unknown', id: 'unknown' }] },
]) assert.equal(validateRequest(invalid), false, 'Reject unsupported/mixed target or wrong apply namespace');
const validateOutcome = collectionContractValidator('TemplateInstanceEnvelope');
const outcome = { success: true, requestId: 'fixture', data: { action: 'review', siteId: 'site/a', templateId: 'template', targetRevisionId: 'revision', targetFingerprint: hash, reviewVersion, targets: [{ type: 'collection', id: 'collection', title: 'Collection', status: 'active', pinnedFingerprint: hash, contentFingerprint: hash, changedPaths: [], conflicts: [{ path: '/fields/title/type', code: 'SCHEMA_INCOMPATIBLE' }], state: 'blocked' }], canApply: false, scanned: { pages: 0, posts: 0, collections: 1 }, appliedTargets: [], failedTargets: [], completionWarnings: [], outcome: 'complete', concurrencyBoundary: 'demo-single-process' } };
assert(validateOutcome(outcome), ajv.errorsText(validateOutcome.errors));
const history = { success: true, requestId: 'fixture', data: { siteId: 'site/a', collectionId: 'collection', currentVersion: collectionVersion, pagination: { offset: 100, limit: 100, hasMore: true, nextOffset: 200 }, revisions: [{ id: 'revision', createdAt: '2026-10-08T00:00:00Z', operation: 'template-upgrade', templateId: 'template', targetRevisionId: null, hasPinnedBaseline: true }] } };
assertCollectionDesignContract(200, history);
const validateHistory = collectionContractValidator('CollectionDesignVersionsEnvelope');
const leaked = structuredClone(history); (leaked.data.revisions[0] as any).snapshot = { design: {} }; assert.equal(validateHistory(leaked), false, 'Historical snapshots must not appear in summary responses');
assertCollectionDesignContract('request', { expectedVersion: collectionVersion }, true);
const validateRestore = collectionContractValidator('CollectionDesignRestoreRequest');
assert.equal(validateRestore({ expectedVersion: 'record-v1:' + hash }), false);
assert.equal(validateRestore({ expectedVersion: collectionVersion, extra: true }), false);
const definition = {id:'collection',siteId:'site/a',name:'Entries',slug:'entries',status:'draft',fields:[],permissions:{publicRead:false,publicCreate:false},version:collectionVersion,metadata:{frontendTemplateInstance:{baselineContent:{current:true}}}};
assertCollectionDesignContract(200,{success:true,requestId:'fixture',data:{siteId:'site/a',collectionId:'collection',restoredFromRevisionId:'revision',collection:definition,completionWarnings:['COLLECTION_DESIGN_RESTORE_CACHE_PENDING']}},true);
const validatePatch = collectionContractValidator('AdminCollectionPatchRequest');
assert(validatePatch({expectedVersion:collectionVersion,name:'Edited'}));assert(validatePatch({name:'Legacy edit'}));
assert.equal(validatePatch({expectedVersion:'record-v1:'+hash}),false);
assert.equal(validatePatch({expectedVersion:42}),false);
console.log('Collection template contract PASS: compiled handoff + manifest schema, actual route declarations, generated OpenAPI collection boundary/namespaces/conflict code and private recovery pagination; source proof only.');
