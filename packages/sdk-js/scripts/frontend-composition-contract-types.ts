import type { BackyClient, GeneratedBackyOpenApiOperationId, FrontendCompositionImport } from '../src/index';
declare const client: BackyClient;
const composition: FrontendCompositionImport = {schemaVersion:'backy.frontend-composition-import.v1',routes:[]};
const input = {composition,selection:['design'],acknowledgeUnverified:false};
client.reviewAdminFrontendComposition(input).then(response => { const issues = response.data.issues; const token: string = response.data.reviewVersion; void [issues,token]; });
client.applyAdminFrontendComposition({...input,reviewVersion:'review'}).then(response => {const status:'draft-only' = response.data.publication;void status;});
// @ts-expect-error An apply must provide the exact reviewed revision.
client.applyAdminFrontendComposition(input);
const operation: GeneratedBackyOpenApiOperationId = 'reviewOrApplyAdminFrontendComposition';void operation;
