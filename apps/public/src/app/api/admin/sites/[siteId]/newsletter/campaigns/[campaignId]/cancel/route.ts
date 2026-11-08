import { requireAdminAccess } from '@/lib/adminAccess';
import { NextRequest, NextResponse } from 'next/server';
import { NewsletterCampaignError } from '@backy-cms/core';
import { newsletterCampaignScope, newsletterBody, newsletterVersion, newsletterRequestId, newsletterJson, newsletterError } from '@/lib/newsletterCampaignRoutes';
import { processNewsletterCampaign } from '@/lib/newsletterCampaignDelivery';
export const runtime = 'nodejs';
type Params = {params:Promise<{siteId:string;campaignId:string}>};

export async function POST(request:NextRequest,{params}:Params) {
 const requestId = newsletterRequestId();
 const access = await requireAdminAccess(request, requestId, { permission: 'forms.manage' });
 if (access instanceof NextResponse) return access;
 try {
  const {siteId,campaignId}=await params,admitted=await newsletterCampaignScope(siteId,access);
  const body=await newsletterBody(request);
  const campaign=await admitted.repository.cancel(admitted.siteId,campaignId,newsletterVersion(body.version));return newsletterJson(requestId,{schemaVersion:'backy.newsletter-campaign.v1',campaign,inFlightAttemptsMayComplete:true});
 }catch(error){return newsletterError(requestId,error);}
}
