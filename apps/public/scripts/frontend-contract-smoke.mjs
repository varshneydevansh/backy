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
const publicAgentHandoffRoute = read('../src/app/api/sites/[siteId]/agent-handoff/route.ts');
const publicSiteDiscoveryRoute = read('../src/app/api/sites/route.ts');
const publicPagesRoute = read('../src/app/api/sites/[siteId]/pages/route.ts');
const publicBlogRoute = read('../src/app/api/sites/[siteId]/blog/route.ts');
const publicFormsRoute = read('../src/app/api/sites/[siteId]/forms/route.ts');
const publicFormDetailRoute = read('../src/app/api/sites/[siteId]/forms/[formId]/route.ts');
const publicFormDefinitionRoute = read('../src/app/api/sites/[siteId]/forms/[formId]/definition/route.ts');
const publicNewsletterSubscribersRoute = read('../src/app/api/sites/[siteId]/newsletter/subscribers/route.ts');
const publicCommerceCatalogRoute = read('../src/app/api/sites/[siteId]/commerce/catalog/route.ts');
const publicCommerceOrdersRoute = read('../src/app/api/sites/[siteId]/commerce/orders/route.ts');
const publicCollectionsRoute = read('../src/app/api/sites/[siteId]/collections/route.ts');
const publicCollectionResourcesLib = read('../src/lib/publicCollectionResources.ts');
const commerceCatalogLib = read('../src/lib/commerceCatalog.ts');
const completionStatusClosureLib = read('../src/lib/completionStatusClosure.ts');
const customFrontendAgentHandoffLib = read('../../../packages/core/src/custom-frontend-agent-handoff.ts');
const routeResolverLib = read('../src/lib/routeResolver.ts');
const repositoryRouteResolverLib = read('../src/lib/repositoryRouteResolver.ts');
const renderPayloadLib = read('../src/lib/renderPayload.ts');
const publicProxy = read('../src/proxy.ts');
const adminSitesRoute = read('../src/app/api/admin/sites/route.ts');
const adminSiteDetailRoute = read('../src/app/api/admin/sites/[siteId]/route.ts');
const adminSiteSettingsRoute = read('../src/app/api/admin/sites/[siteId]/settings/route.ts');
const adminFrontendDesignRoute = read('../src/app/api/admin/sites/[siteId]/frontend-design/route.ts');
const adminPagesRoute = read('../src/app/api/admin/sites/[siteId]/pages/route.ts');
const adminPageDetailRoute = read('../src/app/api/admin/sites/[siteId]/pages/[pageId]/route.ts');
const adminPagePublishRoute = read('../src/app/api/admin/sites/[siteId]/pages/[pageId]/publish/route.ts');
const adminPageArchiveRoute = read('../src/app/api/admin/sites/[siteId]/pages/[pageId]/archive/route.ts');
const adminBlogRoute = read('../src/app/api/admin/sites/[siteId]/blog/route.ts');
const adminBlogPostDetailRoute = read('../src/app/api/admin/sites/[siteId]/blog/[postId]/route.ts');
const adminBlogPostPublishRoute = read('../src/app/api/admin/sites/[siteId]/blog/[postId]/publish/route.ts');
const adminBlogPostArchiveRoute = read('../src/app/api/admin/sites/[siteId]/blog/[postId]/archive/route.ts');
const adminCollectionRecordsRoute = read('../src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/route.ts');
const adminCollectionRecordDetailRoute = read('../src/app/api/admin/sites/[siteId]/collections/[collectionId]/records/[recordId]/route.ts');
const adminReusableSectionsRoute = read('../src/app/api/admin/sites/[siteId]/reusable-sections/route.ts');
const adminReusableSectionDetailRoute = read('../src/app/api/admin/sites/[siteId]/reusable-sections/[sectionId]/route.ts');
const adminNewsletterSubscribersRoute = read('../src/app/api/admin/sites/[siteId]/newsletter/subscribers/route.ts');
const publicReusableSectionsRoute = read('../src/app/api/sites/[siteId]/reusable-sections/route.ts');
const publicReusableSectionDetailRoute = read('../src/app/api/sites/[siteId]/reusable-sections/[sectionId]/route.ts');
const adminTemplateRegistryRoute = read('../src/app/api/admin/sites/[siteId]/templates/route.ts');
const templateRegistryLib = read('../src/lib/templateRegistry.ts');
const frontendDesignContractLib = read('../src/lib/frontendDesignContract.ts');
const newsletterSubscribersLib = read('../src/lib/newsletterSubscribers.ts');
const liveManagementEditorCommandRegistryLib = read('../src/lib/liveManagementEditorCommandRegistry.ts');
const backyStoreLib = read('../src/lib/backyStore.ts');
const pageRenderer = read('../src/components/PageRenderer.tsx');
const livePageManagementOverlay = read('../src/components/LivePageManagementOverlay.tsx');
const repositoryMediaReferenceSync = read('../src/lib/repositoryMediaReferenceSync.ts');
const coreContentMigrations = read('../../../packages/core/src/content-migrations.ts');
const coreTypes = read('../../../packages/core/src/types/index.ts');
const coreThemeTokens = read('../../../packages/core/src/theme-tokens.ts');
const sdkSource = read('../../../packages/sdk-js/src/index.ts');
const sdkSmoke = read('../../../packages/sdk-js/scripts/smoke.mjs');
const generatedSdkSmoke = read('../../../packages/sdk-js/scripts/generated-contract-types.ts');
const generatedSdkTypes = read('../../../packages/sdk-js/src/generated-contract-types.ts');
const frontendManifestSchema = read('../../../specs/ai-frontend-contract/frontend-manifest.schema.json');
const contentPayloadSchema = read('../../../specs/ai-frontend-contract/content-payload.schema.json');
const customFrontendAgentHandoffDocs = read('../../../specs/custom-frontend-agent-handoff.md');
const rootPackage = read('../../../package.json');
const publicPackage = read('../package.json');
const templateRegistrySmoke = read('template-registry-smoke.ts');
const pageRendererSmoke = read('page-renderer-rich-text-smoke.tsx');
const apiContracts = read('../../../specs/backy-api-contracts.md');
const audit = read('../../../specs/page-completion-audit/backy-page-surface-audit.md');
const completionSpec = read('../../../specs/backy-cms-completion-spec.md');
const adminSiteDetailPage = read('../../../apps/admin/src/routes/sites.$siteId.tsx');
const adminPagesNewPage = read('../../../apps/admin/src/routes/pages.new.tsx');
const adminBlogNewPage = read('../../../apps/admin/src/routes/blog.new.tsx');
const adminFormsPage = read('../../../apps/admin/src/routes/forms.tsx');
const adminNewsletterPage = read('../../../apps/admin/src/routes/newsletter.tsx');
const adminProductsPage = read('../../../apps/admin/src/routes/products.tsx');
const adminCollectionsPage = read('../../../apps/admin/src/routes/collections.tsx');
const adminReusableSectionsPage = read('../../../apps/admin/src/routes/reusable-sections.tsx');
const adminReusableSectionsSmoke = read('../../../apps/admin/scripts/reusable-sections-smoke.mjs');

const requiredComponentApiFieldPaths = [
  'element.id',
  'element.type',
  'element.name',
  'element.x',
  'element.y',
  'element.width',
  'element.height',
  'element.rotation',
  'element.zIndex',
  'element.visible',
  'element.locked',
  'element.props',
  'element.styles',
  'element.responsive',
  'element.tokenRefs',
  'element.assetIds',
  'element.animation',
  'element.dataBindings',
  'element.bindingSlots',
  'element.accessibility',
  'element.metadata',
  'element.children[]',
  'content.contentDocument.nodes',
  'content.editableMap',
  'meta.frontendDesignEditableMap',
];
const requiredComponentApiFamilies = [
  'layout',
  'typography',
  'media',
  'forms',
  'commerce',
  'collections',
  'navigation',
  'comments',
  'embeds',
  'interactive-components',
  'custom-code',
];
const requiredComponentApiTypes = [
  'heading',
  'text',
  'image',
  'button',
  'nav',
  'form',
  'repeater',
  'comment',
  'interactiveFigure',
  'codeComponent',
];
const missingComponentApiCorePaths = requiredComponentApiFieldPaths.filter((path) => !customFrontendAgentHandoffLib.includes(path));
const missingComponentApiSchemaPaths = requiredComponentApiFieldPaths.filter((path) => !frontendManifestSchema.includes(`"const": "${path}"`));
const missingComponentApiDocsPaths = requiredComponentApiFieldPaths.filter((path) => {
  const docPath = path.startsWith('element.') ? path.replace(/^element\./, '') : path;
  return !customFrontendAgentHandoffDocs.includes(`\`${docPath}\``);
});
const missingComponentApiCoreFamilies = requiredComponentApiFamilies.filter((family) => !customFrontendAgentHandoffLib.includes(`'${family}'`));
const missingComponentApiSchemaFamilies = requiredComponentApiFamilies.filter((family) => !frontendManifestSchema.includes(`"const": "${family}"`));
const missingComponentApiCoreTypes = requiredComponentApiTypes.filter((type) => !customFrontendAgentHandoffLib.includes(`'${type}'`));
const missingComponentApiSchemaTypes = requiredComponentApiTypes.filter((type) => !frontendManifestSchema.includes(`"const": "${type}"`));
assert(
  missingComponentApiCorePaths.length === 0 &&
    missingComponentApiSchemaPaths.length === 0 &&
    missingComponentApiDocsPaths.length === 0 &&
    missingComponentApiCoreFamilies.length === 0 &&
    missingComponentApiSchemaFamilies.length === 0 &&
    missingComponentApiCoreTypes.length === 0 &&
    missingComponentApiSchemaTypes.length === 0 &&
    customFrontendAgentHandoffLib.includes('CUSTOM_FRONTEND_COMPONENT_TYPE_CONTRACTS') &&
    customFrontendAgentHandoffLib.includes('componentTypeContracts: CUSTOM_FRONTEND_COMPONENT_TYPE_CONTRACTS') &&
    frontendManifestSchema.includes('"componentTypeContracts"') &&
    customFrontendAgentHandoffDocs.includes('`componentTypeContracts`') &&
    apiContracts.includes('componentTypeContracts') &&
    sdkSmoke.includes('const requiredComponentApiTypes = [') &&
    sdkSmoke.includes('const requiredComponentApiFieldPaths = [') &&
    sdkSmoke.includes('assertComponentApiContractCoverage(customFrontendAgentHandoff.componentApiContract') &&
    sdkSmoke.includes('assertComponentApiContractCoverage(agentHandoff.data.componentApiContract'),
  `Custom frontend component API coverage drifted: ${JSON.stringify({
    missingComponentApiCorePaths,
    missingComponentApiSchemaPaths,
    missingComponentApiDocsPaths,
    missingComponentApiCoreFamilies,
    missingComponentApiSchemaFamilies,
    missingComponentApiCoreTypes,
    missingComponentApiSchemaTypes,
  })}`,
);
const adminPropertyPanel = read('../../../apps/admin/src/components/editor/PropertyPanel.tsx');
const adminLinkBehaviorProperties = read('../../../apps/admin/src/components/editor/LinkBehaviorProperties.tsx');
const adminCanvas = read('../../../apps/admin/src/components/editor/Canvas.tsx');
const adminCanvasEditor = read('../../../apps/admin/src/components/editor/CanvasEditor.tsx');
const adminLayersPanel = read('../../../apps/admin/src/components/editor/LayersPanel.tsx');

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
    publicProxy.includes('requestHeadersWithRequestId') &&
    publicProxy.includes("headers.set('x-request-id', requestId)") &&
    publicProxy.includes("headers.append('Vary', 'Origin')"),
  'Public proxy CORS must allow exact configured origins and expose Backy contract/cache/request headers to browser-based custom frontends.',
);

