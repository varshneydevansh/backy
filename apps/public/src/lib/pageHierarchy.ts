/** Public page paths come from retained slugs and parent IDs, never SEO aliases. */
export interface PageHierarchyNode {
  id: string;
  siteId: string;
  slug: string;
  parentId?: string | null;
  isHomepage?: boolean;
}

export const PAGE_HIERARCHY_MAX_DEPTH = 128;

export function normalizeHierarchyPath(value: string): string | null {
  const slug = value.trim().replace(/^\/+|\/+$/g, '');
  if (!slug) return '/';
  if (/[\\?#\u0000-\u001f]/.test(slug)
    || slug.split('/').some(part => !part || part === '.' || part === '..')) return null;
  return `/${slug}`;
}

/** Null means unavailable, foreign, cyclic, ambiguous or malformed ancestry. */
export function pageHierarchyPath<T extends PageHierarchyNode>(
  page: T,
  siteId: string,
  byId: ReadonlyMap<string, T | null>,
): string | null {
  const parts: string[] = [];
  const visited = new Set<string>();
  let current: T | null | undefined = page;
  for (let depth = 0; depth < PAGE_HIERARCHY_MAX_DEPTH; depth++) {
    if (!current || current.siteId !== siteId || visited.has(current.id)
      || byId.get(current.id) !== current) return null;
    visited.add(current.id);
    if (current.isHomepage || current.slug === 'index') return `/${parts.join('/')}`;
    const path = normalizeHierarchyPath(current.slug);
    if (!path || path === '/') return null;
    parts.unshift(path.slice(1));
    if (!current.parentId) return `/${parts.join('/')}`;
    current = byId.get(current.parentId);
  }
  return null;
}

/** The repository may supply only its candidate pages and hydrated ancestors. */
export function findPageByHierarchyPath<T extends PageHierarchyNode>(
  candidates: readonly T[],
  siteId: string,
  rawPath: string,
  inventory: readonly T[] = candidates,
  caseInsensitive = false,
): T | null {
  const path = normalizeHierarchyPath(rawPath);
  if (!path) return null;
  const compare = (value: string) => caseInsensitive ? value.toLowerCase() : value;
  const byId = new Map<string, T | null>();
  for (const page of inventory) {
    if (page.siteId !== siteId) continue;
    byId.set(page.id, byId.has(page.id) ? null : page);
  }
  const matches = candidates.filter(page => {
    const candidatePath = pageHierarchyPath(page, siteId, byId);
    return candidatePath !== null && compare(candidatePath) === compare(path);
  });
  return matches.length === 1 ? matches[0] : null;
}

/** Internal-only ancestry projection. Foreign, duplicate and colliding paths fail closed. */
export function pageHierarchyPaths<T extends PageHierarchyNode>(inventory: readonly T[], siteId: string): Map<string, string> {
  const byId = new Map<string, T | null>();
  for (const page of inventory) if (page.siteId === siteId) byId.set(page.id, byId.has(page.id) ? null : page);
  const paths = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const page of inventory) {
    const path = pageHierarchyPath(page, siteId, byId);
    if (path) { paths.set(page.id, path); counts.set(path, (counts.get(path) || 0) + 1); }
  }
  return new Map([...paths].filter(([, path]) => counts.get(path) === 1));
}
