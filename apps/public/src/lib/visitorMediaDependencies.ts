import type { BackyMediaRepository, MediaItem } from '@backy-cms/core';
import type { RenderDataSource } from './renderPayload';

export class VisitorMediaDependenciesError extends Error {
  readonly code = 'VISITOR_MEDIA_DEPENDENCIES_UNAVAILABLE';
  constructor() { super('Complete bounded visitor media dependencies are unavailable.'); }
}
const record = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);
const identityKeys = new Set([
  'mediaId', 'mediaIds', 'assetId', 'assetIds', 'imageId', 'imageIds', 'videoId', 'videoIds',
  'audioId', 'audioIds', 'fileId', 'fileIds', 'fileMediaId', 'fileMediaIds', 'fontId', 'fontIds',
  'fontMediaId', 'fontMediaIds', 'documentId', 'documentIds', 'iconId', 'iconIds',
  'posterMediaId', 'posterMediaIds', 'backgroundMediaId', 'backgroundMediaIds',
  'fallbackImageMediaId', 'fallbackImageMediaIds', 'fallbackMediaId', 'downloadMediaId', 'downloadMediaIds',
]);
const assetCollections = new Set(['media', 'fonts', 'images', 'videos', 'audio', 'documents', 'icons', 'files']);

/** Bundled demo storage already owns its in-memory inventory. Read identities
 * directly and only the bounded font subset, never the ordinary media list.
 */
export function memoryVisitorMediaRepository(source: Required<Pick<RenderDataSource, 'getMediaById' | 'getMediaList'>>): Pick<BackyMediaRepository, 'getPublicRenderAssets'> {
  return { getPublicRenderAssets: async ({ siteId, mediaIds, maxFonts }) => {
    if (!siteId || mediaIds.length > 512 || !Number.isSafeInteger(maxFonts) || maxFonts < 1 || maxFonts > 256) {
      throw new VisitorMediaDependenciesError();
    }
    const fonts = source.getMediaList(siteId, { type: 'font', visibility: 'public', limit: maxFonts + 1, offset: 0 });
    if (!fonts.pagination || !Number.isSafeInteger(fonts.pagination.total) || fonts.pagination.total > maxFonts
      || fonts.pagination.total !== fonts.media.length || fonts.pagination.hasMore
      || fonts.media.some(item => item.siteId !== siteId || item.type !== 'font' || item.visibility !== 'public')) {
      throw new VisitorMediaDependenciesError();
    }
    const selected = new Map(fonts.media.map(item => [item.id, item]));
    for (const id of mediaIds) {
      const item = source.getMediaById(siteId, id);
      if (item && item.id === id && item.siteId === siteId && item.visibility === 'public') selected.set(item.id, item);
    }
    return [...selected.values()];
  } };
}

/** Authored identities, never guesses from prose, filenames, arbitrary code or external URLs.
 * Extensions must declare their dependencies through assetIds. Hidden/responsive/fallback
 * branches are deliberately retained, because they can become visible in the same page.
 */
export function collectVisitorMediaIds(siteId: string, roots: unknown[]): Set<string> {
  const ids = new Set<string>(); let budget = 50_000;
  const ancestors = new WeakSet<object>();
  const add = (value: unknown) => {
    if (--budget < 0) throw new VisitorMediaDependenciesError();
    if (Array.isArray(value)) { value.forEach(entry => { if (typeof entry === 'string') add(entry); }); return; }
    if (typeof value !== 'string' || !value || value.length > 200 || /[\s/\\\p{Cc}\p{Cf}]/u.test(value)) return;
    ids.add(value); if (ids.size > 512) throw new VisitorMediaDependenciesError();
  };
  const visit = (value: unknown, depth: number, key = '', parentKey = '') => {
    if (--budget < 0 || depth > 80) throw new VisitorMediaDependenciesError();
    if (identityKeys.has(key)) { add(value); return; }
    if (typeof value === 'string') {
      // Same-site canonical delivery paths can be embedded in HTML/CSS/native fallbacks.
      const pattern = /\/api\/sites\/([^/\s"'<>]+)\/media\/([^/\s"'<>?#]+)\/(?:file|transform)(?=[?\s"'<>)]|$)/g;
      for (const match of value.matchAll(pattern)) {
        try { if (decodeURIComponent(match[1]) === siteId) add(decodeURIComponent(match[2])); } catch { /* Invalid encoded URL is not an identity. */ }
      }
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (ancestors.has(value)) throw new VisitorMediaDependenciesError();
    ancestors.add(value);
    if (Array.isArray(value)) value.forEach(entry => visit(entry, depth + 1, '', key));
    else if (record(value)) {
      if (assetCollections.has(parentKey)) add(value.id);
      for (const [name, entry] of Object.entries(value)) {
        if (name !== 'editableMap') visit(entry, depth + 1, name, key);
      }
    }
    ancestors.delete(value);
  };
  roots.forEach(root => visit(root, 0)); return ids;
}

/** The adapter must issue an exact same-site ID/font query, not media.list/site inventory.
 * A bounded discovery pass invokes the actual renderer's binding normalization. The
 * small fixed point also covers identities introduced by a resolved media binding.
 */
export async function hydrateVisitorMediaDataSource(
  repository: Pick<BackyMediaRepository, 'getPublicRenderAssets'>,
  siteId: string,
  base: RenderDataSource,
  prepare: (source: RenderDataSource) => unknown[],
): Promise<RenderDataSource> {
  if (!repository.getPublicRenderAssets) throw new VisitorMediaDependenciesError();
  const ids = new Set<string>(); let media: MediaItem[] = [];
  const source: RenderDataSource = { ...base,
    getMediaById: (requestedSite, id) => {
      if (requestedSite !== siteId) return undefined;
      if (typeof id === 'string' && id && id.length <= 200 && !/[\s/\\\p{Cc}\p{Cf}]/u.test(id)) ids.add(id);
      if (ids.size > 512) throw new VisitorMediaDependenciesError();
      return media.find(item => item.id === id);
    },
    getMediaList: (requestedSite, options = {}) => {
      const selected = requestedSite === siteId ? media.filter(item => !options.type || options.type === 'all' || item.type === options.type) : [];
      // The complete route dependency set replaces the builders' old arbitrary 100-row cap.
      return { media: selected, pagination: { total: selected.length, limit: selected.length, offset: 0, hasMore: false } };
    },
  };
  try {
    let loaded = new Set<string>();
    for (let pass = 0; pass < 3; pass++) {
      for (const id of collectVisitorMediaIds(siteId, prepare(source))) ids.add(id);
      if (ids.size > 512) throw new VisitorMediaDependenciesError();
      if (pass > 0 && [...ids].every(id => loaded.has(id))) return source;
      loaded = new Set(ids);
      media = await repository.getPublicRenderAssets({ siteId, mediaIds: [...ids].sort(), maxFonts: 256 });
      const seen = new Set<string>();
      for (const item of media) {
        if (!item || item.siteId !== siteId || item.visibility !== 'public'
          || (item.type !== 'font' && !ids.has(item.id)) || seen.has(item.id)) throw new VisitorMediaDependenciesError();
        seen.add(item.id);
      }
      if (media.length > ids.size + 256 || media.filter(item => item.type === 'font').length > 256) throw new VisitorMediaDependenciesError();
    }
    throw new VisitorMediaDependenciesError();
  } catch { throw new VisitorMediaDependenciesError(); }
}
