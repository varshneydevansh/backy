import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadCollectionDesignVersions, restoreCollectionDesignVersion } from '../src/lib/collectionDesignVersionsClient';
import { reviewOrUpgradeTemplateInstances } from '../src/lib/templateInstancesClient';
import { CollectionDesignHistoryPanel } from '../src/components/collections/CollectionDesignHistoryPanel';
import { TemplateInstancesPanel, templateInstanceEditorHref } from '../src/components/sites/TemplateInstancesPanel';
import type { BackyTemplateRevision } from '@backy-cms/core';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync, buildSync } from 'esbuild';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { adminPermissionRule } from '../src/lib/adminPermissionUi';
const require = createRequire(import.meta.url);

let checks = 0;
const same = (actual: unknown, expected: unknown) => { assert.deepEqual(actual, expected); checks++; };
const rejects = async (operation: Promise<unknown>, message?: RegExp) => { await assert.rejects(operation, message); checks++; };
const siteId = 'site/a', collectionId = 'collection/a', revisionId = 'revision/a';
const currentVersion = 'collection-v1:' + 'a'.repeat(64);
const signal = new AbortController().signal;
const response = (data: unknown) => Response.json({ success: true, requestId: 'fixture', data });
const calls: { url: string; init?: RequestInit }[] = [];
const revision = (id: string) => ({ id, createdAt: '2026-10-08T10:00:00.000Z', operation: 'template-upgrade', templateId: 'template/a', targetRevisionId: revisionId, hasPinnedBaseline: true });
const history = { siteId, collectionId, currentVersion, revisions: [revision('before/1'), revision('before/2')], pagination: { offset: 0, limit: 2, hasMore: true, nextOffset: 2 } };
const loaded = await loadCollectionDesignVersions(siteId, collectionId, signal, async (url, init) => {
  calls.push({ url: String(url), init }); return response(history);
}, { limit: 2 });
same(loaded, history);
same(calls[0].url.endsWith('/sites/site%2Fa/collections/collection%2Fa/design-versions?offset=0&limit=2'), true);
same(calls[0].init?.credentials, 'include'); same(calls[0].init?.signal, signal); same(calls[0].init?.method, 'GET');
const second = { ...history, revisions: [revision('before/3')], pagination: { offset: 2, limit: 2, hasMore: false, nextOffset: null } };
same((await loadCollectionDesignVersions(siteId, collectionId, signal, async () => response(second), { offset: 2, limit: 2 })).revisions[0].id, 'before/3');
for (const mutate of [
  (value: any) => { value.siteId = 'foreign'; },
  (value: any) => { value.collectionId = 'foreign'; },
  (value: any) => { value.currentVersion = 'record-v1:' + 'a'.repeat(64); },
  (value: any) => { value.revisions[1].id = value.revisions[0].id; },
  (value: any) => { value.revisions[0].createdAt = 'not-a-date'; },
  (value: any) => { value.revisions[0].operation = 'sent'; },
  (value: any) => { value.revisions[0].hasPinnedBaseline = 1; },
  (value: any) => { value.pagination.offset = 2; },
  (value: any) => { value.pagination.limit = 100; },
  (value: any) => { value.pagination.nextOffset = 1; },
  (value: any) => { value.revisions.pop(); },
  (value: any) => { value.pagination.hasMore = false; },
]) {
  const invalid = structuredClone(history); mutate(invalid);
  await rejects(loadCollectionDesignVersions(siteId, collectionId, signal, async () => response(invalid), { limit: 2 }), /incompatible/);
}
let blockedCalls = 0;
for (const options of [{ offset: -1 }, { offset: 0.5 }, { limit: 0 }, { limit: 101 }]) {
  await rejects(loadCollectionDesignVersions(siteId, collectionId, signal, async () => { blockedCalls++; return response(history); }, options), /valid design history page/);
}
same(blockedCalls, 0);
const controller = new AbortController();
await rejects(loadCollectionDesignVersions(siteId, collectionId, controller.signal, async () => ({ ok: true, json: async () => { controller.abort(); return { success: true, data: history }; } }) as Response, { limit: 2 }), /abort/i);

