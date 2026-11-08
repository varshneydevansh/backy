import { createHash, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { BackyMediaUploadSession } from '@backy-cms/core';
import { requireAdminAccess } from './adminAccess';
import { getRequiredDatabaseRepositories } from './repositoryRuntime';
import { resolveMediaUploadPolicy, isUploadAllowedByFileType, readMediaBillingLimit } from './mediaUploadPolicy';
import { mediaStorageUsageWithPending } from './mediaStorageRecovery';
import { withMediaStorageMutation } from './mediaStorageMutation';
import { withCompletingMediaUpload } from './mediaUploadReservationContext';
import { POST as admitMedia } from '../app/api/admin/sites/[siteId]/media/route';
import { readCompleteMediaInventory } from './mediaInventory';

export const MEDIA_UPLOAD_CHUNK_BYTES = 1024 * 1024;
export const MEDIA_UPLOAD_RESUME_MAX_BYTES = 50 * 1024 * 1024;
const uuid = (value: string) => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const fields = new Set(['scope','scopeTargetId','visibility','folderId','tags','altText','caption','metadata','fontFamily','fontWeight','fontStyle','fontFallback','fontDisplay']);
class UploadError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } }
const json = (payload: unknown, status = 200) => NextResponse.json(payload, {status, headers: {'cache-control':'private, no-store','x-content-type-options':'nosniff',vary:'Cookie, Authorization'}});
const publicSession = (session: BackyMediaUploadSession) => ({ id:session.id,siteId:session.siteId,filename:session.filename,mimeType:session.mimeType,sizeBytes:session.sizeBytes,offset:session.offset,state:session.state,mediaId:session.mediaId,expiresAt:session.expiresAt,chunkBytes:MEDIA_UPLOAD_CHUNK_BYTES,maxUploadBytes:MEDIA_UPLOAD_RESUME_MAX_BYTES,bindingFingerprint:createHash('sha256').update(JSON.stringify({filename:session.filename,mimeType:session.mimeType,sizeBytes:session.sizeBytes,sha256:session.sha256,fields:Object.entries(session.fields).sort(([a],[b])=>a.localeCompare(b,'en'))})).digest('hex') });
async function bytes(request: NextRequest, max: number): Promise<Buffer> {
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer=setTimeout(() => { void reader?.cancel().catch(()=>{}); reject(new UploadError(408,'UPLOAD_BODY_TIMEOUT','Upload request timed out. Read the saved offset before retrying.')); },15000); });
  try {
    if (reader) while (true) { const chunk=await Promise.race([reader.read(),timeout]); if (chunk.done) break; size+=chunk.value.byteLength; if(size>max) {void reader.cancel().catch(()=>{}); throw new UploadError(413,'UPLOAD_BODY_TOO_LARGE','Upload request exceeds its byte limit.');} chunks.push(chunk.value); }
    return Buffer.concat(chunks);
  } finally { if(timer) clearTimeout(timer); }
}
async function input(request: NextRequest): Promise<Record<string, any>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new UploadError(415,'UPLOAD_JSON_REQUIRED','Use application/json.');
  try { const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await bytes(request,32768))); if(!value || typeof value!=='object' || Array.isArray(value)) throw new Error(); return value; }
  catch(error) { if(error instanceof UploadError) throw error; throw new UploadError(400,'INVALID_UPLOAD_INPUT','Use a JSON object.'); }
}
export async function handleAdminMediaUploadSessions(request: NextRequest, siteKey: string, uploadId?: string) {
  const requestId=`req_${randomUUID()}`;
  try {
    const access=await requireAdminAccess(request,requestId,{permission:'media.create',recordUsage:false});
    if(access instanceof NextResponse) { access.headers.set('cache-control','private, no-store'); return access; }
    // Each resumable session belongs to the authenticated uploader. No service
    // key is silently converted into a website owner's upload authority.
    const actorId=access.type==='session' ? access.session?.user.id : null;
    if(!actorId || !uuid(actorId)) throw new UploadError(403,'UPLOAD_SESSION_REQUIRED','Resumable uploads require an operator session.');
    const repositories=await getRequiredDatabaseRepositories();
    const site=await repositories.sites.getById(siteKey) || await repositories.sites.getBySlug(siteKey);
    if(!site) throw new UploadError(404,'SITE_NOT_FOUND','Site not found.');
    const repository=repositories.mediaUploadSessions;
    if(!repository) throw new UploadError(503,'MEDIA_UPLOAD_SESSIONS_UNAVAILABLE','Resumable uploads require PostgreSQL and migration031.');
    if(uploadId && !uuid(uploadId)) throw new UploadError(404,'UPLOAD_NOT_FOUND','Upload not found.');
    if(!uploadId && request.method==='GET') {
      const query=new URL(request.url).searchParams;
      const limit=Number(query.get('limit') || 25),offset=Number(query.get('offset') || 0);
      if([...query.keys()].some(key=>!['limit','offset'].includes(key) || query.getAll(key).length!==1) || !Number.isSafeInteger(limit) || limit<1 || limit>100 || !Number.isSafeInteger(offset) || offset<0) throw new UploadError(400,'INVALID_UPLOAD_PAGINATION','Use limit1–100 and a nonnegative offset.');
      const result=await repository.list(site.id,actorId,limit,offset);
      return json({success:true,requestId,data:{uploads:result.items.map(publicSession),pagination:{total:result.total,limit,offset,hasMore:offset+result.items.length<result.total}}});
    }
    if(!uploadId && request.method==='POST') {
      const body=await input(request);
      if(typeof body.sha256!=='string' || !/^[a-f0-9]{64}$/.test(body.sha256) || Object.keys(body).some(key=>!['filename','mimeType','sizeBytes','sha256','fields'].includes(key)) || typeof body.filename!=='string' || !body.filename.trim() || body.filename.length>255 || /[\u0000-\u001f\u007f/\\]/.test(body.filename) || typeof body.mimeType!=='string' || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(body.mimeType) || body.mimeType.length>255 || !Number.isSafeInteger(body.sizeBytes) || body.sizeBytes<=0 || body.sizeBytes>MEDIA_UPLOAD_RESUME_MAX_BYTES || !body.fields || typeof body.fields!=='object' || Array.isArray(body.fields) || Object.entries(body.fields).some(([key,value])=>!fields.has(key) || typeof value!=='string' || value.length>16384)) throw new UploadError(400,'INVALID_UPLOAD_INPUT','Specify a filename, MIME type, byte count up to50 MiB, and supported string metadata fields.');
      const settings=await repositories.settings.get(), policy=resolveMediaUploadPolicy(settings);
      if(body.sizeBytes>policy.maxUploadBytes) throw new UploadError(413,'FILE_TOO_LARGE','File exceeds the configured upload limit.');
      if(!isUploadAllowedByFileType(policy,{filename:body.filename,mimeType:body.mimeType})) throw new UploadError(415,'FILE_TYPE_NOT_ALLOWED','File type is not allowed.');
      return await withMediaStorageMutation(repositories.media,site.id,requestId,async()=>{
        await repository.pruneExpired(site.id);
        const used=await mediaStorageUsageWithPending(site.id,repositories);
        if(used+body.sizeBytes>policy.quotaBytes || readMediaBillingLimit(site.settings,settings,used+body.sizeBytes).blocked) throw new UploadError(413,'SITE_MEDIA_QUOTA_EXCEEDED','This file and reserved uploads exceed the website storage allowance.');
        const session=await repository.create({id:randomUUID(),siteId:site.id,actorId,filename:body.filename,mimeType:body.mimeType,sizeBytes:body.sizeBytes,sha256:body.sha256,fields:body.fields,expiresAt:new Date(Date.now()+24*60*60*1000).toISOString()});
        return json({success:true,requestId,data:{upload:publicSession(session)}},201);
      });
    }
    if(!uploadId) throw new UploadError(405,'UPLOAD_METHOD_DENIED','Unsupported upload operation.');
    const session=await repository.get(site.id,actorId,uploadId);
    if(!session) throw new UploadError(404,'UPLOAD_NOT_FOUND','Upload not found in this website for this uploader.');
    if(request.method!=='DELETE' && session.state==='uploading' && Date.parse(session.expiresAt)<=Date.now()) throw new UploadError(410,'UPLOAD_EXPIRED','Upload expired. Select the file again to start a fresh transfer.');
    if(request.method==='GET') return json({success:true,requestId,data:{upload:publicSession(session)}});
    if(request.method==='DELETE') {
      return await withMediaStorageMutation(repositories.media,site.id,requestId,async()=>{
        const current=await repository.get(site.id,actorId,uploadId);
        if(current?.state==='completing') {
          // Completion holds this same durable site lock through byte admission
          // and settlement. Once acquired here no earlier writer is still active.
          const items=await readCompleteMediaInventory(site.id,pagination=>repositories.media.list({siteId:site.id,...pagination}));
          if(items.some(item=>item.metadata?.resumableUploadId===uploadId)) throw new UploadError(409,'UPLOAD_MEDIA_COMMITTED','The file already entered the media library. Manage it there; staging cannot delete committed media.');
          await repository.settle(site.id,actorId,uploadId,null);
        }
        return json({success:true,requestId,data:{cancelled:await repository.cancel(site.id,actorId,uploadId),storageRecoveryRetained:true}});
      });
    }
    if(request.method==='PATCH') {
      if(request.headers.get('content-type')?.split(';')[0].toLowerCase()!=='application/offset+octet-stream') throw new UploadError(415,'UPLOAD_CHUNK_TYPE_REQUIRED','Use application/offset+octet-stream.');
      const raw=request.headers.get('upload-offset');
      if(!raw || !/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new UploadError(400,'INVALID_UPLOAD_OFFSET','Specify a nonnegative integer Upload-Offset.');
      const updated=await repository.append(site.id,actorId,uploadId,Number(raw),await bytes(request,MEDIA_UPLOAD_CHUNK_BYTES));
      if(!updated) throw new UploadError(404,'UPLOAD_NOT_FOUND','Upload not found.');
      return json({success:true,requestId,data:{upload:publicSession(updated)}});
    }
    if(request.method==='POST') {
      const body=await input(request);
      if(Object.keys(body).length!==1 || body.action!=='complete') throw new UploadError(400,'INVALID_UPLOAD_INPUT','Complete with {action:"complete"}.');
      return await withMediaStorageMutation(repositories.media,site.id,requestId,async()=>{
      const current=await repository.get(site.id,actorId,uploadId);
      if(!current) throw new UploadError(404,'UPLOAD_NOT_FOUND','Upload not found.');
      // A committed media row is the recovery evidence if the client or the
      // session-settlement write was interrupted. Never issue a second upload
      // while an earlier completion's external/persistence result is uncertain.
      if(current.state==='complete' || current.state==='completing') {
        const items=await readCompleteMediaInventory(site.id,pagination=>repositories.media.list({siteId:site.id,...pagination}));
        const matches=items.filter(item=>item.metadata?.resumableUploadId===uploadId && (!current.mediaId || item.id===current.mediaId));
        const media=matches.length===1 ? matches[0] : undefined;
        if(media && current.state==='completing' && (media.sizeBytes!==current.sizeBytes || (media.metadata?.binaryFingerprint as any)?.value!==current.sha256)) throw new UploadError(409,'UPLOAD_COMPLETION_UNCERTAIN','The recovered media fingerprint changed. Review the upload before completing it.');
        if(media) { if(current.state==='completing') await repository.settle(site.id,actorId,uploadId,media.id); return json({success:true,requestId,data:{media,recovered:true}}); }
        throw new UploadError(409,'UPLOAD_COMPLETION_UNCERTAIN','The earlier completion has no confirmed media result. Do not resend bytes; review the storage recovery journal.');
      }
      const claimed=await repository.claim(site.id,actorId,uploadId);
      if(!claimed) throw new UploadError(409,'MEDIA_UPLOAD_OFFSET_CONFLICT','Upload must be complete, unexpired and ready before finalization.');
      const chunks=await repository.readChunks(site.id,actorId,uploadId);
      const buffer=Buffer.concat(chunks);
      if(buffer.length!==claimed.sizeBytes || createHash('sha256').update(buffer).digest('hex')!==claimed.sha256) { await repository.settle(site.id,actorId,uploadId,null); throw new UploadError(409,'UPLOAD_BYTES_INVALID','Stored upload bytes do not match the admitted size and fingerprint.'); }
      const form=new FormData();
      for(const [key,value] of Object.entries(claimed.fields)) form.set(key,value);
      let metadata: Record<string,unknown>;
      try { metadata=JSON.parse(claimed.fields.metadata || '{}'); if(!metadata || typeof metadata!=='object' || Array.isArray(metadata) || 'resumableUploadId' in metadata) throw new Error(); }
      catch { await repository.settle(site.id,actorId,uploadId,null); throw new UploadError(400,'INVALID_MEDIA_METADATA','Metadata must be an object without server-managed upload identity.'); }
      form.set('metadata',JSON.stringify({...metadata,resumableUploadId:uploadId}));
      form.set('file',new File([buffer],claimed.filename,{type:claimed.mimeType}));
      const headers=new Headers(request.headers); headers.delete('content-type'); headers.delete('content-length');
      headers.set('x-request-id',`upload_${uploadId}`);
      const forwarded=new NextRequest(new URL(`/api/admin/sites/${site.id}/media`,request.url),{method:'POST',headers});
      // Reuse the original admission/storage/journal/audit pipeline with a
      // server-built form; bytes are never sent through another HTTP request.
      Object.defineProperty(forwarded,'formData',{value:async()=>form});
      const response=await withCompletingMediaUpload(uploadId,()=>admitMedia(forwarded,{params:Promise.resolve({siteId:site.id})}));
      const result=await response.clone().json();
      if(response.ok && result.success && result.data?.media?.id) await repository.settle(site.id,actorId,uploadId,result.data.media.id);
      else if(response.status<500) await repository.settle(site.id,actorId,uploadId,null);
      response.headers.set('cache-control','private, no-store'); return response;
      });
    }
    throw new UploadError(405,'UPLOAD_METHOD_DENIED','Unsupported upload operation.');
  } catch(error) {
    if(error instanceof UploadError) return json({success:false,requestId,error:{code:error.code,message:error.message}},error.status);
    if((error as any)?.code==='MEDIA_UPLOAD_OFFSET_CONFLICT') return json({success:false,requestId,error:{code:'MEDIA_UPLOAD_OFFSET_CONFLICT',message:'Upload offset or state changed. Read current status before continuing.'}},409);
    return json({success:false,requestId,error:{code:'MEDIA_UPLOAD_SESSIONS_UNAVAILABLE',message:'Upload staging could not complete. Read current upload status before retrying; confirm database migration031 and storage recovery availability.'}},503);
  }
}
