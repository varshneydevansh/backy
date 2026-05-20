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
const publicProxy = read('../src/proxy.ts');
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
const completionSpec = read('../../../specs/backy-cms-completion-spec.md');
const adminSiteDetailPage = read('../../../apps/admin/src/routes/sites.$siteId.tsx');
const adminPagesNewPage = read('../../../apps/admin/src/routes/pages.new.tsx');
const adminBlogNewPage = read('../../../apps/admin/src/routes/blog.new.tsx');
const adminFormsPage = read('../../../apps/admin/src/routes/forms.tsx');
const adminProductsPage = read('../../../apps/admin/src/routes/products.tsx');
const adminCollectionsPage = read('../../../apps/admin/src/routes/collections.tsx');
const adminReusableSectionsPage = read('../../../apps/admin/src/routes/reusable-sections.tsx');

assert(
  manifestRoute.includes('site: `/api/sites?identifier=${encodeURIComponent(input.site.slug)}`'),
  'Frontend manifest must advertise public site discovery for custom frontends.',
);

assert(
  !completionSpec.includes('GET /api/public/sites/:siteId/media/:assetId') &&
    !completionSpec.includes('POST /api/admin/sites/:siteId/pages/:pageId/media') &&
    !completionSpec.includes('POST /api/admin/sites/:siteId/blog/:postId/media') &&
    !completionSpec.includes('POST /api/public/sites/:siteId/forms/:formId/submissions') &&
    !completionSpec.includes('PUT /api/admin/sites/:siteId/forms/:formId/submissions/:submissionId') &&
    !completionSpec.includes('POST /api/public/sites/:siteId/pages/:pageId/comments') &&
    !completionSpec.includes('GET /api/public/sites/:siteId/pages?path=/...') &&
    completionSpec.includes('POST /api/admin/sites/:siteId/media/:mediaId/bind') &&
    completionSpec.includes('GET /api/sites/:siteId/media/:mediaId/file') &&
    completionSpec.includes('Asset scope is `global`, `page`, or `post`; file visibility is `public` or `private`.') &&
    completionSpec.includes('POST /api/sites/:siteId/forms/:formId/submissions') &&
    completionSpec.includes('PATCH /api/admin/sites/:siteId/forms/:formId/submissions/:submissionId') &&
    completionSpec.includes('POST /api/sites/:siteId/pages/:pageId/comments') &&
    completionSpec.includes('POST /api/sites/:siteId/blog/:postId/comments') &&
    completionSpec.includes('PATCH /api/sites/:siteId/comments') &&
    completionSpec.includes('GET /api/sites/:siteId/render?path=/...') &&
    completionSpec.includes('GET /api/sites/:siteId/blog?slug=...'),
  'Completion spec frontend interaction model must match the implemented /api/sites media, forms, comments, and render contracts.',
);

