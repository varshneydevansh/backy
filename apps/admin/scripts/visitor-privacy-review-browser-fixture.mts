/** Actual UI+GET handlers+central auth; isolated synthetic identity/repository only. */
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdtempSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { NextRequest } from 'next/server';
import { fixture, load } from '../../public/scripts/admin-access-test-fixtures.mts';
const root = resolve(import.meta.dirname, '../../..'), scratch = mkdtempSync('/tmp/backy-visitor-privacy-ui-'), port = 5241, origin = `http://127.0.0.1:${port}`;
const proofPath = '/tmp/backy-visitor-privacy-ui-mounted-proof.json', httpProofPath = '/tmp/backy-visitor-privacy-ui-http-proof.json';
const f = fixture({ actorRole: 'owner' }), requests: any[] = [];
const members = [
  { id: '11111111-1111-4111-8111-111111111111', siteId: 'site-fixture', email: 'member@example.test', displayName: 'Fixture website member', status: 'active', createdAt: '2026-10-11T00:00:00Z', updatedAt: '2026-10-11T00:00:00Z' },
  { id: '22222222-2222-4222-8222-222222222222', siteId: 'other-site', email: 'other@example.test', displayName: 'Other website member', status: 'removed', createdAt: '2026-10-11T00:00:00Z', updatedAt: '2026-10-11T00:00:00Z' },
];
const snapshot = (siteId: string, memberId: string) => ({ schema: 'backy.visitor-privacy-impact.v1', siteId, memberId, memberStatus: members.find(m => m.id === memberId)!.status, observedAt: new Date().toISOString(), reviewMode: 'read-only-point-in-time',
  counts: { comments: 17, formSubmissions: 3, linkedContacts: 2, commentDeliveryAttempts: { total: 4, pending: 1, unknownOutcome: 1 }, formDeliveryAttempts: { total: 3, pending: 0, unknownOutcome: 1 } },
  retainedCategories: ['membership-identity', 'comments-and-moderation', 'submission-values-files-and-admin-metadata', 'source-submission-contact-copies', 'delivery-evidence'],
  boundaries: { contactOwnership: 'ambiguous-source-submission-link', downstreamProvenance: 'unknown', emailMatchedOwnership: false, contentInspected: false, erasurePerformed: false, providerChanged: false } });
const repositories = { ...f.repositories, visitorAccounts: {
  management: { list: async (siteId: string, input: any) => ({ members: members.filter(m => m.siteId === siteId).slice(input.offset, input.offset + input.limit), limit: input.limit, offset: input.offset, hasMore: false }) },
  privacyImpact: { review: async (siteId: string, memberId: string) => members.some(m => m.siteId === siteId && m.id === memberId) ? snapshot(siteId, memberId) : null },
} };
const runtime = { shouldUseDemoStoreFallback: () => false, getRequiredDatabaseRepositories: async () => repositories, resolvePublicRepositoryRuntimeConfig: () => ({}) };
const mocks = { ...f.mocks, '@/lib/repositoryRuntime': runtime, '@/lib/admin-auth/sessionCookie': load('../src/lib/admin-auth/sessionCookie.ts'),
  '@/lib/admin-auth/sessionStore': { ...f.mocks['@/lib/admin-auth/sessionStore'], getAdminSessionWithPersistence: async (token: string) => token === 'synthetic-owner-cookie' ? { token, user: f.actor } : null } };
