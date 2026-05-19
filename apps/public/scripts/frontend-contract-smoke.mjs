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
const publicSiteDiscoveryRoute = read('../src/app/api/sites/route.ts');
const adminSitesRoute = read('../src/app/api/admin/sites/route.ts');
const adminSiteDetailRoute = read('../src/app/api/admin/sites/[siteId]/route.ts');
const adminFrontendDesignRoute = read('../src/app/api/admin/sites/[siteId]/frontend-design/route.ts');
const adminTemplateRegistryRoute = read('../src/app/api/admin/sites/[siteId]/templates/route.ts');
const templateRegistryLib = read('../src/lib/templateRegistry.ts');
const sdkSource = read('../../../packages/sdk-js/src/index.ts');
const sdkSmoke = read('../../../packages/sdk-js/scripts/smoke.mjs');
const generatedSdkSmoke = read('../../../packages/sdk-js/scripts/generated-contract-types.ts');
const generatedSdkTypes = read('../../../packages/sdk-js/src/generated-contract-types.ts');
const frontendManifestSchema = read('../../../specs/ai-frontend-contract/frontend-manifest.schema.json');
const rootPackage = read('../../../package.json');
const publicPackage = read('../package.json');
const templateRegistrySmoke = read('template-registry-smoke.ts');
const apiContracts = read('../../../specs/backy-api-contracts.md');
const audit = read('../../../specs/page-completion-audit/backy-page-surface-audit.md');
const adminSiteDetailPage = read('../../../apps/admin/src/routes/sites.$siteId.tsx');
const adminFormsPage = read('../../../apps/admin/src/routes/forms.tsx');
const adminProductsPage = read('../../../apps/admin/src/routes/products.tsx');
const adminCollectionsPage = read('../../../apps/admin/src/routes/collections.tsx');
const adminReusableSectionsPage = read('../../../apps/admin/src/routes/reusable-sections.tsx');

assert(
  manifestRoute.includes('site: `/api/sites?identifier=${encodeURIComponent(input.site.slug)}`'),
  'Frontend manifest must advertise public site discovery for custom frontends.',
);

assert(
  manifestRoute.includes('getCommentReportReasons') &&
    manifestRoute.includes('buildManifestCommentDiscovery') &&
    manifestRoute.includes("schemaVersion: 'backy.comments-discovery.v1'") &&
    manifestRoute.includes("publicListStatus: 'approved'") &&
    manifestRoute.includes("honeypotField: 'website'") &&
    manifestRoute.includes("timingField: 'startedAt'") &&
    manifestRoute.includes('comments: buildManifestCommentDiscovery(input.site.id, input.site.settings)') &&
    manifestRoute.includes('comments: buildManifestCommentDiscovery(site.id, site.settings)') &&
    frontendManifestSchema.includes('"comments"') &&
    frontendManifestSchema.includes('"backy.comments-discovery.v1"') &&
    frontendManifestSchema.includes('"reportUrlTemplate"') &&
    sdkSource.includes('BackyManifestCommentsModule') &&
    sdkSmoke.includes('manifest() missing comments discovery module') &&
    generatedSdkSmoke.includes('invalidGeneratedManifestCommentsDiscovery'),
  'Frontend manifest and SDK must expose structured comments discovery for custom frontend moderation/report UIs.',
);

assert(
  manifestRoute.includes('buildManifestMediaDiscovery') &&
    manifestRoute.includes("schemaVersion: 'backy.media-discovery.v1'") &&
    manifestRoute.includes("signedPrivateFiles: true") &&
    manifestRoute.includes("responsiveImages: true") &&
    manifestRoute.includes("editableMetadata: true") &&
    manifestRoute.includes('media: buildManifestMediaDiscovery(input.site.id, input.media, input.media.length, input.media.length)') &&
    manifestRoute.includes('media: buildManifestMediaDiscovery(site.id, media.media, media.pagination.total, media.pagination.total)') &&
    frontendManifestSchema.includes('"backy.media-discovery.v1"') &&
    frontendManifestSchema.includes('"signedPrivateFiles"') &&
    frontendManifestSchema.includes('"queryParams"') &&
    sdkSource.includes('schemaVersion: "backy.media-discovery.v1";') &&
    sdkSmoke.includes('manifest() missing media discovery module') &&
    generatedSdkSmoke.includes('invalidGeneratedManifestMediaDiscovery'),
  'Frontend manifest and SDK must expose structured media discovery for custom frontend asset browsers.',
);

assert(
  manifestRoute.includes("buildBackyThemeDiscovery") &&
    manifestRoute.includes("theme: buildBackyThemeDiscovery(input.site.theme)") &&
    manifestRoute.includes("theme: buildBackyThemeDiscovery(site.theme)") &&
    manifestRoute.includes("themeTokens: buildBackyThemeTokens(input.site.theme)") &&
    manifestRoute.includes("themeTokens: buildBackyThemeTokens(site.theme)") &&
    frontendManifestSchema.includes('"backy.theme-discovery.v1"') &&
    frontendManifestSchema.includes('"cssVariables"') &&
    frontendManifestSchema.includes('"editableFields"') &&
    sdkSource.includes('BackyManifestThemeModule') &&
    sdkSmoke.includes('manifest() missing theme discovery module') &&
    generatedSdkSmoke.includes('invalidGeneratedManifestThemeDiscovery'),
  'Frontend manifest and SDK must expose structured theme discovery and compiled CSS variables for custom frontends.',
);