assert(
    manifestRoute.includes('buildBackyCompletionStatus') &&
    manifestRoute.includes('buildBackyPartialClosureReadiness') &&
    manifestRoute.includes("schemaVersion: 'backy.completion-status.v1'") &&
    manifestRoute.includes("ready: 41") &&
    manifestRoute.includes("partial: 4") &&
    manifestRoute.includes('certifiedGates: certifiedDatabaseGates') &&
    manifestRoute.includes("status: 'certified'") &&
    manifestRoute.includes("command: 'npm run ci:forms-postgres'") &&
    manifestRoute.includes("command: 'npm run ci:sdk-postgres-smoke'") &&
    manifestRoute.includes("gate: 'npm run ci:settings-provider-certification'") &&
    manifestRoute.includes("gate: 'npm run ci:commerce-provider-certification'") &&
    manifestRoute.includes('surfaceRunbooks') &&
    manifestRoute.includes('partialClosureReadiness: buildBackyPartialClosureReadiness()') &&
    manifestRoute.includes("evidencePacketSchema: 'backy.settings-provider-certification-evidence-packet.v1'") &&
    manifestRoute.includes("evidencePacketSchema: 'backy.commerce-provider-certification-evidence-packet.v1'") &&
    manifestRoute.includes("evidencePacketSchema: 'backy.order-provider-certification-evidence-packet.v1'") &&
    manifestRoute.includes('artifactVerifier: settingsCertificationArtifactVerifier') &&
    manifestRoute.includes('artifactVerifier: commerceCertificationArtifactVerifier') &&
    manifestRoute.includes('BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1') &&
    manifestRoute.includes('evidenceArtifacts: settingsCertificationEvidenceArtifacts') &&
    manifestRoute.includes('evidenceArtifacts: commerceCertificationEvidenceArtifacts') &&
    manifestRoute.includes("'artifacts/backy-settings-provider-certification.json'") &&
    manifestRoute.includes("'backy-settings-provider-certification-evidence'") &&
    manifestRoute.includes("'BACKY_SETTINGS_CERTIFICATION_OUTPUT'") &&
    manifestRoute.includes("'backy.settings-provider-certification-artifact.v1'") &&
    manifestRoute.includes("'no raw secret-like values'") &&
    manifestRoute.includes("'certifiedAtReady'") &&
    manifestRoute.includes("'artifactFreshReady'") &&
    manifestRoute.includes('freshnessWindow') &&
    manifestRoute.includes('BACKY_PROVIDER_CERTIFICATION_ARTIFACT_MAX_AGE_HOURS') &&
    manifestRoute.includes('BACKY_PROVIDER_CERTIFICATION_ARTIFACT_FUTURE_SKEW_MINUTES') &&
    manifestRoute.includes("'apiHandoffs.siteScopedSettingsApi present'") &&
    manifestRoute.includes("'settingsApiHandoffSiteTargetReady'") &&
    manifestRoute.includes("'settingsApiHandoffTargetSiteId'") &&
    manifestRoute.includes("'settingsApiHandoffSettingsSiteSelectorEnv'") &&
    manifestRoute.includes("'settingsApiHandoffCommerceSiteSelectorEnv'") &&
    manifestRoute.includes("'settingsApiHandoffReady'") &&
    manifestRoute.includes("'siteSettingsApiHandoffReady'") &&
    manifestRoute.includes("'settingsScenarioEvidenceReady'") &&
    manifestRoute.includes("'settingsEvidencePacketReady'") &&
    manifestRoute.includes("'artifacts/backy-commerce-provider-certification.json'") &&
    manifestRoute.includes("'backy-commerce-provider-certification-evidence'") &&
    manifestRoute.includes("'BACKY_COMMERCE_CERTIFICATION_OUTPUT'") &&
    manifestRoute.includes("'backy.commerce-provider-certification-artifact.v1'") &&
    manifestRoute.includes("'apiHandoffReady'") &&
    manifestRoute.includes("'publicCommerceApiHandoffReady'") &&
    manifestRoute.includes("'commerceArtifactSiteTargetReady'") &&
    manifestRoute.includes("'commerceArtifactTargetSiteId'") &&
    manifestRoute.includes("'commerceArtifactSiteSelectorEnvReady'") &&
    manifestRoute.includes("'commerceArtifactSiteSelectorEnv'") &&
    manifestRoute.includes("'productApiHandoffSiteTargetReady'") &&
    manifestRoute.includes("'productApiHandoffTargetSiteId'") &&
    manifestRoute.includes("'productApiHandoffReady'") &&
    manifestRoute.includes("'orderApiHandoffSiteTargetReady'") &&
    manifestRoute.includes("'orderApiHandoffTargetSiteId'") &&
    manifestRoute.includes("'orderApiHandoffReady'") &&
    manifestRoute.includes("'commerceApiHandoffSiteSelectorEnv'") &&
    manifestRoute.includes("evidenceUiPanel: 'products-provider-certification-evidence-packet'") &&
    manifestRoute.includes("evidenceUiPanel: 'orders-provider-certification-evidence-packet'") &&
    manifestRoute.includes('completionStatus: buildBackyCompletionStatus()') &&
    openApiRoute.includes('buildBackyCompletionStatus') &&
    openApiRoute.includes('buildBackyPartialClosureReadiness') &&
    openApiRoute.includes('"x-backy-completion-status"') &&
    openApiRoute.includes('BackyCompletionStatus') &&
    openApiRoute.includes('surfaceRunbooks') &&
    openApiRoute.includes('partialClosureReadiness: buildBackyPartialClosureReadiness()') &&
    openApiRoute.includes('"backy.partial-closure-readiness.v1"') &&
    openApiRoute.includes('"evidenceArtifacts"') &&
    openApiRoute.includes('"artifactVerifier"') &&
    openApiRoute.includes('"no raw secret-like values"') &&
    openApiRoute.includes('"certifiedAtReady"') &&
    openApiRoute.includes('"artifactFreshReady"') &&
    openApiRoute.includes('freshnessWindow') &&
    openApiRoute.includes('BACKY_PROVIDER_CERTIFICATION_ARTIFACT_MAX_AGE_HOURS') &&
    openApiRoute.includes('BACKY_PROVIDER_CERTIFICATION_ARTIFACT_FUTURE_SKEW_MINUTES') &&
    openApiRoute.includes('"apiHandoffs.siteScopedSettingsApi present"') &&
    openApiRoute.includes('"settingsApiHandoffSiteTargetReady"') &&
    openApiRoute.includes('"settingsApiHandoffTargetSiteId"') &&
    openApiRoute.includes('"settingsApiHandoffSettingsSiteSelectorEnv"') &&
    openApiRoute.includes('"settingsApiHandoffCommerceSiteSelectorEnv"') &&
    openApiRoute.includes('"settingsApiHandoffReady"') &&
    openApiRoute.includes('"siteSettingsApiHandoffReady"') &&
    openApiRoute.includes('"settingsScenarioEvidenceReady"') &&
    openApiRoute.includes('"settingsEvidencePacketReady"') &&
    openApiRoute.includes('BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH or BACKY_COMMERCE_CERTIFICATION_ARTIFACT') &&
    openApiRoute.includes('"backy.order-provider-certification-evidence-packet.v1"') &&
    openApiRoute.includes('"artifacts/backy-settings-provider-certification.json"') &&
    openApiRoute.includes('"backy-commerce-provider-certification-evidence"') &&
    openApiRoute.includes('"BACKY_COMMERCE_CERTIFICATION_OUTPUT"') &&
    openApiRoute.includes('"apiHandoffReady"') &&
    openApiRoute.includes('"publicCommerceApiHandoffReady"') &&
    openApiRoute.includes('"commerceArtifactSiteTargetReady"') &&
    openApiRoute.includes('"commerceArtifactTargetSiteId"') &&
    openApiRoute.includes('"commerceArtifactSiteSelectorEnvReady"') &&
    openApiRoute.includes('"commerceArtifactSiteSelectorEnv"') &&
    openApiRoute.includes('"productApiHandoffSiteTargetReady"') &&
    openApiRoute.includes('"productApiHandoffTargetSiteId"') &&
    openApiRoute.includes('"productApiHandoffReady"') &&
    openApiRoute.includes('"orderApiHandoffSiteTargetReady"') &&
    openApiRoute.includes('"orderApiHandoffTargetSiteId"') &&
    openApiRoute.includes('"orderApiHandoffReady"') &&
    openApiRoute.includes('"commerceApiHandoffSiteSelectorEnv"') &&
    publicAgentHandoffRoute.includes('backy.custom-frontend-agent-handoff-response.v1') &&
    publicAgentHandoffRoute.includes('buildCustomFrontendAgentHandoff(site.id, {') &&
    publicAgentHandoffRoute.includes('domainVerificationDomain: site.settings?.domainVerification?.domain') &&
    publicAgentHandoffRoute.includes("manifestPointer: 'data.contract.customFrontendAgentHandoff'") &&
    publicAgentHandoffRoute.includes("openApiPointer: 'x-backy-custom-frontend-agent-handoff'") &&
    publicAgentHandoffRoute.includes('apiAlignment: handoff.apiAlignment') &&
    publicAgentHandoffRoute.includes('routing: handoff.routing') &&
    publicAgentHandoffRoute.includes('handoff.contentCreation.canvasFirst') &&
    publicAgentHandoffRoute.includes('handoff.designState') &&
    publicAgentHandoffRoute.includes('!site || !site.isPublished') &&
    manifestRoute.includes('buildCustomFrontendAgentHandoff') &&
    manifestRoute.includes('customFrontendAgentHandoff: buildCustomFrontendAgentHandoff') &&
    manifestRoute.includes('domainVerificationDomain: input.site.settings?.domainVerification?.domain') &&
    manifestRoute.includes('domainVerificationDomain: site.settings?.domainVerification?.domain') &&
    manifestRoute.includes('agentHandoff: `/api/sites/${input.site.id}/agent-handoff`') &&
    manifestRoute.includes('customFrontendAgentHandoff: `/api/sites/${input.site.id}/manifest#data.contract.customFrontendAgentHandoff`') &&
    openApiRoute.includes('"x-backy-custom-frontend-agent-handoff": customFrontendAgentHandoff') &&
    openApiRoute.includes('CustomFrontendRoutingHandoff') &&
    openApiRoute.includes('$ref: "#/components/schemas/CustomFrontendRoutingHandoff"') &&
    openApiRoute.includes('operationId: "getBackyCustomFrontendAgentHandoff"') &&
    openApiRoute.includes('CustomFrontendApiAlignment') &&
    openApiRoute.includes('$ref: "#/components/schemas/CustomFrontendApiAlignment"') &&
    openApiRoute.includes('CustomFrontendComponentApiContract') &&
    openApiRoute.includes('$ref: "#/components/schemas/CustomFrontendComponentApiContract"') &&
    openApiRoute.includes('CustomFrontendAgentHandoffEnvelope') &&
    customFrontendAgentHandoffLib.includes("CUSTOM_FRONTEND_AGENT_HANDOFF_SCHEMA = 'backy.custom-frontend-agent-handoff.v1'") &&
    customFrontendAgentHandoffLib.includes("CUSTOM_FRONTEND_AGENT_HANDOFF_DOC = 'specs/custom-frontend-agent-handoff.md'") &&
    customFrontendAgentHandoffLib.includes('agentHandoff') &&
    customFrontendAgentHandoffLib.includes('customFrontendAgentHandoffCached') &&
    customFrontendAgentHandoffLib.includes('frontendDesignManagement') &&
    customFrontendAgentHandoffLib.includes('buildBackyContentDesignPayload') &&
    customFrontendAgentHandoffLib.includes('frontendDesignTemplateId') &&
    customFrontendAgentHandoffLib.includes('adminEntryPoints') &&
    customFrontendAgentHandoffLib.includes('blogBackyCanvas: `/blog/new?siteId=${siteId}&templateSource=backy-canvas&focus=canvas`') &&
    customFrontendAgentHandoffLib.includes('blogCustomFrontend: `/blog/new?siteId=${siteId}&templateSource=custom-frontend&frontendDesignTemplateId=:templateId&focus=canvas`') &&
    customFrontendAgentHandoffLib.includes('apiAlignment') &&
    customFrontendAgentHandoffLib.includes("schemaVersion: 'backy.custom-frontend-api-alignment.v1'") &&
    customFrontendAgentHandoffLib.includes("CUSTOM_FRONTEND_ROUTING_HANDOFF_SCHEMA = 'backy.custom-frontend-routing-handoff.v1'") &&
    customFrontendAgentHandoffLib.includes('buildCustomFrontendRoutingHandoff') &&
    customFrontendAgentHandoffLib.includes('subdomainRouting') &&
    customFrontendAgentHandoffLib.includes('BACKY_SITE_PUBLIC_HOST') &&
    customFrontendAgentHandoffLib.includes('resolveWithHost') &&
    customFrontendAgentHandoffLib.includes("CUSTOM_FRONTEND_COMPONENT_API_CONTRACT_SCHEMA = 'backy.canvas-component-api-contract.v1'") &&
    customFrontendAgentHandoffLib.includes('componentApiContract') &&
    customFrontendAgentHandoffLib.includes('everyComponentApiAddressable: true') &&
    customFrontendAgentHandoffLib.includes('readableFieldPaths: CUSTOM_FRONTEND_COMPONENT_API_FIELD_PATHS') &&
    customFrontendAgentHandoffLib.includes('writableFieldPaths: CUSTOM_FRONTEND_COMPONENT_API_FIELD_PATHS') &&
    customFrontendAgentHandoffLib.includes('componentTypeContracts: CUSTOM_FRONTEND_COMPONENT_TYPE_CONTRACTS') &&
    openApiRoute.includes('componentTypeContracts') &&
    customFrontendAgentHandoffLib.includes('noFrontendLocalJsonForks') &&
    customFrontendAgentHandoffLib.includes('preferredHelpers') &&
    customFrontendAgentHandoffLib.includes('preserveFields') &&
    customFrontendAgentHandoffLib.includes('readOrder') &&
    customFrontendAgentHandoffLib.includes('canvasFirst') &&
    customFrontendAgentHandoffLib.includes('siteStyleSources') &&
    customFrontendAgentHandoffLib.includes('routeRevealGuarantee') &&
    customFrontendAgentHandoffLib.includes('productCustomFrontend') &&
    customFrontendAgentHandoffLib.includes('formCustomFrontend') &&
    customFrontendAgentHandoffLib.includes('newsletterWorkspace') &&
    customFrontendAgentHandoffLib.includes('newsletterSubscribers') &&
    customFrontendAgentHandoffLib.includes('newsletterContactSync') &&
    customFrontendAgentHandoffLib.includes("syncBoundarySchema: 'backy.newsletter-sync-boundary.v1'") &&
    customFrontendAgentHandoffLib.includes('collectionCustomFrontend') &&
    customFrontendAgentHandoffLib.includes('reusableSectionCustomFrontend') &&
    frontendManifestSchema.includes('"completionStatus": { "$ref": "#/$defs/completionStatus" }') &&
    frontendManifestSchema.includes('"customFrontendAgentHandoff": { "$ref": "#/$defs/customFrontendAgentHandoff" }') &&
    frontendManifestSchema.includes('"backy.custom-frontend-agent-handoff.v1"') &&
    frontendManifestSchema.includes('"agentHandoff"') &&
    frontendManifestSchema.includes('"frontendDesignManagement"') &&
    frontendManifestSchema.includes('"adminEntryPoints"') &&
    frontendManifestSchema.includes('"apiAlignment"') &&
    frontendManifestSchema.includes('"backy.custom-frontend-api-alignment.v1"') &&
    frontendManifestSchema.includes('"routing"') &&
    frontendManifestSchema.includes('"backy.custom-frontend-routing-handoff.v1"') &&
    frontendManifestSchema.includes('"subdomainRouting"') &&
    frontendManifestSchema.includes('"BACKY_SITE_PUBLIC_HOST"') &&
    frontendManifestSchema.includes('"componentApiContract"') &&
    frontendManifestSchema.includes('"backy.canvas-component-api-contract.v1"') &&
    frontendManifestSchema.includes('"everyComponentApiAddressable"') &&
    frontendManifestSchema.includes('"elementAddressing"') &&
    frontendManifestSchema.includes('"readableFieldPaths"') &&
    frontendManifestSchema.includes('"componentTypeContracts"') &&
    frontendManifestSchema.includes('"noFrontendLocalJsonForks"') &&
    frontendManifestSchema.includes('"preserveFields"') &&
    frontendManifestSchema.includes('"readOrder"') &&
    frontendManifestSchema.includes('"canvasFirst"') &&
    frontendManifestSchema.includes('"siteStyleSources"') &&
    frontendManifestSchema.includes('"routeRevealGuarantee"') &&
    frontendManifestSchema.includes('"productCustomFrontend"') &&
    frontendManifestSchema.includes('"formCustomFrontend"') &&
    frontendManifestSchema.includes('"collectionCustomFrontend"') &&
    frontendManifestSchema.includes('"reusableSectionCustomFrontend"') &&
    frontendManifestSchema.includes('"templateCloneFields"') &&
    generatedSdkTypes.includes('GeneratedBackyFrontendManifestCustomFrontendAgentHandoff') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiCustomFrontendApiAlignment') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiCustomFrontendComponentApiContract') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiCustomFrontendRoutingHandoff') &&
    generatedSdkTypes.includes('apiAlignment: {') &&
    generatedSdkTypes.includes('componentApiContract:') &&
    generatedSdkTypes.includes('componentTypeContracts') &&
    generatedSdkTypes.includes('routing: GeneratedBackyOpenApiCustomFrontendRoutingHandoff') &&
    generatedSdkTypes.includes('"backy.custom-frontend-api-alignment.v1"') &&
    generatedSdkTypes.includes('"backy.custom-frontend-routing-handoff.v1"') &&
    generatedSdkTypes.includes('"backy.canvas-component-api-contract.v1"') &&
    generatedSdkTypes.includes('"x-backy-custom-frontend-agent-handoff"?: GeneratedBackyFrontendManifestCustomFrontendAgentHandoff') &&
    sdkSource.includes('GeneratedBackyFrontendManifestCustomFrontendAgentHandoff') &&
    sdkSource.includes('customFrontendAgentHandoff: GeneratedBackyFrontendManifestCustomFrontendAgentHandoff') &&
    sdkSource.includes('routing: GeneratedBackyFrontendManifestCustomFrontendAgentHandoff["routing"]') &&
    sdkSource.includes('componentApiContract: GeneratedBackyFrontendManifestCustomFrontendAgentHandoff["componentApiContract"]') &&
    sdkSource.includes('customFrontendAgentHandoffCached') &&
    sdkSmoke.includes('customFrontendAgentHandoff') &&
    sdkSmoke.includes('componentApiContract') &&
    generatedSdkSmoke.includes('agentHandoff') &&
    generatedSdkSmoke.includes('customFrontendAgentHandoff') &&
    frontendManifestSchema.includes('"backy.completion-status.v1"') &&
    frontendManifestSchema.includes('"backy.partial-closure-readiness.v1"') &&
    frontendManifestSchema.includes('"auditImpact"') &&
    frontendManifestSchema.includes('"artifactAcceptedAudit"') &&
    frontendManifestSchema.includes('"artifactAcceptedMode"') &&
    frontendManifestSchema.includes('"surfaceRunbooks"') &&
    frontendManifestSchema.includes('"evidenceArtifacts"') &&
	    frontendManifestSchema.includes('"artifactVerifier"') &&
		    frontendManifestSchema.includes('BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1') &&
		    frontendManifestSchema.includes('BACKY_PROVIDER_ARTIFACT_ADMISSION_MODE=settings npm run ci:provider-artifact-admission') &&
		    frontendManifestSchema.includes('BACKY_PROVIDER_ARTIFACT_ADMISSION_MODE=commerce npm run ci:provider-artifact-admission') &&
		    frontendManifestSchema.includes('"no raw secret-like values"') &&
	    frontendManifestSchema.includes('"certifiedAtReady"') &&
	    frontendManifestSchema.includes('"artifactFreshReady"') &&
	    frontendManifestSchema.includes('"freshnessWindow"') &&
	    frontendManifestSchema.includes('BACKY_PROVIDER_CERTIFICATION_ARTIFACT_MAX_AGE_HOURS') &&
	    frontendManifestSchema.includes('"producerEnv"') &&
	    apiContracts.includes('surfaceRunbooks[].artifactVerifier') &&
	    apiContracts.includes('GET /api/sites/:siteId/agent-handoff') &&
	    apiContracts.includes('customFrontendAgentHandoff') &&
	    apiContracts.includes('partialClosureReadiness') &&
	    apiContracts.includes('noRawSecretValuesReady') &&
	    apiContracts.includes('artifactFreshReady') &&
	    apiContracts.includes('settingsApiHandoffSiteTargetReady') &&
	    apiContracts.includes('settingsApiHandoffReady') &&
	    apiContracts.includes('productApiHandoffSiteTargetReady') &&
	    apiContracts.includes('commerceArtifactSiteTargetReady') &&
	    apiContracts.includes('commerceArtifactTargetSiteId') &&
	    apiContracts.includes('orderApiHandoffSiteTargetReady') &&
	    apiContracts.includes('apiHandoffReady') &&
	    apiContracts.includes('publicCommerceApiHandoffReady') &&
	    audit.includes('Completion-status artifact verifier metadata now mirrors the stricter selected-site proof') &&
	    audit.includes('Frontend-design contract token persistence now keeps custom motion token groups') &&
	    audit.includes('Completion-status runbooks now expose structured durable provider-certification artifact verifier metadata') &&
	    audit.includes('release certification doctor now rejects stale Settings evidence artifacts') &&
	    audit.includes('noRawSecretValuesReady') &&
	    audit.includes('release certification doctor now rejects stale Commerce evidence artifacts') &&
	    completionSpec.includes('surfaceRunbooks[].artifactVerifier') &&
	    completionSpec.includes('partialClosureReadiness') &&
	    sdkSource.includes('BackyCompletionStatus') &&
	    sdkSource.includes('BackyPartialClosureReadiness') &&
	    sdkSource.includes('artifactAdmissionModes') &&
	    sdkSource.includes('BACKY_PROVIDER_ARTIFACT_ADMISSION_MODE=settings npm run ci:provider-artifact-admission') &&
	    sdkSource.includes('BACKY_PROVIDER_ARTIFACT_ADMISSION_MODE=commerce npm run ci:provider-artifact-admission') &&
	    sdkSource.includes('artifactAcceptedAudit') &&
    sdkSource.includes('readyRowsAdded: 4') &&
    sdkSource.includes('BackyCompletionArtifactVerifier') &&
    sdkSource.includes('BackyCompletionEvidenceArtifact') &&
    sdkSource.includes('surfaceRunbooks: Array<') &&
    sdkSource.includes('evidenceArtifacts: BackyCompletionEvidenceArtifact[]') &&
    sdkSource.includes('artifactVerifier: BackyCompletionArtifactVerifier') &&
    sdkSmoke.includes('manifest() completion status audit counts drifted') &&
    sdkSmoke.includes('hasCompletionEvidenceArtifact') &&
    sdkSmoke.includes('manifest() completion status missing products runbook') &&
    sdkSmoke.includes('manifest() completion status missing orders runbook') &&
    sdkSmoke.includes('artifacts/backy-settings-provider-certification.json') &&
    sdkSmoke.includes('backy-commerce-provider-certification-evidence') &&
    sdkSmoke.includes('hasCompletionArtifactVerifier') &&
    sdkSmoke.includes('settingsApiHandoffSiteTargetReady') &&
    sdkSmoke.includes('commerceArtifactSiteTargetReady') &&
    sdkSmoke.includes('commerceArtifactTargetSiteId') &&
    sdkSmoke.includes('productApiHandoffSiteTargetReady') &&
    sdkSmoke.includes('orderApiHandoffSiteTargetReady') &&
    sdkSmoke.includes('manifest() completion status missing Settings runbook') &&
	    sdkSmoke.includes('manifest() completion status missing partial closure readiness handoff') &&
	    sdkSmoke.includes('settings-only provider artifact admission command') &&
	    sdkSmoke.includes('commerce-only provider artifact admission command') &&
	    sdkSmoke.includes('manifest() completion status artifact-backed audit should close all partial rows') &&
    sdkSmoke.includes('completionStatus.audit?.ready === 41') &&
    sdkSmoke.includes('completionStatus.audit?.partial === 4') &&
    sdkSmoke.includes('completionStatus.audit?.readyPercent === 91') &&
    sdkSmoke.includes('completionStatus.certifiedGates?.some') &&
    sdkSmoke.includes('completion status should not list certified database gates as current Partial surfaces') &&
    sdkSmoke.includes('completion status should not recommend certified SDK Postgres as remaining work') &&
    generatedSdkTypes.includes('GeneratedBackyFrontendManifestCompletionStatus') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiBackyCompletionStatus') &&
	    generatedSdkTypes.includes('partialClosureReadiness?') &&
	    generatedSdkTypes.includes('artifactAdmissionModes: {') &&
	    generatedSdkTypes.includes('auditImpact?:') &&
    generatedSdkTypes.includes('artifactAcceptedAudit?:') &&
    generatedSdkTypes.includes('surfaceRunbooks: Array<') &&
    generatedSdkTypes.includes('evidenceArtifacts: Array<') &&
    generatedSdkTypes.includes('artifactVerifier: {') &&
    generatedSdkSmoke.includes('surfaceRunbooks') &&
    generatedSdkSmoke.includes('settingsCompletionArtifactVerifier') &&
    generatedSdkSmoke.includes('partialClosureReadiness') &&
    generatedSdkSmoke.includes('commerceCompletionArtifactVerifier') &&
    generatedSdkSmoke.includes('settingsCompletionEvidenceArtifacts') &&
    generatedSdkSmoke.includes('commerceCompletionEvidenceArtifacts') &&
    generatedSdkSmoke.includes('invalidGeneratedManifestCompletionStatus'),
  'Frontend manifest/OpenAPI/SDK must expose structured Backy completion status and remaining partial-gate handoff for custom admin clients.',
);

