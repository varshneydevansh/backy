import { requireAdminAccess } from '@/lib/adminAccess';
import { NextRequest, NextResponse } from 'next/server';
import { NewsletterCampaignError } from '@backy-cms/core';
import { newsletterCampaignScope, newsletterRequestId, newsletterJson, newsletterError } from '@/lib/newsletterCampaignRoutes';
import { processNewsletterCampaign } from '@/lib/newsletterCampaignDelivery';
export const runtime = 'nodejs';
type Params = {params:Promise<{siteId:string;campaignId:string}>};

export async function POST(request:NextRequest,{params}:Params) {
 const requestId = newsletterRequestId();
 const access = await requireAdminAccess(request, requestId, { permissions: ['forms.manage', 'forms.export'] });
 if (access instanceof NextResponse) return access;
 try {
  const {siteId,campaignId}=await params,admitted=await newsletterCampaignScope(siteId,access);
  
  const outcome=await processNewsletterCampaign(admitted.siteId,campaignId);return newsletterJson(requestId,{schemaVersion:'backy.newsletter-processing.v1',...outcome});
 }catch(error){return newsletterError(requestId,error);}
}
