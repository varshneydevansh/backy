/** Private server journal. Never embed these records in public media metadata. */
export type BackyMediaStorageJobFile = {
  path: string;
  bytes: number;
  purpose: 'write' | 'retire';
};
export type BackyMediaStorageJob = {
  id: string;
  siteId: string;
  mediaId: string | null;
  operation: 'upload' | 'replace' | 'transforms' | 'delete' | 'version-delete' | 'version-restore';
  state: 'pending' | 'settled';
  storageIdentity: string;
  provider: 'local' | 's3' | 'supabase';
  files: BackyMediaStorageJobFile[];
  remainingPaths: string[];
  attempts: number;
  lastErrorCode: string | null;
  requestId: string;
  createdAt: string;
  updatedAt: string;
};
export type BackyMediaStorageJobCreateInput = Omit<BackyMediaStorageJob, 'id' | 'state' | 'remainingPaths' | 'attempts' | 'lastErrorCode' | 'createdAt' | 'updatedAt'>;
export interface BackyMediaStorageJobRepository {
  create(input: BackyMediaStorageJobCreateInput): Promise<BackyMediaStorageJob>;
  get(siteId: string, jobId: string): Promise<BackyMediaStorageJob | null>;
  list(input: { siteId: string; pendingOnly?: boolean; limit: number; offset: number }): Promise<{ items: BackyMediaStorageJob[]; pagination: { total: number; limit: number; offset: number; hasMore: boolean } }>;
  recordRecovery(siteId: string, jobId: string, input: { remainingPaths: string[]; lastErrorCode: string | null; mediaId?: string | null }): Promise<BackyMediaStorageJob>;
  deleteSettled(siteId: string): Promise<void>;
}

export const isCanonicalMediaStorageJobPath = (siteId: string, path: string): boolean => (
  Boolean(siteId && path.startsWith(`sites/${siteId}/`) && path.length <= 2048
    && !/[\\%?#\x00-\x1f]/.test(path)
    && path.split('/').every(part => part && part !== '.' && part !== '..'))
);

export function assertMediaStorageJobManifest(input: BackyMediaStorageJobCreateInput): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(input.siteId) || !/^[a-f0-9]{64}$/.test(input.storageIdentity)
    || !['local', 's3', 'supabase'].includes(input.provider)
    || !['upload', 'replace', 'transforms', 'delete', 'version-delete', 'version-restore'].includes(input.operation)
    || !Array.isArray(input.files) || !input.files.length || input.files.length > 10000
    || !Number.isSafeInteger(input.files.reduce((sum, file) => sum + file.bytes, 0))
    || new Set(input.files.map(file => file.path)).size !== input.files.length
    || input.files.some(file => !isCanonicalMediaStorageJobPath(input.siteId, file.path)
      || !Number.isSafeInteger(file.bytes) || file.bytes < 0
      || !['write', 'retire'].includes(file.purpose))) {
    throw Object.assign(new Error('The server storage journal manifest is invalid.'), { code: 'MEDIA_STORAGE_JOURNAL_INVALID' });
  }
}
