const ref=(name:string)=>({$ref:`#/components/schemas/${name}`});
const text={type:'string'};
const object=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
const envelope=(data:unknown)=>object({success:{const:true},requestId:text,data});
const fields=Object.fromEntries(['scope','scopeTargetId','visibility','folderId','tags','altText','caption','metadata','fontFamily','fontWeight','fontStyle','fontFallback','fontDisplay'].map(key=>[key,{...text,maxLength:16384}]));
export const mediaUploadSessionSchemas={
  AdminMediaUploadSessionCreateRequest:object({filename:{...text,minLength:1,maxLength:255},mimeType:{...text,minLength:3,maxLength:255},sizeBytes:{type:'integer',minimum:1,maximum:52428800},sha256:{...text,pattern:'^[a-f0-9]{64}$'},fields:object(fields,[])}),
  AdminMediaUploadSession:object({id:{...text,format:'uuid'},siteId:text,filename:text,mimeType:text,sizeBytes:{type:'integer',minimum:1,maximum:52428800},offset:{type:'integer',minimum:0,maximum:52428800},state:{enum:['uploading','completing','complete','failed']},mediaId:{type:['string','null']},expiresAt:{...text,format:'date-time'},chunkBytes:{const:1048576},maxUploadBytes:{const:52428800},bindingFingerprint:{...text,pattern:'^[a-f0-9]{64}$'}}),
  AdminMediaUploadSessionListEnvelope:envelope(object({uploads:{type:'array',maxItems:100,items:ref('AdminMediaUploadSession')},pagination:object({total:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100},offset:{type:'integer',minimum:0},hasMore:{type:'boolean'}})})),
  AdminMediaUploadSessionEnvelope:envelope(object({upload:ref('AdminMediaUploadSession')})),
  AdminMediaUploadSessionCompleteRequest:object({action:{const:'complete'}}),
  AdminMediaUploadSessionCancelEnvelope:envelope(object({cancelled:{type:'boolean'},storageRecoveryRetained:{const:true}})),
};
export function mediaUploadSessionPaths(siteId:string) {
  const root=`/api/admin/sites/${siteId}/media/uploads`;
  const base={tags:['Admin Media'],security:[{BackyAdminSession:[]},{BackyAdminSessionHeader:[]}],'x-backy-permissions':['media.create'],'x-backy-authentication':'operator-session','x-backy-runtime-requirement':'PostgreSQL migration031',description:'Durable private1 MiB chunk staging up to50 MiB. Exact site and uploading operator required. Finalization uses ordinary media quota/scanner/storage admission. This is not TUS or unbounded video streaming. Interrupted completion never starts another write automatically; GET/POST may recover a committed result, DELETE discards uncommitted staging under the shared site lock while retaining storage recovery journals.'};
  const response=(name:string)=>({description:'Upload operation result',content:{'application/json':{schema:ref(name)}}});
  const errors=Object.fromEntries([400,401,403,404,408,409,410,413,415,503].map(status=>[String(status),{...response('ErrorEnvelope'),description:'Admission, offset/expiry, byte limit or persistence failure; no successful upload is implied.'}]));
  const body=(name:string)=>({required:true,content:{'application/json':{schema:ref(name)}}});
  const op=(id:string,name:string,status='200')=>({...base,operationId:id,responses:{[status]:response(name),...errors}});
  const parameter={name:'uploadId',in:'path',required:true,schema:{...text,format:'uuid'}};
  return {
    [root]:{get:{...op('listAdminMediaUploadSessions','AdminMediaUploadSessionListEnvelope'),parameters:[{name:'limit',in:'query',schema:{type:'integer',minimum:1,maximum:100,default:25}},{name:'offset',in:'query',schema:{type:'integer',minimum:0,default:0}}]},post:{...op('createAdminMediaUploadSession','AdminMediaUploadSessionEnvelope','201'),requestBody:body('AdminMediaUploadSessionCreateRequest')}},
    [`${root}/{uploadId}`]:{
      get:{...op('getAdminMediaUploadSession','AdminMediaUploadSessionEnvelope'),parameters:[parameter]},
      patch:{...op('appendAdminMediaUploadChunk','AdminMediaUploadSessionEnvelope'),parameters:[parameter,{name:'Upload-Offset',in:'header',required:true,schema:{type:'integer',minimum:0}}],requestBody:{required:true,content:{'application/offset+octet-stream':{schema:{type:'string',format:'binary','x-backy-max-bytes':1048576}}}}},
      post:{...op('completeAdminMediaUploadSession','AdminMediaEnvelope'),parameters:[parameter],requestBody:body('AdminMediaUploadSessionCompleteRequest')},
      delete:{...op('cancelAdminMediaUploadSession','AdminMediaUploadSessionCancelEnvelope'),parameters:[parameter]},
    },
  };
}
