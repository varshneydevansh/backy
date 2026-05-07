/**
 * BACKY CMS - MEDIA PAGE
 */

import { useCallback, useEffect, useState, type DragEvent } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Edit3, File, Image as ImageIcon, Save, Trash2, Upload, X } from 'lucide-react';
import { PageShell } from '@/components/layout/PageShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { deleteMediaFromBackend, getDefaultMediaSiteId, listMedia, updateMedia, uploadMedia } from '@/lib/mediaApi';
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
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [metadataForm, setMetadataForm] = useState({
    name: '',
    altText: '',
    caption: '',
    tags: '',
    visibility: 'public' as 'public' | 'private',
  });
  const files = useStore((state) => state.media);
  const addMedia = useStore((state) => state.addMedia);
  const setMedia = useStore((state) => state.setMedia);
  const deleteMedia = useStore((state) => state.deleteMedia);
  const siteId = getDefaultMediaSiteId();

  const loadLibrary = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const backendFiles = await listMedia({ siteId, scope: 'all', limit: 250 });
      setMedia(backendFiles);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load media library.');
    } finally {
      setIsLoading(false);
    }
  }, [setMedia, siteId]);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  const openMetadataEditor = (asset: MediaAsset) => {
    setSelectedAsset(asset);
    setMetadataForm({
      name: asset.name,
      altText: asset.altText || '',
      caption: asset.caption || '',
      tags: (asset.tags || []).join(', '),
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
          <div className="w-full max-w-xl rounded-xl border border-border bg-background shadow-xl">
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

            <div className="grid gap-5 p-5 md:grid-cols-[180px_1fr]">
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