const collection = { name: 'Current collection', slug: 'current-collection', permissions: {publicRead:true,publicCreate:false,publicUpdate:false,publicDelete:false}, metadata:{ ownerExtension:[false,0,null] }, id: collectionId, siteId, version: 'collection-v1:' + 'b'.repeat(64), title: 'Current title', fields: [{ key: 'email', type: 'email', label: 'Email', required: true }], metadata: { ownerExtension: [false, 0, null] }, audience: 'authenticated', isActive: false };
const restored = { siteId, collectionId, restoredFromRevisionId: revisionId, collection, completionWarnings: ['COLLECTION_DESIGN_AUDIT_PENDING'] };
same(await restoreCollectionDesignVersion(siteId, collectionId, revisionId, currentVersion, signal, async (url, init) => {
  calls.push({ url: String(url), init }); return response(restored);
}), { collection, completionWarnings: restored.completionWarnings });
const sent = calls.at(-1)!;
same(sent.url.endsWith('/collections/collection%2Fa/design-versions/revision%2Fa/restore'), true);
same(sent.init?.method, 'POST'); same(sent.init?.credentials, 'include'); same(sent.init?.signal, signal);
same(JSON.parse(String(sent.init?.body)), { expectedVersion: currentVersion });
await rejects(restoreCollectionDesignVersion(siteId, collectionId, revisionId, 'record-v1:' + 'a'.repeat(64), signal, async () => { blockedCalls++; return response(restored); }), /Reload the current collection/);
same(blockedCalls, 0);
for (const mutate of [
  (value: any) => { value.siteId = 'foreign'; },
  (value: any) => { value.collectionId = 'foreign'; },
  (value: any) => { value.restoredFromRevisionId = 'other'; },
  (value: any) => { value.collection.siteId = 'foreign'; },
  (value: any) => { value.collection.id = 'other'; },
  (value: any) => { value.collection.version = 'invalid'; },
  (value: any) => { value.collection.fields = {}; },
  (value: any) => { value.completionWarnings = [false]; },
]) {
  const invalid = structuredClone(restored); mutate(invalid);
  await rejects(restoreCollectionDesignVersion(siteId, collectionId, revisionId, currentVersion, signal, async () => response(invalid)), /incompatible/);
}
let attempts = 0;
await rejects(restoreCollectionDesignVersion(siteId, collectionId, revisionId, currentVersion, signal, async () => { attempts++; return Response.json({ success: false, error: { message: 'Reload the current collection before restoring.' } }, { status: 409 }); }), /Reload the current collection/);
same(attempts, 1);

const selection = [{ type: 'collection' as const, id: collectionId }];
const reviewVersion = 'template-collection-instances-v1:' + 'c'.repeat(64);
const outcome = { action: 'review', siteId, templateId: 'template/a', targetRevisionId: revisionId, targetFingerprint: 'd'.repeat(64), reviewVersion,
  targets: [{ type: 'collection', id: collectionId, title: 'Collection', status: 'active', pinnedFingerprint: 'e'.repeat(64), contentFingerprint: 'f'.repeat(64), changedPaths: ['/fieldsByKey/email/label'], conflicts: [], state: 'ready' }],
  scanned: { pages: 0, posts: 0, collections: 205 }, canApply: true, appliedTargets: [], failedTargets: [], completionWarnings: [], outcome: 'complete', concurrencyBoundary: 'database-per-document-row-lock' };
