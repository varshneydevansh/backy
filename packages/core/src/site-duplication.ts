import { DEFAULT_SITE_SETTINGS } from './index';
import type { Site } from './types';
/** Duplication retains its historical site/settings/page-only semantics. */
export const SITE_DUPLICATION_SCOPE={copied:['site-settings','theme','pages','page-hierarchy','navigation'],notCopied:['blog-posts-and-taxonomy','media-and-file-bytes','collections-and-records','form-definitions-and-private-submissions','contacts-and-newsletter-records','visitor-memberships-and-sessions','registered-components-and-reusable-section-records','content-and-template-revision-history'],retainedReferences:'Embedded asset, form, collection and registered-component references remain authored references; the referenced resources are not cloned.'} as const;
export const SITE_DUPLICATION_PAGE_LIMIT=50000;
export class SiteCreationAdmissionError extends Error{constructor(readonly code:string,readonly status:number,message:string){super(message);}}
/** Stable admission errors across independently loaded CJS/ESM repository bundles. */
export function siteCreationAdmissionErrorDetails(value:unknown):{code:string;status:number;message:string}|null {
 if(!value||typeof value!=='object')return null;
 const error=value as {code?:unknown;status?:unknown};
 const known:Record<string,[number,string]>={
  BILLING_SITE_LIMIT:[402,'The configured billing site limit has been reached. Review Settings before creating another site.'],
  SITE_NOT_FOUND:[404,'Site not found.'],
  SITE_SLUG_CONFLICT:[409,'The requested site slug is unavailable. Choose another slug.'],
  SITE_DUPLICATION_SOURCE_INVALID:[409,'The source hierarchy or navigation is invalid. Repair it before duplication.'],
  SITE_CREATION_UNAVAILABLE:[503,'Atomic site creation is unavailable for this repository.'],
  SITE_CREATION_BUSY:[503,'Site creation changed or admission is busy. Reload sites and retry; no automatic replay.'],
  SITE_CREATION_INVENTORY_UNAVAILABLE:[503,'A complete workspace site inventory is unavailable. Retry after checking the database.'],
  SITE_DUPLICATION_INVENTORY_INCOMPLETE:[503,'A complete bounded same-site page inventory is required. No site was created.'],
  SITE_CREATION_PERSISTENCE_FAILED:[503,'The private site store could not persist creation. Check storage and retry.'],
  SITE_CREATION_PERSISTENCE_UNCONFIRMED:[503,'Site creation could not confirm its outcome. Reload sites before applying again.'],
 };
 if(typeof error.code!=='string')return null;const detail=Object.prototype.hasOwnProperty.call(known,error.code)?known[error.code]:null;
 return detail&&error.status===detail[0]?{code:error.code,status:detail[0],message:detail[1]}:null;
}
export type SiteDuplicationInput={sourceSiteId:string;name?:string;slug?:string};
export type SiteDuplicationResult={site:Site;pagesCopied:number;copiedResourceScope:typeof SITE_DUPLICATION_SCOPE;concurrencyBoundary:'postgres-table-locks'|'demo-single-process';completionWarnings:string[]};
export interface BackySiteDuplicationRepository{duplicate(input:SiteDuplicationInput):Promise<SiteDuplicationResult>;}
type Row=Record<string,any>;
const record=(v:unknown):v is Row=>!!v&&typeof v==='object'&&!Array.isArray(v);
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
export const normalizeSiteDuplicateSlug=(v:unknown)=>typeof v==='string'?v.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''):'';
export function assertSiteCreationQuota(settings:unknown,count:number){
 if(!Number.isSafeInteger(count)||count<0)throw new SiteCreationAdmissionError('SITE_CREATION_INVENTORY_UNAVAILABLE',503,'A complete workspace site inventory is unavailable. Retry after checking the database.');
 const commerce=record(settings)&&record(settings.integrations)&&record(settings.integrations.commerce)?settings.integrations.commerce:{};
 const value=Number(commerce.siteLimit),limit=Number.isFinite(value)&&value>=1?Math.round(value):3;
 if(commerce.overageMode==='block'&&count>=limit)throw new SiteCreationAdmissionError('BILLING_SITE_LIMIT',402,`The configured billing policy allows ${limit} site${limit===1?'':'s'}. Update Settings billing limits before creating another site.`);
}
export function prepareSiteDuplication(source:Row,pages:Row[],input:SiteDuplicationInput,existingSlugs:ReadonlySet<string>,makeId:()=>string,now:string){
 if(pages.length>SITE_DUPLICATION_PAGE_LIMIT)throw new SiteCreationAdmissionError('SITE_DUPLICATION_INVENTORY_INCOMPLETE',503,'The complete page inventory exceeds the bounded duplication limit. No site was created.');
 const sourceId=String(source.id),ids=new Set<string>();for(const page of pages){if(!page.id||page.siteId!==sourceId||ids.has(page.id))throw new SiteCreationAdmissionError('SITE_DUPLICATION_INVENTORY_INCOMPLETE',503,'A complete same-site page inventory is required.');ids.add(page.id);}
 for(const page of pages)for(const parent of [page.parentId,page.meta?.parentPageId])if(parent&& !ids.has(parent))throw new SiteCreationAdmissionError('SITE_DUPLICATION_SOURCE_INVALID',409,'A page hierarchy refers to an unavailable source page. Repair it before duplication.');
 const base=normalizeSiteDuplicateSlug(input.slug)||normalizeSiteDuplicateSlug(`${source.slug}-copy-${Date.parse(now).toString(36).slice(-6)}`);let slug='';for(let i=0;i<100;i++){const candidate=i===0?base:`${base}-${i+1}`;if(!existingSlugs.has(candidate)){slug=candidate;break;}}
 if(!slug)throw new SiteCreationAdmissionError('SITE_SLUG_CONFLICT',409,'No available duplicate slug was found. Choose another slug.');
 const id=makeId(),map=new Map(pages.map(page=>[String(page.id),makeId()]));
 const navigation=(value:unknown,depth=0):unknown=>{if(depth>100)throw new SiteCreationAdmissionError('SITE_DUPLICATION_SOURCE_INVALID',409,'Navigation exceeds its supported nesting limit.');if(Array.isArray(value))return value.map(item=>navigation(item,depth+1));if(record(value)){const next=Object.fromEntries(Object.entries(value).map(([key,item])=>[key,navigation(item,depth+1)]));if(typeof next.pageId==='string'&&map.has(next.pageId))next.pageId=map.get(next.pageId);return next;}return value;};
 const settings=clone(source.settings||DEFAULT_SITE_SETTINGS),defaults=clone(DEFAULT_SITE_SETTINGS);settings.domainVerification=defaults.domainVerification;settings.vercelDeployment=defaults.vercelDeployment;settings.billingQuota=defaults.billingQuota;settings.siteStatus='draft';settings.navigation=navigation(settings.navigation||defaults.navigation);
 const site={...clone(source),id,name:input.name?.trim()||`${source.name} Copy`,slug,customDomain:null,domainStatus:'pending',sslEnabled:false,isPublished:false,status:'draft',publishedAt:null,settings,createdAt:now,updatedAt:now};
 const copied=pages.map(page=>({...clone(page),id:map.get(page.id)!,siteId:id,status:'draft',scheduledAt:null,publishedAt:null,parentId:page.parentId?map.get(page.parentId):null,meta:{...clone(page.meta||{}),...(page.meta?.parentPageId?{parentPageId:map.get(page.meta.parentPageId)}:{})},createdAt:now,updatedAt:now}));
 return{site,pages:copied};
}
