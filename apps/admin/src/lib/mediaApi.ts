import { queueMediaStorageMutation } from './mediaStorageQueue';
import { formatBytes } from '@/lib/utils';
import { getActiveAdminSessionToken } from '@/lib/adminSessionToken';
import { getLocalBackendOrigin, normalizeLocalBackendBase } from '@/lib/localBackendOrigin';
import type { MediaAsset } from '@/stores/mockStore';
import type { MediaUploadReadiness } from './mediaUploadReadiness';

type MediaScope = 'global' | 'page' | 'post';
type MediaVisibility = 'public' | 'private';
type MediaListType = 'image' | 'video' | 'audio' | 'document' | 'file' | 'font' | 'other';

const MAX_MEDIA_LIST_LIMIT = 100;

interface ApiMediaItem {
  id: string;
  originalName?: string;
  filename: string;
  type: 'image' | 'video' | 'audio' | 'document' | 'font' | 'other';
  sizeBytes: number;
  url: string;
  scope?: MediaScope;
  scopeTargetId?: string | null;
  visibility?: MediaVisibility;
  folderId?: string | null;
  altText?: string | null;
  caption?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
  responsive?: MediaAsset['responsive'];
  organization?: MediaAsset['organization'];
  uploadedBy?: string | null;
  pageIds?: string[];
  postIds?: string[];
}

const collectionRecordIdsFromMediaMetadata = (
  metadata: Record<string, unknown> | undefined,
): string[] => {
  const bindings = metadata?.bindings;
  if (!Array.isArray(bindings)) {
    return [];
  }

  return Array.from(new Set(bindings
    .filter((binding): binding is Record<string, unknown> => (
      Boolean(binding) && typeof binding === 'object' && !Array.isArray(binding)
    ))
    .filter((binding) => binding.scope === 'collectionRecord')
    .map((binding) => typeof binding.targetId === 'string' ? binding.targetId.trim() : '')
    .filter(Boolean)));
};

interface ApiMediaListResponse {
  success: boolean;
  data?: {
    media: ApiMediaItem[];
    quota?: ApiMediaQuota;
    pagination?: MediaPagination;
    uploadReadiness?: MediaUploadReadiness;
  };
  error?: {
    message?: string;
  };
}

interface ApiMediaQuota {
  limitBytes: number;
  usedBytes: number;
  remainingBytes: number;
}

interface ApiUploadResponse {
  success: boolean;
  data?: {
    storageCleanup?: MediaAsset['storageCleanup'];
    completionWarnings?: string[];
    media: ApiMediaItem;
  };
  error?: {
    message?: string;
  };
}

interface ApiMediaResponse {
  success: boolean;
  data?: {
    media: ApiMediaItem;
    storageCleanup?: MediaAsset['storageCleanup'];
    completionWarnings?: string[];
    quota?: ApiMediaQuota;
    replacement?: {
      previousVersion?: Record<string, unknown>;
      retainedVersions?: number;
    };
  };
  error?: {
    message?: string;
  };
}

