import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MediaDeletionImpact } from '../src/components/media/MediaDeletionImpact';
import { deleteMediaFromBackend, MediaDeletionConflictError } from '../src/lib/mediaApi';
import { setActiveAdminSessionToken, clearActiveAdminSessionToken } from '../src/lib/adminSessionToken';

const impact = {
  mediaId: 'media-test', referenceCount: 3, referenceFingerprint: 'reviewed-reference-fingerprint',
  references: [
    { scope: 'page' as const, targetId: '<page-used>' },
    { scope: 'post' as const, targetId: 'post-used' },
    { scope: 'collectionRecord' as const, targetId: 'record-used', collectionId: 'products' },
  ],
};
const html = renderToStaticMarkup(createElement(MediaDeletionImpact, { references: impact.references }));
assert(html.includes('Used by 3 content references'));
assert(html.includes('&lt;page-used&gt;'));
assert(html.includes('Post:'));
assert(html.includes('Collection record:'));
assert(html.includes('products'));
assert(html.includes('without repairing content'));
assert.equal(renderToStaticMarkup(createElement(MediaDeletionImpact, { references: [] })), '');

const originalFetch = globalThis.fetch;
const requests: { url: string; init?: RequestInit }[] = [];
let conflict = true;
globalThis.fetch = async (input, init) => {
  requests.push({ url: String(input), init });
  return new Response(JSON.stringify(conflict
    ? { success: false, error: { code: 'MEDIA_IN_USE', message: 'Review current references.', details: impact } }
    : { success: true, data: { deleted: true, mediaId: impact.mediaId } }), { status: conflict ? 409 : 200 });
};
setActiveAdminSessionToken('test-session-token');
try {
  await assert.rejects(deleteMediaFromBackend(impact.mediaId, 'site-test'), (error: unknown) => {
    assert(error instanceof MediaDeletionConflictError);
    assert.deepEqual(error.impact, impact);
    return true;
  });
  assert(requests[0].url.endsWith('/sites/site-test/media/media-test'));
  assert.equal(requests[0].init?.method, 'DELETE');
  assert.equal(requests[0].init?.body, undefined);
  assert.equal(requests[0].init?.credentials, 'include');
  assert.equal(new Headers(requests[0].init?.headers).get('authorization'), 'Bearer test-session-token');
  conflict = false;
  const override = { allowReferencedDelete: true as const, reason: 'Confirmed retired content', referenceFingerprint: impact.referenceFingerprint };
  await deleteMediaFromBackend(impact.mediaId, 'site-test', override);
  assert.deepEqual(JSON.parse(String(requests[1].init?.body)), override);
  assert.equal(new Headers(requests[1].init?.headers).get('content-type'), 'application/json');
} finally {
  globalThis.fetch = originalFetch;
  clearActiveAdminSessionToken();
}
console.log('Media deletion impact SSR and authenticated API adapter checks passed.');
