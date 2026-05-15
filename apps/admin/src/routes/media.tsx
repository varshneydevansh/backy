/**
 * BACKY CMS - MEDIA PAGE
 */

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { AlertTriangle, CheckCircle2, CheckSquare, Cloud, Code2, Copy, Download, Edit3, ExternalLink, File, FileText, Folder, FolderPlus, Image as ImageIcon, KeyRound, Layout, Music, RefreshCw, Save, Trash2, Type, Upload, Video, X } from 'lucide-react';
import { PageShell } from '@/components/layout/PageShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DEFAULT_MAX_TAGS, normalizeTagValues, parseTagInput, serializeTagValues, TagInput } from '@/components/ui/TagInput';
import {
  getSettings,
  getUserPermissions,
  listAdminAuditLogs,
  listBlogPosts,
  listPages,
  updateSettings as updateBackendSettings,
  runSettingsStorageProvisioningProbe,
  validateSettingsInfrastructure,
  type AdminAuditLog,
  type AdminUserPermissionMatrix,
  type SiteSettingsInput,
  type SettingsInfrastructureDiagnostic,
  type SettingsStorageProvisioningResult,
} from '@/lib/adminContentApi';
import {
  bindMediaToTarget,
  createSignedMediaUrl,
  createMediaFolder,
  deleteMediaFolder,
  deleteMediaFromBackend,
  deleteMediaVersion,
  getDefaultMediaSiteId,
  getPublicImageTransformUrl,
  getPublicMediaFileUrl,
  ingestMediaProviderAnalytics,
  listMediaLibrary,
  listMediaFolders,
  listMediaVersions,
  prepareMediaTransforms,
  replaceMedia,
  restoreMediaVersion,
  updateMediaFolder,
  updateMedia,
  uploadMedia,
  type MediaListOptions,
  type MediaQuota,
  type MediaFolder,
  type MediaPagination,
  type MediaVersionRecord,
  type SignedMediaUrl,
} from '@/lib/mediaApi';
import { getSiteSelectionFromSearch, siteMatchesIdentifier } from '@/lib/siteSelection';
import { cn, formatBytes } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useStore, type MediaAsset } from '@/stores/mockStore';

type MediaTypeFilter = 'all' | MediaAsset['type'];
type MediaVisibilityFilter = 'all' | 'public' | 'private';
type MediaUsageFilter = 'all' | 'unused' | 'referenced' | 'replaced' | 'quarantined';
type MediaAuditActionFilter = 'all' | 'create' | 'update' | 'media.replace' | 'media.version.restore' | 'media.version.delete' | 'media.transforms.prepare' | 'media.provider-analytics.ingest' | 'media.bind' | 'media.unbind' | 'delete';
type MediaBulkSafetyAction = 'keep' | 'quarantine' | 'release';
type MediaUploadMode = 'all' | 'image' | 'font' | 'file';
type MediaUsageMetric = {
  label: string;
  value: number;
  detail: string;
  filter: MediaUsageFilter;
  visibility?: MediaVisibilityFilter;
};
type MediaIntegrationSettings = NonNullable<SiteSettingsInput['integrations']>;
type MediaStorageSettings = NonNullable<MediaIntegrationSettings['storage']>;
type MediaSupabaseSettings = NonNullable<MediaIntegrationSettings['supabase']>;
type MediaImageObjectFit = 'cover' | 'contain';
type MediaImageAspectRatio = 'original' | '1:1' | '4:3' | '3:4' | '16:9' | '9:16';

interface MediaSearch {
  siteId?: string;
  assetId?: string;
  folderId?: string;
  q?: string;
  tag?: string;
  type?: MediaTypeFilter;
  visibility?: MediaVisibilityFilter;
  usage?: MediaUsageFilter;
}

interface MediaLibraryLoadOptions {
  mode?: 'replace' | 'append' | 'all';
  offset?: number;
}

