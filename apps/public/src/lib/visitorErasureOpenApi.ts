/** Additive standard schema/path producer for the explicit local erasure subset. */
const retained=['provider-subject-tombstone','other-websites','private-attachment-bytes-and-references','ambiguous-or-retained-contacts','collection-copies','historical-audit-and-delivery-evidence','newsletter-consent-and-delivery-snapshots','downstream-provider-copies'];
const countFields=['comments','submissions','exclusiveContacts','ambiguousContacts','retainedAttachments','commentDeliveryAttempts','formDeliveryAttempts','newsletterSnapshots'];
const ref=(name:string)=>({$ref:'#/components/schemas/'+name});
const object=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',additionalProperties:false,required,properties});
const choices=object({comments:{type:'string',enum:['redact','retain']},submissions:{type:'string',enum:['redact','retain']},exclusiveContacts:{type:'string',enum:['delete','retain']}});
const counts=object(Object.fromEntries(countFields.map(key=>[key,{type:'integer',minimum:0}])));
const boundary=object({profileIdentifiers:{const:'redact'},admission:{const:'remove-and-fence'},providerChanged:{const:false},emailMatchedOwnership:{const:false},downstreamErasure:{const:'unverified'},ambiguousContacts:{const:'retain-and-fence'}});
const common={siteId:{type:'string',format:'uuid'},memberId:{type:'string',format:'uuid'},choices:ref('VisitorErasureChoices'),counts:ref('VisitorErasureCounts'),retainedCategories:{type:'array',items:{type:'string',enum:retained},minItems:retained.length,maxItems:retained.length,uniqueItems:true},boundaries:boundary};
export const visitorErasureOpenApiSchemas={
 VisitorErasureChoices:choices,VisitorErasureCounts:counts,
 VisitorErasurePreviewRequest:object({choices:ref('VisitorErasureChoices')}),
 VisitorErasureConfirmRequest:object({previewId:{type:'string',format:'uuid'},confirmLocalErasure:{const:true}}),
 VisitorErasurePreview:object({...common,schema:{const:'backy.visitor-erasure-preview.v1'},previewId:{type:'string',format:'uuid'},expiresAt:{type:'string',format:'date-time'}}),
 VisitorErasureReceipt:object({...common,schema:{const:'backy.visitor-erasure-receipt.v1'},receiptId:{type:'string',format:'uuid'},completedAt:{type:'string',format:'date-time'},localErasurePerformed:{const:true}}),
 VisitorErasurePreviewEnvelope:object({success:{const:true},requestId:{type:'string'},data:ref('VisitorErasurePreview')}),
 VisitorErasureReceiptEnvelope:object({success:{const:true},requestId:{type:'string'},data:ref('VisitorErasureReceipt')}),
};
export function visitorErasureOpenApiPaths(siteId='{siteId}') {
 const operation=(name:string,input:string,result:string,summary:string)=>({post:{operationId:name,tags:['Visitor privacy'],security:[{BackyAdminSession:[]}],'x-backy-permissions':['users.delete'],'x-backy-owner-only':true,'x-backy-authentication':'owner-cookie-session',summary,description:'Active Owner cookie session with users.delete and current selected-site admission. Explicit bearer/session/key headers refused. Private no-store. No provider, other-site, attachment-byte, collection-copy or downstream erasure. Preview expires in5 minutes; confirmation rechecks exact ownership/content/provenance/delivery snapshot atomically. Retention choices are final; same-preview confirmation retry returns the durable receipt.',parameters:[...(siteId==='{siteId}'?[{name:'siteId',in:'path',required:true,schema:{type:'string'}}]:[]),{name:'memberId',in:'path',required:true,schema:{type:'string',format:'uuid'}}],requestBody:{required:true,content:{'application/json':{schema:ref(input)}}},responses:{'200':{description:'Safe selected-member local retention result',content:{'application/json':{schema:ref(result)}}},'400':{description:'Invalid bounded request'},'401':{description:'Owner cookie session required'},'403':{description:'Owner users.delete / current site authority required'},'404':{description:'Selected-site member unavailable'},'409':{description:'Expired/changed preview or final local policy already completed'},'503':{description:'Persisted provenance/fencing unavailable or busy; reload current state'}}}});
 return {
  [`/api/admin/sites/${siteId}/visitors/members/{memberId}/privacy-erasure/preview`]:operation('previewAdminVisitorErasure','VisitorErasurePreviewRequest','VisitorErasurePreviewEnvelope','Preview explicit local visitor erasure retention choices'),
  [`/api/admin/sites/${siteId}/visitors/members/{memberId}/privacy-erasure/confirm`]:operation('confirmAdminVisitorErasure','VisitorErasureConfirmRequest','VisitorErasureReceiptEnvelope','Confirm a fresh exact-scope local visitor erasure preview'),
 };
}
