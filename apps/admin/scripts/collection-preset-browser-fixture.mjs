// Isolated browser journey: actual controls/API handlers, fixture identity and memory storage.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {buildSync} from 'esbuild';
import {mkdtempSync,symlinkSync,writeFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {load} from '../../public/scripts/collection-import-postgres-handlers.mjs';
const {NextRequest,NextResponse}=createRequire(import.meta.url)('next/server');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..'),scratch=mkdtempSync(join(tmpdir(),'backy-collection-preset-browser-')),port=5187;
process.once('exit',()=>rmSync(scratch,{recursive:true,force:true}));
const preset=(index,letter)=>({id:`preset-${letter}-${index}`,name:`${letter.toUpperCase()} preserved ${index}`,collectionId:`collection-${letter}`,fieldKey:'title',targetPath:'props.content',createdBy:'synthetic-seed',updatedBy:'synthetic-seed',createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',extension:{nested:[false,0,{exact:`${letter}-${index}`}]}});
const sites=Object.fromEntries(['a','b'].map(letter=>[letter,{id:`preset-site-${letter}`,slug:`preset-${letter}-alias`,name:`Synthetic ${letter.toUpperCase()}`,settings:{editor:{collectionBindingPresets:[preset(0,letter)],extension:{keep:true}}}}]));
const byId=id=>Object.values(sites).find(site=>site.id===id||site.slug===id)||null;
const schemas=Object.fromEntries(['a','b'].map(letter=>[letter,{id:`collection-${letter}`,siteId:sites[letter].id,name:`Entries ${letter.toUpperCase()}`,slug:`entries-${letter}`,status:'draft',fields:[{id:'title',key:'title',label:'Title',type:'text'}],permissions:{},metadata:{}}]));
const requests=[],audits=[];let holdNext=false,held=[];
const repositories={sites:{getById:async id=>byId(id),getBySlug:async id=>byId(id),update:async(id,input)=>{const site=byId(id);site.settings={...site.settings,...input.settings,editor:{...site.settings.editor,...input.settings.editor}};return{item:site};}},collections:{getById:async(sid,id)=>Object.values(schemas).find(schema=>schema.siteId===sid&&schema.id===id)||null}};
const handler=load('../src/app/api/admin/sites/[siteId]/editor/collection-binding-presets/route.ts',{'next/server':{NextResponse},'@/lib/adminAccess':{requireAdminAccess:async(_req,_id,{permission})=>({session:{user:{id:'synthetic-preset-owner'}},permission})},'@/lib/backyStore':{},'@/lib/repositoryRuntime':{shouldUseDemoStoreFallback:()=>false,getRequiredDatabaseRepositories:async()=>repositories},'@/lib/adminAudit':{recordAdminAudit:async input=>{audits.push({siteId:input.siteId,actorId:input.actorId,count:input.after.length});return{};}}});
let server;
try{
 symlinkSync(join(root,'node_modules'),join(scratch,'node_modules'),'dir');
 execFileSync(join(root,'node_modules/.bin/tailwindcss'),['-c','apps/admin/tailwind.config.js','-i','apps/admin/src/index.css','-o',join(scratch,'proof.css'),'--content','apps/admin/src/**/*.{ts,tsx},apps/admin/scripts/collection-preset-runtime-fixture.tsx'],{cwd:root,stdio:'pipe'});
 buildSync({entryPoints:[join(root,'packages/core/src/index.ts')],outfile:join(scratch,'core.mjs'),bundle:true,format:'esm',platform:'browser',logLevel:'silent'});
 writeFileSync(join(scratch,'index.html'),`<!doctype html><html><head><title>Collection preset acceptance</title><link rel="stylesheet" href="/proof.css"></head><body><div id="root"></div><script type="module" src="/@fs/${root}/apps/admin/scripts/collection-preset-runtime-fixture.tsx"></script></body></html>`);
 server=await createServer({configFile:false,root:scratch,plugins:[react(),{name:'actual-preset-handler',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
  const url=new URL(req.url,'http://fixture.invalid');const json=value=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(value));};
  if(url.pathname==='/fixture/evidence')return json({requests,audits,sites});
  if(url.pathname==='/fixture/fill'){const letter=url.searchParams.get('site');sites[letter].settings.editor.collectionBindingPresets=Array.from({length:48},(_,i)=>preset(i,letter));return json({count:48});}
  if(url.pathname==='/fixture/drop'){const letter=url.searchParams.get('site');sites[letter].settings.editor.collectionBindingPresets.shift();return json({removed:true});}
  if(url.pathname==='/fixture/hold'){holdNext=true;return json({held:true});}
  if(url.pathname==='/fixture/release'){const callbacks=held;held=[];callbacks.forEach(callback=>callback());return json({released:callbacks.length});}
  const match=url.pathname.match(/^\/api\/admin\/sites\/([^/]+)\/editor\/collection-binding-presets$/);
  if(match){let bytes='';for await(const chunk of req)bytes+=chunk;const method=req.method;const response=await handler[method](new NextRequest(url.href,{method,...(bytes?{headers:{'content-type':'application/json'},body:bytes}:{})}),{params:Promise.resolve({siteId:decodeURIComponent(match[1])})});const body=await response.text();requests.push({method,path:url.pathname,status:response.status,...(bytes?{body:JSON.parse(bytes)}:{})});if(holdNext&&method==='GET'){holdNext=false;await new Promise(resolve=>held.push(resolve));}res.statusCode=response.status;return res.end(body);}
  const list=url.pathname.match(/^\/api\/admin\/sites\/([^/]+)\/collections$/);if(list){const site=byId(decodeURIComponent(list[1]));const values=Object.values(schemas).filter(schema=>schema.siteId===site?.id);return json({success:true,data:{collections:values,pagination:{total:values.length,limit:100,offset:0,hasMore:false}}});}
  if(url.pathname.includes('/collections/')&&url.pathname.endsWith('/records'))return json({success:true,data:{records:[],pagination:{total:0,limit:50,offset:0,hasMore:false}}});
  if(url.pathname.startsWith('/api/'))return json({success:true,data:{}});
  next();
 });}}],resolve:{alias:{'@':join(root,'apps/admin/src'),'@backy-cms/core':join(scratch,'core.mjs')},dedupe:['react','react-dom','gsap']},define:{'process.env':'{}','import.meta.env.VITE_BACKY_ADMIN_API_BASE_URL':JSON.stringify(`http://127.0.0.1:${port}/api/admin`)},server:{host:'127.0.0.1',port,strictPort:true,fs:{allow:[root,scratch]}}});
 await server.listen();console.log(JSON.stringify({ready:true,url:`http://127.0.0.1:${port}`,scratch,boundary:'actual PropertyPanel and preset handlers; fixture owner/repository; browser CUA required'}));await new Promise(resolve=>{process.once('SIGTERM',resolve);process.once('SIGINT',resolve);});
}finally{await server?.close();rmSync(scratch,{recursive:true,force:true});}
