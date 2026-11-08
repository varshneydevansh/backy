import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyFormTemplateInstances } from './form-template-instances-postgres-handlers.mjs';
import { assertTemplateInstanceContract } from './template-instances-contract.mts';
import { assertFormDesignContract } from './form-template-contract-validation.mts';
const cwd = process.cwd(), scratch = mkdtempSync(join(tmpdir(), 'backy-form-template-handlers-'));
process.chdir(scratch);
try {
 const imported: any = await import('../src/lib/backyStore.ts'), store = imported.default || imported;
 const site = store.createAdminSite({ name: 'Form template fixture', slug: 'form-template-fixture' });
 const forms: any = { getById: async (siteId: string, id: string) => store.getFormById(siteId, id), update: async (siteId: string, id: string, input: any) => ({ item: store.updateAdminForm(siteId, id, input) }), listFormDesignRevisions: async (...args: any[]) => store.listFormDesignRevisions(...args) };
 const repositories: any = { forms, sites: { getById: async (id: string) => store.getSiteByIdOrSlug(id) } };
 await verifyFormTemplateInstances({ repositories, site, store, demo: true, assertContract: assertTemplateInstanceContract, assertDesignContract: assertFormDesignContract });
} finally { process.chdir(cwd); rmSync(scratch, { recursive: true, force: true }); }

// Actual central authorization, using synthetic selected-site operator sessions.
const assert = (await import('node:assert/strict')).default;
const { NextRequest } = await import('next/server');
const { fixture, networkCalls } = await import('./admin-access-test-fixtures.mts');
const { load } = await import('./collection-import-postgres-handlers.mjs');
const f = fixture({ demo: false, actorRole: 'admin' });
f.mocks['@/lib/admin-auth/sessionCookie'].getAdminSessionTokenFromRequest = (request: any) => request.headers.get('x-backy-admin-session');
f.mocks['@/lib/admin-auth/sessionStore'].getAdminSessionWithPersistence = async (token: string) => token ? { token, user: f.actor } : null;
const grants = ['sites.view', 'forms.view', 'forms.edit'];
f.settings().auth.userSiteGrants = [{ userId: f.actor.id, scope: { version: 1, revision: 1, mode: 'selected-sites', grants: [{ siteId: f.site.id, permissions: grants }], expiresAt: null } }];
const pin: any = load('../src/lib/templateInstanceProvenance.ts', {}), template = { id: 'form-auth', type: 'form', version: 1, content: { fields: [{ key: 'email', label: 'Email', type: 'email' }] } };
const revision = { id: '11111111-1111-4111-8111-111111111111', siteId: f.site.id, templateId: template.id, snapshot: template, fingerprint: pin.templateInstanceFingerprint(template) };
f.site.settings = { frontendDesign: { templates: [template] } } as any;
let inventories = 0, writes = 0;
f.repositories.forms = { list: async () => { inventories++; return { items: [], pagination: { total: 0, offset: 0, limit: 100, hasMore: false } }; }, update: async () => { writes++; } } as any;
const mocks: any = { ...f.mocks, '@/lib/templateHistory': { getRetainedTemplateRevision: async () => revision } };
for (const [key, value] of Object.entries({ ...mocks })) if (key.startsWith('@/lib/')) mocks['./' + key.slice('@/lib/'.length)] = value;
const route: any = load('../src/app/api/admin/sites/[siteId]/templates/[templateId]/instances/route.ts', mocks);
async function authCall(siteId: string, action = 'review', auth = true, reviewVersion?: string) {
 const response = await route.POST(new NextRequest(`http://fixture.invalid/api/admin/sites/${siteId}/templates/${template.id}/instances`, { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { 'x-backy-admin-session': 'synthetic-session' } : {}) }, body: JSON.stringify({ targetType: 'form', action, targetRevisionId: revision.id, selection: [], ...(reviewVersion ? { reviewVersion } : {}) }) }), { params: Promise.resolve({ siteId, templateId: template.id }) });
 return { status: response.status, body: await response.json() };
}
assert.equal((await authCall(f.site.id, 'review', false)).status, 401);
assert.equal((await authCall(f.otherSite.id)).status, 403); assert.equal(inventories, 0);
grants.splice(grants.indexOf('forms.view'), 1); assert.equal((await authCall(f.site.id)).status, 403); assert.equal(inventories, 0); grants.push('forms.view');
const allowed = await authCall(f.site.id); assert.equal(allowed.status, 200); assert.equal(allowed.body.data.scanned.forms, 0);
grants.splice(grants.indexOf('forms.edit'), 1); assert.equal((await authCall(f.site.id, 'apply', true, allowed.body.data.reviewVersion)).status, 403); grants.push('forms.edit');
f.actor.role = 'viewer'; assert.equal((await authCall(f.site.id, 'apply', true, allowed.body.data.reviewVersion)).status, 403);
assert.equal(writes, 0); assert.equal(networkCalls, 0);
console.log('Form exact-route central authorization passed11 checks: forms grants only, selected-site denial before inventory, viewer cannot edit, no provider/write.');