assert(
  completionStatusClosureLib.includes("schemaVersion: 'backy.partial-closure-readiness.v1'") &&
    completionStatusClosureLib.includes("schemaVersion: 'backy.partial-closure-audit-impact.v1'") &&
	    completionStatusClosureLib.includes('artifactBackedDoctorCommand') &&
	    completionStatusClosureLib.includes('artifactAdmissionModes') &&
	    completionStatusClosureLib.includes('SETTINGS_ARTIFACT_ADMISSION_COMMAND') &&
	    completionStatusClosureLib.includes('COMMERCE_ARTIFACT_ADMISSION_COMMAND') &&
	    completionStatusClosureLib.includes('artifactAcceptedAudit: ARTIFACT_ACCEPTED_AUDIT_COUNTS') &&
    completionStatusClosureLib.includes('artifactAcceptedMode') &&
    completionStatusClosureLib.includes("artifactAcceptedStatus: 'ready'") &&
    completionStatusClosureLib.includes('BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1') &&
    completionStatusClosureLib.includes('artifacts/backy-settings-provider-certification.json') &&
    completionStatusClosureLib.includes('artifacts/backy-commerce-provider-certification.json') &&
    completionStatusClosureLib.includes('includesSecretValues: false'),
  'Completion status closure helper must expose non-secret artifact-backed partial closure semantics.',
);

assert(
  manifestRoute.includes('manifest.data.contract.frontendLaunchReadiness = buildFrontendLaunchReadiness') &&
    manifestRoute.includes("key: 'content-design-modules'") &&
    manifestRoute.includes("key: 'media-font-delivery'") &&
    manifestRoute.includes("key: 'visitor-interactions'") &&
    manifestRoute.includes("key: 'commerce-handoff'") &&
    manifestRoute.includes("key: 'live-management'") &&
    openApiRoute.includes('"x-backy-frontend-launch-readiness"') &&
    openApiRoute.includes('key: "content-design-modules"') &&
    openApiRoute.includes('key: "media-font-delivery"') &&
    openApiRoute.includes('key: "visitor-interactions"') &&
    openApiRoute.includes('key: "commerce-handoff"') &&
    openApiRoute.includes('key: "live-management"') &&
    openApiRoute.includes('pages: pages.pagination.total') &&
    openApiRoute.includes('blogPosts: posts.pagination.total') &&
    openApiRoute.includes('fonts: fonts.pagination.total') &&
    manifestRoute.includes("fonts: input.media.filter((item) => item.type === 'font').length") &&
    manifestRoute.includes('fonts: fonts.length') &&
    openApiRoute.includes('liveManagement: liveManagementDiscoveryContract') &&
    frontendManifestSchema.includes('"frontendLaunchReadiness"') &&
    frontendManifestSchema.includes('"fonts": { "type": "integer", "minimum": 0 }') &&
    sdkSource.includes('BackyFrontendLaunchReadiness') &&
    sdkSource.includes('fonts?: number') &&
    sdkSmoke.includes('manifest() missing content/design launch readiness check') &&
    sdkSmoke.includes('manifest() launch readiness missing font count') &&
    sdkSmoke.includes('openapi() missing live-management frontend launch check') &&
    sdkSmoke.includes('openapi() launch readiness missing font count') &&
    generatedSdkTypes.includes('GeneratedBackyFrontendManifestLaunchReadiness') &&
    generatedSdkTypes.includes('fonts?: number') &&
    generatedSdkSmoke.includes('content-design-modules') &&
    generatedSdkSmoke.includes('fonts: 2') &&
    apiContracts.includes('OpenAPI now mirrors the manifest readiness check keys') &&
    audit.includes('OpenAPI frontend launch-readiness parity update'),
  'Manifest/OpenAPI/SDK/docs must expose frontend launch readiness parity for custom frontend operators.',
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
    manifestRoute.includes("fileCategories") &&
    manifestRoute.includes("schemaVersion: 'backy.media-discovery.v1'") &&
    manifestRoute.includes("fileCategories: 'backy.media-file-categories.v1'") &&
    manifestRoute.includes("type: 'document'") &&
    manifestRoute.includes("aliases: ['file']") &&
    manifestRoute.includes("pickerUse: 'downloadable-document'") &&
    manifestRoute.includes("deliveryPolicy") &&
    manifestRoute.includes("privateFiles: 'signed-url-required'") &&
    manifestRoute.includes("signedUrlEndpoint: `/api/admin/sites/${siteId}/media/{mediaId}/signed-url`") &&
    manifestRoute.includes("acceptedDispositions: ['inline', 'attachment']") &&
    manifestRoute.includes("downloadableTypes: ['document', 'other', 'audio', 'video']") &&
    manifestRoute.includes("schemaVersion: 'backy.media-management.v1'") &&
    manifestRoute.includes("upload: 'uploadMedia'") &&
    manifestRoute.includes("privateDelivery: 'media.view'") &&
    manifestRoute.includes("folders: `/api/sites/${siteId}/media/folders`") &&
    manifestRoute.includes("'folderId'") &&
    manifestRoute.includes("'fontFamily'") &&
    manifestRoute.includes("'scope'") &&
    manifestRoute.includes("'tag'") &&
    manifestRoute.includes("file: ['document', 'other']") &&
    manifestRoute.includes("fileType: 'file'") &&
    manifestRoute.includes("types: ['image', 'video', 'audio', 'document', 'file', 'font', 'other', 'all']") &&
    manifestRoute.includes("visibility: ['public', 'private', 'all']") &&
    manifestRoute.includes("scopes: ['global', 'page', 'post', 'all']") &&
    manifestRoute.includes('media: buildManifestMediaDiscovery(input.site.id, input.media, input.media.length, input.media.length)') &&
    manifestRoute.includes('media: buildManifestMediaDiscovery(site.id, media.media, media.pagination.total, media.pagination.total)') &&
    openApiRoute.includes('mediaFileCategoryDiscovery') &&
    openApiRoute.includes('"x-backy-media-file-categories"') &&
    openApiRoute.includes('MediaFileCategoryDiscovery') &&
    openApiRoute.includes('MediaDeliveryPolicy') &&
    openApiRoute.includes('MediaManagementPolicy') &&
    openApiRoute.includes('"backy.media-management.v1"') &&
    openApiRoute.includes('types: ["image", "video", "audio", "document", "file", "font", "other", "all"]') &&
    openApiRoute.includes('file: ["document", "other"]') &&
    openApiRoute.includes('fileType: "file"') &&
    openApiRoute.includes('"ingestMediaProviderAnalytics"') &&
    frontendManifestSchema.includes('"backy.media-discovery.v1"') &&
    frontendManifestSchema.includes('"managementPolicy"') &&
    frontendManifestSchema.includes('"backy.media-management.v1"') &&
    frontendManifestSchema.includes('"signedPrivateFiles"') &&
    frontendManifestSchema.includes('"fileCategories"') &&
    frontendManifestSchema.includes('"backy.media-file-categories.v1"') &&
    frontendManifestSchema.includes('"downloadable-document"') &&
    frontendManifestSchema.includes('"signed-url-required"') &&
    frontendManifestSchema.includes('"signedUrlEndpoint"') &&
    frontendManifestSchema.includes('"publicFolderDiscovery"') &&
    frontendManifestSchema.includes('"queryParams"') &&
    frontendManifestSchema.includes('"folderId"') &&
    frontendManifestSchema.includes('"backy.media-folders.v1"') &&
    frontendManifestSchema.includes('"maxLimit"') &&
    sdkSource.includes('schemaVersion: "backy.media-discovery.v1";') &&
    sdkSource.includes('BackyManifestMediaManagementPolicy') &&
    sdkSource.includes('types: Array<"image" | "video" | "audio" | "document" | "file" | "font" | "other" | "all">') &&
    sdkSource.includes('fileType: "file";') &&
    sdkSource.includes('fileCategories: Array<') &&
    sdkSource.includes('deliveryPolicy:') &&
    sdkSource.includes('privateFiles: "signed-url-required";') &&
    sdkSource.includes('fileCategories: "backy.media-file-categories.v1";') &&
    sdkSource.includes('BackyMediaFolder') &&
    sdkSource.includes('mediaFolders(') &&
    sdkSource.includes('buildBackyMediaFilePath') &&
    sdkSource.includes('buildBackyMediaFileUrl') &&
    sdkSource.includes('buildBackyMediaTransformPath') &&
    sdkSource.includes('buildBackyMediaTransformUrl') &&
    sdkSource.includes('mediaFileCached(') &&
    sdkSource.includes('mediaTransformCached(') &&
    sdkSource.includes('requestConditionalArrayBuffer') &&
    sdkSource.includes('requestConditionalRedirect') &&
    sdkSource.includes('location: response.headers.get("location")') &&
    sdkSource.includes('buildBackyMediaDownloadLinkProps') &&
    sdkSource.includes('fileIds: [mediaId]') &&
    sdkSource.includes('buildBackyContentDownloadFilePatch') &&
    sdkSource.includes('patchBackyContentElementDownloadFile') &&
    sdkSource.includes('mediaDownloadLinkProps(') &&
    sdkSource.includes('type?: "image" | "video" | "audio" | "document" | "file" | "font" | "other"') &&
    sdkSource.includes('siteId?: string') &&
    generatedSdkTypes.includes('"x-backy-media-file-categories"?: GeneratedBackyOpenApiMediaFileCategoryDiscovery') &&
    sdkSmoke.includes('manifest() missing media discovery module') &&
    sdkSmoke.includes('manifest() media discovery missing folderId filter') &&
    sdkSmoke.includes('manifest() media discovery missing document category') &&
    sdkSmoke.includes('manifest() media discovery missing signed URL policy') &&
    sdkSmoke.includes('manifest() media management missing broad file type alias') &&
    sdkSmoke.includes('openapi() media management missing broad file type alias') &&
    sdkSmoke.includes('manifest() media management missing upload helper') &&
    sdkSmoke.includes('buildBackyMediaFilePath() did not normalize signed download file paths') &&
    sdkSmoke.includes('buildBackyMediaTransformPath() did not build public media transform paths') &&
    sdkSmoke.includes('mediaFileCached() did not return notModified for matching ETag') &&
    sdkSmoke.includes('mediaTransformCached() did not use manual redirects with If-None-Match') &&
    sdkSmoke.includes('mediaDownloadLinkProps.fileIds') &&
    sdkSmoke.includes("downloadFilePatch.changes?.['props.fileIds']") &&
    sdkSmoke.includes('buildBackyMediaDownloadLinkProps() did not emit editor-compatible downloadable file props') &&
    sdkSmoke.includes('buildBackyContentDownloadFilePatch() did not create editor-compatible props patch') &&
    sdkSmoke.includes('patchBackyContentElementDownloadFile() did not attach central uploaded file design state') &&
    sdkSmoke.includes('mediaDownloadLinkProps() did not build editor-compatible media download props') &&
    sdkSmoke.includes('mediaFolders() missing folder array') &&
    generatedSdkSmoke.includes('openApiMediaFileCategories') &&
    generatedSdkSmoke.includes('managementPolicy') &&
    generatedSdkSmoke.includes('file: ["document", "other"]') &&
    generatedSdkSmoke.includes('invalidGeneratedManifestMediaDiscovery') &&
    generatedSdkSmoke.includes('invalidGeneratedManifestMediaManagement'),
  'Frontend manifest, OpenAPI, and SDK must expose structured media discovery for custom frontend asset browsers.',
);

assert(
  manifestRoute.includes("buildBackyThemeDiscovery") &&
    manifestRoute.includes("theme: buildBackyThemeDiscovery(input.site.theme)") &&
    manifestRoute.includes("theme: buildBackyThemeDiscovery(site.theme)") &&
    manifestRoute.includes("themeTokens: buildBackyThemeTokens(input.site.theme)") &&
    manifestRoute.includes("themeTokens: buildBackyThemeTokens(site.theme)") &&
    frontendManifestSchema.includes('"backy.theme-discovery.v1"') &&
    frontendManifestSchema.includes('"cssVariables"') &&
    frontendManifestSchema.includes('"tokenReferences"') &&
    frontendManifestSchema.includes('"styleSheet"') &&
    frontendManifestSchema.includes('"elementTokenRefPath"') &&
    frontendManifestSchema.includes('"animationTokenRefs"') &&
    frontendManifestSchema.includes('"editableFields"') &&
    coreThemeTokens.includes('buildBackyThemeDiscovery') &&
    coreThemeTokens.includes('buildBackyThemeStyleSheet') &&
    coreThemeTokens.includes('buildBackyThemeTokenReferences') &&
    coreThemeTokens.includes('animationTokenRefs: true') &&
    sdkSource.includes('BackyManifestThemeModule') &&
    sdkSource.includes('tokenReferences: Record<string, string>') &&
    sdkSource.includes('styleSheet: string') &&
    sdkSource.includes('elementTokenRefPath: "tokenRefs"') &&
    sdkSource.includes('animationTokenRefs: boolean') &&
    sdkSource.includes('documentTokenRefPath?: "themeTokenRefs"') &&
    pageRenderer.includes('buildBackyThemeTokenRefStyle') &&
    pageRenderer.includes('applyThemeTokenRefsToElements') &&
    pageRenderer.includes('resolveRendererAnimationTokenRefs') &&
    pageRenderer.includes('DEFAULT_RENDERER_ANIMATION_DURATION_SECONDS') &&
    pageRenderer.includes('motion: theme?.motion') &&
    pageRenderer.includes('themedElements.map') &&
    sdkSmoke.includes('manifest() missing theme discovery module') &&
    sdkSmoke.includes('manifest() theme discovery missing token reference map') &&
    sdkSmoke.includes('manifest() theme discovery missing compiled stylesheet') &&
    sdkSmoke.includes('manifest() theme discovery missing per-block token inheritance metadata') &&
    generatedSdkSmoke.includes('invalidGeneratedManifestThemeDiscovery'),
  'Frontend manifest, core compiler, and SDK must expose structured theme discovery, compiled CSS variables/stylesheets, and per-block token references for custom frontends.',
);

