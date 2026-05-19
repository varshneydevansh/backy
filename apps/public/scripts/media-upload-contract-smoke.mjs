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
const adminSignedMediaUrlRoute = read('../src/app/api/admin/sites/[siteId]/media/[mediaId]/signed-url/route.ts');
const publicMediaRoute = read('../src/app/api/sites/[siteId]/media/route.ts');
const publicFontManifestRoute = read('../src/app/api/sites/[siteId]/media/fonts/route.ts');
const publicMediaFileRoute = read('../src/app/api/sites/[siteId]/media/[mediaId]/file/route.ts');
const publicMediaTransformRoute = read('../src/app/api/sites/[siteId]/media/[mediaId]/transform/route.ts');
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
  adminSignedMediaUrlRoute.includes("'INVALID_MEDIA_DISPOSITION'") &&
    adminSignedMediaUrlRoute.includes('parseSignedUrlDisposition') &&
    adminSignedMediaUrlRoute.includes('disposition: disposition.value'),
  'Admin signed media URL route must reject invalid disposition values before minting delivery signatures.',
);
assert(
  adminSignedMediaUrlRoute.includes("'INVALID_MEDIA_EXPIRY'") &&
    adminSignedMediaUrlRoute.includes('parseSignedUrlExpiresIn') &&
    adminSignedMediaUrlRoute.includes('expiresInSeconds: expiresIn.value') &&
    adminSignedMediaUrlRoute.includes('MIN_SIGNED_URL_EXPIRES_IN_SECONDS = 30') &&
    adminSignedMediaUrlRoute.includes('MAX_SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60'),
  'Admin signed media URL route must reject invalid expiry values before minting delivery signatures.',
);
assert(
  publicMediaRoute.includes("'INVALID_MEDIA_TYPE'") &&
    publicMediaRoute.includes('mediaType.invalid') &&
    publicMediaRoute.includes('document, file, font, other'),
  'Public media list route must reject invalid media type filters instead of silently returning all assets.',
);
assert(
  publicMediaRoute.includes("'INVALID_MEDIA_SCOPE'") &&
    publicMediaRoute.includes('mediaScope.invalid') &&
    publicMediaRoute.includes('global, page, post'),
  'Public media list route must reject invalid media scope filters instead of silently returning all assets.',
);
assert(
  publicMediaRoute.includes("'INVALID_MEDIA_GLOBAL_FILTER'") &&
    publicMediaRoute.includes('globalFilter.invalid') &&
    publicMediaRoute.includes('Use true or false'),
  'Public media list route must reject invalid global filters instead of silently returning all assets.',
);
assert(
  publicMediaRoute.includes("'INVALID_MEDIA_LIMIT'") &&
    publicMediaRoute.includes("'INVALID_MEDIA_OFFSET'") &&
    publicMediaRoute.includes('integerQueryFromInput') &&
    publicMediaRoute.includes('MAX_MEDIA_LIMIT = 100'),
  'Public media list route must reject invalid pagination filters instead of silently clamping or defaulting them.',
);
assert(
  publicFontManifestRoute.includes("from '@/lib/mediaSafety'") &&
    publicFontManifestRoute.includes('!isMediaQuarantined(item)') &&
    publicFontManifestRoute.includes('buildPublicFontManifest('),
  'Public font manifest route must exclude quarantined font assets before generating @font-face CSS.',
);
assert(
  publicMediaFileRoute.includes("jsonError(423, 'MEDIA_QUARANTINED'") &&
    publicMediaFileRoute.includes('This media asset is quarantined and cannot be delivered.'),
  'Public media file route must expose a distinct quarantined delivery error.',
);
assert(
  publicMediaFileRoute.includes("'INVALID_MEDIA_DISPOSITION'") &&
    publicMediaFileRoute.includes('parseContentDisposition') &&
    publicMediaFileRoute.includes('Use inline or attachment'),
  'Public media file route must reject invalid disposition values instead of silently serving inline.',
);
assert(
  publicMediaTransformRoute.includes("'INVALID_TRANSFORM_WIDTH'") &&
    publicMediaTransformRoute.includes("'INVALID_TRANSFORM_QUALITY'") &&
    publicMediaTransformRoute.includes('Number.isInteger(parsed)') &&
    !publicMediaTransformRoute.includes('Math.max(min, Math.min(max'),
  'Public media transform route must reject invalid width/quality instead of clamping or defaulting invalid query values.',
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
    openApiRoute.includes('Invalid media type, scope, global, limit, or offset filter') &&
    openApiRoute.includes('#/components/schemas/ErrorEnvelope'),
  'Public OpenAPI media list route must document invalid media filter error envelopes.',
);
assert(
  openApiRoute.includes('Fetch public, non-quarantined uploaded font families'),
  'Public OpenAPI font manifest route must advertise that quarantined fonts are excluded.',
);
assert(
  openApiRoute.includes('Invalid transform width/quality or unsupported media type'),
  'Public OpenAPI media transform route must document invalid width/quality errors.',
);
assert(
  openApiRoute.includes('"w"') &&
    openApiRoute.includes('Alias for width') &&
    openApiRoute.includes('"q"') &&
    openApiRoute.includes('Alias for quality'),
  'Public OpenAPI media transform route must advertise w/q aliases supported by the runtime and docs.',
);
assert(
  openApiRoute.includes('"423"') &&
    openApiRoute.includes('Media asset is quarantined and cannot be delivered'),
  'Public OpenAPI media file route must document quarantined delivery errors.',
);
assert(
  openApiRoute.includes('"400"') &&
    openApiRoute.includes('Invalid media file disposition'),
  'Public OpenAPI media file route must document invalid disposition errors.',
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
assert(
  apiContracts.includes('Invalid public media scope filters return `400 INVALID_MEDIA_SCOPE`'),
  'API contract docs must describe invalid public media scope filter errors.',
);
assert(
  apiContracts.includes('Invalid public media global filters return `400 INVALID_MEDIA_GLOBAL_FILTER`'),
  'API contract docs must describe invalid public media global filter errors.',
);
assert(
  apiContracts.includes('Invalid public media pagination filters return `400 INVALID_MEDIA_LIMIT` or `400 INVALID_MEDIA_OFFSET`'),
  'API contract docs must describe invalid public media pagination filter errors.',
);
assert(
  apiContracts.includes('Public font manifests exclude quarantined font assets'),
  'API contract docs must describe public font manifest quarantine filtering.',
);
assert(
  apiContracts.includes('Quarantined media file requests return `423 MEDIA_QUARANTINED`'),
  'API contract docs must describe quarantined public media file delivery errors.',
);
assert(
  apiContracts.includes('Invalid media file disposition values return `400 INVALID_MEDIA_DISPOSITION`'),
  'API contract docs must describe invalid public media file disposition errors.',
);
assert(
  apiContracts.includes('Signed media URL requests also reject invalid `disposition` values before minting tokens'),
  'API contract docs must describe signed media URL disposition validation.',
);
assert(
  apiContracts.includes('Signed media URL requests reject invalid `expiresInSeconds` values with `400 INVALID_MEDIA_EXPIRY`'),
  'API contract docs must describe signed media URL expiry validation.',
);
assert(
  apiContracts.includes('Invalid transform width values return `400 INVALID_TRANSFORM_WIDTH`') &&
    apiContracts.includes('invalid quality values return `400 INVALID_TRANSFORM_QUALITY`'),
  'API contract docs must describe invalid public media transform query errors.',
);

console.log(JSON.stringify({
  ok: true,
  contract: 'backy.media-upload.generic-files.v1',
}, null, 2));
