import type { MediaAsset } from '@/stores/mockStore';

export type MediaLinkedTarget =
  | { kind: 'all' }
  | { kind: 'page' | 'post'; id: string }
  | { kind: 'invalid' };

export function mediaLinkedTargetFromSearch(search: { linkedPageId?: string; linkedPostId?: string }): MediaLinkedTarget {
  const canonicalId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id.toLowerCase() : id;
  if (search.linkedPageId && search.linkedPostId) return { kind: 'invalid' };
  if (search.linkedPageId) return { kind: 'page', id: canonicalId(search.linkedPageId) };
  if (search.linkedPostId) return { kind: 'post', id: canonicalId(search.linkedPostId) };
  return { kind: 'all' };
}

export function mediaLinkedTargetQuery(target: MediaLinkedTarget): { linkedPageId?: string; linkedPostId?: string } {
  if (target.kind === 'page') return { linkedPageId: target.id };
  if (target.kind === 'post') return { linkedPostId: target.id };
  return {};
}

/** Exact references, rather than global assets eligible for insertion into any page. */
export function mediaMatchesLinkedTarget(asset: MediaAsset, target: MediaLinkedTarget): boolean {
  if (target.kind === 'all') return true;
  if (target.kind === 'invalid') return false;
  const ids = target.kind === 'page' ? asset.targetPageIds : asset.targetPostIds;
  if (ids?.includes(target.id)) return true;
  if (asset.scope === target.kind && asset.scopeTargetId === target.id) return true;
  const bindings = asset.metadata?.bindings;
  return Array.isArray(bindings) && bindings.some(binding => (
    binding && typeof binding === 'object' && !Array.isArray(binding)
      && binding.scope === target.kind && binding.targetId === target.id
      && (binding.mediaId === undefined || binding.mediaId === asset.id)
  ));
}
