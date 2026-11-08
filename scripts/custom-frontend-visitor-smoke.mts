import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url), origin = 'https://website.example', siteId = 'canonical-site', token = 'bkv_' + 'a'.repeat(43), cookieName = 'backy_visitor_' + createHash('sha256').update(siteId).digest('hex').slice(0,16);
let enabled = true, registration = true, wrongMember = false, missingCookie = false, invalidCookie = false, upstreamFailure = 0; const calls: any[] = [];
const env = { NODE_ENV: 'production', BACKY_VISITOR_FRONTEND_ORIGIN: origin, BACKY_VISITOR_RETURN_URL: origin + '/account' };
const member = { id: 'member', siteId, email: 'member@example.com', displayName: 'Member', status: 'active', createdAt: '2026-10-04T00:00:00Z', updatedAt: '2026-10-04T00:00:00Z', providerSubject: 'hidden-provider-subject', role: 'owner' };
const fetchFixture = async (input: string, init: RequestInit) => {
 const url = new URL(input); calls.push({ url, init }); assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error');
 if (url.pathname.endsWith('/agent-handoff')) return Response.json({ success: true, data: { site: { id: siteId }, handoff: { visitorAccounts: { schemaVersion: 'backy.site-visitor-accounts.v1', policy: { enabled, registrationEnabled: registration, configurationValid: true, allowedOrigins: [origin], returnUrls: [origin+'/account'] } } } } });
 const headers = new Headers(init.headers); assert.equal(headers.get('origin'), origin); assert.equal(headers.get('cookie'), null); assert.equal(headers.get('authorization'), null); assert.equal(headers.get('x-backy-admin-key'), null);
 if (upstreamFailure) return Response.json({ success: false, error: { code: 'VISITOR_AUTH_UNAVAILABLE', message: 'password=provider-secret; raw-access-token' } }, { status: upstreamFailure });
 const op = url.pathname.split('/').at(-1), returnedMember = { ...member, siteId: wrongMember ? 'foreign-site' : siteId }, body = JSON.parse(String(init.body || '{}'));
 const data = op === 'session' ? { member: returnedMember } : op === 'logout' ? { loggedOut: true } : op === 'recovery' ? { message: 'If eligible' } : op === 'reset-password' ? { passwordReset: true, message: 'Sign in again' } : op === 'register' && !body.accessToken ? { confirmationRequired: true, message: 'Check email' } : { member: returnedMember, expiresAt: new Date(Date.now()+3600000).toISOString(), rawToken: 'must-not-return' };
 const response = Response.json({ success: true, data }, { status: op === 'recovery' || op === 'register' && !body.accessToken ? 202 : 200 });
 if ('member' in data && op !== 'session' && !missingCookie) response.headers.append('set-cookie', `${cookieName}=${invalidCookie ? 'operator-token' : token}; Path=/; HttpOnly; Domain=backy.example`);
 response.headers.append('set-cookie', 'backy_admin_session=never-forward; Path=/'); return response;
};
function load(path: string, mocks: Record<string, unknown> = {}) {
 const filename = new URL('../'+path, import.meta.url).pathname, module = { exports: {} as any };
 const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
 vm.runInNewContext(compiled, { module, exports: module.exports, require: (name: string) => name in mocks ? mocks[name] : require(name), fetch: fetchFixture, process: { env }, Buffer, TextDecoder, URL, URLSearchParams, Headers, Date, AbortSignal, console }, { filename }); return module.exports;
}
const helpers = load('examples/custom-frontend-next/src/lib/visitor-bff.ts', { './backy': { backyConfig: { apiBaseUrl: 'https://backy.example/api', siteId: 'configured-slug' } } });
const route = load('examples/custom-frontend-next/src/app/api/backy-account/[operation]/route.ts', { '../../../../lib/visitor-bff': helpers });
async function call(op: string, body?: any, headers: Record<string, string> = {}) {
 const method = op === 'session' ? 'GET' : 'POST';
 return route[method](new NextRequest(`${origin}/api/backy-account/${op}`, { method, headers: { origin, 'content-type': 'application/json', ...headers }, ...(method === 'POST' ? { body: JSON.stringify(body || {}) } : {}) }), { params: Promise.resolve({ operation: op }) });
}
let checks = 0;
async function check(name: string, run: () => Promise<void> | void) { try { await run(); checks++; } catch (error) { throw new Error(name+': '+error); } }
await check('canonical cookie lifted without operator/provider metadata', async () => {
 const response = await call('login', { email: member.email, password: 'correct-password', role: 'owner', siteId: 'foreign', returnUrl: 'https://evil.example' }, { authorization: 'Bearer operator', cookie: 'backy_admin_session=operator', 'x-backy-admin-key': 'operator' }); assert.equal(response.status, 200);
 const cookie = response.headers.get('set-cookie')!; assert.ok(cookie.startsWith(cookieName+'='+token)); assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.doesNotMatch(cookie, /Domain=|backy_admin_session/);
 const payload = await response.text(); assert.doesNotMatch(payload, /rawToken|must-not-return|providerSubject|owner|bkv_/); assert.match(response.headers.get('cache-control')!, /no-store/);
 const body = JSON.parse(calls.at(-1).init.body); assert.deepEqual(Object.keys(body).sort(), ['email','password']);
});
await check('same-site session forwards only server visitor cookie', async () => {
 const response = await call('session', undefined, { cookie: `${cookieName}=${token}; backy_admin_session=operator`, 'x-backy-visitor-session': 'visitor-forgery' }); assert.equal(response.status, 200); assert.equal(new Headers(calls.at(-1).init.headers).get('x-backy-visitor-session'), token);
});
await check('same-origin session with no-referrer policy works', async () => { const response = await route.GET(new NextRequest(origin+'/api/backy-account/session', { headers: { 'sec-fetch-site': 'same-origin', cookie: cookieName+'='+token } }), { params: Promise.resolve({ operation: 'session' }) }); assert.equal(response.status, 200); });
await check('foreign origin fails before discovery', async () => { const before = calls.length; assert.equal((await call('login', {}, { origin: 'https://evil.example' })).status, 403); assert.equal(calls.length, before); });
await check('disabled policy and enrollment fail closed', async () => { enabled = false; assert.equal((await call('login', {})).status, 403); enabled = true; registration = false; assert.equal((await call('register', { accessToken: 'verified' })).status, 403); registration = true; });
await check('fixed redirect and uniform registration/recovery shapes', async () => {
 assert.equal((await call('register', { email: member.email, password: 'correct-password', returnUrl: 'https://evil.example' })).status, 202); assert.equal(JSON.parse(calls.at(-1).init.body).returnUrl, origin+'/account');
 assert.equal((await call('recovery', { email: member.email })).status, 202); assert.equal(JSON.parse(calls.at(-1).init.body).returnUrl, origin+'/account');
});
await check('unsupported operation, wrong member, missing/invalid session reject', async () => {
 assert.equal((await call('admin-login', {})).status, 404); wrongMember = true; assert.equal((await call('login', {})).status, 503); wrongMember = false;
 missingCookie = true; assert.equal((await call('login', {})).status, 503); missingCookie = false; invalidCookie = true; assert.equal((await call('login', {})).status, 503); invalidCookie = false;
});
await check('bounded body and secrets-safe upstream errors', async () => {
 assert.equal((await call('login', { password: 'a'.repeat(17000) })).status, 413); upstreamFailure = 503; const response = await call('login', {}); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /provider-secret|raw-access-token/); upstreamFailure = 0;
});
await check('logout and reset remove only visitor cookie', async () => { for (const op of ['logout','reset-password']) { const response = await call(op, { accessToken: 'verified', recoveryToken: token, password: 'new-password' }); assert.equal(response.status, 200); assert.match(response.headers.get('set-cookie')!, /Max-Age=0/); assert.doesNotMatch(response.headers.get('set-cookie')!, /backy_admin_session/); } });
const account = load('examples/custom-frontend-next/src/lib/account.tsx');
await check('callback signup/recovery validates site and rejects unbound PKCE', () => {
 assert.equal(account.consumeVisitorCallback(origin+'/account#access_token=user-token&type=signup', siteId).operation, 'register');
 const recoveryUrl = origin+'/account?backySiteId='+siteId+'&backyVisitorRecovery='+token+'#access_token=user-token&type=recovery'; assert.equal(account.consumeVisitorCallback(recoveryUrl, siteId).operation, 'reset-password');
 const denied = account.consumeVisitorCallback(recoveryUrl, 'foreign-site'); assert.equal(denied.operation, null); assert.equal(denied.accessToken, ''); assert.equal(account.consumeVisitorCallback(origin+'/account?code=provider-code', siteId).operation, null);
 const error = account.consumeVisitorCallback(origin+'/account#error=private&error_description=password', siteId); assert.doesNotMatch(error.error, /password/);
});
await check('deterministic SSR account states and callback URL scrubbing', () => {
 const html = renderToStaticMarkup(React.createElement(account.BackyAccount, { siteId, registrationEnabled: true })); assert.match(html, /Website account/); assert.match(html, /Forgot password/); assert.match(html, /Join website/); assert.doesNotMatch(html, /bkv_|user-token/);
 const source = readFileSync(new URL('../examples/custom-frontend-next/src/lib/account.tsx', import.meta.url), 'utf8'); assert.ok(source.indexOf("window.history.replaceState") < source.indexOf("action(callback.operation")); assert.doesNotMatch(source, /localStorage|sessionStorage|console\./);
});
console.log(`Starter visitor actual-BFF/callback/SSR checks passed: ${checks}.`);