export interface MediaVersionRecord {
  id?: string;
  siteId?: string;
  mediaId?: string;
  filename?: string;
  originalName?: string;
  mimeType?: string;
  sizeBytes?: number;
  type?: ApiMediaItem['type'];
  url?: string;
  thumbnailUrl?: string | null;
  storagePath?: string | null;
  storageProvider?: string | null;
  createdAt?: string;
  replacedAt?: string;
  replacedBy?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

interface ApiMediaVersionsResponse {
  success: boolean;
  data?: {
    mediaId: string;
    source: 'database' | 'metadata';
    versions: MediaVersionRecord[];
    pagination?: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  };
  error?: {
    message?: string;
  };
}

interface ApiMediaVersionDeleteResponse {
  success: boolean;
  data?: {
    deleted: boolean;
    mediaId: string;
    versionId: string;
    source: 'database' | 'metadata';
    media?: ApiMediaItem;
    version?: MediaVersionRecord;
  };
  error?: {
    message?: string;
  };
}

interface ApiMediaVersionRestoreResponse {
  success: boolean;
  data?: {
    restored: boolean;
    mediaId: string;
    versionId: string;
    source: 'database' | 'metadata';
    media: ApiMediaItem;
    restoredVersion?: MediaVersionRecord;
    retainedVersion?: MediaVersionRecord;
  };
  error?: {
    message?: string;
  };
}

interface ApiMediaBindResponse {
  success: boolean;
  data?: {
    media: ApiMediaItem;
    binding: unknown;
    target: {
      type: 'page' | 'post';
      id: string;
      bound: boolean;
      referenceKey: 'pageIds' | 'postIds';
    };
  };
  error?: {
    message?: string;
  };
}

interface ApiSignedMediaUrlResponse {
  success: boolean;
  data?: {
    signedUrl: string;
    path: string;
    expiresAt: string | number;
    disposition: 'inline' | 'attachment';
    media: {
      id: string;
      siteId: string;
      filename: string;
      originalName?: string | null;
      mimeType?: string | null;
      visibility: MediaVisibility;
    };
  };
  error?: {
    message?: string;
  };
}

interface ApiDeleteResponse {
  success: boolean;
  data?: {
    deleted: boolean;
    mediaId: string;
  };
  error?: {
    code?: string;
    message?: string;
    details?: MediaDeletionImpact;
  };
}

export interface MediaDeletionReference {
  scope: 'page' | 'post' | 'collectionRecord';
  targetId: string;
  collectionId?: string;
}
export interface MediaDeletionImpact {
  mediaId: string;
  referenceCount: number;
  references: MediaDeletionReference[];
  referenceFingerprint: string;
}
export class MediaDeletionConflictError extends Error {
  constructor(message: string, public impact: MediaDeletionImpact) { super(message); }
}

interface ApiMediaProviderAnalyticsResponse {
  success: boolean;
  data?: MediaProviderAnalyticsResult;
  error?: {
    message?: string;
  };
}

interface ApiMediaFolder {
  id: string;
  siteId: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  createdAt: string;
}

interface ApiMediaFolderListResponse {
  success: boolean;
  data?: {
    folders: ApiMediaFolder[];
  };
  error?: {
    message?: string;
  };
}

interface ApiMediaFolderResponse {
  success: boolean;
  data?: {
    folder: ApiMediaFolder;
  };
  error?: {
    message?: string;
  };
}

export interface MediaUploadOptions {
  siteId?: string;
  scope?: MediaScope;
  scopeTargetId?: string | null;
  folderId?: string | null;
  visibility?: MediaVisibility;
  tags?: string[];
  metadata?: Record<string, unknown>;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: 'normal' | 'italic' | 'oblique';
  fontFallback?: string;
  fontDisplay?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
  altText?: string;
  caption?: string;
  /** Byte progress for durable staging; caller may stop between chunks. */
  onProgress?: (uploadedBytes: number, totalBytes: number) => void;
  signal?: AbortSignal;
}

export interface MediaListOptions {
  siteId?: string;
  scope?: MediaScope | 'all';
  visibility?: MediaVisibility;
  type?: MediaListType;
  search?: string;
  tag?: string;
  folderId?: string | null;
  pageId?: string;
  postId?: string;
  linkedPageId?: string;
  linkedPostId?: string;
  limit?: number;
  offset?: number;
}

export interface MediaUpdateInput {
  originalName?: string;
  altText?: string | null;
  caption?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
  folderId?: string | null;
  scope?: MediaScope;
  scopeTargetId?: string | null;
  visibility?: MediaVisibility;
}

export interface MediaProviderAnalyticsEntry {
  mediaId?: string;
  storagePath?: string;
  url?: string;
  totalRequests: number;
  bytesServed: number;
  conversions?: number;
  conversionValue?: number;
  source?: string;
  reportingWindow?: string;
  currency?: string;
  attributionWindow?: string;
  lastDeliveredAt?: string;
}

export interface MediaProviderAnalyticsInput {
  source?: string;
  reportingWindow?: string;
  mergeMode?: 'replace' | 'increment';
  currency?: string;
  attributionWindow?: string;
  entries: MediaProviderAnalyticsEntry[];
}

export interface MediaProviderAnalyticsResult {
  source: string;
  reportingWindow: string;
  mergeMode: 'replace' | 'increment';
  matchedCount: number;
  unmatchedCount: number;
  matched: Array<{
    mediaId: string;
    matchedBy: string;
    totalRequests: number;
    bytesServed: number;
    conversions: number;
    conversionValue: number;
  }>;
  unmatched: MediaProviderAnalyticsEntry[];
}

export interface MediaReplaceOptions {
  siteId?: string;
  reason?: string;
  replacedBy?: string;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: 'normal' | 'italic' | 'oblique';
  fontFallback?: string;
  fontDisplay?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
}

export interface MediaTransformPrepareInput {
  siteId?: string;
  widths?: number[];
  quality?: number;
  sizes?: string;
  preparedBy?: string;
}

export interface MediaBindInput {
  targetType: 'page' | 'post';
  targetId: string;
  action?: 'bind' | 'unbind';
  usageType?: 'content' | 'background' | 'thumbnail' | 'cover' | 'avatar' | 'document' | 'icon' | 'other';
  attachedBy?: string | null;
}

export interface MediaFolder {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

export interface MediaFolderCreateInput {
  parentId?: string | null;
  sortOrder?: number;
}

export interface MediaQuota {
  limitBytes: number;
  usedBytes: number;
  remainingBytes: number;
}

export interface MediaPagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface MediaLibraryResult {
  media: MediaAsset[];
  quota?: MediaQuota;
  pagination?: MediaPagination;
  uploadReadiness?: MediaUploadReadiness;
}

export interface SignedMediaUrlInput {
  expiresInSeconds?: number;
  disposition?: 'inline' | 'attachment';
}

export interface SignedMediaUrl {
  signedUrl: string;
  path: string;
  expiresAt: string;
  disposition: 'inline' | 'attachment';
}

const getEnvValue = (key: string): string => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return env[key]?.trim() ?? '';
};

export const getDefaultMediaSiteId = (): string => (
  getEnvValue('VITE_BACKY_DEFAULT_SITE_ID') ||
  getEnvValue('VITE_PUBLIC_SITE_ID') ||
  'site-demo'
);

const getAdminApiBase = (): string => {
  const envBase = (
    getEnvValue('VITE_BACKY_ADMIN_API_BASE_URL') ||
    getEnvValue('VITE_ADMIN_API_URL') ||
    getEnvValue('VITE_BACKY_PUBLIC_API_BASE_URL') ||
    getEnvValue('VITE_PUBLIC_API_URL') ||
    getEnvValue('VITE_API_BASE_URL') ||
    ''
  ).trim();

  if (!envBase && typeof window !== 'undefined' && window.location.port === '5173') {
    return `${getLocalBackendOrigin()}/api/admin`;
  }

  const base = normalizeLocalBackendBase(envBase || (typeof window !== 'undefined' ? window.location.origin : getLocalBackendOrigin()));
  return `${base.replace(/\/api\/admin$/, '').replace(/\/api$/, '').replace(/\/$/, '')}/api/admin`;
};

const getPublicApiBase = (): string => {
  const envBase = (
    getEnvValue('VITE_BACKY_PUBLIC_API_BASE_URL') ||
    getEnvValue('VITE_PUBLIC_API_URL') ||
    getEnvValue('VITE_BACKY_ADMIN_API_BASE_URL') ||
    getEnvValue('VITE_ADMIN_API_URL') ||
    getEnvValue('VITE_API_BASE_URL') ||
    ''
  ).trim();

  if (!envBase && typeof window !== 'undefined' && window.location.port === '5173') {
    return getLocalBackendOrigin();
  }

  return normalizeLocalBackendBase(envBase || (typeof window !== 'undefined' ? window.location.origin : getLocalBackendOrigin()))
    .replace(/\/api\/admin$/, '')
    .replace(/\/api$/, '')
    .replace(/\/$/, '');
};

const getAdminApiKey = (): string => {
  if (typeof window !== 'undefined') return '';

  return (
    getEnvValue('VITE_BACKY_ADMIN_API_KEY') ||
    getEnvValue('VITE_ADMIN_API_KEY')
  );
};

const adminFetch: typeof globalThis.fetch = (input, init = {}) => {
  const apiKey = getAdminApiKey();
  const sessionToken = getActiveAdminSessionToken();
  const headers = new Headers(init.headers);

  if (sessionToken && !headers.has('authorization') && !headers.has('x-backy-admin-session')) {
    headers.set('authorization', `Bearer ${sessionToken}`);
  } else if (apiKey && !headers.has('x-backy-admin-key') && !headers.has('authorization')) {
    headers.set('x-backy-admin-key', apiKey);
  }

  return globalThis.fetch(input, {
    ...init,
    credentials: init.credentials || 'include',
    headers,
  });
};

const toAdminMediaType = (type: ApiMediaItem['type']): MediaAsset['type'] => {
  if (type === 'image' || type === 'video' || type === 'audio' || type === 'font' || type === 'other') {
    return type;
  }

  return 'file';
};

const toApiMediaListType = (type: MediaListType): MediaListType => type;

const toMediaAsset = (item: ApiMediaItem): MediaAsset => ({
  id: item.id,
  name: item.originalName || item.filename,
  type: toAdminMediaType(item.type),
  size: formatBytes(item.sizeBytes || 0),
  sizeBytes: item.sizeBytes || 0,
  url: item.url,
  altText: item.altText || null,
  caption: item.caption || null,
  tags: item.tags || [],
  metadata: item.metadata || {},
  responsive: item.responsive,
  organization: item.organization,
  folderId: item.folderId || null,
  scope: item.scope || 'global',
  scopeTargetId: item.scopeTargetId || null,
  visibility: item.visibility || 'public',
  uploadedBy: item.uploadedBy || 'admin',
  targetPageIds: item.pageIds || [],
  targetPostIds: item.postIds || [],
  targetCollectionRecordIds: collectionRecordIdsFromMediaMetadata(item.metadata),
});

const normalizeApiTimestamp = (value: string | number): string => {
  if (typeof value === 'number') {
    return new Date(value < 1_000_000_000_000 ? value * 1000 : value).toISOString();
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return new Date(numeric < 1_000_000_000_000 ? numeric * 1000 : numeric).toISOString();
  }

  return value;
};

export async function listMediaLibrary(options: MediaListOptions = {}): Promise<MediaLibraryResult> {
  const siteId = options.siteId || getDefaultMediaSiteId();
  const query = new URLSearchParams();
  const requestedLimit = Number.isFinite(options.limit) ? Math.floor(options.limit as number) : undefined;
  const safeLimit = requestedLimit ? Math.min(Math.max(requestedLimit, 1), MAX_MEDIA_LIST_LIMIT) : undefined;

  if (options.scope && options.scope !== 'all') query.set('scope', options.scope);
  if (options.visibility) query.set('visibility', options.visibility);
  if (options.type) query.set('type', toApiMediaListType(options.type));
  if (options.search) query.set('search', options.search);
  if (options.tag) query.set('tag', options.tag);
  if (options.folderId !== undefined) query.set('folderId', options.folderId || '');
  if (options.pageId) query.set('pageId', options.pageId);
  if (options.postId) query.set('postId', options.postId);
  if (options.linkedPageId) query.set('linkedPageId', options.linkedPageId);
  if (options.linkedPostId) query.set('linkedPostId', options.linkedPostId);
  if (safeLimit) query.set('limit', `${safeLimit}`);
  if (options.offset) query.set('offset', `${options.offset}`);

  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/media?${query.toString()}`);
  const payload = await response.json() as ApiMediaListResponse;

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load media library');
  }

  return {
    media: payload.data.media.map(toMediaAsset),
    quota: payload.data.quota,
    pagination: payload.data.pagination,
    uploadReadiness: payload.data.uploadReadiness,
  };
}

export async function listMedia(options: MediaListOptions = {}): Promise<MediaAsset[]> {
  const result = await listMediaLibrary(options);
  return result.media;
}

const toMediaFolder = (folder: ApiMediaFolder): MediaFolder => ({
  id: folder.id,
  name: folder.name,
  parentId: folder.parentId,
  sortOrder: folder.sortOrder,
});

export async function listMediaFolders(siteId = getDefaultMediaSiteId()): Promise<MediaFolder[]> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/media/folders`);
  const payload = await response.json() as ApiMediaFolderListResponse;

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load media folders');
  }

  return payload.data.folders.map(toMediaFolder);
}

