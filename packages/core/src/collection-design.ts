import type { BackyCollection, BackyCollectionField, BackyCollectionUpdateInput } from './repositories';
import type { BackyJsonObject } from './content-contract';
import { serializeTemplateRevisionValue } from './template-history';
import { assertProductDesignHistorySafe } from './product-design';

type JsonRecord = Record<string, unknown>;
const object = (value: unknown): value is JsonRecord => !!value && typeof value === 'object' && !Array.isArray(value);
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const presentation = new Set(['label', 'helpText', 'sortOrder']);
/** The remaining field properties affect stored values, validation or extensions. */
export function collectionFieldSemanticSchema(fields: BackyCollectionField[]): JsonRecord {
  const result: JsonRecord = Object.create(null);
  for (const field of fields) {
    if (!field.key || ['__proto__','prototype','constructor'].includes(field.key) || Object.prototype.hasOwnProperty.call(result, field.key)) throw Error('COLLECTION_TEMPLATE_SCHEMA_INVALID');
    const schema = Object.fromEntries(Object.entries(field).filter(([key,value]) => !presentation.has(key) && value !== undefined));
    schema.required = field.required === true; schema.unique = field.unique === true;
    if (!schema.referenceCollectionId) delete schema.referenceCollectionId;
    result[field.key] = schema;
  }
  return result;
}
export function collectionTemplateSchemaConflicts(base: BackyCollectionField[], target: BackyCollectionField[]): string[] {
  const old = collectionFieldSemanticSchema(base), next = collectionFieldSemanticSchema(target), paths: string[] = [];
  const escape = (key: string) => key.replace(/~/g, '~0').replace(/\//g, '~1');
  for (const key of new Set([...Object.keys(old), ...Object.keys(next)])) {
    const a = old[key], b = next[key];
    if (!object(a) || !object(b)) { paths.push('/fields/@' + escape(key)); continue; }
    for (const property of new Set([...Object.keys(a), ...Object.keys(b)]))
      if (Object.prototype.hasOwnProperty.call(a, property) !== Object.prototype.hasOwnProperty.call(b, property) || serializeTemplateRevisionValue(a[property] ?? null) !== serializeTemplateRevisionValue(b[property] ?? null)) paths.push('/fields/@' + escape(key) + '/' + escape(property));
  }
  return paths.slice(0, 64);
}
export interface BackyCollectionTemplateDesign {
  fieldsByKey: Record<string, BackyCollectionField>;
  fieldOrder: string[];
  metadata: JsonRecord;
  /** Declared registry schema policy; never restores current operational row rules. */
  templatePolicy: JsonRecord;
}
export function collectionTemplateBindingConflicts(before: unknown, after: unknown): string[] {
  const paths: string[] = [], protectedKeys = new Set(['collectionId', 'collectionSlug', 'recordId', 'fieldKey', 'frontendFieldKeyMap', 'editorCollectionBlockProps']);
  const visit = (a: unknown, b: unknown, path: string, depth: number) => {
    if (depth > 64) throw Error('COLLECTION_DESIGN_REVISION_LIMIT');
    if (Array.isArray(a) || Array.isArray(b)) {
      const old = Array.isArray(a) ? a : [], next = Array.isArray(b) ? b : [];
      const keyed = [...old, ...next].every(item => object(item) && typeof item.id === 'string')
        && new Set(old.map(item => item.id)).size === old.length && new Set(next.map(item => item.id)).size === next.length;
      if (keyed) for (const id of new Set([...old, ...next].map(item => item.id))) visit(old.find(item => item.id === id), next.find(item => item.id === id), path + '/@' + id, depth + 1);
      else for (let i = 0; i < Math.max(old.length, next.length); i++) visit(old[i], next[i], path + '/' + i, depth + 1);
    } else if (object(a) || object(b)) {
      const old = object(a) ? a : {}, next = object(b) ? b : {};
      for (const key of new Set([...Object.keys(old), ...Object.keys(next)])) {
        const child = path + '/' + key.replace(/~/g, '~0').replace(/\//g, '~1');
        if (protectedKeys.has(key)) {
          if (Object.prototype.hasOwnProperty.call(old,key)!==Object.prototype.hasOwnProperty.call(next,key)||serializeTemplateRevisionValue(old[key] ?? null) !== serializeTemplateRevisionValue(next[key] ?? null)) paths.push(child);
        } else visit(old[key], next[key], child, depth + 1);
      }
    }
  };
  visit(before, after, '', 0);
  return paths.slice(0, 64);
}
export function canonicalCollectionTemplateDesign(collection: Pick<BackyCollection, 'fields' | 'metadata'>,templatePolicy?: JsonRecord): BackyCollectionTemplateDesign {
  collectionFieldSemanticSchema(collection.fields);
  const design = {
    fieldsByKey: Object.fromEntries(collection.fields.map(field => [field.key, copy(field)])),
    fieldOrder: collection.fields.map(field => field.key),
    metadata: Object.fromEntries(Object.entries(collection.metadata || {}).filter(([key, value]) => key.startsWith('frontendDesign') && value !== undefined)),
    templatePolicy: templatePolicy ?? (collection.metadata?.frontendTemplateInstance as any)?.baseContent?.templatePolicy ?? {},
  };
  assertProductDesignHistorySafe(design);
  return copy(design);
}
export function collectionTemplateDesignFields(design: BackyCollectionTemplateDesign): BackyCollectionField[] {
  if (!object(design) || !object(design.fieldsByKey) || !Array.isArray(design.fieldOrder)
    || !object(design.metadata) || !object(design.templatePolicy) || Object.keys(design.metadata).some(key => !key.startsWith('frontendDesign'))
    || design.fieldOrder.some(key => typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(design.fieldsByKey, key))
    || new Set(design.fieldOrder).size !== design.fieldOrder.length
    || Object.keys(design.fieldsByKey).length !== design.fieldOrder.length) throw Error('COLLECTION_DESIGN_REVISION_INVALID');
  const fields = design.fieldOrder.map(key => design.fieldsByKey[key]);
  if (fields.some(field => !object(field) || typeof field.key !== 'string' || design.fieldsByKey[field.key] !== field)) throw Error('COLLECTION_DESIGN_REVISION_INVALID');
  collectionFieldSemanticSchema(fields);
  return fields;
}
export function collectionTemplatePolicyConflicts(before: JsonRecord,after: JsonRecord): string[] {
  return [...new Set([...Object.keys(before),...Object.keys(after)])].filter(key=>Object.prototype.hasOwnProperty.call(before,key)!==Object.prototype.hasOwnProperty.call(after,key)||serializeTemplateRevisionValue(before[key]??null)!==serializeTemplateRevisionValue(after[key]??null)).map(key=>'/'+key.replace(/~/g,'~0').replace(/\//g,'~1'));
}
export function withCollectionTemplateDesign(collection: BackyCollection, design: BackyCollectionTemplateDesign, pin: unknown): Pick<BackyCollection, 'fields' | 'metadata'> {
  const fields = collectionTemplateDesignFields(design);
  if(collectionTemplatePolicyConflicts(canonicalCollectionTemplateDesign(collection).templatePolicy,design.templatePolicy).length)throw Error('COLLECTION_TEMPLATE_SCHEMA_INCOMPATIBLE');
  if (collectionTemplateSchemaConflicts(collection.fields, fields).length) throw Error('COLLECTION_TEMPLATE_SCHEMA_INCOMPATIBLE');
  if (collectionTemplateBindingConflicts(canonicalCollectionTemplateDesign(collection), design).length) throw Error('COLLECTION_TEMPLATE_BINDING_INCOMPATIBLE');
  const metadata: JsonRecord = { ...collection.metadata };
  for (const key of Object.keys(metadata)) if (key.startsWith('frontendDesign')) delete metadata[key];
  Object.assign(metadata, copy(design.metadata));
  if (pin) metadata.frontendTemplateInstance = copy(pin); else delete metadata.frontendTemplateInstance;
  return { fields: copy(fields), metadata: metadata as BackyJsonObject };
}
export interface BackyCollectionDesignSnapshot {
  schemaVersion: 'backy.collection-design-version.v1'; design: BackyCollectionTemplateDesign; pin: unknown;
}
export interface BackyCollectionDesignRevisionInput {
  operation: 'template-upgrade' | 'restore'; templateId?: string | null; targetRevisionId?: string | null; actorId?: string | null; requestId: string;
}
export interface BackyCollectionDesignRevision extends BackyCollectionDesignRevisionInput {
  id: string; siteId: string; collectionId: string; snapshot: BackyCollectionDesignSnapshot; createdAt: string;
}
export function snapshotCollectionTemplateDesign(collection: BackyCollection): BackyCollectionDesignSnapshot {
  const candidate = collection.metadata?.frontendTemplateInstance;
  const pin = object(candidate) && candidate.schemaVersion === 'backy.template-instance.v1' && candidate.instanceType === 'collection' ? candidate : null;
  assertProductDesignHistorySafe(pin);
  return copy({ schemaVersion: 'backy.collection-design-version.v1', design: canonicalCollectionTemplateDesign(collection), pin });
}
export function assertCollectionDesignOnlyUpdate(before: BackyCollection, input: BackyCollectionUpdateInput): void {
  if (!input.expectedCollection || Object.keys(input).some(key => !['expectedCollection', 'expectedVersion', 'beforeUpdateCollectionDesignRevision', 'fields', 'metadata'].includes(key))) throw Error('COLLECTION_DESIGN_REVISION_INVALID');
  const next = { ...before, fields: input.fields || before.fields, metadata: input.metadata || before.metadata };
  if (collectionTemplateSchemaConflicts(before.fields, next.fields).length) throw Error('COLLECTION_TEMPLATE_SCHEMA_INCOMPATIBLE');
  if (collectionTemplateBindingConflicts(canonicalCollectionTemplateDesign(before), canonicalCollectionTemplateDesign(next)).length) throw Error('COLLECTION_TEMPLATE_BINDING_INCOMPATIBLE');
  const operational = (metadata: JsonRecord | undefined) => Object.fromEntries(Object.entries(metadata || {}).filter(([key]) => !key.startsWith('frontendDesign') && key !== 'frontendTemplateInstance'));
  if (serializeTemplateRevisionValue(operational(before.metadata)) !== serializeTemplateRevisionValue(operational(next.metadata))) throw Error('COLLECTION_DESIGN_REVISION_INVALID');
  snapshotCollectionTemplateDesign(next);
}
export function serializeBackyCollectionVersion(collection: BackyCollection): string {
  const { version: _version, ...snapshot } = collection;
  return serializeTemplateRevisionValue(snapshot);
}
