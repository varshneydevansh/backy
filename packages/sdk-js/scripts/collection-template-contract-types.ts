import type { BackyClient, GeneratedBackyOpenApiCollectionDesignVersionsEnvelope, GeneratedBackyOpenApiCollectionDesignRestoreEnvelope, GeneratedBackyOpenApiAdminCollectionPatchRequest, GeneratedBackyOpenApiOperationId } from '../src/index';
import type { GeneratedBackyOpenApiTemplateInstanceRequest as GeneratedRequest } from '../src/generated-contract-types';
declare const client: BackyClient;
const input = {targetType:'collection' as const, targetRevisionId:'revision', selection:[{type:'collection' as const,id:'collection'}]};
client.reviewAdminTemplateInstances('template',input);
client.applyAdminTemplateInstances('template',{...input,reviewVersion:'template-collection-instances-v1:hash'});
// @ts-expect-error Collection requests require their explicit permission discriminator.
client.reviewAdminTemplateInstances('template',{targetRevisionId:'revision',selection:[{type:'collection',id:'collection'}]});
// @ts-expect-error Collection definitions cannot be mixed with record/product targets.
client.reviewAdminTemplateInstances('template',{targetType:'collection',targetRevisionId:'revision',selection:[{type:'product',id:'product',collectionId:'collection'}]});
// @ts-expect-error Apply requires the exact reviewed version.
client.applyAdminTemplateInstances('template',input);
const generated:GeneratedRequest={...input,action:'review'};
// @ts-expect-error Generated discriminated requests reject collection/page mixing.
const mixed:GeneratedRequest={targetType:'collection',targetRevisionId:'revision',action:'review',selection:[{type:'page',id:'page'}]};
// @ts-expect-error Generated collection apply requires its reviewVersion.
const noToken:GeneratedRequest={...input,action:'apply'};
client.listAdminCollectionDesignVersions('collection',{offset:100,limit:100});
client.restoreAdminCollectionDesignVersion('collection','revision',{expectedVersion:'collection-v1:hash'});
// @ts-expect-error Recovery requires optimistic admission.
client.restoreAdminCollectionDesignVersion('collection','revision',{});
client.updateAdminCollection('collection',{name:'Edited',expectedVersion:'collection-v1:hash'});
// @ts-expect-error Definition token is a string, not a timestamp or number.
client.updateAdminCollection('collection',{expectedVersion:42});
const patch:GeneratedBackyOpenApiAdminCollectionPatchRequest={expectedVersion:'collection-v1:hash'};
// @ts-expect-error Generated definition token is a string.
const badPatch:GeneratedBackyOpenApiAdminCollectionPatchRequest={expectedVersion:42};
declare const history:GeneratedBackyOpenApiCollectionDesignVersionsEnvelope;
const version:string=history.data.currentVersion, next:number|null=history.data.pagination.nextOffset;
declare const restored:GeneratedBackyOpenApiCollectionDesignRestoreEnvelope;
const restoredVersion:string=restored.data.collection.version, warnings:string[]=restored.data.completionWarnings;
const operation:GeneratedBackyOpenApiOperationId='restoreAdminCollectionDesignVersion';
void [generated,patch,version,next,restoredVersion,warnings,operation];

import type { GeneratedBackyOpenApiReusableSection, GeneratedBackyOpenApiCollectionSchema, GeneratedBackyOpenApiCollectionRecord } from '../src/generated-contract-types';
const publicSection:GeneratedBackyOpenApiReusableSection={id:'section',name:'Current',slug:'current',content:{elements:[]},metadata:{reusableSection:{group:'Public group'}}};
// @ts-expect-error Public section actor IDs are intentionally omitted.
const leakedActor:GeneratedBackyOpenApiReusableSection={id:'section',name:'Current',slug:'current',content:{elements:[]},createdBy:'actor'};
// @ts-expect-error Public section metadata cannot expose private retained history.
const leakedHistory:GeneratedBackyOpenApiReusableSection={id:'section',name:'Current',slug:'current',content:{elements:[]},metadata:{reusableSection:{history:[]}}};
// @ts-expect-error Public collection metadata cannot expose the retained template baseline.
const leakedCollection:GeneratedBackyOpenApiCollectionSchema={id:'collection',name:'Current',slug:'current',fields:[],permissions:{publicRead:true,publicCreate:false},metadata:{frontendTemplateInstance:{baseline:{}}}};
// @ts-expect-error Public product/record values cannot expose the retained template baseline.
const leakedRecord:GeneratedBackyOpenApiCollectionRecord={id:'record',slug:'record',values:{frontendTemplateInstance:{baseline:{}}}};
void publicSection;

import type { GeneratedBackyOpenApiPublicPageResource, GeneratedBackyOpenApiPublicBlogPostResource } from '../src/index';
import type { GeneratedBackyOpenApiPageResource } from '../src/generated-contract-types';
const publicPage:GeneratedBackyOpenApiPublicPageResource={id:'page',title:'Current',slug:'current',meta:{expectedVersion:'ordinary-authored'},content:{elements:[]}};
// @ts-expect-error Public page reads omit the managed immutable template baseline.
const leakedPage:GeneratedBackyOpenApiPublicPageResource={id:'page',title:'Current',slug:'current',meta:{frontendTemplateInstance:{baselineContent:{}}}};
// @ts-expect-error Public blog reads omit the managed immutable template baseline.
const leakedPost:GeneratedBackyOpenApiPublicBlogPostResource={id:'post',title:'Current',slug:'current',meta:{frontendTemplateInstance:{baselineContent:{}}}};
const authenticatedSnapshot:GeneratedBackyOpenApiPageResource={id:'page',title:'Current',slug:'current',meta:{frontendTemplateInstance:{baselineContent:{}}}};
void [publicPage,authenticatedSnapshot];