assert(
  manifestRoute.includes('buildManifestLiveManagementDiscovery') &&
    manifestRoute.includes("schemaVersion: 'backy.live-management.v1'") &&
    manifestRoute.includes("schemaVersion: 'backy.live-management-page.v1'") &&
    manifestRoute.includes("schemaVersion: 'backy.live-management-blog-post.v1'") &&
    manifestRoute.includes("post: `/api/sites/${siteId}/manage/blog/{postId}`") &&
    manifestRoute.includes("resourceHeader: 'x-backy-live-management-resource'") &&
    manifestRoute.includes("requiredPermissions:") &&
	    manifestRoute.includes("read: 'pages.view'") &&
	    manifestRoute.includes("update: 'pages.edit'") &&
	    manifestRoute.includes("'props.formId'") &&
	    manifestRoute.includes("'props.fieldBackgroundColor'") &&
	    manifestRoute.includes("'props.submitBackgroundColor'") &&
	    manifestRoute.includes("'props.mediaId'") &&
    manifestRoute.includes("'props.mediaIds'") &&
    manifestRoute.includes("'props.imageIds'") &&
    manifestRoute.includes("'props.videoIds'") &&
    manifestRoute.includes("'props.backgroundMediaIds'") &&
    manifestRoute.includes("'props.posterMediaIds'") &&
    manifestRoute.includes("'props.fontMediaId'") &&
    manifestRoute.includes("'props.fontMediaIds'") &&
    manifestRoute.includes("'assetIds'") &&
    manifestRoute.includes("'responsive.mobile.x'") &&
    manifestRoute.includes("'responsive.tablet.width'") &&
    manifestRoute.includes("'responsive.mobile.props.mediaIds'") &&
    manifestRoute.includes("'responsive.mobile.props.posterMediaIds'") &&
    manifestRoute.includes("'responsive.mobile.styles.backgroundMediaIds'") &&
    manifestRoute.includes("'responsive.tablet.props.fontMediaIds'") &&
    manifestRoute.includes("'responsive.tablet.styles.backgroundMediaIds'") &&
    manifestRoute.includes('mediaAssetRefs: true') &&
    manifestRoute.includes('fontAssetRefs: true') &&
    manifestRoute.includes('animationTokenRefs: true') &&
    manifestRoute.includes("'props.submitLabel'") &&
    manifestRoute.includes("'props.options'") &&
    manifestRoute.includes("'props.required'") &&
    manifestRoute.includes("'animation.type'") &&
    manifestRoute.includes("'animation.scrollTrigger.start'") &&
    manifestRoute.includes("'animation.scrollTrigger.scrub'") &&
    manifestRoute.includes("'animation.from'") &&
    manifestRoute.includes("'animation.to'") &&
    manifestRoute.includes("'actions'") &&
    manifestRoute.includes("'dataBindings'") &&
    manifestRoute.includes("'bindingSlots'") &&
    manifestRoute.includes("schemaVersion: 'backy.content-lifecycle-commands.v1'") &&
    manifestRoute.includes("pageCreate: `/api/admin/sites/${siteId}/pages`") &&
    manifestRoute.includes("postCreate: `/api/admin/sites/${siteId}/blog`") &&
    manifestRoute.includes("createPage: 'createAdminPage'") &&
    manifestRoute.includes("createPost: 'createAdminBlogPost'") &&
    manifestRoute.includes("pageRevisions: 'backy.admin-page-revisions.v1'") &&
    manifestRoute.includes("postRevisions: 'backy.admin-blog-post-revisions.v1'") &&
    manifestRoute.includes("revisionBranchMetadata: 'backy.content-revision-branch-metadata.v1'") &&
    manifestRoute.includes("branchMetadataField: 'revision.branchMetadata'") &&
    manifestRoute.includes("pageRollbackRequest: 'backy.admin-page-rollback-request.v1'") &&
    manifestRoute.includes("postRollbackRequest: 'backy.admin-blog-post-rollback-request.v1'") &&
    manifestRoute.includes("schemaVersion: 'backy.pages-management.v1'") &&
    manifestRoute.includes("schemaVersion: 'backy.blog-management.v1'") &&
    manifestRoute.includes("templateRegistry: `/api/admin/sites/${siteId}/templates?type=page`") &&
    manifestRoute.includes("templateRegistry: `/api/admin/sites/${siteId}/templates?type=blogPost`") &&
    manifestRoute.includes("schemaVersion: 'backy.editor-composition-commands.v1'") &&
    manifestRoute.includes("addElement: 'addBackyContentElement'") &&
    manifestRoute.includes("duplicateElement: 'duplicateBackyContentElement'") &&
    manifestRoute.includes("deleteElements: 'deleteBackyContentElements'") &&
    manifestRoute.includes("transformElements: 'transformBackyContentElements'") &&
    manifestRoute.includes("id: 'duplicate'") &&
    manifestRoute.includes("id: 'resize'") &&
    manifestRoute.includes("group: 'groupBackyContentElements'") &&
    manifestRoute.includes("ungroup: 'ungroupBackyContentElements'") &&
    manifestRoute.includes("shortcut: 'Cmd/Ctrl+G'") &&
    manifestRoute.includes("editorGroupMarker: 'props.editorGroup'") &&
    manifestRoute.includes("conflict: 'PAGE_VERSION_CONFLICT'") &&
    manifestRoute.includes("postConflict: 'BLOG_VERSION_CONFLICT'") &&
    openApiRoute.includes('"x-backy-live-management"') &&
    openApiRoute.includes('liveManagementDiscovery') &&
    openApiRoute.includes('LiveManagementDiscovery') &&
    openApiRoute.includes('"props.mediaId"') &&
    openApiRoute.includes('"props.mediaIds"') &&
    openApiRoute.includes('"props.imageIds"') &&
    openApiRoute.includes('"props.videoIds"') &&
    openApiRoute.includes('"props.backgroundMediaIds"') &&
    openApiRoute.includes('"props.posterMediaIds"') &&
    openApiRoute.includes('"props.fontMediaId"') &&
    openApiRoute.includes('"props.fontMediaIds"') &&
    openApiRoute.includes('"animation.type"') &&
    openApiRoute.includes('"animation.scrollTrigger.start"') &&
    openApiRoute.includes('"animation.scrollTrigger.scrub"') &&
    openApiRoute.includes('"animation.from"') &&
    openApiRoute.includes('"animation.to"') &&
    openApiRoute.includes('"actions"') &&
    openApiRoute.includes('"dataBindings"') &&
    openApiRoute.includes('"bindingSlots"') &&
    openApiRoute.includes('"backy.content-lifecycle-commands.v1"') &&
    openApiRoute.includes('pageCreate: `/api/admin/sites/${siteId}/pages`') &&
    openApiRoute.includes('postCreate: `/api/admin/sites/${siteId}/blog`') &&
    openApiRoute.includes('createPage: "createAdminPage"') &&
    openApiRoute.includes('createPost: "createAdminBlogPost"') &&
    openApiRoute.includes('pageRevisions: "backy.admin-page-revisions.v1"') &&
    openApiRoute.includes('postRevisions: "backy.admin-blog-post-revisions.v1"') &&
    openApiRoute.includes('revisionBranchMetadata: "backy.content-revision-branch-metadata.v1"') &&
    openApiRoute.includes('branchMetadataField: "revision.branchMetadata"') &&
    openApiRoute.includes('pageRollbackRequest: "backy.admin-page-rollback-request.v1"') &&
    openApiRoute.includes('postRollbackRequest: "backy.admin-blog-post-rollback-request.v1"') &&
    openApiRoute.includes('operationId: "listBackyAdminPageRevisions"') &&
    openApiRoute.includes('operationId: "listBackyAdminBlogPostRevisions"') &&
    openApiRoute.includes('operationId: "rollbackBackyAdminPage"') &&
    openApiRoute.includes('operationId: "rollbackBackyAdminBlogPost"') &&
    openApiRoute.includes('AdminPageRollbackRequest') &&
    openApiRoute.includes('AdminBlogPostRollbackRequest') &&
    openApiRoute.includes('AdminPageRevisionsEnvelope') &&
    openApiRoute.includes('AdminBlogPostRevisionsEnvelope') &&
	    openApiRoute.includes('ContentRevisionBranchMetadata') &&
	    openApiRoute.includes('branchMetadata: { $ref: "#/components/schemas/ContentRevisionBranchMetadata" }') &&
	    openApiRoute.includes('"parentRevisionId"') &&
	    openApiRoute.includes('"restoreTargetRevisionId"') &&
	    openApiRoute.includes('"persisted-revision-lineage"') &&
	    openApiRoute.includes('"animation.tokenRefs.duration"') &&
    openApiRoute.includes('"responsive.mobile.x"') &&
    openApiRoute.includes('"responsive.tablet.width"') &&
    openApiRoute.includes('"responsive.mobile.props.mediaIds"') &&
    openApiRoute.includes('"responsive.mobile.props.posterMediaIds"') &&
    openApiRoute.includes('"responsive.mobile.styles.backgroundMediaIds"') &&
    openApiRoute.includes('"responsive.tablet.props.fontMediaIds"') &&
    openApiRoute.includes('"responsive.tablet.styles.backgroundMediaIds"') &&
	    openApiRoute.includes('inlineFormControls') &&
	    openApiRoute.includes('"backy.editor-composition-commands.v1"') &&
	    openApiRoute.includes('commandRegistry: liveManagementEditorCommandRegistry') &&
	    openApiRoute.includes('"addBackyContentElement"') &&
    openApiRoute.includes('"duplicateBackyContentElement"') &&
    openApiRoute.includes('"deleteBackyContentElements"') &&
    openApiRoute.includes('"transformBackyContentElements"') &&
    openApiRoute.includes('"groupBackyContentElements"') &&
	    openApiRoute.includes('"ungroupBackyContentElements"') &&
	    openApiRoute.includes('formControls: ["form", "input", "textarea", "select", "checkbox", "radio"]') &&
	    openApiRoute.includes('"props.fieldBackgroundColor"') &&
	    openApiRoute.includes('"props.submitBackgroundColor"') &&
	    manifestRoute.includes('liveManagement: buildManifestLiveManagementDiscovery(input.site.id)') &&
    manifestRoute.includes('liveManagement: buildManifestLiveManagementDiscovery(site.id)') &&
    frontendManifestSchema.includes('"backy.live-management.v1"') &&
    frontendManifestSchema.includes('"postConflict"') &&
    frontendManifestSchema.includes('"optimisticConcurrency"') &&
	    frontendManifestSchema.includes('"editorComposition"') &&
	    frontendManifestSchema.includes('"backy.editor-composition-commands.v1"') &&
	    frontendManifestSchema.includes('"backy.editor-command-registry.v1"') &&
	    frontendManifestSchema.includes('"commandRegistry"') &&
	    frontendManifestSchema.includes('"backy.content-lifecycle-commands.v1"') &&
    frontendManifestSchema.includes('"backy.content-revision-branch-metadata.v1"') &&
    frontendManifestSchema.includes('"backy.admin-page-revisions.v1"') &&
    frontendManifestSchema.includes('"backy.admin-blog-post-revisions.v1"') &&
    frontendManifestSchema.includes('"backy.pages-management.v1"') &&
    frontendManifestSchema.includes('"backy.blog-management.v1"') &&
    frontendManifestSchema.includes('"createAdminPage"') &&
    frontendManifestSchema.includes('"createAdminBlogPost"') &&
    frontendManifestSchema.includes('"duplicateBackyContentElement"') &&
    frontendManifestSchema.includes('"transformBackyContentElements"') &&
    frontendManifestSchema.includes('"PAGE_VERSION_CONFLICT"') &&
    frontendManifestSchema.includes('"BLOG_VERSION_CONFLICT"') &&
	    sdkSource.includes('BackyManifestLiveManagementModule') &&
	    sdkSource.includes('BackyManifestEditorComposition') &&
	    sdkSource.includes('BackyManifestEditorCommandRegistry') &&
	    sdkSource.includes('commandRegistry: BackyManifestEditorCommandRegistry') &&
	    sdkSource.includes('evaluateBackyEditorCommandRegistry') &&
	    sdkSource.includes('BackyEditorCommandRegistryEvaluation') &&
	    sdkSource.includes('backy.editor-command-registry-evaluation.v1') &&
	    apiContracts.includes('evaluateBackyEditorCommandRegistry()') &&
	    audit.includes('SDK editor command registry evaluator update') &&
	    sdkSource.includes('BackyManifestContentLifecycleCommands') &&
    sdkSource.includes('BackyContentRevisionBranchMetadata') &&
    sdkSource.includes('BackyAdminPageRevision') &&
    sdkSource.includes('BackyAdminBlogPostRevision') &&
    sdkSource.includes('revisionBranchMetadata: "backy.content-revision-branch-metadata.v1"') &&
    sdkSource.includes('GeneratedBackyOpenApiAdminPageRevisionsEnvelope') &&
    sdkSource.includes('GeneratedBackyOpenApiAdminBlogPostRevisionsEnvelope') &&
    sdkSource.includes('GeneratedBackyOpenApiAdminPageRollbackRequest') &&
	    sdkSource.includes('GeneratedBackyOpenApiAdminBlogPostRollbackRequest') &&
	    sdkSource.includes('GeneratedBackyOpenApiContentRevisionBranchMetadata') &&
	    sdkSource.includes('parentRevisionId: string | null') &&
	    sdkSource.includes('restoreTargetRevisionId: string | null') &&
	    sdkSource.includes('"persisted-revision-lineage"') &&
	    sdkSource.includes('BackyManifestContentManagementPolicy') &&
    sdkSource.includes('createPage: "createAdminPage"') &&
    sdkSource.includes('createPost: "createAdminBlogPost"') &&
    sdkSource.includes('| "assets"') &&
    sdkSource.includes('| "assetList"') &&
    sdkSource.includes('| "responsive"') &&
    sdkSource.includes('| "interactions"') &&
    sdkSource.includes('responsive.${breakpoint}.styles.${key}') &&
    sdkSource.includes('setBackyTokenRefValue') &&
    sdkSource.includes('syncBackyElementAssetIdsAfterPatch') &&
    sdkSource.includes('BACKY_STYLE_EDITABLE_TARGETS') &&
    sdkSource.includes('BACKY_TOKEN_REF_EDITABLE_TARGETS') &&
    sdkSource.includes('tokenRefTargetPath') &&
    sdkSource.includes('BACKY_ANIMATION_EDITABLE_TARGETS') &&
    sdkSource.includes('BACKY_INTERACTION_EDITABLE_TARGETS') &&
    sdkSource.includes('BACKY_DOWNLOAD_FILE_PROP_EDITABLE_TARGETS') &&
    sdkSource.includes('normalizedPath === "actions"') &&
	    sdkSource.includes('BACKY_ASSET_REFERENCE_KEYS') &&
	    sdkSource.includes('"mediaIds"') &&
	    sdkSource.includes('"fontMediaIds"') &&
	    sdkSource.includes('"fileMediaId"') &&
    sdkSource.includes('"downloadMediaId"') &&
    sdkSource.includes('const assetTargetPath = normalizedPath === "assetids"') &&
    sdkSource.includes('const assetListTargetPath = assetTargetPath && leaf.endsWith("ids");') &&
    sdkSource.includes('if (assetTargetPath && (Array.isArray(value) || assetListTargetPath)) return "assetList";') &&
    renderPayloadLib.includes("buildPublicFontManifest(site.id, mediaFonts)") &&
    renderPayloadLib.includes("variants: family.variants") &&
    renderPayloadLib.includes("assetIds: family.assetIds") &&
    pageRenderer.includes("variants?: FontAssetVariant[]") &&
    pageRenderer.includes("font.variants?.length") &&
    contentPayloadSchema.includes('"fontVariant"') &&
    contentPayloadSchema.includes('"variants": {') &&
    generatedSdkTypes.includes('export type GeneratedBackyPublicRenderPayloadFontVariant') &&
    generatedSdkTypes.includes('variants?: Array<GeneratedBackyPublicRenderPayloadFontVariant>;') &&
    generatedSdkSmoke.includes('variants: [') &&
	    backyStoreLib.includes('"mediaIds"') &&
	    backyStoreLib.includes('"fontMediaIds"') &&
    backyStoreLib.includes('"fileMediaId"') &&
    backyStoreLib.includes('"downloadMediaId"') &&
    repositoryMediaReferenceSync.includes("'fileMediaId'") &&
    repositoryMediaReferenceSync.includes("'downloadMediaId'") &&
    backyStoreLib.includes('MEDIA_REFERENCE_ASSET_COLLECTION_KEYS') &&
    backyStoreLib.includes('mediaReferencePayloadForContent(page.content, page.meta)') &&
    backyStoreLib.includes('mediaReferencePayloadForContent(post.content, post.meta)') &&
    backyStoreLib.includes('entry.forEach(addReference)') &&
    coreContentMigrations.includes("'mediaIds'") &&
    coreContentMigrations.includes("'fontMediaIds'") &&
    coreContentMigrations.includes("'fileMediaId'") &&
    coreContentMigrations.includes("'downloadMediaId'") &&
    coreContentMigrations.includes('animatedElementIds') &&
    coreContentMigrations.includes('dataBoundElementIds') &&
    coreContentMigrations.includes('assetBoundElementIds') &&
    coreContentMigrations.includes('hasAnimations: metrics.animatedLayers > 0') &&
    coreContentMigrations.includes('ACTION_PROP_KEYS') &&
    coreContentMigrations.includes('hasBackyElementActionWiring') &&
    sdkSource.includes('addBackyContentElement') &&
    sdkSource.includes('duplicateBackyContentElement') &&
    sdkSource.includes('deleteBackyContentElements') &&
    sdkSource.includes('transformBackyContentElements') &&
    sdkSource.includes('defaultBackyEditableTargetPathsForElement') &&
    sdkSource.includes('const layoutPaths = BACKY_LAYER_LAYOUT_TARGETS.map') &&
    sdkSource.includes('const responsiveLayoutPaths = BACKY_RESPONSIVE_BREAKPOINTS.flatMap') &&
    sdkSource.includes('BACKY_BUTTON_PROP_EDITABLE_TARGETS') &&
    sdkSource.includes('BACKY_FORM_PROP_EDITABLE_TARGETS') &&
    sdkSource.includes('refreshBackyEditorCompositionMetadata') &&
    sdkSource.includes('backy.editor-composition-summary.v1') &&
    sdkSource.includes('animatedLayers: 0') &&
    sdkSource.includes('dataBoundLayers: 0') &&
    sdkSource.includes('assetBoundLayers: 0') &&
    sdkSource.includes('animatedElementIds') &&
    sdkSource.includes('BACKY_ACTION_PROP_KEYS') &&
    sdkSource.includes('hasBackyElementActionWiring(item, props)') &&
    sdkSource.includes('editorComposition: buildBackyEditorCompositionSummaryFromElements') &&
    sdkSource.includes('post: string;') &&
    sdkSource.includes('GeneratedBackyOpenApiLiveManagementDiscovery') &&
    generatedSdkTypes.includes('"x-backy-live-management"?: GeneratedBackyOpenApiLiveManagementDiscovery') &&
    sdkSmoke.includes('manifest() missing live-management discovery module') &&
    sdkSmoke.includes('manifest() live-management missing page response schema header contract') &&
    sdkSmoke.includes('manifest() live-management missing blog response schema header contract') &&
    sdkSmoke.includes('manifest() live-management missing form id editable target') &&
    sdkSmoke.includes('manifest() live-management missing media id editable target') &&
    sdkSmoke.includes('manifest() live-management missing plural media ids editable target') &&
    sdkSmoke.includes('manifest() live-management missing font media id editable target') &&
    sdkSmoke.includes('manifest() live-management missing plural font media ids editable target') &&
    sdkSmoke.includes('manifest() live-management missing download media id editable target') &&
    sdkSmoke.includes('manifest() live-management missing file download disposition editable target') &&
    sdkSmoke.includes('manifest() live-management missing style token box shadow editable target') &&
    sdkSmoke.includes('manifest() live-management missing mobile style box shadow editable target') &&
    sdkSmoke.includes('manifest() live-management missing tablet style token box shadow editable target') &&
    sdkSmoke.includes('manifest() live-management missing animation scroll-trigger start editable target') &&
    sdkSmoke.includes('manifest() live-management missing animation scroll-trigger scrub editable target') &&
    sdkSmoke.includes('manifest() live-management missing element actions editable target') &&
    sdkSmoke.includes('manifest() live-management missing element data bindings editable target') &&
    sdkSmoke.includes('manifest() live-management missing element binding slots editable target') &&
	    sdkSmoke.includes('manifest() live-management missing page create lifecycle endpoint') &&
	    sdkSmoke.includes('manifest() live-management missing editor command registry contract') &&
    sdkSmoke.includes('openapi() missing live-management editor command registry') &&
    sdkSmoke.includes('openapi() live page management missing response schema header contract') &&
    sdkSmoke.includes('openapi() live blog management missing resource response header contract') &&
	    sdkSmoke.includes('evaluateBackyEditorCommandRegistry() did not mark sibling grouping ready') &&
	    sdkSmoke.includes('evaluateBackyEditorCommandRegistry() did not mark selected editor group ungroup ready') &&
    sdkSmoke.includes('manifest() pages runtime missing management create helper') &&
    sdkSmoke.includes('manifest() blog runtime missing management create helper') &&
    sdkSmoke.includes('manifest() live-management missing element assetIds editable target') &&
    sdkSmoke.includes('manifest() live-management missing mobile responsive editable target') &&
    sdkSmoke.includes('listBackyContentElements() did not expose responsive override editable target paths') &&
    sdkSmoke.includes('listBackyContentElements() did not expose unset default button/link/form control targets') &&
	    sdkSmoke.includes('listBackyContentElements() did not expose unset layout/responsive geometry targets') &&
	    sdkSmoke.includes('listBackyContentElements() did not normalize boolean-like layer visibility/locking values') &&
	    sdkSmoke.includes('listBackyContentElements() did not expose unset animation/actions/bindings targets') &&
    sdkSmoke.includes('patchBackyContentEditableFields() did not patch unset default button/link/form control targets') &&
	    sdkSmoke.includes('patchBackyContentEditableFields() did not patch unset layout/responsive geometry targets') &&
	    sdkSmoke.includes('evaluateBackyEditorCommandRegistry() did not normalize boolean-like layer visibility/locking state') &&
	    sdkSmoke.includes('patchBackyContentEditableFields() did not patch unset animation/actions/bindings targets') &&
    sdkSmoke.includes('patchBackyContentEditableFields() did not patch responsive custom frontend design state') &&
    sdkSmoke.includes('patchBackyContentEditableFields() did not patch custom animation JSON state') &&
    sdkSmoke.includes('patchBackyContentEditableMapValues() did not patch responsive targetPath aliases') &&
    sdkSmoke.includes('groupBackyContentElements() did not refresh editor composition metadata') &&
    sdkSmoke.includes('ungroupBackyContentElements() did not refresh editor composition metadata') &&
    sdkSmoke.includes('patchBackyContentEditableMapValues() did not refresh responsive override composition metadata') &&
    sdkSmoke.includes('patchBackyContentEditableFields() did not refresh animated composition metadata') &&
    sdkSmoke.includes('patchBackyContentEditableFields() composition metadata missing prop-action element id') &&
	    sdkSmoke.includes('patchBackyContentEditableFields() did not refresh data-bound composition metadata') &&
	    liveManagementEditorCommandRegistryLib.includes("schemaVersion: 'backy.editor-command-registry.v1'") &&
	    liveManagementEditorCommandRegistryLib.includes("id: 'group-selection'") &&
	    liveManagementEditorCommandRegistryLib.includes("id: 'toggle-selection-visibility'") &&
	    liveManagementEditorCommandRegistryLib.includes("id: 'toggle-grid'") &&
	    liveManagementEditorCommandRegistryLib.includes("id: 'save-page'") &&
    sdkSmoke.includes('patchBackyContentEditableFields() did not refresh asset-bound composition metadata') &&
    sdkSmoke.includes('patchBackyContentElement() did not sync media/font/file/download editable target refs into assetIds') &&
    sdkSmoke.includes('listBackyContentElements() did not classify file/download media editable targets for asset pickers') &&
    sdkSmoke.includes('listBackyContentElements() did not expose patched custom animation targets') &&
    sdkSmoke.includes('manifest() live-management missing editor composition command contract') &&
    sdkSmoke.includes('openapi() live-management missing animation scroll-trigger start editable target') &&
    sdkSmoke.includes('openapi() live-management missing style token box shadow editable target') &&
    sdkSmoke.includes('openapi() live-management missing mobile style box shadow editable target') &&
    sdkSmoke.includes('openapi() live-management missing tablet style token box shadow editable target') &&
    sdkSmoke.includes('openapi() live-management missing element actions editable target') &&
    sdkSmoke.includes('openapi() live-management missing element data bindings editable target') &&
    sdkSmoke.includes('openapi() live-management missing element binding slots editable target') &&
    sdkSmoke.includes('addBackyContentElement') &&
    sdkSmoke.includes('duplicateBackyContentElement') &&
    sdkSmoke.includes('deleteBackyContentElements') &&
    sdkSmoke.includes('transformBackyContentElements') &&
	    sdkSource.includes('function parseBackyBoolean') &&
	    sdkSource.includes('function isBackyElementLocked') &&
	    sdkSource.includes('element.visible = !parseBackyBoolean(value, false)') &&
	    coreContentMigrations.includes("normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes'") &&
    sdkSmoke.includes('openapi() missing live-management group helper metadata') &&
    livePageManagementOverlay.includes('data-backy-live-animation-editor="page"') &&
    livePageManagementOverlay.includes('data-backy-live-animation-section="page"') &&
    livePageManagementOverlay.includes('const updateElementAnimation = (') &&
    livePageManagementOverlay.includes('optionalJsonObjectField') &&
    livePageManagementOverlay.includes('scrollTrigger') &&
    livePageManagementOverlay.includes('tokenRefs') &&
    livePageManagementOverlay.includes('Save animation') &&
    livePageManagementOverlay.includes('data-backy-live-actions-bindings-editor="page"') &&
    livePageManagementOverlay.includes('const updateElementActionsBindings = (') &&
    livePageManagementOverlay.includes('optionalJsonArrayField') &&
    livePageManagementOverlay.includes('setInlineDataBindingsJson') &&
    livePageManagementOverlay.includes('Save actions/bindings') &&
    livePageManagementOverlay.includes('Backy image media ID') &&
    livePageManagementOverlay.includes('Backy video media ID') &&
    livePageManagementOverlay.includes('Backy poster media ID') &&
    livePageManagementOverlay.includes('Download uploaded file') &&
    livePageManagementOverlay.includes('Backy file media ID') &&
    livePageManagementOverlay.includes('mediaIdFromUrl') &&
    livePageManagementOverlay.includes("stringProp(props, 'fileId')") &&
    livePageManagementOverlay.includes("firstStringFromListProp(props, 'fileIds')") &&
    livePageManagementOverlay.includes('publicMediaFileUrl') &&
    livePageManagementOverlay.includes('updateElementPropsWithAssetIds') &&
    livePageManagementOverlay.includes('fileIds: download && mediaId ? [mediaId] : []') &&
    livePageManagementOverlay.includes('downloadMediaIds: download && mediaId ? [mediaId] : []') &&
    livePageManagementOverlay.includes('downloadFileMetadataFromElement(elementFromContent(content, elementId), mediaId)') &&
    livePageManagementOverlay.includes("fileMediaName: download ? downloadFileMetadata.fileMediaName : ''") &&
    livePageManagementOverlay.includes("fileMediaType: download ? downloadFileMetadata.fileMediaType : ''") &&
    livePageManagementOverlay.includes("fileMediaVisibility: download ? downloadFileMetadata.fileMediaVisibility : ''") &&
    livePageManagementOverlay.includes('fileSignedUrlRequired: download && mediaId ? downloadFileMetadata.fileSignedUrlRequired : false') &&
    livePageManagementOverlay.includes("fileName: download ? downloadFileMetadata.fileName : ''") &&
    livePageManagementOverlay.includes("fileDownloadDisposition: download ? 'attachment' : ''") &&
    livePageManagementOverlay.includes('posterMediaIds: posterMediaId ? [posterMediaId] : []') &&
    manifestRoute.includes("'props.fileMediaId'") &&
    manifestRoute.includes("'props.downloadMediaIds'") &&
    manifestRoute.includes("'props.fileMediaName'") &&
    manifestRoute.includes("'props.fileMediaType'") &&
    manifestRoute.includes("'props.fileMediaVisibility'") &&
    manifestRoute.includes("'props.fileSignedUrlRequired'") &&
    manifestRoute.includes("'props.fileName'") &&
    manifestRoute.includes("'props.backgroundColor'") &&
    manifestRoute.includes("'props.borderWidth'") &&
    manifestRoute.includes("'props.textAlign'") &&
    manifestRoute.includes("'props.actionPreset'") &&
    manifestRoute.includes("'props.underline'") &&
    manifestRoute.includes("'styles.boxShadow'") &&
    manifestRoute.includes("'tokenRefs.styles.boxShadow'") &&
    manifestRoute.includes("'responsive.mobile.props.downloadMediaIds'") &&
    manifestRoute.includes("'responsive.mobile.props.fileMediaName'") &&
    manifestRoute.includes("'responsive.mobile.props.fileSignedUrlRequired'") &&
    manifestRoute.includes("'responsive.mobile.props.backgroundColor'") &&
    manifestRoute.includes("'responsive.mobile.styles.boxShadow'") &&
    manifestRoute.includes("'responsive.tablet.props.borderWidth'") &&
    manifestRoute.includes("'responsive.tablet.props.fileMediaVisibility'") &&
    manifestRoute.includes("'responsive.tablet.props.fileSignedUrlEndpoint'") &&
    manifestRoute.includes("'responsive.tablet.tokenRefs.styles.boxShadow'") &&
    openApiRoute.includes('"props.fileMediaId"') &&
    openApiRoute.includes('"props.downloadMediaIds"') &&
    openApiRoute.includes('"props.fileMediaName"') &&
    openApiRoute.includes('"props.fileMediaType"') &&
    openApiRoute.includes('"props.fileMediaVisibility"') &&
    openApiRoute.includes('"props.fileSignedUrlRequired"') &&
    openApiRoute.includes('"props.fileName"') &&
    openApiRoute.includes('"props.backgroundColor"') &&
    openApiRoute.includes('"props.borderWidth"') &&
    openApiRoute.includes('"props.textAlign"') &&
    openApiRoute.includes('"props.actionPreset"') &&
    openApiRoute.includes('"props.underline"') &&
    openApiRoute.includes('"styles.boxShadow"') &&
    openApiRoute.includes('"tokenRefs.styles.boxShadow"') &&
    openApiRoute.includes('"responsive.mobile.props.backgroundColor"') &&
    openApiRoute.includes('"responsive.mobile.props.fileMediaName"') &&
    openApiRoute.includes('"responsive.mobile.props.fileSignedUrlRequired"') &&
    openApiRoute.includes('"responsive.mobile.styles.boxShadow"') &&
    openApiRoute.includes('"responsive.tablet.props.borderWidth"') &&
    openApiRoute.includes('"responsive.tablet.props.fileMediaVisibility"') &&
    openApiRoute.includes('"responsive.tablet.props.fileSignedUrlEndpoint"') &&
    openApiRoute.includes('"responsive.tablet.tokenRefs.styles.boxShadow"') &&
    openApiRoute.includes('"responsive.tablet.props.fileMediaIds"') &&
    adminLinkBehaviorProperties.includes("field: 'downloadFile'") &&
    adminPropertyPanel.includes('fileDownloadIdentityProps') &&
    adminPropertyPanel.includes('fileIds: [media.id]') &&
    adminPropertyPanel.includes('fileMediaIds: [media.id]') &&
    adminPropertyPanel.includes('downloadMediaId: media.id') &&
    adminPropertyPanel.includes('downloadMediaIds: [media.id]') &&
    adminLinkBehaviorProperties.includes('...cleanMediaStrings(props.fileIds)') &&
    adminCanvasEditor.includes("'fileMediaIds'") &&
    adminCanvasEditor.includes("'downloadMediaIds'") &&
    adminCanvasEditor.includes("'fallbackImageMediaIds'") &&
    adminCanvasEditor.includes('const parseEditorBoolean =') &&
    adminCanvasEditor.includes('parseEditorBoolean(value, true)') &&
    adminCanvasEditor.includes('selectedActiveElements.every(isLayerHidden)') &&
    adminCanvasEditor.includes('selectedActiveElements.every(isLayerLocked)') &&
    adminLinkBehaviorProperties.includes('data-testid={`editor-${prefix}-download-media`}') &&
    adminCanvas.includes('fileDownloadDataAttributes(p)') &&
    adminCanvas.includes('const isCanvasElementHidden =') &&
    adminCanvas.includes('const isCanvasElementLocked =') &&
    adminCanvas.includes('const isHidden = isCanvasElementHidden(element)') &&
    adminCanvas.includes("'data-backy-file-id': fileMediaId || undefined") &&
    adminCanvas.includes('firstTextFromList(props.fileIds)') &&
    adminCanvas.includes('getBooleanWithFallback(props.fileSignedUrlRequired, false)') &&
    adminCanvas.includes("download={getBooleanWithFallback(p.download, false) ? '' : undefined}") &&
    adminLayersPanel.includes('const parseLayerBoolean =') &&
    adminLayersPanel.includes('isHidden={isLayerHidden(element)}') &&
    adminLayersPanel.includes('canReorder={!disabled && !isLayerLocked(element)}') &&
    livePageManagementOverlay.includes("return booleanProp(props, 'download');") &&
    livePageManagementOverlay.includes('visible: booleanValue(item.visible, true)') &&
    livePageManagementOverlay.includes('const selectedElementLocked = booleanValue(selectedContentElement?.locked);') &&
    livePageManagementOverlay.includes("normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes'") &&
    pageRenderer.includes('getFirstNameClassFromList(props.fileIds)') &&
    pageRenderer.includes("'data-backy-file-id': fileMediaId || undefined") &&
    pageRenderer.includes("fileMediaVisibility === 'private'") &&
    pageRenderer.includes("download={getBooleanWithFallback(props.download, false) ? '' : undefined}") &&
    pageRenderer.includes('getBooleanWithFallback(boundElement.props.hidden, false)') &&
    pageRenderer.includes('!getBooleanWithFallback(boundElement.visible, true)') &&
    pageRendererSmoke.includes('data-backy-file-id="renderer-file-id"') &&
    pageRendererSmoke.includes('Boolean-like visible=false layer should not render') &&
    pageRendererSmoke.includes('Download link generic file id metadata was not rendered from fileIds') &&
    pageRendererSmoke.includes('Download link private signed URL requirement was not inferred from private visibility') &&
	    generatedSdkSmoke.includes('props.formId') &&
	    generatedSdkSmoke.includes('props.fieldBackgroundColor') &&
	    generatedSdkSmoke.includes('props.submitBackgroundColor') &&
	    generatedSdkSmoke.includes('props.mediaId') &&
    generatedSdkSmoke.includes('props.mediaIds') &&
    generatedSdkSmoke.includes('props.backgroundMediaIds') &&
    generatedSdkSmoke.includes('props.posterMediaIds') &&
    generatedSdkSmoke.includes('props.fontMediaId') &&
    generatedSdkSmoke.includes('props.fontMediaIds') &&
    generatedSdkSmoke.includes('props.downloadMediaId') &&
    generatedSdkSmoke.includes('props.downloadMediaIds') &&
    generatedSdkSmoke.includes('props.fileMediaName') &&
    generatedSdkSmoke.includes('props.fileMediaType') &&
    generatedSdkSmoke.includes('props.fileMediaVisibility') &&
    generatedSdkSmoke.includes('props.fileSignedUrlRequired') &&
    generatedSdkSmoke.includes('props.fileName') &&
    generatedSdkSmoke.includes('props.backgroundColor') &&
    generatedSdkSmoke.includes('props.borderWidth') &&
    generatedSdkSmoke.includes('props.textAlign') &&
    generatedSdkSmoke.includes('props.actionPreset') &&
    generatedSdkSmoke.includes('props.underline') &&
    generatedSdkSmoke.includes('styles.boxShadow') &&
    generatedSdkSmoke.includes('tokenRefs.styles.boxShadow') &&
    generatedSdkSmoke.includes('responsive.mobile.props.downloadMediaIds') &&
    generatedSdkSmoke.includes('responsive.mobile.props.fileMediaName') &&
    generatedSdkSmoke.includes('responsive.mobile.props.fileSignedUrlRequired') &&
    generatedSdkSmoke.includes('responsive.mobile.props.backgroundColor') &&
    generatedSdkSmoke.includes('responsive.mobile.styles.boxShadow') &&
    generatedSdkSmoke.includes('responsive.tablet.props.borderWidth') &&
    generatedSdkSmoke.includes('responsive.tablet.tokenRefs.styles.boxShadow') &&
    generatedSdkSmoke.includes('responsive.tablet.props.fileMediaIds') &&
    generatedSdkSmoke.includes('responsive.tablet.props.fileMediaVisibility') &&
    generatedSdkSmoke.includes('responsive.tablet.props.fileSignedUrlEndpoint') &&
    generatedSdkSmoke.includes('animation.type') &&
    generatedSdkSmoke.includes('animation.scrollTrigger.start') &&
    generatedSdkSmoke.includes('animation.scrollTrigger.scrub') &&
    generatedSdkSmoke.includes('animation.from') &&
    generatedSdkSmoke.includes('animation.to') &&
    generatedSdkSmoke.includes('animation.tokenRefs.duration') &&
    generatedSdkSmoke.includes('actions') &&
    generatedSdkSmoke.includes('dataBindings') &&
    generatedSdkSmoke.includes('bindingSlots') &&
    generatedSdkSmoke.includes('responsive.mobile.x') &&
    generatedSdkSmoke.includes('responsive.mobile.styles.color') &&
    generatedSdkSmoke.includes('responsive.mobile.props.mediaId') &&
    generatedSdkSmoke.includes('responsive.mobile.props.mediaIds') &&
    generatedSdkSmoke.includes('responsive.mobile.props.posterMediaIds') &&
    sdkSmoke.includes('manifest() live-management blog post endpoint drifted') &&
    generatedSdkSmoke.includes('invalidGeneratedManifestLiveManagementDiscovery'),
  'Frontend manifest and SDK must expose structured live-management discovery for inline custom frontend editing.',
);

	assert(
	    coreContentMigrations.includes('canvasContentPayloadToBackyContentDocument') &&
	    coreTypes.includes('export interface SiteFrontendDesignTemplateContent') &&
	    coreTypes.includes('content?: SiteFrontendDesignTemplateContent') &&
	    coreTypes.includes('frontendDesignCustomJs?: string;') &&
	    coreTypes.includes('frontendDesignContentDocument?: Record<string, unknown>;') &&
	    coreTypes.includes('frontendDesignEditableMap?: Record<string, unknown>;') &&
	    coreTypes.includes('export interface SiteFrontendDesignEditableMapEntry') &&
	    coreTypes.includes('targetPath?: string;') &&
	    coreTypes.includes('valueType?: SiteFrontendDesignEditableValueType;') &&
	    coreTypes.includes('export interface SiteFrontendDesignMotionTokens') &&
	    coreTypes.includes('motion?: SiteFrontendDesignMotionTokens;') &&
	    coreTypes.includes('customCSS?: string;') &&
    coreContentMigrations.includes('customJS?: string') &&
    coreContentMigrations.includes('themeTokenRefs: payloadStringRecord(') &&
    coreContentMigrations.includes("metadata.animations = animations") &&
    frontendDesignContractLib.includes('const contentDesignStatePayload = (content: unknown): Record<string, unknown> =>') &&
    frontendDesignContractLib.includes('export const normalizeInputFromDirectFrontendDesignEnvelope') &&
    frontendDesignContractLib.includes('const directDesignEnvelopeFromBody = (') &&
    frontendDesignContractLib.includes("body.design, body.frontendDesign, body.designEnvelope, body.frontendDesignEnvelope") &&
    frontendDesignContractLib.includes('const mergeFrontendDesignContractInput = (') &&
    frontendDesignContractLib.includes('const normalizeFrontendDesignEditableMapEntry = (') &&
    frontendDesignContractLib.includes('const inferFrontendDesignEditableValueType = (') &&
    frontendDesignContractLib.includes('const defaultFrontendDesignEditableTargetPathsForElement = (') &&
    frontendDesignContractLib.includes('const editableMapEntriesFromRecord = (') &&
    frontendDesignContractLib.includes('const editableMapRecordFromEntries = (') &&
    frontendDesignContractLib.includes('const editableMapRecordFromContentElements = (') &&
    frontendDesignContractLib.includes('export const buildFrontendDesignEditableMapRecord = (') &&
    frontendDesignContractLib.includes('const editableMap = editableMapRecordFromContentElements(elements, designState.editableMap);') &&
    frontendDesignContractLib.includes('const directDesignEditableMapRecord = (') &&
    frontendDesignContractLib.includes('const directDesignTemplateId = (') &&
    frontendDesignContractLib.includes("fallbackTemplateId('content'") &&
    publicPagesRoute.includes('frontendDesignProvenanceFromMetadata(page.meta)') &&
    publicBlogRoute.includes('frontendDesignProvenanceFromMetadata(post.meta)') &&
    frontendDesignContractLib.includes("applyProvenanceField(meta, 'frontendDesignEditableMap', directDesignEditableMapRecord(envelope, content));") &&
    frontendDesignContractLib.includes('const contentEditableMap = editableMapEntriesFromRecord(contentRecord.editableMap);') &&
    frontendDesignContractLib.includes('const capturedEditableMapRecord = editableMapRecordFromEntries(capturedEditableMap);') &&
    frontendDesignContractLib.includes('content: templateContentWithEditableMap') &&
    frontendDesignContractLib.includes("'targetPath',") &&
    frontendDesignContractLib.includes("'valueType',") &&
    frontendDesignContractLib.includes('const fields = stringArrayValue(entry.fields);') &&
    frontendDesignContractLib.includes('const editable = booleanValue(entry.editable);') &&
    frontendDesignContractLib.includes('const mergeDeepRecord = (') &&
    frontendDesignContractLib.includes("      'motion',") &&
    frontendDesignContractLib.includes('const motionTokenRecord = (') &&
    frontendDesignContractLib.includes('motion: motionTokenRecord(tokensInput.motion)') &&
    frontendDesignContractLib.includes('customCss: stringValue(tokensInput.customCss) || stringValue(tokensInput.customCSS)') &&
    frontendDesignContractLib.includes('const mergeTemplateContentInput = (') &&
    frontendDesignContractLib.includes("'animations',") &&
    frontendDesignContractLib.includes("'interactions',") &&
    frontendDesignContractLib.includes("'dataBindings',") &&
    frontendDesignContractLib.includes('merged[key] = mergeDeepRecord(fallbackRecord[key], nextRecord[key]);') &&
    frontendDesignContractLib.includes('const designStateValue = (') &&
    frontendDesignContractLib.includes('const buildFrontendDesignProvenanceFields = (') &&
    frontendDesignContractLib.includes('meta: buildFrontendDesignProvenanceFields(frontendDesign, template, existingMeta)') &&
    frontendDesignContractLib.includes('frontendDesignAnimations') &&
    frontendDesignContractLib.includes('customJs: stringValue(metadata.frontendDesignCustomJs)') &&
    frontendDesignContractLib.includes('contentDocument: cloneRecord(metadata.frontendDesignContentDocument)') &&
    frontendDesignContractLib.includes('themeTokenRefs: cloneRecord(metadata.frontendDesignThemeTokenRefs)') &&
    frontendDesignContractLib.includes('editableMap: cloneRecord(metadata.frontendDesignEditableMap)') &&
    frontendDesignContractLib.includes('animations: arrayOrRecordValue(metadata.frontendDesignAnimations)') &&
    frontendDesignContractLib.includes('...(customJS ? { customJS } : {})') &&
    frontendDesignContractLib.includes("const assets = designStateValue(content, 'assets');") &&
    frontendDesignContractLib.includes("const animations = designStateValue(content, 'animations');") &&
    frontendDesignContractLib.includes("const interactions = designStateValue(content, 'interactions');") &&
    frontendDesignContractLib.includes('...(animations ? { animations } : {})') &&
    frontendDesignContractLib.includes('const mergeSectionTemplateDesignStateIntoContent = (') &&
    frontendDesignContractLib.includes('mergeSectionTemplateDesignStateIntoContent(seed.template, currentContent)') &&
    frontendDesignContractLib.includes('...(editableMap ? { editableMap } : {})') &&
    templateRegistrySmoke.includes('partiallyPatchedFrontendDesign.tokens.motion?.duration?.fast') &&
    templateRegistrySmoke.includes('partiallyPatchedFrontendDesign.tokens.motion?.duration?.slow') &&
    templateRegistrySmoke.includes('partiallyPatchedFrontendDesign.tokens.customCss') &&
    templateRegistrySmoke.includes('Partial frontend-design patch should retain fallback interaction timelines') &&
    templateRegistrySmoke.includes('Partial frontend-design patch should merge newly patched data-binding fields') &&
    templateRegistrySmoke.includes('Partial frontend-design patch should merge newly patched nested template design state') &&
    templateRegistrySmoke.includes('Captured button editable map should expose color controls') &&
    templateRegistrySmoke.includes('Captured button editable map should expose downloadable file controls') &&
    templateRegistrySmoke.includes('Captured button editable map should expose responsive color controls') &&
    templateRegistrySmoke.includes('Captured data bindings should map source fields back to editable target paths') &&
    templateRegistrySmoke.includes('Captured template content should persist inferred button color controls') &&
    templateRegistrySmoke.includes('Seeded page content should retain inferred editable color controls') &&
    templateRegistrySmoke.includes('Seeded page metadata should retain inferred editable animation controls') &&
    templateRegistrySmoke.includes('Direct design envelope content should infer file controls') &&
    templateRegistrySmoke.includes('Direct design envelope metadata should retain inferred animation controls') &&
    templateRegistrySmoke.includes('Direct design envelopes without template ids should receive stable frontend-design provenance ids') &&
    templateRegistrySmoke.includes('Frontend-design provenance should remain public-readable for direct designs without explicit template ids') &&
    templateRegistrySmoke.includes('Direct design content should retain record-shaped animation maps') &&
    templateRegistrySmoke.includes('Frontend-design provenance should expose record-shaped animation maps') &&
    templateRegistrySmoke.includes('Direct reusable-section design content should retain record-shaped animations') &&
    templateRegistrySmoke.includes('Direct reusable-section design envelope should infer downloadable file controls') &&
    templateRegistrySmoke.includes('Direct collection-record design envelope should infer data-binding controls') &&
    backyStoreLib.includes('frontendDesignAnimations?: unknown[] | Record<string, unknown>') &&
    backyStoreLib.includes('| "frontendDesignAnimations"') &&
    backyStoreLib.includes('frontendDesignAnimations: arrayOrRecordField("frontendDesignAnimations")') &&
    backyStoreLib.includes('const pageContentFromCanvasInput = (') &&
    backyStoreLib.includes('const designStateValueFromContent = <T = unknown>(') &&
    backyStoreLib.includes('animations: designStateValueFromContent<unknown[] | Record<string, unknown>>') &&
    adminPagesRoute.includes('canvasContentPayloadToBackyContentDocument') &&
    adminPagesRoute.includes('normalizeInputFromDirectFrontendDesignEnvelope') &&
    adminPagesRoute.includes('animations: designStateValue<unknown[] | Record<string, unknown>>("animations")') &&
    adminPagesRoute.includes('animations: Array.isArray(page.content.metadata?.animations) || isRecord(page.content.metadata?.animations)') &&
    adminPageDetailRoute.includes('fallbackDocument: fallback.content') &&
    adminPageDetailRoute.includes('normalizeInputFromDirectFrontendDesignEnvelope') &&
    adminPageDetailRoute.includes(': fallback.elements) as StorePage["content"]["elements"]') &&
    adminPageDetailRoute.includes('animations: designStateValue<unknown[] | Record<string, unknown>>("animations")') &&
    adminPageDetailRoute.includes('animations: Array.isArray(page.content.metadata?.animations) || isRecord(page.content.metadata?.animations)') &&
    adminPagePublishRoute.includes('typeof page.content.metadata?.customJS === "string"') &&
    adminPageArchiveRoute.includes('typeof page.content.metadata?.customJS === "string"') &&
    adminBlogRoute.includes('canvasContentPayloadToBackyContentDocument') &&
    adminBlogRoute.includes('normalizeInputFromDirectFrontendDesignEnvelope') &&
    adminBlogRoute.includes('animations: Array.isArray(post.content.metadata?.animations) || isRecord(post.content.metadata?.animations)') &&
    adminBlogPostDetailRoute.includes('fallbackDocument: fallback.content') &&
    adminBlogPostDetailRoute.includes('normalizeInputFromDirectFrontendDesignEnvelope') &&
    adminBlogPostDetailRoute.includes('animations: Array.isArray(post.content.metadata?.animations) || isRecord(post.content.metadata?.animations)') &&
    adminBlogPostPublishRoute.includes('typeof post.content.metadata?.customJS === "string"') &&
    adminBlogPostArchiveRoute.includes('typeof post.content.metadata?.customJS === "string"') &&
    publicPagesRoute.includes('const publicPageContentFromRepositoryDocument = (content: BackyPage[\'content\'])') &&
    publicBlogRoute.includes('const publicPostContentFromRepositoryDocument = (content: BackyPost[\'content\'])') &&
    publicPagesRoute.includes('themeTokenRefs: content.themeTokenRefs') &&
    publicBlogRoute.includes('themeTokenRefs: content.themeTokenRefs') &&
    publicPagesRoute.includes('assets: content.assets') &&
    publicBlogRoute.includes('assets: content.assets') &&
    publicPagesRoute.includes('animations: Array.isArray(metadata.animations) || isRecord(metadata.animations)') &&
    publicBlogRoute.includes('animations: Array.isArray(metadata.animations) || isRecord(metadata.animations)') &&
    publicPagesRoute.includes('interactions: content.interactions') &&
    publicBlogRoute.includes('interactions: content.interactions') &&
    publicPagesRoute.includes('dataBindings: content.dataBindings') &&
    publicBlogRoute.includes('dataBindings: content.dataBindings') &&
    publicPagesRoute.includes('editableMap: content.editableMap') &&
    publicBlogRoute.includes('editableMap: content.editableMap') &&
    frontendDesignContractLib.includes('customJs: stringValue(metadata.frontendDesignCustomJs)') &&
    frontendDesignContractLib.includes('const cloneArrayOrRecord = (value: unknown): unknown[] | Record<string, unknown> | undefined => (') &&
    frontendDesignContractLib.includes('animations: arrayOrRecordValue(metadata.frontendDesignAnimations)') &&
    frontendDesignContractLib.includes('const animations = cloneArrayOrRecord(current.frontendDesignAnimations)') &&
    publicPagesRoute.includes('animations: Array.isArray(metadata.animations) || isRecord(metadata.animations)') &&
    publicBlogRoute.includes('animations: Array.isArray(metadata.animations) || isRecord(metadata.animations)') &&
    renderPayloadLib.includes('const jsonArrayOrRecordValue = (...values: unknown[]): JsonArrayOrObject | undefined => {') &&
    renderPayloadLib.includes('jsonArrayOrRecordValue(content.animations, contentDocument?.animations, metadata?.animations)') &&
    renderPayloadLib.includes('buildFrontendDesignEditableMapRecord(elements, explicitEditableMap)') &&
    renderPayloadLib.includes('const editableMap = buildEditableMap(elements, page.content.editableMap);') &&
    renderPayloadLib.includes('const contentEditableMap = input.editableMap && Object.keys(input.editableMap).length > 0') &&
    renderPayloadLib.includes('editableMap: contentEditableMap') &&
    frontendDesignContractLib.includes('editableMap: cloneRecord(metadata.frontendDesignEditableMap)') &&
    publicReusableSectionsRoute.includes('frontendDesignProvenanceFromMetadata(section.metadata)') &&
    publicReusableSectionDetailRoute.includes('frontendDesignProvenanceFromMetadata(section.metadata)') &&
    frontendDesignContractLib.includes('normalizeReusableSectionInputFromDirectFrontendDesignEnvelope') &&
    adminReusableSectionsRoute.includes('normalizeReusableSectionInputFromDirectFrontendDesignEnvelope') &&
    adminReusableSectionDetailRoute.includes('normalizeReusableSectionInputFromDirectFrontendDesignEnvelope') &&
    adminReusableSectionsPage.includes('reusableSectionDesignStateFromRecord(content)') &&
    adminReusableSectionsPage.includes('contentDocument: cloneDesignStateValue(record.contentDocument)') &&
    publicFormsRoute.includes('frontendDesignProvenanceFromMetadata(form.settings)') &&
    publicFormDetailRoute.includes('frontendDesignProvenanceFromMetadata(form.settings)') &&
    publicFormDefinitionRoute.includes('frontendDesignProvenanceFromMetadata(form.settings)') &&
    publicCollectionsRoute.includes('withCollectionFrontendDesign') &&
    publicCollectionResourcesLib.includes('frontendDesignProvenanceFromMetadata(collection.metadata)') &&
    publicCollectionResourcesLib.includes('frontendDesignProvenanceFromMetadata(record.values)') &&
    commerceCatalogLib.includes('const normalizeUnknownArrayOrRecord = (value: unknown): CommerceDesignArrayOrRecord | undefined => {') &&
    commerceCatalogLib.includes('const productDesignReadinessArrayOrRecord = (') &&
    commerceCatalogLib.includes('const designStateItemCount = (value: unknown): number => {') &&
    commerceCatalogLib.includes("const assets = normalizeUnknownArrayOrRecord(designValue('assets', 'frontendDesignAssets'));") &&
    commerceCatalogLib.includes("const animations = normalizeUnknownArrayOrRecord(designValue('animations', 'frontendDesignAnimations'));") &&
    commerceCatalogLib.includes("const interactions = normalizeUnknownArrayOrRecord(designValue('interactions', 'frontendDesignInteractions'));") &&
    commerceCatalogLib.includes('const animationCount = designStateItemCount(animations);') &&
    commerceCatalogLib.includes('const assetCount = designStateItemCount(assets);') &&
    commerceCatalogLib.includes('animations: animationCount,') &&
    commerceCatalogLib.includes('assets: assetCount,') &&
    manifestRoute.includes('frontendDesignProvenanceFromMetadata(section.metadata)') &&
    manifestRoute.includes('frontendDesignProvenanceFromMetadata(item.meta)') &&
    adminFrontendDesignRoute.includes('mergeFallback: true') &&
    adminSiteSettingsRoute.includes('normalizeFrontendDesignContract(patch.frontendDesign') &&
    adminSiteSettingsRoute.includes('mergeFallback: true') &&
	    openApiRoute.includes('customJS: { type: "string" }') &&
	    openApiRoute.includes('customJs: { type: "string" }') &&
	    openApiRoute.includes('FrontendDesignTemplateContent: {') &&
	    openApiRoute.includes('FrontendEditableMapEntry: {') &&
	    openApiRoute.includes('targetPath: { type: "string" }') &&
	    openApiRoute.includes('valueType: {') &&
	    openApiRoute.includes('$ref: "#/components/schemas/FrontendDesignTemplateContent"') &&
	    (openApiRoute.match(/oneOf: \[\s+\{\s+type: "array",\s+items: \{ type: "object", additionalProperties: true \},\s+\},\s+\{ type: "object", additionalProperties: true \},\s+\],\s+\},\s+animations: \{/g) || []).length >= 2 &&
	    openApiRoute.includes('contentDocument: {') &&
	    openApiRoute.includes('editableMap: { type: "object", additionalProperties: true }') &&
    openApiRoute.includes('themeTokenRefs: {') &&
    openApiRoute.includes('animations: {') &&
    openApiRoute.includes('dataBindings: { type: "object", additionalProperties: true }') &&
    openApiRoute.includes('BackyElementAnimation: {') &&
    openApiRoute.includes('$ref: "#/components/schemas/BackyElementAnimation"') &&
    openApiRoute.includes('$ref: "#/components/schemas/BackyEditableMapEntry"') &&
    openApiRoute.includes('$ref: "#/components/schemas/BackyContentDocument"') &&
    openApiRoute.includes('templateId: { type: "string" }') &&
    openApiRoute.includes('bindingHints: {') &&
    (openApiRoute.match(/design: \{ \$ref: "#\/components\/schemas\/FrontendDesignTemplateContent" \}/g) || []).length >= 2 &&
    (openApiRoute.match(/frontendDesign: \{ \$ref: "#\/components\/schemas\/FrontendDesignTemplateContent" \}/g) || []).length >= 2 &&
    generatedSdkTypes.includes('customJS?: string;') &&
	    generatedSdkTypes.includes('themeTokenRefs?: Record<string, string>;') &&
	    generatedSdkTypes.includes('export type GeneratedBackyOpenApiFrontendDesignTemplateContent = {') &&
    generatedSdkTypes.includes('content?: GeneratedBackyOpenApiFrontendDesignTemplateContent;') &&
	    generatedSdkTypes.includes('export type GeneratedBackyOpenApiReusableSectionFrontendDesign = {') &&
    generatedSdkTypes.includes('export type GeneratedBackyOpenApiBackyReusableSectionContent = {') &&
    generatedSdkTypes.includes('animations?: Array<Record<string, unknown>> | Record<string, unknown>;') &&
    generatedSdkTypes.includes('customJs?: string;') &&
    generatedSdkTypes.includes('contentDocument?: Record<string, unknown>;') &&
    generatedSdkTypes.includes('editableMap?: Record<string, unknown>;') &&
	    sdkSource.includes('contentDocument?: Record<string, unknown>;') &&
	    sdkSource.includes('export interface BackyFrontendDesignTemplateContent') &&
	    sdkSource.includes('content?: BackyFrontendDesignTemplateContent;') &&
	    sdkSource.includes('customCSS?: string;') &&
		    sdkSource.includes('export function buildBackyContentDesignPayload') &&
		    sdkSource.includes('export function buildBackyAdminPageCreateInput') &&
		    sdkSource.includes('export function buildBackyAdminPageUpdateInput') &&
		    sdkSource.includes('export function buildBackyAdminBlogPostCreateInput') &&
		    sdkSource.includes('export function buildBackyAdminBlogPostUpdateInput') &&
		    sdkSource.includes('export function buildBackyAdminReusableSectionCreateInput') &&
		    sdkSource.includes('export function buildBackyAdminReusableSectionUpdateInput') &&
		    sdkSource.includes('export function buildBackyAdminCollectionRecordCreateInput') &&
		    sdkSource.includes('export function buildBackyAdminCollectionRecordUpdateInput') &&
		    sdkSource.includes('export function buildBackyAdminCommerceProductCreateInput') &&
		    sdkSource.includes('export function buildBackyAdminCommerceProductUpdateInput') &&
		    sdkSource.includes('frontendDesignContentDocument') &&
	    sdkSource.includes('frontendDesignAnimations') &&
	    frontendManifestSchema.includes('"customCSS": { "type": "string" }') &&
	    frontendManifestSchema.includes('"targetPath": { "type": "string" }') &&
	    frontendManifestSchema.includes('"valueType": {') &&
	    sdkSource.includes('themeTokenRefs?: Record<string, unknown>;') &&
	    sdkSource.includes('export interface BackyFrontendEditableMapEntry') &&
	    sdkSource.includes('targetPath?: string;') &&
	    sdkSource.includes('valueType?:') &&
    sdkSource.includes('function inferBackyFrontendEditableMapFromElements(') &&
    sdkSource.includes('function buildBackyFrontendEditableMapRecord(') &&
    sdkSource.includes('function backyDesignTemplateId(') &&
    sdkSource.includes('function fallbackBackyTemplateId(') &&
    sdkSource.includes('editableMap?: Record<string, unknown>;') &&
    adminReusableSectionsSmoke.includes('__backySmokeSectionHydrated') &&
    adminReusableSectionsSmoke.includes('frontendDesignContentDocument?.schemaVersion') &&
    adminReusableSectionsSmoke.includes('frontendDesignAnimations[0]?.timeline === \'section-intro\'') &&
    adminReusableSectionsSmoke.includes('frontendDesignEditableMap?.[\'section.heading\']?.elementId') &&
    adminReusableSectionsSmoke.includes('Frontend data bindings were not retained') &&
    adminReusableSectionsSmoke.includes('Frontend SEO was not retained') &&
    templateRegistrySmoke.includes('nested-section-template') &&
    templateRegistrySmoke.includes('Nested section content should retain root animation arrays') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiBackyElementAnimation') &&
    generatedSdkTypes.includes('animation?: GeneratedBackyPublicRenderPayloadAnimation') &&
    generatedSdkSmoke.includes('pageDesignStateUpdate') &&
    generatedSdkSmoke.includes('animationTimeline: "hero-intro"') &&
    sdkSmoke.includes('buildBackyContentDesignPayload() did not preserve animation timelines') &&
    sdkSmoke.includes('buildBackyContentDesignPayload() did not infer editable controls from SDK design elements') &&
    sdkSmoke.includes('buildBackyContentDesignPayload() did not preserve contentDocument metadata customCSS') &&
    sdkSmoke.includes('buildBackyAdminPageCreateInput() did not preserve animation provenance') &&
    sdkSmoke.includes('buildBackyAdminPageCreateInput() did not preserve inferred editable-map provenance') &&
    sdkSmoke.includes('buildBackyAdminPageCreateInput() did not synthesize a stable template id for imported designs') &&
    sdkSmoke.includes('buildBackyAdminPageUpdateInput() did not preserve expectedUpdatedAt') &&
    sdkSmoke.includes('buildBackyAdminBlogPostCreateInput() did not infer template id from content') &&
    sdkSmoke.includes('buildBackyAdminBlogPostUpdateInput() did not prefer explicit content customJS') &&
    sdkSmoke.includes('buildBackyAdminReusableSectionCreateInput() did not preserve animation metadata') &&
    sdkSmoke.includes('buildBackyAdminReusableSectionUpdateInput() did not preserve expectedVersion') &&
    sdkSmoke.includes('buildBackyAdminCollectionRecordCreateInput() did not preserve animation aliases') &&
    sdkSmoke.includes('buildBackyAdminCollectionRecordCreateInput() did not preserve inferred editable-map aliases') &&
    sdkSmoke.includes('buildBackyAdminCollectionRecordCreateInput() did not synthesize record template id') &&
    sdkSmoke.includes('buildBackyAdminCollectionRecordUpdateInput() did not preserve clean animation state') &&
    sdkSmoke.includes('buildBackyAdminCommerceProductCreateInput() did not preserve product content document') &&
    sdkSmoke.includes('buildBackyAdminCommerceProductUpdateInput() did not prefer update custom JS') &&
    sdkSmoke.includes('buildBackyAdminCommerceProductUpdateInput() did not preserve inferred product editable-map alias') &&
    sdkSmoke.includes('openapi() page update canvas payload missing customJS design state') &&
    sdkSmoke.includes('openapi() blog update canvas payload missing data binding design state'),
  'Page/blog/reusable-section contracts must preserve canvas design state, animations, bindings, editable maps, custom CSS/JS, and canonical content documents.',
);