export async function createMediaFolder(
  name: string,
  siteId = getDefaultMediaSiteId(),
  input: MediaFolderCreateInput = {},
): Promise<MediaFolder> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/media/folders`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name,
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    }),
  });
  const payload = await response.json() as ApiMediaFolderResponse;

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to create media folder');
  }

  return toMediaFolder(payload.data.folder);
}

export async function updateMediaFolder(
  folderId: string,
  input: { name?: string; parentId?: string | null; sortOrder?: number },
  siteId = getDefaultMediaSiteId(),
): Promise<MediaFolder> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/media/folders/${folderId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await response.json() as ApiMediaFolderResponse;

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to update media folder');
  }

  return toMediaFolder(payload.data.folder);
}

export async function deleteMediaFolder(folderId: string, siteId = getDefaultMediaSiteId()): Promise<void> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/media/folders/${folderId}`, {
    method: 'DELETE',
  });
  const payload = await response.json() as ApiDeleteResponse;

  if (!response.ok || !payload.success || !payload.data?.deleted) {
    throw new Error(payload.error?.message || 'Unable to delete media folder');
  }
}

async function uploadMediaUnqueued(file: File, options: MediaUploadOptions = {}): Promise<MediaAsset> {
  const siteId = options.siteId || getDefaultMediaSiteId();
  const formData = new FormData();
  formData.set('file', file);
  formData.set('scope', options.scope || 'global');
  formData.set('visibility', options.visibility || 'public');

  if (options.scopeTargetId) formData.set('scopeTargetId', options.scopeTargetId);
  if (options.folderId !== undefined) formData.set('folderId', options.folderId || '');
  if (options.tags?.length) formData.set('tags', options.tags.join(','));
  if (options.altText) formData.set('altText', options.altText);
  if (options.caption) formData.set('caption', options.caption);
  if (options.metadata) formData.set('metadata', JSON.stringify(options.metadata));
  if (options.fontFamily) formData.set('fontFamily', options.fontFamily);
  if (options.fontWeight) formData.set('fontWeight', options.fontWeight);
  if (options.fontStyle) formData.set('fontStyle', options.fontStyle);
  if (options.fontFallback) formData.set('fontFallback', options.fontFallback);
  if (options.fontDisplay) formData.set('fontDisplay', options.fontDisplay);

  // Keep every HTTP request below Vercel's request-body ceiling. A retry with
  // the same file/metadata reads the durable offset rather than starting over.
  if (file.size > 3 * 1024 * 1024) return uploadMediaResumable(file, formData, siteId, options);

  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/media`, {
    method: 'POST',
    body: formData,
  });
  const payload = await response.json() as ApiUploadResponse;

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to upload media');
  }

  return { ...toMediaAsset(payload.data.media), storageCleanup: payload.data.storageCleanup, completionWarnings: payload.data.completionWarnings };
}

async function uploadMediaResumable(file: File, form: FormData, siteId: string, options: MediaUploadOptions): Promise<MediaAsset> {
  if (file.size > 50 * 1024 * 1024) throw new Error('Resumable uploads currently support files up to50 MiB.');
  options.signal?.throwIfAborted();
  const digest = async (value: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', value as BufferSource)), byte => byte.toString(16).padStart(2, '0')).join('');
  const sha256 = await digest(await file.arrayBuffer());
  const fields = Object.fromEntries([...form.entries()].filter(([key, value]) => key !== 'file' && typeof value === 'string')) as Record<string, string>;
  const bindingFingerprint = await digest(new TextEncoder().encode(JSON.stringify({filename:file.name,mimeType:file.type || 'application/octet-stream',sizeBytes:file.size,sha256,fields:Object.entries(fields).sort(([a],[b])=>a.localeCompare(b,'en'))})));
  const fingerprint = await digest(new TextEncoder().encode(JSON.stringify({siteId,bindingFingerprint})));
  const key = `backy:upload:${fingerprint}`;
  const readSaved = () => { try { return localStorage.getItem(key); } catch { return null; } };
  const save = (id: string | null) => { try { if (id) localStorage.setItem(key, id); else localStorage.removeItem(key); } catch { /* Storage disabled: in-flight chunking still works. */ } };
  const base = `${getAdminApiBase()}/sites/${siteId}/media/uploads`;
  const call = async (url: string, init: RequestInit) => {
    const response = await adminFetch(url, { ...init, signal: options.signal });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw Object.assign(new Error(payload.error?.message || 'Upload could not continue. Select the same file again to resume from its saved offset.'), { status: response.status, code: payload.error?.code });
    return payload.data;
  };
  let id = readSaved(), state: any;
  if (id) {
    try { state = (await call(`${base}/${encodeURIComponent(id)}`, { method: 'GET' })).upload; }
    catch (error) { if (![404,410].includes((error as { status?: number }).status || 0)) throw error; save(null); id = null; }
  }
  if (!id) {
    state = (await call(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size, sha256, fields }) })).upload;
    id = state.id; save(id);
  }
  if (!id || !state || state.id!==id || state.bindingFingerprint!==bindingFingerprint || state.filename!==file.name || state.mimeType!==(file.type || 'application/octet-stream') || !Number.isSafeInteger(state.offset) || state.offset < 0 || state.offset > file.size || state.sizeBytes !== file.size) throw new Error('Saved upload status does not match this file and upload options. Read or discard the saved transfer before continuing.');
  if (state.state === 'failed') { await call(`${base}/${encodeURIComponent(id)}`, { method: 'DELETE' }); save(null); throw new Error('The earlier upload failed final file checks. Select the file again to start a new upload.'); }
  options.onProgress?.(state.offset, file.size);
  while (state.state === 'uploading' && state.offset < file.size) {
    options.signal?.throwIfAborted();
    const nextOffset = Math.min(file.size, state.offset + 1024 * 1024);
    state = (await call(`${base}/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'content-type': 'application/offset+octet-stream', 'upload-offset': String(state.offset) }, body: file.slice(state.offset, Math.min(file.size, state.offset + 1024 * 1024)) })).upload;
    if (state?.id !== id || state.bindingFingerprint!==bindingFingerprint || state.offset !== nextOffset || state.sizeBytes !== file.size || state.state !== 'uploading') throw new Error('Upload offset response could not be verified. Read the saved transfer before continuing.');
    options.onProgress?.(state.offset, file.size);
  }
  const result = await call(`${base}/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'complete' }) });
  if(!result?.media || typeof result.media.id!=='string' || !result.media.id || typeof result.media.url!=='string' || !result.media.url || result.media.metadata?.resumableUploadId!==id) throw new Error('The completed upload response could not be verified. Select the same file to recover its saved result.');
  const asset = toMediaAsset(result.media);
  save(null);
  return { ...asset, storageCleanup: result.storageCleanup, completionWarnings: result.completionWarnings };
}

export interface MediaUploadTransfer {
  id: string; filename: string; sizeBytes: number; offset: number;
  state: 'uploading' | 'completing' | 'complete' | 'failed'; expiresAt: string;
}
export async function listMediaUploadTransfers(siteId: string, offset = 0): Promise<{uploads: MediaUploadTransfer[]; pagination: {total: number; offset: number; limit: number; hasMore: boolean}}> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/media/uploads?limit=25&offset=${offset}`, {method: 'GET'});
  const payload = await response.json();
  if (!response.ok || !payload.success) throw new Error(payload.error?.message || 'Unable to read saved transfers.');
  return payload.data;
}
export async function discardMediaUploadTransfer(siteId: string, uploadId: string): Promise<void> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/media/uploads/${encodeURIComponent(uploadId)}`, {method: 'DELETE'});
  const payload = await response.json();
  if (!response.ok || !payload.success || !payload.data?.cancelled) throw new Error(payload.error?.message || 'Transfer was not discarded. Recheck its status.');
}

export async function updateMedia(
  mediaId: string,
  input: MediaUpdateInput,
  siteId = getDefaultMediaSiteId(),
): Promise<MediaAsset> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/media/${mediaId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await response.json() as ApiMediaResponse;

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to update media');
  }

  return toMediaAsset(payload.data.media);
}

export async function ingestMediaProviderAnalytics(
  input: MediaProviderAnalyticsInput,
  siteId = getDefaultMediaSiteId(),
): Promise<MediaProviderAnalyticsResult> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/media/provider-analytics`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await response.json() as ApiMediaProviderAnalyticsResponse;

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to ingest provider analytics');
  }

  return payload.data;
}

