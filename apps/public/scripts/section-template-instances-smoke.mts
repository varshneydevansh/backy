import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { assertTemplateInstanceContract } from './template-instances-contract.mts';
import { verifySectionTemplateInstances } from './section-template-instances-postgres-handlers.mjs';
const cwd = process.cwd(), scratch = mkdtempSync(join(tmpdir(), 'backy-section-template-handlers-'));
process.chdir(scratch);
try {
 const imported: any = await import('../src/lib/backyStore.ts'), store = imported.default || imported;
 for (const demo of [true, false]) {
  const site = store.createAdminSite({ name: 'Section upgrade fixture', slug: 'section-upgrade-' + demo });
  const sections: any = {
   list: async (p: any) => { const items = store.listReusableSections(p.siteId, { status: p.status }); return { items: items.slice(p.offset, p.offset + p.limit), pagination: { total: items.length, limit: p.limit, offset: p.offset, hasMore: p.offset + p.limit < items.length } }; },
   getById: async (s: string, id: string) => store.getReusableSectionByIdOrSlug(s, id), getBySlug: async (s: string, slug: string) => store.getReusableSectionByIdOrSlug(s, slug),
   create: async (input: any) => ({ item: store.createReusableSection(input.siteId, input) }), update: async (s: string, id: string, input: any) => ({ item: store.updateReusableSection(s, id, input) }),
  };
  const repos: any = { sites: { getById: async (id: string) => store.getSiteByIdOrSlug(id), getBySlug: async () => null }, reusableSections: sections,
   templateRevisions: { commitDesign: async (input: any) => store.commitDemoFrontendDesign(input), get: async (s: string, t: string, id: string) => store.listTemplateRevisions(s, t, { limit: 100, offset: 0 }).items.find((r: any) => r.id === id), list: async (p: any) => store.listTemplateRevisions(p.siteId, p.templateId, p) } };
  await verifySectionTemplateInstances({ repositories: repos, competing: repos, site, store, demo, assertContract: assertTemplateInstanceContract });
 }
} finally { process.chdir(cwd); rmSync(scratch, { recursive: true, force: true }); }

// Real central credential/scope/role policy; sessions and persistence are synthetic.
const assert = (await import('node:assert/strict')).default;
const { NextRequest } = await import('next/server');
const { fixture, networkCalls } = await import('./admin-access-test-fixtures.mts');
const { load: loadRoute } = await import('./collection-import-postgres-handlers.mjs');
const f = fixture({ demo: false, actorRole: 'admin' });
f.mocks['@/lib/admin-auth/sessionCookie'].getAdminSessionTokenFromRequest = (request: any) => request.headers.get('x-backy-admin-session');
f.mocks['@/lib/admin-auth/sessionStore'].getAdminSessionWithPersistence = async (token: string) => token ? { token, user: f.actor } : null;
const grants = ['sites.view', 'pages.view', 'pages.edit'];
f.settings().auth.userSiteGrants = [{ userId: f.actor.id, scope: { version: 1, revision: 1, mode: 'selected-sites', grants: [{ siteId: f.site.id, permissions: grants }], expiresAt: null } }];
const pinModule: any = loadRoute('../src/lib/templateInstanceProvenance.ts', {});
const template: any = { id: 'auth-section', name: 'Auth section', type: 'section', version: 1, content: { elements: [{ id: 'root', type: 'section' }] } };
const revision: any = { id: 'template_revision_11111111-1111-4111-8111-111111111111', siteId: f.site.id, templateId: template.id, snapshot: template, fingerprint: pinModule.templateInstanceFingerprint(template) };
f.site.settings = { frontendDesign: { templates: [template] } } as any;
const section: any = { id: 'section-auth', siteId: f.site.id, name: 'Auth section', slug: 'auth-section', status: 'active', category: 'general', tags: [], content: template.content, metadata: { frontendTemplateInstance: pinModule.pinTemplateInstance(template, template.content, 'section') }, updatedAt: '2026-01-01T00:00:00.000Z' };
let writes = 0, inventoryReads = 0;
Object.assign(f.repositories, { reusableSections: { list: async (p: any) => { inventoryReads++; return { items: [section], pagination: { total: 1, limit: p.limit, offset: p.offset, hasMore: false } }; }, getById: async () => section, update: async () => { writes++; return { item: section }; } } });
const authMocks: any = { ...f.mocks, '@/lib/templateHistory': { getRetainedTemplateRevision: async () => revision } };
const route: any = loadRoute('../src/app/api/admin/sites/[siteId]/templates/[templateId]/instances/route.ts', authMocks);
async function authCall(siteId: string, action = 'review', auth = true, reviewVersion?: string) {
 const response = await route.POST(new NextRequest(`http://fixture.invalid/api/admin/sites/${siteId}/templates/${template.id}/instances`, { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { 'x-backy-admin-session': 'synthetic-session' } : {}) }, body: JSON.stringify({ action, targetRevisionId: revision.id, selection: [{ type: 'section', id: section.id }], ...(reviewVersion ? { reviewVersion } : {}) }) }), { params: Promise.resolve({ siteId, templateId: template.id }) }); return { status: response.status, body: await response.json() };
}
assert.equal((await authCall(f.site.id, 'review', false)).status, 401);
assert.equal((await authCall(f.otherSite.id)).status, 403);
assert.equal(inventoryReads, 0);
const allowed = await authCall(f.site.id); assert.equal(allowed.status, 200);
grants.splice(grants.indexOf('pages.edit'), 1);
assert.equal((await authCall(f.site.id, 'apply', true, allowed.body.data.reviewVersion)).status, 403);
assert.equal(writes, 0);
f.actor.role = 'viewer'; grants.push('pages.edit');
assert.equal((await authCall(f.site.id, 'apply', true, allowed.body.data.reviewVersion)).status, 403);
assert.equal(writes, 0);
assert.equal(networkCalls, 0);
console.log('Section template exact-route central auth passed 9 checks: anonymous401, foreign-site403 before inventory, scoped review, missing edit grant403, viewer role cannot gain edit, zero writes/providers. Session/persistence are synthetic.');
