import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadFormDesignVersions, restoreFormDesignVersion } from '../src/lib/formDesignVersionsClient';
import { reviewOrUpgradeTemplateInstances } from '../src/lib/templateInstancesClient';
import { FormDesignHistoryPanel } from '../src/components/forms/FormDesignHistoryPanel';
import { TemplateInstancesPanel, templateInstanceEditorHref } from '../src/components/sites/TemplateInstancesPanel';
import type { BackyTemplateRevision } from '@backy-cms/core';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync, buildSync } from 'esbuild';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const catalogModule = { exports: {} as any };
vm.runInNewContext(buildSync({entryPoints:[new URL('../src/components/editor/editorCatalog.ts',import.meta.url).pathname],bundle:true,write:false,format:'cjs',platform:'node',alias:{'@backy-cms/core':new URL('../../../packages/core/src/index.ts',import.meta.url).pathname},logLevel:'silent'}).outputFiles[0].text,{module:catalogModule,exports:catalogModule.exports,require});
const { serializeCanvasContent } = catalogModule.exports;

let checks = 0;
const same = (actual: unknown, expected: unknown) => { assert.deepEqual(actual, expected); checks++; };
const rejects = async (operation: Promise<unknown>, message?: RegExp) => { await assert.rejects(operation, message); checks++; };
const siteId = 'site/a', formId = 'form/a', revisionId = 'revision/a';
const currentVersion = 'form-v1:' + 'a'.repeat(64);
const signal = new AbortController().signal;
const response = (data: unknown) => Response.json({ success: true, requestId: 'fixture', data });
const calls: { url: string; init?: RequestInit }[] = [];
const revision = (id: string) => ({ id, createdAt: '2026-10-08T10:00:00.000Z', operation: 'template-upgrade', templateId: 'template/a', targetRevisionId: revisionId, hasPinnedBaseline: true });
const history = { siteId, formId, currentVersion, revisions: [revision('before/1'), revision('before/2')], pagination: { offset: 0, limit: 2, hasMore: true, nextOffset: 2 } };
const loaded = await loadFormDesignVersions(siteId, formId, signal, async (url, init) => {
  calls.push({ url: String(url), init }); return response(history);
}, { limit: 2 });
same(loaded, history);
same(calls[0].url.endsWith('/sites/site%2Fa/forms/form%2Fa/design-versions?offset=0&limit=2'), true);
same(calls[0].init?.credentials, 'include'); same(calls[0].init?.signal, signal); same(calls[0].init?.method, 'GET');
const second = { ...history, revisions: [revision('before/3')], pagination: { offset: 2, limit: 2, hasMore: false, nextOffset: null } };
same((await loadFormDesignVersions(siteId, formId, signal, async () => response(second), { offset: 2, limit: 2 })).revisions[0].id, 'before/3');
for (const mutate of [
  (value: any) => { value.siteId = 'foreign'; },
  (value: any) => { value.formId = 'foreign'; },
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
  await rejects(loadFormDesignVersions(siteId, formId, signal, async () => response(invalid), { limit: 2 }), /incompatible/);
}
let blockedCalls = 0;
for (const options of [{ offset: -1 }, { offset: 0.5 }, { limit: 0 }, { limit: 101 }]) {
  await rejects(loadFormDesignVersions(siteId, formId, signal, async () => { blockedCalls++; return response(history); }, options), /valid design history page/);
}
same(blockedCalls, 0);
const controller = new AbortController();
await rejects(loadFormDesignVersions(siteId, formId, controller.signal, async () => ({ ok: true, json: async () => { controller.abort(); return { success: true, data: history }; } }) as Response, { limit: 2 }), /abort/i);

const form = { id: formId, siteId, version: 'form-v1:' + 'b'.repeat(64), title: 'Current title', fields: [{ key: 'email', type: 'email', label: 'Email', required: true }], settings: { ownerExtension: [false, 0, null] }, audience: 'authenticated', isActive: false };
const restored = { siteId, formId, restoredFromRevisionId: revisionId, form, completionWarnings: ['FORM_DESIGN_AUDIT_PENDING'] };
same(await restoreFormDesignVersion(siteId, formId, revisionId, currentVersion, signal, async (url, init) => {
  calls.push({ url: String(url), init }); return response(restored);
}), { form, completionWarnings: restored.completionWarnings });
const sent = calls.at(-1)!;
same(sent.url.endsWith('/forms/form%2Fa/design-versions/revision%2Fa/restore'), true);
same(sent.init?.method, 'POST'); same(sent.init?.credentials, 'include'); same(sent.init?.signal, signal);
same(JSON.parse(String(sent.init?.body)), { expectedVersion: currentVersion });
await rejects(restoreFormDesignVersion(siteId, formId, revisionId, 'record-v1:' + 'a'.repeat(64), signal, async () => { blockedCalls++; return response(restored); }), /Reload the current form/);
same(blockedCalls, 0);
for (const mutate of [
  (value: any) => { value.siteId = 'foreign'; },
  (value: any) => { value.formId = 'foreign'; },
  (value: any) => { value.restoredFromRevisionId = 'other'; },
  (value: any) => { value.form.siteId = 'foreign'; },
  (value: any) => { value.form.id = 'other'; },
  (value: any) => { value.form.version = 'invalid'; },
  (value: any) => { value.form.fields = {}; },
  (value: any) => { value.completionWarnings = [false]; },
]) {
  const invalid = structuredClone(restored); mutate(invalid);
  await rejects(restoreFormDesignVersion(siteId, formId, revisionId, currentVersion, signal, async () => response(invalid)), /incompatible/);
}
let attempts = 0;
await rejects(restoreFormDesignVersion(siteId, formId, revisionId, currentVersion, signal, async () => { attempts++; return Response.json({ success: false, error: { message: 'Reload the current form before restoring.' } }, { status: 409 }); }), /Reload the current form/);
same(attempts, 1);

const selection = [{ type: 'form' as const, id: formId }];
const reviewVersion = 'template-form-instances-v1:' + 'c'.repeat(64);
const outcome = { action: 'review', siteId, templateId: 'template/a', targetRevisionId: revisionId, targetFingerprint: 'd'.repeat(64), reviewVersion,
  targets: [{ type: 'form', id: formId, title: 'Form', status: 'active', pinnedFingerprint: 'e'.repeat(64), contentFingerprint: 'f'.repeat(64), changedPaths: ['/fieldsByKey/email/label'], conflicts: [], state: 'ready' }],
  scanned: { pages: 0, posts: 0, forms: 205 }, canApply: true, appliedTargets: [], failedTargets: [], completionWarnings: [], outcome: 'complete', concurrencyBoundary: 'database-per-document-row-lock' };
const reviewInput = { action: 'review' as const, targetType: 'form' as const, targetRevisionId: revisionId, selection };
same((await reviewOrUpgradeTemplateInstances(siteId, 'template/a', reviewInput, signal, async (_url, init) => { same(JSON.parse(String(init?.body)), reviewInput); return response(outcome); })).scanned.forms, 205);
const incompatible = structuredClone(outcome); incompatible.targets[0].state = 'blocked'; incompatible.targets[0].conflicts = [{ path: '/fieldsByKey/email/type', code: 'SCHEMA_INCOMPATIBLE' }] as any; incompatible.canApply = false;
same((await reviewOrUpgradeTemplateInstances(siteId, 'template/a', reviewInput, signal, async () => response(incompatible))).canApply, false);
for (const mutate of [
  (value: any) => { value.reviewVersion = 'template-instances-v1:' + 'c'.repeat(64); },
  (value: any) => { value.siteId = 'foreign'; },
  (value: any) => { value.targets[0].type = 'page'; },
  (value: any) => { delete value.scanned.forms; },
  (value: any) => { value.canApply = false; },
  (value: any) => { value.appliedTargets = selection; },
]) {
  const invalid = structuredClone(outcome); mutate(invalid);
  await rejects(reviewOrUpgradeTemplateInstances(siteId, 'template/a', reviewInput, signal, async () => response(invalid)), /incompatible|invalid documents|misstates/);
}
await rejects(reviewOrUpgradeTemplateInstances(siteId, 'template/a', { ...reviewInput, action: 'apply', reviewVersion: 'template-instances-v1:' + 'c'.repeat(64) }, signal, async () => { blockedCalls++; return response(outcome); }), /Review this selection/);
same(blockedCalls, 0);
const applied = { ...outcome, action: 'apply', canApply: false, appliedTargets: selection, completionWarnings: ['FORM_DESIGN_CACHE_PENDING'] };
same((await reviewOrUpgradeTemplateInstances(siteId, 'template/a', { ...reviewInput, action: 'apply', reviewVersion }, signal, async () => response(applied))).appliedTargets, selection);
const stale = structuredClone(applied); stale.reviewVersion = 'template-form-instances-v1:' + '0'.repeat(64);
await rejects(reviewOrUpgradeTemplateInstances(siteId, 'template/a', { ...reviewInput, action: 'apply', reviewVersion }, signal, async () => response(stale)), /incompatible/);

const panel = renderToStaticMarkup(React.createElement(FormDesignHistoryPanel, { siteId, formId, currentVersion, canView: false, canEdit: false, hasUnsavedChanges: true, onRestored: () => { throw Error('SSR must not restore'); } }));
same(panel.includes('Forms view permission is required.'), true); same(panel.includes('Save your current form and design edits before restoring.'), true);
same(panel.includes('disabled=""'), true); same(panel.includes('Restore form design</button>'), false);
const template = { id: revisionId, templateId: 'template/a', snapshot: { type: 'form', name: 'Registered form' } } as BackyTemplateRevision;
const instancePanel = renderToStaticMarkup(React.createElement(TemplateInstancesPanel, { siteId, revision: template, canView: false, canEdit: false }));
same(instancePanel.includes('Forms view permission is required'), true); same(instancePanel.includes('Forms edit permission is required'), true);
same(instancePanel.includes('Field semantics, audience, submission targets, notifications, consent and retained submissions stay intact.'), true);
same(templateInstanceEditorHref(siteId, { type: 'form', id: formId }), '/forms?siteId=site%2Fa&formId=form%2Fa#forms-builder');

// Run the actual ordinary-save callback, with validation/transport/state setters
// isolated. This proves its post-await authority and dirty-layout admission.
const formsSource = readFileSync(process.env.BACKY_FORMS_SOURCE_FILE || new URL('../src/routes/forms.tsx', import.meta.url), 'utf8');
const callbackBegin = formsSource.indexOf('  const saveFormDraft = async');
const callbackEnd = formsSource.indexOf('  const requestDeleteSelectedForm =', callbackBegin);
assert(callbackBegin >= 0 && callbackEnd > callbackBegin);
const callbackSource = formsSource.slice(callbackBegin, callbackEnd);
function callbackFixture(layoutDirty = false) {
  const writes: { name: string; value: any }[] = [], sent: any[] = [];
  const state: any = { setForms: [form], setInboxByForm: { [formId]: { form, submissions: [] } } };
  let resolve!: (value: any) => void;
  const deferred = new Promise<any>(done => { resolve = done; });
  const draft = { ...form, name: 'current-form', fields: structuredClone(form.fields) };
  const context: any = {
    activeSiteId: siteId, selectedForm: form, formDraft: draft, selectedFormIsStandalone: true,
    isFormsBusy: false, formLayoutDirty: layoutDirty, canEditForms: true, collections: [],
    formSaveAuthority: { current: { epoch: 0 } },
    buildFormDraftInlineErrors: () => ({}), buildFormUpdatePayload: (value: any) => structuredClone(value), cloneFormDefinition: (value: any) => structuredClone(value),
    updateForm: async (...args: any[]) => { sent.push(args); return deferred; }, Error, JSON,
  };
  for (const name of new Set([...callbackSource.matchAll(/\b(set[A-Z]\w*)\(/g)].map(match => match[1]))) context[name] = (value: any) => {
    const next = typeof value === 'function' ? value(state[name]) : value;
    state[name] = next; writes.push({ name, value: next });
  };
  vm.runInNewContext(transformSync(callbackSource + '\nglobalThis.save = saveFormDraft;', { loader: 'tsx' }).code, context);
  return { context, state, writes, sent, resolve };
}
const dirty = callbackFixture(true); await dirty.context.save(); same(dirty.sent.length, 0); same(dirty.writes.length, 0);
const ordinary = callbackFixture(); const ordinaryPending = ordinary.context.save();
same(ordinary.sent.length, 1); same(ordinary.sent[0][0], siteId); same(ordinary.sent[0][1], formId); same(ordinary.sent[0][2].expectedVersion, form.version);
const accepted = { ...form, title: 'Saved form', version: currentVersion };
ordinary.resolve(accepted); await ordinaryPending;
same(ordinary.state.setFormDraft, accepted); same(ordinary.state.setIsSavingForm, false); same(ordinary.state.setNotice, 'Form settings and fields saved.');
for (const transition of ['site', 'selected-form', 'permission', 'away-and-back']) {
  const pending = callbackFixture(); const operation = pending.context.save();
  const before = pending.writes.length;
  pending.context.formSaveAuthority.current.epoch += transition === 'away-and-back' ? 2 : 1;
  pending.resolve(accepted); await operation;
  same(pending.writes.length, before); same(pending.sent.length, 1);
}
for (const foreign of [{ ...accepted, id: 'foreign' }, { ...accepted, siteId: 'foreign' }]) {
  const pending = callbackFixture(); const operation = pending.context.save(); pending.resolve(foreign); await operation;
  same(pending.state.setFormDraft, undefined); same(pending.state.setForms, [form]); same(pending.state.setError, 'Form save returned a different workspace. Reload before continuing.');
}
// Evaluate the actual rendered fieldset admission expression. Browser evidence
// separately proves disabled descendants and the real captured-layout workflow.
const formsAst = ts.createSourceFile('forms.tsx', formsSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let fieldsetDisabled = '';
function fieldsetVisit(node: ts.Node) {
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(formsAst) === 'fieldset' && node.attributes.properties.some(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(formsAst) === 'data-action' && attribute.initializer?.getText(formsAst) === '"forms.builder.edit"')) {
    const attr = node.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(formsAst) === 'disabled') as ts.JsxAttribute;
    fieldsetDisabled = (attr.initializer as ts.JsxExpression).expression!.getText(formsAst);
  }
  ts.forEachChild(node, fieldsetVisit);
}
fieldsetVisit(formsAst); assert(fieldsetDisabled);
for (const [busy, layoutDirty, standalone, edit, expected] of [[false,false,true,true,false],[false,true,true,true,true],[true,false,true,true,true],[false,false,false,true,true],[false,false,true,false,true]]) {
  same(vm.runInNewContext(fieldsetDisabled, { isFormsBusy:busy, formLayoutDirty:layoutDirty, selectedFormIsStandalone:standalone, canEditForms:edit }), expected);
}
// Execute the actual transport client rather than reproducing its unwrap guard.
const clientModule = { exports: {} as any };
let clientReply: any = form;
const clientOutput = buildSync({ entryPoints: [new URL('../src/lib/adminContentApi.ts', import.meta.url).pathname], bundle: true, write: false, format: 'cjs', platform: 'browser', define: { 'import.meta.env': '{}' }, logLevel: 'silent' }).outputFiles[0].text;
vm.runInNewContext(clientOutput, { module: clientModule, exports: clientModule.exports, console, URL, Headers, Request, Response, fetch: async () => Response.json({ success: true, data: { form: clientReply } }) });
const actualUpdateForm = clientModule.exports.updateForm;
same(await actualUpdateForm(siteId, formId, {}), form);
clientReply = { ...form }; delete clientReply.version;
same((await actualUpdateForm(siteId, formId, {})).version, undefined);
for (const invalid of [{ ...form, id: 'foreign' }, { ...form, siteId: 'foreign' }, { ...form, version: 'invalid' }]) {
  clientReply = invalid; await rejects(actualUpdateForm(siteId, formId, {}), /different workspace|incompatible/);
}
// Execute actual captured-layout serialization and deferred save authority.
const layoutSource = readFileSync(new URL('../src/components/forms/ImportedFormLayoutEditor.tsx', import.meta.url), 'utf8');
const layoutAst = ts.createSourceFile('layout.tsx', layoutSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let layoutSave = '';
function visit(node: ts.Node) {
  if (ts.isJsxAttribute(node) && node.name.getText(layoutAst) === 'onSave' && node.initializer && ts.isJsxExpression(node.initializer)) layoutSave = node.initializer.expression!.getText(layoutAst);
  ts.forEachChild(node, visit);
}
visit(layoutAst); assert(layoutSave);
function layoutFixture(canEdit = true) {
  const events: any[] = [], sent: any[] = [];
  let resolve!: (value: any) => void;
  const deferred = new Promise<any>(done => { resolve = done; });
  const context: any = {
    siteId, form, settings: { unknown: [false, 0, null], frontendDesignCustomJs: '/* retained */' }, canEdit,
    initial: { canvasSize: { width: 900, height: 600 }, contentDocument: { version: 'owner-version', metadata: { retained: [false, 0, null] } } },
    saveAuthority: { current: { epoch: 0 } }, serializeCanvasContent, Error, JSON,
    updateForm: async (...args: any[]) => { sent.push(args); return deferred; },
    onSaveBusyChange: (value: any) => events.push(['busy', value]),
    onSaved: async () => { events.push(['saved']); }, setNotice: (value: any) => events.push(['notice', value]), setError: (value: any) => events.push(['error', value]),
  };
  vm.runInNewContext(transformSync('globalThis.save = ' + layoutSave, { loader: 'tsx' }).code, context);
  return { context, events, sent, resolve };
}
const layoutElements = [{ id: 'heading', type: 'text', x: 0, y: 0, width: 640, height: 60, props: { content: 'Owner text', unknown: [false, 0, null] }, responsive: { mobile: { width: 280 } } }];
const readonlyLayout = layoutFixture(false);
await rejects(readonlyLayout.context.save(layoutElements, {}, { width: 900, height: 600 }), /Save current form fields/);
same(readonlyLayout.sent.length, 0); same(readonlyLayout.events.length, 0);
const layout = layoutFixture(), layoutPending = layout.context.save(layoutElements, {}, { width: 900, height: 600 });
same(layout.events[0], ['busy', true]); same(layout.sent[0][2].expectedVersion, form.version);
same(layout.sent[0][2].settings.unknown, [false, 0, null]);
same(layout.sent[0][2].settings.frontendDesignContentDocument.version, 'owner-version');
same(layout.sent[0][2].settings.frontendDesignContentDocument.metadata.retained, [false, 0, null]);
same(layout.sent[0][2].settings.frontendDesignElements[0].responsive.mobile.width, 280);
layout.resolve(form); await layoutPending;
same(layout.events.some(row => row[0] === 'saved'), true); same(layout.events.at(-1), ['busy', false]);
for (const transition of ['site', 'selected-form', 'permission', 'unmount', 'away-and-back']) {
  const stale = layoutFixture(), operation = stale.context.save(layoutElements, {}, { width: 900, height: 600 });
  const before = stale.events.length;
  stale.context.saveAuthority.current.epoch += transition === 'away-and-back' ? 2 : 1;
  stale.resolve(form); await operation;
  same(stale.events.length, before); same(stale.sent.length, 1);
}
for (const invalid of [{ ...form, id: 'foreign' }, { ...form, siteId: 'foreign' }, { ...form, version: 'invalid' }]) {
  const invalidLayout = layoutFixture(); invalidLayout.context.updateForm = actualUpdateForm; clientReply = invalid;
  await rejects(invalidLayout.context.save(layoutElements, {}, { width: 900, height: 600 }), /different workspace|incompatible/);
  same(invalidLayout.events.some(row => row[0] === 'saved'), false);
  same(invalidLayout.events.some(row => row[0] === 'notice' && row[1]), false);
  same(invalidLayout.events.at(-1), ['busy', false]);
}
// Reproduce the native forms adapter's omitted disabled target -> {} projection.
// The full actual route render reaches its normal dirty comparison and save
// payload helper chain. Only loaded hook state, router/store boundaries and the
// unmounted canvas module are fixtures; JSX and normalization remain unchanged.
const backendPinModule = { exports: {} as any };
vm.runInNewContext(buildSync({ entryPoints: [new URL('../../public/src/lib/templateInstanceProvenance.ts', import.meta.url).pathname], bundle:true, write:false, format:'cjs', platform:'node', alias:{'@backy-cms/core':new URL('../../../packages/core/src/index.ts',import.meta.url).pathname}, logLevel:'silent' }).outputFiles[0].text, { module:backendPinModule,exports:backendPinModule.exports,require,Buffer });
const minimalTemplate = { id:'native-form-template', type:'form', name:'Native equivalent', version:'1.0.0', content:{fields:[{key:'email',type:'email',label:'Email',required:true}]} };
const baseline = { fieldsByKey:{email:minimalTemplate.content.fields[0]},fieldOrder:['email'],settings:{frontendDesignTemplateId:minimalTemplate.id,frontendDesignOwnerExtension:[false,0,null]} };
const normalPin = JSON.parse(JSON.stringify(backendPinModule.exports.pinTemplateInstance(minimalTemplate,baseline,'form')));
same(backendPinModule.exports.isValidFormTemplateInstancePin(normalPin),true);
const nativeEquivalent = { ...form, name:'native-form', title:'Native-equivalent empty target', collectionTarget:{}, contactShare:{}, fields:[{key:'email',type:'email',label:'Email',required:true,defaultValue:''}], settings:{frontendTemplateInstance:normalPin,frontendDesignTemplateId:minimalTemplate.id,frontendDesignOwnerExtension:[false,0,null]}, createdAt:'2026-10-08T10:00:00.000Z',updatedAt:'2026-10-08T10:00:00.000Z' };
const loadedState:Record<string,unknown> = {
  forms:[nativeEquivalent],formDraft:nativeEquivalent,
  permissionMatrix:{userId:'synthetic-ssr-owner',role:'owner',status:'active',canSignIn:true,groups:[{key:'forms',permissions:['forms.view','forms.edit','forms.create','forms.manage','forms.export','forms.delete','collections.view','activity.export'].map(key=>({key,allowed:true,reason:'Synthetic loaded permission matrix.'}))}]},
  isPermissionsLoading:false,
  inboxByForm:{[formId]:{form:nativeEquivalent,submissions:[],total:0}},
};
const replacements:{start:number;end:number;text:string}[]=[];
function seedLoadedState(node:ts.Node) {
  if(ts.isVariableDeclaration(node)&&ts.isArrayBindingPattern(node.name)&&node.initializer&&ts.isCallExpression(node.initializer)&&node.initializer.expression.getText(formsAst)==='useState') {
    const name=node.name.elements[0].name!.getText(formsAst);
    if(Object.prototype.hasOwnProperty.call(loadedState,name)) {
      const argument=node.initializer.arguments[0]; replacements.push({start:argument.getStart(formsAst),end:argument.end,text:JSON.stringify(loadedState[name])});
    }
  }
  ts.forEachChild(node,seedLoadedState);
}
seedLoadedState(formsAst);same(replacements.length,Object.keys(loadedState).length);
let loadedRouteSource=formsSource;
for(const edit of replacements.sort((a,b)=>b.start-a.start))loadedRouteSource=loadedRouteSource.slice(0,edit.start)+edit.text+loadedRouteSource.slice(edit.end);
const routeModule={exports:{} as any};
const nativeSite={id:siteId,publicSiteId:siteId,slug:'native-equivalent',name:'Native SSR site'};
const sourceRoot=new URL('../src/',import.meta.url).pathname;
vm.runInNewContext(transformSync(loadedRouteSource+'\nmodule.exports.testHelpers={normalizeFormCollectionTarget,buildFormUpdatePayload};',{loader:'tsx',format:'cjs',jsx:'automatic',define:{'import.meta.env':'{}'}}).code,{
 module:routeModule,exports:routeModule.exports,JSON,Date,Set,Map,URL,URLSearchParams,console,
 require:(id:string)=>{
  if(id==='@tanstack/react-router')return{createFileRoute:()=> (options:any)=>({...options,useSearch:()=>({siteId,formId})}),useNavigate:()=>()=>{},Link:({children,to,...props}:any)=>React.createElement('a',{href:to,...props},children)};
  if(id==='@/stores/authStore')return{useAuthStore:(selector:any)=>selector({user:{id:'synthetic-ssr-owner',role:'owner',fullName:'Fixture operator'}})};
  if(id==='@/stores/mockStore')return{useStore:()=>({sites:[nativeSite],pages:[],posts:[]})};
  if(id==='@/components/forms/ImportedFormLayoutEditor')return{ImportedFormLayoutEditor:()=>null};
  if(id.startsWith('@/')){const file=sourceRoot+id.slice(2);for(const ext of ['.ts','.tsx','/index.ts','/index.tsx'])if(existsSync(file+ext))return require(file+ext);}
  return require(id);
 },
},{filename:'forms-loaded-native-equivalent.tsx'});
const nativeMarkup=renderToStaticMarkup(React.createElement(routeModule.exports.Route.component));
same(nativeMarkup.includes('Native-equivalent empty target'),true);
same(nativeMarkup.includes('data-testid="form-builder-panel"'),true);
same(nativeMarkup.includes('value="email"'),true);
same(nativeMarkup.includes('Change the standalone form before saving.'),true);
const nativePayload=JSON.parse(JSON.stringify(routeModule.exports.testHelpers.buildFormUpdatePayload(nativeEquivalent)));
same(nativePayload.collectionTarget,{enabled:false,collectionId:'',fieldMap:{}});
same(nativePayload.fields[0].defaultValue,'');
same(nativePayload.settings.frontendTemplateInstance,normalPin);
same(nativePayload.settings.frontendDesignOwnerExtension,[false,0,null]);
console.log(`Form design clients, actual ordinary/layout save callbacks and SSR passed ${checks} assertions: strict scoped history/pagination, CAS version, cancellation after JSON, single stale attempt, form review namespace, schema conflicts, dirty-layout admission, deferred save context/foreign-response guards and actual native-equivalent empty-target Forms route SSR/payload. Validation, transport and state setters are fixtures; no browser, native SQL or interactive recovery-save proof.`);
