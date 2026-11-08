/** Reuses the page lifecycle fixture's actual-handler/demo disk boundary, with repository PATCH adapters. CUA only. */
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { buildSync } from 'esbuild';
import { mkdtempSync, symlinkSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { load } from '../../public/scripts/collection-import-postgres-handlers.mjs';

const root = resolve(import.meta.dirname, '../../..');
const cwd = process.cwd(), scratch = mkdtempSync('/tmp/backy-content-save-warnings-');
const port = Number(process.env.BACKY_CONTENT_SAVE_WARNINGS_PORT || 5198), origin = `http://127.0.0.1:${port}`;
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid owned fixture port.');
process.chdir(scratch);
process.env.BACKY_DATA_MODE = 'demo';
process.env.NODE_ENV = 'test';
let server: any;
process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));
try {
  const coreModule: any = await import('../../../packages/core/src/index.ts'), core = coreModule.default || coreModule;
  const { canvasContentPayloadToBackyContentDocument, assertBackyContentUpdateExpectation } = core;
  const imported: any = await import('../../public/src/lib/backyStore.ts'), store = imported.default || imported;
  const designModule: any = await import('../../public/src/lib/frontendDesignContract.ts'), design = designModule.default || designModule;
  const site = store.createAdminSite({ id: 'save-warning-proof', slug: 'save-warning-proof', name: 'Disposable save warning proof', status: 'published' });
  const content = { elements: [{ id: 'proof-body', type: 'paragraph', x: 40, y: 40, width: 640, height: 220, zIndex: 1, visible: true, locked: false, props: { content: [{ type: 'p', children: [{ text: 'Original fixture article content.' }] }], fontSize: 18, lineHeight: 1.5 }, children: [], metadata: { retained: [false, 0] } }], canvasSize: { width: 720, height: 900 }, metadata: { retained: { zero: 0, false: false } } };
  const page = store.createAdminPage(site.id, { title: 'Save warning page before', slug: 'warning-page', status: 'draft', content, meta: { retained: { zero: 0, false: false } } });
  const post = store.createAdminBlogPost(site.id, { title: 'Save warning blog before', slug: 'warning-blog', status: 'draft', excerpt: 'Owned warning fixture', content, meta: { retained: { zero: 0, false: false } } });
  const requests: any[] = [], effects: any[] = [], commits: any[] = [];
  const asRepository = (item: any, kind: 'page' | 'post') => item ? { ...item, content: canvasContentPayloadToBackyContentDocument({ id: item.id, kind, title: item.title, slug: item.slug, status: item.status, rawContent: item.content }) } : null;
  const resource = (kind: 'page' | 'post') => ({
    getById: async (siteId: string, id: string) => asRepository(kind === 'page' ? store.getAdminPageById(siteId, id) : store.getAdminBlogPostById(siteId, id), kind),
    update: async (siteId: string, id: string, input: any) => {
      const before = asRepository(kind === 'page' ? store.getAdminPageById(siteId, id) : store.getAdminBlogPostById(siteId, id), kind);
      assertBackyContentUpdateExpectation(input, before);
      const { expectedContent: _expectedContent, beforeUpdateRevision: _revision, ...patch } = input;
      const saved = kind === 'page' ? store.updateAdminPage(siteId, id, patch) : store.updateAdminBlogPost(siteId, id, patch);
      commits.push({ kind, id, beforeUpdatedAt: before.updatedAt, updatedAt: saved.updatedAt });
      return { item: asRepository(saved, kind) };
    },
    checkSlug: async () => ({ available: true }),
  });
  const repositories = { sites: { getById: async (id: string) => id === site.id ? store.getSiteByIdOrSlug(id) : null, getBySlug: async (id: string) => id === site.slug ? store.getSiteByIdOrSlug(id) : null }, pages: resource('page'), posts: resource('post'), collections: { list: async () => ({ items: [] }) }, contentWorkflows: { createRevision: async () => ({}) } };
  const admission = { requireAdminAccess: async (_request: any, _requestId: any, options: any) => { effects.push({ type: 'admission', permission: options.permission }); return { session: { user: { id: 'synthetic-save-owner' } } }; } };
  const base: any = { 'next/server': { NextResponse }, '@/lib/backyStore': store, './backyStore': store, '@/lib/frontendDesignContract': design, './frontendDesignContract': design, '@/lib/adminAccess': admission, '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => true, getRequiredDatabaseRepositories: async () => { throw Error('Real database forbidden in owned fixture.'); } }, '@/lib/adminAudit': { recordAdminAudit: async () => ({}) }, '@/lib/cacheInvalidation': { recordSiteCacheInvalidation: async () => ({ revision: 'synthetic' }) }, '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: async () => [] } };
  const fail = (type: string) => async () => { effects.push({ type, failed: true }); throw Error(`PRIVATE_SYNTHETIC_${type.toUpperCase()}`); };
  const patchMocks = { ...base, '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => false, getRequiredDatabaseRepositories: async () => repositories }, '@/lib/cacheInvalidation': { recordSiteCacheInvalidation: fail('cache') }, '@/lib/adminAudit': { recordAdminAudit: fail('audit') }, '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: fail('webhook') } };
  const definitions = [
    ['pages/([^/]+)/readiness', 'pages/[pageId]/readiness', ['pageId']], ['pages/([^/]+)/revisions', 'pages/[pageId]/revisions', ['pageId']], ['pages/([^/]+)', 'pages/[pageId]', ['pageId']], ['pages', 'pages', []],
    ['blog/categories', 'blog/categories', []], ['blog/tags', 'blog/tags', []], ['blog/authors', 'blog/authors', []], ['blog/([^/]+)/readiness', 'blog/[postId]/readiness', ['postId']], ['blog/([^/]+)/revisions', 'blog/[postId]/revisions', ['postId']], ['blog/([^/]+)', 'blog/[postId]', ['postId']], ['blog', 'blog', []],
  ].map(([pattern, path, keys]: any) => ({ pattern: new RegExp('^/api/admin/sites/([^/]+)/' + pattern + '$'), keys: ['siteId', ...keys], handler: load('../src/app/api/admin/sites/[siteId]/' + path + '/route.ts', base), patch: path === 'pages/[pageId]' || path === 'blog/[postId]' ? load('../src/app/api/admin/sites/[siteId]/' + path + '/route.ts', patchMocks) : null }));
  const evidence = () => ({ boundary: 'Production route UI and actual repository PATCH handlers; synthetic identity/follow-ups; guarded demo disk repository adapter. No real SQL/provider.', requests, effects, commits, page: store.getAdminPageById(site.id, page.id), post: store.getAdminBlogPostById(site.id, post.id), persisted: existsSync(join(scratch, 'data/backy/admin-content.json')) ? JSON.parse(readFileSync(join(scratch, 'data/backy/admin-content.json'), 'utf8')) : null });
  symlinkSync(join(root, 'node_modules'), join(scratch, 'node_modules'), 'dir');
  execFileSync(join(root, 'node_modules/.bin/tailwindcss'), ['-c', 'apps/admin/tailwind.config.js', '-i', 'apps/admin/src/index.css', '-o', join(scratch, 'proof.css'), '--content', 'apps/admin/src/**/*.{ts,tsx},apps/admin/scripts/content-save-warnings-runtime-fixture.tsx'], { cwd: root, stdio: 'pipe' });
  buildSync({ entryPoints: [join(root, 'packages/core/src/index.ts')], outfile: join(scratch, 'core.mjs'), bundle: true, format: 'esm', platform: 'browser', logLevel: 'silent' });
  writeFileSync(join(scratch, 'index.html'), `<!doctype html><html><head><title>Production committed-save warning proof</title><link rel="stylesheet" href="/proof.css"></head><body><div id="root"></div><script type="module" src="/@fs/${root}/apps/admin/scripts/content-save-warnings-runtime-fixture.tsx"></script></body></html>`);
  server = await createServer({ configFile: false, root: scratch, plugins: [react(), { name: 'actual-save-warning-handlers', configureServer(vite: any) { vite.middlewares.use(async (req: any, res: any, next: any) => {
    const url = new URL(req.url, origin), json = (body: any) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); };
    if (url.pathname === '/fixture/seed') return json({ site, page, post });
    if (url.pathname === '/fixture/evidence') return json(evidence());
    if (url.pathname === '/api/admin/users/synthetic-save-owner/permissions') return json({ success: true, data: { permissions: { userId: 'synthetic-save-owner', role: 'owner', status: 'active', canSignIn: true, summary: { allowed: 2, total: 2, blockedByStatus: false }, groups: [{ key: 'pages', label: 'Pages', description: 'Synthetic local admission', permissions: ['pages.view', 'pages.edit', 'pages.publish', 'pages.delete', 'media.view', 'media.create', 'collections.view', 'comments.view', 'comments.edit'].map(key => ({ key, allowed: key === 'pages.view' || key === 'pages.edit', label: key, capability: key.split('.')[1], source: 'role', override: null, reason: 'Owned local fixture permission.' })) }] } } });
    const entry = definitions.find(value => value.pattern.test(url.pathname));
    if (entry) { try {
      const match = url.pathname.match(entry.pattern)!, chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const text = Buffer.concat(chunks).toString(), method = req.method, handler = method === 'PATCH' && entry.patch ? entry.patch : entry.handler;
      if (!handler[method]) { res.statusCode = 405; return json({ success: false }); }
      const response = await handler[method](new NextRequest(url, { method, headers: req.headers, ...(text ? { body: text } : {}) }), { params: Promise.resolve(Object.fromEntries(entry.keys.map((key: string, index: number) => [key, decodeURIComponent(match[index + 1])]))) });
      const body = await response.clone().json().catch(() => null);
      requests.push({ method, path: url.pathname, status: response.status, body: text ? JSON.parse(text) : null, response: body });
      res.statusCode = response.status;
      response.headers.forEach((value: string, key: string) => res.setHeader(key, value));
      return res.end(Buffer.from(await response.arrayBuffer()));
    } catch (cause) { console.error(cause); res.statusCode = 500; return json({ success: false, error: { message: 'Owned fixture handler failed.' } }); } }
    if (url.pathname.startsWith('/api/')) return json({ success: true, data: { siteId: site.id, components: [], sections: [], collections: [], presets: [], pagination: { total: 0, limit: 100, offset: 0, hasMore: false }, contract: { sandbox: { enabled: false } } } });
    next();
  }); } }], resolve: { alias: { '@': join(root, 'apps/admin/src'), '@backy-cms/core': join(scratch, 'core.mjs') }, dedupe: ['react', 'react-dom', 'gsap'] }, define: { 'process.env': '{}', 'import.meta.env.VITE_BACKY_ADMIN_API_BASE_URL': JSON.stringify(origin + '/api/admin') }, server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [root, scratch] } } });
  await server.listen();
  console.log(JSON.stringify({ ready: true, url: origin, scratch, pageId: page.id, postId: post.id }));
  await new Promise(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); });
  writeFileSync('/tmp/backy-content-save-warnings-browser-proof.json', JSON.stringify(evidence(), null, 2));
} finally { await server?.close(); process.chdir(cwd); rmSync(scratch, { recursive: true, force: true }); }