assert(
  manifestRoute.includes('buildManifestFormsDiscovery') &&
    manifestRoute.includes("schemaVersion: 'backy.forms-discovery.v1'") &&
    manifestRoute.includes("schemaVersion: 'backy.forms-management.v1'") &&
    manifestRoute.includes("cacheableDefinitions: true") &&
    manifestRoute.includes("privateSubmissionData: true") &&
    manifestRoute.includes("authenticatedManagement: true") &&
    manifestRoute.includes("retryWebhook: 'retryFormSubmissionWebhook'") &&
    manifestRoute.includes("promoteContactCustomer: 'promoteFormContactToCustomer'") &&
    manifestRoute.includes("databaseCredentialsNeverReturned: true") &&
    manifestRoute.includes("publicDefinitionExcludesSubmissions: true") &&
    manifestRoute.includes('formsRuntime: buildManifestFormsDiscovery(input.site.id, input.forms)') &&
    manifestRoute.includes('formsRuntime: buildManifestFormsDiscovery(site.id, forms)') &&
    manifestRoute.includes('newsletterRuntime: buildManifestNewsletterDiscovery(input.site.id, input.forms)') &&
    manifestRoute.includes('newsletterRuntime: buildManifestNewsletterDiscovery(site.id, forms)') &&
    manifestRoute.includes("publicSubscribers: `/api/sites/${siteId}/newsletter/subscribers`") &&
    manifestRoute.includes("adminSubscribers: `/api/admin/sites/${siteId}/newsletter/subscribers`") &&
    manifestRoute.includes("syncContacts: `/api/admin/sites/${siteId}/forms/{formId}/contacts/sync`") &&
    manifestRoute.includes("adminWorkspace: `/newsletter?siteId=${siteId}`") &&
    manifestRoute.includes("schemaVersion: 'backy.newsletter-sync-boundary.v1'") &&
    manifestRoute.includes("newsletterPage: `/pages/new?siteId=${siteId}&template=newsletter&templateSource=backy-canvas&focus=canvas`") &&
    manifestRoute.includes("subscribe: 'subscribeNewsletter'") &&
    manifestRoute.includes("syncContacts: 'syncFormContacts'") &&
    newsletterSubscribersLib.includes("NEWSLETTER_SUBSCRIBERS_SCHEMA_VERSION = 'backy.newsletter-subscribers.v1'") &&
    newsletterSubscribersLib.includes('export const buildNewsletterContactFields = ({') &&
    newsletterSubscribersLib.includes('export const isNewsletterForm = (form: FormDefinition): boolean => {') &&
    publicNewsletterSubscribersRoute.includes('NEWSLETTER_CONSENT_REQUIRED') &&
    publicNewsletterSubscribersRoute.includes('buildNewsletterSourceValues({') &&
    publicNewsletterSubscribersRoute.includes("readNewsletterBodyField(body, 'signup_source')") &&
    adminNewsletterSubscribersRoute.includes('buildNewsletterSubscriberPayload(contact, form, { includeSourceValues: true })') &&
    adminNewsletterSubscribersRoute.includes("readNewsletterBodyField(body, 'signup_source')") &&
    adminNewsletterPage.includes('Public subscribe') &&
    adminNewsletterPage.includes('newsletterSubscribersUrl') &&
    adminNewsletterPage.includes('supportedPayloadShapes') &&
    openApiRoute.includes('formsManagementDiscovery') &&
    openApiRoute.includes('subscribeBackyNewsletter') &&
    openApiRoute.includes('listBackyNewsletterSubscribers') &&
    openApiRoute.includes('NewsletterSubscribeValues') &&
    openApiRoute.includes('NewsletterUnsubscribeRequest') &&
    openApiRoute.includes('signup_source: { type: "string" }') &&
    openApiRoute.includes('"x-backy-forms-management"') &&
    openApiRoute.includes('FormsManagementPolicy') &&
    openApiRoute.includes('"backy.forms-management.v1"') &&
    frontendManifestSchema.includes('"backy.forms-discovery.v1"') &&
    frontendManifestSchema.includes('"backy.forms-management.v1"') &&
    frontendManifestSchema.includes('"backy.newsletter-subscribers.v1"') &&
    frontendManifestSchema.includes('"backy.newsletter-sync-boundary.v1"') &&
    frontendManifestSchema.includes('"newsletterWorkspace"') &&
    frontendManifestSchema.includes('"newsletterContactSync"') &&
    frontendManifestSchema.includes('"cacheableDefinitions"') &&
    frontendManifestSchema.includes('"authenticatedManagement"') &&
    frontendManifestSchema.includes('"FORM_VALIDATION_ERROR"') &&
    sdkSource.includes('BackyManifestNewsletterRuntimeModule') &&
    sdkSource.includes('newsletterRuntime?: BackyManifestNewsletterRuntimeModule') &&
    sdkSource.includes('syncPolicy: {') &&
    sdkSource.includes('schemaVersion: "backy.newsletter-sync-boundary.v1"') &&
    sdkSource.includes('subscribeNewsletter(') &&
    sdkSource.includes('BackyNewsletterFormValuesSubscribeInput') &&
    sdkSource.includes('BackyNewsletterFormValuesUnsubscribeInput') &&
    sdkSource.includes('newsletterSubscribers(') &&
    sdkSource.includes('upsertNewsletterSubscriber(') &&
    generatedSdkTypes.includes('newsletterRuntime?: {') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiNewsletterSubscribeRequest = GeneratedBackyOpenApiNewsletterSubscribeValues | {') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiNewsletterUnsubscribeRequest = GeneratedBackyOpenApiNewsletterUnsubscribeValues | {') &&
    generatedSdkTypes.includes('signup_source?: string') &&
    sdkSource.includes('BackyManifestFormsManagementPolicy') &&
    sdkSource.includes('BackyManifestFormsRuntimeModule') &&
    sdkSmoke.includes('manifest() missing forms runtime discovery module') &&
    sdkSmoke.includes('manifest() forms management missing webhook retry helper') &&
    generatedSdkTypes.includes('"x-backy-forms-management"?: GeneratedBackyOpenApiFormsManagementPolicy') &&
    generatedSdkSmoke.includes('invalidGeneratedManifestFormsRuntimeDiscovery') &&
    generatedSdkSmoke.includes('invalidGeneratedManifestFormsManagement'),
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
    manifestRoute.includes("publicOrderStatusUsesOneTimeReturnedToken: true") &&
    manifestRoute.includes("publicOrderStatusTokenStoredAsHashOnly: true") &&
    manifestRoute.includes("orderQueueNotPrivate: 'ORDER_QUEUE_NOT_PRIVATE'") &&
    manifestRoute.includes("schemaVersion: 'backy.commerce-management.v1'") &&
    manifestRoute.includes("authenticatedManagement: true") &&
    manifestRoute.includes("orderStatusHandoff: 'commerceOrderStatusHandoff'") &&
    manifestRoute.includes("syncProductProvider: 'syncCommerceProductProvider'") &&
    manifestRoute.includes("productStorefrontHandoff: 'backy.product-storefront-handoff.v1'") &&
    manifestRoute.includes("productStorefrontHandoffExcludesPrivateData: true") &&
    manifestRoute.includes("providerSecretsNeverReturned: true") &&
    manifestRoute.includes('commerceRuntime: buildManifestCommerceDiscovery(input.site.id, commerce, productCollection, ordersCollection)') &&
    manifestRoute.includes('commerceRuntime: buildManifestCommerceDiscovery(site.id, commerce, productCollection, ordersCollection)') &&
    frontendManifestSchema.includes('"backy.commerce-discovery.v1"') &&
    frontendManifestSchema.includes('"backy.commerce-management.v1"') &&
    frontendManifestSchema.includes('"authenticatedManagement"') &&
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
    sdkSource.includes('BackyManifestCommerceManagementPolicy') &&
    sdkSource.includes('BackyCommerceOrderAnalyticsProviderCertification') &&
    sdkSource.includes('GeneratedBackyFrontendManifestCommerceProviderCertification') &&
    sdkSource.includes('lineItems?: BackyCommerceLineItemInput[]') &&
    sdkSource.includes('checkoutSession?: string | { id?: string; [key: string]: unknown }') &&
    openApiRoute.includes('"provider_created"') &&
    openApiRoute.includes('commerceManagementDiscovery') &&
    openApiRoute.includes('"x-backy-commerce-management"') &&
    openApiRoute.includes('CommerceManagementPolicy') &&
    openApiRoute.includes('CommerceOrderAnalyticsEnvelope') &&
    openApiRoute.includes('CommerceOrderQuoteEnvelope') &&
    openApiRoute.includes('CommerceOrderTrackingEnvelope') &&
    openApiRoute.includes('CommerceOrderFulfillmentEnvelope') &&
    openApiRoute.includes('CommerceOrderShippingLabelEnvelope') &&
    openApiRoute.includes('CommerceOrderProviderRefundEnvelope') &&
    openApiRoute.includes('CommerceOrderProviderCertificationEvidencePacket') &&
    openApiRoute.includes('CommerceProductProviderSyncEnvelope') &&
    openApiRoute.includes('CommerceProductSubscriptionsEnvelope') &&
    openApiRoute.includes('CommerceProductSubscriptionActionEnvelope') &&
    openApiRoute.includes('includesRawOrderPayloads: { const: false }') &&
    openApiRoute.includes('orderAnalytics: "backy.order-analytics.v1"') &&
    openApiRoute.includes('orderQuote: { const: "backy.order-quote.v1" }') &&
    openApiRoute.includes('orderTracking: { const: "backy.tracking.v1" }') &&
    openApiRoute.includes('orderFulfillment: {') &&
    openApiRoute.includes('orderShippingLabel: {') &&
    openApiRoute.includes('orderProviderRefund: {') &&
    openApiRoute.includes('CommerceOrderStatusHandoff') &&
    openApiRoute.includes('CommerceOrderStatusAccess') &&
    openApiRoute.includes('CommerceOrderStatusHandoffEnvelope') &&
    openApiRoute.includes('public-commerce-order-intake-api') &&
    openApiRoute.includes('post-checkout-status-token') &&
    openApiRoute.includes('tokenHashField: { const: "statusaccesstokenhash" }') &&
    openApiRoute.includes('includesRawCustomerContact: { const: false }') &&
    openApiRoute.includes('adminOrderDetail: { type: "string" }') &&
    openApiRoute.includes('statusHandoff: {') &&
    openApiRoute.includes('$ref: "#/components/schemas/CommerceOrderStatusHandoff"') &&
    openApiRoute.includes('CommerceProductStorefrontHandoff') &&
    openApiRoute.includes('CommerceProductDesignReadiness') &&
    openApiRoute.includes('CommerceProductProviderSync') &&
    openApiRoute.includes('"designReadiness"') &&
    frontendDesignContractLib.includes('normalizeCollectionRecordInputFromDirectFrontendDesignEnvelope') &&
    frontendDesignContractLib.includes('const collectionRecordDesignEnvelope = (') &&
    adminCollectionRecordsRoute.includes('normalizeCollectionRecordInputFromDirectFrontendDesignEnvelope') &&
    adminCollectionRecordDetailRoute.includes('normalizeCollectionRecordInputFromDirectFrontendDesignEnvelope') &&
    adminCollectionRecordDetailRoute.includes('...toRecord(record.values),') &&
    adminCollectionRecordDetailRoute.includes('...submittedValues,') &&
    backyStoreLib.includes('for (const [key, value] of Object.entries(existingValues))') &&
    commerceCatalogLib.includes('const designEnvelope = normalizeDesignRecord(values.design);') &&
    commerceCatalogLib.includes("designValue('customJs', 'frontendDesignCustomJs')") &&
    adminProductsPage.includes("const designEnvelope = optionalRecordFromRecord(values, 'design');") &&
    adminProductsPage.includes("designValue('customJs', 'frontendDesignCustomJs')") &&
    sdkSmoke.includes('product design missing clean design-envelope binding hint') &&
    sdkSmoke.includes('partial design update wiped existing product design content document') &&
    commerceCatalogLib.includes('const buildProductDesignReadiness = (') &&
    commerceCatalogLib.includes('export const productDesignReadinessFromValues = (') &&
    commerceCatalogLib.includes('designReadiness: buildProductDesignReadiness(design)') &&
    routeResolverLib.includes('productDesignReadinessFromValues(record.values)') &&
    repositoryRouteResolverLib.includes('productDesignReadinessFromValues(record.values)') &&
    renderPayloadLib.includes('resource: {') &&
    renderPayloadLib.includes('const designReadiness = collection.slug === PRODUCT_COLLECTION_SLUG') &&
    renderPayloadLib.includes('...(designReadiness ? { designReadiness } : {})') &&
    contentPayloadSchema.includes('"productDesignReadiness"') &&
    contentPayloadSchema.includes('"resource"') &&
    openApiRoute.includes('const: "backy.product-design-readiness.v1"') &&
    openApiRoute.includes('DynamicItemRouteResource') &&
    openApiRoute.includes('$ref: "#/components/schemas/CommerceProductDesignReadiness"') &&
    openApiRoute.includes('frontendDesignContentDocument') &&
    openApiRoute.includes('frontendDesignCustomJs') &&
    openApiRoute.includes('frontendDesignThemeTokenRefs') &&
    openApiRoute.includes('frontendDesignAnimations') &&
    openApiRoute.includes('frontendDesignElements') &&
    openApiRoute.includes('includesProviderSecrets: { const: false }') &&
    openApiRoute.includes('orderStatusHandoff: "backy.order-status-handoff.v1"') &&
    openApiRoute.includes('productStorefrontHandoff: "backy.product-storefront-handoff.v1"') &&
    openApiRoute.includes('productSubscriptions: "backy.product-subscription-lifecycle.v1"') &&
    openApiRoute.includes('productSubscriptionAction: "backy.product-subscription-action.v1"') &&
    openApiRoute.includes('productStorefrontHandoffExcludesPrivateData: true') &&
    openApiRoute.includes('"backy.commerce-management.v1"') &&
    openApiRoute.includes('lineItems: {') &&
    openApiRoute.includes('customerName: { type: "string" }') &&
    publicCommerceOrdersRoute.includes('const buildCheckoutStatusHandoff =') &&
    publicCommerceOrdersRoute.includes('ORDER_STATUS_ACCESS_SCHEMA_VERSION = "backy.order-status-access.v1"') &&
    publicCommerceOrdersRoute.includes('const createOrderStatusAccessToken =') &&
    publicCommerceOrdersRoute.includes('statusaccesstokenhash') &&
    publicCommerceOrdersRoute.includes('verifyOrderStatusAccessToken') &&
    publicCommerceOrdersRoute.includes('publicStatusHandoff') &&
    publicCommerceOrdersRoute.includes('source: "public-commerce-order-intake-api"') &&
    publicCommerceOrdersRoute.includes('statusHandoff,') &&
    publicCommerceOrdersRoute.includes('statusAccess,') &&
    publicCommerceOrdersRoute.includes('includesRawCustomerContact: false') &&
    publicCommerceOrdersRoute.includes('includesPaymentReferences: false') &&
    publicCommerceOrdersRoute.includes('includesDigitalDeliveryUrls: false') &&
    publicCommerceOrdersRoute.includes('customerProfileSlug: ""') &&
    publicCommerceOrdersRoute.includes('"post-checkout-response"') &&
    publicCommerceOrdersRoute.includes('"post-checkout-status-token"') &&
    publicCommerceOrdersRoute.includes('safeBindingPaths') &&
    sdkSmoke.includes('manifest() missing commerce runtime discovery module') &&
    sdkSmoke.includes('manifest() commerce runtime missing lineItems order alias') &&
    sdkSmoke.includes('manifest() commerce management missing product provider sync helper') &&
    sdkSmoke.includes('manifest() commerce management missing order analytics contract') &&
    sdkSmoke.includes('manifest() commerce management missing order shipping label contract') &&
    sdkSmoke.includes('manifest() commerce management missing product subscription lifecycle contract') &&
    sdkSmoke.includes('manifest() commerce management missing product subscription action contract') &&
    sdkSmoke.includes('openapi() missing product provider sync envelope schema') &&
    sdkSmoke.includes('openapi() missing product subscription lifecycle envelope schema') &&
    sdkSmoke.includes('openapi() missing product subscription action envelope schema') &&
    sdkSmoke.includes('openapi() commerce management missing order analytics contract metadata') &&
    sdkSmoke.includes('openapi() commerce management missing order provider refund contract metadata') &&
    sdkSmoke.includes('openapi() missing order shipping label envelope schema') &&
    sdkSmoke.includes('openapi() commerce management missing order status handoff contract metadata') &&
    sdkSmoke.includes('openapi() missing order status handoff admin order detail endpoint') &&
    sdkSmoke.includes('openapi() checkout order response missing customer-safe status handoff schema') &&
    sdkSmoke.includes('openapi() missing public order status access token schema') &&
    sdkSmoke.includes('openapi() missing tokenized public order status auth mode') &&
    sdkSmoke.includes('openapi() missing order analytics evidence redaction boundary') &&
    sdkSmoke.includes('manifest() commerce management missing product storefront handoff contract') &&
    sdkSmoke.includes('openapi() commerce management missing product storefront handoff contract metadata') &&
    sdkSmoke.includes('openapi() missing product frontend design content document schema') &&
    sdkSmoke.includes('openapi() missing product frontend design animations schema') &&
    sdkSmoke.includes('openapi() missing product frontend design readiness schema') &&
    sdkSmoke.includes('openapi() missing public product design readiness schema') &&
    sdkSmoke.includes('openapi() missing dynamic product route design readiness schema') &&
    sdkSmoke.includes('commerceCatalog() product design missing readiness schema') &&
    sdkSmoke.includes('resolve() product dynamic route missing design readiness schema') &&
    sdkSmoke.includes('render() product dynamic route missing design readiness schema') &&
    sdkSmoke.includes('commerceProductProviderSync() storefront handoff missing design readiness schema') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiCommerceManagementPolicy') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiCommerceOrderAnalyticsEnvelope') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiCommerceOrderQuoteEnvelope') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiCommerceOrderTrackingEnvelope') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiCommerceOrderFulfillmentEnvelope') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiCommerceOrderShippingLabelEnvelope') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiCommerceOrderProviderRefundEnvelope') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiCommerceOrderProviderCertificationEvidencePacket') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiCommerceOrderStatusHandoff') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiCommerceOrderStatusAccess') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiCommerceOrderStatusHandoffEnvelope') &&
    generatedSdkTypes.includes('statusHandoff: GeneratedBackyOpenApiCommerceOrderStatusHandoff') &&
    generatedSdkTypes.includes('statusAccess: GeneratedBackyOpenApiCommerceOrderStatusAccess') &&
    generatedSdkTypes.includes('"public-commerce-order-intake-api"') &&
    generatedSdkTypes.includes('"post-checkout-status-token"') &&
    sdkSource.includes('statusHandoff: BackyCommerceOrderStatusHandoff') &&
    sdkSource.includes('statusAccess: BackyCommerceOrderStatusAccess') &&
    sdkSource.includes('commerceOrderPublicStatusHandoff(') &&
    generatedSdkTypes.includes('adminOrderDetail: string') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiCommerceProductProviderSyncEnvelope') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiCommerceProductSubscriptionsEnvelope') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiCommerceProductSubscriptionActionEnvelope') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiCommerceProductStorefrontHandoff') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiCommerceProductDesignReadiness') &&
    generatedSdkTypes.includes('designReadiness?: GeneratedBackyOpenApiCommerceProductDesignReadiness') &&
    generatedSdkTypes.includes('designReadiness?: GeneratedBackyPublicRenderPayloadProductDesignReadiness') &&
    generatedSdkTypes.includes('frontendDesignContentDocument?: Record<string, unknown>') &&
    generatedSdkTypes.includes('frontendDesignAnimations?: Array<Record<string, unknown>> | Record<string, unknown>') &&
    generatedSdkTypes.includes('frontendDesignCustomJs?: string') &&
    generatedSdkTypes.includes('"x-backy-commerce-management"?: GeneratedBackyOpenApiCommerceManagementPolicy') &&
    generatedSdkSmoke.includes('invalidGeneratedManifestCommerceProviderCertification') &&
    generatedSdkSmoke.includes('invalidGeneratedManifestCommerceManagement') &&
    generatedSdkSmoke.includes('invalidGeneratedManifestCommerceRuntimeDiscovery'),
  'Frontend manifest and SDK must expose structured commerce runtime discovery for custom frontend product catalog and checkout UIs.',
);

