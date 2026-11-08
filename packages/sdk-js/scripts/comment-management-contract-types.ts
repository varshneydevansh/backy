import type { BackyClient, BackyCommentBlocklistDeleteResponse, GeneratedBackyOpenApiCommentBlocklistDeleteEnvelope, BackyCommentSubmissionResponse, BackyCommentMutationResponse, BackyCommentReportResponse, BackyCommentBulkUpdateResponse, GeneratedBackyOpenApiCommentSubmissionEnvelope, GeneratedBackyOpenApiCommentMutationEnvelope, GeneratedBackyOpenApiCommentReportEnvelope, GeneratedBackyOpenApiCommentBulkUpdateEnvelope, GeneratedBackyOpenApiCommentModerationRequest } from '../src/index';
type Equal<A,B>=(<T>()=>T extends A?1:2)extends(<T>()=>T extends B?1:2)?true:false;type Assert<T extends true>=T;
export type SubmissionParity=Assert<Equal<BackyCommentSubmissionResponse,GeneratedBackyOpenApiCommentSubmissionEnvelope>>;
export type MutationParity=Assert<Equal<BackyCommentMutationResponse,GeneratedBackyOpenApiCommentMutationEnvelope>>;
export type ReportParity=Assert<Equal<BackyCommentReportResponse,GeneratedBackyOpenApiCommentReportEnvelope>>;
export type BulkParity=Assert<Equal<BackyCommentBulkUpdateResponse,GeneratedBackyOpenApiCommentBulkUpdateEnvelope>>;
export type MethodParity=Assert<Equal<Awaited<ReturnType<BackyClient['submitPageComment']>>,BackyCommentSubmissionResponse>>;
declare const response:BackyCommentSubmissionResponse;const warnings:string[]=response.data.completionWarnings;const message:string=response.data.message;
const parentOnly:GeneratedBackyOpenApiCommentModerationRequest={parentId:null};const threadOnly:GeneratedBackyOpenApiCommentModerationRequest={commentThreadId:'thread'};
// @ts-expect-error Current submission responses must retain canonical warning array.
const incomplete:BackyCommentSubmissionResponse={success:true,requestId:'fixture',data:{comment:response.data.comment,message:'saved'}};
void[warnings,message,parentOnly,threadOnly,incomplete];

export type BlocklistParity=Assert<Equal<BackyCommentBlocklistDeleteResponse,GeneratedBackyOpenApiCommentBlocklistDeleteEnvelope>>;
import type { BackyModeratorCommentReplyInput, GeneratedBackyOpenApiModeratorCommentReplyRequest } from '../src/index';
export type ModeratorInputParity=Assert<Equal<BackyModeratorCommentReplyInput,GeneratedBackyOpenApiModeratorCommentReplyRequest>>;
export type ModeratorResponseParity=Assert<Equal<Awaited<ReturnType<BackyClient['createAdminCommentReply']>>,BackyCommentSubmissionResponse>>;
const queuedReply:BackyModeratorCommentReplyInput={content:'Archived discussion reply',moderationMode:'manual',commentThreadId:'legacy-root'};
// @ts-expect-error Moderator input cannot forge attribution or bypass flags.
const forgedReply:BackyModeratorCommentReplyInput={content:'Forged',userId:'owner'};
// @ts-expect-error The persisted parent comes from the private route path.
const forgedParent:BackyModeratorCommentReplyInput={content:'Forged',parentId:'foreign-parent'};
void[queuedReply,forgedReply,forgedParent];
declare const removal:BackyCommentBlocklistDeleteResponse;const deletionWarnings:string[]=removal.data.completionWarnings;const boundary:'database-site-row-lock'|'demo-single-process'=removal.data.concurrencyBoundary;void[deletionWarnings,boundary];