async function replaceMediaUnqueued(
  mediaId: string,
  file: File,
  options: MediaReplaceOptions = {},
): Promise<MediaAsset> {
  const siteId = options.siteId || getDefaultMediaSiteId();
  const formData = new FormData();
  formData.set('file', file);
  if (options.reason) formData.set('reason', options.reason);
  if (options.replacedBy) formData.set('replacedBy', options.replacedBy);
  if (options.fontFamily) formData.set('fontFamily', options.fontFamily);
  if (options.fontWeight) formData.set('fontWeight', options.fontWeight);
  if (options.fontStyle) formData.set('fontStyle', options.fontStyle);
  if (options.fontFallback) formData.set('fontFallback', options.fontFallback);
  if (options.fontDisplay) formData.set('fontDisplay', options.fontDisplay);

  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/media/${mediaId}`, {
    method: 'POST',
    body: formData,
  });
  const payload = await response.json() as ApiMediaResponse;

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to replace media');
  }

  return { ...toMediaAsset(payload.data.media), storageCleanup: payload.data.storageCleanup, completionWarnings: payload.data.completionWarnings };
}

export async function listMediaVersions(
  mediaId: string,
  siteId = getDefaultMediaSiteId(),
): Promise<{ versions: MediaVersionRecord[]; source: 'database' | 'metadata' }> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/media/${mediaId}/versions`);
  const payload = await response.json() as ApiMediaVersionsResponse;

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load media versions');
  }

  return {
    versions: payload.data.versions,
    source: payload.data.source,
  };
}

