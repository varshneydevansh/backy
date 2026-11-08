import { createHash, randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { NextResponse } from 'next/server';
import { assertMediaStorageJobManifest, isCanonicalMediaStorageJobPath, type BackyMediaStorageJob, type BackyMediaStorageJobCreateInput, type BackyMediaStorageJobRepository, type BackyRepositories, type MediaItem, type MediaVersion } from '@backy-cms/core';
import { getMediaList, getSiteByIdOrSlug } from './backyStore';
import { getMediaStorageAdapter, getMediaStoragePathFromMedia, resolveMediaStorageConfig } from './mediaStorage';
import { readCompleteMediaInventory, MediaInventoryIncompleteError } from './mediaInventory';
import { pendingDemoSiteBackupBytes } from './demoSiteBackupPersistence';
import { currentCompletingMediaUpload } from './mediaUploadReservationContext';

export class MediaStorageRecoveryError extends Error {
  jobId?: string;
  constructor(readonly code: string, message: string) { super(message); }
}
const unavailable = () => new MediaStorageRecoveryError('MEDIA_STORAGE_JOURNAL_UNAVAILABLE', 'Durable storage recovery is unavailable. Resolve its database or private journal storage before retrying.');
const invalid = () => new MediaStorageRecoveryError('MEDIA_STORAGE_JOURNAL_INVALID', 'The private storage journal could not be verified. No storage files were removed.');
const record = (value: unknown): value is Record<string, any> => Boolean(value && typeof value === 'object' && !Array.isArray(value));

/** Destination identity excludes credentials; credential rotation in the same bucket is safe. */
export function currentMediaStorageIdentity(): { provider: 'local' | 's3' | 'supabase'; identity: string } {
  const { config } = resolveMediaStorageConfig();
  if (!config) throw unavailable();
  const destination = config.provider === 'local' ? { provider: config.provider, basePath: resolve(config.basePath) }
    : config.provider === 's3' ? { provider: config.provider, bucket: config.bucket, region: config.region, endpoint: config.endpoint || null, forcePathStyle: Boolean(config.forcePathStyle) }
    : { provider: config.provider, url: config.url, bucket: config.bucket };
  return { provider: config.provider, identity: createHash('sha256').update(JSON.stringify(destination)).digest('hex') };
}

function demoDirectory(): string {
  const directory = resolve(process.cwd(), 'data/backy/private-media-jobs');
  const uploads = resolve(resolveMediaStorageConfig().config?.provider === 'local' ? (resolveMediaStorageConfig().config as any).basePath : 'public/uploads');
  if (!relative(uploads, directory).startsWith('..')) throw unavailable();
  return directory;
}
const demoPath = (siteId: string) => join(demoDirectory(), createHash('sha256').update(siteId).digest('hex') + '.json');
function verifyJob(job: BackyMediaStorageJob, siteId: string): BackyMediaStorageJob {
  assertMediaStorageJobManifest(job);
  if (job.siteId !== siteId || !['pending','settled'].includes(job.state) || !Array.isArray(job.remainingPaths) || new Set(job.remainingPaths).size !== job.remainingPaths.length || job.remainingPaths.some(path => !job.files.some(file => file.path === path)) || (job.state === 'settled') !== (job.remainingPaths.length === 0)) throw invalid();
  return job;
}
function readDemo(siteId: string): BackyMediaStorageJob[] {
  try { const rows = JSON.parse(readFileSync(demoPath(siteId), 'utf8')); if (!Array.isArray(rows)) throw invalid(); return rows.map(job => verifyJob(job, siteId)); }
  catch (error) { if ((error as { code?: string }).code === 'ENOENT') return []; throw unavailable(); }
}
function writeDemo(siteId: string, rows: BackyMediaStorageJob[]): void {
  rows.forEach(job => verifyJob(job, siteId));
  const directory = demoDirectory(), path = demoPath(siteId), temporary = path + '.' + randomUUID() + '.tmp';
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const descriptor = openSync(temporary, 'wx', 0o600);
    try { writeFileSync(descriptor, JSON.stringify(rows)); fsyncSync(descriptor); } finally { closeSync(descriptor); }
    if (JSON.stringify(JSON.parse(readFileSync(temporary, 'utf8'))) !== JSON.stringify(rows)) throw unavailable();
    renameSync(temporary, path);
    const parent = openSync(directory, 'r'); try { fsyncSync(parent); } finally { closeSync(parent); }
    if (JSON.stringify(JSON.parse(readFileSync(path, 'utf8'))) !== JSON.stringify(rows)) throw unavailable();
  } catch { try { unlinkSync(temporary); } catch {} throw unavailable(); }
}
/** Strict durable disk persistence, while admission remains explicitly single-process in demo. */
const demoJobs: BackyMediaStorageJobRepository = {
  async create(input) { assertMediaStorageJobManifest(input); const now = new Date().toISOString(), job: BackyMediaStorageJob = { ...input, id: randomUUID(), state: 'pending', remainingPaths: input.files.map(file => file.path), attempts: 0, lastErrorCode: null, createdAt: now, updatedAt: now }; const rows = readDemo(input.siteId); writeDemo(input.siteId, [...rows, job]); return job; },
  async get(siteId, jobId) { return readDemo(siteId).find(job => job.id === jobId) || null; },
  async list({ siteId, pendingOnly, limit, offset }) { const rows = readDemo(siteId).filter(job => !pendingOnly || job.state === 'pending'); const pageLimit = Math.min(100, Math.max(1, limit)); return { items: rows.slice(offset, offset + pageLimit), pagination: { total: rows.length, limit: pageLimit, offset, hasMore: offset + pageLimit < rows.length } }; },
  async recordRecovery(siteId, jobId, input) { const rows = readDemo(siteId), index = rows.findIndex(job => job.id === jobId); if (index < 0) throw invalid(); const before = rows[index]; if (input.remainingPaths.some(path => !before.remainingPaths.includes(path))) throw invalid(); const job: BackyMediaStorageJob = { ...before, ...input, state: input.remainingPaths.length ? 'pending' : 'settled', attempts: before.attempts + 1, updatedAt: new Date().toISOString() }; rows[index] = job; writeDemo(siteId, rows); return job; },
  async deleteSettled(siteId) { writeDemo(siteId, readDemo(siteId).filter(job => job.state !== 'settled')); },
};
export function mediaStorageJobRepository(repositories: BackyRepositories | null): BackyMediaStorageJobRepository {
  if (!repositories) return demoJobs;
  if (!repositories.media.storageJobs) throw unavailable();
  return repositories.media.storageJobs;
}
export async function readPendingMediaStorageJobs(siteId: string, repositories: BackyRepositories | null): Promise<BackyMediaStorageJob[]> {
  const jobs = mediaStorageJobRepository(repositories);
  return readCompleteMediaInventory(siteId, pagination => jobs.list({ siteId, pendingOnly: true, ...pagination }));
}

