import { timingSafeEqual } from 'node:crypto';
import { NextRequest } from 'next/server';
import { NewsletterCampaignError } from '@backy-cms/core';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { newsletterJson, newsletterError, newsletterRequestId } from '@/lib/newsletterCampaignRoutes';
import { processNewsletterCampaign } from '@/lib/newsletterCampaignDelivery';
export const runtime='nodejs';
/** Requires an external authenticated scheduler. At most one SMTP attempt per invocation. */
export async function POST(request:NextRequest) {
 const requestId=newsletterRequestId();try {
  const key=process.env.BACKY_NEWSLETTER_WORKER_SECRET||'',provided=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
  if(key.length<32||Buffer.byteLength(key)!==Buffer.byteLength(provided)||!timingSafeEqual(Buffer.from(key),Buffer.from(provided)))throw new NewsletterCampaignError('NEWSLETTER_WORKER_UNAUTHORIZED',401,'Valid campaign worker credentials are required.');
  if(shouldUseDemoStoreFallback())throw new NewsletterCampaignError('NEWSLETTER_JOURNAL_UNAVAILABLE',503,'Campaign worker requires persisted runtime.');
  const repository=(await getRequiredDatabaseRepositories()).newsletterCampaigns;if(!repository)throw new NewsletterCampaignError('NEWSLETTER_JOURNAL_UNAVAILABLE',503,'Campaign worker repository is unavailable.');
  const due=await repository.due(10),outcomes=[];
  for(const campaign of due) {
   try {const outcome=await processNewsletterCampaign(campaign.siteId,campaign.id);outcomes.push({campaignId:campaign.id,...outcome});if(outcome.attempted)break;}
   catch(error){outcomes.push({campaignId:campaign.id,blocked:true,code:error instanceof NewsletterCampaignError?error.code:'NEWSLETTER_OPERATION_UNAVAILABLE'});}
  }
  return newsletterJson(requestId,{schemaVersion:'backy.newsletter-processing.v1',outcomes,processing:'authenticated-invoker-required'});
 }catch(error){return newsletterError(requestId,error);}
}
