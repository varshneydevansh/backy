import assert from 'node:assert/strict';
import { assertVisitorContract } from './visitor-contract.mjs';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest } from 'next/server';
const require = createRequire(import.meta.url);
function compile(relative: string, mocks: Record<string, any>) {
 const filename = fileURLToPath(new URL(relative, import.meta.url)), module = { exports: {} as any };
 vm.runInNewContext(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module, exports: module.exports, require: (id: string) => id in mocks ? mocks[id] : require(id), process, Buffer, TextDecoder, URL, Date, fetch, AbortSignal, setTimeout, clearTimeout, console: { warn() {} } }, { filename }); return module.exports;
}
export async function runVisitorAuthProof(repositories: any, sites: any[]) {
 const providerRequests: any[] = [], recoveries: any[] = [];
 const identities: Record<string, any> = {
  verified: { id: 'provider-member-a', email: 'member@example.com', email_confirmed_at: '2026-01-01T00:00:00Z', user_metadata: { role: 'owner' } },
  unverified: { id: 'provider-unverified', email: 'unverified@example.com', email_confirmed_at: null },
  operator: { id: 'provider-operator', email: 'operator@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' },
  other: { id: 'provider-member-b', email: 'other@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' },
 };
 const server = createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk; const body = raw ? JSON.parse(raw) : null;
  providerRequests.push({ path: req.url, method: req.method, body, authorization: req.headers.authorization });
  let value: any = {}, status = 200;
  if (req.url?.startsWith('/auth/v1/signup')) value = body.email === 'member@example.com' ? { access_token: 'verified' } : { user: identities.unverified };
  else if (req.url?.startsWith('/auth/v1/token')) { if (body.password === 'correct-password') value = { access_token: body.email === 'member@example.com' ? 'verified' : 'other' }; else { value = { error: 'credential-private-provider-error' }; status = 400; } }
  else if (req.url?.startsWith('/auth/v1/recover')) { recoveries.push({ email: body.email, url: new URL(req.url, 'http://fixture').searchParams.get('redirect_to') }); value = {}; }
  else if (req.url === '/auth/v1/user') {
   const token = String(req.headers.authorization).slice(7); if (!identities[token]) { status = 401; value = { secret: 'provider-private-error' }; } else value = req.method === 'PUT' ? identities[token] : identities[token];
  } else status = 404;
  res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value));
 });
 await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); assert(address && typeof address !== 'string');
 const old = { url: process.env.BACKY_SUPABASE_URL, key: process.env.BACKY_SUPABASE_ANON_KEY, mode: process.env.NODE_ENV };
 process.env.BACKY_SUPABASE_URL = `http://127.0.0.1:${address.port}`; process.env.BACKY_SUPABASE_ANON_KEY = 'fixture-anon-key'; process.env.NODE_ENV = 'test';
 let passed = 0;
 const check = async (name: string, action: () => Promise<void> | void) => { try { await action(); passed++; } catch (error) { throw new Error(`${name}: ${error}`); } };
 try {
  const provider = compile('../src/lib/visitor-auth/provider.ts', {}), sessions = compile('../src/lib/visitor-auth/session.ts', {});
  const helpers = compile('../src/lib/visitor-auth/routes.ts', { '@/lib/repositoryRuntime': { getRequiredDatabaseRepositories: async () => repositories }, './provider': provider, './session': sessions });
  const routes = Object.fromEntries(['register','login','session','logout','recovery','reset-password'].map(operation => [operation, compile(`../src/app/api/sites/[siteId]/visitor-auth/${operation}/route.ts`, { '@/lib/visitor-auth/routes': helpers })]));
  const [a,b] = sites; let cookie = '', token = '';
  const send = async (operation: string, site: any = a, body: any = {}, headers: any = {}) => {
   const method = operation === 'session' ? 'GET' : 'POST';
   const request = new NextRequest(`http://backy.local/api/sites/${site.id}/visitor-auth/${operation}`, { method, headers: { origin: 'https://site-a.example.com', ...(method === 'GET' ? {} : { 'content-type': 'application/json' }), ...headers }, body: method === 'GET' ? undefined : JSON.stringify(body) });
   const response = await routes[operation][method](request, { params: Promise.resolve({ siteId: site.id }) });
   assertVisitorContract(operation, response.status, await response.clone().json());
   return response;
  };
  await check('origin and exact redirects are rejected before provider work', async () => {
   const count = providerRequests.length;
   assert.equal((await send('register', a, { accessToken: 'verified' }, { origin: 'https://attacker.example.com' })).status, 403);
   assert.equal((await send('register', a, { email: 'new@example.com', password: 'correct-password', returnUrl: 'https://site-a.example.com/evil' })).status, 400);
   assert.equal(providerRequests.length, count);
  });
  await check('unverified provider token never enrolls', async () => { assert.equal((await send('register', a, { accessToken: 'unverified' })).status, 401); assert.equal(await repositories.visitorAccounts.getByEmail(a.id, 'unverified@example.com'), null); });
  await check('verified CMS operator identity cannot enroll or initiate visitor signup', async () => {
   const count = providerRequests.length;
   assert.equal((await send('register', a, { email: 'operator@example.com', password: 'correct-password', returnUrl: 'https://site-a.example.com/account' })).status, 202); assert.equal(providerRequests.length, count);
   assert.equal((await send('register', a, { accessToken: 'operator' })).status, 401);
  });
  await check('operator recovery and password reset never reach provider mutation', async () => {
   const calls = providerRequests.length, deliveries = recoveries.length;
   assert.equal((await send('recovery', a, { email: 'operator@example.com', returnUrl: 'https://site-a.example.com/account' })).status, 202);
   assert.equal(recoveries.length, deliveries);
   assert.equal((await send('reset-password', a, { accessToken: 'operator', recoveryToken: sessions.newVisitorToken(), password: 'new-correct-password' })).status, 401);
   assert.equal(providerRequests.slice(calls).some(call => call.method === 'PUT'), false);
  });
  await check('provider signup pending confirmation has uniform safe response and no CMS metadata', async () => {
   const response = await send('register', a, { email: 'unverified@example.com', password: 'correct-password', returnUrl: 'https://site-a.example.com/account', role: 'owner', data: { role: 'owner' } });
   assert.equal(response.status, 202); assert.equal(response.headers.get('set-cookie'), null); const payload = await response.text(); assert.doesNotMatch(payload, /provider-private|token|role/);
   const call = providerRequests.find(item => item.path.startsWith('/auth/v1/signup')); assert.deepEqual(Object.keys(call.body).sort(), ['email','password']);
  });
  await check('explicit verified enrollment creates site member and opaque httpOnly cookie', async () => {
   const response = await send('register', a, { accessToken: 'verified', displayName: 'Member', role: 'owner' }); assert.equal(response.status, 200);
   cookie = response.headers.get('set-cookie')!.split(';')[0]; token = cookie.split('=')[1]; assert.match(token, /^bkv_[A-Za-z0-9_-]{43}$/); assert.match(response.headers.get('set-cookie')!, /HttpOnly/i);
   assert.match(response.headers.get('cache-control')!, /no-store/); const payload = await response.json(); assert.equal(payload.data.member.siteId, a.id); assert.equal(payload.data.member.status, 'active'); assert.equal(payload.data.member.role, undefined); assert.equal(payload.data.token, undefined);
  });
  await check('session uses active same-site membership; operator/provider tokens cannot substitute', async () => {
   assert.equal((await send('session', a, {}, { cookie })).status, 200);
   assert.equal((await send('session', b, {}, { cookie, origin: 'https://site-b.example.com' })).status, 401);
   assert.equal((await send('session', b, {}, { authorization: `Bearer ${token}`, origin: 'https://site-b.example.com' })).status, 401);
   assert.equal((await send('session', a, {}, { authorization: 'Bearer verified', cookie: 'backy_admin_session=operator-token', 'x-backy-admin-session': token })).status, 401);
  });
  await check('provider login never implicitly enrolls another website', async () => {
   assert.equal((await send('login', b, { email: 'member@example.com', password: 'correct-password' }, { origin: 'https://site-b.example.com' })).status, 401);
   assert.equal(await repositories.visitorAccounts.getByEmail(b.id, 'member@example.com'), null);
   assert.equal((await send('login', a, { email: 'member@example.com', password: 'wrong' })).status, 401);
  });
  await check('recovery hides member existence and binds one-time challenge to site/member', async () => {
   const missing = await send('recovery', a, { email: 'missing@example.com', returnUrl: 'https://site-a.example.com/account' });
   const existing = await send('recovery', a, { email: 'member@example.com', returnUrl: 'https://site-a.example.com/account' });
   assert.equal(missing.status, 202); assert.equal(existing.status, 202); assert.deepEqual(await missing.json(), await existing.json());
   assert.equal(recoveries.length, 1); const recovery = new URL(recoveries[0].url), challenge = recovery.searchParams.get('backyVisitorRecovery'); assert(challenge); assert.equal(recovery.searchParams.get('backySiteId'), a.id);
   assert.equal((await send('reset-password', b, { accessToken: 'verified', recoveryToken: challenge, password: 'new-correct-password' }, { origin: 'https://site-b.example.com' })).status, 401);
   assert.equal((await send('reset-password', a, { accessToken: 'other', recoveryToken: challenge, password: 'new-correct-password' })).status, 401);
   assert.equal((await send('reset-password', a, { accessToken: 'verified', recoveryToken: challenge, password: 'new-correct-password' })).status, 200);
   assert.equal((await send('session', a, {}, { cookie })).status, 401);
   assert.equal((await send('reset-password', a, { accessToken: 'verified', recoveryToken: challenge, password: 'new-correct-password' })).status, 401);
  });
  await check('logout revokes one current session and returns safe cookie deletion', async () => {
   const login = await send('login', a, { email: 'member@example.com', password: 'correct-password' }); assert.equal(login.status, 200);
   const current = login.headers.get('set-cookie')!.split(';')[0];
   assert.equal((await send('logout', a, {}, { cookie: current })).status, 200); assert.equal((await send('session', a, {}, { cookie: current })).status, 401);
  });
  await check('same email must explicitly enroll second site; no identity migration', async () => {
   assert.equal((await send('register', b, { accessToken: 'verified' }, { origin: 'https://site-b.example.com' })).status, 200);
   const first = await repositories.visitorAccounts.getByEmail(a.id, 'member@example.com'), second = await repositories.visitorAccounts.getByEmail(b.id, 'member@example.com'); assert.notEqual(first.id, second.id);
  });
  await check('disabled accounts, disabled enrollment, and missing policy fail closed', async () => {
   const count = providerRequests.length;
   const original = a.settings.visitorAccounts;
   a.settings.visitorAccounts = { ...original, registrationEnabled: false }; if (repositories.sites.update) await repositories.sites.update(a.id, { settings: { visitorAccounts: a.settings.visitorAccounts } }); assert.equal((await send('register', a, { accessToken: 'verified' })).status, 403);
   a.settings.visitorAccounts = { enabled: true, allowedOrigins: [], returnUrls: [] }; if (repositories.sites.update) await repositories.sites.update(a.id, { settings: { visitorAccounts: a.settings.visitorAccounts } }); assert.equal((await send('login', a, {})).status, 503);
   a.settings.visitorAccounts = { ...original, enabled: false }; if (repositories.sites.update) await repositories.sites.update(a.id, { settings: { visitorAccounts: a.settings.visitorAccounts } }); assert.equal((await send('session', a, {}, { cookie })).status, 403);
   a.settings.visitorAccounts = original; if (repositories.sites.update) await repositories.sites.update(a.id, { settings: { visitorAccounts: a.settings.visitorAccounts } }); assert.equal(providerRequests.length, count);
  });
  await check('persistent account throttling blocks repeated bad logins', async () => {
   let last;
   for (let i = 0; i < 7; i++) last = await send('login', a, { email: 'flood@example.com', password: 'wrong' });
   assert.equal(last.status, 429); assert.doesNotMatch(await last.text(), /fixture-anon|provider-private/);
  });
  await check('operator lookup failures fail closed before signup', async () => {
   const lookup = repositories.visitorAccounts.isOperatorIdentity;
   repositories.visitorAccounts.isOperatorIdentity = async () => { throw new Error('database unavailable'); };
   try { const calls = providerRequests.length; assert.equal((await send('register', a, { email: 'guard-failure@example.com', password: 'correct-password', returnUrl: 'https://site-a.example.com/account' })).status, 503); assert.equal(providerRequests.length, calls); }
   finally { repositories.visitorAccounts.isOperatorIdentity = lookup; }
  });
  await check('streamed payload limit and missing origin fail closed', async () => {
   assert.equal((await send('register', a, { accessToken: 'verified', displayName: 'a'.repeat(20000) })).status, 413);
   assert.equal((await send('login', a, {}, { origin: '' })).status, 403);
  });
  console.log(`Visitor auth real-handler/provider HTTP fixture checks passed: ${passed}.`);
  return { passed, helpers, sessions };
 } finally {
  if (old.url === undefined) delete process.env.BACKY_SUPABASE_URL; else process.env.BACKY_SUPABASE_URL = old.url;
  if (old.key === undefined) delete process.env.BACKY_SUPABASE_ANON_KEY; else process.env.BACKY_SUPABASE_ANON_KEY = old.key;
  if (old.mode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old.mode;
  await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve()));
 }
}
export function memoryVisitorFixture() {
 const members: any[] = [], sessions: any[] = [], challenges: any[] = [], limits = new Map<string, number>();
 const repository = {
  isOperatorIdentity: async (identity: any) => identity.email === 'operator@example.com',
  enroll: async (siteId: string, identity: any, displayName: string) => { let member = members.find(row => row.siteId === siteId && row.subject === identity.subject && row.issuer === identity.issuer); if (!member) { member = { id: randomUUID(), siteId, email: identity.email, status: 'active', displayName, subject: identity.subject, issuer: identity.issuer, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; members.push(member); } return member; },
  getByIdentity: async (siteId: string, identity: any) => members.find(row => row.siteId === siteId && row.subject === identity.subject && row.issuer === identity.issuer && row.email === identity.email) || null,
  getByEmail: async (siteId: string, email: string) => members.find(row => row.siteId === siteId && row.email === email) || null,
  createSession: async (input: any) => { if (!members.some(row => row.id === input.memberId && row.siteId === input.siteId && row.status === 'active')) return false; sessions.push(input); return true; },
  resolveSession: async (siteId: string, tokenHash: string, now: string) => { const session = sessions.find(row => row.siteId === siteId && row.tokenHash === tokenHash && row.expiresAt > now); return session ? members.find(row => row.siteId === siteId && row.id === session.memberId && row.status === 'active') || null : null; },
  revokeSession: async (siteId: string, tokenHash: string) => { const index = sessions.findIndex(row => row.siteId === siteId && row.tokenHash === tokenHash); if (index >= 0) sessions.splice(index, 1); },
  revokeMemberSessions: async (siteId: string, memberId: string) => { for (let i=sessions.length-1;i>=0;i--) if (sessions[i].siteId === siteId && sessions[i].memberId === memberId) sessions.splice(i,1); },
  revokeIdentitySessions: async (identity: any) => { const ids = members.filter(row => row.subject === identity.subject && row.issuer === identity.issuer).map(row => row.id); for (let i=sessions.length-1;i>=0;i--) if (ids.includes(sessions[i].memberId)) sessions.splice(i,1); },
  createRecoveryChallenge: async (input: any) => { challenges.push(input); },
  consumeRecoveryChallenge: async (siteId: string, memberId: string, tokenHash: string, now: string) => { const index = challenges.findIndex(row => row.siteId === siteId && row.memberId === memberId && row.tokenHash === tokenHash && row.expiresAt > now); if (index < 0) return false; challenges.splice(index,1); return true; },
  consumeRateLimit: async (siteId: string, key: string, limit: number) => { const count = (limits.get(siteId+key) || 0) + 1; limits.set(siteId+key,count); return count <= limit; },
 };
 const sites = ['a','b'].map(name => ({ id: randomUUID(), slug: `site-${name}`, isPublished: true, settings: { visitorAccounts: { enabled: true, registrationEnabled: true, allowedOrigins: [`https://site-${name}.example.com`], returnUrls: [`https://site-${name}.example.com/account`] } } }));
 return { members, sessions, challenges, sites, repositories: { visitorAccounts: repository, sites: { getById: async (id: string) => sites.find(site => site.id === id), getBySlug: async (slug: string) => sites.find(site => site.slug === slug) } } };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { const fixture = memoryVisitorFixture(); await runVisitorAuthProof(fixture.repositories, fixture.sites); }
