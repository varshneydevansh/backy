import type { MediaItem } from '@backy-cms/core';

export type NormalizedMediaScope = NonNullable<MediaItem['scope']>;

export const booleanQueryFlag = (value: string | null): boolean | undefined => {
  if (value === null) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
};

export const normalizeMediaScope = (
  value: unknown,
  fallback: NormalizedMediaScope = 'global',
): NormalizedMediaScope => {
  return value === 'page' || value === 'post' || value === 'global'
    ? value
    : fallback;
};

export const normalizeScopeTargetId = (value: unknown): string | null => {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
};

export const normalizeScopeIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Map(value
    .flatMap((item) => (typeof item === 'string' ? item.split(/[,\n]/g) : []))
    .map((item) => item.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .map((item) => [item.toLowerCase(), item])).values());
};

export const mediaScopeRequiresTarget = (scope: NormalizedMediaScope): boolean => (
  scope === 'page' || scope === 'post'
);

export const buildMediaScopeMetadataPatch = (input: {
  scope?: unknown;
  scopeTargetId?: unknown;
  pageIds?: unknown;
  postIds?: unknown;
}, current?: Pick<MediaItem, 'scope' | 'scopeTargetId' | 'pageIds' | 'postIds'>): {
  scope: NormalizedMediaScope;
  scopeTargetId: string | null;
  pageIds: string[];
  postIds: string[];
} => {
  const currentScope = normalizeMediaScope(current?.scope, 'global');
  const scope = input.scope === undefined
    ? currentScope
    : normalizeMediaScope(input.scope, currentScope);
  const targetId = input.scopeTargetId === undefined
    ? normalizeScopeTargetId(current?.scopeTargetId)
    : normalizeScopeTargetId(input.scopeTargetId);
  const scopeTargetId = scope === 'global' ? null : targetId;
  const pageIds = input.pageIds === undefined
    ? [...(current?.pageIds || [])]
    : normalizeScopeIdList(input.pageIds);
  const postIds = input.postIds === undefined
    ? [...(current?.postIds || [])]
    : normalizeScopeIdList(input.postIds);

  if (scope === 'page' && scopeTargetId && !pageIds.includes(scopeTargetId)) {
    pageIds.push(scopeTargetId);
  }

  if (scope === 'post' && scopeTargetId && !postIds.includes(scopeTargetId)) {
    postIds.push(scopeTargetId);
  }

  return {
    scope,
    scopeTargetId,
    pageIds,
    postIds,
  };
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
  const itemScope = normalizeMediaScope(item.scope, 'global');
  const filterScope = filters.scope === 'page' || filters.scope === 'post' || filters.scope === 'global'
    ? filters.scope
    : null;

  if (filters.globalOnly) {
    return itemScope === 'global';
  }

  if (filterScope && itemScope !== filterScope) {
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

/** One exact stored association selector, independent of editor availability. */
export function readMediaLinkedFilters(query: URLSearchParams): { linkedPageId?: string; linkedPostId?: string; invalid?: boolean } {
  const keys = ['linkedPageId', 'linkedPostId'] as const;
  if (keys.every(key => query.has(key))) return { invalid: true };
  const result: { linkedPageId?: string; linkedPostId?: string } = {};
  for (const key of keys) {
    if (!query.has(key)) continue;
    const value = query.get(key)?.trim();
    if (query.getAll(key).length !== 1 || !value || value.length > 256 || /[\p{Cc}\p{Cs}]/u.test(value)) return { invalid: true };
    result[key] = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value) ? value.toLowerCase() : value;
  }
  return result;
}
