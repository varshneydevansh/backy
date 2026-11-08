import assert from 'node:assert/strict';
import { currentBuilderContractGaps } from './current-builder-contract.mjs';
const handoff = {
  designState: { motionAuthoring: {sequenceField:'element.animation.sequence', maxSteps:24, stateProperties:['x','y','scale','rotation','opacity']} },
  endpoints: {templateInstances:'/api/admin/sites/fixture/templates/{templateId}/instances', formDeliveryAttempts:'/api/admin/sites/fixture/forms/{formId}/delivery-attempts', collectionDesignVersions:'/api/admin/sites/fixture/collections/{collectionId}/design-versions', collectionDesignVersionRestore:'/api/admin/sites/fixture/collections/{collectionId}/design-versions/{revisionId}/restore'},
  templateInstanceUpgrades: {collectionReviewVersion:'template-collection-instances-v1:<sha256>',collectionRecovery:{version:'collection-v1:<sha256>',requiredCanonicalMigration:'027_collection_design_revisions.sql'}},
};
const spec = {paths:{'/instances':{post:{operationId:'reviewOrUpgradeAdminTemplateInstances'}},'/attempts':{get:{operationId:'listFormDeliveryAttempts'}},'/collection-history':{get:{operationId:'listAdminCollectionDesignVersions'}},'/collection-restore':{post:{operationId:'restoreAdminCollectionDesignVersion'}}},components:{schemas:{BackyElementAnimation:{properties:{sequence:{type:'object'}}}}}};
assert.deepEqual(currentBuilderContractGaps(handoff,spec),[]);
assert.equal(currentBuilderContractGaps({},{}).length,11);
const unsupported = structuredClone(handoff);
unsupported.designState.motionAuthoring.stateProperties.push('scaleX');
assert.deepEqual(currentBuilderContractGaps(unsupported,spec),['current bounded animation declaration']);
const incomplete = structuredClone(spec);
delete incomplete.paths['/attempts'];
assert.deepEqual(currentBuilderContractGaps(handoff,incomplete),['OpenAPI operation listFormDeliveryAttempts']);
const staleCollection = structuredClone(handoff);
delete staleCollection.templateInstanceUpgrades.collectionRecovery;
assert.deepEqual(currentBuilderContractGaps(staleCollection,spec),['collection upgrade and recovery declaration']);
const missingRecovery = structuredClone(spec);
delete missingRecovery.paths['/collection-restore'];
assert.deepEqual(currentBuilderContractGaps(handoff,missingRecovery),['OpenAPI operation restoreAdminCollectionDesignVersion']);
assert.equal(currentBuilderContractGaps(undefined,undefined).length,11);
console.log('Current builder deployment declaration checks PASS: current, stale, unsupported, missing operation and unavailable payload. No runtime certification.');