async function deleteMediaVersionUnqueued(
  mediaId: string,
  versionId: string,
  siteId = getDefaultMediaSiteId(),
): Promise<{ media?: MediaAsset; source: 'database' | 'metadata'; version?: MediaVersionRecord }> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/media/${mediaId}/versions/${versionId}`, {
    method: 'DELETE',
  });
  const payload = await response.json() as ApiMediaVersionDeleteResponse;

  if (!response.ok || !payload.success || !payload.data?.deleted) {
    throw new Error(payload.error?.message || 'Unable to delete media version');
  }

  return {
    media: payload.data.media ? toMediaAsset(payload.data.media) : undefined,
    source: payload.data.source,
    version: payload.data.version,
  };
}

async function restoreMediaVersionUnqueued(
  mediaId: string,
  versionId: string,
  siteId = getDefaultMediaSiteId(),
): Promise<{ media: MediaAsset; source: 'database' | 'metadata'; restoredVersion?: MediaVersionRecord; retainedVersion?: MediaVersionRecord }> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/media/${mediaId}/versions/${versionId}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      restoredBy: 'admin',
      reason: 'Manual restore from media detail',
    }),
  });
  const payload = await response.json() as ApiMediaVersionRestoreResponse;

  if (!response.ok || !payload.success || !payload.data?.restored || !payload.data.media) {
    throw new Error(payload.error?.message || 'Unable to restore media version');
  }

  return {
    media: toMediaAsset(payload.data.media),
    source: payload.data.source,
    restoredVersion: payload.data.restoredVersion,
    retainedVersion: payload.data.retainedVersion,
  };
}

async function prepareMediaTransformsUnqueued(
  mediaId: string,
  input: MediaTransformPrepareInput = {},
): Promise<MediaAsset> {
  const siteId = input.siteId || getDefaultMediaSiteId();
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/media/${mediaId}/transforms`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      widths: input.widths,
      quality: input.quality,
      sizes: input.sizes,
      preparedBy: input.preparedBy,
    }),
  });
  const payload = await response.json() as ApiMediaResponse;

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to prepare media transforms');
  }

  return { ...toMediaAsset(payload.data.media), storageCleanup: payload.data.storageCleanup, completionWarnings: payload.data.completionWarnings };
}

