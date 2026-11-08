import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MediaStorageRecoveryView } from '../src/components/media/MediaStorageRecoveryPanel';
import { listMediaStorageRecovery, retryMediaStorageRecovery, deleteMediaFromBackend, deleteMediaVersion, restoreMediaVersion } from '../src/lib/mediaApi';
const job = { jobId: 'safe-job', siteId: 'canonical-site', mediaId: '<asset>', operation: 'version-delete' as const, status: 'pending' as const, plannedFiles: 2, remainingFiles: 1, reservedBytes: 2048, attempts: 3, lastErrorCode: 'MEDIA_STORAGE_CLEANUP_PENDING', createdAt: '2026-10-05', updatedAt: '2026-10-05' };
const markup = renderToStaticMarkup(<MediaStorageRecoveryView jobs={[job]} offset={0} total={51} busy={false} message="Retry retains live files" canRetry={false} load={async()=>{}} retry={async()=>{}}/>);
assert.ok(markup.includes('&lt;asset&gt;')); assert.ok(markup.includes('up to 2 KB reserved')); assert.ok(markup.includes('Requires media.edit')); assert.ok(markup.includes('disabled=""')); assert.ok(markup.includes('Private paths stay on the server')); assert.ok(markup.includes('1–50 of 51'));
const original = globalThis.fetch, calls: any[] = [];
try {
 globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return Response.json({ success: true, data: { jobs: [job], pagination: { total: 1, limit: 50, offset: 0, hasMore: false }, storageRecovery: { jobId: job.jobId, status: 'pending', remainingFiles: 1, deletedFiles: 0, protectedFiles: 1 } } }); };
 assert.equal((await listMediaStorageRecovery('site with space')).jobs[0].jobId,job.jobId);
 assert.equal((await retryMediaStorageRecovery('site with space',job.jobId)).status,'pending');
 assert.ok(calls[0].url.includes('/sites/site%20with%20space/media/storage-recovery?pendingOnly=true&limit=50&offset=0')); assert.equal(calls[0].init.credentials,'include'); assert.equal(calls[0].init.cache,'no-store'); assert.equal(calls[1].init.method,'POST'); assert.equal(calls[1].init.body,undefined);
 const order: string[] = []; let release!:()=>void; const wait = new Promise<void>(resolve=>release=resolve);
 const asset = { id:'asset',siteId:'canonical-site',filename:'safe.txt',originalName:'safe.txt',mimeType:'text/plain',type:'document',sizeBytes:1,url:'/uploads/safe',metadata:{},createdAt:'2026-10-05' };
 globalThis.fetch = async (url, init) => { const path=String(url); order.push(init?.method + ':' + path.split('/media/')[1]); if(path.endsWith('/media/first')) await wait; return Response.json({success:true,data:{deleted:true,restored:true,source:'database',media:asset}}); };
 const first = deleteMediaFromBackend('first','same-site'); const second = restoreMediaVersion('asset','retained','same-site'); const third = deleteMediaVersion('asset','retained','same-site');
 await new Promise(resolve=>setTimeout(resolve,0)); assert.deepEqual(order,['DELETE:first']); await deleteMediaFromBackend('other','other-site'); assert.deepEqual(order,['DELETE:first','DELETE:other']); release(); await Promise.all([first,second,third]); assert.deepEqual(order,['DELETE:first','DELETE:other','POST:asset/versions/retained','DELETE:asset/versions/retained']);
} finally { globalThis.fetch=original; }
console.log('Media recovery admin rendered/transport PASS: escaped counts/identity, permission-gated retry, truthful retention, pagination, cookie/no-store canonical scoped paths, no visitor file paths, pending result and same-site delete/restore/version-delete queue with other-site progress. Served browser proof is separate.');
