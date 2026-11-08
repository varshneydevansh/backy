import { requireAdminAccess } from '@/lib/adminAccess';
import { NextRequest, NextResponse } from 'next/server';
import { NewsletterCampaignError, validateNewsletterCampaignDraft } from '@backy-cms/core';
import { newsletterCampaignScope, newsletterBody, newsletterRequestId, newsletterJson, newsletterError } from '@/lib/newsletterCampaignRoutes';
import { newsletterCampaignConfig } from '@/lib/newsletterCampaignDelivery';
export const runtime = 'nodejs';
type Params = {params:Promise<{siteId:string}>};

export async function GET(request:NextRequest,{params}:Params) {
 const requestId = newsletterRequestId();
 const access = await requireAdminAccess(request, requestId, { permission: 'forms.view' });
 if (access instanceof NextResponse) return access;
 try {
  const {siteId}=await params, admitted=await newsletterCampaignScope(siteId,access);
  const query=new URL(request.url).searchParams,limit=Number(query.get('limit')||25),offset=Number(query.get('offset')||0);
  if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0)throw new NewsletterCampaignError('NEWSLETTER_PAGINATION_INVALID',400,'Use limit 1–100 and a non-negative offset.');
  const list=await admitted.repository.list(admitted.siteId,limit,offset);
  return newsletterJson(requestId,{schemaVersion:'backy.newsletter-campaigns.v1',campaigns:list.items,pagination:{total:list.total,limit,offset,hasMore:offset+list.items.length<list.total},readiness:newsletterCampaignConfig(admitted.siteId).readiness});
 }catch(error){return newsletterError(requestId,error);}
}
export async function POST(request:NextRequest,{params}:Params) {
 const requestId = newsletterRequestId();
 const access = await requireAdminAccess(request, requestId, { permission: 'forms.manage' });
 if (access instanceof NextResponse) return access;
 try {
  const {siteId}=await params,admitted=await newsletterCampaignScope(siteId,access);
  const body=await newsletterBody(request),key=request.headers.get('idempotency-key')||'';
  const campaign=await admitted.repository.create(admitted.siteId,validateNewsletterCampaignDraft(body),key,admitted.actorId);
  return newsletterJson(requestId,{schemaVersion:'backy.newsletter-campaign.v1',campaign},201);
 }catch(error){return newsletterError(requestId,error);}
}
