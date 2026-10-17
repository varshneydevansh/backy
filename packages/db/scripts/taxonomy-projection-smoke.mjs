#!/usr/bin/env node
// Executes built repositories with local adapters only. Never opens a DB connection.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const candidateRoot = path.resolve(process.env.BACKY_TAXONOMY_CANDIDATE_ROOT || fileURLToPath(new URL('../../../', import.meta.url)));
const baselineRoot = process.env.BACKY_TAXONOMY_BASELINE_ROOT && path.resolve(process.env.BACKY_TAXONOMY_BASELINE_ROOT);
let checks = 0;
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const ok = (value, message) => { assert(value, message); checks++; };
const rejects = async (read, message) => { await assert.rejects(read, message); checks++; };
const site = '00000000-0000-4000-8000-000000000001';
const foreign = '00000000-0000-4000-8000-000000000002';
const stamp = '2026-01-01T00:00:00.000Z';

function fixtures() {
  const taxonomy = (id, name, extra = {}) => ({ id, site_id: site, name, slug: name.toLowerCase(), description: null, color: null, sort_order: 0, created_at: stamp, updated_at: stamp, ...extra });
  const post = (id, status, meta, author_id = null, site_id = site) => ({ id, site_id, status, meta, author_id });
  const profile = (id, name, role, extra = {}) => ({ id, email: `${id}@fixture.example`, full_name: name, role, status: 'active', is_active: true, avatar_url: null, created_at: stamp, updated_at: stamp, ...extra });
  return {
    blog_categories: [taxonomy('c2', 'Zebra'), taxonomy('c1', 'Alpha'), taxonomy('foreign-category', 'Foreign', { site_id: foreign })],
    blog_tags: [taxonomy('t2', 'Zebra'), taxonomy('t1', 'Alpha'), taxonomy('foreign-tag', 'Foreign', { site_id: foreign })],
    profiles: [profile('admin', 'Admin', 'admin'), profile('editor', 'Editor', 'editor', { status: null, is_active: false }), profile('assigned', 'Assigned', 'viewer'), profile('unassigned', 'Unassigned', 'viewer'), profile('owner', 'Owner', 'owner')],
    blog_posts: [
      post('p1', 'published', { categoryIds: ['c1', 'c1'], tagIds: ['t1', 't1'] }, 'admin'),
      post('p2', 'draft', { categoryIds: ['c1'], tagIds: ['t1'] }, 'assigned'),
      post('p3', 'scheduled', { categoryIds: ['c2'], tagIds: ['t2'] }, 'external'),
      post('p4', 'archived', { categoryIds: ['c1'], tagIds: ['t1'] }, 'admin'),
      post('p5', 'published', { categoryIds: ['c1'], tagIds: ['t1'] }, 'foreign-author', foreign),
      post('p6', 'published', null),
      post('p7', 'published', [{ categoryIds: ['c1'], tagIds: ['t1'] }]),
      post('p8', 'published', { categoryIds: ['c1', '', 3], tagIds: ['t1', null, ' '] }, 'admin'),
      post('p9', 'published', { categoryIds: 'c1', tagIds: 't1' }),
      post('p10', 'published', { categoryIds: ['category-created'], tagIds: ['tag-created'] }),
    ],
  };
}

async function library(root) {
  // Resolve from this candidate's package, never a globally installed Drizzle.
  const require = createRequire(path.join(root, 'packages/db/package.json'));
  const { drizzle } = await import(pathToFileURL(require.resolve('drizzle-orm/node-postgres')).href);
  const { PgDialect } = await import(pathToFileURL(require.resolve('drizzle-orm/pg-core')).href);
  const { createBlogTaxonomyRepository } = await import(pathToFileURL(path.join(root, 'packages/db/dist/repositories/index.js')).href);
  const schema = await import(pathToFileURL(path.join(root, 'packages/db/dist/schema/index.js')).href);
  return { drizzle, PgDialect, createBlogTaxonomyRepository, schema };
}

function sqlAdapter(lib, { candidate = true, leaky = false, failTable } = {}) {
  const rows = fixtures();
  const original = JSON.stringify(rows);
  const queries = [];
  let contentTouches = 0;
  for (const row of rows.blog_posts) Object.defineProperty(row, 'content', {
    enumerable: true,
    get() {
      contentTouches++;
      if (candidate) throw new Error('Candidate selected article content');
      return { kind: 'post', elements: [{ id: 'saved-body', type: 'paragraph', props: { content: 'Unchanged fixture body' } }] };
    },
  });
  const db = lib.drizzle({ query: async (config, values) => {
    const sql = config.text;
    assert.equal(config.rowMode, 'array', 'Actual Drizzle uses its positional row mapping');
    const table = / from "([^"]+)"/.exec(sql)?.[1];
    assert(rows[table], `Unexpected table: ${table}`);
    const fields = [...sql.slice(0, sql.indexOf(' from ')).matchAll(/"([^".]+)"/g)].map(match => match[1]);
    queries.push({ table, fields, sql });
    if (table === failTable) throw new Error(`Fixture ${table} unavailable`);
    if (candidate && table === 'blog_posts') assert.deepEqual([...fields].sort(), ['author_id', 'meta', 'site_id', 'status'], 'Actual SQL selects exactly four post columns');
    const terms = [...sql.matchAll(/"[^"]+"\."([^".]+)" = \$(\d+)/g)];
    const selected = rows[table].filter(row => (leaky && table === 'blog_posts') || terms.every(match => row[match[1]] === values[Number(match[2]) - 1]));
    return { rows: selected.map(row => fields.map(field => row[field] ?? null)) };
  } });
  const snapshot = () => JSON.stringify(Object.fromEntries(Object.entries(rows).map(([name, records]) => [name, records.map(row => Object.fromEntries(Object.keys(row).filter(key => key !== 'content').map(key => [key, row[key]])))])));
  return { repository: lib.createBlogTaxonomyRepository(db), queries, original, snapshot, get contentTouches() { return contentTouches; } };
}

