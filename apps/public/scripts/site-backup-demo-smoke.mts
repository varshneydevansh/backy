import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),cwd=process.cwd(),root=mkdtempSync('/tmp/backy-site-backup-demo-');
process.chdir(root);process.env.BACKY_DATA_MODE='demo';process.env.NODE_ENV='test';delete process.env.VERCEL;process.env.BACKY_STORAGE_PROVIDER='local';process.env.BACKY_LOCAL_UPLOADS_DIR=join(root,'uploads');process.env.BACKY_FORM_ATTACHMENTS_PRIVATE_DIR=join(root,'private');process.env.BACKY_MEDIA_SCAN_PROVIDER='none';
const unwrap=(module:any)=>module.default||module;
try{
 const store=unwrap(await import('../src/lib/backyStore.ts')),helpers=unwrap(await import('../src/lib/siteBackup.ts')),storageModule=unwrap(await import('../src/lib/mediaStorage.ts'));
 const source=store.createAdminSite({id:'backup-source-demo',teamId:'team-demo',name:'Source',slug:'backup-source-demo',status:'published',isPublished:true}),other=store.createAdminSite({id:'backup-foreign-demo',name:'Other',slug:'backup-foreign-demo'});
 let page:any;for(let i=0;i<103;i++)page=store.createAdminPage(source.id,{title:'Page '+i,slug:'page-'+i,status:'published',content:{elements:[{id:'kept-element-'+i,type:'text',props:{content:'Retained '+i,unknown:{tokenCount:i,password:'authored-private'}},dataBindings:{unknown:{retained:true}}}],canvasSize:{width:1200,height:900,futureGeometry:'kept'},metadata:{futureExtension:{kept:true}}}});
 store.createAdminPage(other.id,{title:'Other-site sentinel',slug:'foreign',content:{elements:[]}});
 const form=store.createAdminForm({siteId:source.id,name:'Private inbox',title:'Private inbox',isActive:true,fields:[{key:'email',type:'email',label:'Email'},{key:'message',type:'textarea',label:'Message'}],contactShare:{enabled:false}});
 store.createFormSubmission({siteId:source.id,formId:form.id,values:{email:'private@example.invalid',message:'Private retained submission',extension:{password:'authored-value'}},status:'pending'});
 const storage=await storageModule.getMediaStorageAdapter(),path=`sites/${source.id}/original.txt`,uploaded=await storage.upload(Buffer.from('owned actual bytes'),{path,filename:'original.txt',mimeType:'text/plain'});
 store.createMediaItem(source.id,{filename:'original.txt',originalName:'original.txt',mimeType:'text/plain',sizeBytes:18,type:'document',url:uploaded.url,pageIds:[page.id],metadata:{storagePath:path,storageProvider:'local',unknown:{kept:true}}});
 const repo=helpers.demoSiteBackupRepository(),archive=await helpers.exportSiteBackup(repo,source.id),review=await helpers.previewSiteBackup(archive,{name:'Recovered draft',slug:'recovered-draft',teamId:source.teamId},null),result=await helpers.applySiteBackup(repo,archive,review,null,null),reopened=store.captureDemoSiteBackup(result.siteId);
 assert.equal(archive.graph.tables.pages.length,103);assert.equal(reopened.tables.pages.length,103);assert.equal(reopened.tables.formSubmissions.length,1);assert.equal(reopened.tables.formSubmissions[0].values.message,'Private retained submission');assert.equal(reopened.tables.formDefinitions[0].isActive,false);assert.equal(reopened.tables.pages[0].status,'draft');assert.equal(reopened.tables.pages[0].content.canvasSize.futureGeometry,'kept');assert.equal(reopened.tables.pages[0].content.elements[0].props.unknown.password,'authored-private');assert.equal((await storage.read(reopened.tables.media[0].metadata.storagePath)).toString(),'owned actual bytes');assert.equal(store.captureDemoSiteBackup(source.id).tables.pages.length,103);assert.equal(store.captureDemoSiteBackup(other.id).tables.pages.length,1);
 const modulePath=new URL('../src/lib/backyStore.ts',import.meta.url).href;
 const child=`import assert from 'node:assert/strict';const imported=await import(${JSON.stringify(modulePath)}),store=imported.default||imported;const graph=store.captureDemoSiteBackup(${JSON.stringify(result.siteId)});assert.equal(graph.tables.pages.length,103);assert.equal(graph.tables.formSubmissions[0].values.message,'Private retained submission');assert.equal(graph.tables.pages[0].content.canvasSize.futureGeometry,'kept');assert.equal(graph.tables.media.length,1);console.log('reopen PASS');`;
 const runner=require.resolve('tsx/cli');execFileSync(process.execPath,[runner,'--tsconfig',new URL('../tsconfig.forms-browser-fixture.json',import.meta.url).pathname,'-e',child.replace(/await import/g,'await import')],{cwd:root,env:process.env,stdio:'pipe'});
 console.log('PASS 12 actual demo-store save/complete103/private-records/local-byte/new-ID restore/reopen checks; single-process demo, static scanner, no providers.');
}finally{process.chdir(cwd);rmSync(root,{recursive:true,force:true});}
