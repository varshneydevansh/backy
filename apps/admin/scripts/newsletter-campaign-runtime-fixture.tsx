import { NewsletterCampaignDesk } from '../src/components/newsletter/NewsletterCampaignDesk';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { runNewsletterCampaignMountedTests } from './newsletter-campaign-mounted-tests';
function App() {
 const [proof,setProof]=useState<any>(null),[busy,setBusy]=useState(false);
 const run=async()=>{setBusy(true);try{const result=await runNewsletterCampaignMountedTests(document.getElementById('mounted-test-root')!);setProof(result);await fetch('/fixture/proof',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(result)});}catch(error){setProof({ok:false,error:error instanceof Error?error.message:String(error)});}finally{setBusy(false);}};
 return <main className="mx-auto max-w-6xl p-5"><h1 className="text-xl font-semibold">Newsletter campaign mounted acceptance</h1><p className="my-3 text-sm">Actual campaign desk and API client with synthetic responses. No real provider requests or mail.</p><button className="min-h-11 rounded border px-3" disabled={busy} onClick={()=>void run()}>Run mounted checks</button>{!busy&&<NewsletterCampaignDesk siteId="site-fixture" canView={true} canManage={true} canExport={false} forms={[]}/>}<div id="mounted-test-root"/>{proof&&<pre data-testid="mounted-proof" className="mt-4 whitespace-pre-wrap text-sm">{JSON.stringify(proof,null,2)}</pre>}</main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
