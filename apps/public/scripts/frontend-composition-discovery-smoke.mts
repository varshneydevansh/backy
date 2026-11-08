import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { NextRequest } from 'next/server';
const coreModule: any = await import('@backy-cms/core');
const { buildCustomFrontendAgentHandoff } = coreModule.default || coreModule;
import { load } from './collection-import-postgres-handlers.mjs';
const responseModule: any = await import('../src/lib/publicContractResponse.ts');
const responseHelper = responseModule.default || responseModule;
const schema = JSON.parse(readFileSync(new URL('../../../specs/ai-frontend-contract/frontend-manifest.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({strict:false,validateFormats:false});
ajv.addSchema(schema);
const validate = ajv.compile({$ref:schema.$id+'#/$defs/customFrontendAgentHandoff'});
const sites = [{id:'site-one',slug:'one',name:'One',isPublished:true},{id:'site-two',slug:'two',name:'Two',isPublished:true},{id:'draft',slug:'draft',name:'Draft',isPublished:false}];
const route = load('../src/app/api/sites/[siteId]/agent-handoff/route.ts', {
  '@/lib/customFrontendAgentHandoff': {buildCustomFrontendAgentHandoff},
  '@/lib/backyStore': {getSiteByIdOrSlug:(id:string)=>sites.find(site=>site.id===id || site.slug===id)},
  '@/lib/publicContractResponse':responseHelper,
  '@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>true,getRequiredDatabaseRepositories:async()=>{throw new Error('Unexpected database path');}},
});
for(const site of sites.filter(site=>site.isPublished)) {
  const result=await route.GET(new NextRequest('http://fixture.invalid/api/sites/'+site.slug+'/agent-handoff'),{params:Promise.resolve({siteId:site.slug})});
  assert.equal(result.status,200);
  const body=await result.json(); const handoff=body.data.handoff;
  assert.equal(validate(handoff),true,JSON.stringify(validate.errors));
  assert.equal(handoff.designState.motionAuthoring.sequenceField, "element.animation.sequence");
  assert.equal(handoff.designState.motionAuthoring.maxSteps, 24);
  assert.deepEqual(handoff.designState.motionAuthoring.stateProperties, ["x", "y", "scale", "rotation", "opacity"]);
  const contract=handoff.contentCreation.compositionImport;
  assert.deepEqual(body.data.contentCreation.compositionImport,contract);
  assert.equal(contract.endpoint,`/api/admin/sites/${site.id}/frontend-design/composition-import`);
  assert.equal(handoff.endpoints.frontendCompositionImport,contract.endpoint);
  assert.equal(contract.review.writes,false); assert.equal(contract.apply.publication,'draft-only');
  assert.equal(contract.apply.requiresExactReviewVersion,true);assert.equal(contract.apply.routePermission,'pages.edit');
  assert.equal(contract.staleReview.status,409);assert.equal(contract.limits.requestBytes,2097152);
  assert(handoff.sdk.helpers.includes('reviewAdminFrontendComposition'));
  assert(handoff.sdk.helpers.includes('applyAdminFrontendComposition'));
  assert(contract.boundary.includes('not React source'));
  const forms = handoff.contentCreation.formTemplatePackImport;
  assert.equal(forms.endpoint, `/api/admin/sites/${site.id}/forms/template-pack/import`);
  assert.equal(forms.endpoint, handoff.endpoints.formTemplatePackImport);
  assert.equal(forms.review.writes, false);
  assert.equal(forms.apply.publication, 'inactive-standalone');
  assert.equal(forms.apply.requiresExactReviewVersion, true);
  assert.equal(forms.limits.fieldsPerForm, 128);
  assert.equal(handoff.endpoints.commentDeliveryAttempts, `/api/sites/${site.id}/comments/delivery-attempts`);
  assert.equal(handoff.endpoints.templateInstances, `/api/admin/sites/${site.id}/templates/{templateId}/instances`);
  assert.equal(handoff.endpoints.formDeliveryAttempts, `/api/admin/sites/${site.id}/forms/{formId}/delivery-attempts`);
  assert.equal(handoff.endpoints.siteBackupRestore, `/api/admin/sites/${site.id}/backup/restore`);
  for (const helper of ['reviewAdminTemplateInstances', 'applyAdminTemplateInstances', 'reviewAdminFormTemplatePack', 'applyAdminFormTemplatePack', 'listCommentDeliveryAttempts', 'listFormDeliveryAttempts', 'retryFormSubmissionWebhook', 'retryFormSubmissionEmail', 'retryCommentDelivery', 'exportAdminSiteBackup', 'applyAdminSiteBackup']) assert(handoff.sdk.helpers.includes(helper));
}
for(const siteId of ['draft','missing']) {
  const result=await route.GET(new NextRequest('http://fixture.invalid/api/sites/'+siteId+'/agent-handoff'),{params:Promise.resolve({siteId})});
  assert.equal(result.status,404);assert.equal(result.headers.get('cache-control'),'no-store');
}
console.log('Composition discovery PASS: actual anonymous handoff route, canonical two-site scope, generated-contract schema, review/apply boundaries and draft/missing denial. Repository identity fixtures; no production claim.');
