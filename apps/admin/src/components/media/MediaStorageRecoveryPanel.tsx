import { useCallback, useEffect, useRef, useState } from 'react';
import { listMediaStorageRecovery, retryMediaStorageRecovery, type MediaStorageRecoveryJob } from '@/lib/mediaApi';
import { formatBytes } from '@/lib/utils';

export function MediaStorageRecoveryPanel({ siteId, canRetry }: { siteId: string; canRetry: boolean }) {
  const [jobs, setJobs] = useState<MediaStorageRecoveryJob[]>([]), [offset, setOffset] = useState(0), [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const generation = useRef(0);
  const load = useCallback(async (pageOffset: number) => {
    const current = ++generation.current;
    setBusy(true); setMessage('');
    try { const result = await listMediaStorageRecovery(siteId, pageOffset); if (generation.current !== current) return; setJobs(result.jobs); setTotal(result.pagination.total); setOffset(result.pagination.offset); }
    catch (error) { if (generation.current === current) { setJobs([]); setTotal(0); setMessage(error instanceof Error ? error.message : 'Storage recovery is unavailable.'); } }
    finally { if (generation.current === current) setBusy(false); }
  }, [siteId]);
  useEffect(() => { setJobs([]); setOffset(0); setTotal(0); void load(0); return () => { generation.current++; }; }, [load]);
  useEffect(() => {
    const changed = (event: Event) => { if ((event as CustomEvent).detail?.siteId === siteId) void load(0); };
    window.addEventListener('backy:media-storage-changed', changed);
    return () => window.removeEventListener('backy:media-storage-changed', changed);
  }, [siteId, load]);
  const retry = async (jobId: string) => {
    const current = generation.current;
    setBusy(true); setMessage('');
    try { const result = await retryMediaStorageRecovery(siteId, jobId); if (generation.current !== current) return; await load(offset); if (generation.current !== current + 1) return; setMessage(result.status === 'settled' ? `Recovery completed: ${result.deletedFiles} unreferenced files removed; ${result.protectedFiles} live files protected.` : `Recovery remains pending for ${result.remainingFiles} files. Bytes remain reserved; retry after storage access is restored.`); }
    catch (error) { if (generation.current === current) setMessage(error instanceof Error ? error.message : 'Recovery failed; the journal was retained.'); }
    finally { if (generation.current === current || generation.current === current + 1) setBusy(false); }
  };
  return <MediaStorageRecoveryView jobs={jobs} offset={offset} total={total} busy={busy} message={message} canRetry={canRetry} load={load} retry={retry}/>;
}
export function MediaStorageRecoveryView({ jobs, offset, total, busy, message, canRetry, load, retry }: {
  jobs: MediaStorageRecoveryJob[]; offset: number; total: number; busy: boolean; message: string; canRetry: boolean;
  load: (offset: number) => Promise<void>; retry: (jobId: string) => Promise<void>;
}) {
  return <section className="mb-4 rounded-lg border border-border bg-card p-4" aria-label="Storage recovery" data-testid="media-storage-recovery">
    <div className="flex items-center justify-between gap-3"><h2 className="font-medium">Storage recovery</h2><button type="button" className="rounded border border-border px-3 py-1 text-sm focus-ring" disabled={busy} onClick={() => void load(0)}>{busy ? 'Checking…' : 'Refresh'}</button></div>
    <p className="mt-1 text-sm text-muted-foreground">Pending files reserve quota until cleanup is verified. Recovery protects originals, responsive variants and retained versions still in use. Private paths stay on the server.</p>
    {message && <p className="mt-3 text-sm" role="status">{message}</p>}
    {!busy && !message && total === 0 && <p className="mt-3 text-sm text-muted-foreground">No pending storage recovery jobs.</p>}
    {jobs.map(job => <div key={job.jobId} className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"><div className="text-sm"><strong>{job.operation.replace(/-/g, ' ')}</strong> · {job.remainingFiles} files · up to {formatBytes(job.reservedBytes)} reserved<span className="block text-xs text-muted-foreground">{job.mediaId ? `Asset ${job.mediaId}` : 'Upload awaiting reconciliation'} · {job.attempts} attempts</span></div><button type="button" className="rounded border border-border px-3 py-1 text-sm focus-ring" disabled={busy || !canRetry} title={canRetry ? undefined : 'Requires media.edit for this site'} onClick={() => void retry(job.jobId)}>Retry recovery</button></div>)}
    {total > 50 && <div className="mt-3 flex items-center gap-3 text-sm"><button disabled={busy || offset === 0} onClick={() => void load(Math.max(0, offset - 50))}>Previous</button><span>{offset + 1}–{Math.min(offset + 50, total)} of {total}</span><button disabled={busy || offset + 50 >= total} onClick={() => void load(offset + 50)}>Next</button></div>}
  </section>;
}
