import { NextRequest } from 'next/server';
import { NewsletterCampaignError } from '@backy-cms/core';
import { verifyNewsletterFeedback } from '@/lib/newsletterCampaignDelivery';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { newsletterBody, newsletterError, newsletterJson, newsletterRequestId } from '@/lib/newsletterCampaignRoutes';
export const runtime='nodejs';
type Params={params:Promise<{siteId:string}>};
/** Custom signed bridge only. No automatic SMTP feedback integration is asserted. */
export async function POST(request:NextRequest,{params}:Params) {
 const requestId=newsletterRequestId();try {
  if(Number(request.headers.get('content-length'))>4096)throw new NewsletterCampaignError('NEWSLETTER_FEEDBACK_INVALID',400,'Feedback exceeds 4 KB.');
  const raw=await request.text();if(Buffer.byteLength(raw)>4096||!verifyNewsletterFeedback(raw,request.headers))throw new NewsletterCampaignError('NEWSLETTER_FEEDBACK_UNAUTHORIZED',401,'Valid signed feedback is required.');
  const body=await newsletterBody(new NextRequest(request.url,{method:'POST',body:raw})),{siteId}=await params;
  if(body.siteId!==siteId||typeof body.deliveryId!=='string'||typeof body.eventId!=='string'||!['delivered','bounced','complained'].includes(String(body.state)))throw new NewsletterCampaignError('NEWSLETTER_FEEDBACK_INVALID',400,'Feedback needs matching siteId, deliveryId, eventId and a supported outcome.');
  if(shouldUseDemoStoreFallback())throw new NewsletterCampaignError('NEWSLETTER_JOURNAL_UNAVAILABLE',503,'Persisted campaign feedback is unavailable.');
  const repository=(await getRequiredDatabaseRepositories()).newsletterCampaigns;if(!repository)throw new NewsletterCampaignError('NEWSLETTER_JOURNAL_UNAVAILABLE',503,'Persisted campaign feedback is unavailable.');
  await repository.feedback(siteId,body.deliveryId,body.state as 'delivered'|'bounced'|'complained','bridge:'+body.eventId);
  return newsletterJson(requestId,{recorded:true});
 }catch(error){return newsletterError(requestId,error);}
}
