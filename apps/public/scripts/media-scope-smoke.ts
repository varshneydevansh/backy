import assert from 'node:assert/strict';
import type { MediaItem } from '@backy-cms/core';
import {
  buildMediaScopeMetadataPatch,
  mediaMatchesScopeFilters,
  mediaScopeRequiresTarget,
  normalizeMediaScope,
} from '../src/lib/mediaScope';

const media = (input: Partial<MediaItem> & Pick<MediaItem, 'id'>): MediaItem => ({
  id: input.id,
  siteId: 'site-smoke',
  filename: `${input.id}.png`,
  originalName: `${input.id}.png`,
  mimeType: 'image/png',
  sizeBytes: 10,
  type: 'image',
  url: `/uploads/${input.id}.png`,
  thumbnailUrl: null,
  folderId: null,
  pageIds: input.pageIds || [],
  postIds: input.postIds || [],
  tags: [],
  metadata: {},
  altText: null,
  caption: null,
  uploadedBy: 'admin',
  scope: input.scope || 'global',
  scopeTargetId: input.scopeTargetId ?? null,
  visibility: 'public',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const global = media({ id: 'global' });
const pageOwned = media({ id: 'page-owned', scope: 'page', scopeTargetId: 'page-home', pageIds: ['page-home'] });
const pageBound = media({ id: 'page-bound', scope: 'global', pageIds: ['page-home'] });
const otherPage = media({ id: 'other-page', scope: 'page', scopeTargetId: 'page-about' });
const postOwned = media({ id: 'post-owned', scope: 'post', scopeTargetId: 'post-news' });

assert.equal(mediaMatchesScopeFilters(global, { pageId: 'page-home' }), true);
assert.equal(mediaMatchesScopeFilters(pageOwned, { pageId: 'page-home' }), true);
assert.equal(mediaMatchesScopeFilters(pageBound, { pageId: 'page-home' }), true);
assert.equal(mediaMatchesScopeFilters(otherPage, { pageId: 'page-home' }), false);
assert.equal(mediaMatchesScopeFilters(postOwned, { pageId: 'page-home' }), false);

assert.equal(mediaMatchesScopeFilters(global, { scope: 'page', pageId: 'page-home' }), false);
assert.equal(mediaMatchesScopeFilters(pageOwned, { scope: 'page', pageId: 'page-home' }), true);
assert.equal(mediaMatchesScopeFilters(global, { globalOnly: true }), true);
assert.equal(mediaMatchesScopeFilters(pageOwned, { globalOnly: true }), false);
assert.equal(mediaMatchesScopeFilters(global, { scope: 'bad-scope' }), true);

assert.equal(normalizeMediaScope('page'), 'page');
assert.equal(normalizeMediaScope('invalid', 'post'), 'post');
assert.equal(mediaScopeRequiresTarget('page'), true);
assert.equal(mediaScopeRequiresTarget('global'), false);

assert.deepEqual(
  buildMediaScopeMetadataPatch({ scope: 'page', scopeTargetId: 'page-home' }),
  {
    scope: 'page',
    scopeTargetId: 'page-home',
    pageIds: ['page-home'],
    postIds: [],
  },
);

assert.deepEqual(
  buildMediaScopeMetadataPatch({ scope: 'post', scopeTargetId: 'post-news', postIds: ['post-news', 'post-archive'] }),
  {
    scope: 'post',
    scopeTargetId: 'post-news',
    pageIds: [],
    postIds: ['post-news', 'post-archive'],
  },
);

assert.deepEqual(
  buildMediaScopeMetadataPatch({ scope: 'global', scopeTargetId: 'page-home' }, pageOwned),
  {
    scope: 'global',
    scopeTargetId: null,
    pageIds: ['page-home'],
    postIds: [],
  },
);

assert.deepEqual(
  buildMediaScopeMetadataPatch({}, pageOwned),
  {
    scope: 'page',
    scopeTargetId: 'page-home',
    pageIds: ['page-home'],
    postIds: [],
  },
);

console.log(JSON.stringify({
  ok: true,
  cases: 18,
}));
