#!/usr/bin/env node

import fs from 'node:fs';
import { validateAiFrontendManifest, validateAiRenderPayload } from './validate-ai-render-payload.mjs';

const baseUrl = (process.env.BACKY_PUBLIC_CONTRACT_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const configuredAdminApiKey = (process.env.BACKY_ADMIN_API_KEY || process.env.BACKY_ADMIN_SECRET_KEY || '').trim();
let adminRequestApiKey = configuredAdminApiKey;
let adminSessionToken = '';

const checks = [];
let createdSiteId = null;
let createdPageId = null;
let createdPostId = null;
let createdCategoryId = null;
let createdTagId = null;
let createdUserId = null;
let createdCollectionId = null;
let createdCollectionRecordId = null;
let createdReferenceCollectionId = null;
let createdReferenceRecordId = null;
let createdNestedReferenceCollectionId = null;
let createdNestedReferenceRecordId = null;
let commerceProductsCollectionId = null;
let commerceFutureProductRecordId = null;
let commercePastProductRecordId = null;
let createdMediaId = null;
let createdImageMediaId = null;
let createdMediaFolderId = null;
let createdReusableSectionId = null;
let createdReusableInstancePageId = null;
let createdSafeguardUserId = null;
let originalUserAdminRole = null;
let originalUserAdminStatus = null;
let contractOwnerUserId = null;
let contractOwnerSessionToken = '';
let capturedTemplatePageId = null;
let capturedTemplatePostId = null;
let routeConflictCleanupPageId = null;
let originalDeliveryMode = null;
let originalSettingsIntegrations = null;
let createdInteractiveComponentKey = null;
let createdInteractiveComponentVersion = null;
let createdInteractiveNewerVersion = null;
let adminContractEmailDomain = '';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseAllowedEmailDomains(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim().toLowerCase().replace(/^@+/, '').replace(/\.+$/, ''))
      .filter(Boolean);
  }

  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(/[\s,;]+/)
    .map((item) => item.trim().toLowerCase().replace(/^@+/, '').replace(/\.+$/, ''))
    .filter(Boolean);
}

function contractEmail(localPart) {
  const domain = adminContractEmailDomain || 'backy.test';
  return `${localPart}@${domain}`;
}

function assertInteractiveSandboxRouteSource() {
  const source = fs.readFileSync(
    new URL('../src/app/api/sites/[siteId]/interactive-components/[componentKey]/[version]/sandbox/route.ts', import.meta.url),
    'utf8',
  );
  assert(source.includes("default-src 'none'"), 'Interactive sandbox route must keep default-src none CSP');
  assert(source.includes("frame-ancestors 'self'"), 'Interactive sandbox route must restrict frame ancestors');
  assert(source.includes("base-uri 'none'"), 'Interactive sandbox route must restrict base URI');
  assert(source.includes("form-action 'none'"), 'Interactive sandbox route must restrict form actions');
  assert(source.includes("'X-Content-Type-Options': 'nosniff'"), 'Interactive sandbox route must set nosniff');
  assert(source.includes("'Referrer-Policy': 'no-referrer'"), 'Interactive sandbox route must set no-referrer');
  assert(source.includes("SANDBOX_SCHEMA_VERSION = 'backy.interactive-component-sandbox.v1'"), 'Interactive sandbox route must define a stable schema version');
  assert(source.includes('publicContractResponse('), 'Interactive sandbox route must use the public contract response wrapper');
  assert(source.includes("cache: 'discovery'"), 'Interactive sandbox route must use discovery cache for active sandbox HTML');
  assert(source.includes("cache: 'error'"), 'Interactive sandbox route must use error cache for hidden/disabled sandbox HTML');
  assert(source.includes('etagSeed'), 'Interactive sandbox route must expose ETag revalidation for active sandbox HTML');
  assert(source.includes('schemaVersion: SANDBOX_SCHEMA_VERSION'), 'Interactive sandbox route must emit sandbox schema headers');
  assert(source.includes('parent.postMessage'), 'Interactive sandbox route must use postMessage lifecycle communication');
  assert(!source.includes('/api/admin/'), 'Interactive sandbox route must not call admin APIs');
  assert(!source.includes('document.cookie'), 'Interactive sandbox route must not read cookies');
  assert(!source.includes('localStorage') && !source.includes('sessionStorage'), 'Interactive sandbox route must not read browser storage');
  assert(!source.includes('window.parent.document') && !source.includes('parent.document'), 'Interactive sandbox route must not touch parent DOM');
  assert(!source.includes('credentials:'), 'Interactive sandbox route must not fetch with credentials');
}

function assertInteractiveContractSource() {
  const registrySource = fs.readFileSync(
    new URL('../src/lib/interactiveComponentRegistry.ts', import.meta.url),
    'utf8',
  );
  const openApiSource = fs.readFileSync(
    new URL('../src/app/api/sites/[siteId]/openapi/route.ts', import.meta.url),
    'utf8',
  );
  const sdkSource = fs.readFileSync(
    new URL('../../../packages/sdk-js/src/index.ts', import.meta.url),
    'utf8',
  );

  assert(registrySource.includes('responseHeaders'), 'Interactive manifest contract must expose sandbox response headers');
  assert(registrySource.includes("schemaVersion: 'backy.interactive-component-sandbox.v1'"), 'Interactive manifest contract must expose sandbox schema response header metadata');
  assert(registrySource.includes("cacheRevisionHeader: 'x-backy-cache-revision'"), 'Interactive manifest contract must expose sandbox cache revision header metadata');
  assert(registrySource.includes("default-src 'none'"), 'Interactive manifest contract must expose sandbox CSP directives');
  assert(registrySource.includes('camera=()') && registrySource.includes('microphone=()'), 'Interactive manifest contract must expose denied browser permissions');
  assert(registrySource.includes("key: 'accentColor'") && registrySource.includes("type: 'color'"), 'Interactive registry must expose sandbox color controls');
  assert(registrySource.includes("key: 'caption'") && registrySource.includes("type: 'textarea'"), 'Interactive registry must expose sandbox textarea controls');
  assert(registrySource.includes("key: 'runtimeConfig'") && registrySource.includes("type: 'json'"), 'Interactive registry must expose sandbox JSON controls');
  assert(openApiSource.includes('sandboxResponseHeaders'), 'OpenAPI must declare sandbox response headers');
  assert(openApiSource.includes('InteractiveComponentControlOption'), 'OpenAPI must declare typed interactive control options');
  assert(openApiSource.includes('"radio"') && openApiSource.includes('"textarea"') && openApiSource.includes('"code"'), 'OpenAPI must declare rich interactive control types');
  assert(openApiSource.includes('"checkbox"') && openApiSource.includes('"toggle"'), 'OpenAPI must declare boolean interactive control aliases');
  assert(openApiSource.includes('"Content-Security-Policy"') || openApiSource.includes("'Content-Security-Policy'"), 'OpenAPI must declare sandbox CSP response header');
  assert(openApiSource.includes('"Permissions-Policy"') || openApiSource.includes("'Permissions-Policy'"), 'OpenAPI must declare sandbox permissions response header');
  assert(openApiSource.includes('"x-backy-schema-version"') && openApiSource.includes('"backy.interactive-component-sandbox.v1"'), 'OpenAPI must declare sandbox Backy schema response header');
  assert(openApiSource.includes('"x-backy-cache-revision"'), 'OpenAPI must declare sandbox cache revision response header');
  assert(openApiSource.includes('"403":') && openApiSource.includes('description: "Component disabled"') && openApiSource.includes('headers: sandboxResponseHeaders'), 'OpenAPI disabled sandbox response must carry header contract');
  assert(openApiSource.includes('"404":') && openApiSource.includes('description: "Site or component not found"') && openApiSource.includes('headers: sandboxResponseHeaders'), 'OpenAPI missing sandbox response must carry header contract');
  assert(sdkSource.includes('responseHeaders: {'), 'SDK manifest type must require sandbox response headers');
  assert(sdkSource.includes('contentSecurityPolicy: string[]'), 'SDK manifest type must expose sandbox CSP directives');
  assert(sdkSource.includes('permissionsPolicy: string[]'), 'SDK manifest type must expose sandbox permissions policy directives');
  assert(sdkSource.includes('schemaVersion: "backy.interactive-component-sandbox.v1"'), 'SDK manifest type must expose sandbox schema response header metadata');
  assert(sdkSource.includes('cacheRevisionHeader: "x-backy-cache-revision"'), 'SDK manifest type must expose sandbox cache revision response header metadata');
  assert(sdkSource.includes('export type BackyInteractiveControlType') && sdkSource.includes('export type BackyInteractiveControlOption'), 'SDK must expose typed interactive control helper shapes');
}

function assertHostedFeedErrorContractSource() {
  const hostedFeedRoutes = [
    ['hosted sitemap route', '../src/app/sites/[subdomain]/sitemap.xml/route.ts'],
    ['hosted robots route', '../src/app/sites/[subdomain]/robots.txt/route.ts'],
    ['hosted RSS route', '../src/app/sites/[subdomain]/blog/rss.xml/route.ts'],
  ];

  for (const [label, routePath] of hostedFeedRoutes) {
    const source = fs.readFileSync(new URL(routePath, import.meta.url), 'utf8');
    assert(source.includes("publicContractResponse('Not found'"), `${label} must return contract-wrapped 404 text`);
    assert(source.includes("cache: 'error'"), `${label} 404 must use the public error cache scope`);
    assert(!source.includes("new NextResponse('Not found'"), `${label} must not return bare 404 text`);
  }

  const hostedRssSource = fs.readFileSync(
    new URL('../src/app/sites/[subdomain]/blog/rss.xml/route.ts', import.meta.url),
    'utf8',
  );
  assert(hostedRssSource.includes('getRequiredDatabaseRepositories'), 'hosted RSS route must use repository runtime in database mode');
  assert(hostedRssSource.includes('normalizeRepositoryPostForRss'), 'hosted RSS route must normalize database posts for RSS output');
  assert(hostedRssSource.includes("scope: 'content'"), 'hosted RSS route must emit content-scope cache revisions in database mode');
  assert(hostedRssSource.includes('Math.min(100'), 'hosted RSS route must cap caller-provided feed limits');
}

function assertSiteSettingsLocalizationSource() {
  const source = fs.readFileSync(
    new URL('../src/app/api/admin/sites/[siteId]/settings/route.ts', import.meta.url),
    'utf8',
  );
  const apiContracts = fs.readFileSync(
    new URL('../../../specs/backy-api-contracts.md', import.meta.url),
    'utf8',
  );
  const includesQuotedLiteral = (literal) => (
    source.includes(`'${literal}'`) || source.includes(`"${literal}"`)
  );
  assert(includesQuotedLiteral('localization'), 'Site settings route must allowlist localization patches');
  assert(source.includes('normalizeSiteLocalization'), 'Site settings route must normalize localization patches');
  assert(source.includes('SITE_SETTINGS_SCOPE_SCHEMA'), 'Site settings route must return the scoped settings schema');
  assert(
    source.includes("permission: 'sites.view'") || source.includes('permission: "sites.view"'),
    'Site settings read route must require sites.view',
  );
  assert(
    source.includes("permission: 'sites.configure'") || source.includes('permission: "sites.configure"'),
    'Site settings update route must require sites.configure',
  );
  assert(source.includes('filteredSiteSettingsPatch'), 'Site settings route must filter patches through the site settings allowlist');
  assert(source.includes('unsupportedSiteSettingsKeys'), 'Site settings route must detect mixed workspace/site settings payloads');
  assert(source.includes('NO_SITE_SETTINGS_CHANGES'), 'Site settings route must reject unsupported-only patches with a stable error code');
  assert(source.includes('UNSUPPORTED_SITE_SETTINGS_KEYS'), 'Site settings route must reject mixed unsupported site settings payloads with a stable error code');
  assert(source.includes('site.settings.updated'), 'Site settings updates must emit a stable audit action');
  assert(source.includes('frontendDatabaseCertification: frontendDatabaseCertificationContract('), 'Site settings envelope must include frontend database certification metadata');
  assert(source.includes('source: "admin-site-settings-api"'), 'Site settings frontend database certification must identify the site Settings API source');
  assert(source.includes('backy.frontend-database-certification.v1'), 'Site settings frontend database certification must expose a stable handoff schema');
  assert(source.includes('backy.frontend-database-certification-evidence.v1'), 'Site settings frontend database certification must expose scenario evidence');
  assert(source.includes('npm run ci:sdk-postgres-smoke'), 'Site settings frontend database certification must expose the SDK Postgres gate');
  assert(source.includes('BACKY_DATABASE_DISPOSABLE_CONFIRMED'), 'Site settings frontend database certification must expose disposable database guard envs');
  assert(
    source.includes("workspaceSettingsScope: 'global'") || source.includes('workspaceSettingsScope: "global"'),
    'Site settings envelope must separate workspace settings scope',
  );
  assert(
    source.includes("siteSettingsScope: 'site'") || source.includes('siteSettingsScope: "site"'),
    'Site settings envelope must separate site settings scope',
  );
  assert(apiContracts.includes('UNSUPPORTED_SITE_SETTINGS_KEYS'), 'API contracts must document mixed site/workspace settings rejection');
  assert(apiContracts.includes('`localization`'), 'API contracts must document localization as a site-scoped settings section');
  assert(apiContracts.includes('admin-site-settings-api'), 'API contracts must document the site Settings frontend database certification source');
}

function assertNavigationContractSource() {
  const adminNavigationRoute = fs.readFileSync(
    new URL('../src/app/api/admin/sites/[siteId]/navigation/route.ts', import.meta.url),
    'utf8',
  );
  const publicNavigationRoute = fs.readFileSync(
    new URL('../src/app/api/sites/[siteId]/navigation/route.ts', import.meta.url),
    'utf8',
  );
  const navigationLib = fs.readFileSync(
    new URL('../src/lib/navigation.ts', import.meta.url),
    'utf8',
  );
  const apiContracts = fs.readFileSync(
    new URL('../../../specs/backy-api-contracts.md', import.meta.url),
    'utf8',
  );

  assert(adminNavigationRoute.includes('PATCH /api/admin/sites/[siteId]/navigation'), 'Admin navigation route must expose editable menu updates');
  assert(adminNavigationRoute.includes('permission: "sites.configure"'), 'Admin navigation updates must require sites.configure');
  assert(adminNavigationRoute.includes('normalizeNavigationConfig'), 'Admin navigation route must normalize submitted menus');
  assert(adminNavigationRoute.includes('missingPageIds') && adminNavigationRoute.includes('incompletePageItems'), 'Admin navigation route must validate nested page references');
  assert(adminNavigationRoute.includes('site.navigation.updated'), 'Admin navigation route must audit navigation updates');
  assert(adminNavigationRoute.includes('deliverSiteWebhooks'), 'Admin navigation route must dispatch site webhooks');
  assert(adminNavigationRoute.includes('recordSiteCacheInvalidation'), 'Admin navigation route must invalidate public navigation caches');
  assert(publicNavigationRoute.includes('buildSiteNavigation'), 'Public navigation route must resolve configured site navigation');
  assert(publicNavigationRoute.includes("cache: 'discovery'"), 'Public navigation route must use discovery cache contract headers');
  assert(navigationLib.includes("type: 'page' | 'route' | 'url'"), 'Navigation contract must support page, route, and URL items');
  assert(navigationLib.includes('configuredPrimary.length > 0 ? configuredPrimary : fallbackNavigationFromPages'), 'Public navigation must use configured menus before page fallback');
  assert(navigationLib.includes('footer: configuredFooter') && navigationLib.includes('layout: normalizeNavigationLayout'), 'Public navigation must expose footer and layout metadata');
  assert(apiContracts.includes('navigation: { primary, footer, layout }'), 'API contracts must document primary/footer/layout navigation output');
  assert(apiContracts.includes('PATCH /api/admin/sites/:siteId/navigation'), 'API contracts must document editable admin navigation API');
  assert(!apiContracts.includes('Production completion still needs editable menus'), 'API contracts must not contain stale editable-navigation gap text');
}

function assertAdminSettingsContractSource() {
  const source = fs.readFileSync(
    new URL('../src/app/api/admin/settings/route.ts', import.meta.url),
    'utf8',
  );
  const proxySource = fs.readFileSync(
    new URL('../src/proxy.ts', import.meta.url),
    'utf8',
  );
  const adminAccessSource = fs.readFileSync(
    new URL('../src/lib/adminAccess.ts', import.meta.url),
    'utf8',
  );
  const apiContracts = fs.readFileSync(
    new URL('../../../specs/backy-api-contracts.md', import.meta.url),
    'utf8',
  );
  assert(source.includes('runtimeDatabase: getDatabaseRuntimeSummary()'), 'Admin settings response must include database runtime diagnostics');
  assert(source.includes('runtimeSupabase: getSupabaseRuntimeSummary()'), 'Admin settings response must include Supabase runtime diagnostics');
  assert(source.includes('runtimeVercel: getVercelRuntimeSummary()'), 'Admin settings response must include Vercel runtime diagnostics');
  assert(source.includes('const runtimeCommerce = getCommerceRuntimeSummary(settings)') && source.includes('runtimeCommerce,'), 'Admin settings response must include commerce runtime diagnostics');
  assert(source.includes('const runtimeInteractiveComponents = getInteractiveComponentRuntimeSummary()') && source.includes('runtimeInteractiveComponents,'), 'Admin settings response must include interactive runtime diagnostics');
  assert(
    source.includes('providerCertification: providerCertificationContract(') &&
      source.includes('providerCertificationSiteId') &&
      source.includes("request.nextUrl.searchParams.get('certificationSiteId')"),
    'Admin settings response must include site-targeted provider certification metadata',
  );
  assert(source.includes('completionStatus: buildSettingsCompletionStatus()'), 'Admin settings response must include Backy completion status metadata');
  assert(source.includes('backy.completion-status.v1'), 'Admin settings completion status must expose a stable handoff schema');
  assert(source.includes('settings-admin-apis'), 'Admin settings completion status must list Settings admin APIs as a tracked Partial surface');
  assert(source.includes('themeDesignImpact: themeDesignImpactContract(settings)'), 'Admin settings response must include theme design impact metadata');
  assert(source.includes('backy.settings-theme-design-impact.v1'), 'Admin settings theme design impact must expose a stable handoff schema');
  assert(source.includes('content.themeTokenRefs') && source.includes('element.animation.tokenRefs.duration'), 'Admin settings theme design impact must expose token and animation binding paths');
  assert(source.includes('frontendDatabaseCertification: frontendDatabaseCertificationContract('), 'Admin settings response must include frontend database certification metadata');
  assert(source.includes("source: 'admin-settings-api'"), 'Admin settings frontend database certification must identify the API source');
  assert(source.includes('backy.frontend-database-certification.v1'), 'Admin settings frontend database certification must expose a stable handoff schema');
  assert(source.includes('buildFrontendDatabaseCertificationScenarioEvidence'), 'Admin settings frontend database certification must build scenario evidence for custom admin clients');
  assert(source.includes('backy.frontend-database-certification-evidence.v1'), 'Admin settings frontend database certification must expose a stable scenario-evidence schema');
  assert(source.includes('backy.frontend-database-certification-env-template.v1'), 'Admin settings frontend database certification must expose a stable env-template schema');
  assert(source.includes('.env.backy-frontend-database-certification'), 'Admin settings frontend database certification must expose the frontend database env-template filename');
  assert(source.includes('BACKY_SDK_REQUIRE_DATABASE') && source.includes('BACKY_DATABASE_DISPOSABLE_CONFIRMED'), 'Admin settings frontend database certification must expose SDK database guard envs');
  assert(source.includes('npm run ci:sdk-postgres-smoke'), 'Admin settings frontend database certification must expose the SDK Postgres gate');
  assert(source.includes('npm run test:sdk-postgres-disposable-guard'), 'Admin settings frontend database certification must expose the disposable database guard');
  assert(source.includes('backy.settings-provider-certification-handoff.v1'), 'Admin settings provider certification must expose a stable handoff schema');
  assert(source.includes('buildProviderCertificationScenarioEvidence'), 'Admin settings provider certification must build scenario evidence for custom admin clients');
  assert(source.includes('backy.settings-provider-certification-evidence.v1'), 'Admin settings provider certification must expose a stable scenario-evidence schema');
  assert(source.includes('scenarioEvidence'), 'Admin settings provider certification must return scenario evidence');
  assert(source.includes('buildProviderCertificationEvidencePacket'), 'Admin settings provider certification must build an operator evidence packet for custom admin clients');
  assert(source.includes('operatorEvidencePacket'), 'Admin settings provider certification must return an operator evidence packet');
  assert(source.includes('settingsAdminApi'), 'Admin settings provider certification packet must expose the global admin Settings API target');
  assert(source.includes('siteScopedSettingsApi'), 'Admin settings provider certification packet must expose the site-scoped Settings API target');
  assert(source.includes('backy.settings-provider-certification-evidence-packet.v1'), 'Admin settings provider certification must expose a stable operator evidence-packet schema');
  assert(source.includes('targetInputs: SETTINGS_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE.targetInputs'), 'Admin settings provider certification evidence packet must expose external target inputs');
  assert(source.includes('redactionPolicy'), 'Admin settings provider certification evidence packet must expose redaction policy');
  assert(source.includes('captureSource'), 'Admin settings provider certification evidence packet must expose capture sources');
  assert(source.includes('expectedArtifacts'), 'Admin settings provider certification evidence packet must expose expected artifacts');
  assert(source.includes('evidenceArtifacts'), 'Admin settings completion runbooks must expose structured evidence artifacts');
  assert(source.includes('BACKY_SETTINGS_CERTIFICATION_OUTPUT'), 'Admin settings completion runbooks must expose Settings artifact producer env');
  assert(source.includes('BACKY_COMMERCE_CERTIFICATION_OUTPUT'), 'Admin settings completion runbooks must expose Commerce artifact producer env');
  assert(source.includes('external-live-provider-gate'), 'Admin settings provider certification must expose external live-provider status');
  assert(source.includes('npm run ci:settings-provider-certification'), 'Admin settings provider certification must expose the Settings provider gate');
  assert(source.includes('npm run ci:commerce-provider-certification'), 'Admin settings provider certification must expose the Commerce provider gate');
  assert(source.includes('operatorEnvTemplate'), 'Admin settings provider certification must expose an operator env-template handoff');
  assert(source.includes('buildSettingsProviderCertificationEnvTemplate'), 'Admin settings provider certification must build a copyable env-template handoff');
  assert(source.includes('backy.settings-provider-certification-env-template.v1'), 'Admin settings provider certification must expose a stable env-template schema');
  assert(source.includes('.env.backy-settings-provider-certification'), 'Admin settings provider certification must expose the Settings provider env-template filename');
  for (const providerLabel of [
    'Supabase/Postgres',
    'BACKY_DATABASE_URL or DATABASE_URL',
    'BACKY_SUPABASE_URL or SUPABASE_URL',
    'BACKY_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY',
    'BACKY_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY',
    'BACKY_STORAGE_PROVIDER or BACKY_MEDIA_STORAGE_PROVIDER',
    'BACKY_SUPABASE_STORAGE_BUCKET or BACKY_STORAGE_BUCKET',
    'BACKY_S3_ACCESS_KEY_ID or AWS_ACCESS_KEY_ID',
    'BACKY_S3_SECRET_ACCESS_KEY or AWS_SECRET_ACCESS_KEY',
    'BACKY_S3_REGION or AWS_REGION',
    'BACKY_MEDIA_SCAN_PROVIDER',
    'Vercel env secret manager',
    'VERCEL_TOKEN or BACKY_VERCEL_TOKEN',
    'VERCEL_PROJECT_ID or BACKY_VERCEL_PROJECT_ID',
    'VERCEL_TEAM_ID or BACKY_VERCEL_TEAM_ID',
    'VERCEL_API_BASE_URL or BACKY_VERCEL_API_BASE_URL',
    'BACKY_EMAIL_DELIVERY_ENDPOINT or BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL',
    'BACKY_RESEND_API_KEY or RESEND_API_KEY',
    'BACKY_SMTP_HOST or SMTP_HOST',
    'BACKY_SMTP_USER or SMTP_USER',
    'BACKY_SMTP_PASSWORD or SMTP_PASSWORD',
    'BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY',
    'BACKY_TAXJAR_API_KEY or TAXJAR_API_KEY',
    'BACKY_EASYPOST_API_KEY or EASYPOST_API_KEY',
    'BACKY_SHIPPO_API_KEY or SHIPPO_API_KEY',
    'BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET',
    'BACKY_AVALARA_ACCOUNT_ID/AVALARA_ACCOUNT_ID plus license and company code',
    'provider-specific catalog/payment credentials',
    'Magento',
  ]) {
    assert(source.includes(providerLabel), `Admin settings provider certification must name ${providerLabel}`);
  }
  assert(source.includes('validateSecretReferencePolicy(integrations)'), 'Admin settings route must enforce secret-reference validation');
  assert(source.includes('SECRET_REFERENCE_REQUIRED'), 'Admin settings route must reject raw secret-like values with a stable error code');
  assert(source.includes('validateCommerceProviderEndpoints(integrations)'), 'Admin settings route must validate provider endpoint URLs');
  assert(source.includes('subscriptionActionProvider'), 'Admin settings route must validate subscription lifecycle provider configuration');
  assert(source.includes('catalogSyncProvider'), 'Admin settings route must validate catalog sync provider configuration');
  assert(source.includes('validateInfrastructureProviderSettings(integrations)'), 'Admin settings route must validate infrastructure provider settings');
  assert(source.includes('validateAuthPolicySettings'), 'Admin settings route must validate auth policy bounds');
  assert(source.includes('sanitizeSettingsAuditSnapshot'), 'Admin settings route must audit settings changes through redacted snapshots');
  assert(source.includes("ADMIN_SETTINGS_SCHEMA = 'backy.admin-settings.v1'"), 'Admin settings payload must advertise a stable schema version');
  assert(source.includes("workspaceSettingsScope: 'global'"), 'Admin settings payload must identify the global workspace settings scope');
  assert(source.includes("siteSettingsEndpointTemplate: '/api/admin/sites/:siteId/settings'"), 'Admin settings payload must point site-owned settings to the site-scoped endpoint');
  assert(proxySource.includes("BACKY_ADMIN_SETTINGS_SCHEMA_VERSION = 'backy.admin-settings.v1'"), 'Admin settings responses must advertise a stable schema version');
  assert(proxySource.includes('isAdminSettingsRequest'), 'Admin proxy must detect workspace Settings API requests');
  assert(proxySource.includes('schemaVersion?: string'), 'Admin proxy auth errors must accept route schema metadata');
  assert(proxySource.includes('response.headers.set(\'x-backy-schema-version\', schemaVersion)'), 'Admin proxy auth errors must emit route schema metadata');
  assert(source.includes("body.action === 'issue-admin-api-key'"), 'Admin settings route must expose named service key issuance');
  assert(source.includes("body.action === 'revoke-admin-api-key'"), 'Admin settings route must expose named service key revocation');
  assert(source.includes('sanitizeServiceKeyGrant'), 'Admin settings responses must sanitize service key grants');
  assert(source.includes('keyHash: _keyHash'), 'Admin settings responses must strip service key hashes');
  assert(source.includes('settings.api_keys.issue'), 'Admin settings route must audit service key issuance');
  assert(source.includes('settings.api_keys.revoke'), 'Admin settings route must audit service key revocation');
  assert(adminAccessSource.includes('findActiveServiceAdminKey'), 'Admin access must authenticate stored service keys by hash');
  assert(adminAccessSource.includes('touchLastUsed'), 'Admin access must update service key last-used metadata');
  assert(adminAccessSource.includes('Owner-only permissions require an owner admin session'), 'Admin service keys must not satisfy owner-only permissions');
  assert(apiContracts.includes('"issue-admin-api-key"'), 'API contracts must document service key issuance');
  assert(apiContracts.includes('"revoke-admin-api-key"'), 'API contracts must document service key revocation');
  assert(apiContracts.includes('settings.api_keys.issue'), 'API contracts must document service key issue audit events');
  assert(apiContracts.includes('settings.api_keys.revoke'), 'API contracts must document service key revoke audit events');
  assert(apiContracts.includes('data.settings.providerCertification'), 'API contracts must document admin Settings provider certification handoff');
  assert(apiContracts.includes('data.settings.completionStatus'), 'API contracts must document admin Settings completion status handoff');
  assert(apiContracts.includes('data.settings.themeDesignImpact'), 'API contracts must document admin Settings theme design impact handoff');
  assert(apiContracts.includes('data.settings.frontendDatabaseCertification'), 'API contracts must document admin Settings frontend database certification handoff');
  assert(apiContracts.includes('backy.settings-theme-design-impact.v1'), 'API contracts must document Settings theme design impact schema');
  assert(apiContracts.includes('backy.settings-provider-certification-handoff.v1'), 'API contracts must document Settings provider certification schema');
  assert(apiContracts.includes('backy.frontend-database-certification.v1'), 'API contracts must document Settings frontend database certification schema');
  assert(apiContracts.includes('operatorEnvTemplate` for `.env.backy-settings-provider-certification`'), 'API contracts must document Settings provider env-template handoff');
  assert(apiContracts.includes('operatorEvidencePacket` using `backy.settings-provider-certification-evidence-packet.v1`'), 'API contracts must document Settings provider evidence-packet handoff');
  assert(apiContracts.includes('BACKY_COMMERCE_WEBHOOK_SECRET`/`COMMERCE_WEBHOOK_SECRET'), 'API contracts must document provider certification alias families');
}

function assertAdminPageContentValidationSource() {
  const pageListRoute = fs.readFileSync(
    new URL('../src/app/api/admin/sites/[siteId]/pages/route.ts', import.meta.url),
    'utf8',
  );
  const pageDetailRoute = fs.readFileSync(
    new URL('../src/app/api/admin/sites/[siteId]/pages/[pageId]/route.ts', import.meta.url),
    'utf8',
  );
  const publicPagesRoute = fs.readFileSync(
    new URL('../src/app/api/sites/[siteId]/pages/route.ts', import.meta.url),
    'utf8',
  );
  const publicLiveManagePageRoute = fs.readFileSync(
    new URL('../src/app/api/sites/[siteId]/manage/pages/[pageId]/route.ts', import.meta.url),
    'utf8',
  );
  const publicLiveManageBlogRoute = fs.readFileSync(
    new URL('../src/app/api/sites/[siteId]/manage/blog/[postId]/route.ts', import.meta.url),
    'utf8',
  );
  const hostedPageRoute = fs.readFileSync(
    new URL('../src/app/sites/[subdomain]/[[...path]]/page.tsx', import.meta.url),
    'utf8',
  );
  const hostedBlogPostRoute = fs.readFileSync(
    new URL('../src/app/sites/[subdomain]/blog/[slug]/page.tsx', import.meta.url),
    'utf8',
  );
  const liveManageOverlay = fs.readFileSync(
    new URL('../src/components/LivePageManagementOverlay.tsx', import.meta.url),
    'utf8',
  );
  const publicPageRenderer = fs.readFileSync(
    new URL('../src/components/PageRenderer.tsx', import.meta.url),
    'utf8',
  );
  const adminPageEditorRoute = fs.readFileSync(
    new URL('../../../apps/admin/src/routes/pages.$pageId.edit.tsx', import.meta.url),
    'utf8',
  );
  const adminBlogEditorRoute = fs.readFileSync(
    new URL('../../../apps/admin/src/routes/blog.$postId.tsx', import.meta.url),
    'utf8',
  );
  const adminCanvasEditor = fs.readFileSync(
    new URL('../../../apps/admin/src/components/editor/CanvasEditor.tsx', import.meta.url),
    'utf8',
  );
  const publicManifestRoute = fs.readFileSync(
    new URL('../src/app/api/sites/[siteId]/manifest/route.ts', import.meta.url),
    'utf8',
  );
  const publicPageCommentsRoute = fs.readFileSync(
    new URL('../src/app/api/sites/[siteId]/pages/[pageId]/comments/route.ts', import.meta.url),
    'utf8',
  );
  const publicPageCommentDetailRoute = fs.readFileSync(
    new URL('../src/app/api/sites/[siteId]/pages/[pageId]/comments/[commentId]/route.ts', import.meta.url),
    'utf8',
  );
  const publicSiteCommentsRoute = fs.readFileSync(
    new URL('../src/app/api/sites/[siteId]/comments/route.ts', import.meta.url),
    'utf8',
  );
  const publicSiteCommentDetailRoute = fs.readFileSync(
    new URL('../src/app/api/sites/[siteId]/comments/[commentId]/route.ts', import.meta.url),
    'utf8',
  );
  const publicFormSubmissionsRoute = fs.readFileSync(
    new URL('../src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts', import.meta.url),
    'utf8',
  );
  const publicFormSubmissionDetailRoute = fs.readFileSync(
    new URL('../src/app/api/sites/[siteId]/forms/[formId]/submissions/[submissionId]/route.ts', import.meta.url),
    'utf8',
  );
  const publicFormContactsRoute = fs.readFileSync(
    new URL('../src/app/api/sites/[siteId]/forms/[formId]/contacts/route.ts', import.meta.url),
    'utf8',
  );
  const publicFormContactDetailRoute = fs.readFileSync(
    new URL('../src/app/api/sites/[siteId]/forms/[formId]/contacts/[contactId]/route.ts', import.meta.url),
    'utf8',
  );
  const adminFormsRoute = fs.readFileSync(
    new URL('../src/app/api/admin/sites/[siteId]/forms/route.ts', import.meta.url),
    'utf8',
  );
  const adminFormDetailRoute = fs.readFileSync(
    new URL('../src/app/api/admin/sites/[siteId]/forms/[formId]/route.ts', import.meta.url),
    'utf8',
  );
  const adminFormCloneRoute = fs.readFileSync(
    new URL('../src/app/api/admin/sites/[siteId]/forms/[formId]/clone/route.ts', import.meta.url),
    'utf8',
  );
  const adminFormSubmissionsRoute = fs.readFileSync(
    new URL('../src/app/api/admin/sites/[siteId]/forms/[formId]/submissions/route.ts', import.meta.url),
    'utf8',
  );
  const adminFormSubmissionDetailRoute = fs.readFileSync(
    new URL('../src/app/api/admin/sites/[siteId]/forms/[formId]/submissions/[submissionId]/route.ts', import.meta.url),
    'utf8',
  );
  const adminFormSubmissionReviewRoute = fs.readFileSync(
    new URL('../src/app/api/admin/sites/[siteId]/forms/[formId]/submissions/[submissionId]/review/route.ts', import.meta.url),
    'utf8',
  );
  const adminFormContactsRoute = fs.readFileSync(
    new URL('../src/app/api/admin/sites/[siteId]/forms/[formId]/contacts/route.ts', import.meta.url),
    'utf8',
  );
  const adminFormContactDetailRoute = fs.readFileSync(
    new URL('../src/app/api/admin/sites/[siteId]/forms/[formId]/contacts/[contactId]/route.ts', import.meta.url),
    'utf8',
  );
  const adminFormContactImportRoute = fs.readFileSync(
    new URL('../src/app/api/admin/sites/[siteId]/forms/[formId]/contacts/import/route.ts', import.meta.url),
    'utf8',
  );
  const adminContactListsRoute = fs.readFileSync(
    new URL('../src/app/api/admin/sites/[siteId]/forms/contact-lists/route.ts', import.meta.url),
    'utf8',
  );
  const adminFormsAnalyticsRoute = fs.readFileSync(
    new URL('../src/app/api/admin/sites/[siteId]/forms/analytics/route.ts', import.meta.url),
    'utf8',
  );
  const adminFormsConsentRetentionRoute = fs.readFileSync(
    new URL('../src/app/api/admin/sites/[siteId]/forms/consent-retention/route.ts', import.meta.url),
    'utf8',
  );
  const adminFormConsentRetentionRoute = fs.readFileSync(
    new URL('../src/app/api/admin/sites/[siteId]/forms/[formId]/consent-retention/route.ts', import.meta.url),
    'utf8',
  );
  const adminFormContactConsentRetentionRoute = fs.readFileSync(
    new URL('../src/app/api/admin/sites/[siteId]/forms/[formId]/contacts/consent-retention/route.ts', import.meta.url),
    'utf8',
  );
  const adminFormContactSyncRoute = fs.readFileSync(
    new URL('../src/app/api/admin/sites/[siteId]/forms/[formId]/contacts/sync/route.ts', import.meta.url),
    'utf8',
  );
  const adminFormEmbedBlockRoute = fs.readFileSync(
    new URL('../src/app/api/admin/sites/[siteId]/forms/[formId]/embed-block/route.ts', import.meta.url),
    'utf8',
  );
  const adminFormContactPromotionRoute = fs.readFileSync(
    new URL('../src/app/api/admin/sites/[siteId]/forms/[formId]/contacts/[contactId]/promote/route.ts', import.meta.url),
    'utf8',
  );
  const adminFormContactCustomerPromotionRoute = fs.readFileSync(
    new URL('../src/app/api/admin/sites/[siteId]/forms/[formId]/contacts/[contactId]/promote-customer/route.ts', import.meta.url),
    'utf8',
  );
  const blogListRoute = fs.readFileSync(
    new URL('../src/app/api/admin/sites/[siteId]/blog/route.ts', import.meta.url),
    'utf8',
  );
  const blogDetailRoute = fs.readFileSync(
    new URL('../src/app/api/admin/sites/[siteId]/blog/[postId]/route.ts', import.meta.url),
    'utf8',
  );
  const reusableSectionsRoute = fs.readFileSync(
    new URL('../src/app/api/admin/sites/[siteId]/reusable-sections/route.ts', import.meta.url),
    'utf8',
  );
  const reusableSectionDetailRoute = fs.readFileSync(
    new URL('../src/app/api/admin/sites/[siteId]/reusable-sections/[sectionId]/route.ts', import.meta.url),
    'utf8',
  );
  const publicBlogRoute = fs.readFileSync(
    new URL('../src/app/api/sites/[siteId]/blog/route.ts', import.meta.url),
    'utf8',
  );
  const publicBlogCommentsRoute = fs.readFileSync(
    new URL('../src/app/api/sites/[siteId]/blog/[postId]/comments/route.ts', import.meta.url),
    'utf8',
  );
  const publicBlogCommentDetailRoute = fs.readFileSync(
    new URL('../src/app/api/sites/[siteId]/blog/[postId]/comments/[commentId]/route.ts', import.meta.url),
    'utf8',
  );
  const apiContracts = fs.readFileSync(
    new URL('../../../specs/backy-api-contracts.md', import.meta.url),
    'utf8',
  );
  assert(
    apiContracts.includes('repository-backed collection records in database mode') &&
      apiContracts.includes('composite collection/record indexes') &&
      apiContracts.includes('collection-scoped write tokens') &&
      apiContracts.includes('SDK/Postgres database-mode gate'),
    'API contracts must document current collection repository/index/write-token readiness and the remaining SDK/Postgres gate',
  );
  assert(
    !apiContracts.includes('production completion still needs DB-backed indexes and authenticated visitor-write policies'),
    'API contracts must not contain stale collection DB-index/visitor-write gap text',
  );

  for (const [label, source] of [['page create', pageListRoute], ['page update', pageDetailRoute]]) {
    assert(source.includes('normalizeInputFromDirectFrontendDesignEnvelope'), `${label} route must normalize direct custom-frontend design envelopes`);
    assert(source.includes('pageContentValidationError'), `${label} route must validate explicit editor content payloads`);
    assert(source.includes('"INVALID_PAGE_CONTENT"'), `${label} route must reject non-object/non-array content payloads`);
    assert(source.includes('"INVALID_PAGE_CONTENT_ELEMENTS"'), `${label} route must reject non-array content.elements payloads`);
    assert(source.includes('"INVALID_PAGE_CANVAS_SIZE"'), `${label} route must reject malformed canvasSize payloads`);
    assert(source.includes('"INVALID_PAGE_STATUS"'), `${label} route must reject invalid explicit status payloads`);
    assert(source.includes('"SCHEDULED_AT_INVALID"'), `${label} route must reject malformed explicit scheduledAt payloads`);
    assert(source.includes('pageStatusValidationError'), `${label} route must validate status and schedule payloads before mutation`);
    assert(source.includes('Number.isFinite(width)') && source.includes('Number.isFinite(height)'), `${label} route must require finite canvas dimensions`);
  }

  for (const [label, source] of [['blog create', blogListRoute], ['blog update', blogDetailRoute]]) {
    assert(source.includes('normalizeInputFromDirectFrontendDesignEnvelope'), `${label} route must normalize direct custom-frontend design envelopes`);
    assert(source.includes('postContentValidationError'), `${label} route must validate explicit editor content payloads`);
    assert(source.includes('"INVALID_BLOG_CONTENT"'), `${label} route must reject non-object/non-array/non-string content payloads`);
    assert(source.includes('"INVALID_BLOG_CONTENT_ELEMENTS"'), `${label} route must reject non-array content.elements payloads`);
    assert(source.includes('"INVALID_BLOG_CANVAS_SIZE"'), `${label} route must reject malformed canvasSize payloads`);
    assert(source.includes('"INVALID_BLOG_STATUS"'), `${label} route must reject invalid explicit status payloads`);
    assert(source.includes('"SCHEDULED_AT_INVALID"'), `${label} route must reject malformed explicit scheduledAt payloads`);
    assert(source.includes('postStatusValidationError'), `${label} route must validate status and schedule payloads before mutation`);
    assert(source.includes('Number.isFinite(width)') && source.includes('Number.isFinite(height)'), `${label} route must require finite canvas dimensions`);
  }
  for (const [label, source] of [['reusable section create', reusableSectionsRoute], ['reusable section update', reusableSectionDetailRoute]]) {
    assert(source.includes('normalizeReusableSectionInputFromDirectFrontendDesignEnvelope'), `${label} route must normalize direct custom-frontend design envelopes`);
    assert(source.includes('hasElements(body.content)'), `${label} route must reject empty direct design content`);
    assert(source.includes('buildReusableSectionUpdateMetadata') || source.includes('buildInitialReusableSectionMetadata'), `${label} route must preserve reusable-section version metadata`);
  }
  assert(blogListRoute.includes('"INVALID_BLOG_LIMIT"'), 'admin blog list route must reject invalid limit filters');
  assert(blogListRoute.includes('"INVALID_BLOG_OFFSET"'), 'admin blog list route must reject invalid offset filters');
  assert(blogListRoute.includes('integerQueryFromInput'), 'admin blog list route must parse pagination filters strictly');
  assert(blogListRoute.includes('statusFilter.invalid'), 'admin blog list route must reject invalid status filters');
  assert(pageListRoute.includes('"INVALID_PAGE_LIMIT"'), 'admin page list route must reject invalid limit filters');
  assert(pageListRoute.includes('"INVALID_PAGE_OFFSET"'), 'admin page list route must reject invalid offset filters');
  assert(pageListRoute.includes('integerQueryFromInput'), 'admin page list route must parse pagination filters strictly');
  assert(publicBlogRoute.includes("'INVALID_BLOG_LIMIT'"), 'public blog list route must reject invalid limit filters');
  assert(publicBlogRoute.includes("'INVALID_BLOG_OFFSET'"), 'public blog list route must reject invalid offset filters');
  assert(publicBlogRoute.includes("'INVALID_BLOG_ARCHIVE_YEAR'"), 'public blog list route must reject invalid archive year filters');
  assert(publicBlogRoute.includes("'INVALID_BLOG_ARCHIVE_MONTH'"), 'public blog list route must reject invalid archive month filters');
  assert(publicBlogRoute.includes('statusFilter.invalid'), 'public blog list route must reject invalid status filters');
  assert(publicBlogCommentsRoute.includes("'INVALID_BLOG_COMMENT_STATUS'"), 'public blog comments route must reject invalid status filters');
  assert(publicBlogCommentsRoute.includes("'INVALID_BLOG_COMMENT_SORT'"), 'public blog comments route must reject invalid sort filters');
  assert(publicBlogCommentsRoute.includes("'INVALID_BLOG_COMMENT_LIMIT'"), 'public blog comments route must reject invalid limit filters');
  assert(publicBlogCommentsRoute.includes("'INVALID_BLOG_COMMENT_OFFSET'"), 'public blog comments route must reject invalid offset filters');
  assert(publicBlogCommentsRoute.includes('parseBoundedInteger'), 'public blog comments route must parse pagination filters strictly');
  assert(publicBlogCommentsRoute.includes('statusFilter.invalid'), 'public blog comments route must branch on invalid status filters');
  assert(publicBlogCommentsRoute.includes('sortFilter.invalid'), 'public blog comments route must branch on invalid sort filters');
  assert(publicBlogCommentsRoute.includes('blogCommentValidationResponse'), 'public blog comments route must use structured validation error envelopes');
  assert(publicBlogCommentsRoute.includes("code: 'VALIDATION_ERROR'"), 'public blog comments route must return stable validation error codes');
  assert(!publicBlogCommentsRoute.includes("error: 'Validation failed'"), 'public blog comments route must not return legacy string validation errors');
  assert(publicBlogCommentDetailRoute.includes("'INVALID_BLOG_COMMENT_STATUS'"), 'public blog comment detail route must reject invalid moderation status updates');
  assert(publicBlogCommentDetailRoute.includes('statusProvided'), 'public blog comment detail route must distinguish missing status from invalid status values');
  assert(publicPagesRoute.includes("'INVALID_PAGE_LIMIT'"), 'public pages list route must reject invalid limit filters');
  assert(publicPagesRoute.includes("'INVALID_PAGE_OFFSET'"), 'public pages list route must reject invalid offset filters');
  assert(publicPagesRoute.includes('parseBoundedInteger'), 'public pages list route must parse pagination filters strictly');
  assert(publicLiveManagePageRoute.includes("'pages.view'"), 'live manage page route must require pages.view for reads');
  assert(publicLiveManagePageRoute.includes("'pages.edit'"), 'live manage page route must require pages.edit for mutations');
  assert(publicLiveManagePageRoute.includes('requireAdminTeamScopeAccess'), 'live manage page route must enforce site team scope');
  assert(publicLiveManagePageRoute.includes('FORBIDDEN_LIVE_MANAGE_SITE_SCOPE'), 'live manage page route must return a distinct live-management scope error');
  assert(publicLiveManagePageRoute.includes('getAdminPage') && publicLiveManagePageRoute.includes('patchAdminPage'), 'live manage page route must delegate to the admin page detail behavior');
  assert(publicLiveManagePageRoute.includes('withLiveManagementContractHeaders') && publicLiveManagePageRoute.includes("resource: 'page'"), 'live manage page route must wrap delegated responses with page live-management contract headers');
  assert(publicLiveManagePageRoute.includes('LiveManagePageAccessResult') && publicLiveManagePageRoute.includes('ok: false') && publicLiveManagePageRoute.includes('isAdminAccessContext'), 'live manage page route must use a stable access result shape for auth failures');
  assert(!publicLiveManagePageRoute.includes('instanceof NextResponse'), 'live manage page route must not rely on brittle NextResponse instance checks');
  assert(hostedPageRoute.includes('backyManage') && hostedPageRoute.includes('LivePageManagementOverlay'), 'hosted page route must expose opt-in live management overlay wiring');
  assert(publicLiveManageBlogRoute.includes("'pages.view'"), 'live manage blog route must require pages.view for reads');
  assert(publicLiveManageBlogRoute.includes("'pages.edit'"), 'live manage blog route must require pages.edit for mutations');
  assert(publicLiveManageBlogRoute.includes('requireAdminTeamScopeAccess'), 'live manage blog route must enforce site team scope');
  assert(publicLiveManageBlogRoute.includes('FORBIDDEN_LIVE_MANAGE_BLOG_SCOPE'), 'live manage blog route must return a distinct live-management blog scope error');
  assert(publicLiveManageBlogRoute.includes('getAdminPost') && publicLiveManageBlogRoute.includes('patchAdminPost'), 'live manage blog route must delegate to the admin blog detail behavior');
  assert(publicLiveManageBlogRoute.includes('withLiveManagementContractHeaders') && publicLiveManageBlogRoute.includes("resource: 'blog-post'"), 'live manage blog route must wrap delegated responses with blog live-management contract headers');
  assert(publicLiveManageBlogRoute.includes('LiveManageBlogAccessResult') && publicLiveManageBlogRoute.includes('ok: false') && publicLiveManageBlogRoute.includes('isAdminAccessContext'), 'live manage blog route must use a stable access result shape for auth failures');
  assert(!publicLiveManageBlogRoute.includes('instanceof NextResponse'), 'live manage blog route must not rely on brittle NextResponse instance checks');
  assert(hostedBlogPostRoute.includes('backyManage') && hostedBlogPostRoute.includes('LivePageManagementOverlay'), 'hosted blog route must expose opt-in live management overlay wiring');
  assert(hostedBlogPostRoute.includes('resourceType="post"') && hostedBlogPostRoute.includes('postId={post.id}'), 'hosted blog route must wire the overlay to the selected blog post resource');
  assert(liveManageOverlay.includes("credentials: 'include'"), 'live management overlay must rely on admin session credentials');
  assert(liveManageOverlay.includes('expectedUpdatedAt'), 'live management overlay must preserve optimistic conflict checks');
  assert(liveManageOverlay.includes('data-backy-live-management-overlay="page"'), 'live management overlay must expose a stable test hook');
  assert(liveManageOverlay.includes("data-backy-live-management-resource={managedResourceType}"), 'live management overlay must expose a stable managed-resource hook');
  assert(liveManageOverlay.includes('data-backy-live-post-management-overlay'), 'live management overlay must expose a blog post management hook');
  assert(liveManageOverlay.includes("managedResourceType === 'post' ? 'blog' : 'pages'"), 'live management overlay must route blog posts to the blog live-management bridge');
  assert(liveManageOverlay.includes('/blog/${encodeURIComponent(managedResourceId)}'), 'live management overlay must hand blog post selections to the admin blog editor');
  assert(liveManageOverlay.includes('data-backy-live-element-list="page"'), 'live management overlay must expose rendered element inspection');
  assert(liveManageOverlay.includes('contentElementTargets') && liveManageOverlay.includes("source: 'content'"), 'live management overlay must include content-backed element targets for hidden element recovery');
  assert(liveManageOverlay.includes('data-backy-live-inline-editor="page"'), 'live management overlay must expose inline element text editing');
  assert(liveManageOverlay.includes('data-backy-live-link-editor="page"'), 'live management overlay must expose inline link/button destination editing');
  assert(liveManageOverlay.includes('data-backy-live-image-editor="page"'), 'live management overlay must expose inline image metadata editing');
  assert(liveManageOverlay.includes('data-backy-live-media-editor="page"'), 'live management overlay must expose inline video/embed/map media editing');
  assert(liveManageOverlay.includes('data-backy-live-form-editor="page"'), 'live management overlay must expose inline form/control editing');
  assert(liveManageOverlay.includes('data-backy-live-layout-editor="page"'), 'live management overlay must expose inline layout editing');
  assert(liveManageOverlay.includes('INLINE_MEDIA_ELEMENT_TYPES') && liveManageOverlay.includes("'video', 'embed', 'map'"), 'live management overlay must support video, embed, and map inline media targets');
  assert(liveManageOverlay.includes('INLINE_FORM_ELEMENT_TYPES') && liveManageOverlay.includes("'form', 'input', 'textarea', 'select', 'checkbox', 'radio'"), 'live management overlay must support form container and field-control inline targets');
  assert(liveManageOverlay.includes('inlineMediaSrc') && liveManageOverlay.includes('inlineMediaAddress'), 'live management overlay must expose selected media source and map address editing');
  assert(liveManageOverlay.includes('inlineMediaAllowedHosts') && liveManageOverlay.includes('inlineMediaAllowFullScreen'), 'live management overlay must expose embed host and fullscreen controls');
  assert(liveManageOverlay.includes('inlineMediaControls') && liveManageOverlay.includes('inlineMediaAutoplay'), 'live management overlay must expose video playback controls');
  assert(liveManageOverlay.includes('inlineFormLabel') && liveManageOverlay.includes('inlineFormOptions') && liveManageOverlay.includes('inlineFormSubmitLabel'), 'live management overlay must expose form label/options/submit controls');
  assert(liveManageOverlay.includes('inlineLayoutName'), 'live management overlay must expose selected element layer name editing');
  assert(liveManageOverlay.includes('inlineLayoutVisible'), 'live management overlay must expose selected element visibility editing');
  assert(liveManageOverlay.includes('inlineLayoutLocked') && liveManageOverlay.includes('selectedElementLocked'), 'live management overlay must expose and honor selected element locking');
  assert(liveManageOverlay.includes('data-backy-live-appearance-editor="page"'), 'live management overlay must expose inline appearance editing');
  assert(liveManageOverlay.includes('BORDER_STYLE_OPTIONS') && liveManageOverlay.includes('inlineAppearancePadding'), 'live management overlay must expose border and spacing appearance controls');
  assert(liveManageOverlay.includes('TEXT_ALIGN_OPTIONS') && liveManageOverlay.includes('TEXT_TRANSFORM_OPTIONS') && liveManageOverlay.includes('inlineAppearanceFontFamily'), 'live management overlay must expose typography appearance controls');
  assert(liveManageOverlay.includes('TEXT_DECORATION_OPTIONS') && liveManageOverlay.includes('inlineAppearanceBoxShadow') && liveManageOverlay.includes('inlineAppearanceOpacity'), 'live management overlay must expose advanced appearance controls');
  assert(liveManageOverlay.includes('updateElementText'), 'live management overlay must patch selected element content');
  assert(liveManageOverlay.includes('updateElementLink'), 'live management overlay must patch selected link/button destinations');
  assert(liveManageOverlay.includes('updateElementImage'), 'live management overlay must patch selected image metadata');
  assert(liveManageOverlay.includes('updateElementMedia'), 'live management overlay must patch selected video/embed/map fields');
  assert(liveManageOverlay.includes('updateElementForm'), 'live management overlay must patch selected form/control fields');
  assert(liveManageOverlay.includes('updateElementLayout'), 'live management overlay must patch selected element layout fields');
  assert(liveManageOverlay.includes('updateElementAppearance'), 'live management overlay must patch selected element appearance props');
  assert(publicPageRenderer.includes('data-backy-element-id'), 'public renderer must expose stable element ids for live inspection');
  assert(adminPageEditorRoute.includes('elementId') && adminCanvasEditor.includes('initialSelectedElementId'), 'admin page editor must accept live inspector element handoff');
  assert(adminBlogEditorRoute.includes('elementId') && adminBlogEditorRoute.includes('initialSelectedElementId={routeSearch.elementId}'), 'admin blog editor must accept live inspector element handoff');
  const publicOpenApiRouteSource = fs.readFileSync(
    new URL('../src/app/api/sites/[siteId]/openapi/route.ts', import.meta.url),
    'utf8',
  );
  assert(publicOpenApiRouteSource.includes('/manage/pages/{pageId}'), 'OpenAPI route must advertise the live page management endpoint');
  assert(publicOpenApiRouteSource.includes('/manage/blog/{postId}'), 'OpenAPI route must advertise the live blog management endpoint');
  assert(publicManifestRoute.includes("schemaVersion: 'backy.live-management-page.v1'") && publicManifestRoute.includes("schemaVersion: 'backy.live-management-blog-post.v1'"), 'frontend manifest must advertise live-management response schema headers');
  assert(publicOpenApiRouteSource.includes('liveManagementPageResponseHeaders') && publicOpenApiRouteSource.includes('liveManagementBlogPostResponseHeaders'), 'OpenAPI route must advertise live-management response headers');
  assert(publicOpenApiRouteSource.includes('"backy.live-management-page.v1"') && publicOpenApiRouteSource.includes('"backy.live-management-blog-post.v1"'), 'OpenAPI route must include live-management resource schema header constants');
  assert(publicOpenApiRouteSource.includes('PageUpdateRequest'), 'OpenAPI route must document the live page update payload');
  assert(publicOpenApiRouteSource.includes('BlogPostUpdateRequest'), 'OpenAPI route must document the live blog update payload');
  assert(publicOpenApiRouteSource.includes('getBackyLiveManagedPage') && publicOpenApiRouteSource.includes('updateBackyLiveManagedPage'), 'OpenAPI route must name live page management operations');
  assert(publicOpenApiRouteSource.includes('getBackyLiveManagedBlogPost') && publicOpenApiRouteSource.includes('updateBackyLiveManagedBlogPost'), 'OpenAPI route must name live blog management operations');
  assert(publicManifestRoute.includes('liveManagePage'), 'frontend manifest must advertise the live page management endpoint');
  assert(publicManifestRoute.includes('liveManagePost'), 'frontend manifest must advertise the live blog management endpoint');
  assert(publicPageCommentsRoute.includes("'INVALID_PAGE_COMMENT_LIMIT'"), 'public page comments route must reject invalid limit filters');
  assert(publicPageCommentsRoute.includes("'INVALID_PAGE_COMMENT_OFFSET'"), 'public page comments route must reject invalid offset filters');
  assert(publicPageCommentsRoute.includes('parseBoundedInteger'), 'public page comments route must parse pagination filters strictly');
  assert(publicPageCommentsRoute.includes("'INVALID_PAGE_COMMENT_STATUS'"), 'public page comments route must reject invalid status filters');
  assert(publicPageCommentsRoute.includes("'INVALID_PAGE_COMMENT_SORT'"), 'public page comments route must reject invalid sort filters');
  assert(publicPageCommentsRoute.includes('statusFilter.invalid'), 'public page comments route must branch on invalid status filters');
  assert(publicPageCommentsRoute.includes('sortFilter.invalid'), 'public page comments route must branch on invalid sort filters');
  assert(publicPageCommentsRoute.includes('pageCommentValidationResponse'), 'public page comments route must use structured validation error envelopes');
  assert(publicPageCommentsRoute.includes("code: 'VALIDATION_ERROR'"), 'public page comments route must return stable validation error codes');
  assert(!publicPageCommentsRoute.includes("error: 'Validation failed'"), 'public page comments route must not return legacy string validation errors');
  assert(publicPageCommentDetailRoute.includes("'INVALID_PAGE_COMMENT_STATUS'"), 'public page comment detail route must reject invalid moderation status updates');
  assert(publicPageCommentDetailRoute.includes('statusProvided'), 'public page comment detail route must distinguish missing status from invalid status values');
  assert(publicSiteCommentsRoute.includes("'INVALID_SITE_COMMENT_STATUS'"), 'site comments route must reject invalid status filters');
  assert(publicSiteCommentsRoute.includes("'INVALID_SITE_COMMENT_TARGET_TYPE'"), 'site comments route must reject invalid target type filters');
  assert(publicSiteCommentsRoute.includes("'INVALID_SITE_COMMENT_SORT'"), 'site comments route must reject invalid sort filters');
  assert(publicSiteCommentsRoute.includes("'INVALID_SITE_COMMENT_LIMIT'"), 'site comments route must reject invalid limit filters');
  assert(publicSiteCommentsRoute.includes("'INVALID_SITE_COMMENT_OFFSET'"), 'site comments route must reject invalid offset filters');
  assert(publicSiteCommentsRoute.includes('parseBoundedInteger'), 'site comments route must parse pagination filters strictly');
  assert(publicSiteCommentsRoute.includes('statusProvided'), 'site comments route must distinguish missing moderation status from invalid status values');
  assert(publicSiteCommentsRoute.includes('invalidSiteCommentStatusResponse'), 'site comments route must return stable invalid moderation status errors');
  assert(publicSiteCommentDetailRoute.includes("'INVALID_SITE_COMMENT_STATUS'"), 'site comment detail route must reject invalid moderation status updates');
  assert(publicSiteCommentDetailRoute.includes('statusProvided'), 'site comment detail route must distinguish missing status from invalid status values');
  assert(publicFormSubmissionsRoute.includes("'INVALID_FORM_SUBMISSION_STATUS'"), 'form submissions route must reject invalid status filters');
  assert(publicFormSubmissionsRoute.includes("'INVALID_FORM_SUBMISSION_LIMIT'"), 'form submissions route must reject invalid limit filters');
  assert(publicFormSubmissionsRoute.includes("'INVALID_FORM_SUBMISSION_OFFSET'"), 'form submissions route must reject invalid offset filters');
  assert(publicFormSubmissionsRoute.includes('statusFilter.invalid'), 'form submissions route must branch on invalid status filters');
  assert(publicFormSubmissionDetailRoute.includes("'INVALID_FORM_SUBMISSION_STATUS'"), 'form submission detail route must reject invalid status updates');
  assert(publicFormSubmissionDetailRoute.includes('statusProvided'), 'form submission detail route must distinguish missing status from invalid status values');
  assert(publicFormContactsRoute.includes("'INVALID_FORM_CONTACT_STATUS'"), 'form contacts route must reject invalid status filters');
  assert(publicFormContactsRoute.includes("'INVALID_FORM_CONTACT_LIMIT'"), 'form contacts route must reject invalid limit filters');
  assert(publicFormContactsRoute.includes("'INVALID_FORM_CONTACT_OFFSET'"), 'form contacts route must reject invalid offset filters');
  assert(publicFormContactsRoute.includes('statusFilter.invalid'), 'form contacts route must branch on invalid status filters');
  assert(publicFormContactDetailRoute.includes("'INVALID_FORM_CONTACT_STATUS'"), 'form contact detail route must reject invalid status updates');
  assert(publicFormContactDetailRoute.includes('statusProvided'), 'form contact detail route must distinguish missing status from invalid status values');
  assert(adminFormsRoute.includes("'INVALID_ADMIN_FORM_AUDIENCE'"), 'admin form create route must reject invalid audience values');
  assert(adminFormsRoute.includes("'INVALID_ADMIN_FORM_MODERATION_MODE'"), 'admin form create route must reject invalid moderation mode values');
  assert(adminFormsRoute.includes("'INVALID_ADMIN_FORM_BOOLEAN_CONTROL'"), 'admin form create route must reject invalid boolean controls');
  assert(adminFormsRoute.includes('formConfigurationValidationError'), 'admin form create route must validate explicit configuration values before defaulting');
  assert(adminFormsRoute.includes('parseBooleanControl'), 'admin form create route must parse boolean controls strictly');
  assert(adminFormDetailRoute.includes("'INVALID_ADMIN_FORM_AUDIENCE'"), 'admin form update route must reject invalid audience values');
  assert(adminFormDetailRoute.includes("'INVALID_ADMIN_FORM_MODERATION_MODE'"), 'admin form update route must reject invalid moderation mode values');
  assert(adminFormDetailRoute.includes("'INVALID_ADMIN_FORM_BOOLEAN_CONTROL'"), 'admin form update route must reject invalid boolean controls');
  assert(adminFormDetailRoute.includes('formConfigurationValidationError'), 'admin form update route must validate explicit configuration values before defaulting');
  assert(adminFormDetailRoute.includes('parseBooleanControl'), 'admin form update route must parse boolean controls strictly');
  assert(adminFormCloneRoute.includes("'INVALID_ADMIN_FORM_CLONE_NAME'"), 'admin form clone route must reject invalid clone name overrides');
  assert(adminFormCloneRoute.includes("'INVALID_ADMIN_FORM_CLONE_TITLE'"), 'admin form clone route must reject invalid clone title overrides');
  assert(adminFormCloneRoute.includes("'INVALID_ADMIN_FORM_CLONE_ACTIVE'"), 'admin form clone route must reject invalid clone active overrides');
  assert(adminFormCloneRoute.includes('cloneFormInput'), 'admin form clone route must clone source form fields and settings');
  assert(adminFormCloneRoute.includes('BILLING_FORM_LIMIT'), 'admin form clone route must enforce form billing limits');
  assert(adminFormSubmissionsRoute.includes("'INVALID_ADMIN_FORM_SUBMISSION_STATUS'"), 'admin form submissions route must reject invalid status filters');
  assert(adminFormSubmissionsRoute.includes("'INVALID_ADMIN_FORM_SUBMISSION_LIMIT'"), 'admin form submissions route must reject invalid limit filters');
  assert(adminFormSubmissionsRoute.includes("'INVALID_ADMIN_FORM_SUBMISSION_OFFSET'"), 'admin form submissions route must reject invalid offset filters');
  assert(adminFormSubmissionsRoute.includes('statusFilter.invalid'), 'admin form submissions route must branch on invalid status filters');
  assert(adminFormSubmissionDetailRoute.includes("'INVALID_ADMIN_FORM_SUBMISSION_STATUS'"), 'admin form submission detail route must reject invalid status updates');
  assert(adminFormSubmissionDetailRoute.includes('statusProvided'), 'admin form submission detail route must distinguish missing status from invalid status values');
  assert(adminFormSubmissionReviewRoute.includes("import { PATCH } from '../route'") && adminFormSubmissionReviewRoute.includes('export async function POST'), 'admin form submission review route must preserve the documented POST review contract');
  assert(adminFormContactsRoute.includes("'INVALID_ADMIN_FORM_CONTACT_STATUS'"), 'admin form contacts route must reject invalid status filters');
  assert(adminFormContactsRoute.includes("'INVALID_ADMIN_FORM_CONTACT_LIMIT'"), 'admin form contacts route must reject invalid limit filters');
  assert(adminFormContactsRoute.includes("'INVALID_ADMIN_FORM_CONTACT_OFFSET'"), 'admin form contacts route must reject invalid offset filters');
  assert(adminFormContactsRoute.includes('statusFilter.invalid'), 'admin form contacts route must branch on invalid status filters');
  assert(adminFormContactsRoute.includes('statusInvalid'), 'admin form contact create route must distinguish invalid explicit status from the default status');
  assert(adminFormContactDetailRoute.includes("'INVALID_ADMIN_FORM_CONTACT_STATUS'"), 'admin form contact detail route must reject invalid status updates');
  assert(adminFormContactDetailRoute.includes('statusProvided'), 'admin form contact detail route must distinguish missing status from invalid status values');
  assert(adminFormContactImportRoute.includes("'INVALID_ADMIN_FORM_CONTACT_STATUS'"), 'admin form contact import route must reject invalid status rows');
  assert(adminFormContactImportRoute.includes('statusInvalid'), 'admin form contact import route must distinguish invalid imported status from the default status');
  assert(adminContactListsRoute.includes("'INVALID_ADMIN_CONTACT_LIST_STATUS'"), 'admin contact lists route must reject invalid saved-list status filters');
  assert(adminContactListsRoute.includes("'INVALID_ADMIN_CONTACT_LIST_QUALITY'"), 'admin contact lists route must reject invalid saved-list quality filters');
  assert(adminContactListsRoute.includes('validateExplicitFilters'), 'admin contact lists route must validate explicit filters before normalizing');
  assert(adminFormsAnalyticsRoute.includes("'INVALID_ADMIN_FORM_ANALYTICS_DAYS'"), 'admin forms analytics route must reject invalid days filters');
  assert(adminFormsAnalyticsRoute.includes('daysFilter.invalid'), 'admin forms analytics route must branch on invalid days filters');
  for (const [label, source] of [
    ['admin forms consent retention', adminFormsConsentRetentionRoute],
    ['admin form consent retention', adminFormConsentRetentionRoute],
    ['admin form contact consent retention', adminFormContactConsentRetentionRoute],
  ]) {
    assert(source.includes("'INVALID_ADMIN_FORM_CONSENT_RETENTION_DRY_RUN'"), `${label} route must reject invalid dryRun values`);
    assert(source.includes("'INVALID_ADMIN_FORM_CONSENT_RETENTION_NOW'"), `${label} route must reject invalid now values`);
    assert(source.includes('dryRunFilter.invalid'), `${label} route must branch on invalid dryRun values`);
    assert(source.includes('nowFilter.invalid'), `${label} route must branch on invalid now values`);
  }
  assert(adminFormContactConsentRetentionRoute.includes("'INVALID_ADMIN_FORM_CONSENT_RETENTION_DAYS'"), 'admin form contact consent retention route must reject invalid retentionDays overrides');
  assert(adminFormContactConsentRetentionRoute.includes('retentionDaysFilter.invalid'), 'admin form contact consent retention route must branch on invalid retentionDays overrides');
  assert(adminFormContactSyncRoute.includes("'INVALID_ADMIN_CONTACT_SYNC_CONTACT_IDS'"), 'admin form contact sync route must reject invalid contactIds payloads');
  assert(adminFormContactSyncRoute.includes("'INVALID_ADMIN_CONTACT_SYNC_TARGET_URL'"), 'admin form contact sync route must reject invalid targetUrl payloads');
  assert(adminFormContactSyncRoute.includes("'INVALID_ADMIN_CONTACT_SYNC_INCLUDE_SOURCE_VALUES'"), 'admin form contact sync route must reject invalid includeSourceValues payloads');
  assert(adminFormContactSyncRoute.includes('contactIdsFilter.invalid'), 'admin form contact sync route must branch on invalid contactIds payloads');
  assert(adminFormContactSyncRoute.includes('targetUrlFilter.invalid'), 'admin form contact sync route must branch on invalid targetUrl payloads');
  assert(adminFormContactSyncRoute.includes('includeSourceValuesFilter.invalid'), 'admin form contact sync route must branch on invalid includeSourceValues payloads');
  assert(adminFormEmbedBlockRoute.includes('"INVALID_ADMIN_FORM_EMBED_PUBLIC_BASE_URL"'), 'admin form embed block route must reject invalid publicBaseUrl values');
  assert(adminFormEmbedBlockRoute.includes('publicBaseUrlFilter.invalid'), 'admin form embed block route must branch on invalid publicBaseUrl values');
  assert(adminFormContactPromotionRoute.includes("'INVALID_ADMIN_CONTACT_PROMOTION_ROLE'"), 'admin form contact promotion route must reject invalid role values');
  assert(adminFormContactPromotionRoute.includes("'INVALID_ADMIN_CONTACT_PROMOTION_STATUS'"), 'admin form contact promotion route must reject invalid status values');
  assert(adminFormContactPromotionRoute.includes("'INVALID_ADMIN_CONTACT_PROMOTION_INVITE_EXPIRY'"), 'admin form contact promotion route must reject invalid invite expiry values');
  assert(adminFormContactPromotionRoute.includes('roleFilter.invalid'), 'admin form contact promotion route must branch on invalid role values');
  assert(adminFormContactPromotionRoute.includes('statusFilter.invalid'), 'admin form contact promotion route must branch on invalid status values');
  assert(adminFormContactPromotionRoute.includes('expiresInMinutesFilter.invalid'), 'admin form contact promotion route must branch on invalid invite expiry values');
  assert(adminFormContactCustomerPromotionRoute.includes("'INVALID_ADMIN_CUSTOMER_PROMOTION_STATUS'"), 'admin form contact customer promotion route must reject invalid customerStatus values');
  assert(adminFormContactCustomerPromotionRoute.includes('customerStatusFilter.invalid'), 'admin form contact customer promotion route must branch on invalid customerStatus values');

  assert(
    apiContracts.includes('INVALID_PAGE_CONTENT') &&
      apiContracts.includes('INVALID_PAGE_CONTENT_ELEMENTS') &&
      apiContracts.includes('INVALID_PAGE_CANVAS_SIZE') &&
      apiContracts.includes('INVALID_PAGE_STATUS') &&
      apiContracts.includes('INVALID_PAGE_LIMIT') &&
      apiContracts.includes('INVALID_PAGE_OFFSET') &&
      apiContracts.includes('INVALID_PAGE_COMMENT_LIMIT') &&
      apiContracts.includes('INVALID_PAGE_COMMENT_OFFSET') &&
      apiContracts.includes('INVALID_PAGE_COMMENT_STATUS') &&
      apiContracts.includes('INVALID_PAGE_COMMENT_SORT') &&
      apiContracts.includes('INVALID_SITE_COMMENT_STATUS') &&
      apiContracts.includes('INVALID_SITE_COMMENT_TARGET_TYPE') &&
      apiContracts.includes('INVALID_SITE_COMMENT_SORT') &&
      apiContracts.includes('INVALID_SITE_COMMENT_LIMIT') &&
      apiContracts.includes('INVALID_SITE_COMMENT_OFFSET') &&
      apiContracts.includes('INVALID_BLOG_CONTENT') &&
      apiContracts.includes('INVALID_BLOG_CONTENT_ELEMENTS') &&
      apiContracts.includes('INVALID_BLOG_CANVAS_SIZE') &&
      apiContracts.includes('INVALID_BLOG_STATUS') &&
      apiContracts.includes('INVALID_BLOG_LIMIT') &&
      apiContracts.includes('INVALID_BLOG_OFFSET') &&
      apiContracts.includes('INVALID_BLOG_ARCHIVE_YEAR') &&
      apiContracts.includes('INVALID_BLOG_ARCHIVE_MONTH') &&
      apiContracts.includes('INVALID_BLOG_COMMENT_STATUS') &&
      apiContracts.includes('INVALID_BLOG_COMMENT_SORT') &&
      apiContracts.includes('INVALID_BLOG_COMMENT_LIMIT') &&
      apiContracts.includes('INVALID_BLOG_COMMENT_OFFSET') &&
      apiContracts.includes('INVALID_FORM_SUBMISSION_STATUS') &&
      apiContracts.includes('INVALID_FORM_SUBMISSION_LIMIT') &&
      apiContracts.includes('INVALID_FORM_SUBMISSION_OFFSET') &&
      apiContracts.includes('INVALID_FORM_CONTACT_STATUS') &&
      apiContracts.includes('INVALID_FORM_CONTACT_LIMIT') &&
      apiContracts.includes('INVALID_FORM_CONTACT_OFFSET') &&
      apiContracts.includes('INVALID_ADMIN_FORM_AUDIENCE') &&
      apiContracts.includes('INVALID_ADMIN_FORM_MODERATION_MODE') &&
      apiContracts.includes('INVALID_ADMIN_FORM_BOOLEAN_CONTROL') &&
      apiContracts.includes('INVALID_ADMIN_FORM_CLONE_NAME') &&
      apiContracts.includes('INVALID_ADMIN_FORM_CLONE_TITLE') &&
      apiContracts.includes('INVALID_ADMIN_FORM_CLONE_ACTIVE') &&
      apiContracts.includes('INVALID_ADMIN_FORM_SUBMISSION_STATUS') &&
      apiContracts.includes('INVALID_ADMIN_FORM_SUBMISSION_LIMIT') &&
      apiContracts.includes('INVALID_ADMIN_FORM_SUBMISSION_OFFSET') &&
      apiContracts.includes('INVALID_ADMIN_FORM_CONTACT_STATUS') &&
      apiContracts.includes('INVALID_ADMIN_FORM_CONTACT_LIMIT') &&
      apiContracts.includes('INVALID_ADMIN_FORM_CONTACT_OFFSET') &&
      apiContracts.includes('INVALID_ADMIN_CONTACT_LIST_STATUS') &&
      apiContracts.includes('INVALID_ADMIN_CONTACT_LIST_QUALITY') &&
      apiContracts.includes('INVALID_ADMIN_FORM_ANALYTICS_DAYS') &&
      apiContracts.includes('INVALID_ADMIN_FORM_CONSENT_RETENTION_DRY_RUN') &&
      apiContracts.includes('INVALID_ADMIN_FORM_CONSENT_RETENTION_NOW') &&
      apiContracts.includes('INVALID_ADMIN_FORM_CONSENT_RETENTION_DAYS') &&
      apiContracts.includes('INVALID_ADMIN_CONTACT_SYNC_CONTACT_IDS') &&
      apiContracts.includes('INVALID_ADMIN_CONTACT_SYNC_TARGET_URL') &&
      apiContracts.includes('INVALID_ADMIN_CONTACT_SYNC_INCLUDE_SOURCE_VALUES') &&
      apiContracts.includes('INVALID_ADMIN_FORM_EMBED_PUBLIC_BASE_URL') &&
      apiContracts.includes('INVALID_ADMIN_CONTACT_PROMOTION_ROLE') &&
      apiContracts.includes('INVALID_ADMIN_CONTACT_PROMOTION_STATUS') &&
      apiContracts.includes('INVALID_ADMIN_CONTACT_PROMOTION_INVITE_EXPIRY') &&
      apiContracts.includes('INVALID_ADMIN_CUSTOMER_PROMOTION_STATUS') &&
      apiContracts.includes('SCHEDULED_AT_INVALID'),
    'API contracts must document invalid page, blog, comment, and form filter/content errors',
  );
}

async function request(pathOrUrl, init) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${baseUrl}${pathOrUrl}`;
  const headers = new Headers(init?.headers || {});
  const pathname = pathOrUrl.startsWith('http') ? new URL(pathOrUrl).pathname : pathOrUrl;
  if (!adminRequestApiKey && adminSessionToken && pathname.startsWith('/api/admin/') && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${adminSessionToken}`);
  }
  if (adminRequestApiKey && pathname.startsWith('/api/admin/') && !headers.has('x-backy-admin-key') && !headers.has('authorization')) {
    headers.set('x-backy-admin-key', adminRequestApiKey);
  }
  const response = await fetch(url, {
    ...init,
    headers,
  });
  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Keep raw text for diagnostics below.
  }

  const result = {
    response,
    text,
    json,
    url,
  };
  if (pathname.startsWith('/api/admin/') && init?.method !== 'OPTIONS') {
    assertAdminContract(result);
  }
  return result;
}

async function requestWithSession(pathOrUrl, sessionToken, init) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${baseUrl}${pathOrUrl}`;
  const headers = new Headers(init?.headers || {});
  const pathname = pathOrUrl.startsWith('http') ? new URL(pathOrUrl).pathname : pathOrUrl;
  headers.set('authorization', `Bearer ${sessionToken}`);
  const response = await fetch(url, {
    ...init,
    headers,
  });
  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Keep raw text for diagnostics below.
  }

  const result = {
    response,
    text,
    json,
    url,
  };
  if (pathname.startsWith('/api/admin/') && init?.method !== 'OPTIONS') {
    assertAdminContract(result);
  }
  return result;
}

function withAdminAuth(headers = {}) {
  const nextHeaders = new Headers(headers);
  if (!nextHeaders.has('authorization') && !nextHeaders.has('x-backy-admin-key')) {
    if (adminRequestApiKey) {
      nextHeaders.set('x-backy-admin-key', adminRequestApiKey);
    } else if (adminSessionToken) {
      nextHeaders.set('authorization', `Bearer ${adminSessionToken}`);
    }
  }
  return nextHeaders;
}

function assertAdminContract(result) {
  assert(result.response.headers.get('x-backy-request-id'), `${result.url} missing request id header`);
  assert(result.response.headers.get('cache-control') === 'no-store', `${result.url} expected admin no-store cache control`);
  assert(result.response.headers.get('x-backy-cache-scope') === 'admin', `${result.url} expected admin cache scope`);
  assert(result.response.headers.get('x-backy-admin-contract-version') === 'backy.admin.v1', `${result.url} missing admin contract version`);
  if (new URL(result.url).pathname === '/api/admin/settings') {
    assert(result.response.headers.get('x-backy-schema-version') === 'backy.admin-settings.v1', `${result.url} missing workspace settings schema version`);
  }
}

function assertBackyContract(result, scope, label = result.url) {
  assert(result.response.headers.get('x-backy-cache-scope') === scope, `${label} expected ${scope} cache scope`);
  assert(result.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${label} missing contract version`);
  if (scope === 'private' || scope === 'error') {
    assert(result.response.headers.get('cache-control') === 'no-store', `${label} expected no-store cache control`);
  }
}

async function record(name, fn) {
  const startedAt = Date.now();
  await fn();
  checks.push({ name, ms: Date.now() - startedAt });
}

async function loginAdminApi() {
  if (adminRequestApiKey) return;

  const login = (twoFactorCode) => fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: 'admin@backy.io',
      password: process.env.BACKY_ADMIN_DEMO_PASSWORD || 'admin123',
      ...(twoFactorCode ? { twoFactorCode } : {}),
    }),
  });

  let response = await login();
  let json = await response.json().catch(() => ({}));
  const smokeMfaCode = process.env.BACKY_ADMIN_CONTRACT_MFA_CODE
    || process.env.BACKY_SETTINGS_SMOKE_MFA_CODE
    || process.env.BACKY_ADMIN_MFA_CODE
    || process.env.BACKY_ADMIN_2FA_CODE;
  if (!response.ok && json.error?.code === 'MFA_REQUIRED' && smokeMfaCode) {
    response = await login(smokeMfaCode);
    json = await response.json().catch(() => ({}));
  }

  if (!response.ok || json.success === false || !json.data?.session?.token) {
    throw new Error(`Unable to create admin session for contract smoke: ${JSON.stringify(json).slice(0, 500)}`);
  }

  adminSessionToken = json.data.session.token;

  const settingsResponse = await fetch(`${baseUrl}/api/admin/settings`, {
    headers: {
      authorization: `Bearer ${adminSessionToken}`,
    },
  });
  const settingsJson = await settingsResponse.json().catch(() => ({}));
  const settingsAdminKey = settingsJson?.data?.settings?.apiKeys?.adminApiKey;
  if (settingsResponse.ok && typeof settingsAdminKey === 'string' && settingsAdminKey.trim()) {
    adminRequestApiKey = settingsAdminKey.trim();
  }
}

async function loginAdminCredentials(email, password) {
  const login = (twoFactorCode) => fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      ...(twoFactorCode ? { twoFactorCode } : {}),
    }),
  });
  let response = await login();
  let json = await response.json().catch(() => ({}));
  const smokeMfaCode = process.env.BACKY_ADMIN_CONTRACT_MFA_CODE
    || process.env.BACKY_SETTINGS_SMOKE_MFA_CODE
    || process.env.BACKY_ADMIN_MFA_CODE
    || process.env.BACKY_ADMIN_2FA_CODE;
  if (!response.ok && json.error?.code === 'MFA_REQUIRED' && smokeMfaCode) {
    response = await login(smokeMfaCode);
    json = await response.json().catch(() => ({}));
  }

  if (!response.ok || json.success === false || !json.data?.session?.token) {
    throw new Error(`Unable to create admin session for ${email}: ${JSON.stringify(json).slice(0, 500)}`);
  }

  return json.data.session.token;
}

async function ensureOwnerSession() {
  if (contractOwnerSessionToken) return contractOwnerSessionToken;

  const unique = Date.now().toString(36);
  await loginAdminApi();
  const createOwner = await request('/api/admin/users', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      fullName: `Contract Owner ${unique}`,
      email: contractEmail(`contract-owner-${unique}`),
      role: 'owner',
      status: 'invited',
    }),
  });
  assert(createOwner.response.status === 201, `${createOwner.url} expected owner create 201, got ${createOwner.response.status}: ${JSON.stringify(createOwner.json).slice(0, 500)}`);
  contractOwnerUserId = createOwner.json?.data?.user?.id;
  assert(contractOwnerUserId, `${createOwner.url} missing owner user id`);

  const invite = await request(`/api/admin/users/${contractOwnerUserId}/invite-link`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ expiresInMinutes: 60 }),
  });
  assert(invite.response.status === 200, `${invite.url} expected owner invite 200, got ${invite.response.status}`);
  const token = invite.json?.data?.invite?.token;
  assert(token, `${invite.url} missing owner invite token`);

  const accept = await fetch(`${baseUrl}/api/admin/auth/accept-invite`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ token }),
  });
  const acceptJson = await accept.json().catch(() => ({}));
  assert(accept.ok && acceptJson?.data?.session?.token, `Owner invite accept failed: ${JSON.stringify(acceptJson).slice(0, 500)}`);
  contractOwnerSessionToken = acceptJson.data.session.token;
  return contractOwnerSessionToken;
}

async function requestOwnerOnly(pathOrUrl, init) {
  const ownerToken = await ensureOwnerSession();
  return requestWithSession(pathOrUrl, ownerToken, init);
}

async function cleanup() {
  if (createdSiteId && createdPostId) {
    await request(`/api/admin/sites/${createdSiteId}/blog/${createdPostId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (createdSiteId && capturedTemplatePostId) {
    await request(`/api/admin/sites/${createdSiteId}/blog/${capturedTemplatePostId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (createdSiteId && createdPageId) {
    await request(`/api/admin/sites/${createdSiteId}/pages/${createdPageId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (createdSiteId && capturedTemplatePageId) {
    await request(`/api/admin/sites/${createdSiteId}/pages/${capturedTemplatePageId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (createdSiteId && routeConflictCleanupPageId) {
    await request(`/api/admin/sites/${createdSiteId}/pages/${routeConflictCleanupPageId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (createdSiteId && createdCategoryId) {
    await request(`/api/admin/sites/${createdSiteId}/blog/categories/${createdCategoryId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (createdSiteId && createdTagId) {
    await request(`/api/admin/sites/${createdSiteId}/blog/tags/${createdTagId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (createdSiteId && createdCollectionId && createdCollectionRecordId) {
    await request(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}/records/${createdCollectionRecordId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (createdSiteId && createdCollectionId) {
    await request(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (createdSiteId && createdReferenceCollectionId && createdReferenceRecordId) {
    await request(`/api/admin/sites/${createdSiteId}/collections/${createdReferenceCollectionId}/records/${createdReferenceRecordId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (createdSiteId && createdReferenceCollectionId) {
    await request(`/api/admin/sites/${createdSiteId}/collections/${createdReferenceCollectionId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (createdSiteId && createdNestedReferenceCollectionId && createdNestedReferenceRecordId) {
    await request(`/api/admin/sites/${createdSiteId}/collections/${createdNestedReferenceCollectionId}/records/${createdNestedReferenceRecordId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (createdSiteId && createdNestedReferenceCollectionId) {
    await request(`/api/admin/sites/${createdSiteId}/collections/${createdNestedReferenceCollectionId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (createdSiteId && commerceProductsCollectionId && commerceFutureProductRecordId) {
    await request(`/api/admin/sites/${createdSiteId}/collections/${commerceProductsCollectionId}/records/${commerceFutureProductRecordId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (createdSiteId && commerceProductsCollectionId && commercePastProductRecordId) {
    await request(`/api/admin/sites/${createdSiteId}/collections/${commerceProductsCollectionId}/records/${commercePastProductRecordId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (createdSiteId && commerceProductsCollectionId) {
    await request(`/api/admin/sites/${createdSiteId}/collections/${commerceProductsCollectionId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (createdSiteId && createdReusableSectionId) {
    await request(`/api/admin/sites/${createdSiteId}/reusable-sections/${createdReusableSectionId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (createdSiteId && createdReusableInstancePageId) {
    await request(`/api/admin/sites/${createdSiteId}/pages/${createdReusableInstancePageId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (createdSiteId && createdMediaFolderId) {
    await request(`/api/admin/sites/${createdSiteId}/media/folders/${createdMediaFolderId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (createdSiteId && createdMediaId) {
    await request(`/api/admin/sites/${createdSiteId}/media/${createdMediaId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (createdSiteId && createdImageMediaId) {
    await request(`/api/admin/sites/${createdSiteId}/media/${createdImageMediaId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (createdSiteId) {
    await requestOwnerOnly(`/api/admin/sites/${createdSiteId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (createdUserId) {
    await request(`/api/admin/users/${createdUserId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (contractOwnerUserId) {
    await request(`/api/admin/users/${contractOwnerUserId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (originalUserAdminRole && originalUserAdminStatus) {
    await request('/api/admin/users/user-admin', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        role: originalUserAdminRole,
        status: originalUserAdminStatus,
      }),
    }).catch(() => {});
  }

  if (createdSafeguardUserId) {
    await request(`/api/admin/users/${createdSafeguardUserId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (originalDeliveryMode) {
    await request('/api/admin/settings', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'contract-page-comment-clear-reports',
      },
      body: JSON.stringify({
        deliveryMode: originalDeliveryMode,
        ...(originalSettingsIntegrations ? { integrations: originalSettingsIntegrations } : {}),
      }),
    }).catch(() => {});
  }
}

function assertProductSubscriptionActionPlanSource() {
  const productsRouteSource = fs.readFileSync(
    new URL('../../admin/src/routes/products.tsx', import.meta.url),
    'utf8',
  );
  const lifecycleRouteSource = fs.readFileSync(
    new URL('../src/app/api/admin/sites/[siteId]/commerce/products/[productId]/subscriptions/route.ts', import.meta.url),
    'utf8',
  );

  assert(lifecycleRouteSource.includes('buildSubscriptionActionPlan'), 'product subscription lifecycle API must build per-order action plans');
  assert(lifecycleRouteSource.includes('backy.product-subscription-action-plan.v1'), 'product subscription lifecycle API must expose the action-plan schema');
  assert(lifecycleRouteSource.includes('backy.product-subscription-action-plan-summary.v1'), 'product subscription lifecycle API must expose the action-plan summary schema');
  assert(lifecycleRouteSource.includes('availableActions') && lifecycleRouteSource.includes('handoffRequired'), 'product subscription lifecycle API must expose action availability and handoff state');
  assert(productsRouteSource.includes('data-testid="products-subscription-action-plan"'), 'Products page must render the subscription action-plan panel');
  assert(productsRouteSource.includes('subscription.actionPlan.recommendation'), 'Products page must render per-subscription action recommendations');
  assert(productsRouteSource.includes('subscription.actionPlan.handoffRequired'), 'Products page must render per-subscription handoff warnings');
}

if (process.env.BACKY_ADMIN_CONTRACT_SOURCE_GUARD === '1') {
  assertInteractiveSandboxRouteSource();
  assertInteractiveContractSource();
  assertHostedFeedErrorContractSource();
  assertSiteSettingsLocalizationSource();
  assertNavigationContractSource();
  assertAdminSettingsContractSource();
  assertAdminPageContentValidationSource();
  assertProductSubscriptionActionPlanSource();
  console.log(JSON.stringify({ ok: true, guard: 'admin-contract-source' }));
  process.exit(0);
}

try {
  assertInteractiveSandboxRouteSource();
  assertHostedFeedErrorContractSource();
  assertSiteSettingsLocalizationSource();
  assertNavigationContractSource();
  assertAdminPageContentValidationSource();
  assertProductSubscriptionActionPlanSource();
  await loginAdminApi();
  const initialSettings = await request('/api/admin/settings');
  const allowedAdminDomains = parseAllowedEmailDomains(initialSettings.json?.data?.settings?.auth?.allowedEmailDomains);
  adminContractEmailDomain = allowedAdminDomains[0] || 'backy.test';
  const unique = Date.now().toString();
  const siteSlug = `admin-contract-site-${unique}`;
  const customDomain = `${siteSlug}.example.test`;
  const pageSlug = `admin-contract-page-${unique}`;
  const postSlug = `admin-contract-post-${unique}`;
  const categorySlug = `admin-contract-category-${unique}`;
  const tagSlug = `admin-contract-tag-${unique}`;
  const collectionSlug = `admin-contract-collection-${unique}`;
  const collectionRecordSlug = `admin-contract-record-${unique}`;
  const referenceCollectionSlug = `admin-contract-authors-${unique}`;
  const referenceRecordSlug = `admin-contract-author-${unique}`;
  const nestedReferenceCollectionSlug = `admin-contract-companies-${unique}`;
  const nestedReferenceRecordSlug = `admin-contract-company-${unique}`;
  const dynamicTemplateCollectionSlug = `admin-contract-template-${unique}`;
  const dynamicTemplateRecordSlug = `admin-contract-template-record-${unique}`;
  const futureProductSlug = `admin-contract-future-product-${unique}`;
  const pastProductSlug = `admin-contract-past-product-${unique}`;
  const boundPageSlug = `admin-contract-bound-page-${unique}`;
  const routeConflictPageSlug = `admin-contract-route-conflict-${unique}`;
  const adminDevOrigins = ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:4173'];

  await record('api cors allows local admin dev origin', async () => {
    for (const adminDevOrigin of adminDevOrigins) {
      const preflight = await request('/api/admin/sites', {
        method: 'OPTIONS',
        headers: {
          origin: adminDevOrigin,
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'content-type,x-backy-admin-key',
        },
      });
      assert(preflight.response.status === 204, `${preflight.url} expected 204 preflight for ${adminDevOrigin}, got ${preflight.response.status}`);
      assert(preflight.response.headers.get('access-control-allow-origin') === adminDevOrigin, `${preflight.url} missing allowed origin ${adminDevOrigin}`);
      assert(preflight.response.headers.get('access-control-allow-methods')?.includes('GET'), `${preflight.url} missing allowed methods`);
      assert(preflight.response.headers.get('access-control-allow-headers')?.toLowerCase().includes('x-backy-admin-key'), `${preflight.url} missing admin key header`);
      assert(preflight.response.headers.get('access-control-expose-headers')?.toLowerCase().includes('x-backy-request-id'), `${preflight.url} missing exposed request id header`);
      assert(preflight.response.headers.get('access-control-expose-headers')?.toLowerCase().includes('x-backy-contract-version'), `${preflight.url} missing exposed public contract header`);
      assert(preflight.response.headers.get('x-backy-request-id'), `${preflight.url} missing request id header`);

      const actual = await request('/api/admin/sites?includeUnpublished=true', {
        headers: {
          origin: adminDevOrigin,
        },
      });
      assert(actual.response.status === 200, `${actual.url} expected 200 for ${adminDevOrigin}, got ${actual.response.status}`);
      assert(actual.response.headers.get('access-control-allow-origin') === adminDevOrigin, `${actual.url} missing CORS header for ${adminDevOrigin}`);
      assert(actual.response.headers.get('access-control-expose-headers')?.toLowerCase().includes('x-backy-request-id'), `${actual.url} missing exposed request id header for ${adminDevOrigin}`);
      assert(actual.response.headers.get('access-control-expose-headers')?.toLowerCase().includes('x-backy-cache-scope'), `${actual.url} missing exposed cache scope header for ${adminDevOrigin}`);
      assert(actual.response.headers.get('x-backy-request-id'), `${actual.url} missing request id header`);
    }
  });

  await record('admin sites list returns success envelope', async () => {
    const unauthSites = await fetch(`${baseUrl}/api/admin/sites?includeUnpublished=true`);
    const unauthSitesJson = await unauthSites.json().catch(() => ({}));
    assert(unauthSites.status === 401, `Sites admin API should reject missing auth, got ${unauthSites.status}`);
    assert(unauthSitesJson?.success === false && unauthSitesJson?.error?.code === 'UNAUTHORIZED', `Sites admin API missing auth envelope: ${JSON.stringify(unauthSitesJson).slice(0, 500)}`);

    const result = await request('/api/admin/sites?includeUnpublished=true');
    assert(result.response.status === 200, `${result.url} expected 200, got ${result.response.status}`);
    assert(result.json?.success === true, `${result.url} expected success envelope`);
    assert(Array.isArray(result.json?.data?.sites), `${result.url} expected sites array`);
  });

  await record('admin sites create validates and persists site', async () => {
    const { response, json, url } = await request('/api/admin/sites', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Admin Contract Site',
        slug: siteSlug,
        description: 'Temporary contract smoke site',
        status: 'draft',
      }),
    });

    assert(response.status === 201, `${url} expected 201, got ${response.status}`);
    assert(json?.success === true, `${url} expected success envelope`);
    assert(json?.data?.site?.slug === siteSlug, `${url} returned wrong site slug`);
    assert(json?.data?.site?.status === 'draft', `${url} returned wrong site status`);
    createdSiteId = json.data.site.id;

    const publicDraft = await request(`/api/sites?identifier=${siteSlug}`);
    assert(publicDraft.response.status === 404, `${publicDraft.url} expected draft site to be hidden`);
    assertBackyContract(publicDraft, 'error');
    assert(publicDraft.json?.success === false, `${publicDraft.url} expected error envelope`);

    const draftManifest = await request(`/api/sites/${createdSiteId}/manifest`);
    assert(draftManifest.response.status === 404, `${draftManifest.url} expected draft site manifest to be hidden`);
    assert(draftManifest.json?.success === false, `${draftManifest.url} expected error envelope`);
    assert(draftManifest.response.headers.get('cache-control') === 'no-store', `${draftManifest.url} expected hidden manifest to be no-store`);

    const draftNavigation = await request(`/api/sites/${createdSiteId}/navigation`);
    assert(draftNavigation.response.status === 404, `${draftNavigation.url} expected draft site navigation to be hidden`);
    assert(draftNavigation.json?.success === false, `${draftNavigation.url} expected error envelope`);
    assert(draftNavigation.response.headers.get('cache-control') === 'no-store', `${draftNavigation.url} expected hidden navigation to be no-store`);

    const draftOpenApi = await request(`/api/sites/${createdSiteId}/openapi`);
    assert(draftOpenApi.response.status === 404, `${draftOpenApi.url} expected draft site OpenAPI to be hidden`);
    assert(draftOpenApi.json?.success === false, `${draftOpenApi.url} expected error envelope`);
    assert(draftOpenApi.response.headers.get('cache-control') === 'no-store', `${draftOpenApi.url} expected hidden OpenAPI to be no-store`);

    const draftSandbox = await request(`/api/sites/${createdSiteId}/interactive-components/backy.custom.sandboxed/1.0.0/sandbox`);
    assert(draftSandbox.response.status === 404, `${draftSandbox.url} expected draft site sandbox to be hidden`);
    assert(draftSandbox.response.headers.get('cache-control') === 'no-store', `${draftSandbox.url} expected hidden sandbox to be no-store`);
    assert(draftSandbox.response.headers.get('content-security-policy')?.includes("default-src 'none'"), `${draftSandbox.url} missing locked-down sandbox error CSP`);
  });

  await record('admin sites duplicate slug is rejected', async () => {
    const { response, json, url } = await request('/api/admin/sites', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Duplicate Admin Contract Site',
        slug: siteSlug,
      }),
    });

    assert(response.status === 409, `${url} expected 409, got ${response.status}`);
    assert(json?.success === false, `${url} expected error envelope`);
    assert(json?.error?.code === 'SLUG_CONFLICT', `${url} expected SLUG_CONFLICT`);
  });

  await record('admin site settings scope read/update persists site-owned settings', async () => {
    const detail = await request(`/api/admin/sites/${createdSiteId}/settings`);
    assert(detail.response.status === 200, `${detail.url} expected 200, got ${detail.response.status}`);
    assertAdminContract(detail);
    assert(detail.response.headers.get('x-backy-schema-version') === 'backy.site-settings-scope.v1', `${detail.url} missing site settings schema version header`);
    assert(detail.response.headers.get('x-backy-site-id') === createdSiteId, `${detail.url} missing site id header`);
    const scopedSettings = detail.json?.data?.settings;
    assert(scopedSettings?.schemaVersion === 'backy.site-settings-scope.v1', `${detail.url} returned wrong site settings schema`);
    assert(scopedSettings?.scope?.level === 'site', `${detail.url} missing site scope level`);
    assert(scopedSettings?.scope?.siteId === createdSiteId, `${detail.url} returned wrong site scope id`);
    assert(scopedSettings?.scope?.workspaceSettingsScope === 'global', `${detail.url} missing global workspace settings scope`);
    assert(scopedSettings?.scope?.siteSettingsScope === 'site', `${detail.url} missing site settings scope`);
    assert(scopedSettings?.workspaceSettings, `${detail.url} missing workspace settings summary`);
    assert(scopedSettings?.siteSettings, `${detail.url} missing site settings payload`);
    assert(scopedSettings?.effectiveSettings?.workspace, `${detail.url} missing effective workspace settings`);
    assert(scopedSettings?.effectiveSettings?.site, `${detail.url} missing effective site settings`);
    assert(scopedSettings?.endpoints?.workspaceSettings === '/api/admin/settings', `${detail.url} missing workspace settings endpoint`);
    assert(scopedSettings?.endpoints?.siteSettings === `/api/admin/sites/${createdSiteId}/settings`, `${detail.url} missing site settings endpoint`);
    const siteFrontendDatabaseCertification = scopedSettings?.frontendDatabaseCertification;
    assert(siteFrontendDatabaseCertification?.schemaVersion === 'backy.frontend-database-certification.v1', `${detail.url} missing site frontend database certification schema`);
    assert(siteFrontendDatabaseCertification?.status === 'external-database-gate', `${detail.url} missing site frontend database certification status`);
    assert(siteFrontendDatabaseCertification?.source === 'admin-site-settings-api', `${detail.url} missing site frontend database certification source`);
    assert(siteFrontendDatabaseCertification?.gate?.command === 'npm run ci:sdk-postgres-smoke', `${detail.url} missing site frontend database certification gate`);
    assert(siteFrontendDatabaseCertification?.operatorEnvTemplate?.schemaVersion === 'backy.frontend-database-certification-env-template.v1', `${detail.url} missing site frontend database env-template schema`);
    assert(siteFrontendDatabaseCertification?.scenarioEvidence?.schemaVersion === 'backy.frontend-database-certification-evidence.v1', `${detail.url} missing site frontend database scenario evidence`);
    assert(!JSON.stringify(siteFrontendDatabaseCertification).includes('postgres://'), `${detail.url} exposed a database URL in site frontend database certification`);
    assert(!JSON.stringify(siteFrontendDatabaseCertification).includes('SERVICE_ROLE'), `${detail.url} exposed service-role material in site frontend database certification`);

    const update = await request(`/api/admin/sites/${createdSiteId}/settings`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        settings: {
          seo: {
            defaultDescription: 'Scoped settings smoke description',
          },
          commentPolicy: {
            moderationMode: 'auto-approve',
            blockedTerms: ['scoped-smoke-term'],
          },
          localization: {
            defaultLocale: 'en',
            localeStrategy: 'path-prefix',
            locales: [
              { code: 'en', label: 'English', default: true, direction: 'ltr', pathPrefix: '' },
              { code: 'fr', label: 'French', direction: 'ltr', pathPrefix: '/fr' },
              { code: 'ar', label: 'Arabic', direction: 'rtl', pathPrefix: '/ar' },
            ],
          },
        },
      }),
    });

    assert(update.response.status === 200, `${update.url} expected 200, got ${update.response.status}`);
    assertAdminContract(update);
    assert(update.response.headers.get('x-backy-schema-version') === 'backy.site-settings-scope.v1', `${update.url} missing site settings schema version header`);
    assert(update.response.headers.get('x-backy-site-id') === createdSiteId, `${update.url} missing site id header`);
    assert(update.json?.data?.settings?.schemaVersion === 'backy.site-settings-scope.v1', `${update.url} returned wrong site settings schema`);
    assert(update.json?.data?.settings?.siteSettings?.seo?.defaultDescription === 'Scoped settings smoke description', `${update.url} did not persist site SEO setting`);
    assert(update.json?.data?.settings?.siteSettings?.commentPolicy?.moderationMode === 'auto-approve', `${update.url} did not persist comment policy mode`);
    assert(update.json?.data?.settings?.siteSettings?.commentPolicy?.blockedTerms?.includes('scoped-smoke-term'), `${update.url} did not persist blocked term`);
    assert(update.json?.data?.settings?.siteSettings?.localization?.defaultLocale === 'en', `${update.url} did not persist default locale`);
    assert(update.json?.data?.settings?.siteSettings?.localization?.localeStrategy === 'path-prefix', `${update.url} did not persist locale strategy`);
    assert(update.json?.data?.settings?.siteSettings?.localization?.locales?.some((locale) => (
      locale.code === 'fr' && locale.label === 'French' && locale.pathPrefix === '/fr' && locale.direction === 'ltr'
    )), `${update.url} did not persist normalized French locale`);
    assert(update.json?.data?.settings?.siteSettings?.localization?.locales?.some((locale) => (
      locale.code === 'ar' && locale.pathPrefix === '/ar' && locale.direction === 'rtl'
    )), `${update.url} did not persist normalized RTL locale`);
    assert(update.json?.data?.settings?.effectiveSettings?.site?.localization?.localeStrategy === 'path-prefix', `${update.url} did not expose localization in effective site settings`);
    assert(update.json?.data?.settings?.siteSettings?.unknownPlatformSetting === undefined, `${update.url} persisted a non-allowlisted setting`);

    const mixedUnsupported = await request(`/api/admin/sites/${createdSiteId}/settings`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        settings: {
          seo: {
            defaultDescription: 'This mixed unsupported patch must not persist',
          },
          apiKeys: {
            adminKey: 'must-not-be-accepted-through-site-settings',
          },
        },
      }),
    });
    assert(mixedUnsupported.response.status === 400, `${mixedUnsupported.url} expected mixed unsupported patch 400, got ${mixedUnsupported.response.status}`);
    assertAdminContract(mixedUnsupported);
    assert(mixedUnsupported.response.headers.get('x-backy-schema-version') === 'backy.site-settings-scope.v1', `${mixedUnsupported.url} missing site settings error schema version header`);
    assert(mixedUnsupported.json?.success === false, `${mixedUnsupported.url} expected error envelope`);
    assert(mixedUnsupported.json?.error?.code === 'UNSUPPORTED_SITE_SETTINGS_KEYS', `${mixedUnsupported.url} expected UNSUPPORTED_SITE_SETTINGS_KEYS`);

    const unsupportedOnly = await request(`/api/admin/sites/${createdSiteId}/settings`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        settings: {
          unknownPlatformSetting: 'must-be-rejected',
        },
      }),
    });
    assert(unsupportedOnly.response.status === 400, `${unsupportedOnly.url} expected unsupported-only patch 400, got ${unsupportedOnly.response.status}`);
    assertAdminContract(unsupportedOnly);
    assert(unsupportedOnly.response.headers.get('x-backy-schema-version') === 'backy.site-settings-scope.v1', `${unsupportedOnly.url} missing site settings error schema version header`);
    assert(unsupportedOnly.json?.success === false, `${unsupportedOnly.url} expected error envelope`);
    assert(unsupportedOnly.json?.error?.code === 'NO_SITE_SETTINGS_CHANGES', `${unsupportedOnly.url} expected NO_SITE_SETTINGS_CHANGES`);

    const readBack = await request(`/api/admin/sites/${createdSiteId}/settings`);
    assert(readBack.response.status === 200, `${readBack.url} expected readback 200, got ${readBack.response.status}`);
    assert(readBack.json?.data?.settings?.siteSettings?.seo?.defaultDescription === 'Scoped settings smoke description', `${readBack.url} did not read back site SEO setting`);
    assert(readBack.json?.data?.settings?.siteSettings?.commentPolicy?.blockedTerms?.includes('scoped-smoke-term'), `${readBack.url} did not read back blocked term`);
    assert(readBack.json?.data?.settings?.siteSettings?.localization?.locales?.some((locale) => (
      locale.code === 'fr' && locale.pathPrefix === '/fr'
    )), `${readBack.url} did not read back site localization setting`);

    const audit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=site&entityId=${createdSiteId}&action=${encodeURIComponent('site.settings.updated')}&requestId=${update.json.requestId}`);
    assert(audit.response.status === 200, `${audit.url} expected site settings audit readback`);
    assert(audit.json?.data?.logs?.some((entry) => (
      entry.entity === 'site' &&
      entry.entityId === createdSiteId &&
      entry.action === 'site.settings.updated' &&
      entry.requestId === update.json.requestId &&
      entry.metadata?.source === 'admin-site-settings-api' &&
      entry.metadata?.changedKeys?.includes('seo') &&
      entry.metadata?.changedKeys?.includes('commentPolicy') &&
      entry.metadata?.changedKeys?.includes('localization') &&
      !entry.metadata?.changedKeys?.includes('unknownPlatformSetting')
    )), `${audit.url} missing site settings update audit metadata`);
  });

  await record('admin sites detail and update return edited site', async () => {
    const detail = await request(`/api/admin/sites/${createdSiteId}`);
    assert(detail.response.status === 200, `${detail.url} expected 200, got ${detail.response.status}`);
    assert(detail.json?.data?.site?.id === createdSiteId, `${detail.url} returned wrong site`);

    const update = await request(`/api/admin/sites/${createdSiteId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        description: 'Updated contract smoke site',
        customDomain,
        status: 'published',
      }),
    });

    assert(update.response.status === 200, `${update.url} expected 200, got ${update.response.status}`);
    assert(update.json?.success === true, `${update.url} expected success envelope`);
    assert(update.json?.data?.site?.status === 'published', `${update.url} expected published status`);
    assert(update.json?.data?.site?.description === 'Updated contract smoke site', `${update.url} expected updated description`);
    assert(update.json?.data?.site?.customDomain === customDomain, `${update.url} expected updated custom domain`);

    const publicSiteBySlug = await request(`/api/sites?identifier=${siteSlug}`);
    assert(publicSiteBySlug.response.status === 200, `${publicSiteBySlug.url} expected 200, got ${publicSiteBySlug.response.status}`);
    assertBackyContract(publicSiteBySlug, 'discovery');
    assert(publicSiteBySlug.response.headers.get('x-backy-site-id') === createdSiteId, `${publicSiteBySlug.url} missing site id header`);
    const publicSiteBySlugCacheRevision = publicSiteBySlug.response.headers.get('x-backy-cache-revision');
    assert(publicSiteBySlugCacheRevision, `${publicSiteBySlug.url} missing site discovery cache revision`);
    const publicSiteBySlugEtag = publicSiteBySlug.response.headers.get('etag');
    assert(publicSiteBySlugEtag?.startsWith('"backy-'), `${publicSiteBySlug.url} missing site discovery etag`);
    const revalidatedPublicSiteBySlug = await request(`/api/sites?identifier=${siteSlug}`, {
      headers: { 'if-none-match': publicSiteBySlugEtag },
    });
    assert(revalidatedPublicSiteBySlug.response.status === 304, `${revalidatedPublicSiteBySlug.url} expected site discovery 304, got ${revalidatedPublicSiteBySlug.response.status}`);
    assert(revalidatedPublicSiteBySlug.response.headers.get('etag') === publicSiteBySlugEtag, `${revalidatedPublicSiteBySlug.url} expected matching site discovery etag`);
    assert(revalidatedPublicSiteBySlug.response.headers.get('x-backy-cache-revision') === publicSiteBySlugCacheRevision, `${revalidatedPublicSiteBySlug.url} expected matching site discovery cache revision`);
    assert(publicSiteBySlug.json?.success === true, `${publicSiteBySlug.url} expected success envelope`);
    assert(publicSiteBySlug.json?.data?.site?.id === createdSiteId, `${publicSiteBySlug.url} returned wrong site`);

    const publicSiteByDomain = await request(`/api/sites?identifier=${customDomain}`);
    assert(publicSiteByDomain.response.status === 200, `${publicSiteByDomain.url} expected 200, got ${publicSiteByDomain.response.status}`);
    assertBackyContract(publicSiteByDomain, 'discovery');
    assert(publicSiteByDomain.response.headers.get('x-backy-cache-revision'), `${publicSiteByDomain.url} missing domain site discovery cache revision`);
    assert(publicSiteByDomain.json?.data?.site?.id === createdSiteId, `${publicSiteByDomain.url} did not resolve custom domain`);
    assert(publicSiteByDomain.response.headers.get('x-ratelimit-limit'), `${publicSiteByDomain.url} missing discovery rate-limit header`);

    const publicSiteByCanonicalDomainUrl = await request(`/api/sites?identifier=${encodeURIComponent(`https://www.${customDomain}/products?ref=contract`)}`);
    assert(publicSiteByCanonicalDomainUrl.response.status === 200, `${publicSiteByCanonicalDomainUrl.url} expected 200, got ${publicSiteByCanonicalDomainUrl.response.status}`);
    assertBackyContract(publicSiteByCanonicalDomainUrl, 'discovery');
    assert(publicSiteByCanonicalDomainUrl.json?.data?.site?.id === createdSiteId, `${publicSiteByCanonicalDomainUrl.url} did not resolve canonicalized custom domain URL`);

    const publicSiteList = await request('/api/sites');
    assert(publicSiteList.response.status === 200, `${publicSiteList.url} expected 200, got ${publicSiteList.response.status}`);
    assertBackyContract(publicSiteList, 'discovery');
    assert(publicSiteList.json?.success === true, `${publicSiteList.url} expected success envelope`);
    assert(publicSiteList.json?.data?.sites?.some((site) => site.id === createdSiteId), `${publicSiteList.url} missing published temporary site`);

    const pagedPublicSiteList = await request('/api/sites?limit=1&offset=0');
    assert(pagedPublicSiteList.response.status === 200, `${pagedPublicSiteList.url} expected 200, got ${pagedPublicSiteList.response.status}`);
    assertBackyContract(pagedPublicSiteList, 'discovery');
    assert(pagedPublicSiteList.json?.success === true, `${pagedPublicSiteList.url} expected success envelope`);
    assert(Array.isArray(pagedPublicSiteList.json?.data?.sites), `${pagedPublicSiteList.url} expected paged sites array`);
    assert(pagedPublicSiteList.json.data.sites.length <= 1, `${pagedPublicSiteList.url} returned more sites than requested`);
    assert(pagedPublicSiteList.json?.data?.pagination?.limit === 1, `${pagedPublicSiteList.url} expected pagination limit=1`);
    assert(pagedPublicSiteList.json?.data?.pagination?.offset === 0, `${pagedPublicSiteList.url} expected pagination offset=0`);
    assert(
      pagedPublicSiteList.json?.data?.pagination?.total >= pagedPublicSiteList.json.data.sites.length,
      `${pagedPublicSiteList.url} expected pagination total to cover returned sites`,
    );
  });

  await record('admin interactive component registry create/review/list/update works for temporary site', async () => {
    createdInteractiveComponentKey = `contract.custom.figure.${unique}`;
    createdInteractiveComponentVersion = '1.0.0';
    const componentPath = `/api/admin/sites/${createdSiteId}/interactive-components/${createdInteractiveComponentKey}/${createdInteractiveComponentVersion}`;
    const sandboxUrl = `/api/sites/${createdSiteId}/interactive-components/${createdInteractiveComponentKey}/${createdInteractiveComponentVersion}/sandbox`;

    const unauth = await fetch(`${baseUrl}/api/admin/sites/${createdSiteId}/interactive-components`);
    const unauthJson = await unauth.json().catch(() => ({}));
    assert(unauth.status === 401, `Interactive component admin API should reject missing auth, got ${unauth.status}`);
    assert(unauthJson?.success === false && unauthJson?.error?.code === 'UNAUTHORIZED', `Interactive component admin API missing auth envelope: ${JSON.stringify(unauthJson).slice(0, 500)}`);

    const create = await request(`/api/admin/sites/${createdSiteId}/interactive-components`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        componentKey: createdInteractiveComponentKey,
        version: createdInteractiveComponentVersion,
        displayName: 'Contract custom figure',
        type: 'codeComponent',
        status: 'disabled',
        reviewStatus: 'draft',
        renderMode: 'sandbox-iframe',
        source: 'custom',
        description: 'Smoke-test sandboxed component registry record.',
        allowedDataScopes: ['collections', 'page', 'blog'],
        requiredFields: ['componentKey', 'version', 'fallback', 'runtime.sandboxUrl'],
        fallback: {
          required: true,
          supported: ['title', 'text', 'html', 'alt', 'ariaLabel'],
        },
        runtime: {
          sandboxUrl,
          iframeSandbox: 'allow-scripts allow-forms',
          allowedPermissions: [],
          postMessageProtocol: 'backy.interactive-component.v1',
        },
        integrity: {
          signed: false,
          signatureRequiredForCustomCode: true,
        },
        dependencyMetadata: {
          packageManager: 'none',
          dependencies: [],
        },
        changelog: 'Initial registry smoke version.',
      }),
    });
    assert(create.response.status === 201, `${create.url} expected 201, got ${create.response.status}`);
    assert(create.json?.data?.component?.componentKey === createdInteractiveComponentKey, `${create.url} returned wrong component key`);
    assert(create.json?.data?.component?.reviewStatus === 'draft', `${create.url} expected draft review status`);
    assert(create.json?.data?.component?.security?.adminApiAccess === false, `${create.url} must force admin API access off`);

    const duplicate = await request(`/api/admin/sites/${createdSiteId}/interactive-components`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        componentKey: createdInteractiveComponentKey,
        version: createdInteractiveComponentVersion,
        displayName: 'Duplicate contract custom figure',
      }),
    });
    assert(duplicate.response.status === 409, `${duplicate.url} expected duplicate version conflict`);
    assert(duplicate.json?.error?.code === 'INTERACTIVE_COMPONENT_VERSION_CONFLICT', `${duplicate.url} expected interactive component conflict code`);

    const list = await request(`/api/admin/sites/${createdSiteId}/interactive-components?status=all&reviewStatus=all&type=codeComponent`);
    assert(list.response.status === 200, `${list.url} expected 200, got ${list.response.status}`);
    assert(list.json?.data?.components?.some((component) => component.componentKey === createdInteractiveComponentKey), `${list.url} missing created registry component`);

    const detail = await request(componentPath);
    assert(detail.response.status === 200, `${detail.url} expected 200, got ${detail.response.status}`);
    assert(detail.json?.data?.component?.runtime?.sandboxUrl === sandboxUrl, `${detail.url} expected sandbox runtime URL`);

    const submitReview = await request(`${componentPath}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'submit',
        updatedBy: 'contract-smoke',
        changelog: 'Submitted by contract smoke.',
      }),
    });
    assert(submitReview.response.status === 200, `${submitReview.url} expected review submit 200, got ${submitReview.response.status}`);
    assert(submitReview.json?.data?.component?.reviewStatus === 'in_review', `${submitReview.url} expected in_review status`);
    assert(submitReview.json?.data?.component?.status === 'disabled', `${submitReview.url} expected submitted component to remain disabled`);

    const unsafeApprove = await request(`${componentPath}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'approve',
        status: 'active',
        reviewStatus: 'approved',
        runtime: {
          sandboxUrl,
          iframeSandbox: 'allow-scripts allow-same-origin',
        },
        integrity: {
          signed: false,
          signatureRequiredForCustomCode: true,
        },
      }),
    });
    assert(unsafeApprove.response.status === 400, `${unsafeApprove.url} expected unsafe approval validation failure`);
    assert(unsafeApprove.json?.error?.code === 'INTERACTIVE_COMPONENT_VALIDATION_FAILED', `${unsafeApprove.url} expected interactive component validation code`);
    assert(
      unsafeApprove.json?.error?.issues?.some((issue) => issue.includes('allow-same-origin')) &&
      unsafeApprove.json?.error?.issues?.some((issue) => issue.includes('signed integrity')),
      `${unsafeApprove.url} expected sandbox and signature validation issues`,
    );

    const remoteSandboxApprove = await request(`${componentPath}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'approve',
        status: 'active',
        reviewStatus: 'approved',
        runtime: {
          sandboxUrl: 'https://components.example.com/backy/remote.html',
          iframeSandbox: 'allow-scripts allow-forms',
          allowedPermissions: [],
          postMessageProtocol: 'backy.interactive-component.v1',
        },
        integrity: {
          signed: true,
          signatureRequiredForCustomCode: true,
        },
      }),
    });
    assert(remoteSandboxApprove.response.status === 400, `${remoteSandboxApprove.url} expected remote sandbox URL validation failure`);
    assert(remoteSandboxApprove.json?.error?.code === 'INTERACTIVE_COMPONENT_VALIDATION_FAILED', `${remoteSandboxApprove.url} expected interactive component validation code`);
    assert(
      remoteSandboxApprove.json?.error?.issues?.some((issue) => issue.includes('/api/sites/:siteId/interactive-components/:componentKey/:version/sandbox')),
      `${remoteSandboxApprove.url} expected Backy sandbox route validation issue`,
    );

    const wrongVersionSandboxApprove = await request(`${componentPath}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'approve',
        status: 'active',
        reviewStatus: 'approved',
        runtime: {
          sandboxUrl: `/api/sites/${createdSiteId}/interactive-components/${createdInteractiveComponentKey}/9.9.9/sandbox`,
          iframeSandbox: 'allow-scripts allow-forms',
          allowedPermissions: [],
          postMessageProtocol: 'backy.interactive-component.v1',
        },
        integrity: {
          signed: true,
          signatureRequiredForCustomCode: true,
        },
      }),
    });
    assert(wrongVersionSandboxApprove.response.status === 400, `${wrongVersionSandboxApprove.url} expected mismatched sandbox version validation failure`);
    assert(wrongVersionSandboxApprove.json?.error?.code === 'INTERACTIVE_COMPONENT_VALIDATION_FAILED', `${wrongVersionSandboxApprove.url} expected interactive component validation code`);
    assert(
      wrongVersionSandboxApprove.json?.error?.issues?.some((issue) => issue.includes('match the component site, key, and version')),
      `${wrongVersionSandboxApprove.url} expected sandbox identity validation issue`,
    );

    const approve = await request(`${componentPath}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'approve',
        reviewedBy: 'contract-smoke',
        runtime: {
          sandboxUrl,
          iframeSandbox: 'allow-scripts allow-forms',
          allowedPermissions: [],
          postMessageProtocol: 'backy.interactive-component.v1',
        },
        integrity: {
          signed: true,
          signatureRequiredForCustomCode: true,
        },
        dependencyMetadata: {
          packageManager: 'none',
          dependencies: [],
          verifiedAt: new Date().toISOString(),
          verifiedBy: 'contract-smoke',
        },
        changelog: 'Approved by contract smoke.',
      }),
    });
    assert(approve.response.status === 200, `${approve.url} expected 200, got ${approve.response.status}`);
    assert(approve.json?.data?.component?.status === 'active', `${approve.url} expected active component`);
    assert(approve.json?.data?.component?.reviewStatus === 'approved', `${approve.url} expected approved component`);
    assert(approve.json?.data?.component?.reviewedBy === 'contract-smoke', `${approve.url} expected review actor`);
    const approvalAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=interactiveComponent&entityId=${approve.json.data.component.id}&action=interactiveComponent.review.approve&requestId=${approve.json.requestId}`);
    assert(approvalAudit.response.status === 200, `${approvalAudit.url} expected approval audit readback`);
    assert(approvalAudit.json?.data?.logs?.some((entry) => entry.metadata?.action === 'approve' && entry.metadata?.reviewStatus === 'approved'), `${approvalAudit.url} missing approval workflow audit metadata`);

    const bundleSource = 'export default function mount() { return "contract-smoke"; }';
    const bundleUpload = await request(`${componentPath}/bundle`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        filename: 'index.js',
        contentType: 'application/javascript',
        contentBase64: Buffer.from(bundleSource, 'utf8').toString('base64'),
        signature: 'sha256=contract-smoke-signature',
        signedBy: 'contract-smoke',
        changelog: 'Stored signed bundle through contract smoke.',
      }),
    });
    assert(bundleUpload.response.status === 200, `${bundleUpload.url} expected bundle upload 200, got ${bundleUpload.response.status}`);
    assert(bundleUpload.json?.data?.bundle?.sha256?.length === 64, `${bundleUpload.url} missing SHA-256 bundle metadata`);
    assert(bundleUpload.json?.data?.bundle?.bundleUrl?.includes('/uploads/sites/'), `${bundleUpload.url} expected stored bundle URL`);
    assert(bundleUpload.json?.data?.component?.runtime?.bundleUrl === bundleUpload.json?.data?.bundle?.bundleUrl, `${bundleUpload.url} did not attach bundle URL to runtime`);
    assert(bundleUpload.json?.data?.component?.integrity?.signed === true, `${bundleUpload.url} expected signed integrity`);
    assert(bundleUpload.json?.data?.component?.integrity?.sha256 === bundleUpload.json?.data?.bundle?.sha256, `${bundleUpload.url} did not persist integrity hash`);
    assert(bundleUpload.json?.data?.component?.dependencyMetadata?.bundle?.storagePath === bundleUpload.json?.data?.bundle?.storagePath, `${bundleUpload.url} missing bundle storage metadata`);
    const bundleAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=interactiveComponent&entityId=${bundleUpload.json.data.component.id}&action=interactiveComponent.bundle.upload&requestId=${bundleUpload.json.requestId}`);
    assert(bundleAudit.response.status === 200, `${bundleAudit.url} expected bundle audit readback`);
    assert(bundleAudit.json?.data?.logs?.some((entry) => entry.metadata?.sha256 === bundleUpload.json.data.bundle.sha256), `${bundleAudit.url} missing bundle upload audit metadata`);

    const exportedComponent = await request(`${componentPath}/export`);
    assert(exportedComponent.response.status === 200, `${exportedComponent.url} expected export package 200, got ${exportedComponent.response.status}`);
    assert(exportedComponent.json?.data?.exportPackage?.schemaVersion === 'backy.interactive-component-export.v1', `${exportedComponent.url} missing export schema`);
    assert(exportedComponent.json?.data?.exportPackage?.component?.componentKey === createdInteractiveComponentKey, `${exportedComponent.url} exported wrong component key`);
    assert(exportedComponent.json?.data?.exportPackage?.import?.targetEndpoint === '/api/admin/sites/{siteId}/interactive-components', `${exportedComponent.url} missing import target metadata`);
    assert(exportedComponent.json?.data?.exportPackage?.bundle?.sandboxUrl === sandboxUrl, `${exportedComponent.url} missing bundle sandbox metadata`);
    assert(exportedComponent.json?.data?.exportPackage?.usageInventoryEndpoint?.endsWith(`/interactive-components/${createdInteractiveComponentKey}/${createdInteractiveComponentVersion}/usage`), `${exportedComponent.url} missing usage inventory link`);

    const importedComponentKey = `${createdInteractiveComponentKey}.imported`;
    const importComponent = await request(`/api/admin/sites/${createdSiteId}/interactive-components`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        exportPackage: exportedComponent.json.data.exportPackage,
        componentKey: importedComponentKey,
        displayName: 'Imported contract custom figure',
      }),
    });
    assert(importComponent.response.status === 201, `${importComponent.url} expected import create 201, got ${importComponent.response.status}`);
    assert(importComponent.json?.data?.component?.componentKey === importedComponentKey, `${importComponent.url} returned wrong imported key`);
    assert(importComponent.json?.data?.component?.status === 'disabled', `${importComponent.url} expected imported component to reset to disabled`);
    assert(importComponent.json?.data?.component?.reviewStatus === 'draft', `${importComponent.url} expected imported component to reset to draft`);
    assert(importComponent.json?.data?.component?.dependencyMetadata?.importExport?.sourceComponentKey === createdInteractiveComponentKey, `${importComponent.url} missing source import metadata`);
    assert(importComponent.json?.data?.component?.dependencyMetadata?.importExport?.importedAt, `${importComponent.url} missing imported timestamp`);
    const removeImportedComponent = await request(`/api/admin/sites/${createdSiteId}/interactive-components/${importedComponentKey}/${createdInteractiveComponentVersion}`, { method: 'DELETE' });
    assert(removeImportedComponent.response.status === 200, `${removeImportedComponent.url} expected imported component cleanup 200`);

    let interactiveUsagePageId = null;
    let interactiveUsagePostId = null;
    try {
      const createUsagePage = await request(`/api/admin/sites/${createdSiteId}/pages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Interactive component usage page',
          slug: `interactive-component-usage-${unique}`,
          status: 'draft',
          content: {
            canvasSize: { width: 1200, height: 900 },
            elements: [
              {
                id: 'usage-page-component',
                type: 'codeComponent',
                componentKey: createdInteractiveComponentKey,
                version: createdInteractiveComponentVersion,
                renderCapabilities: { hydrationMode: 'sandbox-iframe' },
                fallback: {
                  title: 'Usage fallback',
                  text: 'Static fallback for usage inventory smoke.',
                },
              },
            ],
          },
        }),
      });
      assert(createUsagePage.response.status === 201, `${createUsagePage.url} expected usage page create 201`);
      interactiveUsagePageId = createUsagePage.json?.data?.page?.id;

      const createUsagePost = await request(`/api/admin/sites/${createdSiteId}/blog`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Interactive component usage post',
          slug: `interactive-component-usage-post-${unique}`,
          status: 'draft',
          excerpt: 'Smoke post for interactive component usage inventory.',
          content: {
            elements: [
              {
                id: 'usage-post-component',
                type: 'codeComponent',
                componentKey: createdInteractiveComponentKey,
                version: createdInteractiveComponentVersion,
                renderCapabilities: { hydrationMode: 'sandbox-iframe' },
                fallback: {
                  title: 'Usage post fallback',
                  text: 'Static blog fallback for usage inventory smoke.',
                },
              },
            ],
          },
        }),
      });
      assert(createUsagePost.response.status === 201, `${createUsagePost.url} expected usage post create 201`);
      interactiveUsagePostId = createUsagePost.json?.data?.post?.id;

      const usage = await request(`${componentPath}/usage`);
      assert(usage.response.status === 200, `${usage.url} expected usage inventory 200, got ${usage.response.status}`);
      assert(usage.json?.data?.componentKey === createdInteractiveComponentKey, `${usage.url} returned wrong component key`);
      assert(usage.json?.data?.version === createdInteractiveComponentVersion, `${usage.url} returned wrong component version`);
      assert(usage.json?.data?.summary?.total >= 2, `${usage.url} expected page and post usage entries`);
      assert(usage.json?.data?.usage?.some((entry) => (
        entry.targetType === 'page' &&
        entry.targetId === interactiveUsagePageId &&
        entry.elementId === 'usage-page-component' &&
        entry.fallbackConfigured === true
      )), `${usage.url} missing interactive usage page entry`);
      assert(usage.json?.data?.usage?.some((entry) => (
        entry.targetType === 'post' &&
        entry.targetId === interactiveUsagePostId &&
        entry.elementId === 'usage-post-component' &&
        entry.renderMode === 'sandbox-iframe'
      )), `${usage.url} missing interactive usage blog post entry`);
    } finally {
      if (interactiveUsagePageId) {
        await request(`/api/admin/sites/${createdSiteId}/pages/${interactiveUsagePageId}`, { method: 'DELETE' }).catch(() => {});
      }
      if (interactiveUsagePostId) {
        await request(`/api/admin/sites/${createdSiteId}/blog/${interactiveUsagePostId}`, { method: 'DELETE' }).catch(() => {});
      }
    }

    createdInteractiveNewerVersion = '2.0.0';
    const createNewerVersion = await request(`/api/admin/sites/${createdSiteId}/interactive-components`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        componentKey: createdInteractiveComponentKey,
        version: createdInteractiveNewerVersion,
        displayName: 'Contract custom figure v2',
        type: 'codeComponent',
        status: 'active',
        reviewStatus: 'approved',
        renderMode: 'sandbox-iframe',
        source: 'custom',
        description: 'Smoke-test newer sandboxed component version.',
        allowedDataScopes: ['collections', 'page', 'blog'],
        requiredFields: ['componentKey', 'version', 'fallback', 'runtime.sandboxUrl'],
        fallback: {
          required: true,
          supported: ['title', 'text', 'html', 'alt', 'ariaLabel'],
        },
        runtime: {
          sandboxUrl: `/api/sites/${createdSiteId}/interactive-components/${createdInteractiveComponentKey}/${createdInteractiveNewerVersion}/sandbox`,
          iframeSandbox: 'allow-scripts allow-forms',
          allowedPermissions: [],
          postMessageProtocol: 'backy.interactive-component.v1',
        },
        integrity: {
          signed: true,
          signatureRequiredForCustomCode: true,
        },
        dependencyMetadata: {
          packageManager: 'none',
          dependencies: [],
          verifiedAt: new Date().toISOString(),
          verifiedBy: 'contract-smoke',
        },
        changelog: 'Newer registry smoke version.',
      }),
    });
    assert(createNewerVersion.response.status === 201, `${createNewerVersion.url} expected newer version 201`);
    assert(createNewerVersion.json?.data?.component?.version === createdInteractiveNewerVersion, `${createNewerVersion.url} returned wrong newer version`);

    let migrationPageId = null;
    try {
      const createMigrationPage = await request(`/api/admin/sites/${createdSiteId}/pages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Interactive component migration page',
          slug: `interactive-component-migration-${unique}`,
          status: 'draft',
          content: {
            canvasSize: { width: 1200, height: 900 },
            elements: [
              {
                id: 'migration-code-component',
                type: 'codeComponent',
                componentKey: createdInteractiveComponentKey,
                version: createdInteractiveComponentVersion,
                renderCapabilities: { hydrationMode: 'sandbox-iframe' },
                sandboxUrl,
                fallback: {
                  title: 'Migration fallback',
                  text: 'Static fallback before migration.',
                },
              },
            ],
          },
        }),
      });
      assert(createMigrationPage.response.status === 201, `${createMigrationPage.url} expected migration page create 201`);
      migrationPageId = createMigrationPage.json?.data?.page?.id;

      const migrationDryRun = await request(`${componentPath}/migrate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          targetVersion: createdInteractiveNewerVersion,
          dryRun: true,
        }),
      });
      assert(migrationDryRun.response.status === 200, `${migrationDryRun.url} expected migration dry-run 200, got ${migrationDryRun.response.status}`);
      assert(migrationDryRun.json?.data?.dryRun === true, `${migrationDryRun.url} expected dryRun true`);
      assert(migrationDryRun.json?.data?.summary?.elements >= 1, `${migrationDryRun.url} expected at least one migrated element preview`);
      assert(migrationDryRun.json?.data?.migratedTargets?.some((target) => (
        target.targetType === 'page' &&
        target.targetId === migrationPageId &&
        target.elementPaths?.some((path) => path.includes('migration-code-component') || path.includes('elements[0]'))
      )), `${migrationDryRun.url} missing migration page dry-run target`);

      const migrationApply = await request(`${componentPath}/migrate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          targetVersion: createdInteractiveNewerVersion,
          dryRun: false,
          updatedBy: 'contract-smoke',
        }),
      });
      assert(migrationApply.response.status === 200, `${migrationApply.url} expected migration apply 200, got ${migrationApply.response.status}`);
      assert(migrationApply.json?.data?.dryRun === false, `${migrationApply.url} expected dryRun false`);
      assert(migrationApply.json?.data?.summary?.elements >= 1, `${migrationApply.url} expected applied migrated elements`);

      const migratedPage = await request(`/api/admin/sites/${createdSiteId}/pages/${migrationPageId}`);
      const migratedElement = migratedPage.json?.data?.page?.content?.elements?.find((element) => element.id === 'migration-code-component');
      assert(migratedPage.response.status === 200, `${migratedPage.url} expected migrated page readback 200`);
      assert(migratedElement?.componentKey === createdInteractiveComponentKey, `${migratedPage.url} changed component key unexpectedly`);
      assert(migratedElement?.version === createdInteractiveNewerVersion, `${migratedPage.url} did not migrate component version`);
      assert(migratedElement?.renderCapabilities?.hydrationMode === 'sandbox-iframe', `${migratedPage.url} did not preserve sandbox hydration mode`);

      const migrationAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=interactiveComponent&entityId=${createNewerVersion.json.data.component.id}&action=interactiveComponent.migrate&requestId=${migrationApply.json.requestId}`);
      assert(migrationAudit.response.status === 200, `${migrationAudit.url} expected migration audit readback`);
      assert(migrationAudit.json?.data?.logs?.some((entry) => (
        entry.action === 'interactiveComponent.migrate' &&
        entry.metadata?.sourceVersion === createdInteractiveComponentVersion &&
        entry.metadata?.targetVersion === createdInteractiveNewerVersion
      )), `${migrationAudit.url} missing migration audit metadata`);
    } finally {
      if (migrationPageId) {
        await request(`/api/admin/sites/${createdSiteId}/pages/${migrationPageId}`, { method: 'DELETE' }).catch(() => {});
      }
    }

    const rollback = await request(`${componentPath}/rollback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rollbackBy: 'contract-smoke',
        changelog: 'Rolled back to initial registry smoke version.',
      }),
    });
    assert(rollback.response.status === 200, `${rollback.url} expected rollback 200, got ${rollback.response.status}`);
    assert(rollback.json?.data?.rolledBack === true, `${rollback.url} expected rolledBack true`);
    assert(rollback.json?.data?.component?.version === createdInteractiveComponentVersion, `${rollback.url} restored wrong version`);
    assert(rollback.json?.data?.component?.status === 'active', `${rollback.url} did not reactivate target version`);
    assert(rollback.json?.data?.component?.rollbackFromVersion === createdInteractiveNewerVersion, `${rollback.url} missing rollback source version`);
    assert(rollback.json?.data?.disabledVersions?.some((component) => component.version === createdInteractiveNewerVersion && component.status === 'disabled'), `${rollback.url} did not disable newer active version`);
    const rollbackAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=interactiveComponent&entityId=${rollback.json.data.component.id}&action=interactiveComponent.rollback&requestId=${rollback.json.requestId}`);
    assert(rollbackAudit.response.status === 200, `${rollbackAudit.url} expected interactive component rollback audit readback`);
    assert(rollbackAudit.json?.data?.logs?.[0]?.metadata?.restoredFromVersion === createdInteractiveNewerVersion, `${rollbackAudit.url} missing rollback source metadata`);
  });

  await record('admin frontend design import connects external template', async () => {
    let importedTemplatePageId = null;
    try {
      const importDesign = await request(`/api/admin/sites/${createdSiteId}/frontend-design`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'import-frontend-contract',
          manifest: {
            data: {
              site: {
                frontendDesign: {
                  schemaVersion: 'backy.frontend-design.v1',
                  status: 'captured',
                  source: {
                    type: 'custom-frontend',
                    label: 'Imported external frontend',
                    url: 'https://example.test/imported-front',
                    repository: 'example/imported-front',
                    branch: 'main',
                  },
                  tokens: {
                    colors: { primary: '#155e75', text: '#0f172a' },
                    fonts: { heading: 'Imported Display', body: 'Imported Text' },
                    customCss: ':root { --imported-primary: #155e75; }',
                  },
                  chrome: {
                    header: { component: 'ImportedHeader', navBinding: 'site.navigation.primary' },
                    footer: { component: 'ImportedFooter', navBinding: 'site.navigation.footer' },
                  },
                  templates: [
                    {
                      id: 'imported-external-page-template',
                      type: 'page',
                      name: 'Imported External Page',
                      routePattern: '/imported/{slug}',
                      canvasSize: { width: 1200, height: 760 },
                      content: {
                        elements: [
                          {
                            id: 'imported-external-root',
                            type: 'section',
                            x: 0,
                            y: 0,
                            width: 1200,
                            height: 480,
                            zIndex: 1,
                            props: { backgroundColor: '#ecfeff' },
                            children: [
                              {
                                id: 'imported-external-heading',
                                type: 'heading',
                                x: 80,
                                y: 96,
                                width: 720,
                                height: 96,
                                zIndex: 1,
                                props: {
                                  content: 'Imported frontend page',
                                  level: 'h1',
                                  binding: 'page.title',
                                },
                              },
                            ],
                          },
                        ],
                        canvasSize: { width: 1200, height: 760 },
                        customCSS: ':root { --imported-page-accent: #0891b2; }',
                      },
                      bindingHints: [
                        { role: 'page.title', binding: 'page.title', fields: ['title'] },
                      ],
                    },
                    {
                      id: 'imported-external-collection-template',
                      type: 'collection',
                      name: 'Imported External Collection',
                      routePattern: '/directory/:recordSlug',
                      canvasSize: { width: 1200, height: 820 },
                      content: {
                        name: 'Imported directory schema',
                        slug: 'imported-directory',
                        listRoutePattern: '/directory',
                        routePattern: '/directory/:recordSlug',
                        fields: [
                          { key: 'title', label: 'Title', type: 'text', required: true, unique: true },
                          { key: 'summary', label: 'Summary', type: 'richText' },
                          { key: 'rank', label: 'Rank', type: 'number' },
                          { key: 'category', label: 'Category', type: 'select', options: ['Featured', 'Standard'] },
                          { key: 'labels', label: 'Labels', type: 'tags', options: ['Launch', 'Evergreen', 'Internal'] },
                        ],
                        listTemplate: {
                          canvasSize: { width: 1200, height: 820 },
                          elements: [
                            {
                              id: 'imported-collection-list-root',
                              type: 'section',
                              x: 0,
                              y: 0,
                              width: 1200,
                              height: 820,
                              props: { backgroundColor: '#f0fdfa' },
                              children: [
                                {
                                  id: 'imported-collection-list-title',
                                  type: 'heading',
                                  x: 80,
                                  y: 84,
                                  width: 720,
                                  height: 80,
                                  props: { content: 'Imported collection fallback', binding: 'collection.name' },
                                },
                                {
                                  id: 'imported-collection-list-repeater',
                                  type: 'repeater',
                                  x: 80,
                                  y: 204,
                                  width: 980,
                                  height: 360,
                                  props: { binding: 'collections.importedDirectory.records', limit: 12 },
                                  children: [],
                                },
                              ],
                            },
                          ],
                        },
                        itemTemplate: {
                          canvasSize: { width: 1200, height: 760 },
                          elements: [
                            {
                              id: 'imported-collection-item-root',
                              type: 'section',
                              x: 0,
                              y: 0,
                              width: 1200,
                              height: 760,
                              props: { backgroundColor: '#fff7ed' },
                              children: [
                                {
                                  id: 'imported-collection-item-title',
                                  type: 'heading',
                                  x: 96,
                                  y: 104,
                                  width: 780,
                                  height: 92,
                                  props: { content: 'Imported item fallback', binding: 'record.title' },
                                },
                                {
                                  id: 'imported-collection-item-summary',
                                  type: 'text',
                                  x: 96,
                                  y: 232,
                                  width: 680,
                                  height: 120,
                                  props: { content: 'Imported summary fallback', binding: 'record.summary' },
                                },
                                {
                                  id: 'imported-collection-item-reverse-authors',
                                  type: 'repeater',
                                  x: 96,
                                  y: 390,
                                  width: 760,
                                  height: 220,
                                  props: {
                                    collectionId: referenceCollectionSlug,
                                    datasetId: 'dataset_contract_reverse_authors',
                                    titleField: 'name',
                                    descriptionField: 'bio',
                                    query: {
                                      fieldKey: 'company',
                                      fieldValue: '$currentRecord.id',
                                      sortBy: 'name',
                                      sortDirection: 'asc',
                                    },
                                    limit: 6,
                                  },
                                  children: [],
                                },
                              ],
                            },
                          ],
                        },
                      },
                      bindingHints: [
                        { role: 'collection.list', binding: 'collections.importedDirectory.records' },
                        { role: 'collection.item.title', binding: 'record.title' },
                        { role: 'collection.item.summary', binding: 'record.summary' },
                      ],
                    },
                  ],
                  editableMap: [
                    { elementId: 'imported-external-heading', role: 'heading', binding: 'page.title', fields: ['title'] },
                  ],
                },
              },
            },
          },
        }),
      });
      assert(importDesign.response.status === 200, `${importDesign.url} expected imported frontend contract`);
      assert(importDesign.json?.data?.frontendDesign?.source?.label === 'Imported external frontend', `${importDesign.url} missing imported source label`);
      assert(importDesign.json?.data?.frontendDesign?.templates?.some((template) => template.id === 'imported-external-page-template'), `${importDesign.url} missing imported page template`);
      assert(importDesign.json?.data?.frontendDesign?.templates?.some((template) => template.id === 'imported-external-collection-template'), `${importDesign.url} missing imported collection template`);

      const importAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=site&entityId=${createdSiteId}&action=frontendDesign.import&requestId=${importDesign.json.requestId}`);
      assert(importAudit.response.status === 200, `${importAudit.url} expected imported frontend audit read`);
      assert(importAudit.json?.data?.logs?.some((entry) => (
        entry.action === 'frontendDesign.import' &&
        entry.metadata?.importSource === 'manifest.site.frontendDesign' &&
        entry.metadata?.templateCount === 2
      )), `${importAudit.url} missing imported frontend audit log`);

      const importedTemplatePageSlug = `${pageSlug}-imported-template`;
      const createImportedTemplatePage = await request(`/api/admin/sites/${createdSiteId}/pages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Imported External Template Page',
          slug: importedTemplatePageSlug,
          status: 'published',
          frontendDesignTemplateId: 'imported-external-page-template',
        }),
      });
      assert(createImportedTemplatePage.response.status === 201, `${createImportedTemplatePage.url} expected page from imported template`);
      importedTemplatePageId = createImportedTemplatePage.json?.data?.page?.id;
      assert(importedTemplatePageId, `${createImportedTemplatePage.url} missing imported template page id`);
      assert(createImportedTemplatePage.json?.data?.page?.meta?.frontendDesignTemplateId === 'imported-external-page-template', `${createImportedTemplatePage.url} missing imported template provenance`);
      assert(createImportedTemplatePage.json?.data?.page?.content?.elements?.[0]?.id === 'imported-external-root', `${createImportedTemplatePage.url} did not seed imported template elements`);

      const publicImportedTemplatePage = await request(`/api/sites/${createdSiteId}/pages?slug=${importedTemplatePageSlug}`);
      assert(publicImportedTemplatePage.response.status === 200, `${publicImportedTemplatePage.url} expected public imported template page`);
      assert(publicImportedTemplatePage.json?.data?.page?.frontendDesign?.templateId === 'imported-external-page-template', `${publicImportedTemplatePage.url} missing normalized imported frontend design`);
      assert(publicImportedTemplatePage.json?.data?.page?.frontendDesign?.chrome?.header?.component === 'ImportedHeader', `${publicImportedTemplatePage.url} missing imported frontend chrome`);
      assert(publicImportedTemplatePage.json?.data?.page?.frontendDesign?.tokens?.fonts?.heading === 'Imported Display', `${publicImportedTemplatePage.url} missing imported frontend tokens`);
    } finally {
      if (importedTemplatePageId) {
        await request(`/api/admin/sites/${createdSiteId}/pages/${importedTemplatePageId}`, { method: 'DELETE' }).catch(() => {});
      }
    }
  });

  await record('admin media font upload registers public font asset', async () => {
    const unauthMediaList = await fetch(`${baseUrl}/api/admin/sites/${createdSiteId}/media`);
    const unauthMediaListJson = await unauthMediaList.json().catch(() => ({}));
    assert(unauthMediaList.status === 401, `Media admin API should reject missing auth, got ${unauthMediaList.status}`);
    assert(unauthMediaListJson?.success === false && unauthMediaListJson?.error?.code === 'UNAUTHORIZED', `Media admin API missing auth envelope: ${JSON.stringify(unauthMediaListJson).slice(0, 500)}`);

    const unauthUploadFormData = new FormData();
    unauthUploadFormData.set('file', new Blob(['unauthorized-font'], { type: 'font/woff2' }), 'UnauthorizedFont.woff2');
    const unauthUpload = await fetch(`${baseUrl}/api/admin/sites/${createdSiteId}/media`, {
      method: 'POST',
      body: unauthUploadFormData,
    });
    const unauthUploadJson = await unauthUpload.json().catch(() => ({}));
    assert(unauthUpload.status === 401, `Media upload API should reject missing auth, got ${unauthUpload.status}`);
    assert(unauthUploadJson?.success === false && unauthUploadJson?.error?.code === 'UNAUTHORIZED', `Media upload API missing auth envelope: ${JSON.stringify(unauthUploadJson).slice(0, 500)}`);

    const formData = new FormData();
    formData.set('file', new Blob(['contract-font'], { type: 'font/woff2' }), 'ContractSans.woff2');
    formData.set('visibility', 'public');
    formData.set('fontFamily', 'Contract Sans');
    formData.set('fontWeight', '500');
    formData.set('fontFallback', 'ui-sans-serif, system-ui');
    formData.set('fontDisplay', 'fallback');
    formData.set('tags', 'brand,font');
    formData.set('metadata', JSON.stringify({
      license: 'contract-smoke',
      source: 'admin-contract',
    }));

    const upload = await request(`/api/admin/sites/${createdSiteId}/media`, {
      method: 'POST',
      body: formData,
    });
    assert(upload.response.status === 201, `${upload.url} expected 201, got ${upload.response.status}`);
    assert(upload.json?.data?.media?.type === 'font', `${upload.url} expected font media type`);
    assert(upload.json?.data?.quota?.limitBytes > 0, `${upload.url} missing media quota limit`);
    assert(upload.json?.data?.quota?.usedBytes >= upload.json?.data?.media?.sizeBytes, `${upload.url} missing media quota usage`);
    assert(upload.json?.data?.quota?.remainingBytes >= 0, `${upload.url} missing media quota remaining bytes`);
    assert(upload.json?.data?.media?.metadata?.fontFamily === 'Contract Sans', `${upload.url} expected font family metadata`);
    assert(upload.json?.data?.media?.metadata?.fontFallback === 'ui-sans-serif, system-ui', `${upload.url} expected font fallback metadata`);
    assert(upload.json?.data?.media?.metadata?.fontDisplay === 'fallback', `${upload.url} expected font display metadata`);
    assert(upload.json?.data?.media?.metadata?.extension === 'woff2', `${upload.url} expected preserved font extension metadata`);
    assert(upload.json?.data?.media?.metadata?.license === 'contract-smoke', `${upload.url} expected custom upload metadata`);
    assert(upload.json?.data?.media?.metadata?.safetyScan?.status === 'clean', `${upload.url} missing clean safety scan metadata`);
    assert(upload.json?.data?.media?.metadata?.safetyScan?.checks?.includes('font-extension-policy'), `${upload.url} missing font safety check`);
    assert(
      upload.json?.data?.media?.url?.startsWith(`/uploads/sites/${createdSiteId}/fonts/`),
      `${upload.url} expected storage-backed public font URL`,
    );
    const storedFont = await request(upload.json.data.media.url);
    assert(storedFont.response.status === 200, `${storedFont.url} expected uploaded font asset to be publicly readable`);
    assert(storedFont.text === 'contract-font', `${storedFont.url} returned unexpected uploaded font content`);
    createdMediaId = upload.json.data.media.id;

    const update = await request(`/api/admin/sites/${createdSiteId}/media/${createdMediaId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        metadata: {
          fontFamily: 'Contract Sans Display',
          fontWeight: '600',
          fontStyle: 'normal',
          fontFallback: 'Georgia, serif',
          fontDisplay: 'optional',
        },
      }),
    });
    assert(update.response.status === 200, `${update.url} expected 200, got ${update.response.status}`);
    assert(update.json?.data?.media?.metadata?.fontFamily === 'Contract Sans Display', `${update.url} expected updated font family metadata`);
    assert(update.json?.data?.media?.metadata?.fontFallback === 'Georgia, serif', `${update.url} expected updated font fallback metadata`);
    assert(update.json?.data?.media?.metadata?.fontDisplay === 'optional', `${update.url} expected updated font display metadata`);
    assert(update.json?.data?.media?.metadata?.extension === 'woff2', `${update.url} lost extension metadata during font update`);
    assert(update.json?.data?.media?.metadata?.license === 'contract-smoke', `${update.url} lost custom upload metadata during font update`);

    const publicFonts = await request(`/api/sites/${createdSiteId}/media?type=font&search=${encodeURIComponent('Contract Sans')}&tag=font`);
    assert(publicFonts.response.status === 200, `${publicFonts.url} expected 200, got ${publicFonts.response.status}`);
    assert(publicFonts.json?.success === true, `${publicFonts.url} expected success envelope`);
    assert(publicFonts.json?.data?.media?.some((item) => (
      item.id === createdMediaId &&
      item.metadata?.fontFamily === 'Contract Sans Display' &&
      item.metadata?.fontFallback === 'Georgia, serif' &&
      item.metadata?.fontDisplay === 'optional' &&
      item.metadata?.extension === 'woff2' &&
      item.metadata?.license === 'contract-smoke'
    )), `${publicFonts.url} missing public font media in data envelope`);
    assert(publicFonts.json?.media?.some((item) => (
      item.id === createdMediaId &&
      item.metadata?.fontFamily === 'Contract Sans Display' &&
      item.metadata?.fontFallback === 'Georgia, serif' &&
      item.metadata?.fontDisplay === 'optional' &&
      item.metadata?.extension === 'woff2' &&
      item.metadata?.license === 'contract-smoke'
    )), `${publicFonts.url} missing public font media`);

    const publicGlobalFonts = await request(`/api/sites/${createdSiteId}/media?type=font&global=true`);
    assert(publicGlobalFonts.response.status === 200, `${publicGlobalFonts.url} expected 200, got ${publicGlobalFonts.response.status}`);
    assert(publicGlobalFonts.json?.data?.media?.some((item) => item.id === createdMediaId && item.scope === 'global'), `${publicGlobalFonts.url} missing global font media`);

    const publicFontDetail = await request(`/api/sites/${createdSiteId}/media/${createdMediaId}`);
    assert(publicFontDetail.response.status === 200, `${publicFontDetail.url} expected 200, got ${publicFontDetail.response.status}`);
    assert(publicFontDetail.json?.success === true, `${publicFontDetail.url} expected success envelope`);
    assert(publicFontDetail.json?.data?.media?.id === createdMediaId, `${publicFontDetail.url} missing media detail in data envelope`);
    assert(publicFontDetail.json?.media?.metadata?.fontFamily === 'Contract Sans Display', `${publicFontDetail.url} missing legacy media detail`);
    assert(publicFontDetail.json?.data?.media?.editableMetadata?.schemaVersion === 'backy.media.editable-metadata.v1', `${publicFontDetail.url} missing editable metadata contract`);
    assert(publicFontDetail.json?.data?.media?.editableMetadata?.metadata?.fontFamily === 'Contract Sans Display', `${publicFontDetail.url} missing editable metadata values`);
    assert(publicFontDetail.json?.data?.media?.references?.schemaVersion === 'backy.media.references.v1', `${publicFontDetail.url} missing media references contract`);
    assert(publicFontDetail.json?.data?.media?.references?.global === true, `${publicFontDetail.url} expected initial public font to be global`);
    assert(publicFontDetail.json?.data?.media?.references?.totalBindings === 0, `${publicFontDetail.url} expected no initial media bindings`);

    const adminMediaList = await request(`/api/admin/sites/${createdSiteId}/media?type=font&tag=font`);
    assert(adminMediaList.response.status === 200, `${adminMediaList.url} expected 200, got ${adminMediaList.response.status}`);
    assert(adminMediaList.json?.success === true, `${adminMediaList.url} expected success envelope`);
    assert(adminMediaList.json?.data?.quota?.limitBytes > 0, `${adminMediaList.url} missing media quota limit`);
    assert(adminMediaList.json?.data?.quota?.usedBytes >= upload.json?.data?.media?.sizeBytes, `${adminMediaList.url} missing media quota usage`);
    assert(adminMediaList.json?.data?.quota?.remainingBytes >= 0, `${adminMediaList.url} missing media quota remaining bytes`);
    assert(adminMediaList.json?.data?.media?.some((item) => item.id === createdMediaId), `${adminMediaList.url} missing admin media list item`);

    const adminGlobalMediaList = await request(`/api/admin/sites/${createdSiteId}/media?type=font&global=true`);
    assert(adminGlobalMediaList.response.status === 200, `${adminGlobalMediaList.url} expected 200, got ${adminGlobalMediaList.response.status}`);
    assert(adminGlobalMediaList.json?.data?.media?.some((item) => item.id === createdMediaId && item.scope === 'global'), `${adminGlobalMediaList.url} missing admin global media list item`);

    const privateUpdate = await request(`/api/admin/sites/${createdSiteId}/media/${createdMediaId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ visibility: 'private' }),
    });
    assert(privateUpdate.response.status === 200, `${privateUpdate.url} expected 200, got ${privateUpdate.response.status}`);
    const hiddenPrivateFont = await request(`/api/sites/${createdSiteId}/media?type=font&tag=font`);
    assert(hiddenPrivateFont.response.status === 200, `${hiddenPrivateFont.url} expected 200, got ${hiddenPrivateFont.response.status}`);
    assert(hiddenPrivateFont.json?.success === true, `${hiddenPrivateFont.url} expected success envelope`);
    assert(!hiddenPrivateFont.json?.media?.some((item) => item.id === createdMediaId), `${hiddenPrivateFont.url} exposed private font media`);
    const hiddenPrivateFontDetail = await request(`/api/sites/${createdSiteId}/media/${createdMediaId}`);
    assert(hiddenPrivateFontDetail.response.status === 404, `${hiddenPrivateFontDetail.url} expected private media detail to be hidden`);

    const unsignedPrivateFontFile = await request(`/api/sites/${createdSiteId}/media/${createdMediaId}/file`);
    assert(unsignedPrivateFontFile.response.status === 403, `${unsignedPrivateFontFile.url} expected unsigned private media file to be blocked`);
    assert(unsignedPrivateFontFile.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${unsignedPrivateFontFile.url} missing media file error contract version`);
    assert(unsignedPrivateFontFile.response.headers.get('x-backy-schema-version') === 'backy.media-file.v1', `${unsignedPrivateFontFile.url} missing media file error schema version`);
    assert(unsignedPrivateFontFile.json?.error?.code === 'MEDIA_SIGNATURE_INVALID', `${unsignedPrivateFontFile.url} expected signature error`);

    const signedPrivateFont = await request(`/api/admin/sites/${createdSiteId}/media/${createdMediaId}/signed-url`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        expiresInSeconds: 120,
        disposition: 'inline',
      }),
    });
    assert(signedPrivateFont.response.status === 200, `${signedPrivateFont.url} expected signed URL response`);
    assert(signedPrivateFont.json?.data?.path?.includes(`/api/sites/${createdSiteId}/media/${createdMediaId}/file?`), `${signedPrivateFont.url} missing signed file path`);
    assert(signedPrivateFont.json?.data?.expiresAt, `${signedPrivateFont.url} missing signed expiry`);

    const signedPrivateFontFile = await request(signedPrivateFont.json.data.path);
    assert(signedPrivateFontFile.response.status === 200, `${signedPrivateFontFile.url} expected signed private media file to load`);
    assert(signedPrivateFontFile.response.headers.get('x-backy-cache-scope') === 'private', `${signedPrivateFontFile.url} expected private cache scope`);
    assert(signedPrivateFontFile.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${signedPrivateFontFile.url} missing media file contract version`);
    assert(signedPrivateFontFile.response.headers.get('x-backy-schema-version') === 'backy.media-file.v1', `${signedPrivateFontFile.url} missing media file schema version`);
    assert(signedPrivateFontFile.response.headers.get('x-backy-media-id') === createdMediaId, `${signedPrivateFontFile.url} missing media id header`);
    assert(signedPrivateFontFile.text === 'contract-font', `${signedPrivateFontFile.url} returned unexpected signed private content`);

    const publicUpdate = await request(`/api/admin/sites/${createdSiteId}/media/${createdMediaId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ visibility: 'public' }),
    });
    assert(publicUpdate.response.status === 200, `${publicUpdate.url} expected 200, got ${publicUpdate.response.status}`);

    const unauthAuditLogs = await fetch(`${baseUrl}/api/admin/audit-logs?siteId=${createdSiteId}&entity=media`);
    const unauthAuditLogsJson = await unauthAuditLogs.json().catch(() => ({}));
    assert(unauthAuditLogs.status === 401, `Audit logs admin API should reject missing auth, got ${unauthAuditLogs.status}`);
    assert(unauthAuditLogsJson?.success === false && unauthAuditLogsJson?.error?.code === 'UNAUTHORIZED', `Audit logs admin API missing auth envelope: ${JSON.stringify(unauthAuditLogsJson).slice(0, 500)}`);

    const createAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=media&entityId=${createdMediaId}&action=create&requestId=${upload.json.requestId}`);
    assert(createAudit.response.status === 200, `${createAudit.url} expected media create audit read`);
    assert(createAudit.json?.data?.logs?.some((entry) => (
      entry.entity === 'media' &&
      entry.entityId === createdMediaId &&
      entry.action === 'create' &&
      entry.requestId === upload.json.requestId &&
      entry.after?.id === createdMediaId
    )), `${createAudit.url} missing media create audit log`);

    const updateAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=media&entityId=${createdMediaId}&action=update&requestId=${publicUpdate.json.requestId}`);
    assert(updateAudit.response.status === 200, `${updateAudit.url} expected media update audit read`);
    assert(updateAudit.json?.data?.logs?.some((entry) => (
      entry.entity === 'media' &&
      entry.entityId === createdMediaId &&
      entry.action === 'update' &&
      entry.requestId === publicUpdate.json.requestId &&
      entry.before?.id === createdMediaId &&
      entry.after?.id === createdMediaId
    )), `${updateAudit.url} missing media update audit log`);

    const replacementFormData = new FormData();
    replacementFormData.set('file', new Blob(['contract-font-v2'], { type: 'font/woff2' }), 'ContractSansV2.woff2');
    replacementFormData.set('replacedBy', 'contract-smoke');
    replacementFormData.set('reason', 'contract replacement');

    const replacement = await request(`/api/admin/sites/${createdSiteId}/media/${createdMediaId}`, {
      method: 'POST',
      body: replacementFormData,
    });
    assert(replacement.response.status === 200, `${replacement.url} expected media replacement 200, got ${replacement.response.status}`);
    assert(replacement.json?.data?.media?.id === createdMediaId, `${replacement.url} replacement changed media id`);
    assert(replacement.json?.data?.media?.originalName === 'ContractSansV2.woff2', `${replacement.url} did not update original name`);
    assert(replacement.json?.data?.media?.metadata?.fontFamily === 'Contract Sans Display', `${replacement.url} lost font metadata during replacement`);
    assert(replacement.json?.data?.media?.metadata?.safetyScan?.status === 'clean', `${replacement.url} missing replacement safety scan`);
    assert(Array.isArray(replacement.json?.data?.media?.metadata?.replacementVersions), `${replacement.url} missing replacement history`);
    assert(replacement.json?.data?.media?.metadata?.replacementVersions?.[0]?.originalName === 'ContractSans.woff2', `${replacement.url} missing previous version metadata`);
    assert(replacement.json?.data?.quota?.usedBytes >= replacement.json?.data?.media?.sizeBytes, `${replacement.url} missing replacement quota usage`);
    const replacedFont = await request(replacement.json.data.media.url);
    assert(replacedFont.response.status === 200, `${replacedFont.url} expected replaced media file to load`);
    assert(replacedFont.text === 'contract-font-v2', `${replacedFont.url} returned unexpected replacement content`);

    const replacementAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=media&entityId=${createdMediaId}&action=media.replace&requestId=${replacement.json.requestId}`);
    assert(replacementAudit.response.status === 200, `${replacementAudit.url} expected media replacement audit read`);
    assert(replacementAudit.json?.data?.logs?.some((entry) => (
      entry.entity === 'media' &&
      entry.entityId === createdMediaId &&
      entry.action === 'media.replace' &&
      entry.metadata?.replacementFilename === 'ContractSansV2.woff2' &&
      entry.metadata?.retainedVersions >= 1
    )), `${replacementAudit.url} missing media replacement audit log`);
  });

  await record('admin media folders create/list/update/delete and detach assets', async () => {
    const create = await request(`/api/admin/sites/${createdSiteId}/media/folders`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Contract Assets',
        sortOrder: 7,
      }),
    });
    assert(create.response.status === 201, `${create.url} expected 201, got ${create.response.status}`);
    assert(create.json?.success === true, `${create.url} expected success envelope`);
    assert(create.json?.data?.folder?.name === 'Contract Assets', `${create.url} expected created folder name`);
    createdMediaFolderId = create.json.data.folder.id;

    const createFolderAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=mediaFolder&entityId=${createdMediaFolderId}&action=mediaFolder.create&requestId=${create.json.requestId}`);
    assert(createFolderAudit.response.status === 200, `${createFolderAudit.url} expected media folder create audit read`);
    assert(createFolderAudit.json?.data?.logs?.some((entry) => (
      entry.action === 'mediaFolder.create' &&
      entry.entityId === createdMediaFolderId &&
      entry.after?.name === 'Contract Assets'
    )), `${createFolderAudit.url} missing media folder create audit log`);

    const list = await request(`/api/admin/sites/${createdSiteId}/media/folders`);
    assert(list.response.status === 200, `${list.url} expected 200, got ${list.response.status}`);
    assert(list.json?.data?.folders?.some((folder) => folder.id === createdMediaFolderId), `${list.url} missing created folder`);

    const invalidFolderUploadForm = new FormData();
    invalidFolderUploadForm.set('file', new Blob(['invalid-folder-upload'], { type: 'font/woff2' }), 'invalid-folder.woff2');
    invalidFolderUploadForm.set('folderId', 'missing_media_folder');
    const invalidFolderUpload = await request(`/api/admin/sites/${createdSiteId}/media`, {
      method: 'POST',
      body: invalidFolderUploadForm,
    });
    assert(invalidFolderUpload.response.status === 404, `${invalidFolderUpload.url} expected invalid upload folder 404, got ${invalidFolderUpload.response.status}`);
    assert(invalidFolderUpload.json?.error?.code === 'FOLDER_NOT_FOUND', `${invalidFolderUpload.url} expected FOLDER_NOT_FOUND for invalid upload folder`);

    const invalidAssignMedia = await request(`/api/admin/sites/${createdSiteId}/media/${createdMediaId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        folderId: 'missing_media_folder',
      }),
    });
    assert(invalidAssignMedia.response.status === 404, `${invalidAssignMedia.url} expected invalid folder assignment 404, got ${invalidAssignMedia.response.status}`);
    assert(invalidAssignMedia.json?.error?.code === 'FOLDER_NOT_FOUND', `${invalidAssignMedia.url} expected FOLDER_NOT_FOUND for invalid folder assignment`);

    const assignMedia = await request(`/api/admin/sites/${createdSiteId}/media/${createdMediaId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        folderId: createdMediaFolderId,
      }),
    });
    assert(assignMedia.response.status === 200, `${assignMedia.url} expected 200, got ${assignMedia.response.status}`);
    assert(assignMedia.json?.data?.media?.folderId === createdMediaFolderId, `${assignMedia.url} did not assign media folder`);

    const folderMedia = await request(`/api/admin/sites/${createdSiteId}/media?folderId=${createdMediaFolderId}&type=font`);
    assert(folderMedia.response.status === 200, `${folderMedia.url} expected 200, got ${folderMedia.response.status}`);
    assert(folderMedia.json?.data?.media?.some((item) => item.id === createdMediaId), `${folderMedia.url} missing folder-scoped media`);

    const update = await request(`/api/admin/sites/${createdSiteId}/media/folders/${createdMediaFolderId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Contract Brand Assets',
        sortOrder: 11,
      }),
    });
    assert(update.response.status === 200, `${update.url} expected 200, got ${update.response.status}`);
    assert(update.json?.data?.folder?.name === 'Contract Brand Assets', `${update.url} did not update folder name`);
    assert(update.json?.data?.folder?.sortOrder === 11, `${update.url} did not update folder sort order`);

    const updateFolderAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=mediaFolder&entityId=${createdMediaFolderId}&action=mediaFolder.update&requestId=${update.json.requestId}`);
    assert(updateFolderAudit.response.status === 200, `${updateFolderAudit.url} expected media folder update audit read`);
    assert(updateFolderAudit.json?.data?.logs?.some((entry) => (
      entry.action === 'mediaFolder.update' &&
      entry.before?.name === 'Contract Assets' &&
      entry.after?.name === 'Contract Brand Assets'
    )), `${updateFolderAudit.url} missing media folder update audit log`);

    const remove = await request(`/api/admin/sites/${createdSiteId}/media/folders/${createdMediaFolderId}`, { method: 'DELETE' });
    assert(remove.response.status === 200, `${remove.url} expected 200, got ${remove.response.status}`);
    assert(remove.json?.data?.deleted === true, `${remove.url} expected deleted true`);

    const deleteFolderAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=mediaFolder&entityId=${createdMediaFolderId}&action=mediaFolder.delete&requestId=${remove.json.requestId}`);
    assert(deleteFolderAudit.response.status === 200, `${deleteFolderAudit.url} expected media folder delete audit read`);
    assert(deleteFolderAudit.json?.data?.logs?.some((entry) => (
      entry.action === 'mediaFolder.delete' &&
      entry.before?.name === 'Contract Brand Assets'
    )), `${deleteFolderAudit.url} missing media folder delete audit log`);

    createdMediaFolderId = null;

    const detachedMedia = await request(`/api/admin/sites/${createdSiteId}/media?type=font`);
    assert(detachedMedia.response.status === 200, `${detachedMedia.url} expected 200, got ${detachedMedia.response.status}`);
    assert(detachedMedia.json?.data?.media?.some((item) => (
      item.id === createdMediaId && item.folderId === null
    )), `${detachedMedia.url} did not detach media from deleted folder`);
  });

  await record('admin media image transforms generate responsive files', async () => {
    const formData = new FormData();
    formData.set('file', new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="red"/></svg>'], { type: 'image/svg+xml' }), 'contract-image.svg');
    formData.set('visibility', 'public');
    formData.set('altText', 'Contract image');

    const upload = await request(`/api/admin/sites/${createdSiteId}/media`, {
      method: 'POST',
      body: formData,
    });
    assert(upload.response.status === 201, `${upload.url} expected 201, got ${upload.response.status}`);
    createdImageMediaId = upload.json?.data?.media?.id;
    assert(createdImageMediaId, `${upload.url} missing image media id`);
    assert(upload.json?.data?.media?.type === 'image', `${upload.url} expected image media type`);
    assert(upload.json?.data?.media?.metadata?.safetyScan?.checks?.includes('svg-active-content-policy'), `${upload.url} missing SVG safety scan`);

    const dangerousSvgFormData = new FormData();
    dangerousSvgFormData.set('file', new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], { type: 'image/svg+xml' }), 'dangerous.svg');
    dangerousSvgFormData.set('visibility', 'public');
    const dangerousSvg = await request(`/api/admin/sites/${createdSiteId}/media`, {
      method: 'POST',
      body: dangerousSvgFormData,
    });
    assert(dangerousSvg.response.status === 415, `${dangerousSvg.url} expected dangerous SVG rejection`);
    assert(dangerousSvg.json?.error?.code === 'MEDIA_SAFETY_SCAN_FAILED', `${dangerousSvg.url} expected safety scan error code`);

    const preparedTransforms = await request(`/api/admin/sites/${createdSiteId}/media/${createdImageMediaId}/transforms`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        widths: [320, 768, 1280],
        quality: 82,
        sizes: '(max-width: 900px) 100vw, 900px',
        preparedBy: 'contract-smoke',
      }),
    });
    assert(preparedTransforms.response.status === 200, `${preparedTransforms.url} expected transform preparation 200`);
    assert(preparedTransforms.json?.data?.media?.metadata?.generatedTransforms?.variants?.some((variant) => variant.width === 768 && variant.quality === 82), `${preparedTransforms.url} missing stored transform variants`);
    assert(preparedTransforms.json?.data?.media?.metadata?.generatedTransforms?.format === 'webp', `${preparedTransforms.url} missing generated webp format`);
    assert(preparedTransforms.json?.data?.media?.metadata?.generatedTransforms?.generatedBytes > 0, `${preparedTransforms.url} missing generated transform byte count`);
    assert(preparedTransforms.json?.data?.media?.metadata?.generatedTransforms?.variants?.every((variant) => (
      typeof variant.storagePath === 'string' &&
      typeof variant.bytes === 'number' &&
      variant.url.includes('.webp')
    )), `${preparedTransforms.url} missing generated transform files`);

    const transform = await request(`/api/sites/${createdSiteId}/media/${createdImageMediaId}/transform?width=320&quality=80`, {
      redirect: 'manual',
    });
    assert(transform.response.status === 307, `${transform.url} expected transform redirect, got ${transform.response.status}`);
    assert(transform.response.headers.get('location')?.includes('/_next/image'), `${transform.url} missing optimizer redirect`);
    assert(transform.response.headers.get('location')?.includes('w=320'), `${transform.url} missing transform width`);
    assert(transform.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${transform.url} missing media transform contract version`);
    assert(transform.response.headers.get('x-backy-schema-version') === 'backy.media-transform.v1', `${transform.url} missing media transform schema version`);
    assert(transform.response.headers.get('x-backy-transform-width') === '320', `${transform.url} missing transform width header`);
    assert(transform.response.headers.get('x-backy-transform-quality') === '80', `${transform.url} missing transform quality header`);

    const deliveredFile = await request(`/api/sites/${createdSiteId}/media/${createdImageMediaId}/file`);
    assert(deliveredFile.response.status === 200, `${deliveredFile.url} expected public media file delivery`);
    assert(deliveredFile.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${deliveredFile.url} missing public media file contract version`);
    assert(deliveredFile.response.headers.get('x-backy-schema-version') === 'backy.media-file.v1', `${deliveredFile.url} missing public media file schema version`);
    assert(deliveredFile.response.headers.get('content-type')?.includes('image/svg+xml'), `${deliveredFile.url} expected image/svg+xml delivery`);

    const mediaAfterDelivery = await request(`/api/admin/sites/${createdSiteId}/media?type=image`);
    const deliveredImage = mediaAfterDelivery.json?.data?.media?.find((item) => item.id === createdImageMediaId);
    assert(deliveredImage?.metadata?.mediaDelivery?.totalRequests >= 2, `${mediaAfterDelivery.url} missing media delivery request analytics`);
    assert(deliveredImage?.metadata?.mediaDelivery?.fileRequests >= 1, `${mediaAfterDelivery.url} missing media file delivery analytics`);
    assert(deliveredImage?.metadata?.mediaDelivery?.transformRequests >= 1, `${mediaAfterDelivery.url} missing media transform delivery analytics`);
    assert(deliveredImage?.metadata?.mediaDelivery?.bytesServed > 0, `${mediaAfterDelivery.url} missing delivered byte analytics`);

    const publicImageList = await request(`/api/sites/${createdSiteId}/media?type=image`);
    assert(publicImageList.response.status === 200, `${publicImageList.url} expected image media list`);
    const listedImage = publicImageList.json?.data?.media?.find((item) => item.id === createdImageMediaId);
    assert(listedImage?.responsive?.srcSet?.includes('.webp'), `${publicImageList.url} missing generated responsive image srcset`);
    assert(listedImage?.responsive?.variants?.some((variant) => variant.width === 768 && variant.quality === 82), `${publicImageList.url} missing prepared responsive image variants`);
    assert(listedImage?.responsive?.preparedBy === 'contract-smoke', `${publicImageList.url} missing prepared transform attribution`);
    assert(listedImage?.responsive?.generatedBytes > 0, `${publicImageList.url} missing responsive generated byte metadata`);

    const publicImageDetail = await request(`/api/sites/${createdSiteId}/media/${createdImageMediaId}`);
    assert(publicImageDetail.response.status === 200, `${publicImageDetail.url} expected image media detail`);
    assert(publicImageDetail.json?.data?.media?.responsive?.sizes === '(max-width: 900px) 100vw, 900px', `${publicImageDetail.url} missing prepared responsive image sizes`);
    assert(publicImageDetail.json?.media?.responsive?.variants?.length >= 3, `${publicImageDetail.url} missing legacy responsive image variants`);

    const transformAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=media&entityId=${createdImageMediaId}&action=media.transforms.prepare&requestId=${preparedTransforms.json.requestId}`);
    assert(transformAudit.response.status === 200, `${transformAudit.url} expected transform audit read`);
    assert(transformAudit.json?.data?.logs?.some((entry) => (
      entry.action === 'media.transforms.prepare' &&
      entry.metadata?.quality === 82 &&
      entry.metadata?.preparedBy === 'contract-smoke' &&
      entry.metadata?.generatedBytes > 0
    )), `${transformAudit.url} missing transform preparation audit log`);

    const invalidTransform = await request(`/api/sites/${createdSiteId}/media/${createdMediaId}/transform?width=320`, {
      redirect: 'manual',
    });
    assert(invalidTransform.response.status === 400, `${invalidTransform.url} expected non-image transform to fail`);
    assert(invalidTransform.json?.error?.code === 'MEDIA_TRANSFORM_UNSUPPORTED', `${invalidTransform.url} expected unsupported transform code`);

    const remove = await request(`/api/admin/sites/${createdSiteId}/media/${createdImageMediaId}`, { method: 'DELETE' });
    assert(remove.response.status === 200, `${remove.url} expected image media cleanup`);
    createdImageMediaId = null;
  });

  await record('admin pages create/list/detail/update/delete works for temporary site', async () => {
    const unauthPages = await fetch(`${baseUrl}/api/admin/sites/${createdSiteId}/pages?includeUnpublished=true`);
    const unauthPagesJson = await unauthPages.json().catch(() => ({}));
    assert(unauthPages.status === 401, `Pages admin API should reject missing auth, got ${unauthPages.status}`);
    assert(unauthPagesJson?.success === false && unauthPagesJson?.error?.code === 'UNAUTHORIZED', `Pages admin API missing auth envelope: ${JSON.stringify(unauthPagesJson).slice(0, 500)}`);

    const create = await request(`/api/admin/sites/${createdSiteId}/pages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Admin Contract Page',
        slug: pageSlug,
        status: 'draft',
        meta: {
          title: 'Admin Contract Page',
          description: 'Admin contract page description.',
          keywords: ['contract', 'page-api'],
          ogImage: '/uploads/sites/contract/page-og.jpg',
          jsonLd: [
            {
              '@context': 'https://schema.org',
              '@type': 'WebPage',
              name: 'Admin Contract Page',
            },
          ],
          frontendDesignTemplateId: 'contract-page-template',
          frontendDesignTemplateName: 'Contract Page Template',
          frontendDesignRoutePattern: '/contract-page/{slug}',
          frontendDesignSource: {
            type: 'custom-frontend',
            label: 'Contract page frontend',
            repository: 'example/backy-page-contract',
          },
          frontendDesignChrome: {
            header: { component: 'ContractPageHeader', source: 'site.navigation.primary' },
            footer: { component: 'ContractPageFooter', source: 'site.navigation.footer' },
          },
          frontendDesignTokens: {
            colors: { primary: '#2563eb', text: '#111827' },
            fonts: { heading: 'Inter', body: 'Inter' },
          },
          frontendDesignCustomCss: ':root { --contract-page-primary: #2563eb; }',
          frontendDesignBindingHints: [
            { role: 'page.title', binding: 'page.title' },
            { role: 'page.body', binding: 'page.content' },
          ],
        },
        content: {
          elements: [
            {
              id: 'contract-page-heading',
              type: 'heading',
              x: 80,
              y: 96,
              width: 520,
              height: 72,
              zIndex: 1,
              props: {
                content: 'Contract page readiness',
                level: 'h1',
                fontSize: 42,
                fontWeight: '700',
              },
            },
          ],
          canvasSize: { width: 1200, height: 900 },
        },
      }),
    });
    assert(create.response.status === 201, `${create.url} expected 201, got ${create.response.status}`);
    assert(create.json?.data?.page?.slug === pageSlug, `${create.url} returned wrong page slug`);
    createdPageId = create.json.data.page.id;
    const pageCreateAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=page&entityId=${createdPageId}&action=create&requestId=${create.json.requestId}`);
    assert(pageCreateAudit.response.status === 200, `${pageCreateAudit.url} expected page create audit readback`);
    assert(pageCreateAudit.json?.data?.logs?.[0]?.metadata?.slug === pageSlug, `${pageCreateAudit.url} missing page create audit metadata`);
    assert(pageCreateAudit.json?.data?.logs?.[0]?.after?.status === 'draft', `${pageCreateAudit.url} missing page create audit after snapshot`);

    const pageEditorSessionToken = await loginAdminCredentials('jane@backy.io', process.env.BACKY_EDITOR_DEMO_PASSWORD || 'editor123');
    const denyEditorPagePublish = await request('/api/admin/users/user-editor/permissions', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        overrides: {
          'pages.publish': 'deny',
        },
      }),
    });
    assert(denyEditorPagePublish.response.status === 200, `${denyEditorPagePublish.url} expected editor publish-deny override`);
    try {
      const blockedEditorPublish = await requestWithSession(`/api/admin/sites/${createdSiteId}/pages/${createdPageId}`, pageEditorSessionToken, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ status: 'published' }),
      });
      assert(blockedEditorPublish.response.status === 403, `${blockedEditorPublish.url} expected editor publish denial, got ${blockedEditorPublish.response.status}`);
      assert(blockedEditorPublish.json?.error?.code === 'FORBIDDEN_PERMISSION', `${blockedEditorPublish.url} expected FORBIDDEN_PERMISSION for denied page publish`);
    } finally {
      const restoreEditorPagePublish = await request('/api/admin/users/user-editor/permissions', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          overrides: {
            'pages.publish': null,
          },
        }),
      });
      assert(restoreEditorPagePublish.response.status === 200, `${restoreEditorPagePublish.url} expected editor publish override restore`);
    }

    const missingPageSchedule = await request(`/api/admin/sites/${createdSiteId}/pages/${createdPageId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status: 'scheduled' }),
    });
    assert(missingPageSchedule.response.status === 400, `${missingPageSchedule.url} expected missing schedule 400, got ${missingPageSchedule.response.status}`);
    assert(missingPageSchedule.json?.error?.code === 'SCHEDULED_AT_REQUIRED', `${missingPageSchedule.url} expected scheduledAt required error`);

    const list = await request(`/api/admin/sites/${createdSiteId}/pages?includeUnpublished=true`);
    assert(list.response.status === 200, `${list.url} expected 200, got ${list.response.status}`);
    assert(list.json?.data?.pages?.some((page) => page.id === createdPageId), `${list.url} missing created page`);

    const detail = await request(`/api/admin/sites/${createdSiteId}/pages/${createdPageId}`);
    assert(detail.response.status === 200, `${detail.url} expected 200, got ${detail.response.status}`);
    assert(detail.json?.data?.page?.id === createdPageId, `${detail.url} returned wrong page`);

    const pageReadiness = await request(`/api/admin/sites/${createdSiteId}/pages/${createdPageId}/readiness`);
    assert(pageReadiness.response.status === 200, `${pageReadiness.url} expected 200, got ${pageReadiness.response.status}`);
    assert(pageReadiness.json?.success === true, `${pageReadiness.url} expected success envelope`);
    assert(pageReadiness.json?.data?.readiness?.id === createdPageId, `${pageReadiness.url} returned wrong page readiness`);
    assert(pageReadiness.json?.data?.readiness?.elementCount === 1, `${pageReadiness.url} expected one canvas element`);
    assert(
      pageReadiness.json?.readiness?.checks?.some((check) => check.id === `page:${createdPageId}:canvas-size` && check.status === 'pass'),
      `${pageReadiness.url} missing legacy page readiness checks`,
    );

    const pagePreviewRequestId = `contract-page-preview-${unique}`;
    const pagePreview = await request(`/api/admin/sites/${createdSiteId}/pages/${createdPageId}/preview`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': pagePreviewRequestId,
      },
      body: JSON.stringify({ ttlSeconds: 1200 }),
    });
    assert(pagePreview.response.status === 200, `${pagePreview.url} expected preview token response`);
    assert(pagePreview.json?.data?.previewToken, `${pagePreview.url} missing preview token`);
    assert(pagePreview.json?.data?.pageApiUrl?.includes('previewToken='), `${pagePreview.url} missing preview page API URL`);
    assert(pagePreview.json?.data?.renderUrl?.includes('previewToken='), `${pagePreview.url} missing preview render URL`);
    const pagePreviewAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=page&entityId=${createdPageId}&action=previewToken.create&requestId=${pagePreviewRequestId}`);
    assert(pagePreviewAudit.response.status === 200, `${pagePreviewAudit.url} expected preview audit readback`);
    const pagePreviewAuditEntry = pagePreviewAudit.json?.data?.logs?.[0];
    assert(pagePreviewAuditEntry?.action === 'previewToken.create', `${pagePreviewAudit.url} missing preview token audit action`);
    assert(pagePreviewAuditEntry?.metadata?.targetType === 'page', `${pagePreviewAudit.url} missing preview target type`);
    assert(pagePreviewAuditEntry?.metadata?.ttlSeconds === 1200, `${pagePreviewAudit.url} missing preview TTL metadata`);
    assert(pagePreviewAuditEntry?.metadata?.slug === pageSlug, `${pagePreviewAudit.url} missing preview slug metadata`);
    assert(typeof pagePreviewAuditEntry?.metadata?.createdBy === 'string' && pagePreviewAuditEntry.metadata.createdBy.length > 0, `${pagePreviewAudit.url} missing preview actor binding`);
    assert(pagePreviewAuditEntry?.metadata?.tokenStored === false, `${pagePreviewAudit.url} should record that preview token is redacted`);
    assert(!JSON.stringify(pagePreviewAuditEntry?.metadata || {}).includes(pagePreview.json.data.previewToken), `${pagePreviewAudit.url} leaked preview token into audit metadata`);

    const pagePreviewUseRequestId = `contract-page-preview-use-${unique}`;
    const pagePreviewUse = await request(pagePreview.json.data.pageApiUrl, {
      headers: {
        'x-request-id': pagePreviewUseRequestId,
      },
    });
    assert(pagePreviewUse.response.status === 200, `${pagePreviewUse.url} expected tokenized page API response`);
    const pagePreviewUseAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=page&entityId=${createdPageId}&action=previewToken.use&requestId=${pagePreviewUseRequestId}`);
    assert(pagePreviewUseAudit.response.status === 200, `${pagePreviewUseAudit.url} expected preview use audit readback`);
    const pagePreviewUseAuditEntry = pagePreviewUseAudit.json?.data?.logs?.[0];
    assert(pagePreviewUseAuditEntry?.action === 'previewToken.use', `${pagePreviewUseAudit.url} missing preview use audit action`);
    assert(pagePreviewUseAuditEntry?.actorId === 'public-preview', `${pagePreviewUseAudit.url} missing public preview actor`);
    assert(pagePreviewUseAuditEntry?.metadata?.surface === 'page-api', `${pagePreviewUseAudit.url} missing page-api preview surface`);
    assert(pagePreviewUseAuditEntry?.metadata?.tokenStored === false, `${pagePreviewUseAudit.url} should record that preview token use is redacted`);
    assert(!JSON.stringify(pagePreviewUseAuditEntry?.metadata || {}).includes(pagePreview.json.data.previewToken), `${pagePreviewUseAudit.url} leaked preview token into use audit metadata`);

    const pagePreviewRenderRequestId = `contract-page-preview-render-use-${unique}`;
    const pagePreviewRender = await request(pagePreview.json.data.renderUrl, {
      headers: {
        'x-request-id': pagePreviewRenderRequestId,
      },
    });
    assert(pagePreviewRender.response.status === 200, `${pagePreviewRender.url} expected tokenized page render response`);
    const pagePreviewRenderAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=page&entityId=${createdPageId}&action=previewToken.use&requestId=${pagePreviewRenderRequestId}`);
    assert(pagePreviewRenderAudit.response.status === 200, `${pagePreviewRenderAudit.url} expected preview render audit readback`);
    const pagePreviewRenderAuditEntry = pagePreviewRenderAudit.json?.data?.logs?.[0];
    assert(pagePreviewRenderAuditEntry?.metadata?.surface === 'render-api', `${pagePreviewRenderAudit.url} missing render-api preview surface`);
    assert(pagePreviewRenderAuditEntry?.metadata?.tokenStored === false, `${pagePreviewRenderAudit.url} should record token redaction for render preview use`);
    assert(!JSON.stringify(pagePreviewRenderAuditEntry?.metadata || {}).includes(pagePreview.json.data.previewToken), `${pagePreviewRenderAudit.url} leaked preview token into render use audit metadata`);

    const pagePreviewResolveRequestId = `contract-page-preview-resolve-use-${unique}`;
    const pagePreviewResolvePath = encodeURIComponent(`/${pageSlug}`);
    const pagePreviewResolve = await request(`/api/sites/${createdSiteId}/resolve?path=${pagePreviewResolvePath}&previewToken=${encodeURIComponent(pagePreview.json.data.previewToken)}`, {
      headers: {
        'x-request-id': pagePreviewResolveRequestId,
      },
    });
    assert(pagePreviewResolve.response.status === 200, `${pagePreviewResolve.url} expected tokenized page resolve response`);
    const pagePreviewResolveAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=page&entityId=${createdPageId}&action=previewToken.use&requestId=${pagePreviewResolveRequestId}`);
    assert(pagePreviewResolveAudit.response.status === 200, `${pagePreviewResolveAudit.url} expected preview resolve audit readback`);
    const pagePreviewResolveAuditEntry = pagePreviewResolveAudit.json?.data?.logs?.[0];
    assert(pagePreviewResolveAuditEntry?.metadata?.surface === 'resolve-api', `${pagePreviewResolveAudit.url} missing resolve-api preview surface`);
    assert(pagePreviewResolveAuditEntry?.metadata?.tokenStored === false, `${pagePreviewResolveAudit.url} should record token redaction for resolve preview use`);
    assert(!JSON.stringify(pagePreviewResolveAuditEntry?.metadata || {}).includes(pagePreview.json.data.previewToken), `${pagePreviewResolveAudit.url} leaked preview token into resolve use audit metadata`);

    const canonicalConflictPage = await request(`/api/admin/sites/${createdSiteId}/pages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Canonical Conflict Page',
        slug: `${pageSlug}-canonical-conflict`,
        status: 'draft',
        meta: {
          title: 'Canonical Conflict Page',
          description: 'Conflicts with the primary admin contract page.',
          canonical: `/${pageSlug}`,
        },
        content: {
          elements: [
            {
              id: 'canonical-conflict-heading',
              type: 'heading',
              x: 100,
              y: 100,
              width: 520,
              height: 80,
              zIndex: 1,
              props: { content: 'Canonical conflict' },
            },
          ],
          canvasSize: { width: 1200, height: 900 },
        },
      }),
    });
    assert(canonicalConflictPage.response.status === 201, `${canonicalConflictPage.url} expected 201, got ${canonicalConflictPage.response.status}`);
    const canonicalConflictPageId = canonicalConflictPage.json?.data?.page?.id;
    assert(canonicalConflictPageId, `${canonicalConflictPage.url} missing canonical conflict page id`);
    const canonicalConflictReadiness = await request(`/api/admin/sites/${createdSiteId}/readiness`);
    assert(canonicalConflictReadiness.response.status === 200, `${canonicalConflictReadiness.url} expected 200, got ${canonicalConflictReadiness.response.status}`);
    assert(canonicalConflictReadiness.json?.data?.readiness?.checks?.some((check) => (
      check.id === `page:${createdPageId}:canonical-conflict`
      && check.status === 'fail'
      && check.severity === 'error'
      && check.details?.canonical === `/${pageSlug}`
    )), `${canonicalConflictReadiness.url} missing canonical conflict readiness error`);
    await request(`/api/admin/sites/${createdSiteId}/pages/${canonicalConflictPageId}`, { method: 'DELETE' });

    const invalidPage = await request(`/api/admin/sites/${createdSiteId}/pages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Invalid Publish Page',
        slug: `${pageSlug}-invalid`,
        status: 'draft',
        content: {
          elements: [
            {
              id: 'invalid-heading',
              type: 'heading',
              x: -10,
              y: 10,
              width: 100,
              height: 40,
              zIndex: 1,
              props: { content: 'Invalid' },
            },
          ],
          canvasSize: { width: 200, height: 200 },
        },
      }),
    });
    assert(invalidPage.response.status === 201, `${invalidPage.url} expected 201, got ${invalidPage.response.status}`);
    const invalidPageId = invalidPage.json?.data?.page?.id;
    const blockedDirectScheduledPage = await request(`/api/admin/sites/${createdSiteId}/pages/${invalidPageId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        status: 'scheduled',
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    });
    assert(blockedDirectScheduledPage.response.status === 400, `${blockedDirectScheduledPage.url} expected readiness 400 for direct schedule, got ${blockedDirectScheduledPage.response.status}`);
    assert(blockedDirectScheduledPage.json?.error?.code === 'READINESS_BLOCKED', `${blockedDirectScheduledPage.url} expected direct schedule readiness error code`);
    const blockedDirectPublishedPage = await request(`/api/admin/sites/${createdSiteId}/pages/${invalidPageId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status: 'published' }),
    });
    assert(blockedDirectPublishedPage.response.status === 400, `${blockedDirectPublishedPage.url} expected readiness 400 for direct publish, got ${blockedDirectPublishedPage.response.status}`);
    assert(blockedDirectPublishedPage.json?.error?.code === 'READINESS_BLOCKED', `${blockedDirectPublishedPage.url} expected direct publish readiness error code`);
    const blockedPublish = await request(`/api/admin/sites/${createdSiteId}/pages/${invalidPageId}/publish`, { method: 'POST' });
    assert(blockedPublish.response.status === 400, `${blockedPublish.url} expected readiness 400, got ${blockedPublish.response.status}`);
    assert(blockedPublish.json?.error?.code === 'READINESS_BLOCKED', `${blockedPublish.url} expected readiness error code`);
    assert(blockedPublish.json?.error?.details?.checks?.some((check) => check.severity === 'error'), `${blockedPublish.url} missing readiness error details`);
    await request(`/api/admin/sites/${createdSiteId}/pages/${invalidPageId}`, { method: 'DELETE' });

    const blockedCreateAsPublished = await request(`/api/admin/sites/${createdSiteId}/pages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Invalid Create Published Page',
        slug: `${pageSlug}-invalid-create-published`,
        status: 'published',
        content: {
          elements: [
            {
              id: 'invalid-create-published-heading',
              type: 'heading',
              x: -10,
              y: 10,
              width: 100,
              height: 40,
              zIndex: 1,
              props: { content: 'Invalid create published' },
            },
          ],
          canvasSize: { width: 200, height: 200 },
        },
      }),
    });
    assert(blockedCreateAsPublished.response.status === 400, `${blockedCreateAsPublished.url} expected readiness 400 for create-as-published, got ${blockedCreateAsPublished.response.status}`);
    assert(blockedCreateAsPublished.json?.error?.code === 'READINESS_BLOCKED', `${blockedCreateAsPublished.url} expected create-as-published readiness error code`);

    const bindMedia = await request(`/api/admin/sites/${createdSiteId}/media/${createdMediaId}/bind`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        targetType: 'page',
        targetId: createdPageId,
        usageType: 'content',
        attachedBy: 'contract-smoke',
      }),
    });
    assert(bindMedia.response.status === 200, `${bindMedia.url} expected 200, got ${bindMedia.response.status}`);
    assert(bindMedia.json?.data?.media?.pageIds?.includes(createdPageId), `${bindMedia.url} did not bind media to page`);
    assert(bindMedia.json?.data?.binding?.targetId === createdPageId, `${bindMedia.url} missing binding metadata`);

    const bindAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=media&entityId=${createdMediaId}&action=media.bind&limit=5`);
    assert(bindAudit.response.status === 200, `${bindAudit.url} expected 200, got ${bindAudit.response.status}`);
    assert(bindAudit.json?.data?.logs?.some((log) => (
      log.action === 'media.bind' &&
      log.metadata?.targetType === 'page' &&
      log.metadata?.targetId === createdPageId &&
      log.metadata?.usageType === 'content'
    )), `${bindAudit.url} missing media bind audit log`);

    const pageMediaList = await request(`/api/admin/sites/${createdSiteId}/media?pageId=${createdPageId}&type=font`);
    assert(pageMediaList.response.status === 200, `${pageMediaList.url} expected 200, got ${pageMediaList.response.status}`);
    assert(pageMediaList.json?.data?.media?.some((item) => item.id === createdMediaId && item.pageIds?.includes(createdPageId)), `${pageMediaList.url} missing page-bound media`);

    const publicPageMediaList = await request(`/api/sites/${createdSiteId}/media?pageId=${createdPageId}&type=font`);
    assert(publicPageMediaList.response.status === 200, `${publicPageMediaList.url} expected 200, got ${publicPageMediaList.response.status}`);
    const publicPageMedia = publicPageMediaList.json?.data?.media?.find((item) => item.id === createdMediaId);
    assert(publicPageMedia?.references?.pageIds?.includes(createdPageId), `${publicPageMediaList.url} missing page reference ids`);
    assert(publicPageMedia?.references?.pages?.some((page) => (
      page.id === createdPageId &&
      page.usageTypes?.includes('content') &&
      page.bindings?.some((binding) => binding.targetId === createdPageId && binding.usageType === 'content')
    )), `${publicPageMediaList.url} missing normalized page binding reference`);
    assert(publicPageMedia?.referenceSummary?.pageCount >= 1, `${publicPageMediaList.url} missing page reference summary`);
    assert(publicPageMedia?.editableMetadata?.tags?.includes('font'), `${publicPageMediaList.url} missing editable media tag metadata`);

    const futurePageSchedule = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const futureScheduledPage = await request(`/api/admin/sites/${createdSiteId}/pages/${createdPageId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status: 'scheduled', scheduledAt: futurePageSchedule }),
    });
    assert(futureScheduledPage.response.status === 200, `${futureScheduledPage.url} expected 200, got ${futureScheduledPage.response.status}`);
    assert(futureScheduledPage.json?.data?.page?.status === 'scheduled', `${futureScheduledPage.url} expected scheduled status`);
    assert(futureScheduledPage.json?.data?.page?.scheduledAt === futurePageSchedule, `${futureScheduledPage.url} expected future schedule`);

    const hiddenScheduledPage = await request(`/api/sites/${createdSiteId}/pages?slug=${pageSlug}`);
    assert(hiddenScheduledPage.response.status === 404, `${hiddenScheduledPage.url} expected future scheduled page to be hidden`);

    const hiddenScheduledPageResolve = await request(`/api/sites/${createdSiteId}/resolve?path=/${pageSlug}`);
    assert(hiddenScheduledPageResolve.response.status === 404, `${hiddenScheduledPageResolve.url} expected future scheduled page route to be hidden`);

    const pastPageSchedule = new Date(Date.now() - 60 * 1000).toISOString();
    const pastScheduledPage = await request(`/api/admin/sites/${createdSiteId}/pages/${createdPageId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status: 'scheduled', scheduledAt: pastPageSchedule }),
    });
    assert(pastScheduledPage.response.status === 400, `${pastScheduledPage.url} expected past schedule 400, got ${pastScheduledPage.response.status}`);
    assert(pastScheduledPage.json?.error?.code === 'SCHEDULED_AT_NOT_FUTURE', `${pastScheduledPage.url} expected past schedule error`);

    const publishedPage = await request(`/api/admin/sites/${createdSiteId}/pages/${createdPageId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status: 'published', scheduledAt: null }),
    });
    assert(publishedPage.response.status === 200, `${publishedPage.url} expected publish 200, got ${publishedPage.response.status}`);

    const visibleScheduledPage = await request(`/api/sites/${createdSiteId}/pages?slug=${pageSlug}`);
    assert(visibleScheduledPage.response.status === 200, `${visibleScheduledPage.url} expected published page to be visible`);
    assert(visibleScheduledPage.response.headers.get('x-backy-cache-scope') === 'discovery', `${visibleScheduledPage.url} missing discovery cache scope`);
    assert(visibleScheduledPage.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${visibleScheduledPage.url} missing contract version header`);
    assert(visibleScheduledPage.response.headers.get('x-backy-site-id') === createdSiteId, `${visibleScheduledPage.url} missing site id header`);
    assert(visibleScheduledPage.response.headers.get('x-backy-cache-revision'), `${visibleScheduledPage.url} missing page cache revision`);
    const visibleScheduledPageEtag = visibleScheduledPage.response.headers.get('etag');
    assert(visibleScheduledPageEtag?.startsWith('"backy-'), `${visibleScheduledPage.url} missing page etag`);
    const revalidatedVisibleScheduledPage = await request(`/api/sites/${createdSiteId}/pages?slug=${pageSlug}`, {
      headers: { 'if-none-match': visibleScheduledPageEtag },
    });
    assert(revalidatedVisibleScheduledPage.response.status === 304, `${revalidatedVisibleScheduledPage.url} expected page 304, got ${revalidatedVisibleScheduledPage.response.status}`);
    assert(revalidatedVisibleScheduledPage.response.headers.get('etag') === visibleScheduledPageEtag, `${revalidatedVisibleScheduledPage.url} expected matching page etag`);
    assert(visibleScheduledPage.json?.success === true, `${visibleScheduledPage.url} expected success envelope`);
    assert(visibleScheduledPage.json?.data?.page?.id === createdPageId, `${visibleScheduledPage.url} returned wrong scheduled page in data envelope`);
    assert(visibleScheduledPage.json?.data?.page?.meta?.frontendDesignTemplateId === 'contract-page-template', `${visibleScheduledPage.url} missing page frontend metadata`);
    assert(visibleScheduledPage.json?.data?.page?.seo?.title === 'Admin Contract Page', `${visibleScheduledPage.url} missing normalized page SEO title`);
    assert(visibleScheduledPage.json?.data?.page?.seo?.description === 'Admin contract page description.', `${visibleScheduledPage.url} missing normalized page SEO description`);
    assert(visibleScheduledPage.json?.data?.page?.seo?.canonical === `/${pageSlug}`, `${visibleScheduledPage.url} missing normalized page canonical path`);
    assert(
      typeof visibleScheduledPage.json?.data?.page?.seo?.canonicalUrl === 'string'
      && visibleScheduledPage.json.data.page.seo.canonicalUrl.startsWith('https://')
      && visibleScheduledPage.json.data.page.seo.canonicalUrl.endsWith(`/${pageSlug}`),
      `${visibleScheduledPage.url} missing normalized page canonical URL`,
    );
    assert(visibleScheduledPage.json?.data?.page?.seo?.robots?.index === true && visibleScheduledPage.json.data.page.seo.robots.follow === true, `${visibleScheduledPage.url} missing normalized page robots`);
    assert(visibleScheduledPage.json?.data?.page?.seo?.openGraph?.image === '/uploads/sites/contract/page-og.jpg', `${visibleScheduledPage.url} missing normalized page Open Graph image`);
    assert(visibleScheduledPage.json?.data?.page?.seo?.keywords?.includes('page-api'), `${visibleScheduledPage.url} missing normalized page keywords`);
    assert(visibleScheduledPage.json?.data?.page?.seo?.jsonLd?.some((entry) => entry?.['@type'] === 'WebPage' && entry?.name === 'Admin Contract Page'), `${visibleScheduledPage.url} missing normalized page JSON-LD`);
    assert(visibleScheduledPage.json?.data?.page?.frontendDesign?.templateId === 'contract-page-template', `${visibleScheduledPage.url} missing normalized page frontend design`);
    assert(visibleScheduledPage.json?.data?.page?.frontendDesign?.routePattern === '/contract-page/{slug}', `${visibleScheduledPage.url} missing normalized page route pattern`);
    assert(visibleScheduledPage.json?.data?.page?.frontendDesign?.chrome?.header?.component === 'ContractPageHeader', `${visibleScheduledPage.url} missing normalized page chrome`);
    assert(visibleScheduledPage.json?.data?.page?.frontendDesign?.tokens?.colors?.primary === '#2563eb', `${visibleScheduledPage.url} missing normalized page tokens`);
    assert(Array.isArray(visibleScheduledPage.json?.data?.page?.frontendDesign?.bindingHints) && visibleScheduledPage.json.data.page.frontendDesign.bindingHints.length === 2, `${visibleScheduledPage.url} missing normalized page binding hints`);
    assert(visibleScheduledPage.json?.page?.id === createdPageId, `${visibleScheduledPage.url} returned wrong scheduled page`);

    const publicPageByPath = await request(`/api/sites/${createdSiteId}/pages?path=/${pageSlug}`);
    assert(publicPageByPath.response.status === 200, `${publicPageByPath.url} expected path lookup 200, got ${publicPageByPath.response.status}`);
    assertBackyContract(publicPageByPath, 'discovery');
    assert(publicPageByPath.json?.success === true, `${publicPageByPath.url} expected success envelope`);
    assert(publicPageByPath.json?.data?.page?.id === createdPageId, `${publicPageByPath.url} returned wrong page for path lookup`);
    assert(publicPageByPath.json?.page?.id === createdPageId, `${publicPageByPath.url} missing legacy page parity for path lookup`);

    const publicPageList = await request(`/api/sites/${createdSiteId}/pages?limit=100`);
    const publicPageListEntry = publicPageList.json?.data?.pages?.find((page) => page.id === createdPageId);
    assert(publicPageList.response.status === 200, `${publicPageList.url} expected public page list`);
    assertBackyContract(publicPageList, 'discovery');
    assert(publicPageList.json?.success === true, `${publicPageList.url} expected success envelope`);
    assert(Array.isArray(publicPageList.json?.data?.pages), `${publicPageList.url} missing data page list`);
    assert(Array.isArray(publicPageList.json?.pages), `${publicPageList.url} missing legacy page list`);
    assert(publicPageList.json.pages.some((page) => page.id === createdPageId), `${publicPageList.url} missing created page in legacy list`);
    assert(publicPageList.json?.data?.pagination?.limit === 100, `${publicPageList.url} expected data pagination limit`);
    assert(publicPageList.json?.data?.pagination?.offset === 0, `${publicPageList.url} expected data pagination offset`);
    assert(publicPageList.json?.pagination?.total === publicPageList.json?.data?.pagination?.total, `${publicPageList.url} expected legacy pagination total parity`);
    assert(publicPageList.json?.pagination?.hasMore === publicPageList.json?.data?.pagination?.hasMore, `${publicPageList.url} expected legacy pagination hasMore parity`);
    assert(publicPageListEntry?.seo?.canonical === `/${pageSlug}`, `${publicPageList.url} missing normalized SEO on page list entries`);

    const pagedPublicPageList = await request(`/api/sites/${createdSiteId}/pages?limit=1&offset=0`);
    assert(pagedPublicPageList.response.status === 200, `${pagedPublicPageList.url} expected paged public page list`);
    assertBackyContract(pagedPublicPageList, 'discovery');
    assert(pagedPublicPageList.json?.success === true, `${pagedPublicPageList.url} expected success envelope`);
    assert(Array.isArray(pagedPublicPageList.json?.data?.pages), `${pagedPublicPageList.url} missing paged data page list`);
    assert(pagedPublicPageList.json.data.pages.length <= 1, `${pagedPublicPageList.url} returned more than requested limit`);
    assert(pagedPublicPageList.json?.data?.pagination?.limit === 1, `${pagedPublicPageList.url} expected paged data limit`);
    assert(pagedPublicPageList.json?.data?.pagination?.offset === 0, `${pagedPublicPageList.url} expected paged data offset`);
    assert(typeof pagedPublicPageList.json?.data?.pagination?.total === 'number', `${pagedPublicPageList.url} missing paged data total`);
    assert(typeof pagedPublicPageList.json?.data?.pagination?.hasMore === 'boolean', `${pagedPublicPageList.url} missing paged data hasMore`);
    assert(pagedPublicPageList.json?.pagination?.limit === pagedPublicPageList.json?.data?.pagination?.limit, `${pagedPublicPageList.url} expected legacy paged limit parity`);
    assert(pagedPublicPageList.json?.pagination?.offset === pagedPublicPageList.json?.data?.pagination?.offset, `${pagedPublicPageList.url} expected legacy paged offset parity`);

    const capturedPageTemplate = await request(`/api/admin/sites/${createdSiteId}/frontend-design`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'capture-content-template',
        resourceType: 'page',
        resourceId: createdPageId,
        templateId: 'captured-page-template',
        templateName: 'Captured Page Template',
        routePattern: '/captured/{slug}',
      }),
    });
    assert(capturedPageTemplate.response.status === 200, `${capturedPageTemplate.url} expected content template capture`);
    const capturedTemplate = capturedPageTemplate.json?.data?.frontendDesign?.templates?.find((template) => template.id === 'captured-page-template');
    assert(capturedTemplate?.type === 'page', `${capturedPageTemplate.url} missing captured page template type`);
    assert(capturedTemplate?.routePattern === '/captured/{slug}', `${capturedPageTemplate.url} missing captured route pattern`);
    assert(Array.isArray(capturedTemplate?.content?.elements) && capturedTemplate.content.elements.some((element) => element.id === 'contract-page-heading'), `${capturedPageTemplate.url} missing captured page elements`);
    assert(capturedTemplate?.content?.canvasSize?.width === 1200, `${capturedPageTemplate.url} missing captured canvas size`);
    assert(Array.isArray(capturedTemplate?.bindingHints) && capturedTemplate.bindingHints.length === 2, `${capturedPageTemplate.url} missing captured binding hints`);
    if (capturedPageTemplate.json?.data?.cacheInvalidation) {
      assert(capturedPageTemplate.json.data.cacheInvalidation.reason === 'site-frontend-design-template-captured', `${capturedPageTemplate.url} missing template capture cache invalidation`);
    }

    const capturedTemplatePage = await request(`/api/admin/sites/${createdSiteId}/pages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Captured Design Page',
        slug: `${pageSlug}-captured-design`,
        status: 'published',
        frontendDesignTemplateId: 'captured-page-template',
      }),
    });
    assert(capturedTemplatePage.response.status === 201, `${capturedTemplatePage.url} expected page from captured template`);
    capturedTemplatePageId = capturedTemplatePage.json?.data?.page?.id;
    assert(capturedTemplatePageId, `${capturedTemplatePage.url} missing captured template page id`);
    assert(capturedTemplatePage.json?.data?.page?.meta?.frontendDesignTemplateId === 'captured-page-template', `${capturedTemplatePage.url} missing captured template provenance`);
    assert(capturedTemplatePage.json?.data?.page?.meta?.frontendDesignRoutePattern === '/captured/{slug}', `${capturedTemplatePage.url} missing captured route provenance`);
    assert(Array.isArray(capturedTemplatePage.json?.data?.page?.content?.elements) && capturedTemplatePage.json.data.page.content.elements.some((element) => element.id === 'contract-page-heading'), `${capturedTemplatePage.url} did not seed captured design elements`);
    const publicCapturedTemplatePage = await request(`/api/sites/${createdSiteId}/pages?slug=${pageSlug}-captured-design`);
    assert(publicCapturedTemplatePage.response.status === 200, `${publicCapturedTemplatePage.url} expected public page from captured template`);
    assert(publicCapturedTemplatePage.json?.data?.page?.frontendDesign?.templateId === 'captured-page-template', `${publicCapturedTemplatePage.url} missing normalized captured frontend design`);
    assert(publicCapturedTemplatePage.json?.data?.page?.frontendDesign?.routePattern === '/captured/{slug}', `${publicCapturedTemplatePage.url} missing normalized captured route pattern`);
    assert(Array.isArray(publicCapturedTemplatePage.json?.data?.page?.frontendDesign?.bindingHints) && publicCapturedTemplatePage.json.data.page.frontendDesign.bindingHints.length === 2, `${publicCapturedTemplatePage.url} missing normalized captured binding hints`);
    const deleteCapturedTemplatePage = await request(`/api/admin/sites/${createdSiteId}/pages/${capturedTemplatePageId}`, { method: 'DELETE' });
    assert(deleteCapturedTemplatePage.response.status === 200, `${deleteCapturedTemplatePage.url} expected captured template page delete`);
    const pageDeleteAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=page&entityId=${capturedTemplatePageId}&action=delete&requestId=${deleteCapturedTemplatePage.json.requestId}`);
    assert(pageDeleteAudit.response.status === 200, `${pageDeleteAudit.url} expected page delete audit readback`);
    assert(pageDeleteAudit.json?.data?.logs?.[0]?.metadata?.slug === `${pageSlug}-captured-design`, `${pageDeleteAudit.url} missing page delete audit metadata`);
    capturedTemplatePageId = null;

    const pageFrontendManifest = await request(`/api/sites/${createdSiteId}/manifest`);
    assert(pageFrontendManifest.response.status === 200, `${pageFrontendManifest.url} expected 200, got ${pageFrontendManifest.response.status}`);
    validateAiFrontendManifest(pageFrontendManifest.json, 'page frontend design manifest');
    assert(pageFrontendManifest.json?.data?.modules?.pages?.items?.some((page) => (
      page.id === createdPageId &&
      page.frontendDesign?.templateId === 'contract-page-template' &&
      page.frontendDesign?.tokens?.colors?.primary === '#2563eb' &&
      page.frontendDesign?.chrome?.header?.component === 'ContractPageHeader'
    )), `${pageFrontendManifest.url} missing page frontend design manifest`);

    const visibleScheduledPageResolve = await request(`/api/sites/${createdSiteId}/resolve?path=/${pageSlug}`);
    assert(visibleScheduledPageResolve.response.status === 200, `${visibleScheduledPageResolve.url} expected published page route to be visible`);
    assert(visibleScheduledPageResolve.json?.data?.route?.type === 'page', `${visibleScheduledPageResolve.url} expected page route type`);
    assert(visibleScheduledPageResolve.json?.data?.route?.resource?.id === createdPageId, `${visibleScheduledPageResolve.url} returned wrong resolved page`);

    const unauthNavigation = await fetch(`${baseUrl}/api/admin/sites/${createdSiteId}/navigation`);
    const unauthNavigationJson = await unauthNavigation.json().catch(() => ({}));
    assert(unauthNavigation.status === 401, `Navigation admin API should reject missing auth, got ${unauthNavigation.status}`);
    assert(unauthNavigationJson?.success === false && unauthNavigationJson?.error?.code === 'UNAUTHORIZED', `Navigation admin API missing auth envelope: ${JSON.stringify(unauthNavigationJson).slice(0, 500)}`);

    const update = await request(`/api/admin/sites/${createdSiteId}/pages/${createdPageId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title: 'Updated Admin Contract Page', status: 'published' }),
    });
    assert(update.response.status === 200, `${update.url} expected 200, got ${update.response.status}`);
    assert(update.json?.data?.page?.title === 'Updated Admin Contract Page', `${update.url} expected updated title`);
    assert(update.json?.data?.page?.status === 'published', `${update.url} expected published status`);
    const pageUpdateAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=page&entityId=${createdPageId}&action=update&requestId=${update.json.requestId}`);
    assert(pageUpdateAudit.response.status === 200, `${pageUpdateAudit.url} expected page update audit readback`);
    assert(pageUpdateAudit.json?.data?.logs?.[0]?.metadata?.changedFields?.includes('title'), `${pageUpdateAudit.url} missing page update changedFields metadata`);
    assert(pageUpdateAudit.json?.data?.logs?.[0]?.before?.title === 'Admin Contract Page', `${pageUpdateAudit.url} missing page update before snapshot`);
    assert(pageUpdateAudit.json?.data?.logs?.[0]?.after?.title === 'Updated Admin Contract Page', `${pageUpdateAudit.url} missing page update after snapshot`);

    const invalidNavigation = await request(`/api/admin/sites/${createdSiteId}/navigation`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        primary: [
          {
            id: 'contract-nav-missing-page',
            type: 'page',
            pageId: 'missing-page-id',
            label: 'Missing page',
          },
        ],
      }),
    });
    assert(invalidNavigation.response.status === 400, `${invalidNavigation.url} expected invalid navigation 400`);
    assert(invalidNavigation.json?.error?.code === 'NAVIGATION_VALIDATION', `${invalidNavigation.url} expected NAVIGATION_VALIDATION`);

    const navigationSettings = await request(`/api/admin/sites/${createdSiteId}/navigation`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        primary: [
          {
            id: 'contract-nav-page',
            type: 'page',
            pageId: createdPageId,
            label: 'Contract Page',
            children: [
              {
                id: 'contract-nav-child',
                type: 'route',
                label: 'Child Route',
                path: `/${pageSlug}#details`,
              },
            ],
          },
          {
            id: 'contract-nav-docs',
            type: 'url',
            label: 'Docs',
            href: 'https://example.com/docs',
            target: '_blank',
          },
        ],
        footer: [
          {
            id: 'contract-footer-page',
            type: 'page',
            pageId: createdPageId,
            label: 'Footer Page',
          },
        ],
      }),
    });
    assert(navigationSettings.response.status === 200, `${navigationSettings.url} expected navigation settings update`);
    assert(navigationSettings.json?.data?.navigation?.settings?.primary?.some((item) => item.id === 'contract-nav-page'), `${navigationSettings.url} missing persisted navigation item`);
    assert(navigationSettings.json?.data?.navigation?.resolved?.primary?.some((item) => item.id === 'contract-nav-docs' && item.href === 'https://example.com/docs'), `${navigationSettings.url} missing resolved custom URL item`);

    const adminNavigation = await request(`/api/admin/sites/${createdSiteId}/navigation`);
    assert(adminNavigation.response.status === 200, `${adminNavigation.url} expected navigation read 200`);
    assert(adminNavigation.json?.data?.navigation?.settings?.primary?.some((item) => item.id === 'contract-nav-page'), `${adminNavigation.url} missing saved navigation item`);

    const publicNavigation = await request(`/api/sites/${createdSiteId}/navigation`);
    assert(publicNavigation.response.status === 200, `${publicNavigation.url} expected 200, got ${publicNavigation.response.status}`);
    assert(publicNavigation.response.headers.get('x-backy-cache-scope') === 'discovery', `${publicNavigation.url} missing navigation cache scope`);
    assert(publicNavigation.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${publicNavigation.url} missing navigation contract version`);
    assert(publicNavigation.response.headers.get('x-backy-site-id') === createdSiteId, `${publicNavigation.url} missing navigation site id header`);
    assert(publicNavigation.response.headers.get('x-backy-cache-revision'), `${publicNavigation.url} missing navigation cache revision`);
    const publicNavigationEtag = publicNavigation.response.headers.get('etag');
    assert(publicNavigationEtag?.startsWith('"backy-'), `${publicNavigation.url} missing navigation etag`);
    const revalidatedPublicNavigation = await request(`/api/sites/${createdSiteId}/navigation`, {
      headers: { 'if-none-match': publicNavigationEtag },
    });
    assert(revalidatedPublicNavigation.response.status === 304, `${revalidatedPublicNavigation.url} expected navigation 304, got ${revalidatedPublicNavigation.response.status}`);
    assert(revalidatedPublicNavigation.response.headers.get('etag') === publicNavigationEtag, `${revalidatedPublicNavigation.url} expected matching navigation etag`);
    assert(publicNavigation.json?.success === true, `${publicNavigation.url} expected success envelope`);
    assert(
      publicNavigation.json?.data?.navigation?.primary?.some((item) => (
        item.id === 'contract-nav-page'
        && item.pageId === createdPageId
        && item.path === `/${pageSlug}`
        && item.children?.some((child) => child.id === 'contract-nav-child' && child.path === `/${pageSlug}#details`)
      )),
      `${publicNavigation.url} missing configured nested page navigation item`,
    );
    assert(
      publicNavigation.json?.data?.navigation?.primary?.some((item) => (
        item.id === 'contract-nav-docs' && item.type === 'url' && item.href === 'https://example.com/docs' && item.target === '_blank'
      )),
      `${publicNavigation.url} missing custom URL navigation item`,
    );
    assert(
      publicNavigation.json?.data?.navigation?.footer?.some((item) => item.id === 'contract-footer-page' && item.pageId === createdPageId),
      `${publicNavigation.url} missing configured footer navigation item`,
    );

    const renderPayload = await request(`/api/sites/${createdSiteId}/render?path=/${pageSlug}`);
    assert(renderPayload.response.status === 200, `${renderPayload.url} expected 200, got ${renderPayload.response.status}`);
    assert(renderPayload.response.headers.get('cache-control')?.includes('max-age=30'), `${renderPayload.url} missing render cache header`);
    assert(renderPayload.response.headers.get('x-backy-cache-scope') === 'render', `${renderPayload.url} missing render cache scope`);
    assert(renderPayload.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${renderPayload.url} missing contract version header`);
    assert(renderPayload.response.headers.get('x-backy-schema-version') === 'backy.content-payload.v1', `${renderPayload.url} missing render schema version header`);
    assert(renderPayload.response.headers.get('x-backy-supported-schema-versions')?.includes('backy.content-payload.v1'), `${renderPayload.url} missing supported render schema versions header`);
    assert(renderPayload.response.headers.get('x-backy-site-id') === createdSiteId, `${renderPayload.url} missing site id header`);
    const renderCacheRevision = renderPayload.response.headers.get('x-backy-cache-revision');
    assert(renderCacheRevision, `${renderPayload.url} missing render cache revision`);
    const renderEtag = renderPayload.response.headers.get('etag');
    assert(renderEtag?.startsWith('"backy-'), `${renderPayload.url} missing render etag`);
    const revalidatedRender = await request(`/api/sites/${createdSiteId}/render?path=/${pageSlug}`, {
      headers: { 'if-none-match': renderEtag },
    });
    assert(revalidatedRender.response.status === 304, `${revalidatedRender.url} expected render 304, got ${revalidatedRender.response.status}`);
    assert(revalidatedRender.response.headers.get('etag') === renderEtag, `${revalidatedRender.url} expected matching render etag`);
    assert(revalidatedRender.response.headers.get('x-backy-cache-revision') === renderCacheRevision, `${revalidatedRender.url} expected matching render cache revision`);
    validateAiRenderPayload(renderPayload.json, 'page render payload');
    assert(renderPayload.json?.data?.frontendDesign?.site?.schemaVersion === 'backy.frontend-design.v1', `${renderPayload.url} missing render site frontend design contract`);
    assert(renderPayload.json?.data?.frontendDesign?.site?.templates?.some((template) => template.id === 'captured-page-template'), `${renderPayload.url} missing render frontend design templates`);
    assert(renderPayload.json?.data?.frontendDesign?.content?.templateId === 'contract-page-template', `${renderPayload.url} missing render page frontend design provenance`);
    assert(renderPayload.json?.data?.frontendDesign?.content?.chrome?.header?.component === 'ContractPageHeader', `${renderPayload.url} missing render page frontend design chrome`);
    assert(renderPayload.json?.data?.frontendDesign?.content?.tokens?.colors?.primary === '#2563eb', `${renderPayload.url} missing render page frontend design tokens`);
    assert(
      renderPayload.json?.data?.navigation?.primary?.some((item) => item.id === 'contract-nav-page' && item.pageId === createdPageId),
      `${renderPayload.url} missing configured render navigation manifest`,
    );
    const renderFontAsset = renderPayload.json?.data?.assets?.fonts?.find((font) => (
      font.id === createdMediaId &&
      font.family === 'Contract Sans Display'
    ));
    assert(
      renderFontAsset &&
        renderFontAsset.fallbackStack === 'Georgia, serif' &&
        renderFontAsset.display === 'optional' &&
        renderFontAsset.cssFamily === '"Contract Sans Display", Georgia, serif',
      `${renderPayload.url} missing uploaded font asset manifest with fallback metadata`,
    );
    assert(
      renderFontAsset.assetIds?.includes?.(createdMediaId) &&
        renderFontAsset.variants?.some((variant) => (
          variant.mediaId === createdMediaId &&
          variant.weight === '600' &&
          variant.style === 'normal' &&
          variant.display === 'optional'
        )),
      `${renderPayload.url} missing uploaded font variant/asset-id manifest`,
    );
    assert(
      renderPayload.json?.data?.seo?.jsonLd?.some((entry) => entry?.['@type'] === 'WebPage' && entry?.name === 'Admin Contract Page'),
      `${renderPayload.url} missing route JSON-LD in render SEO`,
    );

    const negotiatedRenderPayload = await request(`/api/sites/${createdSiteId}/render?path=/${pageSlug}&schemaVersion=backy.content-payload.v1`);
    assert(negotiatedRenderPayload.response.status === 200, `${negotiatedRenderPayload.url} expected negotiated render 200`);
    assert(negotiatedRenderPayload.response.headers.get('x-backy-schema-version') === 'backy.content-payload.v1', `${negotiatedRenderPayload.url} returned wrong negotiated schema version`);
    validateAiRenderPayload(negotiatedRenderPayload.json, 'negotiated page render payload');

    const unsupportedRenderPayload = await request(`/api/sites/${createdSiteId}/render?path=/${pageSlug}&schemaVersion=backy.content-payload.v0`);
    assert(unsupportedRenderPayload.response.status === 406, `${unsupportedRenderPayload.url} expected unsupported schema 406`);
    assertBackyContract(unsupportedRenderPayload, 'error');
    assert(unsupportedRenderPayload.response.headers.get('x-backy-schema-version') === 'backy.content-payload.v1', `${unsupportedRenderPayload.url} missing fallback schema version header`);
    assert(unsupportedRenderPayload.response.headers.get('x-backy-supported-schema-versions')?.includes('backy.content-payload.v1'), `${unsupportedRenderPayload.url} missing supported schema versions header`);
    assert(unsupportedRenderPayload.json?.error?.code === 'UNSUPPORTED_RENDER_SCHEMA_VERSION', `${unsupportedRenderPayload.url} returned wrong unsupported schema error`);
    assert(unsupportedRenderPayload.json?.error?.details?.supportedSchemaVersions?.includes('backy.content-payload.v1'), `${unsupportedRenderPayload.url} missing supported schema details`);

    const resolvedPage = await request(`/api/sites/${createdSiteId}/resolve?path=/${pageSlug}`);
    assert(resolvedPage.response.status === 200, `${resolvedPage.url} expected 200, got ${resolvedPage.response.status}`);
    assert(resolvedPage.response.headers.get('x-backy-cache-scope') === 'discovery', `${resolvedPage.url} missing resolve cache scope`);
    assert(resolvedPage.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${resolvedPage.url} missing resolve contract version`);
    assert(resolvedPage.response.headers.get('x-backy-site-id') === createdSiteId, `${resolvedPage.url} missing resolve site id header`);
    assert(resolvedPage.response.headers.get('x-backy-cache-revision'), `${resolvedPage.url} missing resolve cache revision`);
    const resolvedPageEtag = resolvedPage.response.headers.get('etag');
    assert(resolvedPageEtag?.startsWith('"backy-'), `${resolvedPage.url} missing resolve etag`);
    const revalidatedResolvedPage = await request(`/api/sites/${createdSiteId}/resolve?path=/${pageSlug}`, {
      headers: { 'if-none-match': resolvedPageEtag },
    });
    assert(revalidatedResolvedPage.response.status === 304, `${revalidatedResolvedPage.url} expected resolve 304, got ${revalidatedResolvedPage.response.status}`);
    assert(revalidatedResolvedPage.response.headers.get('etag') === resolvedPageEtag, `${revalidatedResolvedPage.url} expected matching resolve etag`);
    assert(resolvedPage.json?.success === true, `${resolvedPage.url} expected success envelope`);
    assert(resolvedPage.json?.data?.route?.type === 'page', `${resolvedPage.url} expected page route`);
    assert(resolvedPage.json?.data?.route?.resource?.id === createdPageId, `${resolvedPage.url} returned wrong resolved page`);

    const redirectSourcePath = `/old-${pageSlug}`;
    const goneSourcePath = `/retired-${pageSlug}`;
    const unauthRedirects = await fetch(`${baseUrl}/api/admin/sites/${createdSiteId}/redirects`);
    const unauthRedirectsJson = await unauthRedirects.json().catch(() => ({}));
    assert(unauthRedirects.status === 401, `Redirects admin API should reject missing auth, got ${unauthRedirects.status}`);
    assert(unauthRedirectsJson?.success === false && unauthRedirectsJson?.error?.code === 'UNAUTHORIZED', `Redirects admin API missing auth envelope: ${JSON.stringify(unauthRedirectsJson).slice(0, 500)}`);

    const invalidRedirectSettings = await request(`/api/admin/sites/${createdSiteId}/redirects`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        redirectRules: [
          {
            id: 'contract-invalid-redirect',
            from: redirectSourcePath,
            to: redirectSourcePath,
            statusCode: 301,
            enabled: true,
          },
        ],
      }),
    });
    assert(invalidRedirectSettings.response.status === 400, `${invalidRedirectSettings.url} expected invalid redirect 400`);
    assert(invalidRedirectSettings.json?.error?.code === 'REDIRECT_VALIDATION', `${invalidRedirectSettings.url} expected REDIRECT_VALIDATION`);

    const redirectPreview = await request(`/api/admin/sites/${createdSiteId}/redirects`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        redirectRules: [
          {
            id: 'contract-redirect-preview-conflict',
            from: `/${pageSlug}`,
            to: '/missing-contract-target',
            statusCode: 302,
            enabled: true,
          },
        ],
      }),
    });
    assert(redirectPreview.response.status === 200, `${redirectPreview.url} expected redirect preview 200`);
    assert(redirectPreview.json?.data?.redirects?.persisted === false, `${redirectPreview.url} expected non-persisted preview`);
    assert(
      redirectPreview.json?.data?.redirects?.conflicts?.some((conflict) => (
        conflict.kind === 'source-route-conflict'
        && conflict.from === `/${pageSlug}`
        && conflict.route?.type === 'page'
      )),
      `${redirectPreview.url} missing redirect source route conflict preview`,
    );
    assert(
      redirectPreview.json?.data?.redirects?.conflicts?.some((conflict) => (
        conflict.kind === 'target-route-missing'
        && conflict.to === '/missing-contract-target'
      )),
      `${redirectPreview.url} missing redirect missing target preview`,
    );

    const redirectSettings = await request(`/api/admin/sites/${createdSiteId}/redirects`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        redirectRules: [
          {
            id: 'contract-redirect',
            from: redirectSourcePath,
            to: `/${pageSlug}`,
            statusCode: 301,
            enabled: true,
          },
          {
            id: 'contract-gone',
            from: goneSourcePath,
            statusCode: 410,
            enabled: true,
          },
        ],
      }),
    });
    assert(redirectSettings.response.status === 200, `${redirectSettings.url} expected redirect settings update`);
    assert(
      redirectSettings.json?.data?.redirects?.rules?.some((rule) => (
        rule.id === 'contract-redirect' && rule.from === redirectSourcePath && rule.to === `/${pageSlug}`
      )),
      `${redirectSettings.url} missing persisted redirect rule`,
    );
    assert(Array.isArray(redirectSettings.json?.data?.redirects?.conflicts), `${redirectSettings.url} missing redirect conflict preview array`);

    const adminRedirects = await request(`/api/admin/sites/${createdSiteId}/redirects`);
    assert(adminRedirects.response.status === 200, `${adminRedirects.url} expected redirects read 200`);
    assert(adminRedirects.json?.data?.redirects?.rules?.some((rule) => rule.id === 'contract-gone' && rule.statusCode === 410), `${adminRedirects.url} missing saved gone rule`);
    assert(Array.isArray(adminRedirects.json?.data?.redirects?.conflicts), `${adminRedirects.url} missing saved redirect conflict preview array`);

    const redirectedRoute = await request(`/api/sites/${createdSiteId}/resolve?path=${encodeURIComponent(redirectSourcePath)}`);
    assert(redirectedRoute.response.status === 200, `${redirectedRoute.url} expected redirect route resolve`);
    assert(redirectedRoute.response.headers.get('x-backy-cache-scope') === 'discovery', `${redirectedRoute.url} missing redirect resolve cache scope`);
    assert(redirectedRoute.response.headers.get('etag')?.startsWith('"backy-'), `${redirectedRoute.url} missing redirect resolve etag`);
    assert(redirectedRoute.json?.data?.route?.type === 'redirect', `${redirectedRoute.url} expected redirect route`);
    assert(redirectedRoute.json?.data?.route?.resource?.to === `/${pageSlug}`, `${redirectedRoute.url} returned wrong redirect target`);
    assert(redirectedRoute.json?.data?.route?.resource?.statusCode === 301, `${redirectedRoute.url} returned wrong redirect status code`);

    const goneRoute = await request(`/api/sites/${createdSiteId}/resolve?path=${encodeURIComponent(goneSourcePath)}`);
    assert(goneRoute.response.status === 410, `${goneRoute.url} expected 410 gone route`);
    assert(goneRoute.response.headers.get('x-backy-cache-scope') === 'discovery', `${goneRoute.url} missing gone resolve cache scope`);
    assert(goneRoute.json?.success === false, `${goneRoute.url} expected gone error envelope`);
    assert(goneRoute.json?.data?.route?.type === 'gone', `${goneRoute.url} expected gone route`);

    const readiness = await request(`/api/admin/sites/${createdSiteId}/readiness`);
    assert(readiness.response.status === 200, `${readiness.url} expected 200, got ${readiness.response.status}`);
    assert(readiness.json?.success === true, `${readiness.url} expected success envelope`);
    assert(readiness.json?.data?.readiness?.site?.id === createdSiteId, `${readiness.url} returned wrong site readiness`);
    assert(Number.isFinite(readiness.json?.data?.readiness?.score), `${readiness.url} missing readiness score`);
    assert(readiness.json?.data?.readiness?.summary?.pages >= 1, `${readiness.url} missing page summary count`);
    assert(readiness.json?.data?.readiness?.pages?.some((page) => (
      page.id === createdPageId &&
      page.elementCount > 0 &&
      page.checks?.some((check) => check.id === `page:${createdPageId}:canvas-size` && check.status === 'pass')
    )), `${readiness.url} missing created page readiness checks`);
    assert(
      readiness.json?.readiness?.checks?.some((check) => check.id === 'site:homepage'),
      `${readiness.url} missing legacy readiness checks`,
    );

    const pageComment = await request(`/api/sites/${createdSiteId}/pages/${createdPageId}/comments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        content: 'This page comment verifies public comment envelopes.',
        authorName: 'Contract Commenter',
        moderationMode: 'auto-approve',
        requestId: 'contract-page-comment',
        rateLimitBypass: true,
      }),
    });
    assert(pageComment.response.status === 201, `${pageComment.url} expected 201, got ${pageComment.response.status}`);
    assertBackyContract(pageComment, 'private');
    assert(pageComment.json?.success === true, `${pageComment.url} expected success envelope`);
    assert(pageComment.json?.data?.comment?.status === 'approved', `${pageComment.url} expected approved comment in data envelope`);
    assert(pageComment.json?.comment?.id === pageComment.json?.data?.comment?.id, `${pageComment.url} expected legacy comment to match data envelope`);
    const pageCommentId = pageComment.json.data.comment.id;

    const pageCommentReply = await request(`/api/sites/${createdSiteId}/pages/${createdPageId}/comments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        body: 'This reply verifies comment body aliases and threaded replies.',
        authorName: 'Contract Reply',
        parentId: pageCommentId,
        threadId: 'contract-comment-thread',
        moderationMode: 'auto-approve',
        requestId: 'contract-page-comment-reply',
        rateLimitBypass: true,
      }),
    });
    assert(pageCommentReply.response.status === 201, `${pageCommentReply.url} expected reply 201, got ${pageCommentReply.response.status}`);
    assertBackyContract(pageCommentReply, 'private');
    assert(pageCommentReply.json?.data?.comment?.parentId === pageCommentId, `${pageCommentReply.url} missing reply parent id`);
    assert(pageCommentReply.json?.data?.comment?.commentThreadId === 'contract-comment-thread', `${pageCommentReply.url} missing reply thread id`);
    assert(pageCommentReply.json?.data?.comment?.content === 'This reply verifies comment body aliases and threaded replies.', `${pageCommentReply.url} did not accept body alias`);
    const pageCommentReplyId = pageCommentReply.json.data.comment.id;

    const pageCommentReplies = await request(`/api/sites/${createdSiteId}/pages/${createdPageId}/comments?status=approved&parentId=${pageCommentId}`);
    assert(pageCommentReplies.response.status === 200, `${pageCommentReplies.url} expected 200, got ${pageCommentReplies.response.status}`);
    assert(pageCommentReplies.json?.data?.comments?.some((comment) => comment.id === pageCommentReplyId), `${pageCommentReplies.url} missing threaded reply in data envelope`);
    assert(!pageCommentReplies.json?.data?.comments?.some((comment) => comment.id === pageCommentId), `${pageCommentReplies.url} included parent in reply list`);

    const pageComments = await request(`/api/sites/${createdSiteId}/pages/${createdPageId}/comments?status=approved&requestId=contract-page-comment`);
    assert(pageComments.response.status === 200, `${pageComments.url} expected 200, got ${pageComments.response.status}`);
    assertBackyContract(pageComments, 'private');
    assert(pageComments.json?.success === true, `${pageComments.url} expected success envelope`);
    assert(pageComments.json?.data?.comments?.some((comment) => comment.id === pageCommentId), `${pageComments.url} missing comment in data envelope`);
    assert(pageComments.json?.comments?.some((comment) => comment.id === pageCommentId), `${pageComments.url} missing legacy comment list`);

    const pageCommentDetail = await request(`/api/sites/${createdSiteId}/pages/${createdPageId}/comments/${pageCommentId}`);
    assert(pageCommentDetail.response.status === 200, `${pageCommentDetail.url} expected 200, got ${pageCommentDetail.response.status}`);
    assertBackyContract(pageCommentDetail, 'private');
    assert(pageCommentDetail.json?.success === true, `${pageCommentDetail.url} expected success envelope`);
    assert(pageCommentDetail.json?.data?.comment?.id === pageCommentId, `${pageCommentDetail.url} missing comment in data envelope`);
    assert(pageCommentDetail.json?.comment?.id === pageCommentId, `${pageCommentDetail.url} missing legacy comment`);

    const pageCommentReview = await request(`/api/sites/${createdSiteId}/pages/${createdPageId}/comments/${pageCommentId}`, {
      method: 'PATCH',
      headers: withAdminAuth({
        'content-type': 'application/json',
      }),
      body: JSON.stringify({
        status: 'approved',
        reviewedBy: 'contract-smoke',
        requestId: 'contract-page-comment-review',
      }),
    });
    assert(pageCommentReview.response.status === 200, `${pageCommentReview.url} expected 200, got ${pageCommentReview.response.status}`);
    assertBackyContract(pageCommentReview, 'private');
    assert(pageCommentReview.json?.success === true, `${pageCommentReview.url} expected success envelope`);
    assert(pageCommentReview.json?.requestId === 'contract-page-comment-review', `${pageCommentReview.url} expected request id`);
    assert(pageCommentReview.json?.data?.comment?.id === pageCommentId, `${pageCommentReview.url} missing reviewed comment in data envelope`);

    const siteComments = await request(`/api/sites/${createdSiteId}/comments?targetType=page&targetId=${createdPageId}&status=approved&requestId=contract-page-comment`);
    assert(siteComments.response.status === 200, `${siteComments.url} expected 200, got ${siteComments.response.status}`);
    assertBackyContract(siteComments, 'private');
    assert(siteComments.json?.success === true, `${siteComments.url} expected success envelope`);
    assert(siteComments.json?.data?.comments?.some((comment) => comment.id === pageCommentId), `${siteComments.url} missing site comment in data envelope`);
    assert(siteComments.json?.comments?.some((comment) => comment.id === pageCommentId), `${siteComments.url} missing legacy site comment list`);

    const siteCommentDetail = await request(`/api/sites/${createdSiteId}/comments/${pageCommentId}`);
    assert(siteCommentDetail.response.status === 200, `${siteCommentDetail.url} expected 200, got ${siteCommentDetail.response.status}`);
    assertBackyContract(siteCommentDetail, 'private');
    assert(siteCommentDetail.json?.success === true, `${siteCommentDetail.url} expected success envelope`);
    assert(siteCommentDetail.json?.data?.comment?.id === pageCommentId, `${siteCommentDetail.url} missing site comment in data envelope`);
    assert(siteCommentDetail.json?.comment?.id === pageCommentId, `${siteCommentDetail.url} missing legacy site comment`);

    const siteCommentReview = await request(`/api/sites/${createdSiteId}/comments/${pageCommentId}`, {
      method: 'PATCH',
      headers: withAdminAuth({
        'content-type': 'application/json',
      }),
      body: JSON.stringify({
        status: 'approved',
        reviewedBy: 'contract-smoke',
        requestId: 'contract-site-comment-review',
      }),
    });
    assert(siteCommentReview.response.status === 200, `${siteCommentReview.url} expected 200, got ${siteCommentReview.response.status}`);
    assertBackyContract(siteCommentReview, 'private');
    assert(siteCommentReview.json?.success === true, `${siteCommentReview.url} expected success envelope`);
    assert(siteCommentReview.json?.data?.comment?.id === pageCommentId, `${siteCommentReview.url} missing reviewed site comment in data envelope`);

    const reportReasons = await request(`/api/sites/${createdSiteId}/comments/report-reasons`);
    assert(reportReasons.response.status === 200, `${reportReasons.url} expected 200, got ${reportReasons.response.status}`);
    assert(reportReasons.response.headers.get('x-backy-cache-scope') === 'discovery', `${reportReasons.url} missing report reasons cache scope`);
    assert(reportReasons.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${reportReasons.url} missing report reasons contract version`);
    assert(reportReasons.response.headers.get('x-backy-site-id') === createdSiteId, `${reportReasons.url} missing report reasons site id header`);
    assert(reportReasons.response.headers.get('x-backy-cache-revision'), `${reportReasons.url} missing report reasons cache revision`);
    const reportReasonsEtag = reportReasons.response.headers.get('etag');
    assert(reportReasonsEtag?.startsWith('"backy-'), `${reportReasons.url} missing report reasons etag`);
    const revalidatedReportReasons = await request(`/api/sites/${createdSiteId}/comments/report-reasons`, {
      headers: { 'if-none-match': reportReasonsEtag },
    });
    assert(revalidatedReportReasons.response.status === 304, `${revalidatedReportReasons.url} expected report reasons 304, got ${revalidatedReportReasons.response.status}`);
    assert(revalidatedReportReasons.response.headers.get('etag') === reportReasonsEtag, `${revalidatedReportReasons.url} expected matching report reasons etag`);
    assert(reportReasons.json?.success === true, `${reportReasons.url} expected success envelope`);
    assert(reportReasons.json?.data?.reasons?.includes('spam'), `${reportReasons.url} missing report reason in data envelope`);
    assert(reportReasons.json?.reasons?.includes('spam'), `${reportReasons.url} missing legacy report reasons`);

    const commentReportReasons = await request(`/api/sites/${createdSiteId}/comments/${pageCommentId}/report`);
    assert(commentReportReasons.response.status === 200, `${commentReportReasons.url} expected 200, got ${commentReportReasons.response.status}`);
    assertBackyContract(commentReportReasons, 'discovery');
    assert(commentReportReasons.response.headers.get('x-backy-site-id') === createdSiteId, `${commentReportReasons.url} missing comment report reason site id header`);
    assert(commentReportReasons.response.headers.get('etag')?.startsWith('"backy-'), `${commentReportReasons.url} missing comment report reason etag`);
    assert(commentReportReasons.json?.success === true, `${commentReportReasons.url} expected success envelope`);
    assert(commentReportReasons.json?.data?.reasons?.includes('spam'), `${commentReportReasons.url} missing report reason in data envelope`);
    assert(commentReportReasons.json?.reasons?.includes('spam'), `${commentReportReasons.url} missing legacy report reasons`);

    const reportedComment = await request(`/api/sites/${createdSiteId}/comments/${pageCommentId}/report`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        reason: 'spam',
        actor: 'contract-smoke',
        requestId: 'contract-page-comment-report',
      }),
    });
    assert(reportedComment.response.status === 201, `${reportedComment.url} expected 201, got ${reportedComment.response.status}`);
    assertBackyContract(reportedComment, 'private');
    assert(reportedComment.json?.success === true, `${reportedComment.url} expected success envelope`);
    assert(reportedComment.json?.requestId === 'contract-page-comment-report', `${reportedComment.url} expected request id`);
    assert(reportedComment.json?.data?.comment?.id === pageCommentId, `${reportedComment.url} missing reported comment in data envelope`);
    assert(reportedComment.json?.data?.comment?.reportCount >= 1, `${reportedComment.url} did not increment report count`);
    assert(reportedComment.json?.comment?.id === pageCommentId, `${reportedComment.url} missing legacy reported comment`);

    const clearCommentReports = await request(`/api/sites/${createdSiteId}/comments`, {
      method: 'PATCH',
      headers: withAdminAuth({
        'content-type': 'application/json',
      }),
      body: JSON.stringify({
        ids: [pageCommentId],
        action: 'clearReports',
        actor: 'contract-smoke',
        requestId: 'contract-page-comment-clear-reports',
      }),
    });
    assert(clearCommentReports.response.status === 200, `${clearCommentReports.url} expected 200, got ${clearCommentReports.response.status}`);
    assertBackyContract(clearCommentReports, 'private');
    assert(clearCommentReports.json?.success === true, `${clearCommentReports.url} expected success envelope`);
    assert(clearCommentReports.json?.data?.updated?.[0]?.id === pageCommentId, `${clearCommentReports.url} missing cleared comment`);
    assert(clearCommentReports.json?.data?.updated?.[0]?.reportCount === 0, `${clearCommentReports.url} did not clear report count`);
    assert(Array.isArray(clearCommentReports.json?.data?.updated?.[0]?.reportReasons) && clearCommentReports.json.data.updated[0].reportReasons.length === 0, `${clearCommentReports.url} did not clear report reasons`);
    assert(clearCommentReports.json?.data?.updated?.[0]?.status === 'approved', `${clearCommentReports.url} changed comment status while clearing reports`);

    const commentReportEvents = await request(`/api/sites/${createdSiteId}/events?kind=comment-reported&requestId=contract-page-comment-report`, {
      headers: withAdminAuth(),
    });
    assert(commentReportEvents.response.status === 200, `${commentReportEvents.url} expected 200, got ${commentReportEvents.response.status}`);
    assertBackyContract(commentReportEvents, 'private');
    assert(commentReportEvents.json?.success === true, `${commentReportEvents.url} expected success envelope`);
    assert(commentReportEvents.json?.data?.events?.some((event) => event.commentId === pageCommentId), `${commentReportEvents.url} missing comment report event in data envelope`);
    assert(commentReportEvents.json?.events?.some((event) => event.commentId === pageCommentId), `${commentReportEvents.url} missing legacy comment report event`);

    const blockedAuthorEmail = `blocked-author-${unique}@example.test`;
    const blockableComment = await request(`/api/sites/${createdSiteId}/pages/${createdPageId}/comments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        content: 'This comment will seed the author blocklist.',
        authorName: 'Blocked Author',
        authorEmail: blockedAuthorEmail,
        moderationMode: 'auto-approve',
        requestId: 'contract-page-comment-blockable',
        rateLimitBypass: true,
      }),
    });
    assert(blockableComment.response.status === 201, `${blockableComment.url} expected blockable comment 201, got ${blockableComment.response.status}`);
    const blockableCommentId = blockableComment.json?.data?.comment?.id;
    assert(blockableCommentId, `${blockableComment.url} missing blockable comment id`);

    const blockAuthor = await request(`/api/sites/${createdSiteId}/comments`, {
      method: 'PATCH',
      headers: withAdminAuth({
        'content-type': 'application/json',
      }),
      body: JSON.stringify({
        commentIds: [blockableCommentId],
        status: 'blocked',
        blockReason: 'abuse',
        actor: 'contract-smoke',
        requestId: 'contract-page-comment-block-author',
      }),
    });
    assert(blockAuthor.response.status === 200, `${blockAuthor.url} expected block author 200, got ${blockAuthor.response.status}`);
    assert(blockAuthor.json?.data?.updated?.[0]?.status === 'blocked', `${blockAuthor.url} did not block comment`);

    const authorBlocklist = await request(`/api/sites/${createdSiteId}/comments/blocklist?type=all`, {
      headers: withAdminAuth(),
    });
    assert(authorBlocklist.response.status === 200, `${authorBlocklist.url} expected blocklist 200, got ${authorBlocklist.response.status}`);
    assertBackyContract(authorBlocklist, 'private');
    const blockedAuthorEntries = (authorBlocklist.json?.data?.blocklist || [])
      .filter((entry) => entry.requestId === 'contract-page-comment-block-author');
    const blockedAuthorEntry = blockedAuthorEntries.find((entry) => entry.value === blockedAuthorEmail);
    assert(blockedAuthorEntry?.id, `${authorBlocklist.url} missing blocked author entry`);
    assert(blockedAuthorEntry?.reason === 'abuse', `${authorBlocklist.url} missing blocked author reason`);
    assert(blockedAuthorEntries.length >= 1, `${authorBlocklist.url} missing blocked author entries`);

    const blockedAuthorAttempt = await request(`/api/sites/${createdSiteId}/pages/${createdPageId}/comments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        content: 'This blocked author should not be accepted.',
        authorName: 'Blocked Author',
        authorEmail: blockedAuthorEmail,
        moderationMode: 'auto-approve',
        requestId: 'contract-page-comment-blocked-author-attempt',
        rateLimitBypass: true,
      }),
    });
    assert(blockedAuthorAttempt.response.status === 422, `${blockedAuthorAttempt.url} expected blocked author 422, got ${blockedAuthorAttempt.response.status}`);
    assert(blockedAuthorAttempt.json?.status === 'blocked', `${blockedAuthorAttempt.url} missing blocked author status`);
    assert(blockedAuthorAttempt.json?.spamFlags?.includes('blocked-actor'), `${blockedAuthorAttempt.url} missing blocked actor flag`);

    const unblockAuthor = await request(`/api/sites/${createdSiteId}/comments/blocklist`, {
      method: 'DELETE',
      headers: withAdminAuth({
        'content-type': 'application/json',
      }),
      body: JSON.stringify({
        ids: blockedAuthorEntries.map((entry) => entry.id),
      }),
    });
    assert(unblockAuthor.response.status === 200, `${unblockAuthor.url} expected unblock author 200, got ${unblockAuthor.response.status}`);
    assert(unblockAuthor.json?.data?.deleted?.some((entry) => entry.id === blockedAuthorEntry.id), `${unblockAuthor.url} missing deleted blocklist entry`);

    const unblockedAuthorAttempt = await request(`/api/sites/${createdSiteId}/pages/${createdPageId}/comments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        content: 'This author should be accepted after unblock.',
        authorName: 'Blocked Author',
        authorEmail: blockedAuthorEmail,
        moderationMode: 'auto-approve',
        requestId: 'contract-page-comment-unblocked-author-attempt',
        rateLimitBypass: true,
      }),
    });
    assert(unblockedAuthorAttempt.response.status === 201, `${unblockedAuthorAttempt.url} expected unblocked author 201, got ${unblockedAuthorAttempt.response.status}`);

    const unbindMedia = await request(`/api/admin/sites/${createdSiteId}/media/${createdMediaId}/bind`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        targetType: 'page',
        targetId: createdPageId,
        action: 'unbind',
      }),
    });
    assert(unbindMedia.response.status === 200, `${unbindMedia.url} expected 200, got ${unbindMedia.response.status}`);
    assert(!unbindMedia.json?.data?.media?.pageIds?.includes(createdPageId), `${unbindMedia.url} did not unbind media from page`);

    const unbindAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=media&entityId=${createdMediaId}&action=media.unbind&limit=5`);
    assert(unbindAudit.response.status === 200, `${unbindAudit.url} expected 200, got ${unbindAudit.response.status}`);
    assert(unbindAudit.json?.data?.logs?.some((log) => (
      log.action === 'media.unbind' &&
      log.metadata?.targetType === 'page' &&
      log.metadata?.targetId === createdPageId
    )), `${unbindAudit.url} missing media unbind audit log`);

    const remove = await request(`/api/admin/sites/${createdSiteId}/pages/${createdPageId}`, { method: 'DELETE' });
    assert(remove.response.status === 200, `${remove.url} expected 200, got ${remove.response.status}`);
    assert(remove.json?.data?.deleted === true, `${remove.url} expected deleted true`);
    createdPageId = null;
  });

  await record('admin reusable sections create/list/detail/update/delete works for temporary site', async () => {
    const unauthReusableSections = await fetch(`${baseUrl}/api/admin/sites/${createdSiteId}/reusable-sections`);
    const unauthReusableSectionsJson = await unauthReusableSections.json().catch(() => ({}));
    assert(unauthReusableSections.status === 401, `Reusable sections API should reject missing auth, got ${unauthReusableSections.status}`);
    assert(unauthReusableSectionsJson?.success === false && unauthReusableSectionsJson?.error?.code === 'UNAUTHORIZED', `Reusable sections API missing auth envelope: ${JSON.stringify(unauthReusableSectionsJson).slice(0, 500)}`);

    const create = await request(`/api/admin/sites/${createdSiteId}/reusable-sections`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Admin Contract Hero Section',
        slug: `admin-contract-hero-${unique}`,
        description: 'Temporary reusable section contract smoke',
        category: 'layout',
        tags: ['hero', 'contract'],
        sourceElementId: 'contract-source-element',
        content: {
          canvasSize: { width: 1200, height: 420 },
          elements: [
            {
              id: 'contract-section-root',
              type: 'section',
              x: 0,
              y: 0,
              width: 1200,
              height: 420,
              zIndex: 1,
              props: {
                backgroundColor: '#0f172a',
              },
              children: [
                {
                  id: 'contract-section-heading',
                  type: 'heading',
                  x: 72,
                  y: 80,
                  width: 620,
                  height: 88,
                  zIndex: 1,
                  props: {
                    content: 'Reusable section smoke',
                    level: 'h2',
                    fontSize: 42,
                    color: '#ffffff',
                  },
                },
              ],
            },
          ],
        },
        createdBy: 'contract-smoke',
      }),
    });
    assert(create.response.status === 201, `${create.url} expected 201, got ${create.response.status}`);
    assert(create.json?.success === true, `${create.url} expected success envelope`);
    assert(create.json?.data?.section?.slug === `admin-contract-hero-${unique}`, `${create.url} returned wrong section slug`);
    assert(create.json?.data?.section?.content?.elements?.[0]?.children?.[0]?.id === 'contract-section-heading', `${create.url} did not preserve nested section content`);
    assert(create.json?.data?.section?.metadata?.reusableSection?.version === 1, `${create.url} missing initial reusable section version`);
    createdReusableSectionId = create.json.data.section.id;
    const initialReusableSectionUpdatedAt = create.json.data.section.updatedAt;
    const createReusableSectionAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=reusableSection&entityId=${createdReusableSectionId}&action=reusableSection.create&requestId=${create.json.requestId}`);
    assert(createReusableSectionAudit.response.status === 200, `${createReusableSectionAudit.url} expected reusable section create audit read`);
    assert(createReusableSectionAudit.json?.data?.logs?.some((entry) => (
      entry.entity === 'reusableSection' &&
      entry.entityId === createdReusableSectionId &&
      entry.action === 'reusableSection.create' &&
      entry.requestId === create.json.requestId &&
      entry.after?.id === createdReusableSectionId
    )), `${createReusableSectionAudit.url} missing reusable section create audit log`);

    const instanceRoot = JSON.parse(JSON.stringify(create.json.data.section.content.elements[0]));
    instanceRoot.id = 'contract-section-instance-root';
    instanceRoot.x = 24;
    instanceRoot.y = 48;
    instanceRoot.props = {
      ...(instanceRoot.props || {}),
      reusableSection: {
        mode: 'synced',
        sectionId: createdReusableSectionId,
        slug: create.json.data.section.slug,
        name: create.json.data.section.name,
        sourceUpdatedAt: initialReusableSectionUpdatedAt,
      },
    };
    const instancePage = await request(`/api/admin/sites/${createdSiteId}/pages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Reusable Section Instance Page',
        slug: `reusable-section-instance-${unique}`,
        status: 'draft',
        content: {
          canvasSize: { width: 1200, height: 520 },
          elements: [instanceRoot],
        },
      }),
    });
    assert(instancePage.response.status === 201, `${instancePage.url} expected 201, got ${instancePage.response.status}`);
    createdReusableInstancePageId = instancePage.json?.data?.page?.id;
    assert(createdReusableInstancePageId, `${instancePage.url} missing reusable section instance page id`);

    const duplicate = await request(`/api/admin/sites/${createdSiteId}/reusable-sections`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Duplicate reusable section',
        slug: `admin-contract-hero-${unique}`,
        content: {
          elements: [{ id: 'duplicate-root', type: 'section', x: 0, y: 0, width: 100, height: 100, zIndex: 1, props: {} }],
        },
      }),
    });
    assert(duplicate.response.status === 409, `${duplicate.url} expected 409, got ${duplicate.response.status}`);
    assert(duplicate.json?.error?.code === 'SLUG_CONFLICT', `${duplicate.url} expected SLUG_CONFLICT`);

    const invalid = await request(`/api/admin/sites/${createdSiteId}/reusable-sections`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Invalid reusable section',
        slug: `invalid-section-${unique}`,
        content: { elements: [] },
      }),
    });
    assert(invalid.response.status === 400, `${invalid.url} expected 400, got ${invalid.response.status}`);
    assert(invalid.json?.error?.code === 'VALIDATION_ERROR', `${invalid.url} expected validation error`);

    const list = await request(`/api/admin/sites/${createdSiteId}/reusable-sections?tag=hero&category=layout&search=contract`);
    assert(list.response.status === 200, `${list.url} expected 200, got ${list.response.status}`);
    assert(list.json?.data?.sections?.some((section) => section.id === createdReusableSectionId), `${list.url} missing created reusable section`);

    const detail = await request(`/api/admin/sites/${createdSiteId}/reusable-sections/${createdReusableSectionId}`);
    assert(detail.response.status === 200, `${detail.url} expected 200, got ${detail.response.status}`);
    assert(detail.json?.data?.section?.content?.canvasSize?.width === 1200, `${detail.url} did not preserve canvas size`);

    const invalidUpdate = await request(`/api/admin/sites/${createdSiteId}/reusable-sections/${createdReusableSectionId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        content: { elements: [] },
      }),
    });
    assert(invalidUpdate.response.status === 400, `${invalidUpdate.url} expected 400, got ${invalidUpdate.response.status}`);
    assert(invalidUpdate.json?.error?.code === 'VALIDATION_ERROR', `${invalidUpdate.url} expected validation error for empty content update`);

    const update = await request(`/api/admin/sites/${createdSiteId}/reusable-sections/${createdReusableSectionId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Updated Contract Hero Section',
        tags: ['hero', 'updated'],
        status: 'archived',
        content: {
          canvasSize: { width: 1200, height: 420 },
          elements: [
            {
              id: 'contract-section-root',
              type: 'section',
              x: 0,
              y: 0,
              width: 1200,
              height: 420,
              zIndex: 1,
              props: {
                backgroundColor: '#0f172a',
              },
              children: [
                {
                  id: 'contract-section-heading',
                  type: 'heading',
                  x: 72,
                  y: 80,
                  width: 620,
                  height: 88,
                  zIndex: 1,
                  props: {
                    content: 'Updated reusable section smoke',
                    level: 'h2',
                    fontSize: 42,
                    color: '#ffffff',
                  },
                },
              ],
            },
          ],
        },
        updatedBy: 'contract-smoke',
      }),
    });
    assert(update.response.status === 200, `${update.url} expected 200, got ${update.response.status}`);
    assert(update.json?.data?.section?.name === 'Updated Contract Hero Section', `${update.url} did not update section name`);
    assert(update.json?.data?.section?.tags?.includes('updated'), `${update.url} did not update section tags`);
    assert(update.json?.data?.section?.status === 'archived', `${update.url} did not archive section`);
    assert(update.json?.data?.version === 2, `${update.url} did not return incremented reusable section version`);
    assert(update.json?.data?.section?.metadata?.reusableSection?.history?.some((entry) => entry.version === 1 && entry.name === 'Admin Contract Hero Section'), `${update.url} did not preserve previous reusable section revision`);
    const updateReusableSectionAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=reusableSection&entityId=${createdReusableSectionId}&action=reusableSection.update&requestId=${update.json.requestId}`);
    assert(updateReusableSectionAudit.response.status === 200, `${updateReusableSectionAudit.url} expected reusable section update audit read`);
    assert(updateReusableSectionAudit.json?.data?.logs?.some((entry) => (
      entry.entity === 'reusableSection' &&
      entry.entityId === createdReusableSectionId &&
      entry.action === 'reusableSection.update' &&
      entry.requestId === update.json.requestId &&
      entry.before?.id === createdReusableSectionId &&
      entry.after?.id === createdReusableSectionId &&
      entry.metadata?.changedKeys?.includes('content')
    )), `${updateReusableSectionAudit.url} missing reusable section update audit log`);

    const staleUpdate = await request(`/api/admin/sites/${createdSiteId}/reusable-sections/${createdReusableSectionId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        expectedVersion: 1,
        name: 'Stale Contract Hero Section',
      }),
    });
    assert(staleUpdate.response.status === 409, `${staleUpdate.url} expected 409 for stale reusable section version, got ${staleUpdate.response.status}`);
    assert(staleUpdate.json?.error?.code === 'REUSABLE_SECTION_VERSION_CONFLICT', `${staleUpdate.url} expected reusable section version conflict`);

    const versions = await request(`/api/admin/sites/${createdSiteId}/reusable-sections/${createdReusableSectionId}/versions`);
    assert(versions.response.status === 200, `${versions.url} expected 200, got ${versions.response.status}`);
    assert(versions.json?.data?.currentVersion === 2, `${versions.url} did not expose current reusable section version`);
    assert(versions.json?.data?.versions?.some((entry) => entry.current === true && entry.version === 2), `${versions.url} missing current reusable section version entry`);
    assert(versions.json?.data?.versions?.some((entry) => entry.version === 1 && entry.name === 'Admin Contract Hero Section'), `${versions.url} missing previous reusable section version entry`);

    const staleInstances = await request(`/api/admin/sites/${createdSiteId}/reusable-sections/${createdReusableSectionId}/instances?targetType=page&targetId=${createdReusableInstancePageId}`);
    assert(staleInstances.response.status === 200, `${staleInstances.url} expected 200, got ${staleInstances.response.status}`);
    assert(staleInstances.json?.data?.totals?.targets === 1, `${staleInstances.url} expected one target with reusable section instance`);
    assert(staleInstances.json?.data?.totals?.instances === 1, `${staleInstances.url} expected one reusable section instance`);
    assert(staleInstances.json?.data?.totals?.stale === 1, `${staleInstances.url} expected stale reusable section instance`);

    const dryRunRefreshInstances = await request(`/api/admin/sites/${createdSiteId}/reusable-sections/${createdReusableSectionId}/instances`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        targetType: 'page',
        targetId: createdReusableInstancePageId,
        dryRun: true,
      }),
    });
    assert(dryRunRefreshInstances.response.status === 200, `${dryRunRefreshInstances.url} expected 200, got ${dryRunRefreshInstances.response.status}`);
    assert(dryRunRefreshInstances.json?.data?.dryRun === true, `${dryRunRefreshInstances.url} expected dry run true`);
    assert(dryRunRefreshInstances.json?.data?.totals?.instances === 1, `${dryRunRefreshInstances.url} expected one dry-run reusable section instance refresh`);

    const refreshInstances = await request(`/api/admin/sites/${createdSiteId}/reusable-sections/${createdReusableSectionId}/instances`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        targetType: 'page',
        targetId: createdReusableInstancePageId,
        updatedBy: 'contract-smoke',
      }),
    });
    assert(refreshInstances.response.status === 200, `${refreshInstances.url} expected 200, got ${refreshInstances.response.status}`);
    assert(refreshInstances.json?.data?.totals?.targets === 1, `${refreshInstances.url} expected one reusable section refresh target`);
    assert(refreshInstances.json?.data?.totals?.instances === 1, `${refreshInstances.url} expected one reusable section instance refresh`);
    const refreshInstancesAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=reusableSection&entityId=${createdReusableSectionId}&action=reusableSection.instances.refresh&requestId=${refreshInstances.json.requestId}`);
    assert(refreshInstancesAudit.response.status === 200, `${refreshInstancesAudit.url} expected reusable section instance refresh audit read`);
    assert(refreshInstancesAudit.json?.data?.logs?.some((entry) => (
      entry.entity === 'reusableSection' &&
      entry.entityId === createdReusableSectionId &&
      entry.action === 'reusableSection.instances.refresh' &&
      entry.requestId === refreshInstances.json.requestId &&
      entry.metadata?.instances === 1
    )), `${refreshInstancesAudit.url} missing reusable section instance refresh audit log`);
    const refreshedInstancePage = await request(`/api/admin/sites/${createdSiteId}/pages/${createdReusableInstancePageId}`);
    assert(refreshedInstancePage.response.status === 200, `${refreshedInstancePage.url} expected 200, got ${refreshedInstancePage.response.status}`);
    assert(refreshedInstancePage.json?.data?.page?.content?.elements?.[0]?.id === 'contract-section-instance-root', `${refreshedInstancePage.url} did not preserve reusable instance root id`);
    assert(refreshedInstancePage.json?.data?.page?.content?.elements?.[0]?.props?.reusableSection?.sourceUpdatedAt === update.json?.data?.section?.updatedAt, `${refreshedInstancePage.url} did not refresh reusable instance source timestamp`);
    assert(refreshedInstancePage.json?.data?.page?.content?.elements?.[0]?.children?.[0]?.props?.content === 'Updated reusable section smoke', `${refreshedInstancePage.url} did not refresh reusable instance content`);
    const freshInstances = await request(`/api/admin/sites/${createdSiteId}/reusable-sections/${createdReusableSectionId}/instances?targetType=page&targetId=${createdReusableInstancePageId}`);
    assert(freshInstances.response.status === 200, `${freshInstances.url} expected 200, got ${freshInstances.response.status}`);
    assert(freshInstances.json?.data?.totals?.stale === 0, `${freshInstances.url} expected refreshed reusable section instance to be current`);

    const restore = await request(`/api/admin/sites/${createdSiteId}/reusable-sections/${createdReusableSectionId}/versions/1/restore`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        expectedVersion: 2,
        restoredBy: 'contract-smoke',
      }),
    });
    assert(restore.response.status === 200, `${restore.url} expected 200, got ${restore.response.status}`);
    assert(restore.json?.data?.restored === true, `${restore.url} expected restored true`);
    assert(restore.json?.data?.restoredFromVersion === 1, `${restore.url} missing restored version`);
    assert(restore.json?.data?.version === 3, `${restore.url} did not increment reusable section version on restore`);
    assert(restore.json?.data?.section?.name === 'Admin Contract Hero Section', `${restore.url} did not restore section name`);
    assert(restore.json?.data?.section?.status === 'active', `${restore.url} did not restore section status`);
    assert(restore.json?.data?.section?.metadata?.reusableSection?.restoredFromVersion === 1, `${restore.url} missing restore provenance`);
    assert(restore.json?.data?.section?.metadata?.reusableSection?.history?.some((entry) => entry.version === 2 && entry.name === 'Updated Contract Hero Section'), `${restore.url} did not preserve pre-restore section revision`);
    const restoreReusableSectionAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=reusableSection&entityId=${createdReusableSectionId}&action=reusableSection.restore&requestId=${restore.json.requestId}`);
    assert(restoreReusableSectionAudit.response.status === 200, `${restoreReusableSectionAudit.url} expected reusable section restore audit read`);
    assert(restoreReusableSectionAudit.json?.data?.logs?.some((entry) => (
      entry.entity === 'reusableSection' &&
      entry.entityId === createdReusableSectionId &&
      entry.action === 'reusableSection.restore' &&
      entry.requestId === restore.json.requestId &&
      entry.metadata?.restoredFromVersion === 1 &&
      entry.after?.id === createdReusableSectionId
    )), `${restoreReusableSectionAudit.url} missing reusable section restore audit log`);

    const rearchive = await request(`/api/admin/sites/${createdSiteId}/reusable-sections/${createdReusableSectionId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        expectedVersion: 3,
        name: 'Updated Contract Hero Section',
        tags: ['hero', 'updated'],
        status: 'archived',
        updatedBy: 'contract-smoke',
      }),
    });
    assert(rearchive.response.status === 200, `${rearchive.url} expected 200, got ${rearchive.response.status}`);
    assert(rearchive.json?.data?.version === 4, `${rearchive.url} did not increment reusable section version after rearchive`);
    assert(rearchive.json?.data?.section?.status === 'archived', `${rearchive.url} did not rearchive section`);

    const exportSections = await request(`/api/admin/sites/${createdSiteId}/reusable-sections/export?ids=${createdReusableSectionId}`);
    assert(exportSections.response.status === 200, `${exportSections.url} expected 200, got ${exportSections.response.status}`);
    assert(exportSections.response.headers.get('content-disposition')?.includes('reusable-sections.json'), `${exportSections.url} missing export filename`);
    assert(exportSections.json?.data?.export?.schemaVersion === 'backy.reusable-sections.export.v1', `${exportSections.url} missing reusable section export schema`);
    assert(exportSections.json?.data?.sections?.[0]?.slug === `admin-contract-hero-${unique}`, `${exportSections.url} missing exported reusable section`);

    const importConflict = await request(`/api/admin/sites/${createdSiteId}/reusable-sections/import`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sections: exportSections.json?.data?.sections,
        importedBy: 'contract-smoke',
      }),
    });
    assert(importConflict.response.status === 409, `${importConflict.url} expected 409 for duplicate reusable section import, got ${importConflict.response.status}`);
    assert(importConflict.json?.error?.code === 'SLUG_CONFLICT', `${importConflict.url} expected reusable section import slug conflict`);

    const importUpsert = await request(`/api/admin/sites/${createdSiteId}/reusable-sections/import?upsert=true`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sections: exportSections.json?.data?.sections,
        importedBy: 'contract-smoke',
      }),
    });
    assert(importUpsert.response.status === 200, `${importUpsert.url} expected 200, got ${importUpsert.response.status}`);
    assert(importUpsert.json?.data?.import?.updated === 1, `${importUpsert.url} expected one upserted reusable section`);
    assert(importUpsert.json?.data?.sections?.[0]?.metadata?.reusableSection?.version === 5, `${importUpsert.url} did not increment reusable section version on upsert import`);
    const importReusableSectionAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=reusableSection&entityId=${createdReusableSectionId}&action=reusableSection.import&requestId=${importUpsert.json.requestId}`);
    assert(importReusableSectionAudit.response.status === 200, `${importReusableSectionAudit.url} expected reusable section import audit read`);
    assert(importReusableSectionAudit.json?.data?.logs?.some((entry) => (
      entry.entity === 'reusableSection' &&
      entry.entityId === createdReusableSectionId &&
      entry.action === 'reusableSection.import' &&
      entry.requestId === importUpsert.json.requestId &&
      entry.metadata?.updated === 1 &&
      entry.metadata?.upsert === true
    )), `${importReusableSectionAudit.url} missing reusable section import audit log`);

    const metadataUpdate = await request(`/api/admin/sites/${createdSiteId}/reusable-sections/${createdReusableSectionId}/metadata`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        expectedVersion: 5,
        displayName: 'Contract Library Hero',
        summary: 'Reusable section metadata smoke',
        usageNotes: 'Use on marketing landing pages.',
        thumbnailMediaId: createdMediaId,
        previewPath: '/contract-preview',
        labels: ['hero', 'Marketing', 'hero'],
        frontendDesignTemplateId: 'contract-front-end-template',
        designSystem: { tokenSet: 'contract', componentRole: 'hero' },
        owner: { team: 'content' },
        updatedBy: 'contract-smoke',
      }),
    });
    assert(metadataUpdate.response.status === 200, `${metadataUpdate.url} expected 200, got ${metadataUpdate.response.status}`);
    assert(metadataUpdate.json?.data?.version === 6, `${metadataUpdate.url} did not increment reusable section version for metadata`);
    assert(metadataUpdate.json?.data?.library?.displayName === 'Contract Library Hero', `${metadataUpdate.url} missing library display name`);
    assert(metadataUpdate.json?.data?.library?.thumbnailMediaId === createdMediaId, `${metadataUpdate.url} missing thumbnail media id`);
    assert(metadataUpdate.json?.data?.library?.labels?.length === 2, `${metadataUpdate.url} did not normalize duplicate labels`);
    assert(metadataUpdate.json?.data?.section?.metadata?.reusableSection?.library?.designSystem?.tokenSet === 'contract', `${metadataUpdate.url} missing design-system metadata`);
    const metadataRead = await request(`/api/admin/sites/${createdSiteId}/reusable-sections/${createdReusableSectionId}/metadata`);
    assert(metadataRead.response.status === 200, `${metadataRead.url} expected 200, got ${metadataRead.response.status}`);
    assert(metadataRead.json?.data?.library?.displayName === 'Contract Library Hero', `${metadataRead.url} did not read structured metadata`);
    assert(metadataRead.json?.data?.version === 6, `${metadataRead.url} did not expose metadata version`);
    const metadataUpdateAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=reusableSection&entityId=${createdReusableSectionId}&action=reusableSection.metadata.update&requestId=${metadataUpdate.json.requestId}`);
    assert(metadataUpdateAudit.response.status === 200, `${metadataUpdateAudit.url} expected reusable section metadata audit read`);
    assert(metadataUpdateAudit.json?.data?.logs?.some((entry) => (
      entry.entity === 'reusableSection' &&
      entry.entityId === createdReusableSectionId &&
      entry.action === 'reusableSection.metadata.update' &&
      entry.requestId === metadataUpdate.json.requestId &&
      entry.metadata?.changedKeys?.includes('displayName') &&
      entry.metadata?.version === 6
    )), `${metadataUpdateAudit.url} missing reusable section metadata audit log`);

    const activeList = await request(`/api/admin/sites/${createdSiteId}/reusable-sections`);
    assert(!activeList.json?.data?.sections?.some((section) => section.id === createdReusableSectionId), `${activeList.url} included archived section in active default list`);

    const allList = await request(`/api/admin/sites/${createdSiteId}/reusable-sections?status=all`);
    assert(allList.json?.data?.sections?.some((section) => section.id === createdReusableSectionId), `${allList.url} missing archived section when status=all`);

    const removeInstancePage = await request(`/api/admin/sites/${createdSiteId}/pages/${createdReusableInstancePageId}`, { method: 'DELETE' });
    assert(removeInstancePage.response.status === 200, `${removeInstancePage.url} expected 200, got ${removeInstancePage.response.status}`);
    assert(removeInstancePage.json?.data?.deleted === true, `${removeInstancePage.url} expected deleted true`);
    createdReusableInstancePageId = null;

    const remove = await request(`/api/admin/sites/${createdSiteId}/reusable-sections/${createdReusableSectionId}`, { method: 'DELETE' });
    assert(remove.response.status === 200, `${remove.url} expected 200, got ${remove.response.status}`);
    assert(remove.json?.data?.deleted === true, `${remove.url} expected deleted true`);
    const deleteReusableSectionAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=reusableSection&entityId=${createdReusableSectionId}&action=reusableSection.delete&requestId=${remove.json.requestId}`);
    assert(deleteReusableSectionAudit.response.status === 200, `${deleteReusableSectionAudit.url} expected reusable section delete audit read`);
    assert(deleteReusableSectionAudit.json?.data?.logs?.some((entry) => (
      entry.entity === 'reusableSection' &&
      entry.entityId === createdReusableSectionId &&
      entry.action === 'reusableSection.delete' &&
      entry.requestId === remove.json.requestId &&
      entry.before?.id === createdReusableSectionId
    )), `${deleteReusableSectionAudit.url} missing reusable section delete audit log`);
    createdReusableSectionId = null;
  });

  await record('admin blog categories create/list/detail/update works for temporary site', async () => {
    const unauthBlog = await fetch(`${baseUrl}/api/admin/sites/${createdSiteId}/blog`);
    const unauthBlogJson = await unauthBlog.json().catch(() => ({}));
    assert(unauthBlog.status === 401, `Blog admin API should reject missing auth, got ${unauthBlog.status}`);
    assert(unauthBlogJson?.success === false && unauthBlogJson?.error?.code === 'UNAUTHORIZED', `Blog admin API missing auth envelope: ${JSON.stringify(unauthBlogJson).slice(0, 500)}`);

    const create = await request(`/api/admin/sites/${createdSiteId}/blog/categories`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Admin Contract Category',
        slug: categorySlug,
        description: 'Temporary contract smoke category',
        color: '#0ea5e9',
      }),
    });
    assert(create.response.status === 201, `${create.url} expected 201, got ${create.response.status}`);
    assert(create.json?.data?.category?.slug === categorySlug, `${create.url} returned wrong category slug`);
    createdCategoryId = create.json.data.category.id;

    const duplicate = await request(`/api/admin/sites/${createdSiteId}/blog/categories`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Duplicate Category', slug: categorySlug }),
    });
    assert(duplicate.response.status === 409, `${duplicate.url} expected 409, got ${duplicate.response.status}`);
    assert(duplicate.json?.error?.code === 'SLUG_CONFLICT', `${duplicate.url} expected SLUG_CONFLICT`);

    const list = await request(`/api/admin/sites/${createdSiteId}/blog/categories`);
    assert(list.response.status === 200, `${list.url} expected 200, got ${list.response.status}`);
    assert(list.json?.data?.categories?.some((category) => category.id === createdCategoryId), `${list.url} missing created category`);

    const detail = await request(`/api/admin/sites/${createdSiteId}/blog/categories/${createdCategoryId}`);
    assert(detail.response.status === 200, `${detail.url} expected 200, got ${detail.response.status}`);
    assert(detail.json?.data?.category?.id === createdCategoryId, `${detail.url} returned wrong category`);

    const update = await request(`/api/admin/sites/${createdSiteId}/blog/categories/${createdCategoryId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Updated Admin Contract Category', color: '#16a34a' }),
    });
    assert(update.response.status === 200, `${update.url} expected 200, got ${update.response.status}`);
    assert(update.json?.data?.category?.name === 'Updated Admin Contract Category', `${update.url} expected updated category name`);
    assert(update.json?.data?.category?.color === '#16a34a', `${update.url} expected updated category color`);
  });

  await record('admin blog tags create/list/detail/update works for temporary site', async () => {
    const create = await request(`/api/admin/sites/${createdSiteId}/blog/tags`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Admin Contract Tag',
        slug: tagSlug,
        description: 'Temporary contract smoke tag',
      }),
    });
    assert(create.response.status === 201, `${create.url} expected 201, got ${create.response.status}`);
    assert(create.json?.data?.tag?.slug === tagSlug, `${create.url} returned wrong tag slug`);
    createdTagId = create.json.data.tag.id;

    const duplicate = await request(`/api/admin/sites/${createdSiteId}/blog/tags`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Duplicate Tag', slug: tagSlug }),
    });
    assert(duplicate.response.status === 409, `${duplicate.url} expected 409, got ${duplicate.response.status}`);
    assert(duplicate.json?.error?.code === 'SLUG_CONFLICT', `${duplicate.url} expected SLUG_CONFLICT`);

    const list = await request(`/api/admin/sites/${createdSiteId}/blog/tags`);
    assert(list.response.status === 200, `${list.url} expected 200, got ${list.response.status}`);
    assert(list.json?.data?.tags?.some((tag) => tag.id === createdTagId), `${list.url} missing created tag`);

    const detail = await request(`/api/admin/sites/${createdSiteId}/blog/tags/${createdTagId}`);
    assert(detail.response.status === 200, `${detail.url} expected 200, got ${detail.response.status}`);
    assert(detail.json?.data?.tag?.id === createdTagId, `${detail.url} returned wrong tag`);

    const update = await request(`/api/admin/sites/${createdSiteId}/blog/tags/${createdTagId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Updated Admin Contract Tag' }),
    });
    assert(update.response.status === 200, `${update.url} expected 200, got ${update.response.status}`);
    assert(update.json?.data?.tag?.name === 'Updated Admin Contract Tag', `${update.url} expected updated tag name`);
  });

  await record('admin blog authors list returns usable author resources', async () => {
    const authors = await request(`/api/admin/sites/${createdSiteId}/blog/authors`);
    assert(authors.response.status === 200, `${authors.url} expected 200, got ${authors.response.status}`);
    assert(Array.isArray(authors.json?.data?.authors), `${authors.url} expected authors array`);
    assert(authors.json.data.authors.some((author) => author.id === 'user-admin'), `${authors.url} missing admin author`);

    const publicAuthors = await request(`/api/sites/${createdSiteId}/blog/authors`);
    assert(publicAuthors.response.status === 200, `${publicAuthors.url} expected 200, got ${publicAuthors.response.status}`);
    assert(publicAuthors.response.headers.get('x-backy-cache-scope') === 'discovery', `${publicAuthors.url} missing public authors cache scope`);
    assert(publicAuthors.response.headers.get('etag')?.startsWith('"backy-'), `${publicAuthors.url} missing public authors etag`);
    assert(publicAuthors.json?.success === true, `${publicAuthors.url} expected success envelope`);
    assert(publicAuthors.json?.data?.authors?.some((author) => author.id === 'user-admin'), `${publicAuthors.url} missing public admin author in data envelope`);
    assert(publicAuthors.json?.authors?.some((author) => author.id === 'user-admin'), `${publicAuthors.url} missing public admin author`);
  });

  await record('admin blog create/list/detail/update/delete works for temporary site', async () => {
    const create = await request(`/api/admin/sites/${createdSiteId}/blog`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Admin Contract Post',
        slug: postSlug,
        excerpt: 'Temporary contract smoke post',
        status: 'draft',
        authorId: 'user-admin',
        categoryIds: [createdCategoryId],
        tagIds: [createdTagId],
        meta: {
          frontendDesignTemplateId: 'contract-blog-template',
          frontendDesignTemplateName: 'Contract Blog Template',
          frontendDesignRoutePattern: '/journal/{slug}',
          frontendDesignSource: {
            type: 'custom-frontend',
            label: 'Contract blog frontend',
            repository: 'example/backy-blog-contract',
          },
          frontendDesignChrome: {
            header: { component: 'ContractBlogHeader', source: 'site.navigation.primary' },
            footer: { component: 'ContractBlogFooter', source: 'site.navigation.footer' },
          },
          frontendDesignTokens: {
            colors: { primary: '#7c3aed', text: '#111827' },
            fonts: { heading: 'Newsreader', body: 'Inter' },
          },
          frontendDesignCustomCss: ':root { --contract-blog-primary: #7c3aed; }',
          frontendDesignBindingHints: [
            { role: 'post.title', binding: 'post.title' },
            { role: 'post.body', binding: 'post.content' },
          ],
        },
        content: {
          elements: [
            {
              id: 'contract-blog-heading',
              type: 'heading',
              x: 56,
              y: 72,
              width: 620,
              height: 80,
              zIndex: 1,
              props: {
                content: 'Contract blog readiness',
                level: 'h1',
                fontSize: 40,
                fontWeight: '700',
              },
            },
          ],
          canvasSize: { width: 900, height: 720 },
        },
      }),
    });
    assert(create.response.status === 201, `${create.url} expected 201, got ${create.response.status}`);
    assert(create.json?.data?.post?.slug === postSlug, `${create.url} returned wrong post slug`);
    createdPostId = create.json.data.post.id;
    const postCreateAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=post&entityId=${createdPostId}&action=create&requestId=${create.json.requestId}`);
    assert(postCreateAudit.response.status === 200, `${postCreateAudit.url} expected post create audit readback`);
    assert(postCreateAudit.json?.data?.logs?.[0]?.metadata?.slug === postSlug, `${postCreateAudit.url} missing post create audit metadata`);
    assert(postCreateAudit.json?.data?.logs?.[0]?.after?.status === 'draft', `${postCreateAudit.url} missing post create audit after snapshot`);

    const postEditorSessionToken = await loginAdminCredentials('jane@backy.io', process.env.BACKY_EDITOR_DEMO_PASSWORD || 'editor123');
    const denyEditorPostPublish = await request('/api/admin/users/user-editor/permissions', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        overrides: {
          'pages.publish': 'deny',
        },
      }),
    });
    assert(denyEditorPostPublish.response.status === 200, `${denyEditorPostPublish.url} expected editor publish-deny override`);
    try {
      const blockedEditorPostPublish = await requestWithSession(`/api/admin/sites/${createdSiteId}/blog/${createdPostId}`, postEditorSessionToken, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ status: 'published' }),
      });
      assert(blockedEditorPostPublish.response.status === 403, `${blockedEditorPostPublish.url} expected editor post publish denial, got ${blockedEditorPostPublish.response.status}`);
      assert(blockedEditorPostPublish.json?.error?.code === 'FORBIDDEN_PERMISSION', `${blockedEditorPostPublish.url} expected FORBIDDEN_PERMISSION for denied post publish`);
    } finally {
      const restoreEditorPostPublish = await request('/api/admin/users/user-editor/permissions', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          overrides: {
            'pages.publish': null,
          },
        }),
      });
      assert(restoreEditorPostPublish.response.status === 200, `${restoreEditorPostPublish.url} expected editor publish override restore`);
    }

    const missingPostSchedule = await request(`/api/admin/sites/${createdSiteId}/blog/${createdPostId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status: 'scheduled' }),
    });
    assert(missingPostSchedule.response.status === 400, `${missingPostSchedule.url} expected missing post schedule 400, got ${missingPostSchedule.response.status}`);
    assert(missingPostSchedule.json?.error?.code === 'SCHEDULED_AT_REQUIRED', `${missingPostSchedule.url} expected post scheduledAt required error`);

    const list = await request(`/api/admin/sites/${createdSiteId}/blog?status=draft`);
    assert(list.response.status === 200, `${list.url} expected 200, got ${list.response.status}`);
    assert(list.json?.data?.posts?.some((post) => post.id === createdPostId), `${list.url} missing created post`);

    const categoryFilter = await request(`/api/admin/sites/${createdSiteId}/blog?categoryId=${createdCategoryId}`);
    assert(categoryFilter.response.status === 200, `${categoryFilter.url} expected 200, got ${categoryFilter.response.status}`);
    assert(categoryFilter.json?.data?.posts?.some((post) => post.id === createdPostId), `${categoryFilter.url} missing category-filtered post`);

    const tagFilter = await request(`/api/admin/sites/${createdSiteId}/blog?tagId=${createdTagId}`);
    assert(tagFilter.response.status === 200, `${tagFilter.url} expected 200, got ${tagFilter.response.status}`);
    assert(tagFilter.json?.data?.posts?.some((post) => post.id === createdPostId), `${tagFilter.url} missing tag-filtered post`);

    const authorFilter = await request(`/api/admin/sites/${createdSiteId}/blog?authorId=user-admin`);
    assert(authorFilter.response.status === 200, `${authorFilter.url} expected 200, got ${authorFilter.response.status}`);
    assert(authorFilter.json?.data?.posts?.some((post) => post.id === createdPostId), `${authorFilter.url} missing author-filtered post`);

    const detail = await request(`/api/admin/sites/${createdSiteId}/blog/${createdPostId}`);
    assert(detail.response.status === 200, `${detail.url} expected 200, got ${detail.response.status}`);
    assert(detail.json?.data?.post?.id === createdPostId, `${detail.url} returned wrong post`);
    assert(detail.json?.data?.post?.authorId === 'user-admin', `${detail.url} missing author assignment`);
    assert(detail.json?.data?.post?.categoryIds?.includes(createdCategoryId), `${detail.url} missing category assignment`);
    assert(detail.json?.data?.post?.tagIds?.includes(createdTagId), `${detail.url} missing tag assignment`);

    const bindPostMedia = await request(`/api/admin/sites/${createdSiteId}/media/${createdMediaId}/bind`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        targetType: 'post',
        targetId: createdPostId,
        usageType: 'featured',
        attachedBy: 'contract-smoke',
      }),
    });
    assert(bindPostMedia.response.status === 200, `${bindPostMedia.url} expected 200, got ${bindPostMedia.response.status}`);
    assert(bindPostMedia.json?.data?.media?.postIds?.includes(createdPostId), `${bindPostMedia.url} did not bind media to post`);
    const blogMediaAliasList = await request(`/api/admin/sites/${createdSiteId}/media?blogId=${createdPostId}&type=font`);
    assert(blogMediaAliasList.response.status === 200, `${blogMediaAliasList.url} expected 200, got ${blogMediaAliasList.response.status}`);
    assert(blogMediaAliasList.json?.data?.media?.some((item) => item.id === createdMediaId && item.postIds?.includes(createdPostId)), `${blogMediaAliasList.url} missing blogId media alias item`);
    const publicBlogMediaAliasList = await request(`/api/sites/${createdSiteId}/media?blogId=${createdPostId}&type=font`);
    assert(publicBlogMediaAliasList.response.status === 200, `${publicBlogMediaAliasList.url} expected 200, got ${publicBlogMediaAliasList.response.status}`);
    assert(publicBlogMediaAliasList.json?.data?.media?.some((item) => item.id === createdMediaId && item.postIds?.includes(createdPostId)), `${publicBlogMediaAliasList.url} missing public blogId media alias item`);
    const publicBlogMedia = publicBlogMediaAliasList.json?.data?.media?.find((item) => item.id === createdMediaId);
    assert(publicBlogMedia?.references?.postIds?.includes(createdPostId), `${publicBlogMediaAliasList.url} missing post reference ids`);
    assert(publicBlogMedia?.references?.posts?.some((post) => (
      post.id === createdPostId &&
      post.usageTypes?.includes('featured') &&
      post.bindings?.some((binding) => binding.targetId === createdPostId && binding.usageType === 'featured')
    )), `${publicBlogMediaAliasList.url} missing normalized post binding reference`);
    assert(publicBlogMedia?.referenceSummary?.postCount >= 1, `${publicBlogMediaAliasList.url} missing post reference summary`);

    const readiness = await request(`/api/admin/sites/${createdSiteId}/blog/${createdPostId}/readiness`);
    assert(readiness.response.status === 200, `${readiness.url} expected 200, got ${readiness.response.status}`);
    assert(readiness.json?.success === true, `${readiness.url} expected success envelope`);
    assert(readiness.json?.data?.readiness?.id === createdPostId, `${readiness.url} returned wrong post readiness`);
    assert(
      readiness.json?.data?.readiness?.checks?.some((check) => check.id === `post:${createdPostId}:title`),
      `${readiness.url} missing post title readiness check`,
    );

    const previewRequestId = `contract-blog-preview-${unique}`;
    const preview = await request(`/api/admin/sites/${createdSiteId}/blog/${createdPostId}/preview`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': previewRequestId,
      },
      body: JSON.stringify({ ttlSeconds: 900 }),
    });
    assert(preview.response.status === 200, `${preview.url} expected preview token response`);
    assert(preview.json?.data?.previewToken, `${preview.url} missing preview token`);
    assert(preview.json?.data?.postApiUrl?.includes('previewToken='), `${preview.url} missing preview post API URL`);
    const previewAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=post&entityId=${createdPostId}&action=previewToken.create&requestId=${previewRequestId}`);
    assert(previewAudit.response.status === 200, `${previewAudit.url} expected preview audit readback`);
    const previewAuditEntry = previewAudit.json?.data?.logs?.[0];
    assert(previewAuditEntry?.action === 'previewToken.create', `${previewAudit.url} missing preview token audit action`);
    assert(previewAuditEntry?.metadata?.targetType === 'post', `${previewAudit.url} missing preview target type`);
    assert(previewAuditEntry?.metadata?.ttlSeconds === 900, `${previewAudit.url} missing preview TTL metadata`);
    assert(previewAuditEntry?.metadata?.slug === postSlug, `${previewAudit.url} missing preview slug metadata`);
    assert(typeof previewAuditEntry?.metadata?.createdBy === 'string' && previewAuditEntry.metadata.createdBy.length > 0, `${previewAudit.url} missing preview actor binding`);
    assert(previewAuditEntry?.metadata?.tokenStored === false, `${previewAudit.url} should record that preview token is redacted`);
    assert(!JSON.stringify(previewAuditEntry?.metadata || {}).includes(preview.json.data.previewToken), `${previewAudit.url} leaked preview token into audit metadata`);

    const previewUseRequestId = `contract-blog-preview-use-${unique}`;
    const previewUse = await request(preview.json.data.postApiUrl, {
      headers: {
        'x-request-id': previewUseRequestId,
      },
    });
    assert(previewUse.response.status === 200, `${previewUse.url} expected tokenized post API response`);
    const previewUseAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=post&entityId=${createdPostId}&action=previewToken.use&requestId=${previewUseRequestId}`);
    assert(previewUseAudit.response.status === 200, `${previewUseAudit.url} expected preview use audit readback`);
    const previewUseAuditEntry = previewUseAudit.json?.data?.logs?.[0];
    assert(previewUseAuditEntry?.action === 'previewToken.use', `${previewUseAudit.url} missing preview use audit action`);
    assert(previewUseAuditEntry?.actorId === 'public-preview', `${previewUseAudit.url} missing public preview actor`);
    assert(previewUseAuditEntry?.metadata?.surface === 'blog-api', `${previewUseAudit.url} missing blog-api preview surface`);
    assert(previewUseAuditEntry?.metadata?.tokenStored === false, `${previewUseAudit.url} should record that preview token use is redacted`);
    assert(!JSON.stringify(previewUseAuditEntry?.metadata || {}).includes(preview.json.data.previewToken), `${previewUseAudit.url} leaked preview token into use audit metadata`);

    const previewRenderRequestId = `contract-blog-preview-render-use-${unique}`;
    const previewRenderPath = encodeURIComponent(`/blog/${postSlug}`);
    const previewRender = await request(`/api/sites/${createdSiteId}/render?path=${previewRenderPath}&previewToken=${encodeURIComponent(preview.json.data.previewToken)}`, {
      headers: {
        'x-request-id': previewRenderRequestId,
      },
    });
    assert(previewRender.response.status === 200, `${previewRender.url} expected tokenized post render response`);
    const previewRenderAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=post&entityId=${createdPostId}&action=previewToken.use&requestId=${previewRenderRequestId}`);
    assert(previewRenderAudit.response.status === 200, `${previewRenderAudit.url} expected preview render audit readback`);
    const previewRenderAuditEntry = previewRenderAudit.json?.data?.logs?.[0];
    assert(previewRenderAuditEntry?.metadata?.surface === 'render-api', `${previewRenderAudit.url} missing render-api preview surface`);
    assert(previewRenderAuditEntry?.metadata?.tokenStored === false, `${previewRenderAudit.url} should record token redaction for render preview use`);
    assert(!JSON.stringify(previewRenderAuditEntry?.metadata || {}).includes(preview.json.data.previewToken), `${previewRenderAudit.url} leaked preview token into render use audit metadata`);

    const previewResolveRequestId = `contract-blog-preview-resolve-use-${unique}`;
    const previewResolve = await request(`/api/sites/${createdSiteId}/resolve?path=${previewRenderPath}&previewToken=${encodeURIComponent(preview.json.data.previewToken)}`, {
      headers: {
        'x-request-id': previewResolveRequestId,
      },
    });
    assert(previewResolve.response.status === 200, `${previewResolve.url} expected tokenized post resolve response`);
    const previewResolveAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=post&entityId=${createdPostId}&action=previewToken.use&requestId=${previewResolveRequestId}`);
    assert(previewResolveAudit.response.status === 200, `${previewResolveAudit.url} expected preview resolve audit readback`);
    const previewResolveAuditEntry = previewResolveAudit.json?.data?.logs?.[0];
    assert(previewResolveAuditEntry?.metadata?.surface === 'resolve-api', `${previewResolveAudit.url} missing resolve-api preview surface`);
    assert(previewResolveAuditEntry?.metadata?.tokenStored === false, `${previewResolveAudit.url} should record token redaction for resolve preview use`);
    assert(!JSON.stringify(previewResolveAuditEntry?.metadata || {}).includes(preview.json.data.previewToken), `${previewResolveAudit.url} leaked preview token into resolve use audit metadata`);

    const invalidPost = await request(`/api/admin/sites/${createdSiteId}/blog`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Blocked Admin Contract Post',
        slug: `${postSlug}-blocked`,
        excerpt: 'Temporary invalid post',
        status: 'draft',
        content: {
          canvasSize: { width: 200, height: 200 },
          elements: [
            {
              id: `el-invalid-post-${unique}`,
              type: 'text',
              x: -12,
              y: 20,
              width: 180,
              height: 60,
              rotation: 0,
              opacity: 1,
              locked: false,
              visible: true,
              props: {
                content: 'Invalid post element',
              },
            },
          ],
        },
      }),
    });
    assert(invalidPost.response.status === 201, `${invalidPost.url} expected 201, got ${invalidPost.response.status}`);
    const invalidPostId = invalidPost.json?.data?.post?.id;
    assert(invalidPostId, `${invalidPost.url} missing invalid post id`);

    const blockedPublish = await request(`/api/admin/sites/${createdSiteId}/blog/${invalidPostId}/publish`, {
      method: 'POST',
    });
    assert(blockedPublish.response.status === 400, `${blockedPublish.url} expected 400, got ${blockedPublish.response.status}`);
    assert(blockedPublish.json?.error?.code === 'READINESS_BLOCKED', `${blockedPublish.url} expected READINESS_BLOCKED`);
    assert(
      blockedPublish.json?.error?.details?.checks?.some((check) => check.severity === 'error'),
      `${blockedPublish.url} missing blocking readiness checks`,
    );
    await request(`/api/admin/sites/${createdSiteId}/blog/${invalidPostId}`, { method: 'DELETE' });

    const futurePostSchedule = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const futureScheduledPost = await request(`/api/admin/sites/${createdSiteId}/blog/${createdPostId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status: 'scheduled', scheduledAt: futurePostSchedule }),
    });
    assert(futureScheduledPost.response.status === 200, `${futureScheduledPost.url} expected 200, got ${futureScheduledPost.response.status}`);
    assert(futureScheduledPost.json?.data?.post?.status === 'scheduled', `${futureScheduledPost.url} expected scheduled status`);
    assert(futureScheduledPost.json?.data?.post?.scheduledAt === futurePostSchedule, `${futureScheduledPost.url} expected future schedule`);

    const hiddenScheduledPost = await request(`/api/sites/${createdSiteId}/blog?slug=${postSlug}`);
    assert(hiddenScheduledPost.response.status === 404, `${hiddenScheduledPost.url} expected future scheduled post to be hidden`);

    const hiddenScheduledPostResolve = await request(`/api/sites/${createdSiteId}/resolve?path=/blog/${postSlug}`);
    assert(hiddenScheduledPostResolve.response.status === 404, `${hiddenScheduledPostResolve.url} expected future scheduled post route to be hidden`);

    const hiddenScheduledPostRender = await request(`/api/sites/${createdSiteId}/render?path=/blog/${postSlug}`);
    assert(hiddenScheduledPostRender.response.status === 404, `${hiddenScheduledPostRender.url} expected future scheduled post render to be hidden`);

    const hiddenScheduledPostRss = await request(`/api/sites/${createdSiteId}/blog/rss`);
    assert(hiddenScheduledPostRss.response.status === 200, `${hiddenScheduledPostRss.url} expected RSS feed to remain available`);
    assert(hiddenScheduledPostRss.response.headers.get('content-type')?.includes('application/rss+xml'), `${hiddenScheduledPostRss.url} expected RSS content type`);
    assert(!hiddenScheduledPostRss.text.includes(postSlug), `${hiddenScheduledPostRss.url} exposed future scheduled post in RSS feed`);

    const pastPostSchedule = new Date(Date.now() - 60 * 1000).toISOString();
    const pastScheduledPost = await request(`/api/admin/sites/${createdSiteId}/blog/${createdPostId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status: 'scheduled', scheduledAt: pastPostSchedule }),
    });
    assert(pastScheduledPost.response.status === 400, `${pastScheduledPost.url} expected past post schedule 400, got ${pastScheduledPost.response.status}`);
    assert(pastScheduledPost.json?.error?.code === 'SCHEDULED_AT_NOT_FUTURE', `${pastScheduledPost.url} expected past post schedule error`);

    const publishedPost = await request(`/api/admin/sites/${createdSiteId}/blog/${createdPostId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status: 'published', scheduledAt: null }),
    });
    assert(publishedPost.response.status === 200, `${publishedPost.url} expected publish 200, got ${publishedPost.response.status}`);

    const visibleScheduledPost = await request(`/api/sites/${createdSiteId}/blog?slug=${postSlug}`);
    assert(visibleScheduledPost.response.status === 200, `${visibleScheduledPost.url} expected published post to be visible`);
    assert(visibleScheduledPost.response.headers.get('x-backy-cache-scope') === 'discovery', `${visibleScheduledPost.url} missing discovery cache scope`);
    assert(visibleScheduledPost.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${visibleScheduledPost.url} missing contract version header`);
    assert(visibleScheduledPost.response.headers.get('x-backy-site-id') === createdSiteId, `${visibleScheduledPost.url} missing site id header`);
    assert(visibleScheduledPost.response.headers.get('x-backy-cache-revision'), `${visibleScheduledPost.url} missing post cache revision`);
    const visibleScheduledPostEtag = visibleScheduledPost.response.headers.get('etag');
    assert(visibleScheduledPostEtag?.startsWith('"backy-'), `${visibleScheduledPost.url} missing post etag`);
    const revalidatedVisibleScheduledPost = await request(`/api/sites/${createdSiteId}/blog?slug=${postSlug}`, {
      headers: { 'if-none-match': visibleScheduledPostEtag },
    });
    assert(revalidatedVisibleScheduledPost.response.status === 304, `${revalidatedVisibleScheduledPost.url} expected post 304, got ${revalidatedVisibleScheduledPost.response.status}`);
    assert(revalidatedVisibleScheduledPost.response.headers.get('etag') === visibleScheduledPostEtag, `${revalidatedVisibleScheduledPost.url} expected matching post etag`);
    assert(visibleScheduledPost.json?.success === true, `${visibleScheduledPost.url} expected success envelope`);
    assert(visibleScheduledPost.json?.data?.post?.id === createdPostId, `${visibleScheduledPost.url} returned wrong scheduled post in data envelope`);
    assert(visibleScheduledPost.json?.data?.post?.meta?.frontendDesignTemplateId === 'contract-blog-template', `${visibleScheduledPost.url} missing blog frontend metadata`);
    assert(visibleScheduledPost.json?.data?.post?.frontendDesign?.templateId === 'contract-blog-template', `${visibleScheduledPost.url} missing normalized blog frontend design`);
    assert(visibleScheduledPost.json?.data?.post?.frontendDesign?.routePattern === '/journal/{slug}', `${visibleScheduledPost.url} missing normalized blog route pattern`);
    assert(visibleScheduledPost.json?.data?.post?.frontendDesign?.chrome?.header?.component === 'ContractBlogHeader', `${visibleScheduledPost.url} missing normalized blog chrome`);
    assert(visibleScheduledPost.json?.data?.post?.frontendDesign?.tokens?.fonts?.heading === 'Newsreader', `${visibleScheduledPost.url} missing normalized blog tokens`);
    assert(Array.isArray(visibleScheduledPost.json?.data?.post?.frontendDesign?.bindingHints) && visibleScheduledPost.json.data.post.frontendDesign.bindingHints.length === 2, `${visibleScheduledPost.url} missing normalized blog binding hints`);
    assert(visibleScheduledPost.json?.post?.id === createdPostId, `${visibleScheduledPost.url} returned wrong scheduled post`);

    const visibleBlogRss = await request(`/api/sites/${createdSiteId}/blog/rss?limit=10`);
    assert(visibleBlogRss.response.status === 200, `${visibleBlogRss.url} expected blog RSS feed`);
    assert(visibleBlogRss.response.headers.get('content-type')?.includes('application/rss+xml'), `${visibleBlogRss.url} expected RSS content type`);
    assert(visibleBlogRss.response.headers.get('x-backy-cache-scope') === 'discovery', `${visibleBlogRss.url} missing discovery cache scope`);
    assert(visibleBlogRss.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${visibleBlogRss.url} missing public contract version`);
    assert(visibleBlogRss.response.headers.get('x-backy-schema-version') === 'rss.2.0', `${visibleBlogRss.url} missing RSS schema version`);
    assert(visibleBlogRss.response.headers.get('x-backy-site-id') === createdSiteId, `${visibleBlogRss.url} missing RSS site id header`);
    const blogRssCacheRevision = visibleBlogRss.response.headers.get('x-backy-cache-revision');
    assert(blogRssCacheRevision, `${visibleBlogRss.url} missing RSS cache revision`);
    const blogRssEtag = visibleBlogRss.response.headers.get('etag');
    assert(blogRssEtag?.startsWith('"backy-'), `${visibleBlogRss.url} missing RSS etag`);
    const revalidatedBlogRss = await request(`/api/sites/${createdSiteId}/blog/rss?limit=10`, {
      headers: { 'if-none-match': blogRssEtag },
    });
    assert(revalidatedBlogRss.response.status === 304, `${revalidatedBlogRss.url} expected RSS 304, got ${revalidatedBlogRss.response.status}`);
    assert(revalidatedBlogRss.response.headers.get('x-backy-cache-revision') === blogRssCacheRevision, `${revalidatedBlogRss.url} expected matching RSS cache revision`);
    assert(visibleBlogRss.text.includes('<rss version="2.0"'), `${visibleBlogRss.url} missing RSS root`);
    assert(visibleBlogRss.text.includes(`<title>Admin Contract Post</title>`), `${visibleBlogRss.url} missing post title item`);
    assert(visibleBlogRss.text.includes(`/blog/${postSlug}`), `${visibleBlogRss.url} missing post canonical link`);
    assert(visibleBlogRss.text.includes('Updated Admin Contract Category'), `${visibleBlogRss.url} missing category term`);
    assert(visibleBlogRss.text.includes('Admin User'), `${visibleBlogRss.url} missing author metadata`);

    const hostedBlogRss = await request(`/sites/${siteSlug}/blog/rss.xml`);
    assert(hostedBlogRss.response.status === 200, `${hostedBlogRss.url} expected hosted blog RSS feed`);
    assert(hostedBlogRss.response.headers.get('content-type')?.includes('application/rss+xml'), `${hostedBlogRss.url} expected hosted RSS content type`);
    assert(hostedBlogRss.response.headers.get('x-backy-schema-version') === 'rss.2.0', `${hostedBlogRss.url} missing hosted RSS schema version`);
    assert(hostedBlogRss.response.headers.get('x-backy-site-id') === createdSiteId, `${hostedBlogRss.url} missing hosted RSS site id header`);
    const hostedBlogRssCacheRevision = hostedBlogRss.response.headers.get('x-backy-cache-revision');
    assert(hostedBlogRssCacheRevision, `${hostedBlogRss.url} missing hosted RSS cache revision`);
    const hostedBlogRssEtag = hostedBlogRss.response.headers.get('etag');
    assert(hostedBlogRssEtag?.startsWith('"backy-'), `${hostedBlogRss.url} missing hosted RSS etag`);
    const revalidatedHostedBlogRss = await request(`/sites/${siteSlug}/blog/rss.xml`, {
      headers: { 'if-none-match': hostedBlogRssEtag },
    });
    assert(revalidatedHostedBlogRss.response.status === 304, `${revalidatedHostedBlogRss.url} expected hosted RSS 304, got ${revalidatedHostedBlogRss.response.status}`);
    assert(revalidatedHostedBlogRss.response.headers.get('x-backy-cache-revision') === hostedBlogRssCacheRevision, `${revalidatedHostedBlogRss.url} expected matching hosted RSS cache revision`);
    assert(hostedBlogRss.text.includes(`/blog/${postSlug}`), `${hostedBlogRss.url} missing hosted RSS post link`);

    const capturedBlogTemplate = await request(`/api/admin/sites/${createdSiteId}/frontend-design`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'capture-content-template',
        resourceType: 'blogPost',
        resourceId: createdPostId,
        templateId: 'captured-blog-template',
        templateName: 'Captured Blog Template',
        routePattern: '/captured-journal/{slug}',
      }),
    });
    assert(capturedBlogTemplate.response.status === 200, `${capturedBlogTemplate.url} expected blog content template capture`);
    const capturedTemplate = capturedBlogTemplate.json?.data?.frontendDesign?.templates?.find((template) => template.id === 'captured-blog-template');
    assert(capturedTemplate?.type === 'blogPost', `${capturedBlogTemplate.url} missing captured blog template type`);
    assert(capturedTemplate?.routePattern === '/captured-journal/{slug}', `${capturedBlogTemplate.url} missing captured blog route pattern`);
    assert(Array.isArray(capturedTemplate?.content?.elements) && capturedTemplate.content.elements.some((element) => element.id === 'contract-blog-heading'), `${capturedBlogTemplate.url} missing captured blog elements`);
    assert(capturedTemplate?.content?.canvasSize?.width === 900, `${capturedBlogTemplate.url} missing captured blog canvas size`);
    assert(Array.isArray(capturedTemplate?.bindingHints) && capturedTemplate.bindingHints.length === 2, `${capturedBlogTemplate.url} missing captured blog binding hints`);
    if (capturedBlogTemplate.json?.data?.cacheInvalidation) {
      assert(capturedBlogTemplate.json.data.cacheInvalidation.reason === 'site-frontend-design-template-captured', `${capturedBlogTemplate.url} missing blog template capture cache invalidation`);
    }

    const capturedTemplatePost = await request(`/api/admin/sites/${createdSiteId}/blog`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Captured Design Post',
        slug: `${postSlug}-captured-design`,
        excerpt: 'Generated from a captured blog frontend design template',
        status: 'published',
        authorId: 'user-admin',
        frontendDesignTemplateId: 'captured-blog-template',
      }),
    });
    assert(capturedTemplatePost.response.status === 201, `${capturedTemplatePost.url} expected post from captured template`);
    capturedTemplatePostId = capturedTemplatePost.json?.data?.post?.id;
    assert(capturedTemplatePostId, `${capturedTemplatePost.url} missing captured template post id`);
    assert(capturedTemplatePost.json?.data?.post?.meta?.frontendDesignTemplateId === 'captured-blog-template', `${capturedTemplatePost.url} missing captured blog template provenance`);
    assert(capturedTemplatePost.json?.data?.post?.meta?.frontendDesignRoutePattern === '/captured-journal/{slug}', `${capturedTemplatePost.url} missing captured blog route provenance`);
    assert(Array.isArray(capturedTemplatePost.json?.data?.post?.content?.elements) && capturedTemplatePost.json.data.post.content.elements.some((element) => element.id === 'contract-blog-heading'), `${capturedTemplatePost.url} did not seed captured blog design elements`);
    const publicCapturedTemplatePost = await request(`/api/sites/${createdSiteId}/blog?slug=${postSlug}-captured-design`);
    assert(publicCapturedTemplatePost.response.status === 200, `${publicCapturedTemplatePost.url} expected public post from captured template`);
    assert(publicCapturedTemplatePost.json?.data?.post?.frontendDesign?.templateId === 'captured-blog-template', `${publicCapturedTemplatePost.url} missing normalized captured blog frontend design`);
    assert(publicCapturedTemplatePost.json?.data?.post?.frontendDesign?.routePattern === '/captured-journal/{slug}', `${publicCapturedTemplatePost.url} missing normalized captured blog route pattern`);
    assert(Array.isArray(publicCapturedTemplatePost.json?.data?.post?.frontendDesign?.bindingHints) && publicCapturedTemplatePost.json.data.post.frontendDesign.bindingHints.length === 2, `${publicCapturedTemplatePost.url} missing normalized captured blog binding hints`);
    const deleteCapturedTemplatePost = await request(`/api/admin/sites/${createdSiteId}/blog/${capturedTemplatePostId}`, { method: 'DELETE' });
    assert(deleteCapturedTemplatePost.response.status === 200, `${deleteCapturedTemplatePost.url} expected captured template post delete`);
    const postDeleteAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=post&entityId=${capturedTemplatePostId}&action=delete&requestId=${deleteCapturedTemplatePost.json.requestId}`);
    assert(postDeleteAudit.response.status === 200, `${postDeleteAudit.url} expected post delete audit readback`);
    assert(postDeleteAudit.json?.data?.logs?.[0]?.metadata?.slug === `${postSlug}-captured-design`, `${postDeleteAudit.url} missing post delete audit metadata`);
    capturedTemplatePostId = null;

    const blogFrontendManifest = await request(`/api/sites/${createdSiteId}/manifest`);
    assert(blogFrontendManifest.response.status === 200, `${blogFrontendManifest.url} expected 200, got ${blogFrontendManifest.response.status}`);
    validateAiFrontendManifest(blogFrontendManifest.json, 'blog frontend design manifest');
    assert(blogFrontendManifest.json?.data?.endpoints?.blogRss === `/api/sites/${createdSiteId}/blog/rss`, `${blogFrontendManifest.url} missing blog RSS endpoint`);
    assert(blogFrontendManifest.json?.data?.modules?.blog?.rssUrl === `/api/sites/${createdSiteId}/blog/rss`, `${blogFrontendManifest.url} missing blog RSS module URL`);
    assert(blogFrontendManifest.json?.data?.modules?.blog?.hostedRssPath === '/blog/rss.xml', `${blogFrontendManifest.url} missing hosted RSS path`);
    const blogRssFeedDiscovery = blogFrontendManifest.json?.data?.modules?.blog?.feeds?.find((feed) => feed.id === 'blog-rss');
    assert(blogRssFeedDiscovery?.endpoint === `/api/sites/${createdSiteId}/blog/rss`, `${blogFrontendManifest.url} missing structured RSS feed endpoint`);
    assert(blogRssFeedDiscovery?.hostedPath === '/blog/rss.xml', `${blogFrontendManifest.url} missing structured hosted RSS feed path`);
    assert(blogRssFeedDiscovery?.contentType === 'application/rss+xml; charset=utf-8', `${blogFrontendManifest.url} missing RSS feed content type metadata`);
    assert(blogRssFeedDiscovery?.limits?.queryParam === 'limit' && blogRssFeedDiscovery.limits.max === 100, `${blogFrontendManifest.url} missing RSS feed limit metadata`);
    assert(blogRssFeedDiscovery?.cache?.scope === 'discovery' && blogRssFeedDiscovery.cache.revisionHeader === 'x-backy-cache-revision', `${blogFrontendManifest.url} missing RSS feed cache metadata`);
    assert(blogFrontendManifest.json?.data?.modules?.blog?.items?.some((post) => (
      post.id === createdPostId &&
      post.frontendDesign?.templateId === 'contract-blog-template' &&
      post.frontendDesign?.tokens?.fonts?.heading === 'Newsreader' &&
      post.frontendDesign?.chrome?.header?.component === 'ContractBlogHeader'
    )), `${blogFrontendManifest.url} missing blog frontend design manifest`);
    assert(blogFrontendManifest.json?.data?.site?.frontendDesign?.templates?.some((template) => template.id === 'captured-blog-template' && template.type === 'blogPost'), `${blogFrontendManifest.url} missing captured blog frontend template`);

    const visibleScheduledPostResolve = await request(`/api/sites/${createdSiteId}/resolve?path=/blog/${postSlug}`);
    assert(visibleScheduledPostResolve.response.status === 200, `${visibleScheduledPostResolve.url} expected published post route to be visible`);
    assert(visibleScheduledPostResolve.json?.data?.route?.type === 'post', `${visibleScheduledPostResolve.url} expected post route type`);
    assert(visibleScheduledPostResolve.json?.data?.route?.resource?.id === createdPostId, `${visibleScheduledPostResolve.url} returned wrong resolved post`);

    const visibleScheduledPostRender = await request(`/api/sites/${createdSiteId}/render?path=/blog/${postSlug}`);
    assert(visibleScheduledPostRender.response.status === 200, `${visibleScheduledPostRender.url} expected published post render to be visible`);
    validateAiRenderPayload(visibleScheduledPostRender.json, 'published post render payload');
    assert(visibleScheduledPostRender.json?.data?.content?.kind === 'post', `${visibleScheduledPostRender.url} expected post render content`);
    assert(visibleScheduledPostRender.json?.data?.content?.id === createdPostId, `${visibleScheduledPostRender.url} returned wrong rendered post`);
    assert(visibleScheduledPostRender.json?.data?.frontendDesign?.content?.templateId === 'contract-blog-template', `${visibleScheduledPostRender.url} missing render blog frontend design provenance`);
    assert(visibleScheduledPostRender.json?.data?.frontendDesign?.content?.chrome?.header?.component === 'ContractBlogHeader', `${visibleScheduledPostRender.url} missing render blog frontend chrome`);

    const update = await request(`/api/admin/sites/${createdSiteId}/blog/${createdPostId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title: 'Updated Admin Contract Post', status: 'published' }),
    });
    assert(update.response.status === 200, `${update.url} expected 200, got ${update.response.status}`);
    assert(update.json?.data?.post?.title === 'Updated Admin Contract Post', `${update.url} expected updated title`);
    assert(update.json?.data?.post?.status === 'published', `${update.url} expected published status`);
    const postUpdateAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=post&entityId=${createdPostId}&action=update&requestId=${update.json.requestId}`);
    assert(postUpdateAudit.response.status === 200, `${postUpdateAudit.url} expected post update audit readback`);
    assert(postUpdateAudit.json?.data?.logs?.[0]?.metadata?.changedFields?.includes('title'), `${postUpdateAudit.url} missing post update changedFields metadata`);
    assert(postUpdateAudit.json?.data?.logs?.[0]?.before?.title === 'Admin Contract Post', `${postUpdateAudit.url} missing post update before snapshot`);
    assert(postUpdateAudit.json?.data?.logs?.[0]?.after?.title === 'Updated Admin Contract Post', `${postUpdateAudit.url} missing post update after snapshot`);

    const resolvedPost = await request(`/api/sites/${createdSiteId}/resolve?path=/blog/${postSlug}`);
    assert(resolvedPost.response.status === 200, `${resolvedPost.url} expected 200, got ${resolvedPost.response.status}`);
    assert(resolvedPost.json?.success === true, `${resolvedPost.url} expected success envelope`);
    assert(resolvedPost.json?.data?.route?.type === 'post', `${resolvedPost.url} expected post route`);
    assert(resolvedPost.json?.data?.route?.resource?.id === createdPostId, `${resolvedPost.url} returned wrong resolved post`);

    const renderedPost = await request(`/api/sites/${createdSiteId}/render?path=/blog/${postSlug}`);
    assert(renderedPost.response.status === 200, `${renderedPost.url} expected 200, got ${renderedPost.response.status}`);
    validateAiRenderPayload(renderedPost.json, 'post render payload');
    assert(renderedPost.json?.success === true, `${renderedPost.url} expected success envelope`);
    assert(renderedPost.json?.data?.route?.type === 'post', `${renderedPost.url} expected post render route`);
    assert(renderedPost.json?.data?.content?.kind === 'post', `${renderedPost.url} expected post content kind`);
    assert(renderedPost.json?.data?.content?.id === createdPostId, `${renderedPost.url} returned wrong rendered post`);
    assert(renderedPost.json?.data?.frontendDesign?.content?.tokens?.fonts?.heading === 'Newsreader', `${renderedPost.url} missing render blog frontend tokens`);
    assert(
      renderedPost.json?.data?.interactions?.comments?.some((thread) => thread.targetType === 'post' && thread.targetId === createdPostId),
      `${renderedPost.url} missing post comment interaction`,
    );

    const publicCategories = await request(`/api/sites/${createdSiteId}/blog/categories`);
    assert(publicCategories.response.status === 200, `${publicCategories.url} expected 200, got ${publicCategories.response.status}`);
    assert(publicCategories.response.headers.get('x-backy-cache-scope') === 'discovery', `${publicCategories.url} missing public categories cache scope`);
    assert(publicCategories.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${publicCategories.url} missing public categories contract version`);
    assert(publicCategories.response.headers.get('x-backy-site-id') === createdSiteId, `${publicCategories.url} missing public categories site id header`);
    assert(publicCategories.response.headers.get('x-backy-cache-revision'), `${publicCategories.url} missing public categories cache revision`);
    const publicCategoriesEtag = publicCategories.response.headers.get('etag');
    assert(publicCategoriesEtag?.startsWith('"backy-'), `${publicCategories.url} missing public categories etag`);
    const revalidatedPublicCategories = await request(`/api/sites/${createdSiteId}/blog/categories`, {
      headers: { 'if-none-match': publicCategoriesEtag },
    });
    assert(revalidatedPublicCategories.response.status === 304, `${revalidatedPublicCategories.url} expected categories 304, got ${revalidatedPublicCategories.response.status}`);
    assert(revalidatedPublicCategories.response.headers.get('etag') === publicCategoriesEtag, `${revalidatedPublicCategories.url} expected matching categories etag`);
    assert(publicCategories.json?.success === true, `${publicCategories.url} expected success envelope`);
    assert(publicCategories.json?.data?.categories?.some((category) => category.id === createdCategoryId), `${publicCategories.url} missing public category in data envelope`);
    assert(publicCategories.json?.categories?.some((category) => category.id === createdCategoryId), `${publicCategories.url} missing public category`);

    const publicTags = await request(`/api/sites/${createdSiteId}/blog/tags`);
    assert(publicTags.response.status === 200, `${publicTags.url} expected 200, got ${publicTags.response.status}`);
    assert(publicTags.response.headers.get('x-backy-cache-scope') === 'discovery', `${publicTags.url} missing public tags cache scope`);
    assert(publicTags.response.headers.get('etag')?.startsWith('"backy-'), `${publicTags.url} missing public tags etag`);
    assert(publicTags.json?.success === true, `${publicTags.url} expected success envelope`);
    assert(publicTags.json?.data?.tags?.some((tag) => tag.id === createdTagId), `${publicTags.url} missing public tag in data envelope`);
    assert(publicTags.json?.tags?.some((tag) => tag.id === createdTagId), `${publicTags.url} missing public tag`);

    const publicCategoryFilter = await request(`/api/sites/${createdSiteId}/blog?categorySlug=${categorySlug}`);
    assert(publicCategoryFilter.response.status === 200, `${publicCategoryFilter.url} expected 200, got ${publicCategoryFilter.response.status}`);
    assert(publicCategoryFilter.response.headers.get('x-backy-cache-scope') === 'discovery', `${publicCategoryFilter.url} missing discovery cache scope`);
    assert(publicCategoryFilter.response.headers.get('etag')?.startsWith('"backy-'), `${publicCategoryFilter.url} missing filtered posts etag`);
    assert(publicCategoryFilter.json?.success === true, `${publicCategoryFilter.url} expected success envelope`);
    assert(publicCategoryFilter.json?.data?.posts?.some((post) => post.id === createdPostId), `${publicCategoryFilter.url} missing public category-filtered post in data envelope`);
    assert(publicCategoryFilter.json?.posts?.some((post) => post.id === createdPostId), `${publicCategoryFilter.url} missing public category-filtered post`);

    const publicAuthorFilter = await request(`/api/sites/${createdSiteId}/blog?authorId=user-admin`);
    assert(publicAuthorFilter.response.status === 200, `${publicAuthorFilter.url} expected 200, got ${publicAuthorFilter.response.status}`);
    assert(publicAuthorFilter.json?.posts?.some((post) => post.id === createdPostId), `${publicAuthorFilter.url} missing public author-filtered post`);

    const remove = await request(`/api/admin/sites/${createdSiteId}/blog/${createdPostId}`, { method: 'DELETE' });
    assert(remove.response.status === 200, `${remove.url} expected 200, got ${remove.response.status}`);
    assert(remove.json?.data?.deleted === true, `${remove.url} expected deleted true`);
    createdPostId = null;
  });

  await record('admin blog taxonomy delete removes temporary terms', async () => {
    const removeCategory = await request(`/api/admin/sites/${createdSiteId}/blog/categories/${createdCategoryId}`, { method: 'DELETE' });
    assert(removeCategory.response.status === 200, `${removeCategory.url} expected 200, got ${removeCategory.response.status}`);
    assert(removeCategory.json?.data?.deleted === true, `${removeCategory.url} expected deleted category`);
    createdCategoryId = null;

    const removeTag = await request(`/api/admin/sites/${createdSiteId}/blog/tags/${createdTagId}`, { method: 'DELETE' });
    assert(removeTag.response.status === 200, `${removeTag.url} expected 200, got ${removeTag.response.status}`);
    assert(removeTag.json?.data?.deleted === true, `${removeTag.url} expected deleted tag`);
    createdTagId = null;
  });

  await record('admin collections create/read/update/delete records for temporary site', async () => {
    const unauthCollections = await fetch(`${baseUrl}/api/admin/sites/${createdSiteId}/collections`);
    const unauthCollectionsJson = await unauthCollections.json().catch(() => ({}));
    assert(unauthCollections.status === 401, `Collections admin API should reject missing auth, got ${unauthCollections.status}`);
    assert(unauthCollectionsJson?.success === false && unauthCollectionsJson?.error?.code === 'UNAUTHORIZED', `Collections admin API missing auth envelope: ${JSON.stringify(unauthCollectionsJson).slice(0, 500)}`);

    const scheduledCollectionCreate = await request(`/api/admin/sites/${createdSiteId}/collections`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Invalid Scheduled Collection',
        slug: `invalid-scheduled-collection-${unique}`,
        status: 'scheduled',
        fields: [
          { key: 'title', label: 'Title', type: 'text', required: true },
        ],
        permissions: {
          publicRead: false,
          publicCreate: false,
          publicUpdate: false,
          publicDelete: false,
        },
      }),
    });
    assert(scheduledCollectionCreate.response.status === 400, `${scheduledCollectionCreate.url} expected scheduled collection create to fail`);
    assert(scheduledCollectionCreate.json?.error?.code === 'VALIDATION_ERROR', `${scheduledCollectionCreate.url} expected validation error for scheduled collection create`);

    const createNestedReferenceCollection = await request(`/api/admin/sites/${createdSiteId}/collections`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Admin Contract Companies',
        slug: nestedReferenceCollectionSlug,
        frontendDesignTemplateId: 'imported-external-collection-template',
        listRoutePattern: `/${nestedReferenceCollectionSlug}`,
        routePattern: `/${nestedReferenceCollectionSlug}/:recordSlug`,
        status: 'published',
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true, unique: true },
          { key: 'domain', label: 'Domain', type: 'text' },
        ],
        permissions: {
          publicRead: true,
          publicCreate: false,
          publicUpdate: false,
          publicDelete: false,
        },
      }),
    });
    assert(createNestedReferenceCollection.response.status === 201, `${createNestedReferenceCollection.url} expected 201, got ${createNestedReferenceCollection.response.status}`);
    createdNestedReferenceCollectionId = createNestedReferenceCollection.json?.data?.collection?.id;
    assert(createdNestedReferenceCollectionId, `${createNestedReferenceCollection.url} missing nested reference collection id`);

    const createNestedReferenceRecord = await request(`/api/admin/sites/${createdSiteId}/collections/${createdNestedReferenceCollectionId}/records`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        slug: nestedReferenceRecordSlug,
        status: 'published',
        values: {
          name: 'Contract Company',
          domain: 'contract.example.test',
        },
      }),
    });
    assert(createNestedReferenceRecord.response.status === 201, `${createNestedReferenceRecord.url} expected 201, got ${createNestedReferenceRecord.response.status}`);
    createdNestedReferenceRecordId = createNestedReferenceRecord.json?.data?.record?.id;
    assert(createdNestedReferenceRecordId, `${createNestedReferenceRecord.url} missing nested reference record id`);

    const createReferenceCollection = await request(`/api/admin/sites/${createdSiteId}/collections`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Admin Contract Authors',
        slug: referenceCollectionSlug,
        status: 'published',
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true, unique: true },
          { key: 'bio', label: 'Bio', type: 'richText' },
          { key: 'company', label: 'Company', type: 'reference', referenceCollectionId: createdNestedReferenceCollectionId },
        ],
        permissions: {
          publicRead: true,
          publicCreate: false,
          publicUpdate: false,
          publicDelete: false,
        },
      }),
    });
    assert(createReferenceCollection.response.status === 201, `${createReferenceCollection.url} expected 201, got ${createReferenceCollection.response.status}`);
    createdReferenceCollectionId = createReferenceCollection.json?.data?.collection?.id;
    assert(createdReferenceCollectionId, `${createReferenceCollection.url} missing reference collection id`);

    const createReferenceRecord = await request(`/api/admin/sites/${createdSiteId}/collections/${createdReferenceCollectionId}/records`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        slug: referenceRecordSlug,
        status: 'published',
        values: {
          name: 'Contract Author',
          bio: 'Author referenced by collection-bound render payloads.',
          company: createdNestedReferenceRecordId,
        },
      }),
    });
    assert(createReferenceRecord.response.status === 201, `${createReferenceRecord.url} expected 201, got ${createReferenceRecord.response.status}`);
    createdReferenceRecordId = createReferenceRecord.json?.data?.record?.id;
    assert(createdReferenceRecordId, `${createReferenceRecord.url} missing reference record id`);

    const createCollection = await request(`/api/admin/sites/${createdSiteId}/collections`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Admin Contract Collection',
        slug: collectionSlug,
        frontendDesignTemplateId: 'imported-external-collection-template',
        listRoutePattern: `/directory`,
        routePattern: `/directory/:recordSlug`,
        status: 'published',
        fields: [
          { key: 'title', label: 'Title', type: 'text', required: true, unique: true },
          { key: 'summary', label: 'Summary', type: 'richText' },
          { key: 'rank', label: 'Rank', type: 'number' },
          { key: 'category', label: 'Category', type: 'select', options: ['Featured', 'Standard'] },
          { key: 'labels', label: 'Labels', type: 'tags', options: ['Launch', 'Evergreen', 'Internal'] },
          { key: 'author', label: 'Author', type: 'reference', referenceCollectionId: createdReferenceCollectionId },
        ],
        permissions: {
          publicRead: true,
          publicCreate: false,
          publicUpdate: false,
          publicDelete: false,
        },
      }),
    });
    assert(createCollection.response.status === 201, `${createCollection.url} expected 201, got ${createCollection.response.status}`);
    assert(createCollection.json?.success === true, `${createCollection.url} expected success envelope`);
    assert(createCollection.json?.data?.collection?.slug === collectionSlug, `${createCollection.url} returned wrong collection slug`);
    assert(createCollection.json?.data?.collection?.listRoutePattern === '/directory', `${createCollection.url} returned wrong collection list route pattern`);
    assert(createCollection.json?.data?.collection?.routePattern === '/directory/:recordSlug', `${createCollection.url} returned wrong collection route pattern`);
    assert(createCollection.json?.data?.collection?.fields?.some((field) => field.key === 'title' && field.required === true), `${createCollection.url} missing title field schema`);
    createdCollectionId = createCollection.json.data.collection.id;
    const collectionCreateAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=collection&entityId=${createdCollectionId}&action=create&requestId=${createCollection.json.requestId}`);
    assert(collectionCreateAudit.response.status === 200, `${collectionCreateAudit.url} expected collection create audit readback`);
    assert(collectionCreateAudit.json?.data?.logs?.[0]?.metadata?.slug === collectionSlug, `${collectionCreateAudit.url} missing collection create slug metadata`);
    assert(collectionCreateAudit.json?.data?.logs?.[0]?.after?.status === 'published', `${collectionCreateAudit.url} missing collection create after snapshot`);
    assert(collectionCreateAudit.json?.data?.logs?.[0]?.metadata?.publicCreate === false, `${collectionCreateAudit.url} missing collection create permission metadata`);

    const scheduledCollectionUpdate = await request(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status: 'scheduled' }),
    });
    assert(scheduledCollectionUpdate.response.status === 400, `${scheduledCollectionUpdate.url} expected scheduled collection update to fail`);
    assert(scheduledCollectionUpdate.json?.error?.code === 'VALIDATION_ERROR', `${scheduledCollectionUpdate.url} expected validation error for scheduled collection update`);

    const createDynamicTemplateCollection = await request(`/api/admin/sites/${createdSiteId}/collections`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Admin Contract Dynamic Template Collection',
        slug: dynamicTemplateCollectionSlug,
        listRoutePattern: `/template-directory-${unique}`,
        routePattern: `/template-directory-${unique}/:recordSlug`,
        status: 'published',
        metadata: {
          dynamicTemplates: {
            list: {
              variant: 'compact',
              titleField: 'title',
              descriptionField: 'summary',
              imageField: 'image',
              limit: 6,
            },
            item: {
              variant: 'directory',
              titleField: 'title',
              descriptionField: 'summary',
              detailFields: ['rank', 'category'],
            },
          },
        },
        fields: [
          { key: 'title', label: 'Title', type: 'text', required: true, unique: true },
          { key: 'summary', label: 'Summary', type: 'text' },
          { key: 'image', label: 'Image', type: 'image' },
          { key: 'rank', label: 'Rank', type: 'number' },
          { key: 'category', label: 'Category', type: 'select', options: ['Featured', 'Standard'] },
        ],
        permissions: {
          publicRead: true,
          publicCreate: false,
          publicUpdate: false,
          publicDelete: false,
        },
      }),
    });
    assert(createDynamicTemplateCollection.response.status === 201, `${createDynamicTemplateCollection.url} expected dynamic template collection`);
    const dynamicTemplateCollectionId = createDynamicTemplateCollection.json?.data?.collection?.id;
    assert(dynamicTemplateCollectionId, `${createDynamicTemplateCollection.url} missing dynamic template collection id`);
    assert(createDynamicTemplateCollection.json?.data?.collection?.metadata?.dynamicTemplates?.list?.variant === 'compact', `${createDynamicTemplateCollection.url} missing saved list template metadata`);
    assert(createDynamicTemplateCollection.json?.data?.collection?.metadata?.dynamicTemplates?.item?.variant === 'directory', `${createDynamicTemplateCollection.url} missing saved item template metadata`);
    const createDynamicTemplateRecord = await request(`/api/admin/sites/${createdSiteId}/collections/${dynamicTemplateCollectionId}/records`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        slug: dynamicTemplateRecordSlug,
        status: 'published',
        values: {
          title: 'Dynamic Template Record',
          summary: 'Metadata-driven fallback rendering',
          image: '/uploads/dynamic-template.png',
          rank: 7,
          category: 'Featured',
        },
      }),
    });
    assert(createDynamicTemplateRecord.response.status === 201, `${createDynamicTemplateRecord.url} expected dynamic template record`);
    const dynamicTemplateRecordId = createDynamicTemplateRecord.json?.data?.record?.id;
    assert(dynamicTemplateRecordId, `${createDynamicTemplateRecord.url} missing dynamic template record id`);
    const dynamicTemplateListRender = await request(`/api/sites/${createdSiteId}/render?path=${encodeURIComponent(`/template-directory-${unique}`)}`);
    assert(dynamicTemplateListRender.response.status === 200, `${dynamicTemplateListRender.url} expected dynamic template list render`);
    validateAiRenderPayload(dynamicTemplateListRender.json, 'collection dynamic template list render payload');
    assert(!dynamicTemplateListRender.json?.data?.frontendDesign?.content?.templateId, `${dynamicTemplateListRender.url} should use generated fallback instead of frontend design template`);
    assert(dynamicTemplateListRender.json?.data?.content?.elements?.some((element) => (
      element.id?.startsWith('dynamic_list_')
      && element.id?.endsWith('_image')
      && element.type === 'image'
      && element.props?.assetId === '/uploads/dynamic-template.png'
    )), `${dynamicTemplateListRender.url} missing compact list image from dynamic template metadata`);
    assert(dynamicTemplateListRender.json?.data?.content?.elements?.some((element) => (
      element.id?.startsWith('dynamic_list_')
      && element.id?.endsWith('_description')
      && element.props?.content === 'Metadata-driven fallback rendering'
    )), `${dynamicTemplateListRender.url} missing configured list summary field`);
    const dynamicTemplateItemRender = await request(`/api/sites/${createdSiteId}/render?path=${encodeURIComponent(`/template-directory-${unique}/${dynamicTemplateRecordSlug}`)}`);
    assert(dynamicTemplateItemRender.response.status === 200, `${dynamicTemplateItemRender.url} expected dynamic template item render`);
    validateAiRenderPayload(dynamicTemplateItemRender.json, 'collection dynamic template item render payload');
    assert(dynamicTemplateItemRender.json?.data?.content?.elements?.some((element) => (
      element.id?.startsWith('dynamic_')
      && element.id?.endsWith('_rank')
      && element.x === 96
      && element.width === 488
      && element.props?.content === 'Rank: 7'
    )), `${dynamicTemplateItemRender.url} missing directory item rank detail field`);
    assert(dynamicTemplateItemRender.json?.data?.content?.elements?.some((element) => (
      element.id?.startsWith('dynamic_')
      && element.id?.endsWith('_category')
      && element.x === 616
      && element.width === 488
      && element.props?.content === 'Category: Featured'
    )), `${dynamicTemplateItemRender.url} missing directory item second-column detail field`);
    await request(`/api/admin/sites/${createdSiteId}/collections/${dynamicTemplateCollectionId}/records/${dynamicTemplateRecordId}`, { method: 'DELETE' });
    await request(`/api/admin/sites/${createdSiteId}/collections/${dynamicTemplateCollectionId}`, { method: 'DELETE' });

    const capturedCollectionTemplate = await request(`/api/admin/sites/${createdSiteId}/frontend-design`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'capture-content-template',
        resourceType: 'collection',
        resourceId: createdCollectionId,
        templateId: 'captured-collection-template',
        templateName: 'Captured Collection Template',
      }),
    });
    assert(capturedCollectionTemplate.response.status === 200, `${capturedCollectionTemplate.url} expected collection template capture 200`);
    const capturedCollectionTemplateEntry = capturedCollectionTemplate.json?.data?.frontendDesign?.templates?.find((template) => template.id === 'captured-collection-template');
    assert(capturedCollectionTemplateEntry?.type === 'collection', `${capturedCollectionTemplate.url} missing captured collection template`);
    assert(capturedCollectionTemplateEntry?.content?.fields?.some((field) => field.key === 'title'), `${capturedCollectionTemplate.url} did not preserve collection fields`);
    assert(capturedCollectionTemplateEntry?.routePattern === '/directory/:recordSlug', `${capturedCollectionTemplate.url} did not preserve collection route pattern`);

    const createCollectionFromTemplate = await request(`/api/admin/sites/${createdSiteId}/collections`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        frontendDesignTemplateId: 'captured-collection-template',
        name: 'Captured Template Collection',
        slug: `${collectionSlug}-captured-template`,
        status: 'published',
        listRoutePattern: `/directory-captured-${unique}`,
        routePattern: `/directory-captured-${unique}/:recordSlug`,
      }),
    });
    assert(createCollectionFromTemplate.response.status === 201, `${createCollectionFromTemplate.url} expected collection from captured template`);
    const capturedTemplateCollectionId = createCollectionFromTemplate.json?.data?.collection?.id;
    assert(capturedTemplateCollectionId, `${createCollectionFromTemplate.url} missing captured template collection id`);
    assert(createCollectionFromTemplate.json?.data?.collection?.metadata?.frontendDesignTemplateId === 'captured-collection-template', `${createCollectionFromTemplate.url} missing captured collection provenance`);
    assert(createCollectionFromTemplate.json?.data?.collection?.fields?.some((field) => field.key === 'title'), `${createCollectionFromTemplate.url} did not seed captured collection fields`);
    const publicCapturedTemplateCollection = await request(`/api/sites/${createdSiteId}/collections/${capturedTemplateCollectionId}`);
    assert(publicCapturedTemplateCollection.response.status === 200, `${publicCapturedTemplateCollection.url} expected public captured collection`);
    assert(publicCapturedTemplateCollection.json?.data?.collection?.frontendDesign?.templateId === 'captured-collection-template', `${publicCapturedTemplateCollection.url} missing normalized collection frontend design`);
    assert(publicCapturedTemplateCollection.json?.data?.collection?.frontendDesign?.routePattern === '/directory/:recordSlug', `${publicCapturedTemplateCollection.url} missing normalized collection route pattern`);
    const publicCollectionsWithCapturedTemplate = await request(`/api/sites/${createdSiteId}/collections`);
    assert(publicCollectionsWithCapturedTemplate.response.status === 200, `${publicCollectionsWithCapturedTemplate.url} expected public collections with captured template`);
    assert(publicCollectionsWithCapturedTemplate.json?.data?.collections?.some((collection) => (
      collection.id === capturedTemplateCollectionId &&
      collection.frontendDesign?.templateId === 'captured-collection-template'
    )), `${publicCollectionsWithCapturedTemplate.url} missing normalized collection frontend design in list`);
    const publicManifestWithCapturedCollection = await request(`/api/sites/${createdSiteId}/manifest`);
    assert(publicManifestWithCapturedCollection.response.status === 200, `${publicManifestWithCapturedCollection.url} expected manifest with captured collection`);
    assert(publicManifestWithCapturedCollection.json?.data?.modules?.collections?.some((collection) => (
      collection.id === capturedTemplateCollectionId &&
      collection.frontendDesign?.templateId === 'captured-collection-template'
    )), `${publicManifestWithCapturedCollection.url} missing manifest collection frontend design`);
    assert(publicManifestWithCapturedCollection.json?.data?.routePatterns?.some((routePattern) => (
      routePattern.type === 'dynamicCollectionList' &&
      routePattern.collectionId === capturedTemplateCollectionId &&
      routePattern.frontendDesign?.templateId === 'captured-collection-template'
    )), `${publicManifestWithCapturedCollection.url} missing manifest dynamic collection frontend design`);
    const publicCapturedTemplateCollectionResolve = await request(`/api/sites/${createdSiteId}/resolve?path=${encodeURIComponent(`/directory-captured-${unique}`)}`);
    assert(publicCapturedTemplateCollectionResolve.response.status === 200, `${publicCapturedTemplateCollectionResolve.url} expected captured collection resolve`);
    assert(publicCapturedTemplateCollectionResolve.json?.data?.route?.resource?.frontendDesign?.templateId === 'captured-collection-template', `${publicCapturedTemplateCollectionResolve.url} missing resolved collection frontend design`);
    const createRecordFromCollectionTemplate = await request(`/api/admin/sites/${createdSiteId}/collections/${capturedTemplateCollectionId}/records`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        frontendDesignTemplateId: 'captured-collection-template',
        slug: `captured-template-record-${unique}`,
        status: 'published',
        values: {
          title: 'Captured Template Directory Record',
        },
      }),
    });
    assert(createRecordFromCollectionTemplate.response.status === 201, `${createRecordFromCollectionTemplate.url} expected captured template record`);
    const capturedTemplateRecordId = createRecordFromCollectionTemplate.json?.data?.record?.id;
    assert(capturedTemplateRecordId, `${createRecordFromCollectionTemplate.url} missing captured template record id`);
    assert(createRecordFromCollectionTemplate.json?.data?.record?.values?.frontendDesignTemplateId === 'captured-collection-template', `${createRecordFromCollectionTemplate.url} missing captured collection record provenance`);
    const publicCapturedTemplateRecords = await request(`/api/sites/${createdSiteId}/collections/${capturedTemplateCollectionId}/records?slug=captured-template-record-${unique}`);
    assert(publicCapturedTemplateRecords.response.status === 200, `${publicCapturedTemplateRecords.url} expected public captured template record`);
    assert(publicCapturedTemplateRecords.json?.data?.collection?.frontendDesign?.templateId === 'captured-collection-template', `${publicCapturedTemplateRecords.url} missing normalized record collection frontend design`);
    assert(publicCapturedTemplateRecords.json?.data?.records?.[0]?.frontendDesign?.templateId === 'captured-collection-template', `${publicCapturedTemplateRecords.url} missing normalized collection record frontend design`);
    const publicCapturedTemplateRecordResolve = await request(`/api/sites/${createdSiteId}/resolve?path=${encodeURIComponent(`/directory-captured-${unique}/captured-template-record-${unique}`)}`);
    assert(publicCapturedTemplateRecordResolve.response.status === 200, `${publicCapturedTemplateRecordResolve.url} expected captured collection record resolve`);
    assert(publicCapturedTemplateRecordResolve.json?.data?.route?.resource?.frontendDesign?.templateId === 'captured-collection-template', `${publicCapturedTemplateRecordResolve.url} missing resolved collection record frontend design`);
    assert(publicCapturedTemplateRecordResolve.json?.data?.route?.resource?.collectionFrontendDesign?.templateId === 'captured-collection-template', `${publicCapturedTemplateRecordResolve.url} missing resolved collection record schema frontend design`);
    const publicCapturedTemplateSeo = await request(`/api/sites/${createdSiteId}/seo`);
    assert(publicCapturedTemplateSeo.response.status === 200, `${publicCapturedTemplateSeo.url} expected captured collection SEO discovery`);
    assert(publicCapturedTemplateSeo.json?.data?.routes?.some((route) => (
      route.type === 'dynamicList' &&
      route.id === capturedTemplateCollectionId &&
      route.frontendDesign?.templateId === 'captured-collection-template'
    )), `${publicCapturedTemplateSeo.url} missing SEO collection frontend design`);
    assert(publicCapturedTemplateSeo.json?.data?.routes?.some((route) => (
      route.type === 'dynamicItem' &&
      route.id === capturedTemplateRecordId &&
      route.frontendDesign?.templateId === 'captured-collection-template' &&
      route.collectionFrontendDesign?.templateId === 'captured-collection-template'
    )), `${publicCapturedTemplateSeo.url} missing SEO collection record frontend design`);
    const capturedTemplateCollectionRender = await request(`/api/sites/${createdSiteId}/render?path=${encodeURIComponent(`/directory-captured-${unique}`)}`);
    assert(capturedTemplateCollectionRender.response.status === 200, `${capturedTemplateCollectionRender.url} expected captured collection render`);
    validateAiRenderPayload(capturedTemplateCollectionRender.json, 'captured collection render payload');
    assert(capturedTemplateCollectionRender.json?.data?.frontendDesign?.content?.templateId === 'captured-collection-template', `${capturedTemplateCollectionRender.url} missing render collection frontend design provenance`);
    assert(capturedTemplateCollectionRender.json?.data?.frontendDesign?.content?.routePattern === '/directory/:recordSlug', `${capturedTemplateCollectionRender.url} missing render collection frontend route pattern`);
    await request(`/api/admin/sites/${createdSiteId}/collections/${capturedTemplateCollectionId}/records/${capturedTemplateRecordId}`, { method: 'DELETE' });
    await request(`/api/admin/sites/${createdSiteId}/collections/${capturedTemplateCollectionId}`, { method: 'DELETE' });

    const duplicateCollection = await request(`/api/admin/sites/${createdSiteId}/collections`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Duplicate Collection', slug: collectionSlug }),
    });
    assert(duplicateCollection.response.status === 409, `${duplicateCollection.url} expected 409, got ${duplicateCollection.response.status}`);
    assert(duplicateCollection.json?.error?.code === 'SLUG_CONFLICT', `${duplicateCollection.url} expected SLUG_CONFLICT`);

    const listCollections = await request(`/api/admin/sites/${createdSiteId}/collections`);
    assert(listCollections.response.status === 200, `${listCollections.url} expected 200, got ${listCollections.response.status}`);
    assert(listCollections.json?.data?.collections?.some((collection) => collection.id === createdCollectionId), `${listCollections.url} missing created collection`);

    const publicCollections = await request(`/api/sites/${createdSiteId}/collections`);
    assert(publicCollections.response.status === 200, `${publicCollections.url} expected 200, got ${publicCollections.response.status}`);
    assert(publicCollections.response.headers.get('x-backy-cache-scope') === 'discovery', `${publicCollections.url} missing discovery cache scope`);
    assert(publicCollections.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${publicCollections.url} missing contract version header`);
    assert(publicCollections.response.headers.get('x-backy-site-id') === createdSiteId, `${publicCollections.url} missing site id header`);
    const publicCollectionsCacheRevision = publicCollections.response.headers.get('x-backy-cache-revision');
    assert(publicCollectionsCacheRevision, `${publicCollections.url} missing collection cache revision`);
    const publicCollectionsEtag = publicCollections.response.headers.get('etag');
    assert(publicCollectionsEtag?.startsWith('"backy-'), `${publicCollections.url} missing collection etag`);
    const revalidatedPublicCollections = await request(`/api/sites/${createdSiteId}/collections`, {
      headers: { 'if-none-match': publicCollectionsEtag },
    });
    assert(revalidatedPublicCollections.response.status === 304, `${revalidatedPublicCollections.url} expected collection 304, got ${revalidatedPublicCollections.response.status}`);
    assert(revalidatedPublicCollections.response.headers.get('etag') === publicCollectionsEtag, `${revalidatedPublicCollections.url} expected matching collection etag`);
    assert(revalidatedPublicCollections.response.headers.get('x-backy-cache-revision') === publicCollectionsCacheRevision, `${revalidatedPublicCollections.url} expected matching collection cache revision`);
    assert(publicCollections.json?.success === true, `${publicCollections.url} expected success envelope`);
    assert(publicCollections.json?.data?.collections?.some((collection) => collection.id === createdCollectionId), `${publicCollections.url} missing public collection in data envelope`);
    assert(publicCollections.json?.collections?.some((collection) => collection.id === createdCollectionId), `${publicCollections.url} missing public collection`);
    const publicCollectionSchema = publicCollections.json?.collections?.find((collection) => collection.id === createdCollectionId);
    assert(publicCollectionSchema?.listRoutePattern === '/directory', `${publicCollections.url} missing collection list route pattern`);
    assert(publicCollectionSchema?.routePattern === '/directory/:recordSlug', `${publicCollections.url} missing collection route pattern`);
    assert(publicCollectionSchema?.fields?.some((field) => field.key === 'category' && field.type === 'select' && field.options?.includes('Featured')), `${publicCollections.url} missing select option schema`);
    assert(publicCollectionSchema?.fields?.some((field) => field.key === 'labels' && field.type === 'tags' && field.options?.includes('Evergreen')), `${publicCollections.url} missing tags option schema`);

    const publicCollectionDetail = await request(`/api/sites/${createdSiteId}/collections/${createdCollectionId}`);
    assert(publicCollectionDetail.response.status === 200, `${publicCollectionDetail.url} expected 200, got ${publicCollectionDetail.response.status}`);
    assert(publicCollectionDetail.response.headers.get('x-backy-cache-scope') === 'discovery', `${publicCollectionDetail.url} missing discovery cache scope`);
    assert(publicCollectionDetail.response.headers.get('x-backy-cache-revision'), `${publicCollectionDetail.url} missing collection detail cache revision`);
    assert(publicCollectionDetail.response.headers.get('etag')?.startsWith('"backy-'), `${publicCollectionDetail.url} missing collection detail etag`);
    assert(publicCollectionDetail.json?.data?.collection?.id === createdCollectionId, `${publicCollectionDetail.url} returned wrong public collection detail`);

    const conflictingPage = await request(`/api/admin/sites/${createdSiteId}/pages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Route Conflict Page',
        slug: routeConflictPageSlug,
        status: 'published',
        content: { canvasSize: { width: 1200, height: 720 }, elements: [] },
      }),
    });
    assert(conflictingPage.response.status === 201, `${conflictingPage.url} expected 201, got ${conflictingPage.response.status}`);
    const routeConflictPageId = conflictingPage.json.data.page.id;
    routeConflictCleanupPageId = routeConflictPageId;

    const blockedCollectionRoute = await request(`/api/admin/sites/${createdSiteId}/collections`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Route Conflict Collection',
        slug: `route-conflict-collection-${unique}`,
        listRoutePattern: `/${routeConflictPageSlug}`,
        routePattern: `/${routeConflictPageSlug}/:recordSlug`,
        status: 'published',
        fields: [{ key: 'title', label: 'Title', type: 'text' }],
      }),
    });
    assert(blockedCollectionRoute.response.status === 409, `${blockedCollectionRoute.url} expected route conflict 409`);
    assert(blockedCollectionRoute.json?.error?.code === 'ROUTE_CONFLICT', `${blockedCollectionRoute.url} expected ROUTE_CONFLICT`);

    const removeRouteConflictPage = await request(`/api/admin/sites/${createdSiteId}/pages/${routeConflictPageId}`, { method: 'DELETE' });
    assert(removeRouteConflictPage.response.status === 200, `${removeRouteConflictPage.url} expected 200, got ${removeRouteConflictPage.response.status}`);
    routeConflictCleanupPageId = null;

    const blockedPageRoute = await request(`/api/admin/sites/${createdSiteId}/pages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Directory Conflict Page',
        slug: 'directory',
        status: 'published',
        content: { canvasSize: { width: 1200, height: 720 }, elements: [] },
      }),
    });
    assert(blockedPageRoute.response.status === 409, `${blockedPageRoute.url} expected route conflict 409`);
    assert(blockedPageRoute.json?.error?.code === 'ROUTE_CONFLICT', `${blockedPageRoute.url} expected ROUTE_CONFLICT`);

    const blockedPublicCreate = await request(`/api/sites/${createdSiteId}/collections/${createdCollectionId}/records`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        values: {
          title: 'Blocked Public Record',
          category: 'Featured',
        },
      }),
    });
    assert(blockedPublicCreate.response.status === 403, `${blockedPublicCreate.url} expected public create to be forbidden`);
    assertBackyContract(blockedPublicCreate, 'error');
    assert(blockedPublicCreate.json?.error?.code === 'PUBLIC_CREATE_DISABLED', `${blockedPublicCreate.url} expected PUBLIC_CREATE_DISABLED`);

    const enablePublicCreate = await request(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        permissions: {
          publicRead: true,
          publicCreate: true,
          publicUpdate: false,
          publicDelete: false,
        },
        metadata: {
          ...(createCollection.json?.data?.collection?.metadata || {}),
          visitorWritePolicy: {
            createFieldMode: 'selected',
            allowedCreateFields: ['title', 'summary', 'category', 'labels'],
          },
        },
      }),
    });
    assert(enablePublicCreate.response.status === 200, `${enablePublicCreate.url} expected 200, got ${enablePublicCreate.response.status}`);
    assert(enablePublicCreate.json?.data?.collection?.permissions?.publicCreate === true, `${enablePublicCreate.url} expected publicCreate true`);
    assert(enablePublicCreate.json?.data?.collection?.metadata?.visitorWritePolicy?.createFieldMode === 'selected', `${enablePublicCreate.url} expected selected visitor write policy`);
    assert(enablePublicCreate.json?.data?.collection?.metadata?.visitorWritePolicy?.allowedCreateFields?.includes('category'), `${enablePublicCreate.url} expected visitor writable category field`);
    const collectionUpdateAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=collection&entityId=${createdCollectionId}&action=update&requestId=${enablePublicCreate.json.requestId}`);
    assert(collectionUpdateAudit.response.status === 200, `${collectionUpdateAudit.url} expected collection update audit readback`);
    assert(collectionUpdateAudit.json?.data?.logs?.[0]?.metadata?.changedFields?.includes('permissions'), `${collectionUpdateAudit.url} missing collection update changedFields metadata`);
    assert(collectionUpdateAudit.json?.data?.logs?.[0]?.before?.publicCreate === false, `${collectionUpdateAudit.url} missing collection update before publicCreate snapshot`);
    assert(collectionUpdateAudit.json?.data?.logs?.[0]?.after?.publicCreate === true, `${collectionUpdateAudit.url} missing collection update after publicCreate snapshot`);

    const publicCreatedRecordSlug = `${collectionRecordSlug}-public-created`;
    const publicCreateRecord = await request(`/api/sites/${createdSiteId}/collections/${createdCollectionId}/records`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        slug: publicCreatedRecordSlug,
        values: {
          title: 'Public Created Record',
          summary: 'Visitor-submitted structured content',
          rank: 5,
          category: 'Standard',
          labels: ['Launch'],
        },
      }),
    });
    assert(publicCreateRecord.response.status === 201, `${publicCreateRecord.url} expected 201, got ${publicCreateRecord.response.status}`);
    assertBackyContract(publicCreateRecord, 'private');
    assert(publicCreateRecord.json?.success === true, `${publicCreateRecord.url} expected success envelope`);
    assert(publicCreateRecord.json?.data?.record?.status === 'draft', `${publicCreateRecord.url} expected public-created records to default to draft`);
    assert(publicCreateRecord.json?.data?.record?.values?.category === 'Standard', `${publicCreateRecord.url} expected validated option value`);
    assert(publicCreateRecord.json?.data?.record?.values?.rank === undefined, `${publicCreateRecord.url} expected visitor policy to ignore disallowed rank field`);
    assert(publicCreateRecord.json?.data?.visitorWritePolicy?.ignoredFields?.includes('rank'), `${publicCreateRecord.url} expected ignored rank field in visitor policy response`);
    const publicCreatedRecordId = publicCreateRecord.json?.data?.record?.id;
    assert(publicCreatedRecordId, `${publicCreateRecord.url} missing public created record id`);

    const hiddenPublicCreatedRecord = await request(`/api/sites/${createdSiteId}/collections/${createdCollectionId}/records?slug=${publicCreatedRecordSlug}`);
    assert(hiddenPublicCreatedRecord.response.status === 404, `${hiddenPublicCreatedRecord.url} expected draft public-created record to stay hidden`);

    const blockedPublicUpdate = await request(`/api/sites/${createdSiteId}/collections/${createdCollectionId}/records/${publicCreatedRecordId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        values: {
          summary: 'Blocked public update',
        },
      }),
    });
    assert(blockedPublicUpdate.response.status === 403, `${blockedPublicUpdate.url} expected public update to be disabled`);
    assertBackyContract(blockedPublicUpdate, 'error');
    assert(blockedPublicUpdate.json?.error?.code === 'PUBLIC_UPDATE_DISABLED', `${blockedPublicUpdate.url} expected PUBLIC_UPDATE_DISABLED`);

    const publicWriteToken = `public-write-${unique}`;
    const enablePublicMutations = await request(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        permissions: {
          publicRead: true,
          publicCreate: true,
          publicUpdate: true,
          publicDelete: true,
        },
        metadata: {
          ...(enablePublicCreate.json?.data?.collection?.metadata || {}),
          visitorWritePolicy: {
            ...(enablePublicCreate.json?.data?.collection?.metadata?.visitorWritePolicy || {}),
            publicWriteToken,
            updateFieldMode: 'selected',
            allowedUpdateFields: ['summary', 'category'],
          },
        },
      }),
    });
    assert(enablePublicMutations.response.status === 200, `${enablePublicMutations.url} expected public mutation policy update`);
    assert(enablePublicMutations.json?.data?.collection?.permissions?.publicUpdate === true, `${enablePublicMutations.url} expected publicUpdate true`);
    assert(enablePublicMutations.json?.data?.collection?.permissions?.publicDelete === true, `${enablePublicMutations.url} expected publicDelete true`);
    const publicMutationCollectionDetail = await request(`/api/sites/${createdSiteId}/collections/${createdCollectionId}`);
    assert(publicMutationCollectionDetail.response.status === 200, `${publicMutationCollectionDetail.url} expected public mutation collection detail`);
    assert(publicMutationCollectionDetail.json?.data?.collection?.metadata?.visitorWritePolicy?.publicWriteToken === undefined, `${publicMutationCollectionDetail.url} leaked public write token`);
    assert(publicMutationCollectionDetail.json?.data?.collection?.metadata?.visitorWritePolicy?.updateToken === undefined, `${publicMutationCollectionDetail.url} leaked update token`);
    assert(publicMutationCollectionDetail.json?.data?.collection?.metadata?.visitorWritePolicy?.deleteToken === undefined, `${publicMutationCollectionDetail.url} leaked delete token`);

    const unauthPublicUpdate = await request(`/api/sites/${createdSiteId}/collections/${createdCollectionId}/records/${publicCreatedRecordId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        values: {
          summary: 'Unauthed public update',
        },
      }),
    });
    assert(unauthPublicUpdate.response.status === 403, `${unauthPublicUpdate.url} expected update token requirement`);
    assertBackyContract(unauthPublicUpdate, 'error');
    assert(unauthPublicUpdate.json?.error?.code === 'PUBLIC_UPDATE_AUTH_REQUIRED', `${unauthPublicUpdate.url} expected PUBLIC_UPDATE_AUTH_REQUIRED`);

    const publicUpdateRecord = await request(`/api/sites/${createdSiteId}/collections/${createdCollectionId}/records/${publicCreatedRecordId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-backy-public-write-token': publicWriteToken,
      },
      body: JSON.stringify({
        values: {
          summary: 'Visitor updated structured content',
          category: 'Featured',
          rank: 99,
        },
      }),
    });
    assert(publicUpdateRecord.response.status === 200, `${publicUpdateRecord.url} expected public update success`);
    assertBackyContract(publicUpdateRecord, 'private');
    assert(publicUpdateRecord.json?.data?.record?.values?.summary === 'Visitor updated structured content', `${publicUpdateRecord.url} expected public summary update`);
    assert(publicUpdateRecord.json?.data?.record?.values?.category === 'Featured', `${publicUpdateRecord.url} expected public category update`);
    assert(publicUpdateRecord.json?.data?.record?.values?.rank === undefined, `${publicUpdateRecord.url} expected public update field policy to ignore rank`);
    assert(publicUpdateRecord.json?.data?.visitorWritePolicy?.ignoredFields?.includes('rank'), `${publicUpdateRecord.url} expected ignored rank in update policy response`);
    assert(publicUpdateRecord.json?.data?.visitorWritePolicy?.allowedUpdateFields?.includes('summary'), `${publicUpdateRecord.url} expected allowed update fields in response`);

    const unauthPublicDelete = await request(`/api/sites/${createdSiteId}/collections/${createdCollectionId}/records/${publicCreatedRecordId}`, {
      method: 'DELETE',
    });
    assert(unauthPublicDelete.response.status === 403, `${unauthPublicDelete.url} expected delete token requirement`);
    assertBackyContract(unauthPublicDelete, 'error');
    assert(unauthPublicDelete.json?.error?.code === 'PUBLIC_DELETE_AUTH_REQUIRED', `${unauthPublicDelete.url} expected PUBLIC_DELETE_AUTH_REQUIRED`);

    const publicDeleteRecord = await request(`/api/sites/${createdSiteId}/collections/${createdCollectionId}/records/${publicCreatedRecordId}`, {
      method: 'DELETE',
      headers: {
        'x-backy-public-write-token': publicWriteToken,
      },
    });
    assert(publicDeleteRecord.response.status === 200, `${publicDeleteRecord.url} expected public delete success`);
    assertBackyContract(publicDeleteRecord, 'private');
    assert(publicDeleteRecord.json?.data?.deleted === true, `${publicDeleteRecord.url} expected deleted true`);
    assert(publicDeleteRecord.json?.data?.recordId === publicCreatedRecordId, `${publicDeleteRecord.url} expected deleted public record id`);
    const deletedPublicRecord = await request(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}/records?slug=${publicCreatedRecordSlug}`);
    assert(!deletedPublicRecord.json?.data?.records?.some((record) => record.id === publicCreatedRecordId), `${deletedPublicRecord.url} expected public-deleted record to be removed`);

    let formWritePageId = null;
    let manifestReusableSectionId = null;
    let capturedTemplateFormId = null;
    let capturedTemplateSectionId = null;
    try {
      const unauthAdminForms = await fetch(`${baseUrl}/api/admin/sites/${createdSiteId}/forms`);
      const unauthAdminFormsJson = await unauthAdminForms.json().catch(() => ({}));
      assert(unauthAdminForms.status === 401, `Forms admin API should reject missing auth, got ${unauthAdminForms.status}`);
      assert(unauthAdminFormsJson?.success === false && unauthAdminFormsJson?.error?.code === 'UNAUTHORIZED', `Forms admin API missing auth envelope: ${JSON.stringify(unauthAdminFormsJson).slice(0, 500)}`);

      const createFormWritePage = await request(`/api/admin/sites/${createdSiteId}/pages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Collection Form Write Page',
          slug: `${pageSlug}-form-write`,
          status: 'published',
          meta: {
            title: 'Collection Form Write Page',
            description: 'Public collection write form page.',
            jsonLd: [
              {
                '@context': 'https://schema.org',
                '@type': 'WebPage',
                name: 'Collection Form Write Page',
              },
            ],
          },
          content: {
            elements: [
              {
                id: 'contract-form-write',
                type: 'form',
                x: 80,
                y: 80,
                width: 520,
                height: 360,
                props: {
                  formId: 'contract-form-write',
                  formTitle: 'Collection form write',
                  formActive: true,
                  moderationMode: 'auto-approve',
                  enableHoneypot: false,
                  contactShareEnabled: true,
                  contactShareNameField: 'title',
                  contactShareNotesField: 'message',
                  collectionWriteEnabled: true,
                  collectionWriteCollectionId: createdCollectionId,
                  collectionWriteSlugField: 'title',
                  collectionWriteFieldMap: {
                    title: 'title',
                    message: 'summary',
                    category: 'category',
                  },
                },
                children: [
                  {
                    id: 'contract-form-write-title',
                    type: 'input',
                    x: 0,
                    y: 0,
                    width: 420,
                    height: 44,
                    props: {
                      name: 'title',
                      placeholder: 'Title',
                      required: true,
                    },
                  },
                  {
                    id: 'contract-form-write-message',
                    type: 'textarea',
                    x: 0,
                    y: 64,
                    width: 420,
                    height: 120,
                    props: {
                      name: 'message',
                      placeholder: 'Message',
                    },
                  },
                  {
                    id: 'contract-form-write-category',
                    type: 'select',
                    x: 0,
                    y: 204,
                    width: 260,
                    height: 44,
                    props: {
                      name: 'category',
                      options: ['Featured', 'Standard'],
                    },
                  },
                ],
              },
            ],
            canvasSize: { width: 1200, height: 760 },
          },
        }),
      });
      assert(createFormWritePage.response.status === 201, `${createFormWritePage.url} expected 201, got ${createFormWritePage.response.status}`);
      formWritePageId = createFormWritePage.json?.data?.page?.id;
      assert(formWritePageId, `${createFormWritePage.url} missing created page id`);

      const createAuthenticatedForm = await request(`/api/admin/sites/${createdSiteId}/forms`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          pageId: formWritePageId,
          name: `Authenticated Contract Form ${unique}`,
          title: 'Authenticated Contract Form',
          audience: 'authenticated',
          isActive: true,
          fields: [
            { id: 'authenticated-name', key: 'name', label: 'Name', type: 'text', required: true },
          ],
        }),
      });
      assert(createAuthenticatedForm.response.status === 201, `${createAuthenticatedForm.url} expected authenticated form 201`);
      const authenticatedFormId = createAuthenticatedForm.json?.data?.form?.id;
      assert(authenticatedFormId, `${createAuthenticatedForm.url} missing authenticated form id`);

      const createAdminOnlyForm = await request(`/api/admin/sites/${createdSiteId}/forms`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          pageId: formWritePageId,
          name: `Admin Only Contract Form ${unique}`,
          title: 'Admin Only Contract Form',
          audience: 'adminOnly',
          isActive: true,
          fields: [
            { id: 'admin-only-name', key: 'name', label: 'Name', type: 'text', required: true },
          ],
        }),
      });
      assert(createAdminOnlyForm.response.status === 201, `${createAdminOnlyForm.url} expected admin-only form 201`);
      const adminOnlyFormId = createAdminOnlyForm.json?.data?.form?.id;
      assert(adminOnlyFormId, `${createAdminOnlyForm.url} missing admin-only form id`);

      const listedForms = await request(`/api/sites/${createdSiteId}/forms?pageId=${formWritePageId}`);
      assert(listedForms.response.status === 200, `${listedForms.url} expected 200, got ${listedForms.response.status}`);
      assert(listedForms.response.headers.get('x-backy-cache-scope') === 'discovery', `${listedForms.url} missing forms cache scope`);
      assert(listedForms.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${listedForms.url} missing forms contract version`);
      assert(listedForms.response.headers.get('x-backy-site-id') === createdSiteId, `${listedForms.url} missing forms site id header`);
      assert(listedForms.response.headers.get('x-backy-cache-revision'), `${listedForms.url} missing forms cache revision`);
      const listedFormsEtag = listedForms.response.headers.get('etag');
      assert(listedFormsEtag?.startsWith('"backy-'), `${listedForms.url} missing forms etag`);
      const revalidatedListedForms = await request(`/api/sites/${createdSiteId}/forms?pageId=${formWritePageId}`, {
        headers: { 'if-none-match': listedFormsEtag },
      });
      assert(revalidatedListedForms.response.status === 304, `${revalidatedListedForms.url} expected forms 304, got ${revalidatedListedForms.response.status}`);
      assert(revalidatedListedForms.response.headers.get('etag') === listedFormsEtag, `${revalidatedListedForms.url} expected matching forms etag`);
      assert(listedForms.json?.success === true, `${listedForms.url} expected success envelope`);
      assert(listedForms.json?.data?.forms?.some((form) => form.id === 'contract-form-write'), `${listedForms.url} missing form in data envelope`);
      assert(listedForms.json?.forms?.some((form) => form.id === 'contract-form-write'), `${listedForms.url} missing legacy forms list`);
      assert(!listedForms.json?.data?.forms?.some((form) => form.id === authenticatedFormId), `${listedForms.url} should hide authenticated forms from anonymous discovery`);
      assert(!listedForms.json?.data?.forms?.some((form) => form.id === adminOnlyFormId), `${listedForms.url} should hide admin-only forms from anonymous discovery`);

      const formDefinition = await request(`/api/sites/${createdSiteId}/forms/contract-form-write/definition`);
      assert(formDefinition.response.status === 200, `${formDefinition.url} expected 200, got ${formDefinition.response.status}`);
      assert(formDefinition.response.headers.get('x-backy-cache-scope') === 'discovery', `${formDefinition.url} missing form definition cache scope`);
      assert(formDefinition.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${formDefinition.url} missing form definition contract version`);
      assert(formDefinition.response.headers.get('x-backy-schema-version') === 'backy.form-definition.v1', `${formDefinition.url} missing form definition schema version`);
      assert(formDefinition.response.headers.get('x-backy-site-id') === createdSiteId, `${formDefinition.url} missing form definition site id header`);
      const formDefinitionEtag = formDefinition.response.headers.get('etag');
      assert(formDefinitionEtag?.startsWith('"backy-'), `${formDefinition.url} missing form definition etag`);
      const revalidatedFormDefinition = await request(`/api/sites/${createdSiteId}/forms/contract-form-write/definition`, {
        headers: { 'if-none-match': formDefinitionEtag },
      });
      assert(revalidatedFormDefinition.response.status === 304, `${revalidatedFormDefinition.url} expected form definition 304, got ${revalidatedFormDefinition.response.status}`);
      assert(revalidatedFormDefinition.response.headers.get('etag') === formDefinitionEtag, `${revalidatedFormDefinition.url} expected matching form definition etag`);
      assert(formDefinition.json?.data?.schemaVersion === 'backy.form-definition.v1', `${formDefinition.url} missing form definition schema payload`);
      assert(formDefinition.json?.data?.form?.id === 'contract-form-write', `${formDefinition.url} missing form definition in data envelope`);
      assert(formDefinition.json?.data?.submitUrl === `/api/sites/${createdSiteId}/forms/contract-form-write/submissions`, `${formDefinition.url} missing form submit URL`);
      assert(formDefinition.json?.form?.id === 'contract-form-write', `${formDefinition.url} missing legacy form definition`);

      const formDetailBeforeSubmission = await request(`/api/sites/${createdSiteId}/forms/contract-form-write`);
      assert(formDetailBeforeSubmission.response.status === 200, `${formDetailBeforeSubmission.url} expected 200, got ${formDetailBeforeSubmission.response.status}`);
      assert(formDetailBeforeSubmission.response.headers.get('x-backy-cache-scope') === 'private', `${formDetailBeforeSubmission.url} expected private form detail cache scope`);
      assert(formDetailBeforeSubmission.response.headers.get('cache-control') === 'no-store', `${formDetailBeforeSubmission.url} expected no-store form detail cache`);
      assert(formDetailBeforeSubmission.json?.success === true, `${formDetailBeforeSubmission.url} expected success envelope`);
      assert(formDetailBeforeSubmission.json?.data?.form?.id === 'contract-form-write', `${formDetailBeforeSubmission.url} missing form in data envelope`);
      assert(formDetailBeforeSubmission.json?.form?.id === 'contract-form-write', `${formDetailBeforeSubmission.url} missing legacy form`);

      const unauthAuthenticatedDefinition = await request(`/api/sites/${createdSiteId}/forms/${authenticatedFormId}/definition`);
      assert(unauthAuthenticatedDefinition.response.status === 401, `${unauthAuthenticatedDefinition.url} expected authenticated form definition 401`);
      assertBackyContract(unauthAuthenticatedDefinition, 'error');
      assert(unauthAuthenticatedDefinition.json?.error?.code === 'FORM_AUTHENTICATION_REQUIRED', `${unauthAuthenticatedDefinition.url} expected FORM_AUTHENTICATION_REQUIRED`);

      const unauthAdminOnlyDetail = await request(`/api/sites/${createdSiteId}/forms/${adminOnlyFormId}`);
      assert(unauthAdminOnlyDetail.response.status === 401, `${unauthAdminOnlyDetail.url} expected admin-only form detail 401`);
      assertBackyContract(unauthAdminOnlyDetail, 'error');
      assert(unauthAdminOnlyDetail.json?.error?.code === 'FORM_ADMIN_ONLY', `${unauthAdminOnlyDetail.url} expected FORM_ADMIN_ONLY`);

      const unauthAdminOnlySubmission = await request(`/api/sites/${createdSiteId}/forms/${adminOnlyFormId}/submissions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          values: { name: 'Blocked Visitor' },
          requestId: 'contract-admin-only-blocked',
          rateLimitBypass: true,
        }),
      });
      assert(unauthAdminOnlySubmission.response.status === 401, `${unauthAdminOnlySubmission.url} expected admin-only submission 401`);
      assertBackyContract(unauthAdminOnlySubmission, 'error');
      assert(unauthAdminOnlySubmission.json?.error?.code === 'FORM_ADMIN_ONLY', `${unauthAdminOnlySubmission.url} expected FORM_ADMIN_ONLY submission block`);

      const adminAuthenticatedDefinition = await request(`/api/sites/${createdSiteId}/forms/${authenticatedFormId}/definition`, {
        headers: withAdminAuth(),
      });
      assert(adminAuthenticatedDefinition.response.status === 200, `${adminAuthenticatedDefinition.url} expected admin-authenticated form definition 200`);
      assertBackyContract(adminAuthenticatedDefinition, 'private');
      assert(adminAuthenticatedDefinition.json?.data?.form?.id === authenticatedFormId, `${adminAuthenticatedDefinition.url} missing authenticated form definition`);

      const capturedFormTemplate = await request(`/api/admin/sites/${createdSiteId}/frontend-design`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'capture-content-template',
          resourceType: 'form',
          resourceId: 'contract-form-write',
          templateId: 'captured-form-template',
          templateName: 'Captured Contract Form Template',
        }),
      });
      assert(capturedFormTemplate.response.status === 200, `${capturedFormTemplate.url} expected form template capture 200`);
      const capturedFormTemplateEntry = capturedFormTemplate.json?.data?.frontendDesign?.templates?.find((template) => template.id === 'captured-form-template');
      assert(capturedFormTemplateEntry?.type === 'form', `${capturedFormTemplate.url} missing captured form template`);
      assert(capturedFormTemplateEntry?.content?.fields?.some((field) => field.key === 'title'), `${capturedFormTemplate.url} did not preserve form fields`);
      assert(capturedFormTemplateEntry?.bindingHints?.some((hint) => hint.binding === 'form.fields.title'), `${capturedFormTemplate.url} missing captured form binding hints`);

      const createFormFromTemplate = await request(`/api/admin/sites/${createdSiteId}/forms`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          frontendDesignTemplateId: 'captured-form-template',
          name: `Captured Template Form ${unique}`,
          title: 'Captured Template Form',
        }),
      });
      assert(createFormFromTemplate.response.status === 201, `${createFormFromTemplate.url} expected form from captured template`);
      capturedTemplateFormId = createFormFromTemplate.json?.data?.form?.id;
      assert(capturedTemplateFormId, `${createFormFromTemplate.url} missing captured template form id`);
      assert(createFormFromTemplate.json?.data?.form?.settings?.frontendDesignTemplateId === 'captured-form-template', `${createFormFromTemplate.url} missing captured form provenance`);
      assert(createFormFromTemplate.json?.data?.form?.fields?.some((field) => field.key === 'title'), `${createFormFromTemplate.url} did not seed captured form fields`);

      const publicCapturedTemplateFormDefinition = await request(`/api/sites/${createdSiteId}/forms/${capturedTemplateFormId}/definition`);
      assert(publicCapturedTemplateFormDefinition.response.status === 200, `${publicCapturedTemplateFormDefinition.url} expected captured form definition 200`);
      assert(publicCapturedTemplateFormDefinition.json?.data?.form?.frontendDesign?.templateId === 'captured-form-template', `${publicCapturedTemplateFormDefinition.url} missing captured form frontend design`);
      assert(publicCapturedTemplateFormDefinition.json?.data?.form?.frontendDesign?.bindingHints?.some((hint) => hint.binding === 'form.fields.title'), `${publicCapturedTemplateFormDefinition.url} missing captured form binding hints`);

      const formWriteSubmission = await request(`/api/sites/${createdSiteId}/forms/contract-form-write/submissions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          values: {
            title: 'Form Write Record',
            message: 'Form submissions can become draft collection records.',
            category: 'Featured',
          },
          pageId: formWritePageId,
          requestId: 'contract-form-write',
          rateLimitBypass: true,
        }),
      });
      assert(formWriteSubmission.response.status === 201, `${formWriteSubmission.url} expected 201, got ${formWriteSubmission.response.status}`);
      assertBackyContract(formWriteSubmission, 'private');
      assert(formWriteSubmission.json?.success === true, `${formWriteSubmission.url} expected success envelope`);
      assert(formWriteSubmission.json?.requestId === 'contract-form-write', `${formWriteSubmission.url} expected request id`);
      assert(formWriteSubmission.json?.data?.submission?.id, `${formWriteSubmission.url} missing submission in data envelope`);
      assert(formWriteSubmission.json?.data?.collectionRecord?.status === 'draft', `${formWriteSubmission.url} expected draft collection record in data envelope`);
      assert(formWriteSubmission.json?.data?.contact?.name === 'Form Write Record', `${formWriteSubmission.url} expected contact in data envelope`);
      assert(formWriteSubmission.json?.collectionRecord?.status === 'draft', `${formWriteSubmission.url} expected draft collection record`);
      assert(formWriteSubmission.json?.collectionRecord?.slug === 'form-write-record', `${formWriteSubmission.url} expected slug from title`);
      assert(formWriteSubmission.json?.collectionRecord?.values?.summary === 'Form submissions can become draft collection records.', `${formWriteSubmission.url} expected mapped summary value`);
      assert(formWriteSubmission.json?.collectionRecordErrors?.length === 0, `${formWriteSubmission.url} expected no collection record errors`);

      const formWrittenRecordSlug = formWriteSubmission.json.collectionRecord.slug;
      const formWriteSubmissionId = formWriteSubmission.json.data.submission.id;
      const formWriteContactId = formWriteSubmission.json.data.contact.id;
      const hiddenFormWrittenRecord = await request(`/api/sites/${createdSiteId}/collections/${createdCollectionId}/records?slug=${formWrittenRecordSlug}`);
      assert(hiddenFormWrittenRecord.response.status === 404, `${hiddenFormWrittenRecord.url} expected draft form-written record to stay hidden`);

      const adminFormWrittenRecord = await request(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}/records?slug=${formWrittenRecordSlug}`);
      assert(adminFormWrittenRecord.response.status === 200, `${adminFormWrittenRecord.url} expected 200, got ${adminFormWrittenRecord.response.status}`);
      assert(adminFormWrittenRecord.json?.data?.records?.[0]?.status === 'draft', `${adminFormWrittenRecord.url} missing draft form-written record`);

      const listedFormWriteSubmissions = await request(`/api/sites/${createdSiteId}/forms/contract-form-write/submissions?status=approved&requestId=contract-form-write`, {
        headers: withAdminAuth(),
      });
      assert(listedFormWriteSubmissions.response.status === 200, `${listedFormWriteSubmissions.url} expected 200, got ${listedFormWriteSubmissions.response.status}`);
      assertBackyContract(listedFormWriteSubmissions, 'private');
      assert(listedFormWriteSubmissions.json?.success === true, `${listedFormWriteSubmissions.url} expected success envelope`);
      assert(listedFormWriteSubmissions.json?.data?.form?.id === 'contract-form-write', `${listedFormWriteSubmissions.url} missing form in data envelope`);
      assert(listedFormWriteSubmissions.json?.data?.submissions?.data?.[0]?.id === formWriteSubmissionId, `${listedFormWriteSubmissions.url} missing submission in data envelope`);
      const listedFormWriteSubmission = listedFormWriteSubmissions.json?.submissions?.data?.[0];
      assert(listedFormWriteSubmission?.collectionRecord?.collectionId === createdCollectionId, `${listedFormWriteSubmissions.url} missing linked collection id`);
      assert(listedFormWriteSubmission?.collectionRecord?.recordSlug === formWrittenRecordSlug, `${listedFormWriteSubmissions.url} missing linked collection record slug`);
      assert(listedFormWriteSubmission?.collectionRecordErrors?.length === 0, `${listedFormWriteSubmissions.url} expected no linked collection errors`);

      const fetchedFormWriteSubmission = await request(`/api/sites/${createdSiteId}/forms/contract-form-write/submissions/${formWriteSubmissionId}`, {
        headers: withAdminAuth(),
      });
      assert(fetchedFormWriteSubmission.response.status === 200, `${fetchedFormWriteSubmission.url} expected 200, got ${fetchedFormWriteSubmission.response.status}`);
      assertBackyContract(fetchedFormWriteSubmission, 'private');
      assert(fetchedFormWriteSubmission.json?.success === true, `${fetchedFormWriteSubmission.url} expected success envelope`);
      assert(fetchedFormWriteSubmission.json?.data?.submission?.id === formWriteSubmissionId, `${fetchedFormWriteSubmission.url} missing submission in data envelope`);
      assert(fetchedFormWriteSubmission.json?.submission?.id === formWriteSubmissionId, `${fetchedFormWriteSubmission.url} missing legacy submission`);

      const reviewedFormWriteSubmission = await request(`/api/sites/${createdSiteId}/forms/contract-form-write/submissions/${formWriteSubmissionId}`, {
        method: 'PATCH',
        headers: withAdminAuth({
          'content-type': 'application/json',
        }),
        body: JSON.stringify({
          status: 'approved',
          reviewedBy: 'contract-smoke',
        }),
      });
      assert(reviewedFormWriteSubmission.response.status === 200, `${reviewedFormWriteSubmission.url} expected 200, got ${reviewedFormWriteSubmission.response.status}`);
      assertBackyContract(reviewedFormWriteSubmission, 'private');
      assert(reviewedFormWriteSubmission.json?.success === true, `${reviewedFormWriteSubmission.url} expected success envelope`);
      assert(reviewedFormWriteSubmission.json?.data?.submission?.status === 'approved', `${reviewedFormWriteSubmission.url} missing updated submission in data envelope`);

      const listedFormWriteContacts = await request(`/api/sites/${createdSiteId}/forms/contract-form-write/contacts?requestId=contract-form-write`, {
        headers: withAdminAuth(),
      });
      assert(listedFormWriteContacts.response.status === 200, `${listedFormWriteContacts.url} expected 200, got ${listedFormWriteContacts.response.status}`);
      assertBackyContract(listedFormWriteContacts, 'private');
      assert(listedFormWriteContacts.json?.success === true, `${listedFormWriteContacts.url} expected success envelope`);
      assert(listedFormWriteContacts.json?.data?.contacts?.[0]?.id === formWriteContactId, `${listedFormWriteContacts.url} missing contact in data envelope`);
      assert(listedFormWriteContacts.json?.contacts?.[0]?.id === formWriteContactId, `${listedFormWriteContacts.url} missing legacy contact`);

      const updatedFormWriteContact = await request(`/api/sites/${createdSiteId}/forms/contract-form-write/contacts/${formWriteContactId}`, {
        method: 'PATCH',
        headers: withAdminAuth({
          'content-type': 'application/json',
        }),
        body: JSON.stringify({ status: 'qualified' }),
      });
      assert(updatedFormWriteContact.response.status === 200, `${updatedFormWriteContact.url} expected 200, got ${updatedFormWriteContact.response.status}`);
      assertBackyContract(updatedFormWriteContact, 'private');
      assert(updatedFormWriteContact.json?.success === true, `${updatedFormWriteContact.url} expected success envelope`);
      assert(updatedFormWriteContact.json?.data?.contact?.status === 'qualified', `${updatedFormWriteContact.url} missing updated contact in data envelope`);
      assert(updatedFormWriteContact.json?.contact?.status === 'qualified', `${updatedFormWriteContact.url} missing legacy contact`);

      const createReusableSection = await request(`/api/admin/sites/${createdSiteId}/reusable-sections`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Frontend Contract Reusable Section',
          slug: `frontend-contract-section-${unique}`,
          description: 'Temporary reusable section for frontend contract smoke',
          category: 'layout',
          tags: ['frontend-contract', 'template'],
          metadata: {
            frontendDesignTemplateId: 'contract-section-template',
            frontendDesignTemplateName: 'Contract Section Template',
            frontendDesignRoutePattern: '/contract-section',
            frontendDesignSource: {
              type: 'custom-frontend',
              label: 'Contract smoke frontend',
              repository: 'example/backy-contract-smoke',
            },
            frontendDesignChrome: {
              header: { component: 'ContractHeader', source: 'site.navigation.primary' },
              footer: { component: 'ContractFooter', source: 'site.navigation.footer' },
            },
            frontendDesignTokens: {
              colors: { primary: '#0f766e', text: '#111827' },
              fonts: { heading: 'Inter', body: 'Inter' },
            },
            frontendDesignCustomCss: ':root { --contract-section-primary: #0f766e; }',
            frontendDesignBindingHints: [
              { role: 'section.root', binding: 'sections.contract.root' },
              { role: 'section.heading', binding: 'sections.contract.heading' },
            ],
          },
          content: {
            canvasSize: { width: 960, height: 320 },
            elements: [
              {
                id: 'frontend-contract-section-root',
                type: 'section',
                x: 0,
                y: 0,
                width: 960,
                height: 320,
                zIndex: 1,
                props: { backgroundColor: '#f8fafc' },
                children: [
                  {
                    id: 'frontend-contract-section-heading',
                    type: 'heading',
                    x: 64,
                    y: 72,
                    width: 620,
                    height: 80,
                    zIndex: 1,
                    props: { content: 'Frontend reusable section', level: 'h2' },
                  },
                ],
              },
            ],
          },
        }),
      });
      assert(createReusableSection.response.status === 201, `${createReusableSection.url} expected 201, got ${createReusableSection.response.status}`);
      manifestReusableSectionId = createReusableSection.json?.data?.section?.id;
      assert(manifestReusableSectionId, `${createReusableSection.url} missing reusable section id`);

      const publicReusableSections = await request(`/api/sites/${createdSiteId}/reusable-sections?tag=frontend-contract&category=layout`);
      assert(publicReusableSections.response.status === 200, `${publicReusableSections.url} expected 200, got ${publicReusableSections.response.status}`);
      assert(publicReusableSections.response.headers.get('x-backy-cache-scope') === 'discovery', `${publicReusableSections.url} missing discovery cache scope`);
      assert(publicReusableSections.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${publicReusableSections.url} missing contract version header`);
      assert(publicReusableSections.response.headers.get('x-backy-site-id') === createdSiteId, `${publicReusableSections.url} missing site id header`);
      assert(publicReusableSections.response.headers.get('x-backy-cache-revision'), `${publicReusableSections.url} missing reusable sections cache revision`);
      const reusableSectionsEtag = publicReusableSections.response.headers.get('etag');
      assert(reusableSectionsEtag?.startsWith('"backy-'), `${publicReusableSections.url} missing reusable sections etag`);
      const revalidatedReusableSections = await request(`/api/sites/${createdSiteId}/reusable-sections?tag=frontend-contract&category=layout`, {
        headers: { 'if-none-match': reusableSectionsEtag },
      });
      assert(revalidatedReusableSections.response.status === 304, `${revalidatedReusableSections.url} expected reusable sections 304, got ${revalidatedReusableSections.response.status}`);
      assert(revalidatedReusableSections.response.headers.get('etag') === reusableSectionsEtag, `${revalidatedReusableSections.url} expected matching reusable sections etag`);
      assert(publicReusableSections.json?.success === true, `${publicReusableSections.url} expected success envelope`);
      assert(publicReusableSections.json?.data?.sections?.some((section) => section.id === manifestReusableSectionId), `${publicReusableSections.url} missing reusable section in data envelope`);
      assert(publicReusableSections.json?.sections?.some((section) => section.id === manifestReusableSectionId), `${publicReusableSections.url} missing legacy reusable sections`);
      const listedReusableSection = publicReusableSections.json?.data?.sections?.find((section) => section.id === manifestReusableSectionId);
      assert(listedReusableSection?.metadata?.frontendDesignTemplateId === 'contract-section-template', `${publicReusableSections.url} missing reusable section frontend metadata`);
      assert(listedReusableSection?.frontendDesign?.templateId === 'contract-section-template', `${publicReusableSections.url} missing normalized reusable section frontend design`);
      assert(listedReusableSection?.frontendDesign?.source?.label === 'Contract smoke frontend', `${publicReusableSections.url} missing normalized frontend source`);
      assert(listedReusableSection?.frontendDesign?.chrome?.header?.component === 'ContractHeader', `${publicReusableSections.url} missing normalized frontend chrome`);
      assert(listedReusableSection?.frontendDesign?.tokens?.fonts?.heading === 'Inter', `${publicReusableSections.url} missing normalized frontend tokens`);
      assert(Array.isArray(listedReusableSection?.frontendDesign?.bindingHints) && listedReusableSection.frontendDesign.bindingHints.length === 2, `${publicReusableSections.url} missing normalized frontend binding hints`);

      const publicReusableSection = await request(`/api/sites/${createdSiteId}/reusable-sections/${manifestReusableSectionId}`);
      assert(publicReusableSection.response.status === 200, `${publicReusableSection.url} expected 200, got ${publicReusableSection.response.status}`);
      assert(publicReusableSection.response.headers.get('x-backy-cache-scope') === 'discovery', `${publicReusableSection.url} missing discovery cache scope`);
      assert(publicReusableSection.response.headers.get('x-backy-cache-revision'), `${publicReusableSection.url} missing reusable section cache revision`);
      assert(publicReusableSection.response.headers.get('etag')?.startsWith('"backy-'), `${publicReusableSection.url} missing reusable section etag`);
      assert(publicReusableSection.json?.data?.section?.content?.elements?.[0]?.id === 'frontend-contract-section-root', `${publicReusableSection.url} missing reusable section content`);
      assert(publicReusableSection.json?.data?.section?.metadata?.frontendDesignTemplateName === 'Contract Section Template', `${publicReusableSection.url} missing reusable section detail frontend metadata`);
      assert(publicReusableSection.json?.data?.section?.frontendDesign?.routePattern === '/contract-section', `${publicReusableSection.url} missing reusable section detail normalized frontend route`);

      const capturedSectionTemplate = await request(`/api/admin/sites/${createdSiteId}/frontend-design`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'capture-content-template',
          resourceType: 'section',
          resourceId: manifestReusableSectionId,
          templateId: 'captured-section-template',
          templateName: 'Captured Contract Section Template',
        }),
      });
      assert(capturedSectionTemplate.response.status === 200, `${capturedSectionTemplate.url} expected section template capture 200`);
      const capturedSectionTemplateEntry = capturedSectionTemplate.json?.data?.frontendDesign?.templates?.find((template) => template.id === 'captured-section-template');
      assert(capturedSectionTemplateEntry?.type === 'section', `${capturedSectionTemplate.url} missing captured section template`);
      assert(capturedSectionTemplateEntry?.content?.elements?.[0]?.id === 'frontend-contract-section-root', `${capturedSectionTemplate.url} did not preserve section canvas content`);
      assert(capturedSectionTemplateEntry?.routePattern === '/contract-section', `${capturedSectionTemplate.url} did not preserve section route pattern`);

      const createSectionFromTemplate = await request(`/api/admin/sites/${createdSiteId}/reusable-sections`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          frontendDesignTemplateId: 'captured-section-template',
          name: 'Captured Template Section',
          slug: `captured-template-section-${unique}`,
        }),
      });
      assert(createSectionFromTemplate.response.status === 201, `${createSectionFromTemplate.url} expected section from captured template`);
      capturedTemplateSectionId = createSectionFromTemplate.json?.data?.section?.id;
      assert(capturedTemplateSectionId, `${createSectionFromTemplate.url} missing captured template section id`);
      assert(createSectionFromTemplate.json?.data?.section?.metadata?.frontendDesignTemplateId === 'captured-section-template', `${createSectionFromTemplate.url} missing captured section provenance`);
      assert(createSectionFromTemplate.json?.data?.section?.content?.elements?.[0]?.id === 'frontend-contract-section-root', `${createSectionFromTemplate.url} did not seed captured section content`);

      const unauthSeo = await fetch(`${baseUrl}/api/admin/sites/${createdSiteId}/seo`);
      const unauthSeoJson = await unauthSeo.json().catch(() => ({}));
      assert(unauthSeo.status === 401, `SEO admin API should reject missing auth, got ${unauthSeo.status}`);
      assert(unauthSeoJson?.success === false && unauthSeoJson?.error?.code === 'UNAUTHORIZED', `SEO admin API missing auth envelope: ${JSON.stringify(unauthSeoJson).slice(0, 500)}`);

      const invalidSeoSettings = await request(`/api/admin/sites/${createdSiteId}/seo`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          seo: {
            titleTemplate: 'Missing title token',
          },
        }),
      });
      assert(invalidSeoSettings.response.status === 400, `${invalidSeoSettings.url} expected invalid SEO 400`);
      assert(invalidSeoSettings.json?.error?.code === 'SEO_VALIDATION', `${invalidSeoSettings.url} expected SEO_VALIDATION`);

      const invalidJsonLdSettings = await request(`/api/admin/sites/${createdSiteId}/seo`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          seo: {
            titleTemplate: 'SEO %s | {siteName}',
            jsonLd: [{ '@context': 'https://schema.org' }, 'not-an-object'],
          },
        }),
      });
      assert(invalidJsonLdSettings.response.status === 400, `${invalidJsonLdSettings.url} expected invalid JSON-LD 400`);
      assert(invalidJsonLdSettings.json?.error?.code === 'SEO_VALIDATION', `${invalidJsonLdSettings.url} expected JSON-LD SEO_VALIDATION`);

      const seoSettings = await request(`/api/admin/sites/${createdSiteId}/seo`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          seo: {
            titleTemplate: 'SEO %s | {siteName}',
            defaultDescription: 'Fallback SEO description from admin contract.',
            defaultOgImage: '/uploads/sites/contract/social-card.jpg',
            favicon: '/favicon-contract.ico',
            jsonLd: [
              {
                '@context': 'https://schema.org',
                '@type': 'Organization',
                name: 'Admin Contract Organization',
                url: `https://${siteSlug}.example.test`,
              },
            ],
            sitemap: {
              enabled: true,
              defaultChangeFrequency: 'monthly',
              defaultPriority: 0.4,
              includeDynamicRoutes: false,
            },
            robots: {
              index: true,
              follow: true,
              extraRules: 'Disallow: /contract-private',
            },
          },
        }),
      });
      assert(seoSettings.response.status === 200, `${seoSettings.url} expected SEO settings update 200`);
      assert(seoSettings.json?.data?.seo?.titleTemplate === 'SEO %s | {siteName}', `${seoSettings.url} missing saved title template`);

      const adminSeoSettings = await request(`/api/admin/sites/${createdSiteId}/seo`);
      assert(adminSeoSettings.response.status === 200, `${adminSeoSettings.url} expected SEO settings read 200`);
      assert(adminSeoSettings.json?.data?.seo?.defaultDescription === 'Fallback SEO description from admin contract.', `${adminSeoSettings.url} missing saved SEO defaults`);
      assert(adminSeoSettings.json?.data?.seo?.jsonLd?.[0]?.['@type'] === 'Organization', `${adminSeoSettings.url} missing saved JSON-LD defaults`);
      assert(
        adminSeoSettings.json?.data?.preview?.supportedVariables?.includes('{recordTitle}'),
        `${adminSeoSettings.url} missing dynamic SEO preview variables`,
      );
      assert(
        adminSeoSettings.json?.data?.preview?.routes?.some((route) => (
          route.type === 'dynamicList'
          && route.canonical === '/directory'
          && route.title?.startsWith('SEO ')
        )),
        `${adminSeoSettings.url} missing dynamic list SEO preview`,
      );
      assert(
        adminSeoSettings.json?.data?.preview?.routes?.some((route) => (
          route.type === 'dynamicItem'
          && typeof route.variables?.recordSlug === 'string'
          && route.canonical?.startsWith('/directory/')
          && route.title?.startsWith('SEO ')
        )),
        `${adminSeoSettings.url} missing dynamic item SEO preview`,
      );

      const seoDiscovery = await request(`/api/sites/${createdSiteId}/seo`);
      assert(seoDiscovery.response.status === 200, `${seoDiscovery.url} expected 200, got ${seoDiscovery.response.status}`);
      assert(seoDiscovery.response.headers.get('x-backy-cache-scope') === 'discovery', `${seoDiscovery.url} missing SEO cache scope`);
      const seoCacheRevision = seoDiscovery.response.headers.get('x-backy-cache-revision');
      assert(seoCacheRevision, `${seoDiscovery.url} missing SEO cache revision`);
      const seoEtag = seoDiscovery.response.headers.get('etag');
      assert(seoEtag?.startsWith('"backy-'), `${seoDiscovery.url} missing SEO etag`);
      const revalidatedSeo = await request(`/api/sites/${createdSiteId}/seo`, {
        headers: { 'if-none-match': seoEtag },
      });
      assert(revalidatedSeo.response.status === 304, `${revalidatedSeo.url} expected SEO 304, got ${revalidatedSeo.response.status}`);
      assert(revalidatedSeo.response.headers.get('x-backy-cache-revision') === seoCacheRevision, `${revalidatedSeo.url} expected matching SEO cache revision`);
      assert(seoDiscovery.json?.success === true, `${seoDiscovery.url} expected success envelope`);
      assert(seoDiscovery.json?.data?.routes?.some((route) => route.type === 'page' && route.canonical === `/${pageSlug}-form-write`), `${seoDiscovery.url} missing temporary page SEO route`);
      assert(seoDiscovery.json?.data?.site?.canonicalBaseUrl === `https://${customDomain}`, `${seoDiscovery.url} missing custom-domain canonical base URL`);
      assert(seoDiscovery.json?.data?.routes?.some((route) => (
        route.type === 'page'
        && route.canonical === `/${pageSlug}-form-write`
        && route.canonicalUrl === `https://${customDomain}/${pageSlug}-form-write`
      )), `${seoDiscovery.url} missing custom-domain route canonical URL`);
      assert(seoDiscovery.json?.data?.defaults?.description === 'Fallback SEO description from admin contract.', `${seoDiscovery.url} missing SEO default description`);
      assert(seoDiscovery.json?.data?.defaults?.jsonLd?.[0]?.['@type'] === 'Organization', `${seoDiscovery.url} missing SEO JSON-LD defaults`);
      assert(seoDiscovery.json?.data?.routes?.some((route) => (
        route.type === 'page'
        && route.id === formWritePageId
        && route.jsonLd?.some((entry) => entry?.['@type'] === 'WebPage' && entry?.name === 'Collection Form Write Page')
      )), `${seoDiscovery.url} missing page route JSON-LD`);
      assert(seoDiscovery.json?.data?.routes?.some((route) => route.title?.startsWith('SEO ') && route.openGraph?.image === '/uploads/sites/contract/social-card.jpg'), `${seoDiscovery.url} missing applied SEO defaults`);
      assert(seoDiscovery.json?.data?.sitemap?.enabled === true, `${seoDiscovery.url} missing sitemap enabled flag`);
      assert(seoDiscovery.json?.data?.sitemap?.includeDynamicRoutes === false, `${seoDiscovery.url} missing dynamic sitemap flag`);
      assert(seoDiscovery.json?.data?.robots?.extraRules === 'Disallow: /contract-private', `${seoDiscovery.url} missing robots extra rules`);
      assert(seoDiscovery.json?.data?.routes?.some((route) => route.type === 'page' && route.changeFrequency === 'monthly' && route.priority === 0.4), `${seoDiscovery.url} missing sitemap route defaults`);
      assert(seoDiscovery.json?.data?.sitemap?.url === `/api/sites/${createdSiteId}/seo?format=sitemap`, `${seoDiscovery.url} missing sitemap URL`);
      assert(seoDiscovery.json?.data?.sitemap?.publicUrl === `https://${customDomain}/sitemap.xml`, `${seoDiscovery.url} missing custom-domain sitemap URL`);
      assert(seoDiscovery.json?.data?.robots?.publicUrl === `https://${customDomain}/robots.txt`, `${seoDiscovery.url} missing custom-domain robots URL`);

      const seoSitemap = await request(`/api/sites/${createdSiteId}/seo?format=sitemap`);
      assert(seoSitemap.response.status === 200, `${seoSitemap.url} expected 200, got ${seoSitemap.response.status}`);
      assert(seoSitemap.response.headers.get('content-type')?.includes('application/xml'), `${seoSitemap.url} expected XML sitemap content type`);
      assert(seoSitemap.response.headers.get('x-backy-cache-revision') === seoCacheRevision, `${seoSitemap.url} missing matching SEO cache revision`);
      const seoSitemapEtag = seoSitemap.response.headers.get('etag');
      assert(seoSitemapEtag?.startsWith('"backy-'), `${seoSitemap.url} missing SEO sitemap etag`);
      const revalidatedSeoSitemap = await request(`/api/sites/${createdSiteId}/seo?format=sitemap`, {
        headers: { 'if-none-match': seoSitemapEtag },
      });
      assert(revalidatedSeoSitemap.response.status === 304, `${revalidatedSeoSitemap.url} expected SEO sitemap 304, got ${revalidatedSeoSitemap.response.status}`);
      assert(revalidatedSeoSitemap.response.headers.get('x-backy-cache-revision') === seoCacheRevision, `${revalidatedSeoSitemap.url} expected matching SEO sitemap cache revision`);
      assert(seoSitemap.text.includes(`https://${customDomain}/${pageSlug}-form-write`), `${seoSitemap.url} missing custom-domain temporary page in sitemap`);

      const seoRobots = await request(`/api/sites/${createdSiteId}/seo?format=robots`);
      assert(seoRobots.response.status === 200, `${seoRobots.url} expected 200, got ${seoRobots.response.status}`);
      assert(seoRobots.response.headers.get('content-type')?.includes('text/plain'), `${seoRobots.url} expected robots text content type`);
      assert(seoRobots.response.headers.get('x-backy-cache-revision') === seoCacheRevision, `${seoRobots.url} missing matching SEO cache revision`);
      const seoRobotsEtag = seoRobots.response.headers.get('etag');
      assert(seoRobotsEtag?.startsWith('"backy-'), `${seoRobots.url} missing SEO robots etag`);
      const revalidatedSeoRobots = await request(`/api/sites/${createdSiteId}/seo?format=robots`, {
        headers: { 'if-none-match': seoRobotsEtag },
      });
      assert(revalidatedSeoRobots.response.status === 304, `${revalidatedSeoRobots.url} expected SEO robots 304, got ${revalidatedSeoRobots.response.status}`);
      assert(revalidatedSeoRobots.response.headers.get('x-backy-cache-revision') === seoCacheRevision, `${revalidatedSeoRobots.url} expected matching SEO robots cache revision`);
      assert(seoRobots.text.includes(`Sitemap: https://${customDomain}/sitemap.xml`), `${seoRobots.url} missing custom-domain sitemap pointer`);
      assert(seoRobots.text.includes('Disallow: /contract-private'), `${seoRobots.url} missing custom robots rule`);

      const hostedSitemap = await request(`/sites/${siteSlug}/sitemap.xml`);
      assert(hostedSitemap.response.status === 200, `${hostedSitemap.url} expected 200, got ${hostedSitemap.response.status}`);
      assert(hostedSitemap.response.headers.get('content-type')?.includes('application/xml'), `${hostedSitemap.url} expected XML sitemap content type`);
      const hostedSitemapCacheRevision = hostedSitemap.response.headers.get('x-backy-cache-revision');
      assert(hostedSitemapCacheRevision, `${hostedSitemap.url} missing hosted sitemap cache revision`);
      const hostedSitemapEtag = hostedSitemap.response.headers.get('etag');
      assert(hostedSitemapEtag?.startsWith('"backy-'), `${hostedSitemap.url} missing hosted sitemap etag`);
      const revalidatedHostedSitemap = await request(`/sites/${siteSlug}/sitemap.xml`, {
        headers: { 'if-none-match': hostedSitemapEtag },
      });
      assert(revalidatedHostedSitemap.response.status === 304, `${revalidatedHostedSitemap.url} expected hosted sitemap 304, got ${revalidatedHostedSitemap.response.status}`);
      assert(revalidatedHostedSitemap.response.headers.get('x-backy-cache-revision') === hostedSitemapCacheRevision, `${revalidatedHostedSitemap.url} expected matching hosted sitemap cache revision`);
      assert(hostedSitemap.text.includes(`https://${customDomain}/${pageSlug}-form-write`), `${hostedSitemap.url} missing custom-domain hosted temporary page URL`);

      const hostedRobots = await request(`/sites/${siteSlug}/robots.txt`);
      assert(hostedRobots.response.status === 200, `${hostedRobots.url} expected 200, got ${hostedRobots.response.status}`);
      assert(hostedRobots.response.headers.get('content-type')?.includes('text/plain'), `${hostedRobots.url} expected robots text content type`);
      const hostedRobotsCacheRevision = hostedRobots.response.headers.get('x-backy-cache-revision');
      assert(hostedRobotsCacheRevision, `${hostedRobots.url} missing hosted robots cache revision`);
      const hostedRobotsEtag = hostedRobots.response.headers.get('etag');
      assert(hostedRobotsEtag?.startsWith('"backy-'), `${hostedRobots.url} missing hosted robots etag`);
      const revalidatedHostedRobots = await request(`/sites/${siteSlug}/robots.txt`, {
        headers: { 'if-none-match': hostedRobotsEtag },
      });
      assert(revalidatedHostedRobots.response.status === 304, `${revalidatedHostedRobots.url} expected hosted robots 304, got ${revalidatedHostedRobots.response.status}`);
      assert(revalidatedHostedRobots.response.headers.get('x-backy-cache-revision') === hostedRobotsCacheRevision, `${revalidatedHostedRobots.url} expected matching hosted robots cache revision`);
      assert(hostedRobots.text.includes(`Sitemap: https://${customDomain}/sitemap.xml`), `${hostedRobots.url} missing custom-domain hosted sitemap pointer`);

      const frontendManifest = await request(`/api/sites/${createdSiteId}/manifest`);
      assert(frontendManifest.response.status === 200, `${frontendManifest.url} expected 200, got ${frontendManifest.response.status}`);
      assert(frontendManifest.response.headers.get('cache-control')?.includes('max-age=60'), `${frontendManifest.url} missing discovery cache header`);
      assert(frontendManifest.response.headers.get('x-backy-cache-scope') === 'discovery', `${frontendManifest.url} missing discovery cache scope`);
      assert(frontendManifest.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${frontendManifest.url} missing contract version header`);
      assert(frontendManifest.response.headers.get('x-backy-schema-version') === 'backy.frontend-manifest.v1', `${frontendManifest.url} missing manifest schema version header`);
      const manifestCacheRevision = frontendManifest.response.headers.get('x-backy-cache-revision');
      assert(manifestCacheRevision, `${frontendManifest.url} missing manifest cache revision`);
      const manifestEtag = frontendManifest.response.headers.get('etag');
      assert(manifestEtag?.startsWith('"backy-'), `${frontendManifest.url} missing manifest etag`);
      assert(frontendManifest.json?.data?.admin?.auth?.authenticated === false, `${frontendManifest.url} should expose anonymous admin auth state by default`);
      assert(frontendManifest.json?.data?.admin?.auth?.mode === 'anonymous', `${frontendManifest.url} should expose anonymous admin mode by default`);
      assert(frontendManifest.json?.data?.admin?.permissions?.['sites.configure'] === false, `${frontendManifest.url} should not expose configure permission anonymously`);
      assert(frontendManifest.json?.data?.admin?.capabilities?.frontendDesignWrite === false, `${frontendManifest.url} should not expose frontend design write anonymously`);
      const manifestDelivery = frontendManifest.json?.data?.delivery;
      const manifestLocalizedRoutes = frontendManifest.json?.data?.modules?.routing?.localizedRoutePatterns || [];
      assert(manifestDelivery?.defaultLocale === 'en', `${frontendManifest.url} missing default locale discovery`);
      assert(manifestDelivery?.localeStrategy === 'path-prefix', `${frontendManifest.url} missing locale strategy discovery`);
      assert(manifestDelivery?.locales?.some((locale) => locale.code === 'fr' && locale.pathPrefix === '/fr'), `${frontendManifest.url} missing French locale discovery`);
      assert(manifestDelivery?.locales?.some((locale) => locale.code === 'ar' && locale.direction === 'rtl' && locale.pathPrefix === '/ar'), `${frontendManifest.url} missing RTL locale discovery`);
      assert(manifestLocalizedRoutes.some((group) => (
        group.locale === 'fr' &&
        group.pathPrefix === '/fr' &&
        group.patterns?.some((pattern) => pattern.basePattern === '/:pageSlug' && pattern.pattern === '/fr/:pageSlug')
      )), `${frontendManifest.url} missing French localized route patterns`);
      assert(manifestLocalizedRoutes.some((group) => (
        group.locale === 'ar' &&
        group.pathPrefix === '/ar' &&
        group.patterns?.some((pattern) => pattern.basePattern === '/blog/:postSlug' && pattern.pattern === '/ar/blog/:postSlug')
      )), `${frontendManifest.url} missing RTL localized route patterns`);
      assert(frontendManifest.json?.data?.delivery?.domains?.some((domain) => domain.type === 'managed' && domain.baseUrl.endsWith(`/sites/${siteSlug}`)), `${frontendManifest.url} missing managed domain discovery`);
      assert(frontendManifest.json?.data?.delivery?.domains?.some((domain) => domain.type === 'custom' && domain.host === customDomain && domain.primary === true), `${frontendManifest.url} missing custom domain discovery`);
      assert(frontendManifest.json?.data?.delivery?.urls?.sitemap === `https://${customDomain}/sitemap.xml`, `${frontendManifest.url} missing custom-domain sitemap discovery`);
      const revalidatedManifest = await request(`/api/sites/${createdSiteId}/manifest`, {
        headers: { 'if-none-match': manifestEtag },
      });
      assert(revalidatedManifest.response.status === 304, `${revalidatedManifest.url} expected manifest 304, got ${revalidatedManifest.response.status}`);
      assert(revalidatedManifest.response.headers.get('etag') === manifestEtag, `${revalidatedManifest.url} expected matching manifest etag`);
      assert(revalidatedManifest.response.headers.get('x-backy-cache-revision') === manifestCacheRevision, `${revalidatedManifest.url} expected matching manifest cache revision`);
      validateAiFrontendManifest(frontendManifest.json, 'site frontend manifest');
      assert(frontendManifest.json?.data?.capabilities?.renderPayload === true, `${frontendManifest.url} missing render payload capability`);
      assert(frontendManifest.json?.data?.capabilities?.openApi === true, `${frontendManifest.url} missing OpenAPI capability`);
      assert(frontendManifest.json?.data?.capabilities?.seoDiscovery === true, `${frontendManifest.url} missing SEO discovery capability`);
      assert(frontendManifest.json?.data?.capabilities?.collectionWriteForms === true, `${frontendManifest.url} missing collection write form capability`);
      assert(frontendManifest.json?.data?.capabilities?.dynamicListRoutes === true, `${frontendManifest.url} missing dynamic list route capability`);
      assert(frontendManifest.json?.data?.capabilities?.redirectRoutes === true, `${frontendManifest.url} missing redirect route capability`);
      assert(frontendManifest.json?.data?.capabilities?.reusableSections === true, `${frontendManifest.url} missing reusable sections capability`);
      assert(frontendManifest.json?.data?.capabilities?.frontendDesignContract === true, `${frontendManifest.url} missing frontend design contract capability`);
      assert(frontendManifest.json?.data?.capabilities?.interactiveComponents === true, `${frontendManifest.url} missing interactive component capability`);
      assert(frontendManifest.json?.data?.contract?.schemas?.renderPayload?.includes('content-payload.schema.json'), `${frontendManifest.url} missing render schema reference`);
      assert(frontendManifest.json?.data?.endpoints?.openapi === `/api/sites/${createdSiteId}/openapi`, `${frontendManifest.url} missing OpenAPI endpoint`);
      assert(frontendManifest.json?.data?.endpoints?.seo === `/api/sites/${createdSiteId}/seo`, `${frontendManifest.url} missing SEO endpoint`);
      assert(frontendManifest.json?.data?.endpoints?.sitemap === `/api/sites/${createdSiteId}/seo?format=sitemap`, `${frontendManifest.url} missing sitemap endpoint`);
      assert(frontendManifest.json?.data?.endpoints?.frontendDesign === `/api/sites/${createdSiteId}/frontend-design`, `${frontendManifest.url} missing frontend design endpoint`);
      assert(frontendManifest.json?.data?.endpoints?.frontendDesignInManifest === `/api/sites/${createdSiteId}/manifest#data.site.frontendDesign`, `${frontendManifest.url} missing frontend design contract pointer`);
      assert(frontendManifest.json?.data?.endpoints?.interactiveComponents === `/api/sites/${createdSiteId}/interactive-components`, `${frontendManifest.url} missing interactive component registry endpoint`);
      assert(frontendManifest.json?.data?.endpoints?.interactiveRuntimeEvents === `/api/sites/${createdSiteId}/interactive-components/runtime-events`, `${frontendManifest.url} missing interactive runtime event endpoint`);
      assert(frontendManifest.json?.data?.endpoints?.interactiveComponentsInManifest === `/api/sites/${createdSiteId}/manifest#data.modules.interactiveComponents`, `${frontendManifest.url} missing interactive component manifest pointer`);
      assert(Object.prototype.hasOwnProperty.call(frontendManifest.json?.data?.site || {}, 'frontendDesign'), `${frontendManifest.url} missing site frontend design field`);
      assert(frontendManifest.json?.data?.site?.frontendDesign?.templates?.some((template) => template.id === 'captured-page-template' && template.type === 'page'), `${frontendManifest.url} missing captured page frontend template`);
      assert(frontendManifest.json?.data?.site?.frontendDesign?.templates?.some((template) => template.id === 'captured-form-template' && template.type === 'form'), `${frontendManifest.url} missing captured form frontend template`);
      assert(frontendManifest.json?.data?.site?.frontendDesign?.templates?.some((template) => template.id === 'captured-section-template' && template.type === 'section'), `${frontendManifest.url} missing captured section frontend template`);
      assert(frontendManifest.json?.data?.endpoints?.mediaDetail === `/api/sites/${createdSiteId}/media/{mediaId}`, `${frontendManifest.url} missing media detail endpoint template`);
      assert(frontendManifest.json?.data?.endpoints?.mediaFile === `/api/sites/${createdSiteId}/media/{mediaId}/file`, `${frontendManifest.url} missing media file endpoint template`);
      assert(frontendManifest.json?.data?.endpoints?.mediaTransform === `/api/sites/${createdSiteId}/media/{mediaId}/transform?width={width}`, `${frontendManifest.url} missing media transform endpoint template`);
      assert(frontendManifest.json?.data?.endpoints?.reusableSections === `/api/sites/${createdSiteId}/reusable-sections`, `${frontendManifest.url} missing reusable sections endpoint`);
      assert(frontendManifest.json?.data?.endpoints?.formDetail === `/api/sites/${createdSiteId}/forms/{formId}`, `${frontendManifest.url} missing form detail endpoint template`);
      assert(frontendManifest.json?.data?.endpoints?.formDefinition === `/api/sites/${createdSiteId}/forms/{formId}/definition`, `${frontendManifest.url} missing form definition endpoint template`);
      assert(frontendManifest.json?.data?.endpoints?.formContacts === `/api/sites/${createdSiteId}/forms/{formId}/contacts`, `${frontendManifest.url} missing form contacts endpoint template`);
      assert(frontendManifest.json?.data?.endpoints?.commentReport === `/api/sites/${createdSiteId}/comments/{commentId}/report`, `${frontendManifest.url} missing comment report endpoint template`);
      assert(frontendManifest.json?.data?.endpoints?.events === `/api/sites/${createdSiteId}/events`, `${frontendManifest.url} missing events endpoint`);
      assert(frontendManifest.json?.data?.modules?.interactiveComponents?.schemaVersion === 'backy.interactive-components.v1', `${frontendManifest.url} missing interactive component contract`);
      assert(frontendManifest.json?.data?.modules?.interactiveComponents?.elementTypes?.includes('interactiveFigure'), `${frontendManifest.url} missing interactiveFigure element type`);
      assert(frontendManifest.json?.data?.modules?.interactiveComponents?.elementTypes?.includes('codeComponent'), `${frontendManifest.url} missing codeComponent element type`);
      assert(frontendManifest.json?.data?.modules?.interactiveComponents?.renderContract?.fallbackRequired === true, `${frontendManifest.url} missing interactive fallback requirement`);
      assert(frontendManifest.json?.data?.modules?.interactiveComponents?.security?.adminApiAccess === false, `${frontendManifest.url} interactive contract must deny admin API access`);
      assert(frontendManifest.json?.data?.modules?.interactiveComponents?.sandbox?.responseHeaders?.contentSecurityPolicy?.includes("default-src 'none'"), `${frontendManifest.url} missing interactive sandbox CSP contract`);
      assert(frontendManifest.json?.data?.modules?.interactiveComponents?.sandbox?.responseHeaders?.permissionsPolicy?.includes('camera=()'), `${frontendManifest.url} missing interactive sandbox permissions contract`);
      assert(frontendManifest.json?.data?.modules?.interactiveComponents?.sandbox?.responseHeaders?.schemaVersion === 'backy.interactive-component-sandbox.v1', `${frontendManifest.url} missing interactive sandbox schema header contract`);
      assert(frontendManifest.json?.data?.modules?.interactiveComponents?.sandbox?.responseHeaders?.etagHeader === 'etag', `${frontendManifest.url} missing interactive sandbox ETag header contract`);
      const publicInteractiveComponents = await request(`/api/sites/${createdSiteId}/interactive-components`);
      assert(publicInteractiveComponents.response.status === 200, `${publicInteractiveComponents.url} expected 200, got ${publicInteractiveComponents.response.status}`);
      assert(publicInteractiveComponents.response.headers.get('x-backy-cache-scope') === 'discovery', `${publicInteractiveComponents.url} missing discovery cache scope`);
      assert(publicInteractiveComponents.response.headers.get('x-backy-schema-version') === 'backy.interactive-component-registry.v1', `${publicInteractiveComponents.url} missing registry schema header`);
      assert(publicInteractiveComponents.json?.data?.schemaVersion === 'backy.interactive-component-registry.v1', `${publicInteractiveComponents.url} missing registry schema`);
      assert(publicInteractiveComponents.json?.data?.contract?.schemaVersion === 'backy.interactive-components.v1', `${publicInteractiveComponents.url} missing interactive component contract`);
      assert(publicInteractiveComponents.json?.data?.contract?.sandbox?.responseHeaders?.contentSecurityPolicy?.includes("object-src 'none'"), `${publicInteractiveComponents.url} missing sandbox CSP response header contract`);
      assert(publicInteractiveComponents.json?.data?.contract?.sandbox?.responseHeaders?.permissionsPolicy?.includes('microphone=()'), `${publicInteractiveComponents.url} missing sandbox permissions response header contract`);
      assert(publicInteractiveComponents.json?.data?.contract?.sandbox?.responseHeaders?.schemaVersion === 'backy.interactive-component-sandbox.v1', `${publicInteractiveComponents.url} missing sandbox schema response header contract`);
      assert(publicInteractiveComponents.json?.data?.contract?.sandbox?.responseHeaders?.cacheRevisionHeader === 'x-backy-cache-revision', `${publicInteractiveComponents.url} missing sandbox cache-revision response header contract`);
      assert(publicInteractiveComponents.json?.data?.components?.some((component) => component.componentKey === 'backy.figure.rounds' && component.type === 'interactiveFigure'), `${publicInteractiveComponents.url} missing communication rounds figure component`);
      for (const componentKey of ['backy.figure.timeline', 'backy.simulation.parameter', 'backy.data.explorer', 'backy.canvas.sandboxed']) {
        assert(publicInteractiveComponents.json?.data?.components?.some((component) => component.componentKey === componentKey), `${publicInteractiveComponents.url} missing ${componentKey} registry component`);
      }
      const timelineInteractiveComponent = publicInteractiveComponents.json?.data?.components?.find((component) => component.componentKey === 'backy.figure.timeline');
      assert(timelineInteractiveComponent?.controls?.some((control) => control.key === 'density'), `${publicInteractiveComponents.url} missing timeline density control`);
      const explorerInteractiveComponent = publicInteractiveComponents.json?.data?.components?.find((component) => component.componentKey === 'backy.data.explorer');
      assert(explorerInteractiveComponent?.allowedDataScopes?.includes('collections'), `${publicInteractiveComponents.url} missing data explorer collection scope`);
      const canvasInteractiveComponent = publicInteractiveComponents.json?.data?.components?.find((component) => component.componentKey === 'backy.canvas.sandboxed');
      assert(canvasInteractiveComponent?.runtime?.sandboxUrl?.includes('/interactive-components/backy.canvas.sandboxed/1.0.0/sandbox'), `${publicInteractiveComponents.url} missing canvas sandbox runtime URL`);
      const sandboxedInteractiveComponent = publicInteractiveComponents.json?.data?.components?.find((component) => component.componentKey === 'backy.custom.sandboxed');
      assert(sandboxedInteractiveComponent?.renderMode === 'sandbox-iframe', `${publicInteractiveComponents.url} missing sandboxed code component render mode`);
      assert(sandboxedInteractiveComponent?.runtime?.sandboxUrl?.includes('/interactive-components/backy.custom.sandboxed/1.0.0/sandbox'), `${publicInteractiveComponents.url} missing sandbox runtime URL`);
      assert(sandboxedInteractiveComponent?.runtime?.postMessageProtocol === 'backy.interactive-component.v1', `${publicInteractiveComponents.url} missing sandbox postMessage protocol`);
      assert(publicInteractiveComponents.json?.data?.components?.every((component) => component.security?.adminApiAccess === false), `${publicInteractiveComponents.url} interactive registry must deny admin API access`);
      const contractRegistryComponent = publicInteractiveComponents.json?.data?.components?.find((component) => component.componentKey === createdInteractiveComponentKey);
      assert(contractRegistryComponent?.source === 'custom', `${publicInteractiveComponents.url} missing approved admin-created custom component`);
      assert(contractRegistryComponent?.status === 'active', `${publicInteractiveComponents.url} expected approved admin-created component to be active`);
      assert(contractRegistryComponent?.reviewStatus === undefined, `${publicInteractiveComponents.url} public registry must not expose admin review state`);
      assert(contractRegistryComponent?.runtime?.sandboxUrl?.includes(`/interactive-components/${createdInteractiveComponentKey}/${createdInteractiveComponentVersion}/sandbox`), `${publicInteractiveComponents.url} missing admin-created sandbox URL`);
      const sandboxRuntime = await request(sandboxedInteractiveComponent.runtime.sandboxUrl);
      const sandboxCsp = sandboxRuntime.response.headers.get('content-security-policy') || '';
      const sandboxPermissionsPolicy = sandboxRuntime.response.headers.get('permissions-policy') || '';
      const expectedSandboxStatus = sandboxedInteractiveComponent.status === 'active' ? 200 : 403;
      assert(sandboxRuntime.response.status === expectedSandboxStatus, `${sandboxRuntime.url} expected sandbox status ${expectedSandboxStatus}, got ${sandboxRuntime.response.status}`);
      assert(sandboxRuntime.response.headers.get('content-type')?.includes('text/html'), `${sandboxRuntime.url} expected HTML sandbox response`);
      assert(sandboxRuntime.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${sandboxRuntime.url} missing sandbox contract version header`);
      assert(sandboxRuntime.response.headers.get('x-backy-schema-version') === 'backy.interactive-component-sandbox.v1', `${sandboxRuntime.url} missing sandbox schema version header`);
      assert(sandboxRuntime.response.headers.get('x-backy-site-id') === createdSiteId, `${sandboxRuntime.url} missing sandbox site id header`);
      assert(sandboxRuntime.response.headers.get('referrer-policy') === 'no-referrer', `${sandboxRuntime.url} missing no-referrer policy`);
      assert(sandboxRuntime.response.headers.get('x-content-type-options') === 'nosniff', `${sandboxRuntime.url} missing nosniff header`);
      assert(sandboxCsp.includes("default-src 'none'"), `${sandboxRuntime.url} missing default-src none CSP`);
      assert(sandboxCsp.includes("frame-ancestors 'self'"), `${sandboxRuntime.url} missing frame ancestor restriction`);
      assert(sandboxCsp.includes("base-uri 'none'") && sandboxCsp.includes("form-action 'none'"), `${sandboxRuntime.url} missing CSP base/form restrictions`);
      assert(sandboxCsp.includes("object-src 'none'") && sandboxCsp.includes("frame-src 'none'") && sandboxCsp.includes("worker-src 'none'"), `${sandboxRuntime.url} missing CSP execution boundary restrictions`);
      for (const directive of ['camera=()', 'microphone=()', 'geolocation=()', 'payment=()', 'usb=()', 'serial=()', 'clipboard-read=()', 'clipboard-write=()']) {
        assert(sandboxPermissionsPolicy.includes(directive), `${sandboxRuntime.url} missing sandbox permissions policy directive ${directive}`);
      }
      if (sandboxedInteractiveComponent.status === 'active') {
        assert(sandboxRuntime.response.headers.get('x-backy-cache-scope') === 'discovery', `${sandboxRuntime.url} missing sandbox discovery cache scope`);
        assert(sandboxRuntime.response.headers.get('x-backy-cache-revision'), `${sandboxRuntime.url} missing sandbox cache revision`);
        assert(sandboxRuntime.response.headers.get('etag')?.startsWith('"backy-'), `${sandboxRuntime.url} missing sandbox etag`);
        assert(sandboxCsp.includes("script-src 'unsafe-inline'"), `${sandboxRuntime.url} missing bootstrap script CSP`);
        assert(sandboxRuntime.text.includes('backy.interactive-component.ready'), `${sandboxRuntime.url} missing ready lifecycle bootstrap`);
        assert(sandboxRuntime.text.includes('backy.interactive-component.init'), `${sandboxRuntime.url} missing init lifecycle bootstrap`);
        assert(sandboxRuntime.text.includes('backy.interactive-component.error'), `${sandboxRuntime.url} missing error lifecycle bootstrap`);
        assert(sandboxRuntime.text.includes('Waiting for Backy component payload'), `${sandboxRuntime.url} missing safe waiting shell`);
      } else {
        assert(sandboxRuntime.response.headers.get('cache-control') === 'no-store', `${sandboxRuntime.url} expected disabled sandbox to be no-store`);
        assert(!sandboxRuntime.text.includes('backy.interactive-component.init'), `${sandboxRuntime.url} disabled sandbox should not include runtime bootstrap`);
      }
      const missingSandboxRuntime = await request(`/api/sites/${createdSiteId}/interactive-components/backy.custom.sandboxed/9.9.9/sandbox`);
      assert(missingSandboxRuntime.response.status === 404, `${missingSandboxRuntime.url} expected unknown sandbox version 404`);
      assert(missingSandboxRuntime.response.headers.get('cache-control') === 'no-store', `${missingSandboxRuntime.url} expected unknown sandbox to be no-store`);
      assert(missingSandboxRuntime.response.headers.get('x-backy-cache-scope') === 'error', `${missingSandboxRuntime.url} expected unknown sandbox error cache scope`);
      assert(missingSandboxRuntime.response.headers.get('x-backy-schema-version') === 'backy.interactive-component-sandbox.v1', `${missingSandboxRuntime.url} missing unknown sandbox schema version`);
      assert(missingSandboxRuntime.response.headers.get('content-security-policy')?.includes("default-src 'none'"), `${missingSandboxRuntime.url} missing unknown sandbox CSP`);
      assert(missingSandboxRuntime.response.headers.get('permissions-policy')?.includes('camera=()'), `${missingSandboxRuntime.url} missing unknown sandbox permissions policy`);
      const contractRegistrySandbox = await request(contractRegistryComponent.runtime.sandboxUrl);
      assert(contractRegistrySandbox.response.status === 200, `${contractRegistrySandbox.url} expected admin-created sandbox 200, got ${contractRegistrySandbox.response.status}`);
      assert(contractRegistrySandbox.response.headers.get('x-backy-schema-version') === 'backy.interactive-component-sandbox.v1', `${contractRegistrySandbox.url} missing admin-created sandbox schema version`);
      assert(contractRegistrySandbox.response.headers.get('etag')?.startsWith('"backy-'), `${contractRegistrySandbox.url} missing admin-created sandbox etag`);
      assert(contractRegistrySandbox.response.headers.get('content-security-policy')?.includes("default-src 'none'"), `${contractRegistrySandbox.url} missing admin-created sandbox CSP`);
      assert(contractRegistrySandbox.response.headers.get('permissions-policy')?.includes('microphone=()'), `${contractRegistrySandbox.url} missing admin-created sandbox permissions policy`);
      assert(contractRegistrySandbox.text.includes('Contract custom figure'), `${contractRegistrySandbox.url} missing admin-created sandbox display name`);
      const interactiveRuntimeRequestId = 'contract-interactive-runtime-error';
      const interactiveRuntimeEvent = await request(`/api/sites/${createdSiteId}/interactive-components/runtime-events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          componentKey: 'backy.custom.sandboxed',
          version: '1.0.0',
          elementId: 'contract-code-component',
          pageId: createdPageId,
          type: 'backy.interactive-component.error',
          message: 'Contract smoke sandbox runtime failure',
          requestId: interactiveRuntimeRequestId,
        }),
      });
      assert(interactiveRuntimeEvent.response.status === 202, `${interactiveRuntimeEvent.url} expected 202, got ${interactiveRuntimeEvent.response.status}`);
      assert(interactiveRuntimeEvent.json?.data?.recorded === true, `${interactiveRuntimeEvent.url} missing runtime event recorded flag`);
      const invalidInteractiveRuntimeType = await request(`/api/sites/${createdSiteId}/interactive-components/runtime-events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          componentKey: 'backy.custom.sandboxed',
          version: '1.0.0',
          type: 'backy.interactive-component.unbounded',
          message: 'Unbounded runtime event must not be stored.',
        }),
      });
      assert(invalidInteractiveRuntimeType.response.status === 400, `${invalidInteractiveRuntimeType.url} expected invalid runtime event type 400`);
      assert(invalidInteractiveRuntimeType.json?.error?.code === 'INVALID_EVENT_TYPE', `${invalidInteractiveRuntimeType.url} missing invalid runtime event type code`);
      const unknownInteractiveRuntimeComponent = await request(`/api/sites/${createdSiteId}/interactive-components/runtime-events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          componentKey: 'backy.unknown.sandboxed',
          version: '1.0.0',
          type: 'error',
          message: 'Unknown runtime component must not be stored.',
        }),
      });
      assert(unknownInteractiveRuntimeComponent.response.status === 404, `${unknownInteractiveRuntimeComponent.url} expected unknown runtime component 404`);
      assert(unknownInteractiveRuntimeComponent.json?.error?.code === 'COMPONENT_NOT_FOUND', `${unknownInteractiveRuntimeComponent.url} missing unknown runtime component code`);
      const interactiveRuntimeEvents = await request(`/api/sites/${createdSiteId}/events?kind=interactive-runtime&requestId=${interactiveRuntimeRequestId}`, {
        headers: withAdminAuth(),
      });
      assert(interactiveRuntimeEvents.response.status === 200, `${interactiveRuntimeEvents.url} expected interactive runtime event readback`);
      assert(interactiveRuntimeEvents.json?.data?.events?.some((event) => event.metadata?.componentKey === 'backy.custom.sandboxed' && event.error === 'Contract smoke sandbox runtime failure'), `${interactiveRuntimeEvents.url} missing interactive runtime event`);
      assert(frontendManifest.json?.data?.modules?.routing?.supportedRouteTypes?.includes('redirect'), `${frontendManifest.url} missing redirect route type support`);
      assert(frontendManifest.json?.data?.modules?.routing?.supportedRouteTypes?.includes('gone'), `${frontendManifest.url} missing gone route type support`);
      assert(frontendManifest.json?.data?.modules?.routing?.redirectRules?.items?.some((rule) => (
        rule.id === 'contract-redirect'
        && rule.type === 'redirect'
        && rule.from === `/old-${pageSlug}`
        && rule.to === `/${pageSlug}`
        && rule.statusCode === 301
      )), `${frontendManifest.url} missing redirect rule manifest`);
      assert(frontendManifest.json?.data?.modules?.routing?.redirectRules?.items?.some((rule) => (
        rule.id === 'contract-gone'
        && rule.type === 'gone'
        && rule.from === `/retired-${pageSlug}`
        && rule.statusCode === 410
      )), `${frontendManifest.url} missing gone rule manifest`);
      assert(frontendManifest.json?.data?.modules?.collections?.some((collection) => (
        collection.id === createdCollectionId
        && collection.listRoutePattern === '/directory'
        && collection.dynamicListRoutePattern === '/directory'
        && collection.dynamicListRouteResolveUrl === `/api/sites/${createdSiteId}/resolve?path=/directory`
        && collection.dynamicListRouteRenderUrl === `/api/sites/${createdSiteId}/render?path=/directory`
        && collection.routePattern === '/directory/:recordSlug'
        && collection.dynamicRoutePattern === '/directory/:recordSlug'
        && collection.dynamicRouteResolveUrl === `/api/sites/${createdSiteId}/resolve?path=/directory/:recordSlug`
        && collection.dynamicRouteRenderUrl === `/api/sites/${createdSiteId}/render?path=/directory/:recordSlug`
      )), `${frontendManifest.url} missing collection manifest`);
      const authenticatedFrontendManifest = await request(`/api/sites/${createdSiteId}/manifest`, {
        headers: withAdminAuth(),
      });
      assert(authenticatedFrontendManifest.response.status === 200, `${authenticatedFrontendManifest.url} expected authenticated manifest`);
      validateAiFrontendManifest(authenticatedFrontendManifest.json, 'authenticated site frontend manifest');
      assert(authenticatedFrontendManifest.json?.data?.admin?.auth?.authenticated === true, `${authenticatedFrontendManifest.url} missing authenticated admin state`);
      assert(['session', 'api-key'].includes(authenticatedFrontendManifest.json?.data?.admin?.auth?.mode), `${authenticatedFrontendManifest.url} missing admin auth mode`);
      assert(authenticatedFrontendManifest.json?.data?.admin?.permissions?.['sites.view'] === true, `${authenticatedFrontendManifest.url} missing authenticated sites.view permission`);
      assert(authenticatedFrontendManifest.json?.data?.admin?.capabilities?.frontendDesignRead === true, `${authenticatedFrontendManifest.url} missing frontend design read capability`);
      assert(authenticatedFrontendManifest.json?.data?.admin?.endpoints?.frontendDesign === `/api/admin/sites/${createdSiteId}/frontend-design`, `${authenticatedFrontendManifest.url} missing admin frontend design endpoint`);
      assert(frontendManifest.json?.data?.modules?.reusableSections?.items?.some((section) => (
        section.id === manifestReusableSectionId &&
        section.detailUrl === `/api/sites/${createdSiteId}/reusable-sections/${manifestReusableSectionId}` &&
        section.elementCount === 1 &&
        section.frontendDesign?.templateId === 'contract-section-template' &&
        section.frontendDesign?.source?.label === 'Contract smoke frontend' &&
        section.frontendDesign?.tokens?.colors?.primary === '#0f766e' &&
        Array.isArray(section.frontendDesign?.bindingHints) &&
        section.frontendDesign.bindingHints.length === 2
      )), `${frontendManifest.url} missing reusable section manifest`);
      assert(frontendManifest.json?.data?.modules?.forms?.some((form) => (
        form.id === 'contract-form-write' &&
        form.collectionTarget?.collectionId === createdCollectionId &&
        form.detailUrl === `/api/sites/${createdSiteId}/forms/contract-form-write` &&
        form.definitionUrl === `/api/sites/${createdSiteId}/forms/contract-form-write/definition` &&
        form.contactsUrl === `/api/sites/${createdSiteId}/forms/contract-form-write/contacts`
      )), `${frontendManifest.url} missing form collection target manifest`);
      assert(frontendManifest.json?.data?.modules?.forms?.some((form) => (
        form.id === capturedTemplateFormId &&
        form.frontendDesign?.templateId === 'captured-form-template' &&
        form.frontendDesign?.bindingHints?.some((hint) => hint.binding === 'form.fields.title')
      )), `${frontendManifest.url} missing captured form frontend design manifest`);
      assert(frontendManifest.json?.data?.routePatterns?.some((route) => route.type === 'dynamicCollectionItem'), `${frontendManifest.url} missing dynamic item route pattern`);
      assert(frontendManifest.json?.data?.routePatterns?.some((route) => (
        route.type === 'dynamicCollectionList'
        && route.collectionId === createdCollectionId
        && route.pattern === '/directory'
      )), `${frontendManifest.url} missing dynamic list route pattern`);

      const frontendDesignContract = await request(`/api/sites/${createdSiteId}/frontend-design`);
      assert(frontendDesignContract.response.status === 200, `${frontendDesignContract.url} expected 200, got ${frontendDesignContract.response.status}`);
      assertBackyContract(frontendDesignContract, 'discovery');
      assert(frontendDesignContract.response.headers.get('x-backy-schema-version') === 'backy.frontend-design-response.v1', `${frontendDesignContract.url} missing frontend design schema version`);
      const frontendDesignEtag = frontendDesignContract.response.headers.get('etag');
      assert(frontendDesignEtag?.startsWith('"backy-'), `${frontendDesignContract.url} missing frontend design etag`);
      assert(frontendDesignContract.json?.data?.capabilities?.hasContract === true, `${frontendDesignContract.url} missing frontend design capability`);
      assert(frontendDesignContract.json?.data?.capabilities?.templateCount >= 3, `${frontendDesignContract.url} missing frontend design template count`);
      assert(frontendDesignContract.json?.data?.frontendDesign?.templates?.some((template) => template.id === 'captured-page-template' && template.type === 'page'), `${frontendDesignContract.url} missing captured page design template`);
      assert(frontendDesignContract.json?.data?.frontendDesign?.templates?.some((template) => template.id === 'captured-form-template' && template.type === 'form'), `${frontendDesignContract.url} missing captured form design template`);
      assert(frontendDesignContract.json?.data?.endpoints?.manifest === `/api/sites/${createdSiteId}/manifest`, `${frontendDesignContract.url} missing manifest endpoint`);
      const revalidatedFrontendDesign = await request(`/api/sites/${createdSiteId}/frontend-design`, {
        headers: { 'if-none-match': frontendDesignEtag },
      });
      assert(revalidatedFrontendDesign.response.status === 304, `${revalidatedFrontendDesign.url} expected frontend design 304, got ${revalidatedFrontendDesign.response.status}`);
      assert(revalidatedFrontendDesign.response.headers.get('etag') === frontendDesignEtag, `${revalidatedFrontendDesign.url} expected matching frontend design etag`);

      const publicOpenApi = await request(`/api/sites/${createdSiteId}/openapi`);
      assert(publicOpenApi.response.status === 200, `${publicOpenApi.url} expected 200, got ${publicOpenApi.response.status}`);
      assert(publicOpenApi.response.headers.get('cache-control')?.includes('max-age=60'), `${publicOpenApi.url} missing discovery cache header`);
      assert(publicOpenApi.response.headers.get('x-backy-cache-scope') === 'discovery', `${publicOpenApi.url} missing discovery cache scope`);
      assert(publicOpenApi.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${publicOpenApi.url} missing contract version header`);
      assert(publicOpenApi.response.headers.get('x-backy-schema-version') === 'openapi.3.1', `${publicOpenApi.url} missing OpenAPI schema version header`);
      const openApiCacheRevision = publicOpenApi.response.headers.get('x-backy-cache-revision');
      assert(openApiCacheRevision, `${publicOpenApi.url} missing OpenAPI cache revision`);
      const openApiEtag = publicOpenApi.response.headers.get('etag');
      assert(openApiEtag?.startsWith('"backy-'), `${publicOpenApi.url} missing OpenAPI etag`);
      const revalidatedOpenApi = await request(`/api/sites/${createdSiteId}/openapi`, {
        headers: { 'if-none-match': openApiEtag },
      });
      assert(revalidatedOpenApi.response.status === 304, `${revalidatedOpenApi.url} expected OpenAPI 304, got ${revalidatedOpenApi.response.status}`);
      assert(revalidatedOpenApi.response.headers.get('etag') === openApiEtag, `${revalidatedOpenApi.url} expected matching OpenAPI etag`);
      assert(revalidatedOpenApi.response.headers.get('x-backy-cache-revision') === openApiCacheRevision, `${revalidatedOpenApi.url} expected matching OpenAPI cache revision`);
      assert(publicOpenApi.json?.openapi === '3.1.0', `${publicOpenApi.url} expected OpenAPI 3.1 document`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/manifest`]?.get, `${publicOpenApi.url} missing manifest operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/frontend-design`]?.get, `${publicOpenApi.url} missing frontend design operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/render`]?.get, `${publicOpenApi.url} missing render operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/seo`]?.get, `${publicOpenApi.url} missing SEO discovery operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/pages`]?.get, `${publicOpenApi.url} missing public pages operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/blog`]?.get, `${publicOpenApi.url} missing public blog operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/media/{mediaId}`]?.get, `${publicOpenApi.url} missing media detail operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/media/{mediaId}/file`]?.get, `${publicOpenApi.url} missing media file operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/media/{mediaId}/transform`]?.get, `${publicOpenApi.url} missing media transform operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/media/{mediaId}/file`]?.get?.responses?.['200']?.headers?.['X-Backy-Schema-Version']?.schema?.const === 'backy.media-file.v1', `${publicOpenApi.url} missing media file response schema header`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/media/{mediaId}/transform`]?.get?.responses?.['307']?.headers?.['X-Backy-Schema-Version']?.schema?.const === 'backy.media-transform.v1', `${publicOpenApi.url} missing media transform response schema header`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/collections/{collectionId}/records`]?.post, `${publicOpenApi.url} missing public collection create operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/collections/{collectionId}/records/{recordId}`]?.patch, `${publicOpenApi.url} missing public collection update operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/collections/{collectionId}/records/{recordId}`]?.delete, `${publicOpenApi.url} missing public collection delete operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/reusable-sections`]?.get, `${publicOpenApi.url} missing reusable sections list operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/reusable-sections/{sectionId}`]?.get, `${publicOpenApi.url} missing reusable section detail operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/forms/{formId}`]?.get, `${publicOpenApi.url} missing form detail operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/forms/{formId}/definition`]?.get, `${publicOpenApi.url} missing form definition operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/forms/{formId}/submissions`]?.get, `${publicOpenApi.url} missing form submission list operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/forms/{formId}/submissions`]?.post, `${publicOpenApi.url} missing form submission operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/forms/{formId}/submissions/{submissionId}`]?.patch, `${publicOpenApi.url} missing form submission review operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/forms/{formId}/contacts`]?.get, `${publicOpenApi.url} missing form contacts operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/pages/{pageId}/comments`]?.get, `${publicOpenApi.url} missing page comments list operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/pages/{pageId}/comments/{commentId}`]?.patch, `${publicOpenApi.url} missing page comment update operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/blog/{postId}/comments`]?.get, `${publicOpenApi.url} missing blog comments list operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/blog/rss`]?.get, `${publicOpenApi.url} missing blog RSS operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/blog/rss`]?.get?.['x-backy-feed']?.endpoint === `/api/sites/${createdSiteId}/blog/rss`, `${publicOpenApi.url} missing blog RSS feed discovery extension`);
      assert(publicOpenApi.json?.['x-backy']?.delivery?.defaultLocale === 'en', `${publicOpenApi.url} missing delivery locale discovery extension`);
      assert(publicOpenApi.json?.['x-backy']?.delivery?.domains?.some((domain) => domain.type === 'custom' && domain.host === customDomain), `${publicOpenApi.url} missing custom domain discovery extension`);
      const openApiSandboxOperation = publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/interactive-components/{componentKey}/{version}/sandbox`]?.get;
      assert(openApiSandboxOperation?.responses?.['200']?.headers?.['Content-Security-Policy'], `${publicOpenApi.url} missing sandbox CSP response header contract`);
      assert(openApiSandboxOperation?.responses?.['200']?.headers?.['Permissions-Policy'], `${publicOpenApi.url} missing sandbox permissions response header contract`);
      assert(openApiSandboxOperation?.responses?.['403']?.headers?.['Content-Security-Policy'], `${publicOpenApi.url} missing disabled sandbox CSP response header contract`);
      assert(publicOpenApi.json?.components?.schemas?.InteractiveComponentManifestContract?.properties?.sandbox?.properties?.responseHeaders?.properties?.contentSecurityPolicy, `${publicOpenApi.url} missing sandbox response header schema`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/comments/blocklist`]?.get, `${publicOpenApi.url} missing comment blocklist operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/comments/blocklist`]?.delete, `${publicOpenApi.url} missing comment blocklist delete operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/comments/{commentId}/report`]?.post, `${publicOpenApi.url} missing comment report operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/events`]?.get, `${publicOpenApi.url} missing interaction events operation`);
      assert(publicOpenApi.json?.components?.schemas?.FormSubmissionEnvelope, `${publicOpenApi.url} missing form submission schema`);
      assert(publicOpenApi.json?.components?.schemas?.FormDefinitionEnvelope, `${publicOpenApi.url} missing form definition schema`);
      assert(publicOpenApi.json?.components?.schemas?.FormDefinition?.properties?.frontendDesign?.$ref === '#/components/schemas/ReusableSectionFrontendDesign', `${publicOpenApi.url} missing form frontend design schema`);
      assert(publicOpenApi.json?.components?.schemas?.PageResource?.properties?.frontendDesign?.$ref === '#/components/schemas/ReusableSectionFrontendDesign', `${publicOpenApi.url} missing page frontend design schema`);
      assert(publicOpenApi.json?.components?.schemas?.PageResource?.properties?.seo?.$ref === '#/components/schemas/PageSeoMetadata', `${publicOpenApi.url} missing page SEO schema reference`);
      assert(publicOpenApi.json?.components?.schemas?.PageSeoMetadata?.properties?.canonicalUrl?.type === 'string', `${publicOpenApi.url} missing page SEO canonical URL schema`);
      assert(publicOpenApi.json?.components?.schemas?.BlogPostResource?.properties?.frontendDesign?.$ref === '#/components/schemas/ReusableSectionFrontendDesign', `${publicOpenApi.url} missing blog post frontend design schema`);
      assert(publicOpenApi.json?.components?.schemas?.BlogFeedDiscovery?.properties?.limits, `${publicOpenApi.url} missing blog feed discovery schema`);
      assert(publicOpenApi.json?.components?.schemas?.PageListEnvelope?.properties?.data?.properties?.pages?.items?.$ref === '#/components/schemas/PageResource', `${publicOpenApi.url} missing page list resource schema`);
      assert(publicOpenApi.json?.components?.schemas?.BlogPostListEnvelope?.properties?.data?.properties?.posts?.items?.$ref === '#/components/schemas/BlogPostResource', `${publicOpenApi.url} missing blog list resource schema`);
      assert(publicOpenApi.json?.components?.schemas?.FrontendDesignEnvelope?.properties?.data?.properties?.frontendDesign?.$ref === '#/components/schemas/FrontendDesignContract', `${publicOpenApi.url} missing frontend design envelope schema`);
      assert(publicOpenApi.json?.components?.schemas?.FrontendDesignTemplate?.properties?.bindingHints, `${publicOpenApi.url} missing frontend design template binding schema`);
      assert(publicOpenApi.json?.components?.schemas?.SeoDiscoveryEnvelope, `${publicOpenApi.url} missing SEO discovery schema`);
      assert(publicOpenApi.json?.components?.schemas?.SeoDiscoveryEnvelope?.properties?.data?.properties?.routes?.items?.$ref === '#/components/schemas/SeoRoute', `${publicOpenApi.url} missing SEO route schema reference`);
      assert(publicOpenApi.json?.components?.schemas?.SeoRoute?.properties?.type?.enum?.includes('dynamicList'), `${publicOpenApi.url} missing SEO dynamic list route type schema`);
      assert(publicOpenApi.json?.components?.schemas?.SeoRoute?.properties?.frontendDesign?.$ref === '#/components/schemas/ReusableSectionFrontendDesign', `${publicOpenApi.url} missing SEO route frontend design schema`);
      assert(publicOpenApi.json?.components?.schemas?.SeoRoute?.properties?.collectionFrontendDesign?.$ref === '#/components/schemas/ReusableSectionFrontendDesign', `${publicOpenApi.url} missing SEO route collection frontend design schema`);
      assert(publicOpenApi.json?.components?.schemas?.MediaDetailEnvelope, `${publicOpenApi.url} missing media detail schema`);
      assert(publicOpenApi.json?.components?.schemas?.ReusableSectionListEnvelope, `${publicOpenApi.url} missing reusable section list schema`);
      assert(publicOpenApi.json?.components?.schemas?.ReusableSection?.properties?.metadata, `${publicOpenApi.url} missing reusable section metadata schema`);
      assert(publicOpenApi.json?.components?.schemas?.ReusableSection?.properties?.frontendDesign?.$ref === '#/components/schemas/ReusableSectionFrontendDesign', `${publicOpenApi.url} missing reusable section frontend design schema`);
      assert(publicOpenApi.json?.components?.schemas?.ReusableSectionFrontendDesign?.properties?.bindingHints, `${publicOpenApi.url} missing reusable section binding hints schema`);
      assert(publicOpenApi.json?.components?.schemas?.CommerceProduct?.properties?.design?.$ref === '#/components/schemas/CommerceProductDesign', `${publicOpenApi.url} missing commerce product design schema`);
      assert(publicOpenApi.json?.components?.schemas?.CommerceProductDesign?.properties?.templateId, `${publicOpenApi.url} missing commerce product template id schema`);
      assert(publicOpenApi.json?.components?.schemas?.CommerceProductDesign?.properties?.frontendDesignTemplateId, `${publicOpenApi.url} missing commerce product legacy template id schema`);
      assert(publicOpenApi.json?.components?.schemas?.Comment?.properties?.parentId, `${publicOpenApi.url} missing comment parent id schema`);
      assert(publicOpenApi.json?.components?.schemas?.Comment?.properties?.commentThreadId, `${publicOpenApi.url} missing comment thread id schema`);
      assert(publicOpenApi.json?.components?.schemas?.CommentSubmitRequest?.properties?.body, `${publicOpenApi.url} missing comment body alias schema`);
      assert(publicOpenApi.json?.components?.schemas?.CommentBulkUpdateRequest?.properties?.clearReports, `${publicOpenApi.url} missing comment clear reports schema`);
      assert(publicOpenApi.json?.components?.schemas?.CommentBulkUpdateRequest?.properties?.ids, `${publicOpenApi.url} missing comment ids alias schema`);
      assert(publicOpenApi.json?.components?.schemas?.CommentBlocklistEntry?.properties?.value, `${publicOpenApi.url} missing comment blocklist entry schema`);
      assert(publicOpenApi.json?.components?.schemas?.CommentBlocklistDeleteRequest?.properties?.ids, `${publicOpenApi.url} missing comment blocklist delete schema`);
      assert(publicOpenApi.json?.components?.schemas?.CommentsEnvelope?.properties?.data?.properties?.comments?.items?.$ref === '#/components/schemas/Comment', `${publicOpenApi.url} missing typed comment list schema`);
      assert(publicOpenApi.json?.components?.schemas?.CommentReportEnvelope, `${publicOpenApi.url} missing comment report schema`);
      assert(publicOpenApi.json?.components?.schemas?.EventsEnvelope, `${publicOpenApi.url} missing interaction event schema`);
      assert(publicOpenApi.json?.components?.schemas?.RedirectRoute, `${publicOpenApi.url} missing redirect route schema`);
      assert(publicOpenApi.json?.components?.schemas?.GoneRoute, `${publicOpenApi.url} missing gone route schema`);
      assert(publicOpenApi.json?.components?.schemas?.GoneRouteResolveEnvelope, `${publicOpenApi.url} missing gone route resolve envelope schema`);
      assert(publicOpenApi.json?.['x-backy']?.collectionIds?.includes(createdCollectionId), `${publicOpenApi.url} missing collection id vendor extension`);
      assert(publicOpenApi.json?.['x-backy']?.reusableSectionIds?.includes(manifestReusableSectionId), `${publicOpenApi.url} missing reusable section id vendor extension`);
      assert(publicOpenApi.json?.['x-backy']?.formIds?.includes('contract-form-write'), `${publicOpenApi.url} missing form id vendor extension`);
      assert(publicOpenApi.json?.['x-backy']?.redirectRules?.some((rule) => (
        rule.id === 'contract-redirect'
        && rule.from === `/old-${pageSlug}`
        && rule.statusCode === 301
      )), `${publicOpenApi.url} missing redirect rule vendor extension`);
    } finally {
      if (capturedTemplateSectionId) {
        await request(`/api/admin/sites/${createdSiteId}/reusable-sections/${capturedTemplateSectionId}`, { method: 'DELETE' }).catch(() => {});
      }
      if (manifestReusableSectionId) {
        await request(`/api/admin/sites/${createdSiteId}/reusable-sections/${manifestReusableSectionId}`, { method: 'DELETE' }).catch(() => {});
      }
      if (capturedTemplateFormId) {
        await request(`/api/admin/sites/${createdSiteId}/forms/${capturedTemplateFormId}`, { method: 'DELETE' }).catch(() => {});
      }
      if (formWritePageId) {
        await request(`/api/admin/sites/${createdSiteId}/pages/${formWritePageId}`, { method: 'DELETE' }).catch(() => {});
      }
    }

    const futureScheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const pastScheduledAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const createProductsCollection = await request(`/api/admin/sites/${createdSiteId}/collections`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Products',
        slug: 'products',
        listRoutePattern: '/products',
        routePattern: '/products/:recordSlug',
        status: 'published',
        fields: [
          { key: 'title', label: 'Title', type: 'text', required: true },
          { key: 'sku', label: 'SKU', type: 'text', required: true, unique: true },
          { key: 'description', label: 'Description', type: 'richText' },
          { key: 'price', label: 'Price', type: 'number', required: true },
          { key: 'currency', label: 'Currency', type: 'text', required: true },
          { key: 'featured', label: 'Featured', type: 'boolean' },
          { key: 'category', label: 'Category', type: 'text' },
          { key: 'tags', label: 'Tags', type: 'tags', options: ['Contract'] },
          { key: 'vendor', label: 'Vendor', type: 'text' },
          { key: 'productType', label: 'Product type', type: 'select', options: ['physical', 'digital', 'service'] },
          { key: 'inventory', label: 'Inventory', type: 'number' },
          { key: 'lowStockThreshold', label: 'Low stock threshold', type: 'number' },
          { key: 'inventoryPolicy', label: 'Inventory policy', type: 'select', options: ['deny', 'continue'] },
          { key: 'checkoutUrl', label: 'Checkout URL', type: 'url' },
        ],
        permissions: {
          publicRead: true,
          publicCreate: false,
          publicUpdate: false,
          publicDelete: false,
        },
      }),
    });
    assert(createProductsCollection.response.status === 201, `${createProductsCollection.url} expected 201, got ${createProductsCollection.response.status}`);
    assert(createProductsCollection.json?.data?.collection?.slug === 'products', `${createProductsCollection.url} returned wrong products collection slug`);
    commerceProductsCollectionId = createProductsCollection.json.data.collection.id;

    const createFutureProduct = await request(`/api/admin/sites/${createdSiteId}/collections/${commerceProductsCollectionId}/records`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        slug: futureProductSlug,
        status: 'scheduled',
        scheduledAt: futureScheduledAt,
        values: {
          title: 'Future Contract Product',
          sku: `FUTURE-${unique}`,
          description: 'Future scheduled commerce item',
          price: 49,
          currency: 'USD',
          featured: true,
          category: 'Contract',
          tags: ['Contract'],
          vendor: 'Backy',
          productType: 'physical',
          inventory: 10,
          lowStockThreshold: 2,
          inventoryPolicy: 'deny',
          checkoutUrl: 'https://example.test/checkout/future',
        },
      }),
    });
    assert(createFutureProduct.response.status === 201, `${createFutureProduct.url} expected 201, got ${createFutureProduct.response.status}`);
    commerceFutureProductRecordId = createFutureProduct.json.data.record.id;

    const hiddenFutureProduct = await request(`/api/sites/${createdSiteId}/commerce/catalog?slug=${futureProductSlug}`);
    assert(hiddenFutureProduct.response.status === 404, `${hiddenFutureProduct.url} expected future scheduled product to be hidden`);
    assert(hiddenFutureProduct.json?.error?.code === 'PRODUCT_NOT_FOUND', `${hiddenFutureProduct.url} expected PRODUCT_NOT_FOUND`);

    const createPastProduct = await request(`/api/admin/sites/${createdSiteId}/collections/${commerceProductsCollectionId}/records`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        slug: pastProductSlug,
        status: 'scheduled',
        scheduledAt: pastScheduledAt,
        values: {
          title: 'Past Contract Product',
          sku: `PAST-${unique}`,
          description: 'Past scheduled commerce item',
          price: 79,
          currency: 'USD',
          featured: true,
          category: 'Contract',
          tags: ['Contract'],
          vendor: 'Backy',
          productType: 'physical',
          inventory: 4,
          lowStockThreshold: 5,
          inventoryPolicy: 'deny',
          checkoutUrl: 'https://example.test/checkout/past',
        },
      }),
    });
    assert(createPastProduct.response.status === 201, `${createPastProduct.url} expected 201, got ${createPastProduct.response.status}`);
    commercePastProductRecordId = createPastProduct.json.data.record.id;

    const visiblePastProduct = await request(`/api/sites/${createdSiteId}/commerce/catalog?slug=${pastProductSlug}`);
    assert(visiblePastProduct.response.status === 200, `${visiblePastProduct.url} expected 200, got ${visiblePastProduct.response.status}`);
    assertBackyContract(visiblePastProduct, 'discovery');
    assert(visiblePastProduct.json?.data?.products?.[0]?.slug === pastProductSlug, `${visiblePastProduct.url} returned wrong scheduled product`);
    assert(visiblePastProduct.json?.data?.products?.[0]?.status === 'scheduled', `${visiblePastProduct.url} expected scheduled product status`);
    assert(visiblePastProduct.json?.data?.products?.[0]?.inventory?.lowStock === true, `${visiblePastProduct.url} expected low-stock signal`);

    const capturedProductTemplate = await request(`/api/admin/sites/${createdSiteId}/frontend-design`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'capture-content-template',
        resourceType: 'product',
        collectionId: commerceProductsCollectionId,
        resourceId: commercePastProductRecordId,
        templateId: 'captured-product-template',
        templateName: 'Captured Product Template',
      }),
    });
    assert(capturedProductTemplate.response.status === 200, `${capturedProductTemplate.url} expected product template capture 200`);
    const capturedProductTemplateEntry = capturedProductTemplate.json?.data?.frontendDesign?.templates?.find((template) => template.id === 'captured-product-template');
    assert(capturedProductTemplateEntry?.type === 'product', `${capturedProductTemplate.url} missing captured product template`);
    assert(capturedProductTemplateEntry?.content?.values?.sku === `PAST-${unique}`, `${capturedProductTemplate.url} did not preserve product values`);
    assert(capturedProductTemplateEntry?.routePattern === `/products/${pastProductSlug}`, `${capturedProductTemplate.url} did not preserve product route pattern`);

    const templateProductSlug = `admin-contract-template-product-${unique}`;
    const createProductFromTemplate = await request(`/api/admin/sites/${createdSiteId}/collections/${commerceProductsCollectionId}/records`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        frontendDesignTemplateId: 'captured-product-template',
        slug: templateProductSlug,
        status: 'published',
        values: {
          title: 'Captured Template Product',
          sku: `TEMPLATE-${unique}`,
        },
      }),
    });
    assert(createProductFromTemplate.response.status === 201, `${createProductFromTemplate.url} expected product from captured template`);
    const capturedTemplateProductRecordId = createProductFromTemplate.json?.data?.record?.id;
    assert(capturedTemplateProductRecordId, `${createProductFromTemplate.url} missing captured template product record id`);
    assert(createProductFromTemplate.json?.data?.record?.values?.frontendDesignTemplateId === 'captured-product-template', `${createProductFromTemplate.url} missing captured product provenance`);
    assert(createProductFromTemplate.json?.data?.record?.values?.price === 79, `${createProductFromTemplate.url} did not seed captured product values`);
    assert(createProductFromTemplate.json?.data?.record?.values?.sku === `TEMPLATE-${unique}`, `${createProductFromTemplate.url} did not preserve explicit product overrides`);
    const visibleTemplateProduct = await request(`/api/sites/${createdSiteId}/commerce/catalog?slug=${templateProductSlug}`);
    assert(visibleTemplateProduct.response.status === 200, `${visibleTemplateProduct.url} expected visible product from captured template`);
    assert(visibleTemplateProduct.json?.data?.products?.[0]?.design?.templateId === 'captured-product-template', `${visibleTemplateProduct.url} missing normalized captured product design`);
    const visibleTemplateProductRender = await request(`/api/sites/${createdSiteId}/render?path=${encodeURIComponent(`/products/${templateProductSlug}`)}`);
    assert(visibleTemplateProductRender.response.status === 200, `${visibleTemplateProductRender.url} expected visible product render from captured template`);
    validateAiRenderPayload(visibleTemplateProductRender.json, 'captured product render payload');
    assert(visibleTemplateProductRender.json?.data?.frontendDesign?.content?.templateId === 'captured-product-template', `${visibleTemplateProductRender.url} missing render product frontend design provenance`);
    assert(visibleTemplateProductRender.json?.data?.frontendDesign?.content?.routePattern === `/products/${pastProductSlug}`, `${visibleTemplateProductRender.url} missing render product frontend route pattern`);
    await request(`/api/admin/sites/${createdSiteId}/collections/${commerceProductsCollectionId}/records/${capturedTemplateProductRecordId}`, { method: 'DELETE' });

    const visibleCatalog = await request(`/api/sites/${createdSiteId}/commerce/catalog?limit=100`);
    assert(visibleCatalog.response.status === 200, `${visibleCatalog.url} expected 200, got ${visibleCatalog.response.status}`);
    assert(visibleCatalog.json?.data?.products?.some((product) => product.slug === pastProductSlug), `${visibleCatalog.url} missing past scheduled product`);
    assert(!visibleCatalog.json?.data?.products?.some((product) => product.slug === futureProductSlug), `${visibleCatalog.url} exposed future scheduled product`);
    assert(visibleCatalog.json?.data?.readiness?.publishedProducts >= 1, `${visibleCatalog.url} expected catalog readiness to count visible scheduled product`);

    const removeFutureProduct = await request(`/api/admin/sites/${createdSiteId}/collections/${commerceProductsCollectionId}/records/${commerceFutureProductRecordId}`, { method: 'DELETE' });
    assert(removeFutureProduct.response.status === 200, `${removeFutureProduct.url} expected 200, got ${removeFutureProduct.response.status}`);
    commerceFutureProductRecordId = null;

    const removePastProduct = await request(`/api/admin/sites/${createdSiteId}/collections/${commerceProductsCollectionId}/records/${commercePastProductRecordId}`, { method: 'DELETE' });
    assert(removePastProduct.response.status === 200, `${removePastProduct.url} expected 200, got ${removePastProduct.response.status}`);
    commercePastProductRecordId = null;

    const removeProductsCollection = await request(`/api/admin/sites/${createdSiteId}/collections/${commerceProductsCollectionId}`, { method: 'DELETE' });
    assert(removeProductsCollection.response.status === 200, `${removeProductsCollection.url} expected 200, got ${removeProductsCollection.response.status}`);
    commerceProductsCollectionId = null;

    const invalidRecord = await request(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}/records`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        slug: `${collectionRecordSlug}-invalid`,
        status: 'published',
        values: { summary: 'Missing required title' },
      }),
    });
    assert(invalidRecord.response.status === 400, `${invalidRecord.url} expected 400, got ${invalidRecord.response.status}`);
    assert(invalidRecord.json?.error?.code === 'VALIDATION_ERROR', `${invalidRecord.url} expected VALIDATION_ERROR`);

    const invalidOptionRecord = await request(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}/records`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        slug: `${collectionRecordSlug}-invalid-option`,
        status: 'published',
        values: {
          title: 'Invalid Option Record',
          category: 'Archived',
          labels: ['Launch'],
        },
      }),
    });
    assert(invalidOptionRecord.response.status === 400, `${invalidOptionRecord.url} expected 400, got ${invalidOptionRecord.response.status}`);
    assert(invalidOptionRecord.json?.error?.code === 'VALIDATION_ERROR', `${invalidOptionRecord.url} expected VALIDATION_ERROR`);

    const createRecord = await request(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}/records`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        slug: collectionRecordSlug,
        status: 'published',
        values: {
          title: 'Collection Record',
          summary: 'Reusable structured content',
          rank: 1,
          category: 'Featured',
          labels: ['Launch', 'Evergreen'],
          author: createdReferenceRecordId,
        },
      }),
    });
    assert(createRecord.response.status === 201, `${createRecord.url} expected 201, got ${createRecord.response.status}`);
    assert(createRecord.json?.data?.record?.slug === collectionRecordSlug, `${createRecord.url} returned wrong record slug`);
    assert(createRecord.json?.data?.record?.values?.rank === 1, `${createRecord.url} expected numeric rank`);
    createdCollectionRecordId = createRecord.json.data.record.id;
    const recordCreateAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=collectionRecord&entityId=${createdCollectionRecordId}&action=create&requestId=${createRecord.json.requestId}`);
    assert(recordCreateAudit.response.status === 200, `${recordCreateAudit.url} expected collection record create audit readback`);
    assert(recordCreateAudit.json?.data?.logs?.[0]?.metadata?.slug === collectionRecordSlug, `${recordCreateAudit.url} missing record create slug metadata`);
    assert(recordCreateAudit.json?.data?.logs?.[0]?.metadata?.collectionSlug === collectionSlug, `${recordCreateAudit.url} missing record create collection metadata`);
    assert(recordCreateAudit.json?.data?.logs?.[0]?.after?.status === 'published', `${recordCreateAudit.url} missing record create after snapshot`);

    const duplicateRecord = await request(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}/records`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        slug: `${collectionRecordSlug}-duplicate-title`,
        status: 'published',
        values: {
          title: 'Collection Record',
        },
      }),
    });
    assert(duplicateRecord.response.status === 400, `${duplicateRecord.url} expected 400, got ${duplicateRecord.response.status}`);

    const publicRecords = await request(`/api/sites/${createdSiteId}/collections/${createdCollectionId}/records?slug=${collectionRecordSlug}`);
    assert(publicRecords.response.status === 200, `${publicRecords.url} expected 200, got ${publicRecords.response.status}`);
    assert(publicRecords.response.headers.get('x-backy-cache-scope') === 'discovery', `${publicRecords.url} missing discovery cache scope`);
    assert(publicRecords.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${publicRecords.url} missing contract version header`);
    assert(publicRecords.response.headers.get('x-backy-site-id') === createdSiteId, `${publicRecords.url} missing site id header`);
    const publicRecordsCacheRevision = publicRecords.response.headers.get('x-backy-cache-revision');
    assert(publicRecordsCacheRevision, `${publicRecords.url} missing collection records cache revision`);
    const publicRecordsEtag = publicRecords.response.headers.get('etag');
    assert(publicRecordsEtag?.startsWith('"backy-'), `${publicRecords.url} missing collection records etag`);
    const revalidatedPublicRecords = await request(`/api/sites/${createdSiteId}/collections/${createdCollectionId}/records?slug=${collectionRecordSlug}`, {
      headers: { 'if-none-match': publicRecordsEtag },
    });
    assert(revalidatedPublicRecords.response.status === 304, `${revalidatedPublicRecords.url} expected collection records 304, got ${revalidatedPublicRecords.response.status}`);
    assert(revalidatedPublicRecords.response.headers.get('etag') === publicRecordsEtag, `${revalidatedPublicRecords.url} expected matching collection records etag`);
    assert(revalidatedPublicRecords.response.headers.get('x-backy-cache-revision') === publicRecordsCacheRevision, `${revalidatedPublicRecords.url} expected matching collection records cache revision`);
    assert(publicRecords.json?.success === true, `${publicRecords.url} expected success envelope`);
    assert(publicRecords.json?.data?.records?.[0]?.id === createdCollectionRecordId, `${publicRecords.url} returned wrong public collection record in data envelope`);
    assert(publicRecords.json?.records?.[0]?.id === createdCollectionRecordId, `${publicRecords.url} returned wrong public collection record`);

    const filteredRecords = await request(`/api/sites/${createdSiteId}/collections/${createdCollectionId}/records?fieldKey=title&fieldValue=${encodeURIComponent('Collection Record')}&q=${encodeURIComponent('Reusable')}&sortBy=rank&sortDirection=desc`);
    assert(filteredRecords.response.status === 200, `${filteredRecords.url} expected 200, got ${filteredRecords.response.status}`);
    assert(filteredRecords.json?.success === true, `${filteredRecords.url} expected success envelope`);
    assert(filteredRecords.json?.records?.[0]?.id === createdCollectionRecordId, `${filteredRecords.url} did not filter/search collection records`);

    const adminFilteredRecords = await request(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}/records?fieldKey=title&fieldValue=${encodeURIComponent('Collection Record')}&sortBy=rank&sortDirection=desc`);
    assert(adminFilteredRecords.response.status === 200, `${adminFilteredRecords.url} expected 200, got ${adminFilteredRecords.response.status}`);
    assert(adminFilteredRecords.json?.data?.records?.[0]?.id === createdCollectionRecordId, `${adminFilteredRecords.url} did not filter admin collection records`);
    assert(adminFilteredRecords.json?.data?.pagination?.total >= 1, `${adminFilteredRecords.url} missing admin collection record pagination`);

    const adminCsvExport = await request(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}/records?format=csv&fieldKey=title&fieldValue=${encodeURIComponent('Collection Record')}&sortBy=rank&sortDirection=desc`);
    assert(adminCsvExport.response.status === 200, `${adminCsvExport.url} expected 200, got ${adminCsvExport.response.status}`);
    assert(adminCsvExport.response.headers.get('content-type')?.includes('text/csv'), `${adminCsvExport.url} expected CSV content type`);
    assert(adminCsvExport.response.headers.get('content-disposition')?.includes(`${collectionSlug}-records.csv`), `${adminCsvExport.url} missing CSV filename`);
    assert(adminCsvExport.text.startsWith('id,slug,status,createdAt,updatedAt,publishedAt,scheduledAt,title,summary,rank,category,labels'), `${adminCsvExport.url} missing CSV header`);
    assert(adminCsvExport.text.includes(collectionRecordSlug) && adminCsvExport.text.includes('Collection Record'), `${adminCsvExport.url} missing exported collection record`);

    const collectionBackupExport = await request(`/api/admin/sites/${createdSiteId}/collections/export?ids=${createdCollectionId}`);
    assert(collectionBackupExport.response.status === 200, `${collectionBackupExport.url} expected collection backup export 200`);
    assert(collectionBackupExport.response.headers.get('content-disposition')?.includes('collections-backup.json'), `${collectionBackupExport.url} missing backup filename`);
    assert(collectionBackupExport.json?.data?.backup?.schemaVersion === 'backy.collections.backup.v1', `${collectionBackupExport.url} missing backup schema version`);
    assert(collectionBackupExport.json?.data?.backup?.collectionCount === 1, `${collectionBackupExport.url} expected one exported collection`);
    assert(collectionBackupExport.json?.data?.backup?.recordCount >= 1, `${collectionBackupExport.url} expected exported records`);
    const exportedCollection = collectionBackupExport.json?.data?.collections?.[0];
    assert(exportedCollection?.slug === collectionSlug, `${collectionBackupExport.url} exported wrong collection slug`);
    assert(exportedCollection?.records?.some((record) => record.slug === collectionRecordSlug), `${collectionBackupExport.url} missing exported collection record`);

    const backupCollectionSlug = `${collectionSlug}-backup`;
    const backupRecordSlug = `${collectionRecordSlug}-backup`;
    const backupImportCollection = {
      ...exportedCollection,
      name: 'Backup Restored Collection',
      slug: backupCollectionSlug,
      listRoutePattern: `/directory-backup-${unique}`,
      routePattern: `/directory-backup-${unique}/:recordSlug`,
      records: exportedCollection.records
        .filter((record) => record.slug === collectionRecordSlug)
        .map((record) => ({
          ...record,
          slug: backupRecordSlug,
          values: {
            ...record.values,
            title: 'Backup Restored Record',
          },
        })),
    };
    const backupImport = await request(`/api/admin/sites/${createdSiteId}/collections/import?upsert=true`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        collections: [backupImportCollection],
      }),
    });
    assert(backupImport.response.status === 200, `${backupImport.url} expected collection backup import 200`);
    assert(backupImport.json?.data?.import?.createdCollections === 1, `${backupImport.url} expected one imported collection`);
    assert(backupImport.json?.data?.import?.createdRecords === 1, `${backupImport.url} expected one imported record`);
    const backupCollectionId = backupImport.json?.data?.collections?.[0]?.id;
    const backupRecordId = backupImport.json?.data?.records?.[0]?.id;
    assert(backupCollectionId && backupRecordId, `${backupImport.url} missing imported collection or record id`);
    const backupImportedRecords = await request(`/api/admin/sites/${createdSiteId}/collections/${backupCollectionId}/records?slug=${backupRecordSlug}`);
    assert(backupImportedRecords.response.status === 200, `${backupImportedRecords.url} expected imported record readback 200`);
    assert(backupImportedRecords.json?.data?.records?.[0]?.values?.title === 'Backup Restored Record', `${backupImportedRecords.url} missing restored record values`);
    const backupImportAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=collection&entityId=${backupCollectionId}&action=collection.import&requestId=${backupImport.json.requestId}`);
    assert(backupImportAudit.response.status === 200, `${backupImportAudit.url} expected collection import audit readback`);
    assert(backupImportAudit.json?.data?.logs?.[0]?.metadata?.createdCollections === 1, `${backupImportAudit.url} missing collection import audit metadata`);
    await request(`/api/admin/sites/${createdSiteId}/collections/${backupCollectionId}/records/${backupRecordId}`, { method: 'DELETE' });
    await request(`/api/admin/sites/${createdSiteId}/collections/${backupCollectionId}`, { method: 'DELETE' });

    const editorSessionToken = await loginAdminCredentials('jane@backy.io', process.env.BACKY_EDITOR_DEMO_PASSWORD || 'editor123');
    const editorListCollections = await requestWithSession(`/api/admin/sites/${createdSiteId}/collections`, editorSessionToken);
    assert(editorListCollections.response.status === 200, `${editorListCollections.url} expected editor collection view access`);
    assert(editorListCollections.json?.data?.collections?.some((collection) => collection.id === createdCollectionId), `${editorListCollections.url} missing editor-visible collection`);

    const editorCsvExport = await requestWithSession(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}/records?format=csv`, editorSessionToken);
    assert(editorCsvExport.response.status === 403, `${editorCsvExport.url} expected editor export denial, got ${editorCsvExport.response.status}`);
    assert(editorCsvExport.json?.error?.code === 'FORBIDDEN_PERMISSION', `${editorCsvExport.url} expected FORBIDDEN_PERMISSION for collection export`);

    const editorDeleteRecord = await requestWithSession(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}/records/${createdCollectionRecordId}`, editorSessionToken, { method: 'DELETE' });
    assert(editorDeleteRecord.response.status === 403, `${editorDeleteRecord.url} expected editor delete denial, got ${editorDeleteRecord.response.status}`);
    assert(editorDeleteRecord.json?.error?.code === 'FORBIDDEN_PERMISSION', `${editorDeleteRecord.url} expected FORBIDDEN_PERMISSION for collection record delete`);

    const denyEditorCollectionEdit = await request('/api/admin/users/user-editor/permissions', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        overrides: {
          'collections.edit': 'deny',
        },
      }),
    });
    assert(denyEditorCollectionEdit.response.status === 200, `${denyEditorCollectionEdit.url} expected editor edit-deny override`);
    try {
      const blockedEditorRecordCreate = await requestWithSession(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}/records`, editorSessionToken, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          slug: `${collectionRecordSlug}-editor-denied`,
          status: 'draft',
          values: {
            title: 'Editor Denied Record',
          },
        }),
      });
      assert(blockedEditorRecordCreate.response.status === 403, `${blockedEditorRecordCreate.url} expected denied editor create, got ${blockedEditorRecordCreate.response.status}`);
      assert(blockedEditorRecordCreate.json?.error?.code === 'FORBIDDEN_PERMISSION', `${blockedEditorRecordCreate.url} expected FORBIDDEN_PERMISSION for denied collection edit`);
    } finally {
      const restoreEditorCollectionEdit = await request('/api/admin/users/user-editor/permissions', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          overrides: {
            'collections.edit': null,
          },
        }),
      });
      assert(restoreEditorCollectionEdit.response.status === 200, `${restoreEditorCollectionEdit.url} expected editor edit override restore`);
    }

    const importedCollectionRecordSlug = `${collectionRecordSlug}-imported`;
    const importCsv = [
      'slug,status,title,summary,rank,category,labels',
      `${importedCollectionRecordSlug},published,Imported Collection Record,"Imported, structured content",2,Standard,"Launch, Evergreen"`,
    ].join('\n');
    const importRecords = await request(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}/records/import?upsert=true`, {
      method: 'POST',
      headers: {
        'content-type': 'text/csv; charset=utf-8',
      },
      body: importCsv,
    });
    assert(importRecords.response.status === 200, `${importRecords.url} expected 200, got ${importRecords.response.status}`);
    assert(importRecords.json?.data?.import?.created === 1, `${importRecords.url} expected one imported record`);
    assert(importRecords.json?.data?.records?.[0]?.slug === importedCollectionRecordSlug, `${importRecords.url} returned wrong imported record`);
    assert(importRecords.json?.data?.records?.[0]?.values?.summary === 'Imported, structured content', `${importRecords.url} did not parse quoted CSV field`);
    assert(importRecords.json?.data?.records?.[0]?.values?.rank === 2, `${importRecords.url} did not import numeric fields as numbers`);
    assert(Array.isArray(importRecords.json?.data?.records?.[0]?.values?.labels), `${importRecords.url} did not import tags as arrays`);
    assert(importRecords.json?.data?.records?.[0]?.values?.labels?.includes('Evergreen'), `${importRecords.url} did not import expected tag value`);

    const bulkRecordOne = await request(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}/records`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        slug: `${collectionRecordSlug}-bulk-one`,
        status: 'draft',
        values: {
          title: 'Bulk Record One',
          summary: 'Temporary bulk record',
          rank: 3,
          category: 'Featured',
          labels: ['Internal'],
        },
      }),
    });
    assert(bulkRecordOne.response.status === 201, `${bulkRecordOne.url} expected 201, got ${bulkRecordOne.response.status}`);

    const bulkRecordTwo = await request(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}/records`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        slug: `${collectionRecordSlug}-bulk-two`,
        status: 'draft',
        values: {
          title: 'Bulk Record Two',
          summary: 'Temporary bulk record',
          rank: 4,
          category: 'Standard',
          labels: ['Internal'],
        },
      }),
    });
    assert(bulkRecordTwo.response.status === 201, `${bulkRecordTwo.url} expected 201, got ${bulkRecordTwo.response.status}`);

    const bulkRecordIds = [
      bulkRecordOne.json?.data?.record?.id,
      bulkRecordTwo.json?.data?.record?.id,
    ].filter(Boolean);
    const bulkPublish = await request(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}/records/bulk`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'updateStatus',
        recordIds: bulkRecordIds,
        status: 'published',
      }),
    });
    assert(bulkPublish.response.status === 200, `${bulkPublish.url} expected 200, got ${bulkPublish.response.status}`);
    assert(bulkPublish.json?.data?.updated === 2, `${bulkPublish.url} expected two bulk-updated records`);
    assert(bulkPublish.json?.data?.records?.every((record) => record.status === 'published'), `${bulkPublish.url} expected published records`);
    const bulkPublishAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=collectionRecord&entityId=${bulkRecordIds[0]}&action=update&requestId=${bulkPublish.json.requestId}`);
    assert(bulkPublishAudit.response.status === 200, `${bulkPublishAudit.url} expected bulk publish audit readback`);
    assert(bulkPublishAudit.json?.data?.logs?.some((entry) => (
      entry.metadata?.bulk === true
      && entry.metadata?.bulkAction === 'updateStatus'
      && entry.metadata?.matchedCount === 2
      && entry.before?.status === 'draft'
      && entry.after?.status === 'published'
    )), `${bulkPublishAudit.url} missing bulk publish audit log`);

    const bulkDelete = await request(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}/records/bulk`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'delete',
        recordIds: bulkRecordIds,
      }),
    });
    assert(bulkDelete.response.status === 200, `${bulkDelete.url} expected 200, got ${bulkDelete.response.status}`);
    assert(bulkDelete.json?.data?.deleted === 2, `${bulkDelete.url} expected two bulk-deleted records`);
    const bulkDeleteAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=collectionRecord&entityId=${bulkRecordIds[0]}&action=delete&requestId=${bulkDelete.json.requestId}`);
    assert(bulkDeleteAudit.response.status === 200, `${bulkDeleteAudit.url} expected bulk delete audit readback`);
    assert(bulkDeleteAudit.json?.data?.logs?.some((entry) => (
      entry.metadata?.bulk === true
      && entry.metadata?.bulkAction === 'delete'
      && entry.metadata?.matchedCount === 2
      && entry.before?.status === 'published'
    )), `${bulkDeleteAudit.url} missing bulk delete audit log`);

    const dynamicListPath = `/directory`;
    const dynamicListResolve = await request(`/api/sites/${createdSiteId}/resolve?path=${encodeURIComponent(dynamicListPath)}`);
    assert(dynamicListResolve.response.status === 200, `${dynamicListResolve.url} expected 200, got ${dynamicListResolve.response.status}`);
    assert(dynamicListResolve.response.headers.get('x-backy-cache-scope') === 'discovery', `${dynamicListResolve.url} missing dynamic list resolve cache scope`);
    assert(dynamicListResolve.response.headers.get('etag')?.startsWith('"backy-'), `${dynamicListResolve.url} missing dynamic list resolve etag`);
    assert(dynamicListResolve.json?.data?.route?.type === 'dynamicList', `${dynamicListResolve.url} expected dynamic list route`);
    assert(dynamicListResolve.json?.data?.route?.resource?.id === createdCollectionId, `${dynamicListResolve.url} returned wrong dynamic list collection`);
    assert(dynamicListResolve.json?.data?.route?.resource?.recordsUrl === `/api/sites/${createdSiteId}/collections/${createdCollectionId}/records`, `${dynamicListResolve.url} returned wrong dynamic list records URL`);

    const dynamicListRender = await request(`/api/sites/${createdSiteId}/render?path=${encodeURIComponent(dynamicListPath)}`);
    assert(dynamicListRender.response.status === 200, `${dynamicListRender.url} expected 200, got ${dynamicListRender.response.status}`);
    validateAiRenderPayload(dynamicListRender.json, 'collection dynamic list render payload');
    assert(dynamicListRender.json?.data?.route?.type === 'dynamicList', `${dynamicListRender.url} expected dynamic list render route`);
    assert(dynamicListRender.json?.data?.content?.kind === 'dynamicList', `${dynamicListRender.url} expected dynamic list content`);
    assert(dynamicListRender.json?.data?.content?.id === createdCollectionId, `${dynamicListRender.url} returned wrong rendered collection`);
    assert(dynamicListRender.json?.data?.frontendDesign?.content?.templateId === 'imported-external-collection-template', `${dynamicListRender.url} missing dynamic list frontend template provenance`);
    assert(
      dynamicListRender.json?.data?.content?.elements?.some((element) => (
        element.id === 'imported-collection-list-root'
        && element.children?.some((child) => child.id === 'imported-collection-list-title' && child.props?.content === 'Admin Contract Collection')
      )),
      `${dynamicListRender.url} did not render imported collection list template`,
    );
    assert(
      dynamicListRender.json?.data?.content?.elements?.some((element) => (
        element.id === 'imported-collection-list-root'
        && element.children?.some((child) => child.id === 'imported-collection-list-repeater' && child.props?.collectionId === createdCollectionId)
      )),
      `${dynamicListRender.url} did not bind imported collection list repeater`,
    );
    assert(
      dynamicListRender.json?.data?.dataBindings?.datasets?.some((dataset) => (
        dataset.id === `dataset_${createdCollectionId}_list`
        && dataset.collectionId === createdCollectionId
        && dataset.records?.some((record) => record.id === createdCollectionRecordId && record.values?.title === 'Collection Record')
      )),
      `${dynamicListRender.url} missing dynamic list dataset record`,
    );

    const hostedDynamicList = await request(`/sites/${siteSlug}${dynamicListPath}`);
    assert(hostedDynamicList.response.status === 200, `${hostedDynamicList.url} expected hosted dynamic list page`);
    assert(hostedDynamicList.text.includes('Admin Contract Collection'), `${hostedDynamicList.url} missing hosted dynamic list title`);
    assert(hostedDynamicList.text.includes('Collection Record'), `${hostedDynamicList.url} missing hosted dynamic list record`);

    const dynamicItemPath = `/directory/${collectionRecordSlug}`;
    const dynamicResolve = await request(`/api/sites/${createdSiteId}/resolve?path=${encodeURIComponent(dynamicItemPath)}`);
    assert(dynamicResolve.response.status === 200, `${dynamicResolve.url} expected 200, got ${dynamicResolve.response.status}`);
    assert(dynamicResolve.response.headers.get('x-backy-cache-scope') === 'discovery', `${dynamicResolve.url} missing dynamic item resolve cache scope`);
    assert(dynamicResolve.response.headers.get('etag')?.startsWith('"backy-'), `${dynamicResolve.url} missing dynamic item resolve etag`);
    assert(dynamicResolve.json?.data?.route?.type === 'dynamicItem', `${dynamicResolve.url} expected dynamic item route`);
    assert(dynamicResolve.json?.data?.route?.resource?.id === createdCollectionRecordId, `${dynamicResolve.url} returned wrong dynamic item record`);
    assert(dynamicResolve.json?.data?.route?.resource?.collectionId === createdCollectionId, `${dynamicResolve.url} returned wrong dynamic item collection`);

    const dynamicRender = await request(`/api/sites/${createdSiteId}/render?path=${encodeURIComponent(dynamicItemPath)}`);
    assert(dynamicRender.response.status === 200, `${dynamicRender.url} expected 200, got ${dynamicRender.response.status}`);
    validateAiRenderPayload(dynamicRender.json, 'collection dynamic item render payload');
    assert(dynamicRender.json?.data?.route?.type === 'dynamicItem', `${dynamicRender.url} expected dynamic item render route`);
    assert(dynamicRender.json?.data?.content?.kind === 'dynamicItem', `${dynamicRender.url} expected dynamic item content`);
    assert(dynamicRender.json?.data?.content?.id === createdCollectionRecordId, `${dynamicRender.url} returned wrong rendered collection record`);
    assert(dynamicRender.json?.data?.frontendDesign?.content?.templateId === 'imported-external-collection-template', `${dynamicRender.url} missing dynamic item frontend template provenance`);
    assert(
      dynamicRender.json?.data?.content?.elements?.some((element) => (
        element.id === 'imported-collection-item-root'
        && element.children?.some((child) => child.id === 'imported-collection-item-title' && child.props?.content === 'Collection Record')
      )),
      `${dynamicRender.url} did not render imported collection item template`,
    );
    assert(
      dynamicRender.json?.data?.editableMap?.[`collection.${createdCollectionId}.imported-collection-item-title.title`]?.recordId === createdCollectionRecordId,
      `${dynamicRender.url} missing editable map for imported collection item title`,
    );
    assert(
      dynamicRender.json?.data?.dataBindings?.datasets?.some((dataset) => (
        dataset.collectionId === createdCollectionId
        && dataset.records?.some((record) => record.id === createdCollectionRecordId && record.values?.title === 'Collection Record')
      )),
      `${dynamicRender.url} missing dynamic item dataset record`,
    );
    assert(
      dynamicRender.json?.data?.dataBindings?.datasets?.some((dataset) => (
        dataset.collectionId === createdCollectionId
        && dataset.fields?.some((field) => field.key === 'category' && field.options?.includes('Featured'))
        && dataset.fields?.some((field) => field.key === 'labels' && field.options?.includes('Evergreen'))
      )),
      `${dynamicRender.url} missing dynamic item field option metadata`,
    );

    const hostedDynamicItem = await request(`/sites/${siteSlug}${dynamicItemPath}`);
    assert(hostedDynamicItem.response.status === 200, `${hostedDynamicItem.url} expected hosted dynamic item page`);
    assert(hostedDynamicItem.text.includes('Collection Record'), `${hostedDynamicItem.url} missing hosted dynamic item title`);

    const reverseDynamicItemPath = `/${nestedReferenceCollectionSlug}/${nestedReferenceRecordSlug}`;
    const reverseDynamicRender = await request(`/api/sites/${createdSiteId}/render?path=${encodeURIComponent(reverseDynamicItemPath)}`);
    assert(reverseDynamicRender.response.status === 200, `${reverseDynamicRender.url} expected reverse dynamic item render`);
    validateAiRenderPayload(reverseDynamicRender.json, 'collection reverse dynamic item render payload');
    const reverseRepeaterElement = reverseDynamicRender.json?.data?.content?.elements
      ?.find((element) => element.id === 'imported-collection-item-root')
      ?.children?.find((child) => child.id === 'imported-collection-item-reverse-authors');
    assert(
      reverseRepeaterElement?.type === 'repeater'
      && reverseRepeaterElement.props?.datasetId === 'dataset_contract_reverse_authors'
      && reverseRepeaterElement.props?.query?.fieldKey === 'company'
      && reverseRepeaterElement.props?.query?.fieldValue === createdNestedReferenceRecordId
      && reverseRepeaterElement.props?.records?.some((record) => record.id === createdReferenceRecordId && record.values?.name === 'Contract Author'),
      `${reverseDynamicRender.url} did not resolve reverse relationship repeater records: ${JSON.stringify(reverseRepeaterElement).slice(0, 1200)}`,
    );

    const createBoundPage = await request(`/api/admin/sites/${createdSiteId}/pages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Collection Bound Contract Page',
        slug: boundPageSlug,
        status: 'published',
        content: {
          canvasSize: { width: 1200, height: 900 },
          elements: [
            {
              id: 'bound_title',
              type: 'text',
              x: 100,
              y: 100,
              width: 420,
              height: 80,
              props: { content: 'Fallback title' },
              children: [],
              dataBindings: [
                {
                  id: 'bind_bound_title',
                  datasetId: 'dataset_contract_collection',
                  targetPath: 'props.content',
                  source: {
                    kind: 'collection',
                    collectionId: createdCollectionId,
                    field: 'title',
                    recordId: createdCollectionRecordId,
                  },
                  mode: 'text',
                },
              ],
            },
            {
              id: 'bound_author',
              type: 'text',
              x: 100,
              y: 185,
              width: 420,
              height: 48,
              props: { content: 'Fallback author' },
              children: [],
              dataBindings: [
                {
                  id: 'bind_bound_author',
                  datasetId: 'dataset_contract_collection_author',
                  targetPath: 'props.content',
                  source: {
                    kind: 'collection',
                    collectionId: createdCollectionId,
                    field: 'author',
                    path: 'author.company.name',
                  },
                  query: {
                    fieldKey: 'author.company.name',
                    fieldValue: 'Contract Company',
                    sortBy: 'author.company.domain',
                    sortDirection: 'desc',
                  },
                  mode: 'text',
                },
              ],
            },
            {
              id: 'bound_repeater',
              type: 'repeater',
              x: 100,
              y: 220,
              width: 720,
              height: 260,
              props: {
                collectionId: createdCollectionId,
                datasetId: 'dataset_contract_repeater',
                titleField: 'author.company.name',
                descriptionField: 'summary',
                query: {
                  fieldKey: 'author.company.name',
                  fieldValue: 'Contract Company',
                  sortBy: 'author.company.domain',
                  sortDirection: 'desc',
                },
                columns: 2,
                limit: 6,
              },
              children: [],
            },
          ],
        },
      }),
    });
    assert(createBoundPage.response.status === 201, `${createBoundPage.url} expected 201, got ${createBoundPage.response.status}`);
    createdPageId = createBoundPage.json.data.page.id;

    const boundRender = await request(`/api/sites/${createdSiteId}/render?path=/${boundPageSlug}`);
    assert(boundRender.response.status === 200, `${boundRender.url} expected 200, got ${boundRender.response.status}`);
    validateAiRenderPayload(boundRender.json, 'collection-bound page render payload');
    assert(
      boundRender.json?.data?.dataBindings?.datasets?.some((dataset) => dataset.id === 'dataset_contract_collection' && dataset.collectionId === createdCollectionId),
      `${boundRender.url} missing collection dataset manifest`,
    );
    assert(
      boundRender.json?.data?.dataBindings?.datasets?.some((dataset) => (
        dataset.id === 'dataset_contract_collection'
        && dataset.fields?.some((field) => field.key === 'title' && field.type === 'text')
        && dataset.records?.some((record) => record.id === createdCollectionRecordId && record.values?.title === 'Collection Record')
      )),
      `${boundRender.url} missing hydrated collection dataset records`,
    );
    assert(
      boundRender.json?.data?.dataBindings?.datasets?.some((dataset) => (
        dataset.id === 'dataset_contract_repeater'
        && dataset.collectionId === createdCollectionId
        && dataset.query?.fieldKey === 'author.company.name'
        && dataset.query?.fieldValue === 'Contract Company'
        && dataset.query?.sortBy === 'author.company.domain'
        && dataset.records?.some((record) => record.id === createdCollectionRecordId)
      )),
      `${boundRender.url} missing repeater dataset manifest`,
    );
    assert(
      boundRender.json?.data?.dataBindings?.bindings?.some((binding) => (
        binding.id === 'bind_bound_title'
        && binding.elementId === 'bound_title'
        && binding.source?.collectionId === createdCollectionId
        && binding.source?.field === 'title'
      )),
      `${boundRender.url} missing collection binding manifest`,
    );
    assert(
      boundRender.json?.data?.dataBindings?.bindings?.some((binding) => (
        binding.id === 'bind_bound_author'
        && binding.elementId === 'bound_author'
        && binding.source?.collectionId === createdCollectionId
        && binding.source?.field === 'author'
        && binding.source?.path === 'author.company.name'
      )),
      `${boundRender.url} missing joined collection binding manifest`,
    );
    assert(
      boundRender.json?.data?.content?.elements?.some((element) => (
        element.id === 'bound_title'
        && element.props?.content === 'Collection Record'
      )),
      `${boundRender.url} did not resolve bound collection value into element props`,
    );
    assert(
      boundRender.json?.data?.content?.elements?.some((element) => (
        element.id === 'bound_author'
        && element.props?.content === 'Contract Company'
      )),
      `${boundRender.url} did not resolve joined collection value into element props`,
    );
    assert(
      boundRender.json?.data?.content?.elements?.some((element) => (
        element.id === 'bound_repeater'
        && element.type === 'repeater'
        && element.props?.datasetId === 'dataset_contract_repeater'
        && element.props?.titleField === 'author.company.name'
        && element.props?.records?.some((record) => (
          record.id === createdCollectionRecordId
          && record.href === dynamicItemPath
          && record.values?.['author.company.name'] === 'Contract Company'
        ))
      )),
      `${boundRender.url} did not hydrate joined repeater records into element props`,
    );
    assert(
      boundRender.json?.data?.editableMap?.[`collection.${createdCollectionId}.bound_title.title`]?.scope === 'collectionRecord',
      `${boundRender.url} missing collection record editable map entry`,
    );

    const hostedBoundPage = await request(`/sites/${siteSlug}/${boundPageSlug}`);
    assert(hostedBoundPage.response.status === 200, `${hostedBoundPage.url} expected hosted bound page`);
    assert(hostedBoundPage.text.includes('Collection Record'), `${hostedBoundPage.url} missing hosted repeater record`);
    assert(hostedBoundPage.text.includes('Contract Company'), `${hostedBoundPage.url} missing hosted joined collection value`);

    const removeBoundPage = await request(`/api/admin/sites/${createdSiteId}/pages/${createdPageId}`, { method: 'DELETE' });
    assert(removeBoundPage.response.status === 200, `${removeBoundPage.url} expected 200, got ${removeBoundPage.response.status}`);
    createdPageId = null;

    const collectionRecordSchedule = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const updateRecord = await request(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}/records/${createdCollectionRecordId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        scheduledAt: collectionRecordSchedule,
        values: {
          summary: 'Updated structured content',
          rank: 2,
        },
      }),
    });
    assert(updateRecord.response.status === 200, `${updateRecord.url} expected 200, got ${updateRecord.response.status}`);
    assert(updateRecord.json?.data?.record?.scheduledAt === collectionRecordSchedule, `${updateRecord.url} expected updated schedule`);
    assert(updateRecord.json?.data?.record?.values?.summary === 'Updated structured content', `${updateRecord.url} expected updated summary`);
    assert(updateRecord.json?.data?.record?.values?.title === 'Collection Record', `${updateRecord.url} expected partial update to preserve title`);
    const recordUpdateAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=collectionRecord&entityId=${createdCollectionRecordId}&action=update&requestId=${updateRecord.json.requestId}`);
    assert(recordUpdateAudit.response.status === 200, `${recordUpdateAudit.url} expected collection record update audit readback`);
    assert(recordUpdateAudit.json?.data?.logs?.[0]?.metadata?.changedFields?.includes('values'), `${recordUpdateAudit.url} missing record update changedFields metadata`);
    assert(recordUpdateAudit.json?.data?.logs?.[0]?.metadata?.changedFields?.includes('scheduledAt'), `${recordUpdateAudit.url} missing record schedule changedFields metadata`);
    assert(recordUpdateAudit.json?.data?.logs?.[0]?.before?.slug === collectionRecordSlug, `${recordUpdateAudit.url} missing record update before snapshot`);
    assert(recordUpdateAudit.json?.data?.logs?.[0]?.after?.scheduledAt === collectionRecordSchedule, `${recordUpdateAudit.url} missing record update after schedule`);
    assert(recordUpdateAudit.json?.data?.logs?.[0]?.after?.valueKeys?.includes('summary'), `${recordUpdateAudit.url} missing record update after value keys`);

    const hideCollection = await request(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status: 'draft' }),
    });
    assert(hideCollection.response.status === 200, `${hideCollection.url} expected 200, got ${hideCollection.response.status}`);

    const hiddenPublicCollection = await request(`/api/sites/${createdSiteId}/collections/${createdCollectionId}`);
    assert(hiddenPublicCollection.response.status === 404, `${hiddenPublicCollection.url} expected draft collection to be hidden`);
    assert(hiddenPublicCollection.json?.success === false, `${hiddenPublicCollection.url} expected error envelope`);
    assert(hiddenPublicCollection.json?.error?.code === 'COLLECTION_NOT_FOUND', `${hiddenPublicCollection.url} expected COLLECTION_NOT_FOUND`);

    const hiddenDynamicResolve = await request(`/api/sites/${createdSiteId}/resolve?path=${encodeURIComponent(dynamicItemPath)}`);
    assert(hiddenDynamicResolve.response.status === 404, `${hiddenDynamicResolve.url} expected draft collection dynamic route to be hidden`);

    const hiddenDynamicRender = await request(`/api/sites/${createdSiteId}/render?path=${encodeURIComponent(dynamicItemPath)}`);
    assert(hiddenDynamicRender.response.status === 404, `${hiddenDynamicRender.url} expected draft collection dynamic render to be hidden`);

    const hiddenDynamicListResolve = await request(`/api/sites/${createdSiteId}/resolve?path=${encodeURIComponent(dynamicListPath)}`);
    assert(hiddenDynamicListResolve.response.status === 404, `${hiddenDynamicListResolve.url} expected draft collection dynamic list route to be hidden`);

    const hiddenDynamicListRender = await request(`/api/sites/${createdSiteId}/render?path=${encodeURIComponent(dynamicListPath)}`);
    assert(hiddenDynamicListRender.response.status === 404, `${hiddenDynamicListRender.url} expected draft collection dynamic list render to be hidden`);

    const hiddenHostedDynamicList = await request(`/sites/${siteSlug}${dynamicListPath}`);
    assert(hiddenHostedDynamicList.response.status === 404, `${hiddenHostedDynamicList.url} expected draft collection hosted dynamic list to be hidden`);

    const removeRecord = await request(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}/records/${createdCollectionRecordId}`, { method: 'DELETE' });
    assert(removeRecord.response.status === 200, `${removeRecord.url} expected 200, got ${removeRecord.response.status}`);
    assert(removeRecord.json?.data?.deleted === true, `${removeRecord.url} expected deleted record`);
    const recordDeleteAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=collectionRecord&entityId=${createdCollectionRecordId}&action=delete&requestId=${removeRecord.json.requestId}`);
    assert(recordDeleteAudit.response.status === 200, `${recordDeleteAudit.url} expected collection record delete audit readback`);
    assert(recordDeleteAudit.json?.data?.logs?.[0]?.metadata?.slug === collectionRecordSlug, `${recordDeleteAudit.url} missing record delete slug metadata`);
    assert(recordDeleteAudit.json?.data?.logs?.[0]?.before?.collectionSlug === collectionSlug, `${recordDeleteAudit.url} missing record delete before snapshot`);
    createdCollectionRecordId = null;

    const removeCollection = await request(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}`, { method: 'DELETE' });
    assert(removeCollection.response.status === 200, `${removeCollection.url} expected 200, got ${removeCollection.response.status}`);
    assert(removeCollection.json?.data?.deleted === true, `${removeCollection.url} expected deleted collection`);
    const collectionDeleteAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=collection&entityId=${createdCollectionId}&action=delete&requestId=${removeCollection.json.requestId}`);
    assert(collectionDeleteAudit.response.status === 200, `${collectionDeleteAudit.url} expected collection delete audit readback`);
    assert(collectionDeleteAudit.json?.data?.logs?.[0]?.metadata?.slug === collectionSlug, `${collectionDeleteAudit.url} missing collection delete slug metadata`);
    assert(collectionDeleteAudit.json?.data?.logs?.[0]?.before?.status === 'draft', `${collectionDeleteAudit.url} missing collection delete before snapshot`);
    createdCollectionId = null;
  });

  await record('admin interactive component registry delete removes temporary version', async () => {
    if (!createdInteractiveComponentKey || !createdInteractiveComponentVersion) {
      throw new Error('Interactive component registry delete test missing created component');
    }
    const componentPath = `/api/admin/sites/${createdSiteId}/interactive-components/${createdInteractiveComponentKey}/${createdInteractiveComponentVersion}`;
    const removeComponent = await request(componentPath, { method: 'DELETE' });
    assert(removeComponent.response.status === 200, `${removeComponent.url} expected 200, got ${removeComponent.response.status}`);
    assert(removeComponent.json?.data?.deleted === true, `${removeComponent.url} expected deleted registry component`);
    const missingComponent = await request(componentPath);
    assert(missingComponent.response.status === 404, `${missingComponent.url} expected deleted component to be missing`);
    const componentDeleteAudit = await request(`/api/admin/audit-logs?siteId=${createdSiteId}&entity=interactiveComponent&entityId=${removeComponent.json?.data?.componentId || ''}&action=interactiveComponent.delete&requestId=${removeComponent.json.requestId}`);
    assert(componentDeleteAudit.response.status === 200, `${componentDeleteAudit.url} expected interactive component delete audit readback`);
    if (createdInteractiveNewerVersion) {
      const removeNewerComponent = await request(`/api/admin/sites/${createdSiteId}/interactive-components/${createdInteractiveComponentKey}/${createdInteractiveNewerVersion}`, { method: 'DELETE' });
      assert(removeNewerComponent.response.status === 200, `${removeNewerComponent.url} expected newer version delete 200`);
      createdInteractiveNewerVersion = null;
    }
    createdInteractiveComponentKey = null;
    createdInteractiveComponentVersion = null;
  });

  await record('admin sites delete removes temporary site', async () => {
    const { response, json, url } = await requestOwnerOnly(`/api/admin/sites/${createdSiteId}`, { method: 'DELETE' });
    assert(response.status === 200, `${url} expected 200, got ${response.status}`);
    assert(json?.success === true, `${url} expected success envelope`);
    assert(json?.data?.deleted === true, `${url} expected deleted true`);
    createdSiteId = null;
  });

  await record('admin users list returns success envelope', async () => {
    const { response, json, url } = await request('/api/admin/users');
    assert(response.status === 200, `${url} expected 200, got ${response.status}`);
    assert(json?.success === true, `${url} expected success envelope`);
    assert(Array.isArray(json?.data?.users), `${url} expected users array`);
  });

  const email = contractEmail(`admin-contract-${Date.now()}`);
  await record('admin users create validates and persists user', async () => {
    const { response, json, url } = await request('/api/admin/users', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        fullName: 'Admin Contract User',
        email,
        role: 'viewer',
        status: 'invited',
      }),
    });

    assert(response.status === 201, `${url} expected 201, got ${response.status}`);
    assert(json?.success === true, `${url} expected success envelope`);
    assert(json?.data?.user?.email === email, `${url} returned wrong user email`);
    assert(json?.data?.user?.role === 'viewer', `${url} returned wrong user role`);
    createdUserId = json.data.user.id;
  });

  await record('admin users duplicate email is rejected', async () => {
    const { response, json, url } = await request('/api/admin/users', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        fullName: 'Duplicate Contract User',
        email,
        role: 'viewer',
      }),
    });

    assert(response.status === 409, `${url} expected 409, got ${response.status}`);
    assert(json?.success === false, `${url} expected error envelope`);
    assert(json?.error?.code === 'EMAIL_CONFLICT', `${url} expected EMAIL_CONFLICT`);
  });

  await record('admin users detail and update return edited user', async () => {
    const detail = await request(`/api/admin/users/${createdUserId}`);
    assert(detail.response.status === 200, `${detail.url} expected 200, got ${detail.response.status}`);
    assert(detail.json?.data?.user?.id === createdUserId, `${detail.url} returned wrong user`);

    const update = await request(`/api/admin/users/${createdUserId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        role: 'editor',
      }),
    });

    assert(update.response.status === 200, `${update.url} expected 200, got ${update.response.status}: ${JSON.stringify(update.json).slice(0, 500)}`);
    assert(update.json?.success === true, `${update.url} expected success envelope`);
    assert(update.json?.data?.user?.role === 'editor', `${update.url} expected editor role`);
    assert(update.json?.data?.user?.status === 'invited', `${update.url} expected invited status to remain under invite-only policy`);
  });

  await record('admin users protect last active admin authority', async () => {
    const users = await request('/api/admin/users');
    const activeAuthorities = users.json?.data?.users?.filter((user) => (
      (user.role === 'owner' || user.role === 'admin') && user.status === 'active'
    )) || [];

    assert(activeAuthorities.length >= 1, `${users.url} expected at least one active admin authority`);
    if (activeAuthorities.length !== 1 || !activeAuthorities.some((user) => user.id === 'user-admin')) {
      return;
    }

    const safeguardEmail = contractEmail(`admin-safeguard-${Date.now()}`);
    const createSafeguard = await request('/api/admin/users', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        fullName: 'Safeguard Admin',
        email: safeguardEmail,
        role: 'admin',
        status: 'invited',
      }),
    });
    assert(createSafeguard.response.status === 201, `${createSafeguard.url} expected 201, got ${createSafeguard.response.status}: ${JSON.stringify(createSafeguard.json).slice(0, 500)}`);
    createdSafeguardUserId = createSafeguard.json?.data?.user?.id;
    assert(createdSafeguardUserId, `${createSafeguard.url} missing safeguard user id`);
    const safeguardInvite = await request(`/api/admin/users/${createdSafeguardUserId}/invite-link`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ expiresInMinutes: 60 }),
    });
    assert(safeguardInvite.response.status === 200, `${safeguardInvite.url} expected safeguard invite 200, got ${safeguardInvite.response.status}`);
    const safeguardToken = safeguardInvite.json?.data?.invite?.token;
    assert(safeguardToken, `${safeguardInvite.url} missing safeguard invite token`);
    const acceptSafeguard = await fetch(`${baseUrl}/api/admin/auth/accept-invite`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ token: safeguardToken }),
    });
    const acceptSafeguardJson = await acceptSafeguard.json().catch(() => ({}));
    assert(acceptSafeguard.ok && acceptSafeguardJson?.data?.user?.status === 'active', `Safeguard invite accept failed: ${JSON.stringify(acceptSafeguardJson).slice(0, 500)}`);

    const adminDetail = await request('/api/admin/users/user-admin');
    originalUserAdminRole = adminDetail.json?.data?.user?.role;
    originalUserAdminStatus = adminDetail.json?.data?.user?.status;
    assert(originalUserAdminRole && originalUserAdminStatus, `${adminDetail.url} missing original admin role/status`);

    const demoteDefaultAdmin = await request('/api/admin/users/user-admin', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        role: 'viewer',
        status: 'active',
      }),
    });
    assert(demoteDefaultAdmin.response.status === 200, `${demoteDefaultAdmin.url} expected temporary demotion to succeed`);

    const blockedDemotion = await request(`/api/admin/users/${createdSafeguardUserId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        role: 'viewer',
      }),
    });
    assert(blockedDemotion.response.status === 409, `${blockedDemotion.url} expected 409 for last admin demotion, got ${blockedDemotion.response.status}`);
    assert(blockedDemotion.json?.error?.code === 'LAST_ADMIN_AUTHORITY', `${blockedDemotion.url} expected LAST_ADMIN_AUTHORITY`);

    const blockedSuspension = await request(`/api/admin/users/${createdSafeguardUserId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        status: 'suspended',
      }),
    });
    assert(blockedSuspension.response.status === 409, `${blockedSuspension.url} expected 409 for last admin suspension, got ${blockedSuspension.response.status}`);
    assert(blockedSuspension.json?.error?.code === 'LAST_ADMIN_AUTHORITY', `${blockedSuspension.url} expected LAST_ADMIN_AUTHORITY`);

    const blockedDelete = await request(`/api/admin/users/${createdSafeguardUserId}`, { method: 'DELETE' });
    assert(blockedDelete.response.status === 409, `${blockedDelete.url} expected 409 for last admin delete, got ${blockedDelete.response.status}`);
    assert(blockedDelete.json?.error?.code === 'LAST_ADMIN_AUTHORITY', `${blockedDelete.url} expected LAST_ADMIN_AUTHORITY`);

    const restoreDefaultAdmin = await request('/api/admin/users/user-admin', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        role: originalUserAdminRole,
        status: originalUserAdminStatus,
      }),
    });
    assert(restoreDefaultAdmin.response.status === 200, `${restoreDefaultAdmin.url} expected admin restore to succeed`);
    originalUserAdminRole = null;
    originalUserAdminStatus = null;

    const deleteSafeguard = await request(`/api/admin/users/${createdSafeguardUserId}`, { method: 'DELETE' });
    assert(deleteSafeguard.response.status === 200, `${deleteSafeguard.url} expected safeguard delete after restore`);
    createdSafeguardUserId = null;
  });

  await record('admin users delete removes temporary user', async () => {
    const { response, json, url } = await request(`/api/admin/users/${createdUserId}`, { method: 'DELETE' });
    assert(response.status === 200, `${url} expected 200, got ${response.status}`);
    assert(json?.success === true, `${url} expected success envelope`);
    assert(json?.data?.deleted === true, `${url} expected deleted true`);
    createdUserId = null;
  });

  await record('admin settings read returns delivery mode and public keys', async () => {
    const unauthSettings = await fetch(`${baseUrl}/api/admin/settings`);
    const unauthSettingsJson = await unauthSettings.json().catch(() => ({}));
    assert(unauthSettings.status === 401, `Settings admin API should reject missing auth, got ${unauthSettings.status}`);
    assert(unauthSettingsJson?.success === false && unauthSettingsJson?.error?.code === 'UNAUTHORIZED', `Settings admin API missing auth envelope: ${JSON.stringify(unauthSettingsJson).slice(0, 500)}`);

    const { response, json, url } = await request('/api/admin/settings');
    assert(response.status === 200, `${url} expected 200, got ${response.status}`);
    assert(json?.success === true, `${url} expected success envelope`);
    assert(json?.data?.settings?.schemaVersion === 'backy.admin-settings.v1', `${url} missing workspace settings payload schema version`);
    const completionStatus = json?.data?.settings?.completionStatus;
    assert(completionStatus?.schemaVersion === 'backy.completion-status.v1', `${url} missing completion status schema version`);
    assert(completionStatus?.audit?.ready === 41 && completionStatus?.audit?.partial === 4, `${url} completion status audit counts drifted`);
    assert(completionStatus?.partialClosureReadiness?.schemaVersion === 'backy.partial-closure-readiness.v1', `${url} missing partial closure readiness handoff`);
    assert(completionStatus?.partialClosureReadiness?.defaultNoArtifactMode?.partialCount === 4, `${url} default closure mode should still show 4 partial rows`);
    assert(completionStatus?.partialClosureReadiness?.artifactAcceptedMode?.readyCount === 4, `${url} artifact-backed closure mode should explain 4 ready rows`);
    assert(
      completionStatus?.partialClosureReadiness?.artifactAcceptedMode?.audit?.ready === 45 &&
        completionStatus?.partialClosureReadiness?.artifactAcceptedMode?.audit?.partial === 0 &&
        completionStatus?.partialClosureReadiness?.auditImpact?.partialRowsClosed === 4,
      `${url} artifact-backed completion audit should explain the 45 Ready / 0 Partial closure view`,
    );
    assert(
      completionStatus?.partialClosureReadiness?.artifactAdmissionCommand === 'npm run ci:provider-artifact-admission' &&
      completionStatus?.partialClosureReadiness?.artifactBackedDoctorCommand?.includes?.('BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1') &&
        completionStatus.partialClosureReadiness.artifactBackedDoctorCommand.includes('artifacts/backy-settings-provider-certification.json') &&
        completionStatus.partialClosureReadiness.artifactBackedDoctorCommand.includes('artifacts/backy-commerce-provider-certification.json'),
      `${url} missing artifact admission and artifact-backed release doctor commands`,
    );
    assert(
      completionStatus?.partialClosureReadiness?.rows?.some?.(
        (row) =>
          row.key === 'settings-admin-apis' &&
          row.artifactKey === 'settings' &&
          row.artifactAcceptedStatus === 'ready' &&
          row.status === 'partial',
      ),
      `${url} missing Settings admin API partial-closure row`,
    );
    assert(
      completionStatus?.surfaceRunbooks?.some?.(
        (runbook) =>
          runbook.key === 'settings-admin-apis' &&
          typeof runbook.evidenceApi === 'string' &&
          runbook.evidenceApi.includes('data.settings.completionStatus') &&
          runbook.targetInputs?.includes?.('BACKY_SETTINGS_CERTIFY_SITE_ID') &&
          runbook.targetInputs?.includes?.('BACKY_COMMERCE_CERTIFY_SITE_ID') &&
          runbook.artifactVerifier?.freshnessWindow?.maxAgeHoursEnv === 'BACKY_PROVIDER_CERTIFICATION_ARTIFACT_MAX_AGE_HOURS' &&
          runbook.artifactVerifier?.freshnessWindow?.defaultMaxAgeHours === 168 &&
          runbook.artifactVerifier?.freshnessWindow?.futureSkewMinutesEnv === 'BACKY_PROVIDER_CERTIFICATION_ARTIFACT_FUTURE_SKEW_MINUTES' &&
          runbook.artifactVerifier?.freshnessWindow?.defaultFutureSkewMinutes === 15 &&
          runbook.artifactVerifier?.validates?.includes?.('certifiedAtReady') &&
          runbook.artifactVerifier?.validates?.includes?.('artifactFreshReady') &&
          runbook.artifactVerifier?.validates?.includes?.('settingsApiHandoffSiteTargetReady') &&
          runbook.artifactVerifier?.validates?.includes?.('settingsApiHandoffTargetSiteId') &&
          runbook.artifactVerifier?.validates?.includes?.('siteSettingsApiHandoffReady') &&
          runbook.evidenceArtifacts?.some?.(
            (artifact) =>
              artifact.artifactName === 'backy-settings-provider-certification-evidence' &&
              artifact.path === 'artifacts/backy-settings-provider-certification.json' &&
              artifact.producerEnv === 'BACKY_SETTINGS_CERTIFICATION_OUTPUT' &&
              artifact.includesSecretValues === false,
          ),
      ),
      `${url} missing Settings admin API completion runbook evidence source`,
    );
    assert(
      completionStatus?.surfaceRunbooks?.some?.(
        (runbook) =>
          runbook.key === 'products' &&
          runbook.targetInputs?.includes?.('BACKY_COMMERCE_CERTIFICATION_BASE_URL') &&
          runbook.targetInputs?.includes?.('BACKY_COMMERCE_CERTIFY_SITE_ID') &&
          runbook.artifactVerifier?.freshnessWindow?.maxAgeHoursEnv === 'BACKY_PROVIDER_CERTIFICATION_ARTIFACT_MAX_AGE_HOURS' &&
          runbook.artifactVerifier?.validates?.includes?.('certifiedAtReady') &&
          runbook.artifactVerifier?.validates?.includes?.('artifactFreshReady') &&
          runbook.artifactVerifier?.validates?.includes?.('commerceArtifactSiteTargetReady') &&
          runbook.artifactVerifier?.validates?.includes?.('commerceArtifactTargetSiteId') &&
          runbook.artifactVerifier?.validates?.includes?.('commerceArtifactSiteSelectorEnvReady') &&
          runbook.artifactVerifier?.validates?.includes?.('commerceArtifactSiteSelectorEnv') &&
          runbook.artifactVerifier?.validates?.includes?.('productApiHandoffSiteTargetReady') &&
          runbook.artifactVerifier?.validates?.includes?.('productApiHandoffTargetSiteId') &&
          runbook.artifactVerifier?.validates?.includes?.('commerceApiHandoffSiteSelectorEnv'),
      ),
      `${url} missing Products completion runbook commerce site target`,
    );
    assert(
      completionStatus?.surfaceRunbooks?.some?.(
        (runbook) =>
          runbook.key === 'orders' &&
          runbook.targetInputs?.includes?.('BACKY_COMMERCE_CERTIFICATION_BASE_URL') &&
          runbook.targetInputs?.includes?.('BACKY_COMMERCE_CERTIFY_SITE_ID') &&
          runbook.artifactVerifier?.freshnessWindow?.maxAgeHoursEnv === 'BACKY_PROVIDER_CERTIFICATION_ARTIFACT_MAX_AGE_HOURS' &&
          runbook.artifactVerifier?.validates?.includes?.('certifiedAtReady') &&
          runbook.artifactVerifier?.validates?.includes?.('artifactFreshReady') &&
          runbook.artifactVerifier?.validates?.includes?.('commerceArtifactSiteTargetReady') &&
          runbook.artifactVerifier?.validates?.includes?.('commerceArtifactTargetSiteId') &&
          runbook.artifactVerifier?.validates?.includes?.('commerceArtifactSiteSelectorEnvReady') &&
          runbook.artifactVerifier?.validates?.includes?.('commerceArtifactSiteSelectorEnv') &&
          runbook.artifactVerifier?.validates?.includes?.('orderApiHandoffSiteTargetReady') &&
          runbook.artifactVerifier?.validates?.includes?.('orderApiHandoffTargetSiteId') &&
          runbook.artifactVerifier?.validates?.includes?.('commerceApiHandoffSiteSelectorEnv'),
      ),
      `${url} missing Orders completion runbook commerce site target`,
    );
    assert(completionStatus?.privacy?.includesSecretValues === false, `${url} completion status leaked secret-value policy`);
    assert(json?.data?.settings?.scope?.workspaceSettingsScope === 'global', `${url} missing global workspace settings scope`);
    assert(json?.data?.settings?.scope?.siteSettingsScope === 'site', `${url} missing site settings scope pointer`);
    assert(json?.data?.settings?.scope?.siteSettingsEndpointTemplate === '/api/admin/sites/:siteId/settings', `${url} missing site settings endpoint template`);
    assert(json?.data?.settings?.endpoints?.workspaceSettings === '/api/admin/settings', `${url} missing workspace settings endpoint`);
    assert(json?.data?.settings?.endpoints?.siteSettings === '/api/admin/sites/:siteId/settings', `${url} missing site settings endpoint`);
    assert(json?.data?.settings?.deliveryMode, `${url} missing deliveryMode`);
    assert(json?.data?.settings?.apiKeys?.publicApiKey, `${url} missing publicApiKey`);
    assert(json?.data?.settings?.apiKeys?.adminApiKey === '', `${url} should not expose adminApiKey to non-owner sessions`);
    assert(json?.data?.settings?.runtimeStorage?.provider, `${url} missing runtime storage provider`);
    assert(typeof json?.data?.settings?.runtimeStorage?.configured === 'boolean', `${url} missing runtime storage configured flag`);
    assert(Array.isArray(json?.data?.settings?.runtimeStorage?.missing), `${url} missing runtime storage missing list`);
    assert(json?.data?.settings?.runtimeDatabase?.mode, `${url} missing runtime database mode`);
    assert(typeof json?.data?.settings?.runtimeDatabase?.configured === 'boolean', `${url} missing runtime database configured flag`);
    assert(typeof json?.data?.settings?.runtimeSupabase?.configured === 'boolean', `${url} missing runtime Supabase configured flag`);
    assert(Array.isArray(json?.data?.settings?.runtimeSupabase?.missing), `${url} missing runtime Supabase missing list`);
    assert(typeof json?.data?.settings?.runtimeVercel?.configured === 'boolean', `${url} missing runtime Vercel configured flag`);
    assert(Array.isArray(json?.data?.settings?.runtimeVercel?.missing), `${url} missing runtime Vercel missing list`);
    assert(!JSON.stringify(json.data.settings.runtimeStorage).includes('SECRET'), `${url} exposed storage secret names or values`);
    assert(!JSON.stringify(json.data.settings.runtimeSupabase).includes('SERVICE_ROLE'), `${url} exposed Supabase secret env names or values`);
    const themeDesignImpact = json?.data?.settings?.themeDesignImpact;
    assert(themeDesignImpact?.schemaVersion === 'backy.settings-theme-design-impact.v1', `${url} missing theme design impact schema version`);
    assert(themeDesignImpact?.themeContract?.schemaVersion === 'backy.theme.v1', `${url} missing theme token contract`);
    assert(themeDesignImpact?.frontendBindings?.adminSettingsApi === '/api/admin/settings#data.settings.themeDesignImpact', `${url} missing admin settings theme-design binding`);
    assert(themeDesignImpact?.designStatePersistence?.tokenRefPaths?.includes('content.themeTokenRefs'), `${url} missing theme token ref path`);
    assert(themeDesignImpact?.motion?.bindingPaths?.includes('element.animation.tokenRefs.duration'), `${url} missing animation token-ref binding`);
    assert(themeDesignImpact?.privacy?.includesSecretValues === false, `${url} theme design impact leaked secret boundary`);
    const frontendDatabaseCertification = json?.data?.settings?.frontendDatabaseCertification;
    assert(frontendDatabaseCertification?.schemaVersion === 'backy.frontend-database-certification.v1', `${url} missing frontend database certification schema version`);
    assert(frontendDatabaseCertification?.status === 'external-database-gate', `${url} missing frontend database certification status`);
    assert(frontendDatabaseCertification?.requiredFor === 'production-custom-frontends', `${url} missing frontend database certification requirement`);
    assert(frontendDatabaseCertification?.source === 'admin-settings-api', `${url} missing frontend database certification API source`);
    assert(frontendDatabaseCertification.gate?.command === 'npm run ci:sdk-postgres-smoke', `${url} missing frontend database certification gate`);
    assert(frontendDatabaseCertification.gate?.workflow === '.github/workflows/sdk-postgres-smoke.yml', `${url} missing frontend database certification workflow`);
    assert(frontendDatabaseCertification.gate?.localPreflight === 'npm run test:sdk-postgres-preflight-contract', `${url} missing frontend database certification preflight`);
    assert(frontendDatabaseCertification.gate?.disposableGuard === 'npm run test:sdk-postgres-disposable-guard', `${url} missing frontend database certification disposable guard`);
    assert(
      Array.isArray(frontendDatabaseCertification.environment?.secretAliases) &&
        frontendDatabaseCertification.environment.secretAliases.includes('BACKY_DATABASE_URL') &&
        frontendDatabaseCertification.environment.secretAliases.includes('DATABASE_URL') &&
        frontendDatabaseCertification.environment.requiredConfirmationEnv === 'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true',
      `${url} missing frontend database certification environment aliases`,
    );
    assert(frontendDatabaseCertification?.operatorCommandTemplate, `${url} missing frontend database certification operatorCommandTemplate`);
    assert(frontendDatabaseCertification.operatorCommandTemplate.envTemplateSchemaVersion === 'backy.frontend-database-certification-env-template.v1', `${url} missing frontend database certification command-template env schema`);
    assert(
      typeof frontendDatabaseCertification.operatorCommandTemplate.envTemplate === 'string' &&
        frontendDatabaseCertification.operatorCommandTemplate.envTemplate.includes('# Backy frontend SDK database certification environment') &&
        frontendDatabaseCertification.operatorCommandTemplate.envTemplate.includes('BACKY_DATA_MODE=database') &&
        frontendDatabaseCertification.operatorCommandTemplate.envTemplate.includes('BACKY_SDK_REQUIRE_DATABASE=1'),
      `${url} missing frontend database certification command-template env body`,
    );
    assert(frontendDatabaseCertification?.operatorEnvTemplate, `${url} missing frontend database certification operatorEnvTemplate`);
    assert(frontendDatabaseCertification.operatorEnvTemplate.schemaVersion === 'backy.frontend-database-certification-env-template.v1', `${url} missing frontend database certification env-template schema`);
    assert(frontendDatabaseCertification.operatorEnvTemplate.fileName === '.env.backy-frontend-database-certification', `${url} missing frontend database certification env-template filename`);
    assert(frontendDatabaseCertification?.runtime?.dataMode, `${url} missing frontend database certification runtime data mode`);
    assert(typeof frontendDatabaseCertification.runtime?.databaseUrlConfigured === 'boolean', `${url} missing frontend database certification database URL readiness`);
    assert(typeof frontendDatabaseCertification.runtime?.readyForCertification === 'boolean', `${url} missing frontend database certification ready flag`);
    assert(Array.isArray(frontendDatabaseCertification.runtime?.missing), `${url} missing frontend database certification missing inputs`);
    assert(
      frontendDatabaseCertification.scenarioEvidence?.schemaVersion === 'backy.frontend-database-certification-evidence.v1' &&
        frontendDatabaseCertification.scenarioEvidence.requiredGate === 'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:sdk-postgres-smoke' &&
        frontendDatabaseCertification.scenarioEvidence.coverage?.total === 9 &&
        frontendDatabaseCertification.scenarioEvidence.scenarios?.some((scenario) => scenario.key === 'manifest-openapi-discovery') &&
        frontendDatabaseCertification.scenarioEvidence.scenarios?.some((scenario) => scenario.key === 'generated-sdk-cache') &&
        frontendDatabaseCertification.scenarioEvidence.scenarios?.some((scenario) => scenario.key === 'database-runtime-guard'),
      `${url} missing frontend database certification scenario evidence`,
    );
    assert(
      typeof frontendDatabaseCertification?.secretHandling === 'string' &&
        frontendDatabaseCertification.secretHandling.includes('Database URLs and service credentials stay in CI/runtime environment'),
      `${url} missing frontend database certification secret-handling guidance`,
    );
    assert(!JSON.stringify(frontendDatabaseCertification).includes('postgres://'), `${url} exposed a database URL in frontend database certification`);
    assert(!JSON.stringify(frontendDatabaseCertification).includes('SERVICE_ROLE'), `${url} exposed service-role material in frontend database certification`);
    const providerCertification = json?.data?.settings?.providerCertification;
    assert(providerCertification?.schemaVersion === 'backy.settings-provider-certification-handoff.v1', `${url} missing provider certification schema version`);
    assert(providerCertification?.status === 'external-live-provider-gate', `${url} missing provider certification status`);
    assert(providerCertification?.settingsGate === 'npm run ci:settings-provider-certification', `${url} missing Settings provider certification gate`);
    assert(providerCertification?.commerceGate === 'npm run ci:commerce-provider-certification', `${url} missing Commerce provider certification gate`);
    assert(providerCertification?.localPreflight === 'npm run test:settings-provider-certification-preflight-contract', `${url} missing Settings provider local preflight`);
    assert(providerCertification?.releasePreflight === 'npm run test:release-certification-preflight-contract', `${url} missing Settings provider release preflight`);
    assert(providerCertification?.operatorCommandTemplate, `${url} missing provider certification operatorCommandTemplate`);
    assert(providerCertification?.scenarioEvidence?.schemaVersion === 'backy.settings-provider-certification-evidence.v1', `${url} missing provider certification scenario evidence schema`);
    assert(providerCertification.scenarioEvidence.requiredGate === 'BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED=1 npm run ci:settings-provider-certification', `${url} missing provider certification scenario evidence gate`);
    assert(
      providerCertification.scenarioEvidence.coverage?.total === 8 &&
        Array.isArray(providerCertification.scenarioEvidence.coverage?.missing) &&
        Array.isArray(providerCertification.scenarioEvidence.scenarios) &&
        providerCertification.scenarioEvidence.scenarios.some((scenario) => scenario.key === 'database-supabase') &&
        providerCertification.scenarioEvidence.scenarios.some((scenario) => scenario.key === 'public-api-cors') &&
        providerCertification.scenarioEvidence.scenarios.some((scenario) => scenario.key === 'release-certification-readiness'),
      `${url} missing provider certification scenario coverage`,
    );
    assert(
      typeof providerCertification.scenarioEvidence.secretHandling === 'string' &&
        providerCertification.scenarioEvidence.secretHandling.includes('database URLs, provider credentials'),
      `${url} missing provider certification scenario secret-handling guidance`,
    );
    assert(
      providerCertification?.operatorEvidencePacket?.schemaVersion === 'backy.settings-provider-certification-evidence-packet.v1',
      `${url} missing provider certification operator evidence packet schema`,
    );
    assert(
      Array.isArray(providerCertification.operatorEvidencePacket.operatorArtifacts) &&
        providerCertification.operatorEvidencePacket.operatorArtifacts.some((artifact) => artifact.key === 'storage-media') &&
        providerCertification.operatorEvidencePacket.operatorArtifacts.some((artifact) => artifact.key === 'notification-delivery') &&
        providerCertification.operatorEvidencePacket.operatorArtifacts.some((artifact) => artifact.key === 'commerce-provider-bridge'),
      `${url} missing provider certification operator artifacts`,
    );
    assert(
      providerCertification.operatorEvidencePacket.redactionPolicy?.includesProviderSecrets === false &&
        providerCertification.operatorEvidencePacket.redactionPolicy?.includesDatabaseUrls === false &&
        providerCertification.operatorEvidencePacket.redactionPolicy?.includesServiceRoleKeys === false &&
        providerCertification.operatorEvidencePacket.redactionPolicy?.includesCustomerOrOrderPayloads === false,
      `${url} missing provider certification evidence-packet redaction policy`,
    );
    assert(
      providerCertification.operatorEvidencePacket.scenarioAttachments?.some((scenario) => scenario.key === 'storage-media') &&
        providerCertification.operatorEvidencePacket.scenarioAttachments?.some((scenario) => scenario.key === 'release-certification-readiness'),
      `${url} missing provider certification evidence-packet scenario attachments`,
    );
    assert(
      providerCertification.operatorEvidencePacket.commandPreview?.command?.includes('npm run ci:settings-provider-certification') &&
        providerCertification.operatorEvidencePacket.commandPreview?.command?.includes('npm run ci:commerce-provider-certification') &&
        providerCertification.operatorEvidencePacket.commandPreview?.targetInputs?.includes('BACKY_SETTINGS_CERTIFICATION_BASE_URL') &&
        providerCertification.operatorEvidencePacket.commandPreview?.targetInputs?.includes('BACKY_SETTINGS_CERTIFY_SITE_ID') &&
        providerCertification.operatorEvidencePacket.commandPreview?.targetInputs?.includes('BACKY_COMMERCE_CERTIFY_SITE_ID'),
      `${url} missing provider certification evidence-packet command preview`,
    );
    assert(
      providerCertification.operatorEvidencePacket.target?.siteId === 'site-demo' &&
        providerCertification.operatorEvidencePacket.target?.settingsAdminApi === '/api/admin/settings?certificationSiteId={siteId}' &&
        providerCertification.operatorEvidencePacket.target?.siteScopedSettingsApi === '/api/admin/sites/{siteId}/settings' &&
        providerCertification.operatorEvidencePacket.target?.settingsApi === '/api/admin/sites/{siteId}/settings' &&
        providerCertification.operatorEvidencePacket.target?.settingsSiteSelectorEnv === 'BACKY_SETTINGS_CERTIFY_SITE_ID' &&
        providerCertification.operatorEvidencePacket.target?.commerceSiteSelectorEnv === 'BACKY_COMMERCE_CERTIFY_SITE_ID',
      `${url} missing provider certification evidence-packet site target`,
    );
    assert(
      typeof providerCertification.operatorEvidencePacket.secretHandling === 'string' &&
        providerCertification.operatorEvidencePacket.secretHandling.includes('Redacted operator attachment manifest only'),
      `${url} missing provider certification evidence-packet secret handling`,
    );
    assert(providerCertification.operatorCommandTemplate.envTemplateSchemaVersion === 'backy.settings-provider-certification-env-template.v1', `${url} missing provider certification command-template env schema`);
    assert(
      typeof providerCertification.operatorCommandTemplate.envTemplate === 'string' &&
        providerCertification.operatorCommandTemplate.envTemplate.includes('# Backy settings provider certification environment') &&
        providerCertification.operatorCommandTemplate.envTemplate.includes('BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED=1') &&
        providerCertification.operatorCommandTemplate.envTemplate.includes('BACKY_SETTINGS_CERTIFY_SITE_ID=site-demo') &&
        providerCertification.operatorCommandTemplate.envTemplate.includes('BACKY_SETTINGS_CERTIFY_PUBLIC_API_CORS=1') &&
        providerCertification.operatorCommandTemplate.envTemplate.includes('BACKY_CORS_ALLOWED_ORIGINS=') &&
        providerCertification.operatorCommandTemplate.envTemplate.includes('BACKY_COMMERCE_CERTIFY_SITE_ID=site-demo') &&
        providerCertification.operatorCommandTemplate.envTemplate.includes('BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1'),
      `${url} missing provider certification command-template env body`,
    );
    assert(providerCertification?.operatorEnvTemplate, `${url} missing provider certification operatorEnvTemplate`);
    assert(providerCertification.operatorEnvTemplate.schemaVersion === 'backy.settings-provider-certification-env-template.v1', `${url} missing provider certification env-template schema`);
    assert(providerCertification.operatorEnvTemplate.format === 'shell-env', `${url} missing provider certification env-template format`);
    assert(providerCertification.operatorEnvTemplate.fileName === '.env.backy-settings-provider-certification', `${url} missing provider certification env-template filename`);
    assert(
      typeof providerCertification.operatorEnvTemplate.body === 'string' &&
        providerCertification.operatorEnvTemplate.body.includes('# Backy settings provider certification environment') &&
        providerCertification.operatorEnvTemplate.body.includes('BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED=1') &&
        providerCertification.operatorEnvTemplate.body.includes('BACKY_SETTINGS_CERTIFY_SITE_ID=site-demo') &&
        providerCertification.operatorEnvTemplate.body.includes('BACKY_SETTINGS_CERTIFY_PUBLIC_API_CORS=1') &&
        providerCertification.operatorEnvTemplate.body.includes('BACKY_CORS_ALLOWED_ORIGINS=') &&
        providerCertification.operatorEnvTemplate.body.includes('BACKY_COMMERCE_CERTIFY_SITE_ID=site-demo') &&
        providerCertification.operatorEnvTemplate.body.includes('BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1'),
      `${url} missing provider certification env-template body`,
    );
    assert(
        providerCertification.operatorCommandTemplate.command.includes('BACKY_SETTINGS_CERTIFY_STORAGE_PROVIDER') &&
        providerCertification.operatorCommandTemplate.command.includes('BACKY_SETTINGS_CERTIFY_SITE_ID') &&
        providerCertification.operatorCommandTemplate.command.includes('BACKY_SETTINGS_CERTIFY_NOTIFICATION_PROVIDER') &&
        providerCertification.operatorCommandTemplate.command.includes('BACKY_SETTINGS_CERTIFY_PUBLIC_API_CORS') &&
        providerCertification.operatorCommandTemplate.command.includes('BACKY_CORS_ALLOWED_ORIGINS') &&
        providerCertification.operatorCommandTemplate.command.includes('BACKY_COMMERCE_CERTIFY_SITE_ID') &&
        providerCertification.operatorCommandTemplate.command.includes('BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED') &&
        providerCertification.operatorCommandTemplate.command.includes('npm run ci:settings-provider-certification') &&
        providerCertification.operatorCommandTemplate.command.includes('npm run ci:commerce-provider-certification'),
      `${url} missing provider certification operator command aliases`,
    );
    assert(
      Array.isArray(providerCertification.operatorCommandTemplate.storageProviderChoices) &&
        providerCertification.operatorCommandTemplate.storageProviderChoices.includes('supabase') &&
        providerCertification.operatorCommandTemplate.storageProviderChoices.includes('s3'),
      `${url} missing provider certification storage provider choices`,
    );
    assert(
      Array.isArray(providerCertification.operatorCommandTemplate.notificationProviderChoices) &&
        providerCertification.operatorCommandTemplate.notificationProviderChoices.includes('resend') &&
        providerCertification.operatorCommandTemplate.notificationProviderChoices.includes('smtp'),
      `${url} missing provider certification notification provider choices`,
    );
    assert(
      Array.isArray(providerCertification.operatorCommandTemplate.requiredInputAliases) &&
        providerCertification.operatorCommandTemplate.requiredInputAliases.includes('BACKY_SETTINGS_CERTIFY_SITE_ID or BACKY_SETTINGS_CERTIFICATION_SITE_ID') &&
        providerCertification.operatorCommandTemplate.requiredInputAliases.includes('BACKY_COMMERCE_CERTIFY_SITE_ID') &&
        providerCertification.operatorCommandTemplate.requiredInputAliases.includes('BACKY_CORS_ALLOWED_ORIGINS') &&
        providerCertification.operatorCommandTemplate.requiredInputAliases.includes('BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET'),
      `${url} missing provider certification operator required aliases`,
    );
    assert(
      Array.isArray(providerCertification.operatorCommandTemplate.targetInputs) &&
        providerCertification.operatorCommandTemplate.targetInputs.includes('BACKY_SETTINGS_CERTIFICATION_BASE_URL') &&
        providerCertification.operatorCommandTemplate.targetInputs.includes('BACKY_SETTINGS_CERTIFY_SITE_ID') &&
        providerCertification.operatorCommandTemplate.targetInputs.includes('BACKY_SETTINGS_CERTIFICATION_SITE_ID') &&
        providerCertification.operatorCommandTemplate.targetInputs.includes('BACKY_COMMERCE_CERTIFY_SITE_ID') &&
        providerCertification.operatorCommandTemplate.targetInputs.includes('BACKY_CORS_ALLOWED_ORIGINS') &&
        providerCertification.operatorCommandTemplate.targetInputs.includes('BACKY_COMMERCE_CERTIFICATION_BASE_URL'),
      `${url} missing provider certification operator target inputs`,
    );
    assert(
      typeof providerCertification?.secretHandling === 'string' &&
        providerCertification.secretHandling.includes('Provider credentials stay in deployment or CI environment variables'),
      `${url} missing provider certification secret-handling guidance`,
    );
    assert(providerCertification?.runtimeEvidence, `${url} missing provider certification runtime evidence`);
    assert(providerCertification.runtimeEvidence.database?.mode, `${url} missing provider certification database runtime evidence`);
    assert(typeof providerCertification.runtimeEvidence.storage?.configured === 'boolean', `${url} missing provider certification storage runtime evidence`);
    assert(typeof providerCertification.runtimeEvidence.supabase?.configured === 'boolean', `${url} missing provider certification Supabase runtime evidence`);
    assert(typeof providerCertification.runtimeEvidence.vercel?.configured === 'boolean', `${url} missing provider certification Vercel runtime evidence`);
    assert(typeof providerCertification.runtimeEvidence.notifications?.configured === 'boolean', `${url} missing provider certification notification runtime evidence`);
    assert(typeof providerCertification.runtimeEvidence.commerce?.webhookSecretConfigured === 'boolean', `${url} missing provider certification commerce runtime evidence`);
    assert(typeof providerCertification.runtimeEvidence.interactiveComponents?.configured === 'boolean', `${url} missing provider certification interactive runtime evidence`);
    assert(Array.isArray(providerCertification.runtimeEvidence.publicApi?.missing), `${url} missing provider certification public API runtime evidence`);
    assert(Array.isArray(providerCertification.runtimeEvidence.missingInputAliases), `${url} missing provider certification runtime missing input aliases`);
    assert(providerCertification.runtimeEvidence.liveProviderGateRequired === true, `${url} missing provider certification live-provider gate flag`);
    assert(
      typeof providerCertification.runtimeEvidence.secretHandling === 'string' &&
        providerCertification.runtimeEvidence.secretHandling.includes('Provider secret values are never returned'),
      `${url} missing provider certification runtime secret-handling guidance`,
    );
    assert(!JSON.stringify(providerCertification.runtimeEvidence).includes('SERVICE_ROLE'), `${url} exposed provider certification Supabase secret aliases`);
    assert(!JSON.stringify(providerCertification.runtimeEvidence).includes('SECRET_ACCESS_KEY'), `${url} exposed provider certification storage secret aliases`);
    assert(Array.isArray(providerCertification?.groups), `${url} missing provider certification groups`);
    assert(
      providerCertification.groups.some((group) => group.family === 'Database and Supabase') &&
        providerCertification.groups.some((group) => group.family === 'Storage and media delivery') &&
        providerCertification.groups.some((group) => group.family === 'Vercel deployment and secrets') &&
        providerCertification.groups.some((group) => group.family === 'Notifications') &&
        providerCertification.groups.some((group) => group.family === 'Public API and custom frontend CORS') &&
        providerCertification.groups.some((group) => group.family === 'Commerce providers'),
      `${url} missing provider certification family coverage`,
    );
    const providerCertificationRequiredInputs = providerCertification.groups
      .flatMap((group) => Array.isArray(group.requiredInputs) ? group.requiredInputs : []);
    for (const requiredInput of [
      'BACKY_DATABASE_URL or DATABASE_URL',
      'BACKY_SUPABASE_URL or SUPABASE_URL',
      'BACKY_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY',
      'BACKY_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY',
      'BACKY_STORAGE_PROVIDER or BACKY_MEDIA_STORAGE_PROVIDER',
      'BACKY_SUPABASE_STORAGE_BUCKET or BACKY_STORAGE_BUCKET',
      'BACKY_S3_ACCESS_KEY_ID or AWS_ACCESS_KEY_ID',
      'BACKY_S3_SECRET_ACCESS_KEY or AWS_SECRET_ACCESS_KEY',
      'BACKY_S3_REGION or AWS_REGION',
      'BACKY_MEDIA_SCAN_PROVIDER',
      'VERCEL_TOKEN or BACKY_VERCEL_TOKEN',
      'VERCEL_PROJECT_ID or BACKY_VERCEL_PROJECT_ID',
      'VERCEL_TEAM_ID or BACKY_VERCEL_TEAM_ID',
      'VERCEL_API_BASE_URL or BACKY_VERCEL_API_BASE_URL',
      'BACKY_EMAIL_DELIVERY_ENDPOINT or BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL',
      'BACKY_RESEND_API_KEY or RESEND_API_KEY',
      'BACKY_SMTP_HOST or SMTP_HOST',
      'BACKY_SMTP_USER or SMTP_USER',
      'BACKY_SMTP_PASSWORD or SMTP_PASSWORD',
      'BACKY_CORS_ALLOWED_ORIGINS',
      'BACKY_SETTINGS_CERTIFY_PUBLIC_API_ORIGIN',
      'BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY',
      'BACKY_TAXJAR_API_KEY or TAXJAR_API_KEY',
      'BACKY_AVALARA_ACCOUNT_ID/AVALARA_ACCOUNT_ID plus license and company code',
      'BACKY_EASYPOST_API_KEY or EASYPOST_API_KEY',
      'BACKY_SHIPPO_API_KEY or SHIPPO_API_KEY',
      'BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET',
      'provider-specific catalog/payment credentials',
    ]) {
      assert(
        providerCertificationRequiredInputs.includes(requiredInput),
        `${url} missing provider certification required input ${requiredInput}`,
      );
    }
    originalDeliveryMode = json.data.settings.deliveryMode;
    originalSettingsIntegrations = json.data.settings.integrations || null;
  });

  await record('admin settings contract exposes runtime diagnostics and rejects unsafe provider config', async () => {
    const initial = await request('/api/admin/settings');
    const settings = initial.json?.data?.settings || {};
    const integrations = settings.integrations || {};
    const commerce = integrations.commerce || {};
    const storage = integrations.storage || {};

    assert(settings.runtimeCommerce, `${initial.url} missing commerce runtime diagnostics`);
    assert(typeof settings.runtimeCommerce.stripeSecretConfigured === 'boolean', `${initial.url} missing Stripe secret readiness`);
    assert(settings.runtimeCommerce.stripeApiBaseUrl, `${initial.url} missing Stripe API base URL`);
    assert(settings.runtimeCommerce.taxJarApiBaseUrl, `${initial.url} missing TaxJar API base URL`);
    assert(settings.runtimeCommerce.avalaraApiBaseUrl, `${initial.url} missing Avalara API base URL`);
    assert(settings.runtimeCommerce.easyPostApiBaseUrl, `${initial.url} missing EasyPost API base URL`);
    assert(settings.runtimeCommerce.shippoApiBaseUrl, `${initial.url} missing Shippo API base URL`);
    assert(settings.runtimeCommerce.etsyApiBaseUrl, `${initial.url} missing Etsy API base URL`);
    assert(typeof settings.runtimeCommerce.etsyAccessTokenConfigured === 'boolean', `${initial.url} missing Etsy access token readiness`);
    assert(typeof settings.runtimeCommerce.etsyApiKeyConfigured === 'boolean', `${initial.url} missing Etsy API key readiness`);
    assert(typeof settings.runtimeCommerce.etsyShopConfigured === 'boolean', `${initial.url} missing Etsy shop readiness`);
    assert(settings.runtimeCommerce.paymentProvider, `${initial.url} missing payment provider summary`);
    assert(settings.runtimeCommerce.taxProvider, `${initial.url} missing tax provider summary`);
    assert(settings.runtimeCommerce.shippingProvider, `${initial.url} missing shipping provider summary`);
    assert(settings.runtimeCommerce.discountProvider, `${initial.url} missing discount provider summary`);
    assert(Array.isArray(settings.runtimeCommerce.missing), `${initial.url} missing commerce runtime missing list`);
    assert(!JSON.stringify(settings.runtimeCommerce).includes('whsec_'), `${initial.url} exposed raw webhook secret material`);
    assert(settings.runtimeInteractiveComponents, `${initial.url} missing interactive component runtime diagnostics`);
    assert(typeof settings.runtimeInteractiveComponents.registryConfigured === 'boolean', `${initial.url} missing interactive registry readiness`);
    assert(typeof settings.runtimeInteractiveComponents.configured === 'boolean', `${initial.url} missing interactive runtime configured flag`);
    assert(Array.isArray(settings.runtimeInteractiveComponents.missing), `${initial.url} missing interactive runtime missing list`);

    const rawCommerceSecret = await request('/api/admin/settings', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        integrations: {
          ...integrations,
          commerce: {
            ...commerce,
            providerWebhookSecretId: 'whsec_contract_raw_secret_should_not_persist',
          },
        },
      }),
    });
    assert(rawCommerceSecret.response.status === 400, `${rawCommerceSecret.url} expected raw commerce secret rejection`);
    assert(rawCommerceSecret.json?.error?.code === 'SECRET_REFERENCE_REQUIRED', `${rawCommerceSecret.url} expected SECRET_REFERENCE_REQUIRED`);

    const rawStorageSecret = await request('/api/admin/settings', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        integrations: {
          ...integrations,
          storage: {
            ...storage,
            supabaseKeySecretRef: 'BACKY_SECRET_TEST_VALUE_contractStorageShouldNotPersist',
          },
        },
      }),
    });
    assert(rawStorageSecret.response.status === 400, `${rawStorageSecret.url} expected raw storage secret rejection`);
    assert(rawStorageSecret.json?.error?.code === 'SECRET_REFERENCE_REQUIRED', `${rawStorageSecret.url} expected SECRET_REFERENCE_REQUIRED`);

    const invalidCatalogEndpoint = await request('/api/admin/settings', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        integrations: {
          ...integrations,
          commerce: {
            ...commerce,
            catalogSyncProvider: 'http',
            catalogSyncProviderUrl: 'not-a-valid-url',
          },
        },
      }),
    });
    assert(invalidCatalogEndpoint.response.status === 400, `${invalidCatalogEndpoint.url} expected invalid catalog endpoint rejection`);
    assert(invalidCatalogEndpoint.json?.error?.code === 'VALIDATION_ERROR', `${invalidCatalogEndpoint.url} expected VALIDATION_ERROR`);

    const invalidSubscriptionEndpoint = await request('/api/admin/settings', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        integrations: {
          ...integrations,
          commerce: {
            ...commerce,
            subscriptionActionProvider: 'http',
            subscriptionActionProviderUrl: 'not-a-valid-url',
          },
        },
      }),
    });
    assert(invalidSubscriptionEndpoint.response.status === 400, `${invalidSubscriptionEndpoint.url} expected invalid subscription endpoint rejection`);
    assert(invalidSubscriptionEndpoint.json?.error?.code === 'VALIDATION_ERROR', `${invalidSubscriptionEndpoint.url} expected VALIDATION_ERROR`);

    const invalidAuthPolicy = await request('/api/admin/settings', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        auth: {
          minPasswordLength: 4,
        },
      }),
    });
    assert(invalidAuthPolicy.response.status === 400, `${invalidAuthPolicy.url} expected invalid auth policy rejection`);
    assert(invalidAuthPolicy.json?.error?.code === 'VALIDATION_ERROR', `${invalidAuthPolicy.url} expected VALIDATION_ERROR`);

    const after = await request('/api/admin/settings');
    assert(after.json?.data?.settings?.integrations?.commerce?.providerWebhookSecretId === commerce.providerWebhookSecretId, `${after.url} raw commerce secret rejection mutated saved settings`);
    assert(after.json?.data?.settings?.integrations?.storage?.supabaseKeySecretRef === storage.supabaseKeySecretRef, `${after.url} raw storage secret rejection mutated saved settings`);
    assert(after.json?.data?.settings?.integrations?.commerce?.catalogSyncProviderUrl === commerce.catalogSyncProviderUrl, `${after.url} invalid catalog endpoint rejection mutated saved settings`);
    assert(after.json?.data?.settings?.integrations?.commerce?.subscriptionActionProviderUrl === commerce.subscriptionActionProviderUrl, `${after.url} invalid subscription endpoint rejection mutated saved settings`);
  });

  await record('admin settings update validates delivery mode', async () => {
    const invalid = await request('/api/admin/settings', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ deliveryMode: 'invalid-mode' }),
    });
    assert(invalid.response.status === 400, `${invalid.url} expected 400, got ${invalid.response.status}`);
    assert(invalid.json?.success === false, `${invalid.url} expected error envelope`);

    const nextMode = originalDeliveryMode === 'custom-frontend' ? 'managed-hosting' : 'custom-frontend';
    const valid = await request('/api/admin/settings', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ deliveryMode: nextMode }),
    });
    assert(valid.response.status === 200, `${valid.url} expected 200, got ${valid.response.status}`);
    assert(valid.json?.success === true, `${valid.url} expected success envelope`);
    assert(valid.json?.data?.settings?.deliveryMode === nextMode, `${valid.url} did not persist delivery mode`);

    const audit = await request(`/api/admin/audit-logs?entity=settings&entityId=platform&action=settings.update&requestId=${valid.json.requestId}`);
    assert(audit.response.status === 200, `${audit.url} expected settings audit read`);
    const auditEntry = audit.json?.data?.logs?.find((entry) => (
      entry.entity === 'settings' &&
      entry.entityId === 'platform' &&
      entry.action === 'settings.update' &&
      entry.requestId === valid.json.requestId
    ));
    assert(auditEntry?.before?.deliveryMode === originalDeliveryMode, `${audit.url} missing settings audit before delivery mode`);
    assert(auditEntry?.after?.deliveryMode === nextMode, `${audit.url} missing settings audit after delivery mode`);
    assert(auditEntry?.before?.apiKeys?.redacted === true, `${audit.url} expected settings audit api keys to be redacted`);
    assert(auditEntry?.before?.apiKeys?.adminApiKey === undefined, `${audit.url} leaked admin api key in audit before snapshot`);
    assert(auditEntry?.after?.apiKeys?.adminApiKey === undefined, `${audit.url} leaked admin api key in audit after snapshot`);
  });

  await record('admin settings update persists infrastructure metadata', async () => {
    const infrastructure = {
      supabase: {
        projectUrl: `https://contract-${unique}.supabase.co`,
        projectRef: `contract-${unique}`,
        databaseEnabled: true,
        storageEnabled: true,
        authEnabled: false,
      },
      vercel: {
        projectId: `prj_${unique}`,
        teamSlug: 'backy-contract-team',
        productionDomain: `contract-${unique}.vercel.app`,
        autoDeploy: false,
        previewDeployments: true,
      },
      commerce: {
        mode: 'checkout-provider',
        currency: 'GBP',
        paymentProvider: 'stripe',
        providerMode: 'live',
        providerAccountId: `acct_${unique}`,
        providerWebhookUrl: `https://hooks.example.com/commerce/${unique}`,
        providerWebhookSecretId: `env:BACKY_CONTRACT_WEBHOOK_SECRET_${unique.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase()}`,
        providerWebhookEvents: 'checkout.session.completed,charge.refunded',
        reconciliationMode: 'webhook',
        reconciliationWindowHours: 36,
        checkoutSuccessPath: '/checkout/contract-success',
        checkoutCancelPath: '/checkout/contract-cancel',
        guestCheckout: true,
        taxEnabled: true,
        shippingEnabled: true,
        discountsEnabled: true,
        inventoryReservations: true,
        reservationMinutes: 45,
        webhookEventsEnabled: true,
      },
    };

    const update = await request('/api/admin/settings', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ integrations: infrastructure }),
    });
    assert(update.response.status === 200, `${update.url} expected 200, got ${update.response.status}`);
    assert(update.json?.success === true, `${update.url} expected success envelope`);
    assert(update.json?.data?.settings?.integrations?.supabase?.projectRef === infrastructure.supabase.projectRef, `${update.url} did not persist Supabase project ref`);
    assert(update.json?.data?.settings?.integrations?.vercel?.projectId === infrastructure.vercel.projectId, `${update.url} did not persist Vercel project id`);
    assert(update.json?.data?.settings?.integrations?.vercel?.previewDeployments === true, `${update.url} did not persist Vercel preview toggle`);
    assert(update.json?.data?.settings?.integrations?.commerce?.currency === infrastructure.commerce.currency, `${update.url} did not persist commerce currency`);
    assert(update.json?.data?.settings?.integrations?.commerce?.paymentProvider === infrastructure.commerce.paymentProvider, `${update.url} did not persist commerce payment provider`);
    assert(update.json?.data?.settings?.integrations?.commerce?.providerMode === infrastructure.commerce.providerMode, `${update.url} did not persist commerce provider mode`);
    assert(update.json?.data?.settings?.integrations?.commerce?.reconciliationMode === infrastructure.commerce.reconciliationMode, `${update.url} did not persist commerce reconciliation mode`);

    const readBack = await request('/api/admin/settings');
    assert(readBack.response.status === 200, `${readBack.url} expected 200, got ${readBack.response.status}`);
    assert(readBack.json?.data?.settings?.integrations?.supabase?.projectUrl === infrastructure.supabase.projectUrl, `${readBack.url} did not read back Supabase URL`);
    assert(readBack.json?.data?.settings?.integrations?.vercel?.productionDomain === infrastructure.vercel.productionDomain, `${readBack.url} did not read back Vercel domain`);
    assert(readBack.json?.data?.settings?.integrations?.commerce?.checkoutSuccessPath === infrastructure.commerce.checkoutSuccessPath, `${readBack.url} did not read back commerce checkout success path`);

    let settingsManifestSiteId = null;
    try {
      const siteForManifest = await request('/api/admin/sites', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Commerce Settings Manifest Site',
          slug: `commerce-settings-${unique}`,
          description: 'Temporary site for commerce settings manifest smoke',
          status: 'published',
        }),
      });
      assert(siteForManifest.response.status === 201, `${siteForManifest.url} expected 201, got ${siteForManifest.response.status}`);
      settingsManifestSiteId = siteForManifest.json?.data?.site?.id;
      assert(settingsManifestSiteId, `${siteForManifest.url} missing created site id`);

      const manifest = await request(`/api/sites/${settingsManifestSiteId}/manifest`);
      assert(manifest.response.status === 200, `${manifest.url} expected manifest read after commerce settings update`);
      assert(manifest.json?.data?.modules?.commerce?.currency === infrastructure.commerce.currency, `${manifest.url} did not expose commerce currency`);
      assert(manifest.json?.data?.modules?.commerce?.paymentProvider === infrastructure.commerce.paymentProvider, `${manifest.url} did not expose commerce payment provider`);
      assert(manifest.json?.data?.modules?.commerce?.provider?.mode === infrastructure.commerce.providerMode, `${manifest.url} did not expose commerce provider mode`);
      assert(manifest.json?.data?.modules?.commerce?.provider?.webhookConfigured === true, `${manifest.url} did not expose commerce provider webhook readiness`);
      assert(manifest.json?.data?.modules?.commerce?.webhooks?.eventAllowlist?.includes('charge.refunded'), `${manifest.url} did not expose commerce webhook event allowlist`);
      assert(manifest.json?.data?.modules?.commerce?.reconciliation?.mode === infrastructure.commerce.reconciliationMode, `${manifest.url} did not expose commerce reconciliation mode`);
      assert(manifest.json?.data?.modules?.commerce?.reconciliation?.windowHours === infrastructure.commerce.reconciliationWindowHours, `${manifest.url} did not expose commerce reconciliation window`);
      assert(manifest.json?.data?.modules?.commerce?.checkout?.successPath === infrastructure.commerce.checkoutSuccessPath, `${manifest.url} did not expose commerce success path`);
      assert(manifest.json?.data?.modules?.commerce?.pricing?.taxes === true, `${manifest.url} did not expose commerce tax flag`);
      assert(manifest.json?.data?.modules?.commerce?.inventory?.reservationMinutes === 45, `${manifest.url} did not expose commerce reservation window`);
    } finally {
      if (settingsManifestSiteId) {
        await request(`/api/admin/sites/${settingsManifestSiteId}`, { method: 'DELETE' }).catch(() => {});
      }
    }

    const audit = await request(`/api/admin/audit-logs?entity=settings&entityId=platform&action=settings.update&requestId=${update.json.requestId}`);
    assert(audit.response.status === 200, `${audit.url} expected settings audit read`);
    const auditEntry = audit.json?.data?.logs?.find((entry) => (
      entry.entity === 'settings' &&
      entry.entityId === 'platform' &&
      entry.action === 'settings.update' &&
      entry.requestId === update.json.requestId
    ));
    assert(auditEntry?.metadata?.changedKeys?.includes('integrations'), `${audit.url} missing integrations audit change key`);
  });

  await record('admin settings regenerates API keys', async () => {
    const before = await request('/api/admin/settings');
    const oldPublicKey = before.json?.data?.settings?.apiKeys?.publicApiKey;

    const { response, json, url } = await requestOwnerOnly('/api/admin/settings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action: 'regenerate-api-keys' }),
    });

    assert(response.status === 200, `${url} expected 200, got ${response.status}`);
    assert(json?.success === true, `${url} expected success envelope`);
    assert(json?.data?.settings?.apiKeys?.publicApiKey !== oldPublicKey, `${url} public key did not rotate`);
    assert(json?.data?.settings?.apiKeys?.adminApiKey, `${url} owner key regeneration should return the new admin key`);
    adminRequestApiKey = json.data.settings.apiKeys.adminApiKey;

    const audit = await request(`/api/admin/audit-logs?entity=settings&entityId=platform&action=${encodeURIComponent('settings.api_keys.regenerate')}&requestId=${json.requestId}`);
    assert(audit.response.status === 200, `${audit.url} expected key regeneration audit read`);
    const auditEntry = audit.json?.data?.logs?.find((entry) => (
      entry.entity === 'settings' &&
      entry.entityId === 'platform' &&
      entry.action === 'settings.api_keys.regenerate' &&
      entry.requestId === json.requestId
    ));
    assert(auditEntry?.metadata?.scope === 'all', `${audit.url} missing key regeneration audit scope`);
    assert(auditEntry?.before?.apiKeys?.redacted === true, `${audit.url} expected key audit api keys to be redacted`);
    assert(auditEntry?.after?.apiKeys?.adminApiKey === undefined, `${audit.url} leaked regenerated admin api key in audit snapshot`);
  });

  await record('admin settings service keys issue authenticate and revoke without exposing hashes', async () => {
    const issue = await requestOwnerOnly('/api/admin/settings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'issue-admin-api-key',
        label: `Contract service key ${unique}`,
      }),
    });
    assert(issue.response.status === 200, `${issue.url} expected service key issue 200, got ${issue.response.status}`);
    const issued = issue.json?.data?.issuedKey;
    assert(issued?.id, `${issue.url} missing issued service key id`);
    assert(typeof issued?.adminApiKey === 'string' && issued.adminApiKey.startsWith('sk_srv_'), `${issue.url} missing one-time raw service key`);
    assert(issue.text.includes(issued.adminApiKey), `${issue.url} should expose the raw service key only in the issue response`);
    assert(!JSON.stringify(issue.json?.data?.settings || {}).includes(issued.adminApiKey), `${issue.url} leaked raw service key in persisted settings payload`);
    assert(!JSON.stringify(issue.json?.data?.settings || {}).includes('"keyHash"'), `${issue.url} leaked service key hash in settings payload`);

    const issueAudit = await request(`/api/admin/audit-logs?entity=settings&entityId=platform&action=${encodeURIComponent('settings.api_keys.issue')}&requestId=${issue.json.requestId}`);
    assert(issueAudit.response.status === 200, `${issueAudit.url} expected service key issue audit read`);
    const issueAuditEntry = issueAudit.json?.data?.logs?.find((entry) => (
      entry.entity === 'settings' &&
      entry.entityId === 'platform' &&
      entry.action === 'settings.api_keys.issue' &&
      entry.requestId === issue.json.requestId
    ));
    assert(issueAuditEntry?.metadata?.keyId === issued.id, `${issueAudit.url} missing service key issue audit key id`);
    assert(!JSON.stringify(issueAuditEntry || {}).includes(issued.adminApiKey), `${issueAudit.url} leaked raw service key in issue audit`);
    assert(!JSON.stringify(issueAuditEntry || {}).includes('"keyHash"'), `${issueAudit.url} leaked service key hash in issue audit`);

    const serviceRead = await request('/api/admin/settings', {
      headers: {
        'x-backy-admin-key': issued.adminApiKey,
      },
    });
    assert(serviceRead.response.status === 200, `${serviceRead.url} expected issued service key to authenticate settings read`);
    assert(serviceRead.json?.data?.settings?.apiKeys?.adminApiKey === '', `${serviceRead.url} service key must not expose owner admin key`);

    const ownerReadAfterUse = await requestOwnerOnly('/api/admin/settings');
    const activeGrant = ownerReadAfterUse.json?.data?.settings?.auth?.apiKeyServiceKeys?.find((grant) => grant.id === issued.id);
    assert(activeGrant?.status === 'active', `${ownerReadAfterUse.url} missing active service key grant`);
    assert(activeGrant?.lastUsedAt, `${ownerReadAfterUse.url} did not persist service key last-used metadata`);
    assert(activeGrant?.keyHash === undefined, `${ownerReadAfterUse.url} exposed service key hash after use`);
    assert(!JSON.stringify(ownerReadAfterUse.json?.data?.settings || {}).includes(issued.adminApiKey), `${ownerReadAfterUse.url} leaked raw service key after use`);

    const ownerOnlyDenied = await request('/api/admin/settings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-backy-admin-key': issued.adminApiKey,
      },
      body: JSON.stringify({
        action: 'regenerate-api-keys',
        scope: 'admin',
      }),
    });
    assert(ownerOnlyDenied.response.status === 403, `${ownerOnlyDenied.url} expected service key owner-only denial`);
    assert(ownerOnlyDenied.json?.error?.code === 'FORBIDDEN_PERMISSION', `${ownerOnlyDenied.url} expected FORBIDDEN_PERMISSION`);

    const revoke = await requestOwnerOnly('/api/admin/settings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'revoke-admin-api-key',
        keyId: issued.id,
      }),
    });
    assert(revoke.response.status === 200, `${revoke.url} expected service key revoke 200, got ${revoke.response.status}`);
    const revokedGrant = revoke.json?.data?.settings?.auth?.apiKeyServiceKeys?.find((grant) => grant.id === issued.id);
    assert(revokedGrant?.status === 'revoked' && revokedGrant?.revokedAt, `${revoke.url} did not mark service key revoked`);
    assert(revokedGrant?.keyHash === undefined, `${revoke.url} exposed service key hash after revoke`);
    assert(!JSON.stringify(revoke.json?.data?.settings || {}).includes(issued.adminApiKey), `${revoke.url} leaked raw service key after revoke`);

    const revokeAudit = await request(`/api/admin/audit-logs?entity=settings&entityId=platform&action=${encodeURIComponent('settings.api_keys.revoke')}&requestId=${revoke.json.requestId}`);
    assert(revokeAudit.response.status === 200, `${revokeAudit.url} expected service key revoke audit read`);
    const revokeAuditEntry = revokeAudit.json?.data?.logs?.find((entry) => (
      entry.entity === 'settings' &&
      entry.entityId === 'platform' &&
      entry.action === 'settings.api_keys.revoke' &&
      entry.requestId === revoke.json.requestId
    ));
    assert(revokeAuditEntry?.metadata?.keyId === issued.id, `${revokeAudit.url} missing service key revoke audit key id`);
    assert(!JSON.stringify(revokeAuditEntry || {}).includes(issued.adminApiKey), `${revokeAudit.url} leaked raw service key in revoke audit`);
    assert(!JSON.stringify(revokeAuditEntry || {}).includes('"keyHash"'), `${revokeAudit.url} leaked service key hash in revoke audit`);

    const rejectedAfterRevoke = await request('/api/admin/settings', {
      headers: {
        'x-backy-admin-key': issued.adminApiKey,
      },
    });
    assert(rejectedAfterRevoke.response.status === 401, `${rejectedAfterRevoke.url} expected revoked service key rejection`);
    assert(rejectedAfterRevoke.json?.error?.code === 'UNAUTHORIZED', `${rejectedAfterRevoke.url} expected UNAUTHORIZED after revoke`);
  });

  await cleanup();

  console.log(`Admin contract smoke passed against ${baseUrl}`);
  for (const check of checks) {
    console.log(`- ${check.name} (${check.ms}ms)`);
  }
} catch (error) {
  await cleanup();
  throw error;
}
