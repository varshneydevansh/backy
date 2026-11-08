/** Local-only actual upload client and mounted transfer acceptance. No configured database or provider requests. */
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import { mkdtempSync,writeFileSync,symlinkSync,rmSync } from 'node:fs';
import { join,resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
if(process.argv.length>2)throw Error('No external target accepted.');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..'),scratch=mkdtempSync('/tmp/backy-upload-mounted-'),port=5243,origin=`http://127.0.0.1:${port}`,proofPath='/tmp/backy-media-upload-mounted-proof.json';let server:any,stopFixture!:()=>void;const stopped=new Promise<void>(resolve=>{stopFixture=resolve;});
try {
 symlinkSync(join(root,'node_modules'),join(scratch,'node_modules'),'dir');
 execFileSync(join(root,'node_modules/.bin/tailwindcss'),['-c','apps/admin/tailwind.config.js','-i','apps/admin/src/index.css','-o',join(scratch,'proof.css'),'--content','apps/admin/src/components/media/**/*.{ts,tsx},apps/admin/src/components/ui/**/*.{ts,tsx},apps/admin/scripts/media-upload-session-*.tsx'],{cwd:root,stdio:'pipe'});
 writeFileSync(join(scratch,'index.html'),`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Media transfer acceptance</title><link rel="stylesheet" href="/proof.css"></head><body><div id="root"></div><script type="module" src="/@fs/${root}/apps/admin/scripts/media-upload-session-runtime-fixture.tsx"></script></body></html>`);
 server=await createServer({configFile:false,root:scratch,plugins:[react(),{name:'proof',configureServer(vite:any){vite.middlewares.use(async(req:any,res:any,next:any)=>{if(req.url==='/fixture/stop'&&req.method==='POST'){res.end('Fixture stopping');stopFixture();return;}if(req.url==='/fixture/proof'&&req.method==='POST'){const chunks=[];for await(const chunk of req)chunks.push(chunk);writeFileSync(proofPath,Buffer.concat(chunks),{mode:0o600});res.setHeader('content-type','application/json');return res.end('{"saved":true}');}next();});}}],resolve:{alias:{'@':join(root,'apps/admin/src')},dedupe:['react','react-dom']},define:{'import.meta.env.VITE_BACKY_ADMIN_API_BASE_URL':JSON.stringify(origin+'/api/admin')},server:{host:'127.0.0.1',port,strictPort:true,fs:{allow:[root,scratch]}}});
 await server.listen();console.log(JSON.stringify({ready:true,url:origin,proofPath,scratch}));process.once('SIGTERM',stopFixture);process.once('SIGINT',stopFixture);await stopped;
} finally {await server?.close();rmSync(scratch,{recursive:true,force:true});}
