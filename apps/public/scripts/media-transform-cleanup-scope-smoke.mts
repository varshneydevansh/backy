import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { File } from 'node:buffer';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest } from 'next/server';

const require = createRequire(import.meta.url);
function load(relative: string, mocks: Record<string, any>, fixtureProcess: any = process) {
  const filename = fileURLToPath(new URL(relative, import.meta.url)), compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, module = { exports: {} as any };
  vm.runInNewContext(compiled, { module, exports: module.exports, Request, Response, Headers, URL, URLSearchParams, Buffer, File, FormData, process: fixtureProcess, console: { error() {} }, require: (id: string) => id in mocks ? mocks[id] : id.startsWith('@/') ? (() => { throw Error('Missing fixture dependency ' + id); })() : require(id) }, { filename }); return module.exports;
}
const responsive=load('../src/lib/mediaResponsive.ts',{});
const transforms=load('../src/lib/mediaTransformGeneration.ts',{'@/lib/mediaResponsive':responsive,'@/lib/mediaStorage':{}});
const deleted:string[]=[];
const storage:any={delete:async(path:string)=>{deleted.push(path);}};
const metadata=(paths:string[])=>({generatedTransforms:{variants:paths.map(storagePath=>({storagePath,bytes:10}))}});
const own='sites/site-a/generated/media/image-a/batch/320.webp';
const scope={siteId:'site-a',mediaId:'image-a'};
await transforms.deleteGeneratedTransformFiles(metadata([own,'sites/site-b/generated/media/image-b/batch/320.webp']),storage,scope);
assert.deepEqual(deleted,[],'A mixed forged cleanup manifest must not delete any files');
await transforms.deleteGeneratedTransformFiles(metadata([own+'/../../../../../site-b/file.webp']),storage,scope);assert.deepEqual(deleted,[]);
await transforms.deleteGeneratedTransformFiles(metadata([own]),storage);assert.deepEqual(deleted,[],'Missing trusted scope must fail closed');
const good=await transforms.deleteGeneratedTransformFiles(metadata([own,own]),storage,scope);assert.deepEqual(deleted,[own]);assert.equal(good.status,'complete');
const failed=await transforms.deleteGeneratedTransformFiles(metadata([own]),{delete:async()=>{throw Error('private provider error');}} as any,scope);assert.equal(failed.status,'pending');assert.equal(JSON.stringify(failed).includes('private provider error'),false);
console.log('Actual generated-file cleanup scope PASS: foreign/mixed/traversal/missing scope no-write, deduplicated owned cleanup, provider failures retained as sanitized pending outcomes.');

const sharp=require('sharp');
const source=await sharp({create:{width:1024,height:2,channels:3,background:'#eeeeee'}}).png().toBuffer();
const partialDeleted:string[]=[];let uploads=0;let firstPath='';
const partialStorage:any={provider:'fixture',read:async()=>source,upload:async(bytes:Buffer,options:any)=>{uploads++;if(uploads===2)throw Error('private provider failure');firstPath=options.path;return{path:options.path,size:bytes.length};},delete:async(path:string)=>partialDeleted.push(path)};
const partialTransforms=load('../src/lib/mediaTransformGeneration.ts',{'@/lib/mediaResponsive':responsive,'@/lib/mediaStorage':{getMediaStorageAdapter:async()=>partialStorage,getMediaStoragePathFromMedia:()=> 'sites/site-a/original.png'}});
await assert.rejects(partialTransforms.generateImageTransformManifest({siteId:'site-a',media:{id:'image-a'},widths:[320,640],quality:80,sizes:'100vw',preparedAt:'2026-10-05T00:00:00.000Z',preparedBy:'fixture'}));
assert.deepEqual(partialDeleted,[firstPath],'A failed second variant must clean the already uploaded first variant');

console.log('Actual Sharp multi-variant generation abort cleans already uploaded variants after a later upload fails; uncertain failed-upload writes still need provider recovery.');
uploads=0;partialStorage.delete=async()=>{throw Error('private delete error');};
await assert.rejects(partialTransforms.generateImageTransformManifest({siteId:'site-a',media:{id:'image-a'},widths:[320,640],quality:80,sizes:'100vw',preparedAt:'2026-10-05T00:00:00.000Z',preparedBy:'fixture'}),(error:any)=>{assert.equal(error.code,'MEDIA_TRANSFORM_GENERATION_FAILED');assert.deepEqual(JSON.parse(JSON.stringify(error.details.storageCleanup)),{status:'pending',deletedFiles:0,remainingFiles:1});assert.ok(!JSON.stringify(error.details).includes('private'));return true;});
