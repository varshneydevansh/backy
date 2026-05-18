import { useCallback, useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  X,
  Upload,
  Image as ImageIcon,
  Film,
  Music,
  FileText,
  Type as TypeIcon,
  Search,
  Globe2,
  LockKeyhole,
  FolderOpen,
  FolderPlus,
  CheckCircle2,
  Crop,
  RefreshCw,
} from 'lucide-react';
import { cn, formatBytes } from '@/lib/utils';
import { createMediaFolder, getDefaultMediaSiteId, listMediaFolders, listMediaLibrary, replaceMedia, updateMedia, uploadMedia, type MediaFolder, type MediaListOptions } from '@/lib/mediaApi';
import { useStore, type MediaAsset } from '@/stores/mockStore';
import { EmptyState } from '@/components/ui/EmptyState';
import { parseTagInput, serializeTagValues, TagInput } from '@/components/ui/TagInput';

type AllowedType = 'image' | 'video' | 'audio' | 'file' | 'font' | 'other' | 'any';
type MediaScopeFilter = 'all' | 'global' | 'page' | 'post';
type UploadFilter = 'all' | 'image' | 'video' | 'audio' | 'file' | 'font' | 'other';
type MediaLibraryTab = 'library' | 'upload';
type MediaInsertSizePreset = 'fill-frame' | 'fit-inside' | 'natural' | 'square' | 'hero';
type FontDisplayMode = 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
const MEDIA_PICKER_PAGE_SIZE = 100;

export interface MediaSelectionOptions {
  insertPreset: MediaInsertSizePreset;
  imagePresentation?: {
    objectFit: 'cover' | 'contain' | 'fill' | 'none';
    objectPosition: string;
    focalPoint: { x: number; y: number };
  };
  fontRegistration?: {
    family: string;
    weight: string;
    style: 'normal' | 'italic' | 'oblique';
    fallback: string;
    display: FontDisplayMode;
  };
}

export interface MediaContext {
  siteId?: string;
  scope?: 'global' | 'page' | 'post';
  targetId?: string;
  targetLabel?: string;
}

interface MediaLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (media: MediaAsset, options?: MediaSelectionOptions) => void;
  allowedTypes?: AllowedType;
  mediaContext?: MediaContext;
  allowScopeSwitcher?: boolean;
  allowStatusLabels?: boolean;
  initialTab?: MediaLibraryTab;
  initialUploadFilter?: UploadFilter;
  replaceAssetId?: string | null;
  canView?: boolean;
  canCreate?: boolean;
  viewDisabledReason?: string;
  createDisabledReason?: string;
}

interface ReplacementBinaryComparison {
  currentName: string;
  currentType: string;
  currentBytes: number | null;
  candidateName: string;
  candidateType: string;
  candidateBytes: number;
  deltaBytes: number | null;
  status: 'selected' | 'replaced' | 'failed';
}

const loadAllPickerMedia = async (options: MediaListOptions): Promise<MediaAsset[]> => {
  const loaded = new Map<string, MediaAsset>();
  let offset = options.offset || 0;
  let hasMore = true;

  while (hasMore) {
    const result = await listMediaLibrary({
      ...options,
      limit: options.limit || MEDIA_PICKER_PAGE_SIZE,
      offset,
    });

    result.media.forEach((item) => loaded.set(item.id, item));
    hasMore = Boolean(result.pagination?.hasMore);
    offset = (result.pagination?.offset || offset) + (result.pagination?.limit || options.limit || MEDIA_PICKER_PAGE_SIZE);

    if (!result.pagination && result.media.length === 0) {
      hasMore = false;
    }
  }

  return Array.from(loaded.values());
};

