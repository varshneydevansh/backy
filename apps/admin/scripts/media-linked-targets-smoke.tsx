import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MediaLinkedTargetFilter } from '../src/components/media/MediaLinkedTargetFilter';
import { mediaLinkedTargetFromSearch, mediaLinkedTargetQuery, mediaMatchesLinkedTarget } from '../src/lib/mediaLinkedTargets';
import { listMediaLibrary } from '../src/lib/mediaApi';
import type { MediaAsset } from '../src/stores/mockStore';

let checks = 0;
const check = (value: unknown, message: string) => { assert.ok(value, message); checks++; };
const asset = (extra: Partial<MediaAsset>) => ({ id: 'asset', type: 'other', scope: 'global', ...extra } as MediaAsset);
const page = mediaLinkedTargetFromSearch({ linkedPageId: 'page/a' });
const post = mediaLinkedTargetFromSearch({ linkedPostId: 'post:a' });
check(!mediaMatchesLinkedTarget(asset({}), page), 'Unlinked global assets must not appear as page usage');
check(mediaMatchesLinkedTarget(asset({ targetPageIds: ['page/a'] }), page), 'Globally reusable file with exact page reference appears');
check(!mediaMatchesLinkedTarget(asset({ targetPageIds: ['other-page'] }), page), 'Other page references are excluded');
check(mediaMatchesLinkedTarget(asset({ scope: 'page', scopeTargetId: 'page/a' }), page), 'Original page-scoped upload appears');
check(mediaMatchesLinkedTarget(asset({ metadata: { bindings: [{ scope: 'page', targetId: 'page/a' }] } }), page), 'Explicit page binding appears');
check(!mediaMatchesLinkedTarget(asset({ metadata: { bindings: [{ scope: 'post', targetId: 'page/a' }] } }), page), 'Same ID in the other target family is excluded');
check(!mediaMatchesLinkedTarget(asset({ metadata: { bindings: [{ scope: 'page', targetId: 'page/a', mediaId: 'other-file' }] } }), page), 'A binding naming a different asset is excluded');
assert.deepEqual(mediaLinkedTargetFromSearch({ linkedPageId: 'AAAAAAAA-1111-4111-8111-111111111111' }), { kind: 'page', id: 'aaaaaaaa-1111-4111-8111-111111111111' }); checks++;
check(mediaMatchesLinkedTarget(asset({ targetPostIds: ['post:a'] }), post), 'Exact blog reference appears');
check(!mediaMatchesLinkedTarget(asset({ targetPostIds: ['post:ab'] }), post), 'No prefix matching');
check(!mediaMatchesLinkedTarget(asset({}), mediaLinkedTargetFromSearch({ linkedPageId: 'p', linkedPostId: 'b' })), 'Ambiguous route refuses all rows');
check(mediaMatchesLinkedTarget(asset({ scope: 'post', scopeTargetId: 'other' }), { kind: 'all' }), 'All website files retains other-page/post reuse');
assert.deepEqual(mediaLinkedTargetQuery(page), { linkedPageId: 'page/a' }); checks++;
assert.deepEqual(mediaLinkedTargetQuery(post), { linkedPostId: 'post:a' }); checks++;

const html = renderToStaticMarkup(<MediaLinkedTargetFilter target={page} pages={[{ id: 'page/a', title: 'About & work' }]} posts={[{ id: 'post:a', title: 'Ideas' }]} loading={false} disabled={false} onChange={() => {}} />);
check(html.includes('value="page:page/a"') && html.includes('selected=""'), 'Selected page survives rendered control');
check(html.includes('About &amp; work') && html.includes('label="Blog posts"'), 'Readable page/post names and escaped titles');
check(html.includes('All website files') && html.includes('Only files linked'), 'Visible distinction between reuse and exact associations');
check(renderToStaticMarkup(<MediaLinkedTargetFilter target={{ kind: 'post', id: 'unavailable' }} pages={[]} posts={[]} loading={false} error="Page names could not load." disabled={false} onChange={() => {}} />).includes('title unavailable'), 'Selected ID remains visible after name-list failure');

const originalFetch = globalThis.fetch;
try {
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: new URL(String(input)), init });
    return Response.json({ success: true, data: { media: [], pagination: { total: 0, limit: 100, offset: 0, hasMore: false } } });
  }) as typeof fetch;
  await listMediaLibrary({ siteId: 'site-demo', linkedPageId: 'page/a', search: 'deck.pptx', type: 'file', offset: 100, limit: 100 });
  const first = requests[0];
  check(first.url.searchParams.get('linkedPageId') === 'page/a', 'Actual client forwards the exact page reference');
  check(!first.url.searchParams.has('pageId') && !first.url.searchParams.has('postId'), 'Exact reference filter does not alter insertion-context filters');
  check(first.url.searchParams.get('search') === 'deck.pptx' && first.url.searchParams.get('type') === 'file' && first.url.searchParams.get('offset') === '100', 'Search/type and pagination compose with exact page filtering');
  check(first.init?.credentials === 'include', 'Existing authenticated client delivery remains');
  await listMediaLibrary({ siteId: 'site-demo', linkedPostId: 'post:a' });
  check(requests[1].url.searchParams.get('linkedPostId') === 'post:a', 'Actual client forwards the exact post reference');
} finally { globalThis.fetch = originalFetch; }
console.log(`Media linked-target controls and client: ${checks} checks passed. No live/provider proof.`);
