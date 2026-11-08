import { sanitizeDeliveryProviderEvidence, commentDeliveryErrorDetails, BackyCommentDeliveryError, type BackyCommentDeliveryAttempt, type Comment } from '@backy-cms/core';
import { demoCommentDeliveryJournal } from '@/lib/demoCommentDeliveryJournal';
import { getAdminSettings, trackWebhookEvent } from '@/lib/backyStore';
import { recordRepositoryInteractionEvent } from '@/lib/commentRepositorySupport';
import { purgePublicCdnCache } from '@/lib/publicContractResponse';
import {
  buildCommentNotificationEmail,
  EmailDeliveryError,
  getEmailDeliveryConfig,
  sendEmailMessage,
} from '@/lib/formEmailDelivery';
import { getRequiredDatabaseRepositories } from '@/lib/repositoryRuntime';

type CommentRepositories = Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>;
export type CommentDeliveryKind = 'comment-submitted' | 'comment-reported' | 'comment-status';
type CommentDeliveryStatus = 'queued' | 'succeeded' | 'failed';
export type CommentDeliveryChannel = 'webhook' | 'email';

const readRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const readString = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const readBoolean = (value: unknown, fallback = false): boolean => (
  typeof value === 'boolean' ? value : fallback
);

const readNotificationSettings = async (repositories?: CommentRepositories | null): Promise<Record<string, unknown>> => {
  if (repositories) {
    const settings = await repositories.settings.get();
    return readRecord(readRecord(settings.integrations).notifications);
  }

  return readRecord(readRecord(getAdminSettings().integrations).notifications);
};

const resolveNotificationEmailRecipient = (email: Record<string, unknown>): string => (
  readString(email.recipient) ||
  readString(email.to) ||
  readString(email.adminEmail) ||
  readString(process.env.BACKY_COMMENT_NOTIFICATION_EMAIL) ||
  readString(process.env.BACKY_NOTIFICATION_EMAIL_TO) ||
  readString(process.env.BACKY_ADMIN_NOTIFICATION_EMAIL)
);

async function recordCommentDeliveryEvent(params: {
  repositories?: CommentRepositories | null;
  kind: CommentDeliveryKind;
  siteId: string;
  comment: Comment;
  target: string;
  status: CommentDeliveryStatus;
  requestId?: string | null;
  reason?: string | null;
  actor?: string | null;
  statusCode?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}) {
  const event = {
    kind: params.kind,
    siteId: params.siteId,
    commentId: params.comment.id,
    target: params.target,
    status: params.status,
    statusCode: params.statusCode,
    requestId: params.requestId || params.comment.requestId || undefined,
    reason: params.reason || params.comment.status,
    actor: params.actor || params.comment.reviewedBy || undefined,
    error: params.error,
    metadata: {
      targetType: params.comment.targetType,
      targetId: params.comment.targetId,
      status: params.comment.status,
      parentId: params.comment.parentId,
      commentThreadId: params.comment.commentThreadId || null,
      ...(params.metadata || {}),
    },
  };

  if (params.repositories) {
    await recordRepositoryInteractionEvent(params.repositories, event);
    return;
  }

  trackWebhookEvent(event);
}

