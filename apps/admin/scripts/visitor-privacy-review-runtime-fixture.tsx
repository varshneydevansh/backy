import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { VisitorMembersPanel } from '../src/components/sites/VisitorMembersPanel';
import { runVisitorPrivacyMountedTests } from './visitor-privacy-review-mounted-tests';
function App() {
  const [site, setSite] = useState('site-fixture'), [allowed, setAllowed] = useState(true), [proof, setProof] = useState<any>(), [running, setRunning] = useState(false);
  const run = async () => { setRunning(true); const result = await runVisitorPrivacyMountedTests(document.getElementById('mounted-tests')!); setProof(result); await fetch('/fixture/proof', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(result) }); setRunning(false); };
  return <main className="mx-auto max-w-5xl space-y-5 p-5"><h1 className="text-xl font-semibold">Visitor privacy review acceptance</h1><p className="text-sm text-muted-foreground">Actual admin rows, review client and shared backend handlers. Synthetic owner cookie and repository counts; no live identities or provider calls.</p>
    <div className="flex flex-wrap items-center gap-3"><label className="text-sm">Site <select aria-label="Fixture site" className="min-h-11 border px-3" value={site} onChange={e => setSite(e.target.value)}><option value="site-fixture">Fixture site</option><option value="other-site">Other site</option></select></label>
      <button className="min-h-11 rounded border px-3 text-sm" onClick={() => setAllowed(!allowed)}>{allowed ? 'Remove UI review permission' : 'Restore UI review permission'}</button>
      <button className="min-h-11 rounded border px-3 text-sm" onClick={() => void fetch('/fixture/revoke', { method: 'POST' })}>Revoke backend review access</button>
      <button className="min-h-11 rounded border px-3 text-sm" onClick={() => void fetch('/fixture/restore', { method: 'POST' })}>Restore backend review access</button>
      <button className="min-h-11 rounded border px-3 text-sm" disabled={running} onClick={() => void run()}>Run mounted checks</button></div>
    {!running && <VisitorMembersPanel key={site} siteId={site} canConfigure canReviewPrivacy={allowed} privacyContextKey={String(allowed)} />}
    <div id="mounted-tests" />{proof && <pre data-testid="mounted-proof" className="whitespace-pre-wrap break-words text-sm">{JSON.stringify(proof, null, 2)}</pre>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