export function mediaStorageRetirementFiles(siteId: string, media: Pick<MediaItem, 'url' | 'metadata' | 'sizeBytes'>): BackyMediaStorageJobCreateInput['files'] {
  const paths = new Map<string, number>(), metadata = record(media.metadata) ? media.metadata : {};
  const add = (path: unknown, bytes: unknown) => {
    if (!isCanonicalMediaStorageJobPath(siteId, String(path)) || !Number.isSafeInteger(Number(bytes)) || Number(bytes) < 0) throw invalid();
    paths.set(String(path), Math.max(paths.get(String(path)) || 0, Number(bytes)));
  };
  if (metadata.storagePath !== undefined && metadata.storagePath !== null && !isCanonicalMediaStorageJobPath(siteId, String(metadata.storagePath))) throw invalid();
  const original = getMediaStoragePathFromMedia(siteId, media); if (original) add(original, media.sizeBytes);
  if (metadata.generatedTransforms !== undefined && metadata.generatedTransforms !== null) {
    if (!record(metadata.generatedTransforms) || !Array.isArray(metadata.generatedTransforms.variants)) throw invalid();
    for (const variant of metadata.generatedTransforms.variants) { if (!record(variant)) throw invalid(); add(variant.storagePath, variant.bytes); }
  }
  if (metadata.replacementVersions !== undefined) {
    if (!Array.isArray(metadata.replacementVersions)) throw invalid();
    for (const version of metadata.replacementVersions) {
      if (!record(version)) throw invalid();
      const path = version.storagePath || getMediaStoragePathFromMedia(siteId, version); if (path) add(path, version.sizeBytes);
    }
  }
  return [...paths].map(([path, bytes]) => ({ path, bytes, purpose: 'retire' as const }));
}

