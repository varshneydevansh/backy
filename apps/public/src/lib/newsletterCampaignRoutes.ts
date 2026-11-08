import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { NewsletterCampaignError, type NewsletterCampaignRepository } from '@backy-cms/core';
import type { AdminAccessContext } from './adminAccess';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from './repositoryRuntime';
export const newsletterJson = (requestId: string, data: unknown, status=200) => NextResponse.json({success:true,requestId,data},{status,headers:{'cache-control':'no-store'}});
export const newsletterError = (requestId: string, error: unknown) => {
  const e=error instanceof NewsletterCampaignError?error:new NewsletterCampaignError('NEWSLETTER_OPERATION_UNAVAILABLE',503,'Campaign operation is unavailable. Reload or check persisted runtime configuration.');
  return NextResponse.json({success:false,requestId,error:{code:e.code,message:e.message}},{status:e.status,headers:{'cache-control':'no-store'}});
};
export const newsletterRequestId = () => 'req_'+randomUUID();
export async function newsletterCampaignScope(identifier: string, access: AdminAccessContext) {
  if(shouldUseDemoStoreFallback())throw new NewsletterCampaignError('NEWSLETTER_PERSISTED_RUNTIME_REQUIRED',503,'Campaigns require the persisted PostgreSQL runtime; demo subscriber capture remains available.');
  const repositories=await getRequiredDatabaseRepositories(),site=await repositories.sites.getById(identifier)||await repositories.sites.getBySlug(identifier);
  if(!site)throw new NewsletterCampaignError('SITE_NOT_FOUND',404,'Site not found.');
  if(!repositories.newsletterCampaigns)throw new NewsletterCampaignError('NEWSLETTER_JOURNAL_UNAVAILABLE',503,'Campaign repository is unavailable.');
  return {repository:repositories.newsletterCampaigns as NewsletterCampaignRepository,siteId:site.id,actorId:access.session?.user.id||null};
}
export async function newsletterBody(request: NextRequest) {
  if(Number(request.headers.get('content-length'))>40000)throw new NewsletterCampaignError('NEWSLETTER_BODY_TOO_LARGE',413,'Campaign input exceeds 40 KB.');
  const raw=await request.text();if(Buffer.byteLength(raw)>40000)throw new NewsletterCampaignError('NEWSLETTER_BODY_TOO_LARGE',413,'Campaign input exceeds 40 KB.');
  try {const body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw Error();return body as Record<string,unknown>;}
  catch{throw new NewsletterCampaignError('NEWSLETTER_BODY_INVALID',400,'A JSON object is required.');}
}
export function newsletterVersion(value: unknown) {
  if(!Number.isInteger(value)||Number(value)<1)throw new NewsletterCampaignError('NEWSLETTER_VERSION_REQUIRED',400,'Provide the current campaign version.');return Number(value);
}