assert(
  publicProxy.includes('BACKY_CORS_EXPOSED_HEADERS') &&
    publicProxy.includes('normalizeCorsOrigin') &&
    publicProxy.includes("trimmed === '*'") &&
    publicProxy.includes('new URL(trimmed).origin') &&
    publicProxy.includes('process.env.BACKY_CORS_ALLOWED_ORIGINS') &&
    publicProxy.includes("headers.set('Access-Control-Allow-Origin', origin as string)") &&
    publicProxy.includes("headers.set('Access-Control-Expose-Headers', BACKY_CORS_EXPOSED_HEADERS)") &&
    publicProxy.includes("'x-backy-request-id'") &&
    publicProxy.includes("'x-backy-contract-version'") &&
    publicProxy.includes("'x-backy-schema-version'") &&
    publicProxy.includes("'x-backy-cache-revision'") &&
    publicProxy.includes("'x-backy-supported-schema-versions'") &&
    publicProxy.includes("'ETag'") &&
    publicProxy.includes("headers.append('Vary', 'Origin')"),
  'Public proxy CORS must allow exact configured origins and expose Backy contract/cache/request headers to browser-based custom frontends.',
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
    manifestRoute.includes("publicFolderDiscovery: true") &&
    manifestRoute.includes("editableMetadata: true") &&
    manifestRoute.includes("folders: `/api/sites/${siteId}/media/folders`") &&
    manifestRoute.includes("'folderId'") &&
    manifestRoute.includes("'scope'") &&
    manifestRoute.includes("'tag'") &&
    manifestRoute.includes("file: 'document'") &&
    manifestRoute.includes('media: buildManifestMediaDiscovery(input.site.id, input.media, input.media.length, input.media.length)') &&
    manifestRoute.includes('media: buildManifestMediaDiscovery(site.id, media.media, media.pagination.total, media.pagination.total)') &&
    frontendManifestSchema.includes('"backy.media-discovery.v1"') &&
    frontendManifestSchema.includes('"signedPrivateFiles"') &&
    frontendManifestSchema.includes('"publicFolderDiscovery"') &&
    frontendManifestSchema.includes('"queryParams"') &&
    frontendManifestSchema.includes('"folderId"') &&
    frontendManifestSchema.includes('"backy.media-folders.v1"') &&
    frontendManifestSchema.includes('"maxLimit"') &&
    sdkSource.includes('schemaVersion: "backy.media-discovery.v1";') &&
    sdkSource.includes('BackyMediaFolder') &&
    sdkSource.includes('mediaFolders(') &&
    sdkSource.includes('type?: "image" | "video" | "audio" | "document" | "file" | "font" | "other"') &&
    sdkSource.includes('siteId?: string') &&
    sdkSmoke.includes('manifest() missing media discovery module') &&
    sdkSmoke.includes('manifest() media discovery missing folderId filter') &&
    sdkSmoke.includes('mediaFolders() missing folder array') &&
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
    manifestRoute.includes("post: `/api/sites/${siteId}/manage/blog/{postId}`") &&
    manifestRoute.includes("requiredPermissions:") &&
    manifestRoute.includes("read: 'pages.view'") &&
    manifestRoute.includes("update: 'pages.edit'") &&
    manifestRoute.includes("conflict: 'PAGE_VERSION_CONFLICT'") &&
    manifestRoute.includes("postConflict: 'BLOG_VERSION_CONFLICT'") &&
    manifestRoute.includes('liveManagement: buildManifestLiveManagementDiscovery(input.site.id)') &&
    manifestRoute.includes('liveManagement: buildManifestLiveManagementDiscovery(site.id)') &&
    frontendManifestSchema.includes('"backy.live-management.v1"') &&
    frontendManifestSchema.includes('"postConflict"') &&
    frontendManifestSchema.includes('"optimisticConcurrency"') &&
    frontendManifestSchema.includes('"PAGE_VERSION_CONFLICT"') &&
    frontendManifestSchema.includes('"BLOG_VERSION_CONFLICT"') &&
    sdkSource.includes('BackyManifestLiveManagementModule') &&
    sdkSource.includes('post: string;') &&
    sdkSmoke.includes('manifest() missing live-management discovery module') &&
    sdkSmoke.includes('manifest() live-management blog post endpoint drifted') &&
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
  manifestRoute.includes('buildManifestPagesDiscovery') &&
    manifestRoute.includes("schemaVersion: 'backy.pages-discovery.v1'") &&
    manifestRoute.includes("draftPreviewRequiresToken: true") &&
    manifestRoute.includes("notFound: 'PAGE_NOT_FOUND'") &&
    manifestRoute.includes('pagesRuntime: buildManifestPagesDiscovery(input.site.id, input.pages)') &&
    manifestRoute.includes('pagesRuntime: buildManifestPagesDiscovery(site.id, pages)') &&
    frontendManifestSchema.includes('"backy.pages-discovery.v1"') &&
    frontendManifestSchema.includes('"previewTokenIsNeverReturned"') &&
    frontendManifestSchema.includes('"INVALID_PAGE_LIMIT"') &&
    sdkSource.includes('BackyManifestPagesRuntimeModule') &&
    sdkSmoke.includes('manifest() missing pages runtime discovery module') &&
    generatedSdkSmoke.includes('invalidGeneratedManifestPagesRuntimeDiscovery'),
  'Frontend manifest and SDK must expose structured pages runtime discovery for custom frontend page routing and preview UIs.',
);