export async function mediaStorageAssetRetirementFiles(siteId: string, media: MediaItem, repositories: BackyRepositories | null): Promise<BackyMediaStorageJobCreateInput['files']> {
  const files = mediaStorageRetirementFiles(siteId, media), paths = new Map(files.map(file => [file.path, file]));
  if (repositories) {
    const versions = await readCompleteMediaInventory(siteId, pagination => repositories.media.listVersions({ siteId, mediaId: media.id, ...pagination }));
    for (const version of versions) {
      if (version.mediaId !== media.id) throw invalid();
      const path = version.storagePath || getMediaStoragePathFromMedia(siteId, version);
      if (!path) continue;
      if (!isCanonicalMediaStorageJobPath(siteId, path)) throw invalid();
      paths.set(path, { path, bytes: Math.max(paths.get(path)?.bytes || 0, version.sizeBytes), purpose: 'retire' });
    }
  }
  return [...paths.values()];
}

/** Complete originals, generated variants, metadata history AND repository versions. */
export async function mediaStorageReferenceInventory(siteId: string, repositories: BackyRepositories | null): Promise<{ media: MediaItem[]; paths: Map<string, number>; bytes: number }> {
  try {
    const media = await readCompleteMediaInventory(siteId, async pagination => {
      if (repositories) return repositories.media.list({ siteId, type: 'all', visibility: 'all', ...pagination });
      const result = getMediaList(siteId, pagination); return { items: result.media, pagination: result.pagination };
    });
    let siteVersionsByMedia: Map<string, MediaVersion[]> | undefined;
    if (repositories?.media.listSiteVersions) {
      const versions = await readCompleteMediaInventory(siteId, pagination => repositories.media.listSiteVersions!({ siteId, ...pagination }));
      const mediaIds = new Set(media.map(item => item.id));
      siteVersionsByMedia = new Map();
      for (const version of versions) {
        if (!mediaIds.has(version.mediaId)) throw invalid();
        const group = siteVersionsByMedia.get(version.mediaId) || [];
        group.push(version);
        siteVersionsByMedia.set(version.mediaId, group);
      }
    }
    const paths = new Map<string, number>(); let fallbackBytes = 0;
    function add(path: unknown, bytes: unknown) {
      if (typeof path !== 'string' || !isCanonicalMediaStorageJobPath(siteId, path) || !Number.isSafeInteger(Number(bytes)) || Number(bytes) < 0) throw invalid();
      paths.set(path, Math.max(paths.get(path) || 0, Number(bytes)));
    }
    for (const item of media) {
      const original = getMediaStoragePathFromMedia(siteId, item);
      if (original) add(original, item.sizeBytes); else fallbackBytes += Math.max(0, item.sizeBytes);
      const metadata = record(item.metadata) ? item.metadata : {};
      if (metadata.storagePath !== undefined && metadata.storagePath !== null && !isCanonicalMediaStorageJobPath(siteId, String(metadata.storagePath))) throw invalid();
      if (metadata.generatedTransforms !== undefined && metadata.generatedTransforms !== null) {
        if (!record(metadata.generatedTransforms) || !Array.isArray(metadata.generatedTransforms.variants)) throw invalid();
        for (const variant of metadata.generatedTransforms.variants) { if (!record(variant)) throw invalid(); add(variant.storagePath, variant.bytes); }
      }
      if (metadata.replacementVersions !== undefined) {
        if (!Array.isArray(metadata.replacementVersions)) throw invalid();
        for (const version of metadata.replacementVersions) { if (!record(version)) throw invalid(); const path = version.storagePath || getMediaStoragePathFromMedia(siteId, version); if (path) add(path, version.sizeBytes); else fallbackBytes += Math.max(0, Number(version.sizeBytes) || 0); }
      }
      if (repositories) {
        const versions = siteVersionsByMedia
          ? siteVersionsByMedia.get(item.id) || []
          : await readCompleteMediaInventory(siteId, pagination => repositories.media.listVersions({ siteId, mediaId: item.id, ...pagination }));
        for (const version of versions) { if (version.mediaId !== item.id) throw invalid(); const path = version.storagePath || getMediaStoragePathFromMedia(siteId, version); if (path) add(path, version.sizeBytes); else fallbackBytes += Math.max(0, version.sizeBytes); }
      }
    }
    return { media, paths, bytes: [...paths.values()].reduce((sum, bytes) => sum + bytes, fallbackBytes) };
  } catch (error) { if (error instanceof MediaInventoryIncompleteError) throw error; throw new MediaStorageRecoveryError('MEDIA_STORAGE_RECOVERY_INVENTORY_UNAVAILABLE', 'A complete surviving media and version inventory is unavailable. Storage files were retained; retry after resolving the inventory.'); }
}

