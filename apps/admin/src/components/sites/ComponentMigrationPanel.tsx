import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { InteractiveComponentRegistryEntry } from '@/lib/adminContentApi';
import { loadComponentMigrationRegistry, migrateComponentVersion, canApplyComponentMigration, type ComponentMigrationData, type ComponentVersion } from '@/lib/componentMigrationClient';
interface Props { siteId: string; canView: boolean; canEdit: boolean; }
const identity = (entry: ComponentVersion) => JSON.stringify([entry.componentKey, entry.version]);
const parseIdentity = (value: string): ComponentVersion => { const [componentKey, version] = JSON.parse(value); return { componentKey, version }; };
const editorUrl = (siteId: string, type: string, id: string) => type === 'page' ? `/pages/${encodeURIComponent(id)}/edit?siteId=${encodeURIComponent(siteId)}&focus=canvas` : `/blog/${encodeURIComponent(id)}?siteId=${encodeURIComponent(siteId)}&focus=canvas`;
export function ComponentMigrationResults({ siteId, data }: { siteId: string; data: ComponentMigrationData }) {
 const [page, setPage] = useState(0), pageSize = 50;
 const rows = data.migratedTargets.slice(page * pageSize, (page + 1) * pageSize);
 return <div className="mt-4" aria-live="polite">
  <div className="flex flex-wrap gap-x-5 gap-y-2 border-y py-3 text-sm"><span className="font-medium">{data.dryRun ? 'Preview only' : data.outcome === 'partial' ? 'Partial outcome' : 'Migration complete'}</span><span>{data.summary.targets} {data.dryRun ? 'documents to update' : 'confirmed documents'}</span><span>{data.summary.elements} references</span><span>{data.failedTargets.length} failed documents</span></div>
  <p className="mt-2 text-xs text-muted-foreground">Scanned {data.summary.scanned.pages} pages and {data.summary.scanned.posts} blog posts. {data.concurrencyBoundary === 'database-row-lock' ? 'Database writes use per-document row locks.' : 'Demo writes are guarded within one process.'} Templates and reusable sections are outside this migration.</p>
  {!data.migratedTargets.length && !data.failedTargets.length && <p className="mt-3 text-sm">No matching references remain in pages or blog posts. Choose another current version to preview.</p>}
  {!!rows.length && <ul className="mt-3 divide-y">{rows.map(row => <li key={`${row.targetType}:${row.targetId}`} className="py-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><span className="font-medium">{row.title}</span><span className="ml-2 text-xs text-muted-foreground">{row.targetType} · {row.status} · {row.migrated} references</span></div><a className="inline-flex min-h-11 items-center underline" href={editorUrl(siteId, row.targetType, row.targetId)}>Open editor</a></div><p className="break-all font-mono text-xs text-muted-foreground">{row.targetId} · /{row.slug}</p><details className="mt-2"><summary className="cursor-pointer text-xs">Exact reference locations</summary><ul className="mt-2 space-y-1 break-all font-mono text-xs">{row.elementPaths.map(path => <li key={path}>{path}</li>)}</ul></details></li>)}</ul>}
  {data.migratedTargets.length > pageSize && <div className="mt-3 flex flex-wrap items-center gap-3 text-sm"><Button type="button" variant="outline" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous documents</Button><span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, data.migratedTargets.length)} of {data.migratedTargets.length}</span><Button type="button" variant="outline" disabled={(page + 1) * pageSize >= data.migratedTargets.length} onClick={() => setPage(value => value + 1)}>Next documents</Button></div>}
  {!!data.failedTargets.length && <div className="mt-4 border-l-2 border-destructive pl-3"><h4 className="text-sm font-semibold">Failed documents retained</h4><ul className="mt-2 space-y-3">{data.failedTargets.map(row => <li key={`${row.targetType}:${row.targetId}`} className="text-sm"><a className="underline" href={editorUrl(siteId, row.targetType, row.targetId)}>{row.targetType} · {row.targetId}</a><p>{row.message}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{row.code}</p></li>)}</ul></div>}
  {!!data.completionWarnings.length && <div className="mt-4 border-l-2 border-amber-500 pl-3"><h4 className="text-sm font-semibold">Completion warnings</h4><ul className="mt-2 space-y-2 text-sm">{data.completionWarnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul><p className="mt-2 text-xs text-muted-foreground">Confirmed document changes remain saved. Review the warning before checking the public frontend.</p></div>}
  {data.retry.required && <p className="mt-3 text-sm font-medium">{data.retry.message || 'Reload the preview and review current documents before retrying. Confirmed instances are skipped.'}</p>}
 </div>;
}
export function ComponentMigrationPanel({ siteId, canView, canEdit }: Props) {
 const [components, setComponents] = useState<InteractiveComponentRegistryEntry[]>([]), [sourceId, setSourceId] = useState(''), [targetId, setTargetId] = useState('');
 const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [epoch, setEpoch] = useState(0), [confirmed, setConfirmed] = useState(false);
 const [data, setData] = useState<ComponentMigrationData>(), [error, setError] = useState('');
 const sequence = useRef(0), operation = useRef<AbortController>();
 useEffect(() => {
  sequence.current++; operation.current?.abort(); setComponents([]); setSourceId(''); setTargetId(''); setData(undefined); setConfirmed(false); setError(''); setBusy(false);
  return () => { sequence.current++; operation.current?.abort(); };
 }, [siteId]);
 useEffect(() => {
  const controller = new AbortController(); setLoading(Boolean(siteId && canView));
  if (siteId && canView) void loadComponentMigrationRegistry(siteId, controller.signal).then(registry => { if (!controller.signal.aborted) { setComponents(registry.components); setError(''); } }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Components could not load.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
  return () => controller.abort();
 }, [siteId, canView, epoch]);
 const change = (select: () => void) => { sequence.current++; operation.current?.abort(); select(); setData(undefined); setConfirmed(false); setError(''); setBusy(false); };
 const run = async (dryRun: boolean) => {
  if (!siteId || !canEdit || !sourceId || !targetId || sourceId === targetId || !dryRun && !canApplyComponentMigration(data, confirmed)) return;
  const current = ++sequence.current, controller = new AbortController(); operation.current?.abort(); operation.current = controller;
  const review = data?.reviewedPreview; setBusy(true); setError(''); setConfirmed(false);
  // Applying consumes the preview. A failure or unknown response cannot reuse it.
  setData(undefined);
  try {
   const result = await migrateComponentVersion(siteId, { source: parseIdentity(sourceId), target: parseIdentity(targetId), dryRun, ...(dryRun ? {} : { reviewedPreview: review }) }, controller.signal);
   if (current === sequence.current) setData(result);
  } catch (cause) { if (current === sequence.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Migration failed. Reload the preview.'); }
  finally { if (current === sequence.current) setBusy(false); }
 };
 const choices = components.filter(entry => identity(entry) !== sourceId && entry.status === 'active');
 return <section id="site-component-migrations" className="mt-6 border-t pt-6" aria-labelledby="component-migration-title" data-testid="site-component-migrations">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="component-migration-title" className="text-base font-semibold">Component version migrations</h3><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Review page and blog references before moving them to an exact registered version. Saved props, bindings and fallbacks remain authored content.</p></div><Button type="button" variant="outline" disabled={loading || busy || !siteId || !canView} onClick={() => change(() => { setSourceId(''); setTargetId(''); setEpoch(value => value + 1); })}>Reload components</Button></div>
  {!canView && <p className="mt-3 text-sm text-muted-foreground">Page view permission is required to discover registered versions.</p>}
  {!canEdit && <p className="mt-3 text-sm text-muted-foreground">Page edit permission is required to preview or apply migrations.</p>}
  {loading && <p role="status" className="mt-3 text-sm text-muted-foreground">Loading registered component versions…</p>}
  {!loading && canView && !components.length && !error && <p className="mt-3 text-sm text-muted-foreground">No registered component versions were found. Register the current and target versions through the authenticated component API before migrating.</p>}
  <div className="mt-4 grid gap-3 md:grid-cols-2"><label className="min-w-0 text-sm">Current component and version<select aria-label="Current component and version" className="mt-1 block min-h-11 w-full rounded-md border bg-background px-3" disabled={busy || loading || !canView} value={sourceId} onChange={event => change(() => { setSourceId(event.target.value); setTargetId(''); })}><option value="">Choose the current version</option>{components.map(entry => <option key={identity(entry)} value={identity(entry)}>{entry.displayName || entry.componentKey} · {entry.componentKey}@{entry.version} · {entry.status}</option>)}</select></label>
   <label className="min-w-0 text-sm">Target component and version<select aria-label="Target component and version" className="mt-1 block min-h-11 w-full rounded-md border bg-background px-3" disabled={busy || loading || !sourceId} value={targetId} onChange={event => change(() => setTargetId(event.target.value))}><option value="">Choose an active exact version</option>{choices.map(entry => <option key={identity(entry)} value={identity(entry)}>{entry.displayName || entry.componentKey} · {entry.componentKey}@{entry.version}</option>)}</select></label></div>
  <div className="mt-4 flex flex-wrap items-center gap-3"><Button type="button" variant="outline" disabled={busy || loading || !canEdit || !sourceId || !targetId} onClick={() => void run(true)}>{busy ? 'Working…' : data && !data.dryRun || error ? 'Reload migration preview' : 'Preview migration'}</Button><p className="text-xs text-muted-foreground">Preview reads content without saving changes.</p></div>
  {error && <p role="alert" className="mt-3 text-sm text-destructive">{error} Reload the migration preview before applying again.</p>}
  {data && <ComponentMigrationResults key={JSON.stringify([sourceId, targetId, data.dryRun, data.reviewedPreview])} siteId={siteId} data={data} />}
  {data?.dryRun && data.migratedTargets.length > 0 && <div className="mt-4 border-l-2 border-primary pl-4"><label className="flex min-h-11 items-start gap-3 text-sm"><input className="mt-1 size-4 shrink-0 accent-primary" type="checkbox" checked={confirmed} disabled={busy || !canEdit} onChange={event => setConfirmed(event.target.checked)} /><span>I reviewed all {data.summary.targets} documents and {data.summary.elements} reference locations above. Apply {data.source.componentKey}@{data.source.version} to {data.target.componentKey}@{data.target.version} for this exact snapshot.</span></label><Button type="button" variant="primary" className="mt-3" disabled={busy || !canEdit || !canApplyComponentMigration(data, confirmed)} onClick={() => void run(false)}>Apply reviewed migration</Button><p className="mt-2 text-xs text-muted-foreground">Changed documents or registry definitions require a new preview. Independent document conflicts may leave a partial outcome; confirmed commits remain visible.</p></div>}
 </section>;
}
