/** Explicit private attachment inventory/download; provider identities stay server-owned. */
import { NextRequest, NextResponse } from 'next/server';
import { adminAccessError, isOwnerAdminSession, requireAdminAccess } from './adminAccess';
import { getSiteByIdOrSlug } from './backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from './repositoryRuntime';
import { getSiteMailboxBindings } from './siteMailboxes';
import { downloadHostingerMailAttachment, getHostingerMailConfig, HostingerMailError, listHostingerMailAttachments, validHostingerMailAttachmentId } from './hostingerMail';

class AttachmentRequestError extends Error { constructor(public status:number,public code:string,message:string){super(message);} }
const invalid = (message='Use only an exact folder, positive message UID and opaque attachment identifier.'):never=>{throw new AttachmentRequestError(400,'MAILBOX_REQUEST_INVALID',message);};
const secure = (response:NextResponse) => {
  response.headers.set('Cache-Control','private, no-store');response.headers.set('X-Content-Type-Options','nosniff');response.headers.set('Referrer-Policy','no-referrer');response.headers.set('Content-Security-Policy',"sandbox; default-src 'none'");return response;
};
const folderValue=(value:unknown):string=>typeof value==='string' && Boolean(value) && value.length<=1024 && !/[\p{Cc}\p{Cs}]/u.test(value) && !['.','..'].includes(value) ? value : invalid('A valid exact folder selection is required.');
async function readFolder(request:NextRequest):Promise<string>{
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json'||!request.body)return invalid('Download requires a JSON folder selection.');
  const length=request.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>8192))return invalid('Download request exceeds the supported size.');
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0,timer:ReturnType<typeof setTimeout>|undefined;
  try{
    await Promise.race([(async()=>{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192)return invalid('Download request exceeds the supported size.');chunks.push(value);}})(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new AttachmentRequestError(400,'MAILBOX_REQUEST_INVALID','Download request timed out.')),5000);})]);
    let body:unknown;try{const raw=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));if(!/^\s*\{\s*"(?:[^"\\]|\\.)*"\s*:\s*"(?:[^"\\]|\\.)*"\s*\}\s*$/u.test(raw))return invalid();body=JSON.parse(raw);}catch{return invalid('Download requires valid UTF-8 JSON.');}
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1||!Object.hasOwn(body,'folder'))return invalid();
    return folderValue((body as {folder:unknown}).folder);
  }finally{clearTimeout(timer);void reader.cancel().catch(()=>{});}
}
/** Every resource argument is forwarded by its route and checked before provider access. */
export async function siteMailboxAttachmentRoute(request:NextRequest,siteId:string,bindingId:string,uid:string,attachmentId?:string){
  const requestId=`mail_attachment_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  const error=(status:number,code:string,message:string)=>secure(NextResponse.json({success:false,requestId,error:{code,message}},{status}));
  try{
    if(['authorization','x-backy-admin-session','x-backy-admin-key','x-api-key'].some(header=>request.headers.has(header)))return secure(adminAccessError(403,'OWNER_SESSION_REQUIRED','Mailbox access requires an owner cookie session without explicit credential headers.',requestId));
    if(!request.cookies.get('backy_admin_session')?.value?.trim())return secure(adminAccessError(401,'UNAUTHORIZED','A current owner cookie session is required for mailbox access.',requestId));
    const access=await requireAdminAccess(request,requestId,{permissions:['sites.view','settings.view'],recordUsage:false});
    if(access instanceof NextResponse)return secure(access);
    if(!isOwnerAdminSession(access))return secure(adminAccessError(403,'OWNER_SESSION_REQUIRED','Mailbox access requires an active owner admin session.',requestId));
    const download=attachmentId!==undefined;
    if(request.method!==(download?'POST':'GET'))return error(405,'MAILBOX_METHOD_NOT_ALLOWED','Use the explicit attachment inventory or download action.');
    const declaredLength=request.headers.get('content-length');
    if(!download&&(request.body||(declaredLength!==null&&(!/^\d+$/.test(declaredLength)||Number(declaredLength)!==0))))return invalid('Attachment inventory does not accept a request body.');
    const query=new URL(request.url).searchParams;
    if([...query.keys()].some(key=>key!=='folder'||download)||(!download&&query.getAll('folder').length!==1))return invalid('Only one exact folder selection is supported.');
    if(!/^[1-9]\d*$/.test(uid)||!Number.isSafeInteger(Number(uid))||(download&&!validHostingerMailAttachmentId(attachmentId)))return invalid();
    const folder=download?await readFolder(request):folderValue(query.get('folder'));
    const repositories=shouldUseDemoStoreFallback()?null:await getRequiredDatabaseRepositories();
    const site=repositories?await repositories.sites.getById(siteId)||await repositories.sites.getBySlug(siteId):getSiteByIdOrSlug(siteId);
    if(!site)return error(404,'SITE_NOT_FOUND','Site not found.');
    if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(bindingId))return error(404,'MAILBOX_BINDING_NOT_FOUND','Mailbox binding not found for this site.');
    const binding=getSiteMailboxBindings().find(item=>item.siteId===site.id&&item.id===bindingId);
    if(!binding)return error(404,'MAILBOX_BINDING_NOT_FOUND','Mailbox binding not found for this site.');
    const provider=getHostingerMailConfig();if(!provider.apiToken)return error(503,'MAILBOX_PROVIDER_NOT_CONFIGURED','Configure the server Hostinger Mail API token before reading this mailbox.');
    const config={apiToken:provider.apiToken,from:binding.address,mailboxId:binding.mailboxId},options={folder,uid:Number(uid)};
    if(!download){const result=await listHostingerMailAttachments(config,options);return secure(NextResponse.json({success:true,requestId,data:{schema:'backy.mailbox-attachments.v1',siteId:site.id,bindingId:binding.id,...options,attachments:result.data}}));}
    const result=await downloadHostingerMailAttachment(config,{...options,attachmentId:attachmentId!});
    const ascii=result.filename.replace(/[^\x20-\x7e]/g,'_').replace(/["\\]/g,'_');
    const encoded=encodeURIComponent(result.filename).replace(/[!'()*]/g,char=>`%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    return secure(new NextResponse(result.bytes,{status:200,headers:{'Content-Type':'application/octet-stream','Content-Length':String(result.bytes.byteLength),'Content-Disposition':`attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`,'X-Request-Id':requestId}}));
  }catch(failure){
    if(failure instanceof AttachmentRequestError)return error(failure.status,failure.code,failure.message);
    if(failure instanceof HostingerMailError){if(failure.reason==='attachment-not-found')return error(404,'MAILBOX_ATTACHMENT_NOT_FOUND','Attachment not found for this message.');if(failure.reason==='attachment-too-large')return error(413,'MAILBOX_ATTACHMENT_TOO_LARGE','Attachment exceeds the supported download size.');return error(failure.reason==='not-configured'?503:failure.reason==='rate-limited'?429:failure.reason==='invalid-request'?400:502,'HOSTINGER_MAIL_PROVIDER_FAILED',failure.message);}
    return error(503,'MAILBOX_WORKSPACE_UNAVAILABLE','The mailbox workspace is unavailable. Reload or check the server configuration.');
  }
}
