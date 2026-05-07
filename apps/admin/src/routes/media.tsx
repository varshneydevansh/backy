/**
 * BACKY CMS - MEDIA PAGE
 */

import { useCallback, useEffect, useState, type DragEvent } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Edit3, File, FileText, Folder, FolderPlus, Image as ImageIcon, Layout, Save, Trash2, Upload, X } from 'lucide-react';
import { PageShell } from '@/components/layout/PageShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { listBlogPosts, listPages } from '@/lib/adminContentApi';
import {
  createMediaFolder,
  deleteMediaFolder,
  deleteMediaFromBackend,
  getDefaultMediaSiteId,
  listMedia,
  listMediaFolders,
  updateMedia,
  uploadMedia,
  type MediaFolder,
} from '@/lib/mediaApi';
import { cn } from '@/lib/utils';
import { useStore, type MediaAsset } from '@/stores/mockStore';

export const Route = createFileRoute('/media')({
  component: MediaPage,
});

function MediaPage() {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | MediaAsset['type']>('all');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'public' | 'private'>('all');
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null | undefined>(undefined);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [metadataForm, setMetadataForm] = useState({
    name: '',
    altText: '',
    caption: '',
    tags: '',
    folderId: '',
    visibility: 'public' as 'public' | 'private',
  });
  const files = useStore((state) => state.media);
  const pages = useStore((state) => state.pages);
  const posts = useStore((state) => state.posts);
  const addMedia = useStore((state) => state.addMedia);
  const setMedia = useStore((state) => state.setMedia);
  const setPages = useStore((state) => state.setPages);
  const setPosts = useStore((state) => state.setPosts);
  const deleteMedia = useStore((state) => state.deleteMedia);
  const siteId = getDefaultMediaSiteId();

  const loadLibrary = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const backendFiles = await listMedia({
        siteId,
        scope: 'all',
        limit: 250,
        search: searchQuery.trim() || undefined,
        type: typeFilter === 'file' ? 'document' : typeFilter === 'all' ? undefined : typeFilter,
        visibility: visibilityFilter === 'all' ? undefined : visibilityFilter,
        folderId: selectedFolderId,
      });
      setMedia(backendFiles);
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
    setMetadataForm({
      name: asset.name,
      altText: asset.altText || '',
      caption: asset.caption || '',
      tags: (asset.tags || []).join(', '),
      folderId: asset.folderId || '',
      visibility: asset.visibility || 'public',
    });
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const getFallbackType = (file: File): MediaAsset['type'] => {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';

    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    if (
      file.type.includes('font') ||
      ['woff', 'woff2', 'ttf', 'otf', 'eot'].includes(extension)
    ) {
      return 'font';
    }

    return 'file';
  };

  const addFallbackMedia = (file: File) => {
    const mediaType = getFallbackType(file);

    if (mediaType === 'file' || mediaType === 'font') {
      addMedia({
        name: file.name,
        type: mediaType,
        size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
        url: '',
        scope: 'global',
        scopeTargetId: null,
        visibility: 'public',
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;

      addMedia({
        name: file.name,
        type: mediaType,
        size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
        url: result,
        scope: 'global',
        scopeTargetId: null,
        visibility: 'public',
      });
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const uploadFiles = Array.from(fileList);

    setIsUploading(true);
    setError(null);

    try {
      const uploaded = await Promise.all(uploadFiles.map((file) => uploadMedia(file, {
        siteId,
        scope: 'global',
        visibility: 'public',
      })));
      setMedia([...uploaded, ...files.filter((file) => !uploaded.some((item) => item.id === file.id))]);
    } catch (uploadError) {
      uploadFiles.forEach(addFallbackMedia);
      setError(uploadError instanceof Error
        ? `${uploadError.message}. Files were added locally for this session.`
        : 'Upload failed. Files were added locally for this session.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteAsset = async (file: MediaAsset) => {
    if (!confirm(`Delete "${file.name}" from the media library?`)) {
      return;
    }

    setError(null);

    try {
      await deleteMediaFromBackend(file.id, siteId);
      deleteMedia(file.id);
      if (selectedAsset?.id === file.id) {
        setSelectedAsset(null);
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete media.');
    }
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
        folderId: metadataForm.folderId || null,
        visibility: metadataForm.visibility,
      }, siteId);
      setMedia(files.map((file) => file.id === updated.id ? updated : file));
      setSelectedAsset(updated);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update media metadata.');
    } finally {
      setIsSavingMetadata(false);
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
      setNewFolderName('');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create folder.');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    const folder = folders.find((item) => item.id === folderId);
    if (!folder || !confirm(`Delete folder "${folder.name}"? Media inside it will move to root.`)) {
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
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete folder.');
    }
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
      description="Manage images and files."
      action={
        <div className="relative">
          <input
            type="file"
            id="header-upload"
            className="hidden"
            multiple
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
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          void handleFileUpload(e.dataTransfer.files);
        }}
        className={cn(
          "mb-8 border-2 border-dashed rounded-xl p-8 text-center transition-all relative",
          isDragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border hover:border-primary/50"
        )}
      >
        <input
          type="file"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          multiple
          disabled={isUploading}
          onChange={(e) => {
            void handleFileUpload(e.target.files);
            e.currentTarget.value = '';
          }}
        />
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 pointer-events-none">
          <Upload className="w-6 h-6 text-primary" />
        </div>
        <h3 className="font-semibold mb-1 pointer-events-none">
          {isUploading ? 'Uploading files' : 'Upload files'}
        </h3>
        <p className="text-sm text-muted-foreground pointer-events-none">
          Images, videos, documents, and fonts are stored in the site media library.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="mb-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Loading media library...
        </div>
      ) : null}

      <div className="mb-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px]">
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="rounded-lg border bg-background px-4 py-2.5"
          placeholder="Search filenames, captions, alt text, or tags"
        />
        <select
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value as 'all' | MediaAsset['type'])}
          className="rounded-lg border bg-background px-4 py-2.5"
        >
          <option value="all">All types</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
          <option value="file">Documents</option>
          <option value="font">Fonts</option>
        </select>
        <select
          value={visibilityFilter}
          onChange={(event) => setVisibilityFilter(event.target.value as 'all' | 'public' | 'private')}
          className="rounded-lg border bg-background px-4 py-2.5"
        >
          <option value="all">All visibility</option>
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
      </div>

      <div className="mb-6 rounded-xl border border-border bg-card p-4">
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
            />
            <button
              type="button"
              disabled={isCreatingFolder || !newFolderName.trim()}
              onClick={() => void handleCreateFolder()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
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
            <div key={folder.id} className="inline-flex overflow-hidden rounded-lg border border-border">
              <button
                type="button"
                onClick={() => setSelectedFolderId(folder.id)}
                className={cn(
                  'px-3 py-2 text-sm',
                  selectedFolderId === folder.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                )}
              >
                {folder.name}
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteFolder(folder.id)}
                className="border-l border-border px-2 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                title="Delete folder"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

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
      ) : files.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {files.map((file) => (
            <div key={file.id} className="group relative bg-card border border-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all">
              {/* Preview */}
              <div className="aspect-square bg-muted flex items-center justify-center relative">
                {file.type === 'image' && file.url ? (
                  <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
                ) : (
                  <File className="w-12 h-12 text-muted-foreground" />
                )}

                {/* Overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    className="p-2 bg-white rounded-lg text-slate-700 hover:bg-slate-100"
                    onClick={() => openMetadataEditor(file)}
                    title="Edit metadata"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    className="p-2 bg-white rounded-lg text-red-600 hover:bg-red-50"
                    onClick={() => {
                      void handleDeleteAsset(file);
                    }}
                    title="Delete media"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Info */}
              <div className="p-3">
                <p className="font-medium text-sm truncate" title={file.name}>{file.name}</p>
                <p className="text-xs text-muted-foreground">{file.size} · {file.visibility || 'public'}</p>
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
          title="Library is empty"
          description="Upload some files to get started."
        />
      )}

      {selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-border bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">Media details</h2>
                <p className="text-sm text-muted-foreground">{selectedAsset.type} · {selectedAsset.size}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAsset(null)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid max-h-[75vh] gap-5 overflow-y-auto p-5 md:grid-cols-[180px_1fr]">
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
                  <input
                    value={metadataForm.tags}
                    onChange={(event) => setMetadataForm((current) => ({ ...current, tags: event.target.value }))}
                    className="w-full rounded-lg border bg-background px-3 py-2"
                    placeholder="hero, product, brand"
                  />
                </div>

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
                <div className="mb-3 flex items-center justify-between">
                  <div className="font-medium">Used in</div>
                  <div className="text-xs text-muted-foreground">
                    {referencedPages.length + referencedPosts.length} references
                  </div>
                </div>

                {referencedPages.length === 0 && referencedPosts.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                    No page or post references are tracked for this asset yet.
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {referencedPages.map(({ id, page }) => (
                      <Link
                        key={`page-${id}`}
                        to="/pages/$pageId/edit"
                        params={{ pageId: id }}
                        className="flex items-start gap-3 rounded-lg border border-border bg-background px-3 py-3 hover:bg-accent"
                      >
                        <Layout className="mt-0.5 h-4 w-4 text-primary" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{page?.title || id}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            Page{page?.slug ? ` /${page.slug}` : ''}
                          </span>
                        </span>
                      </Link>
                    ))}

                    {referencedPosts.map(({ id, post }) => (
                      <Link
                        key={`post-${id}`}
                        to="/blog/$postId"
                        params={{ postId: id }}
                        className="flex items-start gap-3 rounded-lg border border-border bg-background px-3 py-3 hover:bg-accent"
                      >
                        <FileText className="mt-0.5 h-4 w-4 text-primary" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{post?.title || id}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            Post{post?.slug ? ` /blog/${post.slug}` : ''}
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={() => void handleDeleteAsset(selectedAsset)}
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
    </PageShell>
  );
}
