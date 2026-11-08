/** Verify private fixture observations; this performs no browser/API/database writes. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import * as collectionDesignModule from '../../../packages/core/src/collection-design.ts';
const {canonicalCollectionTemplateDesign,collectionFieldSemanticSchema}=((collectionDesignModule as any).default||collectionDesignModule);
const file='/tmp/backy-collection-design-browser-evidence.json',evidence=JSON.parse(readFileSync(file,'utf8'));
let checks=0;function same(actual:unknown,expected:unknown){assert.deepEqual(actual,expected);checks++;}
function stage(name:string){const found=evidence.checkpoints.filter((item:any)=>item.name===name).at(-1);assert(found,`Missing ${name} browser checkpoint`);return found;}
const created=stage('created'),authored=stage('authored'),upgraded=stage('upgraded'),restored=stage('restored');
function definition(state:any){assert.equal(state.collections.length,1,'Only owned accepted collection may be present');return state.collections[0];}
const first=definition(created),before=definition(authored),after=definition(upgraded),recovered=definition(restored),collectionId=before.id;
same(first.metadata.frontendTemplateInstance.instanceType,'collection');same(first.metadata.frontendTemplateInstance.templateVersion,1);
same(first.metadata.frontendDesignElements[0].width,640);same(first.metadata.frontendDesignElements[0].responsive.mobile.width,280);
same(before.fields.find((field:any)=>field.key==='title').label,'Owner title');
same(before.metadata.dynamicTemplates.list.authoredCanvas.elements[0].width,660);same(before.metadata.dynamicTemplates.list.authoredCanvas.elements[0].children[0].x,44);
same(before.metadata.dynamicTemplates.list.authoredCanvas.unknownCanvasAlias,[false,0,null]);
same(after.metadata.frontendDesignElements[0].width,720);same(after.metadata.frontendDesignElements[0].responsive.mobile.width,280);same(after.metadata.frontendTemplateInstance.templateVersion,2);
same(first.metadata.frontendDesignMetadata.ownerExtension,[false,0,null]);same(after.metadata.frontendDesignMetadata,before.metadata.frontendDesignMetadata);same(recovered.metadata.frontendDesignMetadata,before.metadata.frontendDesignMetadata);
same(after.fields,before.fields);same(collectionFieldSemanticSchema(after.fields),collectionFieldSemanticSchema(before.fields));
function operational(collection:any){const {fields,metadata,updatedAt,version,...rest}=collection;return {...rest,metadata:Object.fromEntries(Object.entries(metadata||{}).filter(([key])=>!key.startsWith('frontendDesign')&&key!=='frontendTemplateInstance')),fieldSchema:collectionFieldSemanticSchema(fields)};}
same(operational(after),operational(before));same(operational(recovered),operational(before));
const rows=(state:any)=>state.records.find((item:any)=>item.collectionId===collectionId);
same(rows(authored).records.length,1);
same(rows(upgraded).records,rows(authored).records);same(rows(restored).records,rows(authored).records);
same(rows(upgraded).history.length,1);same(rows(restored).history.length,2);
const preUpgrade=rows(restored).history.find((item:any)=>item.operation==='template-upgrade');assert(preUpgrade);
same(canonicalCollectionTemplateDesign(recovered),preUpgrade.snapshot.design);same(recovered.metadata.frontendTemplateInstance,preUpgrade.snapshot.pin);
same(recovered.metadata.frontendDesignElements[0].width,640);same(recovered.metadata.frontendTemplateInstance.templateVersion,1);
same(recovered.metadata.dynamicTemplates.list,before.metadata.dynamicTemplates.list);
const apply=evidence.events.filter((event:any)=>event.path.endsWith('/instances')&&event.body?.action==='apply');same(apply.length,1);same(apply[0].status,200);same(apply[0].response.data.appliedTargets,[{type:'collection',id:collectionId}]);
const restore=evidence.events.filter((event:any)=>event.path.includes('/design-versions/')&&event.path.endsWith('/restore'));same(restore.length,1);same(restore[0].status,200);
const dirty=stage('dirty-denial');same(definition(dirty),recovered);same(rows(dirty).records,rows(restored).records);same(rows(dirty).history,rows(restored).history);
const proof={ok:true,assertions:checks,boundary:evidence.boundary,collectionId,ordinaryCreatePinnedV1:true,ownerLabelAndCapturedLayoutRetained:true,semanticSchemaRulesAndCompleteRecordsEqual:true,appliedV2:true,privateBeforeImageRetained:true,restoreFullDesignAndPinEqual:true,restoredV1:true,dirtyStateNoCommittedChanges:true,browserControlsAndColdReopen:'separately observed through CUA',production:false,nativeSql:false};
writeFileSync('/tmp/backy-collection-design-browser-proof.json',JSON.stringify(proof,null,2),{mode:0o600});console.log(JSON.stringify({ok:true,assertions:checks,boundary:proof.boundary}));
