import * as coreModule from '@backy-cms/core';
const { commitBackyOperatorSiteGrantAuth, preserveBackyOperatorSiteGrants } = coreModule.default || coreModule;
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server';

// Actual saved handlers and access/matrix code run here. Persistence, sessions,
// email and credentials are fixtures; no live user or provider is touched.
const require = createRequire(import.meta.url);
export let networkCalls = 0;
export function load(relative: string, mocks: Record<string, unknown> = {}, expose: string[] = [], env: Record<string, string | undefined> = {}) {
  const filename = fileURLToPath(new URL(relative, import.meta.url));
  const module = { exports: {} as any };
  const source = readFileSync(filename, 'utf8') + (expose.length ? '\nexport { ' + expose.join(', ') + ' };' : '');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(compiled, {
    module, exports: module.exports, URL, Headers, Buffer, Set, Map, Date, process: { env },
    console: { error() {} },
    fetch: () => { networkCalls++; throw new Error('Providers are forbidden in owner-boundary fixtures'); },
    require: (id: string) => id in mocks ? mocks[id] : id.startsWith('@/') ? {} : require(id),
  }, { filename });
  return module.exports;
}
export const permissions = load('../src/lib/adminPermissions.ts');
const overrides = load('../src/lib/adminPermissionOverrides.ts');
export const operatorScopes = load('../src/lib/adminOperatorSiteScope.ts', { '@/lib/adminServiceKeyScope': load('../src/lib/adminServiceKeyScope.ts', { '@/lib/adminPermissions': permissions }) });
export const serviceScopes = load('../src/lib/adminServiceKeyScope.ts', { '@/lib/adminPermissions': permissions });
type Role = 'owner' | 'admin' | 'editor' | 'viewer';
export const managedAuthFields = ['passwordResetTokens', 'inviteTokens', 'apiKeyServiceKeys', 'adminSessions', 'userPermissionOverrides', 'permissionOverrides', 'userMfaEnrollments', 'userSiteGrants', 'authRateLimits', 'apiKeyRotationHistory', 'apiKeyRevocationHistory'];
export const rule = (matrix: any, key: string) => matrix.groups.flatMap((group: any) => group.permissions).find((item: any) => item.key === key);
export function fixture({ demo = false, actorRole = 'admin' as Role, targetRole = 'viewer' as Role, service = false, targetStatus = 'active', initialOverrides = [] as any[], auditLogs = [] as any[], env = {} as Record<string, string | undefined> } = {}) {
  const actor = { id: 'actor', role: actorRole, status: 'active', email: 'actor@example.test', fullName: 'Fixture actor' };
  const target = { id: 'target', role: targetRole, status: targetStatus, email: 'target@example.test', fullName: 'Fixture target', avatarUrl: null };
  const users = new Map<string, any>([['actor', actor], ['target', target], ['another-owner', { ...actor, id: 'another-owner', role: 'owner', email: 'other@example.test' }]]);
  let settings: any = { auth: { userPermissionOverrides: initialOverrides, retainedPolicy: 'preserve' }, apiKeys: { adminApiKey: 'fixture-service', secretKeyId: 'fixture-service' }, integrations: {} };
  const effects = { writes: 0, audits: 0, credentials: 0, deliveries: 0, sessionUpdates: 0, persistence: [] as string[] };
  const readUser = (id: string) => users.get(id) || null;
  const readEmail = (email: string) => [...users.values()].find(user => user.email === email) || null;
  const updateUser = (id: string, input: any) => { effects.writes++; const current = users.get(id); if (!current) return null; const user = { ...current, ...input }; users.set(id, user); return user; };
  const createUser = (input: any) => { effects.writes++; const user = { id: 'created', ...input }; users.set(user.id, user); return user; };
  const deleteUser = (id: string) => { effects.writes++; return users.delete(id); };
  const updateSettings = (input: any) => { effects.writes++; settings = { ...settings, ...input, ...(input.auth ? { auth: preserveBackyOperatorSiteGrants(settings.auth, demo ? { ...settings.auth, ...input.auth } : input.auth) } : {}) }; return settings; };
  const commitGrant = (input: any) => { const auth = commitBackyOperatorSiteGrantAuth(settings.auth, input); effects.writes++; settings = { ...settings, auth }; return settings; };
  const session = { token: 'fixture-session', user: actor };
  const site = { id: 'site-fixture', name: 'Fixture site', slug: 'fixture', teamId: null, settings: {}, isPublished: true };
  const otherSite = { ...site, id: 'other-site', slug: 'other', name: 'Other site' };
  const sites = [site, otherSite];
  const readSite = (identifier: string) => sites.find(candidate => candidate.id === identifier || candidate.slug === identifier) || null;
  const form = { id: 'form-fixture', siteId: site.id };
  const contact = { id: 'contact-fixture', siteId: site.id, formId: form.id, email: target.email, status: 'qualified' };
  const updateContact = (_id: string, input: any) => { effects.writes++; return { ...contact, ...input }; };
  const sessionStore = {
    getAdminSessionWithPersistence: async (_token: string, options: any) => { effects.persistence.push(options.authSettings ? 'database' : 'demo'); return session; },
    listAdminSessionPermissionOverrides: (_token: string, userId: string) => overrides.listAuthSettingsPermissionOverrides(settings.auth, userId),
    updateAdminSessionPermissionOverrides: () => { effects.sessionUpdates++; },
    createAdminInviteToken: () => { effects.credentials++; return { id: 'fixture-invite', token: 'fixture-invite-token' }; },
    createAdminPasswordResetToken: () => { effects.credentials++; return { id: 'fixture-reset', token: 'fixture-reset-token' }; },
  };
  const repositories = {
    sites: { getById: async (id: string) => sites.find(candidate => candidate.id === id) || null, getBySlug: async (slug: string) => sites.find(candidate => candidate.slug === slug) || null, list: async () => ({ items: sites, pagination: { total: sites.length } }) },
    forms: { getById: async () => form, getContactById: async () => contact, updateContact: async (_siteId: string, id: string, input: any) => ({ item: updateContact(id, input) }) },
    users: { getById: async (id: string) => readUser(id), getByEmail: async (email: string) => readEmail(email), list: async ({ limit = 50, offset = 0 }: { limit?: number; offset?: number } = {}) => ({ items: [...users.values()].slice(offset, offset + Math.min(limit,100)), pagination: { total: users.size, limit: Math.min(limit,100), offset, hasMore: offset + Math.min(limit,100) < users.size } }), create: async (input: any) => ({ item: createUser(input) }), update: async (id: string, input: any) => ({ item: updateUser(id, input) }), delete: async (id: string) => deleteUser(id) },
    settings: { get: async () => settings, update: async (input: any) => ({ item: updateSettings(input) }), commitOperatorSiteGrant: async (input: any) => ({ item: commitGrant(input) }) },
  };
  const mocks: Record<string, any> = {
    '@backy/storage': {},
    '@/lib/adminServiceKeyScope': serviceScopes, '@/lib/adminOperatorSiteScope': operatorScopes,
    'next/server': { NextResponse }, '@/lib/adminPermissions': permissions, '@/lib/adminPermissionOverrides': overrides,
    '@/lib/admin-auth/sessionStore': sessionStore,
    '@/lib/admin-auth/cookieWriteOrigin': load('../src/lib/admin-auth/cookieWriteOrigin.ts', {}, [], env),
    '@/lib/admin-auth/sessionCookie': { getAdminSessionTokenFromRequest: () => 'fixture-session' },
    '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => demo, getRequiredDatabaseRepositories: async () => repositories, resolvePublicRepositoryRuntimeConfig: () => ({}) },
    '@/lib/mediaStorage': { getMediaStorageConfigSummary: () => ({}), resolveMediaStorageConfig: () => ({}) },
    '@/lib/mediaSafety': { resolveMediaScannerConfig: () => ({}) },
    '@/lib/formEmailDelivery': { getEmailDeliveryConfig: () => ({}), isExternalEmailDeliveryConfigured: () => false, getEmailDeliveryCapabilitySummary: () => ({ configured: false }), getEmailSenderPolicySummary: () => ({ configurationValid: true }) },
    '@/lib/hostingerMail': { getHostingerMailConfigurationSummary: () => ({}) },
    '@/lib/commerceWebhookSecrets': { resolveCommerceWebhookSecret: () => '' },
    '@/lib/completionStatusClosure': { buildBackyPartialClosureReadiness: () => ({}) },
    '@/lib/backyStore': {
      getSiteByIdOrSlug: readSite, getSites: () => sites, getFormById: () => form, getContactById: () => contact, updateContactStatus: updateContact,
      getAdminSettings: () => settings, updateAdminSettings: updateSettings, commitAdminOperatorSiteGrant: commitGrant, getAdminUserById: readUser, getAdminUserByEmail: readEmail,
      listAdminUsers: () => [...users.values()], createAdminUser: createUser, updateAdminUser: updateUser, deleteAdminUser: deleteUser,
      listAdminUserPermissionOverrides: (userId: string) => overrides.listAuthSettingsPermissionOverrides(settings.auth, userId),
      updateAdminUserPermissionOverrides: (userId: string, input: any) => { const next = overrides.applyAuthSettingsPermissionOverrides(settings.auth, userId, input); updateSettings({ auth: next.auth }); return next.overrides; },
    },
    '@/lib/adminUserLifecycle': load('../src/lib/adminUserLifecycle.ts'),
    '@/lib/committedMutationFollowUp': load('../src/lib/committedMutationFollowUp.ts'),
    '@/lib/adminAudit': { recordAdminAudit: async () => { effects.audits++; }, listAdminAudit: async () => ({ items: auditLogs }) },
    '@/lib/admin-auth/emailPolicy': { getAdminAuthPolicySettings: async () => ({}), validateAdminEmailDomainPolicy: async () => ({ ok: true }), validateAdminInviteOnlyCreatePolicy: async () => ({ ok: true }), validateAdminInviteOnlyActivationPolicy: async () => ({ ok: true }) },
    '@/lib/adminAuthTokenPersistence': { addPersistedInviteToken: (auth: any) => auth, addPersistedPasswordResetToken: (auth: any) => auth },
    '@/lib/adminUserEmailDelivery': { deliverAdminInviteEmail: async () => { effects.deliveries++; return {}; }, deliverAdminPasswordResetEmail: async () => { effects.deliveries++; return {}; } },
    '@/lib/admin-auth/userMfa': { getUserMfaEnrollment: () => ({}), updateUserMfaEnrollment: ({ auth }: any) => { effects.credentials++; return { auth, enrollment: {}, recoveryCodes: [] }; } },
  };
  const access = load('../src/lib/adminAccess.ts', mocks, [], env);
  mocks['@/lib/adminAccess'] = access;
  const routes: Record<string, any> = {};
  async function call(path: string, method: string, body?: any, query = '', targetId = 'target') {
    const routePath = path === 'contact-promotion' ? '../src/app/api/admin/sites/[siteId]/forms/[formId]/contacts/[contactId]/promote/route.ts' : path === 'users' ? '../src/app/api/admin/users/route.ts' : path === 'settings' ? '../src/app/api/admin/settings/route.ts' : path.startsWith('users/') && ['bulk', 'import', 'import/rollback'].includes(path.slice(6)) ? `../src/app/api/admin/${path}/route.ts` : `../src/app/api/admin/users/[userId]${path === 'user' ? '' : '/' + path}/route.ts`;
    routes[routePath] ||= load(routePath, mocks);
    const urlPath = path === 'contact-promotion' ? `sites/${site.id}/forms/${form.id}/contacts/${contact.id}/promote` : path === 'users' || path === 'settings' || path.startsWith('users/') ? path : `users/${targetId}${path === 'user' ? '' : '/' + path}`;
    const request = new NextRequest(`http://fixture.invalid/api/admin/${urlPath}${query}`, { method, headers: { 'content-type': typeof body === 'string' ? 'text/csv' : 'application/json', 'x-request-id': 'fixture-owner-boundary', ...(service ? { 'x-backy-admin-key': 'fixture-service' } : {}) }, ...(method === 'GET' || method === 'DELETE' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
    const response = await routes[routePath][method](request, { params: Promise.resolve({ userId: targetId, siteId: site.id, formId: form.id, contactId: contact.id }) });
    return { status: response.status, body: await response.json() };
  }
  return { call, access, effects, actor, target, users, repositories, mocks, site, otherSite, settings: () => settings,
    normalizeSettingsAuth: (input: any) => load('../src/app/api/admin/settings/route.ts', mocks, ['normalizeAdminAuthSettings']).normalizeAdminAuthSettings(input),
  };
}
