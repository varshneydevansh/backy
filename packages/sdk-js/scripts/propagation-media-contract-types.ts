import type { BackyAdminReusableSectionInstancesRefreshInput, GeneratedBackyOpenApiAdminReusableSectionReviewedPreview, BackyAdminReusableSectionInstancesRefreshResponse, GeneratedBackyOpenApiAdminReusableSectionRefreshEnvelope, GeneratedBackyOpenApiAdminMediaStorageCleanup, GeneratedBackyOpenApiAdminMediaTransformsEnvelope, BackyAdminMediaTransformsResponse, BackyClient } from '../src/index';
type Assert<T extends true>=T;type Equal<A,B>=(<T>()=>T extends A?1:2) extends (<T>()=>T extends B?1:2)?true:false;
type PropagationResponseParity=Assert<Equal<BackyAdminReusableSectionInstancesRefreshResponse,GeneratedBackyOpenApiAdminReusableSectionRefreshEnvelope>>;
type CleanupParity=Assert<Equal<BackyAdminMediaTransformsResponse['data']['storageCleanup'],GeneratedBackyOpenApiAdminMediaTransformsEnvelope['data']['storageCleanup']>>;
const preview:GeneratedBackyOpenApiAdminReusableSectionReviewedPreview={schemaVersion:'backy.reusable-section-propagation-preview.v1',siteId:'site',sectionId:'section',sourceFingerprint:'a'.repeat(64),inventoryFingerprint:'b'.repeat(64),scope:{targetType:'all',targetId:null,includeProducts:false},targets:[]};
const dry:BackyAdminReusableSectionInstancesRefreshInput={dryRun:true};
const apply:BackyAdminReusableSectionInstancesRefreshInput={reviewedPreview:preview};
// @ts-expect-error Direct apply needs a reviewed manifest
const missing:BackyAdminReusableSectionInstancesRefreshInput={targetType:'page'};
// @ts-expect-error False dry run is apply and requires a reviewed manifest
const falseDry:BackyAdminReusableSectionInstancesRefreshInput={dryRun:false};
// @ts-expect-error Manifest schema version is literal
const badVersion:GeneratedBackyOpenApiAdminReusableSectionReviewedPreview={...preview,schemaVersion:'wrong'};
const cleanup:GeneratedBackyOpenApiAdminMediaStorageCleanup={status:'pending',deletedFiles:0,remainingFiles:1};
// @ts-expect-error Cleanup status is bounded
const badCleanup:GeneratedBackyOpenApiAdminMediaStorageCleanup={...cleanup,status:'unknown'};
declare const response:BackyAdminReusableSectionInstancesRefreshResponse;
const warning:string|undefined=response.data.completionWarnings[0];
const boundary:'database-serializable-transaction'|'demo-single-process'=response.data.concurrencyBoundary;
declare const client:BackyClient;client.refreshAdminReusableSectionInstances('section',dry);client.refreshAdminReusableSectionInstances('section',apply);
// @ts-expect-error Empty default apply no longer typechecks
client.refreshAdminReusableSectionInstances('section');
void [warning,boundary,badVersion,badCleanup,missing,falseDry];
