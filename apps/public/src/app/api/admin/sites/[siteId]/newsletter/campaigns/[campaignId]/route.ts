import { requireAdminAccess } from '@/lib/adminAccess';
import { NextRequest, NextResponse } from 'next/server';
import { NewsletterCampaignError, validateNewsletterCampaignDraft } from '@backy-cms/core';
import { newsletterCampaignScope, newsletterBody, newsletterVersion, newsletterRequestId, newsletterJson, newsletterError } from '@/lib/newsletterCampaignRoutes';
import { newsletterCampaignConfig } from '@/lib/newsletterCampaignDelivery';
export const runtime = 'nodejs';
type Params = {params:Promise<{siteId:string;campaignId:string}>};

export async function GET(request:NextRequest,{params}:Params) {
 const requestId = newsletterRequestId();
 const access = await requireAdminAccess(request, requestId, { permission: 'forms.view' });
 if (access instanceof NextResponse) return access;
 try {
  const {siteId,campaignId}=await params,admitted=await newsletterCampaignScope(siteId,access);
  const detail=await admitted.repository.detail(admitted.siteId,campaignId);if(!detail)throw new NewsletterCampaignError('NEWSLETTER_CAMPAIGN_NOT_FOUND',404,'Campaign not found.');
  return newsletterJson(requestId,{schemaVersion:'backy.newsletter-campaign.v1',...detail,readiness:newsletterCampaignConfig(admitted.siteId).readiness});
 }catch(error){return newsletterError(requestId,error);}
}
export async function PATCH(request:NextRequest,{params}:Params) {
 const requestId = newsletterRequestId();
 const access = await requireAdminAccess(request, requestId, { permission: 'forms.manage' });
 if (access instanceof NextResponse) return access;
 try {
  const {siteId,campaignId}=await params,admitted=await newsletterCampaignScope(siteId,access);
  const body=await newsletterBody(request),campaign=await admitted.repository.update(admitted.siteId,campaignId,validateNewsletterCampaignDraft(body),newsletterVersion(body.version));
  return newsletterJson(requestId,{schemaVersion:'backy.newsletter-campaign.v1',campaign});
 }catch(error){return newsletterError(requestId,error);}
}