export async function mediaStorageUsageWithPending(siteId: string, repositories: BackyRepositories | null): Promise<number> {
  const [inventory, jobs] = await Promise.all([mediaStorageReferenceInventory(siteId, repositories), readPendingMediaStorageJobs(siteId, repositories)]);
  const pending = new Map<string, number>();
  for (const job of jobs) for (const path of job.remainingPaths) if (!inventory.paths.has(path)) pending.set(path, Math.max(pending.get(path) || 0, job.files.find(file => file.path === path)!.bytes));
  let restoreBytes=0;
  if(repositories?.siteBackups){for(const job of await repositories.siteBackups.listJobs(siteId)){if(job.state==='settled'||await repositories.sites.getById(job.targetSiteId))continue;for(const file of job.files){if(!Number.isSafeInteger(file.bytes)||file.bytes<=0)throw invalid();restoreBytes+=file.bytes;}}}
  else if(!repositories)restoreBytes=pendingDemoSiteBackupBytes(siteId,id=>Boolean(getSiteByIdOrSlug(id)));
  const uploadBytes = repositories?.mediaUploadSessions
    ? await repositories.mediaUploadSessions.reservedBytes(siteId, currentCompletingMediaUpload()) : 0;
  const commerceBytes = repositories?.commerceEntitlements ? await repositories.commerceEntitlements.fileStorageUsage(siteId) : 0;
  return inventory.bytes + [...pending.values()].reduce((sum, bytes) => sum + bytes, 0) + restoreBytes + uploadBytes + commerceBytes;
}

