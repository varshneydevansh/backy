import {
  matchCollectionItemRoute,
  matchCollectionListRoute,
  normalizeCollectionListRoutePattern,
  normalizeCollectionRoutePattern,
} from './collectionRoutes';

export type RouteConflictPage = {
  id?: string;
  slug: string;
  title?: string;
  isHomepage?: boolean;
};

export type RouteConflictCollection = {
  id?: string;
  slug: string;
  name?: string;
  routePattern?: string | null;
  listRoutePattern?: string | null;
};

export type RouteConflict =
  | {
      kind: 'reserved';
      path: string;
      message: string;
    }
  | {
      kind: 'page';
      path: string;
      page: RouteConflictPage;
      message: string;
    }
  | {
      kind: 'collectionList' | 'collectionItem';
      path: string;
      collection: RouteConflictCollection;
      message: string;
    };

export const pagePathForRouteConflict = (page: Pick<RouteConflictPage, 'slug' | 'isHomepage'>): string => {
  if (page.isHomepage || page.slug === 'index') {
    return '/';
  }

  const normalized = page.slug.replace(/^\/+|\/+$/g, '');
  return normalized ? `/${normalized}` : '/';
};

const firstPathSegment = (path: string): string => (
  path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)[0] || ''
);

const isReservedRoutePath = (path: string): boolean => {
  const segment = firstPathSegment(path);
  return segment === 'api' || segment === 'sites' || segment === 'blog';
};

const routePatternExamples = (collection: RouteConflictCollection): string[] => {
  const listPath = normalizeCollectionListRoutePattern(collection.listRoutePattern, collection.slug)
    .split('/')
    .map((segment) => (segment.startsWith(':') ? collection.slug : segment))
    .join('/') || '/';
  const itemPath = normalizeCollectionRoutePattern(collection.routePattern, collection.slug)
    .split('/')
    .map((segment) => {
      if (segment === ':collectionSlug') return collection.slug;
      if (segment === ':recordSlug') return 'sample-record';
      return segment.startsWith(':') ? 'sample' : segment;
    })
    .join('/') || '/';

  return [listPath, itemPath];
};

export const findPageRouteConflict = (
  page: RouteConflictPage,
  collections: RouteConflictCollection[],
): RouteConflict | null => {
  const path = pagePathForRouteConflict(page);
  if (path !== '/' && isReservedRoutePath(path)) {
    return {
      kind: 'reserved',
      path,
      message: `Page path "${path}" uses a reserved Backy route prefix.`,
    };
  }

  const listMatch = matchCollectionListRoute(path, collections);
  if (listMatch) {
    return {
      kind: 'collectionList',
      path,
      collection: listMatch.collection,
      message: `Page path "${path}" conflicts with the "${listMatch.collection.name || listMatch.collection.slug}" collection list route.`,
    };
  }

  const itemMatch = matchCollectionItemRoute(path, collections);
  if (itemMatch) {
    return {
      kind: 'collectionItem',
      path,
      collection: itemMatch.collection,
      message: `Page path "${path}" conflicts with the "${itemMatch.collection.name || itemMatch.collection.slug}" collection item route.`,
    };
  }

  return null;
};

export const findCollectionRouteConflict = (
  collection: RouteConflictCollection,
  pages: RouteConflictPage[],
): RouteConflict | null => {
  for (const path of routePatternExamples(collection)) {
    if (path !== '/' && isReservedRoutePath(path)) {
      return {
        kind: 'reserved',
        path,
        message: `Collection route "${path}" uses a reserved Backy route prefix.`,
      };
    }
  }

  for (const page of pages) {
    const path = pagePathForRouteConflict(page);
    if (matchCollectionListRoute(path, [collection])) {
      return {
        kind: 'page',
        path,
        page,
        message: `Collection list route conflicts with existing page "${page.title || page.slug}" at "${path}".`,
      };
    }

    if (matchCollectionItemRoute(path, [collection])) {
      return {
        kind: 'page',
        path,
        page,
        message: `Collection item route conflicts with existing page "${page.title || page.slug}" at "${path}".`,
      };
    }
  }

  return null;
};
