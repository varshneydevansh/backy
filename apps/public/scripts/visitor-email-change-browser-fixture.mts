// Owned local acceptance fixture: real account/BFF/handlers/repository, synthetic provider.
// Never accepts a configured database, provider credentials, or a live target.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import { createServer as createViteServer } from 'vite';
import react from '@vitejs/plugin-react';
import { withVisitorProfilePostgres } from '../../../packages/db/scripts/visitor-profile-postgres-isolated.mts';

if (process.argv.length > 2) throw new Error('No fixture target arguments are allowed.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const scratch = mkdtempSync('/tmp/backy-visitor-email-browser-');
symlinkSync(join(root, 'node_modules'), join(scratch, 'node_modules'), 'dir');
const origin = 'http://127.0.0.1:5238', backend = 'http://127.0.0.1:3048';
const require = createRequire(import.meta.url);
const mode = { NODE_ENV: 'test', BACKY_VISITOR_FRONTEND_ORIGIN: origin, BACKY_VISITOR_RETURN_URL: origin + '/account', BACKY_SUPABASE_URL: backend, BACKY_SUPABASE_ANON_KEY: 'synthetic-anon-key' };
function load(relative: string, mocks: Record<string, unknown> = {}) {
  const filename = join(root, relative), module = { exports: {} as any };
  vm.runInNewContext(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText,
    { module, exports: module.exports, require: (id: string) => id in mocks ? mocks[id] : require(id), process: { env: mode }, Buffer, TextDecoder, URL, Date, Headers, fetch, AbortSignal, setTimeout, clearTimeout, console }, { filename });
  return module.exports;
}
let stop!: () => void;
const stopped = new Promise<void>(accept => { stop = accept; });
process.once('SIGINT', stop); process.once('SIGTERM', stop);
try {
  await withVisitorProfilePostgres(async ({ client, repo, sites, repositories }) => {
    const site = sites[0], other = sites[1];
    const settings = { visitorAccounts: { enabled: true, registrationEnabled: false, allowedOrigins: [origin], returnUrls: [origin + '/account'] } };
    await client`UPDATE sites SET settings=${JSON.stringify(settings)}::jsonb WHERE id=${site.id}`;
    site.settings = settings;
    const identity = { issuer: backend + '/auth/v1', subject: randomUUID(), email: 'visitor-original@example.test' };
    const member = await repo.enroll(site.id, identity, 'Retained visitor name');
    const otherMember = await repo.enroll(other.id, identity, 'Suspended other website');
    const sessions = load('apps/public/src/lib/visitor-auth/session.ts');
    const tokens = [sessions.newVisitorToken(), sessions.newVisitorToken()];
    for (const [index, target] of [member, otherMember].entries()) {
      assert(await repo.createSession({ siteId: target.siteId, memberId: target.id, tokenHash: sessions.visitorTokenHash(tokens[index]), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString() }));
      await repo.createRecoveryChallenge({ siteId: target.siteId, memberId: target.id, tokenHash: sessions.visitorTokenHash(sessions.newVisitorToken()), expiresAt: new Date(Date.now() + 3600000).toISOString() });
    }
    await repo.management!.update(other.id, otherMember.id, { status: 'suspended' });
    const provider = load('apps/public/src/lib/visitor-auth/provider.ts');
    const helpers = load('apps/public/src/lib/visitor-auth/routes.ts', { '@/lib/repositoryRuntime': { getRequiredDatabaseRepositories: async () => repositories }, './session': sessions, './provider': provider });
    const emailHelpers = load('apps/public/src/lib/visitor-auth/email-change-routes.ts', { '@/lib/repositoryRuntime': { getRequiredDatabaseRepositories: async () => repositories }, './session': sessions, './provider': provider, './routes': helpers });
    const routes: Record<string, any> = {};
    for (const operation of ['session', 'login', 'logout', 'profile', 'email-change', 'confirm-email-change']) {
      routes[operation] = load(`apps/public/src/app/api/sites/[siteId]/visitor-auth/${operation}/route.ts`, { '@/lib/visitor-auth/routes': helpers, '@/lib/visitor-auth/email-change-routes': emailHelpers });
    }
    const core = load('packages/core/src/visitor-accounts.ts');
    const bff = load('examples/custom-frontend-next/src/lib/visitor-bff.ts', { './backy': { backyConfig: { apiBaseUrl: backend + '/api', siteId: site.slug } } });
    const bffRoute = load('examples/custom-frontend-next/src/app/api/backy-account/[operation]/route.ts', { '../../../../lib/visitor-bff': bff });
    let providerEmail = identity.email, pendingEmail = '', providerFailure = false;
    const requests: any[] = [], providerRequests: any[] = [];
    const evidence = async () => {
      const a = await repo.management!.getById(site.id, member.id), b = await repo.management!.getById(other.id, otherMember.id);
      const [counts] = await client`SELECT (SELECT count(*)::int FROM visitor_sessions) AS sessions,(SELECT count(*)::int FROM visitor_recovery_challenges) AS challenges`;
      return { mode: 'checked-account-bff-handler-source-repository-disposable-postgresql', syntheticIdentityAndProvider: true, siteId: site.id, member: { id: a!.id, email: a!.email, displayName: a!.displayName, status: a!.status }, otherMembership: { id: b!.id, email: b!.email, displayName: b!.displayName, status: b!.status }, providerEmail, pendingEmail, ...counts, requests, providerRequests };
    };
    const persist = async () => { const value = await evidence(); writeFileSync('/tmp/backy-visitor-email-browser-evidence.json', JSON.stringify(value, null, 2) + '\n'); return value; };
    const json = (res: any, value: any, status = 200) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(value)); };
    const server = createServer(async (req, res) => {
      try {
        const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks), url = new URL(req.url!, backend), headers = new Headers();
        for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(name, value);
        if (url.pathname.startsWith('/auth/v1/')) {
          providerRequests.push({ path: url.pathname, method: req.method, redirectApproved: url.searchParams.has('redirect_to') ? url.searchParams.get('redirect_to') === origin + '/account' : null });
          assert.equal(headers.get('apikey'), mode.BACKY_SUPABASE_ANON_KEY);
          const input = body.length ? JSON.parse(body.toString()) : {};
          if (url.pathname === '/auth/v1/token') { json(res, input.email === providerEmail && input.password === 'fixture-current-password' ? { access_token: 'fixture-provider-token' } : { error: 'Invalid synthetic grant' }, input.email === providerEmail && input.password === 'fixture-current-password' ? 200 : 400); return; }
          assert.equal(headers.get('authorization'), 'Bearer fixture-provider-token');
          if (url.pathname === '/auth/v1/user' && req.method === 'PUT') {
            assert.deepEqual(Object.keys(input), ['email']); assert.equal(url.searchParams.get('redirect_to'), origin + '/account');
            if (providerFailure) { json(res, { error: 'Synthetic provider failure' }, 503); return; }
            pendingEmail = input.email;
          }
          if (url.pathname === '/auth/v1/user') { json(res, { id: identity.subject, email: providerEmail, email_confirmed_at: '2026-01-01T00:00:00Z' }); return; }
          json(res, { error: 'Unknown synthetic provider operation' }, 404); return;
        }
        if (url.pathname.startsWith('/fixture/')) {
          if (req.method === 'POST' && headers.get('origin') !== origin) { json(res, { error: 'Fixture origin denied' }, 403); return; }
          if (url.pathname === '/fixture/session' && req.method === 'POST') { res.setHeader('set-cookie', `${sessions.visitorCookieName(site.id)}=${tokens[0]}; HttpOnly; SameSite=Lax; Path=/`); json(res, await persist()); return; }
          if (url.pathname === '/fixture/confirm' && req.method === 'POST') { if (pendingEmail) { providerEmail = pendingEmail; pendingEmail = ''; } json(res, await persist()); return; }
          if (url.pathname === '/fixture/provider-failure' && req.method === 'POST') { providerFailure = true; json(res, await persist()); return; }
          if (url.pathname === '/fixture/stop' && req.method === 'POST') { await persist(); json(res, { stopped: true }); stop(); return; }
          if (url.pathname === '/fixture/evidence') { json(res, await persist()); return; }
          json(res, { error: 'Unknown fixture operation' }, 404); return;
        }
        const discovery = url.pathname.match(/^\/api\/sites\/([^/]+)\/agent-handoff$/);
        if (discovery) { const saved = await repositories.sites.getById(decodeURIComponent(discovery[1])) || await repositories.sites.getBySlug(decodeURIComponent(discovery[1])); assert(saved); json(res, { success: true, data: { site: { id: saved.id }, handoff: { visitorAccounts: core.buildBackyVisitorAccountHandoff(saved.id, saved.settings.visitorAccounts) } } }); return; }
        const visitor = url.pathname.match(/^\/api\/sites\/([^/]+)\/visitor-auth\/([^/]+)$/), bridge = url.pathname.match(/^\/api\/backy-account\/([^/]+)$/);
        const operation = visitor ? visitor[2] : bridge?.[1];
        if (!operation || !routes[operation]) { json(res, { error: 'Unknown fixture route' }, 404); return; }
        const request = new NextRequest(url, { method: req.method, headers, ...(body.length ? { body } : {}) });
        const response = await (visitor ? routes[operation] : bffRoute)[req.method!](request, { params: Promise.resolve(visitor ? { siteId: decodeURIComponent(visitor[1]) } : { operation }) });
        requests.push({ boundary: visitor ? 'actual-handler' : 'actual-bff', operation, method: req.method, status: response.status });
        for (const [name, value] of response.headers) res.setHeader(name, value);
        res.statusCode = response.status; res.end(await response.text()); await persist();
      } catch (error) { console.error(error); json(res, { error: 'Owned fixture failed' }, 500); }
    });
    let vite: any;
    try {
      await new Promise<void>(accept => server.listen(3048, '127.0.0.1', accept));
      mkdirSync(join(scratch, 'web'));
      writeFileSync(join(scratch, 'web/index.html'), '<html><head><title>Isolated email-change acceptance</title></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>');
      writeFileSync(join(scratch, 'web/main.tsx'), `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{BackyAccount}from'/@fs/${root}/examples/custom-frontend-next/src/lib/account.tsx';function App(){const[proof,setProof]=useState();async function control(action){setProof(await(await fetch('/fixture/'+action,{method:'POST'})).json());if(action==='session')location.reload()}return <><section style={{maxWidth:850,margin:'24px auto',padding:16,border:'1px solid #777'}}><h1>Isolated email-change acceptance</h1><p>Actual checked account, BFF, provider HTTP adapter, website handlers and repository on disposable PostgreSQL. Synthetic provider and visitor; no live account or email.</p><button onClick={()=>control('session')}>Load disposable visitor session</button><button onClick={()=>control('confirm')}>Confirm synthetic provider address</button><button onClick={()=>control('provider-failure')}>Fail synthetic provider update</button><button onClick={()=>control('stop')}>Stop owned fixture</button><button onClick={async()=>setProof(await(await fetch('/fixture/evidence')).json())}>Inspect persisted fixture evidence</button>{proof&&<pre aria-label="Persisted fixture evidence">{JSON.stringify(proof,null,2)}</pre>}</section><BackyAccount siteId=${JSON.stringify(site.id)} registrationEnabled={false} emailChangeAvailable={true}/></>}createRoot(document.getElementById('root')).render(<App/>);`);
      vite = await createViteServer({ configFile: false, root: join(scratch, 'web'), plugins: [react()], resolve: { dedupe: ['react', 'react-dom'] }, server: { host: '127.0.0.1', port: 5238, strictPort: true, fs: { allow: [root, scratch] }, proxy: { '/api': { target: backend }, '/fixture': { target: backend } } } });
      await vite.listen(); await persist(); console.log(JSON.stringify({ ready: true, url: origin + '/account', scratch })); await stopped;
    } finally { if (vite) await vite.close(); await new Promise<void>(accept => server.close(() => accept())); }
  });
} finally { rmSync(scratch, { recursive: true, force: true }); }
console.log(JSON.stringify({ stopped: true, ownedScratchAndClusterRemoved: true }));
