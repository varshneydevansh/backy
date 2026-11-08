import type {BackyAdminFormSubmissionResponse,BackyAdminFormSubmissionsResponse,BackyAdminFormContactSyncResponse,BackyAdminFormSubmissionReviewInput,BackyAdminFormContactUserPromotionInput,BackyAdminOriginalFormSubmission,GeneratedBackyOpenApiAdminFormSubmissionEnvelope,GeneratedBackyOpenApiAdminFormSubmissionsEnvelope,GeneratedBackyOpenApiAdminFormContactSyncEnvelope} from '../src/index';
import {BackyClient,BackyFormContactSyncDeliveryError} from '../src/index';
type Equal<A,B>=(<T>()=>T extends A?1:2)extends(<T>()=>T extends B?1:2)?true:false;type Assert<T extends true>=T;
export type SubmissionParity=Assert<Equal<BackyAdminFormSubmissionResponse,GeneratedBackyOpenApiAdminFormSubmissionEnvelope>>;
export type ListParity=Assert<Equal<BackyAdminFormSubmissionsResponse,GeneratedBackyOpenApiAdminFormSubmissionsEnvelope>>;
export type SyncParity=Assert<Equal<BackyAdminFormContactSyncResponse,GeneratedBackyOpenApiAdminFormContactSyncEnvelope>>;
const original:BackyAdminOriginalFormSubmission={id:'submission',siteId:'site',formId:'form',values:{privacy:true,unknown:{retain:[false,0]}},status:'pending',submittedAt:'2026-01-01T00:00:00Z',reviewedBy:null,ipHash:null};
const review:BackyAdminFormSubmissionReviewInput={status:'approved',contactShareOverride:{enabled:true,emailField:'email'}};
// @ts-expect-error Actual review does not accept arbitrary classifications.
const invalidReview:BackyAdminFormSubmissionReviewInput={status:'arbitrary'};
// @ts-expect-error This endpoint cannot assign an owner operator role.
const ownerPromotion:BackyAdminFormContactUserPromotionInput={role:'owner'};
declare const client:BackyClient;const update=client.updateFormSubmission('form','submission',review);const list=client.formSubmissions('form');
async function typed(){const rows=(await list).data.submissions.data;const values:Record<string,unknown>=rows[0].values;const status:'pending'|'approved'|'rejected'|'spam'=(await update).data.submission.status;return{values,status};}
function failed(error:unknown){if(error instanceof BackyFormContactSyncDeliveryError){const ids:string[]=error.response.data.delivery.contactIds;const status:502=error.status;return{ids,status};}}
void[original,review,invalidReview,ownerPromotion,typed,failed];