assert(
  publicCommerceCatalogRoute.includes("COMMERCE_CATALOG_SCHEMA_VERSION = 'backy.commerce-catalog.v1'") &&
    publicCommerceCatalogRoute.includes('repositories.cacheInvalidations.latestRevision') &&
    publicCommerceCatalogRoute.includes("scope: 'content'") &&
    publicCommerceCatalogRoute.includes('cacheRevision,') &&
    publicCommerceCatalogRoute.includes('schemaVersion: COMMERCE_CATALOG_SCHEMA_VERSION') &&
    publicCommerceOrdersRoute.includes('ORDER_CONTRACT_VERSION = "backy.commerce-orders.v1"') &&
    publicCommerceOrdersRoute.includes('repositories.cacheInvalidations.latestRevision') &&
    publicCommerceOrdersRoute.includes('scope: "content"') &&
    publicCommerceOrdersRoute.includes('cacheRevision,') &&
    publicCommerceOrdersRoute.includes('schemaVersion: ORDER_CONTRACT_VERSION') &&
    publicCommerceOrdersRoute.includes('schemaVersion: ORDER_STATUS_HANDOFF_SCHEMA_VERSION') &&
    publicCommerceOrdersRoute.includes('cache: "private"'),
  'Public commerce catalog and order discovery must expose schema and cache-revision headers while tokenized order-status handoff stays private.',
);

