import assert from 'node:assert/strict';
import { observeCustomFontFailures } from './fontLoading';

const listeners = new Map<string, Set<() => void>>();
let faces = [
  { family: '"Signed Proof"', status: 'loaded' },
  { family: '"Failed Proof"', status: 'error' },
  { family: 'Unrelated Google Font', status: 'error' },
];
const fonts = {
  forEach: (visit: (face: typeof faces[number]) => void) => faces.forEach(visit),
  addEventListener: (event: string, listener: () => void) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(listener);
  },
  removeEventListener: (event: string, listener: () => void) => listeners.get(event)?.delete(listener),
} as unknown as FontFaceSet;
const observed: string[][] = [];
const stop = observeCustomFontFailures(fonts, ['Signed Proof', 'Failed Proof'], (failed) => observed.push(failed));
assert.deepEqual(observed[observed.length - 1], ['Failed Proof'], 'successful CSS registration does not hide a failed browser font');
const stale = Array.from(listeners.get('loadingerror')!)[0];
faces = [{ family: '"Failed Proof"', status: 'loading' }];
stale();
assert.deepEqual(observed[observed.length - 1], [], 'a replaced signed URL is not blamed for the previous face error');
faces[0].status = 'loaded';
Array.from(listeners.get('loadingdone')!)[0]();
assert.deepEqual(observed[observed.length - 1], [], 'successful retry clears the prior failure');
faces[0].status = 'error';
Array.from(listeners.get('loadingerror')!)[0]();
assert.deepEqual(observed[observed.length - 1], ['Failed Proof'], 'a confirmed new load failure is surfaced');
stop();
const count = observed.length;
stale();
assert.equal(observed.length, count, 'late callbacks cannot update an unmounted or replaced editor');
assert.equal(listeners.get('loadingerror')!.size, 0);
assert.equal(listeners.get('loadingdone')!.size, 0);
const nextSite: string[][] = [];
const stopNext = observeCustomFontFailures(fonts, ['Other Site Font'], (failed) => nextSite.push(failed));
assert.deepEqual(nextSite[nextSite.length - 1], [], 'a prior site family cannot leak into the next site notice');
stopNext();
console.log('Custom font browser failure observation, retry outcome, scoped replacement and cleanup passed.');

