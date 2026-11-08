// Actual journal/reconciliation source, with explicit memory adapters for handler fixtures.
import { randomUUID } from 'node:crypto';
import { File } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
export function loadMediaFixture(relative: string, mocks: Record<string, any>, fixtureProcess: any = process, fixtureGlobals: Record<string, any> = {}) {
  const filename = fileURLToPath(new URL(relative, import.meta.url));
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} as any }, require = createRequire(import.meta.url);
  vm.runInNewContext(compiled, { module, exports: module.exports, Request, Response, Headers, URL, URLSearchParams, Buffer, File, FormData, structuredClone, ...fixtureGlobals, process: fixtureProcess, console: { error() {} }, require: (id: string) => {
    const alias = id.startsWith('./') ? '@/lib/' + id.slice(2) : id;
    if (alias in mocks) return mocks[alias];
    if (alias === '@/lib/mediaUploadReservationContext') return mocks[alias] = loadMediaFixture('../src/lib/mediaUploadReservationContext.ts', mocks, fixtureProcess);
    if (id in mocks) return mocks[id];
    if (id.startsWith('@/') || id.startsWith('./')) throw Error('Missing fixture dependency ' + id);
    return require(id);
  } }, { filename });
  return module.exports;
}
export function memoryMediaJobs() {
  const rows = new Map<string, any>();
  return { rows,
    async create(input: any) { const now = new Date().toISOString(); const job = { ...structuredClone(input), id: randomUUID(), state: 'pending', remainingPaths: input.files.map((file: any) => file.path), attempts: 0, lastErrorCode: null, createdAt: now, updatedAt: now }; rows.set(job.id, job); return structuredClone(job); },
    async get(siteId: string, jobId: string) { const job = rows.get(jobId); return job?.siteId === siteId ? structuredClone(job) : null; },
    async list(input: any) { const all = [...rows.values()].filter(row => row.siteId === input.siteId && (!input.pendingOnly || row.state === 'pending')); const items = all.slice(input.offset, input.offset + input.limit); return { items: structuredClone(items), pagination: { total: all.length, limit: input.limit, offset: input.offset, hasMore: input.offset + items.length < all.length } }; },
    async recordRecovery(siteId: string, id: string, input: any) { const before = await this.get(siteId, id); if (!before || input.remainingPaths.some((path: string) => !before.remainingPaths.includes(path))) throw Error('Invalid fixture recovery'); const job = { ...before, ...input, state: input.remainingPaths.length ? 'pending' : 'settled', attempts: before.attempts + 1 }; rows.set(id, job); return structuredClone(job); },
    async deleteSettled(siteId: string) { for (const [id, job] of rows) if (job.siteId === siteId && job.state === 'settled') rows.delete(id); },
  };
}
export function installActualMediaRecovery(mocks: Record<string, any>, repositories: any, directory: string, fixtureProcess: any = process) {
  const helpers = loadMediaFixture('../src/lib/mediaStorage.ts', {});
  const existing = mocks['@/lib/mediaStorage'] || {};
  const storage = { ...helpers, ...existing, resolveMediaStorageConfig: () => ({ config: { provider: 'local', basePath: directory + '/uploads', publicUrl: '/uploads' }, missing: [] }) };
  mocks['@/lib/mediaStorage'] = storage;
  // Media-list admission metadata uses actual pure config readers with a
  // deterministic local/static fixture, never the operator's ambient env.
  const readinessProcess = { env: { NODE_ENV: 'test', BACKY_STORAGE_PROVIDER: 'local', BACKY_LOCAL_UPLOADS_DIR: directory + '/uploads' }, cwd: () => directory };
  mocks['@/lib/mediaUploadReadiness'] ||= loadMediaFixture('../src/lib/mediaUploadReadiness.ts', {
    '@/lib/mediaSafety': loadMediaFixture('../src/lib/mediaSafety.ts', {}, readinessProcess),
    '@/lib/mediaStorage': loadMediaFixture('../src/lib/mediaStorage.ts', {}, readinessProcess),
  }, readinessProcess);
  mocks['@/lib/demoSiteBackupPersistence'] ||= { pendingDemoSiteBackupBytes: () => 0 };
  if (repositories) { repositories.siteBackups ||= { listJobs: async () => [] }; repositories.media.storageJobs ||= memoryMediaJobs(); repositories.media.listVersions ||= async (input: any) => ({ items: [], pagination: { total: 0, ...input, hasMore: false } }); }
  const recovery = loadMediaFixture('../src/lib/mediaStorageRecovery.ts', mocks, { ...fixtureProcess, cwd: () => directory });
  mocks['@/lib/mediaStorageRecovery'] = recovery;
  return recovery;
}
