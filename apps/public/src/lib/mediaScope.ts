import type { MediaItem } from '@backy-cms/core';

export const booleanQueryFlag = (value: string | null): boolean | undefined => {
  if (value === null) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
};

export const mediaMatchesScopeFilters = (
  item: MediaItem,
  filters: {
    scope?: string | null;
    pageId?: string | null;
    postId?: string | null;
    globalOnly?: boolean;
  },
): boolean => {
  const itemScope = item.scope || 'global';

  if (filters.globalOnly) {
    return itemScope === 'global';
  }

  if (filters.scope && itemScope !== filters.scope) {
    return false;
  }

  if (filters.pageId) {
    return itemScope === 'global'
      || item.pageIds.includes(filters.pageId)
      || (itemScope === 'page' && item.scopeTargetId === filters.pageId);
  }

  if (filters.postId) {
    return itemScope === 'global'
      || item.postIds.includes(filters.postId)
      || (itemScope === 'post' && item.scopeTargetId === filters.postId);
  }

  return true;
};
