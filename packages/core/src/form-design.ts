import type { FormDefinition, FormFieldDefinition } from './types';
import { serializeTemplateRevisionValue } from './template-history';
import { assertProductDesignHistorySafe } from './product-design';

type JsonRecord = Record<string, unknown>;
const object = (value: unknown): value is JsonRecord => !!value && typeof value === 'object' && !Array.isArray(value);
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const presentation = new Set(['label', 'placeholder', 'helpText']);
/** The remaining field properties affect stored values, validation or extensions. */
export function formFieldSemanticSchema(fields: FormFieldDefinition[]): JsonRecord {
  const result: JsonRecord = {};
  for (const field of fields) {
    if (!field.key || Object.prototype.hasOwnProperty.call(result, field.key)) throw Error('FORM_TEMPLATE_SCHEMA_INVALID');
    result[field.key] = Object.fromEntries(Object.entries(field).filter(([key]) => !presentation.has(key)));
  }
  return result;
}
export function formTemplateSchemaConflicts(base: FormFieldDefinition[], target: FormFieldDefinition[]): string[] {
  const old = formFieldSemanticSchema(base), next = formFieldSemanticSchema(target), paths: string[] = [];
  const escape = (key: string) => key.replace(/~/g, '~0').replace(/\//g, '~1');
  for (const key of new Set([...Object.keys(old), ...Object.keys(next)])) {
    const a = old[key], b = next[key];
    if (!object(a) || !object(b)) { paths.push('/fields/@' + escape(key)); continue; }
    for (const property of new Set([...Object.keys(a), ...Object.keys(b)]))
      if (Object.prototype.hasOwnProperty.call(a, property) !== Object.prototype.hasOwnProperty.call(b, property) || serializeTemplateRevisionValue(a[property] ?? null) !== serializeTemplateRevisionValue(b[property] ?? null)) paths.push('/fields/@' + escape(key) + '/' + escape(property));
  }
  return paths.slice(0, 64);
}
export interface BackyFormTemplateDesign {
  fieldsByKey: Record<string, FormFieldDefinition>;
  fieldOrder: string[];
  settings: JsonRecord;
}
export function formTemplateBindingConflicts(before: unknown, after: unknown): string[] {
  const paths: string[] = [], protectedKeys = new Set(['formId', 'formName', 'formActive', 'frontendFieldKeyMap', 'editorFormBlockProps']);
  const visit = (a: unknown, b: unknown, path: string, depth: number) => {
    if (depth > 64) throw Error('FORM_DESIGN_REVISION_LIMIT');
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
          if (serializeTemplateRevisionValue(old[key] ?? null) !== serializeTemplateRevisionValue(next[key] ?? null)) paths.push(child);
        } else visit(old[key], next[key], child, depth + 1);
      }
    }
  };
  visit(before, after, '', 0);
  return paths.slice(0, 64);
}
export function canonicalFormTemplateDesign(form: Pick<FormDefinition, 'fields' | 'settings'>): BackyFormTemplateDesign {
  formFieldSemanticSchema(form.fields);
  const design = {
    fieldsByKey: Object.fromEntries(form.fields.map(field => [field.key, copy(field)])),
    fieldOrder: form.fields.map(field => field.key),
    settings: Object.fromEntries(Object.entries(form.settings || {}).filter(([key, value]) => key.startsWith('frontendDesign') && value !== undefined)),
  };
  assertProductDesignHistorySafe(design);
  return copy(design);
}
export function formTemplateDesignFields(design: BackyFormTemplateDesign): FormFieldDefinition[] {
  if (!object(design) || !object(design.fieldsByKey) || !Array.isArray(design.fieldOrder)
    || !object(design.settings) || Object.keys(design.settings).some(key => !key.startsWith('frontendDesign'))
    || design.fieldOrder.some(key => typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(design.fieldsByKey, key))
    || new Set(design.fieldOrder).size !== design.fieldOrder.length
    || Object.keys(design.fieldsByKey).length !== design.fieldOrder.length) throw Error('FORM_DESIGN_REVISION_INVALID');
  const fields = design.fieldOrder.map(key => design.fieldsByKey[key]);
  if (fields.some(field => !object(field) || typeof field.key !== 'string' || design.fieldsByKey[field.key] !== field)) throw Error('FORM_DESIGN_REVISION_INVALID');
  formFieldSemanticSchema(fields);
  return fields;
}
export function withFormTemplateDesign(form: FormDefinition, design: BackyFormTemplateDesign, pin: unknown): Pick<FormDefinition, 'fields' | 'settings'> {
  const fields = formTemplateDesignFields(design);
  if (formTemplateSchemaConflicts(form.fields, fields).length) throw Error('FORM_TEMPLATE_SCHEMA_INCOMPATIBLE');
  if (formTemplateBindingConflicts(canonicalFormTemplateDesign(form), design).length) throw Error('FORM_TEMPLATE_BINDING_INCOMPATIBLE');
  const settings: JsonRecord = { ...form.settings };
  for (const key of Object.keys(settings)) if (key.startsWith('frontendDesign')) delete settings[key];
  Object.assign(settings, copy(design.settings));
  if (pin) settings.frontendTemplateInstance = copy(pin); else delete settings.frontendTemplateInstance;
  return { fields: copy(fields), settings };
}
export interface BackyFormDesignSnapshot {
  schemaVersion: 'backy.form-design-version.v1'; design: BackyFormTemplateDesign; pin: unknown;
}
export interface BackyFormDesignRevisionInput {
  operation: 'template-upgrade' | 'restore'; templateId?: string | null; targetRevisionId?: string | null; actorId?: string | null; requestId: string;
}
export interface BackyFormDesignRevision extends BackyFormDesignRevisionInput {
  id: string; siteId: string; formId: string; snapshot: BackyFormDesignSnapshot; createdAt: string;
}
export type BackyFormUpdateInput = Partial<FormDefinition> & {
  expectedVersion?: string; expectedForm?: FormDefinition; beforeUpdateFormDesignRevision?: BackyFormDesignRevisionInput;
};
export function snapshotFormTemplateDesign(form: FormDefinition): BackyFormDesignSnapshot {
  const candidate = form.settings?.frontendTemplateInstance;
  const pin = object(candidate) && candidate.schemaVersion === 'backy.template-instance.v1' && candidate.instanceType === 'form' ? candidate : null;
  assertProductDesignHistorySafe(pin);
  return copy({ schemaVersion: 'backy.form-design-version.v1', design: canonicalFormTemplateDesign(form), pin });
}
export function assertFormDesignOnlyUpdate(before: FormDefinition, input: BackyFormUpdateInput): void {
  if (!input.expectedForm || Object.keys(input).some(key => !['expectedForm', 'expectedVersion', 'beforeUpdateFormDesignRevision', 'fields', 'settings', 'updatedBy'].includes(key))) throw Error('FORM_DESIGN_REVISION_INVALID');
  const next = { ...before, fields: input.fields || before.fields, settings: input.settings || before.settings };
  if (formTemplateSchemaConflicts(before.fields, next.fields).length) throw Error('FORM_TEMPLATE_SCHEMA_INCOMPATIBLE');
  if (formTemplateBindingConflicts(canonicalFormTemplateDesign(before), canonicalFormTemplateDesign(next)).length) throw Error('FORM_TEMPLATE_BINDING_INCOMPATIBLE');
  const operational = (settings: JsonRecord | undefined) => Object.fromEntries(Object.entries(settings || {}).filter(([key]) => !key.startsWith('frontendDesign') && key !== 'frontendTemplateInstance'));
  if (serializeTemplateRevisionValue(operational(before.settings)) !== serializeTemplateRevisionValue(operational(next.settings))) throw Error('FORM_DESIGN_REVISION_INVALID');
  snapshotFormTemplateDesign(next);
}
export function serializeBackyFormVersion(form: FormDefinition): string {
  const { version: _version, ...snapshot } = form as FormDefinition & { version?: string };
  return serializeTemplateRevisionValue(snapshot);
}
