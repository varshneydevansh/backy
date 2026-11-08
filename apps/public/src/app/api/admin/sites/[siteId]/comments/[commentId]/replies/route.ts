import {NextRequest,NextResponse} from 'next/server';
import {BackyCommentLifecycleError,type Comment} from '@backy-cms/core';
import {requireAdminAccess} from '@/lib/adminAccess';
import {createComment,getCommentById,getSiteByIdOrSlug,getAdminPageById,getAdminBlogPostById,trackWebhookEvent,validateAndClassifyComment} from '@/lib/backyStore';
import {getRequiredDatabaseRepositories,shouldUseDemoStoreFallback} from '@/lib/repositoryRuntime';
import {recordRepositoryInteractionEvent,resolveRepositorySite} from '@/lib/commentRepositorySupport';
import {notifyCommentDelivery} from '@/lib/commentDelivery';
import {recordAdminAudit} from '@/lib/adminAudit';
import {publicContractJson} from '@/lib/publicContractResponse';

type RouteParams={params:Promise<{siteId:string;commentId:string}>};
const text=(value:unknown)=>typeof value==='string'?value.trim():'';
const fields=new Set(['content','authorName','authorEmail','authorWebsite','targetType','targetId','commentThreadId','moderationMode','requestId']);
const error=(status:number,code:string,message:string,requestId:string,details?:Record<string,string>)=>publicContractJson({success:false,requestId,error:{code,message,...(details?{details}:{})}},{status,requestId,cache:'error'});

