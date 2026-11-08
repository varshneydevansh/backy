import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
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
import { createMediaFolder, getDefaultMediaSiteId, getPublicMediaFileUrl, listMediaFolders, listMediaLibrary, replaceMedia, updateMedia, uploadMedia, type MediaFolder, type MediaListOptions } from '@/lib/mediaApi';
import { getMediaUploadConfigurationDisabledReason, getMediaUploadScanPolicyNotice, type MediaUploadReadiness } from '@/lib/mediaUploadReadiness';
import { mediaLibraryPreviewUrl, mediaLibraryScopeIncludes } from './mediaLibraryPresentation';
import { mediaLibraryResultVisible, readMediaLibrarySnapshot } from './mediaLibraryLoadState';
import { useStore, type MediaAsset } from '@/stores/mockStore';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { MediaUploadQueue } from '@/components/media/MediaUploadQueue';
import { runMediaUploadBatch, type MediaUploadRow } from '@/lib/mediaUploadBatch';
import { parseTagInput, serializeTagValues, TagInput } from '@/components/ui/TagInput';

type AllowedType = 'image' | 'video' | 'audio' | 'file' | 'font' | 'other' | 'any';
type MediaScopeFilter = 'all' | 'global' | 'page' | 'post';
type UploadFilter = 'all' | 'image' | 'video' | 'audio' | 'file' | 'font' | 'other';
type MediaLibraryTab = 'library' | 'upload';
type MediaInsertSizePreset = 'fill-frame' | 'fit-inside' | 'natural' | 'square' | 'hero';
type FontDisplayMode = 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
const MEDIA_PICKER_PAGE_SIZE = 100;
const FILE_BUCKET_MEDIA_TYPES = new Set<MediaAsset['type']>(['file', 'other']);
const MEDIA_LIBRARY_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function MediaLibraryLoadFailure({ message, onRetry, canRetry }: { message: string; onRetry: () => void; canRetry: boolean }) {
  return <div className="rounded-lg border border-border bg-muted/30 p-6" role="alert" data-testid="media-library-load-failure" data-action-state="failed">
    <h3 className="text-sm font-semibold">Unable to load the media library</h3>
    <p className="mt-2 text-sm text-muted-foreground">{message}</p>
    <button type="button" disabled={!canRetry} onClick={onRetry} className="mt-4 min-h-11 rounded-md border border-border bg-background px-4 text-sm font-medium disabled:opacity-50" data-testid="media-library-retry">Retry library</button>
  </div>;
}

const mediaTypeMatchesFilter = (type: MediaAsset['type'], filter: UploadFilter) => {
  if (filter === 'all') return true;
  if (filter === 'file') return FILE_BUCKET_MEDIA_TYPES.has(type);
  return type === filter;
};

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
  initialScopeFilter?: MediaScopeFilter;
  showCanvasInsertionControls?: boolean;
  replaceAssetId?: string | null;
  allowPrivateSelection?: boolean;
  returnFocusTargetId?: string;
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