const MEDIA_TYPE_FILTERS: MediaTypeFilter[] = ['all', 'image', 'video', 'audio', 'file', 'font', 'other'];
const MEDIA_VISIBILITY_FILTERS: MediaVisibilityFilter[] = ['all', 'public', 'private'];
const MEDIA_USAGE_FILTERS: MediaUsageFilter[] = ['all', 'unused', 'referenced', 'replaced', 'quarantined'];
const MEDIA_AUDIT_ACTION_FILTERS: Array<{ value: MediaAuditActionFilter; label: string }> = [
  { value: 'all', label: 'All activity' },
  { value: 'create', label: 'Uploads' },
  { value: 'update', label: 'Metadata edits' },
  { value: 'media.replace', label: 'Replacements' },
  { value: 'media.version.restore', label: 'Version restores' },
  { value: 'media.version.delete', label: 'Version deletes' },
  { value: 'media.transforms.prepare', label: 'Transforms' },
  { value: 'media.provider-analytics.ingest', label: 'Provider analytics' },
  { value: 'media.bind', label: 'Bindings' },
  { value: 'media.unbind', label: 'Unbindings' },
  { value: 'delete', label: 'Deletes' },
];
const MEDIA_AUDIT_PAGE_SIZE = 12;
const MEDIA_LIBRARY_PAGE_SIZE = 100;
const MEDIA_UPLOAD_MODES: Array<{
  value: MediaUploadMode;
  label: string;
  detail: string;
  accept?: string;
}> = [
  {
    value: 'all',
    label: 'All files',
    detail: 'Images, video, audio, fonts, documents, and custom files.',
  },
  {
    value: 'image',
    label: 'Images',
    detail: 'Raster and vector image assets for pages, products, and posts.',
    accept: 'image/*',
  },
  {
    value: 'font',
    label: 'Fonts',
    detail: 'Typography files registered for editor font controls and manifests.',
    accept: '.woff,.woff2,.ttf,.otf,.eot,font/*,application/font-woff,application/font-woff2,application/vnd.ms-fontobject',
  },
  {
    value: 'file',
    label: 'Files',
    detail: 'Documents, data files, archives, and private downloads.',
    accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.json,.zip,.rar,application/pdf,text/*,application/json,application/zip',
  },
];
const MEDIA_IMAGE_OBJECT_FIT_OPTIONS: MediaImageObjectFit[] = ['cover', 'contain'];
const MEDIA_IMAGE_ASPECT_RATIO_OPTIONS: Array<{ value: MediaImageAspectRatio; label: string; cssValue: string }> = [
  { value: 'original', label: 'Original', cssValue: '1 / 1' },
  { value: '1:1', label: 'Square', cssValue: '1 / 1' },
  { value: '4:3', label: 'Landscape 4:3', cssValue: '4 / 3' },
  { value: '3:4', label: 'Portrait 3:4', cssValue: '3 / 4' },
  { value: '16:9', label: 'Wide 16:9', cssValue: '16 / 9' },
  { value: '9:16', label: 'Story 9:16', cssValue: '9 / 16' },
];
const DEFAULT_IMAGE_PRESENTATION = {
  focalX: 50,
  focalY: 50,
  objectFit: 'cover' as MediaImageObjectFit,
  aspectRatio: 'original' as MediaImageAspectRatio,
};

const DEFAULT_MEDIA_SCANNER_RUNTIME: NonNullable<SiteSettingsInput['runtimeMediaScanner']> = {
  provider: 'none',
  enabled: false,
  configured: true,
  endpointConfigured: false,
  host: undefined,
  port: undefined,
  apiKeyConfigured: false,
  timeoutMs: 5000,
  failOpen: false,
  missing: [],
};

type MediaStorageProvider = 'local' | 'supabase' | 's3';

interface MediaStorageEnvField {
  name: string;
  env: string[];
  required: boolean;
  secret?: boolean;
  detail: string;
}

interface MediaScannerEnvField {
  name: string;
  env: string[];
  required: boolean;
  secret?: boolean;
  detail: string;
}

const MEDIA_STORAGE_ENV_CONTRACT: Record<MediaStorageProvider, MediaStorageEnvField[]> = {
  local: [
    {
      name: 'basePath',
      env: ['BACKY_LOCAL_UPLOADS_DIR', 'BACKY_STORAGE_LOCAL_PATH'],
      required: false,
      detail: 'Overrides the local upload directory. Defaults to public/uploads.',
    },
    {
      name: 'publicUrl',
      env: ['BACKY_LOCAL_PUBLIC_URL', 'BACKY_MEDIA_PUBLIC_URL'],
      required: false,
      detail: 'Public base URL for locally served upload files.',
    },
  ],
  supabase: [
    {
      name: 'url',
      env: ['BACKY_SUPABASE_URL', 'SUPABASE_URL'],
      required: true,
      detail: 'Supabase project URL used by the storage adapter.',
    },
    {
      name: 'key',
      env: [
        'BACKY_SUPABASE_SERVICE_ROLE_KEY',
        'BACKY_SUPABASE_ANON_KEY',
        'SUPABASE_SERVICE_ROLE_KEY',
        'SUPABASE_ANON_KEY',
      ],
      required: true,
      secret: true,
      detail: 'Server-side key used for upload, read, delete, and signing operations.',
    },
    {
      name: 'bucket',
      env: ['BACKY_SUPABASE_STORAGE_BUCKET', 'BACKY_STORAGE_BUCKET'],
      required: true,
      detail: 'Storage bucket for media objects.',
    },
  ],
  s3: [
    {
      name: 'bucket',
      env: ['BACKY_S3_BUCKET', 'BACKY_STORAGE_BUCKET'],
      required: true,
      detail: 'S3/R2-compatible bucket for media objects.',
    },
    {
      name: 'region',
      env: ['BACKY_S3_REGION', 'AWS_REGION'],
      required: true,
      detail: 'Provider region. R2-compatible providers may use a stable placeholder.',
    },
    {
      name: 'accessKeyId',
      env: ['BACKY_S3_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID'],
      required: true,
      secret: true,
      detail: 'Access key with media bucket read/write permissions.',
    },
    {
      name: 'secretAccessKey',
      env: ['BACKY_S3_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY'],
      required: true,
      secret: true,
      detail: 'Secret access key for the configured storage account.',
    },
    {
      name: 'endpoint',
      env: ['BACKY_S3_ENDPOINT', 'BACKY_STORAGE_ENDPOINT'],
      required: false,
      detail: 'Custom endpoint for R2, MinIO, or non-AWS S3-compatible storage.',
    },
    {
      name: 'publicUrl',
      env: ['BACKY_S3_PUBLIC_URL', 'BACKY_MEDIA_PUBLIC_URL'],
      required: false,
      detail: 'Direct public CDN/storage base URL for public assets.',
    },
    {
      name: 'forcePathStyle',
      env: ['BACKY_S3_FORCE_PATH_STYLE'],
      required: false,
      detail: 'Set true for providers that require path-style bucket URLs.',
    },
  ],
};

const MEDIA_SCANNER_ENV_CONTRACT: MediaScannerEnvField[] = [
  {
    name: 'provider',
    env: ['BACKY_MEDIA_SCAN_PROVIDER', 'BACKY_MEDIA_SCANNER_PROVIDER'],
    required: false,
    detail: 'Set to http or clamav to scan uploads and replacements before storage. Defaults to none.',
  },
  {
    name: 'endpoint',
    env: ['BACKY_MEDIA_SCAN_ENDPOINT', 'BACKY_MEDIA_SCANNER_ENDPOINT'],
    required: false,
    detail: 'HTTP scanner endpoint that receives raw media bytes and returns a clean verdict JSON payload.',
  },
  {
    name: 'clamdHost',
    env: ['BACKY_MEDIA_SCAN_HOST', 'BACKY_MEDIA_SCANNER_HOST', 'BACKY_CLAMAV_HOST', 'CLAMD_HOST'],
    required: false,
    detail: 'ClamAV clamd host for the built-in INSTREAM adapter. Defaults to 127.0.0.1.',
  },
  {
    name: 'clamdPort',
    env: ['BACKY_MEDIA_SCAN_PORT', 'BACKY_MEDIA_SCANNER_PORT', 'BACKY_CLAMAV_PORT', 'CLAMD_PORT'],
    required: false,
    detail: 'ClamAV clamd TCP port for INSTREAM scans. Defaults to 3310.',
  },
  {
    name: 'apiKey',
    env: ['BACKY_MEDIA_SCAN_API_KEY', 'BACKY_MEDIA_SCANNER_API_KEY'],
    required: false,
    secret: true,
    detail: 'Optional bearer token sent only from the server to the scanner endpoint.',
  },
  {
    name: 'timeoutMs',
    env: ['BACKY_MEDIA_SCAN_TIMEOUT_MS', 'BACKY_MEDIA_SCANNER_TIMEOUT_MS'],
    required: false,
    detail: 'Positive request timeout in milliseconds. Defaults to 5000.',
  },
  {
    name: 'failOpen',
    env: ['BACKY_MEDIA_SCAN_FAIL_OPEN', 'BACKY_MEDIA_SCANNER_FAIL_OPEN'],
    required: false,
    detail: 'Allows scanner availability failures to pass, but provider-rejected files still block.',
  },
];

const MEDIA_UPLOAD_INTAKE_RULES = [
  {
    label: 'Images',
    detail: 'Responsive delivery and transform URLs.',
    examples: 'png, jpg, webp, svg',
  },
  {
    label: 'Video/audio',
    detail: 'Playable media for pages, posts, and products.',
    examples: 'mp4, mov, mp3, wav',
  },
  {
    label: 'Documents',
    detail: 'Downloads, manuals, PDFs, and private files.',
    examples: 'pdf, docx, csv, txt',
  },
  {
    label: 'Fonts',
    detail: 'Registered for editor typography and font manifests.',
    examples: 'woff2, woff, ttf, otf',
  },
  {
    label: 'Other files',
    detail: 'Stored with metadata and delivery controls intact.',
    examples: 'zip, json, custom',
  },
] as const;

const isMediaTypeFilter = (value: unknown): value is MediaTypeFilter => (
  typeof value === 'string' && MEDIA_TYPE_FILTERS.includes(value as MediaTypeFilter)
);

const isMediaVisibilityFilter = (value: unknown): value is MediaVisibilityFilter => (
  typeof value === 'string' && MEDIA_VISIBILITY_FILTERS.includes(value as MediaVisibilityFilter)
);

const isMediaUsageFilter = (value: unknown): value is MediaUsageFilter => (
  typeof value === 'string' && MEDIA_USAGE_FILTERS.includes(value as MediaUsageFilter)
);

const isMediaImageObjectFit = (value: unknown): value is MediaImageObjectFit => (
  typeof value === 'string' && MEDIA_IMAGE_OBJECT_FIT_OPTIONS.includes(value as MediaImageObjectFit)
);

const isMediaImageAspectRatio = (value: unknown): value is MediaImageAspectRatio => (
  typeof value === 'string' && MEDIA_IMAGE_ASPECT_RATIO_OPTIONS.some((option) => option.value === value)
);

const clampPercent = (value: unknown, fallback = 50): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
};

const getImagePresentationMetadata = (metadata: Record<string, unknown> | undefined) => {
  const presentation = metadata?.imagePresentation;
  const record = presentation && typeof presentation === 'object' && !Array.isArray(presentation)
    ? presentation as Record<string, unknown>
    : {};
  const focalPoint = record.focalPoint && typeof record.focalPoint === 'object' && !Array.isArray(record.focalPoint)
    ? record.focalPoint as Record<string, unknown>
    : {};

  return {
    focalX: clampPercent(focalPoint.x, DEFAULT_IMAGE_PRESENTATION.focalX),
    focalY: clampPercent(focalPoint.y, DEFAULT_IMAGE_PRESENTATION.focalY),
    objectFit: isMediaImageObjectFit(record.objectFit)
      ? record.objectFit
      : DEFAULT_IMAGE_PRESENTATION.objectFit,
    aspectRatio: isMediaImageAspectRatio(record.aspectRatio)
      ? record.aspectRatio
      : DEFAULT_IMAGE_PRESENTATION.aspectRatio,
  };
};

const getImageAspectRatioCssValue = (aspectRatio: MediaImageAspectRatio): string => (
  MEDIA_IMAGE_ASPECT_RATIO_OPTIONS.find((option) => option.value === aspectRatio)?.cssValue || '1 / 1'
);

const normalizedSearchString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const folderSelectionFromRoute = (folderId?: string): string | null | undefined => {
  if (!folderId) return undefined;
  return folderId === 'root' ? null : folderId;
};

const folderSelectionToRoute = (folderId: string | null | undefined): string | undefined => {
  if (folderId === null) return 'root';
  return typeof folderId === 'string' ? folderId : undefined;
};

export const Route = createFileRoute('/media')({
  validateSearch: (search: Record<string, unknown>): MediaSearch => ({
    siteId: normalizedSearchString(search.siteId),
    assetId: normalizedSearchString(search.assetId),
    folderId: normalizedSearchString(search.folderId),
    q: normalizedSearchString(search.q),
    tag: normalizedSearchString(search.tag),
    type: isMediaTypeFilter(search.type) ? search.type : undefined,
    visibility: isMediaVisibilityFilter(search.visibility) ? search.visibility : undefined,
    usage: isMediaUsageFilter(search.usage) ? search.usage : undefined,
  }),
  component: MediaPage,
});

const MEDIA_CONTROL_AREAS = [
  {
    title: 'Upload intake',
    detail: 'Drag, drop, choose visibility, folder destination, and default tags.',
    href: '#media-upload',
  },
  {
    title: 'Frontend API',
    detail: 'Public list, detail, file delivery, transforms, and admin upload endpoints.',
    href: '#media-api',
  },
  {
    title: 'Storage health',
    detail: 'Runtime provider, quota, missing config, and delivery base path.',
    href: '#media-storage',
  },
  {
    title: 'Folders',
    detail: 'Create, rename, delete, and filter folders without breaking asset references.',
    href: '#media-folders',
  },
  {
    title: 'Bulk controls',
    detail: 'Move, tag, reclassify visibility, select visible assets, and delete in batches.',
    href: '#media-bulk',
  },
  {
    title: 'Font delivery',
    detail: 'Group uploaded fonts by family, variants, fallback, display, and visibility.',
    href: '#media-fonts',
  },
] as const;

const MEDIA_USAGE_SURFACES = [
  {
    title: 'Page editor',
    detail: 'Use uploaded images, files, icons, and fonts while designing pages on the canvas.',
    route: '/pages',
  },
  {
    title: 'Blog editor',
    detail: 'Attach covers, inline media, downloads, and author assets to editorial posts.',
    route: '/blog',
  },
  {
    title: 'Products',
    detail: 'Use product imagery, digital downloads, manuals, and storefront media from one library.',
    route: '/products',
  },
  {
    title: 'Storage settings',
    detail: 'Review local, S3, or Supabase storage runtime before relying on production uploads.',
    route: '/settings',
  },
] as const;

const MEDIA_EXPORT_COLUMNS = [
  'asset_id',
  'name',
  'type',
  'mime_type',
  'size',
  'size_bytes',
  'visibility',
  'folder_id',
  'folder_name',
  'tags',
  'alt_text',
  'caption',
  'public_file_url',
  'transform_url',
  'referenced_pages',
  'referenced_posts',
  'font_family',
  'font_weight',
  'font_style',
  'font_display',
  'created_at',
  'updated_at',
] as const;

interface MediaUploadSummary {
  attempted: number;
  uploaded: number;
  failed: number;
  fontsRegistered: number;
  folderLabel: string;
  visibility: 'public' | 'private';
  assets: Array<{ id: string; name: string; type: MediaAsset['type']; size: string }>;
  failures: string[];
  completedAt: string;
}

type MediaFolderTreeOption = MediaFolder & {
  depth: number;
  label: string;
  path: string;
};

const buildMediaFolderOptions = (folders: MediaFolder[]): MediaFolderTreeOption[] => {
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const childrenByParent = new Map<string | null, MediaFolder[]>();
  const sortedFolders = [...folders].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  sortedFolders.forEach((folder) => {
    const parentId = folder.parentId && folderById.has(folder.parentId) ? folder.parentId : null;
    const siblings = childrenByParent.get(parentId) || [];
    siblings.push(folder);
    childrenByParent.set(parentId, siblings);
  });

  const options: MediaFolderTreeOption[] = [];
  const visited = new Set<string>();

  const walk = (folder: MediaFolder, depth: number, parentPath: string[], ancestors: Set<string>) => {
    if (visited.has(folder.id) || ancestors.has(folder.id)) {
      return;
    }

    visited.add(folder.id);
    const pathParts = [...parentPath, folder.name];
    options.push({
      ...folder,
      depth,
      label: `${'-- '.repeat(depth)}${folder.name}`,
      path: pathParts.join(' / '),
    });

    const nextAncestors = new Set(ancestors);
    nextAncestors.add(folder.id);
    (childrenByParent.get(folder.id) || []).forEach((child) => walk(child, depth + 1, pathParts, nextAncestors));
  };

  (childrenByParent.get(null) || []).forEach((folder) => walk(folder, 0, [], new Set()));
  sortedFolders
    .filter((folder) => !visited.has(folder.id))
    .forEach((folder) => walk(folder, 0, [], new Set()));

  return options;
};

const getMediaFolderDescendantIds = (folders: MediaFolder[], folderId: string): Set<string> => {
  const descendants = new Set<string>();
  const pending = folders
    .filter((folder) => folder.parentId === folderId)
    .map((folder) => folder.id);

  while (pending.length > 0) {
    const currentId = pending.pop();
    if (!currentId || descendants.has(currentId)) {
      continue;
    }

    descendants.add(currentId);
    folders
      .filter((folder) => folder.parentId === currentId)
      .forEach((folder) => pending.push(folder.id));
  }

  return descendants;
};

const getMediaFolderAncestorIds = (folders: MediaFolder[], folderId: string): string[] => {
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const ancestors: string[] = [];
  const visited = new Set<string>();
  let current = folderById.get(folderId);

  while (current?.parentId && folderById.has(current.parentId) && !visited.has(current.parentId)) {
    visited.add(current.parentId);
    ancestors.push(current.parentId);
    current = folderById.get(current.parentId);
  }

  return ancestors;
};

const getUploadFileExtension = (file: File): string => file.name.split('.').pop()?.toLowerCase() || '';

const isUploadFontFile = (file: File): boolean => (
  file.type.includes('font') ||
  file.type === 'application/vnd.ms-fontobject' ||
  ['woff', 'woff2', 'ttf', 'otf', 'eot'].includes(getUploadFileExtension(file))
);

const isUploadDocumentFile = (file: File): boolean => (
  file.type === 'application/pdf' ||
  ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'].includes(getUploadFileExtension(file))
);

const getCentralUploadType = (file: File): MediaAsset['type'] => {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (isUploadFontFile(file)) return 'font';
  if (isUploadDocumentFile(file)) return 'file';
  return 'other';
};

const isFileAllowedForUploadMode = (file: File, mode: MediaUploadMode): boolean => {
  if (mode === 'all') return true;
  const uploadType = getCentralUploadType(file);
  if (mode === 'file') return uploadType === 'file' || uploadType === 'other';
  return uploadType === mode;
};

const uploadModeRejectMessage = (file: File, mode: MediaUploadMode): string => {
  const label = MEDIA_UPLOAD_MODES.find((item) => item.value === mode)?.label || mode;
  return `${file.name} skipped because ${label} upload mode is selected.`;
};

const cleanFontFamilyFromFilename = (name: string): string => (
  name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b(regular|normal|bold|italic|black|light|medium|semibold|extrabold|thin|variable)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || name.replace(/\.[a-z0-9]+$/i, '')
);

const buildSupabaseStoragePublicBaseUrl = (projectUrl?: string, bucket?: string): string => {
  const trimmedUrl = projectUrl?.trim().replace(/\/+$/, '');
  const trimmedBucket = bucket?.trim();
  if (!trimmedUrl || !trimmedBucket) return '';
  return `${trimmedUrl}/storage/v1/object/public/${trimmedBucket}`;
};

function MediaPage() {
  const navigate = useNavigate();
  const routeSearch = Route.useSearch();
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);
  const [isCreatingSignedUrl, setIsCreatingSignedUrl] = useState(false);
  const [isUpdatingBinding, setIsUpdatingBinding] = useState(false);
  const [isReplacingAsset, setIsReplacingAsset] = useState(false);
  const [isRestoringAssetVersion, setIsRestoringAssetVersion] = useState(false);
  const [isDeletingAssetVersion, setIsDeletingAssetVersion] = useState(false);
  const [isPreparingTransforms, setIsPreparingTransforms] = useState(false);
  const [isSavingProviderAnalytics, setIsSavingProviderAnalytics] = useState(false);
  const [isUpdatingSafety, setIsUpdatingSafety] = useState(false);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [isDeletingAsset, setIsDeletingAsset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const [assetDeliveryError, setAssetDeliveryError] = useState<string | null>(null);
  const [assetProviderAnalyticsNotice, setAssetProviderAnalyticsNotice] = useState<string | null>(null);
  const [assetReferenceError, setAssetReferenceError] = useState<string | null>(null);
  const [assetReplacementError, setAssetReplacementError] = useState<string | null>(null);
  const [assetVersionRecords, setAssetVersionRecords] = useState<MediaVersionRecord[]>([]);
  const [assetVersionSource, setAssetVersionSource] = useState<'database' | 'metadata' | null>(null);
  const [isLoadingAssetVersions, setIsLoadingAssetVersions] = useState(false);
  const [assetAuditLogs, setAssetAuditLogs] = useState<AdminAuditLog[]>([]);
  const [isLoadingAssetAudit, setIsLoadingAssetAudit] = useState(false);
  const [assetAuditError, setAssetAuditError] = useState<string | null>(null);
  const [assetAuditActionFilter, setAssetAuditActionFilter] = useState<MediaAuditActionFilter>('all');
  const [libraryAuditLogs, setLibraryAuditLogs] = useState<AdminAuditLog[]>([]);
  const [libraryAuditPagination, setLibraryAuditPagination] = useState({ total: 0, limit: MEDIA_AUDIT_PAGE_SIZE, offset: 0, hasMore: false });
  const [isLoadingLibraryAudit, setIsLoadingLibraryAudit] = useState(false);
  const [libraryAuditError, setLibraryAuditError] = useState<string | null>(null);
  const [libraryAuditActionFilter, setLibraryAuditActionFilter] = useState<MediaAuditActionFilter>('all');
  const [signedUrl, setSignedUrl] = useState<SignedMediaUrl | null>(null);
  const [fontPreviewUrl, setFontPreviewUrl] = useState('');
  const [fontPreviewError, setFontPreviewError] = useState<string | null>(null);
  const [isLoadingFontPreview, setIsLoadingFontPreview] = useState(false);
  const [mediaQuota, setMediaQuota] = useState<MediaQuota | undefined>();
  const [mediaPagination, setMediaPagination] = useState<MediaPagination>({
    total: 0,
    limit: MEDIA_LIBRARY_PAGE_SIZE,
    offset: 0,
    hasMore: false,
  });
  const [runtimeStorage, setRuntimeStorage] = useState<SiteSettingsInput['runtimeStorage']>();
  const [runtimeSupabase, setRuntimeSupabase] = useState<SiteSettingsInput['runtimeSupabase']>();
  const [runtimeMediaScanner, setRuntimeMediaScanner] = useState<SiteSettingsInput['runtimeMediaScanner']>();
  const [settingsDeliveryMode, setSettingsDeliveryMode] = useState<SiteSettingsInput['deliveryMode']>();
  const [settingsIntegrations, setSettingsIntegrations] = useState<MediaIntegrationSettings | undefined>();
  const [settingsInfrastructureInput, setSettingsInfrastructureInput] = useState<Pick<SiteSettingsInput, 'deliveryMode' | 'integrations'> | null>(null);
  const [storageDiagnostics, setStorageDiagnostics] = useState<SettingsInfrastructureDiagnostic[] | null>(null);
  const [storageProvisioningResult, setStorageProvisioningResult] = useState<SettingsStorageProvisioningResult | null>(null);
  const [isCheckingStorage, setIsCheckingStorage] = useState(false);
  const [isRunningStorageProvisioningProbe, setIsRunningStorageProvisioningProbe] = useState(false);
  const [isSavingStorageSettings, setIsSavingStorageSettings] = useState(false);
  const [storageCheckError, setStorageCheckError] = useState<string | null>(null);
  const [storageSettingsNotice, setStorageSettingsNotice] = useState<string | null>(null);
  const [signedUrlSeconds, setSignedUrlSeconds] = useState(900);
  const [signedUrlDisposition, setSignedUrlDisposition] = useState<'inline' | 'attachment'>('inline');
  const [transformWidth, setTransformWidth] = useState(1200);
  const [transformQuality, setTransformQuality] = useState(75);
  const [providerAnalyticsRequests, setProviderAnalyticsRequests] = useState('');
  const [providerAnalyticsBytes, setProviderAnalyticsBytes] = useState('');
  const [providerAnalyticsConversions, setProviderAnalyticsConversions] = useState('');
  const [providerAnalyticsValue, setProviderAnalyticsValue] = useState('');
  const [providerAnalyticsCurrency, setProviderAnalyticsCurrency] = useState('USD');
  const [providerAnalyticsAttributionWindow, setProviderAnalyticsAttributionWindow] = useState('last-click');
  const [providerAnalyticsSource, setProviderAnalyticsSource] = useState('provider-console');
  const [providerAnalyticsWindow, setProviderAnalyticsWindow] = useState('last-30-days');
  const [bindingTargetType, setBindingTargetType] = useState<'page' | 'post'>('page');
  const [bindingTargetId, setBindingTargetId] = useState('');
  const [bindingUsageType, setBindingUsageType] = useState<'content' | 'background' | 'thumbnail' | 'cover' | 'avatar' | 'document' | 'icon' | 'other'>('content');
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [bulkVisibility, setBulkVisibility] = useState<'keep' | 'public' | 'private'>('keep');
  const [bulkFolderId, setBulkFolderId] = useState<'keep' | 'root' | string>('keep');
  const [bulkSafetyAction, setBulkSafetyAction] = useState<MediaBulkSafetyAction>('keep');
  const [bulkTagMode, setBulkTagMode] = useState<'keep' | 'merge' | 'replace' | 'clear'>('keep');
  const [bulkTags, setBulkTags] = useState('');
  const [pendingDeleteAsset, setPendingDeleteAsset] = useState<MediaAsset | null>(null);
  const [pendingRestoreVersionId, setPendingRestoreVersionId] = useState<string | null>(null);
  const [pendingDeleteVersionId, setPendingDeleteVersionId] = useState<string | null>(null);
  const [comparisonVersionId, setComparisonVersionId] = useState<string | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [pendingDeleteFolder, setPendingDeleteFolder] = useState<MediaFolder | null>(null);
  const [searchQuery, setSearchQuery] = useState(routeSearch.q || '');
  const [tagFilter, setTagFilter] = useState(routeSearch.tag || '');
  const [typeFilter, setTypeFilter] = useState<MediaTypeFilter>(routeSearch.type || 'all');
  const [visibilityFilter, setVisibilityFilter] = useState<MediaVisibilityFilter>(routeSearch.visibility || 'all');
  const [usageFilter, setUsageFilter] = useState<MediaUsageFilter>(routeSearch.usage || 'all');
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [editingFolderParentId, setEditingFolderParentId] = useState<'root' | string>('root');
  const [isUpdatingFolder, setIsUpdatingFolder] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null | undefined>(() => folderSelectionFromRoute(routeSearch.folderId));
  const [uploadVisibility, setUploadVisibility] = useState<'public' | 'private'>('public');
  const [uploadFolderId, setUploadFolderId] = useState<'current' | 'root' | string>('current');
  const [uploadMode, setUploadMode] = useState<MediaUploadMode>('all');
  const [uploadTags, setUploadTags] = useState('');
  const [recentUploadSummary, setRecentUploadSummary] = useState<MediaUploadSummary | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<'root' | string>('root');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const suppressedRouteAssetIdRef = useRef<string | null>(null);
  const [metadataForm, setMetadataForm] = useState({
    name: '',
    altText: '',
    caption: '',
    tags: '',
    fontFamily: '',
    fontWeight: '400',
    fontStyle: 'normal' as 'normal' | 'italic' | 'oblique',
    fontFallback: 'system-ui, sans-serif',
    fontDisplay: 'swap' as 'auto' | 'block' | 'swap' | 'fallback' | 'optional',
    imageFocalX: DEFAULT_IMAGE_PRESENTATION.focalX,
    imageFocalY: DEFAULT_IMAGE_PRESENTATION.focalY,
    imageObjectFit: DEFAULT_IMAGE_PRESENTATION.objectFit,
    imageAspectRatio: DEFAULT_IMAGE_PRESENTATION.aspectRatio,
    folderId: '',
    visibility: 'public' as 'public' | 'private',
  });
  const sites = useStore((state) => state.sites);
  const currentAdmin = useAuthStore((state) => state.user);
  const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const files = useStore((state) => state.media);
  const pages = useStore((state) => state.pages);
  const posts = useStore((state) => state.posts);
  const setMedia = useStore((state) => state.setMedia);
  const setPages = useStore((state) => state.setPages);
  const setPosts = useStore((state) => state.setPosts);
  const deleteMedia = useStore((state) => state.deleteMedia);
  const [selectedSiteId, setSelectedSiteId] = useState(() => routeSearch.siteId || getSiteSelectionFromSearch(sites, getDefaultMediaSiteId()));
  const filesRef = useRef<MediaAsset[]>(files);
  const mediaPaginationRef = useRef<MediaPagination>(mediaPagination);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  useEffect(() => {
    mediaPaginationRef.current = mediaPagination;
  }, [mediaPagination]);

  useEffect(() => {
    let cancelled = false;

    if (!currentAdmin?.id) {
      setPermissionMatrix(null);
      setPermissionError('Sign in with an admin account to load media permissions.');
      setIsPermissionsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsPermissionsLoading(true);
    setPermissionError(null);
    getUserPermissions(currentAdmin.id)
      .then((matrix) => {
        if (!cancelled) {
          setPermissionMatrix(matrix);
        }
      })
      .catch((permissionLoadError) => {
        if (!cancelled) {
          setPermissionMatrix(null);
          setPermissionError(permissionLoadError instanceof Error
            ? permissionLoadError.message
            : 'Unable to load media permissions.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsPermissionsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentAdmin?.id]);

  const activeSite = useMemo(
    () => sites.find((site) => siteMatchesIdentifier(site, selectedSiteId)) || sites[0],
    [selectedSiteId, sites],
  );
  const siteId = activeSite?.publicSiteId || activeSite?.id || selectedSiteId || getDefaultMediaSiteId();
  const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix;
  const canViewMedia = !isPermissionMatrixPending && isMediaPermissionAllowed(permissionMatrix, currentAdmin, 'media.view');
  const canCreateMedia = canViewMedia && isMediaPermissionAllowed(permissionMatrix, currentAdmin, 'media.create');
  const canEditMedia = canViewMedia && isMediaPermissionAllowed(permissionMatrix, currentAdmin, 'media.edit');
  const canConfigureMediaStorage = !isPermissionMatrixPending && isMediaPermissionAllowed(permissionMatrix, currentAdmin, 'media.configure');
  const canDeleteMedia = canViewMedia && isMediaPermissionAllowed(permissionMatrix, currentAdmin, 'media.delete');
  const canExportMediaActivity = canViewMedia && isMediaPermissionAllowed(permissionMatrix, currentAdmin, 'activity.export');
  const canBulkSelectMedia = canEditMedia || canDeleteMedia;
  const viewPermissionTitle = canViewMedia ? undefined : mediaPermissionReason(permissionMatrix, currentAdmin, 'media.view');
  const createPermissionTitle = canCreateMedia ? undefined : !canViewMedia ? viewPermissionTitle : mediaPermissionReason(permissionMatrix, currentAdmin, 'media.create');
  const editPermissionTitle = canEditMedia ? undefined : !canViewMedia ? viewPermissionTitle : mediaPermissionReason(permissionMatrix, currentAdmin, 'media.edit');
  const configurePermissionTitle = canConfigureMediaStorage ? undefined : mediaPermissionReason(permissionMatrix, currentAdmin, 'media.configure');
  const deletePermissionTitle = canDeleteMedia ? undefined : !canViewMedia ? viewPermissionTitle : mediaPermissionReason(permissionMatrix, currentAdmin, 'media.delete');
  const activityPermissionTitle = canExportMediaActivity ? undefined : !canViewMedia ? viewPermissionTitle : mediaPermissionReason(permissionMatrix, currentAdmin, 'activity.export');
  const bulkSelectionPermissionTitle = canBulkSelectMedia
    ? undefined
    : !canViewMedia
      ? viewPermissionTitle
      : `Requires media.edit or media.delete. ${editPermissionTitle || ''} ${deletePermissionTitle || ''}`.trim();
  const deniedCreateMessage = `Your account needs media.create to upload or create folders. ${createPermissionTitle}`;
  const deniedEditMessage = `Your account needs media.edit to change media metadata. ${editPermissionTitle}`;
  const deniedDeleteMessage = `Your account needs media.delete to delete media assets. ${deletePermissionTitle}`;
  const deniedExportMessage = `Your account needs activity.export to export media manifests and audit feeds. ${activityPermissionTitle}`;
  const deniedBulkSelectionMessage = `Your account needs media.edit or media.delete to select media for bulk actions. ${bulkSelectionPermissionTitle}`;
  const isMediaMutationBusy = isUploading ||
    isSavingMetadata ||
    isCreatingSignedUrl ||
    isUpdatingBinding ||
    isReplacingAsset ||
    isRestoringAssetVersion ||
    isDeletingAssetVersion ||
    isPreparingTransforms ||
    isSavingProviderAnalytics ||
    isUpdatingSafety ||
    isBulkUpdating ||
    isDeletingAsset ||
    isCreatingFolder ||
    isUpdatingFolder ||
    isDeletingFolder;
  const isMediaLibraryBusy = isLoading || isMediaMutationBusy || isPermissionMatrixPending;
  const activeSiteRouteSearch = useMemo(() => ({ siteId }), [siteId]);
  const publicBaseUrl = useMemo(() => getPublicBaseUrl(), []);
  const publicMediaListUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(siteId)}/media?limit=100`;
  const publicMediaDetailUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(siteId)}/media/{mediaId}`;
  const publicMediaFontsUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(siteId)}/media/fonts`;
  const publicMediaFileUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(siteId)}/media/{mediaId}/file`;
  const publicMediaTransformUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(siteId)}/media/{mediaId}/transform?width=1200&quality=75`;
  const adminMediaUploadUrl = `${publicBaseUrl}/api/admin/sites/${encodeURIComponent(siteId)}/media`;
  const adminMediaFoldersUrl = `${publicBaseUrl}/api/admin/sites/${encodeURIComponent(siteId)}/media/folders`;
  const adminMediaFolderUrl = `${publicBaseUrl}/api/admin/sites/${encodeURIComponent(siteId)}/media/folders/{folderId}`;
  const adminMediaProviderAnalyticsUrl = `${publicBaseUrl}/api/admin/sites/${encodeURIComponent(siteId)}/media/provider-analytics`;
  const mediaRouteSearch = useMemo<MediaSearch>(() => ({
    siteId,
    ...(selectedAsset ? { assetId: selectedAsset.id } : {}),
    ...(folderSelectionToRoute(selectedFolderId) ? { folderId: folderSelectionToRoute(selectedFolderId) } : {}),
    ...(searchQuery.trim() ? { q: searchQuery.trim() } : {}),
    ...(tagFilter.trim() ? { tag: tagFilter.trim() } : {}),
    ...(typeFilter !== 'all' ? { type: typeFilter } : {}),
    ...(visibilityFilter !== 'all' ? { visibility: visibilityFilter } : {}),
    ...(usageFilter !== 'all' ? { usage: usageFilter } : {}),
  }), [searchQuery, selectedAsset, selectedFolderId, siteId, tagFilter, typeFilter, usageFilter, visibilityFilter]);

  const updateMediaRouteSearch = (next: MediaSearch) => {
    const merged: MediaSearch = {
      ...mediaRouteSearch,
      ...next,
    };
    const normalized: MediaSearch = {
      siteId: merged.siteId || siteId,
      ...(merged.assetId ? { assetId: merged.assetId } : {}),
      ...(merged.folderId ? { folderId: merged.folderId } : {}),
      ...(merged.q?.trim() ? { q: merged.q.trim() } : {}),
      ...(merged.tag?.trim() ? { tag: merged.tag.trim() } : {}),
      ...(merged.type && merged.type !== 'all' ? { type: merged.type } : {}),
      ...(merged.visibility && merged.visibility !== 'all' ? { visibility: merged.visibility } : {}),
      ...(merged.usage && merged.usage !== 'all' ? { usage: merged.usage } : {}),
    };

    navigate({ to: '/media', search: normalized, replace: true });
  };

  useEffect(() => {
    if (sites.length > 0 && !sites.some((site) => siteMatchesIdentifier(site, selectedSiteId))) {
      setSelectedSiteId(sites[0].publicSiteId || sites[0].id);
    }
  }, [selectedSiteId, sites]);

  const resetMediaWorkspaceState = useCallback(() => {
    setSelectedMediaIds([]);
    setSelectedAsset(null);
    setSelectedFolderId(undefined);
    setSearchQuery('');
    setTagFilter('');
    setTypeFilter('all');
    setVisibilityFilter('all');
    setUsageFilter('all');
    setRecentUploadSummary(null);
  }, []);

  useEffect(() => {
    const nextSiteId = routeSearch.siteId
      ? getSiteSelectionFromSearch(sites, routeSearch.siteId)
      : selectedSiteId;
    const siteChanged = nextSiteId !== selectedSiteId;

    if (siteChanged) {
      setSelectedSiteId(nextSiteId);
      resetMediaWorkspaceState();
    }

    setSearchQuery(routeSearch.q || '');
    setTagFilter(routeSearch.tag || '');
    setTypeFilter(routeSearch.type || 'all');
    setVisibilityFilter(routeSearch.visibility || 'all');
    setUsageFilter(routeSearch.usage || 'all');
    setSelectedFolderId(folderSelectionFromRoute(routeSearch.folderId));
    if (!routeSearch.assetId) {
      setSelectedAsset(null);
    }
  }, [
    resetMediaWorkspaceState,
    routeSearch.assetId,
    routeSearch.folderId,
    routeSearch.q,
    routeSearch.siteId,
    routeSearch.tag,
    routeSearch.type,
    routeSearch.usage,
    routeSearch.visibility,
    selectedSiteId,
    sites,
  ]);

  const getAssetDeliveryUrl = useCallback(
    (asset: MediaAsset) => getPublicMediaFileUrl(asset.id, siteId),
    [siteId],
  );
  const folderOptions = useMemo(() => buildMediaFolderOptions(folders), [folders]);
  const folderOptionById = useMemo(() => new Map(folderOptions.map((folder) => [folder.id, folder])), [folderOptions]);
  const selectedFolderFilterIds = useMemo(() => {
    if (typeof selectedFolderId !== 'string') {
      return null;
    }
    const ids = getMediaFolderDescendantIds(folders, selectedFolderId);
    ids.add(selectedFolderId);
    return ids;
  }, [folders, selectedFolderId]);
  const folderAssetCounts = useMemo(() => {
    const counts = new Map<string, number>();
    files.forEach((file) => {
      if (file.folderId) {
        counts.set(file.folderId, (counts.get(file.folderId) || 0) + 1);
      }
    });
    return counts;
  }, [files]);
  const folderSubtreeAssetCounts = useMemo(() => {
    const counts = new Map(folderAssetCounts);
    files.forEach((file) => {
      if (!file.folderId) {
        return;
      }
      getMediaFolderAncestorIds(folders, file.folderId).forEach((ancestorId) => {
        counts.set(ancestorId, (counts.get(ancestorId) || 0) + 1);
      });
    });
    return counts;
  }, [files, folderAssetCounts, folders]);
  const getFolderPath = useCallback((folderId: string) => (
    folderOptionById.get(folderId)?.path || folders.find((folder) => folder.id === folderId)?.name || 'Folder'
  ), [folderOptionById, folders]);
  const getFolderParentOptions = useCallback((folderId: string) => {
    const blockedIds = getMediaFolderDescendantIds(folders, folderId);
    blockedIds.add(folderId);
    return folderOptions.filter((folder) => !blockedIds.has(folder.id));
  }, [folderOptions, folders]);
  const uploadTargetFolderId = uploadFolderId === 'current'
    ? selectedFolderId === undefined ? null : selectedFolderId
    : uploadFolderId === 'root' ? null : uploadFolderId;
  const uploadTargetFolderLabel = uploadTargetFolderId
    ? getFolderPath(uploadTargetFolderId)
    : 'Root';
  const activeUploadMode = useMemo(
    () => MEDIA_UPLOAD_MODES.find((mode) => mode.value === uploadMode) || MEDIA_UPLOAD_MODES[0],
    [uploadMode],
  );
  const uploadTagList = useMemo(() => parseTagInput(uploadTags), [uploadTags]);
  const setUploadTagList = useCallback((nextTags: string[]) => {
    setUploadTags(serializeTagValues(nextTags));
  }, []);
  const bulkTagList = useMemo(() => parseTagInput(bulkTags), [bulkTags]);
  const setBulkTagList = useCallback((nextTags: string[]) => {
    setBulkTags(serializeTagValues(nextTags));
  }, []);

  const publicFileUrl = useMemo(
    () => selectedAsset ? getPublicMediaFileUrl(selectedAsset.id, siteId) : '',
    [selectedAsset, siteId],
  );
  const publicTransformUrl = useMemo(
    () => selectedAsset?.type === 'image'
      ? getPublicImageTransformUrl(selectedAsset.id, { width: transformWidth, quality: transformQuality }, siteId)
      : '',
    [selectedAsset, siteId, transformQuality, transformWidth],
  );
  const responsiveManifest = useMemo(
    () => selectedAsset?.type === 'image'
      ? getAdminResponsiveManifest(selectedAsset, siteId)
      : undefined,
    [selectedAsset, siteId],
  );
  const selectedFontPreviewUrl = selectedAsset?.type === 'font'
    ? selectedAsset.visibility === 'private'
      ? fontPreviewUrl
      : selectedAsset.url
    : '';
  const selectedAssetPreviewBlockedReason = selectedAsset ? mediaPreviewBlockedReason(selectedAsset) : null;
  const metadataReplacementVersions = useMemo(
    () => getReplacementVersions(selectedAsset?.metadata),
    [selectedAsset?.metadata],
  );
  const dbReplacementVersions = useMemo(
    () => getReplacementVersionsFromRecords(assetVersionRecords),
    [assetVersionRecords],
  );
  const replacementVersions = assetVersionSource === 'database'
    ? dbReplacementVersions
    : assetVersionSource === 'metadata'
      ? metadataReplacementVersions
      : dbReplacementVersions.length > 0
        ? dbReplacementVersions
        : metadataReplacementVersions;
  const selectedDeliveryAnalytics = useMemo(
    () => getMediaDeliveryAnalytics(selectedAsset?.metadata),
    [selectedAsset?.metadata],
  );
  const selectedProviderAnalytics = useMemo(
    () => getMediaProviderDeliveryAnalytics(selectedAsset?.metadata),
    [selectedAsset?.metadata],
  );
  const selectedMediaSecurity = useMemo(
    () => getMediaSecurityPolicy(selectedAsset?.metadata),
    [selectedAsset?.metadata],
  );
  const mediaAccessRows = useMemo(
    () => getMediaAccessRows(permissionMatrix, currentAdmin),
    [currentAdmin, permissionMatrix],
  );
  const mediaAnalytics = useMemo(() => getMediaAnalytics(files), [files]);
  const displayedFiles = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const normalizedTagFilter = tagFilter.trim().toLowerCase();

    return files.filter((file) => {
      if (typeFilter !== 'all' && file.type !== typeFilter) {
        return false;
      }

      if (visibilityFilter !== 'all' && (file.visibility || 'public') !== visibilityFilter) {
        return false;
      }

      if (selectedFolderId === null && file.folderId) {
        return false;
      }

      if (typeof selectedFolderId === 'string' && (!file.folderId || !selectedFolderFilterIds?.has(file.folderId))) {
        return false;
      }

      if (normalizedSearch) {
        const searchableText = [
          file.name,
          file.type,
          file.altText,
          file.caption,
          file.visibility || 'public',
          ...(file.tags || []),
          typeof file.metadata?.mimeType === 'string' ? file.metadata.mimeType : '',
          typeof file.metadata?.fontFamily === 'string' ? file.metadata.fontFamily : '',
        ].join(' ').toLowerCase();

        if (!searchableText.includes(normalizedSearch)) {
          return false;
        }
      }

      if (normalizedTagFilter && !(file.tags || []).some((tag) => tag.trim().toLowerCase() === normalizedTagFilter)) {
        return false;
      }

      if (usageFilter === 'unused') {
        return !hasMediaReferences(file);
      }
      if (usageFilter === 'referenced') {
        return hasMediaReferences(file);
      }
      if (usageFilter === 'replaced') {
        return getReplacementVersions(file.metadata).length > 0;
      }
      if (usageFilter === 'quarantined') {
        return getMediaSecurityPolicy(file.metadata).status === 'quarantined';
      }
      return true;
    });
  }, [files, searchQuery, selectedFolderFilterIds, selectedFolderId, tagFilter, typeFilter, usageFilter, visibilityFilter]);
  const quotaUsagePercent = mediaQuota && mediaQuota.limitBytes > 0
    ? Math.min(100, Math.round((mediaQuota.usedBytes / mediaQuota.limitBytes) * 100))
    : 0;
  const bindingTargets = bindingTargetType === 'page'
    ? pages.map((page) => ({ id: page.id, label: page.title || page.slug || page.id, detail: page.slug ? `/${page.slug}` : 'Page' }))
    : posts.map((post) => ({ id: post.id, label: post.title || post.slug || post.id, detail: post.slug ? `/blog/${post.slug}` : 'Post' }));
  const selectedMediaSet = useMemo(() => new Set(selectedMediaIds), [selectedMediaIds]);
  const selectedMediaAssets = useMemo(
    () => files.filter((file) => selectedMediaSet.has(file.id)),
    [files, selectedMediaSet],
  );
  const visibleMediaSet = useMemo(() => new Set(displayedFiles.map((file) => file.id)), [displayedFiles]);
  const hiddenSelectedMediaCount = useMemo(
    () => selectedMediaAssets.filter((file) => !visibleMediaSet.has(file.id)).length,
    [selectedMediaAssets, visibleMediaSet],
  );
  const loadedMediaCount = files.length;
  const matchingMediaTotal = Math.max(mediaPagination.total, loadedMediaCount);
  const hasUnloadedMedia = mediaPagination.hasMore || loadedMediaCount < matchingMediaTotal;
  const allVisibleSelected = displayedFiles.length > 0 && displayedFiles.every((file) => selectedMediaSet.has(file.id));
  const hasBulkTagChange = bulkTagMode === 'clear' ||
    ((bulkTagMode === 'merge' || bulkTagMode === 'replace') && bulkTagList.length > 0);
  const hasBulkSafetyChange = bulkSafetyAction !== 'keep';
  const hasBulkChange = bulkVisibility !== 'keep' || bulkFolderId !== 'keep' || hasBulkTagChange || hasBulkSafetyChange;
  const bulkManagementDescription = canEditMedia && canDeleteMedia
    ? 'Select visible assets, move them between folders, change delivery visibility, quarantine or release them, retag them, or remove them from the library.'
    : canEditMedia
      ? 'Select visible assets, move them between folders, change delivery visibility, quarantine or release them, and retag them.'
      : canDeleteMedia
        ? 'Select visible assets and remove them from the library.'
        : 'Bulk selection is available after media.edit or media.delete is granted.';
  const fontGroups = useMemo(() => {
    const groups = new Map<string, {
      family: string;
      fallback: string;
      display: string;
      assets: MediaAsset[];
      variants: string[];
      publicCount: number;
      privateCount: number;
    }>();

    files
      .filter((file) => file.type === 'font')
      .forEach((font) => {
        const family = typeof font.metadata?.fontFamily === 'string' && font.metadata.fontFamily.trim()
          ? font.metadata.fontFamily.trim()
          : font.name.replace(/\.[a-z0-9]+$/i, '');
        const fallback = typeof font.metadata?.fontFallback === 'string' && font.metadata.fontFallback.trim()
          ? font.metadata.fontFallback.trim()
          : 'system-ui, sans-serif';
        const display = typeof font.metadata?.fontDisplay === 'string' && font.metadata.fontDisplay.trim()
          ? font.metadata.fontDisplay.trim()
          : 'swap';
        const weight = typeof font.metadata?.fontWeight === 'string' && font.metadata.fontWeight.trim()
          ? font.metadata.fontWeight.trim()
          : '400';
        const style = typeof font.metadata?.fontStyle === 'string' && font.metadata.fontStyle.trim()
          ? font.metadata.fontStyle.trim()
          : 'normal';
        const key = family.toLowerCase();
        const current = groups.get(key) || {
          family,
          fallback,
          display,
          assets: [],
          variants: [],
          publicCount: 0,
          privateCount: 0,
        };

        current.assets.push(font);
        current.variants.push(`${weight} ${style}`);
        if (font.visibility === 'private') {
          current.privateCount += 1;
        } else {
          current.publicCount += 1;
        }
        groups.set(key, current);
      });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        variants: Array.from(new Set(group.variants)).sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.family.localeCompare(b.family));
  }, [files]);
  const mediaLibraryReadiness = useMemo(() => {
    const storageReady = runtimeStorage?.configured === true;
    const quotaReady = !mediaQuota || mediaQuota.remainingBytes > 0;
    const hasAssets = files.length > 0;
    const hasFolders = folders.length > 0 || mediaAnalytics.folderedAssets > 0;
    const hasPublicDelivery = mediaAnalytics.publicAssets > 0;
    const hasPrivateWorkflow = mediaAnalytics.privateAssets > 0 || uploadVisibility === 'private';
    const hasReferences = mediaAnalytics.referencedAssets > 0;
    const hasFonts = fontGroups.length > 0;
    const checks = [
      {
        label: 'Storage runtime',
        detail: runtimeStorage
          ? storageReady
            ? `${runtimeStorage.provider} storage is configured.`
            : `Missing ${runtimeStorage.missing?.join(', ') || 'storage configuration'}.`
          : 'Runtime storage summary has not loaded.',
        ready: storageReady,
      },
      {
        label: 'Quota headroom',
        detail: mediaQuota ? `${formatBytes(mediaQuota.remainingBytes)} remaining` : 'Quota data will appear after the media API responds.',
        ready: quotaReady,
      },
      {
        label: 'Library inventory',
        detail: hasAssets ? `${files.length} asset${files.length === 1 ? '' : 's'} in the library` : 'Upload the first image, video, audio, document, font, or file.',
        ready: hasAssets,
      },
      {
        label: 'Folder organization',
        detail: hasFolders
          ? `${folders.length} folder${folders.length === 1 ? '' : 's'} · ${mediaAnalytics.folderedAssets} foldered assets`
          : 'Create folders to keep site media organized.',
        ready: hasFolders,
      },
      {
        label: 'Public delivery',
        detail: hasPublicDelivery
          ? `${mediaAnalytics.publicAssets} public asset${mediaAnalytics.publicAssets === 1 ? '' : 's'} ready for frontends`
          : 'Mark assets public when they should be available to frontend routes.',
        ready: hasPublicDelivery,
      },
      {
        label: 'Private delivery',
        detail: hasPrivateWorkflow
          ? 'Private signed URL workflow is available for protected files.'
          : 'Switch upload defaults or metadata to private for protected downloads.',
        ready: true,
      },
      {
        label: 'Reference coverage',
        detail: hasReferences
          ? `${mediaAnalytics.referencedAssets} referenced asset${mediaAnalytics.referencedAssets === 1 ? '' : 's'}`
          : `${mediaAnalytics.unusedAssets} unused asset${mediaAnalytics.unusedAssets === 1 ? '' : 's'} need binding review`,
        ready: hasReferences || files.length === 0,
      },
      {
        label: 'Quarantine review',
        detail: mediaAnalytics.quarantinedAssets > 0
          ? `${mediaAnalytics.quarantinedAssets} quarantined asset${mediaAnalytics.quarantinedAssets === 1 ? '' : 's'} need release or deletion`
          : 'No quarantined assets in the current library.',
        ready: mediaAnalytics.quarantinedAssets === 0,
      },
      {
        label: 'Font controls',
        detail: hasFonts
          ? `${fontGroups.length} font famil${fontGroups.length === 1 ? 'y' : 'ies'} registered`
          : 'Upload fonts to expose typographic controls to the editor.',
        ready: hasFonts || files.length === 0,
      },
    ];
    const readyCount = checks.filter((check) => check.ready).length;

    return {
      score: Math.round((readyCount / checks.length) * 100),
      checks,
      workflow: [
        { label: 'Upload', detail: 'Drop images, videos, audio, documents, fonts, or other files with visibility, folder, and tag defaults.' },
        { label: 'Organize', detail: 'Group media into folders, edit metadata, alt text, captions, and delivery rules.' },
        { label: 'Bind', detail: 'Attach assets to pages/posts and prepare transforms or signed URLs as needed.' },
        { label: 'Deliver', detail: 'Expose public files, private signed delivery, transforms, and font manifests to frontends.' },
      ],
    };
  }, [
    files.length,
    folders.length,
    fontGroups.length,
    mediaAnalytics.folderedAssets,
    mediaAnalytics.privateAssets,
    mediaAnalytics.publicAssets,
    mediaAnalytics.quarantinedAssets,
    mediaAnalytics.referencedAssets,
    mediaAnalytics.unusedAssets,
    mediaQuota,
    runtimeStorage,
    uploadVisibility,
  ]);
  const scannerRuntime = runtimeMediaScanner || DEFAULT_MEDIA_SCANNER_RUNTIME;
  const mediaHandoff = useMemo(() => ({
    siteId,
    generatedAt: new Date().toISOString(),
    storage: runtimeStorage
      ? {
          provider: runtimeStorage.provider,
          configured: runtimeStorage.configured,
          bucket: runtimeStorage.bucket,
          basePath: runtimeStorage.basePath,
          publicUrl: runtimeStorage.publicUrl,
          missing: runtimeStorage.missing || [],
        }
      : null,
    supabase: runtimeSupabase
      ? {
          configured: runtimeSupabase.configured,
          projectRef: runtimeSupabase.projectRef,
          storageBucket: runtimeSupabase.storageBucket,
          anonKeyConfigured: runtimeSupabase.anonKeyConfigured,
          serviceRoleConfigured: runtimeSupabase.serviceRoleConfigured,
          missing: runtimeSupabase.missing || [],
        }
      : null,
    scanner: {
      provider: scannerRuntime.provider,
      enabled: scannerRuntime.enabled,
      configured: scannerRuntime.configured,
      endpointConfigured: scannerRuntime.endpointConfigured,
      host: scannerRuntime.host,
      port: scannerRuntime.port,
      apiKeyConfigured: scannerRuntime.apiKeyConfigured,
      timeoutMs: scannerRuntime.timeoutMs,
      failOpen: scannerRuntime.failOpen,
      missing: scannerRuntime.missing || [],
    },
    quota: mediaQuota
      ? {
          usedBytes: mediaQuota.usedBytes,
          remainingBytes: mediaQuota.remainingBytes,
          limitBytes: mediaQuota.limitBytes,
          usagePercent: quotaUsagePercent,
        }
      : null,
    endpoints: {
      list: publicMediaListUrl,
      detail: publicMediaDetailUrl,
      fonts: publicMediaFontsUrl,
      file: publicMediaFileUrl,
      transform: publicMediaTransformUrl,
      adminUpload: adminMediaUploadUrl,
      adminFolders: adminMediaFoldersUrl,
      adminFolder: adminMediaFolderUrl,
      adminProviderAnalytics: adminMediaProviderAnalyticsUrl,
    },
    controlRoutes: Object.fromEntries(MEDIA_USAGE_SURFACES.map((surface) => [
      surface.title,
      surface.route,
    ])),
    export: {
      csvIncludesDeliveryUrls: true,
      csvIncludesFolderAssignments: true,
      csvIncludesFontMetadata: true,
      csvIncludesReferences: true,
      csvColumns: MEDIA_EXPORT_COLUMNS,
    },
    counts: {
      total: files.length,
      visible: displayedFiles.length,
      public: mediaAnalytics.publicAssets,
      private: mediaAnalytics.privateAssets,
      folders: folders.length,
      fonts: fontGroups.length,
      referenced: mediaAnalytics.referencedAssets,
      unused: mediaAnalytics.unusedAssets,
      quarantined: mediaAnalytics.quarantinedAssets,
    },
    providerDelivery: mediaAnalytics.providerRows.map((row) => ({
      provider: row.provider,
      assets: row.count,
      publicAssets: row.publicCount,
      privateAssets: row.privateCount,
      bytes: row.bytes,
      backyRequests: row.requests,
      backyBytesServed: row.bytesServed,
      lastBackyDelivery: row.lastDeliveredAt,
      directCdnAnalytics: row.provider === 'local' || row.provider === 'unknown' ? 'not-configured' : 'provider-console',
      providerAnalyticsIngest: adminMediaProviderAnalyticsUrl,
    })),
    providerRoi: {
      requests: mediaAnalytics.providerRequests,
      conversions: mediaAnalytics.providerConversions,
      conversionValue: mediaAnalytics.providerConversionValue,
      conversionRate: mediaAnalytics.providerConversionRate,
      valuePerRequest: mediaAnalytics.providerValuePerRequest,
      currency: mediaAnalytics.providerCurrency || 'USD',
      rows: mediaAnalytics.providerRoiRows.map((row) => ({
        provider: row.provider,
        requests: row.providerRequests,
        conversions: row.providerConversions,
        conversionValue: row.providerConversionValue,
        conversionRate: row.providerConversionRate,
        valuePerRequest: row.providerValuePerRequest,
        currency: row.providerCurrency || mediaAnalytics.providerCurrency || 'USD',
        lastSyncedAt: row.providerLastSyncedAt,
      })),
    },
    folders: folderOptions.map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      path: folder.path,
      assetCount: folderSubtreeAssetCounts.get(folder.id) || 0,
      directAssetCount: folderAssetCounts.get(folder.id) || 0,
    })),
    fonts: fontGroups.map((group) => ({
      family: group.family,
      fallback: group.fallback,
      display: group.display,
      variants: group.variants,
      publicCount: group.publicCount,
      privateCount: group.privateCount,
      assetIds: group.assets.map((asset) => asset.id),
    })),
    assets: files.map((asset) => ({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      mimeType: typeof asset.metadata?.mimeType === 'string' ? asset.metadata.mimeType : undefined,
      size: asset.size,
      sizeBytes: asset.sizeBytes,
      visibility: asset.visibility || 'public',
      folderId: asset.folderId || null,
      tags: asset.tags || [],
      altText: asset.altText,
      caption: asset.caption,
      url: asset.visibility === 'private' ? undefined : getPublicMediaFileUrl(asset.id, siteId),
      transformUrl: asset.visibility !== 'private' && asset.type === 'image'
        ? getPublicImageTransformUrl(asset.id, { width: 1200, quality: 75 }, siteId)
        : undefined,
      references: {
        pages: asset.targetPageIds || [],
        posts: asset.targetPostIds || [],
      },
      font: asset.type === 'font'
        ? {
            family: asset.metadata?.fontFamily,
            weight: asset.metadata?.fontWeight,
            style: asset.metadata?.fontStyle,
            fallback: asset.metadata?.fontFallback,
            display: asset.metadata?.fontDisplay,
          }
        : undefined,
      responsive: asset.responsive,
    })),
  }), [
    adminMediaUploadUrl,
    adminMediaFolderUrl,
    adminMediaFoldersUrl,
    adminMediaProviderAnalyticsUrl,
    displayedFiles.length,
    files,
    folderAssetCounts,
    folderSubtreeAssetCounts,
    folderOptions,
    folders,
    fontGroups,
    mediaAnalytics.privateAssets,
    mediaAnalytics.publicAssets,
    mediaAnalytics.referencedAssets,
    mediaAnalytics.quarantinedAssets,
    mediaAnalytics.unusedAssets,
    mediaAnalytics.providerRows,
    mediaAnalytics.providerRoiRows,
    mediaAnalytics.providerRequests,
    mediaAnalytics.providerConversions,
    mediaAnalytics.providerConversionValue,
    mediaAnalytics.providerConversionRate,
    mediaAnalytics.providerValuePerRequest,
    mediaAnalytics.providerCurrency,
    mediaQuota,
    publicMediaDetailUrl,
    publicMediaFontsUrl,
    publicMediaFileUrl,
    publicMediaListUrl,
    publicMediaTransformUrl,
    quotaUsagePercent,
    runtimeStorage,
    runtimeSupabase,
    scannerRuntime,
    siteId,
  ]);
  const mediaHandoffText = useMemo(() => JSON.stringify(mediaHandoff, null, 2), [mediaHandoff]);
  const storageSettings = settingsIntegrations?.storage || {};
  const supabaseSettings = settingsIntegrations?.supabase || {};
  const storageSettingsControlsDisabled = isSavingStorageSettings || !settingsIntegrations || !canConfigureMediaStorage;
  const selectedStorageProvider: MediaStorageProvider = (
    storageSettings.provider === 'supabase' ||
    storageSettings.provider === 's3' ||
    storageSettings.provider === 'local'
      ? storageSettings.provider
      : runtimeStorage?.provider === 'supabase' || runtimeStorage?.provider === 's3' || runtimeStorage?.provider === 'local'
        ? runtimeStorage.provider
        : 'local'
  );
  const storageEnvContract = useMemo(() => MEDIA_STORAGE_ENV_CONTRACT[selectedStorageProvider], [selectedStorageProvider]);
  const missingStorageEnv = new Set(runtimeStorage?.provider === selectedStorageProvider ? runtimeStorage.missing || [] : []);
  const selectedProviderInsight = useMemo(
    () => selectedAsset ? getMediaProviderInsight(selectedAsset, runtimeStorage, storageSettings) : undefined,
    [runtimeStorage, selectedAsset, storageSettings],
  );

  const loadLibrary = useCallback(async (options: MediaLibraryLoadOptions = {}) => {
    if (!canViewMedia) {
      filesRef.current = [];
      setMedia([]);
      setMediaQuota(undefined);
      mediaPaginationRef.current = { total: 0, limit: MEDIA_LIBRARY_PAGE_SIZE, offset: 0, hasMore: false };
      setMediaPagination({ total: 0, limit: MEDIA_LIBRARY_PAGE_SIZE, offset: 0, hasMore: false });
      setSelectedMediaIds([]);
      setSelectedAsset(null);
      setIsLoading(false);
      if (!isPermissionMatrixPending) {
        setError(`Your account needs media.view to load the media library. ${viewPermissionTitle}`);
      }
      return;
    }

    const mode = options.mode || 'replace';
    const startOffset = options.offset ?? (mode === 'append'
      ? mediaPaginationRef.current.offset + mediaPaginationRef.current.limit
      : 0);
    setIsLoading(true);
    setError(null);

    try {
      const baseOptions: MediaListOptions = {
        siteId,
        scope: 'all',
        limit: MEDIA_LIBRARY_PAGE_SIZE,
        search: searchQuery.trim() || undefined,
        tag: tagFilter.trim() || undefined,
        type: typeFilter === 'file' ? 'document' : typeFilter === 'all' ? undefined : typeFilter,
        visibility: visibilityFilter === 'all' ? undefined : visibilityFilter,
        folderId: selectedFolderId === null ? null : undefined,
      };
      const firstPage = await listMediaLibrary({
        ...baseOptions,
        offset: startOffset,
      });
      const mergedById = new Map<string, MediaAsset>();

      if (mode === 'append') {
        filesRef.current.forEach((asset) => mergedById.set(asset.id, asset));
      }
      firstPage.media.forEach((asset) => mergedById.set(asset.id, asset));

      let latestPagination = firstPage.pagination || {
        total: firstPage.media.length,
        limit: MEDIA_LIBRARY_PAGE_SIZE,
        offset: startOffset,
        hasMore: false,
      };
      let nextOffset = latestPagination.offset + latestPagination.limit;

      while ((mode === 'all' || typeof selectedFolderId === 'string') && latestPagination.hasMore) {
        const nextPage = await listMediaLibrary({
          ...baseOptions,
          offset: nextOffset,
        });
        nextPage.media.forEach((asset) => mergedById.set(asset.id, asset));
        latestPagination = nextPage.pagination || {
          total: mergedById.size,
          limit: MEDIA_LIBRARY_PAGE_SIZE,
          offset: nextOffset,
          hasMore: false,
        };
        nextOffset = latestPagination.offset + latestPagination.limit;
      }

      const nextMedia = Array.from(mergedById.values());
      filesRef.current = nextMedia;
      setMedia(nextMedia);
      setMediaQuota(firstPage.quota);
      mediaPaginationRef.current = latestPagination;
      setMediaPagination(latestPagination);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load media library.');
    } finally {
      setIsLoading(false);
    }
  }, [canViewMedia, isPermissionMatrixPending, searchQuery, selectedFolderId, setMedia, siteId, tagFilter, typeFilter, viewPermissionTitle, visibilityFilter]);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    setSelectedMediaIds((current) => current.filter((id) => files.some((file) => file.id === id)));
  }, [files]);

  useEffect(() => {
    let cancelled = false;

    const loadRuntimeStorage = async () => {
      try {
        const settings = await getSettings();
        if (!cancelled) {
          setRuntimeStorage(settings.runtimeStorage);
          setRuntimeSupabase(settings.runtimeSupabase);
          setRuntimeMediaScanner(settings.runtimeMediaScanner);
          setSettingsDeliveryMode(settings.deliveryMode);
          setSettingsIntegrations(settings.integrations);
          setSettingsInfrastructureInput({
            deliveryMode: settings.deliveryMode,
            integrations: settings.integrations,
          });
        }
      } catch {
        if (!cancelled) {
          setRuntimeStorage(undefined);
          setRuntimeSupabase(undefined);
          setRuntimeMediaScanner(undefined);
          setSettingsDeliveryMode(undefined);
          setSettingsIntegrations(undefined);
          setSettingsInfrastructureInput(null);
        }
      }
    };

    void loadRuntimeStorage();

    return () => {
      cancelled = true;
    };
  }, []);

  const updateMediaStorageSettingsDraft = useCallback((next: Partial<MediaStorageSettings>) => {
    setStorageSettingsNotice(null);
    setSettingsIntegrations((current) => ({
      ...(current || {}),
      storage: {
        ...(current?.storage || {}),
        ...next,
      },
    }));
  }, []);

  const updateMediaSupabaseSettingsDraft = useCallback((next: Partial<MediaSupabaseSettings>) => {
    setStorageSettingsNotice(null);
    setSettingsIntegrations((current) => ({
      ...(current || {}),
      supabase: {
        ...(current?.supabase || {}),
        ...next,
      },
    }));
  }, []);

  const handleUseRuntimeStorageSettings = useCallback(() => {
    updateMediaStorageSettingsDraft({
      provider: runtimeStorage?.provider || storageSettings.provider || 'local',
      bucket: runtimeStorage?.bucket || storageSettings.bucket || runtimeSupabase?.storageBucket || '',
      publicBaseUrl: runtimeStorage?.publicUrl || storageSettings.publicBaseUrl || '',
      pathPrefix: runtimeStorage?.basePath || storageSettings.pathPrefix || '',
      imageTransformsEnabled: storageSettings.imageTransformsEnabled !== false,
    });
  }, [
    runtimeStorage?.basePath,
    runtimeStorage?.bucket,
    runtimeStorage?.provider,
    runtimeStorage?.publicUrl,
    runtimeSupabase?.storageBucket,
    storageSettings.bucket,
    storageSettings.imageTransformsEnabled,
    storageSettings.pathPrefix,
    storageSettings.provider,
    storageSettings.publicBaseUrl,
    updateMediaStorageSettingsDraft,
  ]);

  const handleUseRuntimeSupabaseSettings = useCallback(() => {
    const bucket = runtimeSupabase?.storageBucket || storageSettings.bucket || '';
    const projectUrl = runtimeSupabase?.projectUrl || supabaseSettings.projectUrl || '';
    const projectRef = runtimeSupabase?.projectRef || supabaseSettings.projectRef || '';
    const publicBaseUrl = storageSettings.publicBaseUrl || buildSupabaseStoragePublicBaseUrl(projectUrl, bucket);

    setStorageSettingsNotice(null);
    setSettingsIntegrations((current) => ({
      ...(current || {}),
      storage: {
        ...(current?.storage || {}),
        provider: 'supabase',
        bucket,
        publicBaseUrl,
        imageTransformsEnabled: current?.storage?.imageTransformsEnabled !== false,
      },
      supabase: {
        ...(current?.supabase || {}),
        projectUrl,
        projectRef,
        storageEnabled: Boolean(bucket || current?.supabase?.storageEnabled),
      },
    }));
  }, [
    runtimeSupabase?.projectRef,
    runtimeSupabase?.projectUrl,
    runtimeSupabase?.storageBucket,
    storageSettings.bucket,
    storageSettings.publicBaseUrl,
    supabaseSettings.projectRef,
    supabaseSettings.projectUrl,
  ]);

  const saveMediaStorageSettings = useCallback(async () => {
    if (!settingsIntegrations || isSavingStorageSettings) return;
    if (!canConfigureMediaStorage) {
      setStorageCheckError('This admin account needs media.configure to change storage metadata.');
      return;
    }

    setIsSavingStorageSettings(true);
    setStorageCheckError(null);
    setStorageSettingsNotice(null);
    try {
      const updated = await updateBackendSettings({
        ...(settingsDeliveryMode ? { deliveryMode: settingsDeliveryMode } : {}),
        integrations: {
          storage: settingsIntegrations.storage,
          supabase: settingsIntegrations.supabase,
        },
      });
      setRuntimeStorage(updated.runtimeStorage);
      setRuntimeSupabase(updated.runtimeSupabase);
      setRuntimeMediaScanner(updated.runtimeMediaScanner);
      setSettingsDeliveryMode(updated.deliveryMode);
      setSettingsIntegrations(updated.integrations);
      setSettingsInfrastructureInput({
        deliveryMode: updated.deliveryMode,
        integrations: updated.integrations,
      });
      setStorageDiagnostics(null);
      setStorageProvisioningResult(null);
      setStorageSettingsNotice('Storage metadata saved. Run check to validate the current runtime.');
    } catch (saveError) {
      setStorageCheckError(saveError instanceof Error ? saveError.message : 'Unable to save storage settings.');
    } finally {
      setIsSavingStorageSettings(false);
    }
  }, [canConfigureMediaStorage, isSavingStorageSettings, settingsDeliveryMode, settingsIntegrations]);

  const runStorageInfrastructureCheck = useCallback(async () => {
    if (isCheckingStorage || !settingsInfrastructureInput || !settingsIntegrations) return;
    if (!canConfigureMediaStorage) {
      setStorageCheckError('This admin account needs media.configure to validate storage metadata.');
      return;
    }

    setIsCheckingStorage(true);
    setStorageCheckError(null);
    try {
      const result = await validateSettingsInfrastructure({
        deliveryMode: settingsInfrastructureInput.deliveryMode,
        integrations: {
          storage: settingsIntegrations.storage,
          supabase: settingsIntegrations.supabase,
        },
      });
      setStorageDiagnostics(result.diagnostics.filter((diagnostic) => (
        diagnostic.area === 'storage' || diagnostic.area === 'supabase'
      )));
    } catch (checkError) {
      setStorageDiagnostics(null);
      setStorageCheckError(checkError instanceof Error ? checkError.message : 'Unable to run storage check.');
    } finally {
      setIsCheckingStorage(false);
    }
  }, [canConfigureMediaStorage, isCheckingStorage, settingsInfrastructureInput, settingsIntegrations]);

  const runStorageProvisioningProbe = useCallback(async () => {
    if (isRunningStorageProvisioningProbe) return;
    if (!canConfigureMediaStorage) {
      setStorageCheckError('This admin account needs media.configure to run the storage provisioning probe.');
      return;
    }

    setIsRunningStorageProvisioningProbe(true);
    setStorageCheckError(null);
    try {
      const result = await runSettingsStorageProvisioningProbe(siteId);
      setStorageProvisioningResult(result);
    } catch (probeError) {
      setStorageProvisioningResult(null);
      setStorageCheckError(probeError instanceof Error ? probeError.message : 'Unable to run storage provisioning probe.');
    } finally {
      setIsRunningStorageProvisioningProbe(false);
    }
  }, [canConfigureMediaStorage, isRunningStorageProvisioningProbe, siteId]);

  useEffect(() => {
    let cancelled = false;

    const loadReferenceTargets = async () => {
      if (!canViewMedia) {
        setPages([]);
        setPosts([]);
        return;
      }

      try {
        const [backendPages, backendPosts] = await Promise.all([
          listPages(siteId),
          listBlogPosts(siteId),
        ]);

        if (!cancelled) {
          setPages(backendPages);
          setPosts(backendPosts);
        }
      } catch {
        // Keep any local page/post cache available for reference labels.
      }
    };

    void loadReferenceTargets();

    return () => {
      cancelled = true;
    };
  }, [canViewMedia, setPages, setPosts, siteId]);

  useEffect(() => {
    let cancelled = false;

    const loadFolders = async () => {
      if (!canViewMedia) {
        setFolders([]);
        return;
      }

      try {
        const backendFolders = await listMediaFolders(siteId);
        if (!cancelled) {
          setFolders(backendFolders);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load media folders.');
        }
      }
    };

    void loadFolders();

    return () => {
      cancelled = true;
    };
  }, [canViewMedia, siteId]);

  const openMetadataEditor = (asset: MediaAsset) => {
    suppressedRouteAssetIdRef.current = null;
    const imagePresentation = getImagePresentationMetadata(asset.metadata);
    setSelectedAsset(asset);
    updateMediaRouteSearch({ assetId: asset.id });
    setAssetDeliveryError(null);
    setAssetProviderAnalyticsNotice(null);
    setAssetReferenceError(null);
    setSignedUrl(null);
    setBindingTargetId('');
    setMetadataForm({
      name: asset.name,
      altText: asset.altText || '',
      caption: asset.caption || '',
      tags: (asset.tags || []).join(', '),
      fontFamily: typeof asset.metadata?.fontFamily === 'string' ? asset.metadata.fontFamily : '',
      fontWeight: typeof asset.metadata?.fontWeight === 'string' ? asset.metadata.fontWeight : '400',
      fontStyle: asset.metadata?.fontStyle === 'italic' || asset.metadata?.fontStyle === 'oblique'
        ? asset.metadata.fontStyle
        : 'normal',
      fontFallback: typeof asset.metadata?.fontFallback === 'string' && asset.metadata.fontFallback.trim()
        ? asset.metadata.fontFallback
        : 'system-ui, sans-serif',
      fontDisplay: asset.metadata?.fontDisplay === 'auto' ||
        asset.metadata?.fontDisplay === 'block' ||
        asset.metadata?.fontDisplay === 'fallback' ||
        asset.metadata?.fontDisplay === 'optional' ||
        asset.metadata?.fontDisplay === 'swap'
        ? asset.metadata.fontDisplay
        : 'swap',
      imageFocalX: imagePresentation.focalX,
      imageFocalY: imagePresentation.focalY,
      imageObjectFit: imagePresentation.objectFit,
      imageAspectRatio: imagePresentation.aspectRatio,
      folderId: asset.folderId || '',
      visibility: asset.visibility || 'public',
    });
  };

  useEffect(() => {
    if (!routeSearch.assetId) {
      suppressedRouteAssetIdRef.current = null;
      return;
    }

    if (suppressedRouteAssetIdRef.current === routeSearch.assetId || selectedAsset?.id === routeSearch.assetId) {
      return;
    }

    const routedAsset = files.find((asset) => asset.id === routeSearch.assetId);
    if (routedAsset) {
      openMetadataEditor(routedAsset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, routeSearch.assetId, selectedAsset?.id]);

  useEffect(() => {
    setAssetDeliveryError(null);
    setAssetReferenceError(null);
    setAssetAuditError(null);
    setAssetReplacementError(null);
    setAssetVersionRecords([]);
    setAssetVersionSource(null);
    setIsLoadingAssetVersions(false);
    setPendingRestoreVersionId(null);
    setPendingDeleteVersionId(null);
    setComparisonVersionId(null);
    setSignedUrl(null);
    setFontPreviewUrl('');
    setFontPreviewError(null);
    setIsLoadingFontPreview(false);
    setBindingTargetId('');
  }, [selectedAsset?.id]);

  useEffect(() => {
    let cancelled = false;

    const loadPrivateFontPreview = async () => {
      if (!selectedAsset || selectedAsset.type !== 'font') {
        setFontPreviewUrl('');
        setFontPreviewError(null);
        setIsLoadingFontPreview(false);
        return;
      }

      if (selectedAsset.visibility !== 'private') {
        setFontPreviewUrl(selectedAsset.url);
        setFontPreviewError(null);
        setIsLoadingFontPreview(false);
        return;
      }

      if (selectedMediaSecurity.status === 'quarantined') {
        setFontPreviewUrl('');
        setFontPreviewError('Quarantined fonts cannot be previewed.');
        setIsLoadingFontPreview(false);
        return;
      }

      if (!canViewMedia) {
        setFontPreviewUrl('');
        setFontPreviewError(`Your account needs media.view to preview private fonts. ${viewPermissionTitle}`);
        setIsLoadingFontPreview(false);
        return;
      }

      setIsLoadingFontPreview(true);
      setFontPreviewError(null);

      try {
        const preview = await createSignedMediaUrl(selectedAsset.id, {
          expiresInSeconds: 900,
          disposition: 'inline',
        }, siteId);
        if (!cancelled) {
          setFontPreviewUrl(preview.signedUrl);
          setFontPreviewError(null);
        }
      } catch (previewError) {
        if (!cancelled) {
          setFontPreviewUrl('');
          setFontPreviewError(previewError instanceof Error ? previewError.message : 'Unable to create a private font preview URL.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingFontPreview(false);
        }
      }
    };

    void loadPrivateFontPreview();

    return () => {
      cancelled = true;
    };
  }, [canViewMedia, selectedAsset, selectedMediaSecurity.status, siteId, viewPermissionTitle]);

  useEffect(() => {
    const providerAnalytics = getMediaProviderDeliveryAnalytics(selectedAsset?.metadata);
    setProviderAnalyticsRequests(providerAnalytics ? String(providerAnalytics.totalRequests) : '');
    setProviderAnalyticsBytes(providerAnalytics ? String(providerAnalytics.bytesServed) : '');
    setProviderAnalyticsConversions(providerAnalytics ? String(providerAnalytics.conversions) : '');
    setProviderAnalyticsValue(providerAnalytics ? String(providerAnalytics.conversionValue) : '');
    setProviderAnalyticsCurrency(providerAnalytics?.currency || 'USD');
    setProviderAnalyticsAttributionWindow(providerAnalytics?.attributionWindow || 'last-click');
    setProviderAnalyticsSource(providerAnalytics?.source || 'provider-console');
    setProviderAnalyticsWindow(providerAnalytics?.reportingWindow || 'last-30-days');
  }, [selectedAsset?.id, selectedAsset?.metadata]);

  const loadAssetVersions = useCallback(async (mediaId: string) => {
    setIsLoadingAssetVersions(true);

    try {
      const result = await listMediaVersions(mediaId, siteId);
      setAssetVersionRecords(result.versions);
      setAssetVersionSource(result.source);
    } catch {
      setAssetVersionRecords([]);
      setAssetVersionSource(null);
    } finally {
      setIsLoadingAssetVersions(false);
    }
  }, [siteId]);

  const loadLibraryAuditLogs = useCallback(async (offset = 0) => {
    if (!canExportMediaActivity) {
      setLibraryAuditLogs([]);
      setLibraryAuditPagination({ total: 0, limit: MEDIA_AUDIT_PAGE_SIZE, offset: 0, hasMore: false });
      setLibraryAuditError(null);
      setIsLoadingLibraryAudit(false);
      return;
    }

    setIsLoadingLibraryAudit(true);
    setLibraryAuditError(null);

    try {
      const result = await listAdminAuditLogs({
        siteId,
        entity: 'media',
        action: libraryAuditActionFilter === 'all' ? undefined : libraryAuditActionFilter,
        limit: MEDIA_AUDIT_PAGE_SIZE,
        offset,
      });
      setLibraryAuditLogs(result.logs);
      setLibraryAuditPagination(result.pagination);
    } catch (auditError) {
      setLibraryAuditLogs([]);
      setLibraryAuditPagination({ total: 0, limit: MEDIA_AUDIT_PAGE_SIZE, offset, hasMore: false });
      setLibraryAuditError(auditError instanceof Error ? auditError.message : 'Unable to load media activity.');
    } finally {
      setIsLoadingLibraryAudit(false);
    }
  }, [canExportMediaActivity, libraryAuditActionFilter, siteId]);

  const loadAssetAuditLogs = useCallback(async (mediaId: string) => {
    if (!canExportMediaActivity) {
      setAssetAuditLogs([]);
      setAssetAuditError(null);
      setIsLoadingAssetAudit(false);
      return;
    }

    setIsLoadingAssetAudit(true);
    setAssetAuditError(null);

    try {
      const result = await listAdminAuditLogs({
        siteId,
        entity: 'media',
        entityId: mediaId,
        action: assetAuditActionFilter === 'all' ? undefined : assetAuditActionFilter,
        limit: 8,
      });
      setAssetAuditLogs(result.logs);
    } catch (auditError) {
      setAssetAuditLogs([]);
      setAssetAuditError(auditError instanceof Error ? auditError.message : 'Unable to load media activity.');
    } finally {
      setIsLoadingAssetAudit(false);
    }
  }, [assetAuditActionFilter, canExportMediaActivity, siteId]);

  useEffect(() => {
    void loadLibraryAuditLogs(0);
  }, [loadLibraryAuditLogs]);

  const selectedAssetId = selectedAsset?.id;

  useEffect(() => {
    if (!selectedAssetId) {
      setAssetAuditLogs([]);
      setAssetAuditError(null);
      setIsLoadingAssetAudit(false);
      return;
    }

    void loadAssetAuditLogs(selectedAssetId);
    void loadAssetVersions(selectedAssetId);
  }, [loadAssetAuditLogs, loadAssetVersions, selectedAssetId]);

  useEffect(() => {
    setBindingTargetId('');
  }, [bindingTargetType]);

  const handleCreateSignedUrl = async () => {
    if (isMediaMutationBusy) return;
    if (!canViewMedia) {
      setAssetDeliveryError(`Your account needs media.view to generate signed delivery URLs. ${viewPermissionTitle}`);
      return;
    }

    if (!selectedAsset) {
      return;
    }

    if (selectedMediaSecurity.status === 'quarantined') {
      setAssetDeliveryError('Quarantined media cannot generate signed delivery URLs.');
      return;
    }

    setIsCreatingSignedUrl(true);
    setAssetDeliveryError(null);

    try {
      const nextSignedUrl = await createSignedMediaUrl(selectedAsset.id, {
        expiresInSeconds: signedUrlSeconds,
        disposition: signedUrlDisposition,
      }, siteId);
      setSignedUrl(nextSignedUrl);
    } catch (signedUrlError) {
      setAssetDeliveryError(signedUrlError instanceof Error ? signedUrlError.message : 'Unable to create a signed URL.');
    } finally {
      setIsCreatingSignedUrl(false);
    }
  };

  const handlePrepareTransforms = async () => {
    if (isMediaMutationBusy) return;
    if (!canEditMedia) {
      setAssetDeliveryError(deniedEditMessage);
      return;
    }

    if (!selectedAsset || selectedAsset.type !== 'image') {
      return;
    }

    if (selectedMediaSecurity.status === 'quarantined') {
      setAssetDeliveryError('Quarantined media cannot prepare image transforms.');
      return;
    }

    setIsPreparingTransforms(true);
    setAssetDeliveryError(null);

    try {
      const updated = await prepareMediaTransforms(selectedAsset.id, {
        siteId,
        widths: DEFAULT_RESPONSIVE_WIDTHS,
        quality: DEFAULT_RESPONSIVE_QUALITY,
        sizes: DEFAULT_RESPONSIVE_SIZES,
        preparedBy: 'admin',
      });
      applyUpdatedAsset(updated);
      void loadAssetAuditLogs(updated.id);
      void loadLibraryAuditLogs(0);
    } catch (prepareError) {
      setAssetDeliveryError(prepareError instanceof Error ? prepareError.message : 'Unable to prepare responsive variants.');
    } finally {
      setIsPreparingTransforms(false);
    }
  };

  const handleSaveProviderAnalytics = async () => {
    if (isMediaMutationBusy || !selectedAsset) return;
    if (!canEditMedia) {
      setAssetDeliveryError(deniedEditMessage);
      return;
    }

    const totalRequests = Math.max(0, Math.floor(Number(providerAnalyticsRequests) || 0));
    const bytesServed = Math.max(0, Math.floor(Number(providerAnalyticsBytes) || 0));
    const conversions = Math.max(0, Math.floor(Number(providerAnalyticsConversions) || 0));
    const conversionValue = Math.max(0, Number(providerAnalyticsValue) || 0);
    const currency = providerAnalyticsCurrency.trim().toUpperCase() || 'USD';
    const attributionWindow = providerAnalyticsAttributionWindow.trim() || 'last-click';
    const source = providerAnalyticsSource.trim() || 'provider-console';
    const reportingWindow = providerAnalyticsWindow.trim() || 'last-30-days';

    setIsSavingProviderAnalytics(true);
    setAssetDeliveryError(null);
    setAssetProviderAnalyticsNotice(null);

    try {
      const result = await ingestMediaProviderAnalytics({
        source,
        reportingWindow,
        mergeMode: 'replace',
        currency,
        attributionWindow,
        entries: [{
          mediaId: selectedAsset.id,
          storagePath: typeof selectedAsset.metadata?.storagePath === 'string' ? selectedAsset.metadata.storagePath : undefined,
          url: selectedAsset.url,
          totalRequests,
          bytesServed,
          conversions,
          conversionValue,
          currency,
          attributionWindow,
          source,
          reportingWindow,
        }],
      }, siteId);
      const matched = result.matched.find((entry) => entry.mediaId === selectedAsset.id);

      if (!matched) {
        throw new Error('Provider analytics were accepted but did not match this asset.');
      }

      const updated: MediaAsset = {
        ...selectedAsset,
        metadata: {
          ...selectedAsset.metadata,
          providerDelivery: {
            ...(selectedAsset.metadata?.providerDelivery && typeof selectedAsset.metadata.providerDelivery === 'object'
              ? selectedAsset.metadata.providerDelivery
              : {}),
            totalRequests: matched.totalRequests,
            bytesServed: matched.bytesServed,
            conversions: matched.conversions,
            conversionValue: matched.conversionValue,
            conversionRate: matched.totalRequests > 0 ? Number(((matched.conversions / matched.totalRequests) * 100).toFixed(4)) : 0,
            currency,
            attributionWindow,
            source,
            reportingWindow,
            lastSyncedAt: new Date().toISOString(),
            ingestMode: result.mergeMode,
            matchedBy: matched.matchedBy,
          },
        },
      };
      applyUpdatedAsset(updated);
      setAssetProviderAnalyticsNotice('Provider metrics recorded through analytics ingest.');
      void loadLibrary();
      void loadAssetAuditLogs(updated.id);
      void loadLibraryAuditLogs(0);
    } catch (providerError) {
      setAssetDeliveryError(providerError instanceof Error ? providerError.message : 'Unable to record provider metrics.');
    } finally {
      setIsSavingProviderAnalytics(false);
    }
  };

  const handleQuarantineAsset = async () => {
    if (isMediaMutationBusy || !selectedAsset) return;
    if (!canEditMedia) {
      setError(deniedEditMessage);
      return;
    }

    setIsUpdatingSafety(true);
    setAssetDeliveryError(null);
    setError(null);

    try {
      const updated = await updateMedia(selectedAsset.id, {
        visibility: 'private',
        metadata: {
          ...selectedAsset.metadata,
          mediaSecurity: {
            status: 'quarantined',
            quarantinedAt: new Date().toISOString(),
            quarantinedBy: 'admin',
            reason: 'Manual quarantine from media safety review',
            previousVisibility: selectedAsset.visibility || 'public',
          },
        },
      }, siteId);
      applyUpdatedAsset(updated);
      setMetadataForm((current) => ({ ...current, visibility: 'private' }));
      setSignedUrl(null);
      void loadLibrary();
      void loadAssetAuditLogs(updated.id);
      void loadLibraryAuditLogs(0);
    } catch (quarantineError) {
      setError(quarantineError instanceof Error ? quarantineError.message : 'Unable to quarantine media.');
    } finally {
      setIsUpdatingSafety(false);
    }
  };

  const handleReleaseQuarantine = async () => {
    if (isMediaMutationBusy || !selectedAsset) return;
    if (!canEditMedia) {
      setError(deniedEditMessage);
      return;
    }

    const previousVisibility = selectedMediaSecurity.previousVisibility === 'private' ? 'private' : 'public';
    setIsUpdatingSafety(true);
    setAssetDeliveryError(null);
    setError(null);

    try {
      const updated = await updateMedia(selectedAsset.id, {
        visibility: previousVisibility,
        metadata: {
          ...selectedAsset.metadata,
          mediaSecurity: {
            status: 'clear',
            clearedAt: new Date().toISOString(),
            clearedBy: 'admin',
            previousStatus: 'quarantined',
          },
        },
      }, siteId);
      applyUpdatedAsset(updated);
      setMetadataForm((current) => ({ ...current, visibility: updated.visibility || previousVisibility }));
      setSignedUrl(null);
      void loadLibrary();
      void loadAssetAuditLogs(updated.id);
      void loadLibraryAuditLogs(0);
    } catch (releaseError) {
      setError(releaseError instanceof Error ? releaseError.message : 'Unable to release media quarantine.');
    } finally {
      setIsUpdatingSafety(false);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (isMediaMutationBusy || !canCreateMedia) {
      e.dataTransfer.dropEffect = 'none';
      setIsDragging(false);
      return;
    }
    e.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileUpload = async (fileList: FileList | null) => {
    if (isMediaMutationBusy) return;
    if (!canCreateMedia) {
      setError(deniedCreateMessage);
      return;
    }
    if (!fileList || fileList.length === 0) return;
    const allFiles = Array.from(fileList);
    const targetUploadMode = uploadMode;
    const uploadFiles = allFiles.filter((file) => isFileAllowedForUploadMode(file, targetUploadMode));
    const skippedModeMessages = allFiles
      .filter((file) => !isFileAllowedForUploadMode(file, targetUploadMode))
      .map((file) => uploadModeRejectMessage(file, targetUploadMode));
    const targetFolderMode = uploadFolderId;
    const targetFolderId = uploadTargetFolderId;
    const targetFolderLabel = uploadTargetFolderLabel;
    const targetVisibility = uploadVisibility;
    const targetTags = uploadTagList;

    setIsUploading(true);
    setError(null);
    setBulkNotice(null);

    try {
      const uploadRequests = uploadFiles.map((file) => {
        const uploadType = getCentralUploadType(file);
        const uploadTagsForFile = uploadType === 'font'
          ? Array.from(new Set(['font', ...targetTags]))
          : targetTags;

        return uploadMedia(file, {
          siteId,
          scope: 'global',
          folderId: targetFolderId,
          visibility: targetVisibility,
          tags: uploadTagsForFile.length ? uploadTagsForFile : undefined,
          fontFamily: uploadType === 'font' ? cleanFontFamilyFromFilename(file.name) : undefined,
          fontWeight: uploadType === 'font' ? '400' : undefined,
          fontStyle: uploadType === 'font' ? 'normal' : undefined,
          fontFallback: uploadType === 'font' ? 'system-ui, sans-serif' : undefined,
          fontDisplay: uploadType === 'font' ? 'swap' : undefined,
        });
      });
      const results = await Promise.allSettled(uploadRequests);
      const uploaded = results
        .filter((result): result is PromiseFulfilledResult<MediaAsset> => result.status === 'fulfilled')
        .map((result) => result.value);
      const failures = results.filter((result) => result.status === 'rejected');
      const failureMessages = [
        ...skippedModeMessages,
        ...failures.map((failure) => (
          failure.reason instanceof Error ? failure.reason.message : 'Upload failed.'
        )),
      ];

      if (uploaded.length) {
        setMedia([...uploaded, ...files.filter((file) => !uploaded.some((item) => item.id === file.id))]);
        if (targetFolderMode !== 'current') {
          setSelectedFolderId(targetFolderId);
          updateMediaRouteSearch({ folderId: folderSelectionToRoute(targetFolderId) });
        }
        setBulkNotice(`${uploaded.length} file${uploaded.length === 1 ? '' : 's'} uploaded to ${targetFolderLabel}.`);
        void loadLibrary();
        void loadLibraryAuditLogs(0);
      }

      setRecentUploadSummary({
        attempted: allFiles.length,
        uploaded: uploaded.length,
        failed: failureMessages.length,
        fontsRegistered: uploaded.filter((asset) => asset.type === 'font').length,
        folderLabel: targetFolderLabel,
        visibility: targetVisibility,
        assets: uploaded.map((asset) => ({
          id: asset.id,
          name: asset.name,
          type: asset.type,
          size: asset.size,
        })),
        failures: failureMessages,
        completedAt: new Date().toISOString(),
      });

      if (failureMessages.length) {
        const firstReason = failureMessages[0];
        setError(firstReason
          ? `${firstReason}. ${failureMessages.length} file${failureMessages.length === 1 ? '' : 's'} were not uploaded.`
          : `${failureMessages.length} file${failureMessages.length === 1 ? '' : 's'} were not uploaded.`);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteAsset = async (file: MediaAsset) => {
    if (isMediaMutationBusy) return;
    if (!canDeleteMedia) {
      setError(deniedDeleteMessage);
      setPendingDeleteAsset(null);
      return;
    }

    setError(null);
    setBulkNotice(null);
    setIsDeletingAsset(true);

    try {
      await deleteMediaFromBackend(file.id, siteId);
      deleteMedia(file.id);
      if (selectedAsset?.id === file.id) {
        setSelectedAsset(null);
        updateMediaRouteSearch({ assetId: undefined });
      }
      setPendingDeleteAsset(null);
      setBulkNotice(`Deleted ${file.name}.`);
      void loadLibraryAuditLogs(0);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete media.');
    } finally {
      setIsDeletingAsset(false);
    }
  };

  const toggleMediaSelection = (mediaId: string) => {
    if (isMediaLibraryBusy) return;
    if (!canBulkSelectMedia) {
      setBulkNotice(null);
      setError(deniedBulkSelectionMessage);
      return;
    }

    setBulkNotice(null);
    setPendingBulkDelete(false);
    setSelectedMediaIds((current) => (
      current.includes(mediaId)
        ? current.filter((id) => id !== mediaId)
        : [...current, mediaId]
    ));
  };

  const handleSelectVisibleMedia = () => {
    if (isMediaLibraryBusy) return;
    if (!canBulkSelectMedia) {
      setBulkNotice(null);
      setError(deniedBulkSelectionMessage);
      return;
    }

    setBulkNotice(null);
    setSelectedMediaIds((current) => {
      const next = new Set(current);
      displayedFiles.forEach((file) => next.add(file.id));
      return Array.from(next);
    });
  };

  const handleClearSelection = () => {
    if (isMediaLibraryBusy) return;

    setBulkNotice(null);
    setPendingBulkDelete(false);
    setSelectedMediaIds([]);
  };

  const handleClearHiddenSelection = () => {
    if (isMediaLibraryBusy) return;

    setBulkNotice(null);
    setPendingBulkDelete(false);
    setSelectedMediaIds((current) => current.filter((id) => visibleMediaSet.has(id)));
  };

  const handleBulkUpdate = async () => {
    if (isMediaMutationBusy) return;
    if (!canEditMedia) {
      setError(deniedEditMessage);
      return;
    }

    if (selectedMediaAssets.length === 0 || !hasBulkChange) {
      return;
    }

    const baseInput = {
      ...(bulkFolderId !== 'keep' ? { folderId: bulkFolderId === 'root' ? null : bulkFolderId } : {}),
    };

    setIsBulkUpdating(true);
    setError(null);
    setBulkNotice(null);

    const results = await Promise.allSettled(
      selectedMediaAssets.map((asset) => {
        const nextTags = bulkTagMode === 'clear'
          ? []
          : bulkTagMode === 'replace'
            ? bulkTagList
            : bulkTagMode === 'merge'
              ? normalizeTagValues([...(asset.tags || []), ...bulkTagList])
              : undefined;
        const currentSecurity = getMediaSecurityPolicy(asset.metadata);
        const nextVisibility = bulkSafetyAction === 'quarantine'
          ? 'private'
          : bulkSafetyAction === 'release'
            ? bulkVisibility !== 'keep'
              ? bulkVisibility
              : currentSecurity.previousVisibility === 'private'
                ? 'private'
                : 'public'
            : bulkVisibility !== 'keep'
              ? bulkVisibility
              : undefined;
        const nextMetadata = bulkSafetyAction === 'quarantine'
          ? {
              ...asset.metadata,
              mediaSecurity: {
                status: 'quarantined',
                quarantinedAt: new Date().toISOString(),
                quarantinedBy: 'admin',
                reason: 'Bulk quarantine from media safety review',
                previousVisibility: asset.visibility || 'public',
              },
            }
          : bulkSafetyAction === 'release'
            ? {
                ...asset.metadata,
                mediaSecurity: {
                  status: 'clear',
                  clearedAt: new Date().toISOString(),
                  clearedBy: 'admin',
                  previousStatus: currentSecurity.status,
                },
              }
            : undefined;

        return updateMedia(asset.id, {
          ...baseInput,
          ...(nextVisibility ? { visibility: nextVisibility } : {}),
          ...(nextMetadata ? { metadata: nextMetadata } : {}),
          ...(nextTags !== undefined ? { tags: nextTags } : {}),
        }, siteId);
      }),
    );
    const updated = results
      .filter((result): result is PromiseFulfilledResult<MediaAsset> => result.status === 'fulfilled')
      .map((result) => result.value);
    const failedIds = selectedMediaAssets
      .filter((_, index) => results[index]?.status === 'rejected')
      .map((asset) => asset.id);

    if (updated.length > 0) {
      const updatedById = new Map(updated.map((asset) => [asset.id, asset]));
      setMedia(files.map((file) => updatedById.get(file.id) || file));
      if (selectedAsset && updatedById.has(selectedAsset.id)) {
        setSelectedAsset(updatedById.get(selectedAsset.id) || selectedAsset);
        void loadAssetAuditLogs(selectedAsset.id);
      }
      setBulkVisibility('keep');
      setBulkFolderId('keep');
      setBulkSafetyAction('keep');
      setBulkTagMode('keep');
      setBulkTags('');
      void loadLibrary();
      void loadLibraryAuditLogs(0);
    }

    if (failedIds.length > 0) {
      setSelectedMediaIds(failedIds);
      setError(`${failedIds.length} selected asset${failedIds.length === 1 ? '' : 's'} could not be updated.`);
    } else {
      setSelectedMediaIds([]);
      setBulkNotice(`Updated ${updated.length} asset${updated.length === 1 ? '' : 's'}.`);
    }

    setIsBulkUpdating(false);
  };

  const handleBulkDelete = async () => {
    if (isMediaMutationBusy) return;
    if (!canDeleteMedia) {
      setError(deniedDeleteMessage);
      setPendingBulkDelete(false);
      return;
    }

    if (selectedMediaAssets.length === 0) {
      return;
    }

    if (!pendingBulkDelete) {
      setPendingBulkDelete(true);
      return;
    }

    setIsBulkUpdating(true);
    setError(null);
    setBulkNotice(null);

    const results = await Promise.allSettled(
      selectedMediaAssets.map((asset) => deleteMediaFromBackend(asset.id, siteId)),
    );
    const deletedIds = selectedMediaAssets
      .filter((_, index) => results[index]?.status === 'fulfilled')
      .map((asset) => asset.id);
    const failedIds = selectedMediaAssets
      .filter((_, index) => results[index]?.status === 'rejected')
      .map((asset) => asset.id);
    const deletedIdSet = new Set(deletedIds);

    if (deletedIds.length > 0) {
      setMedia(files.filter((file) => !deletedIdSet.has(file.id)));
      if (selectedAsset && deletedIdSet.has(selectedAsset.id)) {
        setSelectedAsset(null);
        updateMediaRouteSearch({ assetId: undefined });
      }
      void loadLibrary();
      void loadLibraryAuditLogs(0);
    }

    if (failedIds.length > 0) {
      setSelectedMediaIds(failedIds);
      setPendingBulkDelete(false);
      setError(`${failedIds.length} selected asset${failedIds.length === 1 ? '' : 's'} could not be deleted.`);
    } else {
      setSelectedMediaIds([]);
      setPendingBulkDelete(false);
      setBulkNotice(`Deleted ${deletedIds.length} asset${deletedIds.length === 1 ? '' : 's'}.`);
    }

    setIsBulkUpdating(false);
  };

  const handleSaveMetadata = async () => {
    if (isMediaMutationBusy) return;
    if (!canEditMedia) {
      setError(deniedEditMessage);
      return;
    }

    if (!selectedAsset) {
      return;
    }

    setIsSavingMetadata(true);
    setError(null);
    setBulkNotice(null);

    try {
      const updated = await updateMedia(selectedAsset.id, {
        originalName: metadataForm.name,
        altText: metadataForm.altText,
        caption: metadataForm.caption,
        tags: metadataForm.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        metadata: {
          ...selectedAsset.metadata,
          ...(selectedAsset.type === 'font'
            ? {
                fontFamily: metadataForm.fontFamily.trim() || metadataForm.name.replace(/\.[a-z0-9]+$/i, ''),
                fontWeight: metadataForm.fontWeight.trim() || '400',
                fontStyle: metadataForm.fontStyle,
                fontFallback: metadataForm.fontFallback.trim() || 'system-ui, sans-serif',
                fontDisplay: metadataForm.fontDisplay,
              }
            : {}),
          ...(selectedAsset.type === 'image'
            ? {
                imagePresentation: {
                  focalPoint: {
                    x: clampPercent(metadataForm.imageFocalX),
                    y: clampPercent(metadataForm.imageFocalY),
                  },
                  objectFit: metadataForm.imageObjectFit,
                  aspectRatio: metadataForm.imageAspectRatio,
                  updatedAt: new Date().toISOString(),
                },
              }
            : {}),
        },
        folderId: metadataForm.folderId || null,
        visibility: metadataForm.visibility,
      }, siteId);
      setMedia(files.map((file) => file.id === updated.id ? updated : file));
      setSelectedAsset(updated);
      setBulkNotice(`${updated.name} details saved.`);
      void loadAssetAuditLogs(updated.id);
      void loadLibraryAuditLogs(0);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update media metadata.');
    } finally {
      setIsSavingMetadata(false);
    }
  };

  const applyUpdatedAsset = (updated: MediaAsset) => {
    setMedia(files.map((file) => file.id === updated.id ? updated : file));
    setSelectedAsset(updated);
  };

  const handleReplaceAsset = async (fileList: FileList | null) => {
    if (isMediaMutationBusy) return;
    if (!canEditMedia) {
      setAssetReplacementError(deniedEditMessage);
      return;
    }

    if (!selectedAsset || !fileList || fileList.length === 0) {
      return;
    }

    const [file] = Array.from(fileList);
    if (!file) {
      return;
    }

    setIsReplacingAsset(true);
    setAssetReplacementError(null);

    try {
      const isFontReplacement = selectedAsset.type === 'font';
      const updated = await replaceMedia(selectedAsset.id, file, {
        siteId,
        replacedBy: 'admin',
        reason: 'Manual replacement from media detail',
        fontFamily: isFontReplacement
          ? metadataForm.fontFamily.trim() || cleanFontFamilyFromFilename(file.name)
          : undefined,
        fontWeight: isFontReplacement ? metadataForm.fontWeight.trim() || '400' : undefined,
        fontStyle: isFontReplacement ? metadataForm.fontStyle : undefined,
        fontFallback: isFontReplacement ? metadataForm.fontFallback.trim() || 'system-ui, sans-serif' : undefined,
        fontDisplay: isFontReplacement ? metadataForm.fontDisplay : undefined,
      });
      applyUpdatedAsset(updated);
      void loadLibrary();
      void loadAssetAuditLogs(updated.id);
      void loadLibraryAuditLogs(0);
      void loadAssetVersions(updated.id);
    } catch (replaceError) {
      setAssetReplacementError(replaceError instanceof Error ? replaceError.message : 'Unable to replace this asset.');
    } finally {
      setIsReplacingAsset(false);
    }
  };

  const handleDeleteAssetVersion = async (version: ReplacementVersion) => {
    if (isMediaMutationBusy || !selectedAsset || !version.id) return;
    if (!canDeleteMedia) {
      setAssetReplacementError(deniedDeleteMessage);
      return;
    }

    if (pendingDeleteVersionId !== version.id) {
      setPendingDeleteVersionId(version.id);
      setPendingRestoreVersionId(null);
      setComparisonVersionId(null);
      return;
    }

    setIsDeletingAssetVersion(true);
    setAssetReplacementError(null);

    try {
      const result = await deleteMediaVersion(selectedAsset.id, version.id, siteId);
      if (result.media) {
        applyUpdatedAsset(result.media);
      }
      setPendingDeleteVersionId(null);
      void loadLibrary();
      void loadAssetAuditLogs(selectedAsset.id);
      void loadLibraryAuditLogs(0);
      void loadAssetVersions(selectedAsset.id);
    } catch (deleteError) {
      setAssetReplacementError(deleteError instanceof Error ? deleteError.message : 'Unable to delete retained version.');
    } finally {
      setIsDeletingAssetVersion(false);
    }
  };

  const handleRestoreAssetVersion = async (version: ReplacementVersion) => {
    if (isMediaMutationBusy || !selectedAsset || !version.id) return;
    if (!canEditMedia) {
      setAssetReplacementError(deniedEditMessage);
      return;
    }

    if (pendingRestoreVersionId !== version.id) {
      setPendingRestoreVersionId(version.id);
      setPendingDeleteVersionId(null);
      setComparisonVersionId(null);
      return;
    }

    setIsRestoringAssetVersion(true);
    setAssetReplacementError(null);

    try {
      const result = await restoreMediaVersion(selectedAsset.id, version.id, siteId);
      applyUpdatedAsset(result.media);
      setPendingRestoreVersionId(null);
      void loadLibrary();
      void loadAssetAuditLogs(result.media.id);
      void loadLibraryAuditLogs(0);
      void loadAssetVersions(result.media.id);
    } catch (restoreError) {
      setAssetReplacementError(restoreError instanceof Error ? restoreError.message : 'Unable to restore retained version.');
    } finally {
      setIsRestoringAssetVersion(false);
    }
  };

  const handleBindTarget = async () => {
    if (isMediaMutationBusy) return;
    if (!canEditMedia) {
      setAssetReferenceError(deniedEditMessage);
      return;
    }

    if (!selectedAsset || !bindingTargetId) {
      return;
    }

    setIsUpdatingBinding(true);
    setAssetReferenceError(null);

    try {
      const updated = await bindMediaToTarget(selectedAsset.id, {
        targetType: bindingTargetType,
        targetId: bindingTargetId,
        action: 'bind',
        usageType: bindingUsageType,
        attachedBy: 'admin',
      }, siteId);
      applyUpdatedAsset(updated);
      setBindingTargetId('');
      void loadAssetAuditLogs(updated.id);
      void loadLibraryAuditLogs(0);
    } catch (bindError) {
      setAssetReferenceError(bindError instanceof Error ? bindError.message : 'Unable to bind this asset.');
    } finally {
      setIsUpdatingBinding(false);
    }
  };

  const handleUnbindTarget = async (targetType: 'page' | 'post', targetId: string) => {
    if (isMediaMutationBusy) return;
    if (!canEditMedia) {
      setAssetReferenceError(deniedEditMessage);
      return;
    }

    if (!selectedAsset) {
      return;
    }

    setIsUpdatingBinding(true);
    setAssetReferenceError(null);

    try {
      const updated = await bindMediaToTarget(selectedAsset.id, {
        targetType,
        targetId,
        action: 'unbind',
        usageType: 'content',
        attachedBy: 'admin',
      }, siteId);
      applyUpdatedAsset(updated);
      void loadAssetAuditLogs(updated.id);
      void loadLibraryAuditLogs(0);
    } catch (unbindError) {
      setAssetReferenceError(unbindError instanceof Error ? unbindError.message : 'Unable to remove this reference.');
    } finally {
      setIsUpdatingBinding(false);
    }
  };

  const handleCreateFolder = async () => {
    if (isMediaMutationBusy) return;
    if (!canCreateMedia) {
      setError(deniedCreateMessage);
      return;
    }

    const name = newFolderName.trim();
    if (!name) {
      return;
    }

    setIsCreatingFolder(true);
    setError(null);

    try {
      const parentId = newFolderParentId === 'root' ? null : newFolderParentId;
      const duplicateFolder = folders.find((folder) => (
        folder.parentId === parentId &&
        folder.name.trim().toLowerCase() === name.toLowerCase()
      ));
      if (duplicateFolder) {
        setError(`A sibling folder named ${name} already exists.`);
        return;
      }

      const folder = await createMediaFolder(name, siteId, { parentId });
      setFolders((current) => [...current, folder].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)));
      setSelectedFolderId(folder.id);
      updateMediaRouteSearch({ folderId: folder.id });
      setEditingFolderId(null);
      setEditingFolderName('');
      setEditingFolderParentId('root');
      setNewFolderName('');
      setNewFolderParentId(parentId || 'root');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create folder.');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const startEditingFolder = (folder: MediaFolder) => {
    if (isMediaLibraryBusy) return;
    if (!canEditMedia) {
      setError(deniedEditMessage);
      return;
    }

    setEditingFolderId(folder.id);
    setEditingFolderName(folder.name);
    setEditingFolderParentId(folder.parentId || 'root');
    setError(null);
  };

  const cancelEditingFolder = () => {
    setEditingFolderId(null);
    setEditingFolderName('');
    setEditingFolderParentId('root');
  };

  const handleRenameFolder = async (folderId: string) => {
    if (isMediaMutationBusy) return;
    if (!canEditMedia) {
      setError(deniedEditMessage);
      return;
    }

    const name = editingFolderName.trim();
    if (!name) {
      setError('Folder name is required.');
      return;
    }

    const parentId = editingFolderParentId === 'root' ? null : editingFolderParentId;
    const duplicateFolder = folders.find((folder) => (
      folder.id !== folderId &&
      folder.parentId === parentId &&
      folder.name.trim().toLowerCase() === name.toLowerCase()
    ));
    if (duplicateFolder) {
      setError(`A sibling folder named ${name} already exists.`);
      return;
    }

    setIsUpdatingFolder(true);
    setError(null);

    try {
      const folder = await updateMediaFolder(folderId, { name, parentId }, siteId);
      setFolders((current) => current
        .map((item) => item.id === folder.id ? folder : item)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)));
      setBulkNotice(`Folder saved as ${folder.name}.`);
      cancelEditingFolder();
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : 'Unable to update folder.');
    } finally {
      setIsUpdatingFolder(false);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (isMediaMutationBusy) return;
    if (!canDeleteMedia) {
      setError(deniedDeleteMessage);
      setPendingDeleteFolder(null);
      return;
    }

    const folder = folders.find((item) => item.id === folderId);
    if (!folder) {
      return;
    }

    setError(null);
    setIsDeletingFolder(true);

    try {
      await deleteMediaFolder(folderId, siteId);
      setFolders((current) => current
        .filter((item) => item.id !== folderId)
        .map((item) => item.parentId === folderId ? { ...item, parentId: null } : item));
      setMedia(files.map((file) => file.folderId === folderId ? { ...file, folderId: null } : file));
      if (selectedFolderId === folderId) {
        setSelectedFolderId(undefined);
        updateMediaRouteSearch({ folderId: undefined });
      }
      if (editingFolderId === folderId) {
        cancelEditingFolder();
      }
      if (newFolderParentId === folderId) {
        setNewFolderParentId('root');
      }
      if (editingFolderParentId === folderId) {
        setEditingFolderParentId('root');
      }
      setPendingDeleteFolder(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete folder.');
    } finally {
      setIsDeletingFolder(false);
    }
  };

  const copyMediaApiText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setError(null);
      setBulkNotice(`${label} copied.`);
    } catch {
      setBulkNotice(null);
      setError(value);
    }
  };
  const copyMediaHandoffManifest = async () => {
    if (!canExportMediaActivity) {
      setBulkNotice(null);
      setError(deniedExportMessage);
      return;
    }
    await copyMediaApiText(mediaHandoffText, 'Media handoff manifest');
  };
  const downloadMediaHandoff = () => {
    if (!canExportMediaActivity) {
      setBulkNotice(null);
      setError(deniedExportMessage);
      return;
    }

    const blob = new Blob([mediaHandoffText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${siteId}-backy-media-handoff.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setError(null);
    setBulkNotice('Media handoff manifest downloaded.');
  };
  const exportMediaCsv = () => {
    if (!canExportMediaActivity) {
      setBulkNotice(null);
      setError(deniedExportMessage);
      return;
    }
    if (displayedFiles.length === 0) return;

    const rows = displayedFiles.map((asset) => {
      const exportRecord = mediaAssetToExportRecord(asset, folders, siteId);
      return MEDIA_EXPORT_COLUMNS.map((column) => exportRecord[column]);
    });
    const csv = [MEDIA_EXPORT_COLUMNS, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${siteId}-media-library.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setError(null);
    setBulkNotice(`${displayedFiles.length} visible media asset${displayedFiles.length === 1 ? '' : 's'} exported.`);
  };
  const exportMediaAuditCsv = () => {
    if (!canExportMediaActivity) {
      setBulkNotice(null);
      setError(deniedExportMessage);
      return;
    }
    if (libraryAuditLogs.length === 0) return;

    const columns = ['createdAt', 'action', 'entityId', 'actorId', 'requestId', 'summary', 'details'];
    const rows = libraryAuditLogs.map((log) => {
      const details = mediaAuditDetails(log)
        .map((detail) => `${detail.label}: ${detail.value}`)
        .join(' | ');
      return [
        log.createdAt,
        log.action,
        log.entityId,
        log.actorId || 'admin',
        log.requestId || '',
        mediaAuditDescription(log),
        details,
      ];
    });
    const csv = [columns, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${siteId}-media-activity.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setError(null);
    setBulkNotice(`${libraryAuditLogs.length} media activity record${libraryAuditLogs.length === 1 ? '' : 's'} exported.`);
  };

  const referencedPages = selectedAsset
    ? (selectedAsset.targetPageIds || []).map((pageId) => ({
        id: pageId,
        page: pages.find((page) => page.id === pageId),
      }))
    : [];
  const referencedPosts = selectedAsset
    ? (selectedAsset.targetPostIds || []).map((postId) => ({
        id: postId,
        post: posts.find((post) => post.id === postId),
      }))
    : [];

  return (
    <PageShell
      title="Media Library"
      description="Upload, organize, protect, transform, and deliver every image, font, document, audio, video, and file used across Backy sites."
      action={
        <div className="relative">
          <input
            type="file"
            id="header-upload"
            className="hidden"
            multiple
            accept={activeUploadMode.accept}
            aria-label="Upload media files"
            disabled={isMediaMutationBusy || !canCreateMedia}
            onChange={(e) => {
              void handleFileUpload(e.target.files);
              e.currentTarget.value = '';
            }}
          />
          <label
            htmlFor="header-upload"
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 cursor-pointer transition-colors",
              (isMediaMutationBusy || !canCreateMedia) && "pointer-events-none opacity-70"
            )}
            title={canCreateMedia ? undefined : createPermissionTitle}
          >
            <Upload className="w-4 h-4" />
            {isUploading ? 'Uploading...' : 'Upload'}
          </label>
        </div>
      }
    >
      <section className="mb-6 rounded-lg border border-border bg-card p-5 shadow-sm" data-testid="media-library-command-center">
        {permissionError && (
          <Notice tone="warning" className="mb-4">
            {permissionError}
          </Notice>
        )}
        {isPermissionMatrixPending && (
          <Notice tone="info" className="mb-4">
            Loading media permissions before enabling library actions.
          </Notice>
        )}
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Media command center</h2>
              <span className={cn(
                'rounded-full px-2.5 py-1 text-xs font-semibold',
                mediaLibraryReadiness.score >= 80
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700',
              )}
              >
                {mediaLibraryReadiness.score}% ready
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Control the central file layer for every site: uploads, folders, visibility, signed delivery, transforms, font files, and frontend media APIs.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Active media site"
              value={siteId}
              disabled={isMediaLibraryBusy}
              onChange={(event) => {
                if (isMediaLibraryBusy) return;
                const nextSiteId = event.target.value;
                setSelectedSiteId(nextSiteId);
                resetMediaWorkspaceState();
                navigate({ to: '/media', search: { siteId: nextSiteId }, replace: true });
              }}
              className="min-h-10 min-w-56 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sites.length === 0 ? (
                <option value={getDefaultMediaSiteId()}>Demo site</option>
              ) : sites.map((site) => (
                <option key={site.id} value={site.publicSiteId || site.id}>
                  {site.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void copyMediaHandoffManifest()}
              disabled={isMediaLibraryBusy || !canExportMediaActivity}
              title={!canExportMediaActivity ? activityPermissionTitle : undefined}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Copy className="h-4 w-4" />
              Copy manifest
            </button>
            <button
              type="button"
              onClick={downloadMediaHandoff}
              disabled={isMediaLibraryBusy || !canExportMediaActivity}
              title={!canExportMediaActivity ? activityPermissionTitle : undefined}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              Download JSON
            </button>
            <button
              type="button"
              onClick={exportMediaCsv}
              disabled={displayedFiles.length === 0 || isMediaLibraryBusy || !canExportMediaActivity}
              title={activityPermissionTitle}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <label
              htmlFor="header-upload"
              className={cn(
                'inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90',
                (isMediaMutationBusy || !canCreateMedia) && 'pointer-events-none opacity-70',
              )}
              title={canCreateMedia ? undefined : createPermissionTitle}
            >
              <Upload className="h-4 w-4" />
              Upload files
            </label>
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Library readiness</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Checks whether media can be uploaded, organized, transformed, protected, and delivered to custom frontends.
                </p>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {files.length} assets
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full',
                  mediaLibraryReadiness.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500',
                )}
                style={{ width: `${mediaLibraryReadiness.score}%` }}
              />
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {mediaLibraryReadiness.checks.map((check) => (
                <MediaReadinessCheck key={check.label} {...check} />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Media workflow</h3>
            </div>
            <div className="mt-3 grid gap-2">
              {mediaLibraryReadiness.workflow.map((step, index) => (
                <MediaWorkflowStep key={step.label} index={index + 1} {...step} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <div>
            <h3 className="text-sm font-semibold">Media control map</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Jump to upload, API, storage, folders, bulk controls, and font delivery settings.
            </p>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {MEDIA_CONTROL_AREAS.map((area) => (
              <a
                key={area.title}
                href={area.href}
                className="rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="text-sm font-semibold text-foreground">{area.title}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">{area.detail}</div>
              </a>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Connected media workflows</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Route assets from the central library into editors, storefronts, downloads, and storage configuration.
              </p>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {MEDIA_USAGE_SURFACES.length} surfaces
            </span>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {MEDIA_USAGE_SURFACES.map((surface) => (
              <Link
                key={surface.title}
                to={surface.route}
                search={surface.route === '/settings' ? undefined : activeSiteRouteSearch}
                className="rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="text-sm font-semibold text-foreground">{surface.title}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">{surface.detail}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div id="media-upload" className="mb-8 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] scroll-mt-24">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (isMediaMutationBusy) return;
            if (!canCreateMedia) return;
            void handleFileUpload(e.dataTransfer.files);
          }}
          data-testid="media-upload-dropzone"
          className={cn(
            "relative min-h-[260px] rounded-xl border-2 border-dashed p-8 text-center transition-all",
            isDragging
              ? "border-primary bg-primary/5 scale-[1.01]"
              : "border-border hover:border-primary/50",
            isMediaMutationBusy && "cursor-not-allowed opacity-75 hover:border-border"
          )}
          title={canCreateMedia ? undefined : createPermissionTitle}
        >
          <input
            type="file"
            className="absolute inset-0 z-0 h-full w-full cursor-pointer opacity-0"
            multiple
            accept={activeUploadMode.accept}
            aria-label="Upload media files"
            data-testid="media-upload-input"
            disabled={isMediaMutationBusy || !canCreateMedia}
            onChange={(e) => {
              void handleFileUpload(e.target.files);
              e.currentTarget.value = '';
            }}
          />
          <div className="pointer-events-none mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Upload className="h-6 w-6 text-primary" />
          </div>
          <h3 className="pointer-events-none mb-1 font-semibold">
            {isUploading ? 'Uploading files' : 'Upload files'}
          </h3>
          <p className="pointer-events-none mx-auto max-w-xl text-sm text-muted-foreground">
            {activeUploadMode.detail} Uploads save as {uploadVisibility} assets into {uploadTargetFolderLabel}. Font files are registered for editor font controls and public font manifests.
          </p>
          <div className="pointer-events-none relative z-10 mt-5 flex flex-wrap justify-center gap-2">
            {MEDIA_UPLOAD_MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                disabled={isMediaMutationBusy || !canCreateMedia}
                data-testid={`media-upload-mode-${mode.value}`}
                className={cn(
                  'pointer-events-auto min-h-9 rounded-lg border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                  uploadMode === mode.value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  if (isMediaMutationBusy || !canCreateMedia) return;
                  setUploadMode(mode.value);
                }}
              >
                {mode.label}
              </button>
            ))}
          </div>
          {uploadTagList.length > 0 && (
            <div className="pointer-events-none mt-4 flex flex-wrap justify-center gap-2">
              {uploadTagList.map((tag) => (
                <span key={tag} className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {recentUploadSummary && (
            <div className="pointer-events-none mx-auto mt-5 max-w-2xl rounded-lg border border-border bg-background/90 p-3 text-left shadow-sm" data-testid="media-upload-summary">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-foreground">
                  Last upload: {recentUploadSummary.uploaded}/{recentUploadSummary.attempted} saved
                </div>
                <span className={cn(
                  'rounded-md px-2 py-1 text-xs font-medium',
                  recentUploadSummary.failed > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700',
                )}
                >
                  {recentUploadSummary.visibility} · {recentUploadSummary.folderLabel}
                </span>
                {recentUploadSummary.fontsRegistered > 0 && (
                  <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                    {recentUploadSummary.fontsRegistered} font{recentUploadSummary.fontsRegistered === 1 ? '' : 's'} registered
                  </span>
                )}
              </div>
              {recentUploadSummary.assets.length > 0 && (
                <div className="mt-2 grid gap-1">
                  {recentUploadSummary.assets.slice(0, 3).map((asset) => (
                    <div key={asset.id} className="flex items-center justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate text-muted-foreground">{asset.name}</span>
                      <span className="shrink-0 font-mono text-muted-foreground">{asset.type} · {asset.size}</span>
                    </div>
                  ))}
                  {recentUploadSummary.assets.length > 3 && (
                    <div className="text-xs text-muted-foreground">
                      +{recentUploadSummary.assets.length - 3} more file{recentUploadSummary.assets.length - 3 === 1 ? '' : 's'}
                    </div>
                  )}
                </div>
              )}
              {recentUploadSummary.failed > 0 && (
                <div className="mt-2 text-xs text-amber-700">
                  {recentUploadSummary.failed} failed: {recentUploadSummary.failures[0] || 'Upload failed.'}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Folder className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Upload defaults</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                New assets inherit these organization and delivery settings.
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Visibility
              <select
                value={uploadVisibility}
                disabled={isUploading || !canCreateMedia}
                onChange={(event) => setUploadVisibility(event.target.value === 'private' ? 'private' : 'public')}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Upload visibility"
              >
                <option value="public">Public delivery</option>
                <option value="private">Private signed delivery</option>
              </select>
            </label>

            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Destination
              <select
                value={uploadFolderId}
                disabled={isUploading || !canCreateMedia}
                onChange={(event) => setUploadFolderId(event.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Upload folder"
              >
                <option value="current">Current folder filter</option>
                <option value="root">Root</option>
                {folderOptions.map((folder) => (
                  <option key={folder.id} value={folder.id}>{folder.label}</option>
                ))}
              </select>
            </label>

            <div className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
                <span>Default tags</span>
                <span className="font-mono">{uploadTagList.length}/{DEFAULT_MAX_TAGS}</span>
              </div>
              <TagInput
                tags={uploadTagList}
                onChange={setUploadTagList}
                placeholder="Add hero, product, brand..."
                ariaLabel="Upload tags"
                disabled={isUploading || !canCreateMedia}
                className={(isUploading || !canCreateMedia) ? 'opacity-60' : undefined}
              />
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3" data-testid="media-upload-intake-rules">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-foreground">Intake rules</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Backy accepts any file and classifies known formats for editor, API, and delivery workflows.
                  </div>
                </div>
                <span className="rounded bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  central
                </span>
              </div>
              <div className="mt-3 grid gap-2">
                {MEDIA_UPLOAD_INTAKE_RULES.map((rule) => (
                  <div key={rule.label} className="rounded-md border border-border bg-background px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground">{rule.label}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{rule.examples}</span>
                    </div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">{rule.detail}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                <div className="text-muted-foreground">Folder</div>
                <div className="mt-1 truncate font-medium text-foreground">{uploadTargetFolderLabel}</div>
              </div>
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                <div className="text-muted-foreground">Visibility</div>
                <div className="mt-1 font-medium capitalize text-foreground">{uploadVisibility}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <Notice tone="warning" className="mb-6">
          {error}
        </Notice>
      )}

      {bulkNotice && (
        <Notice tone="success" className="mb-6">
          {bulkNotice}
        </Notice>
      )}

      {isLoading ? (
        <div className="mb-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Loading media library...
        </div>
      ) : null}

      <Panel className="mb-6 scroll-mt-24" id="media-api">
        <PanelHeader
          title="Frontend media API"
          description="Public delivery endpoints and private upload contract for custom frontends, editors, and storefronts."
          icon={<Code2 className="size-4" />}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void copyMediaHandoffManifest()}
                disabled={isMediaLibraryBusy || !canExportMediaActivity}
                title={!canExportMediaActivity ? activityPermissionTitle : undefined}
                iconStart={<Copy className="size-4" />}
              >
                Copy manifest
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void copyMediaApiText(publicMediaListUrl, 'Media list URL')}
                iconStart={<Copy className="size-4" />}
              >
                Copy list
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void copyMediaApiText(publicMediaFontsUrl, 'Font manifest URL')}
                iconStart={<Type className="size-4" />}
              >
                Copy fonts
              </Button>
            </div>
          }
        />
        <PanelContent>
          <div className="grid gap-3 md:grid-cols-4">
            <MediaApiStat label="Visible assets" value={`${displayedFiles.length}`} />
            <MediaApiStat label="Public assets" value={`${mediaAnalytics.publicAssets}`} />
            <MediaApiStat label="Private assets" value={`${mediaAnalytics.privateAssets}`} />
            <MediaApiStat label="Storage" value={runtimeStorage?.configured ? 'configured' : 'needs config'} />
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <MediaApiSnippet label="Public media list" value={publicMediaListUrl} />
            <MediaApiSnippet label="Public media detail" value={publicMediaDetailUrl} />
            <MediaApiSnippet label="Font manifest" value={publicMediaFontsUrl} />
            <MediaApiSnippet label="File delivery" value={publicMediaFileUrl} />
            <MediaApiSnippet label="Image transform" value={publicMediaTransformUrl} />
            <MediaApiSnippet label="Admin upload" value={adminMediaUploadUrl} />
            <MediaApiSnippet label="Admin folders" value={adminMediaFoldersUrl} />
            <MediaApiSnippet label="Admin folder detail" value={adminMediaFolderUrl} />
            <MediaApiSnippet label="Provider analytics ingest" value={adminMediaProviderAnalyticsUrl} />
          </div>
        </PanelContent>
      </Panel>

      <Panel className="mb-6 scroll-mt-24" id="media-storage">
        <PanelHeader
          title="Storage health"
          description="Runtime provider, Supabase storage capability, and site quota for files served to custom frontends."
          icon={<Cloud className="size-4" />}
          action={
            <div className="flex flex-wrap items-center gap-2">
              {runtimeStorage && (
                <span
                  className={cn(
                    'inline-flex items-center rounded px-2.5 py-1 text-xs font-medium',
                    runtimeStorage.configured ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
                  )}
                >
                  {runtimeStorage.configured ? 'Configured' : 'Needs config'}
                </span>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void runStorageInfrastructureCheck()}
                disabled={isCheckingStorage || !settingsInfrastructureInput || !settingsIntegrations || !canConfigureMediaStorage}
                iconStart={<RefreshCw className={cn('size-3.5', isCheckingStorage && 'animate-spin')} />}
              >
                {isCheckingStorage ? 'Checking...' : 'Run check'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void runStorageProvisioningProbe()}
                disabled={isRunningStorageProvisioningProbe || !canConfigureMediaStorage}
                iconStart={<KeyRound className={cn('size-3.5', isRunningStorageProvisioningProbe && 'animate-pulse')} />}
              >
                {isRunningStorageProvisioningProbe ? 'Probing...' : 'Provision probe'}
              </Button>
              <Link
                to="/settings"
                search={{ tab: 'infrastructure' }}
                className="inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent focus-ring"
              >
                Configure
              </Link>
            </div>
          }
        />
        <PanelContent>
          <div data-testid="media-storage-operations">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Site media quota</p>
                  <p className="text-xs text-muted-foreground">
                    Uploads are blocked before the configured quota is exceeded.
                  </p>
                </div>
                {mediaQuota && (
                  <span className="font-mono text-xs text-muted-foreground">
                    {quotaUsagePercent}%
                  </span>
                )}
              </div>
              {mediaQuota ? (
                <>
                  <div className="h-2 overflow-hidden rounded-full bg-background">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        quotaUsagePercent >= 90
                          ? 'bg-destructive'
                          : quotaUsagePercent >= 75
                            ? 'bg-warning'
                            : 'bg-primary',
                      )}
                      style={{ width: `${quotaUsagePercent}%` }}
                    />
                  </div>
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-xs text-muted-foreground">Used</dt>
                      <dd className="font-mono text-xs">{formatBytes(mediaQuota.usedBytes)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Remaining</dt>
                      <dd className="font-mono text-xs">{formatBytes(mediaQuota.remainingBytes)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Limit</dt>
                      <dd className="font-mono text-xs">{formatBytes(mediaQuota.limitBytes)}</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <p className="rounded-lg border border-dashed border-border bg-background px-3 py-3 text-sm text-muted-foreground">
                  Quota data will appear after the media API responds.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Storage provider</p>
                  <p className="text-xs text-muted-foreground">
                    Current upload target reported by admin settings.
                  </p>
                </div>
                {runtimeSupabase && (
                  <span
                    className={cn(
                      'rounded px-2 py-0.5 text-[11px] font-semibold',
                      runtimeSupabase.configured ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                    )}
                  >
                    Supabase {runtimeSupabase.configured ? 'ready' : 'needs env'}
                  </span>
                )}
              </div>
              {runtimeStorage ? (
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Provider</dt>
                    <dd className="font-mono text-xs">{runtimeStorage.provider}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Bucket/path</dt>
                    <dd className="break-all font-mono text-xs">
                      {runtimeStorage.bucket || runtimeStorage.basePath || 'not set'}
                    </dd>
                  </div>
                  {runtimeStorage.publicUrl && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-muted-foreground">Public URL</dt>
                      <dd className="break-all font-mono text-xs">{runtimeStorage.publicUrl}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs text-muted-foreground">Supabase bucket</dt>
                    <dd className="break-all font-mono text-xs">
                      {runtimeSupabase?.storageBucket || 'not set'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Project ref</dt>
                    <dd className="break-all font-mono text-xs">
                      {runtimeSupabase?.projectRef || 'not detected'}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="rounded-lg border border-dashed border-border bg-background px-3 py-3 text-sm text-muted-foreground">
                  Runtime storage data is unavailable.
                </p>
              )}
              {runtimeStorage?.missing && runtimeStorage.missing.length > 0 && (
                <p className="mt-3 text-sm text-warning">
                  Missing configuration: {runtimeStorage.missing.join(', ')}
                </p>
              )}
              {runtimeSupabase?.missing && runtimeSupabase.missing.length > 0 && (
                <p className="mt-2 text-sm text-warning">
                  Supabase missing: {runtimeSupabase.missing.join(', ')}
                </p>
              )}
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-4" data-testid="media-scanner-runtime">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Upload scanner</p>
                  <p className="text-xs text-muted-foreground">
                    Optional pre-storage scan provider used by uploads and replacements.
                  </p>
                </div>
                <span
                  className={cn(
                    'rounded px-2 py-0.5 text-[11px] font-semibold',
                    !scannerRuntime.enabled
                      ? 'bg-muted text-muted-foreground'
                      : scannerRuntime.configured
                        ? 'bg-success/10 text-success'
                        : 'bg-warning/10 text-warning',
                  )}
                >
                  {!scannerRuntime.enabled
                    ? 'Disabled'
                    : scannerRuntime.configured
                      ? 'Configured'
                      : 'Needs env'}
                </span>
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Provider</dt>
                  <dd className="font-mono text-xs">{scannerRuntime.provider}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Fail open</dt>
                  <dd className="font-mono text-xs">{scannerRuntime.failOpen ? 'availability only' : 'off'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Endpoint</dt>
                  <dd className="font-mono text-xs">{scannerRuntime.endpointConfigured ? 'configured' : 'not set'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Timeout</dt>
                  <dd className="font-mono text-xs">{scannerRuntime.timeoutMs || 5000} ms</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">ClamAV host</dt>
                  <dd className="font-mono text-xs">{scannerRuntime.host || '127.0.0.1'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">ClamAV port</dt>
                  <dd className="font-mono text-xs">{scannerRuntime.port || 3310}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">API key</dt>
                  <dd className="font-mono text-xs">{scannerRuntime.apiKeyConfigured ? 'configured' : 'optional'}</dd>
                </div>
              </dl>
              {scannerRuntime.missing && scannerRuntime.missing.length > 0 && (
                <p className="mt-3 text-sm text-warning">
                  Scanner missing: {scannerRuntime.missing.join(', ')}
                </p>
              )}
              {scannerRuntime.error && (
                <p className="mt-2 text-sm text-warning">{scannerRuntime.error}</p>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-background p-4" data-testid="media-storage-settings-editor">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Storage provider metadata</h3>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  Save non-secret provider intent from the media workspace. Runtime credentials still stay in environment variables.
                </p>
                {!canConfigureMediaStorage && (
                  <p className="mt-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                    Storage metadata changes require media.configure permission.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleUseRuntimeStorageSettings}
                  disabled={storageSettingsControlsDisabled}
                  title={canConfigureMediaStorage ? undefined : configurePermissionTitle}
                >
                  Use detected storage
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleUseRuntimeSupabaseSettings}
                  disabled={storageSettingsControlsDisabled}
                  title={canConfigureMediaStorage ? undefined : configurePermissionTitle}
                >
                  Use Supabase
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  onClick={() => void saveMediaStorageSettings()}
                  disabled={storageSettingsControlsDisabled}
                  iconStart={<Save className="size-3.5" />}
                  title={canConfigureMediaStorage ? undefined : configurePermissionTitle}
                >
                  {isSavingStorageSettings ? 'Saving...' : 'Save storage'}
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Storage provider</span>
                  <select
                    aria-label="Storage provider"
                    value={storageSettings.provider || ''}
                    disabled={storageSettingsControlsDisabled}
                    onChange={(event) => updateMediaStorageSettingsDraft({ provider: event.target.value })}
                    className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">Choose provider</option>
                    <option value="local">Local development</option>
                    <option value="supabase">Supabase Storage</option>
                    <option value="s3">S3 compatible</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Storage bucket</span>
                  <input
                    aria-label="Storage bucket"
                    value={storageSettings.bucket || ''}
                    disabled={storageSettingsControlsDisabled}
                    onChange={(event) => updateMediaStorageSettingsDraft({ bucket: event.target.value })}
                    placeholder="media"
                    className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm md:col-span-2">
                  <span className="font-medium">Public media base URL</span>
                  <input
                    aria-label="Public media base URL"
                    value={storageSettings.publicBaseUrl || ''}
                    disabled={storageSettingsControlsDisabled}
                    onChange={(event) => updateMediaStorageSettingsDraft({ publicBaseUrl: event.target.value })}
                    placeholder="https://project-ref.supabase.co/storage/v1/object/public/media"
                    className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Storage path prefix</span>
                  <input
                    aria-label="Storage path prefix"
                    value={storageSettings.pathPrefix || ''}
                    disabled={storageSettingsControlsDisabled}
                    onChange={(event) => updateMediaStorageSettingsDraft({ pathPrefix: event.target.value })}
                    placeholder="sites/site-demo"
                    className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Supabase project URL</span>
                  <input
                    aria-label="Supabase project URL"
                    value={supabaseSettings.projectUrl || ''}
                    disabled={storageSettingsControlsDisabled}
                    onChange={(event) => updateMediaSupabaseSettingsDraft({ projectUrl: event.target.value })}
                    placeholder="https://project-ref.supabase.co"
                    className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Supabase project ref</span>
                  <input
                    aria-label="Supabase project ref"
                    value={supabaseSettings.projectRef || ''}
                    disabled={storageSettingsControlsDisabled}
                    onChange={(event) => updateMediaSupabaseSettingsDraft({ projectRef: event.target.value })}
                    placeholder="project-ref"
                    className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
                <div className="grid gap-2">
                  <label className="flex min-h-10 items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 text-sm">
                    <input
                      type="checkbox"
                      aria-label="Enable private media files"
                      checked={Boolean(storageSettings.privateFilesEnabled)}
                      disabled={storageSettingsControlsDisabled}
                      onChange={(event) => updateMediaStorageSettingsDraft({ privateFilesEnabled: event.target.checked })}
                      className="size-4 rounded border-input disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    Private file delivery
                  </label>
                  <label className="flex min-h-10 items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 text-sm">
                    <input
                      type="checkbox"
                      aria-label="Enable image transforms"
                      checked={storageSettings.imageTransformsEnabled !== false}
                      disabled={storageSettingsControlsDisabled}
                      onChange={(event) => updateMediaStorageSettingsDraft({ imageTransformsEnabled: event.target.checked })}
                      className="size-4 rounded border-input disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    Image transforms
                  </label>
                  <label className="flex min-h-10 items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 text-sm">
                    <input
                      type="checkbox"
                      aria-label="Enable storage lifecycle policy"
                      checked={Boolean(storageSettings.lifecyclePolicyEnabled)}
                      disabled={storageSettingsControlsDisabled}
                      onChange={(event) => updateMediaStorageSettingsDraft({ lifecyclePolicyEnabled: event.target.checked })}
                      className="size-4 rounded border-input disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    Lifecycle policy
                  </label>
                  <label className="flex min-h-10 items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 text-sm">
                    <input
                      type="checkbox"
                      aria-label="Enable Supabase storage"
                      checked={Boolean(supabaseSettings.storageEnabled)}
                      disabled={storageSettingsControlsDisabled}
                      onChange={(event) => updateMediaSupabaseSettingsDraft({ storageEnabled: event.target.checked })}
                      className="size-4 rounded border-input disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    Supabase storage
                  </label>
                </div>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Probe retention days</span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    aria-label="Probe retention days"
                    value={storageSettings.lifecycleTempRetentionDays || 7}
                    disabled={storageSettingsControlsDisabled}
                    onChange={(event) => updateMediaStorageSettingsDraft({ lifecycleTempRetentionDays: Number(event.target.value) || 7 })}
                    className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Noncurrent version days</span>
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    aria-label="Noncurrent version days"
                    value={storageSettings.lifecycleNoncurrentVersionDays || 90}
                    disabled={storageSettingsControlsDisabled}
                    onChange={(event) => updateMediaStorageSettingsDraft({ lifecycleNoncurrentVersionDays: Number(event.target.value) || 90 })}
                    className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold">Saved intent</h4>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      This is the contract custom frontends and operators use before runtime env is configured.
                    </p>
                  </div>
                  <span className="rounded bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    metadata
                  </span>
                </div>
                <dl className="mt-3 grid gap-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Provider</dt>
                    <dd className="font-mono">{storageSettings.provider || 'unset'}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Bucket</dt>
                    <dd className="max-w-[58%] truncate font-mono">{storageSettings.bucket || 'unset'}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Private files</dt>
                    <dd>{storageSettings.privateFilesEnabled ? 'enabled' : 'off'}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Transforms</dt>
                    <dd>{storageSettings.imageTransformsEnabled === false ? 'off' : 'enabled'}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Lifecycle policy</dt>
                    <dd>{storageSettings.lifecyclePolicyEnabled ? 'enabled' : 'off'}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Supabase storage</dt>
                    <dd>{supabaseSettings.storageEnabled ? 'enabled' : 'off'}</dd>
                  </div>
                </dl>
                {storageSettingsNotice && (
                  <Notice tone="success" className="mt-3">
                    {storageSettingsNotice}
                  </Notice>
                )}
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3" data-testid="media-storage-env-contract">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold">Provider env contract</h4>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Runtime credentials are read from server environment variables, then verified by Run check.
                    </p>
                  </div>
                  <span className="rounded bg-background px-2 py-0.5 text-[11px] font-semibold capitalize text-muted-foreground">
                    {selectedStorageProvider}
                  </span>
                </div>
                <div className="mt-3 grid gap-2">
                  {storageEnvContract.map((field) => {
                    const status = selectedStorageProvider === 'local'
                      ? 'optional'
                      : missingStorageEnv.has(field.name)
                        ? 'missing'
                        : field.required
                          ? 'detected'
                          : 'optional';
                    return (
                      <div key={`${selectedStorageProvider}:${field.name}`} className="rounded-md border border-border bg-background px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-semibold">{field.name}</span>
                              {field.secret && (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                                  secret
                                </span>
                              )}
                              {!field.required && (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                                  optional
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">{field.detail}</p>
                          </div>
                          <span
                            className={cn(
                              'rounded px-2 py-0.5 text-[11px] font-semibold',
                              status === 'missing'
                                ? 'bg-warning/10 text-warning'
                                : status === 'detected'
                                  ? 'bg-success/10 text-success'
                                  : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {status}
                          </span>
                        </div>
                        <code className="mt-2 block break-all rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                          {field.env.join(' or ')}
                        </code>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3" data-testid="media-scanner-env-contract">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold">Scanner env contract</h4>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Upload scanning is disabled by default. Set provider http or clamav to require a clean scanner verdict before storage.
                    </p>
                  </div>
                  <span className="rounded bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    {scannerRuntime.provider}
                  </span>
                </div>
                <div className="mt-3 grid gap-2">
                  {MEDIA_SCANNER_ENV_CONTRACT.map((field) => {
                    const scannerEnabled = scannerRuntime.enabled === true;
                    const status = field.name === 'provider'
                      ? scannerEnabled ? 'detected' : 'optional'
                      : field.name === 'endpoint'
                        ? scannerEnabled
                          ? scannerRuntime.provider === 'http' && scannerRuntime.endpointConfigured
                            ? 'detected'
                            : scannerRuntime.provider === 'http' ? 'missing' : 'optional'
                          : 'optional'
                        : field.name === 'clamdHost'
                          ? scannerRuntime.provider === 'clamav' ? 'detected' : 'optional'
                        : field.name === 'clamdPort'
                          ? scannerRuntime.provider === 'clamav' ? 'detected' : 'optional'
                        : field.name === 'apiKey'
                          ? scannerRuntime.apiKeyConfigured ? 'detected' : 'optional'
                        : field.name === 'timeoutMs'
                            ? scannerRuntime.timeoutMs ? 'detected' : 'optional'
                            : scannerRuntime.failOpen ? 'detected' : 'optional';

                    return (
                      <div key={`scanner:${field.name}`} className="rounded-md border border-border bg-background px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-semibold">{field.name}</span>
                              {field.secret && (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                                  secret
                                </span>
                              )}
                              {!field.required && (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                                  optional
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">{field.detail}</p>
                          </div>
                          <span
                            className={cn(
                              'rounded px-2 py-0.5 text-[11px] font-semibold',
                              status === 'missing'
                                ? 'bg-warning/10 text-warning'
                                : status === 'detected'
                                  ? 'bg-success/10 text-success'
                                  : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {status}
                          </span>
                        </div>
                        <code className="mt-2 block break-all rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                          {field.env.join(' or ')}
                        </code>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {storageCheckError && (
            <Notice tone="warning" title="Storage check failed" className="mt-4">
              {storageCheckError}
            </Notice>
          )}
          {storageDiagnostics && (
            <div className="mt-4 rounded-lg border border-border bg-background p-4" data-testid="media-storage-check-results">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Storage check results</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    These checks reuse Settings infrastructure validation so uploads and frontend delivery can be verified from the media workspace.
                  </p>
                </div>
                <span className="rounded bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {storageDiagnostics.filter((diagnostic) => diagnostic.status === 'blocked').length} blocked
                </span>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {storageDiagnostics.map((diagnostic) => (
                  <MediaStorageDiagnosticCard key={diagnostic.area} diagnostic={diagnostic} />
                ))}
              </div>
            </div>
          )}
          {storageProvisioningResult && (
            <MediaStorageProvisioningCard result={storageProvisioningResult} />
          )}
          </div>
        </PanelContent>
      </Panel>

      <Panel className="mb-6 scroll-mt-24" id="media-analytics">
        <PanelHeader
          title="Usage analytics"
          description="Reference coverage, delivery visibility, type mix, and replacement activity for the currently loaded library."
          icon={<ImageIcon className="size-4" />}
          action={
            <span className="rounded bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground">
              {displayedFiles.length}/{files.length} visible
            </span>
          }
        />
        <PanelContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {([
              {
                label: 'Assets',
                value: mediaAnalytics.totalAssets,
                detail: `${mediaAnalytics.folderedAssets} foldered · ${mediaAnalytics.rootAssets} root`,
                filter: 'all',
              },
              {
                label: 'Referenced',
                value: mediaAnalytics.referencedAssets,
                detail: `${mediaAnalytics.unusedAssets} unused assets need review`,
                filter: 'referenced',
              },
              {
                label: 'Private',
                value: mediaAnalytics.privateAssets,
                detail: `${mediaAnalytics.publicAssets} public assets available to frontends`,
                filter: 'all',
                visibility: 'private',
              },
              {
                label: 'Replaced',
                value: mediaAnalytics.replacedAssets,
                detail: `${mediaAnalytics.replacementVersions} retained versions · ${formatBytes(mediaAnalytics.replacementBytes)}`,
                filter: 'replaced',
              },
              {
                label: 'Quarantined',
                value: mediaAnalytics.quarantinedAssets,
                detail: mediaAnalytics.quarantinedAssets > 0
                  ? 'Review before public delivery'
                  : 'No blocked assets',
                filter: 'quarantined',
              },
            ] satisfies MediaUsageMetric[]).map((metric) => (
              <button
                key={metric.label}
                type="button"
                onClick={() => {
                  if (isMediaLibraryBusy) return;
                  setUsageFilter(metric.filter);
                  if (metric.visibility) {
                    setVisibilityFilter(metric.visibility);
                  }
                  updateMediaRouteSearch({
                    usage: metric.filter,
                    visibility: metric.visibility,
                  });
                }}
                disabled={isMediaLibraryBusy}
                className="rounded-lg border border-border bg-muted/30 p-4 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{metric.label}</div>
                <div className="mt-2 text-2xl font-semibold">{metric.value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{metric.detail}</div>
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Library focus</p>
                  <p className="text-xs text-muted-foreground">Switch the grid to assets that need action.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'all', label: 'All' },
                    { value: 'unused', label: 'Unused' },
                    { value: 'referenced', label: 'Referenced' },
                    { value: 'replaced', label: 'Replaced' },
                    { value: 'quarantined', label: 'Quarantined' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        if (isMediaLibraryBusy) return;
                        const usage = option.value as MediaUsageFilter;
                        setUsageFilter(usage);
                        updateMediaRouteSearch({ usage });
                      }}
                      disabled={isMediaLibraryBusy}
                      className={cn(
                        'rounded-lg border px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60',
                        usageFilter === option.value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-2">
                {mediaAnalytics.typeRows.map((row) => (
                  <button
                    key={row.type}
                    type="button"
                    onClick={() => {
                      if (isMediaLibraryBusy) return;
                      setTypeFilter(row.type);
                      updateMediaRouteSearch({ type: row.type });
                    }}
                    disabled={isMediaLibraryBusy}
                    className="grid grid-cols-[90px_minmax(0,1fr)_90px] items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="text-xs font-medium capitalize text-muted-foreground">{row.type}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${row.percent}%` }}
                      />
                    </span>
                    <span className="text-right font-mono text-xs text-muted-foreground">
                      {row.count} · {formatBytes(row.bytes)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Largest assets</p>
                  <p className="text-xs text-muted-foreground">Open heavy files before they affect frontend delivery.</p>
                </div>
                {mediaAnalytics.largestAssets.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (isMediaLibraryBusy) return;
                      const first = mediaAnalytics.largestAssets[0]?.asset;
                      if (first) openMetadataEditor(first);
                    }}
                    disabled={isMediaLibraryBusy}
                    className="text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Open largest
                  </button>
                )}
              </div>
              {mediaAnalytics.largestAssets.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                  No assets are loaded yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {mediaAnalytics.largestAssets.map(({ asset, bytes }) => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => openMetadataEditor(asset)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{asset.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {mediaTypeLabel(asset.type)} · {(asset.targetPageIds?.length || 0) + (asset.targetPostIds?.length || 0)} references
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">{formatBytes(bytes)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-background p-4 lg:col-span-2" data-testid="media-provider-roi">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Provider ROI</p>
                  <p className="text-xs text-muted-foreground">
                    Attributed provider conversions, value, CVR, and value per request from ingested CDN/storage analytics.
                  </p>
                </div>
                <span className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
                  {mediaAnalytics.providerRoiRows.length} source{mediaAnalytics.providerRoiRows.length === 1 ? '' : 's'}
                </span>
              </div>
              {mediaAnalytics.providerRoiRows.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                  Provider ROI appears after CDN/storage analytics include requests, conversions, or attributed value.
                </p>
              ) : (
                <div className="grid gap-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      {
                        label: 'Attributed value',
                        value: formatProviderAnalyticsValue(mediaAnalytics.providerConversionValue, mediaAnalytics.providerCurrency),
                      },
                      {
                        label: 'Conversions',
                        value: `${mediaAnalytics.providerConversions} conv`,
                      },
                      {
                        label: 'Conversion rate',
                        value: `${formatProviderAnalyticsPercent(mediaAnalytics.providerConversionRate)} CVR`,
                      },
                      {
                        label: 'Value/request',
                        value: `${formatProviderAnalyticsValue(mediaAnalytics.providerValuePerRequest, mediaAnalytics.providerCurrency)}/req`,
                      },
                    ].map((metric) => (
                      <div key={metric.label} className="rounded-lg border border-border bg-muted/20 px-3 py-3">
                        <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{metric.label}</div>
                        <div className="mt-2 font-mono text-lg font-semibold">{metric.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="grid gap-2">
                    {mediaAnalytics.providerRoiRows.map((row) => (
                      <div key={row.provider} className="grid gap-2 rounded-lg border border-border bg-muted/20 px-3 py-3 md:grid-cols-[140px_minmax(0,1fr)_130px_120px] md:items-center">
                        <div>
                          <div className="text-sm font-medium capitalize">{row.provider}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {row.providerRequests} provider requests
                          </div>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-background">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${mediaAnalytics.providerConversionValue > 0 ? Math.max(4, Math.round((row.providerConversionValue / mediaAnalytics.providerConversionValue) * 100)) : 0}%` }}
                          />
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {row.providerConversions} conv · {formatProviderAnalyticsPercent(row.providerConversionRate)} CVR
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {formatProviderAnalyticsValue(row.providerValuePerRequest, row.providerCurrency)}/req
                        </div>
                        <div className="text-xs text-muted-foreground md:col-span-4">
                          {formatProviderAnalyticsValue(row.providerConversionValue, row.providerCurrency)} attributed value
                          {row.providerLastSyncedAt ? ` · synced ${formatAuditDate(row.providerLastSyncedAt)}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-background p-4 lg:col-span-2">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Provider delivery</p>
                  <p className="text-xs text-muted-foreground">
                    Storage provider mix, Backy-served requests, and the boundary where direct CDN/storage analytics take over.
                  </p>
                </div>
                <span className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
                  {mediaAnalytics.providerRows.length} provider{mediaAnalytics.providerRows.length === 1 ? '' : 's'}
                </span>
              </div>
              {mediaAnalytics.providerRows.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                  Provider analytics will appear after assets are loaded.
                </p>
              ) : (
                <div className="grid gap-2">
                  {mediaAnalytics.providerRows.map((row) => (
                    <div key={row.provider} className="grid gap-3 rounded-lg border border-border bg-muted/20 px-3 py-3 md:grid-cols-[140px_minmax(0,1fr)_120px_130px] md:items-center">
                      <div>
                        <div className="text-sm font-medium capitalize">{row.provider}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {row.publicCount} public · {row.privateCount} private
                        </div>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-background">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${mediaAnalytics.totalAssets > 0 ? Math.max(4, Math.round((row.count / mediaAnalytics.totalAssets) * 100)) : 0}%` }}
                        />
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {row.count} assets · {formatBytes(row.bytes)}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {row.requests} req · {formatBytes(row.bytesServed)}
                      </div>
                      <div className="text-xs text-muted-foreground md:col-span-4">
                        {row.providerRequests > 0
                          ? formatProviderAnalyticsSummary(row)
                          : row.requests > 0
                            ? `Last Backy delivery ${formatAuditDate(row.lastDeliveredAt || '')}.`
                          : row.provider === 'local' || row.provider === 'unknown'
                            ? 'No Backy delivery requests recorded yet.'
                            : 'Direct CDN/storage hits are read from the provider console; Backy records only routed file and transform endpoints.'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </PanelContent>
      </Panel>

      <Panel className="mb-6 scroll-mt-24" id="media-activity" data-testid="media-library-activity">
        <PanelHeader
          title="Media activity"
          description="Review recent uploads, edits, replacements, transform preparation, bindings, quarantine changes, and deletions across the library."
          icon={<FileText className="size-4" />}
          action={
            <span className="rounded bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground">
              {libraryAuditPagination.total} records
            </span>
          }
        />
        <PanelContent>
          <div className="grid gap-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto_auto]">
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Access contract:</span>{' '}
                {mediaAccessRows.find((row) => row.permission === 'activity.export')?.allowed
                  ? 'Current role can read and export the media audit feed.'
                  : 'Current role is expected to be blocked from audit export by the admin API.'}
                <span className="ml-2 rounded bg-background px-2 py-1 font-mono text-xs">activity.export</span>
              </div>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                Activity type
                <select
                  value={libraryAuditActionFilter}
                  disabled={!canExportMediaActivity || isLoadingLibraryAudit}
                  title={canExportMediaActivity ? undefined : activityPermissionTitle}
                  onChange={(event) => setLibraryAuditActionFilter(event.target.value as MediaAuditActionFilter)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Filter media library activity"
                >
                  {MEDIA_AUDIT_ACTION_FILTERS.map((filter) => (
                    <option key={filter.value} value={filter.value}>{filter.label}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-end">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isLoadingLibraryAudit || !canExportMediaActivity}
                  onClick={() => void loadLibraryAuditLogs(libraryAuditPagination.offset)}
                  className="w-full"
                  title={canExportMediaActivity ? undefined : activityPermissionTitle}
                >
                  Refresh
                </Button>
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isLoadingLibraryAudit || !canExportMediaActivity || libraryAuditLogs.length === 0}
                  onClick={exportMediaAuditCsv}
                  className="w-full"
                  title={canExportMediaActivity ? undefined : activityPermissionTitle}
                  iconStart={<Download className="size-4" />}
                >
                  Export audit
                </Button>
              </div>
            </div>

            {!canExportMediaActivity && (
              <Notice tone="warning">
                Your account needs activity.export to read or export the media audit feed. {activityPermissionTitle}
              </Notice>
            )}

            {libraryAuditError && (
              <Notice tone="warning">
                {libraryAuditError}
              </Notice>
            )}

            {!canExportMediaActivity ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
                Media activity is hidden until audit export access is granted.
              </div>
            ) : isLoadingLibraryAudit ? (
              <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                Loading media activity...
              </div>
            ) : libraryAuditLogs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
                No media audit records match this view yet.
              </div>
            ) : (
              <div className="grid gap-2 lg:grid-cols-2">
                {libraryAuditLogs.map((log) => {
                  const details = mediaAuditDetails(log);
                  const asset = files.find((file) => file.id === log.entityId);

                  return (
                    <div key={log.id} className="rounded-lg border border-border bg-background px-3 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{mediaAuditTitle(log)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{mediaAuditDescription(log)}</p>
                        </div>
                        <time className="shrink-0 font-mono text-xs text-muted-foreground" dateTime={log.createdAt}>
                          {formatAuditDate(log.createdAt)}
                        </time>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="rounded bg-muted px-2 py-1">{mediaAuditPermission(log.action)}</span>
                        <span className="rounded bg-muted px-2 py-1">Actor {log.actorId || 'admin'}</span>
                        <span className="rounded bg-muted px-2 py-1 font-mono">{log.entityId}</span>
                        {log.requestId && (
                          <span className="rounded bg-muted px-2 py-1 font-mono">{log.requestId}</span>
                        )}
                      </div>
                      {asset && (
                        <button
                          type="button"
                          className="mt-2 text-xs font-medium text-primary hover:underline"
                          onClick={() => openMetadataEditor(asset)}
                        >
                          Open {asset.name}
                        </button>
                      )}
                      {details.length > 0 && (
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {details.map((detail) => (
                            <div key={detail.label} className="rounded bg-muted px-2 py-1.5 text-xs">
                              <div className="font-medium text-muted-foreground">{detail.label}</div>
                              <div className="mt-1 break-all font-mono text-[11px] text-foreground">{detail.value}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>
                Showing {libraryAuditLogs.length === 0 ? 0 : libraryAuditPagination.offset + 1}
                {'-'}
                {libraryAuditPagination.offset + libraryAuditLogs.length}
                {' '}of {libraryAuditPagination.total}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={isLoadingLibraryAudit || !canExportMediaActivity || libraryAuditPagination.offset <= 0}
                  onClick={() => void loadLibraryAuditLogs(Math.max(0, libraryAuditPagination.offset - libraryAuditPagination.limit))}
                  title={canExportMediaActivity ? undefined : activityPermissionTitle}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={isLoadingLibraryAudit || !canExportMediaActivity || !libraryAuditPagination.hasMore}
                  onClick={() => void loadLibraryAuditLogs(libraryAuditPagination.offset + libraryAuditPagination.limit)}
                  title={canExportMediaActivity ? undefined : activityPermissionTitle}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </PanelContent>
      </Panel>

      <div className="mb-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px_180px]">
        <input
          type="text"
          value={searchQuery}
          disabled={isMediaLibraryBusy}
          onChange={(event) => {
            if (isMediaLibraryBusy) return;
            const q = event.target.value;
            setSearchQuery(q);
            updateMediaRouteSearch({ q: q || undefined });
          }}
          className="rounded-lg border bg-background px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-60"
          placeholder="Search filenames, captions, alt text, or tags"
          aria-label="Search media"
        />
        <input
          type="text"
          value={tagFilter}
          disabled={isMediaLibraryBusy}
          onChange={(event) => {
            if (isMediaLibraryBusy) return;
            const tag = event.target.value;
            setTagFilter(tag);
            updateMediaRouteSearch({ tag: tag || undefined });
          }}
          className="rounded-lg border bg-background px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-60"
          placeholder="Exact tag"
          aria-label="Filter media by exact tag"
          data-testid="media-tag-filter"
        />
        <select
          value={typeFilter}
          disabled={isMediaLibraryBusy}
          onChange={(event) => {
            if (isMediaLibraryBusy) return;
            const type = event.target.value as MediaTypeFilter;
            setTypeFilter(type);
            updateMediaRouteSearch({ type });
          }}
          className="rounded-lg border bg-background px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Media type filter"
        >
          <option value="all">All types</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
          <option value="audio">Audio</option>
          <option value="file">Documents</option>
          <option value="font">Fonts</option>
          <option value="other">Other files</option>
        </select>
        <select
          value={visibilityFilter}
          disabled={isMediaLibraryBusy}
          onChange={(event) => {
            if (isMediaLibraryBusy) return;
            const visibility = event.target.value as MediaVisibilityFilter;
            setVisibilityFilter(visibility);
            updateMediaRouteSearch({ visibility });
          }}
          className="rounded-lg border bg-background px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Media visibility filter"
        >
          <option value="all">All visibility</option>
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
      </div>

      <div
        className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
        data-testid="media-library-pagination"
      >
        <div>
          <div className="text-sm font-semibold text-foreground">Loaded media window</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Loaded {loadedMediaCount} of {matchingMediaTotal} matching asset{matchingMediaTotal === 1 ? '' : 's'} from the API. Bulk actions apply to selected loaded assets.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isMediaLibraryBusy || !hasUnloadedMedia}
            onClick={() => void loadLibrary({ mode: 'append' })}
          >
            Load more
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isMediaLibraryBusy || !hasUnloadedMedia}
            onClick={() => void loadLibrary({ mode: 'all' })}
          >
            Load all matching
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isMediaLibraryBusy}
            onClick={() => void loadLibrary()}
          >
            Refresh
          </Button>
        </div>
      </div>

      <div id="media-folders" className="mb-6 rounded-xl border border-border bg-card p-4 scroll-mt-24">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold">
            <Folder className="h-4 w-4" />
            <span>Folders</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-2">
            <select
              value={newFolderParentId}
              disabled={isMediaLibraryBusy || !canCreateMedia}
              title={canCreateMedia ? undefined : createPermissionTitle}
              onChange={(event) => setNewFolderParentId(event.target.value)}
              className="w-full max-w-[180px] rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="New folder parent"
            >
              <option value="root">Root</option>
              {folderOptions.map((folder) => (
                <option key={folder.id} value={folder.id}>{folder.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={newFolderName}
              disabled={isMediaLibraryBusy || !canCreateMedia}
              title={canCreateMedia ? undefined : createPermissionTitle}
              onChange={(event) => setNewFolderName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleCreateFolder();
                }
              }}
              className="w-full max-w-xs rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="New folder name"
              aria-label="New folder name"
            />
            <button
              type="button"
              disabled={isMediaLibraryBusy || !canCreateMedia || !newFolderName.trim()}
              title={canCreateMedia ? undefined : createPermissionTitle}
              onClick={() => void handleCreateFolder()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Create media folder"
            >
              <FolderPlus className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (isMediaLibraryBusy) return;
              setSelectedFolderId(undefined);
              updateMediaRouteSearch({ folderId: undefined });
            }}
            disabled={isMediaLibraryBusy}
            className={cn(
              'rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60',
              selectedFolderId === undefined ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
            )}
          >
            All media
          </button>
          <button
            type="button"
            onClick={() => {
              if (isMediaLibraryBusy) return;
              setSelectedFolderId(null);
              updateMediaRouteSearch({ folderId: 'root' });
            }}
            disabled={isMediaLibraryBusy}
            className={cn(
              'rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60',
              selectedFolderId === null ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
            )}
          >
            Root
          </button>
          {folderOptions.map((folder) => (
            <div key={folder.id} className="inline-flex min-h-10 overflow-hidden rounded-lg border border-border bg-background">
              {editingFolderId === folder.id ? (
                <div className="flex min-w-[360px] flex-wrap items-center gap-1 px-1.5 py-1">
                  <input
                    type="text"
                    value={editingFolderName}
                    disabled={isMediaLibraryBusy || !canEditMedia}
                    title={canEditMedia ? undefined : editPermissionTitle}
                    onChange={(event) => setEditingFolderName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void handleRenameFolder(folder.id);
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        cancelEditingFolder();
                      }
                    }}
                    className="h-8 min-w-[150px] flex-1 rounded-md border bg-background px-2 text-sm"
                    aria-label={`Rename folder ${folder.name}`}
                    autoFocus
                  />
                  <select
                    value={editingFolderParentId}
                    disabled={isMediaLibraryBusy || !canEditMedia}
                    title={canEditMedia ? undefined : editPermissionTitle}
                    onChange={(event) => setEditingFolderParentId(event.target.value)}
                    className="h-8 min-w-[140px] rounded-md border bg-background px-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label={`Parent folder for ${folder.name}`}
                  >
                    <option value="root">Root</option>
                    {getFolderParentOptions(folder.id).map((parentFolder) => (
                      <option key={parentFolder.id} value={parentFolder.id}>{parentFolder.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={isMediaLibraryBusy || !canEditMedia || !editingFolderName.trim()}
                    onClick={() => void handleRenameFolder(folder.id)}
                    className="inline-flex size-8 items-center justify-center rounded-md text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                    title={canEditMedia ? 'Save folder name' : editPermissionTitle}
                    aria-label={`Save folder name for ${folder.name}`}
                  >
                    <Save className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={isMediaLibraryBusy}
                    onClick={cancelEditingFolder}
                    className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    title="Cancel rename"
                    aria-label={`Cancel renaming ${folder.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (isMediaLibraryBusy) return;
                      setSelectedFolderId(folder.id);
                      updateMediaRouteSearch({ folderId: folder.id });
                    }}
                    disabled={isMediaLibraryBusy}
                    title={`${folderSubtreeAssetCounts.get(folder.id) || 0} asset${(folderSubtreeAssetCounts.get(folder.id) || 0) === 1 ? '' : 's'} including descendant folders; ${folderAssetCounts.get(folder.id) || 0} direct.`}
                    className={cn(
                      'px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60',
                      selectedFolderId === folder.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                    )}
                  >
                    <span className="font-medium">{folder.label}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {folderSubtreeAssetCounts.get(folder.id) || 0}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => startEditingFolder(folder)}
                    disabled={isMediaLibraryBusy || !canEditMedia}
                    className="border-l border-border px-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    title={canEditMedia ? 'Rename folder' : editPermissionTitle}
                    aria-label={`Rename folder ${folder.name}`}
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isMediaLibraryBusy || !canDeleteMedia) return;
                      setPendingDeleteFolder(folder);
                    }}
                    disabled={isMediaLibraryBusy || !canDeleteMedia}
                    className="border-l border-border px-2 text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                    title={canDeleteMedia ? 'Delete folder' : deletePermissionTitle}
                    aria-label={`Delete folder ${folder.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {files.length > 0 && (
        <Panel className="mb-6 scroll-mt-24" id="media-bulk">
          <PanelHeader
            title="Bulk management"
            description={bulkManagementDescription}
            icon={<CheckSquare className="size-4" />}
            action={
              <span className="rounded bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground">
                {selectedMediaAssets.length} selected{hiddenSelectedMediaCount > 0 ? `, ${hiddenSelectedMediaCount} hidden` : ''}
              </span>
            }
          />
          <PanelContent>
            <div className="grid gap-4">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_160px_200px_200px_auto_auto]">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isMediaLibraryBusy || allVisibleSelected || !canBulkSelectMedia}
                    title={!canBulkSelectMedia ? bulkSelectionPermissionTitle : undefined}
                    onClick={handleSelectVisibleMedia}
                    data-testid="media-bulk-add-visible-button"
                  >
                    Add visible loaded
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isMediaLibraryBusy || !hasUnloadedMedia}
                    onClick={() => void loadLibrary({ mode: 'all' })}
                  >
                    Load all matching
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isMediaLibraryBusy || selectedMediaAssets.length === 0}
                    onClick={handleClearSelection}
                  >
                    Clear
                  </Button>
                  {hiddenSelectedMediaCount > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={isMediaLibraryBusy}
                      onClick={handleClearHiddenSelection}
                    >
                      Clear hidden
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Add visible assets from the current filters. Selected hidden assets remain selected and are included in bulk actions until cleared.
                  </p>
                </div>

                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  Visibility
                  <select
                    value={bulkVisibility}
                    disabled={isMediaLibraryBusy || !canEditMedia}
                    title={canEditMedia ? undefined : editPermissionTitle}
                    onChange={(event) => setBulkVisibility(event.target.value === 'public' || event.target.value === 'private' ? event.target.value : 'keep')}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground"
                    aria-label="Bulk visibility"
                  >
                    <option value="keep">No change</option>
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                </label>

                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  Folder
                  <select
                    value={bulkFolderId}
                    disabled={isMediaLibraryBusy || !canEditMedia}
                    title={canEditMedia ? undefined : editPermissionTitle}
                    onChange={(event) => setBulkFolderId(event.target.value)}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground"
                    aria-label="Bulk folder"
                  >
                    <option value="keep">No change</option>
                    <option value="root">Root</option>
                    {folderOptions.map((folder) => (
                      <option key={folder.id} value={folder.id}>{folder.label}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  Safety
                  <select
                    value={bulkSafetyAction}
                    disabled={isMediaLibraryBusy || !canEditMedia}
                    title={canEditMedia ? undefined : editPermissionTitle}
                    onChange={(event) => setBulkSafetyAction(
                      event.target.value === 'quarantine' || event.target.value === 'release'
                        ? event.target.value
                        : 'keep',
                    )}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground"
                    aria-label="Bulk safety action"
                  >
                    <option value="keep">No change</option>
                    <option value="quarantine">Quarantine</option>
                    <option value="release">Release quarantine</option>
                  </select>
                </label>

                <div className="flex items-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isMediaLibraryBusy || !canEditMedia || selectedMediaAssets.length === 0 || !hasBulkChange}
                    onClick={() => void handleBulkUpdate()}
                    className="w-full whitespace-nowrap"
                    title={canEditMedia ? undefined : editPermissionTitle}
                  >
                    {isBulkUpdating ? 'Applying...' : 'Apply changes'}
                  </Button>
                </div>

                <div className="flex items-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    disabled={isMediaLibraryBusy || !canDeleteMedia || selectedMediaAssets.length === 0}
                    onClick={() => void handleBulkDelete()}
                    className="w-full whitespace-nowrap"
                    iconStart={<Trash2 className="size-4" />}
                    title={canDeleteMedia ? undefined : deletePermissionTitle}
                  >
                    Delete selected
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="grid gap-3 xl:grid-cols-[180px_minmax(0,1fr)_minmax(220px,0.55fr)]">
                  <label className="space-y-1 text-xs font-medium text-muted-foreground">
                    Tag action
                    <select
                      value={bulkTagMode}
                      disabled={isMediaLibraryBusy || !canEditMedia}
                      title={canEditMedia ? undefined : editPermissionTitle}
                      onChange={(event) => setBulkTagMode(event.target.value as typeof bulkTagMode)}
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground"
                      aria-label="Bulk tag action"
                    >
                      <option value="keep">No tag change</option>
                      <option value="merge">Add to existing tags</option>
                      <option value="replace">Replace all tags</option>
                      <option value="clear">Clear all tags</option>
                    </select>
                  </label>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
                      <span>Tags</span>
                      <span className="font-mono">{bulkTagList.length}/{DEFAULT_MAX_TAGS}</span>
                    </div>
                    <TagInput
                      tags={bulkTagList}
                      onChange={setBulkTagList}
                      placeholder="Add campaign, hero, product..."
                      ariaLabel="Bulk media tags"
                      disabled={isMediaLibraryBusy || !canEditMedia || bulkTagMode === 'clear' || bulkTagMode === 'keep'}
                      className={isMediaLibraryBusy || !canEditMedia || bulkTagMode === 'clear' || bulkTagMode === 'keep' ? 'opacity-60' : undefined}
                    />
                  </div>

                  <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                    <div className="font-medium text-foreground">Tag preview</div>
                    <p className="mt-1 leading-5">
                      {bulkTagMode === 'merge' && 'Selected assets keep their existing tags and receive the tags listed here.'}
                      {bulkTagMode === 'replace' && 'Selected assets will use only the tags listed here.'}
                      {bulkTagMode === 'clear' && 'Selected assets will have every tag removed.'}
                      {bulkTagMode === 'keep' && 'Choose a tag action to update selected assets in the same batch as folder or visibility changes.'}
                      {bulkSafetyAction === 'quarantine' && ' Selected assets will be forced private and blocked from public delivery, transforms, and signed URLs.'}
                      {bulkSafetyAction === 'release' && ' Selected assets will clear quarantine metadata and restore previous visibility unless a visibility change is also selected.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </PanelContent>
        </Panel>
      )}

      {fontGroups.length > 0 && (
        <Panel className="mb-6 scroll-mt-24" id="media-fonts">
          <PanelHeader
            title="Font families"
            description="Registered uploaded fonts grouped by family, variants, fallback stack, and frontend delivery visibility."
            icon={<Type className="size-4" />}
            action={
              <span className="rounded bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground">
                {fontGroups.length} {fontGroups.length === 1 ? 'family' : 'families'}
              </span>
            }
          />
          <PanelContent>
            <div className="grid gap-3 lg:grid-cols-2">
              {fontGroups.map((group) => (
                <div key={group.family} className="rounded-lg border border-border bg-muted/30 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p
                        className="truncate text-base font-semibold"
                        style={{ fontFamily: `"${group.family}", ${group.fallback}` }}
                      >
                        {group.family}
                      </p>
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                        "{group.family}", {group.fallback}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const firstAsset = group.assets[0];
                        if (firstAsset) {
                          openMetadataEditor(firstAsset);
                        }
                      }}
                      className="shrink-0"
                    >
                      Edit
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {group.variants.map((variant) => (
                      <span key={variant} className="rounded bg-background px-2 py-1 font-mono text-xs text-muted-foreground">
                        {variant}
                      </span>
                    ))}
                  </div>

                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-xs text-muted-foreground">Fallback stack</dt>
                      <dd className="truncate font-mono text-xs" title={group.fallback}>{group.fallback}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Display</dt>
                      <dd className="font-mono text-xs">{group.display}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Public files</dt>
                      <dd className="font-mono text-xs">{group.publicCount}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Private files</dt>
                      <dd className="font-mono text-xs">{group.privateCount}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          </PanelContent>
        </Panel>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, index) => (
            <div key={index} className="rounded-xl border border-border bg-card p-3">
              <div className="aspect-square rounded-lg bg-muted animate-pulse" />
              <div className="mt-3 h-4 w-3/4 rounded bg-muted animate-pulse" />
              <div className="mt-2 h-3 w-1/2 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      ) : displayedFiles.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4" data-testid="media-library-grid">
          {displayedFiles.map((file) => (
            <div
              key={file.id}
              data-testid="media-library-card"
              className={cn(
                'group relative overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:shadow-md',
                selectedMediaSet.has(file.id) ? 'border-primary ring-2 ring-primary/20' : 'border-border',
              )}
            >
              <label
                className="absolute left-2 top-2 z-10 inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background/95 shadow-sm backdrop-blur"
                title={canBulkSelectMedia ? `Select ${file.name}` : bulkSelectionPermissionTitle}
              >
                <input
                  type="checkbox"
                  checked={selectedMediaSet.has(file.id)}
                  disabled={isMediaLibraryBusy || !canBulkSelectMedia}
                  title={canBulkSelectMedia ? undefined : bulkSelectionPermissionTitle}
                  onChange={() => toggleMediaSelection(file.id)}
                  className="h-3.5 w-3.5 rounded border-border text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`Select ${file.name}`}
                />
                <span className="sr-only">Select {file.name}</span>
              </label>
              <div className="aspect-square bg-muted flex items-center justify-center relative">
                <MediaAssetPreview file={file} />

                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    className="p-2 bg-white rounded-lg text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isMediaLibraryBusy || !canEditMedia}
                    title={canEditMedia ? 'Edit metadata' : editPermissionTitle}
                    onClick={() => {
                      if (isMediaLibraryBusy || !canEditMedia) return;
                      openMetadataEditor(file);
                    }}
                    aria-label={`Edit metadata for ${file.name}`}
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  {file.visibility !== 'private' && (
                    <>
                      <button
                        className="p-2 bg-white rounded-lg text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isMediaLibraryBusy}
                        onClick={() => void copyMediaApiText(getAssetDeliveryUrl(file), `${file.name} delivery URL`)}
                        title="Copy delivery URL"
                        aria-label={`Copy delivery URL for ${file.name}`}
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <a
                        href={getAssetDeliveryUrl(file)}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 bg-white rounded-lg text-slate-700 hover:bg-slate-100"
                        title="Open delivered file"
                        aria-label={`Open delivered file for ${file.name}`}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </>
                  )}
                  <button
                    className="p-2 bg-white rounded-lg text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isMediaLibraryBusy || !canDeleteMedia}
                    onClick={() => {
                      if (isMediaLibraryBusy || !canDeleteMedia) return;
                      setPendingDeleteAsset(file);
                    }}
                    title={canDeleteMedia ? 'Delete media' : deletePermissionTitle}
                    aria-label={`Delete ${file.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Info */}
              <div className="p-3">
                <div className="flex items-start gap-2">
                  <MediaTypeIcon type={file.type} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate" title={file.name}>{file.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{mediaTypeLabel(file.type)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{file.size}</span>
                      <StatusBadge status={file.visibility || 'public'} className="px-1.5 py-0 text-[10px]" />
                    </div>
                  </div>
                </div>
                {file.folderId && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {getFolderPath(file.folderId)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={ImageIcon}
          title={files.length === 0 ? 'Library is empty' : 'No assets match this view'}
          description={files.length === 0 ? 'Upload some files to get started.' : 'Change the usage, search, type, visibility, or folder filters to broaden the view.'}
        />
      )}

      {selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          {selectedAsset.type === 'font' && selectedFontPreviewUrl && (
            <style>
              {`@font-face {
                font-family: "${(metadataForm.fontFamily || selectedAsset.name.replace(/\.[a-z0-9]+$/i, '')).replace(/["\\]/g, '')}";
                src: url("${selectedFontPreviewUrl.replace(/["\\]/g, '')}");
                font-style: ${metadataForm.fontStyle};
                font-weight: ${metadataForm.fontWeight || '400'};
                font-display: ${metadataForm.fontDisplay};
              }`}
            </style>
          )}
          <div className="w-full max-w-5xl rounded-xl border border-border bg-background shadow-xl" data-testid="media-details-dialog">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">Media details</h2>
                <p className="text-sm text-muted-foreground">{selectedAsset.type} · {selectedAsset.size}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (isMediaMutationBusy) return;
                  suppressedRouteAssetIdRef.current = selectedAsset.id;
                  setSelectedAsset(null);
                  updateMediaRouteSearch({ assetId: undefined });
                }}
                disabled={isMediaMutationBusy}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Close media details"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid max-h-[75vh] gap-5 overflow-y-auto p-5 md:grid-cols-[220px_1fr]">
              <div className="aspect-square overflow-hidden rounded-lg bg-muted">
                {selectedAssetPreviewBlockedReason ? (
                  <MediaPreviewBlocked reason={selectedAssetPreviewBlockedReason} />
                ) : selectedAsset.type === 'image' && selectedAsset.url ? (
                  <img
                    src={selectedAsset.url}
                    alt={metadataForm.altText || selectedAsset.name}
                    className="h-full w-full"
                    style={{
                      objectFit: metadataForm.imageObjectFit,
                      objectPosition: `${metadataForm.imageFocalX}% ${metadataForm.imageFocalY}%`,
                    }}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <File className="h-12 w-12 text-muted-foreground" />
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">File name</label>
                  <input
                    value={metadataForm.name}
                    disabled={!canEditMedia || isMediaMutationBusy}
                    title={canEditMedia ? undefined : editPermissionTitle}
                    onChange={(event) => setMetadataForm((current) => ({ ...current, name: event.target.value }))}
                    className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">Alt text</label>
                  <input
                    value={metadataForm.altText}
                    disabled={!canEditMedia || isMediaMutationBusy}
                    title={canEditMedia ? undefined : editPermissionTitle}
                    onChange={(event) => setMetadataForm((current) => ({ ...current, altText: event.target.value }))}
                    className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                    placeholder="Describe the image or file"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">Caption</label>
                  <textarea
                    value={metadataForm.caption}
                    disabled={!canEditMedia || isMediaMutationBusy}
                    title={canEditMedia ? undefined : editPermissionTitle}
                    onChange={(event) => setMetadataForm((current) => ({ ...current, caption: event.target.value }))}
                    className="min-h-20 w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                    placeholder="Optional caption"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">Tags</label>
                  <TagInput
                    tags={parseTagInput(metadataForm.tags)}
                    onChange={(tags) => setMetadataForm((current) => ({ ...current, tags: serializeTagValues(tags) }))}
                    placeholder="Add hero, product, brand..."
                    ariaLabel="Media asset tags"
                    disabled={!canEditMedia || isMediaMutationBusy}
                    className={!canEditMedia || isMediaMutationBusy ? 'opacity-60' : undefined}
                  />
                </div>

                {selectedAsset.type === 'image' && (
                  <div className="rounded-xl border border-border bg-muted/30 p-4" data-testid="media-image-presentation-editor">
                    <div className="mb-3">
                      <div className="text-sm font-semibold">Image presentation</div>
                      <div className="text-xs text-muted-foreground">
                        Persist focal point, crop fit, and target aspect metadata for frontend image components.
                      </div>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
                      <div
                        className="overflow-hidden rounded-lg border border-border bg-background"
                        style={{ aspectRatio: getImageAspectRatioCssValue(metadataForm.imageAspectRatio) }}
                      >
                        {selectedAssetPreviewBlockedReason ? (
                          <MediaPreviewBlocked reason={selectedAssetPreviewBlockedReason} />
                        ) : (
                          <img
                            src={selectedAsset.url}
                            alt={metadataForm.altText || selectedAsset.name}
                            className="h-full w-full"
                            style={{
                              objectFit: metadataForm.imageObjectFit,
                              objectPosition: `${metadataForm.imageFocalX}% ${metadataForm.imageFocalY}%`,
                            }}
                          />
                        )}
                      </div>
                      <div className="grid gap-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="space-y-1 text-sm">
                            <span className="font-medium">Focal X</span>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={metadataForm.imageFocalX}
                              disabled={!canEditMedia || isMediaMutationBusy}
                              title={canEditMedia ? undefined : editPermissionTitle}
                              onChange={(event) => setMetadataForm((current) => ({
                                ...current,
                                imageFocalX: clampPercent(event.target.value),
                              }))}
                              className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                            />
                          </label>
                          <label className="space-y-1 text-sm">
                            <span className="font-medium">Focal Y</span>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={metadataForm.imageFocalY}
                              disabled={!canEditMedia || isMediaMutationBusy}
                              title={canEditMedia ? undefined : editPermissionTitle}
                              onChange={(event) => setMetadataForm((current) => ({
                                ...current,
                                imageFocalY: clampPercent(event.target.value),
                              }))}
                              className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                            />
                          </label>
                        </div>
                        <div className="space-y-1 text-sm">
                          <label className="block font-medium">Crop fit</label>
                          <select
                            value={metadataForm.imageObjectFit}
                            disabled={!canEditMedia || isMediaMutationBusy}
                            title={canEditMedia ? undefined : editPermissionTitle}
                            onChange={(event) => setMetadataForm((current) => ({
                              ...current,
                              imageObjectFit: isMediaImageObjectFit(event.target.value)
                                ? event.target.value
                                : DEFAULT_IMAGE_PRESENTATION.objectFit,
                            }))}
                            className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <option value="cover">Cover crop</option>
                            <option value="contain">Contain full image</option>
                          </select>
                        </div>
                        <div className="space-y-1 text-sm">
                          <label className="block font-medium">Aspect ratio</label>
                          <select
                            value={metadataForm.imageAspectRatio}
                            disabled={!canEditMedia || isMediaMutationBusy}
                            title={canEditMedia ? undefined : editPermissionTitle}
                            onChange={(event) => setMetadataForm((current) => ({
                              ...current,
                              imageAspectRatio: isMediaImageAspectRatio(event.target.value)
                                ? event.target.value
                                : DEFAULT_IMAGE_PRESENTATION.aspectRatio,
                            }))}
                            className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {MEDIA_IMAGE_ASPECT_RATIO_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                          {metadataForm.imageFocalX}% {metadataForm.imageFocalY}% focal point with {metadataForm.imageObjectFit} fit.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {selectedAsset.type === 'font' && (
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <div className="mb-3">
                      <div className="text-sm font-semibold">Font registration</div>
                      <div className="text-xs text-muted-foreground">
                        Registered fonts appear in editor font controls and public render payloads.
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_110px_120px]">
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">Family</span>
                        <input
                          value={metadataForm.fontFamily}
                          disabled={!canEditMedia || isMediaMutationBusy}
                          title={canEditMedia ? undefined : editPermissionTitle}
                          onChange={(event) => setMetadataForm((current) => ({ ...current, fontFamily: event.target.value }))}
                          className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                          placeholder="Brand Sans"
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">Weight</span>
                        <input
                          value={metadataForm.fontWeight}
                          disabled={!canEditMedia || isMediaMutationBusy}
                          title={canEditMedia ? undefined : editPermissionTitle}
                          onChange={(event) => setMetadataForm((current) => ({ ...current, fontWeight: event.target.value }))}
                          className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                          placeholder="400"
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">Style</span>
                        <select
                          value={metadataForm.fontStyle}
                          disabled={!canEditMedia || isMediaMutationBusy}
                          title={canEditMedia ? undefined : editPermissionTitle}
                          onChange={(event) => setMetadataForm((current) => ({
                            ...current,
                            fontStyle: event.target.value === 'italic' || event.target.value === 'oblique'
                              ? event.target.value
                              : 'normal',
                          }))}
                          className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <option value="normal">Normal</option>
                          <option value="italic">Italic</option>
                          <option value="oblique">Oblique</option>
                        </select>
                      </label>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_150px]">
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">Fallback stack</span>
                        <input
                          value={metadataForm.fontFallback}
                          disabled={!canEditMedia || isMediaMutationBusy}
                          title={canEditMedia ? undefined : editPermissionTitle}
                          onChange={(event) => setMetadataForm((current) => ({ ...current, fontFallback: event.target.value }))}
                          className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                          placeholder="system-ui, sans-serif"
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">Display</span>
                        <select
                          value={metadataForm.fontDisplay}
                          disabled={!canEditMedia || isMediaMutationBusy}
                          title={canEditMedia ? undefined : editPermissionTitle}
                          onChange={(event) => setMetadataForm((current) => ({
                            ...current,
                            fontDisplay: event.target.value === 'auto' ||
                              event.target.value === 'block' ||
                              event.target.value === 'fallback' ||
                              event.target.value === 'optional'
                              ? event.target.value
                              : 'swap',
                          }))}
                          className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <option value="swap">Swap</option>
                          <option value="fallback">Fallback</option>
                          <option value="optional">Optional</option>
                          <option value="block">Block</option>
                          <option value="auto">Auto</option>
                        </select>
                      </label>
                    </div>
                    <div
                      className="mt-3 rounded-lg border border-border bg-background px-3 py-2 text-lg"
                      data-testid="media-font-preview"
                      data-preview-source={selectedAsset.visibility === 'private' ? 'signed' : 'public'}
                      data-preview-ready={selectedFontPreviewUrl ? 'true' : 'false'}
                      style={{
                        fontFamily: metadataForm.fontFamily
                          ? `"${metadataForm.fontFamily}", ${metadataForm.fontFallback || 'system-ui, sans-serif'}`
                          : undefined,
                      }}
                    >
                      {metadataForm.fontFamily || 'Uploaded font preview'}
                    </div>
                    {(isLoadingFontPreview || fontPreviewError || (selectedAsset.visibility === 'private' && selectedFontPreviewUrl)) && (
                      <div
                        className={cn(
                          'mt-2 rounded-lg border px-3 py-2 text-xs',
                          fontPreviewError
                            ? 'border-warning/40 bg-warning/10 text-warning'
                            : 'border-border bg-background text-muted-foreground',
                        )}
                        data-testid="media-font-preview-status"
                      >
                        {fontPreviewError
                          ? fontPreviewError
                          : isLoadingFontPreview
                            ? 'Preparing private font preview...'
                            : selectedAsset.visibility === 'private'
                              ? 'Private font preview uses a temporary signed URL.'
                              : 'Public font preview uses the public file endpoint.'}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-sm font-medium">Folder</label>
                  <select
                    value={metadataForm.folderId}
                    disabled={!canEditMedia || isMediaMutationBusy}
                    title={canEditMedia ? undefined : editPermissionTitle}
                    onChange={(event) => setMetadataForm((current) => ({ ...current, folderId: event.target.value }))}
                    className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">Root</option>
                    {folderOptions.map((folder) => (
                      <option key={folder.id} value={folder.id}>{folder.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">Visibility</label>
                  <select
                    value={metadataForm.visibility}
                    disabled={!canEditMedia || isMediaMutationBusy}
                    title={canEditMedia ? undefined : editPermissionTitle}
                    onChange={(event) => setMetadataForm((current) => ({
                      ...current,
                      visibility: event.target.value === 'private' ? 'private' : 'public',
                    }))}
                    className="w-full rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                </div>
              </div>

              <div className="md:col-span-2 rounded-xl border border-border bg-muted/30 p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">Delivery analytics</div>
                    <div className="text-xs text-muted-foreground">
                      Counts requests served through Backy file and transform endpoints. Direct CDN/storage hits need provider analytics.
                    </div>
                  </div>
                  {selectedDeliveryAnalytics && (
                    <span className="rounded bg-background px-2 py-1 font-mono text-xs text-muted-foreground">
                      {selectedDeliveryAnalytics.totalRequests} requests
                    </span>
                  )}
                </div>

                {selectedDeliveryAnalytics ? (
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-lg border border-border bg-background p-3">
                      <div className="text-xs text-muted-foreground">Total</div>
                      <div className="mt-1 font-mono text-lg font-semibold">{selectedDeliveryAnalytics.totalRequests}</div>
                    </div>
                    <div className="rounded-lg border border-border bg-background p-3">
                      <div className="text-xs text-muted-foreground">Files</div>
                      <div className="mt-1 font-mono text-lg font-semibold">{selectedDeliveryAnalytics.fileRequests}</div>
                    </div>
                    <div className="rounded-lg border border-border bg-background p-3">
                      <div className="text-xs text-muted-foreground">Transforms</div>
                      <div className="mt-1 font-mono text-lg font-semibold">{selectedDeliveryAnalytics.transformRequests}</div>
                    </div>
                    <div className="rounded-lg border border-border bg-background p-3">
                      <div className="text-xs text-muted-foreground">Bytes</div>
                      <div className="mt-1 font-mono text-lg font-semibold">{formatBytes(selectedDeliveryAnalytics.bytesServed)}</div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                    No Backy-served delivery requests have been recorded for this asset yet.
                  </div>
                )}

                {selectedDeliveryAnalytics && (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-border bg-background p-3">
                      <div className="text-xs text-muted-foreground">Last delivery</div>
                      <div className="mt-1 text-sm font-medium">{formatAuditDate(selectedDeliveryAnalytics.lastDeliveredAt)}</div>
                      <div className="mt-1 font-mono text-xs text-muted-foreground">{selectedDeliveryAnalytics.lastDeliveryType}</div>
                    </div>
                    <div className="rounded-lg border border-border bg-background p-3">
                      <div className="text-xs text-muted-foreground">Top endpoint</div>
                      <div className="mt-1 text-sm font-medium">
                        {selectedDeliveryAnalytics.variants[0]?.key || 'file'}
                      </div>
                      <div className="mt-1 font-mono text-xs text-muted-foreground">
                        {selectedDeliveryAnalytics.variants[0]?.requests || 0} requests
                      </div>
                    </div>
                  </div>
                )}

                {selectedProviderInsight && (
                  <div className="mt-3 rounded-lg border border-border bg-background p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">Provider and CDN boundary</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {selectedProviderInsight.deliveryMode === 'provider-public-base'
                            ? 'A provider public base URL is configured for direct storage/CDN delivery.'
                            : selectedProviderInsight.deliveryMode === 'local'
                              ? 'Local storage is proxied through Backy development delivery.'
                              : 'Backy is the delivery boundary until a provider public base URL is configured.'}
                        </div>
                      </div>
                      <span className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
                        {selectedProviderInsight.provider}
                      </span>
                    </div>
                    <dl className="mt-3 grid gap-3 text-xs md:grid-cols-3">
                      <div>
                        <dt className="text-muted-foreground">Storage path</dt>
                        <dd className="mt-1 break-all font-mono">{selectedProviderInsight.storagePath || 'not recorded'}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">CDN analytics</dt>
                        <dd className="mt-1 font-medium">
                          {selectedProviderAnalytics
                            ? 'Provider metrics recorded'
                            : selectedProviderInsight.cdnAnalyticsStatus === 'tracked-by-backy'
                            ? 'Backy counters active'
                            : selectedProviderInsight.cdnAnalyticsStatus === 'provider-console-required'
                              ? 'Provider console required'
                              : 'Not configured'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Delivery URL</dt>
                        <dd className="mt-1 break-all font-mono">
                          {selectedProviderInsight.directProviderUrl || selectedProviderInsight.publicUrl || 'not available'}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-3" data-testid="media-provider-analytics">
                      {assetProviderAnalyticsNotice && (
                        <Notice tone="success" className="mb-3">
                          {assetProviderAnalyticsNotice}
                        </Notice>
                      )}
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium">Provider/CDN metrics</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Record counters from S3, Supabase, CloudFront, or another CDN when media bypasses Backy delivery routes.
                          </div>
                        </div>
                        {selectedProviderAnalytics && (
                          <span className="rounded bg-background px-2 py-1 font-mono text-xs text-muted-foreground">
                            synced {formatAuditDate(selectedProviderAnalytics.lastSyncedAt)}
                          </span>
                        )}
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-4">
                        <label className="space-y-1 text-sm">
                          <span className="font-medium">Provider requests</span>
                          <input
                            type="number"
                            min="0"
                            value={providerAnalyticsRequests}
                            onChange={(event) => setProviderAnalyticsRequests(event.target.value)}
                            className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-sm disabled:cursor-not-allowed disabled:opacity-60"
                            placeholder="0"
                            disabled={isMediaMutationBusy || !canEditMedia}
                            title={canEditMedia ? undefined : editPermissionTitle}
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="font-medium">Provider bytes served</span>
                          <input
                            type="number"
                            min="0"
                            value={providerAnalyticsBytes}
                            onChange={(event) => setProviderAnalyticsBytes(event.target.value)}
                            className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-sm disabled:cursor-not-allowed disabled:opacity-60"
                            placeholder="0"
                            disabled={isMediaMutationBusy || !canEditMedia}
                            title={canEditMedia ? undefined : editPermissionTitle}
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="font-medium">Analytics source</span>
                          <input
                            value={providerAnalyticsSource}
                            onChange={(event) => setProviderAnalyticsSource(event.target.value)}
                            className="w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                            placeholder="cloudfront"
                            disabled={isMediaMutationBusy || !canEditMedia}
                            title={canEditMedia ? undefined : editPermissionTitle}
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="font-medium">Reporting window</span>
                          <input
                            value={providerAnalyticsWindow}
                            onChange={(event) => setProviderAnalyticsWindow(event.target.value)}
                            className="w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                            placeholder="last-30-days"
                            disabled={isMediaMutationBusy || !canEditMedia}
                            title={canEditMedia ? undefined : editPermissionTitle}
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="font-medium">Conversions</span>
                          <input
                            type="number"
                            min="0"
                            value={providerAnalyticsConversions}
                            onChange={(event) => setProviderAnalyticsConversions(event.target.value)}
                            className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-sm disabled:cursor-not-allowed disabled:opacity-60"
                            placeholder="0"
                            disabled={isMediaMutationBusy || !canEditMedia}
                            title={canEditMedia ? undefined : editPermissionTitle}
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="font-medium">Conversion value</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={providerAnalyticsValue}
                            onChange={(event) => setProviderAnalyticsValue(event.target.value)}
                            className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-sm disabled:cursor-not-allowed disabled:opacity-60"
                            placeholder="0"
                            disabled={isMediaMutationBusy || !canEditMedia}
                            title={canEditMedia ? undefined : editPermissionTitle}
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="font-medium">Currency</span>
                          <input
                            value={providerAnalyticsCurrency}
                            onChange={(event) => setProviderAnalyticsCurrency(event.target.value)}
                            className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-sm disabled:cursor-not-allowed disabled:opacity-60"
                            placeholder="USD"
                            disabled={isMediaMutationBusy || !canEditMedia}
                            title={canEditMedia ? undefined : editPermissionTitle}
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="font-medium">Attribution window</span>
                          <input
                            value={providerAnalyticsAttributionWindow}
                            onChange={(event) => setProviderAnalyticsAttributionWindow(event.target.value)}
                            className="w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                            placeholder="last-click"
                            disabled={isMediaMutationBusy || !canEditMedia}
                            title={canEditMedia ? undefined : editPermissionTitle}
                          />
                        </label>
                      </div>
                      {selectedProviderAnalytics && (
                        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                          <div className="rounded bg-background px-2 py-1.5">
                            <dt className="text-muted-foreground">Recorded requests</dt>
                            <dd className="mt-1 font-mono">{selectedProviderAnalytics.totalRequests}</dd>
                          </div>
                          <div className="rounded bg-background px-2 py-1.5">
                            <dt className="text-muted-foreground">Recorded bytes</dt>
                            <dd className="mt-1 font-mono">{formatBytes(selectedProviderAnalytics.bytesServed)}</dd>
                          </div>
                          <div className="rounded bg-background px-2 py-1.5">
                            <dt className="text-muted-foreground">Source window</dt>
                            <dd className="mt-1 font-mono">{selectedProviderAnalytics.source} · {selectedProviderAnalytics.reportingWindow}</dd>
                          </div>
                          <div className="rounded bg-background px-2 py-1.5">
                            <dt className="text-muted-foreground">Conversions</dt>
                            <dd className="mt-1 font-mono">{selectedProviderAnalytics.conversions} · {selectedProviderAnalytics.conversionRate}%</dd>
                          </div>
                          <div className="rounded bg-background px-2 py-1.5">
                            <dt className="text-muted-foreground">Attributed value</dt>
                            <dd className="mt-1 font-mono">{selectedProviderAnalytics.currency} {selectedProviderAnalytics.conversionValue.toFixed(2)}</dd>
                          </div>
                          <div className="rounded bg-background px-2 py-1.5">
                            <dt className="text-muted-foreground">Attribution</dt>
                            <dd className="mt-1 font-mono">{selectedProviderAnalytics.attributionWindow}</dd>
                          </div>
                        </dl>
                      )}
                      <div className="mt-3 flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isMediaMutationBusy || !canEditMedia}
                          title={canEditMedia ? undefined : editPermissionTitle}
                          onClick={() => void handleSaveProviderAnalytics()}
                        >
                          <Cloud className="size-4" />
                          {isSavingProviderAnalytics ? 'Recording...' : 'Record provider metrics'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="md:col-span-2 rounded-xl border border-border bg-muted/30 p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">Replacement history</div>
                    <div className="text-xs text-muted-foreground">
                      Swap the stored file while keeping this asset ID stable for pages, posts, products, and custom frontends.
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {isLoadingAssetVersions
                        ? 'Loading retained versions...'
                        : assetVersionSource === 'database'
                          ? 'DB-backed retained versions'
                          : 'Metadata retained versions'}
                    </div>
                  </div>
                  <label className={cn(
                    'inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium shadow-sm hover:bg-muted',
                    (isMediaMutationBusy || !canEditMedia) && 'pointer-events-none opacity-60',
                  )}
                    title={canEditMedia ? undefined : editPermissionTitle}
                  >
                    <Upload className="size-4" />
                    {isReplacingAsset ? 'Replacing...' : 'Replace file'}
                    <input
                      type="file"
                      className="sr-only"
                      accept={replacementAcceptForAsset(selectedAsset.type)}
                      disabled={isMediaMutationBusy || !canEditMedia}
                      onChange={(event) => {
                        void handleReplaceAsset(event.target.files);
                        event.currentTarget.value = '';
                      }}
                    />
                  </label>
                </div>

                {assetReplacementError && (
                  <Notice tone="warning" className="mb-3">
                    {assetReplacementError}
                  </Notice>
                )}

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                  <div className="rounded-lg border border-border bg-background px-3 py-3">
                    <div className="text-sm font-medium">Current file</div>
                    <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                      <span className="rounded bg-muted px-2 py-1">{selectedAsset.type}</span>
                      <span className="rounded bg-muted px-2 py-1">{selectedAsset.size}</span>
                      <span className="rounded bg-muted px-2 py-1">{replacementVersions.length} previous</span>
                    </div>
                    <p className="mt-2 break-all text-xs text-muted-foreground">{selectedAsset.name}</p>
                  </div>

                  {replacementVersions.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border bg-background px-3 py-3 text-sm text-muted-foreground">
                      No replacements have been recorded for this asset yet.
                    </div>
                  ) : (
                    <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                      {replacementVersions.map((version, index) => {
                        const comparisonKey = version.id || `${version.originalName || version.filename || 'version'}-${index}`;
                        const isComparing = comparisonVersionId === comparisonKey;
                        const currentSizeBytes = assetSizeBytes(selectedAsset);
                        const retainedSizeBytes = Number.isFinite(Number(version.sizeBytes)) ? Math.max(0, Number(version.sizeBytes)) : undefined;
                        const sizeDelta = formatSizeDelta(currentSizeBytes, retainedSizeBytes);
                        const currentStoragePath = mediaMetadataText(selectedAsset.metadata, 'storagePath');
                        const currentStorageProvider = mediaMetadataText(selectedAsset.metadata, 'storageProvider');
                        const currentFingerprint = assetBinaryFingerprint(selectedAsset.metadata);
                        const retainedFingerprint = versionBinaryFingerprint(version);
                        const retainedName = version.originalName || version.filename || 'Previous file';
                        const nameDelta = formatTextDelta(selectedAsset.name, retainedName, 'Name');
                        const pathDelta = formatTextDelta(currentStoragePath, version.storagePath || '', 'Path');
                        const checksumDelta = formatFingerprintDelta(currentFingerprint, retainedFingerprint);
                        const typeComparison = version.type && version.type !== selectedAsset.type
                          ? `${version.type} -> ${selectedAsset.type}`
                          : selectedAsset.type;
                        const currentMimeType = assetMimeLabel(selectedAsset);
                        const mimeComparison = version.mimeType && version.mimeType !== currentMimeType
                          ? `${version.mimeType} -> ${currentMimeType}`
                          : currentMimeType;
                        const retainedMimeType = version.mimeType || 'retained MIME not exposed';
                        const retainedType = version.type || selectedAsset.type;
                        const retainedPreviewBlockedReason = selectedAssetPreviewBlockedReason || mediaPreviewBlockedReason({
                          visibility: selectedAsset.visibility,
                          metadata: version.metadata,
                        });

                        return (
                          <div key={comparisonKey} className="rounded-lg border border-border bg-background px-3 py-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{version.originalName || version.filename || 'Previous file'}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {formatReplacementSize(version.sizeBytes)} · replaced {formatAuditDate(version.replacedAt || version.createdAt || '')}
                                </p>
                              </div>
                              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                                {version.url && !retainedPreviewBlockedReason && (
                                  <a
                                    href={version.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                  >
                                    Open
                                    <ExternalLink className="size-3" />
                                  </a>
                                )}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={isComparing ? 'secondary' : 'outline'}
                                  disabled={isMediaMutationBusy}
                                  onClick={() => setComparisonVersionId(isComparing ? null : comparisonKey)}
                                  title="Compare retained version with the current file."
                                >
                                  <Code2 className="size-3.5" />
                                  {isComparing ? 'Hide compare' : 'Compare'}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={pendingRestoreVersionId === version.id ? 'primary' : 'outline'}
                                  disabled={isMediaMutationBusy || !canEditMedia || !version.id}
                                  onClick={() => void handleRestoreAssetVersion(version)}
                                  title={!canEditMedia ? editPermissionTitle : version.id ? 'Restore retained version' : 'This retained version cannot be restored because it has no version id.'}
                                >
                                  <RefreshCw className="size-3.5" />
                                  {pendingRestoreVersionId === version.id
                                    ? (isRestoringAssetVersion ? 'Restoring...' : 'Confirm restore')
                                    : 'Restore'}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={pendingDeleteVersionId === version.id ? 'danger' : 'outline'}
                                  disabled={isMediaMutationBusy || !canDeleteMedia || !version.id}
                                  onClick={() => void handleDeleteAssetVersion(version)}
                                  title={!canDeleteMedia ? deletePermissionTitle : version.id ? 'Delete retained version' : 'This retained version cannot be deleted because it has no version id.'}
                                >
                                  <Trash2 className="size-3.5" />
                                  {pendingDeleteVersionId === version.id
                                    ? (isDeletingAssetVersion ? 'Deleting...' : 'Confirm')
                                    : 'Delete'}
                                </Button>
                              </div>
                            </div>
                            {isComparing && (
                              <div className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-3" data-testid="media-version-comparison">
                                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Version comparison</div>
                                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                                  <MediaVersionPreview
                                    label="Current preview"
                                    type={selectedAsset.type}
                                    mimeType={currentMimeType}
                                    url={selectedAssetPreviewBlockedReason ? undefined : selectedAsset.url}
                                    name={selectedAsset.name}
                                    sizeLabel={formatBytes(currentSizeBytes)}
                                    blockedReason={selectedAssetPreviewBlockedReason}
                                  />
                                  <MediaVersionPreview
                                    label="Retained preview"
                                    type={retainedType}
                                    mimeType={retainedMimeType}
                                    url={retainedPreviewBlockedReason ? undefined : version.url}
                                    name={retainedName}
                                    sizeLabel={formatReplacementSize(version.sizeBytes)}
                                    blockedReason={retainedPreviewBlockedReason}
                                  />
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                  {[nameDelta, sizeDelta, checksumDelta, pathDelta].map((item) => (
                                    <span key={item} className="rounded bg-background px-2 py-1 font-mono text-muted-foreground">
                                      {item}
                                    </span>
                                  ))}
                                </div>
                                <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                                  <div className="rounded bg-background px-2 py-1.5">
                                    <dt className="text-muted-foreground">Current</dt>
                                    <dd className="mt-1 break-all font-mono">{selectedAsset.name} · {formatBytes(currentSizeBytes)}</dd>
                                  </div>
                                  <div className="rounded bg-background px-2 py-1.5">
                                    <dt className="text-muted-foreground">Retained</dt>
                                    <dd className="mt-1 break-all font-mono">{retainedName} · {formatReplacementSize(version.sizeBytes)}</dd>
                                  </div>
                                  <div className="rounded bg-background px-2 py-1.5">
                                    <dt className="text-muted-foreground">Size delta</dt>
                                    <dd className="mt-1 font-mono">{sizeDelta}</dd>
                                  </div>
                                  <div className="rounded bg-background px-2 py-1.5">
                                    <dt className="text-muted-foreground">Type and MIME</dt>
                                    <dd className="mt-1 break-all font-mono">{typeComparison} · {mimeComparison}</dd>
                                  </div>
                                  <div className="rounded bg-background px-2 py-1.5">
                                    <dt className="text-muted-foreground">Provider</dt>
                                    <dd className="mt-1 font-mono">{`${versionProviderLabel(version.storageProvider)} -> ${versionProviderLabel(currentStorageProvider)}`}</dd>
                                  </div>
                                  <div className="rounded bg-background px-2 py-1.5">
                                    <dt className="text-muted-foreground">Storage path</dt>
                                    <dd className="mt-1 break-all font-mono">{`${versionProviderLabel(version.storagePath)} -> ${versionProviderLabel(currentStoragePath)}`}</dd>
                                  </div>
                                  <div className="rounded bg-background px-2 py-1.5">
                                    <dt className="text-muted-foreground">Binary fingerprint</dt>
                                    <dd className="mt-1 break-all font-mono">{`${formatFingerprintLabel(retainedFingerprint)} -> ${formatFingerprintLabel(currentFingerprint)}`}</dd>
                                  </div>
                                  <div className="rounded bg-background px-2 py-1.5">
                                    <dt className="text-muted-foreground">Timeline</dt>
                                    <dd className="mt-1 font-mono">
                                      retained {formatAuditDate(version.createdAt || '')} · replaced {formatAuditDate(version.replacedAt || '')}
                                    </dd>
                                  </div>
                                  {version.reason && (
                                    <div className="rounded bg-background px-2 py-1.5 sm:col-span-2">
                                      <dt className="text-muted-foreground">Reason</dt>
                                      <dd className="mt-1">{version.reason}</dd>
                                    </div>
                                  )}
                                </dl>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="md:col-span-2 rounded-xl border border-border bg-muted/30 p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">Safety scan</div>
                    <div className="text-xs text-muted-foreground">
                      Static upload checks for accepted file type, dangerous SVG content, and scanner metadata.
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <StatusBadge
                      status={
                        selectedMediaSecurity.status === 'quarantined'
                          ? 'quarantined'
                          : getSafetyScan(selectedAsset.metadata)?.status === 'clean' ? 'clean' : 'not-scanned'
                      }
                    />
                    {selectedMediaSecurity.status === 'quarantined' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isMediaMutationBusy || !canEditMedia}
                        title={canEditMedia ? undefined : editPermissionTitle}
                        onClick={() => void handleReleaseQuarantine()}
                      >
                        {isUpdatingSafety ? 'Releasing...' : 'Release quarantine'}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isMediaMutationBusy || !canEditMedia}
                        title={canEditMedia ? undefined : editPermissionTitle}
                        onClick={() => void handleQuarantineAsset()}
                      >
                        {isUpdatingSafety ? 'Quarantining...' : 'Quarantine asset'}
                      </Button>
                    )}
                  </div>
                </div>

                {selectedMediaSecurity.status === 'quarantined' && (
                  <Notice tone="warning" className="mb-3">
                    Delivery is blocked for this asset. It was quarantined
                    {selectedMediaSecurity.quarantinedAt ? ` ${formatAuditDate(selectedMediaSecurity.quarantinedAt)}` : ''}
                    {selectedMediaSecurity.reason ? `: ${selectedMediaSecurity.reason}` : '.'}
                  </Notice>
                )}

                {getSafetyScan(selectedAsset.metadata) ? (
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <dl className="rounded-lg border border-border bg-background p-3 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">Scanner</dt>
                        <dd className="font-mono text-xs">{getSafetyScan(selectedAsset.metadata)?.scanner}</dd>
                      </div>
                      <div className="mt-3">
                        <dt className="text-xs text-muted-foreground">Scanned</dt>
                        <dd className="font-mono text-xs">{formatAuditDate(getSafetyScan(selectedAsset.metadata)?.scannedAt || '')}</dd>
                      </div>
                    </dl>
                    <div className="rounded-lg border border-border bg-background p-3">
                      <div className="text-xs font-medium text-muted-foreground">Checks</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {getSafetyScan(selectedAsset.metadata)?.checks.map((check) => (
                          <span key={check} className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
                            {check}
                          </span>
                        ))}
                      </div>
                      {(getSafetyScan(selectedAsset.metadata)?.warnings.length || 0) > 0 && (
                        <p className="mt-3 text-xs text-warning">
                          {getSafetyScan(selectedAsset.metadata)?.warnings.join(' ')}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-background px-3 py-3 text-sm text-muted-foreground">
                    This asset predates upload safety metadata. Replace it to run the current static scan.
                  </div>
                )}
              </div>

              <div className="md:col-span-2 rounded-xl border border-border bg-muted/30 p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">Delivery</div>
                    <div className="text-xs text-muted-foreground">
                      URLs custom frontends can use for this asset without reading admin internals.
                    </div>
                  </div>
                  {selectedMediaSecurity.status === 'quarantined' ? (
                    <span className="rounded bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
                      Quarantined
                    </span>
                  ) : selectedAsset.visibility === 'private' ? (
                    <span className="rounded bg-warning/10 px-2 py-1 text-xs font-medium text-warning">
                      Private asset
                    </span>
                  ) : (
                    <span className="rounded bg-success/10 px-2 py-1 text-xs font-medium text-success">
                      Public asset
                    </span>
                  )}
                </div>

                {assetDeliveryError && (
                  <Notice tone="warning" className="mb-3">
                    {assetDeliveryError}
                  </Notice>
                )}
                {selectedMediaSecurity.status === 'quarantined' && (
                  <Notice tone="warning" className="mb-3">
                    Public files, transforms, and signed URLs are disabled until quarantine is released.
                  </Notice>
                )}

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-border bg-background p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">Public file endpoint</div>
                        <div className="text-xs text-muted-foreground">
                          Available only when visibility is public.
                        </div>
                      </div>
                      {selectedAsset.visibility !== 'private' && selectedMediaSecurity.status !== 'quarantined' && (
                        <a
                          href={publicFileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          Open
                          <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                    <textarea
                      readOnly
                      value={publicFileUrl}
                      className="min-h-16 w-full resize-none rounded-lg border bg-muted/50 px-3 py-2 font-mono text-xs text-muted-foreground"
                    />
                    {selectedMediaSecurity.status === 'quarantined' ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Public reads are blocked because this asset is quarantined.
                      </p>
                    ) : selectedAsset.visibility === 'private' && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Public reads are blocked for private files. Generate a temporary signed URL below.
                      </p>
                    )}
                  </div>

                  <div className="rounded-lg border border-border bg-background p-3">
                    <div className="mb-2">
                      <div className="text-sm font-medium">Temporary signed URL</div>
                      <div className="text-xs text-muted-foreground">
                        Time-limited access for private delivery, downloads, previews, and integrations.
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[120px_140px_160px]">
                      <label className="space-y-1 text-xs font-medium text-muted-foreground">
                        Expires
                        <input
                          type="number"
                          min={60}
                          max={86400}
                          value={signedUrlSeconds}
                          onChange={(event) => setSignedUrlSeconds(Math.max(60, Math.min(86400, Number(event.target.value) || 900)))}
                          className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground"
                        />
                      </label>
                      <label className="space-y-1 text-xs font-medium text-muted-foreground">
                        Disposition
                        <select
                          value={signedUrlDisposition}
                          onChange={(event) => setSignedUrlDisposition(event.target.value === 'attachment' ? 'attachment' : 'inline')}
                          className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground"
                        >
                          <option value="inline">Inline</option>
                          <option value="attachment">Download</option>
                        </select>
                      </label>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isMediaMutationBusy || !canViewMedia || selectedMediaSecurity.status === 'quarantined'}
                          title={canViewMedia ? undefined : viewPermissionTitle}
                          onClick={() => void handleCreateSignedUrl()}
                          iconStart={<KeyRound className="size-4" />}
                          className="w-full whitespace-nowrap"
                        >
                          {isCreatingSignedUrl ? 'Generating...' : 'Generate URL'}
                        </Button>
                      </div>
                    </div>
                    {signedUrl && (
                      <div className="mt-3">
                        <textarea
                          readOnly
                          value={signedUrl.signedUrl}
                          className="min-h-16 w-full resize-none rounded-lg border bg-muted/50 px-3 py-2 font-mono text-xs text-muted-foreground"
                        />
                        <p className="mt-2 text-xs text-muted-foreground">
                          Expires {new Date(signedUrl.expiresAt).toLocaleString()} · {signedUrl.disposition}
                        </p>
                      </div>
                    )}
                  </div>

                  {selectedAsset.type === 'image' && (
                    <div className="rounded-lg border border-border bg-background p-3 lg:col-span-2">
                      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium">Optimized image transform</div>
                          <div className="text-xs text-muted-foreground">
                            Public image redirect into the Next image optimizer for generated frontends.
                          </div>
                        </div>
                        {selectedAsset.visibility !== 'private' && selectedMediaSecurity.status !== 'quarantined' && (
                          <a
                            href={publicTransformUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            Open
                            <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                      <div className="mb-2 grid gap-2 sm:grid-cols-[120px_120px_minmax(0,1fr)]">
                        <label className="space-y-1 text-xs font-medium text-muted-foreground">
                          Width
                          <input
                            type="number"
                            min={16}
                            max={3840}
                            value={transformWidth}
                            onChange={(event) => setTransformWidth(Math.max(16, Math.min(3840, Number(event.target.value) || 1200)))}
                            className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground"
                          />
                        </label>
                        <label className="space-y-1 text-xs font-medium text-muted-foreground">
                          Quality
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={transformQuality}
                            onChange={(event) => setTransformQuality(Math.max(1, Math.min(100, Number(event.target.value) || 75)))}
                            className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground"
                          />
                        </label>
                      </div>
                      <textarea
                        readOnly
                        value={publicTransformUrl}
                        className="min-h-16 w-full resize-none rounded-lg border bg-muted/50 px-3 py-2 font-mono text-xs text-muted-foreground"
                      />
                      {selectedMediaSecurity.status === 'quarantined' ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Image transforms are disabled while this asset is quarantined.
                        </p>
                      ) : selectedAsset.visibility === 'private' && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Image transforms only run for public image assets.
                        </p>
                      )}
                      {responsiveManifest && (
                        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
                          <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium">Responsive image manifest</div>
                              <div className="text-xs text-muted-foreground">
                                Drop this srcset into custom frontends for predictable responsive delivery.
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {responsiveManifest.preparedAt && (
                                <span className="rounded bg-success/10 px-2 py-1 text-xs font-medium text-success">
                                  Prepared
                                </span>
                              )}
                              {responsiveManifest.format && (
                                <span className="rounded bg-background px-2 py-1 font-mono text-xs text-muted-foreground">
                                  {responsiveManifest.format}
                                </span>
                              )}
                              <span className="rounded bg-background px-2 py-1 font-mono text-xs text-muted-foreground">
                                {responsiveManifest.variants.length} widths
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isMediaMutationBusy || !canEditMedia || selectedAsset.visibility === 'private' || selectedMediaSecurity.status === 'quarantined'}
                                title={canEditMedia ? undefined : editPermissionTitle}
                                onClick={() => void handlePrepareTransforms()}
                              >
                                {isPreparingTransforms ? 'Preparing...' : 'Prepare variants'}
                              </Button>
                            </div>
                          </div>
                          <div className="mb-2 flex flex-wrap gap-2">
                            {responsiveManifest.variants.map((variant) => (
                              <a
                                key={variant.width}
                                href={variant.url}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded border border-border bg-background px-2 py-1 font-mono text-xs text-muted-foreground hover:text-primary"
                              >
                                {variant.width}w
                              </a>
                            ))}
                          </div>
                          <textarea
                            readOnly
                            value={responsiveManifest.srcSet}
                            className="min-h-20 w-full resize-none rounded-lg border bg-background px-3 py-2 font-mono text-xs text-muted-foreground"
                          />
                          <p className="mt-2 font-mono text-xs text-muted-foreground">
                            sizes="{responsiveManifest.sizes}"
                          </p>
                          {responsiveManifest.preparedAt && (
                            <p className="mt-2 text-xs text-muted-foreground">
                              Prepared {new Date(responsiveManifest.preparedAt).toLocaleString()}
                              {responsiveManifest.preparedBy ? ` by ${responsiveManifest.preparedBy}` : ''}
                              {responsiveManifest.generatedBytes ? ` · ${formatBytes(responsiveManifest.generatedBytes)} generated` : ''}
                              {responsiveManifest.storageProvider ? ` · ${responsiveManifest.storageProvider}` : ''}.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="md:col-span-2 rounded-xl border border-border bg-muted/30 p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">Used in</div>
                    <div className="text-xs text-muted-foreground">
                      Bind this asset to pages or posts so usage tracking and frontend references stay explicit.
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {referencedPages.length + referencedPosts.length} references
                  </div>
                </div>

                {assetReferenceError && (
                  <Notice tone="warning" className="mb-3">
                    {assetReferenceError}
                  </Notice>
                )}

                <div className="mb-4 rounded-lg border border-border bg-background p-3">
                  <div className="grid gap-2 lg:grid-cols-[120px_minmax(0,1fr)_150px_140px]">
                    <label className="space-y-1 text-xs font-medium text-muted-foreground">
                      Type
                      <select
                        value={bindingTargetType}
                        disabled={!canEditMedia || isMediaMutationBusy}
                        title={canEditMedia ? undefined : editPermissionTitle}
                        onChange={(event) => setBindingTargetType(event.target.value === 'post' ? 'post' : 'page')}
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <option value="page">Page</option>
                        <option value="post">Post</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-xs font-medium text-muted-foreground">
                      Target
                      <select
                        value={bindingTargetId}
                        disabled={!canEditMedia || isMediaMutationBusy}
                        title={canEditMedia ? undefined : editPermissionTitle}
                        onChange={(event) => setBindingTargetId(event.target.value)}
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <option value="">Select {bindingTargetType}</option>
                        {bindingTargets.map((target) => (
                          <option key={target.id} value={target.id}>
                            {target.label} · {target.detail}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 text-xs font-medium text-muted-foreground">
                      Usage
                      <select
                        value={bindingUsageType}
                        disabled={!canEditMedia || isMediaMutationBusy}
                        title={canEditMedia ? undefined : editPermissionTitle}
                        onChange={(event) => setBindingUsageType(event.target.value as typeof bindingUsageType)}
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <option value="content">Content</option>
                        <option value="background">Background</option>
                        <option value="thumbnail">Thumbnail</option>
                        <option value="cover">Cover</option>
                        <option value="avatar">Avatar</option>
                        <option value="document">Document</option>
                        <option value="icon">Icon</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isMediaMutationBusy || !canEditMedia || !bindingTargetId}
                        title={canEditMedia ? undefined : editPermissionTitle}
                        onClick={() => void handleBindTarget()}
                        className="w-full"
                      >
                        {isUpdatingBinding ? 'Updating...' : 'Bind asset'}
                      </Button>
                    </div>
                  </div>
                  {bindingTargets.length === 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      No {bindingTargetType}s are available for the active site.
                    </p>
                  )}
                </div>

                {referencedPages.length === 0 && referencedPosts.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                    No page or post references are tracked for this asset yet.
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {referencedPages.map(({ id, page }) => (
                      <div
                        key={`page-${id}`}
                        className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background px-3 py-3"
                      >
                        <Link
                          to="/pages/$pageId/edit"
                          params={{ pageId: id }}
                          search={activeSiteRouteSearch}
                          className="flex min-w-0 items-start gap-3 hover:text-primary"
                        >
                          <Layout className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{page?.title || id}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              Page{page?.slug ? ` /${page.slug}` : ''}
                            </span>
                          </span>
                        </Link>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={isMediaMutationBusy || !canEditMedia}
                          title={canEditMedia ? undefined : editPermissionTitle}
                          onClick={() => void handleUnbindTarget('page', id)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}

                    {referencedPosts.map(({ id, post }) => (
                      <div
                        key={`post-${id}`}
                        className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background px-3 py-3"
                      >
                        <Link
                          to="/blog/$postId"
                          params={{ postId: id }}
                          search={activeSiteRouteSearch}
                          className="flex min-w-0 items-start gap-3 hover:text-primary"
                        >
                          <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{post?.title || id}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              Post{post?.slug ? ` /blog/${post.slug}` : ''}
                            </span>
                          </span>
                        </Link>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={isMediaMutationBusy || !canEditMedia}
                          title={canEditMedia ? undefined : editPermissionTitle}
                          onClick={() => void handleUnbindTarget('post', id)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="md:col-span-2 rounded-xl border border-border bg-muted/30 p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">Activity</div>
                    <div className="text-xs text-muted-foreground">
                      Audit trail for this asset across uploads, edits, references, and delivery changes.
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={assetAuditActionFilter}
                      disabled={isLoadingAssetAudit || !canExportMediaActivity}
                      title={canExportMediaActivity ? undefined : activityPermissionTitle}
                      onChange={(event) => setAssetAuditActionFilter(event.target.value as MediaAuditActionFilter)}
                      className="rounded-lg border bg-background px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label="Filter media activity"
                    >
                      {MEDIA_AUDIT_ACTION_FILTERS.map((filter) => (
                        <option key={filter.value} value={filter.value}>{filter.label}</option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={isLoadingAssetAudit || !canExportMediaActivity}
                      title={canExportMediaActivity ? undefined : activityPermissionTitle}
                      onClick={() => void loadAssetAuditLogs(selectedAsset.id)}
                    >
                      Refresh
                    </Button>
                  </div>
                </div>

                <div className="mb-3 grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                  {mediaAccessRows.map((row) => (
                    <div key={row.permission} className="rounded-lg border border-border bg-background px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-muted-foreground">{row.label}</span>
                        <span className={cn(
                          'rounded px-2 py-0.5 text-[11px] font-medium',
                          row.allowed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                        )}>
                          {row.allowed ? 'Allowed' : 'Restricted'}
                        </span>
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-muted-foreground">{row.permission}</div>
                    </div>
                  ))}
                </div>

                {!canExportMediaActivity && (
                  <Notice tone="warning" className="mb-3">
                    Your account needs activity.export to read this asset audit feed. {activityPermissionTitle}
                  </Notice>
                )}

                {assetAuditError && (
                  <Notice tone="warning" className="mb-3">
                    {assetAuditError}
                  </Notice>
                )}

                {!canExportMediaActivity ? (
                  <div className="rounded-lg border border-dashed border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                    Asset activity is hidden until audit export access is granted.
                  </div>
                ) : isLoadingAssetAudit ? (
                  <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                    Loading media activity...
                  </div>
                ) : assetAuditLogs.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                    No activity has been recorded for this asset yet.
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {assetAuditLogs.map((log) => {
                      const details = mediaAuditDetails(log);

                      return (
                        <div key={log.id} className="rounded-lg border border-border bg-background px-3 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{mediaAuditTitle(log)}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{mediaAuditDescription(log)}</p>
                            </div>
                            <time className="shrink-0 font-mono text-xs text-muted-foreground" dateTime={log.createdAt}>
                              {formatAuditDate(log.createdAt)}
                            </time>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span className="rounded bg-muted px-2 py-1">{mediaAuditPermission(log.action)}</span>
                            <span className="rounded bg-muted px-2 py-1">Actor {log.actorId || 'admin'}</span>
                            {log.requestId && (
                              <span className="rounded bg-muted px-2 py-1 font-mono">{log.requestId}</span>
                            )}
                          </div>
                          {details.length > 0 && (
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                              {details.map((detail) => (
                                <div key={detail.label} className="rounded bg-muted px-2 py-1.5 text-xs">
                                  <div className="font-medium text-muted-foreground">{detail.label}</div>
                                  <div className="mt-1 break-all font-mono text-[11px] text-foreground">{detail.value}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  if (isMediaMutationBusy || !canDeleteMedia) return;
                  setPendingDeleteAsset(selectedAsset);
                }}
                disabled={isMediaMutationBusy || !canDeleteMedia}
                title={canDeleteMedia ? undefined : deletePermissionTitle}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
              <button
                type="button"
                disabled={isMediaMutationBusy || !canEditMedia}
                title={canEditMedia ? undefined : editPermissionTitle}
                onClick={() => void handleSaveMetadata()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {isSavingMetadata ? 'Saving...' : 'Save details'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Delete {pendingDeleteAsset.name}?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This removes the file from the media library and from public delivery. Check references first if the asset is used on pages or posts.
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              <span>{pendingDeleteAsset.type}</span>
              <span aria-hidden="true">·</span>
              <span>{pendingDeleteAsset.size}</span>
              <StatusBadge status={pendingDeleteAsset.visibility || 'public'} className="px-1.5 py-0 text-[10px]" />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteAsset(null)}
                disabled={isDeletingAsset}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteAsset(pendingDeleteAsset)}
                disabled={isDeletingAsset || !canDeleteMedia}
                title={canDeleteMedia ? undefined : deletePermissionTitle}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeletingAsset ? 'Deleting...' : 'Delete asset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingBulkDelete && selectedMediaAssets.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Delete {selectedMediaAssets.length} selected asset{selectedMediaAssets.length === 1 ? '' : 's'}?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Selected files will be removed from Backy storage and frontend media APIs.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingBulkDelete(false)}
                disabled={isBulkUpdating}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleBulkDelete()}
                disabled={isBulkUpdating || !canDeleteMedia}
                title={canDeleteMedia ? undefined : deletePermissionTitle}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBulkUpdating ? 'Deleting...' : 'Delete assets'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Delete folder {pendingDeleteFolder.name}?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  The folder will be removed. Media inside it will stay in the library and move back to Root.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              {files.filter((file) => file.folderId === pendingDeleteFolder.id).length} asset{files.filter((file) => file.folderId === pendingDeleteFolder.id).length === 1 ? '' : 's'} will move to Root.
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteFolder(null)}
                disabled={isDeletingFolder}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteFolder(pendingDeleteFolder.id)}
                disabled={isDeletingFolder || !canDeleteMedia}
                title={canDeleteMedia ? undefined : deletePermissionTitle}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeletingFolder ? 'Deleting...' : 'Delete folder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function MediaReadinessCheck({ label, detail, ready }: { label: string; detail: string; ready: boolean }) {
  const Icon = ready ? CheckCircle2 : AlertTriangle;

  return (
    <div className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', ready ? 'text-emerald-600' : 'text-amber-600')} />
      <div className="min-w-0">
        <div className="text-xs font-semibold text-foreground">{label}</div>
        <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function MediaWorkflowStep({ index, label, detail }: { index: number; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary">
        {index}
      </span>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-foreground">{label}</div>
        <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function MediaApiStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-mono text-sm font-semibold">{value}</div>
    </div>
  );
}

function MediaApiSnippet({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      <code className="block min-w-0 overflow-x-auto rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
        {value}
      </code>
    </div>
  );
}

function MediaStorageDiagnosticCard({ diagnostic }: { diagnostic: SettingsInfrastructureDiagnostic }) {
  return (
    <article className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-foreground">{diagnostic.label}</h4>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{diagnostic.summary}</p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold capitalize',
            diagnostic.status === 'ready' && 'bg-emerald-50 text-emerald-700',
            diagnostic.status === 'warning' && 'bg-amber-50 text-amber-700',
            diagnostic.status === 'blocked' && 'bg-red-50 text-red-700',
          )}
        >
          {diagnostic.status}
        </span>
      </div>
      {diagnostic.missing.length > 0 && (
        <p className="mt-2 break-words text-xs text-warning">
          Missing: {diagnostic.missing.join(', ')}
        </p>
      )}
      <div className="mt-3 grid gap-2">
        {diagnostic.checks.map((check) => (
          <div key={check.label} className="rounded-md border border-border bg-background px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-foreground">{check.label}</span>
              <span
                className={cn(
                  'text-[11px] font-semibold',
                  check.ready ? 'text-emerald-700' : check.required ? 'text-red-700' : 'text-amber-700',
                )}
              >
                {check.ready ? 'Ready' : check.required ? 'Required' : 'Optional'}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{check.detail}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function MediaStorageProvisioningCard({ result }: { result: SettingsStorageProvisioningResult }) {
  return (
    <div className="mt-4 rounded-lg border border-border bg-background p-4" data-testid="media-storage-provisioning-results">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Provisioning and rotation probe</h3>
          <p className="mt-1 text-sm text-muted-foreground">{result.summary}</p>
        </div>
        <span
          className={cn(
            'rounded px-2.5 py-1 text-xs font-semibold capitalize',
            result.status === 'ready' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
          )}
        >
          {result.status}
        </span>
      </div>
      <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Provider</dt>
          <dd className="font-mono">{result.provider}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Probe path</dt>
          <dd className="break-all font-mono">{result.probePath}</dd>
        </div>
      </dl>
      {result.automation && (
        <div className="mt-4 rounded-md border border-border bg-muted/20 px-3 py-3" data-testid="media-storage-container-automation">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Bucket automation</h4>
            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', result.automation.status === 'ready' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>
              {result.automation.created ? 'created' : result.automation.checked ? 'verified' : 'blocked'}
            </span>
          </div>
          <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Target</dt>
              <dd className="break-all font-mono">{result.automation.target}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Action</dt>
              <dd className="font-mono">{result.automation.action}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{result.automation.detail}</p>
        </div>
      )}
      {result.lifecyclePolicy && (
        <div className="mt-4 rounded-md border border-border bg-muted/20 px-3 py-3" data-testid="media-storage-lifecycle-policy">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Lifecycle policy automation</h4>
            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', result.lifecyclePolicy.status === 'ready' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>
              {result.lifecyclePolicy.applied ? 'applied' : result.lifecyclePolicy.checked ? 'checked' : 'not applied'}
            </span>
          </div>
          <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Target</dt>
              <dd className="break-all font-mono">{result.lifecyclePolicy.target}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Policy</dt>
              <dd>
                {result.lifecyclePolicy.policy
                  ? `${result.lifecyclePolicy.policy.tempRetentionDays}d probes / ${result.lifecyclePolicy.policy.noncurrentVersionDays}d versions`
                  : 'not configured'}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{result.lifecyclePolicy.detail}</p>
        </div>
      )}
      {result.lifecycleCleanup && (
        <div className="mt-4 rounded-md border border-border bg-muted/20 px-3 py-3" data-testid="media-storage-lifecycle-cleanup">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Lifecycle cleanup worker</h4>
            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', result.lifecycleCleanup.status === 'ready' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>
              {result.lifecycleCleanup.dryRun ? 'preview' : 'applied'}
            </span>
          </div>
          <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Probe candidates</dt>
              <dd>{result.lifecycleCleanup.candidates.probeObjects}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Version candidates</dt>
              <dd>{result.lifecycleCleanup.candidates.retainedVersions}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Objects removed</dt>
              <dd>{result.lifecycleCleanup.deleted.storageObjects}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{result.lifecycleCleanup.detail}</p>
          {result.lifecycleCleanup.errors.length > 0 && (
            <p className="mt-2 text-xs leading-5 text-warning">{result.lifecycleCleanup.errors.slice(0, 2).join(' · ')}</p>
          )}
        </div>
      )}
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {result.checks.map((check) => (
          <div key={check.label} className="rounded-md border border-border bg-muted/20 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold">{check.label}</span>
              <span className={cn('text-[11px] font-semibold', check.ready ? 'text-success' : 'text-warning')}>
                {check.ready ? 'Ready' : 'Needs attention'}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{check.detail}</p>
          </div>
        ))}
      </div>
      {result.credentialRotation && (
        <div className="mt-4 rounded-md border border-border bg-muted/20 px-3 py-3" data-testid="media-storage-credential-rotation">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Credential rotation probe</h4>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{result.credentialRotation.summary}</p>
            </div>
            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', result.credentialRotation.status === 'ready' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>
              {result.credentialRotation.status}
            </span>
          </div>
          <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Replacement probe path</dt>
              <dd className="break-all font-mono">{result.credentialRotation.probePath}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Detected replacement fields</dt>
              <dd>{result.credentialRotation.fields.filter((field) => field.detected).length} / {result.credentialRotation.fields.length}</dd>
            </div>
          </dl>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {result.credentialRotation.checks.map((check) => (
              <div key={check.label} className="rounded-md border border-border bg-background px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{check.label}</span>
                  <span className={cn('text-[11px] font-semibold', check.ready ? 'text-success' : 'text-warning')}>
                    {check.ready ? 'Ready' : 'Needs attention'}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{check.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-md border border-border bg-muted/20 px-3 py-3">
          <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Credential fields</h4>
          <div className="mt-2 grid gap-2">
            {result.rotation.fields.map((field) => (
              <div key={field.name} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="break-all font-mono">{field.name}</span>
                <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', field.detected ? 'bg-success/10 text-success' : field.required ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground')}>
                  {field.secret ? 'secret ' : ''}{field.detected ? 'detected' : field.required ? 'required' : 'optional'}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-md border border-border bg-muted/20 px-3 py-3">
          <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Rotation runbook</h4>
          <ol className="mt-2 space-y-2">
            {result.rotation.nextSteps.map((step, index) => (
              <li key={`${index}:${step}`} className="flex gap-2 text-xs leading-5 text-muted-foreground">
                <span className="font-mono text-foreground">{index + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function MediaTypeIcon({ type, className }: { type: MediaAsset['type']; className?: string }) {
  if (type === 'image') {
    return <ImageIcon className={className} />;
  }

  if (type === 'video') {
    return <Video className={className} />;
  }

  if (type === 'audio') {
    return <Music className={className} />;
  }

  if (type === 'font') {
    return <Type className={className} />;
  }

  if (type === 'file') {
    return <FileText className={className} />;
  }

  return <File className={className} />;
}

const mediaTypeLabel = (type: MediaAsset['type']) => {
  if (type === 'file') return 'document';
  if (type === 'other') return 'other file';
  return type;
};

const mediaPreviewBlockedReason = (
  media: Pick<MediaAsset, 'visibility' | 'metadata'> | { visibility?: MediaAsset['visibility']; metadata?: Record<string, unknown> },
): 'private' | 'quarantined' | null => {
  if (getMediaSecurityPolicy(media.metadata).status === 'quarantined') {
    return 'quarantined';
  }
  return media.visibility === 'private' ? 'private' : null;
};

const MediaPreviewBlocked = ({ reason }: { reason: 'private' | 'quarantined' }) => (
  <div
    className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/60 p-4 text-center text-xs text-muted-foreground"
    data-testid="media-preview-blocked"
    data-preview-blocked={reason}
  >
    <AlertTriangle className="size-5" />
    <span className="font-medium text-foreground">
      {reason === 'quarantined' ? 'Preview blocked' : 'Private preview'}
    </span>
    <span>
      {reason === 'quarantined'
        ? 'Quarantined media is blocked from inline preview.'
        : 'Use a temporary signed URL for private media preview.'}
    </span>
  </div>
);

function MediaAssetPreview({ file }: { file: MediaAsset }) {
  const blockedReason = mediaPreviewBlockedReason(file);
  if (blockedReason) {
    return <MediaPreviewBlocked reason={blockedReason} />;
  }

  if (file.type === 'image' && file.url) {
    return <img src={file.url} alt={file.altText || file.name} className="h-full w-full object-cover" />;
  }

  if (file.type === 'video' && file.url) {
    return (
      <video
        src={file.url}
        className="h-full w-full object-cover"
        muted
        preload="metadata"
        aria-label={file.name}
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-4 text-center">
      <span className="flex size-14 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground shadow-sm">
        <MediaTypeIcon type={file.type} className="h-7 w-7" />
      </span>
      <span className="max-w-full truncate rounded bg-background/80 px-2 py-1 text-xs font-medium capitalize text-muted-foreground">
        {mediaTypeLabel(file.type)}
      </span>
    </div>
  );
}

type MediaExportColumn = typeof MEDIA_EXPORT_COLUMNS[number];

const metadataText = (value: unknown): string => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''
);

const mediaAssetToExportRecord = (
  asset: MediaAsset,
  folders: MediaFolder[],
  siteId: string,
): Record<MediaExportColumn, string | number | null> => {
  const folder = asset.folderId ? folders.find((item) => item.id === asset.folderId) : null;
  const isPublic = asset.visibility !== 'private';

  return {
    asset_id: asset.id,
    name: asset.name,
    type: asset.type,
    mime_type: metadataText(asset.metadata?.mimeType),
    size: asset.size,
    size_bytes: asset.sizeBytes ?? null,
    visibility: asset.visibility || 'public',
    folder_id: asset.folderId || '',
    folder_name: folder?.name || '',
    tags: (asset.tags || []).join('; '),
    alt_text: asset.altText || '',
    caption: asset.caption || '',
    public_file_url: isPublic ? getPublicMediaFileUrl(asset.id, siteId) : '',
    transform_url: isPublic && asset.type === 'image'
      ? getPublicImageTransformUrl(asset.id, { width: 1200, quality: 75 }, siteId)
      : '',
    referenced_pages: (asset.targetPageIds || []).join('; '),
    referenced_posts: (asset.targetPostIds || []).join('; '),
    font_family: metadataText(asset.metadata?.fontFamily),
    font_weight: metadataText(asset.metadata?.fontWeight),
    font_style: metadataText(asset.metadata?.fontStyle),
    font_display: metadataText(asset.metadata?.fontDisplay),
    created_at: metadataText(asset.metadata?.uploadedAt) || metadataText(asset.metadata?.createdAt),
    updated_at: metadataText(asset.metadata?.updatedAt),
  };
};

const csvEscape = (value: unknown): string => {
  const raw = String(value ?? '').replace(/\r?\n/g, '\\n');
  return `"${raw.replace(/"/g, '""')}"`;
};

const getEnvValue = (key: string): string => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return env[key]?.trim() ?? '';
};

const isLocalAdminDevHost = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
    && window.location.port !== '3001';
};

const getPublicBaseUrl = (): string => {
  const envBase = (
    getEnvValue('VITE_BACKY_PUBLIC_API_BASE_URL') ||
    getEnvValue('VITE_PUBLIC_API_URL') ||
    getEnvValue('VITE_API_BASE_URL') ||
    ''
  ).trim();

  if (!envBase && isLocalAdminDevHost()) {
    return 'http://localhost:3001';
  }

  return (envBase || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001'))
    .replace(/\/api\/admin$/, '')
    .replace(/\/api$/, '')
    .replace(/\/$/, '');
};

type MediaAnalytics = {
  totalAssets: number;
  publicAssets: number;
  privateAssets: number;
  referencedAssets: number;
  unusedAssets: number;
  replacedAssets: number;
  quarantinedAssets: number;
  replacementVersions: number;
  replacementBytes: number;
  folderedAssets: number;
  rootAssets: number;
  typeRows: Array<{
    type: MediaAsset['type'];
    count: number;
    bytes: number;
    percent: number;
  }>;
  largestAssets: Array<{
    asset: MediaAsset;
    bytes: number;
  }>;
  providerRoiRows: Array<{
    provider: string;
    providerRequests: number;
    providerConversions: number;
    providerConversionValue: number;
    providerConversionRate: number;
    providerValuePerRequest: number;
    providerCurrency?: string;
    providerLastSyncedAt?: string;
  }>;
  providerRequests: number;
  providerConversions: number;
  providerConversionValue: number;
  providerConversionRate: number;
  providerValuePerRequest: number;
  providerCurrency?: string;
  providerRows: Array<{
    provider: string;
    count: number;
    publicCount: number;
    privateCount: number;
    bytes: number;
    requests: number;
    bytesServed: number;
    providerRequests: number;
    providerBytesServed: number;
    providerConversions: number;
    providerConversionValue: number;
    providerConversionRate: number;
    providerValuePerRequest: number;
    providerCurrency?: string;
    providerLastSyncedAt?: string;
    lastDeliveredAt?: string;
  }>;
};

type MediaSafetyScan = {
  status: 'clean';
  scannedAt: string;
  scanner: string;
  checks: string[];
  warnings: string[];
};

type MediaSecurityPolicy = {
  status: 'clear' | 'quarantined';
  quarantinedAt?: string;
  quarantinedBy?: string;
  reason?: string;
  previousVisibility?: 'public' | 'private';
};

const getSafetyScan = (metadata: Record<string, unknown> | undefined): MediaSafetyScan | undefined => {
  const scan = metadata?.safetyScan;
  if (!scan || typeof scan !== 'object' || Array.isArray(scan)) {
    return undefined;
  }

  const record = scan as Record<string, unknown>;
  if (record.status !== 'clean' || typeof record.scannedAt !== 'string' || typeof record.scanner !== 'string') {
    return undefined;
  }

  return {
    status: 'clean',
    scannedAt: record.scannedAt,
    scanner: record.scanner,
    checks: Array.isArray(record.checks) ? record.checks.filter((check): check is string => typeof check === 'string') : [],
    warnings: Array.isArray(record.warnings) ? record.warnings.filter((warning): warning is string => typeof warning === 'string') : [],
  };
};

const getMediaSecurityPolicy = (metadata: Record<string, unknown> | undefined): MediaSecurityPolicy => {
  const security = metadata?.mediaSecurity;
  if (!security || typeof security !== 'object' || Array.isArray(security)) {
    return { status: 'clear' };
  }

  const record = security as Record<string, unknown>;
  if (record.status !== 'quarantined') {
    return { status: 'clear' };
  }

  return {
    status: 'quarantined',
    previousVisibility: record.previousVisibility === 'private' ? 'private' : 'public',
    ...(typeof record.quarantinedAt === 'string' ? { quarantinedAt: record.quarantinedAt } : {}),
    ...(typeof record.quarantinedBy === 'string' ? { quarantinedBy: record.quarantinedBy } : {}),
    ...(typeof record.reason === 'string' ? { reason: record.reason } : {}),
  };
};

type MediaDeliveryAnalytics = {
  totalRequests: number;
  fileRequests: number;
  transformRequests: number;
  bytesServed: number;
  lastDeliveredAt: string;
  lastDeliveryType: 'file' | 'optimizer-transform';
  variants: Array<{
    key: string;
    requests: number;
  }>;
};

type MediaProviderDeliveryAnalytics = {
  totalRequests: number;
  bytesServed: number;
  conversions: number;
  conversionValue: number;
  conversionRate: number;
  currency: string;
  attributionWindow: string;
  source: string;
  reportingWindow: string;
  lastSyncedAt: string;
};

type MediaProviderInsight = {
  provider: string;
  storagePath?: string;
  publicBaseUrl?: string;
  publicUrl?: string;
  directProviderUrl?: string;
  deliveryMode: 'backy-proxy' | 'provider-public-base' | 'local';
  cdnAnalyticsStatus: 'tracked-by-backy' | 'provider-console-required' | 'not-configured';
};

const numberValue = (value: unknown) => (
  Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0
);

const getMediaDeliveryAnalytics = (metadata: Record<string, unknown> | undefined): MediaDeliveryAnalytics | undefined => {
  const delivery = metadata?.mediaDelivery;
  if (!delivery || typeof delivery !== 'object' || Array.isArray(delivery)) {
    return undefined;
  }

  const record = delivery as Record<string, unknown>;
  if (typeof record.lastDeliveredAt !== 'string') {
    return undefined;
  }

  const lastDeliveryType = record.lastDeliveryType === 'optimizer-transform'
    ? 'optimizer-transform'
    : 'file';

  return {
    totalRequests: numberValue(record.totalRequests),
    fileRequests: numberValue(record.fileRequests),
    transformRequests: numberValue(record.transformRequests),
    bytesServed: numberValue(record.bytesServed),
    lastDeliveredAt: record.lastDeliveredAt,
    lastDeliveryType,
    variants: Array.isArray(record.variants)
      ? record.variants
          .filter((variant): variant is Record<string, unknown> => (
            !!variant && typeof variant === 'object' && !Array.isArray(variant)
          ))
          .map((variant) => ({
            key: typeof variant.key === 'string' ? variant.key : 'file',
            requests: numberValue(variant.requests),
          }))
      : [],
  };
};

const getMediaProviderDeliveryAnalytics = (metadata: Record<string, unknown> | undefined): MediaProviderDeliveryAnalytics | undefined => {
  const delivery = metadata?.providerDelivery;
  if (!delivery || typeof delivery !== 'object' || Array.isArray(delivery)) {
    return undefined;
  }

  const record = delivery as Record<string, unknown>;
  const lastSyncedAt = typeof record.lastSyncedAt === 'string' ? record.lastSyncedAt : '';

  return {
    totalRequests: numberValue(record.totalRequests),
    bytesServed: numberValue(record.bytesServed),
    conversions: numberValue(record.conversions),
    conversionValue: numberValue(record.conversionValue),
    conversionRate: numberValue(record.conversionRate),
    currency: typeof record.currency === 'string' && record.currency.trim().length > 0 ? record.currency.trim().toUpperCase() : 'USD',
    attributionWindow: typeof record.attributionWindow === 'string' && record.attributionWindow.trim().length > 0 ? record.attributionWindow.trim() : 'not specified',
    source: typeof record.source === 'string' && record.source.trim().length > 0 ? record.source.trim() : 'provider-console',
    reportingWindow: typeof record.reportingWindow === 'string' && record.reportingWindow.trim().length > 0 ? record.reportingWindow.trim() : 'not specified',
    lastSyncedAt,
  };
};

const mediaMetadataText = (metadata: Record<string, unknown> | undefined, key: string): string => (
  typeof metadata?.[key] === 'string' && metadata[key].trim().length > 0 ? metadata[key].trim() : ''
);

const storageProviderForAsset = (asset: MediaAsset): string => (
  mediaMetadataText(asset.metadata, 'storageProvider') ||
  asset.responsive?.storageProvider ||
  'unknown'
);

const getMediaProviderInsight = (
  asset: MediaAsset,
  runtimeStorage: SiteSettingsInput['runtimeStorage'] | undefined,
  storageSettings: MediaStorageSettings,
): MediaProviderInsight => {
  const provider = storageProviderForAsset(asset);
  const storagePath = mediaMetadataText(asset.metadata, 'storagePath');
  const publicBaseUrl = runtimeStorage?.publicUrl || storageSettings.publicBaseUrl || '';
  const directProviderUrl = publicBaseUrl && storagePath
    ? `${publicBaseUrl.replace(/\/$/, '')}/${storagePath.replace(/^\//, '')}`
    : undefined;
  const deliveryMode = provider === 'local'
    ? 'local'
    : directProviderUrl
      ? 'provider-public-base'
      : 'backy-proxy';
  const deliveryAnalytics = getMediaDeliveryAnalytics(asset.metadata);
  const cdnAnalyticsStatus = deliveryAnalytics && deliveryAnalytics.totalRequests > 0
    ? 'tracked-by-backy'
    : provider !== 'local' && provider !== 'unknown'
      ? 'provider-console-required'
      : 'not-configured';

  return {
    provider,
    ...(storagePath ? { storagePath } : {}),
    ...(publicBaseUrl ? { publicBaseUrl } : {}),
    publicUrl: asset.url,
    ...(directProviderUrl ? { directProviderUrl } : {}),
    deliveryMode,
    cdnAnalyticsStatus,
  };
};

const DEFAULT_RESPONSIVE_WIDTHS = [320, 640, 960, 1280, 1920];
const DEFAULT_RESPONSIVE_QUALITY = 75;
const DEFAULT_RESPONSIVE_SIZES = '(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px';

const getAdminResponsiveManifest = (asset: MediaAsset, siteId: string): NonNullable<MediaAsset['responsive']> => {
  if (asset.responsive) {
    return asset.responsive;
  }

  const generated = asset.metadata?.generatedTransforms;
  if (generated && typeof generated === 'object' && !Array.isArray(generated)) {
    const record = generated as Record<string, unknown>;
    const variants = Array.isArray(record.variants)
      ? record.variants
          .filter((variant): variant is Record<string, unknown> => (
            !!variant && typeof variant === 'object' && !Array.isArray(variant)
          ))
          .map((variant): NonNullable<MediaAsset['responsive']>['variants'][number] | null => {
            const width = Number(variant.width);
            const quality = Number(variant.quality);
            if (!Number.isFinite(width) || width <= 0) {
              return null;
            }

            const bytes = Number(variant.bytes);
            return {
              width: Math.floor(width),
              quality: Number.isFinite(quality) && quality > 0 ? Math.floor(quality) : DEFAULT_RESPONSIVE_QUALITY,
              url: typeof variant.url === 'string' && variant.url.trim().length > 0
                ? variant.url
                : getPublicImageTransformUrl(asset.id, { width: Math.floor(width), quality: DEFAULT_RESPONSIVE_QUALITY }, siteId),
              ...(Number.isFinite(bytes) ? { bytes } : {}),
              ...(typeof variant.format === 'string' ? { format: variant.format } : {}),
              ...(typeof variant.mimeType === 'string' ? { mimeType: variant.mimeType } : {}),
              ...(typeof variant.generatedAt === 'string' ? { generatedAt: variant.generatedAt } : {}),
              ...(typeof variant.storagePath === 'string' ? { storagePath: variant.storagePath } : {}),
            };
          })
          .filter((variant): variant is NonNullable<MediaAsset['responsive']>['variants'][number] => !!variant)
      : [];

    if (variants.length > 0) {
      return {
        src: typeof record.src === 'string' && record.src.trim().length > 0 ? record.src : asset.url,
        srcSet: variants.map((variant) => `${variant.url} ${variant.width}w`).join(', '),
        sizes: typeof record.sizes === 'string' && record.sizes.trim().length > 0 ? record.sizes : DEFAULT_RESPONSIVE_SIZES,
        variants,
        preparedAt: typeof record.preparedAt === 'string' ? record.preparedAt : undefined,
        preparedBy: typeof record.preparedBy === 'string' ? record.preparedBy : undefined,
        format: typeof record.format === 'string' ? record.format : undefined,
        generatedBytes: Number.isFinite(Number(record.generatedBytes)) ? Number(record.generatedBytes) : undefined,
        storageProvider: typeof record.storageProvider === 'string' ? record.storageProvider : undefined,
      };
    }
  }

  const variants = DEFAULT_RESPONSIVE_WIDTHS.map((width) => ({
    width,
    quality: DEFAULT_RESPONSIVE_QUALITY,
    url: getPublicImageTransformUrl(asset.id, { width, quality: DEFAULT_RESPONSIVE_QUALITY }, siteId),
  }));

  return {
    src: asset.url,
    srcSet: variants.map((variant) => `${variant.url} ${variant.width}w`).join(', '),
    sizes: DEFAULT_RESPONSIVE_SIZES,
    variants,
  };
};

const assetSizeBytes = (asset: MediaAsset): number => {
  if (Number.isFinite(asset.sizeBytes)) {
    return Math.max(0, asset.sizeBytes || 0);
  }

  const match = asset.size.match(/^([\d.]+)\s*(B|KB|MB|GB)$/i);
  if (!match) {
    return 0;
  }

  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return 0;
  }

  const unit = match[2].toUpperCase();
  if (unit === 'GB') return Math.round(value * 1024 * 1024 * 1024);
  if (unit === 'MB') return Math.round(value * 1024 * 1024);
  if (unit === 'KB') return Math.round(value * 1024);
  return Math.round(value);
};

const hasMediaReferences = (asset: MediaAsset): boolean => (
  (asset.targetPageIds?.length || 0) + (asset.targetPostIds?.length || 0) > 0
);

const replacementBytesForAsset = (asset: MediaAsset): number => (
  getReplacementVersions(asset.metadata).reduce((total, version) => total + Math.max(0, version.sizeBytes || 0), 0)
);

const getMediaAnalytics = (assets: MediaAsset[]): MediaAnalytics => {
  const totalBytes = assets.reduce((total, asset) => total + assetSizeBytes(asset), 0);
  const byType = new Map<MediaAsset['type'], { count: number; bytes: number }>();
  const byProvider = new Map<string, {
    count: number;
    publicCount: number;
    privateCount: number;
    bytes: number;
    requests: number;
    bytesServed: number;
    providerRequests: number;
    providerBytesServed: number;
    providerConversions: number;
    providerConversionValue: number;
    providerCurrency?: string;
    providerLastSyncedAt?: string;
    lastDeliveredAt?: string;
  }>();
  let publicAssets = 0;
  let privateAssets = 0;
  let referencedAssets = 0;
  let folderedAssets = 0;
  let replacedAssets = 0;
  let quarantinedAssets = 0;
  let replacementVersions = 0;
  let replacementBytes = 0;

  assets.forEach((asset) => {
    const bytes = assetSizeBytes(asset);
    const current = byType.get(asset.type) || { count: 0, bytes: 0 };
    byType.set(asset.type, {
      count: current.count + 1,
      bytes: current.bytes + bytes,
    });
    const provider = storageProviderForAsset(asset);
    const delivery = getMediaDeliveryAnalytics(asset.metadata);
    const currentProvider = byProvider.get(provider) || {
      count: 0,
      publicCount: 0,
      privateCount: 0,
      bytes: 0,
      requests: 0,
      bytesServed: 0,
      providerRequests: 0,
      providerBytesServed: 0,
      providerConversions: 0,
      providerConversionValue: 0,
      providerCurrency: undefined,
      providerLastSyncedAt: undefined,
      lastDeliveredAt: undefined,
    };
    const providerDelivery = getMediaProviderDeliveryAnalytics(asset.metadata);
    byProvider.set(provider, {
      count: currentProvider.count + 1,
      publicCount: currentProvider.publicCount + (asset.visibility === 'private' ? 0 : 1),
      privateCount: currentProvider.privateCount + (asset.visibility === 'private' ? 1 : 0),
      bytes: currentProvider.bytes + bytes,
      requests: currentProvider.requests + (delivery?.totalRequests || 0),
      bytesServed: currentProvider.bytesServed + (delivery?.bytesServed || 0),
      providerRequests: currentProvider.providerRequests + (providerDelivery?.totalRequests || 0),
      providerBytesServed: currentProvider.providerBytesServed + (providerDelivery?.bytesServed || 0),
      providerConversions: currentProvider.providerConversions + (providerDelivery?.conversions || 0),
      providerConversionValue: currentProvider.providerConversionValue + (providerDelivery?.conversionValue || 0),
      providerCurrency: providerDelivery?.currency || currentProvider.providerCurrency,
      providerLastSyncedAt: [currentProvider.providerLastSyncedAt, providerDelivery?.lastSyncedAt]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .sort()
        .at(-1),
      lastDeliveredAt: [currentProvider.lastDeliveredAt, delivery?.lastDeliveredAt]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .sort()
        .at(-1),
    });

    if (asset.visibility === 'private') privateAssets += 1;
    else publicAssets += 1;

    if (hasMediaReferences(asset)) referencedAssets += 1;
    if (asset.folderId) folderedAssets += 1;
    if (getMediaSecurityPolicy(asset.metadata).status === 'quarantined') quarantinedAssets += 1;

    const versions = getReplacementVersions(asset.metadata);
    if (versions.length > 0) {
      replacedAssets += 1;
      replacementVersions += versions.length;
      replacementBytes += replacementBytesForAsset(asset);
    }
  });

  const providerRows = Array.from(byProvider.entries())
    .map(([provider, value]) => ({
      provider,
      ...value,
      providerConversionRate: value.providerRequests > 0 ? Number(((value.providerConversions / value.providerRequests) * 100).toFixed(4)) : 0,
      providerValuePerRequest: value.providerRequests > 0 ? value.providerConversionValue / value.providerRequests : 0,
    }))
    .sort((a, b) => b.requests - a.requests || b.bytes - a.bytes || b.count - a.count);
  const providerRoiRows = providerRows
    .filter((row) => row.providerRequests > 0 || row.providerConversions > 0 || row.providerConversionValue > 0)
    .sort((a, b) => (
      b.providerConversionValue - a.providerConversionValue ||
      b.providerConversions - a.providerConversions ||
      b.providerRequests - a.providerRequests
    ));
  const providerRequests = providerRoiRows.reduce((total, row) => total + row.providerRequests, 0);
  const providerConversions = providerRoiRows.reduce((total, row) => total + row.providerConversions, 0);
  const providerConversionValue = providerRoiRows.reduce((total, row) => total + row.providerConversionValue, 0);
  const providerCurrency = providerRoiRows.find((row) => !!row.providerCurrency)?.providerCurrency;

  return {
    totalAssets: assets.length,
    publicAssets,
    privateAssets,
    referencedAssets,
    unusedAssets: Math.max(0, assets.length - referencedAssets),
    replacedAssets,
    quarantinedAssets,
    replacementVersions,
    replacementBytes,
    folderedAssets,
    rootAssets: Math.max(0, assets.length - folderedAssets),
    typeRows: Array.from(byType.entries())
      .map(([type, value]) => ({
        type,
        count: value.count,
        bytes: value.bytes,
        percent: totalBytes > 0 ? Math.max(4, Math.round((value.bytes / totalBytes) * 100)) : 0,
      }))
      .sort((a, b) => b.bytes - a.bytes || b.count - a.count),
    largestAssets: assets
      .map((asset) => ({ asset, bytes: assetSizeBytes(asset) }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 4),
    providerRoiRows,
    providerRequests,
    providerConversions,
    providerConversionValue,
    providerConversionRate: providerRequests > 0 ? Number(((providerConversions / providerRequests) * 100).toFixed(4)) : 0,
    providerValuePerRequest: providerRequests > 0 ? providerConversionValue / providerRequests : 0,
    providerCurrency,
    providerRows,
  };
};

type ReplacementVersion = {
  id?: string;
  filename?: string;
  originalName?: string;
  mimeType?: string;
  type?: MediaAsset['type'];
  sizeBytes?: number;
  url?: string;
  storagePath?: string | null;
  storageProvider?: string | null;
  binaryFingerprint?: unknown;
  metadata?: Record<string, unknown>;
  reason?: string | null;
  createdAt?: string;
  replacedAt?: string;
};

const getReplacementVersionsFromRecords = (records: MediaVersionRecord[]): ReplacementVersion[] => (
  records.map((record) => ({
    id: record.id,
    filename: record.filename,
    originalName: record.originalName,
    mimeType: record.mimeType,
    type: record.type === 'document' ? 'file' : record.type,
    sizeBytes: Number.isFinite(Number(record.sizeBytes)) ? Number(record.sizeBytes) : undefined,
    url: record.url,
    storagePath: record.storagePath,
    storageProvider: record.storageProvider,
    binaryFingerprint: record.metadata?.binaryFingerprint,
    metadata: record.metadata,
    reason: record.reason,
    createdAt: record.createdAt,
    replacedAt: record.replacedAt,
  }))
);

const getReplacementVersions = (metadata: Record<string, unknown> | undefined): ReplacementVersion[] => {
  const versions = metadata?.replacementVersions;
  if (!Array.isArray(versions)) {
    return [];
  }

  return versions
    .filter((version): version is Record<string, unknown> => (
      !!version && typeof version === 'object' && !Array.isArray(version)
    ))
    .map((version) => ({
      id: typeof version.id === 'string' ? version.id : undefined,
      filename: typeof version.filename === 'string' ? version.filename : undefined,
      originalName: typeof version.originalName === 'string' ? version.originalName : undefined,
      mimeType: typeof version.mimeType === 'string' ? version.mimeType : undefined,
      type: version.type === 'document'
        ? 'file'
        : version.type === 'image' || version.type === 'video' || version.type === 'audio' || version.type === 'file' || version.type === 'font' || version.type === 'other'
          ? version.type
        : undefined,
      sizeBytes: Number.isFinite(Number(version.sizeBytes)) ? Number(version.sizeBytes) : undefined,
      url: typeof version.url === 'string' ? version.url : undefined,
      storagePath: typeof version.storagePath === 'string' ? version.storagePath : null,
      storageProvider: typeof version.storageProvider === 'string' ? version.storageProvider : null,
      binaryFingerprint: version.binaryFingerprint,
      metadata: version.metadata && typeof version.metadata === 'object' && !Array.isArray(version.metadata)
        ? version.metadata as Record<string, unknown>
        : undefined,
      reason: typeof version.reason === 'string' ? version.reason : null,
      createdAt: typeof version.createdAt === 'string' ? version.createdAt : undefined,
      replacedAt: typeof version.replacedAt === 'string' ? version.replacedAt : undefined,
    }));
};

const replacementAcceptForAsset = (type: MediaAsset['type']) => {
  if (type === 'image') return 'image/*';
  if (type === 'video') return 'video/*';
  if (type === 'audio') return 'audio/*';
  if (type === 'font') return '.woff,.woff2,.ttf,.otf,.eot,font/*';
  if (type === 'other') return '*/*';
  return '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv';
};

const formatReplacementSize = (sizeBytes: number | undefined) => (
  Number.isFinite(sizeBytes) ? formatBytes(sizeBytes || 0) : 'Unknown size'
);

const formatSizeDelta = (currentSizeBytes: number, versionSizeBytes: number | undefined) => {
  if (!Number.isFinite(versionSizeBytes)) {
    return 'Unknown delta';
  }

  const delta = currentSizeBytes - Math.max(0, versionSizeBytes || 0);
  if (delta === 0) {
    return 'Same size';
  }

  return `${delta > 0 ? '+' : '-'}${formatBytes(Math.abs(delta))} vs retained`;
};

type MediaBinaryFingerprint = {
  algorithm: string;
  value: string;
  shortValue: string;
  sizeBytes?: number;
};

const binaryFingerprintFromUnknown = (value: unknown): MediaBinaryFingerprint | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const valueText = typeof record.value === 'string' && record.value.trim().length > 0
    ? record.value.trim()
    : undefined;
  if (!valueText) {
    return undefined;
  }

  const algorithm = typeof record.algorithm === 'string' && record.algorithm.trim().length > 0
    ? record.algorithm.trim()
    : 'sha256';

  return {
    algorithm,
    value: valueText,
    shortValue: typeof record.shortValue === 'string' && record.shortValue.trim().length > 0
      ? record.shortValue.trim()
      : valueText.slice(0, 12),
    sizeBytes: Number.isFinite(Number(record.sizeBytes)) ? Math.max(0, Number(record.sizeBytes)) : undefined,
  };
};

const assetBinaryFingerprint = (metadata: Record<string, unknown> | undefined): MediaBinaryFingerprint | undefined => (
  binaryFingerprintFromUnknown(metadata?.binaryFingerprint)
);

const versionBinaryFingerprint = (version: ReplacementVersion): MediaBinaryFingerprint | undefined => (
  binaryFingerprintFromUnknown(version.binaryFingerprint)
  || binaryFingerprintFromUnknown(version.metadata?.binaryFingerprint)
);

const formatFingerprintLabel = (fingerprint: MediaBinaryFingerprint | undefined) => (
  fingerprint ? `${fingerprint.algorithm}:${fingerprint.shortValue}` : 'not recorded'
);

const formatFingerprintDelta = (
  current: MediaBinaryFingerprint | undefined,
  retained: MediaBinaryFingerprint | undefined,
) => {
  if (!current || !retained) return 'Checksum unavailable';
  return current.value === retained.value ? 'Checksum unchanged' : 'Checksum changed';
};

const formatTextDelta = (current: string, retained: string, label: string) => {
  const normalizedCurrent = current.trim();
  const normalizedRetained = retained.trim();
  if (!normalizedCurrent || !normalizedRetained) return `${label} unavailable`;
  return normalizedCurrent === normalizedRetained ? `${label} unchanged` : `${label} changed`;
};

const versionProviderLabel = (value: string | null | undefined) => (
  value && value.trim().length > 0 ? value.trim() : 'not recorded'
);

const assetMimeLabel = (asset: MediaAsset) => {
  const mimeType = asset.metadata?.mimeType;
  return typeof mimeType === 'string' && mimeType.trim().length > 0 ? mimeType.trim() : 'current MIME not exposed';
};

type MediaPreviewKind = 'image' | 'video' | 'audio' | 'font' | 'file';

const mediaPreviewKind = (type: MediaAsset['type'] | undefined, mimeType: string | undefined): MediaPreviewKind => {
  const mime = mimeType || '';
  if (type === 'image' || mime.startsWith('image/')) return 'image';
  if (type === 'video' || mime.startsWith('video/')) return 'video';
  if (type === 'audio' || mime.startsWith('audio/')) return 'audio';
  if (type === 'font' || mime.startsWith('font/') || mime.includes('font')) return 'font';
  return 'file';
};

type MediaVersionPreviewProps = {
  label: string;
  type: MediaAsset['type'] | undefined;
  mimeType: string | undefined;
  url?: string;
  name: string;
  sizeLabel: string;
  blockedReason?: 'private' | 'quarantined' | null;
};

const MediaVersionPreview = ({
  label,
  type,
  mimeType,
  url,
  name,
  sizeLabel,
  blockedReason,
}: MediaVersionPreviewProps) => {
  const previewKind = mediaPreviewKind(type, mimeType);
  const mimeLabel = mimeType && mimeType.trim().length > 0 ? mimeType : 'MIME not exposed';
  const metadata = `${name} · ${sizeLabel} · ${mimeLabel}`;

  return (
    <div
      className="min-w-0 rounded-lg border border-border bg-background p-2"
      data-testid="media-version-preview"
      data-preview-kind={previewKind}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium">{label}</div>
          <div className="truncate font-mono text-[11px] text-muted-foreground">{metadata}</div>
        </div>
        <span className="rounded bg-muted px-2 py-1 text-[11px] uppercase text-muted-foreground">{previewKind}</span>
      </div>
      {blockedReason ? (
        <div className="aspect-video overflow-hidden rounded border border-border bg-muted/40">
          <MediaPreviewBlocked reason={blockedReason} />
        </div>
      ) : previewKind === 'image' && url ? (
        <div className="flex aspect-video items-center justify-center overflow-hidden rounded border border-border bg-muted/40">
          <img src={url} alt={name} loading="lazy" className="max-h-full max-w-full object-contain" />
        </div>
      ) : previewKind === 'video' && url ? (
        <video src={url} controls className="aspect-video w-full rounded border border-border bg-black" />
      ) : previewKind === 'audio' && url ? (
        <div className="rounded border border-border bg-muted/40 px-2 py-6">
          <audio src={url} controls className="w-full" />
        </div>
      ) : previewKind === 'font' ? (
        <div className="flex aspect-video items-center justify-center rounded border border-border bg-muted/40">
          <div className="text-center">
            <Type className="mx-auto size-5 text-muted-foreground" />
            <div className="mt-2 text-2xl font-semibold">Aa</div>
            <div className="mt-1 text-[11px] text-muted-foreground">Font binary preview</div>
          </div>
        </div>
      ) : (
        <div className="flex aspect-video items-center justify-center rounded border border-border bg-muted/40">
          <div className="text-center text-xs text-muted-foreground">
            <FileText className="mx-auto mb-2 size-5" />
            {url ? 'Inline preview unavailable' : 'Preview URL not retained'}
          </div>
        </div>
      )}
    </div>
  );
};

type MediaPermissionKey = 'media.view' | 'media.create' | 'media.edit' | 'media.configure' | 'media.delete' | 'activity.export';
type MediaAdminRole = 'owner' | 'admin' | 'editor' | 'viewer';

const MEDIA_ACCESS_RULES: Array<{
  permission: MediaPermissionKey;
  label: string;
  roles: MediaAdminRole[];
}> = [
  { permission: 'media.view', label: 'View library', roles: ['owner', 'admin', 'editor', 'viewer'] },
  { permission: 'media.create', label: 'Upload and create folders', roles: ['owner', 'admin', 'editor'] },
  { permission: 'media.edit', label: 'Edit metadata and delivery', roles: ['owner', 'admin', 'editor'] },
  { permission: 'media.configure', label: 'Configure storage', roles: ['owner', 'admin'] },
  { permission: 'media.delete', label: 'Delete assets', roles: ['owner', 'admin'] },
  { permission: 'activity.export', label: 'Read audit feed', roles: ['owner', 'admin'] },
];

const mediaPermissionRule = (
  permissionMatrix: AdminUserPermissionMatrix | null,
  key: MediaPermissionKey,
) => permissionMatrix?.groups
  .flatMap((group) => group.permissions)
  .find((permission) => permission.key === key) || null;

const isMediaPermissionAllowed = (
  permissionMatrix: AdminUserPermissionMatrix | null,
  _currentAdmin: { role: string } | null,
  key: MediaPermissionKey,
): boolean => {
  const matrixRule = mediaPermissionRule(permissionMatrix, key);
  if (matrixRule) {
    return matrixRule.allowed;
  }
  return false;
};

const mediaPermissionReason = (
  permissionMatrix: AdminUserPermissionMatrix | null,
  currentAdmin: { role: string } | null,
  key: MediaPermissionKey,
): string => {
  const matrixRule = mediaPermissionRule(permissionMatrix, key);
  if (matrixRule) {
    return matrixRule.reason;
  }
  if (!currentAdmin) {
    return 'Sign in with an admin account to use this capability.';
  }
  const defaultAllowed = MEDIA_ACCESS_RULES
    .find((rule) => rule.permission === key)
    ?.roles.includes(currentAdmin.role as MediaAdminRole);
  if (!permissionMatrix) {
    return 'Permission matrix unavailable. Reload permissions before using this capability.';
  }
  return defaultAllowed
    ? `Blocked until backend permissions include ${key}; ${currentAdmin.role} role defaults are not enough.`
    : `Blocked by backend permissions and ${currentAdmin.role} role defaults.`;
};

const getMediaAccessRows = (
  permissionMatrix: AdminUserPermissionMatrix | null,
  currentAdmin: { role: string } | null,
) => (
  MEDIA_ACCESS_RULES.map((rule) => ({
    ...rule,
    allowed: isMediaPermissionAllowed(permissionMatrix, currentAdmin, rule.permission),
    reason: mediaPermissionReason(permissionMatrix, currentAdmin, rule.permission),
  }))
);

const auditRecord = (value: unknown): Record<string, unknown> | undefined => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
);

const auditText = (value: unknown): string => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''
);

const formatAuditDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const formatProviderAnalyticsValue = (value: number, currency?: string) => {
  const amount = Number.isFinite(value) ? Math.max(0, value) : 0;
  return `${currency || 'USD'} ${amount.toFixed(2)}`;
};

const formatProviderAnalyticsPercent = (value: number) => {
  const percent = Number.isFinite(value) ? Math.max(0, value) : 0;
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(2)}%`;
};

const formatProviderAnalyticsSummary = (row: MediaAnalytics['providerRows'][number]) => {
  const parts = [
    `Provider/CDN ${row.providerRequests} req`,
    `${formatBytes(row.providerBytesServed)} served`,
  ];

  if (row.providerConversions > 0 || row.providerConversionValue > 0) {
    parts.push(`${row.providerConversions} conv`);
    parts.push(formatProviderAnalyticsValue(row.providerConversionValue, row.providerCurrency));
    parts.push(`${formatProviderAnalyticsPercent(row.providerConversionRate)} CVR`);
  }

  parts.push(`synced ${formatAuditDate(row.providerLastSyncedAt || '')}`);
  return `${parts.join(' · ')}.`;
};

const mediaAuditTitle = (log: AdminAuditLog) => {
  if (log.action === 'create') return 'Asset uploaded';
  if (log.action === 'update') return 'Asset metadata updated';
  if (log.action === 'delete') return 'Asset deleted';
  if (log.action === 'media.bind') return 'Asset bound to content';
  if (log.action === 'media.unbind') return 'Asset removed from content';
  if (log.action === 'media.replace') return 'Asset file replaced';
  if (log.action === 'media.version.restore') return 'Retained version restored';
  if (log.action === 'media.version.delete') return 'Retained version deleted';
  if (log.action === 'media.provider-analytics.ingest') return 'Provider analytics ingested';
  return log.action;
};

const mediaAuditPermission = (action: string): MediaPermissionKey => {
  if (action === 'delete') return 'media.delete';
  if (action === 'media.signed-url' || action === 'media.delivery') return 'media.view';
  if (action === 'media.configure') return 'media.configure';
  if (action === 'create') {
    return 'media.create';
  }
  if (action === 'update' || action === 'media.bind' || action === 'media.unbind' || action === 'media.replace' || action === 'media.version.restore' || action === 'media.provider-analytics.ingest' || action === 'media.transforms.prepare') {
    return 'media.edit';
  }
  if (action === 'media.version.delete') return 'media.delete';
  return 'activity.export';
};

const auditValue = (record: Record<string, unknown> | undefined, key: string): string => {
  const value = record?.[key];
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return '';
};

const compactAuditJson = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  try {
    const text = JSON.stringify(value);
    return text.length > 140 ? `${text.slice(0, 137)}...` : text;
  } catch {
    return '';
  }
};

const mediaAuditDetails = (log: AdminAuditLog): Array<{ label: string; value: string }> => {
  const metadata = auditRecord(log.metadata);
  const before = auditRecord(log.before);
  const after = auditRecord(log.after);
  const changedKeys = Array.isArray(metadata?.changedKeys)
    ? metadata.changedKeys.filter((key): key is string => typeof key === 'string')
    : [];
  const details: Array<{ label: string; value: string }> = [];

  if (changedKeys.length > 0) {
    details.push({ label: 'Changed fields', value: changedKeys.join(', ') });
  }

  const previousFilename = auditText(metadata?.previousFilename) || auditValue(before, 'originalName') || auditValue(before, 'filename');
  const replacementFilename = auditText(metadata?.replacementFilename) || auditValue(after, 'originalName') || auditValue(after, 'filename');
  if (log.action === 'media.replace' && (previousFilename || replacementFilename)) {
    details.push({ label: 'Before', value: previousFilename || 'Previous file' });
    details.push({ label: 'After', value: replacementFilename || 'Replacement file' });
  }

  if (log.action === 'media.version.delete') {
    const deletedFilename = auditText(metadata?.filename) || auditValue(before, 'originalName') || auditValue(before, 'filename');
    if (deletedFilename) {
      details.push({ label: 'Deleted version', value: deletedFilename });
    }
    const source = auditText(metadata?.source);
    if (source) {
      details.push({ label: 'Source', value: source });
    }
  }

  if (log.action === 'media.version.restore') {
    const restoredFilename = auditText(metadata?.restoredFilename);
    const retainedFilename = auditText(metadata?.retainedFilename);
    if (restoredFilename) {
      details.push({ label: 'Restored', value: restoredFilename });
    }
    if (retainedFilename) {
      details.push({ label: 'Retained current file', value: retainedFilename });
    }
  }

  if (log.action === 'media.provider-analytics.ingest') {
    const source = auditText(metadata?.source);
    const reportingWindow = auditText(metadata?.reportingWindow);
    const totalRequests = auditValue(metadata, 'totalRequests');
    const bytesServed = Number(metadata?.bytesServed);
    if (source) {
      details.push({ label: 'Source', value: source });
    }
    if (reportingWindow) {
      details.push({ label: 'Window', value: reportingWindow });
    }
    if (totalRequests) {
      details.push({ label: 'Requests', value: totalRequests });
    }
    if (Number.isFinite(bytesServed)) {
      details.push({ label: 'Bytes served', value: formatBytes(bytesServed) });
    }
  }

  const beforeVisibility = auditValue(before, 'visibility');
  const afterVisibility = auditValue(after, 'visibility');
  if (beforeVisibility && afterVisibility && beforeVisibility !== afterVisibility) {
    details.push({ label: 'Visibility', value: `${beforeVisibility} -> ${afterVisibility}` });
  }

  const targetType = auditText(metadata?.targetType);
  const targetId = auditText(metadata?.targetId);
  const usageType = auditText(metadata?.usageType);
  if (targetType || targetId || usageType) {
    details.push({ label: 'Reference', value: [targetType, targetId, usageType].filter(Boolean).join(' / ') });
  }

  const reason = auditText(metadata?.reason);
  if (reason) {
    details.push({ label: 'Reason', value: reason });
  }

  const safetyStatus = auditText(metadata?.safetyStatus);
  if (safetyStatus) {
    details.push({ label: 'Safety', value: safetyStatus });
  }

  const beforeSize = Number(metadata?.previousSizeBytes);
  const afterSize = Number(metadata?.replacementSizeBytes);
  if (Number.isFinite(beforeSize) && Number.isFinite(afterSize)) {
    details.push({ label: 'Size', value: `${formatBytes(beforeSize)} -> ${formatBytes(afterSize)}` });
  }

  if (details.length === 0 && metadata && Object.keys(metadata).length > 0) {
    details.push({ label: 'Metadata', value: compactAuditJson(metadata) });
  }

  return details.slice(0, 4);
};

const mediaAuditDescription = (log: AdminAuditLog) => {
  const metadata = auditRecord(log.metadata);
  const changedKeys = Array.isArray(metadata?.changedKeys)
    ? metadata.changedKeys.filter((key): key is string => typeof key === 'string')
    : [];
  const targetType = auditText(metadata?.targetType);
  const targetId = auditText(metadata?.targetId);
  const usageType = auditText(metadata?.usageType);
  const filename = auditText(metadata?.filename) || auditText(auditRecord(log.after)?.originalName) || auditText(auditRecord(log.before)?.originalName);
  const replacementFilename = auditText(metadata?.replacementFilename);
  const previousFilename = auditText(metadata?.previousFilename);
  const visibility = auditText(metadata?.visibility) || auditText(auditRecord(log.after)?.visibility);

  if (log.action === 'create') {
    return `${filename || 'Asset'} was uploaded${visibility ? ` as ${visibility}` : ''}.`;
  }

  if (log.action === 'update' && changedKeys.length > 0) {
    return `Changed ${changedKeys.join(', ')}.`;
  }

  if (log.action === 'media.bind') {
    return `Bound to ${targetType || 'content'} ${targetId || ''}${usageType ? ` as ${usageType}` : ''}.`;
  }

  if (log.action === 'media.unbind') {
    return `Removed from ${targetType || 'content'} ${targetId || ''}.`;
  }

  if (log.action === 'media.replace') {
    return `${previousFilename || 'Previous file'} was replaced with ${replacementFilename || 'a new file'}.`;
  }

  if (log.action === 'media.version.delete') {
    return `${filename || 'A retained version'} was removed from replacement history.`;
  }

  if (log.action === 'media.version.restore') {
    const restoredFilename = auditText(metadata?.restoredFilename);
    const retainedFilename = auditText(metadata?.retainedFilename);
    return `${restoredFilename || 'A retained version'} was restored${retainedFilename ? ` and ${retainedFilename} was retained` : ''}.`;
  }

  if (log.action === 'media.provider-analytics.ingest') {
    const source = auditText(metadata?.source);
    const totalRequests = auditValue(metadata, 'totalRequests');
    return `Provider analytics${source ? ` from ${source}` : ''} recorded${totalRequests ? ` ${totalRequests} requests` : ''}.`;
  }

  if (log.action === 'delete') {
    return `${filename || 'Asset'} was removed from the library.`;
  }

  return `Request ${log.requestId || log.id}`;
};