async function reads(repository) {
  return {
    categories: await repository.listCategories(site),
    tags: await repository.listTags(site),
    authors: await repository.listAuthors(site),
    categoryBySlug: await repository.getCategoryByIdOrSlug(site, ' ALPHA '),
    categoryById: await repository.getCategoryByIdOrSlug(site, 'C1'),
    missingCategory: await repository.getCategoryByIdOrSlug(site, 'missing'),
    tagBySlug: await repository.getTagByIdOrSlug(site, ' ALPHA '),
    tagById: await repository.getTagByIdOrSlug(site, 'T1'),
    missingTag: await repository.getTagByIdOrSlug(site, 'missing'),
    foreignCategories: await repository.listCategories(foreign),
    foreignTags: await repository.listTags(foreign),
    foreignAuthors: await repository.listAuthors(foreign),
  };
}

// Mutation helper-path adapter, deliberately not a database-write certification.
// It honors projected columns and the actual Drizzle equality conditions.
function cannedAdapter(lib, { failPosts = false } = {}) {
  const snakeRows = fixtures();
  const camel = value => value.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
  const tables = Object.fromEntries(Object.entries(snakeRows).map(([name, rows]) => [name, rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [camel(key), structuredClone(value)])))]));
  const tableName = table => table === lib.schema.blogPosts ? 'blog_posts' : table === lib.schema.blogCategories ? 'blog_categories' : table === lib.schema.blogTags ? 'blog_tags' : table === lib.schema.profiles ? 'profiles' : assert.fail('Unexpected canned table');
  const matches = (row, condition) => {
    const { sql, params } = new lib.PgDialect().sqlToQuery(condition);
    const terms = [...sql.matchAll(/"[^"]+"\."([^".]+)" = \$(\d+)/g)];
    assert(terms.length, 'Canned mutation/filter has an actual equality guard');
    return terms.every(match => row[camel(match[1])] === params[Number(match[2]) - 1]);
  };
  const writes = [];
  const db = {
    select: projection => ({ from(table) {
      const name = tableName(table);
      let rows = tables[name];
      const query = {
        where(condition) { rows = rows.filter(row => matches(row, condition)); return query; },
        then(resolve, reject) {
          const result = Promise.resolve().then(() => {
            if (failPosts && name === 'blog_posts') throw new Error('Fixture posts unavailable after mutation');
            return rows.map(row => projection ? Object.fromEntries(Object.entries(projection).map(([key, column]) => [key, row[camel(column.name)]])) : structuredClone(row));
          });
          return result.then(resolve, reject);
        },
      };
      return query;
    } }),
    insert: table => ({ values(values) { return { async returning() {
      const name = tableName(table);
      const row = { id: name === 'blog_categories' ? 'category-created' : 'tag-created', description: null, color: null, sortOrder: 0, createdAt: stamp, ...values };
      tables[name].push(row); writes.push(['insert', name]); return [row];
    } }; } }),
    update: table => ({ set(values) { return { where(condition) { return { async returning() {
      const name = tableName(table);
      const found = tables[name].filter(row => matches(row, condition));
      for (const row of found) Object.assign(row, values);
      writes.push(['update', name]); return found;
    } }; } }; } }),
    delete: table => ({ async where(condition) {
      const name = tableName(table);
      tables[name] = tables[name].filter(row => !matches(row, condition)); writes.push(['delete', name]);
    } }),
  };
  return { repository: lib.createBlogTaxonomyRepository(db), writes };
}

async function mutations(repository) {
  const result = {};
  result.categoryCreated = (await repository.createCategory({ siteId: site, name: 'Created', slug: 'created' })).item;
  result.tagCreated = (await repository.createTag({ siteId: site, name: 'Created', slug: 'created' })).item;
  result.categoryUpdated = (await repository.updateCategory(site, 'c1', { name: 'Updated', color: '#123456', sortOrder: 2 })).item;
  result.tagUpdated = (await repository.updateTag(site, 't1', { name: 'Updated', description: 'Preserved fixture' })).item;
  // updatedAt is intentionally generated by the real repository at write time.
  for (const item of Object.values(result)) delete item.updatedAt;
  result.categoryDeleted = await repository.deleteCategory(site, 'c1');
  result.categoryMissing = await repository.deleteCategory(site, 'missing');
  result.tagDeleted = await repository.deleteTag(site, 't1');
  result.tagMissing = await repository.deleteTag(site, 'missing');
  result.categoryAfterDelete = await repository.getCategoryByIdOrSlug(site, 'c1');
  result.tagAfterDelete = await repository.getTagByIdOrSlug(site, 't1');
  return result;
}

