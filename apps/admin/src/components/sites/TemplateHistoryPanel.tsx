import { TemplateInstancesPanel } from './TemplateInstancesPanel';
import { useEffect, useRef, useState } from 'react';
import type { BackyTemplateRevision, SiteFrontendDesignContract } from '@backy-cms/core';
import { Button } from '@/components/ui/Button';
import { loadTemplateHistory, restoreTemplateRevision, type TemplateHistoryResponse, type TemplateRevisionSummary } from '@/lib/templateHistoryClient';

interface Props { siteId: string; templates: SiteFrontendDesignContract['templates']; canConfigure: boolean; canUpgradeInstances?: boolean; canViewProductInstances?: boolean; canUpgradeProductInstances?: boolean; canViewCollectionInstances?: boolean; canUpgradeCollectionInstances?: boolean; canViewFormInstances?: boolean; canUpgradeFormInstances?: boolean; onUpdated: () => void; }
export function TemplateHistoryPanel({ siteId, templates, canConfigure, canUpgradeInstances = false, canViewProductInstances = false, canUpgradeProductInstances = false, canViewCollectionInstances = false, canUpgradeCollectionInstances = false, canViewFormInstances = false, canUpgradeFormInstances = false, onUpdated }: Props) {
 const [catalog, setCatalog] = useState<TemplateRevisionSummary[]>([]), [selectedId, setSelectedId] = useState('');
 const [history, setHistory] = useState<TemplateHistoryResponse>(), [reviewId, setReviewId] = useState('');
 const [epoch, setEpoch] = useState(0), [loading, setLoading] = useState(false), [restoring, setRestoring] = useState(false);
 const [error, setError] = useState(''), [message, setMessage] = useState('');
 const sequence = useRef(0), restoreController = useRef<AbortController>();
 useEffect(() => { sequence.current++; restoreController.current?.abort(); setCatalog([]); setSelectedId(''); setHistory(undefined); setReviewId(''); setError(''); setMessage(''); setRestoring(false);
  return () => { sequence.current++; restoreController.current?.abort(); };
 }, [siteId]);
 useEffect(() => {
  const controller = new AbortController(); setLoading(true); setError(''); setHistory(undefined); setReviewId('');
  void loadTemplateHistory(siteId, selectedId || undefined, controller.signal).then(data => {
   if (controller.signal.aborted) return;
   if (selectedId) setHistory(data); else setCatalog(data.revisions as TemplateRevisionSummary[]);
  }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Template history could not load.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
  return () => controller.abort();
 }, [siteId, selectedId, epoch]);
 const choices = new Map(templates.map(template => [template.id, { id: template.id, name: template.name, type: template.type, retained: false }]));
 for (const revision of catalog) if (!choices.has(revision.templateId)) choices.set(revision.templateId, { id: revision.templateId, name: revision.name, type: revision.type as typeof templates[number]['type'], retained: true });
 const review = history?.revisions.find(revision => revision.id === reviewId) as BackyTemplateRevision | undefined;
 const restore = async () => {
  if (!history || history.siteId !== siteId || !review || !canConfigure) return;
  const request = ++sequence.current, controller = new AbortController(); restoreController.current?.abort(); restoreController.current = controller;
  setRestoring(true); setError(''); setMessage('');
  try { await restoreTemplateRevision(siteId, selectedId, review.id, history.currentDesignFingerprint, controller.signal);
   if (request !== sequence.current || controller.signal.aborted) return;
   setMessage('Template revision restored. Existing pages and posts keep their authored content.'); setEpoch(current => current + 1); onUpdated();
  } catch (cause) { if (request === sequence.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Template revision could not restore.'); }
  finally { if (request === sequence.current) setRestoring(false); }
 };
 const select = (value: string) => { sequence.current++; restoreController.current?.abort(); setRestoring(false); setSelectedId(value); setReviewId(''); setMessage(''); };
 return <section className="mt-6 border-t pt-6" aria-labelledby="template-history-title" data-testid="site-template-history">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="template-history-title" className="text-base font-semibold">Template history</h3>
   <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Retained snapshots preserve layout, rich content, assets, bindings and motion. Restoring replaces the selected template and keeps the current site design and other templates.</p></div>
   <Button type="button" variant="outline" disabled={loading || restoring} onClick={() => setEpoch(current => current + 1)}>Reload history</Button></div>
  <label className="mt-4 block max-w-xl text-sm">Template<select className="mt-1 block min-h-11 w-full rounded-md border bg-background px-3" value={selectedId} onChange={event => select(event.target.value)} disabled={restoring}>
   <option value="">Choose a retained template</option>{Array.from(choices.values()).map(template => <option key={template.id} value={template.id}>{template.name} · {template.type}{template.retained ? ' · removed from current registry' : ''}</option>)}
  </select></label>
  {loading && <p className="mt-3 text-sm text-muted-foreground" role="status">Loading retained revisions…</p>}
  {error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}{message && <p className="mt-3 text-sm" role="status">{message}</p>}
  {selectedId && !loading && history && !history.revisions.length && <p className="mt-3 text-sm text-muted-foreground">No retained revisions yet. The next template registration, capture, import or change records its snapshot. An existing template is retained before it is overwritten.</p>}
  {selectedId && history && history.revisions.length > 0 && <div className="mt-4 divide-y rounded-md border">{history.revisions.map(item => {
   const revision = item as BackyTemplateRevision, current = revision.fingerprint === history.currentTemplateFingerprint;
   return <div key={revision.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"><div className="min-w-0 text-sm"><span className="font-medium">{revision.snapshot.name}</span><span className="ml-2 text-xs text-muted-foreground">v{String(revision.snapshot.version ?? 'unversioned')} · {revision.operation}{current ? ' · current' : ''}</span>
    <div className="mt-1 text-xs text-muted-foreground">{new Date(revision.createdAt).toLocaleString()} · {revision.source}</div></div>
    <Button type="button" variant="outline" disabled={restoring} onClick={() => setReviewId(revision.id)}>Review revision</Button></div>;
  })}</div>}
  {review && <div className="mt-4 border-l-2 border-primary pl-4" data-testid="site-template-revision-review"><h4 className="text-sm font-semibold">Review {review.snapshot.name} · v{String(review.snapshot.version ?? 'unversioned')}</h4>
   <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{review.id}</p>
   <details className="mt-3"><summary className="cursor-pointer text-sm">Full template snapshot</summary><pre className="mt-2 max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(review.snapshot, null, 2)}</pre></details>
   <Button type="button" className="mt-3" disabled={restoring || !canConfigure || review.fingerprint === history?.currentTemplateFingerprint} onClick={() => void restore()}>{restoring ? 'Restoring…' : 'Restore this revision'}</Button>
   <TemplateInstancesPanel siteId={siteId} revision={review} canView={review.snapshot.type === 'collection' ? canViewCollectionInstances : review.snapshot.type === 'form' ? canViewFormInstances : review.snapshot.type !== 'product' || canViewProductInstances} canEdit={review.snapshot.type === 'collection' ? canUpgradeCollectionInstances : review.snapshot.type === 'form' ? canUpgradeFormInstances : review.snapshot.type === 'product' ? canUpgradeProductInstances : canUpgradeInstances} />
   {!canConfigure && <p className="mt-2 text-xs text-muted-foreground">Site configuration permission is required to restore a revision.</p>}
  </div>}
 </section>;
}