const reviewInput = { action: 'review' as const, targetType: 'collection' as const, targetRevisionId: revisionId, selection };
same((await reviewOrUpgradeTemplateInstances(siteId, 'template/a', reviewInput, signal, async (_url, init) => { same(JSON.parse(String(init?.body)), reviewInput); return response(outcome); })).scanned.collections, 205);
const incompatible = structuredClone(outcome); incompatible.targets[0].state = 'blocked'; incompatible.targets[0].conflicts = [{ path: '/fieldsByKey/email/type', code: 'SCHEMA_INCOMPATIBLE' }] as any; incompatible.canApply = false;
same((await reviewOrUpgradeTemplateInstances(siteId, 'template/a', reviewInput, signal, async () => response(incompatible))).canApply, false);
for (const mutate of [
  (value: any) => { value.reviewVersion = 'template-instances-v1:' + 'c'.repeat(64); },
  (value: any) => { value.siteId = 'foreign'; },
  (value: any) => { value.targets[0].type = 'page'; },
  (value: any) => { delete value.scanned.collections; },
  (value: any) => { value.canApply = false; },
  (value: any) => { value.appliedTargets = selection; },
]) {
  const invalid = structuredClone(outcome); mutate(invalid);
  await rejects(reviewOrUpgradeTemplateInstances(siteId, 'template/a', reviewInput, signal, async () => response(invalid)), /incompatible|invalid documents|misstates/);
}
await rejects(reviewOrUpgradeTemplateInstances(siteId, 'template/a', { ...reviewInput, action: 'apply', reviewVersion: 'template-instances-v1:' + 'c'.repeat(64) }, signal, async () => { blockedCalls++; return response(outcome); }), /Review this selection/);
same(blockedCalls, 0);
const applied = { ...outcome, action: 'apply', canApply: false, appliedTargets: selection, completionWarnings: ['COLLECTION_DESIGN_CACHE_PENDING'] };
same((await reviewOrUpgradeTemplateInstances(siteId, 'template/a', { ...reviewInput, action: 'apply', reviewVersion }, signal, async () => response(applied))).appliedTargets, selection);
const stale = structuredClone(applied); stale.reviewVersion = 'template-collection-instances-v1:' + '0'.repeat(64);
await rejects(reviewOrUpgradeTemplateInstances(siteId, 'template/a', { ...reviewInput, action: 'apply', reviewVersion }, signal, async () => response(stale)), /incompatible/);

const panel = renderToStaticMarkup(React.createElement(CollectionDesignHistoryPanel, { siteId, collectionId, currentVersion, canView: false, canEdit: false, hasUnsavedChanges: true, onRestored: () => { throw Error('SSR must not restore'); } }));
same(panel.includes('Collections view permission is required.'), true); same(panel.includes('Save your current collection, entry and design edits before restoring.'), true);
same(panel.includes('disabled=""'), true); same(panel.includes('Restore collection design</button>'), false);
const template = { id: revisionId, templateId: 'template/a', snapshot: { type: 'collection', name: 'Registered collection' } } as BackyTemplateRevision;
const instancePanel = renderToStaticMarkup(React.createElement(TemplateInstancesPanel, { siteId, revision: template, canView: false, canEdit: false }));
same(instancePanel.includes('Collections view permission is required'), true); same(instancePanel.includes('Collections edit permission is required'), true);
same(instancePanel.includes('Field types, validation, routes, access rules and entries stay intact.'), true);
same(templateInstanceEditorHref(siteId, { type: 'collection', id: collectionId }), '/collections?siteId=site%2Fa&collectionId=collection%2Fa#collections-schema');

