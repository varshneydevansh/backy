import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolveMediaStorageConfig } from '../src/lib/mediaStorage';

assert.equal(resolveMediaStorageConfig({}).summary.configured, true, 'local development retains filesystem uploads');
assert.equal(resolveMediaStorageConfig({ NODE_ENV: 'production', BACKY_STORAGE_PROVIDER: 'local' }).summary.configured, true, 'persistent self-hosted filesystems remain supported');
const relativeStorage = resolveMediaStorageConfig({ BACKY_STORAGE_PROVIDER: 'local', BACKY_LOCAL_UPLOADS_DIR: 'owned-runtime/uploads' }).config;
assert(relativeStorage?.provider === 'local');
assert.equal(relativeStorage.basePath, join(process.cwd(), 'owned-runtime/uploads'), 'configured relative storage still resolves against the runtime cwd');
const absolutePath = join(process.cwd(), 'owned-absolute-uploads');
const absoluteStorage = resolveMediaStorageConfig({ BACKY_STORAGE_PROVIDER: 'local', BACKY_LOCAL_UPLOADS_DIR: absolutePath }).config;
assert(absoluteStorage?.provider === 'local');
assert.equal(absoluteStorage.basePath, absolutePath, 'configured absolute storage retains its exact runtime path');
const vercel = resolveMediaStorageConfig({ VERCEL: '1', NODE_ENV: 'production' });
assert.equal(vercel.config, null);
assert.equal(vercel.summary.configured, false, 'Vercel must not advertise local uploads as ready');
assert.match(vercel.summary.error || '', /persistent/);
const supabase = resolveMediaStorageConfig({ VERCEL: '1', BACKY_STORAGE_PROVIDER: 'supabase',
  BACKY_SUPABASE_URL: 'https://storage.example.com', BACKY_SUPABASE_SERVICE_ROLE_KEY: 'fixture', BACKY_SUPABASE_STORAGE_BUCKET: 'media' });
assert.equal(supabase.summary.configured, true);
console.log(JSON.stringify({ ok: true, contract: 'backy.media-storage-runtime.v1' }));

async function checkDefaultLocalBytes() {
  const previousCwd = process.cwd();
  const scratch = mkdtempSync(join(tmpdir(), 'backy-local-trace-runtime-'));
  try {
    process.chdir(scratch);
    const config = resolveMediaStorageConfig({ BACKY_STORAGE_PROVIDER: 'local' }).config;
    assert(config?.provider === 'local');
    assert.equal(config.basePath, join(process.cwd(), 'public', 'uploads'));
    const { createStorageAdapter } = await import('@backy/storage');
    const adapter = await createStorageAdapter(config);
    const path = 'sites/owned-trace-fixture/bytes.txt';
    await adapter.upload(Buffer.from('owned runtime bytes'), { path, filename: 'bytes.txt', mimeType: 'text/plain' });
    assert.equal(readFileSync(join(config.basePath, path), 'utf8'), 'owned runtime bytes');
    assert.equal((await adapter.read(path)).toString(), 'owned runtime bytes', 'default local storage reads provisioned runtime bytes without packaged upload files');
    console.log('Default local storage actual byte write/read in isolated runtime cwd PASS; no packaged seeds or provider calls.');
  } finally {
    process.chdir(previousCwd);
    rmSync(scratch, { recursive: true, force: true });
  }
}
void checkDefaultLocalBytes().catch((error) => { console.error(error); process.exitCode = 1; });
