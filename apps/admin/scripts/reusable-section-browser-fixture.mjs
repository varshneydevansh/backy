// Actual editor fixture, without API/provider writes. Use CUA for browser interaction.
// A core snapshot prevents unrelated concurrent source edits from reloading the journey.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { buildSync } from 'esbuild';
import { mkdtempSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const scratch = mkdtempSync(join(tmpdir(), 'backy-section-browser-'));
// Vite also owns process signals; retain cleanup when its handler exits first.
process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));
let server;
let sourceMode = 'current';
const firstRoot={id:'source-first',name:'First root',type:'heading',x:20,y:20,width:260,height:70,props:{content:'Actual first root',extension:{retain:true}}};
const secondRoot=label=>({id:'source-second',name:'Second root',type:'button',x:20,y:120,width:240,height:70,props:{label,extension:{retain:true}},responsive:{mobile:{width:200}},animation:{type:'fade-in',duration:.4,trigger:'load'},children:[{id:'source-nested',name:'Nested root content',type:'text',x:5,y:5,width:150,height:20,props:{content:'Nested retained',extension:{retain:true}}}]});
try {
  symlinkSync(join(root, 'node_modules'), join(scratch, 'node_modules'), 'dir');
  execFileSync(join(root, 'node_modules/.bin/tailwindcss'), [
    '-c', 'apps/admin/tailwind.config.js', '-i', 'apps/admin/src/index.css',
    '-o', join(scratch, 'proof.css'), '--content', 'apps/admin/src/**/*.{ts,tsx}',
  ], { cwd: root, stdio: 'pipe' });
  buildSync({ entryPoints: [join(root, 'packages/core/src/index.ts')],
    outfile: join(scratch, 'core.mjs'), bundle: true, format: 'esm',
    platform: 'browser', logLevel: 'silent' });
  writeFileSync(join(scratch, 'index.html'), `<!doctype html><html><head>
    <title>Actual reusable section acceptance</title><link rel="stylesheet" href="/proof.css">
    </head><body><div id="root"></div><script type="module"
    src="/@fs/${root}/apps/admin/scripts/reusable-section-runtime-fixture.tsx"></script></body></html>`);
  server = await createServer({ configFile: false, root: scratch, plugins: [react(), { name: 'synthetic-section-library', configureServer(vite) { vite.middlewares.use((req,res,next) => {
      const url = new URL(req.url, 'http://fixture.invalid');
      if(url.pathname === '/fixture/source-mode') { sourceMode = url.searchParams.get('mode'); res.end('{}'); return; }
      if(!url.pathname.startsWith('/api/')) return next();
      res.setHeader('content-type','application/json');
      if(url.pathname.endsWith('/reusable-sections')) {
        const all = Array.from({length:205},(_,i)=>({id:`section-${i}`,siteId:'site-section-proof',name:i===204?'Tail multi-root section':`Fixture section ${i}`,slug:`section-${i}`,status:'active',category:'general',tags:[],createdAt:'2026-01-01T00:00:00.000Z',updatedAt:sourceMode==='reordered'?'2026-10-05T00:00:00.000Z':'2026-01-01T00:00:00.000Z',content:{extension:{retain:true},elements:i===204?(sourceMode==='reordered'?[secondRoot('Updated second root'),firstRoot]:[firstRoot,secondRoot('Current second root')]):[firstRoot]},metadata:{extension:{retain:true}}})).filter(s=>sourceMode!=='missing'||s.id!=='section-204');
        const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||100);
        res.end(JSON.stringify({success:true,data:{sections:all.slice(offset,offset+limit),pagination:{total:all.length,limit,offset,hasMore:offset+limit<all.length}}})); return;
      }
      if(url.pathname.includes('interactive-components')) { res.end(JSON.stringify({success:true,data:{siteId:'site-section-proof',components:[],pagination:{total:0,limit:100,offset:0,hasMore:false},contract:{sandbox:{enabled:false}}}})); return; }
      res.end(JSON.stringify({success:true,data:{}}));
    }); } }],
    resolve: { alias: { '@': join(root, 'apps/admin/src'), '@backy-cms/core': join(scratch, 'core.mjs') },
      dedupe: ['react', 'react-dom', 'gsap'] }, define: { 'process.env': '{}', 'import.meta.env.VITE_BACKY_ADMIN_API_BASE_URL': JSON.stringify('http://127.0.0.1:5183/api/admin') },
    server: { host: '127.0.0.1', port: 5183, strictPort: true, fs: { allow: [root, scratch] } } });
  await server.listen();
  console.log(JSON.stringify({ ready: true, url: 'http://127.0.0.1:5183', scratch,
    boundary: 'actual editor; synthetic library HTTP; disposable local save; no provider proof' }));
  await new Promise(resolve => { process.once('SIGTERM', resolve); process.once('SIGINT', resolve); });
} finally {
  await server?.close();
  rmSync(scratch, { recursive: true, force: true });
}
