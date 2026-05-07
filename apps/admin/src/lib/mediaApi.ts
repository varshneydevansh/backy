import { formatBytes } from '@/lib/utils';
import type { MediaAsset } from '@/stores/mockStore';

type MediaScope = 'global' | 'page' | 'post';
type MediaVisibility = 'public' | 'private';

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
  altText?: string | null;
  caption?: string | null;
  tags?: string[];
  uploadedBy?: string | null;
  pageIds?: string[];
  postIds?: string[];
}

interface ApiMediaListResponse {
  success: boolean;
  data?: {
    media: ApiMediaItem[];
  };
  error?: {
    message?: string;
  };
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

export interface MediaUploadOptions {
  siteId?: string;
  scope?: MediaScope;
  scopeTargetId?: string | null;
  visibility?: MediaVisibility;
  tags?: string[];
  altText?: string;
  caption?: string;
}

export interface MediaListOptions {
  siteId?: string;
  scope?: MediaScope | 'all';
  visibility?: MediaVisibility;
  type?: 'image' | 'video' | 'audio' | 'document' | 'font' | 'other';
  pageId?: string;
  postId?: string;
  limit?: number;
}

export interface MediaUpdateInput {
  originalName?: string;
  altText?: string | null;
  caption?: string | null;
  tags?: string[];
  scope?: MediaScope;
  scopeTargetId?: string | null;
  visibility?: MediaVisibility;
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

const toAdminMediaType = (type: ApiMediaItem['type']): MediaAsset['type'] => {
  if (type === 'image' || type === 'video' || type === 'font') {
    return type;
  }

  return 'file';
};

const toMediaAsset = (item: ApiMediaItem): MediaAsset => ({
  id: item.id,
  name: item.originalName || item.filename,
  type: toAdminMediaType(item.type),
  size: formatBytes(item.sizeBytes || 0),
  url: item.url,
  altText: item.altText || null,
  caption: item.caption || null,
  tags: item.tags || [],
  scope: item.scope || 'global',
  scopeTargetId: item.scopeTargetId || null,
  visibility: item.visibility || 'public',
  uploadedBy: item.uploadedBy || 'admin',
  targetPageIds: item.pageIds || [],
  targetPostIds: item.postIds || [],
});

export async function listMedia(options: MediaListOptions = {}): Promise<MediaAsset[]> {
  const siteId = options.siteId || getDefaultMediaSiteId();
  const query = new URLSearchParams();

  if (options.scope && options.scope !== 'all') query.set('scope', options.scope);
  if (options.visibility) query.set('visibility', options.visibility);
  if (options.type) query.set('type', options.type);
  if (options.pageId) query.set('pageId', options.pageId);
  if (options.postId) query.set('postId', options.postId);
  if (options.limit) query.set('limit', `${options.limit}`);

  const response = await fetch(`${getAdminApiBase()}/sites/${siteId}/media?${query.toString()}`);
  const payload = await response.json() as ApiMediaListResponse;

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load media library');
  }

  return payload.data.media.map(toMediaAsset);
}

export async function uploadMedia(file: File, options: MediaUploadOptions = {}): Promise<MediaAsset> {
  const siteId = options.siteId || getDefaultMediaSiteId();
  const formData = new FormData();
  formData.set('file', file);
  formData.set('scope', options.scope || 'global');
  formData.set('visibility', options.visibility || 'public');

  if (options.scopeTargetId) formData.set('scopeTargetId', options.scopeTargetId);
  if (options.tags?.length) formData.set('tags', options.tags.join(','));
  if (options.altText) formData.set('altText', options.altText);
  if (options.caption) formData.set('caption', options.caption);

  const response = await fetch(`${getAdminApiBase()}/sites/${siteId}/media`, {
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
  const response = await fetch(`${getAdminApiBase()}/sites/${siteId}/media/${mediaId}`, {
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

export async function deleteMediaFromBackend(
  mediaId: string,
  siteId = getDefaultMediaSiteId(),
): Promise<void> {
  const response = await fetch(`${getAdminApiBase()}/sites/${siteId}/media/${mediaId}`, {
    method: 'DELETE',
  });
  const payload = await response.json() as ApiDeleteResponse;

  if (!response.ok || !payload.success || !payload.data?.deleted) {
    throw new Error(payload.error?.message || 'Unable to delete media');
  }
}
