import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { backyCollectionSearchFields, backyCollectionSearchValueKeys, projectBackyCollectionSearchValues, readBackyCollectionPublicSearch, BackyCollectionSearchSettingsError } = createRequire(import.meta.url)('../src/collection-search.ts');
let checks = 0;
const equal = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
const metadata = { publicSearch: { schemaVersion: 'backy.collection-search.v1', enabled: true, descriptionField: 'caption', keywordFields: ['tags', 'place_label', 'category'] } };
equal(backyCollectionSearchFields({ tags: ['not-opted-in'], caption: 'Not selected' }, {}), { keywords: [] });
equal(readBackyCollectionPublicSearch({}), undefined);
equal(backyCollectionSearchValueKeys(metadata), ['title', 'name', 'heading', 'slug', 'description', 'summary', 'excerpt', 'caption', 'tags', 'place_label', 'category']);
const values = { title: 'A photograph', caption: [{ children: [{ text: 'Glass roof' }, { text: 'above a station.' }], attrs: { private: 'NEVER' } }], tags: ['Railway', 'Ｒａｉｌｗａｙ', 'railway', '  Architecture ', '', 42, { suggestion: 'NEVER' }], place_label: 'Berlin', category: 'transport', annotation_proposals: { tags: ['NEVER'] }, source_details: { gps: 'NEVER' }, variant_refs: 'x'.repeat(1000000) };
const selected = projectBackyCollectionSearchValues(values, backyCollectionSearchValueKeys(metadata));
equal(backyCollectionSearchFields(selected, metadata), { description: 'Glass roof above a station.', keywords: ['Railway', 'Architecture', 'Berlin', 'transport'] });
assert(!JSON.stringify(backyCollectionSearchFields(selected, metadata)).includes('NEVER')); checks++; // Rich-text attrs never become search description text.
for (const patch of [{ schemaVersion: 'future' }, { enabled: 'true' }, { keywordFields: ['__proto__'] }, { keywordFields: ['tags', 'tags'] }, { keywordFields: Array.from({ length: 9 }, (_, i) => `field${i}`) }, { descriptionField: 'source.details' }]) {
  assert.throws(() => readBackyCollectionPublicSearch({ publicSearch: { ...metadata.publicSearch, ...patch } }), BackyCollectionSearchSettingsError); checks++;
}
equal(backyCollectionSearchFields(values, { publicSearch: { ...metadata.publicSearch, enabled: false } }), { keywords: [] });
equal(projectBackyCollectionSearchValues({ caption: '界'.repeat(12000) }, ['caption']), {});
const many = backyCollectionSearchFields({ tags: Array.from({ length: 150 }, (_, i) => `tag-${i}`) }, metadata);
equal(many.keywords.length, 100);
equal(backyCollectionSearchFields({ tags: ['x'.repeat(201), 'ﬃ'.repeat(100), 'line\nbreak', '\ud800', 'valid'] }, metadata).keywords, ['valid']);
const long = backyCollectionSearchFields({ caption: 'x'.repeat(3999) + '😀last' }, metadata);
equal(long.description?.length, 3999);
const nested: any = { children: [] }; nested.children.push(nested);
equal(backyCollectionSearchFields({ caption: nested }, metadata).description, undefined);
console.log(JSON.stringify({ passed: true, checks, boundary: 'Pure source policy/projection; no owner, provider or network requests.' }));
