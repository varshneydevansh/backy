#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, '..');
const repoRoot = resolve(packageDir, '../..');
const schemaDir = join(repoRoot, 'specs/ai-frontend-contract');
const outputFile = join(packageDir, 'src/generated-contract-types.ts');
const openApiRouteFile = join(repoRoot, 'apps/public/src/app/api/sites/[siteId]/openapi/route.ts');

const schemaFiles = [
  'theme-tokens.schema.json',
  'element-actions.schema.json',
  'data-bindings.schema.json',
  'editable-map.schema.json',
  'content-payload.schema.json',
  'frontend-manifest.schema.json',
];

const rootTypeNames = {
  'theme-tokens.schema.json': 'GeneratedBackyThemeTokens',
  'element-actions.schema.json': 'GeneratedBackyElementActions',
  'data-bindings.schema.json': 'GeneratedBackyDataBindings',
  'editable-map.schema.json': 'GeneratedBackyEditableMap',
  'content-payload.schema.json': 'GeneratedBackyPublicRenderPayloadEnvelope',
  'frontend-manifest.schema.json': 'GeneratedBackyFrontendManifestEnvelope',
};

const defTypeNameOverrides = {
  'element-actions.schema.json': {
    action: 'GeneratedBackyElementAction',
  },
  'data-bindings.schema.json': {
    binding: 'GeneratedBackyDataBinding',
    dataset: 'GeneratedBackyDataBindingDataset',
  },
  'content-payload.schema.json': {
    status: 'GeneratedBackyContentStatus',
    element: 'GeneratedBackyContentElement',
    interactiveControl: 'GeneratedBackyInteractiveControl',
    interactiveFallback: 'GeneratedBackyInteractiveFallback',
    interactiveRenderCapabilities: 'GeneratedBackyInteractiveRenderCapabilities',
    mediaAsset: 'GeneratedBackyRenderMediaAsset',
    fontAsset: 'GeneratedBackyRenderFontAsset',
    form: 'GeneratedBackyRenderForm',
    commentThread: 'GeneratedBackyRenderCommentThread',
    navigationItem: 'GeneratedBackyRenderNavigationItem',
    navigationLayout: 'GeneratedBackyRenderNavigationLayout',
    frontendDesignContract: 'GeneratedBackyFrontendDesignContract',
    frontendDesignProvenance: 'GeneratedBackyFrontendDesignProvenance',
    renderFrontendDesign: 'GeneratedBackyRenderFrontendDesign',
  },
};

const schemas = new Map(schemaFiles.map((file) => [
  file,
  JSON.parse(readFileSync(join(schemaDir, file), 'utf8')),
]));
const openApiRouteSource = readFileSync(openApiRouteFile, 'utf8');
const openApiComponentSchemas = extractOpenApiComponentSchemas(openApiRouteSource);
const openApiComponentNames = Object.keys(openApiComponentSchemas);

const pascal = (value) => String(value)
  .replace(/\.schema\.json$/u, '')
  .replace(/(^|[-_\s]+)([a-z0-9])/giu, (_, __, char) => char.toUpperCase())
  .replace(/[^A-Za-z0-9]/gu, '');

const typeNameFor = (file, defName) => {
  if (!defName) return rootTypeNames[file];
  return defTypeNameOverrides[file]?.[defName] || `${rootTypeNames[file].replace(/Envelope$/u, '')}${pascal(defName)}`;
};

const isIdentifier = (value) => /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(value);
const propertyKey = (key) => (isIdentifier(key) ? key : JSON.stringify(key));
const literal = (value) => JSON.stringify(value);
const openApiComponentTypeName = (name) => `GeneratedBackyOpenApi${pascal(name)}`;

const refToType = (ref, currentFile) => {
  const [filePart, pointer = ''] = ref.split('#');
  const componentName = pointer.match(/^\/components\/schemas\/([^/]+)/u)?.[1];
  if (componentName) {
    return openApiComponentTypeName(componentName);
  }
  const file = filePart || currentFile;
  const defName = pointer.match(/^\/\$defs\/([^/]+)$/u)?.[1];
  return typeNameFor(file, defName);
};

const union = (parts) => {
  const unique = [...new Set(parts.filter(Boolean))];
  return unique.length === 0 ? 'unknown' : unique.join(' | ');
};

const stringLiteralUnion = (values) => union([...new Set(values)].sort().map((value) => literal(value)));

