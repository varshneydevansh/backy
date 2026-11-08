/** Actual upload client and mounted transfer UI, synthetic responses and files only. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MediaUploadTransfers } from '../src/components/media/MediaUploadTransfers';
import { uploadMedia } from '../src/lib/mediaApi';
export async function runMediaUploadMountedTests(container:HTMLElement){
 const originalFetch=globalThis.fetch,checks:Array<{name:string;passed:boolean}>=[];
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const check=(name:string,passed:boolean)=>{checks.push({name,passed});if(!passed)throw Error(name);};
 const response=(data:any,status=200)=>new Response(JSON.stringify({success:status<300,...(status<300?{data}:{error:{message:'Synthetic permission denial'}})}),{status,headers:{'content-type':'application/json'}});
 const keys=()=>Object.keys(localStorage).filter(key=>key.startsWith('backy:upload:'));
 const clear=()=>keys().forEach(key=>localStorage.removeItem(key));
 const digest=async(bytes:BufferSource)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 const bytes=new Uint8Array(3*1024*1024+7);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
 const file=new File([bytes],'synthetic.bin',{type:'application/octet-stream'}),sessions=new Map<string,any>(),requests:any[]=[];
 let sequence=0,dropChunk=true,badComplete=false,badBinding=false,badOffset=false,deny=0;
 globalThis.fetch=(async(input:RequestInfo|URL,init:RequestInit={})=>{
  const path=new URL(String(input),location.origin).pathname,method=init.method||'GET';requests.push({path,method});
  if(deny)return response({},deny);
  if(path.endsWith('/uploads')&&method==='POST'){
   const body=JSON.parse(String(init.body)),id=`10000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`;
   const bindingFingerprint=await digest(new TextEncoder().encode(JSON.stringify({filename:body.filename,mimeType:body.mimeType,sizeBytes:body.sizeBytes,sha256:body.sha256,fields:Object.entries(body.fields).sort(([a],[b])=>a.localeCompare(b,'en'))})));
   const session={...body,id,bindingFingerprint,offset:0,state:'uploading',chunks:[]};sessions.set(id,session);return response({upload:{...session,chunks:undefined}},201);
  }
  const session=sessions.get(path.split('/').at(-1)!);if(!session)throw Error('Unexpected upload fixture route '+path);
  if(method==='GET')return response({upload:{...session,chunks:undefined,bindingFingerprint:badBinding?'bad':session.bindingFingerprint}});
  if(method==='PATCH'){
   const offset=Number(new Headers(init.headers).get('upload-offset')),chunk=new Uint8Array(await (init.body as Blob).arrayBuffer());check('Chunk offset equals durable offset',offset===session.offset);check('Each request is at most1MiB',chunk.length<=1024*1024);session.chunks.push(chunk);session.offset+=chunk.length;
   if(dropChunk){dropChunk=false;throw Error('Synthetic lost chunk reply');}
   return response({upload:{...session,chunks:undefined,offset:badOffset?session.offset+1:session.offset}});
  }
  if(method==='POST'){
   session.state='complete';const output=new Uint8Array(session.sizeBytes);let offset=0;for(const chunk of session.chunks){output.set(chunk,offset);offset+=chunk.length;}check('Completed bytes match original SHA256',await digest(output)===session.sha256);
   return response(badComplete?{media:{}}:{media:{id:'20000000-0000-4000-8000-000000000001',filename:session.filename,sizeBytes:session.sizeBytes,type:'other',url:'https://bytes.fixture.invalid/synthetic',metadata:{resumableUploadId:session.id}}});
  }
  throw Error('Unexpected method');
 }) as typeof fetch;
 const reject=async(operation:()=>Promise<unknown>,pattern:RegExp)=>{try{await operation();throw Error('Expected rejection');}catch(error){check('Expected rejection '+pattern,pattern.test(String(error)));}};
 const root=createRoot(container);let site='site-a',actor='actor-a',enabled=true,uiStatus=200,held:((value:Response)=>void)|null=null,delay=false,uiRequests=0;
 const flush=async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});};
 const render=async()=>{await act(async()=>root.render(<MediaUploadTransfers key={`${site}:${actor}`} siteId={site} enabled={enabled}/>));await flush();};
 const click=async(label:string)=>{const button=Array.from(container.querySelectorAll('button')).find(button=>button.textContent===label);if(!button)throw Error('Missing '+label+' '+container.textContent);await act(async()=>button.click());await flush();};
 try{
  clear();await reject(()=>uploadMedia(file,{siteId:'site-a',visibility:'private',metadata:{fixture:'one'}}),/lost chunk reply/);
  check('Resume cache contains only opaque UUID with hashed key',keys().length===1&&/^backy:upload:[a-f0-9]{64}$/.test(keys()[0])&&/^[a-f0-9-]{36}$/.test(localStorage.getItem(keys()[0])!));
  const saved=localStorage.getItem(keys()[0])!,firstCount=requests.length;await uploadMedia(file,{siteId:'site-a',visibility:'private',metadata:{fixture:'one'}});
  check('Lost reply resumes existing offset without a new begin',sequence===1&&requests[firstCount].method==='GET'&&sessions.get(saved).chunks.length===4&&keys().length===0);
  badComplete=true;await reject(()=>uploadMedia(file,{siteId:'site-a',visibility:'private',metadata:{fixture:'two'}}),/completed upload response/);
  check('Malformed completion retains recovery handle',keys().length===1);const begins=sequence;badComplete=false;await uploadMedia(file,{siteId:'site-a',visibility:'private',metadata:{fixture:'two'}});check('Completed recovery uses same saved receipt',sequence===begins&&keys().length===0);
  dropChunk=true;await reject(()=>uploadMedia(file,{siteId:'site-a',visibility:'private',metadata:{fixture:'three'}}),/lost chunk reply/);const retainedKey=keys()[0];badBinding=true;const countBefore=requests.length;await reject(()=>uploadMedia(file,{siteId:'site-a',visibility:'private',metadata:{fixture:'three'}}),/does not match/);check('Binding mismatch stops before PATCH or finalization',requests.length===countBefore+1&&Boolean(localStorage.getItem(retainedKey)));badBinding=false;
  for(const code of [401,403]){deny=code;const before=sequence;await reject(()=>uploadMedia(file,{siteId:'site-a',visibility:'private',metadata:{fixture:'three'}}),/permission denial/);check('Denied resume preserves handle and does not begin '+code,sequence===before&&Boolean(localStorage.getItem(retainedKey)));}deny=0;
  await uploadMedia(file,{siteId:'site-a',visibility:'public',metadata:{fixture:'three'}});check('Changed visibility creates distinct metadata-bound session',sequence===begins+2&&Boolean(localStorage.getItem(retainedKey)));clear();
  badOffset=true;await reject(()=>uploadMedia(file,{siteId:'site-a'}),/offset response/);check('Bad PATCH offset retains recovery handle',keys().length===1);badOffset=false;clear();
  const beforeOversize=requests.length;await reject(()=>uploadMedia(new File([new Uint8Array(50*1024*1024+1)],'large.bin'),{siteId:'site-a'}),/up to50 MiB/);check('Oversize rejects before network',requests.length===beforeOversize);
  clear();globalThis.fetch=(async()=>{uiRequests++;if(delay)return new Promise<Response>(resolve=>{held=resolve;});return response({uploads:[{id:saved,filename:'Private uploader filename.bin',offset:10,sizeBytes:100,state:'uploading',expiresAt:new Date(Date.now()+86400000).toISOString()}],pagination:{total:1,offset:0,limit:25,hasMore:false}},uiStatus);}) as typeof fetch;
  await render();check('Mounted transfer UI waits for explicit load',uiRequests===0);await act(async()=>{container.querySelector('details')!.open=true;});await click('Load my transfers');check('Actual client response renders transfer row',container.textContent!.includes('Private uploader filename.bin'));
  check('All visible transfer buttons have44px targets',Array.from(container.querySelectorAll('button')).every(button=>button.getBoundingClientRect().height>=44));
  uiStatus=403;await click('Refresh transfers');check('403 clears cached filenames',!container.textContent!.includes('Private uploader filename.bin'));uiStatus=200;await click('Load my transfers');uiStatus=401;await click('Refresh transfers');check('401 clears cached filenames',!container.textContent!.includes('Private uploader filename.bin'));uiStatus=200;
  delay=true;await click('Load my transfers');site='site-b';await render();await act(async()=>held!(response({uploads:[{id:saved,filename:'Late old scope.bin',offset:1,sizeBytes:2,state:'uploading'}],pagination:{hasMore:false}})));await flush();check('Keyed site change ignores late completion',!container.textContent!.includes('Late old scope.bin'));
  delay=false;await act(async()=>{container.querySelector('details')!.open=true;});await click('Load my transfers');actor='actor-b';await render();check('Keyed uploader change removes private row',!container.textContent!.includes('Private uploader filename.bin'));
  enabled=false;await render();check('Permission loss hides transfer UI',container.textContent==='');
  return {ok:true,checks,requestCount:requests.length,configuredTargetUsed:false,boundary:'Actual mounted transfer component keyed as current media route and actual upload client; synthetic fetch only. Actual handlers/native PostgreSQL tested independently.'};
 }finally{clear();await act(async()=>root.unmount());globalThis.fetch=originalFetch;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=false;}
}