async function testDeliveryRetry() {
  const { retryCustomFontDelivery } = await import('./fontLoading');
  const signedUrl = 'https://font.example/face.ttf?version=6&signature=synthetic-expired';
  const authored = [{ value: 'Failed Proof', label: 'Failed Proof', source: 'custom' as const, mediaId: 'owned-font', faces: [{ url: signedUrl, weight: '700', style: 'italic' as const, display: 'swap' as const }] }];
  const calls: { url: string; init?: RequestInit }[] = [];
  const revoked: string[] = [];
  const controller = new AbortController();
  let available = false;
  const delivery = {
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(available ? new Uint8Array([1, 2, 3]) : 'refused', { status: available ? 200 : 403 });
    }) as typeof fetch,
    createObjectURL: () => 'blob:owned-font-retry',
    revokeObjectURL: (url: string) => { revoked.push(url); },
  };
  const refused = await retryCustomFontDelivery(authored, ['Failed Proof'], controller.signal, delivery);
  assert.deepEqual(refused.failed, ['Failed Proof'], 'HTTP refusal remains unavailable');
  assert.equal(refused.retried.length, 0, 'a refusal cannot be reported as decoded or retried');
  available = true;
  const restored = await retryCustomFontDelivery(authored, ['Failed Proof'], controller.signal, delivery);
  assert.equal(calls.length, 2, 'explicit retry makes a fresh request after restored delivery');
  assert.ok(calls.every((call) => call.url === signedUrl && call.init?.cache === 'no-store' && call.init?.signal === controller.signal && !call.init?.credentials), 'signed query and normal credential policy are preserved');
  assert.equal(restored.fonts[0].faces![0].url, 'blob:owned-font-retry');
  assert.equal(authored[0].faces[0].url, signedUrl, 'authored URL is never mutated');
  assert.equal(restored.fonts[0].mediaId, 'owned-font');
  restored.dispose(); restored.dispose();
  assert.deepEqual(revoked, ['blob:owned-font-retry'], 'owned runtime URLs are revoked exactly once');
  const unknown = await retryCustomFontDelivery(authored, ['Unknown Font'], controller.signal, delivery);
  assert.equal(unknown.retried.length, 0, 'unknown or unrequested fonts are not declared loaded');
  assert.equal(calls.length, 2);
  const invalid = await retryCustomFontDelivery([{ ...authored[0], faces: [{ ...authored[0].faces[0], url: 'file:///private/font.ttf' }] }], ['Failed Proof'], controller.signal, delivery);
  assert.deepEqual(invalid.failed, ['Failed Proof']);
  assert.equal(calls.length, 2, 'unsupported URLs never initiate delivery');
  const oversized = await retryCustomFontDelivery(authored, ['Failed Proof'], controller.signal, { ...delivery, fetch: (async () => new Response('bytes', { headers: { 'content-length': String(17 * 1024 * 1024) } })) as typeof fetch });
  assert.deepEqual(oversized.failed, ['Failed Proof'], 'oversized declared delivery is rejected');
  const streamedOversize = await retryCustomFontDelivery(authored, ['Failed Proof'], controller.signal, { ...delivery, fetch: (async () => new Response(new Uint8Array(17 * 1024 * 1024))) as typeof fetch });
  assert.deepEqual(streamedOversize.failed, ['Failed Proof'], 'missing size header cannot bypass the byte bound');
  const retained = new Set<string>();
  const repeatedRevoked: string[] = [];
  const attempts = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await retryCustomFontDelivery(authored, ['Failed Proof'], controller.signal, {
      ...delivery,
      createObjectURL: () => `blob:decode-attempt-${attempt}`,
      revokeObjectURL: (url) => { repeatedRevoked.push(url); },
    });
    attempts.push(result);
    retained.clear();
    retained.add(result.fonts[0].faces![0].url);
    attempts.forEach((owned) => owned.releaseUnused(retained));
  }
  assert.deepEqual(repeatedRevoked, ['blob:decode-attempt-0', 'blob:decode-attempt-1', 'blob:decode-attempt-2'], 'repeated decoding retries release replaced face bytes while retaining the currently referenced face');
  attempts.forEach((owned) => owned.dispose());
  assert.equal(repeatedRevoked.length, 4, 'final cleanup releases the last current face exactly once');
  const originalFetch = globalThis.fetch;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  try {
    globalThis.fetch = (async function (this: unknown, input: RequestInfo | URL) {
      assert.equal(this, globalThis, 'native fetch receiver stays the browser global');
      assert.equal(input, signedUrl);
      return new Response(new Uint8Array([1]));
    }) as typeof fetch;
    URL.createObjectURL = () => 'blob:default-delivery';
    URL.revokeObjectURL = () => {};
    const native = await retryCustomFontDelivery(authored, ['Failed Proof'], controller.signal);
    assert.equal(native.retried.length, 1, 'the actual default delivery path invokes native fetch successfully');
    native.dispose();
  } finally {
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
  const late = new AbortController();
  const lateRevoked: string[] = [];
  await assert.rejects(retryCustomFontDelivery(authored, ['Failed Proof'], late.signal, {
    ...delivery,
    createObjectURL: () => { late.abort(); return 'blob:cancelled-font'; },
    revokeObjectURL: (url) => { lateRevoked.push(url); },
  }), { name: 'AbortError' });
  assert.deepEqual(lateRevoked, ['blob:cancelled-font'], 'late cancellation revokes produced bytes before callers can install them');
  const duringRequest = new AbortController();
  await assert.rejects(retryCustomFontDelivery(authored, ['Failed Proof'], duringRequest.signal, {
    ...delivery,
    fetch: (async () => { duringRequest.abort(); return new Response('late bytes'); }) as typeof fetch,
  }), { name: 'AbortError' });
  console.log('Explicit signed font retry: fresh request, refusal, URL/identity preservation, byte bounds and late cancellation passed.');
}
void testDeliveryRetry().catch((error) => { console.error(error); process.exitCode = 1; });
