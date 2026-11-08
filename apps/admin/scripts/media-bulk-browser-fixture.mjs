// Run only against an owned disposable service. Browser interactions use CUA.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { buildSync } from 'esbuild';
import { mkdtempSync, symlinkSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { File } from 'node:buffer';
import vm from 'node:vm';
import ts from 'typescript';
import sharp from 'sharp';
import { NextRequest, NextResponse } from 'next/server.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..'), require = createRequire(import.meta.url);
const scratch = mkdtempSync(join(tmpdir(), 'backy-media-browser-'));
process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));
function load(relative, mocks, env = {}) {
  const filename = join(root, relative), module = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(compiled, { module, exports: module.exports, structuredClone, Request, Response, Headers, URL, URLSearchParams, Buffer, File, FormData, process: { ...process, env }, console, require: id => id.startsWith('./') && ('@/lib/' + id.slice(2)) in mocks ? mocks['@/lib/' + id.slice(2)] : id in mocks ? mocks[id] : id === 'next/server' ? { NextRequest, NextResponse } : id.startsWith('.') ? load(resolve(dirname(filename), id) .slice(root.length + 1) + (id.endsWith('.ts') ? '' : '.ts'), mocks, env) : id.startsWith('@/') ? (() => { throw Error('Missing fixture dependency ' + id); })() : require(id) }, { filename });
  return module.exports;
}
const linkedProof = process.env.BACKY_MEDIA_LINKED_FIXTURE === '1';
let server, mode = 'ready', active = false, releaseUpload;
const holdUpload = () => new Promise(resolve => { releaseUpload = resolve; });
const rows = [], events = [], scans = [], jobs = [];
const site = { id: 'media-browser-proof', slug: 'media-browser-proof', settings: {}, isPublished: true };
const settings = { integrations: { storage: { provider: 'local', workspaceStorageLimitMb: 10, maxFileSizeMb: 2 } }, runtimeStorage: { provider: 'local', configured: true, missing: [], basePath: 'disposable-fixture' }, runtimeMediaScanner: { provider: 'http', configured: true, failOpen: false }, deliveryMode: 'inbox' };
const save = () => writeFileSync(join(scratch, 'media-records.json'), JSON.stringify({ rows, events, scans, jobs }, null, 2));
const safePath = path => { if (!path.startsWith('sites/' + site.id + '/') || /[\\%?#\x00-\x1f]/.test(path) || path.split('/').some(s => !s || s === '.' || s === '..')) throw Error('Invalid owned storage path'); return join(scratch, 'bytes', path); };
const storage = { provider: 'local', upload: async (bytes, input) => { if (mode === 'hold') { events.push({ kind: 'upload-held' }); save(); await holdUpload(); } const path = safePath(input.path); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); events.push({ kind: 'storage-write', path: input.path, bytes: bytes.length }); save(); if (mode === 'uncertain') throw Error('Owned storage wrote then lost confirmation'); return { path: input.path, size: bytes.length, url: '/fixture/bytes/' + input.path }; }, read: async path => readFileSync(safePath(path)), stat: async path => { try { return { size: readFileSync(safePath(path)).length }; } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }, delete: async path => { if (mode === 'followup' || mode === 'uncertain') throw Error('disposable cleanup fixture failure'); rmSync(safePath(path), { force: true }); } };
const linked = load('packages/core/src/media-links.ts', {});
const inventory = load('apps/public/src/lib/mediaInventory.ts', {}), scope = load('apps/public/src/lib/mediaScope.ts', {}), responsive = load('apps/public/src/lib/mediaResponsive.ts', {});
const organization = load('apps/public/src/lib/publicMediaResource.ts', { '@/lib/mediaScope': scope, '@/lib/mediaResponsive': responsive });
const policy = load('apps/public/src/lib/mediaUploadPolicy.ts', {}), mutation = load('apps/public/src/lib/mediaStorageMutation.ts', {});
const storageModule = { getMediaStorageConfigSummary: () => ({ provider: 'local', configured: true, missing: [] }), getMediaStorageAdapter: async () => storage, getMediaStoragePath: ({ siteId, mediaFolder, storedFilename }) => `sites/${siteId}/${mediaFolder}/${storedFilename}`, getMediaStoragePathFromMedia: (_siteId, media) => media.metadata.storagePath, resolveMediaStorageConfig: () => ({ config: { provider: 'local', basePath: join(scratch, 'bytes'), publicUrl: '/fixture/bytes' }, missing: [] }) };
const transforms = load('apps/public/src/lib/mediaTransformGeneration.ts', { '@/lib/mediaStorage': storageModule, '@/lib/mediaResponsive': responsive });
const media = {
  withStorageMutationLock: async (_site, run) => { if (active || mode === 'busy') throw Object.assign(Error('busy'), { code: 'MEDIA_STORAGE_MUTATION_BUSY' }); active = true; events.push({ kind: 'admission-enter' }); try { return await run(); } finally { active = false; events.push({ kind: 'admission-exit' }); save(); } },
  list: async input => { const all = rows.filter(row => row.siteId === input.siteId && linked.mediaMatchesLinkedFilters(row, input) && (!input.type || input.type === 'all' || row.type === input.type || input.type === 'file' && ['document','other'].includes(row.type)) && (!input.visibility || input.visibility === 'all' || row.visibility === input.visibility) && (!input.search || row.originalName.includes(input.search))); const limit = Math.min(input.limit || 100, 100), offset = input.offset || 0; return { items: all.slice(offset, offset + limit), pagination: { total: all.length, limit, offset, hasMore: offset + limit < all.length } }; },
  listFolders: async () => [], getFolderById: async () => null,
  getById: async (siteId, id) => rows.find(row => row.siteId === siteId && row.id === id) || null,
  create: async input => { const item = { ...input, id: 'media-proof-' + (rows.length + 1), sizeBytes: input.size, tags: input.metadata.tags || [], pageIds: [], postIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; rows.push(item); events.push({ kind: 'metadata-create', id: item.id, filename: item.originalName }); save(); return { item }; },
  update: async (siteId, id, input) => { const index = rows.findIndex(row => row.siteId === siteId && row.id === id); if (index < 0) return { item: null }; rows[index] = { ...rows[index], ...input, updatedAt: new Date().toISOString() }; events.push({ kind: 'metadata-update', id }); save(); return { item: rows[index] }; },
};
media.storageJobs = {
  create: async input => { const now = new Date().toISOString(); const job = { ...structuredClone(input), id: randomUUID(), state: 'pending', remainingPaths: input.files.map(file => file.path), attempts: 0, lastErrorCode: null, createdAt: now, updatedAt: now }; jobs.push(job); save(); return structuredClone(job); },
  get: async (siteId, id) => structuredClone(jobs.find(job => job.siteId === siteId && job.id === id) || null),
  list: async input => { const all = jobs.filter(job => job.siteId === input.siteId && (!input.pendingOnly || job.state === 'pending')); const items = all.slice(input.offset, input.offset + input.limit); return { items: structuredClone(items), pagination: { total: all.length, limit: input.limit, offset: input.offset, hasMore: input.offset + items.length < all.length } }; },
  recordRecovery: async (siteId, id, input) => { const index = jobs.findIndex(job => job.siteId === siteId && job.id === id); if (index < 0) throw Error('Missing fixture job'); jobs[index] = { ...jobs[index], ...input, state: input.remainingPaths.length ? 'pending' : 'settled', attempts: jobs[index].attempts + 1 }; save(); return structuredClone(jobs[index]); },
  deleteSettled: async siteId => { for (let i = jobs.length - 1; i >= 0; i--) if (jobs[i].siteId === siteId && jobs[i].state === 'settled') jobs.splice(i, 1); save(); },
};
media.listVersions = async input => ({ items: [], pagination: { total: 0, limit: input.limit, offset: input.offset, hasMore: false } });
const repositories = { sites: { getById: async id => id === site.id ? site : null, getBySlug: async id => id === site.slug ? site : null }, settings: { get: async () => settings }, media };
const failFollowup = async () => { if (mode === 'followup') throw Error('private disposable followup detail'); return {}; };
const mocks = { '@/lib/mediaStorageMutation': mutation, '@/lib/backyStore': {}, '@/lib/mediaInventory': inventory, '@/lib/mediaScope': scope, '@/lib/mediaResponsive': responsive, '@/lib/publicMediaResource': organization, '@/lib/mediaUploadPolicy': policy, '@/lib/mediaTransformGeneration': transforms, '@/lib/mediaStorage': storageModule, '@/lib/mediaSafety': { MediaSafetyError: class extends Error {}, scanMediaUploadWithProviders: async ({ buffer, originalName }) => { await sharp(buffer).metadata(); scans.push({ originalName, bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex') }); save(); return { status: 'clean', provider: 'fixture-byte-validation', scannedAt: new Date().toISOString() }; } }, '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => false, getRequiredDatabaseRepositories: async () => repositories }, '@/lib/adminAccess': { requireAdminAccess: async request => new URL(request.url).pathname.includes('/sites/' + site.id + '/') ? { session: { user: { id: 'synthetic-media-owner' } } } : NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Disposable site scope denied' } }, { status: 403 }) }, '@/lib/adminAudit': { recordAdminAudit: failFollowup }, '@/lib/cacheInvalidation': { recordSiteCacheInvalidation: failFollowup }, '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: async () => { await failFollowup(); return []; } } };
mocks['@/lib/mediaSafety'].resolveMediaScannerConfig = () => ({ provider: 'http', endpoint: 'http://127.0.0.1:5184/disposable-scanner', failOpen: false });
mocks['@/lib/mediaUploadReadiness'] = load('apps/public/src/lib/mediaUploadReadiness.ts', mocks);
mocks['@/lib/mediaStorageRecovery'] = load('apps/public/src/lib/mediaStorageRecovery.ts', mocks);
mocks['@/lib/mediaStorageRecoveryAdmin'] = load('apps/public/src/lib/mediaStorageRecoveryAdmin.ts', mocks);
const recoveryRoute = load('apps/public/src/app/api/admin/sites/[siteId]/media/storage-recovery/route.ts', mocks);
const recoveryRetryRoute = load('apps/public/src/app/api/admin/sites/[siteId]/media/storage-recovery/[jobId]/route.ts', mocks);
const route = load('apps/public/src/app/api/admin/sites/[siteId]/media/route.ts', mocks);
const transformRoute = load('apps/public/src/app/api/admin/sites/[siteId]/media/[mediaId]/transforms/route.ts', mocks);
try {
  if (linkedProof) {
    const now = new Date().toISOString();
    const seed = (id, type, extra = {}) => ({ id, siteId: site.id, originalName: id, filename: id, type, sizeBytes: 4, visibility: 'public', scope: 'global', scopeTargetId: null, pageIds: [], postIds: [], tags: [], metadata: {}, createdAt: now, updatedAt: now, url: '', ...extra });
    rows.push(seed('unlinked-global.txt', 'other'), seed('page-a-hero.png', 'image', { scope: 'page', scopeTargetId: 'page-a', pageIds: ['page-a'] }), seed('shared-page-a-image.png', 'image', { pageIds: ['page-a'] }));
    for (let i = 0; i < 101; i++) rows.push(seed('unlinked-' + i + '.txt', 'other'));
    rows.push(seed('page-a-deck.pptx', 'document', { metadata: { bindings: [{ scope: 'page', targetId: 'page-a', mediaId: 'page-a-deck.pptx' }] } }), seed('post-b-archive.zip', 'other', { scope: 'post', scopeTargetId: 'post-b', postIds: ['post-b'] }), seed('page-b-font.woff2', 'font', { scope: 'page', scopeTargetId: 'page-b', pageIds: ['page-b'] }), seed('foreign-page-a.pdf', 'document', { siteId: 'foreign-site', pageIds: ['page-a'] }));
    save();
  }
  symlinkSync(join(root, 'node_modules'), join(scratch, 'node_modules'), 'dir');
  for (const [name, color] of [['first', '#096b64'], ['second', '#db9e26'], ['retry', '#b05241']]) writeFileSync(join(scratch, name + '.png'), await sharp({ create: { width: 640, height: 360, channels: 3, background: color } }).png().toBuffer());
  execFileSync(join(root, 'node_modules/.bin/tailwindcss'), ['-c', 'apps/admin/tailwind.config.js', '-i', 'apps/admin/src/index.css', '-o', join(scratch, 'proof.css'), '--content', 'apps/admin/src/**/*.{ts,tsx}'], { cwd: root, stdio: 'pipe' });
  buildSync({ entryPoints: [join(root, 'packages/core/src/index.ts')], outfile: join(scratch, 'core.mjs'), bundle: true, format: 'esm', platform: 'browser', logLevel: 'silent' });
  writeFileSync(join(scratch, 'index.html'), `<!doctype html><html><head><title>Actual bulk media acceptance</title><link rel="stylesheet" href="/proof.css"></head><body><div id="root"></div><script type="module" src="/@fs/${root}/apps/admin/scripts/media-bulk-runtime-fixture.tsx"></script></body></html>`);
  server = await createServer({ configFile: false, root: scratch, plugins: [react(), { name: 'actual-media-fixture-http', configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    const url = new URL(req.url, 'http://127.0.0.1:5184');
    if (url.pathname === '/fixture/mode') { mode = url.searchParams.get('mode'); if (mode !== 'hold' && releaseUpload) { releaseUpload(); releaseUpload = undefined; } res.end('{}'); return; }
    if (url.pathname === '/fixture/evidence') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ rows, events, scans, jobs, mode, boundary: 'actual UI and HTTP route handlers; synthetic identity/scanner and memory repository; owned local storage; no provider/real DB proof' })); return; }
    if (url.pathname.startsWith('/fixture/bytes/')) { res.setHeader('content-type', url.pathname.endsWith('.webp') ? 'image/webp' : 'image/png'); res.end(readFileSync(safePath(url.pathname.slice('/fixture/bytes/'.length)))); return; }
    if (!url.pathname.startsWith('/api/')) return next();
    try {
      const base = `/api/admin/sites/${site.id}/media`, recoveryMatch = url.pathname.match(new RegExp('^' + base + '/storage-recovery/([^/]+)$')), match = url.pathname.match(new RegExp('^' + base + '/([^/]+)/transforms$'));
      if (url.pathname === base || match || url.pathname === base + '/storage-recovery' || recoveryMatch) {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const request = new NextRequest(url, { method: req.method, headers: req.headers, ...(['GET','HEAD'].includes(req.method) ? {} : { body: Buffer.concat(chunks) }) });
        const response = await (recoveryMatch ? recoveryRetryRoute.POST(request, { params: Promise.resolve({ siteId: site.id, jobId: recoveryMatch[1] }) }) : url.pathname === base + '/storage-recovery' ? recoveryRoute.GET(request, { params: Promise.resolve({ siteId: site.id }) }) : match ? transformRoute.POST(request, { params: Promise.resolve({ siteId: site.id, mediaId: match[1] }) }) : route[req.method](request, { params: Promise.resolve({ siteId: site.id }) }));
        events.push({ kind: 'http-result', method: req.method, path: url.pathname, query: url.search, status: response.status }); save(); res.statusCode = response.status; response.headers.forEach((value, key) => res.setHeader(key, value)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (url.pathname.startsWith('/api/admin/sites/') && !url.pathname.startsWith('/api/admin/sites/' + site.id + '/')) { res.statusCode = 403; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ success:false, error:{code:'FORBIDDEN_SITE',message:'Disposable site scope denied'} })); return; }
      let data;
      if (url.pathname === '/api/admin/settings') data = { settings };
      else if (url.pathname.endsWith('/permissions')) data = { permissions: { userId: 'synthetic-media-owner', role: 'owner', status: 'active', canSignIn: true, summary: { allowed: 6, total: 6, blockedByStatus: false }, groups: [{ key: 'media', permissions: ['media.view','media.create','media.edit','media.delete','media.configure','activity.export'].map(key => ({ key, label: key, capability: key.split('.').at(-1), allowed: true, source: 'role', override: null, reason: 'Disposable owner fixture' })) }] } };
      else if (url.pathname.endsWith('/media/folders')) data = { folders: [] };
      else if (url.pathname.endsWith('/pages')) data = { pages: linkedProof ? ['a','b'].map(key => ({ id: 'page-' + key, siteId: site.id, title: 'Page ' + key.toUpperCase(), slug: '/page-' + key, status: 'draft' })) : [], pagination: { total: linkedProof ? 2 : 0, limit: 100, offset: 0, hasMore: false } };
      else if (url.pathname.endsWith('/blog')) data = { posts: linkedProof ? ['a','b'].map(key => ({ id: 'post-' + key, siteId: site.id, title: 'Post ' + key.toUpperCase(), slug: 'post-' + key, status: 'draft' })) : [], pagination: { total: linkedProof ? 2 : 0, limit: 100, offset: 0, hasMore: false } };
      else if (url.pathname.endsWith('/versions')) data = { mediaId: url.pathname.split('/').at(-2), source: 'metadata', versions: [], pagination: { total: 0, limit: 100, offset: 0, hasMore: false } };
      else if (url.pathname.endsWith('/audit')) data = { logs: [], pagination: { total: 0, limit: 100, offset: 0, hasMore: false } };
      else { res.statusCode = 404; res.end(JSON.stringify({ success: false, error: { message: 'Fixture does not implement ' + url.pathname } })); return; }
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ success: true, data }));
    } catch (error) { console.error(error); res.statusCode = 500; res.end(JSON.stringify({ success: false, error: { message: 'Disposable fixture failure' } })); }
  }); } }], resolve: { alias: { '@': join(root, 'apps/admin/src'), '@backy-cms/core': join(scratch, 'core.mjs') }, dedupe: ['react','react-dom','gsap'] }, define: { 'process.env': '{}', 'import.meta.env.VITE_BACKY_ADMIN_API_BASE_URL': JSON.stringify('http://127.0.0.1:5184/api/admin') }, server: { host: '127.0.0.1', port: 5184, strictPort: true, fs: { allow: [root, scratch] } } });
  await server.listen(); console.log(JSON.stringify({ ready: true, url: 'http://127.0.0.1:5184/media?siteId=' + site.id, scratch, files: ['first','second','retry'].map(name => join(scratch, name + '.png')), boundary: 'actual route/UI; disposable synthetic operator/scanner and memory repo, local bytes; no providers' }));
  await new Promise(resolve => { process.once('SIGTERM', resolve); process.once('SIGINT', resolve); });
} finally { releaseUpload?.(); await server?.close(); rmSync(scratch, { recursive: true, force: true }); }