async function deleteMediaFromBackendUnqueued(
  mediaId: string,
  siteId = getDefaultMediaSiteId(),
  override?: { allowReferencedDelete: true; reason: string; referenceFingerprint: string },
): Promise<void> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/media/${mediaId}`, {
    method: 'DELETE',
    ...(override ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(override) } : {}),
  });
  const payload = await response.json() as ApiDeleteResponse;

  if (!response.ok || !payload.success || !payload.data?.deleted) {
    if (payload.error?.details && ['MEDIA_IN_USE', 'MEDIA_REFERENCES_CHANGED'].includes(payload.error.code || '')) {
      throw new MediaDeletionConflictError(payload.error.message || 'This file is referenced by content.', payload.error.details);
    }
    throw new Error(payload.error?.message || 'Unable to delete media');
  }
}

export async function bindMediaToTarget(
  mediaId: string,
  input: MediaBindInput,
  siteId = getDefaultMediaSiteId(),
): Promise<MediaAsset> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/media/${mediaId}/bind`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await response.json() as ApiMediaBindResponse;

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to update media binding');
  }

  return toMediaAsset(payload.data.media);
}

export async function createSignedMediaUrl(
  mediaId: string,
  input: SignedMediaUrlInput = {},
  siteId = getDefaultMediaSiteId(),
): Promise<SignedMediaUrl> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/media/${mediaId}/signed-url`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await response.json() as ApiSignedMediaUrlResponse;

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to create signed media URL');
  }

  return {
    signedUrl: payload.data.signedUrl,
    path: payload.data.path,
    expiresAt: normalizeApiTimestamp(payload.data.expiresAt),
    disposition: payload.data.disposition,
  };
}

export function getPublicMediaFileUrl(mediaId: string, siteId = getDefaultMediaSiteId()): string {
  return `${getPublicApiBase()}/api/sites/${siteId}/media/${mediaId}/file`;
}

export function getPublicImageTransformUrl(
  mediaId: string,
  options: { width: number; quality?: number },
  siteId = getDefaultMediaSiteId(),
): string {
  const url = new URL(`${getPublicApiBase()}/api/sites/${siteId}/media/${mediaId}/transform`);
  url.searchParams.set('width', String(options.width));
  if (options.quality) {
    url.searchParams.set('quality', String(options.quality));
  }
  return url.toString();
}

export function uploadMedia(file: File, options: MediaUploadOptions = {}): Promise<MediaAsset> {
  const captured = { ...options, siteId: options.siteId || getDefaultMediaSiteId() };
  return queueNotifyingMediaMutation(captured.siteId, () => uploadMediaUnqueued(file, captured));
}
export function replaceMedia(mediaId: string, file: File, options: MediaReplaceOptions = {}): Promise<MediaAsset> {
  const captured = { ...options, siteId: options.siteId || getDefaultMediaSiteId() };
  return queueNotifyingMediaMutation(captured.siteId, () => replaceMediaUnqueued(mediaId, file, captured));
}
export function prepareMediaTransforms(mediaId: string, input: MediaTransformPrepareInput = {}): Promise<MediaAsset> {
  const captured = { ...input, siteId: input.siteId || getDefaultMediaSiteId() };
  return queueNotifyingMediaMutation(captured.siteId, () => prepareMediaTransformsUnqueued(mediaId, captured));
}

export interface MediaStorageRecoveryJob {
  jobId: string; siteId: string; mediaId: string | null;
  operation: 'upload' | 'replace' | 'transforms' | 'delete' | 'version-delete' | 'version-restore';
  status: 'pending' | 'settled'; plannedFiles: number; remainingFiles: number; reservedBytes: number;
  attempts: number; lastErrorCode: string | null; createdAt: string; updatedAt: string;
}
export interface MediaStorageRecoveryResult {
  jobId: string; status: 'pending' | 'settled'; deletedFiles: number; protectedFiles: number; remainingFiles: number;
}
export async function listMediaStorageRecovery(siteId: string, offset = 0): Promise<{ jobs: MediaStorageRecoveryJob[]; pagination: MediaPagination }> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/media/storage-recovery?pendingOnly=true&limit=50&offset=${offset}`, { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error?.message || 'Unable to read private storage recovery.');
  return payload.data;
}
export async function retryMediaStorageRecovery(siteId: string, jobId: string): Promise<MediaStorageRecoveryResult> {
  return queueMediaStorageMutation(siteId, async () => {
    const response = await adminFetch(`${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/media/storage-recovery/${encodeURIComponent(jobId)}`, { method: 'POST', cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error?.message || 'Unable to retry storage recovery.');
    return payload.data.storageRecovery;
  });
}

function queueNotifyingMediaMutation<T>(siteId: string, operation: () => Promise<T>): Promise<T> {
  return queueMediaStorageMutation(siteId, async () => {
    try { return await operation(); }
    finally { if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') window.dispatchEvent(new CustomEvent('backy:media-storage-changed', { detail: { siteId } })); }
  });
}
export function deleteMediaVersion(mediaId: string, versionId: string, siteId = getDefaultMediaSiteId()) {
  return queueNotifyingMediaMutation(siteId, () => deleteMediaVersionUnqueued(mediaId, versionId, siteId));
}
export function restoreMediaVersion(mediaId: string, versionId: string, siteId = getDefaultMediaSiteId()) {
  return queueNotifyingMediaMutation(siteId, () => restoreMediaVersionUnqueued(mediaId, versionId, siteId));
}
export function deleteMediaFromBackend(mediaId: string, siteId = getDefaultMediaSiteId(), override?: { allowReferencedDelete: true; reason: string; referenceFingerprint: string }) {
  return queueNotifyingMediaMutation(siteId, () => deleteMediaFromBackendUnqueued(mediaId, siteId, override));
}
