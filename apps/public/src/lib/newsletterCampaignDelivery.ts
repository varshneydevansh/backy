import { createHmac, timingSafeEqual } from 'node:crypto';
import { NewsletterCampaignError, type NewsletterCampaign, type NewsletterDelivery } from '@backy-cms/core';
import { getEmailDeliveryConfig, sendEmailMessage, type EmailDeliveryConfig } from './formEmailDelivery';
import { isPlainEmailSenderAddress } from './emailSenderPolicy';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from './repositoryRuntime';

type SitePolicy = { enabled?: unknown; providerApproved?: unknown; oneClickDkimVerified?: unknown; postalAddress?: unknown; publicBaseUrl?: unknown; maxRecipients?: unknown };
export type NewsletterCampaignReadiness = {
  configured: boolean; provider: 'smtp' | 'unavailable'; blockers: string[]; dailyLimit: number; maxRecipients: number;
  processing: 'authenticated-invoker-required'; automaticFeedback: 'signed-bridge-required';
  smtpAcceptanceIsDelivery: false; uncertainAutoRetry: false;
};
const error = (code: string, message: string): never => { throw new NewsletterCampaignError(code,503,message); };
export function newsletterCampaignConfig(siteId: string): { readiness: NewsletterCampaignReadiness; policy: SitePolicy | null; transport: EmailDeliveryConfig | null } {
  const blockers: string[] = [];
  let policy: SitePolicy | null = null, transport: EmailDeliveryConfig | null = null;
  try {
    const policies = JSON.parse(process.env.BACKY_NEWSLETTER_SITE_POLICY || '{}');
    if (!policies || typeof policies !== 'object' || Array.isArray(policies)) throw Error();
    const value = policies[siteId];
    if (value && typeof value === 'object' && !Array.isArray(value)) policy=value;
  } catch { blockers.push('NEWSLETTER_SITE_POLICY_INVALID'); }
  if (policy?.enabled !== true) blockers.push('NEWSLETTER_SITE_NOT_ENABLED');
  if (policy?.providerApproved !== true) blockers.push('NEWSLETTER_PROVIDER_APPROVAL_REQUIRED');
  if (policy?.oneClickDkimVerified !== true) blockers.push('NEWSLETTER_UNSUBSCRIBE_DKIM_VERIFICATION_REQUIRED');
  if (typeof policy?.postalAddress !== 'string' || !policy.postalAddress.trim() || policy.postalAddress.length > 500) blockers.push('NEWSLETTER_POSTAL_ADDRESS_REQUIRED');
  try { const url = new URL(String(policy?.publicBaseUrl)); if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error(); }
  catch { blockers.push('NEWSLETTER_HTTPS_PUBLIC_ORIGIN_REQUIRED'); }
  const dailyLimit = Number(process.env.BACKY_NEWSLETTER_DAILY_LIMIT || 0), maxRecipients = Number(policy?.maxRecipients || 0);
  if(!Number.isInteger(dailyLimit)||dailyLimit<1||dailyLimit>40)blockers.push('NEWSLETTER_DAILY_BUDGET_REQUIRED');
  if(!Number.isInteger(maxRecipients)||maxRecipients<1||maxRecipients>100)blockers.push('NEWSLETTER_RECIPIENT_LIMIT_REQUIRED');
  if((process.env.BACKY_NEWSLETTER_UNSUBSCRIBE_SECRET || '').length < 32)blockers.push('NEWSLETTER_UNSUBSCRIBE_SECRET_REQUIRED');
  try { transport=getEmailDeliveryConfig(siteId); const c=transport.smtp;
    if(transport.provider!=='smtp'||!c?.host||!c.user||!c.password||!Number.isInteger(c.port)||!((c.port===465&&c.secure)||(c.port===587&&!c.secure))||!isPlainEmailSenderAddress(c.user)||!isPlainEmailSenderAddress(transport.from)||transport.from.toLowerCase()!==c.user.toLowerCase())blockers.push('NEWSLETTER_AUTHORIZED_SMTP_REQUIRED');
  } catch { blockers.push('NEWSLETTER_AUTHORIZED_SMTP_REQUIRED'); }
  if(shouldUseDemoStoreFallback())blockers.push('NEWSLETTER_PERSISTED_RUNTIME_REQUIRED');
  return {readiness:{configured:blockers.length===0,provider:transport?.provider==='smtp'?'smtp':'unavailable',blockers,dailyLimit:Number.isInteger(dailyLimit)?dailyLimit:0,maxRecipients:Number.isInteger(maxRecipients)?maxRecipients:0,processing:'authenticated-invoker-required',automaticFeedback:'signed-bridge-required',smtpAcceptanceIsDelivery:false,uncertainAutoRetry:false},policy,transport};
}
export function requireNewsletterCampaignConfig(siteId: string) {
  const config=newsletterCampaignConfig(siteId);
  if(!config.readiness.configured)error('NEWSLETTER_DELIVERY_NOT_CONFIGURED','Campaign delivery is disabled or missing required site policy, SMTP, unsubscribe and budget configuration.');
  return config as typeof config & {policy: SitePolicy;transport: EmailDeliveryConfig};
}
const same = (a: string,b: string) => { const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y); };
export function newsletterUnsubscribeToken(siteId: string, deliveryId: string): string {
  const secret=process.env.BACKY_NEWSLETTER_UNSUBSCRIBE_SECRET || '';
  if(secret.length<32)error('NEWSLETTER_UNSUBSCRIBE_UNAVAILABLE','Newsletter unsubscribe signing is unavailable.');
  return deliveryId+'.'+createHmac('sha256',secret).update(siteId+':'+deliveryId).digest('base64url');
}
export function verifyNewsletterUnsubscribeToken(siteId: string, token: string): string | null {
  if(token.length>150)return null;
  const [id,signature,extra]=token.split('.');
  if(extra||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id||'')||!signature)return null;
  return [process.env.BACKY_NEWSLETTER_UNSUBSCRIBE_SECRET,process.env.BACKY_NEWSLETTER_UNSUBSCRIBE_PREVIOUS_SECRET].some(secret=>secret&&secret.length>=32&&same(signature,createHmac('sha256',secret).update(siteId+':'+id).digest('base64url'))) ? id : null;
}
export function newsletterCampaignMessage(campaign: NewsletterCampaign, delivery: NewsletterDelivery, config: ReturnType<typeof requireNewsletterCampaignConfig>) {
  const token=newsletterUnsubscribeToken(campaign.siteId,delivery.id),origin=String(config.policy.publicBaseUrl).replace(/\/$/,'');
  const unsubscribe=`${origin}/api/sites/${campaign.siteId}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
  return {from:config.transport.from,to:delivery.email,subject:campaign.subject,text:[campaign.text,'',String(config.policy.postalAddress).trim(),`Unsubscribe: ${unsubscribe}`].join('\n'),siteId:campaign.siteId,status:'newsletter',requestId:delivery.id,headers:{'List-Unsubscribe':`<${unsubscribe}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}};
}
/** One bounded attempt per invocation. No external requests happen before durable admission. */
export async function processNewsletterCampaign(siteId: string, campaignId: string) {
  const config=requireNewsletterCampaignConfig(siteId),repositories=await getRequiredDatabaseRepositories();
  if(!repositories.newsletterCampaigns)error('NEWSLETTER_JOURNAL_UNAVAILABLE','The durable campaign repository is unavailable.');
  if(!repositories.forms.withContactFollowup)error('NEWSLETTER_PRIVACY_FENCE_UNAVAILABLE','Campaign delivery requires the durable contact privacy fence.');
  const repository=repositories.newsletterCampaigns!,claim=await repository.claim(siteId,campaignId,config.readiness.dailyLimit);
  if(!claim)return {attempted:false};
  let state: 'accepted' | 'failed' | 'uncertain' = 'uncertain',errorCode:'VISITOR_PRIVACY_FENCED'|'NEWSLETTER_TRANSPORT_UNCERTAIN'|null=null;
  try {
    if(!claim.delivery.contactId)throw Object.assign(new Error('The source contact is unavailable.'),{code:'VISITOR_PRIVACY_FENCED'});
    const result=await repositories.forms.withContactFollowup!(siteId,claim.delivery.contactId,()=>sendEmailMessage(config.transport,newsletterCampaignMessage(claim.campaign,claim.delivery,config)));
    if(result.statusCode===250)state='accepted';
  } catch(failure) {
    if(failure&&typeof failure==='object'&&'code' in failure&&failure.code==='VISITOR_PRIVACY_FENCED'){state='failed';errorCode='VISITOR_PRIVACY_FENCED';}
    else errorCode='NEWSLETTER_TRANSPORT_UNCERTAIN'; // SMTP can fail after acceptance; never auto resend.
  }
  try { await repository.settle(siteId,claim.delivery.id,state,null,errorCode); }
  catch { return {attempted:true,deliveryId:claim.delivery.id,state,completionWarning:'NEWSLETTER_DURABLE_OUTCOME_PENDING'}; }
  return {attempted:true,deliveryId:claim.delivery.id,state};
}
/** Explicit generic bridge protocol; SMTP itself does not emit provider feedback. */
export function verifyNewsletterFeedback(body: string, headers: Headers, now=Date.now()): boolean {
  const secret=process.env.BACKY_NEWSLETTER_FEEDBACK_SECRET || '',timestamp=headers.get('x-backy-feedback-timestamp')||'',signature=headers.get('x-backy-feedback-signature')||'';
  if(secret.length<32||!/^\d{10}$/.test(timestamp)||Math.abs(now-Number(timestamp)*1000)>300000||!/^sha256=[a-f0-9]{64}$/.test(signature))return false;
  return same(signature,'sha256='+createHmac('sha256',secret).update(timestamp+'.'+body).digest('hex'));
}