const candidate = await library(candidateRoot);
const adapter = sqlAdapter(candidate);
const actual = await reads(adapter.repository);
equal(adapter.contentTouches, 0, 'Candidate never touches article bodies');
equal(adapter.snapshot(), adapter.original, 'Read source rows remain immutable');
equal(actual.categories.map(row => [row.id, row.postCount]), [['c1', 3], ['c2', 1]], 'Draft/scheduled count; archived/foreign/malformed excluded; duplicates count once');
equal(actual.tags.map(row => [row.id, row.postCount]), [['t1', 3], ['t2', 1]], 'Tags retain exact count policy');
equal(actual.authors.map(row => [row.id, row.postCount, row.status]), [['admin', 2, 'active'], ['assigned', 1, 'active'], ['editor', 0, 'inactive'], ['external', 1, 'external']], 'Assigned viewer, admin/editor, external author semantics');
equal(actual.categoryBySlug, actual.categoryById, 'Normalized category identifiers');
equal(actual.tagBySlug, actual.tagById, 'Normalized tag identifiers');
equal(actual.missingCategory, null, 'Unknown category');
equal(actual.missingTag, null, 'Unknown tag');
equal(actual.foreignCategories.map(row => [row.id, row.postCount]), [['foreign-category', 0]], 'Other tenant taxonomy remains scoped');
const leaky = sqlAdapter(candidate, { leaky: true });
equal(await reads(leaky.repository), actual, 'In-memory post tenant guard survives an overbroad adapter');
equal(leaky.contentTouches, 0, 'Overbroad adapter still omits content');

for (const failTable of ['blog_posts', 'blog_categories', 'blog_tags', 'profiles']) {
  const failed = sqlAdapter(candidate, { failTable }).repository;
  const method = failTable === 'blog_tags' ? 'listTags' : failTable === 'profiles' ? 'listAuthors' : 'listCategories';
  await rejects(() => failed[method](site), `Actual SQL ${failTable} failure propagates`);
}

const changed = cannedAdapter(candidate);
const changedOutput = await mutations(changed.repository);
equal(changedOutput.categoryCreated.postCount, 1, 'Create-category response uses existing post metadata');
equal(changedOutput.tagCreated.postCount, 1, 'Create-tag response uses existing post metadata');
equal(changedOutput.categoryUpdated.postCount, 3, 'Update-category response retains count');
equal(changedOutput.tagUpdated.postCount, 3, 'Update-tag response retains count');
equal([changedOutput.categoryDeleted, changedOutput.categoryMissing, changedOutput.tagDeleted, changedOutput.tagMissing], [true, false, true, false], 'Delete existence paths');
equal([changedOutput.categoryAfterDelete, changedOutput.tagAfterDelete], [null, null], 'Deleted lookups return null');
for (const method of ['createCategory', 'createTag', 'updateCategory', 'updateTag']) {
  const failed = cannedAdapter(candidate, { failPosts: true });
  const invoke = method.startsWith('create') ? () => failed.repository[method]({ siteId: site, name: 'Created', slug: 'created' }) : () => failed.repository[method](site, method === 'updateCategory' ? 'c1' : 't1', { name: 'Updated' });
  await rejects(invoke, `${method} count-read failure propagates after write`);
  equal(failed.writes.length, 1, 'Read-after-write order preserved, no automatic retry');
}

let baselineBodyTouches = null;
if (baselineRoot) {
  const baseline = await library(baselineRoot);
  const old = sqlAdapter(baseline, { candidate: false });
  equal(actual, await reads(old.repository), 'Exact baseline/candidate mapped read output parity');
  ok(old.contentTouches > 0, 'Baseline actual SQL reads article bodies');
  baselineBodyTouches = old.contentTouches;
  equal(changedOutput, await mutations(cannedAdapter(baseline).repository), 'Baseline/candidate mutation helper output parity');
}

const proof = { passed: true, checks, actualBuiltRepository: true, actualDrizzleNodePostgresAdapter: true, networkRequests: 0, databaseConnections: 0, candidateContentTouches: adapter.contentTouches, baselineContentTouches: baselineBodyTouches, postSelectedColumns: [...new Set(adapter.queries.filter(query => query.table === 'blog_posts').flatMap(query => query.fields))].sort(), baselineCompared: Boolean(baselineRoot), sqlQueries: adapter.queries.length, sourceRowsImmutable: true, mutationHelperPaths: true, limitations: 'SELECT SQL and mapping use the actual built repository and Drizzle with a synthetic query client. Mutation helper paths use a canned in-memory adapter; no real database writes, provider behavior or live latency is certified.' };
if (process.env.BACKY_TAXONOMY_PROOF) fs.writeFileSync(process.env.BACKY_TAXONOMY_PROOF, `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify(proof));
