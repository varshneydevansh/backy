import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createMediaFolder, getDefaultMediaSiteId, listMedia, listMediaFolders, uploadMedia, type MediaFolder } from '@/lib/mediaApi';
import { useStore, type MediaAsset } from '@/stores/mockStore';
import { parseTagInput, serializeTagValues, TagInput } from '@/components/ui/TagInput';

type AllowedType = 'image' | 'video' | 'audio' | 'file' | 'font' | 'other' | 'any';
type MediaScopeFilter = 'all' | 'global' | 'page' | 'post';
type UploadFilter = 'all' | 'image' | 'video' | 'audio' | 'file' | 'font' | 'other';
type MediaLibraryTab = 'library' | 'upload';

export interface MediaContext {
  siteId?: string;
  scope?: 'global' | 'page' | 'post';
  targetId?: string;
  targetLabel?: string;
}

interface MediaLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (media: MediaAsset) => void;
  allowedTypes?: AllowedType;
  mediaContext?: MediaContext;
  allowScopeSwitcher?: boolean;
  allowStatusLabels?: boolean;
  initialTab?: MediaLibraryTab;
  initialUploadFilter?: UploadFilter;
}

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
  const [uploadTags, setUploadTags] = useState('');
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<MediaScopeFilter>(mediaContext?.scope || 'all');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setActiveTab(initialTab || 'library');
    setUploadFilter(
      initialUploadFilter && ['all', 'image', 'video', 'audio', 'file', 'font', 'other'].includes(initialUploadFilter)
        ? initialUploadFilter
        : 'all'
    );
    setLibraryTypeFilter('all');
    setLibraryFolderFilter('all');
    setIncludeNestedFolders(true);
    setNewFolderName('');
    setSearchQuery('');
  }, [initialTab, initialUploadFilter, isOpen]);

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
  }, [folderPathById, libraryFolderFilter, uploadFolderId]);

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
    setIsLoading(true);
    setError(null);

    try {
      const [loaded, loadedFolders] = await Promise.all([
        listMedia({
          siteId,
          limit: 100,
          pageId: targetScope === 'page' ? targetId : undefined,
          postId: targetScope === 'post' ? targetId : undefined,
        }),
        listMediaFolders(siteId),
      ]);
      setMedia(loaded);
      setFolders(loadedFolders);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load media library');
    } finally {
      setIsLoading(false);
    }
  }, [setMedia, siteId, targetId, targetScope]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    void loadMedia();
  }, [isOpen, loadMedia]);

  const filteredMedia = useMemo(
    () =>
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
    [allowedTypesSet, libraryFolderFilter, libraryFolderIds, libraryTypeFilter, mediaContextFilter, normalized, searchQuery, scopeFilter, targetScope]
  );

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

  const handleCreateFolder = async () => {
    if (isCreatingFolder || isUploading) return;

    const name = newFolderName.trim();
    if (!name) {
      setError('Enter a folder name before creating a media folder.');
      return;
    }

    const duplicate = folderOptions.some((folder) => folder.path.toLowerCase() === name.toLowerCase() || folder.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
      setError(`A media folder named "${name}" already exists.`);
      return;
    }

    setIsCreatingFolder(true);
    setError(null);

    try {
      const folder = await createMediaFolder(name, siteId);
      setFolders((current) => [...current.filter((item) => item.id !== folder.id), folder]);
      setUploadFolderId(folder.id);
      setLibraryFolderFilter(folder.id);
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
      <div className="mt-2 flex gap-2">
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
          disabled={isUploading || isCreatingFolder}
          data-testid="media-library-create-folder-name"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
          placeholder="Campaign assets"
        />
        <button
          type="button"
          onClick={() => void handleCreateFolder()}
          disabled={isUploading || isCreatingFolder || !newFolderName.trim()}
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
    const uploaded: MediaAsset[] = [];
    const failed: unknown[] = [];

    for (const file of acceptedFiles) {
      const resolvedType = getUploadType(file);

      try {
        const uploadedItem = await uploadMedia(file, {
          siteId,
          scope: targetScope,
          scopeTargetId: targetId || null,
          visibility: uploadVisibility,
          folderId: uploadFolderId === 'root' ? null : uploadFolderId,
          fontFamily: resolvedType === 'font' ? cleanFontFamilyFromFilename(file.name) : undefined,
          fontWeight: resolvedType === 'font' ? '400' : undefined,
          fontStyle: resolvedType === 'font' ? 'normal' : undefined,
          tags: resolvedType === 'font'
            ? Array.from(new Set(['font', ...uploadTagList]))
            : uploadTagList.length ? uploadTagList : undefined,
        });
        uploaded.push(uploadedItem);
      } catch (uploadError) {
        failed.push(uploadError);
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
                  onClick={() => setActiveTab(tab)}
                  data-testid={`media-library-tab-${tab}`}
                  className={cn(
                    'min-h-9 rounded-md px-4 text-sm font-medium capitalize transition-colors',
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
                    {filteredMedia.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          onSelect(item);
                          onClose();
                        }}
                        data-testid="media-library-item"
                        data-media-id={item.id}
                        data-media-name={item.name}
                        data-media-type={item.type}
                        data-media-url={item.url}
                        data-media-scope={item.scope || 'global'}
                        data-media-scope-target-id={item.scopeTargetId || ''}
                        data-media-folder-id={item.folderId || ''}
                        className="group relative overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        <div className="aspect-[4/3] overflow-hidden bg-muted">
                          {renderMediaThumb(item)}
                        </div>
                        <div className="space-y-2 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0 truncate text-sm font-medium text-foreground">{item.name}</span>
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-primary opacity-0 transition group-hover:opacity-100" />
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
                    ))}
                  </div>
                ) : null}

                {!isLoading && filteredMedia.length === 0 ? (
                  <div className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-6 text-center text-muted-foreground">
                    <ImageIcon className="mb-3 h-10 w-10 opacity-60" />
                    <p className="text-sm font-medium text-foreground">No media matches this view</p>
                    <p className="mt-1 max-w-sm text-sm">
                      Upload assets to this site or clear filters to attach existing files.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('upload')}
                      className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
                    >
                      Upload assets
                    </button>
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
                        if (isUploading) return;
                        setUploadFilter(filter);
                      }}
                      disabled={isUploading}
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
                    isUploading && 'cursor-not-allowed opacity-75 hover:border-border'
                  )}
                  onDragEnter={() => {
                    if (!isUploading) {
                      setDragActive(true);
                    }
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDragOver={(e) => {
                    if (!isUploading) {
                      e.preventDefault();
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    if (isUploading) return;
                    void handleFileUpload(e.dataTransfer.files, uploadFilter);
                  }}
                  data-testid="media-upload-dropzone"
                  data-uploading={isUploading ? 'true' : 'false'}
                >
                  <input
                    type="file"
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    multiple
                    disabled={isUploading}
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
                      disabled={isUploading}
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
                      disabled={isUploading}
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
                      disabled={isUploading}
                    />
                  </div>

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
