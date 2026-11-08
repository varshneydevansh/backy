/** Owned loopback HTTP bridge around actual GET/HEAD; generated PCM, no provider or configured data. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { mediaFileStreamingFixture, runMediaFileStreamingChecks } from './media-file-streaming-fixture.mts';
if(process.argv.length>2)throw Error('External targets are not accepted.');
const fixture=mediaFileStreamingFixture(),port=5244,origin=`http://127.0.0.1:${port}`,path='/api/sites/stream-fixture/media/stream-audio/file';
const served:Array<{method:string;range:string|null;status:number;bytes:number}>=[];let stop!:()=>void;const stopped=new Promise<void>(resolve=>{stop=resolve;});
const html=`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Guarded media streaming acceptance</title><style>body{font:16px system-ui;max-width:900px;margin:40px auto;padding:20px;color:#252525;background:#fafafa}button{min-height:44px;padding:0 16px;background:white;border:1px solid #888;border-radius:6px}audio{display:block;width:100%;margin:24px 0}pre{white-space:pre-wrap;line-height:1.6;border:1px solid #ccc;padding:16px;border-radius:6px}</style><h1>Guarded media streaming acceptance</h1><p>Actual file GET/HEAD and access controls. Owned loopback server; generated6MiB PCM audio.</p><button id="run">Load and seek native audio</button><audio id="audio" controls muted preload="none"></audio><pre id="proof">HTTP/source checks passed. Native audio acceptance pending.</pre><script>
const button=document.getElementById('run'),audio=document.getElementById('audio'),proof=document.getElementById('proof');
function event(name){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Audio '+name+' timed out')),10000);audio.addEventListener(name,()=>{clearTimeout(timer);resolve();},{once:true});audio.addEventListener('error',()=>{clearTimeout(timer);reject(Error('Native audio decoder error'));},{once:true});});}
button.onclick=async()=>{button.disabled=true;try{const metadata=event('loadedmetadata');audio.src='${path}';audio.load();await metadata;const seek=event('seeked');audio.currentTime=12;await seek;await audio.play();audio.pause();const response=await fetch('/fixture/native-proof',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({duration:audio.duration,currentTime:audio.currentTime,readyState:audio.readyState,nativeDecoder:true})});const result=await response.json();proof.textContent=JSON.stringify(result,null,2);}catch(error){proof.textContent=JSON.stringify({ok:false,error:String(error)},null,2);}finally{button.disabled=false;}};
</script></html>`;
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url!,origin);
 if(url.pathname==='/fixture/stop'&&req.method==='POST'){res.end('Fixture stopping');stop();return;}
 if(url.pathname==='/'){res.setHeader('content-type','text/html; charset=utf-8');res.setHeader('cache-control','no-store');res.end(html);return;}
 if(url.pathname==='/fixture/native-proof'&&req.method==='POST'){
  const chunks=[];for await(const chunk of req){chunks.push(chunk);if(chunks.reduce((n,b)=>n+b.length,0)>4096)throw Error('Fixture proof too large');}
  const input=JSON.parse(Buffer.concat(chunks).toString()),ranges=served.filter(entry=>entry.method==='GET'&&entry.range&&entry.status===206);assert(input.duration>30&&Math.abs(input.currentTime-12)<0.5&&input.readyState>=2&&input.nativeDecoder);assert(ranges.length>0);
  const result={ok:true,nativeAudio:{duration:input.duration,currentTime:input.currentTime,readyState:input.readyState},guardedRangeRequests:ranges,sourceBytes:fixture.bytes.length,configuredTargetUsed:false,boundary:'Chrome native audio decoder and seek against actual file handler via owned HTTP bridge; generated PCM and synthetic repository/storage only.'};writeFileSync('/tmp/backy-media-file-native-player-proof.json',JSON.stringify(result,null,2),{mode:0o600});res.setHeader('content-type','application/json');res.end(JSON.stringify(result));return;
 }
 if(url.pathname!==path||!['GET','HEAD'].includes(req.method!)){res.writeHead(404).end();return;}
 const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
 const abort=new AbortController();res.on('close',()=>{if(!res.writableFinished)abort.abort();});
 const response=await fixture.route[req.method!](new NextRequest(url,{method:req.method,headers,signal:abort.signal}),{params:Promise.resolve({siteId:fixture.site.id,mediaId:fixture.media.id})});
 served.push({method:req.method!,range:headers.get('range'),status:response.status,bytes:Number(response.headers.get('content-length')||0)});
 res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body)await pipeline(Readable.fromWeb(response.body as any),res);else res.end();
 }catch(error){if(!res.headersSent)res.writeHead(500,{'content-type':'application/json'}).end(JSON.stringify({ok:false,error:String(error)}));else res.destroy();}});
try{
 await new Promise<void>(resolve=>server.listen(port,'127.0.0.1',resolve));const sourceProof=await runMediaFileStreamingChecks(fixture);
 const full=await fetch(origin+path),reader=full.body!.getReader(),chunks=[];while(true){const piece=await reader.read();if(piece.done)break;chunks.push(piece.value);}const received=Buffer.concat(chunks);assert(chunks.length>1);assert.deepEqual(received,fixture.bytes);
 for(const [range,start,end] of [['bytes=16-255',16,256],['bytes=-99',fixture.bytes.length-99,fixture.bytes.length],['bytes=5000000-',5000000,fixture.bytes.length]] as const){const response=await fetch(origin+path,{headers:{range}});assert.equal(response.status,206);assert.deepEqual(Buffer.from(await response.arrayBuffer()),fixture.bytes.subarray(start,end));}
 const head=await fetch(origin+path,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(fixture.bytes.length));assert.equal((await head.arrayBuffer()).byteLength,0);
 const invalid=await fetch(origin+path,{headers:{range:'bytes=1-0'}});assert.equal(invalid.status,416);
 const proof={...sourceProof,http:{exactSha256:createHash('sha256').update(received).digest('hex'),transportChunks:chunks.length,checks:['full response exceeds4.5MiB','range/suffix/open-ended exact bytes','HEAD no body','invalid416']}};
 writeFileSync('/tmp/backy-media-file-streaming-http-proof.json',JSON.stringify(proof,null,2),{mode:0o600});served.length=0;
 console.log(JSON.stringify({ready:true,url:origin,proofPath:'/tmp/backy-media-file-streaming-http-proof.json',sourceChecks:proof.checks.length}));process.once('SIGTERM',stop);process.once('SIGINT',stop);await stopped;
}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
