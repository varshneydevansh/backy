import assert from 'node:assert/strict';
import { resolveMediaStorageConfig } from '../src/lib/mediaStorage';

assert.equal(resolveMediaStorageConfig({}).summary.configured, true, 'local development retains filesystem uploads');
assert.equal(resolveMediaStorageConfig({ NODE_ENV: 'production', BACKY_STORAGE_PROVIDER: 'local' }).summary.configured, true, 'persistent self-hosted filesystems remain supported');
const vercel = resolveMediaStorageConfig({ VERCEL: '1', NODE_ENV: 'production' });
assert.equal(vercel.config, null);
assert.equal(vercel.summary.configured, false, 'Vercel must not advertise local uploads as ready');
assert.match(vercel.summary.error || '', /persistent/);
const supabase = resolveMediaStorageConfig({ VERCEL: '1', BACKY_STORAGE_PROVIDER: 'supabase',
  BACKY_SUPABASE_URL: 'https://storage.example.com', BACKY_SUPABASE_SERVICE_ROLE_KEY: 'fixture', BACKY_SUPABASE_STORAGE_BUCKET: 'media' });
assert.equal(supabase.summary.configured, true);
console.log(JSON.stringify({ ok: true, contract: 'backy.media-storage-runtime.v1' }));