export type MediaStorageRecoverySummary = { jobId: string; status: 'pending' | 'settled'; deletedFiles: number; protectedFiles: number; remainingFiles: number };
/** Caller must hold the shared site admission lock across inventory and physical deletion. */
export async function reconcileMediaStorageJob(siteId: string, jobId: string, repositories: BackyRepositories | null, mediaId?: string): Promise<MediaStorageRecoverySummary> {
  const jobs = mediaStorageJobRepository(repositories), job = await jobs.get(siteId, jobId);
  if (!job) throw new MediaStorageRecoveryError('MEDIA_STORAGE_JOB_NOT_FOUND', 'Storage recovery job not found for this site.');
  verifyJob(job, siteId);
  if (job.id !== jobId) throw invalid();
  if (job.state === 'settled') return { jobId, status: 'settled', deletedFiles: 0, protectedFiles: 0, remainingFiles: 0 };
  const destination = currentMediaStorageIdentity();
  if (destination.identity !== job.storageIdentity || destination.provider !== job.provider) throw new MediaStorageRecoveryError('MEDIA_STORAGE_DESTINATION_CHANGED', 'The storage destination changed. Restore the matching destination before retrying this retained job.');
  const inventory = await mediaStorageReferenceInventory(siteId, repositories), storage = await getMediaStorageAdapter();
  if (storage.provider !== job.provider) throw unavailable();
  const remaining: string[] = []; let deletedFiles = 0, protectedFiles = 0;
  for (const path of job.remainingPaths) {
    if (inventory.paths.has(path)) { protectedFiles++; continue; }
    try {
      // stat must distinguish proven absence from provider/access failure; exists is ambiguous.
      const before = await storage.stat(path);
      if (before) { await storage.delete(path); if (await storage.stat(path)) throw unavailable(); deletedFiles++; }
    } catch { remaining.push(path); }
  }
  const updated = await jobs.recordRecovery(siteId, job.id, { remainingPaths: remaining, lastErrorCode: remaining.length ? 'MEDIA_STORAGE_CLEANUP_PENDING' : null, ...(mediaId ? { mediaId } : {}) });
  return { jobId: job.id, status: updated.state, deletedFiles, protectedFiles, remainingFiles: remaining.length };
}

/** Record planned bytes before storage, then reconcile even an uncertain metadata outcome. */
export async function withJournaledMediaStorageMutation(input: Omit<BackyMediaStorageJobCreateInput, 'provider' | 'storageIdentity'>, repositories: BackyRepositories | null, operation: () => Promise<NextResponse>): Promise<NextResponse> {
  return withDynamicJournaledMediaStorageMutation(input, repositories, async begin => { if (input.files.length) await begin(input.files); return operation(); });
}
export async function withDynamicJournaledMediaStorageMutation(input: Omit<BackyMediaStorageJobCreateInput, 'provider' | 'storageIdentity' | 'files'>, repositories: BackyRepositories | null, operation: (begin: (files: BackyMediaStorageJobCreateInput['files']) => Promise<void>) => Promise<NextResponse>): Promise<NextResponse> {
  let job: BackyMediaStorageJob | undefined;
  const begin = async (files: BackyMediaStorageJobCreateInput['files']) => {
    if (job) throw invalid();
    if (files.length > 10000) throw new MediaStorageRecoveryError('MEDIA_STORAGE_JOURNAL_LIMIT_EXCEEDED', 'This asset has more than 10000 planned storage paths. Remove retained versions individually before retrying its deletion.');
    const currentSite = repositories ? await repositories.sites.getById(input.siteId) : getSiteByIdOrSlug(input.siteId);
    if (!currentSite || currentSite.id !== input.siteId) throw new MediaStorageRecoveryError('MEDIA_STORAGE_SITE_NOT_FOUND', 'The canonical site no longer exists. Storage bytes were not written.');
    const destination = currentMediaStorageIdentity();
    const manifest = { ...input, files, provider: destination.provider, storageIdentity: destination.identity };
    assertMediaStorageJobManifest(manifest);
    job = await mediaStorageJobRepository(repositories).create(manifest);
  };
  try {
    const response = await operation(begin);
    if (!job) return response;
    let recovery: MediaStorageRecoverySummary;
    try { recovery = await reconcileMediaStorageJob(input.siteId, job.id, repositories); }
    catch { recovery = { jobId: job.id, status: 'pending', deletedFiles: 0, protectedFiles: 0, remainingFiles: job.remainingPaths.length }; }
    const body = await response.json();
    if (body.success && body.data) {
      body.data.storageRecovery = recovery;
      body.data.storageCleanup = { status: recovery.status === 'settled' ? 'complete' : 'pending', deletedFiles: recovery.deletedFiles, remainingFiles: recovery.remainingFiles };
      if (body.data.quota) {
        try {
          const usage = await mediaStorageUsageWithPending(input.siteId, repositories);
          body.data.quota.usedBytes = usage;
          body.data.quota.remainingBytes = Math.max(0, Number(body.data.quota.limitBytes) - usage);
        } catch { body.data.completionWarnings = [...(body.data.completionWarnings || []), 'MEDIA_QUOTA_INVENTORY_PENDING']; }
      }
      if (recovery.status === 'pending') body.data.completionWarnings = [...new Set([...(body.data.completionWarnings || []), 'MEDIA_STORAGE_RECOVERY_PENDING'])];
    }
    else if (body.error) body.error.details = { ...body.error.details, storageRecovery: recovery };
    return NextResponse.json(body, { status: response.status, headers: response.headers });
  } catch (error) {
    if (!job) throw error;
    // A rejected metadata write may have committed. Preserve every planned path for an explicit recovery pass.
    try { await mediaStorageJobRepository(repositories).recordRecovery(input.siteId, job.id, { remainingPaths: job.remainingPaths, lastErrorCode: 'MEDIA_STORAGE_WRITE_OUTCOME_UNCONFIRMED' }); } catch {}
    throw Object.assign(new MediaStorageRecoveryError('MEDIA_STORAGE_WRITE_OUTCOME_UNCONFIRMED', 'Storage write outcome is unconfirmed. Reload the library and review its recovery job before retrying.'), { jobId: job.id, cause: error });
  }
}