const loadAllPickerMedia = async (options: MediaListOptions): Promise<{ media: MediaAsset[]; uploadReadiness?: MediaUploadReadiness }> => {
  let uploadReadiness: MediaUploadReadiness | undefined;
  const loaded = new Map<string, MediaAsset>();
  let offset = options.offset || 0;
  let hasMore = true;

  while (hasMore) {
    const result = await listMediaLibrary({
      ...options,
      limit: options.limit || MEDIA_PICKER_PAGE_SIZE,
      offset,
    });

    if (result.uploadReadiness) uploadReadiness = result.uploadReadiness;
    result.media.forEach((item) => loaded.set(item.id, item));
    hasMore = Boolean(result.pagination?.hasMore);
    offset = (result.pagination?.offset || offset) + (result.pagination?.limit || options.limit || MEDIA_PICKER_PAGE_SIZE);

    if (!result.pagination && result.media.length === 0) {
      hasMore = false;
    }
  }

  return { media: Array.from(loaded.values()), uploadReadiness };
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
  initialScopeFilter,
  showCanvasInsertionControls = true,
  replaceAssetId = null,
  allowPrivateSelection = false,
  returnFocusTargetId = '',
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
  const [newFolderSubmitted, setNewFolderSubmitted] = useState(false);
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
  const [uploadRows, setUploadRows] = useState<MediaUploadRow[]>([]);
  const [isStoppingUploads, setIsStoppingUploads] = useState(false);
  const uploadBatchRef = useRef<{ stopped: boolean; context: object } | null>(null);
  const replacementRef = useRef<object | null>(null);
  const selectionRef = useRef<object | null>(null);
  const folderCreationRef = useRef<object | null>(null);
  const pickerAdmissionRef = useRef({ canView, canCreate });
  pickerAdmissionRef.current = { canView, canCreate };
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<MediaScopeFilter>(initialScopeFilter || mediaContext?.scope || 'all');
  const [isLoading, setIsLoading] = useState(false);
  const [libraryLoadFailed, setLibraryLoadFailed] = useState(false);
  const [uploadReadinessSnapshot, setUploadReadinessSnapshot] = useState<{ siteId: string; value?: MediaUploadReadiness } | null>(null);
  const mediaLoadRevisionRef = useRef(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [selectingMediaId, setSelectingMediaId] = useState<string | null>(null);
  const [focalPreviewAssetId, setFocalPreviewAssetId] = useState<string | null>(null);
  const [isDraggingFocal, setIsDraggingFocal] = useState(false);
  const [replacementBinaryComparison, setReplacementBinaryComparison] = useState<ReplacementBinaryComparison | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const returnFocusTargetRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const initialFocusAppliedRef = useRef(false);
  const [returnFocusTarget, setReturnFocusTarget] = useState('');
  const initialFocusTarget = 'media-library-close';
  const focusTrapTarget = 'media-library-modal';
  const defaultLibraryScopeFilter: MediaScopeFilter = initialScopeFilter || mediaContext?.scope || 'all';

  const siteId = mediaContext?.siteId || getDefaultMediaSiteId();
  const targetScope = mediaContext?.scope || 'global';
  const targetId = mediaContext?.targetId;
  // New identity also prevents A → B → A and close/reopen from adopting an old completion.
  const pickerContextKey = JSON.stringify([isOpen, siteId, targetScope, targetId || '', replaceAssetId || '', allowedTypes]);
  const pickerContextRef = useRef({ key: pickerContextKey });
  if (pickerContextRef.current.key !== pickerContextKey) pickerContextRef.current = { key: pickerContextKey };
  const pickerContext = pickerContextRef.current;
  const pickerMountedRef = useRef(true);
  const uploadAdmissionRef = useRef(false);

  useEffect(() => {
    const previousBatch = uploadBatchRef.current;
    if (previousBatch && previousBatch.context !== pickerContext) {
      previousBatch.stopped = true;
      uploadBatchRef.current = null;
    }
    replacementRef.current = null;
    selectionRef.current = null;
    folderCreationRef.current = null;
    setIsCreatingFolder(false);
    setIsUploading(false);
    setIsStoppingUploads(false);
    setIsReplacing(false);
    setUploadRows([]);
    setUploadProgress(null);
    setSelectingMediaId(null);
    setError(null);
  }, [pickerContext]);

  useEffect(() => {
    pickerMountedRef.current = true;
    return () => {
      pickerMountedRef.current = false;
      if (uploadBatchRef.current) uploadBatchRef.current.stopped = true;
      uploadBatchRef.current = null;
      replacementRef.current = null;
      selectionRef.current = null;
      folderCreationRef.current = null;
    };
  }, []);

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
    setScopeFilter(defaultLibraryScopeFilter);
    setNewFolderName('');
    setNewFolderParentId('root');
    setNewFolderSubmitted(false);
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
  }, [canCreate, canView, defaultLibraryScopeFilter, initialTab, initialUploadFilter, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      returnFocusTargetRef.current = null;
      setReturnFocusTarget('');
      return;
    }

    const preferredFocusTarget = returnFocusTargetId
      ? Array.from(document.querySelectorAll<HTMLElement>('[data-testid]'))
        .find((element) => element.getAttribute('data-testid') === returnFocusTargetId) || null
      : null;
    const activeElement = document.activeElement;
    const activeFocusTarget = activeElement instanceof HTMLElement && !activeElement.closest('[data-testid="media-library-modal"]')
      ? activeElement
      : null;
    const focusTarget = preferredFocusTarget || activeFocusTarget;

    returnFocusTargetRef.current = focusTarget;
    setReturnFocusTarget(
      returnFocusTargetId ||
      focusTarget?.getAttribute('data-testid') ||
      focusTarget?.getAttribute('aria-label') ||
      focusTarget?.tagName ||
      '',
    );
  }, [isOpen, returnFocusTargetId]);

  const handleClose = useCallback(() => {
    const focusTarget = returnFocusTargetRef.current;
    if (uploadBatchRef.current) uploadBatchRef.current.stopped = true;
    uploadBatchRef.current = null;
    replacementRef.current = null;
    selectionRef.current = null;
    folderCreationRef.current = null;
    pickerContextRef.current = { key: '' };
    onClose();
    window.setTimeout(() => {
      if (focusTarget && document.contains(focusTarget)) {
        focusTarget.focus({ preventScroll: true });
      }
    }, 0);
  }, [onClose]);

  const getFocusableDialogElements = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return [];
    }

    return Array.from(dialog.querySelectorAll<HTMLElement>(MEDIA_LIBRARY_FOCUSABLE_SELECTOR))
      .filter((element) => {
        if (element.closest('[hidden],[aria-hidden="true"],[inert]')) {
          return false;
        }

        if (element.tabIndex < 0) {
          return false;
        }

        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
      });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      initialFocusAppliedRef.current = false;
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      if (initialFocusAppliedRef.current) {
        return;
      }

      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && activeElement.closest('[data-testid="media-library-modal"]')) {
        initialFocusAppliedRef.current = true;
        return;
      }

      closeButtonRef.current?.focus({ preventScroll: true });
      initialFocusAppliedRef.current = true;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        handleClose();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }

      const focusableElements = getFocusableDialogElements();
      const firstFocusable = focusableElements[0] || closeButtonRef.current;
      const lastFocusable = focusableElements[focusableElements.length - 1] || closeButtonRef.current;
      const activeElement = document.activeElement;

      if (!firstFocusable || !lastFocusable) {
        event.preventDefault();
        closeButtonRef.current?.focus({ preventScroll: true });
        return;
      }

      if (!(activeElement instanceof HTMLElement) || !dialog.contains(activeElement)) {
        event.preventDefault();
        firstFocusable.focus({ preventScroll: true });
        return;
      }

      if (event.shiftKey && activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus({ preventScroll: true });
        return;
      }

      if (!event.shiftKey && activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', handleDialogKeyDown, true);
    return () => document.removeEventListener('keydown', handleDialogKeyDown, true);
  }, [getFocusableDialogElements, handleClose, isOpen]);

  const allowedTypesSet = useMemo(() => {
    if (allowedTypes === 'any') return new Set(['image', 'video', 'audio', 'file', 'font', 'other']);
    if (allowedTypes === 'file') return new Set(['file', 'other']);
    return new Set([allowedTypes]);
  }, [allowedTypes]);

  const currentSiteRef = useRef(siteId);
  currentSiteRef.current = siteId;
  const uploadReadiness = uploadReadinessSnapshot?.siteId === siteId ? uploadReadinessSnapshot.value : undefined;
  const uploadConfigurationDisabledReason = getMediaUploadConfigurationDisabledReason(uploadReadiness);
  const uploadScanPolicyNotice = getMediaUploadScanPolicyNotice(uploadReadiness);
  uploadAdmissionRef.current = isOpen && canCreate && !uploadConfigurationDisabledReason;
  const targetLabel = mediaContext?.targetLabel || mediaContext?.targetId;
  const mediaLibraryActionStatusId = 'media-library-action-status';
  const createFolderActionStatusId = 'media-library-create-folder-action-status';

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

  const mediaContextFilter = (item: MediaAsset & { scope: 'global' | 'page' | 'post'; scopeTargetId: string | null }) => {
    return mediaLibraryScopeIncludes(item, scopeFilter, targetScope, targetId);
  };

  const allowedTypeOptions = useMemo(
    () => (['all', 'image', 'video', 'audio', 'file', 'font', 'other'] as const).filter((filter) => (
      filter === 'all'
        ? allowedTypes === 'any' || allowedTypes === 'file'
        : allowedTypes === 'any' || allowedTypesSet.has(filter)
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

  const newFolderTrimmedName = newFolderName.trim();
  const newFolderParentDatabaseId = newFolderParentId === 'root' ? null : newFolderParentId;
  const newFolderParentLabel = newFolderParentId === 'root'
    ? 'Root library'
    : folderPathById.get(newFolderParentId) || 'Selected folder';

  const newFolderDuplicate = useMemo(() => {
    if (!newFolderTrimmedName) return false;

    return folderOptions.some((folder) => (
      (folder.parentId || null) === newFolderParentDatabaseId &&
      folder.name.trim().toLowerCase() === newFolderTrimmedName.toLowerCase()
    ));
  }, [folderOptions, newFolderParentDatabaseId, newFolderTrimmedName]);

  const newFolderInlineError = useMemo(() => {
    if (!newFolderSubmitted) return null;

    if (!newFolderTrimmedName) {
      return 'Enter a folder name before creating a media folder.';
    }

    return newFolderDuplicate ? `A sibling media folder named "${newFolderTrimmedName}" already exists.` : null;
  }, [newFolderDuplicate, newFolderSubmitted, newFolderTrimmedName]);

  const createFolderDisabledReason = isUploading
    ? 'Wait for the current upload to finish.'
    : isCreatingFolder
      ? 'Folder creation is already running.'
      : !canCreate
        ? createDisabledReason
        : '';
  const createFolderValidationReason = !newFolderTrimmedName
    ? 'Enter a folder name before creating.'
    : newFolderDuplicate
      ? `A sibling media folder named "${newFolderTrimmedName}" already exists.`
      : '';
  const createFolderActionState = createFolderDisabledReason
    ? 'blocked'
    : createFolderValidationReason
      ? 'needs-input'
      : 'ready';
  const createFolderActionStatus = createFolderDisabledReason
    ? `Create folder unavailable: ${createFolderDisabledReason}`
    : createFolderValidationReason
      ? createFolderValidationReason
      : `Create folder "${newFolderTrimmedName}" in ${newFolderParentLabel}.`;
  const createFolderDescribedBy = [
    createFolderActionStatusId,
    newFolderInlineError ? 'media-library-create-folder-name-error' : null,
  ].filter(Boolean).join(' ');

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
    const revision = ++mediaLoadRevisionRef.current;
    const context = pickerContext;
    const isCurrent = () => pickerMountedRef.current && pickerContextRef.current === context && pickerAdmissionRef.current.canView && currentSiteRef.current === siteId && mediaLoadRevisionRef.current === revision;
    if (!canView) {
      setFolders([]);
      setError(viewDisabledReason);
      return;
    }

    setIsLoading(true);
    setLibraryLoadFailed(false);
    setError(null);

    try {
      const mediaOptions: MediaListOptions = {
        siteId,
        limit: MEDIA_PICKER_PAGE_SIZE,
        // Browsing covers the authorized site; uploads retain their own target context.
      };
      let loadedReadiness: MediaUploadReadiness | undefined;
      const snapshot = await readMediaLibrarySnapshot(async () => {
        const result = await loadAllPickerMedia(mediaOptions);
        loadedReadiness = result.uploadReadiness;
        return result.media;
      }, () => listMediaFolders(siteId));
      if (!isCurrent()) return;
      setUploadReadinessSnapshot({ siteId, value: loadedReadiness });
      if (snapshot.state === 'failed') {
        setLibraryLoadFailed(true);
        setError(snapshot.message);
      } else {
        setMedia(snapshot.media);
        setFolders(snapshot.folders);
      }
    } catch (loadError) {
      if (!isCurrent()) return;
      setLibraryLoadFailed(true);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load media library');
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [canView, pickerContext, setMedia, siteId, viewDisabledReason]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    void loadMedia();
    return () => { mediaLoadRevisionRef.current++; };
  }, [isOpen, loadMedia]);

  const filteredMedia = useMemo(
    () => !canView || libraryLoadFailed
      ? []
      :
      normalized.filter((item) => {
        if (!allowedTypesSet.has(item.type)) return false;
        if (libraryTypeFilter !== 'all' && !mediaTypeMatchesFilter(item.type, libraryTypeFilter)) return false;
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
    [allowedTypesSet, canView, libraryLoadFailed, libraryFolderFilter, libraryFolderIds, libraryTypeFilter, mediaContextFilter, normalized, searchQuery, scopeFilter, targetScope]
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

  const mediaLibraryOperationBusyReason = isUploading
    ? `Upload in progress for ${uploadFolderLabel}.`
    : isReplacing
      ? `Replacing ${replaceAsset?.name || 'the current media asset'}.`
      : isCreatingFolder
        ? `Creating a media folder in ${newFolderParentLabel}.`
        : selectingMediaId
          ? 'Inserting the selected media asset into the editor.'
          : '';
  const mediaLibraryActionState = mediaLibraryOperationBusyReason
    ? 'busy'
    : activeTab === 'library' && !canView
      ? 'blocked'
      : activeTab === 'upload' && (!canCreate || uploadConfigurationDisabledReason)
        ? 'blocked'
        : activeTab === 'library' && libraryLoadFailed
          ? 'failed'
          : activeTab === 'library' && isLoading
            ? 'busy'
        : 'ready';
  const mediaLibraryActionStatus = isUploading
    ? `Uploading assets to ${uploadFolderLabel}.`
    : isReplacing
      ? `Replacing ${replaceAsset?.name || 'the current media asset'} while keeping the existing media id.`
    : isCreatingFolder
      ? `Creating a media folder in ${newFolderParentLabel}.`
      : selectingMediaId
        ? 'Inserting the selected media asset into the editor.'
        : activeTab === 'upload'
          ? uploadConfigurationDisabledReason
            ? `Upload unavailable: ${uploadConfigurationDisabledReason}`
            : `Upload panel available for ${siteId}; files will upload to ${uploadFolderLabel}. The server checks each upload.`
          : libraryLoadFailed
            ? `Media library failed to load for ${siteId}. ${error || 'Retry the library request.'}`
            : isLoading
              ? `Loading media library for ${siteId}.`
          : `Library panel ready for ${siteId}; ${filteredMedia.length} media item${filteredMedia.length === 1 ? '' : 's'} available.`;
  const mediaLibraryCloseActionState = mediaLibraryOperationBusyReason ? 'busy' : 'ready';
  const mediaLibraryCloseActionStatus = mediaLibraryOperationBusyReason
    ? `Close media library available; ${mediaLibraryOperationBusyReason}`
    : `Close media library dialog for ${siteId}.`;

  const getTabDisabledReason = (tab: MediaLibraryTab) => (
    tab === 'library' && !canView
      ? viewDisabledReason
      : tab === 'upload' && !canCreate
        ? createDisabledReason
        : ''
  );

  const getTabActionState = (tab: MediaLibraryTab) => (
    getTabDisabledReason(tab) ? 'blocked' : activeTab === tab ? 'active' : 'ready'
  );

  const getTabActionStatus = (tab: MediaLibraryTab) => {
    const disabledReason = getTabDisabledReason(tab);
    if (disabledReason) {
      return `${tab === 'library' ? 'Library' : 'Upload'} panel unavailable: ${disabledReason}`;
    }
    return activeTab === tab
      ? `${tab === 'library' ? 'Library' : 'Upload'} panel is active.`
      : `Switch to the ${tab === 'library' ? 'library' : 'upload'} panel.`;
  };

  const isLibraryFilterActive = Boolean(searchQuery.trim())
    || libraryTypeFilter !== 'all'
    || libraryFolderFilter !== 'all'
    || includeNestedFolders === false
    || scopeFilter !== defaultLibraryScopeFilter;
  const libraryFilterActionStatus = isLibraryFilterActive
    ? `Media library filters active; ${filteredMedia.length} matching asset${filteredMedia.length === 1 ? '' : 's'} shown.`
    : `Media library filters ready; ${filteredMedia.length} asset${filteredMedia.length === 1 ? '' : 's'} shown.`;
  const clearLibraryFiltersDisabledReason = isLibraryFilterActive ? '' : 'No media library filters are active.';
  const includeNestedFoldersDisabledReason = libraryFolderFilter === 'all' || libraryFolderFilter === 'root'
    ? 'Choose a parent folder before toggling nested folder inclusion.'
    : '';
  const getLibraryFilterActionState = (disabledReason = '', selected = false) => {
    if (disabledReason) return 'blocked';
    return selected ? 'selected' : 'ready';
  };
  const getLibraryFilterActionProps = (
    status: string,
    disabledReason = '',
    selected = false,
  ) => ({
    'aria-describedby': mediaLibraryActionStatusId,
    'data-action-state': getLibraryFilterActionState(disabledReason, selected),
    'data-action-status': status,
    'data-disabled-reason': disabledReason || undefined,
  });
  const librarySelectionDisabledReason = !canView ? viewDisabledReason : '';
  const getLibrarySelectionActionProps = (
    status: string,
    options: { disabledReason?: string; selected?: boolean } = {},
  ) => {
    const disabledReason = options.disabledReason ?? librarySelectionDisabledReason;
    return {
      'aria-describedby': mediaLibraryActionStatusId,
      'data-action-state': getLibraryFilterActionState(disabledReason, Boolean(options.selected)),
      'data-action-status': disabledReason ? `Library selection unavailable: ${disabledReason}` : status,
      'data-disabled-reason': disabledReason || undefined,
    };
  };
  const librarySelectionTargetMetadata = {
    'data-target-media-scope': scopeFilter,
    'data-target-media-type-filter': libraryTypeFilter,
    'data-target-folder-id': libraryFolderFilter,
  };
  const uploadControlDisabledReason = !canCreate ? createDisabledReason : uploadConfigurationDisabledReason;
  const uploadBusyDisabledReason = isUploading ? 'Wait for the current upload to finish.' : uploadControlDisabledReason;
  const replacementUploadDisabledReason = isReplacing
    ? 'Wait for the current media replacement to finish.'
    : uploadBusyDisabledReason;
  const getUploadActionState = (disabledReason = '', selected = false, busy = false) => {
    if (busy) return 'busy';
    if (disabledReason) return 'blocked';
    return selected ? 'selected' : 'ready';
  };
  const getUploadControlActionProps = (
    status: string,
    options: { disabledReason?: string; selected?: boolean; busy?: boolean } = {},
  ) => {
    const disabledReason = options.disabledReason ?? uploadControlDisabledReason;
    return {
      'aria-describedby': mediaLibraryActionStatusId,
      'data-action-state': getUploadActionState(disabledReason, Boolean(options.selected), Boolean(options.busy)),
      'data-action-status': status,
      'data-disabled-reason': disabledReason || undefined,
    };
  };
  const formatUploadFilterLabel = (filter: UploadFilter) => {
    if (filter === 'all') return 'all allowed media';
    if (filter === 'file') return 'documents and other files';
    return `${filter} files`;
  };
  const getUploadFilterActionStatus = (filter: UploadFilter) => {
    const label = formatUploadFilterLabel(filter);
    if (isUploading) return `Uploading ${label} to ${uploadFolderLabel}.`;
    if (!canCreate) return `Cannot switch upload filter to ${label}: ${createDisabledReason}`;
    return uploadFilter === filter
      ? `${label} upload filter selected; new files will upload as ${uploadVisibility} assets in ${uploadFolderLabel}.`
      : `Switch upload filter to ${label}.`;
  };
  const uploadDropzoneActionStatus = isUploading
    ? `Uploading ${formatUploadFilterLabel(uploadFilter)} to ${uploadFolderLabel}.`
    : uploadControlDisabledReason
      ? `Upload unavailable: ${uploadControlDisabledReason}`
      : `Drop or choose ${formatUploadFilterLabel(uploadFilter)} to upload as ${uploadVisibility} assets in ${uploadFolderLabel}.`;
  const uploadTagsAtLimit = uploadTagList.length >= 10;
  const uploadTagsDisabledReason = uploadBusyDisabledReason || (
    uploadTagsAtLimit ? 'Maximum upload tags reached. Remove a tag before adding another.' : ''
  );
  const uploadTagsActionStatus = isUploading
    ? `Uploading with ${uploadTagList.length} default tag${uploadTagList.length === 1 ? '' : 's'}.`
    : uploadTagsAtLimit
      ? `Upload tag limit reached with ${uploadTagList.length} tags; remove a tag before adding another.`
      : uploadTagList.length > 0
        ? `Upload defaults include ${uploadTagList.length} tag${uploadTagList.length === 1 ? '' : 's'}: ${uploadTagList.join(', ')}.`
        : 'Add up to 10 default tags before files enter the media library.';
  const uploadTagsActionState = getUploadActionState(uploadTagsDisabledReason, uploadTagList.length > 0, isUploading);
  const uploadDefaultsTargetMetadata = {
    'data-target-upload-filter': uploadFilter,
    'data-upload-visibility': uploadVisibility,
    'data-upload-folder-id': uploadFolderId,
    'data-upload-folder-label': uploadFolderLabel,
    'data-target-media-scope': targetScope,
    'data-target-media-scope-id': targetId || '',
  };

  const clearLibraryFilters = () => {
    setSearchQuery('');
    setLibraryTypeFilter('all');
    setLibraryFolderFilter('all');
    setIncludeNestedFolders(true);
    setScopeFilter(defaultLibraryScopeFilter);
  };

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
      const source = mediaLibraryPreviewUrl(item, siteId, getPublicMediaFileUrl);
      return source ? <img src={source} alt={item.name} className="w-full h-full object-cover" /> : <div className="flex h-full items-center justify-center text-muted-foreground" aria-label="Image preview unavailable"><LockKeyhole className="h-6 w-6" /></div>;
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
      imagePresentation: showCanvasInsertionControls && item.type === 'image'
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
      {...(testId === 'media-upload-focal-preview'
        ? getUploadControlActionProps(
          `Image focal point set to ${imageFocalX}% ${imageFocalY}% with ${imageObjectFit} fit.`,
          { disabledReason: uploadBusyDisabledReason, busy: isUploading },
        )
        : getLibrarySelectionActionProps(`Library image focal point set to ${imageFocalX}% ${imageFocalY}% with ${imageObjectFit} fit.`))}
      {...(testId === 'media-upload-focal-preview' ? uploadDefaultsTargetMetadata : librarySelectionTargetMetadata)}
      data-image-object-fit={imageObjectFit}
      data-image-focal-x={imageFocalX}
      data-image-focal-y={imageFocalY}
      className="relative mt-3 aspect-[4/3] w-full cursor-crosshair touch-none overflow-hidden rounded-lg border border-border bg-[linear-gradient(45deg,rgba(148,163,184,0.16)_25%,transparent_25%),linear-gradient(-45deg,rgba(148,163,184,0.16)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,rgba(148,163,184,0.16)_75%),linear-gradient(-45deg,transparent_75%,rgba(148,163,184,0.16)_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0] text-left focus:outline-none focus:ring-2 focus:ring-primary/30"
      aria-label="Set image focal point"
    >
      {previewAsset && mediaLibraryPreviewUrl(previewAsset, siteId, getPublicMediaFileUrl) ? (
        <img
          src={mediaLibraryPreviewUrl(previewAsset, siteId, getPublicMediaFileUrl)}
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
    if (!isOpen || !canView || selectionRef.current) return;
    if (item.visibility === 'private' && !allowPrivateSelection) {
      setError('Private media cannot be inserted directly into public editor fields. Generate a signed URL from Media details instead.');
      return;
    }

    const options = buildSelectionOptions(item);
    if (item.type === 'font' && options.fontRegistration && !canCreate) {
      setError(createDisabledReason);
      return;
    }
    const selection = { context: pickerContext };
    selectionRef.current = selection;
    const ownsPicker = () => pickerMountedRef.current && pickerContextRef.current === selection.context && selectionRef.current === selection;
    let selectedItem = item;

    try {
      if (item.type === 'font' && options.fontRegistration) {
        setSelectingMediaId(item.id);
        setError(null);
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
        if (!ownsPicker() || !pickerAdmissionRef.current.canView || !pickerAdmissionRef.current.canCreate) return;
        setMedia([selectedItem, ...useStore.getState().media.filter(current => current.id !== selectedItem.id)]);
      }
      if (!ownsPicker() || !pickerAdmissionRef.current.canView) return;
      onSelect(selectedItem, options);
      handleClose();
    } catch (fontError) {
      if (ownsPicker()) setError(fontError instanceof Error ? fontError.message : 'Unable to save font registration before inserting.');
    } finally {
      if (ownsPicker()) {
        selectionRef.current = null;
        setSelectingMediaId(null);
      }
    }
  };

  const handleCreateFolder = async () => {
    if (isCreatingFolder || isUploading || folderCreationRef.current || !isOpen) return;
    setNewFolderSubmitted(true);
    if (!canCreate) {
      setError(createDisabledReason);
      return;
    }

    if (!newFolderTrimmedName) {
      setError('Fix media folder fields before creating.');
      return;
    }

    if (newFolderDuplicate) {
      setError('Fix media folder fields before creating.');
      return;
    }

    const creation = { context: pickerContext };
    folderCreationRef.current = creation;
    const ownsPicker = () => pickerMountedRef.current && pickerContextRef.current === creation.context && folderCreationRef.current === creation;
    setIsCreatingFolder(true);
    setError(null);

    try {
      const folder = await createMediaFolder(newFolderTrimmedName, siteId, { parentId: newFolderParentDatabaseId });
      if (!ownsPicker() || !pickerAdmissionRef.current.canCreate) return;
      setFolders((current) => [...current.filter((item) => item.id !== folder.id), folder]);
      setUploadFolderId(folder.id);
      setLibraryFolderFilter(folder.id);
      setNewFolderParentId(folder.id);
      setNewFolderName('');
      setNewFolderSubmitted(false);
    } catch (createError) {
      if (!ownsPicker()) return;
      setError(createError instanceof Error ? createError.message : 'Unable to create media folder');
    } finally {
      if (ownsPicker()) {
        folderCreationRef.current = null;
        setIsCreatingFolder(false);
      }
    }
  };

  const renderCreateFolderControl = () => (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <FolderPlus className="h-3.5 w-3.5" />
        Create folder
      </div>
      <p
        id={createFolderActionStatusId}
        role="status"
        aria-live="polite"
        data-testid="media-library-create-folder-action-status"
        data-action-state={createFolderActionState}
        data-action-status={createFolderActionStatus}
        data-disabled-reason={createFolderDisabledReason || undefined}
        data-target-folder-parent-id={newFolderParentId}
        data-target-folder-name={newFolderTrimmedName}
        className="sr-only"
      >
        {createFolderActionStatus}
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
        <select
          value={newFolderParentId}
          onChange={(event) => {
            setNewFolderParentId(event.target.value);
            if (error === 'Fix media folder fields before creating.') {
              setError(null);
            }
          }}
          disabled={isUploading || isCreatingFolder || !canCreate}
          title={createFolderDisabledReason || undefined}
          data-testid="media-library-create-folder-parent"
          data-action-state={createFolderActionState}
          data-action-status={createFolderActionStatus}
          data-disabled-reason={createFolderDisabledReason || undefined}
          data-target-folder-parent-id={newFolderParentId}
          className="h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="New media folder parent"
          aria-describedby={createFolderDescribedBy}
        >
          <option value="root">Root library</option>
          {folderOptions.map((folder) => (
            <option key={folder.id} value={folder.id}>{folder.path}</option>
          ))}
        </select>
        <input
          type="text"
          value={newFolderName}
          onChange={(event) => {
            setNewFolderName(event.target.value);
            if (error === 'Fix media folder fields before creating.') {
              setError(null);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void handleCreateFolder();
            }
          }}
          disabled={isUploading || isCreatingFolder || !canCreate}
          title={createFolderDisabledReason || undefined}
          data-testid="media-library-create-folder-name"
          data-action-state={createFolderActionState}
          data-action-status={createFolderActionStatus}
          data-disabled-reason={createFolderDisabledReason || undefined}
          data-target-folder-parent-id={newFolderParentId}
          data-target-folder-name={newFolderTrimmedName}
          aria-invalid={Boolean(newFolderInlineError)}
          aria-describedby={createFolderDescribedBy}
          className="min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
          placeholder="Campaign assets"
        />
        <button
          type="button"
          onClick={() => void handleCreateFolder()}
          disabled={isUploading || isCreatingFolder || !canCreate}
          title={createFolderDisabledReason || undefined}
          data-testid="media-library-create-folder"
          data-action-state={createFolderActionState}
          data-action-status={createFolderActionStatus}
          data-disabled-reason={createFolderDisabledReason || undefined}
          data-target-folder-parent-id={newFolderParentId}
          data-target-folder-name={newFolderTrimmedName}
          aria-describedby={createFolderDescribedBy}
          className="inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCreatingFolder ? 'Creating' : 'Create'}
        </button>
      </div>
      {newFolderInlineError && (
        <p id="media-library-create-folder-name-error" className="mt-2 text-xs font-medium text-destructive" data-testid="media-library-create-folder-name-error">
          {newFolderInlineError}
        </p>
      )}
    </div>
  );

  const handleFileUpload = async (files: FileList | null, filterHint: UploadFilter) => {
    if (isUploading || uploadBatchRef.current || replacementRef.current) return;
    if (!canCreate) {
      setError(createDisabledReason);
      return;
    }
    if (uploadConfigurationDisabledReason) {
      setError(uploadConfigurationDisabledReason);
      return;
    }
    if (!isOpen || !files || files.length === 0) return;

    const batch = { stopped: false, context: pickerContext };
    uploadBatchRef.current = batch;
    const ownsPicker = () => pickerMountedRef.current && pickerContextRef.current === batch.context && uploadBatchRef.current === batch;
    setIsUploading(true);
    setIsStoppingUploads(false);
    setError(null);

    try {
      const { rows, uploaded } = await runMediaUploadBatch({
        files: Array.from(files),
        reject: file => {
          const resolvedType = getUploadType(file);
          return mediaTypeMatchesFilter(resolvedType, filterHint) && allowedTypesSet.has(resolvedType)
            ? undefined
            : 'Does not match the current allowed media or upload type.';
        },
        // An admitted request settles; only pending requests lose admission.
        shouldContinue: () => ownsPicker() && !batch.stopped && uploadAdmissionRef.current,
        onRows: rows => {
          if (!ownsPicker()) return;
          setUploadRows(rows);
          const accepted = rows.filter(row => row.status !== 'skipped');
          setUploadProgress({
            total: accepted.length,
            completed: accepted.filter(row => row.status === 'saved' || row.status === 'failed').length,
            failed: rows.filter(row => row.status === 'failed').length,
            skipped: rows.filter(row => row.status === 'skipped').length,
            currentName: rows.find(row => row.status === 'uploading')?.name || accepted.at(-1)?.name || '',
          });
        },
        upload: file => {
          const resolvedType = getUploadType(file);
          const focalPoint = { x: clampPercent(imageFocalX), y: clampPercent(imageFocalY) };
          return uploadMedia(file, {
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
            metadata: showCanvasInsertionControls && resolvedType === 'image'
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
        },
      });
      if (!ownsPicker()) return;
      if (uploaded.length) {
        const currentMedia = useStore.getState().media;
        setMedia([...uploaded, ...currentMedia.filter(item => !uploaded.some(next => next.id === item.id))]);
        setActiveTab('library');
      }
      const failures = rows.filter(row => row.status === 'failed' || row.status === 'skipped');
      const messages = failures.map(row => `${row.name}: ${row.message}`);
      const warnings = uploaded.flatMap(asset => asset.completionWarnings || []);
      if (warnings.length) messages.push(`Files were saved. Follow-up work needs attention: ${[...new Set(warnings)].join(', ')}. Review Storage recovery in Media.`);
      if (messages.length) setError(messages.join(' '));
    } finally {
      if (ownsPicker()) {
        uploadBatchRef.current = null;
        setIsUploading(false);
        setIsStoppingUploads(false);
      }
    }
  };

  const handleReplaceCurrentAsset = async (files: FileList | null) => {
    if (isReplacing || isUploading || replacementRef.current || uploadBatchRef.current) return;
    if (!canCreate) {
      setError(createDisabledReason);
      return;
    }
    if (uploadConfigurationDisabledReason) {
      setError(uploadConfigurationDisabledReason);
      return;
    }
    if (!isOpen || !replaceAssetId || !files || files.length === 0) return;
    const replacement = { context: pickerContext };
    replacementRef.current = replacement;
    const ownsPicker = () => pickerMountedRef.current && pickerContextRef.current === replacement.context && replacementRef.current === replacement;

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
      if (!ownsPicker()) return;
      setReplacementBinaryComparison({ ...nextBinaryComparison, status: 'replaced' });
      setMedia([updated, ...useStore.getState().media.filter((item) => item.id !== updated.id)]);
      setUploadProgress({ total: 1, completed: 1, failed: 0, skipped: Math.max(0, files.length - 1), currentName: file.name });
      onSelect(updated, buildSelectionOptions(updated));
      handleClose();
    } catch (replaceError) {
      if (!ownsPicker()) return;
      setReplacementBinaryComparison({ ...nextBinaryComparison, status: 'failed' });
      setUploadProgress((current) => current ? { ...current, completed: 1, failed: 1 } : current);
      setError(replaceError instanceof Error ? replaceError.message : 'Unable to replace the current media asset.');
    } finally {
      if (ownsPicker()) {
        replacementRef.current = null;
        setIsReplacing(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-foreground/45 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="media-library-dialog-title"
      data-testid="media-library-modal"
      data-active-tab={activeTab}
      data-allowed-types={allowedTypes}
      data-upload-filter={uploadFilter}
      data-library-type-filter={libraryTypeFilter}
      data-library-search-query={searchQuery.trim()}
      data-library-filter-active={isLibraryFilterActive ? 'true' : 'false'}
      data-library-filter-action-status={libraryFilterActionStatus}
      data-scope-filter={scopeFilter}
      data-folder-filter={libraryFolderFilter}
      data-include-nested-folders={includeNestedFolders ? 'true' : 'false'}
      data-insert-preset={insertSizePreset}
      data-replace-asset-id={replaceAssetId || ''}
      data-return-focus-target={returnFocusTarget}
      data-initial-focus-target={initialFocusTarget}
      data-focus-trap="active"
      data-focus-trap-target={focusTrapTarget}
      data-close-shortcut="Escape"
      data-upload-progress-total={uploadProgress?.total ?? 0}
      data-upload-progress-completed={uploadProgress?.completed ?? 0}
      data-upload-progress-failed={uploadProgress?.failed ?? 0}
      aria-describedby={mediaLibraryActionStatusId}
      aria-keyshortcuts="Escape"
      data-action-state={mediaLibraryActionState}
      data-action-status={mediaLibraryActionStatus}
    >
      <div className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="media-library-dialog-title" className="text-lg font-semibold text-foreground">Media library</h2>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {libraryLoadFailed ? 'Library unavailable' : isLoading ? 'Loading assets' : `${media.length} assets`}
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
            ref={closeButtonRef}
            onClick={handleClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
            type="button"
            aria-label="Close media library"
            aria-describedby={mediaLibraryActionStatusId}
            aria-keyshortcuts="Escape"
            data-testid="media-library-close"
            data-action-state={mediaLibraryCloseActionState}
            data-action-status={mediaLibraryCloseActionStatus}
            data-busy-reason={mediaLibraryOperationBusyReason || undefined}
            data-active-tab={activeTab}
            data-target-site-id={siteId}
            data-replace-asset-id={replaceAssetId || ''}
            data-return-focus-target={returnFocusTarget}
            data-initial-focus-target={initialFocusTarget}
            data-close-shortcut="Escape"
            data-upload-progress-total={uploadProgress?.total ?? 0}
            data-upload-progress-completed={uploadProgress?.completed ?? 0}
            data-upload-progress-failed={uploadProgress?.failed ?? 0}
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
                  title={getTabDisabledReason(tab) || undefined}
                  data-testid={`media-library-tab-${tab}`}
                  data-action-state={getTabActionState(tab)}
                  data-action-status={getTabActionStatus(tab)}
                  data-disabled-reason={getTabDisabledReason(tab) || undefined}
                  aria-describedby={mediaLibraryActionStatusId}
                  aria-pressed={activeTab === tab}
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

        {uploadConfigurationDisabledReason && (
          <div role="status" className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800" data-testid="media-upload-configuration-status">
            {uploadConfigurationDisabledReason}
          </div>
        )}
        {uploadScanPolicyNotice && (
          <Notice tone="warning" role="status" className="mx-5 my-3" data-testid="media-upload-scan-policy-notice">
            {uploadScanPolicyNotice}
          </Notice>
        )}

        <span
          id={mediaLibraryActionStatusId}
          role="status"
          aria-live="polite"
          data-testid="media-library-action-status"
          data-action-state={mediaLibraryActionState}
          data-action-status={mediaLibraryActionStatus}
          className="sr-only"
        >
          {mediaLibraryActionStatus}
        </span>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {uploadRows.length > 0 && <div className="px-5 pt-4">
            <MediaUploadQueue rows={uploadRows} active={isUploading} stopping={isStoppingUploads} onStop={() => {
              if (!uploadBatchRef.current) return;
              uploadBatchRef.current.stopped = true;
              setIsStoppingUploads(true);
            }} />
          </div>}
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
                      {...getLibraryFilterActionProps(
                        searchQuery.trim()
                          ? `Search media library for "${searchQuery.trim()}"; ${filteredMedia.length} matches shown.`
                          : `Search ${libraryStats.total} visible media assets by filename, tag, caption, or visibility.`,
                      )}
                      data-library-search-query={searchQuery.trim()}
                      data-library-result-count={filteredMedia.length}
                      className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                      placeholder="Search filename, tag, caption, visibility..."
                      aria-label="Search media"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    {isLibraryFilterActive ? (
                      <button
                        type="button"
                        onClick={clearLibraryFilters}
                        data-testid="media-library-clear-filters"
                        {...getLibraryFilterActionProps('Clear active media library filters.', clearLibraryFiltersDisabledReason)}
                        data-library-filter-active="true"
                        className="min-h-9 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                      >
                        Clear filters
                      </button>
                    ) : null}
                    {allowedTypeOptions.map((filter) => (
                      <button
                        type="button"
                        key={filter}
                        onClick={() => setLibraryTypeFilter(filter)}
                        data-testid={`media-library-type-filter-${filter}`}
                        aria-pressed={libraryTypeFilter === filter}
                        data-target-media-type-filter={filter}
                        data-library-result-count={filteredMedia.length}
                        {...getLibraryFilterActionProps(
                          `Show ${filter === 'all' ? 'all allowed' : filter} media assets; ${filteredMedia.length} assets currently shown.`,
                          '',
                          libraryTypeFilter === filter,
                        )}
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

                {libraryLoadFailed && !isLoading ? <MediaLibraryLoadFailure message={error || 'Unable to load the latest assets. Retry the library request.'} onRetry={() => void loadMedia()} canRetry={canView} /> : null}

                {mediaLibraryResultVisible(canView, isLoading, libraryLoadFailed) && filteredMedia.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    {filteredMedia.map((item) => {
                      const isPrivateAsset = item.visibility === 'private';
                      const privateSelectionDisabled = isPrivateAsset && !allowPrivateSelection;
                      const isSelecting = selectingMediaId === item.id;
                      const itemSelectDisabledReason = selectingMediaId && !isSelecting
                        ? 'Another media item is being inserted.'
                        : privateSelectionDisabled
                          ? 'Private media requires signed delivery and cannot be inserted directly into public page fields.'
                          : '';
                      const itemSelectActionState = isSelecting
                        ? 'busy'
                        : itemSelectDisabledReason
                          ? 'blocked'
                          : 'ready';
                      const itemSelectActionStatus = isSelecting
                        ? `Inserting ${item.name}.`
                        : itemSelectDisabledReason
                          ? `${item.name} cannot be inserted: ${itemSelectDisabledReason}`
                          : `Insert ${item.name} as ${formatTypeLabel(item.type)}.`;
                      const folderPath = item.organization?.folderPath || (item.folderId ? folderPathById.get(item.folderId) || '' : 'Root');
                      const folderSegments = item.organization?.folderSegments || [];
                      const folderAncestorIds = item.organization?.folderAncestors?.map((folder) => folder.id) || [];
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
                        disabled={Boolean(selectingMediaId) || privateSelectionDisabled}
                        aria-busy={isSelecting ? 'true' : undefined}
                        aria-label={itemSelectActionStatus}
                        aria-describedby={mediaLibraryActionStatusId}
                        aria-disabled={Boolean(selectingMediaId) || privateSelectionDisabled}
                        title={itemSelectDisabledReason || (isPrivateAsset ? 'Private file will be inserted with signed-delivery metadata.' : undefined)}
                        data-testid="media-library-item"
                        data-action-state={itemSelectActionState}
                        data-action-status={itemSelectActionStatus}
                        data-disabled-reason={itemSelectDisabledReason || undefined}
                        data-media-id={item.id}
                        data-media-name={item.name}
                        data-media-type={item.type}
                        data-media-url={item.url}
                        data-media-private-select-disabled={privateSelectionDisabled ? 'true' : 'false'}
                        data-media-private-select-allowed={isPrivateAsset && allowPrivateSelection ? 'true' : 'false'}
                        data-media-scope={item.scope || 'global'}
                        data-media-scope-target-id={item.scopeTargetId || ''}
                        data-media-folder-id={item.folderId || ''}
                        data-media-folder-path={folderPath}
                        data-media-folder-segments={folderSegments.join('/')}
                        data-media-folder-ancestor-ids={folderAncestorIds.join('/')}
                        data-media-organization-schema={item.organization?.schemaVersion || ''}
                        data-media-organization-root={item.organization?.root ? 'true' : 'false'}
                        data-media-organization-missing-folder={item.organization?.missingFolder ? 'true' : 'false'}
                        data-media-tags={(item.tags || []).join(',')}
                        data-media-tag-count={item.tags?.length || 0}
                        data-insert-preset={insertSizePreset}
                        data-image-object-fit={imageObjectFit}
                        data-image-focal-x={imageFocalX}
                        data-image-focal-y={imageFocalY}
                        className={cn(
                          'group relative overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30',
                          (privateSelectionDisabled || selectingMediaId) && 'cursor-not-allowed opacity-65 hover:translate-y-0 hover:border-border hover:shadow-sm'
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
                          <span className="block text-xs font-semibold text-primary">{isSelecting ? 'Inserting…' : privateSelectionDisabled ? 'Private asset' : 'Insert'}</span>
                        </div>
                      </button>
                    );
                    })}
                  </div>
                ) : null}

                {mediaLibraryResultVisible(canView, isLoading, libraryLoadFailed) && filteredMedia.length === 0 ? (
                  <div className="min-h-[360px]">
                    <EmptyState
                      icon={ImageIcon}
                      title="No media matches this view"
                      description="Upload assets to this site or clear filters to attach existing files."
                      action={(
                        <div className="flex flex-wrap justify-center gap-2">
                          {isLibraryFilterActive ? (
                            <button
                              type="button"
                              onClick={clearLibraryFilters}
                              data-testid="media-library-empty-clear-filters"
                              {...getLibraryFilterActionProps('Clear active media library filters from the empty state.', clearLibraryFiltersDisabledReason)}
                              data-library-filter-active="true"
                              className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
                            >
                              Clear filters
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => canCreate && setActiveTab('upload')}
                            disabled={!canCreate}
                            title={uploadControlDisabledReason || undefined}
                            data-testid="media-library-empty-upload-assets"
                            data-action-state={canCreate ? 'ready' : 'blocked'}
                            data-action-status={canCreate ? 'Switch to upload assets.' : `Upload unavailable: ${createDisabledReason}`}
                            data-disabled-reason={canCreate ? undefined : createDisabledReason}
                            aria-describedby={mediaLibraryActionStatusId}
                            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Upload assets
                          </button>
                        </div>
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
                      {(['all', 'global', 'page', 'post'] as const).map((scope) => {
                        const unavailable = (scope === 'page' || scope === 'post') && (targetScope !== scope || !targetId);
                        const guidance = unavailable ? `Open a ${scope} to filter its linked files.` : '';
                        const label = scope === 'all' ? 'All website files' : scope === 'global' ? 'Global' : `Current ${scope}`;
                        return (
                        <button
                          key={scope}
                          type="button"
                          onClick={() => { if (!unavailable) setScopeFilter(scope); }}
                          disabled={unavailable}
                          title={guidance || undefined}
                          aria-label={label}
                          data-testid={`media-library-scope-${scope}`}
                          aria-pressed={scopeFilter === scope}
                          data-target-media-scope={scope}
                          data-library-result-count={filteredMedia.length}
                          {...getLibraryFilterActionProps(
                            `Show ${label}; ${filteredMedia.length} assets currently shown.`,
                            guidance,
                            scopeFilter === scope,
                          )}
                          className={cn(
                            'min-h-9 rounded-lg border px-3 text-xs font-medium capitalize transition-colors',
                            scopeFilter === scope
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                          )}
                        >
                          {label}
                        </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="mt-5 space-y-2">
                  <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Folder</div>
                  <select
                    value={libraryFolderFilter}
                    onChange={(event) => setLibraryFolderFilter(event.target.value)}
                    data-testid="media-library-folder-filter"
                    {...getLibraryFilterActionProps(
                      libraryFolderFilter === 'all'
                        ? `Show media from all folders; ${filteredMedia.length} assets currently shown.`
                        : libraryFolderFilter === 'root'
                          ? `Show root-library media only; ${filteredMedia.length} assets currently shown.`
                          : `Show media from ${folderPathById.get(libraryFolderFilter) || 'selected folder'}${includeNestedFolders ? ' including nested folders' : ''}; ${filteredMedia.length} assets currently shown.`,
                    )}
                    data-target-folder-id={libraryFolderFilter}
                    data-include-nested-folders={includeNestedFolders ? 'true' : 'false'}
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
                      {...getLibraryFilterActionProps(
                        includeNestedFolders
                          ? 'Nested folders are included for the selected folder.'
                          : 'Nested folders are excluded for the selected folder.',
                        includeNestedFoldersDisabledReason,
                        includeNestedFolders,
                      )}
                      data-target-folder-id={libraryFolderFilter}
                      data-include-nested-folders={includeNestedFolders ? 'true' : 'false'}
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

                {showCanvasInsertionControls && <div className="mt-5 rounded-lg border border-border bg-background p-3" data-testid="media-library-insert-controls">
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
                      {...getLibrarySelectionActionProps(`Library image insertion size preset is ${insertSizePreset}.`)}
                      {...librarySelectionTargetMetadata}
                      data-image-insert-preset={insertSizePreset}
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
                      {...getLibrarySelectionActionProps(`Library image object fit defaults to ${imageObjectFit}.`)}
                      {...librarySelectionTargetMetadata}
                      data-image-object-fit={imageObjectFit}
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
                        {...getLibrarySelectionActionProps(`Library image focal X defaults to ${imageFocalX} percent.`)}
                        {...librarySelectionTargetMetadata}
                        data-image-focal-x={imageFocalX}
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
                        {...getLibrarySelectionActionProps(`Library image focal Y defaults to ${imageFocalY} percent.`)}
                        {...librarySelectionTargetMetadata}
                        data-image-focal-y={imageFocalY}
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                      />
                    </label>
                  </div>
                  {renderFocalPreview('media-library-focal-preview', focalPreviewAsset)}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Image selections pass focal point and fit metadata into the editor instead of forcing a generic center crop.
                  </p>
                </div>}

                {(allowedTypes === 'any' || allowedTypes === 'font') ? (
                  <div
                    className="mt-5 rounded-lg border border-border bg-background p-3"
                    data-testid="media-library-font-controls"
                    {...getLibrarySelectionActionProps(
                      `Library font registration defaults to ${fontWeight || '400'} ${fontStyle}, ${fontDisplay} display, fallback ${fontFallback || 'system-ui, sans-serif'}.`,
                    )}
                    {...librarySelectionTargetMetadata}
                    data-font-weight={fontWeight}
                    data-font-style={fontStyle}
                    data-font-display={fontDisplay}
                    data-font-fallback={fontFallback}
                  >
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
                          {...getLibrarySelectionActionProps(`Library font weight defaults to ${fontWeight || '400'}.`)}
                          {...librarySelectionTargetMetadata}
                          data-font-weight={fontWeight}
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
                          {...getLibrarySelectionActionProps(`Library font style defaults to ${fontStyle}.`)}
                          {...librarySelectionTargetMetadata}
                          data-font-style={fontStyle}
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
                        {...getLibrarySelectionActionProps(`Library font fallback stack defaults to ${fontFallback || 'system-ui, sans-serif'}.`)}
                        {...librarySelectionTargetMetadata}
                        data-font-fallback={fontFallback}
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
                        {...getLibrarySelectionActionProps(`Library font display defaults to ${fontDisplay}.`)}
                        {...librarySelectionTargetMetadata}
                        data-font-display={fontDisplay}
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
                        if (isUploading || Boolean(uploadControlDisabledReason)) return;
                        setUploadFilter(filter);
                      }}
                      disabled={isUploading || Boolean(uploadControlDisabledReason)}
                      title={uploadControlDisabledReason || undefined}
                      data-testid={`media-upload-filter-${filter}`}
                      aria-pressed={uploadFilter === filter}
                      {...getUploadControlActionProps(getUploadFilterActionStatus(filter), {
                        disabledReason: uploadBusyDisabledReason,
                        selected: uploadFilter === filter,
                        busy: isUploading,
                      })}
                      data-target-upload-filter={filter}
                      data-upload-visibility={uploadVisibility}
                      data-upload-folder-id={uploadFolderId}
                      data-upload-folder-label={uploadFolderLabel}
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
                    (isUploading || Boolean(uploadControlDisabledReason)) && 'cursor-not-allowed opacity-75 hover:border-border'
                  )}
                  onDragEnter={() => {
                    if (!isUploading && !uploadControlDisabledReason) {
                      setDragActive(true);
                    }
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDragOver={(e) => {
                    if (!isUploading && !uploadControlDisabledReason) {
                      e.preventDefault();
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    if (isUploading || Boolean(uploadControlDisabledReason)) return;
                    void handleFileUpload(e.dataTransfer.files, uploadFilter);
                  }}
                  data-testid="media-upload-dropzone"
                  data-uploading={isUploading ? 'true' : 'false'}
                  {...getUploadControlActionProps(uploadDropzoneActionStatus, {
                    disabledReason: uploadBusyDisabledReason,
                    busy: isUploading,
                  })}
                  {...uploadDefaultsTargetMetadata}
                >
                  <input
                    type="file"
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    multiple
                    disabled={isUploading || Boolean(uploadControlDisabledReason)}
                    title={uploadControlDisabledReason || undefined}
                    accept={getAcceptValue(uploadFilter)}
                    data-testid="media-upload-input"
                    {...getUploadControlActionProps(uploadDropzoneActionStatus, {
                      disabledReason: uploadBusyDisabledReason,
                      busy: isUploading,
                    })}
                    {...uploadDefaultsTargetMetadata}
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
                      disabled={isUploading || Boolean(uploadControlDisabledReason)}
                      title={uploadControlDisabledReason || undefined}
                      data-testid="media-upload-visibility"
                      {...getUploadControlActionProps(
                        `Set uploaded asset delivery to ${uploadVisibility}.`,
                        { disabledReason: uploadBusyDisabledReason, busy: isUploading },
                      )}
                      {...uploadDefaultsTargetMetadata}
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
                      disabled={isUploading || Boolean(uploadControlDisabledReason)}
                      title={uploadControlDisabledReason || undefined}
                      data-testid="media-upload-folder"
                      {...getUploadControlActionProps(
                        `Set upload folder to ${uploadFolderLabel}.`,
                        { disabledReason: uploadBusyDisabledReason, busy: isUploading },
                      )}
                      {...uploadDefaultsTargetMetadata}
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
                          disabled={Boolean(replacementUploadDisabledReason)}
                          title={uploadControlDisabledReason || undefined}
                          accept={getAcceptValue(uploadFilter)}
                          data-testid="media-library-replace-input"
                          {...getUploadControlActionProps(
                            replaceAsset
                              ? `Choose a replacement file for ${replaceAsset.name}; the existing media id will be retained.`
                              : `Choose a replacement file; the existing media id will be retained.`,
                            { disabledReason: replacementUploadDisabledReason, busy: isReplacing || isUploading },
                          )}
                          data-target-replace-asset-id={replaceAssetId || ''}
                          data-target-upload-filter={uploadFilter}
                          data-current-media-id={replaceAsset?.id || replaceAssetId || ''}
                          data-current-media-name={replaceAsset?.name || ''}
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
                      disabled={isUploading || Boolean(uploadControlDisabledReason)}
                      testId="media-upload-tags"
                      inputTestId="media-upload-tags-input"
                      ariaDescribedBy={mediaLibraryActionStatusId}
                      actionState={uploadTagsActionState}
                      actionStatus={uploadTagsActionStatus}
                      disabledReason={uploadTagsDisabledReason}
                    />
                  </div>

                  {showCanvasInsertionControls && <div className="rounded-lg border border-border bg-background p-3" data-testid="media-upload-image-defaults">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Crop className="h-3.5 w-3.5" />
                      Image insertion defaults
                    </div>
                    <label className="mt-3 block space-y-1 text-xs font-medium text-muted-foreground">
                      Size preset
                      <select
                        value={insertSizePreset}
                        onChange={(event) => setInsertSizePreset(event.target.value as MediaInsertSizePreset)}
                        disabled={isUploading || Boolean(uploadControlDisabledReason)}
                        data-testid="media-upload-insert-preset"
                        {...getUploadControlActionProps(
                          `Image insertion size preset is ${insertSizePreset}.`,
                          { disabledReason: uploadBusyDisabledReason, busy: isUploading },
                        )}
                        {...uploadDefaultsTargetMetadata}
                        data-image-insert-preset={insertSizePreset}
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
                          disabled={isUploading || Boolean(uploadControlDisabledReason)}
                          data-testid="media-upload-image-fit"
                          {...getUploadControlActionProps(
                            `Image object fit defaults to ${imageObjectFit}.`,
                            { disabledReason: uploadBusyDisabledReason, busy: isUploading },
                          )}
                          {...uploadDefaultsTargetMetadata}
                          data-image-object-fit={imageObjectFit}
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
                          disabled={isUploading || Boolean(uploadControlDisabledReason)}
                          data-testid="media-upload-focal-x"
                          {...getUploadControlActionProps(
                            `Image focal X defaults to ${imageFocalX} percent.`,
                            { disabledReason: uploadBusyDisabledReason, busy: isUploading },
                          )}
                          {...uploadDefaultsTargetMetadata}
                          data-image-focal-x={imageFocalX}
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
                          disabled={isUploading || Boolean(uploadControlDisabledReason)}
                          data-testid="media-upload-focal-y"
                          {...getUploadControlActionProps(
                            `Image focal Y defaults to ${imageFocalY} percent.`,
                            { disabledReason: uploadBusyDisabledReason, busy: isUploading },
                          )}
                          {...uploadDefaultsTargetMetadata}
                          data-image-focal-y={imageFocalY}
                          className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </label>
                    </div>
                    {renderFocalPreview('media-upload-focal-preview', replaceAsset?.type === 'image' ? replaceAsset : null)}
                  </div>}

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
                            disabled={isUploading || Boolean(uploadControlDisabledReason)}
                            data-testid="media-upload-font-weight"
                            {...getUploadControlActionProps(
                              `Font upload weight defaults to ${fontWeight || '400'}.`,
                              { disabledReason: uploadBusyDisabledReason, busy: isUploading },
                            )}
                            {...uploadDefaultsTargetMetadata}
                            data-font-weight={fontWeight}
                            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        </label>
                        <label className="space-y-1 text-xs font-medium text-muted-foreground">
                          Display
                          <select
                            value={fontDisplay}
                            onChange={(event) => setFontDisplay(event.target.value as FontDisplayMode)}
                            disabled={isUploading || Boolean(uploadControlDisabledReason)}
                            data-testid="media-upload-font-display"
                            {...getUploadControlActionProps(
                              `Font display defaults to ${fontDisplay}.`,
                              { disabledReason: uploadBusyDisabledReason, busy: isUploading },
                            )}
                            {...uploadDefaultsTargetMetadata}
                            data-font-display={fontDisplay}
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
                          disabled={isUploading || Boolean(uploadControlDisabledReason)}
                          data-testid="media-upload-font-fallback"
                          {...getUploadControlActionProps(
                            `Font fallback stack defaults to ${fontFallback || 'system-ui, sans-serif'}.`,
                            { disabledReason: uploadBusyDisabledReason, busy: isUploading },
                          )}
                          {...uploadDefaultsTargetMetadata}
                          data-font-fallback={fontFallback}
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