type DeliveryParams = {
  repositories?: CommentRepositories | null; siteId: string; comment: Comment;
  kind: CommentDeliveryKind; target: string; requestId: string; reason?: string | null;
  actor?: string | null; metadata?: Record<string, unknown>;
};
/** The private journal is authoritative; audit projections are secondary evidence. */
async function deliver(params: DeliveryParams, channel: CommentDeliveryChannel,
  send: (attemptId: string) => Promise<{status: 'succeeded'|'failed'; statusCode?: number; provider?: string;providerMessageId?:unknown;outboxOnly?:unknown}>, providerHint?:string) {
  if (params.repositories && (params.repositories.comments.withPrivacyFollowup || params.comment.visitorMemberId)) {
    if (!params.repositories.comments.withPrivacyFollowup) throw new BackyCommentDeliveryError('VISITOR_PRIVACY_FENCE_UNAVAILABLE',503,'Persisted comment privacy fencing is unavailable. No provider request was made.');
    return params.repositories.comments.withPrivacyFollowup(params.siteId,params.comment.id,()=>deliverAdmitted(params,channel,send,providerHint));
  }
  return deliverAdmitted(params,channel,send,providerHint);
}
async function deliverAdmitted(params: DeliveryParams, channel: CommentDeliveryChannel,
  send: (attemptId: string) => Promise<{status: 'succeeded'|'failed'; statusCode?: number; provider?: string;providerMessageId?:unknown;outboxOnly?:unknown}>, providerHint?:string) {
  const journal = params.repositories ? params.repositories.commentDeliveries : demoCommentDeliveryJournal;
  if (!journal) throw new BackyCommentDeliveryError('DELIVERY_JOURNAL_UNAVAILABLE',503,'Durable delivery admission is unavailable. No provider request was made.');
  let attempt:BackyCommentDeliveryAttempt;
  try { attempt = await journal.admit({siteId:params.siteId,commentId:params.comment.id,kind:params.kind,channel,target:params.target,
    sourceEventId:typeof params.metadata?.retryOf==='string'?params.metadata.retryOf:null,
    requestId:params.requestId,reason:params.reason||params.comment.status,actor:params.actor||params.comment.reviewedBy||null}); } catch(error) {
    const known=commentDeliveryErrorDetails(error);if(known)throw new BackyCommentDeliveryError(known.code,known.status,known.message);
    throw new BackyCommentDeliveryError('DELIVERY_JOURNAL_UNAVAILABLE',503,'Durable delivery admission is unavailable. No provider request was made.');
  }
  const completionWarnings:string[]=[];
  const project = async (status:CommentDeliveryStatus, state:string, statusCode?:number) => {
    try { await recordCommentDeliveryEvent({...params,status,statusCode,metadata:{...(params.metadata||{}),channel,attemptId:attempt.id,deliveryState:state},
      error:state==='failed'?'Provider rejected the delivery.':state==='uncertain'?'Provider completion is unknown. Verify the provider before retrying.':undefined}); }
    catch { if(!completionWarnings.includes('COMMENT_DELIVERY_ACTIVITY_PENDING')) completionWarnings.push('COMMENT_DELIVERY_ACTIVITY_PENDING'); }
  };
  await project('queued','pending');
  let result:{status:'succeeded'|'failed'|'uncertain';statusCode?:number;provider?:string;providerMessageId?:unknown;outboxOnly?:unknown};
  // Only the provider call belongs in this try. A journal/audit fault never turns provider success into failure.
  try { result=await send(attempt.id); }
  catch { result={status:'uncertain',provider:providerHint}; }
  const providerEvidence=sanitizeDeliveryProviderEvidence({provider:result.provider||(channel==='webhook'?'webhook':providerHint),observedAt:new Date().toISOString(),statusCode:result.statusCode,providerMessageId:result.providerMessageId,outboxOnly:result.outboxOnly});
  let persisted:BackyCommentDeliveryAttempt=attempt;
  try { persisted=await journal.settle(params.siteId,attempt.id,{state:result.status,statusCode:result.statusCode,providerEvidence,errorCode:result.status==='uncertain'?'PROVIDER_COMPLETION_UNKNOWN':result.status==='failed'?'PROVIDER_REJECTED':null}); }
  catch { completionWarnings.push('COMMENT_DELIVERY_OUTCOME_PENDING'); }
  await project(result.status==='uncertain'?'queued':result.status,result.status,result.statusCode);
  const {providerMessageId:_providerMessageId,outboxOnly:_outboxOnly,...observed}=result;
  return {attempted:true as const,channel,target:params.target,...observed,providerEvidence,attemptId:attempt.id,durableState:persisted.state,
    ...(completionWarnings.length?{completionWarnings}:{}),
    ...(result.status==='uncertain'?{error:'Provider completion is unknown. Pending and uncertain attempts cannot be replayed.'}:result.status==='failed'?{error:'Provider rejected the delivery.'}:{})};
}
async function deliverCommentWebhook(params:DeliveryParams) {
  const isRetry=params.metadata?.retry===true;
  return deliver(params,'webhook',async attemptId=>{
    const response=await fetch(params.target,{method:'POST',signal:AbortSignal.timeout(15000),redirect:'error',headers:{'Content-Type':'application/json','x-backy-site-id':params.siteId,
      'x-backy-comment-id':params.comment.id,'x-backy-comment-event':params.kind,'x-backy-delivery-attempt-id':attemptId,
      ...(isRetry?{'x-backy-webhook-retry':'true'}:{})},body:JSON.stringify({...(isRetry?{retry:true}:{}),
        kind:params.kind,siteId:params.siteId,commentId:params.comment.id,targetType:params.comment.targetType,targetId:params.comment.targetId,
        parentId:params.comment.parentId,commentThreadId:params.comment.commentThreadId||null,status:params.comment.status,
        reason:params.reason||params.comment.status,actor:params.actor||params.comment.reviewedBy||null,requestId:params.requestId,
        authorName:params.comment.authorName,authorEmail:params.comment.authorEmail,content:params.comment.content,
        createdAt:params.comment.createdAt,updatedAt:params.comment.updatedAt})});
    return {status:response.ok?'succeeded':'failed',statusCode:response.status};
  });
}
async function deliverCommentEmail(params:DeliveryParams) {
  const config=getEmailDeliveryConfig(params.siteId),message=buildCommentNotificationEmail({config,siteId:params.siteId,comment:params.comment,
    eventType:params.kind,requestId:params.requestId,to:params.target,reason:params.reason||undefined,actor:params.actor||undefined});
  return deliver({...params,target:`mailto:${params.target}`},'email',async()=>{
    try { const result=await sendEmailMessage(config,message);return {status:'succeeded',statusCode:result.statusCode,provider:config.provider,providerMessageId:result.metadata?.providerMessageId,outboxOnly:result.metadata?.outboxOnly}; }
    catch(error){
      // Explicit provider rejection is retryable. Transport exceptions (including SMTP completion ambiguity) are not.
      if(error instanceof EmailDeliveryError && error.statusCode && error.statusCode>=400 && error.statusCode<=599)
        return {status:'failed',statusCode:error.statusCode,provider:config.provider};
      throw error;
    }
  },config.provider);
}