export function MediaLibraryModal({
  isOpen,
  onClose,
  onSelect,
  allowedTypes = 'any',
  mediaContext,
  allowScopeSwitcher = true,
  allowStatusLabels = true,
  initialTab = 'library',
  initialUploadFilter = 'all',
  replaceAssetId = null,
  canView = true,
  canCreate = true,
  viewDisabledReason = 'You do not have permission to view media.',
  createDisabledReason = 'You do not have permission to upload media.',
}: MediaLibraryModalProps) {
  const media = useStore((state) => state.media);
  const setMedia = useStore((state) => state.setMedia);
  const [activeTab, setActiveTab] = useState<MediaLibraryTab>('library');
  const [uploadFilter, setUploadFilter] = useState<UploadFilter>('all');
  const [libraryTypeFilter, setLibraryTypeFilter] = useState<UploadFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadVisibility, setUploadVisibility] = useState<'public' | 'private'>('public');
  const [uploadFolderId, setUploadFolderId] = useState<'root' | string>('root');
  const [libraryFolderFilter, setLibraryFolderFilter] = useState<'all' | 'root' | string>('all');
  const [includeNestedFolders, setIncludeNestedFolders] = useState(true);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<'root' | string>('root');
  const [uploadTags, setUploadTags] = useState('');
  const [insertSizePreset, setInsertSizePreset] = useState<MediaInsertSizePreset>('fill-frame');
  const [imageObjectFit, setImageObjectFit] = useState<'cover' | 'contain' | 'fill' | 'none'>('cover');
  const [imageFocalX, setImageFocalX] = useState(50);
  const [imageFocalY, setImageFocalY] = useState(50);
  const [fontWeight, setFontWeight] = useState('400');
  const [fontStyle, setFontStyle] = useState<'normal' | 'italic' | 'oblique'>('normal');
  const [fontFallback, setFontFallback] = useState('system-ui, sans-serif');
  const [fontDisplay, setFontDisplay] = useState<FontDisplayMode>('swap');
  const [uploadProgress, setUploadProgress] = useState<{ total: number; completed: number; failed: number; skipped: number; currentName: string } | null>(null);
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<MediaScopeFilter>(mediaContext?.scope || 'all');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [selectingMediaId, setSelectingMediaId] = useState<string | null>(null);
  const [focalPreviewAssetId, setFocalPreviewAssetId] = useState<string | null>(null);
  const [isDraggingFocal, setIsDraggingFocal] = useState(false);
  const [replacementBinaryComparison, setReplacementBinaryComparison] = useState<ReplacementBinaryComparison | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setActiveTab(canView ? (canCreate ? initialTab || 'library' : 'library') : 'library');
    setUploadFilter(
      initialUploadFilter && ['all', 'image', 'video', 'audio', 'file', 'font', 'other'].includes(initialUploadFilter)
        ? initialUploadFilter
        : 'all'
    );
    setLibraryTypeFilter('all');
    setLibraryFolderFilter('all');
    setIncludeNestedFolders(true);
    setNewFolderName('');
    setNewFolderParentId('root');
    setSearchQuery('');
    setInsertSizePreset('fill-frame');
    setImageObjectFit('cover');
    setImageFocalX(50);
    setImageFocalY(50);
    setFontWeight('400');
    setFontStyle('normal');
    setFontFallback('system-ui, sans-serif');
    setFontDisplay('swap');
    setUploadProgress(null);
    setSelectingMediaId(null);
    setFocalPreviewAssetId(null);
    setIsDraggingFocal(false);
    setReplacementBinaryComparison(null);
  }, [canCreate, canView, initialTab, initialUploadFilter, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onClose();
    };

    document.addEventListener('keydown', handleDialogKeyDown, true);
    return () => document.removeEventListener('keydown', handleDialogKeyDown, true);
  }, [isOpen, onClose]);

  const allowedTypesSet = useMemo(() => {
    if (allowedTypes === 'any') return new Set(['image', 'video', 'audio', 'file', 'font', 'other']);
    if (allowedTypes === 'file') return new Set(['file']);
    return new Set([allowedTypes]);
  }, [allowedTypes]);

  const siteId = mediaContext?.siteId || getDefaultMediaSiteId();
  const targetScope = mediaContext?.scope || 'global';
  const targetId = mediaContext?.targetId;
  const targetLabel = mediaContext?.targetLabel || mediaContext?.targetId;

  const normalized = useMemo(
    () => media.map((item) => ({
      ...item,
      scope: item.scope || 'global',
      scopeTargetId: item.scopeTargetId || null,
      targetPageIds: item.targetPageIds || [],
      targetPostIds: item.targetPostIds || [],
    })),
    [media]
  );

  const scopeMatches = (item: MediaAsset & { scope: 'global' | 'page' | 'post'; scopeTargetId: string | null }, scope: MediaScopeFilter) => {
    if (scope === 'all') {
      if (!targetScope || targetScope === 'global') return true;
      return item.scope === 'global' || (item.scope === targetScope && (!targetId || !item.scopeTargetId || item.scopeTargetId === targetId));
    }
    if (scope === 'global') return item.scope === 'global';
    if (scope === 'page') {
      if (item.scope !== 'page') return false;
      return !targetId || !item.scopeTargetId || item.scopeTargetId === targetId;
    }
    if (scope === 'post') {
      if (item.scope !== 'post') return false;
      return !targetId || !item.scopeTargetId || item.scopeTargetId === targetId;
    }
    return true;
  };

  const mediaContextFilter = (item: MediaAsset & { scope: 'global' | 'page' | 'post'; scopeTargetId: string | null }) => {
    if (!targetScope || targetScope === 'global') {
      return scopeMatches(item, scopeFilter);
    }
    if (!scopeFilter || scopeFilter === 'all') {
      return scopeMatches(item, targetScope);
    }
    return scopeMatches(item, scopeFilter);
  };

  const allowedTypeOptions = useMemo(
    () => (['all', 'image', 'video', 'audio', 'file', 'font', 'other'] as const).filter((filter) => (
      filter === 'all' ? allowedTypes === 'any' : allowedTypes === 'any' || allowedTypesSet.has(filter)
    )),
    [allowedTypes, allowedTypesSet]
  );

  const uploadTagList = useMemo(() => parseTagInput(uploadTags, 10), [uploadTags]);
  const replaceAsset = useMemo(
    () => replaceAssetId ? normalized.find((item) => item.id === replaceAssetId) || null : null,
    [normalized, replaceAssetId]
  );
  const replaceAssetBytes = typeof replaceAsset?.sizeBytes === 'number' && Number.isFinite(replaceAsset.sizeBytes)
    ? Math.max(0, replaceAsset.sizeBytes)
    : null;

  const folderOptions = useMemo(() => {
    const childrenByParent = new Map<string, MediaFolder[]>();
    folders.forEach((folder) => {
      const parentKey = folder.parentId || 'root';
      const siblings = childrenByParent.get(parentKey) || [];
      siblings.push(folder);
      childrenByParent.set(parentKey, siblings);
    });

    childrenByParent.forEach((siblings) => {
      siblings.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    });

    const options: Array<MediaFolder & { path: string }> = [];
    const visit = (parentId: string, prefix: string) => {
      (childrenByParent.get(parentId) || []).forEach((folder) => {
        const path = prefix ? `${prefix} / ${folder.name}` : folder.name;
        options.push({ ...folder, path });
        visit(folder.id, path);
      });
    };

    visit('root', '');
    return options;
  }, [folders]);

  const folderPathById = useMemo(
    () => new Map(folderOptions.map((folder) => [folder.id, folder.path])),
    [folderOptions]
  );

  useEffect(() => {
    if (uploadFolderId !== 'root' && !folderPathById.has(uploadFolderId)) {
      setUploadFolderId('root');
    }

    if (libraryFolderFilter !== 'all' && libraryFolderFilter !== 'root' && !folderPathById.has(libraryFolderFilter)) {
      setLibraryFolderFilter('all');
    }

    if (newFolderParentId !== 'root' && !folderPathById.has(newFolderParentId)) {
      setNewFolderParentId('root');
    }
  }, [folderPathById, libraryFolderFilter, newFolderParentId, uploadFolderId]);

  const uploadFolderLabel = useMemo(() => {
    if (uploadFolderId === 'root') return 'Root library';
    return folderPathById.get(uploadFolderId) || 'Selected folder';
  }, [folderPathById, uploadFolderId]);

  const libraryFolderIds = useMemo(() => {
    if (libraryFolderFilter === 'all') {
      return null;
    }

    if (libraryFolderFilter === 'root') {
      return new Set<string>();
    }

    const ids = new Set([libraryFolderFilter]);

    if (includeNestedFolders) {
      let changed = true;
      while (changed) {
        changed = false;
        folders.forEach((folder) => {
          if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
            ids.add(folder.id);
            changed = true;
          }
        });
      }
    }

    return ids;
  }, [folders, includeNestedFolders, libraryFolderFilter]);

  const loadMedia = useCallback(async () => {
    if (!canView) {
      setFolders([]);
      setError(viewDisabledReason);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const mediaOptions: MediaListOptions = {
        siteId,
        limit: MEDIA_PICKER_PAGE_SIZE,
        pageId: targetScope === 'page' ? targetId : undefined,
        postId: targetScope === 'post' ? targetId : undefined,
      };
      const [loaded, loadedFolders] = await Promise.all([
        loadAllPickerMedia(mediaOptions),
        listMediaFolders(siteId),
      ]);
      setMedia(loaded);
      setFolders(loadedFolders);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load media library');
    } finally {
      setIsLoading(false);
    }
  }, [canView, setMedia, siteId, targetId, targetScope, viewDisabledReason]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    void loadMedia();
  }, [isOpen, loadMedia]);

  const filteredMedia = useMemo(
    () => !canView
      ? []
      :
      normalized.filter((item) => {
        if (!allowedTypesSet.has(item.type)) return false;
        if (libraryTypeFilter !== 'all' && item.type !== libraryTypeFilter) return false;
        if (libraryFolderFilter === 'root' && item.folderId) return false;
        if (libraryFolderFilter !== 'all' && libraryFolderFilter !== 'root') {
          if (!item.folderId || !libraryFolderIds?.has(item.folderId)) return false;
        }
        const query = searchQuery.trim().toLowerCase();
        if (query) {
          const haystack = [
            item.name,
            item.altText,
            item.caption,
            item.visibility,
            item.scope,
            ...(item.tags || []),
          ].filter(Boolean).join(' ').toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        return mediaContextFilter(item as MediaAsset & { scope: 'global' | 'page' | 'post'; scopeTargetId: string | null });
      }),
    [allowedTypesSet, canView, libraryFolderFilter, libraryFolderIds, libraryTypeFilter, mediaContextFilter, normalized, searchQuery, scopeFilter, targetScope]
  );
  const focalPreviewAsset = useMemo(() => (
    filteredMedia.find((item) => item.id === focalPreviewAssetId && item.type === 'image') ||
    filteredMedia.find((item) => item.type === 'image') ||
    null
  ), [filteredMedia, focalPreviewAssetId]);

  const libraryStats = useMemo(() => ({
    total: filteredMedia.length,
    public: filteredMedia.filter((item) => item.visibility !== 'private').length,
    private: filteredMedia.filter((item) => item.visibility === 'private').length,
  }), [filteredMedia]);

  const formatScopeLabel = (item: MediaAsset & { scope?: 'global' | 'page' | 'post'; scopeTargetId: string | null }) => {
    const scope = item.scope || 'global';
    if (scope === 'global') return 'Global';
    return `${scope === 'page' ? 'Page' : 'Post'}${item.scopeTargetId ? ` • ${item.scopeTargetId}` : ''}`;
  };

  const formatTypeLabel = (type: MediaAsset['type']) => {
    if (type === 'file') return 'document';
    if (type === 'other') return 'other file';
    return type;
  };

  const getFileExtension = (file: File) => file.name.split('.').pop()?.toLowerCase() || '';

  const isFontFile = (file: File) => (
    file.type.includes('font') ||
    file.type === 'application/vnd.ms-fontobject' ||
    ['woff', 'woff2', 'ttf', 'otf', 'eot'].includes(getFileExtension(file))
  );

  const isDocumentFile = (file: File) => (
    file.type === 'application/pdf' ||
    ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'].includes(getFileExtension(file))
  );

  const getUploadType = (file: File): MediaAsset['type'] => {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    if (isFontFile(file)) return 'font';
    if (isDocumentFile(file)) return 'file';
    return 'other';
  };

  const cleanFontFamilyFromFilename = (name: string): string => (
    name
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\b(regular|normal|bold|italic|black|light|medium|semibold|extrabold|thin)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim() || name.replace(/\.[a-z0-9]+$/i, '')
  );

  const renderMediaThumb = (item: MediaAsset) => {
    if (item.type === 'image') {
      return <img src={item.url} alt={item.name} className="w-full h-full object-cover" />;
    }

    if (item.type === 'font') {
      const fontFamily = typeof item.metadata?.fontFamily === 'string'
        ? item.metadata.fontFamily
        : cleanFontFamilyFromFilename(item.name);
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-50 px-3 text-slate-700">
          <TypeIcon className="h-8 w-8 text-slate-500" />
          <span
            className="max-w-full truncate text-sm font-semibold"
            style={{ fontFamily: fontFamily ? `"${fontFamily}"` : undefined }}
          >
            Aa
          </span>
        </div>
      );
    }

    return (
      <div className="w-full h-full bg-muted flex items-center justify-center">
        {item.type === 'video' ? (
          <Film className="w-8 h-8 text-muted-foreground" />
        ) : item.type === 'audio' ? (
          <Music className="w-8 h-8 text-muted-foreground" />
        ) : (
          <FileText className="w-8 h-8 text-muted-foreground" />
        )}
      </div>
    );
  };

  const getAcceptValue = (filter: UploadFilter) => {
    const resolved = filter !== 'all' ? filter : allowedTypes;
    if (resolved === 'image') return 'image/*';
    if (resolved === 'video') return 'video/*';
    if (resolved === 'audio') return 'audio/*';
    if (resolved === 'font') return '.woff,.woff2,.ttf,.otf,.eot,font/*';
    if (resolved === 'other') return '*/*';
    return undefined;
  };

  const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

  const buildSelectionOptions = (item: MediaAsset): MediaSelectionOptions => {
    const focalPoint = {
      x: clampPercent(imageFocalX),
      y: clampPercent(imageFocalY),
    };
    const fontFamily = typeof item.metadata?.fontFamily === 'string' && item.metadata.fontFamily.trim()
      ? item.metadata.fontFamily.trim()
      : cleanFontFamilyFromFilename(item.name);

    return {
      insertPreset: insertSizePreset,
      imagePresentation: item.type === 'image'
        ? {
          objectFit: imageObjectFit,
          objectPosition: `${focalPoint.x}% ${focalPoint.y}%`,
          focalPoint,
        }
        : undefined,
      fontRegistration: item.type === 'font'
        ? {
          family: fontFamily,
          weight: fontWeight.trim() || '400',
          style: fontStyle,
          fallback: fontFallback.trim() || 'system-ui, sans-serif',
          display: fontDisplay,
        }
        : undefined,
    };
  };

  const setFocalFromPointer = (target: HTMLElement, clientX: number, clientY: number) => {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    setImageFocalX(clampPercent(((clientX - rect.left) / rect.width) * 100));
    setImageFocalY(clampPercent(((clientY - rect.top) / rect.height) * 100));
  };

  const handleFocalPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDraggingFocal(true);
    setFocalFromPointer(event.currentTarget, event.clientX, event.clientY);
  };

  const handleFocalPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDraggingFocal && !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    setFocalFromPointer(event.currentTarget, event.clientX, event.clientY);
  };

  const handleFocalPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDraggingFocal(false);
  };

  const handleFocalKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    if (event.key === 'ArrowLeft') setImageFocalX((value) => clampPercent(value - step));
    if (event.key === 'ArrowRight') setImageFocalX((value) => clampPercent(value + step));
    if (event.key === 'ArrowUp') setImageFocalY((value) => clampPercent(value - step));
    if (event.key === 'ArrowDown') setImageFocalY((value) => clampPercent(value + step));
    if (event.key === 'Home') {
      setImageFocalX(50);
      setImageFocalY(50);
    }
    if (event.key === 'End') {
      setImageFocalX(100);
      setImageFocalY(100);
    }
  };

  const renderFocalPreview = (testId: string, previewAsset: MediaAsset | null = null) => (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={handleFocalPointerDown}
      onPointerMove={handleFocalPointerMove}
      onPointerUp={handleFocalPointerEnd}
      onPointerCancel={handleFocalPointerEnd}
      onKeyDown={handleFocalKeyDown}
      data-testid={testId}
      data-focal-x={imageFocalX}
      data-focal-y={imageFocalY}
      data-focal-dragging={isDraggingFocal ? 'true' : 'false'}
      data-preview-media-id={previewAsset?.id || ''}
      className="relative mt-3 aspect-[4/3] w-full cursor-crosshair touch-none overflow-hidden rounded-lg border border-border bg-[linear-gradient(45deg,rgba(148,163,184,0.16)_25%,transparent_25%),linear-gradient(-45deg,rgba(148,163,184,0.16)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,rgba(148,163,184,0.16)_75%),linear-gradient(-45deg,transparent_75%,rgba(148,163,184,0.16)_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0] text-left focus:outline-none focus:ring-2 focus:ring-primary/30"
      aria-label="Set image focal point"
    >
      {previewAsset?.url ? (
        <img
          src={previewAsset.url}
          alt=""
          className="h-full w-full"
          style={{
            objectFit: imageObjectFit,
            objectPosition: `${imageFocalX}% ${imageFocalY}%`,
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
          Focal preview
        </div>
      )}
      <span
        data-testid={`${testId}-crop-box`}
        className="pointer-events-none absolute inset-[12%] rounded-md border border-white/85 shadow-[0_0_0_9999px_rgba(15,23,42,0.2)]"
      />
      {[
        ['nw', 'left-[12%] top-[12%] -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize'],
        ['n', 'left-1/2 top-[12%] -translate-x-1/2 -translate-y-1/2 cursor-ns-resize'],
        ['ne', 'right-[12%] top-[12%] translate-x-1/2 -translate-y-1/2 cursor-nesw-resize'],
        ['e', 'right-[12%] top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize'],
        ['se', 'right-[12%] bottom-[12%] translate-x-1/2 translate-y-1/2 cursor-nwse-resize'],
        ['s', 'bottom-[12%] left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize'],
        ['sw', 'bottom-[12%] left-[12%] -translate-x-1/2 translate-y-1/2 cursor-nesw-resize'],
        ['w', 'left-[12%] top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize'],
      ].map(([position, positionClass]) => (
        <span
          key={position}
          data-testid={`${testId}-crop-handle-${position}`}
          className={cn('absolute z-10 h-3 w-3 rounded-sm border border-primary bg-background shadow-sm', positionClass)}
        />
      ))}
      <span className="pointer-events-none absolute left-1/3 top-[12%] h-[76%] border-l border-white/45" />
      <span className="pointer-events-none absolute left-2/3 top-[12%] h-[76%] border-l border-white/45" />
      <span className="pointer-events-none absolute left-[12%] top-1/3 w-[76%] border-t border-white/45" />
      <span className="pointer-events-none absolute left-[12%] top-2/3 w-[76%] border-t border-white/45" />
      <span
        data-testid={`${testId}-drag-handle`}
        className="absolute z-20 h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white bg-primary shadow-md ring-2 ring-primary/35 active:cursor-grabbing"
        style={{ left: `${imageFocalX}%`, top: `${imageFocalY}%` }}
      />
      <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-background/90 px-2 py-1 font-mono text-[10px] text-muted-foreground shadow-sm">
        {imageFocalX}% {imageFocalY}%
      </span>
    </div>
  );

  const handleSelectMedia = async (item: MediaAsset) => {
    if (item.visibility === 'private') {
      setError('Private media cannot be inserted directly into public editor fields. Generate a signed URL from Media details instead.');
      return;
    }

    const options = buildSelectionOptions(item);
    let selectedItem = item;

    if (item.type === 'font' && options.fontRegistration) {
      setSelectingMediaId(item.id);
      setError(null);
      try {
        selectedItem = await updateMedia(item.id, {
          metadata: {
            ...(item.metadata || {}),
            fontFamily: options.fontRegistration.family,
            fontWeight: options.fontRegistration.weight,
            fontStyle: options.fontRegistration.style,
            fontFallback: options.fontRegistration.fallback,
            fontDisplay: options.fontRegistration.display,
          },
          tags: Array.from(new Set([...(item.tags || []), 'font'])),
        }, siteId);
        setMedia([selectedItem, ...media.filter((current) => current.id !== selectedItem.id)]);
      } catch (fontError) {
        setError(fontError instanceof Error ? fontError.message : 'Unable to save font registration before inserting.');
        setSelectingMediaId(null);
        return;
      }
      setSelectingMediaId(null);
    }

    onSelect(selectedItem, options);
    onClose();
  };

  const handleCreateFolder = async () => {
    if (isCreatingFolder || isUploading) return;
    if (!canCreate) {
      setError(createDisabledReason);
      return;
    }

    const name = newFolderName.trim();
    if (!name) {
      setError('Enter a folder name before creating a media folder.');
      return;
    }

    const parentId = newFolderParentId === 'root' ? null : newFolderParentId;
    const duplicate = folderOptions.some((folder) => (
      (folder.parentId || null) === parentId &&
      folder.name.trim().toLowerCase() === name.toLowerCase()
    ));
    if (duplicate) {
      setError(`A sibling media folder named "${name}" already exists.`);
      return;
    }

    setIsCreatingFolder(true);
    setError(null);

    try {
      const folder = await createMediaFolder(name, siteId, { parentId });
      setFolders((current) => [...current.filter((item) => item.id !== folder.id), folder]);
      setUploadFolderId(folder.id);
      setLibraryFolderFilter(folder.id);
      setNewFolderParentId(folder.id);
      setNewFolderName('');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create media folder');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const renderCreateFolderControl = () => (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <FolderPlus className="h-3.5 w-3.5" />
        Create folder
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
        <select
          value={newFolderParentId}
          onChange={(event) => setNewFolderParentId(event.target.value)}
          disabled={isUploading || isCreatingFolder || !canCreate}
          title={canCreate ? undefined : createDisabledReason}
          data-testid="media-library-create-folder-parent"
          className="h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="New media folder parent"
        >
          <option value="root">Root library</option>
          {folderOptions.map((folder) => (
            <option key={folder.id} value={folder.id}>{folder.path}</option>
          ))}
        </select>
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
          disabled={isUploading || isCreatingFolder || !canCreate}
          title={canCreate ? undefined : createDisabledReason}
          data-testid="media-library-create-folder-name"
          className="min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
          placeholder="Campaign assets"
        />
        <button
          type="button"
          onClick={() => void handleCreateFolder()}
          disabled={isUploading || isCreatingFolder || !newFolderName.trim() || !canCreate}
          title={canCreate ? undefined : createDisabledReason}
          data-testid="media-library-create-folder"
          className="inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCreatingFolder ? 'Creating' : 'Create'}
        </button>
      </div>
    </div>
  );

  const handleFileUpload = async (files: FileList | null, filterHint: UploadFilter) => {
    if (isUploading) return;
    if (!canCreate) {
      setError(createDisabledReason);
      return;
    }
    if (!files || files.length === 0) return;

    const shouldKeepFile = (file: File) => {
      const resolvedType = getUploadType(file);
      if (filterHint === 'all') return true;
      if (filterHint === 'image') return resolvedType === 'image';
      if (filterHint === 'video') return resolvedType === 'video';
      if (filterHint === 'audio') return resolvedType === 'audio';
      if (filterHint === 'font') return resolvedType === 'font';
      if (filterHint === 'other') return resolvedType === 'other';
      return resolvedType === 'file';
    };

    const selectedFiles = Array.from(files);
    const acceptedFiles = selectedFiles.filter((file) => (
      shouldKeepFile(file) && allowedTypesSet.has(getUploadType(file))
    ));
    const skippedCount = selectedFiles.length - acceptedFiles.length;

    if (acceptedFiles.length === 0) {
      setError(`No files matched the current ${filterHint === 'all' ? 'allowed media' : filterHint} upload filter.`);
      setDragActive(false);
      return;
    }

    setIsUploading(true);
    setError(null);
    setUploadProgress({ total: acceptedFiles.length, completed: 0, failed: 0, skipped: skippedCount, currentName: acceptedFiles[0]?.name || '' });
    const uploaded: MediaAsset[] = [];
    const failed: unknown[] = [];

    for (const [index, file] of acceptedFiles.entries()) {
      const resolvedType = getUploadType(file);
      const focalPoint = {
        x: clampPercent(imageFocalX),
        y: clampPercent(imageFocalY),
      };
      setUploadProgress((current) => current ? { ...current, currentName: file.name } : current);

      try {
        const uploadedItem = await uploadMedia(file, {
          siteId,
          scope: targetScope,
          scopeTargetId: targetId || null,
          visibility: uploadVisibility,
          folderId: uploadFolderId === 'root' ? null : uploadFolderId,
          fontFamily: resolvedType === 'font' ? cleanFontFamilyFromFilename(file.name) : undefined,
          fontWeight: resolvedType === 'font' ? fontWeight.trim() || '400' : undefined,
          fontStyle: resolvedType === 'font' ? fontStyle : undefined,
          fontFallback: resolvedType === 'font' ? fontFallback.trim() || 'system-ui, sans-serif' : undefined,
          fontDisplay: resolvedType === 'font' ? fontDisplay : undefined,
          tags: resolvedType === 'font'
            ? Array.from(new Set(['font', ...uploadTagList]))
            : uploadTagList.length ? uploadTagList : undefined,
          metadata: resolvedType === 'image'
            ? {
              imagePresentation: {
                objectFit: imageObjectFit,
                focalPoint,
                objectPosition: `${focalPoint.x}% ${focalPoint.y}%`,
              },
              preferredInsertPreset: insertSizePreset,
            }
            : undefined,
        });
        uploaded.push(uploadedItem);
      } catch (uploadError) {
        failed.push(uploadError);
      } finally {
        setUploadProgress((current) => current ? {
          ...current,
          completed: index + 1,
          failed: failed.length,
          currentName: acceptedFiles[index + 1]?.name || file.name,
        } : current);
      }
    }

    if (uploaded.length) {
      setMedia([...uploaded, ...media.filter((item) => !uploaded.some((next) => next.id === item.id))]);
      setActiveTab('library');
    }

    if (failed.length || skippedCount > 0) {
      const firstError = failed[0];
      const failedText = failed.length > 0
        ? firstError instanceof Error
          ? `${firstError.message}. ${failed.length} file${failed.length === 1 ? '' : 's'} failed.`
          : `${failed.length} file${failed.length === 1 ? '' : 's'} failed.`
        : '';
      const skippedText = skippedCount > 0
        ? `${skippedCount} file${skippedCount === 1 ? '' : 's'} skipped because they did not match the current upload type.`
        : '';
      setError([failedText, skippedText].filter(Boolean).join(' '));
    }

    setIsUploading(false);
  };

  const handleReplaceCurrentAsset = async (files: FileList | null) => {
    if (isReplacing || isUploading) return;
    if (!canCreate) {
      setError(createDisabledReason);
      return;
    }
    if (!replaceAssetId || !files || files.length === 0) return;

    const file = files[0];
    const candidateType = getUploadType(file);
    const nextBinaryComparison: ReplacementBinaryComparison = {
      currentName: replaceAsset?.name || 'Current media asset',
      currentType: replaceAsset?.type || 'asset',
      currentBytes: replaceAssetBytes,
      candidateName: file.name,
      candidateType: file.type || candidateType,
      candidateBytes: file.size,
      deltaBytes: replaceAssetBytes === null ? null : file.size - replaceAssetBytes,
      status: 'selected',
    };
    setReplacementBinaryComparison(nextBinaryComparison);
    setIsReplacing(true);
    setError(null);
    setUploadProgress({ total: 1, completed: 0, failed: 0, skipped: Math.max(0, files.length - 1), currentName: file.name });

    try {
      const updated = await replaceMedia(replaceAssetId, file, {
        siteId,
        replacedBy: 'editor',
        reason: 'Replacement from editor media picker',
        fontFamily: candidateType === 'font' ? cleanFontFamilyFromFilename(file.name) : undefined,
        fontWeight: candidateType === 'font' ? fontWeight.trim() || '400' : undefined,
        fontStyle: candidateType === 'font' ? fontStyle : undefined,
        fontFallback: candidateType === 'font' ? fontFallback.trim() || 'system-ui, sans-serif' : undefined,
        fontDisplay: candidateType === 'font' ? fontDisplay : undefined,
      });
      setReplacementBinaryComparison({ ...nextBinaryComparison, status: 'replaced' });
      setMedia([updated, ...media.filter((item) => item.id !== updated.id)]);
      setUploadProgress({ total: 1, completed: 1, failed: 0, skipped: Math.max(0, files.length - 1), currentName: file.name });
      onSelect(updated, buildSelectionOptions(updated));
      onClose();
    } catch (replaceError) {
      setReplacementBinaryComparison({ ...nextBinaryComparison, status: 'failed' });
      setUploadProgress((current) => current ? { ...current, completed: 1, failed: 1 } : current);
      setError(replaceError instanceof Error ? replaceError.message : 'Unable to replace the current media asset.');
    } finally {
      setIsReplacing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-foreground/45 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="media-library-dialog-title"
      data-testid="media-library-modal"
      data-active-tab={activeTab}
      data-allowed-types={allowedTypes}
      data-upload-filter={uploadFilter}
      data-scope-filter={scopeFilter}
      data-folder-filter={libraryFolderFilter}
      data-include-nested-folders={includeNestedFolders ? 'true' : 'false'}
      data-insert-preset={insertSizePreset}
      data-replace-asset-id={replaceAssetId || ''}
      data-upload-progress-total={uploadProgress?.total ?? 0}
      data-upload-progress-completed={uploadProgress?.completed ?? 0}
      data-upload-progress-failed={uploadProgress?.failed ?? 0}
    >
      <div className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="media-library-dialog-title" className="text-lg font-semibold text-foreground">Media library</h2>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {media.length} assets
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Select or upload reusable images, videos, audio, documents, fonts, and other files for this workspace.
            </p>
            {targetLabel ? (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                Context: <span className="font-medium text-foreground">{targetLabel}</span>
              </p>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
            type="button"
            aria-label="Close media library"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-border bg-muted/30 px-5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg border border-border bg-background p-1">
              {(['library', 'upload'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    if (tab === 'library' && !canView) return;
                    if (tab === 'upload' && !canCreate) return;
                    setActiveTab(tab);
                  }}
                  disabled={(tab === 'library' && !canView) || (tab === 'upload' && !canCreate)}
                  title={tab === 'library' && !canView ? viewDisabledReason : tab === 'upload' && !canCreate ? createDisabledReason : undefined}
                  data-testid={`media-library-tab-${tab}`}
                  className={cn(
                    'min-h-9 rounded-md px-4 text-sm font-medium capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                    activeTab === tab ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1">
                <Globe2 className="h-3.5 w-3.5" />
                {libraryStats.public} public
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1">
                <LockKeyhole className="h-3.5 w-3.5" />
                {libraryStats.private} private
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1">
                <FolderOpen className="h-3.5 w-3.5" />
                {folders.length} folders
              </span>
            </div>
          </div>
        </div>

        {error ? (
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
            <span data-testid="media-library-error">{error}</span>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {activeTab === 'library' ? (
            <div className="grid min-h-[560px] gap-0 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="min-w-0 p-5">
                <div className="mb-4 grid gap-3 xl:grid-cols-[minmax(220px,1fr)_auto]">
                  <label className="relative block">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      data-testid="media-library-search"
                      className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                      placeholder="Search filename, tag, caption, visibility..."
                      aria-label="Search media"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    {allowedTypeOptions.map((filter) => (
                      <button
                        type="button"
                        key={filter}
                        onClick={() => setLibraryTypeFilter(filter)}
                        data-testid={`media-library-type-filter-${filter}`}
                        className={cn(
                          'min-h-9 rounded-lg border px-3 text-xs font-medium capitalize transition-colors',
                          libraryTypeFilter === filter
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>

                {isLoading ? (
                  <div className="rounded-xl border border-border bg-muted/40 py-16 text-center text-sm text-muted-foreground">
                    Loading media...
                  </div>
                ) : null}

                {!isLoading && filteredMedia.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    {filteredMedia.map((item) => {
                      const isPrivateAsset = item.visibility === 'private';
                      const isSelecting = selectingMediaId === item.id;
                      return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => void handleSelectMedia(item)}
                        onFocus={() => {
                          if (item.type === 'image') setFocalPreviewAssetId(item.id);
                        }}
                        onMouseEnter={() => {
                          if (item.type === 'image') setFocalPreviewAssetId(item.id);
                        }}
                        disabled={Boolean(selectingMediaId) || isPrivateAsset}
                        aria-disabled={isPrivateAsset}
                        title={isPrivateAsset ? 'Private media requires signed delivery and cannot be inserted directly into public page fields.' : undefined}
                        data-testid="media-library-item"
                        data-media-id={item.id}
                        data-media-name={item.name}
                        data-media-type={item.type}
                        data-media-url={item.url}
                        data-media-private-select-disabled={isPrivateAsset ? 'true' : 'false'}
                        data-media-scope={item.scope || 'global'}
                        data-media-scope-target-id={item.scopeTargetId || ''}
                        data-media-folder-id={item.folderId || ''}
                        data-insert-preset={insertSizePreset}
                        data-image-object-fit={imageObjectFit}
                        data-image-focal-x={imageFocalX}
                        data-image-focal-y={imageFocalY}
                        className={cn(
                          'group relative overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30',
                          (isPrivateAsset || selectingMediaId) && 'cursor-not-allowed opacity-65 hover:translate-y-0 hover:border-border hover:shadow-sm'
                        )}
                      >
                        <div className="aspect-[4/3] overflow-hidden bg-muted">
                          {renderMediaThumb(item)}
                        </div>
                        <div className="space-y-2 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0 truncate text-sm font-medium text-foreground">{item.name}</span>
                            {isSelecting ? (
                              <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-primary" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-primary opacity-0 transition group-hover:opacity-100" />
                            )}
                          </div>
                          {allowStatusLabels ? (
                            <div className="flex flex-wrap gap-1.5">
                              <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                                {formatTypeLabel(item.type)}
                              </span>
                              <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                {formatScopeLabel(item)}
                              </span>
                              <span className={cn(
                                'rounded px-2 py-0.5 text-[10px] font-medium',
                                item.visibility === 'private' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'
                              )}>
                                {item.visibility || 'public'}
                              </span>
                            </div>
                          ) : null}
                          <p className="truncate text-xs text-muted-foreground">{item.size}</p>
                        </div>
                      </button>
                    );
                    })}
                  </div>
                ) : null}

                {!isLoading && filteredMedia.length === 0 ? (
                  <div className="min-h-[360px]">
                    <EmptyState
                      icon={ImageIcon}
                      title="No media matches this view"
                      description="Upload assets to this site or clear filters to attach existing files."
                      action={(
                        <button
                          type="button"
                          onClick={() => canCreate && setActiveTab('upload')}
                          disabled={!canCreate}
                          title={canCreate ? undefined : createDisabledReason}
                          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Upload assets
                        </button>
                      )}
                    />
                  </div>
                ) : null}
              </div>

              <aside className="border-t border-border bg-muted/20 p-5 lg:border-l lg:border-t-0">
                <h3 className="text-sm font-semibold text-foreground">Selection controls</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  The picker respects allowed file types, page/post scope, and public/private delivery labels.
                </p>

                {allowScopeSwitcher ? (
                  <div className="mt-5 space-y-2">
                    <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Scope</div>
                    <div className="grid grid-cols-2 gap-2">
                      {(['all', 'global', 'page', 'post'] as const).map((scope) => (
                        <button
                          key={scope}
                          type="button"
                          onClick={() => setScopeFilter(scope)}
                          data-testid={`media-library-scope-${scope}`}
                          className={cn(
                            'min-h-9 rounded-lg border px-3 text-xs font-medium capitalize transition-colors',
                            scopeFilter === scope
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                          )}
                        >
                          {scope}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-5 space-y-2">
                  <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Folder</div>
                  <select
                    value={libraryFolderFilter}
                    onChange={(event) => setLibraryFolderFilter(event.target.value)}
                    data-testid="media-library-folder-filter"
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                  >
                    <option value="all">All folders</option>
                    <option value="root">Root library</option>
                    {folderOptions.map((folder) => (
                      <option key={folder.id} value={folder.id}>{folder.path}</option>
                    ))}
                  </select>
                  <label className="flex items-start gap-2 rounded-lg border border-border bg-background p-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={includeNestedFolders}
                      onChange={(event) => setIncludeNestedFolders(event.target.checked)}
                      disabled={libraryFolderFilter === 'all' || libraryFolderFilter === 'root'}
                      data-testid="media-library-include-subfolders"
                      className="mt-0.5 h-4 w-4 rounded border-border text-primary disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <span>Include nested folders when a parent folder is selected.</span>
                  </label>
                </div>

                <div className="mt-5">
                  {renderCreateFolderControl()}
                </div>

                <div className="mt-5 rounded-lg border border-border bg-background p-3">
                  <div className="text-xs font-medium text-muted-foreground">Current result</div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">{libraryStats.total}</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Assets available for this component.
                  </p>
                </div>

                <div className="mt-5 rounded-lg border border-border bg-background p-3" data-testid="media-library-insert-controls">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    <Crop className="h-3.5 w-3.5" />
                    Insert sizing
                  </div>
                  <label className="mt-3 block space-y-1 text-xs font-medium text-muted-foreground">
                    Size preset
                    <select
                      value={insertSizePreset}
                      onChange={(event) => setInsertSizePreset(event.target.value as MediaInsertSizePreset)}
                      data-testid="media-library-insert-preset"
                      className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                    >
                      <option value="fill-frame">Fill selected frame</option>
                      <option value="fit-inside">Fit inside frame</option>
                      <option value="natural">Natural card</option>
                      <option value="square">Square crop</option>
                      <option value="hero">Wide hero crop</option>
                    </select>
                  </label>
                  <label className="mt-3 block space-y-1 text-xs font-medium text-muted-foreground">
                    Image fit
                    <select
                      value={imageObjectFit}
                      onChange={(event) => setImageObjectFit(event.target.value as 'cover' | 'contain' | 'fill' | 'none')}
                      data-testid="media-library-image-fit"
                      className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                    >
                      <option value="cover">Cover crop</option>
                      <option value="contain">Contain</option>
                      <option value="fill">Stretch fill</option>
                      <option value="none">Natural pixels</option>
                    </select>
                  </label>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className="space-y-1 text-xs font-medium text-muted-foreground">
                      Focal X
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={imageFocalX}
                        onChange={(event) => setImageFocalX(clampPercent(Number(event.target.value)))}
                        data-testid="media-library-focal-x"
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                      />
                    </label>
                    <label className="space-y-1 text-xs font-medium text-muted-foreground">
                      Focal Y
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={imageFocalY}
                        onChange={(event) => setImageFocalY(clampPercent(Number(event.target.value)))}
                        data-testid="media-library-focal-y"
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                      />
                    </label>
                  </div>
                  {renderFocalPreview('media-library-focal-preview', focalPreviewAsset)}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Image selections pass focal point and fit metadata into the editor instead of forcing a generic center crop.
                  </p>
                </div>

                {(allowedTypes === 'any' || allowedTypes === 'font') ? (
                  <div className="mt-5 rounded-lg border border-border bg-background p-3" data-testid="media-library-font-controls">
                    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      <TypeIcon className="h-3.5 w-3.5" />
                      Font registration
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <label className="space-y-1 text-xs font-medium text-muted-foreground">
                        Weight
                        <input
                          type="text"
                          value={fontWeight}
                          onChange={(event) => setFontWeight(event.target.value)}
                          data-testid="media-library-font-weight"
                          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                          placeholder="400"
                        />
                      </label>
                      <label className="space-y-1 text-xs font-medium text-muted-foreground">
                        Style
                        <select
                          value={fontStyle}
                          onChange={(event) => setFontStyle(event.target.value as 'normal' | 'italic' | 'oblique')}
                          data-testid="media-library-font-style"
                          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                        >
                          <option value="normal">Normal</option>
                          <option value="italic">Italic</option>
                          <option value="oblique">Oblique</option>
                        </select>
                      </label>
                    </div>
                    <label className="mt-3 block space-y-1 text-xs font-medium text-muted-foreground">
                      Fallback stack
                      <input
                        type="text"
                        value={fontFallback}
                        onChange={(event) => setFontFallback(event.target.value)}
                        data-testid="media-library-font-fallback"
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                        placeholder="system-ui, sans-serif"
                      />
                    </label>
                    <label className="mt-3 block space-y-1 text-xs font-medium text-muted-foreground">
                      Display
                      <select
                        value={fontDisplay}
                        onChange={(event) => setFontDisplay(event.target.value as FontDisplayMode)}
                        data-testid="media-library-font-display"
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                      >
                        <option value="swap">Swap</option>
                        <option value="auto">Auto</option>
                        <option value="block">Block</option>
                        <option value="fallback">Fallback</option>
                        <option value="optional">Optional</option>
                      </select>
                    </label>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Font selections save these registration fields before inserting the family into text controls.
                    </p>
                  </div>
                ) : null}
              </aside>
            </div>
          ) : (
            <div className="grid min-h-[560px] gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="p-5">
                <div className="mb-4 flex flex-wrap gap-2">
                  {allowedTypeOptions.map((filter) => (
                    <button
                      type="button"
                      key={filter}
                      onClick={() => {
                        if (isUploading || !canCreate) return;
                        setUploadFilter(filter);
                      }}
                      disabled={isUploading || !canCreate}
                      title={canCreate ? undefined : createDisabledReason}
                      data-testid={`media-upload-filter-${filter}`}
                      className={cn(
                        'min-h-9 rounded-lg border px-3 text-xs font-medium capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                        uploadFilter === filter
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
                <div
                  className={cn(
                    'relative flex min-h-[420px] flex-col items-center justify-center rounded-xl border-2 border-dashed px-8 text-center transition-colors',
                    dragActive ? 'border-primary bg-primary/5' : 'border-border bg-muted/20 hover:border-primary/50',
                    (isUploading || !canCreate) && 'cursor-not-allowed opacity-75 hover:border-border'
                  )}
                  onDragEnter={() => {
                    if (!isUploading && canCreate) {
                      setDragActive(true);
                    }
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDragOver={(e) => {
                    if (!isUploading && canCreate) {
                      e.preventDefault();
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    if (isUploading || !canCreate) return;
                    void handleFileUpload(e.dataTransfer.files, uploadFilter);
                  }}
                  data-testid="media-upload-dropzone"
                  data-uploading={isUploading ? 'true' : 'false'}
                >
                  <input
                    type="file"
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    multiple
                    disabled={isUploading || !canCreate}
                    title={canCreate ? undefined : createDisabledReason}
                    accept={getAcceptValue(uploadFilter)}
                    data-testid="media-upload-input"
                    onChange={(e) => {
                      void handleFileUpload(e.target.files, uploadFilter);
                      e.currentTarget.value = '';
                    }}
                  />
                  <div className="pointer-events-none mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
                    <Upload className="h-7 w-7 text-primary" />
                  </div>
                  <h3 className="pointer-events-none text-lg font-semibold text-foreground">
                    {isUploading ? 'Uploading assets...' : 'Drop files into the library'}
                  </h3>
                  <p className="pointer-events-none mt-2 max-w-md text-sm text-muted-foreground">
                    Assets will upload as {uploadVisibility} files in {uploadFolderLabel}. Images, videos, audio, documents, fonts, and other files are supported.
                  </p>
                  {uploadTagList.length > 0 ? (
                    <div className="pointer-events-none mt-4 flex flex-wrap justify-center gap-2">
                      {uploadTagList.map((tag) => (
                        <span key={tag} className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <span className="pointer-events-none mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                    Choose files
                  </span>
                  {uploadProgress ? (
                    <div className="pointer-events-none mt-5 w-full max-w-md rounded-lg border border-border bg-background/90 p-3 text-left" data-testid="media-upload-progress">
                      <div className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
                        <span className="truncate">{uploadProgress.currentName || 'Preparing upload'}</span>
                        <span>{uploadProgress.completed}/{uploadProgress.total}</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${Math.round((uploadProgress.completed / Math.max(1, uploadProgress.total)) * 100)}%` }}
                        />
                      </div>
                      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                        <span>{uploadProgress.failed} failed</span>
                        <span>{uploadProgress.skipped} skipped</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <aside className="border-t border-border bg-muted/20 p-5 lg:border-l lg:border-t-0">
                <h3 className="text-sm font-semibold text-foreground">Upload defaults</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Set delivery, folder, tags, and target scope before files enter the shared library.
                </p>

                <div className="mt-5 grid gap-4">
                  <label className="space-y-1 text-xs font-medium text-muted-foreground">
                    Visibility
                    <select
                      value={uploadVisibility}
                      onChange={(event) => setUploadVisibility(event.target.value === 'private' ? 'private' : 'public')}
                      disabled={isUploading || !canCreate}
                      title={canCreate ? undefined : createDisabledReason}
                      data-testid="media-upload-visibility"
                      className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="public">Public delivery</option>
                      <option value="private">Private signed delivery</option>
                    </select>
                  </label>

                  <label className="space-y-1 text-xs font-medium text-muted-foreground">
                    Folder
                    <select
                      value={uploadFolderId}
                      onChange={(event) => setUploadFolderId(event.target.value)}
                      disabled={isUploading || !canCreate}
                      title={canCreate ? undefined : createDisabledReason}
                      data-testid="media-upload-folder"
                      className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="root">Root library</option>
                      {folderOptions.map((folder) => (
                        <option key={folder.id} value={folder.id}>{folderPathById.get(folder.id) || folder.name}</option>
                      ))}
                    </select>
                  </label>

                  {renderCreateFolderControl()}

                  {replaceAssetId ? (
                    <div className="rounded-lg border border-border bg-background p-3" data-testid="media-library-replace-current">
                      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <RefreshCw className="h-3.5 w-3.5" />
                        Replace current asset
                      </div>
                      <div
                        className="mt-3 grid grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-lg border border-border bg-muted/20 p-2"
                        data-testid="media-library-replace-comparison"
                        data-current-media-id={replaceAsset?.id || replaceAssetId || ''}
                        data-current-media-name={replaceAsset?.name || ''}
                        data-current-media-type={replaceAsset?.type || ''}
                        data-current-media-bytes={replaceAssetBytes ?? ''}
                      >
                        <div className="h-[54px] overflow-hidden rounded border border-border bg-background">
                          {replaceAsset ? renderMediaThumb(replaceAsset) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <FileText className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 text-xs">
                          <div className="truncate font-medium text-foreground">{replaceAsset?.name || 'Current media asset'}</div>
                          <div className="mt-1 font-mono text-[10px] text-muted-foreground">{replaceAsset?.id || replaceAssetId}</div>
                          <div className="mt-1 text-muted-foreground">
                            {(replaceAsset?.type || 'asset')} · keep stable id
                          </div>
                        </div>
                      </div>
                      <div
                        className="mt-3 rounded-lg border border-border bg-muted/20 p-2 text-xs"
                        data-testid="media-library-replace-binary-diff"
                        data-current-bytes={replaceAssetBytes ?? ''}
                        data-candidate-bytes={replacementBinaryComparison?.candidateBytes ?? ''}
                        data-delta-bytes={replacementBinaryComparison?.deltaBytes ?? ''}
                        data-status={replacementBinaryComparison?.status || 'waiting'}
                      >
                        <div className="grid gap-2 sm:grid-cols-3">
                          <div>
                            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Current binary</div>
                            <div className="mt-1 truncate font-medium text-foreground">{replaceAsset?.name || 'Current asset'}</div>
                            <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                              {replaceAssetBytes === null ? 'Unknown size' : formatBytes(replaceAssetBytes)} · {replaceAsset?.type || 'asset'}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Replacement candidate</div>
                            <div className="mt-1 truncate font-medium text-foreground">
                              {replacementBinaryComparison?.candidateName || 'Choose a file'}
                            </div>
                            <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                              {replacementBinaryComparison
                                ? `${formatBytes(replacementBinaryComparison.candidateBytes)} · ${replacementBinaryComparison.candidateType}`
                                : 'Bytes and type compare before upload'}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Delta</div>
                            <div className="mt-1 font-mono text-sm font-semibold text-foreground">
                              {replacementBinaryComparison?.deltaBytes === null || !replacementBinaryComparison
                                ? 'Pending'
                                : `${replacementBinaryComparison.deltaBytes >= 0 ? '+' : '-'}${formatBytes(Math.abs(replacementBinaryComparison.deltaBytes))}`}
                            </div>
                            <div className="mt-1 text-[10px] text-muted-foreground">
                              {replacementBinaryComparison ? replacementBinaryComparison.status : 'Stable id will be retained'}
                            </div>
                          </div>
                        </div>
                      </div>
                      <label className="mt-3 flex min-h-10 cursor-pointer items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-3 text-xs font-medium text-muted-foreground transition hover:border-primary hover:text-primary">
                        {isReplacing ? 'Replacing...' : 'Choose replacement'}
                        <input
                          type="file"
                          className="sr-only"
                          disabled={isReplacing || isUploading || !canCreate}
                          title={canCreate ? undefined : createDisabledReason}
                          accept={getAcceptValue(uploadFilter)}
                          data-testid="media-library-replace-input"
                          onChange={(event) => {
                            void handleReplaceCurrentAsset(event.target.files);
                            event.currentTarget.value = '';
                          }}
                        />
                      </label>
                    </div>
                  ) : null}

                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
                      <span>Default tags</span>
                      <span className="font-mono">{uploadTagList.length}/10</span>
                    </div>
                    <TagInput
                      tags={uploadTagList}
                      onChange={(tags) => setUploadTags(serializeTagValues(tags, 10))}
                      placeholder="Add hero, product, brand..."
                      ariaLabel="Media upload tags"
                      maxTags={10}
                      disabled={isUploading || !canCreate}
                    />
                  </div>

                  <div className="rounded-lg border border-border bg-background p-3" data-testid="media-upload-image-defaults">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Crop className="h-3.5 w-3.5" />
                      Image insertion defaults
                    </div>
                    <label className="mt-3 block space-y-1 text-xs font-medium text-muted-foreground">
                      Size preset
                      <select
                        value={insertSizePreset}
                        onChange={(event) => setInsertSizePreset(event.target.value as MediaInsertSizePreset)}
                        disabled={isUploading || !canCreate}
                        data-testid="media-upload-insert-preset"
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <option value="fill-frame">Fill selected frame</option>
                        <option value="fit-inside">Fit inside frame</option>
                        <option value="natural">Natural card</option>
                        <option value="square">Square crop</option>
                        <option value="hero">Wide hero crop</option>
                      </select>
                    </label>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <label className="space-y-1 text-xs font-medium text-muted-foreground">
                        Fit
                        <select
                          value={imageObjectFit}
                          onChange={(event) => setImageObjectFit(event.target.value as 'cover' | 'contain' | 'fill' | 'none')}
                          disabled={isUploading || !canCreate}
                          data-testid="media-upload-image-fit"
                          className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <option value="cover">Cover</option>
                          <option value="contain">Contain</option>
                          <option value="fill">Fill</option>
                          <option value="none">None</option>
                        </select>
                      </label>
                      <label className="space-y-1 text-xs font-medium text-muted-foreground">
                        X
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={imageFocalX}
                          onChange={(event) => setImageFocalX(clampPercent(Number(event.target.value)))}
                          disabled={isUploading || !canCreate}
                          data-testid="media-upload-focal-x"
                          className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </label>
                      <label className="space-y-1 text-xs font-medium text-muted-foreground">
                        Y
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={imageFocalY}
                          onChange={(event) => setImageFocalY(clampPercent(Number(event.target.value)))}
                          disabled={isUploading || !canCreate}
                          data-testid="media-upload-focal-y"
                          className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </label>
                    </div>
                    {renderFocalPreview('media-upload-focal-preview', replaceAsset?.type === 'image' ? replaceAsset : null)}
                  </div>

                  {(allowedTypes === 'any' || allowedTypes === 'font') ? (
                    <div className="rounded-lg border border-border bg-background p-3" data-testid="media-upload-font-defaults">
                      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <TypeIcon className="h-3.5 w-3.5" />
                        Font defaults
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <label className="space-y-1 text-xs font-medium text-muted-foreground">
                          Weight
                          <input
                            type="text"
                            value={fontWeight}
                            onChange={(event) => setFontWeight(event.target.value)}
                            disabled={isUploading || !canCreate}
                            data-testid="media-upload-font-weight"
                            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        </label>
                        <label className="space-y-1 text-xs font-medium text-muted-foreground">
                          Display
                          <select
                            value={fontDisplay}
                            onChange={(event) => setFontDisplay(event.target.value as FontDisplayMode)}
                            disabled={isUploading || !canCreate}
                            data-testid="media-upload-font-display"
                            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <option value="swap">Swap</option>
                            <option value="auto">Auto</option>
                            <option value="block">Block</option>
                            <option value="fallback">Fallback</option>
                            <option value="optional">Optional</option>
                          </select>
                        </label>
                      </div>
                      <label className="mt-3 block space-y-1 text-xs font-medium text-muted-foreground">
                        Fallback stack
                        <input
                          type="text"
                          value={fontFallback}
                          onChange={(event) => setFontFallback(event.target.value)}
                          disabled={isUploading || !canCreate}
                          data-testid="media-upload-font-fallback"
                          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </label>
                    </div>
                  ) : null}

                  <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
                    <div className="font-medium text-foreground">Target scope</div>
                    <p className="mt-1">
                      {targetScope === 'global' ? 'Global site library' : `${targetScope} asset${targetId ? ` for ${targetId}` : ''}`}
                    </p>
                  </div>
                </div>
              </aside>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