assert(
  openApiRoute.includes('"/api/admin/settings"') &&
    openApiRoute.includes('getBackyAdminSettings') &&
    openApiRoute.includes('updateBackyAdminSettings') &&
    openApiRoute.includes('runBackyAdminSettingsAction') &&
    openApiRoute.includes('AdminSettingsEnvelope') &&
    openApiRoute.includes('AdminSettingsProviderCertification') &&
    openApiRoute.includes('AdminSettingsProviderCertificationEvidencePacket') &&
    openApiRoute.includes('AdminSettingsActionRequest') &&
    openApiRoute.includes('media-storage-secret-manager') &&
    openApiRoute.includes('test-notification-webhook') &&
    sdkSource.includes('GeneratedBackyOpenApiAdminSettings') &&
    sdkSource.includes('GeneratedBackyOpenApiAdminSettingsUpdateRequest') &&
    sdkSource.includes('GeneratedBackyOpenApiAdminSettingsActionRequest') &&
    sdkSource.includes('BackyAdminSettingsActionInput') &&
    sdkSource.includes('adminSettings(') &&
    sdkSource.includes('updateAdminSettings(') &&
    sdkSmoke.includes('openapi() missing global admin settings read path') &&
    sdkSmoke.includes('openapi() missing global admin settings provider certification handoff') &&
    sdkSmoke.includes('openapi() missing settings secret-manager action schema') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiAdminSettingsEnvelope') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiAdminSettingsProviderCertification') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiAdminSettingsProviderCertificationEvidencePacket') &&
    generatedSdkTypes.includes('settingsAdminApi: "/api/admin/settings?certificationSiteId={siteId}"') &&
    generatedSdkTypes.includes('siteScopedSettingsApi: "/api/admin/sites/{siteId}/settings"') &&
    generatedSdkTypes.includes('settingsSiteSelectorEnv: "BACKY_SETTINGS_CERTIFY_SITE_ID"') &&
    generatedSdkTypes.includes('commerceSiteSelectorEnv: "BACKY_COMMERCE_CERTIFY_SITE_ID"') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiAdminSettingsActionRequest') &&
    generatedSdkSmoke.includes('GeneratedBackyOpenApiAdminSettingsEnvelope') &&
    generatedSdkSmoke.includes('GeneratedBackyOpenApiAdminSettingsProviderCertification'),
  'Global Settings admin API must be discoverable and typed from the site OpenAPI document for custom admin clients.',
);

