// Called only by the owned disposable PostgreSQL runner; no environment/database target lookup.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url), { NextResponse } = require('next/server');
function load(relative, mocks, cache = new Map()) {
 const filename = fileURLToPath(new URL(relative, import.meta.url));
 if (cache.has(filename)) return cache.get(filename);
 const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, module = { exports: {} };
 cache.set(filename, module.exports);
 vm.runInNewContext(compiled, { module, exports: module.exports, Request, Response, Headers, URL, Buffer, process, console: { error() {} }, require: id => id in mocks ? mocks[id] : id.startsWith('@/lib/') ? load('../src/lib/' + id.slice('@/lib/'.length) + '.ts', mocks, cache) : require(id) }, { filename });
 cache.set(filename, module.exports); return module.exports;
}
export async function verifyAdminContentSaveCas({ repositories: a, competing: b, sql, site, createDocument }) {
 let checks = 0;
 for (const kind of ['page', 'post']) {
  const name = kind === 'page' ? 'pages' : 'posts', path = kind === 'page' ? 'pages/[pageId]' : 'blog/[postId]', table = kind === 'page' ? 'public.pages' : 'public.blog_posts';
  const row = (await a[name].create({ siteId: site.id, title: 'HTTP CAS ' + kind, slug: 'http-cas-' + kind, content: createDocument(kind), meta: { frontendDesignTokens: { color: 'teal' }, nested: { retained: [1, 2] } } })).item;
  const read = () => a[name].getById(site.id, row.id);
  const revisionCount = async () => Number((await sql`SELECT count(*)::int AS count FROM public.content_revisions WHERE site_id = ${site.id} AND target_type = ${kind} AND target_id = ${row.id}`)[0].count);
  let deny = '', paused = false, release, announce, cacheCalls = 0, auditCalls = 0, webhookCalls = 0;
  const beforeWrite = new Promise(resolve => { announce = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const wrapped = { ...a, [name]: { ...a[name], update: async (s, id, input) => { assert.equal(s, site.id); assert.equal(id, row.id); assert.equal(input.expectedUpdatedAt, original.updatedAt); assert.deepEqual(input.expectedContent, original.content); assert.equal(input.beforeUpdateRevision.snapshot.id, row.id); assert.equal(input.beforeUpdateRevision.snapshot.siteId, site.id); paused = true; announce(); await gate; return a[name].update(s, id, input); } } };
  const makeRoute = repositories => load('../src/app/api/admin/sites/[siteId]/' + path + '/route.ts', {
   '@/lib/backyStore': {},
   '@/lib/repositoryRuntime': { shouldUseDemoStoreFallback: () => false, getRequiredDatabaseRepositories: async () => repositories },
   '@/lib/adminAccess': { requireAdminAccess: async (request, requestId, access) => { assert.equal(access.permission, 'pages.edit'); return deny ? NextResponse.json({ success: false, requestId, error: { code: deny === '401' ? 'UNAUTHORIZED' : 'FORBIDDEN', message: 'Fixture denial' } }, { status: Number(deny) }) : { session: { user: { id: 'fixture-actor' } } }; } },
   '@/lib/routeConflicts': { findPageRouteConflict: () => null },
   '@/lib/siteReadiness': { buildRepositoryPageReadiness: item => ({ id: item.id, checks: [] }), readinessBlockingChecks: () => [] },
   '@/lib/cacheInvalidation': { recordSiteCacheInvalidation: async () => { cacheCalls++; return {}; } },
   '@/lib/adminAudit': { recordAdminAudit: async () => { auditCalls++; } },
   '@/lib/siteWebhookDelivery': { deliverSiteWebhooks: async () => { webhookCalls++; return []; } },
  });
  const routeA = makeRoute(wrapped), routeB = makeRoute(b);
  async function call(route, body, expected, targetSite = site.slug) {
   const response = await route.PATCH(new Request('http://fixture.invalid/api/admin/sites/' + targetSite + '/' + name + '/' + row.id, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-request-id': 'http-cas-fixture' }, body: JSON.stringify(body) }), { params: Promise.resolve({ siteId: targetSite, pageId: row.id, postId: row.id }) });
   const payload = await response.json(); assert.equal(response.status, expected, `${kind} HTTP save ${JSON.stringify(payload)}`); checks++; return payload;
  }
  const original = await read();
  const stale = call(routeA, { title: 'Stale author', expectedUpdatedAt: original.updatedAt, content: original.content, meta: { staleMustNotPersist: true } }, 409);
  await beforeWrite; assert(paused); assert.equal(await revisionCount(), 0, 'No revision is written before entering the atomic guarded update');
  const winnerContent = structuredClone(original.content); winnerContent.elements[0].props.content[0].props.nested.author = 'winning author';
  const winner = await call(routeB, { title: 'Winning author', expectedUpdatedAt: original.updatedAt, content: winnerContent, meta: { ...original.meta, nested: { retained: [1, 2], winner: true } }, beforeUpdateRevision: { snapshot: { id: 'malicious-target', siteId: 'wrong-site' } } }, 200);
  release(); const conflict = await stale;
  assert.equal(conflict.error.code, kind === 'page' ? 'PAGE_VERSION_CONFLICT' : 'BLOG_VERSION_CONFLICT'); assert.equal(conflict.error.details.reloadRequired, true); assert.match(conflict.error.message, /Reload/);
  const current = await read(); assert.equal(current.title, 'Winning author'); assert.equal(current.content.elements[0].props.content[0].props.nested.author, 'winning author'); assert.deepEqual(current.meta.nested, { retained: [1, 2], winner: true }); assert.equal(current.meta.staleMustNotPersist, undefined); assert.equal(await revisionCount(), 1); assert.equal(cacheCalls, 1); assert.equal(auditCalls, 1); assert.equal(webhookCalls, 1);
  const [revision] = await sql`SELECT snapshot, target_id, site_id FROM public.content_revisions WHERE target_id = ${row.id}`; assert.equal(revision.target_id, row.id); assert.equal(revision.site_id, site.id); assert.equal(revision.snapshot.id, row.id); assert.equal(revision.snapshot.title, original.title); assert.deepEqual(revision.snapshot.meta.nested, original.meta.nested); checks++;
  // Even metadata-only guarded saves always advance the client-visible revision, including future/skewed fixture timestamps.
  await sql.unsafe(`UPDATE ${table} SET updated_at = '2030-01-01 00:00:00.123456+00' WHERE id = $1`, [row.id]);
  const metadataBase = await read();
  await call(routeB, { expectedUpdatedAt: metadataBase.updatedAt, meta: { ...metadataBase.meta, nativeTimestampOnly: true } }, 200);
  const metadataSaved = await read(); assert(Date.parse(metadataSaved.updatedAt) > Date.parse(metadataBase.updatedAt));
  await call(routeB, { expectedUpdatedAt: metadataBase.updatedAt, meta: { staleMustNotPersist: true } }, 409); assert.equal(await revisionCount(), 2); checks++;
  // Revision persistence failure rolls back every document change.
  await sql.unsafe(`CREATE FUNCTION fixture_reject_${kind}_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target_id = '${row.id}' AND NEW.note = 'reject-revision' THEN RAISE EXCEPTION 'Private revision fixture detail'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_reject_${kind}_revision BEFORE INSERT ON public.content_revisions FOR EACH ROW EXECUTE FUNCTION fixture_reject_${kind}_revision()`);
  const beforeFailure = await read();
  const failedRevision = await call(routeB, { expectedUpdatedAt: beforeFailure.updatedAt, title: 'Must roll back', revisionNote: 'reject-revision' }, 500); assert(!JSON.stringify(failedRevision).includes('Private revision')); assert.deepEqual(await read(), beforeFailure); assert.equal(await revisionCount(), 2); checks++;
  await sql.unsafe(`DROP TRIGGER fixture_reject_${kind}_revision ON public.content_revisions; DROP FUNCTION fixture_reject_${kind}_revision()`);
  // A later SQL document failure also rolls back the already-created baseline revision.
  await sql.unsafe(`CREATE FUNCTION fixture_reject_${kind}_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.title = 'reject-document-update' THEN RAISE EXCEPTION 'Private document fixture detail'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_reject_${kind}_update BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION fixture_reject_${kind}_update()`);
  await call(routeB, { expectedUpdatedAt: beforeFailure.updatedAt, title: 'reject-document-update' }, 500); assert.deepEqual(await read(), beforeFailure); assert.equal(await revisionCount(), 2); checks++;
  await sql.unsafe(`DROP TRIGGER fixture_reject_${kind}_update ON ${table}; DROP FUNCTION fixture_reject_${kind}_update()`);
  for (const status of ['401', '403']) { deny = status; await call(routeB, { expectedUpdatedAt: beforeFailure.updatedAt, title: 'Denied' }, Number(status)); assert.deepEqual(await read(), beforeFailure); assert.equal(await revisionCount(), 2); }
  deny = '';
  const foreign = (await a.sites.create({ teamId: site.teamId, name: 'Foreign HTTP scope ' + kind, slug: 'foreign-http-' + kind, status: 'draft' })).item;
  await call(routeB, { expectedUpdatedAt: beforeFailure.updatedAt, title: 'Wrong scope' }, 404, foreign.id); assert.deepEqual(await read(), beforeFailure); assert.equal(await revisionCount(), 2);
  await call(routeB, { title: 'Legacy unversioned save', meta: { ...beforeFailure.meta, legacy: { retained: true } } }, 200); assert.equal((await read()).meta.legacy.retained, true); assert.equal(await revisionCount(), 3);
 }
 console.log(`Admin content save CAS checks passed: ${checks}; actual PATCH handlers + production PostgreSQL repositories, two SQL connections, canonical slug scope, winner preserved/stale409, atomic baseline history, revision/update failure rollback, monotonic metadata revisions and denial/foreign scope.`);
 return checks;
}
