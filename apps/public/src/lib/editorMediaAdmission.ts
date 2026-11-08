import type { MediaItem } from "@backy-cms/core";
import { collectRepositoryMediaReferences } from "./repositoryMediaReferenceSync";

/** Validate authored managed identities against the canonical site, without changing ownership.
 * URL-only external images/fonts and non-media theme/font token names are not managed identities.
 * This is pre-write admission, not a transaction coupling media deletion with document saves.
 */
export async function invalidEditorMediaReference(
  siteId: string,
  input: Record<string, unknown>,
  read: (siteId: string, mediaId: string) => Promise<Pick<MediaItem, "id" | "siteId"> | null | undefined> | Pick<MediaItem, "id" | "siteId"> | null | undefined,
  options: { nativeUuidIds?: boolean } = {},
): Promise<{ path: string; mediaId: string } | null> {
  const references = collectRepositoryMediaReferences({ content: input.content, meta: input.meta, ...(input.featuredImageId ? { mediaId: input.featuredImageId } : {}) });
  const checked = new Map<string, boolean>();
  for (const reference of references) {
    // Native media primary keys are UUIDs; avoid sending legacy/catalog text to a UUID SQL predicate.
    if (options.nativeUuidIds && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference.mediaId)) return { ...reference, path: reference.path === "/mediaId" ? "/featuredImageId" : reference.path };
    if (!checked.has(reference.mediaId)) {
      const media = await read(siteId, reference.mediaId);
      checked.set(reference.mediaId, Boolean(media && media.id === reference.mediaId && media.siteId === siteId));
    }
    if (!checked.get(reference.mediaId)) return { ...reference, path: reference.path === "/mediaId" ? "/featuredImageId" : reference.path };
  }
  return null;
}
