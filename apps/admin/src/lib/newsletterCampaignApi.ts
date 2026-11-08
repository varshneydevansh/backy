import type { NewsletterCampaign, NewsletterCampaignDetail, NewsletterCampaignDraft } from '@backy-cms/core';
import { adminFetch, getAdminApiBase } from './adminContentApi';
export interface NewsletterCampaignReadiness {
  configured:boolean;provider:string;blockers:string[];dailyLimit:number;maxRecipients:number;
  processing:'authenticated-invoker-required';automaticFeedback:'signed-bridge-required';
}
export interface NewsletterCampaignList {
  campaigns:NewsletterCampaign[];
  pagination:{total:number;limit:number;offset:number;hasMore:boolean};
  readiness:NewsletterCampaignReadiness;
}
export class NewsletterCampaignRequestError extends Error { constructor(public status:number,message:string){super(message);this.name='NewsletterCampaignRequestError';} }
async function request<T>(siteId:string,path:string,method='GET',body?:unknown,key?:string):Promise<T> {
 const response=await adminFetch(`${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/newsletter/campaigns${path}`,{method,headers:{...(body?{'content-type':'application/json'}:{}),...(key?{'idempotency-key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const result=await response.json();if(!response.ok||!result.success)throw new NewsletterCampaignRequestError(response.status,result.error?.message||'Campaign request failed.');return result.data;
}
export const listNewsletterCampaigns=(siteId:string,offset=0)=>request<NewsletterCampaignList>(siteId,`?limit=25&offset=${offset}`);
export const getNewsletterCampaign=(siteId:string,id:string)=>request<NewsletterCampaignDetail & {readiness:NewsletterCampaignReadiness}>(siteId,`/${encodeURIComponent(id)}`);
export const createNewsletterCampaign=(siteId:string,draft:NewsletterCampaignDraft,key:string)=>request<{campaign:NewsletterCampaign}>(siteId,'','POST',draft,key);
export const updateNewsletterCampaign=(siteId:string,id:string,draft:NewsletterCampaignDraft,version:number)=>request<{campaign:NewsletterCampaign}>(siteId,`/${encodeURIComponent(id)}`,'PATCH',{...draft,version});
export const actOnNewsletterCampaign=(siteId:string,id:string,action:'send'|'schedule'|'cancel'|'process',version:number,scheduledAt?:string)=>request<{campaign?:NewsletterCampaign;attempted?:boolean;state?:string;completionWarning?:string}>(siteId,`/${encodeURIComponent(id)}/${action}`,'POST',{version,...(scheduledAt?{scheduledAt}:{})});
export const recordNewsletterFeedback=(siteId:string,id:string,body:{deliveryId:string;state:'delivered'|'bounced'|'complained';evidence:string})=>request<NewsletterCampaignDetail>(siteId,`/${encodeURIComponent(id)}/feedback`,'POST',body);