assert(
    manifestRoute.includes('buildManifestBlogDiscovery') &&
    manifestRoute.includes("schemaVersion: 'backy.blog-discovery.v1'") &&
    manifestRoute.includes("liveManage: `/api/sites/${siteId}/manage/blog/{postId}`") &&
    manifestRoute.includes("draftPreviewRequiresToken: true") &&
    manifestRoute.includes("notFound: 'POST_NOT_FOUND'") &&
    manifestRoute.includes('blogRuntime: buildManifestBlogDiscovery(input.site.id, input.posts, input.categories, input.tags, input.authors, blogFeeds)') &&
    manifestRoute.includes('blogRuntime: buildManifestBlogDiscovery(site.id, posts, categories, tags, authors, blogFeeds)') &&
    frontendManifestSchema.includes('"backy.blog-discovery.v1"') &&
    frontendManifestSchema.includes('"liveManageUpdate"') &&
    frontendManifestSchema.includes('"INVALID_BLOG_ARCHIVE_MONTH"') &&
    sdkSource.includes('BackyManifestBlogRuntimeModule') &&
    sdkSource.includes('liveManagement: boolean;') &&
    sdkSmoke.includes('manifest() missing blog runtime discovery module') &&
    sdkSmoke.includes('manifest() blog runtime live manage endpoint drifted') &&
    generatedSdkSmoke.includes('invalidGeneratedManifestBlogRuntimeDiscovery'),
  'Frontend manifest and SDK must expose structured blog runtime discovery for custom frontend blog index/detail UIs.',
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
  manifestRoute.includes('buildManifestCommerceDiscovery') &&
    manifestRoute.includes("schemaVersion: 'backy.commerce-discovery.v1'") &&
    manifestRoute.includes("schemaVersion: 'backy.commerce-order-request.v1'") &&
    manifestRoute.includes("'lineItems'") &&
    manifestRoute.includes("'customerName/customerEmail/customerPhone'") &&
    manifestRoute.includes("'provider_created'") &&
    manifestRoute.includes("ordersCollectionMustRemainPrivate: true") &&
    manifestRoute.includes("orderQueueNotPrivate: 'ORDER_QUEUE_NOT_PRIVATE'") &&
    manifestRoute.includes('commerceRuntime: buildManifestCommerceDiscovery(input.site.id, commerce, productCollection, ordersCollection)') &&
    manifestRoute.includes('commerceRuntime: buildManifestCommerceDiscovery(site.id, commerce, productCollection, ordersCollection)') &&
    frontendManifestSchema.includes('"backy.commerce-discovery.v1"') &&
    frontendManifestSchema.includes('"backy.commerce-order-request.v1"') &&
    frontendManifestSchema.includes('"commerceProviderCertification"') &&
    frontendManifestSchema.includes('"providerCertification": { "$ref": "#/$defs/commerceProviderCertification" }') &&
    frontendManifestSchema.includes('"backy.commerce-provider-certification-env-template.v1"') &&
    frontendManifestSchema.includes('"checkoutSessionStatuses"') &&
    frontendManifestSchema.includes('"providerSecretsNeverReturned"') &&
    frontendManifestSchema.includes('"PRODUCT_OUT_OF_STOCK"') &&
    generatedSdkTypes.includes('GeneratedBackyFrontendManifestCommerceProviderCertification') &&
    generatedSdkTypes.includes('providerCertification: GeneratedBackyFrontendManifestCommerceProviderCertification') &&
    sdkSource.includes('BackyManifestCommerceRuntimeModule') &&
    sdkSource.includes('GeneratedBackyFrontendManifestCommerceProviderCertification') &&
    sdkSource.includes('lineItems?: BackyCommerceLineItemInput[]') &&
    sdkSource.includes('checkoutSession?: string | { id?: string; [key: string]: unknown }') &&
    openApiRoute.includes('"provider_created"') &&
    openApiRoute.includes('lineItems: {') &&
    openApiRoute.includes('customerName: { type: "string" }') &&
    sdkSmoke.includes('manifest() missing commerce runtime discovery module') &&
    sdkSmoke.includes('manifest() commerce runtime missing lineItems order alias') &&
    generatedSdkSmoke.includes('invalidGeneratedManifestCommerceProviderCertification') &&
    generatedSdkSmoke.includes('invalidGeneratedManifestCommerceRuntimeDiscovery'),
  'Frontend manifest and SDK must expose structured commerce runtime discovery for custom frontend product catalog and checkout UIs.',
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
    templateRegistryLib.includes('backy.template-version-readiness.v1') &&
    templateRegistryLib.includes('backy.template-registry-action-plan.v1') &&
    templateRegistryLib.includes('versioning') &&
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
    adminFrontendDesignRoute.includes('versionSummary: templateRegistry.versionSummary') &&
    adminFrontendDesignRoute.includes('actionPlan: templateRegistry.actionPlan') &&
    publicPackage.includes('"test:template-registry": "tsx --tsconfig tsconfig.json scripts/template-registry-smoke.ts"') &&
    templateRegistrySmoke.includes('buildTemplateRegistry("site-template-smoke", frontendDesign') &&
    templateRegistrySmoke.includes('contract: "backy.template-registry.v1"') &&
    templateRegistrySmoke.includes('backy.template-version-readiness.v1') &&
    templateRegistrySmoke.includes('backy.template-registry-action-plan.v1') &&
    templateRegistrySmoke.includes('registry.cloneTargets.product') &&
    apiContracts.includes('templateRegistry') &&
    apiContracts.includes('endpoints.templates'),
  'Admin frontend-design responses must advertise the normalized template registry endpoint and clone summary.',
);

