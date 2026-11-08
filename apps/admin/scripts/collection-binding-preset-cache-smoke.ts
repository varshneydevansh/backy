import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  hasLegacyCollectionBindingPresets, LEGACY_COLLECTION_PRESET_KEY,
  loadSavedCollectionBindingPresets, normalizeSavedCollectionBindingPresets,
  persistSavedCollectionBindingPresets, upsertCollectionBindingPreset,
} from '../src/components/editor/collectionBindingPresetCache';
const bytes = new Map<string, string>();
const storage = { getItem: (key: string) => bytes.get(key) ?? null, setItem: (key: string, value: string) => { bytes.set(key, value); } };
const preset = (index: number) => ({ id: `preset-${index}`, name: `Preset ${index}`, collectionId: 'collection-a', fieldKey: 'title', targetPath: 'props.registered.nested.text', updatedAt: '2026-10-05T00:00:00Z', createdBy: 'owner', updatedBy: 'editor', extension: { nested: [true, { preserve: 'exact' }] } });
const legacy = JSON.stringify([preset(999)]);
storage.setItem(LEGACY_COLLECTION_PRESET_KEY, legacy);
assert.equal(hasLegacyCollectionBindingPresets(storage), true);
assert.deepEqual(loadSavedCollectionBindingPresets(storage, 'site-a'), [], 'unscoped cache never attaches to a site');
const many = Array.from({ length: 105 }, (_, index) => preset(index));
persistSavedCollectionBindingPresets(storage, 'site-a', many);
persistSavedCollectionBindingPresets(storage, 'site-b', [preset(106)]);
assert.deepEqual(loadSavedCollectionBindingPresets(storage, 'site-a'), many, 'legacy oversize inventory retains all metadata');
assert.deepEqual(loadSavedCollectionBindingPresets(storage, 'site-b'), [preset(106)], 'sites remain isolated');
assert.equal(storage.getItem(LEGACY_COLLECTION_PRESET_KEY), legacy, 'legacy review bytes remain untouched');
assert.deepEqual(loadSavedCollectionBindingPresets(storage, ''), []);
persistSavedCollectionBindingPresets(storage, '', []);
assert.equal(bytes.size, 3);
const full = many.slice(0, 48);
assert.throws(() => upsertCollectionBindingPreset(full, preset(106)), /48 shared presets/);
assert.deepEqual(full, many.slice(0, 48), 'limit rejection never truncates source');
const replaced = upsertCollectionBindingPreset(full, { ...preset(4), name: 'Retitled' });
assert.equal(replaced.length, 48); assert.equal(replaced[0].name, 'Retitled');
assert.equal(replaced.some(item => item.id === 'preset-47'), true);
assert.throws(() => upsertCollectionBindingPreset(many, preset(4)), /48 shared presets/);
const unsafe = JSON.parse('{"id":"safe","collectionId":"a","fieldKey":"title","__proto__":{"polluted":true},"extension":{"constructor":{"prototype":{"polluted":true}},"safe":1}}');
const normalized = normalizeSavedCollectionBindingPresets([unsafe]);
assert.deepEqual(normalized[0].extension, { safe: 1 });
assert.equal(Object.hasOwn(normalized[0], '__proto__'), false);
const panel = readFileSync(new URL('../src/components/editor/PropertyPanel.tsx', import.meta.url), 'utf8');
assert.ok(panel.includes('listCollectionBindingPresetState(siteId)'));
assert.ok(panel.includes('setPresetScopeId(site.id)'));
assert.ok(panel.includes('result.site.id !== scopeId'));
assert.ok(panel.includes('if (session !== presetSession.current) return'));
assert.ok(panel.includes('upsertCollectionBindingPreset(savedBindingPresets, preset)'));
assert.equal(panel.includes('slice(0, 24)'), false);
assert.equal(panel.includes('mergeCollectionBindingPresets'), false, 'server deletions never resurrect from cache');
assert.ok(panel.includes('...existing,\n      id: existing?.id'));
console.log('Collection preset cache passed: canonical-site isolation, legacy review, complete105 inventory, no truncation at48, replacement and metadata/prototype boundaries, stale-session/source guards.');
