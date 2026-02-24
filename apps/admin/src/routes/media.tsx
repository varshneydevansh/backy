/**
 * BACKY CMS - MEDIA PAGE
 */

import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Upload, Image as ImageIcon, File, Trash2 } from 'lucide-react';
import { PageShell } from '@/components/layout/PageShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils'; // Assuming bytes formatting is in utils, or inline it
import { useStore } from '@/stores/mockStore';

export const Route = createFileRoute('/media')({
  component: MediaPage,
});

function MediaPage() {
  const [isDragging, setIsDragging] = useState(false);
  const files = useStore((state) => state.media);
  const addMedia = useStore((state) => state.addMedia);
  const deleteMedia = useStore((state) => state.deleteMedia);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileUpload = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    Array.from(fileList).forEach(file => {
      const mediaType = file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('video/')
          ? 'video'
          : 'file';

      if (mediaType === 'file') {
        addMedia({
          name: file.name,
          type: 'file',
          size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
          url: '',
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;

        addMedia({
          name: file.name,
          type: mediaType,
          size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
          url: result,
        });
      };
      reader.readAsDataURL(file);
    });
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
            onChange={(e) => handleFileUpload(e.target.files)}
          />
          <label
            htmlFor="header-upload"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            Upload
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
          handleFileUpload(e.dataTransfer.files);
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
          onChange={(e) => handleFileUpload(e.target.files)}
        />
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 pointer-events-none">
          <Upload className="w-6 h-6 text-primary" />
        </div>
        <h3 className="font-semibold mb-1 pointer-events-none">Upload Files</h3>
        <p className="text-sm text-muted-foreground pointer-events-none">Drag and drop files here or click to browse</p>
      </div>

      {files.length > 0 ? (
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
                  <button className="p-2 bg-white rounded-lg text-red-600 hover:bg-red-50" onClick={() => {
                    deleteMedia(file.id);
                  }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Info */}
              <div className="p-3">
                <p className="font-medium text-sm truncate" title={file.name}>{file.name}</p>
                <p className="text-xs text-muted-foreground">{file.size}</p>
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
    </PageShell>
  );
}