function extractOpenApiOperationIds(source) {
  return [...source.matchAll(/operationId:\s*['"]([^'"]+)['"]/gu)].map((match) => match[1]);
}

function extractOpenApiComponentNames(source) {
  const lines = source.split(/\r?\n/u);
  const names = [];
  let inComponents = false;
  let inSchemas = false;
  let schemasIndent = -1;

  for (const line of lines) {
    if (!inComponents && /^\s{6}components:\s*\{/u.test(line)) {
      inComponents = true;
      continue;
    }

    if (inComponents && !inSchemas && /^\s{8}schemas:\s*\{/u.test(line)) {
      inSchemas = true;
      schemasIndent = line.search(/\S/u);
      continue;
    }

    if (!inSchemas) continue;

    const indent = line.search(/\S/u);
    if (indent >= 0 && indent <= schemasIndent && /^\s*\},?\s*$/u.test(line)) {
      break;
    }

    const match = line.match(/^\s{10}([A-Z][A-Za-z0-9]+):\s/u);
    if (match) {
      names.push(match[1]);
    }
  }

  return names;
}

function findBalancedObjectLiteral(source, anchor) {
  const anchorIndex = source.indexOf(anchor);
  if (anchorIndex < 0) {
    throw new Error(`Unable to find ${anchor}`);
  }

  const start = source.indexOf('{', anchorIndex);
  if (start < 0) {
    throw new Error(`Unable to find object start for ${anchor}`);
  }

  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }

    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Unable to find object end for ${anchor}`);
}

function extractConstArray(source, constName) {
  const match = source.match(new RegExp(`const\\s+${constName}\\s*=\\s*(\\[[\\s\\S]*?\\]);`, 'u'));
  if (!match) {
    throw new Error(`Unable to find ${constName}`);
  }
  return Function(`"use strict"; return (${match[1]});`)();
}

function extractOpenApiComponentSchemas(source) {
  const componentObject = findBalancedObjectLiteral(source, '        schemas:');
  const formCodes = extractConstArray(source, 'formSubmissionValidationCodes');
  const evaluated = Function(
    'envelopeSchema',
    'formSubmissionValidationCodes',
    `"use strict"; return (${componentObject});`,
  )(envelopeSchemaForGeneration, formCodes);

  return evaluated && typeof evaluated === 'object' ? evaluated : {};
}

function envelopeSchemaForGeneration(dataSchema) {
  return {
    type: 'object',
    required: ['success', 'requestId', 'data'],
    properties: {
      success: { type: 'boolean' },
      requestId: { type: 'string' },
      data: dataSchema,
      error: { $ref: '#/components/schemas/ErrorEnvelope/properties/error' },
    },
  };
}

function schemaToType(schema, currentFile, indent = 0) {
  if (!schema || Object.keys(schema).length === 0) return 'unknown';
  if (schema.$ref) return refToType(schema.$ref, currentFile);
  if (Array.isArray(schema.enum)) return union(schema.enum.map((value) => literal(value)));
  if (Object.prototype.hasOwnProperty.call(schema, 'const')) return literal(schema.const);
  if (Array.isArray(schema.oneOf)) return union(schema.oneOf.map((item) => schemaToType(item, currentFile, indent)));
  if (Array.isArray(schema.anyOf)) return union(schema.anyOf.map((item) => schemaToType(item, currentFile, indent)));
  if (Array.isArray(schema.allOf)) return schema.allOf.map((item) => schemaToType(item, currentFile, indent)).join(' & ');
  if (Array.isArray(schema.type)) return union(schema.type.map((type) => schemaToType({ ...schema, type }, currentFile, indent)));

  switch (schema.type) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'array':
      return `Array<${schemaToType(schema.items, currentFile, indent)}>`;
    case 'object':
      return objectSchemaToType(schema, currentFile, indent);
    default:
      if (schema.properties || schema.additionalProperties) {
        return objectSchemaToType(schema, currentFile, indent);
      }
      return 'unknown';
  }
}

function objectSchemaToType(schema, currentFile, indent = 0) {
  const properties = schema.properties || {};
  const propertyNames = Object.keys(properties);
  const required = new Set(schema.required || []);
  const pad = ' '.repeat(indent);
  const childPad = ' '.repeat(indent + 2);

  if (propertyNames.length === 0) {
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      return `Record<string, ${schemaToType(schema.additionalProperties, currentFile, indent)}>`;
    }
    return schema.additionalProperties === false ? 'Record<string, never>' : 'Record<string, unknown>';
  }

  const lines = ['{'];
  for (const name of propertyNames) {
    const optional = required.has(name) ? '' : '?';
    lines.push(`${childPad}${propertyKey(name)}${optional}: ${schemaToType(properties[name], currentFile, indent + 2)};`);
  }
  if (schema.additionalProperties === true || typeof schema.additionalProperties === 'object') {
    lines.push(`${childPad}[key: string]: unknown;`);
  }
  lines.push(`${pad}}`);
  return lines.join('\n');
}

const sourceLines = [
  '/* eslint-disable */',
  '// Generated by packages/sdk-js/scripts/generate-contract-types.mjs.',
  '// Source schemas: specs/ai-frontend-contract/*.schema.json. Do not edit by hand.',
  '',
  `export type GeneratedBackyOpenApiOperationId = ${stringLiteralUnion(extractOpenApiOperationIds(openApiRouteSource))};`,
  '',
  `export type GeneratedBackyOpenApiComponentName = ${stringLiteralUnion(openApiComponentNames.length > 0 ? openApiComponentNames : extractOpenApiComponentNames(openApiRouteSource))};`,
  '',
  'export interface GeneratedBackyOpenApiOperation {',
  '  operationId?: GeneratedBackyOpenApiOperationId;',
  '  tags?: string[];',
  '  summary?: string;',
  '  parameters?: unknown[];',
  '  requestBody?: unknown;',
  '  responses?: Record<string, unknown>;',
  '  [key: string]: unknown;',
  '}',
  '',
  'export interface GeneratedBackyOpenApiDocument {',
  '  openapi: string;',
  '  "x-backy-database-certification"?: GeneratedBackyFrontendManifestDatabaseCertification;',
  '  "x-backy-frontend-launch-readiness"?: GeneratedBackyFrontendManifestLaunchReadiness;',
  '  "x-backy-media-file-categories"?: GeneratedBackyOpenApiMediaFileCategoryDiscovery;',
  '  info: { title: string; version: string; description?: string; [key: string]: unknown };',
  '  servers?: Array<{ url: string; [key: string]: unknown }>;',
  '  paths: Record<string, Partial<Record<"get" | "post" | "put" | "patch" | "delete", GeneratedBackyOpenApiOperation>> & Record<string, unknown>>;',
  '  components?: { schemas?: GeneratedBackyOpenApiComponents; [key: string]: unknown };',
  '  [key: string]: unknown;',
  '}',
  '',
];

for (const [name, schema] of Object.entries(openApiComponentSchemas)) {
  sourceLines.push(`export type ${openApiComponentTypeName(name)} = ${schemaToType(schema, 'openapi', 0)};`, '');
}

sourceLines.push(
  'export interface GeneratedBackyOpenApiComponentSchemas {',
  ...openApiComponentNames.sort().map((name) => `  ${propertyKey(name)}?: ${openApiComponentTypeName(name)};`),
  '  [key: string]: unknown;',
  '}',
  '',
  'export type GeneratedBackyOpenApiComponents = GeneratedBackyOpenApiComponentSchemas;',
  '',
);

for (const file of schemaFiles) {
  const schema = schemas.get(file);
  const defs = schema.$defs || {};

  for (const [defName, defSchema] of Object.entries(defs)) {
    sourceLines.push(`export type ${typeNameFor(file, defName)} = ${schemaToType(defSchema, file, 0)};`, '');
  }

  sourceLines.push(`export type ${typeNameFor(file)} = ${schemaToType(schema, file, 0)};`, '');
}

sourceLines.push(
  "export type GeneratedBackyFrontendManifest = GeneratedBackyFrontendManifestEnvelope['data'];",
  "export type GeneratedBackyPublicRenderPayload = GeneratedBackyPublicRenderPayloadEnvelope['data'];",
  "export type GeneratedBackyThemeTokenContract = GeneratedBackyThemeTokens;",
  "export type GeneratedBackyEditableMapEntry = GeneratedBackyEditableMap[string];",
  '',
  'export const generatedBackyContractTypeSources = [',
  ...schemaFiles.map((file) => `  ${literal(relative(repoRoot, join(schemaDir, file)))},`),
  '] as const;',
);

writeFileSync(outputFile, `${sourceLines.join('\n')}\n`);
console.log(`Generated ${relative(repoRoot, outputFile)} from ${schemaFiles.length} schema files.`);
