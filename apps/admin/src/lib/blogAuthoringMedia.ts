import type { MediaAsset } from '@/stores/mockStore';
import { isSignedMediaPreviewUrl, mediaLibraryPreviewUrl } from '@/components/editor/mediaLibraryPresentation';

export type BlogMediaKind = 'image' | 'video';
export interface BlogMediaSelection { url: string; mediaId: string; alt: string; caption: string }
export interface BlogMediaSession { siteId: string; targetId: string; scopeTargetId: string; active: boolean; disabled: boolean; canView: boolean }

export const isBlogMediaSessionCurrent = (requested: BlogMediaSession, current: BlogMediaSession): boolean => (
  current.active && !current.disabled && current.canView && !!current.siteId && !!current.targetId
  && requested.siteId === current.siteId && requested.targetId === current.targetId && requested.scopeTargetId === current.scopeTargetId
);

/** Store the public API file identity, never a transient or signed library preview URL. */
export function blogMediaSelection(media: MediaAsset, kind: BlogMediaKind, siteId: string, publicFileUrl: (id: string, siteId: string) => string): BlogMediaSelection | null {
  if (!siteId || !media.id || media.visibility === 'private' || media.type !== kind) return null;
  const url = mediaLibraryPreviewUrl(media, siteId, publicFileUrl);
  if (!/^https?:\/\//i.test(url) || isSignedMediaPreviewUrl(url)) return null;
  return { url, mediaId: media.id, alt: media.altText || '', caption: media.caption || '' };
}
