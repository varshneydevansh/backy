import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from './adminAccess';
import { getSiteByIdOrSlug } from './backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from './repositoryRuntime';
import { withMediaStorageMutation } from './mediaStorageMutation';
import { mediaStorageJobRepository, mediaStorageRecoveryErrorResponse, mediaStorageUsageWithPending, reconcileMediaStorageJob } from './mediaStorageRecovery';
import type { BackyMediaStorageJob } from '@backy-cms/core';

export function publicMediaStorageJob(job: BackyMediaStorageJob) {
  return { jobId: job.id, siteId: job.siteId, mediaId: job.mediaId, operation: job.operation,
    status: job.state, plannedFiles: job.files.length, remainingFiles: job.remainingPaths.length,
    reservedBytes: job.files.filter(file => job.remainingPaths.includes(file.path)).reduce((sum, file) => sum + file.bytes, 0),
    attempts: job.attempts, lastErrorCode: job.lastErrorCode === null || ['MEDIA_STORAGE_CLEANUP_PENDING', 'MEDIA_STORAGE_WRITE_OUTCOME_UNCONFIRMED'].includes(job.lastErrorCode) ? job.lastErrorCode : 'MEDIA_STORAGE_RECOVERY_PENDING', createdAt: job.createdAt, updatedAt: job.updatedAt };
}
const failure = (status: number, code: string, message: string, requestId: string) => NextResponse.json({ success: false, requestId, error: { code, message } }, { status, headers: { 'Cache-Control': 'no-store', ...(status === 503 ? { 'Retry-After': '1' } : {}) } });
export async function handleMediaStorageRecovery(request: NextRequest, siteIdentifier: string, jobId?: string): Promise<NextResponse> {
  const requestId = request.headers.get('x-request-id') || randomUUID();
  // The shared guard resolves canonical site identity and denies other-site grants before repository access.
  const access = await requireAdminAccess(request, requestId, { permission: jobId ? 'media.edit' : 'media.view' });
  if (access instanceof NextResponse) return access;
  try {
    if (jobId && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(jobId)) return failure(400, 'INVALID_MEDIA_STORAGE_JOB_ID', 'Invalid recovery job identifier.', requestId);
    const repositories = shouldUseDemoStoreFallback() ? null : await getRequiredDatabaseRepositories();
    const site = repositories ? await repositories.sites.getById(siteIdentifier) || await repositories.sites.getBySlug(siteIdentifier) : getSiteByIdOrSlug(siteIdentifier);
    if (!site) return failure(404, 'SITE_NOT_FOUND', 'Site not found.', requestId);
    if (jobId) return await withMediaStorageMutation(repositories?.media || null, site.id, requestId, async () => {
      const recovery = await reconcileMediaStorageJob(site.id, jobId, repositories);
      return NextResponse.json({ success: true, requestId, data: { storageRecovery: recovery, usedBytes: await mediaStorageUsageWithPending(site.id, repositories) } }, { headers: { 'Cache-Control': 'no-store' } });
    });
    const params = new URL(request.url).searchParams;
    const limit = Number(params.get('limit') || 50), offset = Number(params.get('offset') || 0);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || (params.has('pendingOnly') && !['true','false'].includes(params.get('pendingOnly')!))) return failure(400, 'INVALID_MEDIA_STORAGE_RECOVERY_PAGINATION', 'Use limit 1–100, a nonnegative offset and pendingOnly true or false.', requestId);
    const result = await mediaStorageJobRepository(repositories).list({ siteId: site.id, pendingOnly: params.get('pendingOnly') !== 'false', limit, offset });
    return NextResponse.json({ success: true, requestId, data: { siteId: site.id, jobs: result.items.map(publicMediaStorageJob), pagination: result.pagination, concurrencyBoundary: repositories ? 'database-site-admission' : 'demo-single-process', retention: 'Planned paths remain private. Pending unreferenced bytes reserve storage quota until verified cleanup; surviving originals, variants and retained versions are protected.' } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return mediaStorageRecoveryErrorResponse(error, requestId) || failure(503, 'MEDIA_STORAGE_JOURNAL_UNAVAILABLE', 'Storage recovery is unavailable. Its files and private journal were retained; retry after resolving storage or inventory access.', requestId); }
}