const access = load('../src/lib/adminAccess.ts', mocks), helperMocks = { './adminAccess': access, './repositoryRuntime': runtime };
const helper = load('../src/lib/adminVisitorPrivacyImpact.ts', helperMocks), inventory = load('../src/lib/adminVisitorMembers.ts', helperMocks);
const reviewRoute = load('../src/app/api/admin/sites/[siteId]/visitors/members/[memberId]/privacy-impact/route.ts', { '@/lib/adminVisitorPrivacyImpact': helper });
const inventoryRoute = load('../src/app/api/admin/sites/[siteId]/visitors/route.ts', { '@/lib/adminVisitorMembers': inventory });
let server: any;
try {
  symlinkSync(join(root, 'node_modules'), join(scratch, 'node_modules'), 'dir');
  execFileSync(join(root, 'node_modules/.bin/tailwindcss'), ['-c', 'apps/admin/tailwind.config.js', '-i', 'apps/admin/src/index.css', '-o', join(scratch, 'proof.css'), '--content', 'apps/admin/src/**/*.{ts,tsx},apps/admin/scripts/visitor-privacy-review-runtime-fixture.tsx'], { cwd: root, stdio: 'pipe' });
  writeFileSync(join(scratch, 'index.html'), `<!doctype html><html><head><title>Visitor privacy review acceptance</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/proof.css"></head><body><div id="root"></div><script type="module" src="/@fs/${root}/apps/admin/scripts/visitor-privacy-review-runtime-fixture.tsx"></script></body></html>`);
  server = await createServer({ configFile: false, root: scratch, plugins: [react(), { name: 'actual-privacy-handlers', configureServer(vite: any) { vite.middlewares.use(async (req: any, res: any, next: any) => {
    const url = new URL(req.url, origin), json = (value: any) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value)); };
    if (['/fixture/revoke', '/fixture/restore'].includes(url.pathname) && req.method === 'POST') { f.settings().auth.userPermissionOverrides = url.pathname.endsWith('revoke') ? [{ userId: f.actor.id, permissionKey: 'users.view', value: 'deny', updatedAt: new Date().toISOString() }] : []; return json({ syntheticReviewAccess: url.pathname.endsWith('restore') }); }
    if (url.pathname === '/fixture/proof' && req.method === 'POST') { const chunks = []; for await (const chunk of req) chunks.push(chunk); writeFileSync(proofPath, Buffer.concat(chunks), { mode: 0o600 }); return json({ saved: true }); }
    const match = url.pathname.match(/^\/api\/admin\/sites\/([^/]+)\/visitors(?:\/members\/([^/]+)\/privacy-impact)?$/);
    if (match) {
      if (req.method !== 'GET') { res.statusCode = 405; return json({ success: false }); }
      try { const response = await (match[2] ? reviewRoute : inventoryRoute).GET(new NextRequest(url, { headers: req.headers }), { params: Promise.resolve({ siteId: decodeURIComponent(match[1]), memberId: match[2] && decodeURIComponent(match[2]) }) });
        requests.push({ path: url.pathname + url.search, status: response.status, cookiePresent: Boolean(req.headers.cookie), authorizationPresent: Boolean(req.headers.authorization) });
        writeFileSync(httpProofPath, JSON.stringify({ boundary: 'Actual routes/central auth/safe projection; synthetic owner cookie and repository inputs; no production/provider evidence.', requests, effects: f.effects }, null, 2), { mode: 0o600 });
        res.statusCode = response.status; response.headers.forEach((v, k) => res.setHeader(k, v)); return res.end(Buffer.from(await response.arrayBuffer()));
      } catch { res.statusCode = 500; return json({ success: false }); }
    }
    if (url.pathname === '/') res.setHeader('set-cookie', 'backy_admin_session=synthetic-owner-cookie; HttpOnly; SameSite=Lax; Path=/');
    next();
  }); } }], resolve: { alias: { '@': join(root, 'apps/admin/src') }, dedupe: ['react', 'react-dom'] }, define: { 'import.meta.env.VITE_BACKY_ADMIN_API_BASE_URL': JSON.stringify(origin + '/api/admin') }, server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [root, scratch] } } });
  await server.listen(); console.log(JSON.stringify({ ready: true, url: origin, proofPath, httpProofPath, scratch }));
  await new Promise(r => { process.once('SIGTERM', r); process.once('SIGINT', r); });
} finally { await server?.close(); rmSync(scratch, { recursive: true, force: true }); }