assert(
  openApiRoute.includes('getBackyAdminSiteSettings') &&
    openApiRoute.includes('updateBackyAdminSiteSettings') &&
    openApiRoute.includes('AdminSiteSettingsEnvelope') &&
    openApiRoute.includes('AdminSiteSettingsScope') &&
    openApiRoute.includes('AdminSiteSettingsPatchRequest') &&
    openApiRoute.includes('FrontendDatabaseCertificationHandoff') &&
    openApiRoute.includes('"backy.site-settings-scope.v1"') &&
    openApiRoute.includes('sites.configure') &&
    sdkSource.includes('BackySiteSettingsScope') &&
    sdkSource.includes('GeneratedBackyOpenApiAdminSiteSettingsScope') &&
    sdkSource.includes('GeneratedBackyOpenApiAdminSiteSettingsPatchRequest') &&
    sdkSource.includes('adminSiteSettings(') &&
    sdkSource.includes('updateAdminSiteSettings(') &&
    sdkSmoke.includes('openapi() missing admin site settings read path') &&
    sdkSmoke.includes('openapi() missing admin site settings envelope schema') &&
    sdkSmoke.includes('openapi() missing site settings database certification handoff') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiAdminSiteSettingsEnvelope') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiAdminSiteSettingsScope') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiAdminSiteSettingsPatchRequest') &&
    generatedSdkTypes.includes('GeneratedBackyOpenApiFrontendDatabaseCertificationHandoff') &&
    generatedSdkSmoke.includes('GeneratedBackyOpenApiAdminSiteSettingsEnvelope'),
  'Site-scoped Settings APIs must be discoverable and typed for custom admin clients.',
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
    templateRegistrySmoke.includes('buildFrontendDesignContractFromContentTemplate') &&
    templateRegistrySmoke.includes('seedInputFromFrontendDesignTemplate') &&
    templateRegistrySmoke.includes('captured-roundtrip-template') &&
    templateRegistrySmoke.includes('captured-roundtrip-blog-template') &&
    templateRegistrySmoke.includes('Seeded page content should retain animation timeline arrays') &&
    templateRegistrySmoke.includes('Merged page content should retain captured interaction arrays') &&
    templateRegistrySmoke.includes('Seeded blog content should retain animation arrays') &&
    templateRegistrySmoke.includes('Merged blog content should retain captured interaction arrays') &&
    templateRegistrySmoke.includes('captured-roundtrip-section-template') &&
    templateRegistrySmoke.includes('Merged section content should retain captured animation arrays') &&
    templateRegistrySmoke.includes('captured-roundtrip-product-template') &&
    templateRegistrySmoke.includes('Seeded product values should retain frontendDesignAnimations') &&
    templateRegistrySmoke.includes('captured-roundtrip-form-template') &&
    templateRegistrySmoke.includes('Seeded form settings should retain frontendDesignAnimations') &&
    templateRegistrySmoke.includes('captured-roundtrip-collection-template') &&
    templateRegistrySmoke.includes('Seeded collection metadata should retain frontendDesignAnimations') &&
    templateRegistrySmoke.includes('Seeded collection record values should retain frontendDesignAnimations') &&
    templateRegistrySmoke.includes('frontendDesignProvenanceFromMetadata(seededFormSettings)') &&
    templateRegistrySmoke.includes('frontendDesignProvenanceFromMetadata(seededCollectionMetadata)') &&
    templateRegistrySmoke.includes('frontendDesignProvenanceFromMetadata(seededCollectionRecordValues)') &&
    templateRegistrySmoke.includes('productRecordToCommerceProduct') &&
    templateRegistrySmoke.includes('assert(productDesign, "Seeded public product should expose design metadata")') &&
    templateRegistrySmoke.includes('productDesign.templateId') &&
    templateRegistrySmoke.includes('Seeded public product design should expose array animations') &&
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
  adminCollectionsPage.includes('customJS?: string;') &&
    adminCollectionsPage.includes('themeTokenRefs?: Record<string, string>;') &&
    adminCollectionsPage.includes('animations?: unknown[] | Record<string, unknown>;') &&
    adminCollectionsPage.includes('contentDocument?: Record<string, unknown>;') &&
    adminCollectionsPage.includes('authoredDynamicTemplateDesignStateSummary') &&
    renderPayloadLib.includes('includeContentDocument: true') &&
    renderPayloadLib.includes('customJS: content.customJS') &&
    renderPayloadLib.includes('themeTokenRefs: content.themeTokenRefs') &&
    renderPayloadLib.includes('animations: content.animations') &&
    renderPayloadLib.includes('const editableMap = buildEditableMap(elements, content.editableMap);') &&
    renderPayloadLib.includes('editableMap,') &&
    renderPayloadLib.includes('contentDocument: content.contentDocument') &&
    contentPayloadSchema.includes('"customJS": { "type": "string" }') &&
    contentPayloadSchema.includes('"contentDocument": {\n              "$ref": "#/$defs/contentDocument"') &&
    contentPayloadSchema.includes('"contentAssetRef"') &&
    generatedSdkTypes.includes('GeneratedBackyPublicRenderPayloadContentDocument') &&
    generatedSdkTypes.includes('contentDocument?: GeneratedBackyPublicRenderPayloadContentDocument;') &&
    sdkSource.includes('export type BackyRenderContent = BackyContentDocument &'),
	'Collection list/detail authored templates must preserve custom frontend design state through admin capture, public render payloads, JSON schema, and SDK render types.',
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
