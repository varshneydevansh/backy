import { createHash } from 'node:crypto';
import { serializeBackyFormVersion, type FormDefinition } from '@backy-cms/core';
export const formDefinitionVersion = (form: FormDefinition): string => `form-v1:${createHash('sha256').update(serializeBackyFormVersion(form)).digest('hex')}`;
export const formDefinitionWithVersion = <T extends FormDefinition>(form: T): T & { version: string } => ({ ...form, version: formDefinitionVersion(form) });
export function assertFormDefinitionExpectation(form: FormDefinition, input: { expectedVersion?: string; expectedForm?: FormDefinition }) {
  if ((input.expectedVersion !== undefined && formDefinitionVersion(form) !== input.expectedVersion)
    || (input.expectedForm !== undefined && formDefinitionVersion(form) !== formDefinitionVersion(input.expectedForm)))
    throw Object.assign(Error('The form changed. Reload before saving.'), { code: 'FORM_DEFINITION_CONFLICT' });
}
