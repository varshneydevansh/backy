import type { RenderDataSource } from './renderPayload';

export class VisitorCollectionDependenciesError extends Error {
  readonly code = 'VISITOR_COLLECTION_DEPENDENCIES_UNAVAILABLE';
  constructor() { super('Published collection dependencies could not be prepared.'); }
}

type Discover = (source: RenderDataSource) => unknown;
export type PrepareVisitorCollections = (source: RenderDataSource, discover: Discover) => Promise<RenderDataSource>;

/** Request-local demand loading. Existing readers still own record filtering,
 * sorting and pagination; this layer does not interpret authored bindings.
 */
export function deferVisitorCollectionReads(
  siteId: string,
  publicCollectionIds: readonly string[],
  source: RenderDataSource,
  load: (collectionId: string) => Promise<void>,
): { source: RenderDataSource; prepare: PrepareVisitorCollections } {
  const allowed = new Set(publicCollectionIds), requested = new Set<string>(), loaded = new Set<string>();
  if (!siteId || allowed.size > 100 || [...allowed].some(id => typeof id !== 'string' || !id)) {
    throw new VisitorCollectionDependenciesError();
  }
  let prepared = false;
  const requireRecords = (requestedSiteId: string, collectionId: string): boolean => {
    if (requestedSiteId !== siteId || !allowed.has(collectionId)) return false;
    if (loaded.has(collectionId)) return true;
    // A final renderer must never quietly emit incomplete data if its reads
    // differ from preparation. No late unbounded fetch or inventory fallback.
    if (prepared) throw new VisitorCollectionDependenciesError();
    requested.add(collectionId);
    return false;
  };
  const deferred: RenderDataSource = {
    ...source,
    getCollectionRecordByIdOrSlug: (requestedSiteId, collectionId, recordIdOrSlug) => (
      requireRecords(requestedSiteId, collectionId)
        ? source.getCollectionRecordByIdOrSlug?.(requestedSiteId, collectionId, recordIdOrSlug) : undefined
    ),
    listCollectionRecords: (requestedSiteId, collectionId, options) => (
      requireRecords(requestedSiteId, collectionId)
        ? source.listCollectionRecords?.(requestedSiteId, collectionId, options) || { records: [] } : { records: [] }
    ),
  };
  return {
    source: deferred,
    prepare: async (decoratedSource, discover) => {
      try {
        // Each nonterminal round loads at least one new allowed collection.
        // Empty collections count as loaded, and references can reveal another
        // collection only after their source records have arrived.
        for (let round = 0; round <= allowed.size; round++) {
          discover(decoratedSource);
          const pending = [...requested].filter(id => !loaded.has(id));
          if (!pending.length) { prepared = true; return decoratedSource; }
          for (let offset = 0; offset < pending.length; offset += 4) {
            const batch = pending.slice(offset, offset + 4);
            await Promise.all(batch.map(id => load(id)));
            batch.forEach(id => loaded.add(id));
          }
        }
      } catch { throw new VisitorCollectionDependenciesError(); }
      throw new VisitorCollectionDependenciesError();
    },
  };
}
