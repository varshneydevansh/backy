import { useEffect, useRef, useState } from 'react';
import type { Collection } from '@/lib/adminContentApi';
import { Button } from '@/components/ui/Button';
import { loadCollectionDesignVersions, restoreCollectionDesignVersion, type CollectionDesignVersions } from '@/lib/collectionDesignVersionsClient';

export function CollectionDesignHistoryPanel({ siteId, collectionId, currentVersion, canView, canEdit, hasUnsavedChanges, onRestored, onRestoreBusyChange }: {
  siteId: string; collectionId: string; currentVersion?: string;
  canView: boolean; canEdit: boolean; hasUnsavedChanges: boolean; onRestored: (collection: Collection, completionWarnings: string[]) => void;
  onRestoreBusyChange?: (busy: boolean) => void;
}) {
  const [history, setHistory] = useState<CollectionDesignVersions>();
  const [selected, setSelected] = useState(''), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [epoch, setEpoch] = useState(0);
  const [offset, setOffset] = useState(0);
  const authorityContext = JSON.stringify([siteId, collectionId, currentVersion, canView, canEdit, hasUnsavedChanges]);
  const authority = useRef({ context: authorityContext });
  if (authority.current.context !== authorityContext) authority.current = { context: authorityContext };
  const restoreController = useRef<AbortController>();
  useEffect(() => { setOffset(0); }, [siteId, collectionId, currentVersion, canView, canEdit]);
  useEffect(() => {
    restoreController.current?.abort(); setHistory(undefined); setSelected(''); setConfirmed(false); setBusy(false); setError(''); setMessage('');
    if (!canView) return;
    const controller = new AbortController(); setBusy(true);
    void loadCollectionDesignVersions(siteId, collectionId, controller.signal, undefined, { offset }).then(data => {
      if (!controller.signal.aborted) setHistory(data);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Collection design history could not load.');
    }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => { controller.abort(); restoreController.current?.abort(); onRestoreBusyChange?.(false); };
  }, [siteId, collectionId, currentVersion, canView, canEdit, epoch, offset]);
  useEffect(() => {
    if (hasUnsavedChanges) {
      setConfirmed(false);
      if (restoreController.current) { restoreController.current.abort(); restoreController.current = undefined; setBusy(false); onRestoreBusyChange?.(false); }
    }
  }, [hasUnsavedChanges]);
  const reviewed = history?.revisions.find(row => row.id === selected);
  const stale = Boolean(history && history.currentVersion !== currentVersion);
  const restore = async () => {
    if (!canView || !canEdit || !reviewed || !confirmed || !history || stale || hasUnsavedChanges || busy) return;
    const restoreAuthority = authority.current;
    const controller = new AbortController(); restoreController.current?.abort(); restoreController.current = controller;
    onRestoreBusyChange?.(true);
    setBusy(true); setError(''); setConfirmed(false);
    try {
      const data = await restoreCollectionDesignVersion(siteId, collectionId, reviewed.id, history.currentVersion, controller.signal);
      if (controller.signal.aborted || restoreAuthority !== authority.current) return;
      setSelected(''); setHistory(undefined);
      setMessage(data.completionWarnings.length ? `Design restored; follow-up pending: ${data.completionWarnings.join(', ')}. Reload history before another action.` : 'Collection design restored. Current schema, access rules and entries were retained.');
      onRestored(data.collection, data.completionWarnings);
    } catch (cause) {
      if (!controller.signal.aborted && restoreAuthority === authority.current) { setHistory(undefined); setSelected(''); setError(cause instanceof Error ? cause.message : 'Restore could not complete. Reload the collection and history before retrying.'); }
    } finally { if (!controller.signal.aborted && restoreAuthority === authority.current) { restoreController.current = undefined; setBusy(false); onRestoreBusyChange?.(false); } }
  };
  return <section className="mt-5 border-t pt-4" aria-labelledby="collection-design-history-title" data-testid="collection-design-history">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 id="collection-design-history-title" className="text-sm font-semibold">Design history</h3>
        <p className="mt-1 max-w-3xl text-xs text-muted-foreground">Recover a design saved before a template upgrade or restore. Field types, validation, routing, access rules and retained entries keep their current values. Incompatible schema changes block recovery.</p></div>
      <Button type="button" variant="outline" disabled={busy || !canView} onClick={() => setEpoch(value => value + 1)}>Reload design history</Button>
    </div>
    {busy && <p className="mt-3 text-sm text-muted-foreground" role="status">Loading design history…</p>}
    {error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}
    {message && <p className="mt-3 text-sm" role="status">{message}</p>}
    {!canView && <p className="mt-3 text-xs text-muted-foreground">Collections view permission is required.</p>}
    {history && !history.revisions.length && <p className="mt-3 text-sm text-muted-foreground">No retained design revisions yet. Template upgrades and design restores save the preceding design here.</p>}
    {history && history.revisions.length > 0 && <label className="mt-3 block max-w-xl text-sm">Saved design
      <select className="mt-1 block min-h-11 w-full rounded-md border bg-background px-3" value={selected} disabled={busy} onChange={event => { setSelected(event.target.value); setConfirmed(false); setMessage(''); }}>
        <option value="">Choose a saved design</option>
        {history.revisions.map(row => <option key={row.id} value={row.id}>{new Date(row.createdAt).toLocaleString()} · before {row.operation} · {row.hasPinnedBaseline ? 'recorded template baseline' : 'unregistered design'}</option>)}
      </select></label>}
    {history && (history.pagination.offset > 0 || history.pagination.hasMore) && <div className="mt-3 flex flex-wrap items-center gap-3">
      <Button type="button" variant="outline" disabled={busy || history.pagination.offset === 0} onClick={() => setOffset(Math.max(0, history.pagination.offset - history.pagination.limit))}>Newer designs</Button>
      <span className="text-xs text-muted-foreground">{history.pagination.offset + 1}–{history.pagination.offset + history.revisions.length}</span>
      <Button type="button" variant="outline" disabled={busy || !history.pagination.hasMore} onClick={() => { if (history.pagination.nextOffset !== null) setOffset(history.pagination.nextOffset); }}>Older designs</Button>
    </div>}
    {stale && <p className="mt-3 text-xs text-destructive">This collection changed since the editor loaded. Reload the collection before restoring.</p>}
    {hasUnsavedChanges && <p className="mt-3 text-xs text-muted-foreground">Save your current collection, entry and design edits before restoring.</p>}
    {reviewed && <div className="mt-3 border-l-2 border-primary pl-3">
      <p className="break-all font-mono text-xs text-muted-foreground">{reviewed.id}</p>
      <label className="mt-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy || !canEdit || stale || hasUnsavedChanges} onChange={event => setConfirmed(event.target.checked)} />Restore this saved design into the current collection.</label>
      <Button type="button" disabled={busy || !canEdit || !confirmed || stale || hasUnsavedChanges} onClick={() => void restore()}>Restore collection design</Button>
      {!canEdit && <p className="mt-2 text-xs text-muted-foreground">Collections edit permission is required.</p>}
    </div>}
  </section>;
}
