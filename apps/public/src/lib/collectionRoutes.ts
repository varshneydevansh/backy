type RoutedCollection = {
  slug: string;
  routePattern?: string | null;
};

const PARAM_SEGMENT_PATTERN = /^:([A-Za-z][A-Za-z0-9_]*)$/;

const encodeSegment = (value: string) => encodeURIComponent(value);

export const defaultCollectionRoutePattern = (collection: Pick<RoutedCollection, 'slug'>) => (
  `/${collection.slug}/:recordSlug`
);

export const normalizeCollectionRoutePattern = (
  value: unknown,
  collectionSlug: string,
): string => {
  const fallback = defaultCollectionRoutePattern({ slug: collectionSlug });
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) {
    return fallback;
  }

  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
  const compact = withLeadingSlash.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
  return compact.split('/').includes(':recordSlug') ? compact : fallback;
};

export const isValidCollectionRoutePattern = (value: unknown): value is string => {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value !== 'string') {
    return false;
  }

  const raw = value.trim();
  if (!raw) {
    return true;
  }

  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
  const compact = withLeadingSlash.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
  return compact.split('/').includes(':recordSlug');
};

export const buildCollectionItemPath = (
  collection: RoutedCollection,
  recordSlug: string,
): string => {
  const pattern = normalizeCollectionRoutePattern(collection.routePattern, collection.slug);
  const encodedRecordSlug = encodeSegment(recordSlug);
  const encodedCollectionSlug = encodeSegment(collection.slug);
  return pattern
    .split('/')
    .map((segment) => {
      if (segment === ':recordSlug') return encodedRecordSlug;
      if (segment === ':collectionSlug') return encodedCollectionSlug;
      return segment;
    })
    .join('/') || '/';
};

export const matchCollectionItemRoute = <TCollection extends RoutedCollection>(
  rawPath: string,
  collections: TCollection[],
): { collection: TCollection; recordSlug: string; params: Record<string, string>; canonical: string } | null => {
  const pathSegments = rawPath.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);

  for (const collection of collections) {
    const pattern = normalizeCollectionRoutePattern(collection.routePattern, collection.slug);
    const patternSegments = pattern.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    if (patternSegments.length !== pathSegments.length) {
      continue;
    }

    const params: Record<string, string> = {};
    let matched = true;

    for (let index = 0; index < patternSegments.length; index += 1) {
      const patternSegment = patternSegments[index];
      const pathSegment = pathSegments[index];
      const paramMatch = patternSegment.match(PARAM_SEGMENT_PATTERN);

      if (paramMatch) {
        params[paramMatch[1]] = decodeURIComponent(pathSegment);
        continue;
      }

      if (decodeURIComponent(pathSegment) !== patternSegment) {
        matched = false;
        break;
      }
    }

    if (!matched || !params.recordSlug) {
      continue;
    }

    if (params.collectionSlug && params.collectionSlug !== collection.slug) {
      continue;
    }

    return {
      collection,
      recordSlug: params.recordSlug,
      params: {
        collectionSlug: collection.slug,
        ...params,
      },
      canonical: buildCollectionItemPath(collection, params.recordSlug),
    };
  }

  return null;
};
