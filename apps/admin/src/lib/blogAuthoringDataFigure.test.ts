import assert from 'node:assert/strict';
import { loadBlogDataFigureCollections } from './blogAuthoringDataFigure';

const collection = { id: 'metrics', siteId: 'site-demo', name: 'Metrics', status: 'published', permissions: { publicRead: true } };
const response = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify({ success: true, data }), { status }));
const signal = () => new AbortController().signal;

const choices = await loadBlogDataFigureCollections('https://public.example/api', 'site-demo', signal(), (_url, init) => {
  assert.equal(init.credentials, 'omit');
  assert.equal(init.method, 'GET');
  assert.deepEqual(init.headers, { accept: 'application/json' });
  return response({ collections: [collection, { ...collection, id: 'private', permissions: { publicRead: false } }, { ...collection, id: 'draft', status: 'draft' }, { ...collection, id: 'other-site', siteId: 'other' }] });
});
assert.deepEqual(choices, [{ id: 'metrics', name: 'Metrics' }]);

console.log('Blog public collection choice visibility checks passed.');