/** Moderator-only creation: unpublished discussions stay manageable and private. */
export async function POST(request:NextRequest,{params}:RouteParams){
 const requestId=request.headers.get('x-request-id')||`req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
 const access=await requireAdminAccess(request,requestId,{permission:'comments.manage'});
 if(access instanceof NextResponse)return access;
 try{
  const {siteId,commentId}=await params;
  const repositories=shouldUseDemoStoreFallback()?null:await getRequiredDatabaseRepositories();
  const site=repositories?await resolveRepositorySite(repositories,siteId):getSiteByIdOrSlug(siteId);
  if(!site)return error(404,'SITE_NOT_FOUND','Site not found',requestId);
  const parent:Comment|null=repositories?await repositories.comments.getById(site.id,commentId):getCommentById(commentId)||null;
  if(!parent||parent.siteId!==site.id)return error(404,'COMMENT_NOT_FOUND','Comment not found',requestId);
  if(parent.targetType!=='page'&&parent.targetType!=='post')return error(409,'COMMENT_PARENT_CONFLICT','The discussion target is invalid. Reload the thread.',requestId);
  const target=repositories
   ?await (parent.targetType==='page'?repositories.pages:repositories.posts).getById(site.id,parent.targetId)
   :parent.targetType==='page'?getAdminPageById(site.id,parent.targetId):getAdminBlogPostById(site.id,parent.targetId);
  if(!target||target.siteId!==site.id)return error(404,'COMMENT_TARGET_NOT_FOUND','The discussion target no longer exists',requestId);
  const raw=await request.text();
  if(Buffer.byteLength(raw)>65536)return error(413,'INVALID_PAYLOAD','Reply payload is too large',requestId);
  let body:Record<string,unknown>;try{body=JSON.parse(raw);}catch{return error(400,'INVALID_PAYLOAD','Invalid reply payload',requestId);}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!fields.has(key)))return error(400,'INVALID_PAYLOAD','Invalid reply payload',requestId);
  const content=text(body.content);
  if(!content||content.length>5000)return error(422,'INVALID_REPLY','Reply content must contain 1 to 5000 characters',requestId,{content:'Reply content must contain 1 to 5000 characters'});
  for(const [key,limit]of [['authorName',200],['authorEmail',320],['authorWebsite',2048],['requestId',200],['commentThreadId',200]] as const){if(body[key]!==undefined&&(typeof body[key]!=='string'||text(body[key]).length>limit))return error(400,'INVALID_PAYLOAD',`Invalid ${key}`,requestId);}
  const parentThread=parent.commentThreadId||parent.parentId||parent.id;
  if((body.targetType!==undefined&&body.targetType!==parent.targetType)||(body.targetId!==undefined&&body.targetId!==parent.targetId)||(body.commentThreadId!==undefined&&text(body.commentThreadId)!==parentThread))return error(409,'COMMENT_PARENT_CONFLICT','The reply parent, target or thread changed. Reload the thread.',requestId);
  if(body.moderationMode!==undefined&&body.moderationMode!=='manual'&&body.moderationMode!=='auto-approve')return error(400,'INVALID_PAYLOAD','Invalid moderationMode',requestId);
  const actorId=access.session?.user.id||null,authorName=text(body.authorName)||access.session?.user.fullName||'',authorEmail=text(body.authorEmail)||access.session?.user.email||'';
  const classification=validateAndClassifyComment({siteId:site.id,targetType:parent.targetType,targetId:parent.targetId,content,authorEmail,moderationMode:body.moderationMode==='manual'?'manual':'auto-approve',rateLimitBypass:true,checkBlockedIdentity:!repositories});
  if(!classification.ok)return error(422,'INVALID_REPLY','Reply rejected',requestId,{content:classification.spamMessage||'Reply rejected'});
  const input={siteId:site.id,targetType:parent.targetType,targetId:parent.targetId,parentId:parent.id,commentThreadId:parentThread,content,authorName,authorEmail,authorWebsite:text(body.authorWebsite),userId:actorId,requestId:text(body.requestId)||requestId,status:classification.status};
  // Repository creation revalidates persisted parent/identity under site admission.
  const comment=repositories?(await repositories.comments.create(input)).item:createComment({...input,skipActivity:true});
  const completionWarnings:string[]=[];
  const event={kind:'comment-submitted' as const,siteId:site.id,commentId:comment.id,target:`comment:${comment.id}`,status:'succeeded' as const,requestId:comment.requestId||requestId,reason:comment.status,actor:actorId||undefined,metadata:{targetType:comment.targetType,targetId:comment.targetId,parentId:comment.parentId,commentThreadId:comment.commentThreadId||null,moderatorReply:true}};
  try{if(repositories)await recordRepositoryInteractionEvent(repositories,event);else trackWebhookEvent(event);}catch{completionWarnings.push('COMMENT_ACTIVITY_PENDING');}
  try{await recordAdminAudit({repositories,siteId:site.id,actorId,entity:'comment',entityId:comment.id,action:'comment.reply.created',metadata:{parentId:parent.id,targetType:comment.targetType,targetId:comment.targetId,status:comment.status},requestId:comment.requestId||requestId});}catch{completionWarnings.push('COMMENT_AUDIT_PENDING');}
  try{const delivery=await notifyCommentDelivery({repositories,siteId:site.id,comment,kind:'comment-submitted',requestId:comment.requestId,reason:comment.status,actor:actorId});if(delivery.failedChannels>0)completionWarnings.push('COMMENT_DELIVERY_PENDING');}catch{completionWarnings.push('COMMENT_DELIVERY_PENDING');}
  const message=comment.status==='approved'?'Moderator reply saved. Public visibility follows target publication.':'Moderator reply saved for moderation.';
  return publicContractJson({success:true,requestId,data:{comment,completionWarnings,message},comment,completionWarnings,message},{status:201,requestId,cache:'private'});
 }catch(cause){
  const lifecycleCode=cause&&typeof cause==='object'&&'code'in cause?String(cause.code):'';
  if(cause instanceof BackyCommentLifecycleError||['COMMENT_PARENT_CONFLICT','COMMENT_IDENTITY_BLOCKED','COMMENT_SUBMISSION_UNAVAILABLE','COMMENT_INVENTORY_INCOMPLETE','COMMENT_MODERATION_UNAVAILABLE','COMMENT_MODERATION_CONFLICT','COMMENT_LIFECYCLE_UNAVAILABLE'].includes(lifecycleCode)){const status=lifecycleCode==='COMMENT_IDENTITY_BLOCKED'?422:lifecycleCode==='COMMENT_PARENT_CONFLICT'?409:503;return error(status,lifecycleCode,status===409?'The reply parent changed. Reload the thread.':status===422?'This identity cannot submit a reply.':'Atomic reply admission is unavailable.',requestId);}
  return error(500,'INTERNAL_SERVER_ERROR','Unable to create moderator reply',requestId);
 }
}