export function mediaStorageRecoveryErrorResponse(error: unknown, requestId: string): NextResponse | null {
  if (!(error instanceof MediaStorageRecoveryError) && !(record(error) && typeof error.code === 'string' && error.code.startsWith('MEDIA_STORAGE_JOURNAL_'))) return null;
  const code = (error as MediaStorageRecoveryError).code, status = (code.startsWith('SITE_MEDIA_STORAGE_') || code === 'MEDIA_STORAGE_JOURNAL_LIMIT_EXCEEDED') ? 409 : (code === 'MEDIA_STORAGE_JOB_NOT_FOUND' || code === 'MEDIA_STORAGE_SITE_NOT_FOUND') ? 404 : code === 'MEDIA_STORAGE_WRITE_OUTCOME_UNCONFIRMED' ? 500 : code === 'BILLING_MEDIA_LIMIT' ? 402 : (code === 'MEDIA_STORAGE_PLANNED_QUOTA_EXCEEDED' || code === 'SITE_MEDIA_QUOTA_EXCEEDED') ? 413 : 503;
  return NextResponse.json({ success: false, requestId, error: { code, message: error instanceof MediaStorageRecoveryError ? error.message : unavailable().message, ...(record(error) && typeof error.jobId === 'string' ? { details: { jobId: error.jobId } } : {}) } }, { status, headers: { 'Cache-Control': 'no-store', ...(status === 503 ? { 'Retry-After': '1' } : {}) } });
}

export async function assertSiteMediaStorageJobsSettled(siteId: string, repositories: BackyRepositories | null): Promise<void> {
  if ((await readPendingMediaStorageJobs(siteId, repositories)).length) throw new MediaStorageRecoveryError('SITE_MEDIA_STORAGE_RECOVERY_PENDING', 'Complete this site’s media storage recovery jobs before deleting the site. Its private recovery journal was retained.');
  if ((await mediaStorageReferenceInventory(siteId, repositories)).paths.size) throw new MediaStorageRecoveryError('SITE_MEDIA_STORAGE_REFERENCES_REMAIN', 'Delete the site’s uploaded media and retained versions, then complete storage recovery before deleting the site.');
  await mediaStorageJobRepository(repositories).deleteSettled(siteId);
}

export function mediaStorageVersionRetirementFiles(siteId: string, version: { storagePath?: unknown; url?: unknown; sizeBytes?: unknown }) {
  const path = typeof version.storagePath === 'string' && version.storagePath ? version.storagePath : getMediaStoragePathFromMedia(siteId, { url: typeof version.url === 'string' ? version.url : null });
  if (!path) return [];
  if (!isCanonicalMediaStorageJobPath(siteId, path) || !Number.isSafeInteger(Number(version.sizeBytes)) || Number(version.sizeBytes) < 0) throw invalid();
  return [{ path, bytes: Number(version.sizeBytes), purpose: 'retire' as const }];
}
