import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { load } from './collection-import-postgres-handlers.mjs';
const require = createRequire(import.meta.url), { NextRequest, NextResponse } = require('next/server'), core = require('@backy-cms/core');
export async function verifyFormTemplateInstances({ repositories, competing = repositories, site, sql, store, demo = false, assertContract, assertDesignContract }) {
 let checks = 0, deny = 0, race = '', followupFailure = false;
 const actorId = demo ? 'synthetic-owner' : randomUUID();
 if (sql) { await sql`INSERT INTO auth.users(id,email) VALUES(${actorId},'form-owner@fixture.invalid')`; await sql`INSERT INTO profiles(id,email,role) VALUES(${actorId},'form-owner@fixture.invalid','owner')`; }
 const permissions = [], actual = repositories.forms;
 const wrapped = { ...repositories, forms: { ...actual, withDefinitionWriteLock: async (siteId, formId, operation) => {
  if (race) { const id = race; race = ''; await competing.forms.update(siteId, id, { notificationEmail: 'winner@fixture.invalid', settings: { ...(await competing.forms.getById(siteId, id)).settings, consent: { policyLabel: 'Newest consent' } } }); }
  return actual.withDefinitionWriteLock(siteId, formId, operation);
 } } };
 const mocks = {
  'next/server': { NextRequest, NextResponse }, '@/lib/backyStore': store || {},
  '@/lib/adminAccess': { requireAdminAccess: async (_request, requestId, options) => { const required = [...(options.permission ? [options.permission] : []), ...(options.permissions || [])]; permissions.push(...required); return (deny && (Number.isInteger(Number(deny)) || required.includes(deny))) ? NextResponse.json({ success: false, requestId }, { status: Number.isInteger(Number(deny)) ? Number(deny) : 403 }) : { session: { user: { id: actorId } } }; } },
  '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => demo, getRequiredDatabaseRepositories: async () => wrapped },
  '@/lib/adminAudit': { recordAdminAudit: async () => { if (followupFailure) throw Error('private failure'); } },
  '@/lib/cacheInvalidation': { recordSiteCacheInvalidation: async () => { if (followupFailure) throw Error('private failure'); } },
  '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: async () => { throw Error('Provider dispatch must not occur'); } },
  '@/lib/formAttachmentLifecycle': { prepareFormAttachmentDeletion: async () => { throw Error('Deletion is outside this fixture'); }, finishFormAttachmentDeletion: async () => { throw Error('Deletion is outside this fixture'); } },
 };
 for (const [key, value] of Object.entries({ ...mocks })) if (key.startsWith('@/lib/')) mocks['./' + key.slice('@/lib/'.length)] = value;
 const design = load('../src/lib/frontendDesignContract.ts', mocks), pin = load('../src/lib/templateInstanceProvenance.ts', mocks), version = load('../src/lib/formDefinitionVersion.ts', mocks);
 const template = { id: 'form-upgrade', name: 'Form design', type: 'form', version: 1, content: {
  fields: [{ key: 'email', label: 'Email', type: 'email', required: true }, { key: 'attachment', label: 'Attachment', type: 'file', required: false, extension: { nested: [false, 0] } }],
  elements: [{ id: 'form-layout', type: 'form', width: 900, children: [{ id: 'form-title', type: 'text', props: { content: 'Default heading', color: 'teal' }, responsive: { mobile: { width: 280 } } }] }],
  canvasSize: { width: 1200, height: 800 }, metadata: { unknown: [false, 0] },
 } };
 let registered = design.normalizeFrontendDesignContract({ status: 'captured', source: { type: 'manual' }, templates: [template] });
 async function commit(frontendDesign) {
  const current = await repositories.sites.getById(site.id), input = { siteId: site.id, expectedDesignFingerprint: pin.templateInstanceFingerprint(current.settings.frontendDesign ?? null), frontendDesign, source: 'fixture' };
  if (demo) store.commitDemoFrontendDesign(input); else await repositories.templateRevisions.commitDesign(input);
  registered = frontendDesign;
 }
 await commit(registered);
 const createRoute = load('../src/app/api/admin/sites/[siteId]/forms/route.ts', mocks);
 const detail = load('../src/app/api/admin/sites/[siteId]/forms/[formId]/route.ts', mocks);
 const instances = load('../src/app/api/admin/sites/[siteId]/templates/[templateId]/instances/route.ts', mocks);
 const versions = load('../src/app/api/admin/sites/[siteId]/forms/[formId]/design-versions/route.ts', mocks);
 const restore = load('../src/app/api/admin/sites/[siteId]/forms/[formId]/design-versions/[revisionId]/restore/route.ts', mocks);
 const request = (path, method, body) => new NextRequest('http://fixture.invalid' + path, { method, headers: { 'content-type': 'application/json' }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) });
 const unpack = async response => ({ status: response.status, cache: response.headers.get('cache-control'), body: await response.json() });
 // A minimal normal card may omit optional routing settings. The real native
 // adapter returns an empty disabled target, which ordinary editor admission must accept.
 const minimalTemplate = { id:'form-minimal-contract',name:'Minimal form',type:'form',version:1,content:{fields:[{key:'email',label:'Email',type:'email',required:true,helpText:'Version one help'}],elements:[{id:'minimal-section',type:'section',children:[{id:'minimal-text',type:'text',props:{content:'Version one'}}]}]} };
 await commit({...registered,templates:[template,minimalTemplate]});
 const minimalCreated = await unpack(await createRoute.POST(request(`/api/admin/sites/${site.id}/forms`,'POST',{frontendDesignTemplateId:minimalTemplate.id,name:'minimal-normal-card'}),{params:Promise.resolve({siteId:site.id})}));
 assert.equal(minimalCreated.status,201,JSON.stringify(minimalCreated.body));
 const minimalForm = minimalCreated.body.data.form;
 assert.equal(minimalForm.name,'minimal-normal-card'); assert.equal(minimalForm.title,'Minimal form'); assert.deepEqual(minimalForm.fields,minimalTemplate.content.fields); assert.equal(minimalForm.fieldsByKey,undefined); assert.equal(minimalForm.settings.fieldsByKey,undefined); assert.deepEqual(minimalForm.settings.frontendTemplateInstance.baseContent.fieldOrder,['email']); assert(pin.isValidFormTemplateInstancePin(minimalForm.settings.frontendTemplateInstance)); checks += 8;
 const minimalRead = await unpack(await detail.GET(request(`/api/admin/sites/${site.id}/forms/${minimalForm.id}`,'GET'),{params:Promise.resolve({siteId:site.id,formId:minimalForm.id})}));
 assert.equal(minimalRead.status,200); assert.deepEqual(minimalRead.body.data.form.fields,minimalTemplate.content.fields); assert.equal(minimalRead.body.data.form.name,'minimal-normal-card'); checks += 3;
 if (sql) { assert.deepEqual(minimalForm.collectionTarget,{}); assert.deepEqual(minimalRead.body.data.form.collectionTarget,{}); checks += 2; }
 await commit({...registered,templates:[template]});
 const create = async name => unpack(await createRoute.POST(request(`/api/admin/sites/${site.id}/forms`, 'POST', {
  frontendDesignTemplateId: template.id, name, title: 'Current form title', isActive: false, audience: 'authenticated', notificationEmail: 'old@fixture.invalid', notificationWebhook: null,
  settings: { spam: { minFillMs: 1500 }, consent: { policyLabel: 'Original consent' }, frontendFieldKeyMap: { externalEmail: 'email' }, editorFormBlockProps: { formId: 'protected-owner-id' }, operationalExtension: [false, 0] },
  contactShare: { enabled: false }, collectionTarget: { enabled: false, collectionId: '' },
 }), { params: Promise.resolve({ siteId: site.id }) }));
 const created = await create('form-good'); assert.equal(created.status, 201, JSON.stringify(created.body)); checks++;
 const good = created.body.data.form; assert.match(good.version, /^form-v1:[a-f0-9]{64}$/); assert(pin.isValidFormTemplateInstancePin(good.settings.frontendTemplateInstance)); checks += 2;
 const second = await create('form-stale'); assert.equal(second.status, 201); checks++;
 const stale = second.body.data.form;
 let retainedOperational;
 const operationalSnapshot = async () => {
  const tables = ['form_submissions', 'form_contacts', 'form_delivery_attempts', 'form_delivery_reconciliations'];
  return Promise.all(tables.map(table => sql.unsafe(`SELECT row_to_json(t) AS row FROM ${table} t WHERE site_id=$1 ORDER BY id`, [site.id])));
 };
 if (sql) {
  const submissionId = randomUUID(), attemptId = randomUUID();
  await sql`INSERT INTO form_submissions(id,site_id,form_id,values,status,request_id) VALUES(${submissionId},${site.id},${good.id},${sql.json({ email: 'retained@fixture.invalid', attachment: [{ name: 'private-file' }], consent: { granted: true } })},'approved','retained-submission')`;
  await sql`INSERT INTO form_contacts(site_id,form_id,email,source_submission_id) VALUES(${site.id},${good.id},'retained@fixture.invalid',${submissionId})`;
  await sql`INSERT INTO form_delivery_attempts(id,site_id,form_id,submission_id,kind,channel,target,request_id,state) VALUES(${attemptId},${site.id},${good.id},${submissionId},'form-submission','email','retained@fixture.invalid','retained-attempt','pending')`;
  await sql`INSERT INTO form_delivery_reconciliations(site_id,attempt_id,version,actor_id,request_id,observed_updated_at,observed_state,evidence,disposition) SELECT ${site.id},id,1,${actorId},'retained-review',updated_at,'pending','outcome-unavailable','retain-without-resend' FROM form_delivery_attempts WHERE id=${attemptId}`;
  retainedOperational = await operationalSnapshot();
 }
 const patch = async (form, input) => unpack(await detail.PATCH(request(`/api/admin/sites/${site.id}/forms/${form.id}`, 'PATCH', input), { params: Promise.resolve({ siteId: site.id, formId: form.id }) }));
 const ownerSettings = structuredClone(good.settings); ownerSettings.frontendDesignElements[0].props = { formId: good.id, formName: good.name, formActive: false };
 ownerSettings.frontendDesignElements[0].children[0].props.content = 'Owner nested heading'; ownerSettings.frontendDesignOwnerExtension = { nested: [false, 0] };
 const authored = await patch(good, { expectedVersion: good.version, settings: ownerSettings }); assert.equal(authored.status, 200, JSON.stringify(authored.body)); checks++;
 const before = await actual.getById(site.id, good.id);
 const target = structuredClone(template); target.version = 2; target.content.elements[0].width = 1100; target.content.elements[0].children[0].props.color = 'navy'; target.content.fields[0].helpText = 'New help';
 await commit({ ...registered, templates: [target] });
 const revisions = demo ? store.listTemplateRevisions(site.id, template.id, { limit: 100 }).items : (await repositories.templateRevisions.list({ siteId: site.id, templateId: template.id, limit: 100 })).items;
 const targetRevision = revisions.find(item => item.fingerprint === pin.templateInstanceFingerprint(target)); assert(targetRevision); checks++;
 const call = async (action, ids = [], reviewVersion, revisionId = targetRevision.id) => {
  const body = { targetType: 'form', action, targetRevisionId: revisionId, selection: ids.map(id => ({ type: 'form', id })), ...(reviewVersion ? { reviewVersion } : {}) };
  assertContract?.('request', body);
  const result = await unpack(await instances.POST(request(`/api/admin/sites/${site.id}/templates/${template.id}/instances`, 'POST', body), { params: Promise.resolve({ siteId: site.id, templateId: template.id }) }));
  if (!deny) assertContract?.(result.status, result.body);
  return result;
 };
 const history = async (id = good.id, query = '') => {
  const result = await unpack(await versions.GET(request(`/api/admin/sites/${site.id}/forms/${id}/design-versions${query}`, 'GET'), { params: Promise.resolve({ siteId: site.id, formId: id }) }));
  if (!deny) assertDesignContract?.(result.status, result.body);
  return result;
 };
 const recover = async (id, revisionId, expectedVersion) => {
  const body = { expectedVersion }; assertDesignContract?.('request', body, true);
  const result = await unpack(await restore.POST(request(`/api/admin/sites/${site.id}/forms/${id}/design-versions/${revisionId}/restore`, 'POST', body), { params: Promise.resolve({ siteId: site.id, formId: id, revisionId }) }));
  if (!deny) assertDesignContract?.(result.status, result.body, true);
  return result;
 };
 const reviewed = await call('review', [good.id]); assert.equal(reviewed.status, 200, JSON.stringify(reviewed.body)); assert.equal(reviewed.cache, 'private, no-store'); assert.equal(reviewed.body.data.canApply, true); assert.equal(reviewed.body.data.scanned.forms >= 2, true); checks += 4;
 followupFailure = true; const applied = await call('apply', [good.id], reviewed.body.data.reviewVersion); followupFailure = false;
 assert.equal(applied.status, 200, JSON.stringify(applied.body)); assert.equal(applied.body.data.appliedTargets.length, 1); assert(applied.body.data.completionWarnings.includes('TEMPLATE_INSTANCE_AUDIT_PENDING')); assert(!JSON.stringify(applied.body).includes('private failure')); checks += 4;
 const saved = await actual.getById(site.id, good.id);
 assert.equal(saved.settings.frontendDesignElements[0].width, 1100); assert.equal(saved.settings.frontendDesignElements[0].children[0].props.content, 'Owner nested heading'); assert.equal(saved.settings.frontendDesignElements[0].children[0].props.color, 'navy');
 assert.equal(saved.settings.frontendDesignElements[0].children[0].responsive.mobile.width, 280); assert.deepEqual(saved.settings.frontendDesignElements[0].props, before.settings.frontendDesignElements[0].props); assert.deepEqual(saved.settings.frontendDesignOwnerExtension, { nested: [false, 0] }); assert.equal(saved.fields[0].helpText, 'New help'); checks += 7;
 for (const key of ['name', 'title', 'description', 'audience', 'isActive', 'pageId', 'postId', 'notificationEmail', 'notificationWebhook', 'enableCaptcha', 'enableHoneypot', 'moderationMode', 'contactShare', 'collectionTarget', 'successMessage', 'successRedirectUrl']) { assert.deepEqual(saved[key], before[key]); checks++; }
 for (const key of ['spam', 'consent', 'frontendFieldKeyMap', 'editorFormBlockProps', 'operationalExtension']) { assert.deepEqual(saved.settings[key], before.settings[key]); checks++; }
 assert(pin.isValidFormTemplateInstancePin(saved.settings.frontendTemplateInstance)); assert.equal(saved.settings.frontendTemplateInstance.templateFingerprint, targetRevision.fingerprint); checks += 2;
 const journal = await history(); assert.equal(journal.status, 200); assert.equal(journal.body.data.revisions.length, 1); assert.equal(journal.body.data.revisions[0].snapshot, undefined); assert.equal(journal.body.data.revisions[0].hasPinnedBaseline, true); checks += 4;
 const newer = await patch(saved, { expectedVersion: version.formDefinitionVersion(saved), notificationEmail: 'latest@fixture.invalid', isActive: true, settings: { consent: { policyLabel: 'Latest consent' } } }); assert.equal(newer.status, 200); checks++;
 assert.equal((await recover(good.id, journal.body.data.revisions[0].id, journal.body.data.currentVersion)).status, 409); checks++;
 const latest = await history(), restored = await recover(good.id, journal.body.data.revisions[0].id, latest.body.data.currentVersion); assert.equal(restored.status, 200, JSON.stringify(restored.body)); checks++;
 const reverted = await actual.getById(site.id, good.id);
 assert.deepEqual(core.canonicalFormTemplateDesign(reverted), core.canonicalFormTemplateDesign(before)); assert.equal(reverted.notificationEmail, 'latest@fixture.invalid'); assert.equal(reverted.isActive, true); assert.deepEqual(reverted.settings.consent, { policyLabel: 'Latest consent' }); assert.deepEqual(reverted.settings.frontendTemplateInstance, before.settings.frontendTemplateInstance); assert.equal((await history()).body.data.revisions.length, 2); checks += 6;
 const refreshed = await call('review', [good.id]); assert.equal(refreshed.body.data.canApply, true); checks++;
 const staleReview = await call('review', [stale.id]); await actual.update(site.id, stale.id, { notificationEmail: 'competing@fixture.invalid' }); assert.equal((await call('apply', [stale.id], staleReview.body.data.reviewVersion)).status, 409); assert.equal((await actual.listFormDesignRevisions(site.id, stale.id)).length, 0); checks += 2;
 if (!demo) { const late = await call('review', [stale.id]); race = stale.id; assert.equal((await call('apply', [stale.id], late.body.data.reviewVersion)).status, 409); assert.equal((await actual.getById(site.id, stale.id)).notificationEmail, 'winner@fixture.invalid'); assert.equal((await actual.listFormDesignRevisions(site.id, stale.id)).length, 0); checks += 3; }
 const overlap = await patch(reverted, { expectedVersion: version.formDefinitionVersion(reverted), settings: { frontendDesignElements: [{ ...reverted.settings.frontendDesignElements[0], width: 800 }] } }); assert.equal(overlap.status, 200); checks++;
 const blocked = await call('review', [good.id]); assert.equal(blocked.body.data.canApply, false); assert.equal(blocked.body.data.targets.find(row => row.id === good.id).state, 'blocked'); assert.equal((await call('apply', [good.id], blocked.body.data.reviewVersion)).status, 422); assert.equal((await actual.getById(site.id, good.id)).settings.frontendDesignElements[0].width, 800); checks += 4;
 const mixed = await call('review', [good.id, stale.id]); assert.equal(mixed.body.data.canApply, false); assert.equal((await call('apply', [good.id, stale.id], mixed.body.data.reviewVersion)).status, 422); assert.equal((await actual.listFormDesignRevisions(site.id, stale.id)).length, 0); checks += 3;
 for (const [property, value] of [['type', 'text'], ['required', false], ['options', ['new']], ['validation', [{ type: 'minLength', value: 4, message: 'Need more' }]], ['defaultValue', 'new'], ['extension', { changed: true }]]) {
  const incompatible = structuredClone(target); incompatible.version = 3; incompatible.content.fields[0][property] = value; await commit({ ...registered, templates: [incompatible] });
  const list = demo ? store.listTemplateRevisions(site.id, template.id, { limit: 100 }).items : (await repositories.templateRevisions.list({ siteId: site.id, templateId: template.id, limit: 100 })).items;
  const revision = list.find(item => item.fingerprint === pin.templateInstanceFingerprint(incompatible));
  const review = await call('review', [stale.id], undefined, revision.id); assert.equal(review.status, 200, JSON.stringify(review.body)); assert.equal(review.body.data.canApply, false); assert(review.body.data.targets.find(row => row.id === stale.id).conflicts.some(row => row.code === 'SCHEMA_INCOMPATIBLE' && row.path === '/fields/@email/' + property)); assert.equal((await call('apply', [stale.id], review.body.data.reviewVersion, revision.id)).status, 422); checks += 4;
 }
 for (const change of ['add', 'remove', 'key']) {
  const incompatible = structuredClone(target); incompatible.version = 3;
  if (change === 'add') incompatible.content.fields.push({ key: 'added', label: 'Added', type: 'text', required: false });
  if (change === 'remove') incompatible.content.fields.pop();
  if (change === 'key') incompatible.content.fields[0].key = 'renamed';
  await commit({ ...registered, templates: [incompatible] });
  const list = demo ? store.listTemplateRevisions(site.id, template.id, { limit: 100 }).items : (await repositories.templateRevisions.list({ siteId: site.id, templateId: template.id, limit: 100 })).items;
  const revision = list.find(item => item.fingerprint === pin.templateInstanceFingerprint(incompatible)), review = await call('review', [stale.id], undefined, revision.id);
  assert.equal(review.status, 200); assert.equal(review.body.data.canApply, false); assert(review.body.data.targets.find(row => row.id === stale.id).conflicts.every(row => row.code === 'SCHEMA_INCOMPATIBLE')); assert.equal((await call('apply', [stale.id], review.body.data.reviewVersion, revision.id)).status, 422); checks += 4;
 }
 const invalidTemplate = structuredClone(template); invalidTemplate.content.fields[0].type = 'unrecognized';
 assert.equal(design.seedFormInputFromFrontendDesignTemplate({ siteSettings: { frontendDesign: { ...registered, templates: [invalidTemplate] } }, body: { frontendDesignTemplateId: template.id } }).ok, false); checks++;
 const changedSchema = await actual.getById(site.id, good.id); await actual.update(site.id, good.id, { fields: changedSchema.fields.map(field => ({ ...field, required: false })) });
 assert.equal((await recover(good.id, journal.body.data.revisions[0].id, (await history()).body.data.currentVersion)).status, 422); checks++;
 for (const status of [401, 403]) { deny = status; assert.equal((await call('review')).status, status); assert.equal((await history()).status, status); checks += 2; } deny = 0;
 deny = 'forms.edit'; assert.equal((await call('apply', [], 'template-form-instances-v1:' + 'a'.repeat(64))).status, 403); checks++; deny = 0;
 assert(permissions.every(permission => ['forms.view', 'forms.edit', 'forms.create'].includes(permission))); checks++;
 // Whole-site recovery changes identities and deactivates forms. Exercise an
 // actual captured binding in both current content and a trusted pinned baseline.
 await commit({ ...registered, templates: [target] });
 const backupCreated = await create('form-backup'); assert.equal(backupCreated.status, 201); checks++;
 const backupForm = backupCreated.body.data.form, bound = { formId: backupForm.id, formName: backupForm.name, formActive: true };
 const backupSettings = structuredClone(backupForm.settings); backupSettings.frontendDesignElements[0].props = bound; backupSettings.editorFormBlockProps = bound;
 assert.equal((await patch(backupForm, { expectedVersion: backupForm.version, isActive: true, settings: backupSettings })).status, 200); checks++;
 const captured = structuredClone(target); captured.version = 5; captured.content.elements[0].props = bound;
 let boundPreimage;
 for (const width of [1100, 1300]) {
  captured.content.elements[0].width = width; captured.version++;
  await commit({ ...registered, templates: [structuredClone(captured)] });
  const retained = demo ? store.listTemplateRevisions(site.id,template.id,{limit:100}).items : (await repositories.templateRevisions.list({siteId:site.id,templateId:template.id,limit:100})).items;
  const revision = retained.find(item => item.fingerprint === pin.templateInstanceFingerprint(captured));
  const review = await call('review',[backupForm.id],undefined,revision.id); assert.equal(review.status,200); assert.equal(review.body.data.canApply,true);
  const apply = await call('apply',[backupForm.id],review.body.data.reviewVersion,revision.id); assert.equal(apply.status,200); assert.equal(apply.body.data.appliedTargets.length,1); checks += 4;
  boundPreimage = revision;
 }
 const backupGraph = demo ? store.captureDemoSiteBackup(site.id) : await repositories.siteBackups.snapshot(site.id,async graph => graph);
 const untouchedSource = structuredClone(backupGraph), idMap = new Map([[site.id,randomUUID()]]);
 for (const table of core.SITE_BACKUP_TABLES) for (const row of backupGraph.tables[table]) idMap.set(row.id,randomUUID());
 const backupHelpers = load('../src/lib/formTemplateBackup.ts',mocks);
 const restoreInput = { name:'Recovered form fixture',slug:'form-recovered-'+randomUUID().slice(0,8),teamId:site.teamId,actorId:null,remapFormTemplatePin:backupHelpers.remapRestoredFormTemplatePin,remapFormTemplateRevisionFingerprint:backupHelpers.remapRestoredFormTemplateRevisionFingerprint };
 const recoveredGraph = core.prepareSiteBackupDraft(backupGraph,idMap,restoreInput);
 const recoveredSiteId = recoveredGraph.site.id, recoveredFormId = idMap.get(backupForm.id), recoveredForm = recoveredGraph.tables.formDefinitions.find(row => row.id===recoveredFormId);
 assert.equal(recoveredForm.isActive,false); assert.deepEqual(recoveredForm.settings.frontendDesignElements[0].props,{formId:recoveredFormId,formName:backupForm.name,formActive:false}); assert.deepEqual(recoveredForm.settings.editorFormBlockProps,recoveredForm.settings.frontendDesignElements[0].props); assert(pin.isValidFormTemplateInstancePin(recoveredForm.settings.frontendTemplateInstance)); checks += 4;
 const recoveredPreimage = recoveredGraph.tables.formDesignRevisions.find(row => row.formId===recoveredFormId && row.snapshot.pin?.baseContent.settings.frontendDesignElements?.[0].props?.formId===recoveredFormId);
 assert(recoveredPreimage); assert(pin.isValidFormTemplateInstancePin(recoveredPreimage.snapshot.pin)); assert.equal(recoveredPreimage.snapshot.design.settings.frontendDesignElements[0].props.formActive,false); assert.equal(recoveredPreimage.snapshot.pin.baseContent.settings.frontendDesignElements[0].props.formActive,false); checks += 4;
 const recoveredRevision = recoveredGraph.tables.templateRevisions.find(row => row.id===idMap.get(boundPreimage.id));
 assert.equal(recoveredRevision.snapshot.content.elements[0].props.formId,recoveredFormId); assert.equal(recoveredRevision.snapshot.content.elements[0].props.formActive,false); assert.equal(recoveredRevision.fingerprint,pin.templateInstanceFingerprint(recoveredRevision.snapshot)); checks += 3;
 const invalidSource = structuredClone(backupGraph), invalidForm = invalidSource.tables.formDefinitions.find(row => row.id===backupForm.id); invalidForm.settings.frontendTemplateInstance.baseContentFingerprint='invalid';
 const refusedPin = core.prepareSiteBackupDraft(invalidSource,idMap,restoreInput).tables.formDefinitions.find(row => row.id===recoveredFormId).settings.frontendTemplateInstance; assert.equal(refusedPin,undefined); assert.deepEqual(backupGraph,untouchedSource); checks += 2;
 if (demo) store.commitDemoSiteBackup(recoveredGraph,site.id);
 else {
  const job = await repositories.siteBackups.createJob({sourceSiteId:site.id,targetSiteId:recoveredSiteId,files:[],storageIdentity:'f'.repeat(64)});
  await repositories.siteBackups.commit(job.id,site.id,recoveredGraph);
 }
 const recoveredHistory = await unpack(await versions.GET(request(`/api/admin/sites/${recoveredSiteId}/forms/${recoveredFormId}/design-versions`,'GET'),{params:Promise.resolve({siteId:recoveredSiteId,formId:recoveredFormId})}));
 assertDesignContract?.(recoveredHistory.status,recoveredHistory.body); assert.equal(recoveredHistory.status,200); assert(recoveredHistory.body.data.revisions.some(row=>row.id===recoveredPreimage.id)); checks += 2;
 const recoveredRestore = await unpack(await restore.POST(request(`/api/admin/sites/${recoveredSiteId}/forms/${recoveredFormId}/design-versions/${recoveredPreimage.id}/restore`,'POST',{expectedVersion:recoveredHistory.body.data.currentVersion}),{params:Promise.resolve({siteId:recoveredSiteId,formId:recoveredFormId,revisionId:recoveredPreimage.id})}));
 assertDesignContract?.(recoveredRestore.status,recoveredRestore.body,true); assert.equal(recoveredRestore.status,200,JSON.stringify(recoveredRestore.body)); assert.equal(recoveredRestore.body.data.form.isActive,false); assert.equal(recoveredRestore.body.data.form.settings.frontendDesignElements[0].props.formId,recoveredFormId); assert.equal(recoveredRestore.body.data.form.settings.frontendDesignElements[0].props.formActive,false); assert(pin.isValidFormTemplateInstancePin(recoveredRestore.body.data.form.settings.frontendTemplateInstance)); checks += 5;
 const recoveredReview = await unpack(await instances.POST(request(`/api/admin/sites/${recoveredSiteId}/templates/${template.id}/instances`,'POST',{targetType:'form',action:'review',targetRevisionId:recoveredRevision.id,selection:[{type:'form',id:recoveredFormId}]}),{params:Promise.resolve({siteId:recoveredSiteId,templateId:template.id})}));
 assertContract?.(recoveredReview.status,recoveredReview.body); assert.equal(recoveredReview.status,200,JSON.stringify(recoveredReview.body)); assert.equal(recoveredReview.body.data.canApply,true); assert.equal(recoveredReview.body.data.targets.find(row=>row.id===recoveredFormId).state,'ready'); checks += 3;
 const malformedCreated = await create('form-malformed-pin'); assert.equal(malformedCreated.status,201); checks++;
 const malformedSettings = structuredClone(malformedCreated.body.data.form.settings); malformedSettings.frontendTemplateInstance.baseContentFingerprint='0'.repeat(64);
 await actual.update(site.id,malformedCreated.body.data.form.id,{settings:malformedSettings});
 const malformedReview = await call('review',[malformedCreated.body.data.form.id]); assert.equal(malformedReview.status,200);
 const malformedSummary = malformedReview.body.data.targets.find(row=>row.id===malformedCreated.body.data.form.id); assert.equal(malformedSummary.state,'blocked'); assert.equal(malformedSummary.pinnedFingerprint,null); assert.equal(malformedSummary.conflicts[0].code,'INVALID_PROVENANCE'); assert.equal((await call('apply',[malformedSummary.id],malformedReview.body.data.reviewVersion)).status,422); checks += 5;
 if (sql) {
  assert.deepEqual(await operationalSnapshot(), retainedOperational); checks++;
  const rollbackBefore = await actual.getById(site.id, stale.id), rollbackReview = await call('review', [stale.id]);
  await sql.unsafe(`CREATE FUNCTION fixture_reject_form_upgrade() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${stale.id}'::uuid THEN RAISE EXCEPTION 'Private synthetic form failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_reject_form_upgrade BEFORE UPDATE ON form_definitions FOR EACH ROW EXECUTE FUNCTION fixture_reject_form_upgrade()`);
  try {
   const failed = await call('apply', [stale.id], rollbackReview.body.data.reviewVersion); assert.equal(failed.status, 200); assert.equal(failed.body.data.failedTargets[0].code, 'WRITE_FAILED'); assert.deepEqual(await actual.getById(site.id, stale.id), rollbackBefore); assert.equal((await actual.listFormDesignRevisions(site.id, stale.id)).length, 0); checks += 4;
  } finally { await sql.unsafe('DROP TRIGGER fixture_reject_form_upgrade ON form_definitions; DROP FUNCTION fixture_reject_form_upgrade()'); }
  const unsafeBindings = structuredClone(rollbackBefore.settings); unsafeBindings.frontendDesignElements[0].props = { formId: good.id };
  await assert.rejects(actual.update(site.id, stale.id, { expectedForm: rollbackBefore, settings: unsafeBindings, beforeUpdateFormDesignRevision: { operation: 'template-upgrade', requestId: 'invalid-binding' } }), /BINDING_INCOMPATIBLE/); assert.equal((await actual.listFormDesignRevisions(site.id, stale.id)).length, 0); checks += 2;
  const duplicateBindings = structuredClone(rollbackBefore.settings); duplicateBindings.frontendDesignElements = [{id:'duplicate',props:{formId:stale.id}},{id:'duplicate',props:{formId:stale.id}}];
  await actual.update(site.id,stale.id,{settings:duplicateBindings}); const duplicateBefore = await actual.getById(site.id,stale.id);
  const redirected = structuredClone(duplicateBindings); redirected.frontendDesignElements[1].props.formId=good.id;
  await assert.rejects(actual.update(site.id,stale.id,{expectedForm:duplicateBefore,settings:redirected,beforeUpdateFormDesignRevision:{operation:'template-upgrade',requestId:'duplicate-binding-bypass'}}),/BINDING_INCOMPATIBLE/);
  assert.deepEqual(await actual.getById(site.id,stale.id),duplicateBefore); assert.equal((await actual.listFormDesignRevisions(site.id,stale.id)).length,0); checks += 3;
  await actual.update(site.id,stale.id,{settings:rollbackBefore.settings});
  const mediaBefore = await actual.getById(site.id,stale.id);
  const missingMedia = structuredClone(target); missingMedia.version = 4; missingMedia.content.elements[0].props = { mediaId: randomUUID() }; await commit({ ...registered, templates: [missingMedia] });
  const mediaRevision = (await repositories.templateRevisions.list({ siteId: site.id, templateId: template.id, limit: 100 })).items.find(item => item.fingerprint === pin.templateInstanceFingerprint(missingMedia));
  const mediaReview = await call('review', [stale.id], undefined, mediaRevision.id), missingMediaResult = await call('apply', [stale.id], mediaReview.body.data.reviewVersion, mediaRevision.id);
  assert.equal(missingMediaResult.status, 200, JSON.stringify(missingMediaResult.body)); assert.equal(missingMediaResult.body.data.failedTargets[0].code, 'WRITE_FAILED'); assert.deepEqual(await actual.getById(site.id, stale.id), mediaBefore); assert.equal((await actual.listFormDesignRevisions(site.id, stale.id)).length, 0); checks += 4;
  for (const role of ['anon', 'authenticated']) { const [privilege] = await sql`SELECT has_table_privilege(${role},'public.form_design_revisions','SELECT') AS read,has_table_privilege(${role},'public.form_design_revisions','INSERT') AS write,has_table_privilege(${role},'public.form_design_revisions','TRUNCATE') AS truncate`; assert.equal(privilege.read, false); assert.equal(privilege.write, false); assert.equal(privilege.truncate, false); checks += 3; }
  await assert.rejects(sql`UPDATE form_design_revisions SET request_id='mutate' WHERE form_id=${good.id}`); await assert.rejects(sql`DELETE FROM form_design_revisions WHERE form_id=${good.id}`); await assert.rejects(sql.unsafe('TRUNCATE form_design_revisions')); checks += 3;
  const backup = await repositories.siteBackups.snapshot(site.id, async graph => graph); assert(backup.tables.formDesignRevisions.some(row => row.formId === good.id)); const legacy = structuredClone(backup); delete legacy.tables.formDesignRevisions; core.assertSiteBackupGraph(legacy, site.id); assert.deepEqual(legacy.tables.formDesignRevisions, []); checks += 2;
  const malformed = structuredClone(backup); malformed.tables.formDesignRevisions = 'invalid'; assert.throws(() => core.assertSiteBackupGraph(malformed, site.id)); checks++;
  const tailSnapshot = core.snapshotFormTemplateDesign(rollbackBefore);
  await sql`INSERT INTO form_design_revisions(site_id,form_id,snapshot,operation,request_id) SELECT ${site.id},${stale.id},${sql.json(tailSnapshot)},'template-upgrade','pagination-fixture' FROM generate_series(1,101)`;
  const firstPage = await history(stale.id), tail = await history(stale.id, '?offset=100&limit=100'); assert.equal(firstPage.body.data.revisions.length, 100); assert.equal(firstPage.body.data.pagination.hasMore, true); assert.equal(firstPage.body.data.pagination.nextOffset, 100); assert.equal(tail.body.data.revisions.length, 1); assert.equal(tail.body.data.pagination.hasMore, false); checks += 5;
  assert.equal((await recover(stale.id, tail.body.data.revisions[0].id, tail.body.data.currentVersion)).status, 200); checks++;
  const legacySnapshot = core.snapshotFormTemplateDesign(await actual.getById(site.id, stale.id)); legacySnapshot.pin.templateFingerprint = 'invalid';
  const [legacyRevision] = await sql`INSERT INTO form_design_revisions(site_id,form_id,snapshot,operation,request_id) VALUES(${site.id},${stale.id},${sql.json(legacySnapshot)},'template-upgrade','legacy-invalid-pin') RETURNING id`;
  assert.equal((await recover(stale.id, legacyRevision.id, (await history(stale.id)).body.data.currentVersion)).status, 200); assert.equal((await actual.getById(site.id, stale.id)).settings.frontendTemplateInstance, undefined); assert.equal((await call('review', [stale.id])).body.data.targets.find(row => row.id === stale.id).conflicts[0].code, 'UNPINNED_INSTANCE'); checks += 3;
  assert.deepEqual(await operationalSnapshot(), retainedOperational); checks++;
  await actual.delete(site.id, stale.id); assert.equal((await actual.listFormDesignRevisions(site.id, stale.id)).length, 0); checks++;
 }
 console.log(`Form template actual ${demo ? 'demo' : sql ? 'native PostgreSQL' : 'repository'} handler checks passed ${checks}; exact schema/presentation-only upgrades, full-definition CAS, private recovery and latest operational fields; synthetic sessions/providers.`);
 return checks;
}
