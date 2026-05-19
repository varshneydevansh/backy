import { formatBytes } from '@/lib/utils';
import type { MediaAsset } from '@/stores/mockStore';

type MediaScope = 'global' | 'page' | 'post';
type MediaVisibility = 'public' | 'private';
type MediaListType = 'image' | 'video' | 'audio' | 'document' | 'file' | 'font' | 'other';

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
  uploadedBy?: string | null;
  pageIds?: string[];
  postIds?: string[];
}

interface ApiMediaListResponse {
  success: boolean;
  data?: {
    media: ApiMediaItem[];
    quota?: ApiMediaQuota;
    pagination?: MediaPagination;
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
    message?: string;
  };
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
    return 'http://localhost:3001/api/admin';
  }

  const base = envBase || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');
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
    return 'http://localhost:3001';
  }

  return (envBase || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001'))
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
  const headers = new Headers(init.headers);

  if (apiKey && !headers.has('x-backy-admin-key') && !headers.has('authorization')) {
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

const toApiMediaListType = (type: MediaListType): ApiMediaItem['type'] => (
  type === 'file' ? 'document' : type
);

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
  folderId: item.folderId || null,
  scope: item.scope || 'global',
  scopeTargetId: item.scopeTargetId || null,
  visibility: item.visibility || 'public',
  uploadedBy: item.uploadedBy || 'admin',
  targetPageIds: item.pageIds || [],
  targetPostIds: item.postIds || [],
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

  if (options.scope && options.scope !== 'all') query.set('scope', options.scope);
  if (options.visibility) query.set('visibility', options.visibility);
  if (options.type) query.set('type', toApiMediaListType(options.type));
  if (options.search) query.set('search', options.search);
  if (options.tag) query.set('tag', options.tag);
  if (options.folderId !== undefined) query.set('folderId', options.folderId || '');
  if (options.pageId) query.set('pageId', options.pageId);
  if (options.postId) query.set('postId', options.postId);
  if (options.limit) query.set('limit', `${options.limit}`);
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

export async function uploadMedia(file: File, options: MediaUploadOptions = {}): Promise<MediaAsset> {
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

  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/media`, {
    method: 'POST',
    body: formData,
  });
  const payload = await response.json() as ApiUploadResponse;

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to upload media');
  }

  return toMediaAsset(payload.data.media);
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

export async function replaceMedia(
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

  return toMediaAsset(payload.data.media);
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

export async function deleteMediaVersion(
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

export async function restoreMediaVersion(
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

export async function prepareMediaTransforms(
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

  return toMediaAsset(payload.data.media);
}

export async function deleteMediaFromBackend(
  mediaId: string,
  siteId = getDefaultMediaSiteId(),
): Promise<void> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/media/${mediaId}`, {
    method: 'DELETE',
  });
  const payload = await response.json() as ApiDeleteResponse;

  if (!response.ok || !payload.success || !payload.data?.deleted) {
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
