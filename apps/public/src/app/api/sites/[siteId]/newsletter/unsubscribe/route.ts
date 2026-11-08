import { NextRequest, NextResponse } from 'next/server';
import { NewsletterCampaignError } from '@backy-cms/core';
import { verifyNewsletterUnsubscribeToken } from '@/lib/newsletterCampaignDelivery';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { newsletterError, newsletterRequestId } from '@/lib/newsletterCampaignRoutes';
export const runtime='nodejs';
type Params={params:Promise<{siteId:string}>};
const headers={'cache-control':'no-store','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",'content-type':'text/html; charset=utf-8','x-content-type-options':'nosniff'};
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const page=(text:string,form='')=>new NextResponse(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Newsletter preferences</title><body style="font-family:system-ui;max-width:40rem;margin:3rem auto;padding:1rem"><h1>Newsletter preferences</h1><p>${escape(text)}</p>${form}</body></html>`,{headers});
async function admission(siteId:string,token:string) {
 if(shouldUseDemoStoreFallback())throw new NewsletterCampaignError('NEWSLETTER_UNSUBSCRIBE_UNAVAILABLE',503,'Newsletter preferences are temporarily unavailable. Try again later.');
 const id=verifyNewsletterUnsubscribeToken(siteId,token);if(!id)throw new NewsletterCampaignError('NEWSLETTER_UNSUBSCRIBE_INVALID',400,'This unsubscribe link is invalid.');
 const repository=(await getRequiredDatabaseRepositories()).newsletterCampaigns;if(!repository)throw new NewsletterCampaignError('NEWSLETTER_UNSUBSCRIBE_UNAVAILABLE',503,'Newsletter preferences are temporarily unavailable. Try again later.');
 return {id,repository};
}
/** GET only confirms: link scanners must never mutate subscription state. */
export async function GET(request:NextRequest,{params}:Params) {
 const requestId=newsletterRequestId();try {const {siteId}=await params,token=new URL(request.url).searchParams.get('token')||'';await admission(siteId,token);
  return page('Stop receiving this site’s newsletter. This applies to all campaign messages sent to this address.',`<form method="post"><input type="hidden" name="token" value="${escape(token)}"><button style="padding:.8rem 1.2rem" type="submit">Unsubscribe</button></form>`);
 }catch(error){return newsletterError(requestId,error);}
}
/** Accepts both confirmation forms and RFC 8058 one-click POST from email clients. */
export async function POST(request:NextRequest,{params}:Params) {
 const requestId=newsletterRequestId();try {const {siteId}=await params,queryToken=new URL(request.url).searchParams.get('token')||'';
  if(Number(request.headers.get('content-length'))>2048)throw new NewsletterCampaignError('NEWSLETTER_UNSUBSCRIBE_INVALID',400,'Invalid unsubscribe request.');
  const raw=await request.text();if(Buffer.byteLength(raw)>2048)throw new NewsletterCampaignError('NEWSLETTER_UNSUBSCRIBE_INVALID',400,'Invalid unsubscribe request.');
  const token=queryToken||new URLSearchParams(raw).get('token')||'',{id,repository}=await admission(siteId,token);
  await repository.suppressByDelivery(siteId,id,'unsubscribed','unsubscribe:'+id);
  return page('You have unsubscribed from this site’s newsletter.');
 }catch(error){return newsletterError(requestId,error);}
}