const normalizeRetryEmailTarget = (target: string): string => (
  target.startsWith('mailto:') ? target.slice('mailto:'.length).trim() : target.trim()
);

export async function retryCommentDelivery(params: {
  repositories?: CommentRepositories | null;
  siteId: string;
  comment: Comment;
  kind: CommentDeliveryKind;
  channel: CommentDeliveryChannel;
  target: string;
  requestId: string;
  retryOf: string;
  reason?: string | null;
  actor?: string | null;
}) {
  const metadata = {
    retry: true,
    retryOf: params.retryOf,
  };

  if (params.channel === 'webhook') {
    const target = readString(params.target);
    if (!target) {
      return { attempted: false as const, channel: params.channel, status: 'failed' as const, error: 'Webhook target is missing.' };
    }

    return deliverCommentWebhook({
      ...params,
      target,
      metadata,
    });
  }

  const target = normalizeRetryEmailTarget(params.target);
  if (!target) {
    return { attempted: false as const, channel: params.channel, status: 'failed' as const, error: 'Email target is missing.' };
  }

  return deliverCommentEmail({
    ...params,
    target,
    metadata,
  });
}

export type CommentNotificationOutcome = {
  attemptedChannels: number;
  failedChannels: number;
  completionWarnings: string[];
  channels: Array<{ channel: CommentDeliveryChannel; status: 'succeeded' | 'failed' | 'uncertain' }>;
};

export async function notifyCommentDelivery(params: {
  repositories?: CommentRepositories | null;
  siteId: string;
  comment: Comment;
  kind: CommentDeliveryKind;
  requestId?: string | null;
  reason?: string | null;
  actor?: string | null;
}) {
  const outcome: CommentNotificationOutcome = { attemptedChannels: 0, failedChannels: 0, completionWarnings: [], channels: [] };
  // Moderation changes public comment lists; never driven by visitor submissions.
  if (params.kind === 'comment-status') {
    await purgePublicCdnCache({ siteId: params.siteId, reason: params.reason || params.kind });
  }
  const notifications = await readNotificationSettings(params.repositories);
  const digestFrequency = readString(notifications.digestFrequency);
  if (digestFrequency === 'off') {
    return outcome;
  }

  const requestId = params.requestId || params.comment.requestId || `comment-${params.comment.id}`;
  const webhookUrl = readString(notifications.webhookUrl);
  const email = readRecord(notifications.email);
  const commentEmailEnabled = readBoolean(email.comments, true) || readBoolean(email.commentModeration, false);
  const recipient = resolveNotificationEmailRecipient(email);

  const attempt = async (channel: CommentDeliveryChannel, deliver: () => Promise<{ status: 'succeeded' | 'failed' | 'uncertain'; completionWarnings?: string[] }>) => {
    // A failed provider response or delivery-event write is a follow-up failure.
    // Attempt the other configured channel even when this one fails.
    let status: 'succeeded' | 'failed' | 'uncertain' = 'failed';
    try { const result=await deliver();status=result.status;for(const warning of result.completionWarnings||[])if(!outcome.completionWarnings.includes(warning))outcome.completionWarnings.push(warning); } catch { /* Summary deliberately excludes provider details. */ }
    outcome.attemptedChannels += 1;
    if (status !== 'succeeded') outcome.failedChannels += 1;
    outcome.channels.push({ channel, status });
  };
  if (webhookUrl) {
    await attempt('webhook', () => deliverCommentWebhook({ ...params, target: webhookUrl, requestId }));
  }
  if (commentEmailEnabled && recipient) {
    await attempt('email', () => deliverCommentEmail({ ...params, target: recipient, requestId }));
  }
  return outcome;
}