// Execute production helpers/callbacks, not copies of their preservation rules.
const source = readFileSync(process.env.BACKY_COLLECTIONS_SOURCE_FILE || new URL('../src/routes/collections.tsx', import.meta.url), 'utf8');
function helperClosure(roots: string[]) {
  const ast = ts.createSourceFile('collections.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const definitions = new Map<string, ts.Node>();
  for (const statement of ast.statements) {
    if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name)) definitions.set(declaration.name.text, statement);
    if (ts.isFunctionDeclaration(statement) && statement.name) definitions.set(statement.name.text, statement);
  }
  const selected = new Set<ts.Node>();
  function visitName(name: string) {
    const node = definitions.get(name); if (!node || selected.has(node)) return;
    selected.add(node);
    function visit(child: ts.Node) { if (ts.isIdentifier(child)) visitName(child.text); ts.forEachChild(child, visit); }
    visit(node);
  }
  roots.forEach(visitName);
  roots.forEach(name => assert(definitions.has(name), `Missing actual helper ${name}`));
  return [...selected].sort((a,b) => a.pos - b.pos).map(node => node.getText(ast)).join('\n');
}
const helpers = helperClosure(['collectionEditorDraft','stableTemplateValue','collectionMetadataWithDynamicTemplates','collectionMetadataWithSlugPolicy','collectionMetadataWithVisitorWritePolicy','stripFrontendCollectionTemplateMetadata','getCollectionFrontendTemplateId','buildFrontendCollectionTemplateMetadata','authoredDynamicTemplateFromPage','appendAuthoredDynamicTemplateHistory','stableCollectionFieldId','normalizeSlug','defaultCollectionListRoutePattern','defaultCollectionRoutePattern']);
const actualHelpers: any = { JSON, Date, Math };
vm.runInNewContext(transformSync(helpers + '\nglobalThis.helpers = {collectionEditorDraft, stableTemplateValue};', {loader:'tsx'}).code, actualHelpers);
const fixtureCollection: any = { ...collection, version:currentVersion, listRoutePattern:'/current-collection', routePattern:'/current-collection/:recordSlug', description:'Current description', status:'draft', fields:[{id:'email',key:'email',type:'email',label:'Email',required:true,unique:false,sortOrder:10, defaultValue:'', validation:{ custom:[false,0,null] }, ownerExtension:[false,0,null]}], metadata:{
  frontendDesignTemplateId:'template/a', frontendTemplateInstance:{ preserved:[false,0,null] }, frontendDesignTokens:{ownerColor:'#0f766e'}, frontendDesignUnrecognized:[false,0,null],
  dynamicTemplates:{ list:{ ownerExtension:[false,0,null], authoredPageId:'page/a', authoredCanvas:{pageId:'page/a',pageTitle:'Page',pageSlug:'page',capturedAt:'2026-10-08T10:00:00Z', elements:[{id:'hero', width:640,responsive:{mobile:{width:280}}, props:{unknown:[false,0,null]}}], canvas:{width:1200,height:800}, customCSS:'', metadata:{ownerExtension:[false,0,null]}, unknownAlias:[false,0,null], contentDocument:{schemaVersion:1, elements:[], metadata:{ extension:[false,0,null] }}}}, item:{} }
} };
const draft = JSON.parse(JSON.stringify(actualHelpers.helpers.collectionEditorDraft(fixtureCollection)));
same(draft.dynamicTemplates.list.authoredCanvas.canvas, {width:1200,height:800}); same(draft.dynamicTemplates.list.authoredCanvas.unknownAlias, [false,0,null]); same(draft.dynamicTemplates.list.ownerExtension, [false,0,null]);
same(actualHelpers.helpers.stableTemplateValue(draft), actualHelpers.helpers.stableTemplateValue(actualHelpers.helpers.collectionEditorDraft(fixtureCollection)));
for (const change of [ (value:any)=>{value.fields[0].label='New label';}, (value:any)=>{value.dynamicTemplates.list.authoredCanvas.unknownAlias[0]=true;}, (value:any)=>{value.dynamicTemplates.list.authoredCanvas.unknownAlias.reverse();} ]) { const changed=structuredClone(draft); change(changed); same(actualHelpers.helpers.stableTemplateValue(changed) !== actualHelpers.helpers.stableTemplateValue(draft),true); }
function extract(start: string, end: string) { const begin=source.indexOf(start), finish=source.indexOf(end,begin); assert(begin>=0&&finish>begin); return source.slice(begin,finish); }
const saveSource=extract('  const handleCollectionSubmit = async','  const handleDeleteCollection =');
const captureSource=extract('  const captureAuthoredDynamicTemplate = async','  const clearAuthoredDynamicTemplate =');
const restoreSource=extract('  const restoreAuthoredDynamicTemplateVersion =','  const handleCollectionSubmit =');
function callbackFixture(callback: string, name: string) {
  const writes:any[]=[], sent:any[]=[], state:any={setCollections:[fixtureCollection]}; let resolve!:(value:any)=>void;
  const deferred=new Promise<any>(done=>{resolve=done;});
  const context:any={ Error, JSON, Date, Math, activeSiteId:siteId, selectedCollectionId:collectionId, activeCollection:fixtureCollection,
    collectionForm:structuredClone(draft), frontendCollectionTemplates:[{id:'template/a',name:'Latest unrelated',type:'collection'}], frontendDesign:{tokens:{color:'latest'}},
    recordDraftDirty:false,isCollectionsBusy:false,isLoading:false,isCollectionMutationPending:false,canEditCollections:true,schemaMutationDisabled:false,
    collectionSaveAuthority:{current:{context:'scope',epoch:0}}, collectionInteractionVersionRef:{current:0}, collectionDraftAuthority:{current:'draft'},
    getPage: async (...args:any[])=>{sent.push(args);return deferred;}, updateCollection:async (...args:any[])=>{sent.push(args);return deferred;}, createCollection:()=>{throw Error('Unexpected create');},
    showPermissionDenied:()=>{state.denied=true;},showApiError:(cause:Error)=>{state.setError=cause.message;},
    selectCollection:(value:any)=>{writes.push(['selected',value]);state.selected=value;},loadCollectionAuditLogs:()=>{writes.push(['audit']);},
    updateDynamicListTemplate:(value:any)=>{writes.push(['list',value]);state.list=value;}, updateDynamicItemTemplate:(value:any)=>{writes.push(['item',value]);state.item=value;},
  };
  for(const setter of new Set([...callback.matchAll(/\b(set[A-Z]\w*)\(/g)].map(match=>match[1]))) context[setter]=(value:any)=>{const next=typeof value==='function'?value(state[setter]):value;state[setter]=next;writes.push([setter,next]);};
  vm.runInNewContext(transformSync(helpers+callback+`\nglobalThis.invoke = ${name};`,{loader:'tsx'}).code,context);
  return {context,state,writes,sent,resolve};
}
const event={preventDefault:()=>{}};
const detached=callbackFixture(saveSource,'handleCollectionSubmit');detached.context.collectionForm.frontendDesignTemplateId='';const detachedPending=detached.context.invoke(event);same(detached.sent[0][2].metadata.frontendDesignTemplateId,undefined);detached.resolve({...fixtureCollection});await detachedPending;
const saved={...fixtureCollection,version:'collection-v1:'+'b'.repeat(64)};
const ordinary=callbackFixture(saveSource,'handleCollectionSubmit');const savePending=ordinary.context.invoke(event);
same(ordinary.sent.length,1);same(ordinary.sent[0][0],siteId);same(ordinary.sent[0][1],collectionId);same(ordinary.sent[0][2].expectedVersion,currentVersion);
same(ordinary.sent[0][2].metadata.dynamicTemplates.list.ownerExtension,[false,0,null]);
same(ordinary.sent[0][2].metadata.frontendDesignTokens,fixtureCollection.metadata.frontendDesignTokens);
same(ordinary.sent[0][2].metadata.frontendTemplateInstance,fixtureCollection.metadata.frontendTemplateInstance);
same(ordinary.sent[0][2].metadata.dynamicTemplates.list.authoredCanvas.unknownAlias,[false,0,null]);
same(ordinary.sent[0][2].fields[0].ownerExtension,[false,0,null]);
ordinary.resolve(saved);await savePending;same(ordinary.state.selected,saved);same(ordinary.state.setIsSavingCollection,false);
for(const transition of ['site','role','selected-collection','away-and-back','draft']) {
 const held=callbackFixture(saveSource,'handleCollectionSubmit'),op=held.context.invoke(event),before=held.writes.length;
 if(transition==='draft')held.context.collectionDraftAuthority.current='changed';else held.context.collectionSaveAuthority.current={context:transition,epoch:transition==='away-and-back'?2:1};
 held.resolve(saved);await op;same(held.sent.length,1);
 // Draft mutation suppresses result; same current authority may release its own busy flag.
 same(held.writes.filter(row=>!['setIsSavingCollection'].includes(row[0])).length,held.writes.slice(0,before).filter(row=>!['setIsSavingCollection'].includes(row[0])).length);
 same(held.state.selected,undefined);same(held.state.setCollections,[fixtureCollection]);
}
for(const invalid of [{...saved,siteId:'foreign'},{...saved,id:'foreign'}]) {const held=callbackFixture(saveSource,'handleCollectionSubmit'),op=held.context.invoke(event);held.resolve(invalid);await op;same(held.state.selected,undefined);same(held.state.setCollections,[fixtureCollection]);same(held.state.setError,'Collection save returned another workspace. Reload before continuing.');}
const entryDirty=callbackFixture(saveSource,'handleCollectionSubmit');entryDirty.context.recordDraftDirty=true;await entryDirty.context.invoke(event);same(entryDirty.sent.length,0);same(entryDirty.state.setError,'Save or discard current entry edits before saving the collection schema.');
const blocked=callbackFixture(saveSource,'handleCollectionSubmit');blocked.context.isCollectionMutationPending=true;await blocked.context.invoke(event);same(blocked.sent.length,0);
const page={id:'page/a',siteId,title:'Page',slug:'page',content:{elements:[{id:'hero',width:640,responsive:{mobile:{width:280}},props:{unknown:[false,0,null]}}],canvas:{width:1200,height:800},customCSS:'',unknownAlias:[false,0,null],contentDocument:{version:'owner',metadata:{extension:[false,0,null]}}}};
const capture=callbackFixture(captureSource,'captureAuthoredDynamicTemplate'),capturePending=capture.context.invoke('list');capture.resolve(page);await capturePending;
same(capture.state.list.authoredCanvas.unknownAlias,[false,0,null]);same(capture.state.list.authoredCanvas.canvas,{width:1200,height:800});same(capture.state.list.authoredCanvas.elements[0].responsive.mobile.width,280);same(capture.state.setIsCapturingCollectionDesign,false);
for(const transition of ['site','role','draft-selection','away-and-back','field-change','page-selection']) {const held=callbackFixture(captureSource,'captureAuthoredDynamicTemplate'),op=held.context.invoke('list'),before=held.writes.length;if(transition==='field-change')held.context.collectionDraftAuthority.current='changed';else if(transition==='page-selection')held.context.collectionInteractionVersionRef.current++;else held.context.collectionSaveAuthority.current={context:transition,epoch:2};held.resolve(page);await op;same(held.state.list,undefined);same(held.writes.filter(row=>row[0]!=='setIsCapturingCollectionDesign').length,held.writes.slice(0,before).filter(row=>row[0]!=='setIsCapturingCollectionDesign').length);}
for(const invalid of [{...page,id:'foreign'},{...page,siteId:'foreign'}]){const held=callbackFixture(captureSource,'captureAuthoredDynamicTemplate'),op=held.context.invoke('list');held.resolve(invalid);await op;same(held.state.list,undefined);same(held.state.setError,'Captured page returned another workspace. Reload before capturing.');}
const prior={...structuredClone(draft.dynamicTemplates.list.authoredCanvas),id:'history/a',version:2,elementCount:1};
const restoredLocal=callbackFixture(restoreSource,'restoreAuthoredDynamicTemplateVersion');await restoredLocal.context.invoke('list',prior);
same(restoredLocal.state.list.authoredCanvas.unknownAlias,[false,0,null]);same(restoredLocal.state.list.authoredCanvas.canvas,{width:1200,height:800});same(restoredLocal.state.list.authoredCanvas.customCSS,'');same(restoredLocal.state.list.authoredCanvas.id,undefined);
// Real client serializer+unwrap verifies response identity/version, preserving unknown fields.
const client={exports:{} as any};let reply:any=fixtureCollection;let requestBody:any;
vm.runInNewContext(buildSync({entryPoints:[new URL('../src/lib/adminContentApi.ts',import.meta.url).pathname],bundle:true,write:false,format:'cjs',platform:'browser',define:{'import.meta.env':'{}'},logLevel:'silent'}).outputFiles[0].text,{module:client,exports:client.exports,console,URL,Headers,Request,Response,fetch:async(_url:any,init:RequestInit)=>{requestBody=JSON.parse(String(init.body));return response({collection:reply});}});
const normalized=await client.exports.updateCollection(siteId,collectionId,{expectedVersion:currentVersion});same(requestBody.expectedVersion,currentVersion);same(normalized.version,currentVersion);same(normalized.fields[0].ownerExtension,[false,0,null]);same(normalized.metadata.frontendTemplateInstance,fixtureCollection.metadata.frontendTemplateInstance);
reply={...fixtureCollection};delete reply.version;same((await client.exports.updateCollection(siteId,collectionId,{})).version,undefined);
for(const invalid of [{...fixtureCollection,id:'foreign'},{...fixtureCollection,siteId:'foreign'},{...fixtureCollection,version:'record-v1:'+'a'.repeat(64)}]){reply=invalid;await rejects(client.exports.updateCollection(siteId,collectionId,{}),/incompatible/);}
// Execute the real recovery callback against deferred response and render-time authority.
const panelSource=readFileSync(new URL('../src/components/collections/CollectionDesignHistoryPanel.tsx',import.meta.url),'utf8');
const restoreBegin=panelSource.indexOf('  const restore = async'), restoreEnd=panelSource.indexOf('  return <section',restoreBegin);
assert(restoreBegin>=0&&restoreEnd>restoreBegin);const panelRestoreSource=panelSource.slice(restoreBegin,restoreEnd);
function recoveryFixture() {
 const events:any[]=[], sent:any[]=[];let resolve!:(value:any)=>void;const deferred=new Promise<any>(done=>{resolve=done;});
 const context:any={AbortController,Error,siteId,collectionId,canView:true,canEdit:true,hasUnsavedChanges:false,confirmed:true,history,reviewed:history.revisions[0],stale:false,busy:false,
  authority:{current:{context:'scope'}},restoreController:{current:undefined},
  restoreCollectionDesignVersion:async(...args:any[])=>{sent.push(args);return deferred;},onRestoreBusyChange:(value:any)=>events.push(['busy',value]),onRestored:(...args:any[])=>events.push(['restored',...args]) };
 for(const setter of new Set([...panelRestoreSource.matchAll(/\b(set[A-Z]\w*)\(/g)].map(match=>match[1])))context[setter]=(value:any)=>events.push([setter,value]);
 vm.runInNewContext(transformSync(panelRestoreSource+'\nglobalThis.invoke = restore;',{loader:'tsx'}).code,context);return {context,events,sent,resolve};
}
for(const blocked of ['canView','canEdit','confirmed','hasUnsavedChanges','stale','busy']){const held=recoveryFixture();held.context[blocked]=['hasUnsavedChanges','stale','busy'].includes(blocked);await held.context.invoke();same(held.sent.length,0);same(held.events.length,0);}
const recovery=recoveryFixture(),recoveryPending=recovery.context.invoke();same(recovery.sent[0].slice(0,4),[siteId,collectionId,history.revisions[0].id,currentVersion]);recovery.resolve({collection:saved,completionWarnings:['COLLECTION_DESIGN_AUDIT_PENDING']});await recoveryPending;same(recovery.events.some(row=>row[0]==='restored'&&row[1]===saved),true);same(recovery.events.at(-1),['busy',false]);
for(const transition of ['site','role','current-version','away-and-back','dirty-draft']){const held=recoveryFixture(),op=held.context.invoke(),before=held.events.length;held.context.authority.current={context:transition};held.resolve({collection:saved,completionWarnings:[]});await op;same(held.events.length,before);same(held.events.some(row=>row[0]==='restored'),false);}
const cancelled=recoveryFixture(),cancelledPending=cancelled.context.invoke(),beforeAbort=cancelled.events.length;cancelled.context.restoreController.current.abort();cancelled.resolve({collection:saved,completionWarnings:[]});await cancelledPending;same(cancelled.events.length,beforeAbort);
let schemaRestoreAttempts=0;await rejects(restoreCollectionDesignVersion(siteId,collectionId,revisionId,currentVersion,signal,async()=>{schemaRestoreAttempts++;return Response.json({success:false,error:{message:'Collection schema is incompatible with this saved design.'}},{status:422});}),/schema is incompatible/);same(schemaRestoreAttempts,1);
// Evaluate production recovery permission expressions, including special commerce definitions.
function expression(name:string){const pattern=new RegExp('  const '+name+' = ([\\s\\S]*?);');const match=source.match(pattern);assert(match);return match[1];}
for(const [loading,matrix,slug,expectedView,expectedEdit] of [[false,true,'articles',true,true],[true,true,'articles',false,false],[false,false,'articles',false,false],[false,true,'products',false,false],[false,true,'orders',false,false]] as const){const permissions=matrix?{groups:[{permissions:[{key:'collections.view',allowed:true},{key:'collections.edit',allowed:true}]}]}:null;const context:any={adminPermissionRule,activeSiteId:siteId,isPermissionsLoading:loading,permissionMatrix:permissions,canViewCollections:true,canEditCollections:true,collectionDesignNeedsCommerce:['products','orders'].includes(slug)};context.canViewCollectionDesign=vm.runInNewContext(expression('canViewCollectionDesign'),context);same(context.canViewCollectionDesign,expectedView);same(vm.runInNewContext(expression('canEditCollectionDesign'),context),expectedEdit);}
const commerceContext:any={adminPermissionRule,activeSiteId:siteId,isPermissionsLoading:false,permissionMatrix:{groups:[{permissions:[{key:'commerce.view',allowed:true},{key:'commerce.configure',allowed:true}]}]},canViewCollections:true,canEditCollections:true,collectionDesignNeedsCommerce:true};commerceContext.canViewCollectionDesign=vm.runInNewContext(expression('canViewCollectionDesign'),commerceContext);same(commerceContext.canViewCollectionDesign,true);same(vm.runInNewContext(expression('canEditCollectionDesign'),commerceContext),true);
console.log(`Collection design controls passed ${checks} assertions: scoped history/pagination/CAS, schema namespace, actual ordinary-save/capture/restore callbacks, deferred workspace/draft/role rejection, unknown design aliases and real update serializer. Transport/auth/state setters are fixtures; no browser/native SQL/production proof.`);
