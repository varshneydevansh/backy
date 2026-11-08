import { normalizeBackyJsonObject } from '@backy-cms/core';
import type { CollectionBindingPreset } from '@/lib/adminContentApi';

export const LEGACY_COLLECTION_PRESET_KEY = 'backy.editor.collectionBindingPresets.v1';
export const MAX_COLLECTION_BINDING_PRESETS = 48;
const cacheKey = (canonicalSiteId: string) => `${LEGACY_COLLECTION_PRESET_KEY}:site:${encodeURIComponent(canonicalSiteId)}`;
type PresetStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function normalizeSavedCollectionBindingPresets(value: unknown): CollectionBindingPreset[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeBackyJsonObject).filter(item => (
    typeof item.id === 'string' && Boolean(item.id.trim())
    && typeof item.collectionId === 'string' && Boolean(item.collectionId)
    && typeof item.fieldKey === 'string' && Boolean(item.fieldKey)
  )).map(item => ({
    ...item,
    id: item.id as string,
    name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'Saved preset',
    collectionId: item.collectionId as string,
    fieldKey: item.fieldKey as string,
    targetPath: typeof item.targetPath === 'string' ? item.targetPath : 'props.content',
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '',
  }));
}

export function loadSavedCollectionBindingPresets(storage: PresetStorage, canonicalSiteId: string): CollectionBindingPreset[] {
  if (!canonicalSiteId.trim()) return [];
  try { return normalizeSavedCollectionBindingPresets(JSON.parse(storage.getItem(cacheKey(canonicalSiteId)) || '[]')); }
  catch { return []; }
}

export function persistSavedCollectionBindingPresets(storage: PresetStorage, canonicalSiteId: string, presets: CollectionBindingPreset[]): void {
  if (!canonicalSiteId.trim()) return;
  storage.setItem(cacheKey(canonicalSiteId), JSON.stringify(normalizeSavedCollectionBindingPresets(presets)));
}

// Legacy presets have no trustworthy site identity. Keep their bytes for explicit review.
export function hasLegacyCollectionBindingPresets(storage: PresetStorage): boolean {
  return storage.getItem(LEGACY_COLLECTION_PRESET_KEY) !== null;
}

export function upsertCollectionBindingPreset(presets: CollectionBindingPreset[], preset: CollectionBindingPreset): CollectionBindingPreset[] {
  const next = [preset, ...presets.filter(item => item.id !== preset.id)];
  if (next.length > MAX_COLLECTION_BINDING_PRESETS) throw new Error('This site supports 48 shared presets. Remove a preset before saving another.');
  return next;
}
