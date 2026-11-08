import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import * as coreModule from '@backy-cms/core';
import * as runtimeModule from '../src/lib/repositoryRuntime.ts';
import * as sessionsModule from '../src/lib/admin-auth/sessionStore.ts';
import * as designModule from '../src/lib/frontendDesignContract.ts';
import * as historyModule from '../src/lib/templateHistory.ts';
import * as designRoute from '../src/app/api/admin/sites/[siteId]/frontend-design/route.ts';
import * as historyRoute from '../src/app/api/admin/sites/[siteId]/templates/[templateId]/revisions/route.ts';
import * as allHistoryRoute from '../src/app/api/admin/sites/[siteId]/templates/revisions/route.ts';
import * as restoreRoute from '../src/app/api/admin/sites/[siteId]/templates/[templateId]/revisions/[revisionId]/restore/route.ts';
import * as siteRoute from '../src/app/api/admin/sites/[siteId]/route.ts';
import * as settingsRoute from '../src/app/api/admin/sites/[siteId]/settings/route.ts';
const runtime = runtimeModule.default || runtimeModule, sessions = sessionsModule.default || sessionsModule;
const { DEFAULT_SITE_SETTINGS, changedTemplateRevisionSnapshots } = (coreModule as any).default || coreModule;
const design = designModule.default || designModule, history = historyModule.default || historyModule;
const designApi = designRoute.default || designRoute, historyApi = historyRoute.default || historyRoute, allHistoryApi = allHistoryRoute.default || allHistoryRoute, restoreApi = restoreRoute.default || restoreRoute;
const siteApi = siteRoute.default || siteRoute, settingsApi = settingsRoute.default || settingsRoute;
process.env.BACKY_DATA_MODE = 'database';
const initial = design.normalizeFrontendDesignContract({ status: 'captured', source: { type: 'manual' }, tokens: { colors: { primary: 'teal' } }, chrome: { header: { id: 'header' } }, templates: [
 { id: 'article', type: 'blogPost', name: 'Article', version: 1, status: 'active', updatedAt: '2026-01-01T00:00:00.000Z', customExtension: { keep: true }, content: { elements: [{ id: 'copy', type: 'text', width: 600, height: 80, props: { content: 'Original' }, animation: { type: 'fadeIn' }, responsive: { mobile: { width: 300 } } }], customCSS: '.copy{color:teal}', customJS: '/* retained inert template source */', assets: [{ mediaId: 'hero' }], dataBindings: [{ targetPath: 'props.title', source: { collectionId: 'titles' } }] } },
 { id: 'unrelated', type: 'page', name: 'Unrelated', version: 1, content: { elements: [] } },
] });
let site: any = { id: 'history-site', slug: 'history-site', name: 'History site', teamId: 'history-team', isPublished: false, theme: { colors: {}, fonts: {} }, settings: { ...structuredClone(DEFAULT_SITE_SETTINGS), frontendDesign: initial, providerSecret: 'MUST_NOT_BE_SNAPSHOTTED' } };
const foreign = { ...site, id: 'foreign-site', slug: 'foreign-site', teamId: 'foreign-team' };
let auth: Record<string, unknown> = {}; const snapshots: any[] = [], audits: any[] = []; let failSnapshots = false;
const user = { id: 'history-admin', fullName: 'History Admin', email: 'history-admin@example.com', role: 'admin' as const, status: 'active' as const };
const viewer = { ...user, id: 'history-viewer', email: 'history-viewer@example.com' };
const memberRoles = new Map([[user.id, 'admin'], [viewer.id, 'viewer']]);
const repositories: any = {
 users: { getById: async (id: string) => id === user.id ? user : id === viewer.id ? viewer : null },
 sites: { getById: async (id: string) => id === site.id ? structuredClone(site) : id === foreign.id ? structuredClone(foreign) : null, getBySlug: async () => null,
  update: async (id: string, input: any) => { assert.equal(id, site.id); const defined = structuredClone(Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))); site = { ...site, ...defined, ...(input.settings ? { settings: { ...site.settings, ...input.settings } } : {}) }; return { item: structuredClone(site) }; } },
 teams: { listMembers: async ({ teamId }: any) => ({ items: teamId === site.teamId ? [...memberRoles].map(([userId, role]) => ({ userId, role, status: 'active' })) : [], pagination: { total: 2, offset: 0, limit: 100, hasMore: false } }) },
 settings: { get: async () => ({ auth, apiKeys: {} }), update: async (next: any) => { auth = next.auth; } },
 auditLogs: { record: async (input: any) => { const record = { id: randomUUID(), createdAt: new Date().toISOString(), ...structuredClone(input) }; audits.push(record); return record; } },
 cacheInvalidations: { record: async (input: any) => ({ ...input, revision: randomUUID(), createdAt: new Date().toISOString() }) },
 pages: { getById: async (siteId: string, pageId: string) => siteId === site.id && pageId === 'capture-page' ? { id: pageId, title: 'Captured page', slug: 'capture', content: { elements: [{ id: 'page-copy', type: 'text', props: { content: 'Captured' }, width: 800, height: 90 }], canvas: { width: 1200, height: 900 }, animations: [{ type: 'fadeIn' }] } } : null, list: async () => ({ items: [{ id: 'capture-page', title: 'Captured page', slug: 'capture' }], pagination: { total: 1, offset: 0, limit: 100, hasMore: false } }) },
 templateRevisions: {
  list: async ({ siteId, templateId, limit = 25, offset = 0 }: any) => { const entries = snapshots.filter(item => item.siteId === siteId && (!templateId || item.templateId === templateId)); return { items: structuredClone(entries.slice(offset, offset + limit)), pagination: { total: entries.length, limit, offset, hasMore: offset + limit < entries.length } }; },
  get: async (siteId: string, templateId: string, revisionId: string) => structuredClone(snapshots.find(item => item.siteId === siteId && item.templateId === templateId && item.id === revisionId) || null),
  commitDesign: async (input: any) => {
   if (input.expectedDesignFingerprint !== history.templateRevisionFingerprint(site.settings.frontendDesign)) throw Object.assign(new Error('Reload history'), { code: 'TEMPLATE_HISTORY_CONFLICT' });
   if (failSnapshots) throw new Error('Snapshot storage unavailable');
   for (const change of changedTemplateRevisionSnapshots(site.settings.frontendDesign.templates, input.frontendDesign.templates)) {
    const fingerprint = history.templateRevisionFingerprint(change.snapshot);
    if (change.operation === 'baseline' && snapshots.some(item => item.siteId === site.id && item.templateId === change.snapshot.id && item.fingerprint === fingerprint)) continue;
    snapshots.unshift({ schemaVersion: 'backy.template-revision.v1', id: randomUUID(), siteId: site.id, templateId: change.snapshot.id, snapshot: structuredClone(change.snapshot), fingerprint, source: input.source, actorId: input.actorId, requestId: input.requestId, operation: input.restoredFromRevisionId && change.operation === 'save' ? 'restore' : change.operation, restoredFromRevisionId: input.restoredFromRevisionId || null, createdAt: new Date().toISOString() });
   }
   site = { ...site, settings: { ...site.settings, frontendDesign: structuredClone(input.frontendDesign) } }; return structuredClone(site);
  },
 },
};
runtime.setPublicRepositoryRuntimeForTests({ mode: 'database', repositories });
const sessionFor = (value: typeof user) => { const session = sessions.createAdminSessionForExternalUser(value, 'supabase', { sessionTimeoutMinutes: 120 }, { persist: false }); auth = sessions.upsertAdminSessionAuthRecord(auth, session); return session; };
const admin = sessionFor(user), reader = sessionFor(viewer);
const req = (path: string, method = 'GET', body?: unknown, token = admin.token) => new NextRequest(`http://localhost:3001/api/admin/sites/${site.id}/${path}`, { method, headers: { authorization: `Bearer ${token}`, origin: 'http://localhost:5173', 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const params = { params: Promise.resolve({ siteId: site.id }) }, historyParams = { params: Promise.resolve({ siteId: site.id, templateId: 'article' }) };
try {
 for (const [handler, path, body] of [[siteApi, '', { settings: { frontendDesign: initial } }], [settingsApi, 'settings', { frontendDesign: initial }], [settingsApi, 'settings', { settings: { frontendDesign: initial } }]] as const) {
  const response = await handler.PATCH(req(path, 'PATCH', body), params); assert.equal(response.status, 400); assert.equal((await response.json()).error.code, 'FRONTEND_DESIGN_ENDPOINT_REQUIRED');
 }
 assert.equal((await siteApi.PATCH(req('', 'PATCH', { name: 'History renamed' }), params)).status, 200);
 assert.equal(site.name, 'History renamed');
 assert.equal((await settingsApi.PATCH(req('settings', 'PATCH', { seo: { title: 'Unrelated SEO change' } }), params)).status, 200);
 assert.equal(site.settings.seo.title, 'Unrelated SEO change'); assert.equal(snapshots.length, 0, 'Unrelated site/settings updates remain available');
 const changed = structuredClone(initial); changed.templates[0].version = 2; (changed.templates[0].content!.elements![0] as any).props.content = 'Changed';
 assert.equal((await designApi.PATCH(req('frontend-design', 'PATCH', { frontendDesign: changed }), params)).status, 200);
 assert.equal(snapshots.filter(item => item.templateId === 'article').length, 2, 'PATCH retains previous and changed full templates');
 assert(!JSON.stringify(snapshots).includes('MUST_NOT_BE_SNAPSHOTTED')); assert.deepEqual(snapshots[0].snapshot.customExtension, { keep: true });
 const baseline = snapshots.find(item => item.templateId === 'article' && item.operation === 'baseline');
 assert.equal(baseline.snapshot.content.elements[0].props.content, 'Original'); assert.deepEqual(baseline.snapshot.content.assets, [{ mediaId: 'hero' }]);
 const beforeTokens = snapshots.length; assert.equal((await designApi.PATCH(req('frontend-design', 'PATCH', { frontendDesign: { tokens: { colors: { secondary: 'amber' } } } }), params)).status, 200); assert.equal(snapshots.length, beforeTokens, 'Unrelated design patches do not create false template changes');
 let response = await historyApi.GET(req('templates/article/revisions'), historyParams); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
 assert.equal((await historyApi.GET(req('templates/article/revisions', 'GET', undefined, reader.token), historyParams)).status, 200, 'Site viewers can read draft design history');
 assert.equal((await historyApi.GET(req('templates/article/revisions', 'GET', undefined, ''), historyParams)).status, 401, 'History is never anonymous');
 const loaded = (await response.json()).data; assert.equal(loaded.revisions.length, 2);
 const beforeRestore = structuredClone(site.settings.frontendDesign), restoreParams = { params: Promise.resolve({ siteId: site.id, templateId: 'article', revisionId: baseline.id }) };
 assert.equal((await restoreApi.POST(req(`templates/article/revisions/${baseline.id}/restore`, 'POST', { expectedDesignFingerprint: loaded.currentDesignFingerprint }, reader.token), restoreParams)).status, 403, 'Readers cannot restore');
 assert.equal((await restoreApi.POST(req(`templates/article/revisions/${baseline.id}/restore`, 'POST', {}), restoreParams)).status, 400, 'Restore requires explicit current fingerprint');
 assert.equal((await restoreApi.POST(req(`templates/article/revisions/${baseline.id}/restore`, 'POST', { expectedDesignFingerprint: 'a'.repeat(64) }), restoreParams)).status, 409);
 response = await restoreApi.POST(req(`templates/article/revisions/${baseline.id}/restore`, 'POST', { expectedDesignFingerprint: loaded.currentDesignFingerprint }), restoreParams); assert.equal(response.status, 200);
 const restored = site.settings.frontendDesign.templates.find((item: any) => item.id === 'article'); assert.equal(restored.version, 1); assert.equal(restored.content.elements[0].props.content, 'Original'); assert.equal(restored.content.metadata.frontendDesignTemplateRestoredFromRevisionId, baseline.id);
 assert.deepEqual(site.settings.frontendDesign.tokens, beforeRestore.tokens); assert.deepEqual(site.settings.frontendDesign.chrome, beforeRestore.chrome); assert.deepEqual(site.settings.frontendDesign.templates.find((item: any) => item.id === 'unrelated'), beforeRestore.templates.find(item => item.id === 'unrelated'));
 assert.equal(snapshots[0].operation, 'restore'); assert.equal(snapshots[0].restoredFromRevisionId, baseline.id); assert(audits.some(audit => audit.action === 'frontendDesign.templateRestore' && audit.metadata.restoredFromRevisionId === baseline.id));
 const preserveBeforeFailure = structuredClone(site); failSnapshots = true;
 assert.equal((await designApi.PATCH(req('frontend-design', 'PATCH', { frontendDesign: changed }), params)).status, 500); assert.deepEqual(site, preserveBeforeFailure, 'Storage failure prevents overwrite'); failSnapshots = false;
 const countBeforeInvalid = snapshots.length;
 assert.equal((await designApi.POST(req('frontend-design', 'POST', { action: 'import-frontend-contract', frontendDesign: { ...initial, runtime: { capabilities: [] } } }), params)).status, 400, 'Invalid imported runtime returns400 before persistence'); assert.equal(snapshots.length, countBeforeInvalid);
 const imported = structuredClone(initial); imported.templates[0].version = 3; (imported.templates[0] as any).templateRevisions = [{ privateDraft: 'DO_NOT_IMPORT_HISTORY' }];
 assert.equal((await designApi.POST(req('frontend-design', 'POST', { action: 'import-frontend-contract', frontendDesign: imported }), params)).status, 200); assert(snapshots.some(item => item.source === 'frontendDesign.import')); assert(!JSON.stringify(site.settings.frontendDesign).includes('DO_NOT_IMPORT_HISTORY'));
 assert.equal((await designApi.POST(req('frontend-design', 'POST', { action: 'capture-content-template', resourceType: 'page', resourceId: 'capture-page', templateId: 'captured-page' }), params)).status, 200); assert(snapshots.some(item => item.templateId === 'captured-page' && item.source === 'frontendDesign.captureTemplate'));
 assert.equal((await designApi.POST(req('frontend-design', 'POST', { action: 'capture-site-defaults' }), params)).status, 200); assert(snapshots.some(item => item.source === 'frontendDesign.captureDefaults'));
 assert(snapshots.some(item => item.templateId === 'article'), 'Removal/replace captures retain history for deleted templates');
 const foreignResponse = await historyApi.GET(new NextRequest(`http://localhost:3001/api/admin/sites/${foreign.id}/templates/article/revisions`, { headers: { authorization: `Bearer ${admin.token}` } }), { params: Promise.resolve({ siteId: foreign.id, templateId: 'article' }) }); assert.equal(foreignResponse.status, 403);
 const after = history.templateRevisionFingerprint(site.settings.frontendDesign);
 assert.equal((await restoreApi.POST(req('templates/unrelated/revisions/wrong/restore', 'POST', { expectedDesignFingerprint: after }), { params: Promise.resolve({ siteId: site.id, templateId: 'unrelated', revisionId: baseline.id }) })).status, 404, 'Revision identity includes site and template');
 for (let index = 0; index < 205; index++) snapshots.push({ ...structuredClone(baseline), id: randomUUID() });
 response = await historyApi.GET(req('templates/article/revisions?limit=100&offset=200'), historyParams); const later = (await response.json()).data; assert.equal(later.pagination.offset, 200); assert(later.revisions.length > 0);
 const catalog = await allHistoryApi.GET(req('templates/revisions?limit=100'), params); assert.equal(catalog.status, 200); assert.equal((await catalog.json()).data.revisions[0].snapshot, undefined, 'History catalog exposes summaries, not whole draft snapshots');
 const corrupted = structuredClone(baseline); corrupted.snapshot.name = 'Tampered';
 assert.throws(() => history.restoredTemplateDesign(site, corrupted, after, new Date().toISOString()), (error: any) => error.code === 'INVALID_TEMPLATE_REVISION');
 const defaultRevision = structuredClone(baseline); defaultRevision.snapshot.isDefault = true; defaultRevision.fingerprint = history.templateRevisionFingerprint(defaultRevision.snapshot);
 const defaultSite = structuredClone(site); defaultSite.settings.frontendDesign.templates.push({ id: 'other-default', name: 'Current default', type: 'blogPost', isDefault: true });
 assert.throws(() => history.restoredTemplateDesign(defaultSite, defaultRevision, history.templateRevisionFingerprint(defaultSite.settings.frontendDesign), new Date().toISOString()), (error: any) => error.code === 'TEMPLATE_DEFAULT_CONFLICT');
 const missing = structuredClone(site); missing.settings.frontendDesign.templates = missing.settings.frontendDesign.templates.filter((item: any) => item.id !== 'article');
 const recovered = history.restoredTemplateDesign(missing, baseline, history.templateRevisionFingerprint(missing.settings.frontendDesign), new Date().toISOString());
 assert(recovered.templates.some((item: any) => item.id === 'article' && item.version === baseline.snapshot.version), 'Retained history can restore a removed template');
 const sql = readFileSync(new URL('../../../supabase/migrations/015_template_revision_history.sql', import.meta.url), 'utf8');
 assert(sql.includes('ENABLE ROW LEVEL SECURITY') && sql.includes('REVOKE ALL') && sql.includes('FROM anon, authenticated') && sql.includes('BEFORE UPDATE') && sql.includes('ON DELETE CASCADE'));
 console.log('Template history routes passed: PATCH/import/capture retention, safe selective restore/provenance/audit, reader/foreign-site denial, expected-fingerprint conflict, failed snapshot closed,205+pagination and migration RLS/immutability guard. No migration/provider was touched.');
} finally { runtime.resetPublicRepositoryRuntimeForTests(); }
