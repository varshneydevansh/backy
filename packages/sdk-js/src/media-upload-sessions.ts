import type {
  GeneratedBackyOpenApiAdminMediaUploadSessionCreateRequest,
  GeneratedBackyOpenApiAdminMediaUploadSessionEnvelope,
  GeneratedBackyOpenApiAdminMediaUploadSessionListEnvelope,
  GeneratedBackyOpenApiAdminMediaUploadSessionCancelEnvelope,
  GeneratedBackyOpenApiAdminMediaEnvelope,
} from './generated-contract-types';

/** Operator-cookie transport, independent of any public frontend/operator-key defaults.
 * Caller owns file checksums, resume state and explicit retries; no automatic replay. */
export function createBackyMediaUploadSessionsClient(options: {baseUrl:string;fetch?:typeof fetch}) {
  const target=new URL(options.baseUrl);
  if(target.username || target.password || target.search || target.hash || !['http:','https:'].includes(target.protocol)) throw new Error('Use a plain Backy backend URL.');
  const base=target.href.replace(/\/+$/,'').replace(/\/api$/,'');
  const send=options.fetch || fetch;
  const path=(siteId:string,id?:string)=>`${base}/api/admin/sites/${encodeURIComponent(siteId)}/media/uploads${id?'/'+encodeURIComponent(id):''}`;
  async function call<T>(url:string,method:string,body?:unknown,chunk?:Uint8Array,offset?:number,signal?:AbortSignal):Promise<T> {
    const headers=new Headers();
    if(chunk){headers.set('content-type','application/offset+octet-stream');headers.set('upload-offset',String(offset));}
    else if(body!==undefined)headers.set('content-type','application/json');
    const response=await send(url,{method,headers,credentials:'include',redirect:'error',cache:'no-store',signal,body:chunk?new Blob([new Uint8Array(chunk)]):body===undefined?undefined:JSON.stringify(body)});
    const payload=await response.json();
    if(!response.ok || payload?.success!==true) throw Object.assign(new Error(payload?.error?.message || `Upload operation failed (${response.status}).`),{status:response.status,code:payload?.error?.code});
    return payload;
  }
  return {
    list(siteId:string,input:{limit?:number;offset?:number}={},signal?:AbortSignal){const url=new URL(path(siteId));for(const [key,value] of Object.entries(input))if(value!==undefined)url.searchParams.set(key,String(value));return call<GeneratedBackyOpenApiAdminMediaUploadSessionListEnvelope>(url.href,'GET',undefined,undefined,undefined,signal);},
    create(siteId:string,input:GeneratedBackyOpenApiAdminMediaUploadSessionCreateRequest,signal?:AbortSignal){return call<GeneratedBackyOpenApiAdminMediaUploadSessionEnvelope>(path(siteId),'POST',input,undefined,undefined,signal);},
    get(siteId:string,id:string,signal?:AbortSignal){return call<GeneratedBackyOpenApiAdminMediaUploadSessionEnvelope>(path(siteId,id),'GET',undefined,undefined,undefined,signal);},
    append(siteId:string,id:string,offset:number,bytes:Uint8Array,signal?:AbortSignal){if(!Number.isSafeInteger(offset)||offset<0||!bytes.byteLength||bytes.byteLength>1048576)throw new Error('Use a nonnegative offset and1–1048576 bytes.');return call<GeneratedBackyOpenApiAdminMediaUploadSessionEnvelope>(path(siteId,id),'PATCH',undefined,bytes,offset,signal);},
    complete(siteId:string,id:string,signal?:AbortSignal){return call<GeneratedBackyOpenApiAdminMediaEnvelope>(path(siteId,id),'POST',{action:'complete'},undefined,undefined,signal);},
    discard(siteId:string,id:string,signal?:AbortSignal){return call<GeneratedBackyOpenApiAdminMediaUploadSessionCancelEnvelope>(path(siteId,id),'DELETE',undefined,undefined,undefined,signal);},
  };
}
