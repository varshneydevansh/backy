import { requireAdminAccess } from '@/lib/adminAccess';
import { NextRequest, NextResponse } from 'next/server';
import { NewsletterCampaignError } from '@backy-cms/core';
import { newsletterCampaignScope, newsletterBody, newsletterRequestId, newsletterJson, newsletterError } from '@/lib/newsletterCampaignRoutes';
import { processNewsletterCampaign } from '@/lib/newsletterCampaignDelivery';
export const runtime = 'nodejs';
type Params = {params:Promise<{siteId:string;campaignId:string}>};

export async function POST(request:NextRequest,{params}:Params) {
 const requestId = newsletterRequestId();
 const access = await requireAdminAccess(request, requestId, { permission: 'forms.manage' });
 if (access instanceof NextResponse) return access;
 try {
  const {siteId,campaignId}=await params,admitted=await newsletterCampaignScope(siteId,access);
  const body=await newsletterBody(request),detail=await admitted.repository.detail(admitted.siteId,campaignId);
  if(!detail||typeof body.deliveryId!=='string'||!detail.deliveries.some(d=>d.id===body.deliveryId))throw new NewsletterCampaignError('NEWSLETTER_DELIVERY_NOT_FOUND',404,'Delivery not found in this campaign.');
  if(!['delivered','bounced','complained'].includes(String(body.state))||typeof body.evidence!=='string'||body.evidence.trim().length<10||body.evidence.length>500)throw new NewsletterCampaignError('NEWSLETTER_FEEDBACK_INVALID',400,'Select an outcome and provide 10–500 characters of provider or mailbox evidence.');
  await admitted.repository.feedback(admitted.siteId,body.deliveryId,body.state as 'delivered'|'bounced'|'complained','operator:'+requestId,body.evidence.trim(),admitted.actorId);
  return newsletterJson(requestId,{schemaVersion:'backy.newsletter-campaign.v1',...(await admitted.repository.detail(admitted.siteId,campaignId)),feedbackSource:'operator-evidence'});
 }catch(error){return newsletterError(requestId,error);}
}
