import type { BackyClient, GeneratedBackyOpenApiOperationId, FormTemplatePack } from '../src/index';
declare const client: BackyClient;
const pack: FormTemplatePack = {schemaVersion:'backy.form-template-pack.v1',builtInTemplates:[]};
client.reviewAdminFormTemplatePack({pack,selection:[]}).then(response=>{const revision:string=response.data.reviewVersion;void revision;});
client.applyAdminFormTemplatePack({pack,selection:[],reviewVersion:'review'}).then(response=>{const state:'inactive-standalone'=response.data.publication;const warnings:string[]=response.data.completionWarnings;void [state,warnings];});
// @ts-expect-error Apply must carry exact reviewVersion.
client.applyAdminFormTemplatePack({pack,selection:[]});
const operation:GeneratedBackyOpenApiOperationId='reviewOrApplyAdminFormTemplatePack';void operation;