assert(
    adminSiteDetailPage.includes('frontendDesignTemplateId: template.id') &&
    adminSiteDetailPage.includes('site-template-version-readiness') &&
    adminSiteDetailPage.includes('site-template-prepare-version-metadata') &&
    adminSiteDetailPage.includes('site-template-copy-version-plan') &&
    adminSiteDetailPage.includes('backy.template-registry-version-action-plan.v1') &&
    !adminSiteDetailPage.includes('designTemplate: template.id') &&
    adminSiteDetailPage.includes('search: { siteId: targetSiteId, frontendTemplate: template.id }') &&
    adminSiteDetailPage.includes('draft: "new"') &&
    adminSiteDetailPage.includes('frontendTemplate: template.id') &&
    adminPagesNewPage.includes('frontendDesignTemplateId?: string') &&
    adminPagesNewPage.includes('designTemplate: normalizedFrontendDesignTemplateSearch(search)') &&
    adminBlogNewPage.includes('frontendDesignTemplateId?: string') &&
    adminBlogNewPage.includes('designTemplate: normalizedFrontendDesignTemplateSearch(search)') &&
    adminFormsPage.includes('frontendTemplate: normalizedSearchString(search.frontendTemplate)') &&
    adminFormsPage.includes('activeFrontendTemplateId === template.id') &&
    adminProductsPage.includes('frontendTemplate: normalizedSearchString(search.frontendTemplate)') &&
    adminProductsPage.includes('activeFrontendTemplateId === template.id') &&
    adminReusableSectionsPage.includes('frontendTemplate: normalizedSearchString(search.frontendTemplate)') &&
    adminReusableSectionsPage.includes('activeFrontendTemplateId === template.id') &&
    adminCollectionsPage.includes('frontendTemplate: normalizedSearchString(search.frontendTemplate)') &&
    adminCollectionsPage.includes("resetCollectionForm({ frontendTemplateId: routeSearch.frontendTemplate || '' })") &&
    adminCollectionsPage.includes('activeFrontendTemplateId === template.id'),
  'Admin template registry actions must deep-link page/blog templates with frontendDesignTemplateId, non-page templates with frontendTemplate, and preserve collection draft selection.',
);

