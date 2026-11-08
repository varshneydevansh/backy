import {BackyClient} from '../src/index';
declare const client:BackyClient;
const selection=[{type:'page' as const,id:'page'}];
client.reviewAdminTemplateInstances('template',{targetRevisionId:'revision',selection});
client.applyAdminTemplateInstances('template',{targetRevisionId:'revision',selection,reviewVersion:'review'});
// @ts-expect-error Applying requires the exact review version.
client.applyAdminTemplateInstances('template',{targetRevisionId:'revision',selection});
client.reviewAdminTemplateInstances('template',{targetRevisionId:'revision',selection:[{type:'section',id:'section'}]});
client.applyAdminTemplateInstances('template',{targetRevisionId:'revision',selection:[{type:'section',id:'section'}],reviewVersion:'review'});
client.reviewAdminTemplateInstances('template',{targetType:'product',targetRevisionId:'revision',selection:[{type:'product',id:'product',collectionId:'catalog'}]});
client.applyAdminTemplateInstances('template',{targetType:'product',targetRevisionId:'revision',selection:[{type:'product',id:'product',collectionId:'catalog'}],reviewVersion:'review'});
// @ts-expect-error Product requests explicitly select their permission boundary.
client.reviewAdminTemplateInstances('template',{targetRevisionId:'revision',selection:[{type:'product',id:'product',collectionId:'catalog'}]});
// @ts-expect-error Product impact cannot mix unrelated page instances.
client.reviewAdminTemplateInstances('template',{targetType:'product',targetRevisionId:'revision',selection:[{type:'page',id:'page'}]});
// @ts-expect-error Form requests explicitly select their permission boundary.
client.reviewAdminTemplateInstances('template',{targetRevisionId:'revision',selection:[{type:'form',id:'form'}]});
client.listAdminProductDesignVersions('product',{offset:100,limit:100});
client.restoreAdminProductDesignVersion('product','revision',{expectedVersion:'record-v1:hash'});
// @ts-expect-error Design restore requires the current product version.
client.restoreAdminProductDesignVersion('product','revision',{});

client.reviewAdminTemplateInstances('template',{targetType:'form',targetRevisionId:'revision',selection:[{type:'form',id:'form'}]});
client.applyAdminTemplateInstances('template',{targetType:'form',targetRevisionId:'revision',selection:[{type:'form',id:'form'}],reviewVersion:'template-form-instances-v1:hash'});
// @ts-expect-error Form impact cannot mix a page selection.
client.reviewAdminTemplateInstances('template',{targetType:'form',targetRevisionId:'revision',selection:[{type:'page',id:'page'}]});
// @ts-expect-error Unknown template target definitions remain unsupported.
client.reviewAdminTemplateInstances('template',{targetType:'unknown',targetRevisionId:'revision',selection:[{type:'unknown',id:'unknown'}]});
client.listAdminFormDesignVersions('form',{offset:100,limit:100});
const restoreForm=client.restoreAdminFormDesignVersion('form','revision',{expectedVersion:'form-v1:hash'});
restoreForm.then(result=>{const version:string=result.data.form.version;const warnings:string[]=result.data.completionWarnings;void version;void warnings;});
// @ts-expect-error Form restore requires the current form definition version.
client.restoreAdminFormDesignVersion('form','revision',{});

import type { GeneratedBackyOpenApiTemplateInstanceRequest, GeneratedBackyOpenApiFormDesignVersionsEnvelope, GeneratedBackyOpenApiCustomFrontendAgentHandoff } from '../src/generated-contract-types';
const generatedFormRequest:GeneratedBackyOpenApiTemplateInstanceRequest={targetType:'form',action:'review',targetRevisionId:'revision',selection:[{type:'form',id:'form'}]};
// @ts-expect-error Generated form apply contract requires a review version.
const generatedFormApply:GeneratedBackyOpenApiTemplateInstanceRequest={targetType:'form',action:'apply',targetRevisionId:'revision',selection:[{type:'form',id:'form'}]};
// @ts-expect-error Generated form request requires its explicit discriminator.
const generatedImplicitForm:GeneratedBackyOpenApiTemplateInstanceRequest={action:'review',targetRevisionId:'revision',selection:[{type:'form',id:'form'}]};
// @ts-expect-error Generated form request cannot select page instances.
const generatedMixedForm:GeneratedBackyOpenApiTemplateInstanceRequest={targetType:'form',action:'review',targetRevisionId:'revision',selection:[{type:'page',id:'page'}]};
declare const generatedHistory:GeneratedBackyOpenApiFormDesignVersionsEnvelope;
const continuation:number|null=generatedHistory.data.pagination.nextOffset;
const pinned:boolean=generatedHistory.data.revisions[0].hasPinnedBaseline;
declare const generatedHandoff:GeneratedBackyOpenApiCustomFrontendAgentHandoff;
const formRecovery=generatedHandoff.templateInstanceUpgrades?.formRecovery;
void [generatedFormRequest,continuation,pinned,formRecovery];
