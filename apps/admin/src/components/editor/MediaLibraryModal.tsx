import { useEffect, useMemo, useState } from 'react';
import { X, Upload, Image as ImageIcon, Film } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore, type MediaAsset } from '@/stores/mockStore';

type AllowedType = 'image' | 'video' | 'file' | 'any';
type MediaScopeFilter = 'all' | 'global' | 'page' | 'post';
type UploadFilter = 'all' | 'image' | 'video' | 'file';
type MediaLibraryTab = 'library' | 'upload';

export interface MediaContext {
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
  const addMedia = useStore((state) => state.addMedia);
  const [activeTab, setActiveTab] = useState<MediaLibraryTab>('library');
  const [uploadFilter, setUploadFilter] = useState<UploadFilter>('all');
  const [dragActive, setDragActive] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<MediaScopeFilter>(mediaContext?.scope || 'all');

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setActiveTab(initialTab || 'library');
    setUploadFilter(
      initialUploadFilter && ['all', 'image', 'video', 'file'].includes(initialUploadFilter)
        ? initialUploadFilter
        : 'all'
    );
  }, [initialTab, initialUploadFilter, isOpen]);

  const allowedTypesSet = useMemo(() => {
    if (allowedTypes === 'any') return new Set(['image', 'video', 'file']);
    if (allowedTypes === 'file') return new Set(['file']);
    return new Set([allowedTypes]);
  }, [allowedTypes]);

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

  const filteredMedia = useMemo(
    () =>
      normalized.filter((item) => {
        if (!allowedTypesSet.has(item.type)) return false;
        return mediaContextFilter(item as MediaAsset & { scope: 'global' | 'page' | 'post'; scopeTargetId: string | null });
      }),
    [allowedTypesSet, mediaContextFilter, normalized, scopeFilter, targetScope]
  );

  const formatScopeLabel = (item: MediaAsset & { scope?: 'global' | 'page' | 'post'; scopeTargetId: string | null }) => {
    const scope = item.scope || 'global';
    if (scope === 'global') return 'Global';
    return `${scope === 'page' ? 'Page' : 'Post'}${item.scopeTargetId ? ` • ${item.scopeTargetId}` : ''}`;
  };

  const handleFileUpload = (files: FileList | null, filterHint: UploadFilter) => {
    if (!files || files.length === 0) return;

    const shouldKeepFile = (file: File) => {
      if (filterHint === 'all') return true;
      if (filterHint === 'image') return file.type.startsWith('image/');
      if (filterHint === 'video') return file.type.startsWith('video/');
      return !file.type.startsWith('image/') && !file.type.startsWith('video/');
    };

    Array.from(files).forEach((file) => {
      const resolvedType = file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('video/')
          ? 'video'
          : 'file';

      if (!shouldKeepFile(file)) return;
      if (!['image', 'video', 'file'].includes(resolvedType)) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        const scope = (targetScope || 'global') as 'global' | 'page' | 'post';

        addMedia({
          name: file.name,
          type: resolvedType,
          size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
          url: result,
          scope,
          scopeTargetId: targetId || null,
          visibility: 'public',
          uploadedBy: 'admin',
          targetPageIds: scope === 'page' && targetId ? [targetId] : [],
          targetPostIds: scope === 'post' && targetId ? [targetId] : [],
        });
      };
      reader.readAsDataURL(file);
    });

    setActiveTab('library');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-background w-full max-w-3xl rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold">Media Library</h2>
            {targetLabel ? (
              <p className="text-xs text-muted-foreground mt-0.5">
                Context: {targetLabel}
              </p>
            ) : null}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-full" type="button">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex p-2 gap-2 border-b border-border bg-muted/20">
          <button
            type="button"
            onClick={() => setActiveTab('library')}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-md transition-colors',
              activeTab === 'library' ? 'bg-background shadow text-primary' : 'hover:bg-background/50 text-muted-foreground'
            )}
          >
            Library
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-md transition-colors',
              activeTab === 'upload' ? 'bg-background shadow text-primary' : 'hover:bg-background/50 text-muted-foreground'
            )}
          >
            Upload
          </button>
        </div>

        {allowScopeSwitcher && activeTab === 'library' ? (
          <div className="px-2 pt-2 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Scope</span>
            {(['all', 'global', 'page', 'post'] as const).map((scope) => (
              <button
                key={scope}
                type="button"
                onClick={() => setScopeFilter(scope)}
                className={cn(
                  'px-2 py-1 text-[11px] rounded-full border transition-colors',
                  scopeFilter === scope
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-accent/50 border-border'
                )}
              >
                {scope.toUpperCase()}
              </button>
            ))}
          </div>
        ) : null}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 min-h-[400px]">
          {activeTab === 'library' ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {filteredMedia.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelect(item);
                    onClose();
                  }}
                  className="group relative aspect-square rounded-lg border border-border overflow-hidden hover:ring-2 hover:ring-primary focus:outline-none"
                >
                  {item.type === 'image' ? (
                    <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <Film className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-white text-xs font-medium">{item.name}</span>
                  </div>
                  {allowStatusLabels ? (
                    <div className="absolute left-2 top-2 flex items-center gap-1 flex-wrap">
                      <span className="px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] uppercase">{item.type}</span>
                      <span className="px-2 py-0.5 rounded-full bg-black/50 text-white text-[10px]">
                        {formatScopeLabel(item)}
                      </span>
                    </div>
                  ) : null}
                  <div className="absolute bottom-2 right-2 flex flex-col items-end gap-1">
                    <span className="px-2 py-0.5 rounded bg-white/80 text-[10px] text-black">
                      {item.size}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-black/60 text-white text-[10px]">
                      {item.visibility || 'public'}
                    </span>
                  </div>
                </button>
              ))}

              {filteredMedia.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <ImageIcon className="w-12 h-12 mb-2 opacity-50" />
                  <p>No media found</p>
                  <p className="text-xs mt-1">Upload files to this scope and then attach them.</p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                {(['all', 'image', 'video', 'file'] as const).map((filter) => (
                  <button
                    type="button"
                    key={filter}
                    onClick={() => setUploadFilter(filter)}
                    className={cn(
                      'px-2 py-1 text-xs rounded-full border transition-colors',
                      uploadFilter === filter
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-accent/50 border-border'
                    )}
                  >
                    {filter}
                  </button>
                ))}
              </div>
              <div
                className={cn(
                  'h-full border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-colors relative',
                  dragActive ? 'border-primary bg-primary/5' : 'border-border'
                )}
                onDragEnter={() => setDragActive(true)}
                onDragLeave={() => setDragActive(false)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  handleFileUpload(e.dataTransfer.files, uploadFilter);
                }}
              >
                <input
                  type="file"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  multiple
                  onChange={(e) => handleFileUpload(e.target.files, uploadFilter)}
                />
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4 pointer-events-none">
                  <Upload className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-1 pointer-events-none">Drag & Drop files here</h3>
                <p className="text-sm text-muted-foreground mb-4 pointer-events-none">
                  or click to browse
                </p>
                <button
                  type="button"
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm font-medium pointer-events-none"
                >
                  Choose Files
                </button>
                {targetLabel ? (
                  <p className="text-xs text-muted-foreground mt-3 pointer-events-none">
                    Upload target: {targetLabel}
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
