/**
 * BACKY CMS - MEDIA PAGE
 */

import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import { createFileRoute, Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { AlertTriangle, CheckCircle2, CheckSquare, Code2, Copy, Download, Edit3, ExternalLink, File, FileText, Folder, FolderPlus, Image as ImageIcon, KeyRound, Layout, Music, Save, Trash2, Type, Upload, Video, X } from 'lucide-react';
import { PageShell } from '@/components/layout/PageShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { DEFAULT_MAX_TAGS, normalizeTagValues, parseTagInput, serializeTagValues, TagInput } from '@/components/ui/TagInput';
import {
  getSettings,
  listAdminAuditLogs,
  listBlogPosts,
  listPages,
  type AdminAuditLog,
  type SiteSettingsInput,
} from '@/lib/adminContentApi';
import {
  bindMediaToTarget,
  createSignedMediaUrl,
  createMediaFolder,
  deleteMediaFolder,
  deleteMediaFromBackend,
  getDefaultMediaSiteId,
  getPublicImageTransformUrl,
  getPublicMediaFileUrl,
  listMediaLibrary,
  listMediaFolders,
  prepareMediaTransforms,
  replaceMedia,
  updateMediaFolder,
  updateMedia,
  uploadMedia,
  type MediaQuota,
  type MediaFolder,
  type SignedMediaUrl,
} from '@/lib/mediaApi';
import { getSiteSearchParam, getSiteSelectionFromSearch, siteMatchesIdentifier } from '@/lib/siteSelection';
import { cn, formatBytes } from '@/lib/utils';
import { useStore, type MediaAsset } from '@/stores/mockStore';

export const Route = createFileRoute('/media')({
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
  folderLabel: string;
  visibility: 'public' | 'private';
  assets: Array<{ id: string; name: string; type: MediaAsset['type']; size: string }>;
  failures: string[];
  completedAt: string;
}

function MediaPage() {
  const navigate = useNavigate();
  const routerState = useRouterState();
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);
  const [isCreatingSignedUrl, setIsCreatingSignedUrl] = useState(false);
  const [isUpdatingBinding, setIsUpdatingBinding] = useState(false);
  const [isReplacingAsset, setIsReplacingAsset] = useState(false);
  const [isPreparingTransforms, setIsPreparingTransforms] = useState(false);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const [assetDeliveryError, setAssetDeliveryError] = useState<string | null>(null);
  const [assetReferenceError, setAssetReferenceError] = useState<string | null>(null);
  const [assetReplacementError, setAssetReplacementError] = useState<string | null>(null);
  const [assetAuditLogs, setAssetAuditLogs] = useState<AdminAuditLog[]>([]);
  const [isLoadingAssetAudit, setIsLoadingAssetAudit] = useState(false);
  const [assetAuditError, setAssetAuditError] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<SignedMediaUrl | null>(null);
  const [mediaQuota, setMediaQuota] = useState<MediaQuota | undefined>();
  const [runtimeStorage, setRuntimeStorage] = useState<SiteSettingsInput['runtimeStorage']>();
  const [signedUrlSeconds, setSignedUrlSeconds] = useState(900);
  const [signedUrlDisposition, setSignedUrlDisposition] = useState<'inline' | 'attachment'>('inline');
  const [transformWidth, setTransformWidth] = useState(1200);
  const [transformQuality, setTransformQuality] = useState(75);
  const [bindingTargetType, setBindingTargetType] = useState<'page' | 'post'>('page');
  const [bindingTargetId, setBindingTargetId] = useState('');
  const [bindingUsageType, setBindingUsageType] = useState<'content' | 'background' | 'thumbnail' | 'cover' | 'avatar' | 'document' | 'icon' | 'other'>('content');
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [bulkVisibility, setBulkVisibility] = useState<'keep' | 'public' | 'private'>('keep');
  const [bulkFolderId, setBulkFolderId] = useState<'keep' | 'root' | string>('keep');
  const [bulkTagMode, setBulkTagMode] = useState<'keep' | 'merge' | 'replace' | 'clear'>('keep');
  const [bulkTags, setBulkTags] = useState('');
  const [pendingDeleteAsset, setPendingDeleteAsset] = useState<MediaAsset | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [pendingDeleteFolder, setPendingDeleteFolder] = useState<MediaFolder | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | MediaAsset['type']>('all');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'public' | 'private'>('all');
  const [usageFilter, setUsageFilter] = useState<'all' | 'unused' | 'referenced' | 'replaced'>('all');
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [isUpdatingFolder, setIsUpdatingFolder] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null | undefined>(undefined);
  const [uploadVisibility, setUploadVisibility] = useState<'public' | 'private'>('public');
  const [uploadFolderId, setUploadFolderId] = useState<'current' | 'root' | string>('current');
  const [uploadTags, setUploadTags] = useState('');
  const [recentUploadSummary, setRecentUploadSummary] = useState<MediaUploadSummary | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
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
    folderId: '',
    visibility: 'public' as 'public' | 'private',
  });
  const sites = useStore((state) => state.sites);
  const files = useStore((state) => state.media);
  const pages = useStore((state) => state.pages);
  const posts = useStore((state) => state.posts);
  const setMedia = useStore((state) => state.setMedia);
  const setPages = useStore((state) => state.setPages);
  const setPosts = useStore((state) => state.setPosts);
  const deleteMedia = useStore((state) => state.deleteMedia);
  const [selectedSiteId, setSelectedSiteId] = useState(() => getSiteSelectionFromSearch(sites, getDefaultMediaSiteId()));
  const activeSite = useMemo(
    () => sites.find((site) => siteMatchesIdentifier(site, selectedSiteId)) || sites[0],
    [selectedSiteId, sites],
  );
  const siteId = activeSite?.publicSiteId || activeSite?.id || selectedSiteId || getDefaultMediaSiteId();
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
    setTypeFilter('all');
    setVisibilityFilter('all');
    setUsageFilter('all');
    setRecentUploadSummary(null);
  }, []);

  useEffect(() => {
    const requestedSiteId = getSiteSearchParam();
    if (!requestedSiteId) return;

    const nextSiteId = getSiteSelectionFromSearch(sites, getDefaultMediaSiteId());
    if (nextSiteId === selectedSiteId) return;

    setSelectedSiteId(nextSiteId);
    resetMediaWorkspaceState();
  }, [resetMediaWorkspaceState, routerState.location.search, selectedSiteId, sites]);

  const getAssetDeliveryUrl = useCallback(
    (asset: MediaAsset) => getPublicMediaFileUrl(asset.id, siteId),
    [siteId],
  );
  const uploadTargetFolderId = uploadFolderId === 'current'
    ? selectedFolderId === undefined ? null : selectedFolderId
    : uploadFolderId === 'root' ? null : uploadFolderId;
  const uploadTargetFolderLabel = uploadTargetFolderId
    ? folders.find((folder) => folder.id === uploadTargetFolderId)?.name || 'Selected folder'
    : 'Root';
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
  const replacementVersions = useMemo(
    () => getReplacementVersions(selectedAsset?.metadata),
    [selectedAsset?.metadata],
  );
  const selectedDeliveryAnalytics = useMemo(
    () => getMediaDeliveryAnalytics(selectedAsset?.metadata),
    [selectedAsset?.metadata],
  );
  const mediaAnalytics = useMemo(() => getMediaAnalytics(files), [files]);
  const displayedFiles = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

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

      if (typeof selectedFolderId === 'string' && file.folderId !== selectedFolderId) {
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

      if (usageFilter === 'unused') {
        return !hasMediaReferences(file);
      }
      if (usageFilter === 'referenced') {
        return hasMediaReferences(file);
      }
      if (usageFilter === 'replaced') {
        return getReplacementVersions(file.metadata).length > 0;
      }
      return true;
    });
  }, [files, searchQuery, selectedFolderId, typeFilter, usageFilter, visibilityFilter]);
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
  const allVisibleSelected = displayedFiles.length > 0 && displayedFiles.every((file) => selectedMediaSet.has(file.id));
  const hasBulkTagChange = bulkTagMode === 'clear' ||
    ((bulkTagMode === 'merge' || bulkTagMode === 'replace') && bulkTagList.length > 0);
  const hasBulkChange = bulkVisibility !== 'keep' || bulkFolderId !== 'keep' || hasBulkTagChange;
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
    mediaAnalytics.referencedAssets,
    mediaAnalytics.unusedAssets,
    mediaQuota,
    runtimeStorage,
    uploadVisibility,
  ]);
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
    },
    folders: folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      assetCount: files.filter((asset) => asset.folderId === folder.id).length,
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
    displayedFiles.length,
    files,
    folders,
    fontGroups,
    mediaAnalytics.privateAssets,
    mediaAnalytics.publicAssets,
    mediaAnalytics.referencedAssets,
    mediaAnalytics.unusedAssets,
    mediaQuota,
    publicMediaDetailUrl,
    publicMediaFontsUrl,
    publicMediaFileUrl,
    publicMediaListUrl,
    publicMediaTransformUrl,
    quotaUsagePercent,
    runtimeStorage,
    siteId,
  ]);
  const mediaHandoffText = useMemo(() => JSON.stringify(mediaHandoff, null, 2), [mediaHandoff]);

  const loadLibrary = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const library = await listMediaLibrary({
        siteId,
        scope: 'all',
        limit: 250,
        search: searchQuery.trim() || undefined,
        type: typeFilter === 'file' ? 'document' : typeFilter === 'all' ? undefined : typeFilter,
        visibility: visibilityFilter === 'all' ? undefined : visibilityFilter,
        folderId: selectedFolderId,
      });
      setMedia(library.media);
      setMediaQuota(library.quota);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load media library.');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedFolderId, setMedia, siteId, typeFilter, visibilityFilter]);

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
        }
      } catch {
        if (!cancelled) {
          setRuntimeStorage(undefined);
        }
      }
    };

    void loadRuntimeStorage();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadReferenceTargets = async () => {
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
  }, [setPages, setPosts, siteId]);

  useEffect(() => {
    let cancelled = false;

    const loadFolders = async () => {
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
  }, [siteId]);

  const openMetadataEditor = (asset: MediaAsset) => {
    setSelectedAsset(asset);
    setAssetDeliveryError(null);
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
      folderId: asset.folderId || '',
      visibility: asset.visibility || 'public',
    });
  };

  useEffect(() => {
    setAssetDeliveryError(null);
    setAssetReferenceError(null);
    setAssetAuditError(null);
    setAssetReplacementError(null);
    setSignedUrl(null);
    setBindingTargetId('');
  }, [selectedAsset?.id]);

  const loadAssetAuditLogs = useCallback(async (mediaId: string) => {
    setIsLoadingAssetAudit(true);
    setAssetAuditError(null);

    try {
      const result = await listAdminAuditLogs({
        siteId,
        entity: 'media',
        entityId: mediaId,
        limit: 8,
      });
      setAssetAuditLogs(result.logs);
    } catch (auditError) {
      setAssetAuditLogs([]);
      setAssetAuditError(auditError instanceof Error ? auditError.message : 'Unable to load media activity.');
    } finally {
      setIsLoadingAssetAudit(false);
    }
  }, [siteId]);

  const selectedAssetId = selectedAsset?.id;

  useEffect(() => {
    if (!selectedAssetId) {
      setAssetAuditLogs([]);
      setAssetAuditError(null);
      setIsLoadingAssetAudit(false);
      return;
    }

    void loadAssetAuditLogs(selectedAssetId);
  }, [loadAssetAuditLogs, selectedAssetId]);

  useEffect(() => {
    setBindingTargetId('');
  }, [bindingTargetType]);

  const handleCreateSignedUrl = async () => {
    if (!selectedAsset) {
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
    if (!selectedAsset || selectedAsset.type !== 'image') {
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
    } catch (prepareError) {
      setAssetDeliveryError(prepareError instanceof Error ? prepareError.message : 'Unable to prepare responsive variants.');
    } finally {
      setIsPreparingTransforms(false);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const uploadFiles = Array.from(fileList);
    const targetFolderLabel = uploadTargetFolderLabel;
    const targetVisibility = uploadVisibility;

    setIsUploading(true);
    setError(null);
    setBulkNotice(null);

    const results = await Promise.allSettled(uploadFiles.map((file) => uploadMedia(file, {
        siteId,
        scope: 'global',
        folderId: uploadTargetFolderId,
        visibility: uploadVisibility,
        tags: uploadTagList,
      })));
    const uploaded = results
      .filter((result): result is PromiseFulfilledResult<MediaAsset> => result.status === 'fulfilled')
      .map((result) => result.value);
    const failures = results.filter((result) => result.status === 'rejected');
    const failureMessages = failures.map((failure) => (
      failure.reason instanceof Error ? failure.reason.message : 'Upload failed.'
    ));

    try {
      if (uploaded.length) {
        setMedia([...uploaded, ...files.filter((file) => !uploaded.some((item) => item.id === file.id))]);
        if (uploadFolderId !== 'current') {
          setSelectedFolderId(uploadTargetFolderId);
        }
        setBulkNotice(`${uploaded.length} file${uploaded.length === 1 ? '' : 's'} uploaded to ${targetFolderLabel}.`);
        void loadLibrary();
      }

      setRecentUploadSummary({
        attempted: uploadFiles.length,
        uploaded: uploaded.length,
        failed: failures.length,
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

      if (failures.length) {
        const firstReason = failureMessages[0];
        setError(firstReason
          ? `${firstReason}. ${failures.length} file${failures.length === 1 ? '' : 's'} were not uploaded.`
          : `${failures.length} file${failures.length === 1 ? '' : 's'} were not uploaded.`);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteAsset = async (file: MediaAsset) => {
    setError(null);

    try {
      await deleteMediaFromBackend(file.id, siteId);
      deleteMedia(file.id);
      if (selectedAsset?.id === file.id) {
        setSelectedAsset(null);
      }
      setPendingDeleteAsset(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete media.');
    }
  };

  const toggleMediaSelection = (mediaId: string) => {
    setBulkNotice(null);
    setPendingBulkDelete(false);
    setSelectedMediaIds((current) => (
      current.includes(mediaId)
        ? current.filter((id) => id !== mediaId)
        : [...current, mediaId]
    ));
  };

  const handleSelectVisibleMedia = () => {
    setBulkNotice(null);
    setSelectedMediaIds((current) => {
      const next = new Set(current);
      displayedFiles.forEach((file) => next.add(file.id));
      return Array.from(next);
    });
  };

  const handleClearSelection = () => {
    setBulkNotice(null);
    setPendingBulkDelete(false);
    setSelectedMediaIds([]);
  };

  const handleBulkUpdate = async () => {
    if (selectedMediaAssets.length === 0 || !hasBulkChange) {
      return;
    }

    const baseInput = {
      ...(bulkVisibility !== 'keep' ? { visibility: bulkVisibility } : {}),
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

        return updateMedia(asset.id, {
          ...baseInput,
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
      setBulkTagMode('keep');
      setBulkTags('');
      void loadLibrary();
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
      }
      void loadLibrary();
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
    if (!selectedAsset) {
      return;
    }

    setIsSavingMetadata(true);
    setError(null);

    try {
      const updated = await updateMedia(selectedAsset.id, {
        originalName: metadataForm.name,
        altText: metadataForm.altText,
        caption: metadataForm.caption,
        tags: metadataForm.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        metadata: selectedAsset.type === 'font'
          ? {
              ...selectedAsset.metadata,
              fontFamily: metadataForm.fontFamily.trim() || metadataForm.name.replace(/\.[a-z0-9]+$/i, ''),
              fontWeight: metadataForm.fontWeight.trim() || '400',
              fontStyle: metadataForm.fontStyle,
              fontFallback: metadataForm.fontFallback.trim() || 'system-ui, sans-serif',
              fontDisplay: metadataForm.fontDisplay,
            }
          : selectedAsset.metadata,
        folderId: metadataForm.folderId || null,
        visibility: metadataForm.visibility,
      }, siteId);
      setMedia(files.map((file) => file.id === updated.id ? updated : file));
      setSelectedAsset(updated);
      void loadAssetAuditLogs(updated.id);
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
      const updated = await replaceMedia(selectedAsset.id, file, {
        siteId,
        replacedBy: 'admin',
        reason: 'Manual replacement from media detail',
      });
      applyUpdatedAsset(updated);
      void loadLibrary();
      void loadAssetAuditLogs(updated.id);
    } catch (replaceError) {
      setAssetReplacementError(replaceError instanceof Error ? replaceError.message : 'Unable to replace this asset.');
    } finally {
      setIsReplacingAsset(false);
    }
  };

  const handleBindTarget = async () => {
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
    } catch (bindError) {
      setAssetReferenceError(bindError instanceof Error ? bindError.message : 'Unable to bind this asset.');
    } finally {
      setIsUpdatingBinding(false);
    }
  };

  const handleUnbindTarget = async (targetType: 'page' | 'post', targetId: string) => {
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
    } catch (unbindError) {
      setAssetReferenceError(unbindError instanceof Error ? unbindError.message : 'Unable to remove this reference.');
    } finally {
      setIsUpdatingBinding(false);
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      return;
    }

    setIsCreatingFolder(true);
    setError(null);

    try {
      const folder = await createMediaFolder(name, siteId);
      setFolders((current) => [...current, folder].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)));
      setSelectedFolderId(folder.id);
      setEditingFolderId(null);
      setEditingFolderName('');
      setNewFolderName('');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create folder.');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const startEditingFolder = (folder: MediaFolder) => {
    setEditingFolderId(folder.id);
    setEditingFolderName(folder.name);
    setError(null);
  };

  const cancelEditingFolder = () => {
    setEditingFolderId(null);
    setEditingFolderName('');
  };

  const handleRenameFolder = async (folderId: string) => {
    const name = editingFolderName.trim();
    if (!name) {
      setError('Folder name is required.');
      return;
    }

    const duplicateFolder = folders.find((folder) => (
      folder.id !== folderId && folder.name.trim().toLowerCase() === name.toLowerCase()
    ));
    if (duplicateFolder) {
      setError(`A folder named ${name} already exists.`);
      return;
    }

    setIsUpdatingFolder(true);
    setError(null);

    try {
      const folder = await updateMediaFolder(folderId, { name }, siteId);
      setFolders((current) => current
        .map((item) => item.id === folder.id ? folder : item)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)));
      setBulkNotice(`Folder renamed to ${folder.name}.`);
      cancelEditingFolder();
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : 'Unable to rename folder.');
    } finally {
      setIsUpdatingFolder(false);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    const folder = folders.find((item) => item.id === folderId);
    if (!folder) {
      return;
    }

    setError(null);

    try {
      await deleteMediaFolder(folderId, siteId);
      setFolders((current) => current.filter((item) => item.id !== folderId));
      setMedia(files.map((file) => file.folderId === folderId ? { ...file, folderId: null } : file));
      if (selectedFolderId === folderId) {
        setSelectedFolderId(undefined);
      }
      if (editingFolderId === folderId) {
        cancelEditingFolder();
      }
      setPendingDeleteFolder(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete folder.');
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
  const downloadMediaHandoff = () => {
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
            aria-label="Upload media files"
            onChange={(e) => {
              void handleFileUpload(e.target.files);
              e.currentTarget.value = '';
            }}
          />
          <label
            htmlFor="header-upload"
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 cursor-pointer transition-colors",
              isUploading && "pointer-events-none opacity-70"
            )}
          >
            <Upload className="w-4 h-4" />
            {isUploading ? 'Uploading...' : 'Upload'}
          </label>
        </div>
      }
    >
      <section className="mb-6 rounded-lg border border-border bg-card p-5 shadow-sm" data-testid="media-library-command-center">
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
              onChange={(event) => {
                const nextSiteId = event.target.value;
                setSelectedSiteId(nextSiteId);
                resetMediaWorkspaceState();
                navigate({ to: '/media', search: { siteId: nextSiteId }, replace: true });
              }}
              className="min-h-10 min-w-56 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring"
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
              onClick={() => void copyMediaApiText(mediaHandoffText, 'Media handoff manifest')}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition hover:bg-accent"
            >
              <Copy className="h-4 w-4" />
              Copy manifest
            </button>
            <button
              type="button"
              onClick={downloadMediaHandoff}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition hover:bg-accent"
            >
              <Download className="h-4 w-4" />
              Download JSON
            </button>
            <button
              type="button"
              onClick={exportMediaCsv}
              disabled={displayedFiles.length === 0}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <label
              htmlFor="header-upload"
              className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
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
            void handleFileUpload(e.dataTransfer.files);
          }}
          data-testid="media-upload-dropzone"
          className={cn(
            "relative min-h-[260px] rounded-xl border-2 border-dashed p-8 text-center transition-all",
            isDragging
              ? "border-primary bg-primary/5 scale-[1.01]"
              : "border-border hover:border-primary/50"
          )}
        >
          <input
            type="file"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            multiple
            aria-label="Upload media files"
            disabled={isUploading}
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
            Images, videos, audio, documents, fonts, and other files will upload as {uploadVisibility} assets into {uploadTargetFolderLabel}.
          </p>
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
                onChange={(event) => setUploadVisibility(event.target.value === 'private' ? 'private' : 'public')}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground"
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
                onChange={(event) => setUploadFolderId(event.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground"
                aria-label="Upload folder"
              >
                <option value="current">Current folder filter</option>
                <option value="root">Root</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>{folder.name}</option>
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
              />
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
                onClick={() => void copyMediaApiText(mediaHandoffText, 'Media handoff manifest')}
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
          </div>
        </PanelContent>
      </Panel>

      <Panel className="mb-6 scroll-mt-24" id="media-storage">
        <PanelHeader
          title="Storage health"
          description="Runtime provider and site quota for files served to custom frontends."
          icon={<Folder className="size-4" />}
          action={
            runtimeStorage && (
              <span
                className={cn(
                  'inline-flex items-center rounded px-2.5 py-1 text-xs font-medium',
                  runtimeStorage.configured ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
                )}
              >
                {runtimeStorage.configured ? 'Configured' : 'Needs config'}
              </span>
            )
          }
        />
        <PanelContent>
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
              <div className="mb-3">
                <p className="text-sm font-medium">Storage provider</p>
                <p className="text-xs text-muted-foreground">
                  Current upload target reported by admin settings.
                </p>
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
            </div>
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
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: 'Assets',
                value: mediaAnalytics.totalAssets,
                detail: `${mediaAnalytics.folderedAssets} foldered · ${mediaAnalytics.rootAssets} root`,
                filter: 'all' as const,
              },
              {
                label: 'Referenced',
                value: mediaAnalytics.referencedAssets,
                detail: `${mediaAnalytics.unusedAssets} unused assets need review`,
                filter: 'referenced' as const,
              },
              {
                label: 'Private',
                value: mediaAnalytics.privateAssets,
                detail: `${mediaAnalytics.publicAssets} public assets available to frontends`,
                filter: 'all' as const,
              },
              {
                label: 'Replaced',
                value: mediaAnalytics.replacedAssets,
                detail: `${mediaAnalytics.replacementVersions} retained versions · ${formatBytes(mediaAnalytics.replacementBytes)}`,
                filter: 'replaced' as const,
              },
            ].map((metric) => (
              <button
                key={metric.label}
                type="button"
                onClick={() => setUsageFilter(metric.filter)}
                className="rounded-lg border border-border bg-muted/30 p-4 text-left transition-colors hover:bg-muted"
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
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setUsageFilter(option.value as typeof usageFilter)}
                      className={cn(
                        'rounded-lg border px-3 py-1.5 text-xs font-medium',
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
                    onClick={() => setTypeFilter(row.type)}
                    className="grid grid-cols-[90px_minmax(0,1fr)_90px] items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-muted"
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
                      const first = mediaAnalytics.largestAssets[0]?.asset;
                      if (first) openMetadataEditor(first);
                    }}
                    className="text-xs font-medium text-primary hover:underline"
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
          </div>
        </PanelContent>
      </Panel>

      <div className="mb-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px]">
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="rounded-lg border bg-background px-4 py-2.5"
          placeholder="Search filenames, captions, alt text, or tags"
          aria-label="Search media"
        />
        <select
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value as 'all' | MediaAsset['type'])}
          className="rounded-lg border bg-background px-4 py-2.5"
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
          onChange={(event) => setVisibilityFilter(event.target.value as 'all' | 'public' | 'private')}
          className="rounded-lg border bg-background px-4 py-2.5"
          aria-label="Media visibility filter"
        >
          <option value="all">All visibility</option>
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
      </div>

      <div id="media-folders" className="mb-6 rounded-xl border border-border bg-card p-4 scroll-mt-24">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold">
            <Folder className="h-4 w-4" />
            <span>Folders</span>
          </div>
          <div className="flex min-w-0 flex-1 justify-end gap-2">
            <input
              type="text"
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleCreateFolder();
                }
              }}
              className="w-full max-w-xs rounded-lg border bg-background px-3 py-2 text-sm"
              placeholder="New folder name"
              aria-label="New folder name"
            />
            <button
              type="button"
              disabled={isCreatingFolder || !newFolderName.trim()}
              onClick={() => void handleCreateFolder()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
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
            onClick={() => setSelectedFolderId(undefined)}
            className={cn(
              'rounded-lg border px-3 py-2 text-sm',
              selectedFolderId === undefined ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
            )}
          >
            All media
          </button>
          <button
            type="button"
            onClick={() => setSelectedFolderId(null)}
            className={cn(
              'rounded-lg border px-3 py-2 text-sm',
              selectedFolderId === null ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
            )}
          >
            Root
          </button>
          {folders.map((folder) => (
            <div key={folder.id} className="inline-flex min-h-10 overflow-hidden rounded-lg border border-border bg-background">
              {editingFolderId === folder.id ? (
                <div className="flex min-w-[260px] items-center gap-1 px-1.5 py-1">
                  <input
                    type="text"
                    value={editingFolderName}
                    disabled={isUpdatingFolder}
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
                    className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
                    aria-label={`Rename folder ${folder.name}`}
                    autoFocus
                  />
                  <button
                    type="button"
                    disabled={isUpdatingFolder || !editingFolderName.trim()}
                    onClick={() => void handleRenameFolder(folder.id)}
                    className="inline-flex size-8 items-center justify-center rounded-md text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Save folder name"
                    aria-label={`Save folder name for ${folder.name}`}
                  >
                    <Save className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={isUpdatingFolder}
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
                    onClick={() => setSelectedFolderId(folder.id)}
                    className={cn(
                      'px-3 py-2 text-sm',
                      selectedFolderId === folder.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                    )}
                  >
                    <span className="font-medium">{folder.name}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {files.filter((file) => file.folderId === folder.id).length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => startEditingFolder(folder)}
                    className="border-l border-border px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Rename folder"
                    aria-label={`Rename folder ${folder.name}`}
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDeleteFolder(folder)}
                    className="border-l border-border px-2 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                    title="Delete folder"
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
            description="Select visible assets, move them between folders, change delivery visibility, retag them, or remove them from the library."
            icon={<CheckSquare className="size-4" />}
            action={
              <span className="rounded bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground">
                {selectedMediaAssets.length} selected
              </span>
            }
          />
          <PanelContent>
            <div className="grid gap-4">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_170px_220px_auto_auto]">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isBulkUpdating || allVisibleSelected}
                    onClick={handleSelectVisibleMedia}
                  >
                    Select visible
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isBulkUpdating || selectedMediaAssets.length === 0}
                    onClick={handleClearSelection}
                  >
                    Clear
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Selection follows the current search, type, visibility, and folder filters.
                  </p>
                </div>

                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  Visibility
                  <select
                    value={bulkVisibility}
                    disabled={isBulkUpdating}
                    onChange={(event) => setBulkVisibility(event.target.value === 'public' || event.target.value === 'private' ? event.target.value : 'keep')}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground"
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
                    disabled={isBulkUpdating}
                    onChange={(event) => setBulkFolderId(event.target.value)}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground"
                  >
                    <option value="keep">No change</option>
                    <option value="root">Root</option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>{folder.name}</option>
                    ))}
                  </select>
                </label>

                <div className="flex items-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isBulkUpdating || selectedMediaAssets.length === 0 || !hasBulkChange}
                    onClick={() => void handleBulkUpdate()}
                    className="w-full whitespace-nowrap"
                  >
                    {isBulkUpdating ? 'Applying...' : 'Apply changes'}
                  </Button>
                </div>

                <div className="flex items-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    disabled={isBulkUpdating || selectedMediaAssets.length === 0}
                    onClick={() => void handleBulkDelete()}
                    className="w-full whitespace-nowrap"
                    iconStart={<Trash2 className="size-4" />}
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
                      disabled={isBulkUpdating}
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
                      disabled={bulkTagMode === 'clear' || bulkTagMode === 'keep'}
                      className={bulkTagMode === 'clear' || bulkTagMode === 'keep' ? 'opacity-60' : undefined}
                    />
                  </div>

                  <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                    <div className="font-medium text-foreground">Tag preview</div>
                    <p className="mt-1 leading-5">
                      {bulkTagMode === 'merge' && 'Selected assets keep their existing tags and receive the tags listed here.'}
                      {bulkTagMode === 'replace' && 'Selected assets will use only the tags listed here.'}
                      {bulkTagMode === 'clear' && 'Selected assets will have every tag removed.'}
                      {bulkTagMode === 'keep' && 'Choose a tag action to update selected assets in the same batch as folder or visibility changes.'}
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
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {displayedFiles.map((file) => (
            <div
              key={file.id}
              className={cn(
                'group relative overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:shadow-md',
                selectedMediaSet.has(file.id) ? 'border-primary ring-2 ring-primary/20' : 'border-border',
              )}
            >
              <label
                className="absolute left-2 top-2 z-10 inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background/95 shadow-sm backdrop-blur"
                title={`Select ${file.name}`}
              >
                <input
                  type="checkbox"
                  checked={selectedMediaSet.has(file.id)}
                  onChange={() => toggleMediaSelection(file.id)}
                  className="h-3.5 w-3.5 rounded border-border text-primary"
                  aria-label={`Select ${file.name}`}
                />
                <span className="sr-only">Select {file.name}</span>
              </label>
              <div className="aspect-square bg-muted flex items-center justify-center relative">
                <MediaAssetPreview file={file} />

                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    className="p-2 bg-white rounded-lg text-slate-700 hover:bg-slate-100"
                    onClick={() => openMetadataEditor(file)}
                    title="Edit metadata"
                    aria-label={`Edit metadata for ${file.name}`}
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  {file.visibility !== 'private' && (
                    <>
                      <button
                        className="p-2 bg-white rounded-lg text-slate-700 hover:bg-slate-100"
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
                    className="p-2 bg-white rounded-lg text-red-600 hover:bg-red-50"
                    onClick={() => setPendingDeleteAsset(file)}
                    title="Delete media"
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
                    <p className="text-xs capitalize text-muted-foreground">
                      {mediaTypeLabel(file.type)} · {file.size} · {file.visibility || 'public'}
                    </p>
                  </div>
                </div>
                {file.folderId && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {folders.find((folder) => folder.id === file.folderId)?.name || 'Folder'}
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
          {selectedAsset.type === 'font' && selectedAsset.url && (
            <style>
              {`@font-face {
                font-family: "${(metadataForm.fontFamily || selectedAsset.name.replace(/\.[a-z0-9]+$/i, '')).replace(/["\\]/g, '')}";
                src: url("${selectedAsset.url}");
                font-style: ${metadataForm.fontStyle};
                font-weight: ${metadataForm.fontWeight || '400'};
                font-display: ${metadataForm.fontDisplay};
              }`}
            </style>
          )}
          <div className="w-full max-w-5xl rounded-xl border border-border bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">Media details</h2>
                <p className="text-sm text-muted-foreground">{selectedAsset.type} · {selectedAsset.size}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAsset(null)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close media details"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid max-h-[75vh] gap-5 overflow-y-auto p-5 md:grid-cols-[220px_1fr]">
              <div className="aspect-square overflow-hidden rounded-lg bg-muted">
                {selectedAsset.type === 'image' && selectedAsset.url ? (
                  <img src={selectedAsset.url} alt={metadataForm.altText || selectedAsset.name} className="h-full w-full object-cover" />
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
                    onChange={(event) => setMetadataForm((current) => ({ ...current, name: event.target.value }))}
                    className="w-full rounded-lg border bg-background px-3 py-2"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">Alt text</label>
                  <input
                    value={metadataForm.altText}
                    onChange={(event) => setMetadataForm((current) => ({ ...current, altText: event.target.value }))}
                    className="w-full rounded-lg border bg-background px-3 py-2"
                    placeholder="Describe the image or file"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">Caption</label>
                  <textarea
                    value={metadataForm.caption}
                    onChange={(event) => setMetadataForm((current) => ({ ...current, caption: event.target.value }))}
                    className="min-h-20 w-full rounded-lg border bg-background px-3 py-2"
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
                  />
                </div>

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
                          onChange={(event) => setMetadataForm((current) => ({ ...current, fontFamily: event.target.value }))}
                          className="w-full rounded-lg border bg-background px-3 py-2"
                          placeholder="Brand Sans"
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">Weight</span>
                        <input
                          value={metadataForm.fontWeight}
                          onChange={(event) => setMetadataForm((current) => ({ ...current, fontWeight: event.target.value }))}
                          className="w-full rounded-lg border bg-background px-3 py-2"
                          placeholder="400"
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">Style</span>
                        <select
                          value={metadataForm.fontStyle}
                          onChange={(event) => setMetadataForm((current) => ({
                            ...current,
                            fontStyle: event.target.value === 'italic' || event.target.value === 'oblique'
                              ? event.target.value
                              : 'normal',
                          }))}
                          className="w-full rounded-lg border bg-background px-3 py-2"
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
                          onChange={(event) => setMetadataForm((current) => ({ ...current, fontFallback: event.target.value }))}
                          className="w-full rounded-lg border bg-background px-3 py-2"
                          placeholder="system-ui, sans-serif"
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">Display</span>
                        <select
                          value={metadataForm.fontDisplay}
                          onChange={(event) => setMetadataForm((current) => ({
                            ...current,
                            fontDisplay: event.target.value === 'auto' ||
                              event.target.value === 'block' ||
                              event.target.value === 'fallback' ||
                              event.target.value === 'optional'
                              ? event.target.value
                              : 'swap',
                          }))}
                          className="w-full rounded-lg border bg-background px-3 py-2"
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
                      style={{
                        fontFamily: metadataForm.fontFamily
                          ? `"${metadataForm.fontFamily}", ${metadataForm.fontFallback || 'system-ui, sans-serif'}`
                          : undefined,
                      }}
                    >
                      {metadataForm.fontFamily || 'Uploaded font preview'}
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-sm font-medium">Folder</label>
                  <select
                    value={metadataForm.folderId}
                    onChange={(event) => setMetadataForm((current) => ({ ...current, folderId: event.target.value }))}
                    className="w-full rounded-lg border bg-background px-3 py-2"
                  >
                    <option value="">Root</option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>{folder.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">Visibility</label>
                  <select
                    value={metadataForm.visibility}
                    onChange={(event) => setMetadataForm((current) => ({
                      ...current,
                      visibility: event.target.value === 'private' ? 'private' : 'public',
                    }))}
                    className="w-full rounded-lg border bg-background px-3 py-2"
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
              </div>

              <div className="md:col-span-2 rounded-xl border border-border bg-muted/30 p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">Replacement history</div>
                    <div className="text-xs text-muted-foreground">
                      Swap the stored file while keeping this asset ID stable for pages, posts, products, and custom frontends.
                    </div>
                  </div>
                  <label className={cn(
                    'inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium shadow-sm hover:bg-muted',
                    isReplacingAsset && 'pointer-events-none opacity-60',
                  )}>
                    <Upload className="size-4" />
                    {isReplacingAsset ? 'Replacing...' : 'Replace file'}
                    <input
                      type="file"
                      className="sr-only"
                      accept={replacementAcceptForAsset(selectedAsset.type)}
                      disabled={isReplacingAsset}
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
                      {replacementVersions.map((version, index) => (
                        <div key={version.id || `${version.originalName}-${index}`} className="rounded-lg border border-border bg-background px-3 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{version.originalName || version.filename || 'Previous file'}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatReplacementSize(version.sizeBytes)} · replaced {formatAuditDate(version.replacedAt || version.createdAt || '')}
                              </p>
                            </div>
                            {version.url && (
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
                          </div>
                        </div>
                      ))}
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
                  <span
                    className={cn(
                      'rounded px-2 py-1 text-xs font-medium',
                      getSafetyScan(selectedAsset.metadata)?.status === 'clean'
                        ? 'bg-success/10 text-success'
                        : 'bg-warning/10 text-warning',
                    )}
                  >
                    {getSafetyScan(selectedAsset.metadata)?.status === 'clean' ? 'Clean' : 'Not scanned'}
                  </span>
                </div>

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
                  {selectedAsset.visibility === 'private' ? (
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

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-border bg-background p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">Public file endpoint</div>
                        <div className="text-xs text-muted-foreground">
                          Available only when visibility is public.
                        </div>
                      </div>
                      {selectedAsset.visibility !== 'private' && (
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
                    {selectedAsset.visibility === 'private' && (
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
                          disabled={isCreatingSignedUrl}
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
                        {selectedAsset.visibility !== 'private' && (
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
                      {selectedAsset.visibility === 'private' && (
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
                                disabled={isPreparingTransforms || selectedAsset.visibility === 'private'}
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
                        onChange={(event) => setBindingTargetType(event.target.value === 'post' ? 'post' : 'page')}
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground"
                      >
                        <option value="page">Page</option>
                        <option value="post">Post</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-xs font-medium text-muted-foreground">
                      Target
                      <select
                        value={bindingTargetId}
                        onChange={(event) => setBindingTargetId(event.target.value)}
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground"
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
                        onChange={(event) => setBindingUsageType(event.target.value as typeof bindingUsageType)}
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground"
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
                        disabled={isUpdatingBinding || !bindingTargetId}
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
                          disabled={isUpdatingBinding}
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
                          disabled={isUpdatingBinding}
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
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isLoadingAssetAudit}
                    onClick={() => void loadAssetAuditLogs(selectedAsset.id)}
                  >
                    Refresh
                  </Button>
                </div>

                {assetAuditError && (
                  <Notice tone="warning" className="mb-3">
                    {assetAuditError}
                  </Notice>
                )}

                {isLoadingAssetAudit ? (
                  <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                    Loading media activity...
                  </div>
                ) : assetAuditLogs.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                    No activity has been recorded for this asset yet.
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {assetAuditLogs.map((log) => (
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
                          <span className="rounded bg-muted px-2 py-1">Actor {log.actorId || 'admin'}</span>
                          {log.requestId && (
                            <span className="rounded bg-muted px-2 py-1 font-mono">{log.requestId}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={() => setPendingDeleteAsset(selectedAsset)}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
              <button
                type="button"
                disabled={isSavingMetadata}
                onClick={() => void handleSaveMetadata()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
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
            <div className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              {pendingDeleteAsset.type} · {pendingDeleteAsset.size} · {pendingDeleteAsset.visibility || 'public'}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteAsset(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteAsset(pendingDeleteAsset)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
              >
                Delete asset
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
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleBulkDelete()}
                disabled={isBulkUpdating}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                Delete assets
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
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteFolder(pendingDeleteFolder.id)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
              >
                Delete folder
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

function MediaAssetPreview({ file }: { file: MediaAsset }) {
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
};

type MediaSafetyScan = {
  status: 'clean';
  scannedAt: string;
  scanner: string;
  checks: string[];
  warnings: string[];
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
  let publicAssets = 0;
  let privateAssets = 0;
  let referencedAssets = 0;
  let folderedAssets = 0;
  let replacedAssets = 0;
  let replacementVersions = 0;
  let replacementBytes = 0;

  assets.forEach((asset) => {
    const bytes = assetSizeBytes(asset);
    const current = byType.get(asset.type) || { count: 0, bytes: 0 };
    byType.set(asset.type, {
      count: current.count + 1,
      bytes: current.bytes + bytes,
    });

    if (asset.visibility === 'private') privateAssets += 1;
    else publicAssets += 1;

    if (hasMediaReferences(asset)) referencedAssets += 1;
    if (asset.folderId) folderedAssets += 1;

    const versions = getReplacementVersions(asset.metadata);
    if (versions.length > 0) {
      replacedAssets += 1;
      replacementVersions += versions.length;
      replacementBytes += replacementBytesForAsset(asset);
    }
  });

  return {
    totalAssets: assets.length,
    publicAssets,
    privateAssets,
    referencedAssets,
    unusedAssets: Math.max(0, assets.length - referencedAssets),
    replacedAssets,
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
  };
};

type ReplacementVersion = {
  id?: string;
  filename?: string;
  originalName?: string;
  mimeType?: string;
  sizeBytes?: number;
  url?: string;
  createdAt?: string;
  replacedAt?: string;
};

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
      sizeBytes: Number.isFinite(Number(version.sizeBytes)) ? Number(version.sizeBytes) : undefined,
      url: typeof version.url === 'string' ? version.url : undefined,
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

const mediaAuditTitle = (log: AdminAuditLog) => {
  if (log.action === 'create') return 'Asset uploaded';
  if (log.action === 'update') return 'Asset metadata updated';
  if (log.action === 'delete') return 'Asset deleted';
  if (log.action === 'media.bind') return 'Asset bound to content';
  if (log.action === 'media.unbind') return 'Asset removed from content';
  if (log.action === 'media.replace') return 'Asset file replaced';
  return log.action;
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

  if (log.action === 'delete') {
    return `${filename || 'Asset'} was removed from the library.`;
  }

  return `Request ${log.requestId || log.id}`;
};
