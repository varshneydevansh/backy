import { NextResponse } from 'next/server';
import type { BackyMediaRepository } from '@backy-cms/core';
import { AsyncLocalStorage } from 'node:async_hooks';

const activeDemoSites = new Set<string>();
const heldMutation = new AsyncLocalStorage<{ media: BackyMediaRepository | null; siteId: string }>();

/** All byte-increasing admin routes share this admission boundary. Demo locks
 * are process-local; database mode requires the repository's durable lock. */
export async function withMediaStorageMutation<T>(
  media: BackyMediaRepository | null,
  siteId: string,
  requestId: string,
  operation: () => Promise<T>,
): Promise<T | NextResponse> {
  try {
    const held = heldMutation.getStore();
    if (held?.siteId === siteId && held.media === media) return operation();
    if (media) {
      if (!media.withStorageMutationLock) throw Object.assign(new Error('Storage lock unavailable.'), { code: 'MEDIA_STORAGE_LOCK_UNAVAILABLE' });
      return await media.withStorageMutationLock(siteId, () => heldMutation.run({ media, siteId }, operation));
    }
    if (activeDemoSites.has(siteId)) throw Object.assign(new Error('Storage mutation busy.'), { code: 'MEDIA_STORAGE_MUTATION_BUSY' });
    activeDemoSites.add(siteId);
    try { return await heldMutation.run({ media, siteId }, operation); } finally { activeDemoSites.delete(siteId); }
  } catch (error) {
    const code = (error as { code?: unknown })?.code;
    if (code !== 'MEDIA_STORAGE_MUTATION_BUSY' && code !== 'MEDIA_STORAGE_LOCK_UNAVAILABLE') throw error;
    return NextResponse.json({ success: false, requestId, error: {
      code,
      message: code === 'MEDIA_STORAGE_MUTATION_BUSY'
        ? 'Another storage update is in progress for this site. Retry shortly.'
        : 'Storage mutation protection is unavailable. Configure a supported database before retrying.',
    } }, { status: 503, headers: { 'Cache-Control': 'no-store', ...(code === 'MEDIA_STORAGE_MUTATION_BUSY' ? { 'Retry-After': '1' } : {}) } });
  }
}
