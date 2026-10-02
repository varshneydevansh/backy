import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
const imported = await import('../src/lib/interactiveComponentBundle.ts');
const { loadVerifiedInteractiveComponentBundle, InteractiveComponentBundleError } = imported.default || imported;
const key = 'local-test-only-component-signing-key';
process.env.BACKY_COMPONENT_REGISTRY_SIGNING_KEY = key;
delete process.env.BACKY_INTERACTIVE_COMPONENT_SIGNING_KEY;
const bytes = Buffer.from('export function mount({root}) { root.textContent = "Widget running"; }');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const identity = {
  siteId: 'fixture-site', componentKey: 'fixture.widget', version: '1.0.0',
  status: 'active', reviewStatus: 'approved',
  integrity: {
    signed: true, signatureRequiredForCustomCode: true, algorithm: 'sha256', sha256,
    signature: `sha256=${createHmac('sha256', key).update(sha256).digest('hex')}`,
    storagePath: 'sites/fixture-site/interactive-components/fixture.widget/1.0.0/batch-index.mjs',
    storageProvider: 'local', contentType: 'application/javascript', sizeBytes: bytes.length,
  },
};
let reads = 0;
const storage = { provider: 'local' as const, async read(path: string) { reads++; assert.equal(path, identity.integrity.storagePath); return bytes; } };
assert.equal(await loadVerifiedInteractiveComponentBundle(identity, storage), bytes.toString('base64'));
let cases = 1;
async function rejected(change: Record<string, unknown>, status: number) {
  const before = reads;
  await assert.rejects(() => loadVerifiedInteractiveComponentBundle({ ...identity, ...change } as typeof identity, storage), (error: unknown) => error instanceof InteractiveComponentBundleError && error.status === status);
  assert.equal(reads, before, 'Unapproved/unscoped/unverified metadata must not read storage');
  cases++;
}
await rejected({ status: 'disabled' }, 403);
await rejected({ reviewStatus: 'draft' }, 403);
await rejected({ integrity: { ...identity.integrity, signed: false } }, 403);
await rejected({ integrity: { ...identity.integrity, signatureRequiredForCustomCode: false, signed: false } }, 403);
await rejected({ integrity: { ...identity.integrity, algorithm: 'unknown' } }, 403);
await rejected({ integrity: { ...identity.integrity, sha256: 'short' } }, 403);
await rejected({ integrity: { ...identity.integrity, signature: `sha256=${'0'.repeat(64)}` } }, 403);
await rejected({ siteId: 'other-site' }, 403);
await rejected({ componentKey: 'other.widget' }, 403);
await rejected({ version: '2.0.0' }, 403);
await rejected({ integrity: { ...identity.integrity, storagePath: 'sites/fixture-site/interactive-components/fixture.widget/1.0.0/../other.mjs' } }, 403);
await rejected({ integrity: { ...identity.integrity, contentType: 'application/json' } }, 415);
await rejected({ integrity: { ...identity.integrity, sizeBytes: 6 * 1024 * 1024 } }, 413);
await rejected({ integrity: { ...identity.integrity, storageProvider: 'supabase' } }, 503);
delete process.env.BACKY_COMPONENT_REGISTRY_SIGNING_KEY;
await rejected({}, 503);
process.env.BACKY_INTERACTIVE_COMPONENT_SIGNING_KEY = key;
assert.equal(await loadVerifiedInteractiveComponentBundle(identity, storage), bytes.toString('base64'));
cases++;
await assert.rejects(() => loadVerifiedInteractiveComponentBundle(identity, { ...storage, async read() { return Buffer.from('tampered'); } }), (error: unknown) => error instanceof InteractiveComponentBundleError && error.status === 403);
cases++;
await assert.rejects(() => loadVerifiedInteractiveComponentBundle(identity, { ...storage, async read() { throw new Error('Provider detail must not escape'); } }), (error: unknown) => error instanceof InteractiveComponentBundleError && error.status === 503 && !error.message.includes('Provider detail'));
cases++;
console.log(JSON.stringify({ ok: true, cases, contract: 'backy.interactive-component-bundle-execution.v1' }));
