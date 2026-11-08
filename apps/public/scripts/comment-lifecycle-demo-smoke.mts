import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, renameSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
const previousCwd=process.cwd(),scratch=mkdtempSync('/tmp/backy-comment-demo-');
process.chdir(scratch);process.env.BACKY_DATA_MODE='demo';process.env.NODE_ENV='test';process.env.BACKY_ADMIN_API_KEY='disposable-comment-proof';
try {
 const imported=await import('../src/lib/backyStore.ts'),store:any=(imported as any).default||imported;
 const routeImport=await import('../src/app/api/sites/[siteId]/comments/[commentId]/route.ts'),route:any=(routeImport as any).default||routeImport;
 const path=join(scratch,'data/backy/interactions.json');
 const create=(parentId:string|null=null,siteId='site-demo',targetId='page-demo')=>store.createComment({siteId,targetType:'page',targetId,parentId,content:'Preserved nested content',authorName:'Synthetic author',authorEmail:'private@example.invalid',status:'pending'});
 const call=(id:string,token='disposable-comment-proof')=>route.DELETE(new NextRequest(`http://localhost/api/sites/site-demo/comments/${id}`,{method:'DELETE',headers:{authorization:`Bearer ${token}`}}),{params:Promise.resolve({siteId:'site-demo',commentId:id})});
 const root=create(),child=create(root.id),deep=create(child.id),sibling=create();for(let i=0;i<205;i++)create(root.id);
 let snapshot=JSON.parse(readFileSync(path,'utf8'));const savedRoot=snapshot.comments.find((c:any)=>c.id===root.id);savedRoot.extension={unknown:{preserve:true}};snapshot.extraPrivateEnvelope={retain:true};writeFileSync(path,JSON.stringify(snapshot));
 const unrelated=snapshot.comments.filter((c:any)=>![root.id,child.id,deep.id].includes(c.id)&&c.parentId!==root.id);
 let result=await call(root.id);assert.equal(result.status,200);let body=await result.json();assert.equal(body.data.deletedCount,208);assert.deepEqual(body.data.deleted[0].extension,{unknown:{preserve:true}});assert.equal(body.data.concurrencyBoundary,'demo-single-process');assert.equal(result.headers.get('cache-control'),'no-store');snapshot=JSON.parse(readFileSync(path,'utf8'));assert.deepEqual(snapshot.comments,unrelated);assert.deepEqual(snapshot.extraPrivateEnvelope,{retain:true});assert.ok(store.getCommentById(sibling.id));
 assert.throws(()=>create(root.id),(error:any)=>error.code==='COMMENT_PARENT_CONFLICT');
 const retainedRoot=create(),reply=create(retainedRoot.id),grand=create(reply.id),neighbor=create(retainedRoot.id);assert.equal((await (await call(reply.id)).json()).data.deletedCount,2);assert.ok(store.getCommentById(retainedRoot.id));assert.ok(store.getCommentById(neighbor.id));assert.equal(store.getCommentById(grand.id),undefined);
 const before=readFileSync(path,'utf8');assert.equal((await call(retainedRoot.id,'wrong-fixture-key')).status,401);assert.equal(readFileSync(path,'utf8'),before);
 const directory=join(scratch,'data/backy'),backup=join(scratch,'data/backy-backup');renameSync(directory,backup);writeFileSync(directory,'owned persistence blocker');
 assert.throws(()=>store.deleteCommentSubtree('site-demo',retainedRoot.id),(error:any)=>error.code==='COMMENT_LIFECYCLE_UNAVAILABLE');unlinkSync(directory);renameSync(backup,directory);assert.equal(readFileSync(path,'utf8'),before);assert.ok(store.getCommentById(retainedRoot.id));
 writeFileSync(path,'{corrupt');result=await call(retainedRoot.id);assert.equal(result.status,503);assert.equal((await result.json()).error.code,'COMMENT_INVENTORY_INCOMPLETE');assert.equal(readFileSync(path,'utf8'),'{corrupt');writeFileSync(path,before);
 const invalid=JSON.parse(before);invalid.comments.find((c:any)=>c.id===neighbor.id).targetId='wrong-target';writeFileSync(path,JSON.stringify(invalid));result=await call(retainedRoot.id);assert.equal(result.status,409);assert.equal((await result.json()).error.code,'COMMENT_TREE_INVALID');assert.ok(store.getCommentById(retainedRoot.id));writeFileSync(path,before);
 assert.throws(()=>store.updateCommentThread(retainedRoot.id,{parentId:neighbor.id}),(error:any)=>error.code==='COMMENT_TREE_INVALID');
 console.log('Comment lifecycle actual demo store/DELETE PASS: persisted208 nested subtree, selected-reply descendants, unknown fields/unrelated private records preserved, stale-parent/cycle rejection, auth before writes, persistence failure rollback, corrupt inventory and wrong-target failclosed. Synthetic API key in owned scratch; single-process only.');
} finally {process.chdir(previousCwd);rmSync(scratch,{recursive:true,force:true});}