assert(
  manifestRoute.includes('buildManifestLiveManagementDiscovery') &&
    manifestRoute.includes("schemaVersion: 'backy.live-management.v1'") &&
    manifestRoute.includes("requiredPermissions:") &&
    manifestRoute.includes("read: 'pages.view'") &&
    manifestRoute.includes("update: 'pages.edit'") &&
    manifestRoute.includes("conflict: 'PAGE_VERSION_CONFLICT'") &&
    manifestRoute.includes('liveManagement: buildManifestLiveManagementDiscovery(input.site.id)') &&
    manifestRoute.includes('liveManagement: buildManifestLiveManagementDiscovery(site.id)') &&
    frontendManifestSchema.includes('"backy.live-management.v1"') &&
    frontendManifestSchema.includes('"optimisticConcurrency"') &&
    frontendManifestSchema.includes('"PAGE_VERSION_CONFLICT"') &&
    sdkSource.includes('BackyManifestLiveManagementModule') &&
    sdkSmoke.includes('manifest() missing live-management discovery module') &&
    generatedSdkSmoke.includes('invalidGeneratedManifestLiveManagementDiscovery'),
  'Frontend manifest and SDK must expose structured live-management discovery for inline custom frontend editing.',
);

assert(
  manifestRoute.includes('buildManifestFormsDiscovery') &&
    manifestRoute.includes("schemaVersion: 'backy.forms-discovery.v1'") &&
    manifestRoute.includes("cacheableDefinitions: true") &&
    manifestRoute.includes("privateSubmissionData: true") &&
    manifestRoute.includes("publicDefinitionExcludesSubmissions: true") &&
    manifestRoute.includes('formsRuntime: buildManifestFormsDiscovery(input.site.id, input.forms)') &&
    manifestRoute.includes('formsRuntime: buildManifestFormsDiscovery(site.id, forms)') &&
    frontendManifestSchema.includes('"backy.forms-discovery.v1"') &&
    frontendManifestSchema.includes('"cacheableDefinitions"') &&
    frontendManifestSchema.includes('"FORM_VALIDATION_ERROR"') &&
    sdkSource.includes('BackyManifestFormsRuntimeModule') &&
    sdkSmoke.includes('manifest() missing forms runtime discovery module') &&
    generatedSdkSmoke.includes('invalidGeneratedManifestFormsRuntimeDiscovery'),
  'Frontend manifest and SDK must expose structured forms runtime discovery for custom frontend form UIs.',
);

assert(
  manifestRoute.includes('buildManifestCollectionsDiscovery') &&
    manifestRoute.includes("schemaVersion: 'backy.collections-discovery.v1'") &&
    manifestRoute.includes("fieldPolicyMetadata: 'metadata.visitorWritePolicy'") &&
    manifestRoute.includes("publicRecordListsOnlyIncludePublishedRecords: true") &&
    manifestRoute.includes('collectionsRuntime: buildManifestCollectionsDiscovery(input.site.id, publicCollections)') &&
    manifestRoute.includes('collectionsRuntime: buildManifestCollectionsDiscovery(site.id, collections)') &&
    frontendManifestSchema.includes('"backy.collections-discovery.v1"') &&
    frontendManifestSchema.includes('"publicUpdateAndDeleteMayRequireWriteToken"') &&
    frontendManifestSchema.includes('"SLUG_CONFLICT"') &&
    sdkSource.includes('BackyManifestCollectionsRuntimeModule') &&
    sdkSmoke.includes('manifest() missing collections runtime discovery module') &&
    generatedSdkSmoke.includes('invalidGeneratedManifestCollectionsRuntimeDiscovery'),
  'Frontend manifest and SDK must expose structured collections runtime discovery for custom frontend collection UIs.',
);

assert(
  manifestRoute.includes('buildManifestReusableSectionsDiscovery') &&
    manifestRoute.includes("schemaVersion: 'backy.reusable-sections-discovery.v1'") &&
    manifestRoute.includes("publicReadsOnlyIncludeActiveSections: true") &&
    manifestRoute.includes("section: 'backy.reusable-section.v1'") &&
    manifestRoute.includes('reusableSectionsRuntime: buildManifestReusableSectionsDiscovery(input.site.id, input.reusableSections)') &&
    manifestRoute.includes('reusableSectionsRuntime: buildManifestReusableSectionsDiscovery(site.id, reusableSections)') &&
    frontendManifestSchema.includes('"backy.reusable-sections-discovery.v1"') &&
    frontendManifestSchema.includes('"cacheableSections"') &&
    frontendManifestSchema.includes('"REUSABLE_SECTION_NOT_FOUND"') &&
    sdkSource.includes('BackyManifestReusableSectionsRuntimeModule') &&
    sdkSmoke.includes('manifest() missing reusable sections runtime discovery module') &&
    generatedSdkSmoke.includes('invalidGeneratedReusableSectionsRuntimeDiscovery'),
  'Frontend manifest and SDK must expose structured reusable-section runtime discovery for custom frontend section browsers.',
);

