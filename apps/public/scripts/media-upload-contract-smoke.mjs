#!/usr/bin/env node

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (relativePath) => fs.readFileSync(
  fileURLToPath(new URL(relativePath, import.meta.url)),
  'utf8',
);

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const mediaRoute = read('../src/app/api/admin/sites/[siteId]/media/route.ts');
const publicMediaRoute = read('../src/app/api/sites/[siteId]/media/route.ts');
const openApiRoute = read('../src/app/api/sites/[siteId]/openapi/route.ts');
const uploadPolicy = read('../src/lib/mediaUploadPolicy.ts');
const coreTypes = read('../../../packages/core/src/types/index.ts');
const dbSchema = read('../../../packages/db/src/schema/index.ts');
const backyStore = read('../src/lib/backyStore.ts');
const sdkSource = read('../../../packages/sdk-js/src/index.ts');
const generatedSdkSource = read('../../../packages/sdk-js/src/generated-contract-types.ts');
const generatedSdkSmoke = read('../../../packages/sdk-js/scripts/generated-contract-types.ts');
const apiContracts = read('../../../specs/backy-api-contracts.md');
const hasOrderedMediaEnum = (source) => {
  const windows = source.split('enum:').slice(1);
  return windows.filter((window) => {
    const snippet = window.slice(0, 320);
    return ['image', 'video', 'audio', 'document', 'font', 'other'].every((value) => (
      snippet.includes(`"${value}"`) || snippet.includes(`'${value}'`)
    ));
  }).length;
};

assert(
  mediaRoute.includes(')?.type ?? "other"') ||
    mediaRoute.includes(")?.type ?? 'other'") ||
    mediaRoute.includes("?.type ?? 'other'") ||
    mediaRoute.includes('?.type ?? "other"'),
  'Media upload route must classify unknown MIME/extension uploads as type other.',
);
assert(
  mediaRoute.includes('return "files";') ||
    mediaRoute.includes("return 'files';"),
  'Media upload route must store generic other files under the files storage folder.',
);
assert(
  mediaRoute.includes('value === "other"') ||
    mediaRoute.includes("value === 'other'"),
  'Media list filters must accept type=other for generic files.',
);
assert(
  publicMediaRoute.includes("'INVALID_MEDIA_TYPE'") &&
    publicMediaRoute.includes('mediaType.invalid') &&
    publicMediaRoute.includes('document, file, font, other'),
  'Public media list route must reject invalid media type filters instead of silently returning all assets.',
);
assert(
  mediaRoute.includes('const mimeType = file.type || "application/octet-stream"') ||
    mediaRoute.includes("const mimeType = file.type || 'application/octet-stream'"),
  'Media upload route must preserve a safe default MIME type for generic file uploads.',
);
assert(
  mediaRoute.includes('scanMediaUploadWithProviders'),
  'Media upload route must keep safety scanning on generic file uploads.',
);
assert(
  uploadPolicy.includes('policy.allowedFileTypes.length === 0') &&
    uploadPolicy.includes('return true;'),
  'Media upload policy must allow generic file uploads when no allowlist is configured.',
);
assert(
  uploadPolicy.includes("rule.startsWith('.')") &&
    uploadPolicy.includes("rule.endsWith('/*')"),
  'Media upload policy must support extension and MIME-family allowlist rules for generic files.',
);
assert(
  uploadPolicy.includes("'application/font-woff2': 'font'") &&
    uploadPolicy.includes("'.woff2': 'font'") &&
    uploadPolicy.includes('fileMatchesMimeFamily'),
  'Media upload policy must allow known font extensions and application font MIME types through font/* allowlist rules.',
);
assert(
  /export type MediaType\s*=\s*[\s\S]*["']image["'][\s\S]*["']video["'][\s\S]*["']audio["'][\s\S]*["']document["'][\s\S]*["']font["'][\s\S]*["']other["']/.test(coreTypes),
  'Core media type contract must include other.',
);
assert(
  dbSchema.includes("export type MediaType = 'image' | 'video' | 'audio' | 'document' | 'font' | 'other'"),
  'Database media type contract must include other.',
);
assert(
  (backyStore.includes('type: input.type') &&
    (backyStore.includes('input.type === "other"') ||
      backyStore.includes("input.type === 'other'"))),
  'Demo media store must persist type other.',
);
assert(
  hasOrderedMediaEnum(openApiRoute) >= 2,
  'Public OpenAPI media list filters and MediaAsset.type schema must advertise type other for custom frontends.',
);
assert(
  openApiRoute.includes('"400"') &&
    openApiRoute.includes('Invalid media type filter') &&
    openApiRoute.includes('#/components/schemas/ErrorEnvelope'),
  'Public OpenAPI media list route must document invalid type filter error envelopes.',
);
assert(
  sdkSource.includes('type?: "image" | "video" | "audio" | "document" | "font" | "other"') ||
    sdkSource.includes("type?: 'image' | 'video' | 'audio' | 'document' | 'font' | 'other'"),
  'SDK media list options must allow type=other.',
);
assert(
  generatedSdkSource.includes('type?: "image" | "video" | "audio" | "document" | "font" | "other"'),
  'Generated SDK OpenAPI media asset type must include other.',
);
assert(
  (generatedSdkSmoke.includes("type: 'other'") ||
    generatedSdkSmoke.includes('type: "other"')) &&
    generatedSdkSmoke.includes('invalidOpenApiMediaAssetType') &&
    generatedSdkSmoke.includes('invalidSdkMediaListOptionType'),
  'Generated SDK smoke must include positive and negative generic file media contract cases.',
);
assert(
  apiContracts.includes('image/video/audio/document/font/other') &&
    apiContracts.includes('unknown safe files as `other`'),
  'API contract docs must describe generic other file uploads.',
);
assert(
  apiContracts.includes('Invalid public media type filters return `400 INVALID_MEDIA_TYPE`'),
  'API contract docs must describe invalid public media type filter errors.',
);

console.log(JSON.stringify({
  ok: true,
  contract: 'backy.media-upload.generic-files.v1',
}, null, 2));
