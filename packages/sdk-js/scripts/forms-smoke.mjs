import assert from 'node:assert/strict';
import {createBackyClient,BackyApiError,BackyFormContactSyncDeliveryError} from '../dist/index.js';
const calls=[];let status=200,payload={success:true,requestId:'fixture',data:{}};
const client=createBackyClient({baseUrl:'https://fixture.invalid',siteId:'site/a',fetch:async(input,init)=>{calls.push({url:new URL(input),init});return Response.json(payload,{status})}});
const options={adminSession:'synthetic-fixture',requestId:'header-id',credentials:'include'};
const cases=[
['adminForms',[{...options,pageId:'page/a',postId:'post/a'}],'GET',''],
['createAdminForm',[{name:'Editable',fields:[{key:'email',type:'email',label:'Email'}],settings:{extension:{keep:[false,0]}},requestId:'body-id'},options],'POST',''],
['adminForm',['form/a',options],'GET','/form%2Fa'],
['updateAdminForm',['form/a',{consentSettings:{deleteAfterDays:30}},options],'PATCH','/form%2Fa'],
['cloneAdminForm',['form/a',{name:'Copy'},options],'POST','/form%2Fa/clone'],
['createAdminFormEmbedBlock',['form/a',{},options],'POST','/form%2Fa/embed-block'],
['formsAnalytics',[{...options,days:90}],'GET','/analytics'],
['formContactSegments',[{...options,formId:'form/a'}],'GET','/contact-segments'],
['formContactLists',[options],'GET','/contact-lists'],
['saveFormContactList',[{name:'Qualified',filters:{status:'qualified'}},options],'POST','/contact-lists'],
['deleteFormContactList',[{listId:'list/a'},options],'DELETE','/contact-lists'],
['formSubmissions',['form/a',{...options,submissionRequestId:'submission-id',status:'pending',limit:20,offset:40}],'GET','/form%2Fa/submissions'],
['formSubmission',['form/a','submission/a',options],'GET','/form%2Fa/submissions/submission%2Fa'],
['updateFormSubmission',['form/a','submission/a',{status:'approved',adminNotes:'Review'},options],'PATCH','/form%2Fa/submissions/submission%2Fa'],
['reviewFormSubmission',['form/a','submission/a',{status:'rejected',contactShareOverride:{enabled:false}},options],'POST','/form%2Fa/submissions/submission%2Fa/review'],
['retryFormSubmissionEmail',['form/a','submission/a',{},options],'POST','/form%2Fa/submissions/submission%2Fa/email-retry'],
['retryFormSubmissionWebhook',['form/a','submission/a',{},options],'POST','/form%2Fa/submissions/submission%2Fa/webhook-retry'],
['applyAdminFormsConsentRetention',[{dryRun:true},options],'POST','/consent-retention'],
['applyAdminFormConsentRetention',['form/a',{dryRun:true,now:'2026-01-01T00:00:00Z'},options],'POST','/form%2Fa/consent-retention'],
['formContacts',['form/a',{...options,contactRequestId:'contact-id',newsletterOnly:true,status:'qualified',offset:20}],'GET','/form%2Fa/contacts'],
['createFormContact',['form/a',{email:'visitor@example.test',sourceValues:{extension:{original:true}}},options],'POST','/form%2Fa/contacts'],
['updateFormContact',['form/a','contact/a',{notes:'Follow up',newsletterConsent:true},options],'PATCH','/form%2Fa/contacts/contact%2Fa'],
['deleteFormContact',['form/a','contact/a',options],'DELETE','/form%2Fa/contacts/contact%2Fa'],
['importFormContactsCsv',['form/a','email,name\na@example.test,A\n',{...options,upsertByEmail:true}],'POST','/form%2Fa/contacts/import'],
['syncFormContacts',['form/a',{contactIds:['contact/a'],targetUrl:'https://receiver.invalid/hook',includeSourceValues:true},options],'POST','/form%2Fa/contacts/sync'],
['applyFormContactConsentRetention',['form/a',{dryRun:true,contactIds:['contact/a'],retentionDays:30},options],'POST','/form%2Fa/contacts/consent-retention'],
['promoteFormContactToUser',['form/a','contact/a',{role:'viewer',status:'invited',createInvite:true},options],'POST','/form%2Fa/contacts/contact%2Fa/promote'],
['promoteFormContactToCustomer',['form/a','contact/a',{customerStatus:'lead'},options],'POST','/form%2Fa/contacts/contact%2Fa/promote-customer']];
for(const [method,args,verb,path]of cases){await client[method](...args);const c=calls.at(-1);assert.equal(c.init.method,verb);assert.equal(c.url.pathname,'/api/admin/sites/site%2Fa/forms'+path);assert.equal(c.init.headers.get('x-backy-admin-session'),options.adminSession);assert.equal(c.init.headers.get('x-request-id'),options.requestId);assert.equal(c.init.headers.get('x-backy-admin-key'),null);assert.equal(c.init.credentials,'include');}
assert.equal(calls[11].url.searchParams.get('requestId'),'submission-id');assert.equal(calls[19].url.searchParams.get('requestId'),'contact-id');assert.equal(calls[19].url.searchParams.get('newsletterOnly'),'true');assert.equal(calls[23].init.headers.get('content-type'),'text/csv; charset=utf-8');assert.equal(calls[23].url.searchParams.get('upsertByEmail'),'true');assert.equal(calls[23].init.body,'email,name\na@example.test,A\n');assert.deepEqual(JSON.parse(calls[1].init.body).settings,{extension:{keep:[false,0]}});
payload={success:true,requestId:'fixture',data:{delivery:{attempted:true,status:'failed',error:'Provider rejected'},submission:{id:'sub',siteId:'site/a',formId:'form/a',status:'pending',values:{email:'original@example.test'},submittedAt:'2026-01-01T00:00:00Z'}}};const failed=await client.retryFormSubmissionEmail('form/a','sub',{},options);assert.equal(failed.data.delivery.status,'failed');assert.equal(failed.data.submission.values.email,'original@example.test');
status=502;payload={success:true,requestId:'fixture',data:{formId:'form/a',delivery:{target:'https://receiver.invalid/hook',status:'failed',statusCode:500,error:'Receiver failed',count:1,contactIds:['contact/a']}}};await assert.rejects(client.syncFormContacts('form/a',{contactIds:['contact/a'],targetUrl:'https://receiver.invalid/hook'},options),e=>e instanceof BackyFormContactSyncDeliveryError&&e.status===502&&e.response.data.delivery.contactIds[0]==='contact/a');assert.equal(calls.length,30,'Failed delivery is sent once');
status=503;payload={success:false,requestId:'fixture',error:{code:'FORMS_INVENTORY_INCOMPLETE',message:'Retry'}};await assert.rejects(client.adminForms(options),e=>e instanceof BackyApiError&&e.code==='FORMS_INVENTORY_INCOMPLETE');assert.equal(calls.length,31,'Incomplete read has no automatic retry');
console.log('Forms SDK transport passed:28 methods, encoded identities, private session/cookies, request correlation/filter separation, CSV, original values, attempted-failed200 and typed502 delivery failure,503 no retries. Mock transport only.');
