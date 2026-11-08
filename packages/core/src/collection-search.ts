import type { BackyJsonValue } from './content-contract';

/** Explicit owner opt-in. Unmapped values and annotation suggestions are not searched. */
export interface BackyCollectionPublicSearch {
  schemaVersion: 'backy.collection-search.v1';
  enabled: boolean;
  descriptionField?: string;
  keywordFields: string[];
}

export const COLLECTION_SEARCH_VALUE_LIMIT = 32_768;
export class BackyCollectionSearchSettingsError extends Error {}
export const COLLECTION_SEARCH_BASE_KEYS = ['title', 'name', 'heading', 'slug', 'description', 'summary', 'excerpt'] as const;
const object = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const fieldKey = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value) && !['constructor', 'prototype', '__proto__'].includes(value);

export function readBackyCollectionPublicSearch(metadata: unknown): BackyCollectionPublicSearch | undefined {
  const value = object(metadata)?.publicSearch;
  if (value === undefined) return undefined;
  const policy = object(value);
  if (!policy || policy.schemaVersion !== 'backy.collection-search.v1' || typeof policy.enabled !== 'boolean'
    || policy.descriptionField !== undefined && !fieldKey(policy.descriptionField)
    || !Array.isArray(policy.keywordFields) || policy.keywordFields.length > 8 || !policy.keywordFields.every(fieldKey)
    || new Set(policy.keywordFields).size !== policy.keywordFields.length) throw new BackyCollectionSearchSettingsError('Invalid collection public search settings.');
  return { schemaVersion: policy.schemaVersion, enabled: policy.enabled,
    ...(policy.descriptionField ? { descriptionField: policy.descriptionField as string } : {}), keywordFields: [...policy.keywordFields] as string[] };
}

export function backyCollectionSearchValueKeys(metadata: unknown): string[] {
  const policy = readBackyCollectionPublicSearch(metadata);
  return [...new Set<string>([...COLLECTION_SEARCH_BASE_KEYS, ...(policy === undefined ? ['caption', 'tags'] : []), ...(policy?.enabled ? [...(policy.descriptionField ? [policy.descriptionField] : []), ...policy.keywordFields] : [])])];
}

/** Demo/in-memory equivalent of the database's selected JSON-subfield projection. */
export function projectBackyCollectionSearchValues(values: unknown, keys: string[]): Record<string, BackyJsonValue> {
  const source = object(values);
  return Object.fromEntries(keys.flatMap(key => {
    if (!source || !hasOwn(source, key) || source[key] === undefined || source[key] === null) return [];
    const serialized = JSON.stringify(source[key]);
    return new TextEncoder().encode(serialized).byteLength <= COLLECTION_SEARCH_VALUE_LIMIT ? [[key, source[key] as BackyJsonValue]] : [];
  }));
}

function descriptionText(value: unknown): string {
  let visited = 0, remaining = 4000;
  const parts: string[] = [];
  function visit(node: unknown, depth: number) {
    if (remaining <= 0 || depth > 12 || ++visited > 512) return;
    if (typeof node === 'string') {
      const text = node.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '').slice(0, remaining).replace(/[\uD800-\uDBFF]$/u, '');
      parts.push(text); remaining -= text.length + 1;
    } else if (Array.isArray(node)) {
      for (const child of node) { visit(child, depth + 1); if (remaining <= 0 || visited > 512) break; }
    } else {
      const record = object(node);
      if (typeof record?.text === 'string') visit(record.text, depth + 1);
      else if (Array.isArray(record?.children)) visit(record.children, depth + 1);
    }
  }
  visit(value, 0);
  return parts.join(' ').trim();
}

export function backyCollectionSearchFields(values: Record<string, unknown>, metadata: unknown): { description?: string; keywords: string[] } {
  const policy = readBackyCollectionPublicSearch(metadata);
  if (!policy?.enabled) return { keywords: [] };
  const keywords = new Map<string, string>();
  for (const field of policy.keywordFields) {
    const value = hasOwn(values, field) ? values[field] : undefined;
    const terms = Array.isArray(value) ? value : [value];
    for (const term of terms.slice(0, 100)) {
      if (typeof term !== 'string' || term.length > 200 || /[\p{Cc}\uD800-\uDFFF]/u.test(term)) continue;
      const label = term.trim().replace(/\s+/gu, ' '), key = label.normalize('NFKC').toLowerCase();
      if (label && key.length <= 200 && !keywords.has(key) && keywords.size < 100) keywords.set(key, label);
    }
  }
  const description = policy.descriptionField && hasOwn(values, policy.descriptionField) ? descriptionText(values[policy.descriptionField]) : '';
  return { ...(description ? { description } : {}), keywords: [...keywords.values()] };
}
