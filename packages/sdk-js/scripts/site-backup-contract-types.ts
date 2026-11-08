import type {BackyClient, SiteBackupPackage, GeneratedBackyOpenApiSiteBackupPreview, GeneratedBackyOpenApiOperationId} from '../src/index';
declare const client:BackyClient;declare const archive:SiteBackupPackage;declare const reviewedPreview:GeneratedBackyOpenApiSiteBackupPreview;
client.previewAdminSiteBackup({archive,name:'Fresh',slug:'fresh'}).then(r=>{const dryRun:true=r.data.dryRun;void dryRun;});
client.applyAdminSiteBackup({archive,name:'Fresh',slug:'fresh',reviewedPreview,confirmPrivateData:true,confirmSafetyResets:true}).then(r=>{const state:'draft'=r.data.state;const warnings:string[]=r.data.completionWarnings;void[state,warnings];});
// @ts-expect-error Restore requires exact reviewed preview and both acknowledgements.
client.applyAdminSiteBackup({archive,name:'Fresh',slug:'fresh'});
// @ts-expect-error Cleanup accepts a job identity, never client-supplied storage paths.
client.retryAdminSiteBackupJob({paths:['private/path']});
const operations:GeneratedBackyOpenApiOperationId[]=['exportAdminSiteBackup','previewOrApplyAdminSiteBackup','listAdminSiteBackupJobs','retryAdminSiteBackupJob'];void operations;
