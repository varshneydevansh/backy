/** Mounted real campaign desk/client; synthetic deferred fetch only. No provider or backend mutation. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { NewsletterCampaignDesk } from '../src/components/newsletter/NewsletterCampaignDesk';
export async function runNewsletterCampaignMountedTests(container:HTMLElement) {
 const originalFetch=globalThis.fetch,checks:Array<{name:string;passed:boolean}>=[],requests:Array<{method:string;path:string;body:any;key:string|null}>=[];
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 let campaign:any=null,detail:any=null,configured=false,deny=false,conflict=false,sequence=0,heldCreate:((value:Response)=>void)|null=null,delayCreate=false;
 const readiness=()=>({configured,provider:'smtp',blockers:configured?[]:['NEWSLETTER_SITE_NOT_ENABLED'],dailyLimit:40,maxRecipients:40,processing:'authenticated-invoker-required',automaticFeedback:'signed-bridge-required',smtpAcceptanceIsDelivery:false,uncertainAutoRetry:false});
 const response=(data:any,status=200)=>new Response(JSON.stringify({success:status<300,requestId:'fixture',...(status<300?{data}:{error:{message:status===403?'Campaign permission denied':'Campaign changed. Reload before applying the action.'}})}),{status,headers:{'content-type':'application/json'}});
 globalThis.fetch=(async(input:RequestInfo|URL,init:RequestInit={})=>{
  const path=new URL(String(input),location.origin).pathname,method=init.method||'GET',body=init.body?JSON.parse(String(init.body)):null,key=new Headers(init.headers).get('idempotency-key');requests.push({method,path,body,key});
  if(deny)return response({},403);if(conflict&&method==='PATCH')return response({},409);
  if(path.endsWith('/campaigns')&&method==='GET')return response({campaigns:campaign?[campaign]:[],pagination:{total:campaign?1:0,limit:25,offset:0,hasMore:false},readiness:readiness()});
  if(path.endsWith('/campaigns')&&method==='POST'){
   campaign={...body,id:'10000000-0000-4000-8000-000000000001',siteId:'site-fixture',state:'draft',version:1,scheduledAt:null,createdAt:'2026-10-13T00:00:00Z',updatedAt:'2026-10-13T00:00:00Z',recipientCount:0,actorId:'fixture'};detail={campaign,deliveries:[],counts:{}};
   if(delayCreate)return new Promise<Response>(resolve=>{heldCreate=resolve;});return response({campaign},201);
  }
  if(path.endsWith('/'+campaign?.id)&&method==='GET')return response({...detail,readiness:readiness()});
  if(method==='PATCH'){campaign={...campaign,...body,version:campaign.version+1};detail.campaign=campaign;return response({campaign});}
  if(path.endsWith('/schedule')||path.endsWith('/send')){campaign={...campaign,state:path.endsWith('/schedule')?'scheduled':'queued',version:campaign.version+1,recipientCount:1,scheduledAt:body.scheduledAt||null};detail={campaign,deliveries:[{id:'20000000-0000-4000-8000-000000000001',siteId:'site-fixture',campaignId:campaign.id,contactId:null,email:'fixture@example.test',state:'pending',providerMessageId:null,errorCode:null,createdAt:campaign.createdAt,updatedAt:campaign.updatedAt}],counts:{pending:1}};return response({campaign},202);}
  if(path.endsWith('/cancel')){campaign={...campaign,state:'cancelled',version:campaign.version+1};detail.campaign=campaign;detail.deliveries[0].state='cancelled';detail.counts={cancelled:1};return response({campaign});}
  if(path.endsWith('/process')){detail.deliveries[0].state='uncertain';detail.counts={uncertain:1};return response({attempted:true,state:'uncertain'});}
  if(path.endsWith('/feedback')){detail.deliveries[0].state=body.state;detail.counts={[body.state]:1};return response(detail);}
  throw Error('Unexpected synthetic API route '+path);
 }) as typeof fetch;
 const root=createRoot(container);let allowed=false,manage=false,exportAllowed=false;
 const flush=async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});};
 const render=async()=>{await act(async()=>{root.render(<NewsletterCampaignDesk key={String(allowed)+':'+sequence} siteId="site-fixture" canView={allowed} canManage={manage} canExport={exportAllowed} forms={[{id:'30000000-0000-4000-8000-000000000001',name:'Synthetic signup'}]}/>);});await flush();};
 const check=(name:string,value:boolean)=>{checks.push({name,passed:value});if(!value)throw Error(name+' | '+container.textContent?.slice(0,1800)+' | '+JSON.stringify(requests));};
 const click=async(testid:string)=>{const el=container.querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`);if(!el)throw Error('Missing '+testid);await act(async()=>{el.click();});await flush();};
 const clickText=async(text:string)=>{const el=Array.from(container.querySelectorAll('button')).find(b=>b.textContent===text);if(!el)throw Error('Missing '+text);await act(async()=>{el.click();});await flush();};
 const fill=async(testid:string,value:string)=>{const el=container.querySelector<HTMLInputElement|HTMLTextAreaElement>(`[data-testid="${testid}"]`);if(!el)throw Error('Missing '+testid);await act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});};
 try {
  await render();check('Denied forms view renders no private journal and makes no API call',requests.length===0&&container.textContent!.includes('Forms view permission'));
  allowed=true;manage=true;await render();check('Default delivery blockers are visible and draft authoring remains usable',container.textContent!.includes('Campaigns are disabled for this site')&&!container.querySelector<HTMLButtonElement>('[data-testid="newsletter-campaign-save"]')!.disabled);
  await fill('newsletter-campaign-subject','Synthetic issue');await fill('newsletter-campaign-text','Synthetic issue body. <script>never executes</script>');delayCreate=true;
  await click('newsletter-campaign-save');await click('newsletter-campaign-save');check('Two submit attempts reserve one request while pending',requests.filter(r=>r.method==='POST'&&r.path.endsWith('/campaigns')).length===1);
  await act(async()=>{heldCreate!(response({campaign},201));});await flush();delayCreate=false;
  check('Draft saves through actual API helper with idempotency header and escaped textarea',Boolean(requests.find(r=>r.key))&&container.querySelector<HTMLTextAreaElement>('[data-testid="newsletter-campaign-text"]')!.value.includes('<script>')&&container.querySelector('script')===null);
  check('Queue requires export permission and configured delivery',container.querySelector<HTMLButtonElement>('[data-testid="newsletter-campaign-send"]')!.disabled);
  configured=true;exportAllowed=true;await clickText('Refresh campaigns');await render();check('Configured draft can enter explicit queue review',!container.querySelector<HTMLButtonElement>('[data-testid="newsletter-campaign-send"]')!.disabled);
  await fill('newsletter-campaign-subject','Edited synthetic issue');check('Unsaved draft changes block send until save',container.querySelector<HTMLButtonElement>('[data-testid="newsletter-campaign-send"]')!.disabled);
  conflict=true;await click('newsletter-campaign-save');check('Version conflicts preserve draft and show recovery message',container.textContent!.includes('Campaign changed.')&&container.querySelector<HTMLInputElement>('[data-testid="newsletter-campaign-subject"]')!.value==='Edited synthetic issue');conflict=false;
  await click('newsletter-campaign-save');check('Draft update sends optimistic version',requests.find(r=>r.method==='PATCH')!.body.version===1);
  await click('newsletter-campaign-send');check('Review stage issues no send request',requests.filter(r=>r.path.endsWith('/send')).length===0&&Boolean(container.querySelector('[data-testid="newsletter-campaign-confirm"]')));
  await click('newsletter-campaign-confirm');check('Confirmation queues saved draft and exposes frozen journal',requests.filter(r=>r.path.endsWith('/send')).length===1&&container.textContent!.includes('fixture@example.test')&&container.textContent!.includes('Audience frozen and queued'));
  await click('newsletter-campaign-process');check('Uncertain processing is visible without resend claim',container.textContent!.includes('Attempt recorded as uncertain')&&container.textContent!.includes('uncertain: 1'));
  const selects=container.querySelectorAll<HTMLSelectElement>('select');await act(async()=>{const recipient=selects[1];recipient.value='20000000-0000-4000-8000-000000000001';recipient.dispatchEvent(new Event('change',{bubbles:true}));const evidence=container.querySelectorAll<HTMLTextAreaElement>('textarea')[1];Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(evidence,'Synthetic mailbox bounce receipt reference');evidence.dispatchEvent(new Event('input',{bubbles:true}));});
  await clickText('Record outcome');check('Operator feedback preserves evidence and displays bounce suppression',requests.find(r=>r.path.endsWith('/feedback'))!.body.evidence.includes('receipt')&&container.textContent!.includes('bounced: 1'));
  await click('newsletter-campaign-cancel');check('Cancellation makes one current-version API request and warns about in-flight attempts',requests.filter(r=>r.path.endsWith('/cancel')).length===1&&container.textContent!.includes('in-flight attempt'));
  await clickText('New campaign');await fill('newsletter-campaign-subject','Scheduled synthetic issue');await fill('newsletter-campaign-text','Synthetic scheduled content.');await click('newsletter-campaign-save');
  await fill('newsletter-campaign-scheduled-at',new Date(Date.now()+86400000).toISOString().slice(0,16));await click('newsletter-campaign-schedule');check('Schedule review issues no external or queue operation',requests.filter(r=>r.path.endsWith('/schedule')).length===0);
  await click('newsletter-campaign-confirm');check('Schedule confirmation sends ISO timestamp and saved version',requests.filter(r=>r.path.endsWith('/schedule')).length===1&&/Z$/.test(requests.find(r=>r.path.endsWith('/schedule'))!.body.scheduledAt)&&requests.find(r=>r.path.endsWith('/schedule'))!.body.version===1);
  check('Scheduled campaign displays recipient snapshot without auto processing',container.textContent!.includes('Campaign scheduled')&&requests.filter(r=>r.path.endsWith('/process')).length===1);
  deny=true;await clickText('Refresh campaigns');check('Current permission denial clears cached recipients and content',!container.textContent!.includes('fixture@example.test')&&container.querySelector<HTMLInputElement>('[data-testid="newsletter-campaign-subject"]')!.value===''&&container.textContent!.includes('Campaign permission denied'));
  allowed=false;await render();const before=requests.length;check('Permission loss removes journal immediately',!container.textContent!.includes('Synthetic issue'));await render();check('Denied context issues no new API request',requests.length===before);
  return {ok:true,boundary:'Actual mounted campaign desk and admin client; synthetic deferred fetch only. PostgreSQL/handlers are tested separately.',checks,requestCount:requests.length};
 } finally {await act(async()=>root.unmount());globalThis.fetch=originalFetch;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=false;}
}
