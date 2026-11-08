/** Built repository + actual Drizzle SQL/mapping, with an in-memory query transport. */
import assert from 'node:assert/strict';
import{drizzle}from'drizzle-orm/node-postgres';
import{createSiteRepository}from'../dist/repositories/index.js';
const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const rows=[{id,slug:'owned-site',is_published:true},{id:other,slug:'other-site',is_published:false}];
let queries=0;const fieldsSeen=[];
const db=drizzle({query:async(config,values)=>{queries++;const sql=config.text;assert.equal(config.rowMode,'array');const head=sql.slice(0,sql.indexOf(' from '));const fields=[...head.matchAll(/"([^".]+)"/g)].map(m=>m[1]);assert.deepEqual([...fields].sort(),['id','is_published','slug']);assert.match(sql,/ from "sites" where /);assert.match(sql,/ limit \$/);fieldsSeen.push(fields);const predicate=/"sites"\."(id|slug)" = \$(\d+)/.exec(sql);assert(predicate);return{rows:rows.filter(row=>row[predicate[1]]===values[Number(predicate[2])-1]).slice(0,1).map(row=>fields.map(key=>row[key]))};}});
const repository=createSiteRepository(db);assert.equal(typeof repository.getPublicationByIdOrSlug,'function');
for(const [key,expected]of[[id,{id,slug:'owned-site',isPublished:true}],['owned-site',{id,slug:'owned-site',isPublished:true}],[other,{id:other,slug:'other-site',isPublished:false}],['other-site',{id:other,slug:'other-site',isPublished:false}],['missing',null],['00000000-0000-4000-8000-000000000003',null]])assert.deepEqual(await repository.getPublicationByIdOrSlug(key),expected);
rows[0].is_published=false;assert.equal((await repository.getPublicationByIdOrSlug(id)).isPublished,false);rows[0].is_published=true;assert.equal((await repository.getPublicationByIdOrSlug(id)).isPublished,true);
// A UUID-shaped slug remains supported; a matching actual ID keeps priority.
rows[1].slug=id;assert.equal((await repository.getPublicationByIdOrSlug(id)).id,id);rows[1].slug='00000000-0000-4000-8000-000000000004';assert.equal((await repository.getPublicationByIdOrSlug(rows[1].slug)).id,other);
console.log(JSON.stringify({ok:true,reads:10,queries,columns:['id','slug','is_published'],settingsColumnsRead:0,externalRequests:0,boundary:'Actual built repository and Drizzle SQL/positional mapping; in-memory query responses, no hosted database'}));
