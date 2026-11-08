import assert from 'node:assert/strict';
import { getFormWithSubmissions, listFormContacts } from '../src/lib/adminContentApi';
import { collectFormManagementInventory, getCompleteFormWithSubmissions, listCompleteFormContacts } from '../src/lib/formManagementInventory';
const rows = Array.from({ length: 205 }, (_, i) => ({ id: String(i), siteId: 'site', formId: 'form', values: { message: i === 204 ? 'oldest tail' : 'row' } }));
let checks = 0;
async function main() {
 for (const cap of [100, 37, 1]) {
  const offsets: number[] = [];
  const result = await collectFormManagementInventory('site', 'form', async (offset) => {
   offsets.push(offset); return { rows: rows.slice(offset, offset + cap), pagination: { total: rows.length, limit: cap, offset, hasMore: offset + cap < rows.length } };
  });
  assert.deepEqual(result, rows); assert.equal(result.at(-1)?.values.message, 'oldest tail'); assert.equal(offsets[1], cap); checks += 3;
 }
 const page = { rows: rows.slice(0,100), pagination: { total:205, limit:100, offset:0, hasMore:true } };
 for (const invalid of [
  { ...page, pagination: undefined },
  { ...page, pagination: { ...page.pagination, total: -1 } },
  { ...page, pagination: { ...page.pagination, total: 1.5 } },
  { ...page, pagination: { ...page.pagination, limit: 101 } },
  { ...page, pagination: { ...page.pagination, offset: 1 } },
  { ...page, pagination: { ...page.pagination, hasMore: false } },
  { ...page, rows: [] },
  { ...page, rows: [rows[0], rows[0]] },
  { ...page, rows: [{ ...rows[0], siteId: 'foreign' }] },
  { ...page, rows: [{ ...rows[0], formId: 'foreign' }] },
  { ...page, rows: [{ ...rows[0], id: '' }] },
 ]) { await assert.rejects(collectFormManagementInventory('site','form',async()=>invalid), /complete form inbox/); checks++; }
 await assert.rejects(collectFormManagementInventory('site','form',async()=>page,200),/management limit/);checks++;
 for (const kind of ['duplicate','total-drift','wrong-offset','late-failure']) {
  await assert.rejects(collectFormManagementInventory('site','form',async(offset)=> {
   if(!offset) return page;
   if(kind==='late-failure') throw new Error('server unavailable');
   return { rows: kind==='duplicate' ? rows.slice(0,100) : rows.slice(offset,offset+100), pagination:{total:kind==='total-drift'?204:205,limit:100,offset:kind==='wrong-offset'?0:offset,hasMore:true} };
  }));checks++;
 }
 const empty = await collectFormManagementInventory('site','form',async()=>({ rows:[], pagination:{total:0,offset:0,limit:100,hasMore:false} }));assert.deepEqual(empty,[]);checks++;
 const originalFetch = globalThis.fetch;
 try {
  const form = {id:'form',siteId:'site',fields:[]};
  for (const kind of ['submissions','contacts']) {
   const offsets: number[] = [];
   globalThis.fetch = async (url, init) => {
    const query = new URL(String(url)).searchParams;
    assert.equal(query.has('requirePagination'),false);assert.equal(init?.credentials,'include');
    const offset=Number(query.get('offset')||0);offsets.push(offset);
    const pagination={total:205,limit:100,offset,hasMore:offset+100<205};
    return Response.json({success:true,data:kind==='submissions'?{form,submissions:{data:rows.slice(offset,offset+100),pagination}}:{contacts:rows.slice(offset,offset+100),count:205,pagination}});
   };
   const read=()=>kind==='submissions'?getCompleteFormWithSubmissions('site','form'):listCompleteFormContacts('site','form');
   const complete=await read();assert.deepEqual(offsets,[0,100,200]);assert.equal('contacts' in complete?complete.contacts.length:complete.submissions.data.length,205);checks+=2;
   globalThis.fetch=async()=>Response.json({success:true,data:kind==='submissions'?{form:{...form,siteId:'foreign'},submissions:{data:rows,pagination:{total:205,limit:100,offset:0,hasMore:false}}}:{contacts:[{...rows[0],siteId:'foreign'}],count:1,pagination:{total:1,limit:100,offset:0,hasMore:false}}});
   await assert.rejects(read(), /selected site|complete form inbox/);checks++;
   if(kind==='contacts') for (const count of [undefined, -1, 0, 1.5]) {
    globalThis.fetch=async()=>Response.json({success:true,data:{contacts:[],...(count===undefined?{}:{count}),pagination:{total:205,limit:100,offset:0,hasMore:true}}});
    await assert.rejects(read(),/response is incomplete/);checks++;
   }
   for(const missing of ['inventory','pagination']) {
    globalThis.fetch=async()=>Response.json({success:true,data:kind==='submissions'?{form,...(missing==='inventory'?{}:{submissions:{data:[]}})}:{...(missing==='inventory'?{}:{contacts:[]}),count:0}});
    await assert.rejects(read(),/response is incomplete/);checks++;
   }
  }
  globalThis.fetch=async()=>Response.json({success:true,data:{form:{id:'form',siteId:'site'},contacts:[],count:0}});
  assert.equal((await getFormWithSubmissions('site','form')).submissions.data.length,0);
  assert.equal((await listFormContacts('site','form')).pagination.total,0);checks+=2;
 } finally {globalThis.fetch=originalFetch;}
 console.log(`Form management inventory proof passed ${checks} checks: complete205-row and capped-page tails, malformed pagination, scope/duplicates/drift/late failure and explicit management cap.`);
}
void main();