assert(
  publicSiteDiscoveryRoute.includes('latestDiscoveryCacheRevision') &&
    publicSiteDiscoveryRoute.includes("scope: 'discovery'") &&
    publicSiteDiscoveryRoute.includes('cacheRevision') &&
    adminSitesRoute.includes('recordSiteCacheInvalidation') &&
    adminSitesRoute.includes('reason: "site-created"') &&
    adminSiteDetailRoute.includes('recordSiteCacheInvalidation') &&
    adminSiteDetailRoute.includes('reason: "site-updated"'),
  'Public site discovery must use database discovery invalidation revisions from site create/update mutations.',
);

assert(
  adminTemplateRegistryRoute.includes('GET /api/admin/sites/[siteId]/templates') &&
    adminTemplateRegistryRoute.includes('buildTemplateRegistry') &&
    adminTemplateRegistryRoute.includes('permission: "pages.view"') &&
    templateRegistryLib.includes('schemaVersion: "backy.template-registry.v1"') &&
    templateRegistryLib.includes('cloneField: "frontendDesignTemplateId"') &&
    templateRegistryLib.includes('cloneTargets') &&
    templateRegistryLib.includes('blogPost: `/api/admin/sites/${siteId}/blog`') &&
    templateRegistryLib.includes('form: `/api/admin/sites/${siteId}/forms`') &&
    templateRegistryLib.includes('product: `/api/admin/sites/${siteId}/collections/products/records`'),
  'Admin template registry must expose persisted frontend-design templates and clone targets for page/blog/form/section/collection/product creation.',
);

assert(
  adminFrontendDesignRoute.includes('buildTemplateRegistry') &&
    adminFrontendDesignRoute.includes('templates: `/api/admin/sites/${site.id}/templates`') &&
    adminFrontendDesignRoute.includes('templateRegistry:') &&
    adminFrontendDesignRoute.includes('cloneTargets: templateRegistry.cloneTargets') &&
    publicPackage.includes('"test:template-registry": "tsx --tsconfig tsconfig.json scripts/template-registry-smoke.ts"') &&
    templateRegistrySmoke.includes('buildTemplateRegistry("site-template-smoke", frontendDesign') &&
    templateRegistrySmoke.includes('contract: "backy.template-registry.v1"') &&
    templateRegistrySmoke.includes('registry.cloneTargets.product') &&
    apiContracts.includes('templateRegistry') &&
    apiContracts.includes('endpoints.templates'),
  'Admin frontend-design responses must advertise the normalized template registry endpoint and clone summary.',
);

assert(
  adminSiteDetailPage.includes('search: { siteId: targetSiteId, frontendTemplate: template.id }') &&
    adminSiteDetailPage.includes('draft: "new"') &&
    adminSiteDetailPage.includes('frontendTemplate: template.id') &&
    adminFormsPage.includes('frontendTemplate: normalizedSearchString(search.frontendTemplate)') &&
    adminFormsPage.includes('activeFrontendTemplateId === template.id') &&
    adminProductsPage.includes('frontendTemplate: normalizedSearchString(search.frontendTemplate)') &&
    adminProductsPage.includes('activeFrontendTemplateId === template.id') &&
    adminReusableSectionsPage.includes('frontendTemplate: normalizedSearchString(search.frontendTemplate)') &&
    adminReusableSectionsPage.includes('activeFrontendTemplateId === template.id') &&
    adminCollectionsPage.includes('frontendTemplate: normalizedSearchString(search.frontendTemplate)') &&
    adminCollectionsPage.includes("resetCollectionForm({ frontendTemplateId: routeSearch.frontendTemplate || '' })") &&
    adminCollectionsPage.includes('activeFrontendTemplateId === template.id'),
  'Admin template registry actions must deep-link non-page templates with frontendTemplate search state and preserve collection draft selection.',
);

assert(
  manifestRoute.includes('databaseCertification: frontendDatabaseCertification') &&
    manifestRoute.includes('backy.frontend-database-certification.v1') &&
    manifestRoute.includes('npm run ci:sdk-postgres-smoke') &&
    manifestRoute.includes('npm run test:frontend-contract-types') &&
    openApiRoute.includes('"x-backy-database-certification": frontendDatabaseCertification') &&
    generatedSdkTypes.includes('GeneratedBackyFrontendManifestDatabaseCertification') &&
    generatedSdkTypes.includes('"x-backy-database-certification"?: GeneratedBackyFrontendManifestDatabaseCertification') &&
    generatedSdkSmoke.includes('frontendDatabaseCertification') &&
    generatedSdkSmoke.includes('invalidGeneratedManifestDatabaseCertification'),
  'Frontend manifest, OpenAPI, and generated SDK types must expose the non-secret SDK Postgres certification handoff.',
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
