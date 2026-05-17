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

const manifestRoute = read('../src/app/api/sites/[siteId]/manifest/route.ts');
const openApiRoute = read('../src/app/api/sites/[siteId]/openapi/route.ts');
const sdkSource = read('../../../packages/sdk-js/src/index.ts');
const sdkSmoke = read('../../../packages/sdk-js/scripts/smoke.mjs');
const generatedSdkSmoke = read('../../../packages/sdk-js/scripts/generated-contract-types.ts');
const generatedSdkTypes = read('../../../packages/sdk-js/src/generated-contract-types.ts');
const rootPackage = read('../../../package.json');
const publicPackage = read('../package.json');
const apiContracts = read('../../../specs/backy-api-contracts.md');
const audit = read('../../../specs/page-completion-audit/backy-page-surface-audit.md');

assert(
  manifestRoute.includes('site: `/api/sites?identifier=${encodeURIComponent(input.site.slug)}`'),
  'Frontend manifest must advertise public site discovery for custom frontends.',
);

assert(
  openApiRoute.includes('"/api/sites":') &&
    openApiRoute.includes('operationId: "discoverBackySite"') &&
    openApiRoute.includes('$ref: "#/components/schemas/SiteListEnvelope"') &&
    openApiRoute.includes('$ref: "#/components/schemas/SiteEnvelope"') &&
    openApiRoute.includes('SiteSummary:') &&
    openApiRoute.includes('Discovery rate limit exceeded'),
  'Site-scoped OpenAPI must document public site discovery, list/detail envelopes, and rate-limit errors.',
);

assert(
  sdkSmoke.includes('function assertManifestEndpointsDocumented') &&
    sdkSmoke.includes('endpointPath(endpoint)') &&
    sdkSmoke.includes('openapi() is missing manifest-advertised endpoint paths') &&
    sdkSmoke.includes("openapi.paths?.['/api/sites']?.get?.operationId === 'discoverBackySite'"),
  'SDK smoke must enforce that manifest-advertised endpoints are present in OpenAPI.',
);

assert(
  generatedSdkTypes.includes('"discoverBackySite"') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiSiteSummary') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiSiteListEnvelope') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiSiteEnvelope'),
  'Generated SDK types must expose site discovery operation and envelope contracts.',
);

assert(
  sdkSource.includes('GeneratedBackyOpenApiSiteSummary') &&
    sdkSource.includes('GeneratedBackyOpenApiSiteListEnvelope') &&
    sdkSource.includes('GeneratedBackyOpenApiSiteEnvelope') &&
    generatedSdkSmoke.includes('satisfies GeneratedBackyOpenApiSiteSummary') &&
    generatedSdkSmoke.includes('invalidSiteSummaryStatus') &&
    generatedSdkSmoke.includes('invalidSiteListEnvelope'),
  'SDK barrel and generated-type smoke must export and exercise public site discovery contracts.',
);

assert(
  publicPackage.includes('"test:frontend-contract": "node scripts/frontend-contract-smoke.mjs"') &&
    rootPackage.includes('"test:frontend-contract-types": "npm run test:frontend-contract --workspace @backy/public && npm run test:generated-types --workspace @backy/sdk-js"'),
  'Root and public package scripts must wire frontend contract smoke before generated SDK type checks.',
);

assert(
  apiContracts.includes('GET /api/sites?identifier=:identifier') &&
    apiContracts.includes('operationId: discoverBackySite') &&
    apiContracts.includes('data.endpoints.site') &&
    apiContracts.includes('npm run test:frontend-contract --workspace @backy/public'),
  'API contract docs must describe global site discovery as the manifest bootstrap endpoint and OpenAPI operation.',
);

assert(
  audit.includes('Frontend discovery contract update') &&
    audit.includes('GeneratedBackyOpenApiSiteSummary') &&
    audit.includes('every non-fragment manifest endpoint path is represented in OpenAPI'),
  'Page completion audit must record frontend discovery contract coverage and remaining evidence.',
);

console.log(JSON.stringify({
  ok: true,
  contract: 'backy.frontend-contract.discovery.v1',
}, null, 2));