assert(
  adminCollectionsPage.includes('data-testid="collections-slug-policy-controls"') &&
    adminCollectionsPage.includes('backy.collection-slug-policy.v1') &&
    adminCollectionsPage.includes('backy.collection-slug-policy-readiness.v1') &&
    adminCollectionsPage.includes('backy.collection-slug-policy-action-plan.v1') &&
    adminCollectionsPage.includes('slugPolicy: slugPolicyReadiness') &&
    apiContracts.includes('backy.collection-slug-policy.v1'),
  'Admin collections dynamic routes must expose slug policy readiness and handoff metadata for custom frontends.',
);

assert(
  manifestRoute.includes('databaseCertification: frontendDatabaseCertification') &&
    manifestRoute.includes('backy.frontend-database-certification.v1') &&
    manifestRoute.includes('npm run ci:sdk-postgres-smoke') &&
    manifestRoute.includes('npm run test:frontend-contract-types') &&
    manifestRoute.includes('operatorCommandTemplate: FRONTEND_DATABASE_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE') &&
    manifestRoute.includes('operatorEnvTemplate') &&
    manifestRoute.includes('buildFrontendDatabaseCertificationCommand') &&
    manifestRoute.includes('buildFrontendDatabaseCertificationEnvTemplate') &&
    manifestRoute.includes('backy.frontend-database-certification-env-template.v1') &&
    manifestRoute.includes('scenarioEvidence: buildFrontendDatabaseCertificationEvidence(frontendDatabaseCertificationRuntime)') &&
    manifestRoute.includes('backy.frontend-database-certification-evidence.v1') &&
    manifestRoute.includes("'generated-sdk'") &&
    manifestRoute.includes('runtime: frontendDatabaseCertificationRuntime') &&
    manifestRoute.includes('readyForCertification') &&
    openApiRoute.includes('"x-backy-database-certification": frontendDatabaseCertification') &&
    openApiRoute.includes('operatorCommandTemplate: FRONTEND_DATABASE_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE') &&
    openApiRoute.includes('operatorEnvTemplate') &&
    openApiRoute.includes('buildFrontendDatabaseCertificationEnvTemplate') &&
    openApiRoute.includes('backy.frontend-database-certification-env-template.v1') &&
    openApiRoute.includes('scenarioEvidence: buildFrontendDatabaseCertificationEvidence(frontendDatabaseCertificationRuntime)') &&
    openApiRoute.includes('backy.frontend-database-certification-evidence.v1') &&
    openApiRoute.includes('"generated-sdk"') &&
    openApiRoute.includes('runtime: frontendDatabaseCertificationRuntime') &&
    generatedSdkTypes.includes('GeneratedBackyFrontendManifestDatabaseCertification') &&
    generatedSdkTypes.includes('operatorCommandTemplate: {') &&
    generatedSdkTypes.includes('operatorEnvTemplate: {') &&
    generatedSdkTypes.includes('envTemplateSchemaVersion: "backy.frontend-database-certification-env-template.v1"') &&
    generatedSdkTypes.includes('readyForCertification: boolean') &&
    generatedSdkTypes.includes('schemaVersion: "backy.frontend-database-certification-evidence.v1"') &&
    generatedSdkTypes.includes('"x-backy-database-certification"?: GeneratedBackyFrontendManifestDatabaseCertification') &&
    sdkSource.includes('export interface BackyFrontendDatabaseCertification') &&
    sdkSource.includes('operatorCommandTemplate: {') &&
    sdkSource.includes('operatorEnvTemplate: {') &&
    sdkSource.includes('envTemplateSchemaVersion: "backy.frontend-database-certification-env-template.v1"') &&
    sdkSource.includes('schemaVersion: "backy.frontend-database-certification-evidence.v1"') &&
    sdkSource.includes('databaseCertification: BackyFrontendDatabaseCertification') &&
    sdkSource.includes('contract: BackyFrontendManifestContract') &&
    generatedSdkSmoke.includes('frontendDatabaseCertification') &&
    generatedSdkSmoke.includes('scenarioEvidence') &&
    generatedSdkSmoke.includes('convenienceFrontendDatabaseCertification') &&
    generatedSdkSmoke.includes('invalidGeneratedManifestDatabaseCertification'),
  'Frontend manifest, OpenAPI, generated SDK types, and convenience SDK manifest types must expose the non-secret SDK Postgres certification handoff.',
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
