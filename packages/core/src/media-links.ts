import type { MediaItem } from './index';

export interface BackyMediaLinkedFilters {
  linkedPageId?: string;
  linkedPostId?: string;
}
/** Exact stored associations. Global availability alone is never a link. */
export function mediaMatchesLinkedFilters(
  item: Pick<MediaItem, 'id' | 'pageIds' | 'postIds' | 'scope' | 'scopeTargetId' | 'metadata'>,
  filters: BackyMediaLinkedFilters,
): boolean {
  const linked = (scope: 'page' | 'post', targetId: string): boolean => {
    const ids = scope === 'page' ? item.pageIds : item.postIds;
    if (ids?.includes(targetId) || item.scope === scope && item.scopeTargetId === targetId) return true;
    const bindings = item.metadata?.bindings;
    return Array.isArray(bindings) && bindings.some(binding => binding && typeof binding === 'object' && !Array.isArray(binding)
      && binding.scope === scope && binding.targetId === targetId
      && (binding.mediaId === undefined || binding.mediaId === item.id));
  };
  return (!filters.linkedPageId || linked('page', filters.linkedPageId))
    && (!filters.linkedPostId || linked('post', filters.linkedPostId));
}
