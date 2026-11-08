import { Button } from '@/components/ui/Button';
import type { MediaUploadRow, MediaUploadStatus } from '@/lib/mediaUploadBatch';
import { formatBytes } from '@/lib/utils';

const labels: Record<MediaUploadStatus, string> = {
  queued: 'Queued', uploading: 'Uploading and scanning', saved: 'Saved',
  failed: 'Needs review', skipped: 'Skipped', stopped: 'Not started',
};

export function MediaUploadQueue({ rows, active, stopping, onStop }: {
  rows: MediaUploadRow[]; active: boolean; stopping: boolean; onStop: () => void;
}) {
  if (!rows.length) return null;
  const finished = rows.filter(row => row.status !== 'queued' && row.status !== 'uploading').length;
  const saved = rows.filter(row => row.status === 'saved').length;
  const queued = rows.filter(row => row.status === 'queued').length;
  return (
    <section className="mb-4 overflow-hidden rounded-lg border border-border bg-card" aria-label="Upload queue" data-testid="media-upload-queue">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">{active ? 'Upload queue' : 'Upload results'}</h3>
          <p className="mt-1 text-xs text-muted-foreground" role="status" aria-live="polite">
            {finished} of {rows.length} files processed · {saved} saved
          </p>
        </div>
        {active && queued > 0 && (
          <Button onClick={onStop} disabled={stopping}>
            {stopping ? 'Stopping after current file' : 'Stop pending uploads'}
          </Button>
        )}
      </div>
      <progress className="block h-1 w-full accent-primary" value={finished} max={rows.length} aria-label="Files processed" />
      {stopping && active && <p className="border-b border-border px-4 py-3 text-xs text-muted-foreground">The current upload will finish. Remaining files will not start.</p>}
      <ul className="max-h-64 divide-y divide-border overflow-y-auto">
        {rows.map(row => (
          <li key={row.id} className="flex items-start justify-between gap-4 px-4 py-3" data-upload-status={row.status}>
            <div className="min-w-0">
              <p className="break-words text-sm font-medium">{row.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{formatBytes(row.bytes)}</p>
              {row.message && <p className="mt-1 break-words text-xs text-muted-foreground">{row.message}</p>}
            </div>
            <span className={`shrink-0 text-xs font-medium ${row.status === 'saved' ? 'text-primary' : row.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}>
              {labels[row.status]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
