import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(scriptDir, '../../../specs/ai-frontend-contract');

const schemaFiles = [
  'frontend-manifest.schema.json',
  'theme-tokens.schema.json',
  'element-actions.schema.json',
  'data-bindings.schema.json',
  'editable-map.schema.json',
  'content-payload.schema.json',
];

const readSchema = (filename) => (
  JSON.parse(readFileSync(resolve(contractDir, filename), 'utf8'))
);

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
});

const schemas = new Map(schemaFiles.map((filename) => [filename, readSchema(filename)]));

for (const [filename, schema] of schemas) {
  ajv.addSchema(schema, filename);
}

const validate = ajv.getSchema('content-payload.schema.json');
const validateManifest = ajv.getSchema('frontend-manifest.schema.json');

export function validateAiRenderPayload(payload, label = 'render payload') {
  if (!validate) {
    throw new Error('Unable to load content-payload.schema.json validator');
  }

  const isValid = validate(payload);
  if (isValid) {
    return;
  }

  const details = (validate.errors || [])
    .map((error) => `${error.instancePath || '/'} ${error.message || 'is invalid'}`)
    .join('; ');
  throw new Error(`${label} does not match AI frontend schema: ${details}`);
}

export function validateAiFrontendManifest(payload, label = 'frontend manifest') {
  if (!validateManifest) {
    throw new Error('Unable to load frontend-manifest.schema.json validator');
  }

  const isValid = validateManifest(payload);
  if (isValid) {
    return;
  }

  const details = (validateManifest.errors || [])
    .map((error) => `${error.instancePath || '/'} ${error.message || 'is invalid'}`)
    .join('; ');
  throw new Error(`${label} does not match AI frontend manifest schema: ${details}`);
}
