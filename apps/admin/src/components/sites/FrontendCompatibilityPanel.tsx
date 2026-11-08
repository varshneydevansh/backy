import { useEffect, useRef, useState } from 'react';
import { type FrontendCompatibilityReport, type FrontendRuntimeDeclaration, type SiteFrontendDesignContract } from '@backy-cms/core';
import { adminFetch, getAdminApiBase, updateSiteFrontendDesign } from '@/lib/adminContentApi';
import { Button } from '@/components/ui/Button';
import { parseFrontendObservationFile, FRONTEND_OBSERVATION_MAX_BYTES } from '@/lib/frontendObservationImport';

interface Props {
  siteId: string;
  design: SiteFrontendDesignContract;
  canConfigure: boolean;
  onUpdated: () => void;
}
const defaultRuntime = { schemaVersion: 'backy.frontend-runtime.v1', frontendId: 'custom-frontend', version: '1', capabilities: {}, componentVersions: {} };

/** Advanced frontend alignment workspace; declarations are never represented as live certification. */
export function FrontendCompatibilityPanel({ siteId, design, canConfigure, onUpdated }: Props) {
  const [runtimeJson, setRuntimeJson] = useState(() => JSON.stringify(design.runtime || defaultRuntime, null, 2));
  const [targetType, setTargetType] = useState('templateId');
  const [targetId, setTargetId] = useState('');
  const [observationJson, setObservationJson] = useState('');
  const [report, setReport] = useState<FrontendCompatibilityReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) setRuntimeJson(JSON.stringify(design.runtime || defaultRuntime, null, 2));
  }, [design.runtime]);
  useEffect(() => {
    sequence.current++; dirty.current = false; setRuntimeJson(JSON.stringify(design.runtime || defaultRuntime, null, 2));
    setTargetId(''); setReport(null); setError(''); setMessage(''); setObservationJson(''); setBusy(false);
    return () => { sequence.current++; };
    // A site switch discards only the transient diagnostic form. Saved contracts remain server-owned.
  }, [siteId]);
  const invalidate = () => { sequence.current++; setReport(null); setMessage(''); setError(''); setBusy(false); };
  const save = async () => {
    const current = ++sequence.current; setBusy(true); setError(''); setMessage(''); setReport(null);
    try {
      const runtime: FrontendRuntimeDeclaration = JSON.parse(runtimeJson);
      await updateSiteFrontendDesign(siteId, { runtime });
      if (current !== sequence.current) return;
      dirty.current = false; setMessage('Runtime declaration saved. Actual rendering still needs verification.'); onUpdated();
    } catch (cause) { if (current === sequence.current) setError(cause instanceof Error ? cause.message : 'Could not save runtime declaration.'); }
    finally { if (current === sequence.current) setBusy(false); }
  };
  const importObservation = async (file: File) => {
    const current = ++sequence.current; setObservationJson(''); setReport(null); setMessage(''); setError(''); setBusy(true);
    try {
      if (file.size > FRONTEND_OBSERVATION_MAX_BYTES) throw new Error('Observation file exceeds 256 KiB. Capture a smaller marked tree.');
      const observation = parseFrontendObservationFile(await file.text(), siteId);
      if (current !== sequence.current) return;
      setObservationJson(JSON.stringify(observation, null, 2));
      setMessage('Observation imported locally. ' + (observation.complete ? 'Complete marked tree' : 'Incomplete evidence') + ' at ' + observation.breakpoint + '. Generate a report to compare the saved revision; this does not certify behavior.');
    } catch (cause) { if (current === sequence.current) setError(cause instanceof Error ? cause.message : 'Could not read observation file.'); }
    finally { if (current === sequence.current) setBusy(false); }
  };
  const diagnose = async () => {
    const current = ++sequence.current; setBusy(true); setError(''); setMessage(''); setReport(null);
    try {
      const body = { [targetType]: targetId, ...(observationJson.trim() ? { observation: JSON.parse(observationJson) } : {}) };
      const response = await adminFetch(getAdminApiBase() + '/sites/' + encodeURIComponent(siteId) + '/custom-frontend/compatibility', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('The connected backend did not return a compatibility report. Check that the admin and API are running matching versions, then retry.');
      }
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error?.message || 'Compatibility report failed.');
      if (current === sequence.current) setReport(payload.data.report);
    } catch (cause) { if (current === sequence.current) setError(cause instanceof Error ? cause.message : 'Could not generate report.'); }
    finally { if (current === sequence.current) setBusy(false); }
  };
  const download = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'backy-frontend-compatibility.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const copy = async () => {
    if (!report) return;
    try { await navigator.clipboard.writeText(JSON.stringify(report, null, 2)); setMessage('Compatibility report copied.'); }
    catch { setError('Clipboard unavailable. Download the report instead.'); }
  };
  return <section id="site-frontend-compatibility" className="mt-6 border-t pt-6" aria-labelledby="frontend-compatibility-title" data-testid="site-frontend-compatibility">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 id="frontend-compatibility-title" className="text-base font-semibold">Frontend compatibility</h3>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Find missing capabilities and element mappings. Support declarations and supplied observations do not certify live rendering or interactions.</p></div>
      {report && <div className="flex gap-2"><Button variant="outline" onClick={() => void copy()}>Copy for AI</Button><Button variant="outline" onClick={download}>Download JSON</Button></div>}
    </div>
    <details className="mt-4 rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">Runtime capability declaration</summary>
      <p className="my-3 text-sm text-muted-foreground">Declare capability names such as element.text, richText.data_figure, design.fonts or motion.slideIn with supported, fallback or unsupported. Declare exact registered component versions separately. Save this before generating a report.</p>
      <label className="block text-sm" htmlFor="frontend-runtime-json">Declaration JSON</label>
      <textarea id="frontend-runtime-json" className="mt-1 min-h-48 w-full rounded-md border bg-background p-3 font-mono text-xs" value={runtimeJson} onChange={event => { dirty.current = true; setRuntimeJson(event.target.value); invalidate(); }} spellCheck={false} />
      <Button className="mt-3" disabled={busy || !canConfigure || !siteId} onClick={() => void save()}>Save declaration</Button>
    </details>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="text-sm">Content type<select className="mt-1 block min-h-11 rounded-md border bg-background px-3" value={targetType} onChange={event => { setTargetType(event.target.value); setTargetId(''); invalidate(); }}><option value="templateId">Registered template</option><option value="pageId">Page</option><option value="postId">Blog post</option></select></label>
      <label className="min-w-48 flex-1 text-sm">{targetType === 'templateId' ? 'Template' : 'Content ID'}
        {targetType === 'templateId' ? <select className="mt-1 block min-h-11 w-full rounded-md border bg-background px-3" value={targetId} onChange={event => { setTargetId(event.target.value); invalidate(); }}><option value="">Choose a template</option>{design.templates.map(template => <option key={template.id} value={template.id}>{template.name} · {template.type}</option>)}</select>
          : <input className="mt-1 block min-h-11 w-full rounded-md border bg-background px-3" value={targetId} onChange={event => { setTargetId(event.target.value); invalidate(); }} placeholder="ID from the content workspace" />}
      </label>
      <Button disabled={busy || !targetId || !siteId || dirty.current} onClick={() => void diagnose()}>{busy ? 'Working…' : 'Generate report'}</Button>
    </div>
    {dirty.current && <p className="mt-2 text-sm text-amber-700">Save or discard declaration edits before comparing the saved frontend contract.</p>}
    <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">Compare rendered observations</summary>
      <p className="my-2 text-sm text-muted-foreground">Open your starter page with ?backyInspect=1, capture the current DOM, then import the downloaded JSON. The file stays local until you generate a report. Captures include marked IDs, actual DOM parents and geometry at one breakpoint; hidden states, animations and interactions remain unverified. You can also paste an observation inventory.</p>
      <label className="mb-3 block text-sm">Import rendered observation JSON<input type="file" accept=".json,application/json" disabled={busy} className="mt-1 block max-w-full text-sm" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importObservation(file); }} /></label>
      <label className="sr-only" htmlFor="frontend-observation-json">Rendered observation JSON</label><textarea id="frontend-observation-json" className="min-h-40 w-full rounded-md border bg-background p-3 font-mono text-xs" value={observationJson} onChange={event => { setObservationJson(event.target.value); invalidate(); }} spellCheck={false} />
    </details>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}{message && <p role="status" className="mt-3 text-sm text-teal-700">{message}</p>}
    {!design.templates.length && targetType === 'templateId' && <p className="mt-3 text-sm text-muted-foreground">Register an editable template first, or compare an existing page or blog post.</p>}
    {report && <div className="mt-4" aria-live="polite">
      <div className="flex flex-wrap gap-4 border-y py-3 text-sm"><span>{report.summary.elementCount} elements</span><span>{report.summary.blocking} blocking issues</span><span>{report.summary.unverified} unverified</span><span>{report.summary.fallbacks} fallbacks</span><span className="text-muted-foreground">Not live certified</span></div>
      <p className="mt-3 text-sm text-muted-foreground">{report.route} · revision {report.revision || 'not available'} · {report.nextAction}</p>
      {targetType !== 'templateId' && <a className="mt-2 inline-block text-sm underline" href={targetType === 'pageId' ? '/pages/' + encodeURIComponent(targetId) + '/edit?siteId=' + encodeURIComponent(siteId) + '&focus=canvas' : '/blog/' + encodeURIComponent(targetId) + '?siteId=' + encodeURIComponent(siteId) + '&focus=canvas'}>Open content editor</a>}
      {report.issues.length === 0 ? <p className="mt-3 text-sm">No mismatches found in the supplied declarations and observations. Verify browser rendering and interactions before launch.</p> : <ol className="mt-3 divide-y">{report.issues.slice(0, 100).map((issue, index) => <li key={index} className="py-3 text-sm"><div className="flex flex-wrap gap-2 font-medium"><span>{issue.status}</span>{issue.capability && <span className="break-all font-mono text-xs">{issue.capability}</span>}<span>{issue.elementId || 'Document'}</span><span>{issue.breakpoint || 'All breakpoints'}</span></div><div className="mt-1 break-all font-mono text-xs text-muted-foreground">{issue.contentPath} · {issue.code}</div><p className="mt-1">{issue.suggestedAction}</p>{(issue.expected !== undefined || issue.observed !== undefined) && <details className="mt-2"><summary className="cursor-pointer text-xs">Expected and observed values</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded border bg-muted p-3 text-xs">{JSON.stringify({ expected: issue.expected, observed: issue.observed }, null, 2)}</pre></details>}<p className="mt-1 text-xs text-muted-foreground">Repair: {issue.repairOwner} · evidence: {issue.evidence}</p></li>)}</ol>}
      {report.issues.length > 100 && <p className="mt-3 text-sm">Showing 100 of {report.issues.length} issues. Copy or download the complete report.</p>}
    </div>}
  </section>;
}
