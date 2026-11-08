import type { MediaAsset } from '@/stores/mockStore';

export const isSignedMediaPreviewUrl = (source: string): boolean => {
  try {
    const url = new URL(source, 'https://backy.invalid');
    return !!(url.searchParams.has('X-Amz-Signature') || url.searchParams.has('X-Goog-Signature')
      || (url.searchParams.has('token') && (url.searchParams.has('expiresAt') || /\/storage\/v1\/object\/sign\//.test(url.pathname))));
  } catch { return false; }
};

/** Public file delivery only applies to assets positively identified as site-owned uploads. */
export function mediaLibraryPreviewUrl(media: MediaAsset, siteId: string, publicFileUrl: (id: string, siteId: string) => string): string {
  if (media.visibility === 'private') return isSignedMediaPreviewUrl(media.url) ? media.url : '';
  let path = '';
  try { path = new URL(media.url, 'https://backy.invalid').pathname; } catch { return ''; }
  const storagePath = typeof media.metadata?.storagePath === 'string' ? media.metadata.storagePath : '';
  const ownedPath = !!siteId && (storagePath.startsWith(`sites/${siteId}/`) || path.startsWith(`/uploads/sites/${siteId}/`));
  if (ownedPath && media.id) return publicFileUrl(media.id, siteId);
  // A storage path from a different site is not an external reusable source.
  if (path.startsWith('/uploads/sites/') || storagePath.startsWith('sites/')) return '';
  return media.url;
}

/** Browse scope is independent of the page/post that owns a future upload. */
export function mediaLibraryScopeIncludes(item: Pick<MediaAsset, 'scope' | 'scopeTargetId' | 'targetPostIds' | 'targetPageIds'>, filter: 'all' | 'global' | 'page' | 'post', targetScope: 'global' | 'page' | 'post', targetId?: string): boolean {
  if (filter === 'all') return true;
  const scope = item.scope || 'global';
  if (filter === 'global') return scope === 'global';
  if (targetScope !== filter || !targetId) return false;
  const boundTargets = filter === 'post' ? item.targetPostIds : item.targetPageIds;
  return boundTargets?.includes(targetId) === true || (scope === filter && item.scopeTargetId === targetId);
}
