// Actual served routes + shared auth + durable demo journal. CUA performs UI actions.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { buildSync } from 'esbuild';
import { mkdtempSync, symlinkSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { NextRequest } from 'next/server';
const root = resolve(import.meta.dirname, '../../..'), previousCwd = process.cwd(), scratch = mkdtempSync('/tmp/backy-delivery-review-browser-');
process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));
const port = 5218, origin = `http://127.0.0.1:${port}`;
process.env.BACKY_ADMIN_TRUSTED_ORIGINS = origin;
process.chdir(scratch); process.env.BACKY_DATA_MODE = 'demo'; process.env.NODE_ENV = 'test'; delete process.env.BACKY_ADMIN_API_KEY; delete process.env.BACKY_ADMIN_SECRET_KEY;
const unwrap = (module: any) => module.default || module;
const publicModule = (path: string) => import(join(root, 'apps/public/src', path)).then(unwrap);
const store: any = await publicModule('lib/backyStore.ts'), sessions: any = await publicModule('lib/admin-auth/sessionStore.ts');
const site = store.createAdminSite({ id: 'review-site', name: 'Owned review site', slug: 'review-site', status: 'published' });
store.createAdminSite({ id: 'review-other', name: 'Other isolated site', slug: 'review-other', status: 'published' });
const owner = store.createAdminUser({ id: 'review-owner', email: 'owner@fixture.invalid', fullName: 'Synthetic owner', role: 'owner', status: 'active' });
const operator = store.createAdminUser({ id: 'review-operator', email: 'operator@fixture.invalid', fullName: 'Synthetic operator', role: 'admin', status: 'active' });
const ownerSession = sessions.createAdminSessionForExternalUser(owner, 'supabase', { sessionTimeoutMinutes: 120 });
const operatorSession = sessions.createAdminSessionForExternalUser(operator, 'supabase', { sessionTimeoutMinutes: 120 });
store.updateAdminSettings({ integrations: { notifications: { digestFrequency: 'off' }, storage: { provider: 'local' } } });
const page = store.createAdminPage(site.id, { title: 'Review fixture page', slug: 'review-page', status: 'draft', content: {} });
const comment = store.createComment({ siteId: site.id, targetType: 'page', targetId: page.id, content: 'Retained comment investigation', authorName: 'Synthetic visitor', status: 'pending' });
const form = store.createAdminForm({ id: 'review-form', siteId: site.id, name: 'Retained form investigation', title: 'Retained form investigation', isActive: false, audience: 'public', fields: [{ key: 'message', label: 'Message', type: 'text' }], settings: {} });
const submission = store.createFormSubmission({ siteId: site.id, formId: form.id, values: { message: 'Retained synthetic submission' }, status: 'pending' });
const commentJournal = (await publicModule('lib/demoCommentDeliveryJournal.ts')).demoCommentDeliveryJournal;
const formJournal = (await publicModule('lib/demoFormDeliveryJournal.ts')).demoFormDeliveryJournal;
const pending = await commentJournal.admit({ siteId: site.id, commentId: comment.id, kind: 'comment-status', channel: 'email', target: 'mailto:synthetic@example.invalid', requestId: 'owned-comment-seed', actor: owner.id, reason: 'pending' });
const uncertain = await formJournal.admit({ siteId: site.id, formId: form.id, submissionId: submission.id, kind: 'form-submission', channel: 'email', target: 'mailto:synthetic@example.invalid', requestId: 'owned-form-seed', actor: owner.id, reason: 'pending' });
await formJournal.settle(site.id, uncertain.id, { state: 'uncertain', statusCode: 202, errorCode: 'PROVIDER_COMPLETION_UNKNOWN', providerEvidence: { provider: 'local-outbox', observedAt: new Date().toISOString(), providerMessageId: 'owned-outbox-evidence', outboxOnly: true } });
const definitions: any[] = [
  ['sites/([^/]+)/comments/([^/]+)/delivery-attempts/([^/]+)/reconciliation', 'sites/[siteId]/comments/[commentId]/delivery-attempts/[attemptId]/reconciliation', ['siteId', 'commentId', 'attemptId']],
  ['admin/sites/([^/]+)/forms/([^/]+)/submissions/([^/]+)/delivery-attempts/([^/]+)/reconciliation', 'admin/sites/[siteId]/forms/[formId]/submissions/[submissionId]/delivery-attempts/[attemptId]/reconciliation', ['siteId', 'formId', 'submissionId', 'attemptId']],
  ['sites/([^/]+)/comments/delivery-attempts', 'sites/[siteId]/comments/delivery-attempts', ['siteId']],
  ['sites/([^/]+)/comments/analytics', 'sites/[siteId]/comments/analytics', ['siteId']],
  ['sites/([^/]+)/comments/blocklist', 'sites/[siteId]/comments/blocklist', ['siteId']],
  ['sites/([^/]+)/comments', 'sites/[siteId]/comments', ['siteId']],
  ['admin/sites/([^/]+)/forms/([^/]+)/delivery-attempts', 'admin/sites/[siteId]/forms/[formId]/delivery-attempts', ['siteId', 'formId']],
  ['admin/sites/([^/]+)/forms/analytics', 'admin/sites/[siteId]/forms/analytics', ['siteId']],
  ['admin/sites/([^/]+)/forms/attachment-cleanup', 'admin/sites/[siteId]/forms/attachment-cleanup', ['siteId']],
  ['admin/sites/([^/]+)/forms/([^/]+)/submissions', 'admin/sites/[siteId]/forms/[formId]/submissions', ['siteId', 'formId']],
  ['admin/sites/([^/]+)/forms/([^/]+)', 'admin/sites/[siteId]/forms/[formId]', ['siteId', 'formId']],
  ['admin/sites/([^/]+)/forms', 'admin/sites/[siteId]/forms', ['siteId']],
  ['admin/sites/([^/]+)/frontend-design', 'admin/sites/[siteId]/frontend-design', ['siteId']],
  ['admin/sites/([^/]+)/collections', 'admin/sites/[siteId]/collections', ['siteId']],
  ['admin/sites/([^/]+)/pages', 'admin/sites/[siteId]/pages', ['siteId']],
  ['admin/sites/([^/]+)/blog', 'admin/sites/[siteId]/blog', ['siteId']],
  ['admin/sites/([^/]+)', 'admin/sites/[siteId]', ['siteId']],
  ['admin/users/([^/]+)/permissions', 'admin/users/[userId]/permissions', ['userId']],
  ['admin/audit-logs', 'admin/audit-logs', []],
  ['sites/([^/]+)/events', 'sites/[siteId]/events', ['siteId']],
];
const entries: any[] = []; for (const [path, module, params] of definitions) entries.push({ pattern: new RegExp('^/api/' + path + '$'), module: await publicModule('app/api/' + module + '/route.ts'), params });
const events: any[] = []; let server: any, staleNext = false, holdNext = false, releaseHeld: (() => void) | undefined;
const journalFile = (kind: string) => join(scratch, `data/backy/private-${kind}-delivery/attempts.json`);
const evidence = () => ({ boundary: 'Actual served Comments/Forms, actual handlers/shared auth, durable private demo journal; synthetic owner/operator, no provider/database/deployment certification.', ids: { siteId: site.id, commentId: comment.id, formId: form.id, submissionId: submission.id, pending: pending.id, uncertain: uncertain.id }, commentAttempts: JSON.parse(readFileSync(journalFile('comment'), 'utf8')), formAttempts: JSON.parse(readFileSync(journalFile('form'), 'utf8')), events });
try {
  symlinkSync(join(root, 'node_modules'), join(scratch, 'node_modules'), 'dir');
  execFileSync(join(root, 'node_modules/.bin/tailwindcss'), ['-c', 'apps/admin/tailwind.config.js', '-i', 'apps/admin/src/index.css', '-o', join(scratch, 'proof.css'), '--content', 'apps/admin/src/**/*.{ts,tsx}'], { cwd: root, stdio: 'pipe' });
  buildSync({ entryPoints: [join(root, 'packages/core/src/index.ts')], outfile: join(scratch, 'core.mjs'), bundle: true, format: 'esm', platform: 'browser', logLevel: 'silent' });
  writeFileSync(join(scratch, 'index.html'), `<!doctype html><html><head><title>Owned delivery review acceptance</title><link rel="stylesheet" href="/proof.css"></head><body><div id="root"></div><script type="module" src="/@fs/${root}/apps/admin/scripts/delivery-review-runtime-fixture.tsx"></script></body></html>`);
  server = await createServer({ configFile: false, root: scratch, plugins: [react(), { name: 'actual-review-http', configureServer(vite: any) { vite.middlewares.use(async (req: any, res: any, next: any) => {
    const url = new URL(req.url, origin);
    if (url.pathname === '/fixture/login') { res.setHeader('set-cookie', `backy_admin_session=${url.searchParams.get('mode') === 'operator' ? operatorSession.token : ownerSession.token}; HttpOnly; SameSite=Strict; Path=/`); res.end('{}'); return; }
    if (url.pathname === '/fixture/stale-next') { staleNext = true; res.end('{}'); return; }
    if (url.pathname === '/fixture/hold-next') { holdNext = true; res.end('{}'); return; }
    if (url.pathname === '/fixture/release') { releaseHeld?.(); releaseHeld = undefined; res.end('{}'); return; }
    if (url.pathname === '/fixture/provider') { events.push({ kind: 'provider-request' }); res.end('{}'); return; }
    if (url.pathname === '/fixture/evidence') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(evidence())); return; }
    if (url.pathname === '/fixture/denied-proof') {
      const row = await commentJournal.get(site.id, comment.id, pending.id), path = `/api/sites/${site.id}/comments/${comment.id}/delivery-attempts/${pending.id}/reconciliation`;
      const entry = entries[0], request = new NextRequest(origin + path, { method: 'POST', headers: { cookie: `backy_admin_session=${operatorSession.token}`, origin, 'content-type': 'application/json' }, body: JSON.stringify({ expectedUpdatedAt: row.updatedAt, expectedState: row.state, expectedReviewVersion: row.reconciliationVersion, evidence: 'outcome-unavailable', disposition: 'retain-without-resend' }) });
      const response = await entry.module.POST(request, { params: Promise.resolve({ siteId: site.id, commentId: comment.id, attemptId: pending.id }) }); events.push({ kind: 'nonowner-handler-proof', path, status: response.status, body: await response.clone().json() }); res.statusCode = response.status; res.end(await response.text()); return;
    }
    if (!url.pathname.startsWith('/api/')) return next();
    try {
      const entry = entries.find(candidate => candidate.pattern.test(url.pathname)); if (!entry || !entry.module[req.method]) { res.statusCode = 404; res.end('{}'); return; }
      const match = url.pathname.match(entry.pattern), params = Object.fromEntries(entry.params.map((key: string, index: number) => [key, match![index + 1]]));
      const chunks = []; for await (const chunk of req) chunks.push(chunk); const rawBody = Buffer.concat(chunks);
      if (url.pathname.endsWith('/reconciliation') && req.method === 'POST') {
        const parsed = JSON.parse(rawBody.toString()), isForm = Boolean(params.formId), journal = isForm ? formJournal : commentJournal;
        if (staleNext) { staleNext = false; await journal.recordReconciliation({ ...params, ...parsed, actorId: owner.id, requestId: 'owned-competing-review' }); events.push({ kind: 'competing-review', path: url.pathname }); }
        if (holdNext) { holdNext = false; events.push({ kind: 'held-review', path: url.pathname }); await new Promise<void>(resolveHold => { releaseHeld = resolveHold; }); }
      }
      const request = new NextRequest(url, { method: req.method, headers: req.headers, ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: rawBody }) });
      const response = await entry.module[req.method](request, { params: Promise.resolve(params) }); const body = await response.clone().json().catch(() => null);
      events.push({ kind: 'actual-handler', method: req.method, path: url.pathname, status: response.status, body }); res.statusCode = response.status; response.headers.forEach((value: string, key: string) => res.setHeader(key, value)); res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) { console.error(error); res.statusCode = 500; res.end(JSON.stringify({ success: false, error: { message: 'Owned fixture failed' } })); }
  }); } }], resolve: { alias: { '@': join(root, 'apps/admin/src'), '@backy-cms/core': join(scratch, 'core.mjs') }, dedupe: ['react', 'react-dom'] }, define: { 'process.env': '{}', 'import.meta.env.VITE_BACKY_ADMIN_API_BASE_URL': JSON.stringify(origin + '/api/admin') }, server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [root, scratch] } } });
  await server.listen(); console.log(JSON.stringify({ ready: true, url: origin + '/comments?siteId=' + site.id, scratch }));
  await new Promise(resolveDone => { process.once('SIGTERM', resolveDone); process.once('SIGINT', resolveDone); });
  releaseHeld?.(); writeFileSync('/tmp/backy-delivery-review-browser-proof.json', JSON.stringify(evidence(), null, 2));
} finally { await server?.close(); process.chdir(previousCwd); rmSync(scratch, { recursive: true, force: true }); }
