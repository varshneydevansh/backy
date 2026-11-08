import assert from 'node:assert/strict';
import { createBackyClient, BackyApiError } from '../dist/index.js';
const calls = [], token = 'bkv_' + 'a'.repeat(43), member = { id: 'member', siteId: 'site/a', email: 'member@example.com', displayName: 'Member', status: 'active', createdAt: '2026-10-04T00:00:00Z', updatedAt: '2026-10-04T00:00:00Z' };
let status = 200;
const client = createBackyClient({ baseUrl: 'https://backy.example', siteId: 'site/a', credentials: 'include', defaultHeaders: { authorization: 'Bearer operator-secret', 'x-backy-admin-key': 'operator-key', cookie: 'backy_admin_session=operator' }, fetch: async (input, init) => {
  const url = new URL(input); calls.push({ url, init });
  if (status !== 200) return Response.json({ success: false, error: { code: 'VISITOR_AUTHENTICATION_REQUIRED', message: 'Current website account required' } }, { status });
  if (url.pathname.startsWith('/api/admin/')) return Response.json({ success: true, requestId: 'fixture', data: { deleted: true } });
  const op = url.pathname.split('/').at(-1), data = ['session','profile'].includes(op) ? { member } : op === 'logout' ? { loggedOut: true } : op === 'recovery' ? { message: 'If eligible' } : op === 'reset-password' ? { passwordReset: true, message: 'Sign in again' } : { member, expiresAt: new Date(Date.now()+3600000).toISOString() };
  return Response.json({ success: true, data }); // Actual auth envelopes deliberately have no requestId.
} });
const options = { origin: 'https://website.example', sessionToken: token };
await client.visitorRegister({ accessToken: 'verified-user-token' }, options);
await client.visitorLogin({ email: member.email, password: 'correct-password' }, options);
await client.visitorSession(options); await client.visitorLogout(options);
await client.visitorRecovery({ email: member.email, returnUrl: 'https://website.example/account' }, options);
await client.visitorResetPassword({ accessToken: 'verified-user-token', recoveryToken: token, password: 'new-correct-password' }, options);
const saved = await client.visitorUpdateProfile({ displayName: '  Updated name  ' }, options);
assert.equal(saved.data.member.id, member.id);
assert.deepEqual(JSON.parse(calls.at(-1).init.body), { displayName: '  Updated name  ' });
assert.equal(calls.length, 7);
for (const { url, init } of calls) {
 assert.match(url.pathname, /^\/api\/sites\/site%2Fa\/visitor-auth\//); assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'same-origin');
 assert.equal(init.headers.get('origin'), options.origin); assert.equal(init.headers.get('x-backy-visitor-session'), token); assert.equal(init.headers.get('authorization'), null); assert.equal(init.headers.get('cookie'), null); assert.equal(init.headers.get('x-backy-admin-key'), null);
 assert.equal(init.method, url.pathname.endsWith('/session') ? 'GET' : url.pathname.endsWith('/profile') ? 'PATCH' : 'POST');
}
await assert.rejects(client.visitorSession({ sessionToken: 'operator-secret' }), /opaque website visitor/);
await assert.rejects(client.visitorSession({ origin: 'https://user:password@website.example' }), /exact website origin/);
status = 401; await assert.rejects(client.visitorSession(options), error => error instanceof BackyApiError && error.status === 401);
await assert.rejects(client.visitorUpdateProfile({ displayName: 'Denied' }, options), error => error instanceof BackyApiError && error.status === 401);
status = 200;
const pkce = { code: 'provider-code', state: token, returnUrl: 'https://website.example/account' };
await client.visitorRegister({ email: member.email, password: 'correct-password', returnUrl: pkce.returnUrl, authFlow: 'pkce' }, options);
assert.equal(JSON.parse(calls.at(-1).init.body).authFlow, 'pkce');
await client.visitorCallback(pkce, options);
assert.equal(calls.at(-1).url.pathname, '/api/sites/site%2Fa/visitor-auth/callback');
assert.deepEqual(JSON.parse(calls.at(-1).init.body), pkce);
await client.visitorRecovery({ email: member.email, returnUrl: pkce.returnUrl, authFlow: 'pkce' }, options);
await client.visitorResetPassword({ ...pkce, password: 'new-correct-password' }, options);
assert.deepEqual(JSON.parse(calls.at(-1).init.body), { ...pkce, password: 'new-correct-password' });
for (const { init } of calls.slice(-4)) {
 assert.equal(init.method, 'POST'); assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error');
 assert.equal(init.headers.get('authorization'), null); assert.equal(init.headers.get('cookie'), null); assert.equal(init.headers.get('x-backy-admin-key'), null);
 assert.doesNotMatch(init.body, /code_verifier|service-role|operator-secret/);
}
// Existing media deletion calls remain valid; an explicit reviewed override can now be transmitted.
await client.deleteAdminMedia('asset', { adminKey: 'fixture-key', input: { allowReferencedDelete: true, reason: 'Reviewed references', referenceFingerprint: 'a'.repeat(64) } });
const last = calls.at(-1); assert.equal(last.init.method, 'DELETE'); assert.equal(JSON.parse(last.init.body).referenceFingerprint, 'a'.repeat(64));
await client.deleteAdminMedia('asset'); assert.equal(calls.at(-1).init.body, undefined);
console.log('SDK visitor accounts passed: seven encoded operations including PATCH profile, real envelope shape, no-store, isolated credentials, denied operator token/origin, typed401; PKCE initiation/callback/recovery/reset transport; optional media-delete override and legacy call.');
