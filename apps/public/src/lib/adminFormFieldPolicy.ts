import type { FormFieldDefinition, FormValidationRule } from '@backy-cms/core';

const FIELD_TYPES = new Set<FormFieldDefinition['type']>([
  'text',
  'email',
  'number',
  'textarea',
  'select',
  'checkbox',
  'radio',
  'date',
  'tel',
  'url',
  'file',
]);

const VALIDATION_TYPES = new Set<FormValidationRule['type']>([
  'required',
  'minLength',
  'maxLength',
  'pattern',
  'min',
  'max',
]);

const textValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const nullableTextValue = (value: unknown): string | null => {
  const text = textValue(value);
  return text ? text : null;
};

const sanitizeFieldKey = (value: unknown, fallback: string) => {
  const base = textValue(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_ -]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || fallback;
};

const uniqueFieldKey = (baseKey: string, seenKeys: Set<string>) => {
  let key = baseKey;
  let suffix = 2;
  while (seenKeys.has(key)) {
    key = `${baseKey}_${suffix}`;
    suffix += 1;
  }
  seenKeys.add(key);
  return key;
};

const parseFieldOptions = (value: unknown): string[] | undefined => {
  if (Array.isArray(value)) {
    const options = value.map((option) => textValue(option)).filter(Boolean);
    return options.length > 0 ? Array.from(new Set(options)) : undefined;
  }

  if (typeof value === 'string') {
    const options = value.split('\n').flatMap((part) => part.split(',')).map((option) => option.trim()).filter(Boolean);
    return options.length > 0 ? Array.from(new Set(options)) : undefined;
  }

  return undefined;
};

const parseValidationRules = (value: unknown): FormValidationRule[] | undefined => {
  if (!Array.isArray(value)) return undefined;

  const rules = value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const type = textValue(record.type) as FormValidationRule['type'];
      if (!VALIDATION_TYPES.has(type)) return null;
      return {
        type,
        ...(typeof record.value === 'string' || typeof record.value === 'number' ? { value: record.value } : {}),
        message: textValue(record.message) || 'Invalid field value.',
      } satisfies FormValidationRule;
    })
    .filter((rule): rule is FormValidationRule => Boolean(rule));

  return rules.length > 0 ? rules : undefined;
};

export const parseFormFields = (value: unknown): FormFieldDefinition[] | undefined => {
  if (!Array.isArray(value)) return undefined;

  const seenKeys = new Set<string>();
  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;

      const record = item as Record<string, unknown>;
      const key = uniqueFieldKey(sanitizeFieldKey(record.key, `field_${index + 1}`), seenKeys);
      const typeInput = textValue(record.type) as FormFieldDefinition['type'];
      const type = FIELD_TYPES.has(typeInput) ? typeInput : 'text';
      const label = textValue(record.label) || key.replace(/_/g, ' ');
      const field: FormFieldDefinition = {
        key,
        label,
        type,
        required: record.required === true,
      };
      const placeholder = nullableTextValue(record.placeholder);
      const helpText = nullableTextValue(record.helpText);
      const defaultValue = nullableTextValue(record.defaultValue);
      const options = parseFieldOptions(record.options);
      const validation = parseValidationRules(record.validation);

      if (placeholder) field.placeholder = placeholder;
      if (helpText) field.helpText = helpText;
      if (defaultValue) field.defaultValue = defaultValue;
      if (options) field.options = options;
      if (validation) field.validation = validation;

      return field;
    })
    .filter((field): field is FormFieldDefinition => Boolean(field));
};
