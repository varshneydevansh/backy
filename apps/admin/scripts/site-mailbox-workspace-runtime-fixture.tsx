import { runSiteMailboxManagementMountedTests } from './site-mailbox-management-mounted-tests';
import { runSiteMailboxSendingMountedTests } from './site-mailbox-sending-mounted-tests';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SiteMailboxWorkspace } from '../src/components/settings/SiteMailboxWorkspace';
import { runSiteMailboxAttachmentMountedTests } from './site-mailbox-attachments-mounted-tests';
import { runSiteMailboxMountedTests } from './site-mailbox-workspace-mounted-tests';
function App() {
  const [siteId,setSite]=useState('site-fixture'),[allowed,setAllowed]=useState(true),[proof,setProof]=useState<any>(null),[running,setRunning]=useState(false);
  const run=async()=>{setRunning(true);const baseline=await runSiteMailboxMountedTests(document.getElementById('mounted-test-root')!);const attachments=await runSiteMailboxAttachmentMountedTests(document.getElementById('mounted-test-root')!);const sending=await runSiteMailboxSendingMountedTests(document.getElementById('mounted-test-root')!);const management=await runSiteMailboxManagementMountedTests(document.getElementById('mounted-test-root')!);const result={ok:baseline.ok&&attachments.ok&&sending.ok&&management.ok,boundary:'Mounted workspace/client baseline and attachments with synthetic deferred transport only',checks:[...baseline.checks,...attachments.checks,...sending.checks,...management.checks],baseline,attachments,sending,management};setProof(result);await fetch('/fixture/mounted-proof',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(result)});setRunning(false);};
  return <main className="mx-auto max-w-6xl p-5"><h1 className="text-2xl font-semibold">Site mailbox acceptance</h1><p className="my-3 text-sm">Actual workspace and backend handlers. Synthetic Owner cookie, in-memory data and provider responses. No real mail access.</p>
    <div className="flex flex-wrap gap-3"><label>Site <select aria-label="Fixture site" value={siteId} onChange={e=>setSite(e.target.value)} className="ml-2 min-h-11 border px-3"><option value="site-fixture">Fixture site</option><option value="other-site">Other site</option></select></label><button className="min-h-11 rounded border px-3" onClick={()=>setAllowed(!allowed)}>{allowed?'Remove UI permission':'Restore UI permission'}</button><button className="min-h-11 rounded border px-3" onClick={()=>void fetch('/fixture/revoke-backend',{method:'POST'})}>Revoke backend access</button><button className="min-h-11 rounded border px-3" onClick={()=>void fetch('/fixture/restore-backend',{method:'POST'})}>Restore backend access</button><button className="min-h-11 rounded border px-3" disabled={running} onClick={run}>Run mounted checks</button></div>
    {!running&&<SiteMailboxWorkspace siteId={siteId} canView={allowed} contextKey={String(allowed)} disabledReason="Owner permission required"/>}<div id="mounted-test-root"/>
    {proof&&<pre data-testid="mounted-proof" className="mt-4 overflow-auto whitespace-pre-wrap text-sm">{JSON.stringify(proof,null,2)}</pre>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
