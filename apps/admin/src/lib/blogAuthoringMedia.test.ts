import assert from 'node:assert/strict';
import type { MediaAsset } from '@/stores/mockStore';
import { blogMediaSelection, isBlogMediaSessionCurrent, type BlogMediaSession } from './blogAuthoringMedia';

const asset: MediaAsset = { id: 'image-42', name: 'Article photo', type: 'image', size: '2 MB', url: 'https://storage.example/image.jpg?token=temporary', visibility: 'public', altText: 'Sunlight on a desk', caption: 'Photo by the author', metadata: { storagePath: 'sites/site-article/images/article.jpg', secretPreview: 'never-copy' } };
const publicFileUrl = (id: string, siteId: string) => `https://public.example/api/sites/${siteId}/media/${id}/file`;
const selected = blogMediaSelection(asset, 'image', 'site-article', publicFileUrl);
assert.deepEqual(selected, { url: 'https://public.example/api/sites/site-article/media/image-42/file', mediaId: 'image-42', alt: 'Sunlight on a desk', caption: 'Photo by the author' });
assert(!selected?.url.includes('token='), 'saved article URL never comes from a temporary library preview');
assert.equal(blogMediaSelection({ ...asset, visibility: 'private' }, 'image', 'site-article', publicFileUrl), null);
assert.equal(blogMediaSelection(asset, 'video', 'site-article', publicFileUrl), null);
assert.equal(blogMediaSelection(asset, 'image', '', publicFileUrl), null, 'no default-site fallback');
const video = blogMediaSelection({ ...asset, id: 'video-1', type: 'video' }, 'video', 'site-article', publicFileUrl);
assert.equal(video?.mediaId, 'video-1');
const external = blogMediaSelection({ ...asset, url: 'https://cdn.example/reusable.jpg', metadata: {} }, 'image', 'site-article', publicFileUrl);
assert.equal(external?.url, 'https://cdn.example/reusable.jpg');
assert.equal(external?.mediaId, asset.id);
assert.equal(blogMediaSelection({ ...asset, url: 'https://storage.example/storage/v1/object/sign/image.jpg?token=temporary', metadata: {} }, 'image', 'site-article', publicFileUrl), null, 'a temporary referenced source is never stored');

const requested: BlogMediaSession = { siteId: 'site-article', targetId: 'article-body', scopeTargetId: 'post-1', active: true, disabled: false, canView: true };
assert(isBlogMediaSessionCurrent(requested, requested));
for (const patch of [{ targetId: 'other-body' }, { siteId: 'other-site' }, { scopeTargetId: 'post-2' }, { active: false }, { disabled: true }, { canView: false }]) {
  assert.equal(isBlogMediaSessionCurrent(requested, { ...requested, ...patch }), false, `stale author session rejected: ${JSON.stringify(patch)}`);
}
console.log('Blog media identity and author-session checks passed.');
