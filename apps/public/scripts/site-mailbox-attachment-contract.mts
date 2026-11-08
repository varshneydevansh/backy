import assert from 'node:assert/strict';
import {assertSiteMailboxContractBody,siteMailboxOperations} from './site-mailbox-contract.mts';
import type {HostingerMailAttachment} from '../src/lib/hostingerMail';
const metadataPath='/{bindingId}/messages/{uid}/attachments';
const downloadPath=metadataPath+'/{attachmentId}/download';
export function assertSiteMailboxAttachmentContractBody(status:number|'request',body:unknown,download=false){
 assertSiteMailboxContractBody(download?downloadPath:metadataPath,download?'post':'get',status,body);
 if(status===200&&!download){const data=(body as any).data;assert(data.folder.length<=1024);for(const item of data.attachments){assert(Buffer.byteLength(item.id,'utf8')<=512&&item.id.trim(),'Opaque ID UTF-8 bound');assert(item.filename===null||Buffer.byteLength(item.filename,'utf8')<=180,'Filename UTF-8 bound');}}
 if(status==='request')assert((body as any).folder.length<=1024,'Folder UTF-16 bound');
}
export function assertSiteMailboxAttachmentDownload(response:Response,bytes:Uint8Array){
 const operation=(siteMailboxOperations as any)['/api/admin/sites/{siteId}/settings/mailboxes'+downloadPath].post;
 assert.equal(response.status,200);assert.equal(bytes.byteLength,Number(response.headers.get('content-length')));assert(bytes.byteLength<=3145728);
 for(const[name,header]of Object.entries(operation.responses['200'].headers)as Array<[string,any]>)if(header.schema.const)assert.equal(response.headers.get(name),header.schema.const,name);
 const length=response.headers.get('content-length');assert(length&&/^(0|[1-9][0-9]*)$/.test(length));
 const requestId=response.headers.get('x-request-id');assert(requestId&&requestId.length<=200&&!/[\p{Cc}]/u.test(requestId));
 const disposition=response.headers.get('content-disposition');assert(disposition);
 const parsed=/^attachment; filename="([^"\\\r\n]+)"; filename\*=UTF-8''([^;\r\n]+)$/.exec(disposition);assert(parsed,'Forced attachment disposition with encoded filename');
 const filename=decodeURIComponent(parsed[2]);assert(filename&&filename!=='.'&&filename!=='..'&&!/[\p{Cc}\p{Cs}\/\\\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(filename));assert(Buffer.byteLength(filename,'utf8')<=180);
 for(const name of['location','authorization','x-api-key','x-backy-admin-key','x-backy-admin-session','set-cookie'])assert.equal(response.headers.get(name),null,'No URL/private provider or session header');
}
let checks=0;
const attachment:HostingerMailAttachment={id:'part/2+😀',filename:'report.txt',contentType:'text/plain',sizeBytes:0,inline:false};
const envelope={success:true,requestId:'contract',data:{schema:'backy.mailbox-attachments.v1',siteId:'owned-site',bindingId:'owned',folder:'INBOX',uid:1,attachments:[attachment]}};
assertSiteMailboxAttachmentContractBody(200,envelope);checks++;
for(const value of[{...attachment,filename:null},{...attachment,contentType:'application/x-unknown'},{...attachment,sizeBytes:3145729},{...attachment,inline:true}]){assertSiteMailboxAttachmentContractBody(200,{...envelope,data:{...envelope.data,attachments:[value]}});checks++;}
for(const key of['providerURL','contentId','token','mailboxId','downloadUrl','bytes']){const bad=structuredClone(envelope);(bad.data.attachments[0]as any)[key]='private-sentinel';assert.throws(()=>assertSiteMailboxAttachmentContractBody(200,bad));checks++;}
for(const value of[{...attachment,id:'😀'.repeat(129)},{...attachment,id:'\u007f'},{...attachment,id:'\ud800'},{...attachment,id:'..'},{...attachment,id:'   '},{...attachment,filename:'../path.txt'},{...attachment,filename:'\u202efile'},{...attachment,filename:'😀'.repeat(46)},{...attachment,sizeBytes:-1},{...attachment,contentType:'text/html; charset=utf-8'}]){assert.throws(()=>assertSiteMailboxAttachmentContractBody(200,{...envelope,data:{...envelope.data,attachments:[value]}}));checks++;}
assert.throws(()=>assertSiteMailboxAttachmentContractBody(200,{...envelope,data:{...envelope.data,attachments:Array.from({length:101},()=>attachment)}}));checks++;
for(const body of[{}, {folder:''},{folder:'.'},{folder:'\u0085'},{folder:'\ud800'},{folder:'😀'.repeat(513)},{folder:'INBOX',uid:1},{folder:'INBOX',token:'sentinel'}]){assert.throws(()=>assertSiteMailboxAttachmentContractBody('request',body,true));checks++;}
assertSiteMailboxAttachmentContractBody('request',{folder:'Reports/2026'},true);checks++;
for(const download of[false,true])for(const status of[400,401,403,404,429,502,503,...download?[413]:[]]){assertSiteMailboxAttachmentContractBody(status,{success:false,requestId:'refused',error:{code:'REFUSED',message:'safe'}},download);checks++;}
const headers={'Content-Type':'application/octet-stream','Content-Length':'3','Content-Disposition':"attachment; filename=\"report.txt\"; filename*=UTF-8''report.txt",'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"sandbox; default-src 'none'",'X-Request-Id':'safe-request'};
assertSiteMailboxAttachmentDownload(new Response(new Uint8Array([0,255,4]),{headers}),new Uint8Array([0,255,4]));checks++;
assertSiteMailboxAttachmentDownload(new Response(new Uint8Array(),{headers:{...headers,'Content-Length':'0'}}),new Uint8Array());checks++;
for(const[name,value]of[['Content-Type','text/html'],['Content-Disposition','inline'],['Cache-Control','public'],['X-Content-Type-Options',''],['Content-Length','2'],['Referrer-Policy','unsafe-url'],['Content-Security-Policy',''],['Location','https://provider.invalid/private']]){assert.throws(()=>assertSiteMailboxAttachmentDownload(new Response(new Uint8Array([0,255,4]),{headers:{...headers,[name]:value}}),new Uint8Array([0,255,4])));checks++;}
for(const path of[metadataPath,downloadPath]){const operation=(siteMailboxOperations as any)['/api/admin/sites/{siteId}/settings/mailboxes'+path][path===metadataPath?'get':'post'];assert.deepEqual(operation.security,[{BackyAdminSession:[]}]);assert.deepEqual(operation['x-backy-permissions'],['sites.view','settings.view']);assert.equal(operation['x-backy-owner-only'],true);assert(!JSON.stringify(operation).includes('publicURL'));checks+=4;}
console.log(`Mailbox attachment producer/binary contract PASS ${checks} assertions; synthetic fields and bytes, no provider calls.`);
