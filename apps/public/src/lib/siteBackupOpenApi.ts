/** Discovery describes private recovery shapes; archive values are never public. */
const ref = (name:string) => ({$ref:`#/components/schemas/${name}`});
const str = {type:'string'}, number = {type:'integer',minimum:0}, strings = {type:'array',items:str};
const obj = (properties:Record<string,unknown>,required=Object.keys(properties)) => ({type:'object',additionalProperties:true,properties,required});
const envelope = (data:unknown) => obj({success:{const:true},requestId:str,data});
const counts = {type:'object',additionalProperties:number};
const boundary = {enum:['postgres-table-locks','demo-single-process']};
const tableNames = ['pages','blogPosts','blogCategories','blogTags','mediaFolders','media','mediaVersions','contentCollections','contentCollectionRecords','siteVisitors','formDefinitions','formSubmissions','formContacts','reusableSections','interactiveComponents','contentRevisions','templateRevisions','comments','commentBlocklist'];
export const siteBackupSchemas = {
  SiteBackupPackage: obj({contract:{const:'backy.site-backup.v1'},exportedAt:str,sourceSiteId:str,graph:obj({site:obj({},[]),tables:obj(Object.fromEntries(tableNames.map(name=>[name,{type:'array',items:obj({},[])}])))}),files:{type:'array',maxItems:10000,items:obj({id:str,namespace:{enum:['media','attachment']},path:str,url:{type:['string','null']},filename:str,mimeType:str,bytes:number,sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},base64:str})},externalLinks:strings,exclusions:strings}),
  SiteBackupLimits: obj({maxRows:{const:50000},maxFiles:{const:10000},maxBinaryBytes:{const:33554432},maxArchiveBytes:{const:67108864},maxDepth:{const:100}}),
  SiteBackupPreview: obj({contract:{const:'backy.site-backup-preview.v1'},sourceSiteId:str,teamId:str,name:str,slug:str,packageFingerprint:str,counts,files:number,bytes:number,externalLinks:number,exclusions:strings,safetyResets:strings,concurrencyBoundary:boundary}),
  SiteBackupRestoreRequest: {...obj({action:{enum:['preview','apply']},archive:ref('SiteBackupPackage'),name:str,slug:str,reviewedPreview:ref('SiteBackupPreview'),confirmPrivateData:{const:true},confirmSafetyResets:{const:true}},['action','archive','name','slug']),allOf:[{if:{properties:{action:{const:'apply'}},required:['action']},then:{required:['reviewedPreview','confirmPrivateData','confirmSafetyResets']}}]},
  SiteBackupExportEnvelope: envelope(obj({siteId:str,archive:ref('SiteBackupPackage'),limits:ref('SiteBackupLimits'),private:{const:true}})),
  SiteBackupPreviewEnvelope: envelope(obj({siteId:str,dryRun:{const:true},reviewedPreview:ref('SiteBackupPreview')})),
  SiteBackupApplyEnvelope: envelope(obj({sourceSiteId:str,siteId:str,jobId:str,state:{const:'draft'},cleanupPending:{type:'boolean'},completionWarnings:strings,counts,concurrencyBoundary:boundary})),
  SiteBackupJob: obj({id:str,targetSiteId:str,state:{enum:['pending','committed','settled']},remainingFiles:number,files:number,bytes:number,createdAt:str}),
  SiteBackupJobsEnvelope: envelope(obj({siteId:str,jobs:{type:'array',items:ref('SiteBackupJob')}})),
  SiteBackupRetryEnvelope: envelope(obj({siteId:str,jobId:str,status:{enum:['pending','settled']},remainingFiles:number,deletedFiles:number,protectedFiles:number})),
  SiteBackupErrorEnvelope: obj({success:{const:false},requestId:str,error:obj({code:str,message:str,jobId:str},['code','message'])}),
};
export function siteBackupPaths(siteId:string) {
 const base=`/api/admin/sites/${siteId}/backup`;
 const response=(description:string,schema:string)=>({description,content:{'application/json':{schema:ref(schema)}}});
 const failures=Object.fromEntries(Object.entries({'402': 'BILLING_SITE_LIMIT: configured site quota reached before restore commit; pending job remains recoverable', '400':'Invalid archive/reference/request; no fallback restore','401':'Operator credentials required','403':'Owner/admin selected-site permission denied','404':'Site or scoped job unavailable','409':'Exact reviewed preview required or new draft slug conflicts; review again','413':'Bounded archive/rows/files/quota exceeded','415':'JSON request required','422':'Media safety policy rejected','503':'Storage/database completion unavailable; inspect optional safe error.jobId before retry'}).map(([status,description])=>[status,response(description,'SiteBackupErrorEnvelope')]));
 const auth={security:[{BackyAdminSession:[]},{BackyAdminSessionHeader:[]},{BackyAdminKey:[]}],'x-backy-permission':'sites.configure','x-backy-roles':['owner','admin'],'x-backy-cache-control':'private, no-store'};
 const description='Private whole-site recovery includes authored records and managed original/variant/history/attachment bytes. Export requires a complete bounded snapshot. Restore creates a NEW draft site; existing source is unchanged. Reviewed resets disable publication, forms, visitor access, domain/provider bindings and component execution. External links retain no remote bytes. Operator/team/session credentials and operational queues are excluded. PostgreSQL snapshot/commit admission and single-process demo guarantees differ. Uncertain writes retain pending quota/jobs. Never automatically replay uncertain apply; inspect staging jobs and retry server-controlled cleanup.';
 return {
 [base]:{get:{...auth,operationId:'exportAdminSiteBackup',tags:['Site Recovery'],summary:'Download private complete bounded site package',description,responses:{'200':response('Private package and limits','SiteBackupExportEnvelope'),...failures}}},
 [`${base}/restore`]:{post:{...auth,'x-backy-additional-permissions':['sites.create'],operationId:'previewOrApplyAdminSiteBackup',tags:['Site Recovery'],summary:'Review private package or restore exact reviewed new draft',description,requestBody:{required:true,content:{'application/json':{schema:ref('SiteBackupRestoreRequest')}}},responses:{'200':response('No-write reviewed preview','SiteBackupPreviewEnvelope'),'201':response('Fresh draft committed, including safe follow-up warnings','SiteBackupApplyEnvelope'),...failures}}},
 [`${base}/restore-jobs`]:{get:{...auth,operationId:'listAdminSiteBackupJobs',tags:['Site Recovery'],summary:'Inspect private restore job summaries without paths or bytes',responses:{'200':response('Scoped sanitized jobs','SiteBackupJobsEnvelope'),...failures}}},
 [`${base}/restore-jobs/{jobId}/retry`]:{post:{...auth,operationId:'retryAdminSiteBackupJob',tags:['Site Recovery'],summary:'Retry server-controlled cleanup without deleting committed files',description,parameters:[{name:'jobId',in:'path',required:true,schema:str}],requestBody:{required:true,content:{'application/json':{schema:{type:'object',additionalProperties:false,maxProperties:0}}}},responses:{'200':response('Settled or still-pending cleanup; protected files retained','SiteBackupRetryEnvelope'),...failures}}},
 };
}
