import { requireAdminAccess } from '@/lib/adminAccess';
import { NextRequest, NextResponse } from 'next/server';
import { NewsletterCampaignError } from '@backy-cms/core';
import { newsletterCampaignScope, newsletterBody, newsletterVersion, newsletterRequestId, newsletterJson, newsletterError } from '@/lib/newsletterCampaignRoutes';
import { requireNewsletterCampaignConfig } from '@/lib/newsletterCampaignDelivery';
export const runtime = 'nodejs';
type Params = {params:Promise<{siteId:string;campaignId:string}>};

export async function POST(request:NextRequest,{params}:Params) {
 const requestId = newsletterRequestId();
 const access = await requireAdminAccess(request, requestId, { permissions: ['forms.manage', 'forms.export'] });
 if (access instanceof NextResponse) return access;
 try {
  const {siteId,campaignId}=await params,admitted=await newsletterCampaignScope(siteId,access);
  const body=await newsletterBody(request);
  const config=requireNewsletterCampaignConfig(admitted.siteId);
const campaign=await admitted.repository.queue(admitted.siteId,campaignId,newsletterVersion(body.version),null,config.readiness.maxRecipients);
 return newsletterJson(requestId,{schemaVersion:'backy.newsletter-campaign.v1',campaign,processing:'authenticated-invoker-required'},202);
 }catch(error){return newsletterError(requestId,error);}
}
