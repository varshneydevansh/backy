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

const assertPostgresDriverResolvable = async () => {
  try {
    const driver = await import('postgres');
    assert(typeof driver.default === 'function', 'postgres package must export the default client factory.');
  } catch (error) {
    throw new Error(`SDK Postgres certification requires the postgres npm package before the database smoke can run: ${error instanceof Error ? error.message : String(error)}`);
  }
};

await assertPostgresDriverResolvable();

const sdkSmokeCi = read('../../../scripts/sdk-smoke-ci.mjs');
const sdkSmoke = read('../../../packages/sdk-js/scripts/smoke.mjs');
const generatedSdkTypeSmoke = read('../../../packages/sdk-js/scripts/generated-contract-types.ts');
const nextConfig = read('../next.config.js');
const manifestRoute = read('../src/app/api/sites/[siteId]/manifest/route.ts');
const openApiRoute = read('../src/app/api/sites/[siteId]/openapi/route.ts');
const adminSettingsRoute = read('../src/app/api/admin/settings/route.ts');
const adminSiteSettingsRoute = read('../src/app/api/admin/sites/[siteId]/settings/route.ts');
const frontendManifestSchema = read('../../../specs/ai-frontend-contract/frontend-manifest.schema.json');
const generatedSdkTypes = read('../../../packages/sdk-js/src/generated-contract-types.ts');
const sdkIndex = read('../../../packages/sdk-js/src/index.ts');
const settingsRoute = read('../../../apps/admin/src/routes/settings.tsx');
const adminContentApi = read('../../../apps/admin/src/lib/adminContentApi.ts');
const rootPackage = read('../../../package.json');
const sdkPostgresWorkflow = read('../../../.github/workflows/sdk-postgres-smoke.yml');
const audit = read('../../../specs/page-completion-audit/backy-page-surface-audit.md');
const sdkReadme = read('../../../packages/sdk-js/README.md');
const apiContracts = read('../../../specs/backy-api-contracts.md');

assert(
  manifestRoute.includes('frontendDatabaseCertification') &&
    manifestRoute.includes("schemaVersion: 'backy.frontend-database-certification.v1'") &&
    manifestRoute.includes("databaseCertification: frontendDatabaseCertification") &&
    manifestRoute.includes("command: 'npm run ci:sdk-postgres-smoke'") &&
    manifestRoute.includes("workflow: '.github/workflows/sdk-postgres-smoke.yml'") &&
    manifestRoute.includes("localPreflight: 'npm run test:sdk-postgres-preflight-contract'") &&
    manifestRoute.includes("typeContract: 'npm run test:frontend-contract-types'") &&
    manifestRoute.includes("'BACKY_DATABASE_URL', 'DATABASE_URL'") &&
    manifestRoute.includes("requiredConfirmationEnv: 'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true'") &&
    manifestRoute.includes("'BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST'") &&
    manifestRoute.includes("'BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE'") &&
    manifestRoute.includes('operatorCommandTemplate: FRONTEND_DATABASE_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE') &&
    manifestRoute.includes('operatorEnvTemplate') &&
    manifestRoute.includes('buildFrontendDatabaseCertificationCommand') &&
    manifestRoute.includes('buildFrontendDatabaseCertificationEnvTemplate') &&
    manifestRoute.includes("'BACKY_SDK_REQUIRE_DATABASE', '1'") &&
    manifestRoute.includes("'BACKY_RELEASE_CERTIFY_DATABASE', '1'") &&
    manifestRoute.includes('backy.frontend-database-certification-env-template.v1') &&
    manifestRoute.includes('npm run doctor:release-certification') &&
    manifestRoute.includes('disposable_database_confirmed=true') &&
    manifestRoute.includes('BACKY_DATABASE_DISPOSABLE_CONFIRMED=true') &&
    manifestRoute.includes('getFrontendDatabaseCertificationRuntime') &&
    manifestRoute.includes('databaseUrlConfigured') &&
    manifestRoute.includes('readyForCertification') &&
    manifestRoute.includes('scenarioEvidence: buildFrontendDatabaseCertificationEvidence(frontendDatabaseCertificationRuntime)') &&
    manifestRoute.includes('backy.frontend-database-certification-evidence.v1') &&
    manifestRoute.includes("'commerce'") &&
    manifestRoute.includes("'generated-sdk'") &&
    manifestRoute.includes('Manifest and OpenAPI discovery') &&
    manifestRoute.includes('Generated SDK and cache') &&
    manifestRoute.includes('database URLs, service credentials, private orders, submissions, and contact payloads stay private') &&
    manifestRoute.includes('runtime: frontendDatabaseCertificationRuntime') &&
    manifestRoute.includes('Database URLs and service credentials are never returned') &&
    manifestRoute.includes("'media'") &&
    manifestRoute.includes("'forms'") &&
    manifestRoute.includes("'interactive-components'") &&
    manifestRoute.includes('Database URLs and service credentials stay in CI/runtime environment'),
  'Frontend manifest must expose a non-secret SDK Postgres database certification handoff.',
);

assert(
  adminSettingsRoute.includes('frontendDatabaseCertification: frontendDatabaseCertificationContract(') &&
    adminSettingsRoute.includes("schemaVersion: 'backy.frontend-database-certification.v1'") &&
    adminSettingsRoute.includes("source: 'admin-settings-api'") &&
    adminSettingsRoute.includes("command: 'npm run ci:sdk-postgres-smoke'") &&
    adminSettingsRoute.includes("workflow: '.github/workflows/sdk-postgres-smoke.yml'") &&
    adminSettingsRoute.includes("localPreflight: 'npm run test:sdk-postgres-preflight-contract'") &&
    adminSettingsRoute.includes("disposableGuard: 'npm run test:sdk-postgres-disposable-guard'") &&
    adminSettingsRoute.includes("'BACKY_DATABASE_URL', 'DATABASE_URL'") &&
    adminSettingsRoute.includes("requiredConfirmationEnv: 'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true'") &&
    adminSettingsRoute.includes('operatorCommandTemplate: FRONTEND_DATABASE_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE') &&
    adminSettingsRoute.includes('operatorEnvTemplate') &&
    adminSettingsRoute.includes('buildFrontendDatabaseCertificationCommand') &&
    adminSettingsRoute.includes('buildFrontendDatabaseCertificationEnvTemplate') &&
    adminSettingsRoute.includes("'BACKY_SDK_REQUIRE_DATABASE', '1'") &&
    adminSettingsRoute.includes("'BACKY_RELEASE_CERTIFY_DATABASE', '1'") &&
    adminSettingsRoute.includes('backy.frontend-database-certification-env-template.v1') &&
    adminSettingsRoute.includes('.env.backy-frontend-database-certification') &&
    adminSettingsRoute.includes('getFrontendDatabaseCertificationRuntime') &&
    adminSettingsRoute.includes('databaseUrlConfigured') &&
    adminSettingsRoute.includes('readyForCertification') &&
    adminSettingsRoute.includes('scenarioEvidence') &&
    adminSettingsRoute.includes('backy.frontend-database-certification-evidence.v1') &&
    adminSettingsRoute.includes("'generated-sdk'") &&
    adminSettingsRoute.includes('Database URLs and service credentials stay in CI/runtime environment'),
  'Admin Settings API must mirror the non-secret SDK Postgres certification handoff for custom admin clients.',
);

assert(
  adminSiteSettingsRoute.includes('frontendDatabaseCertification: frontendDatabaseCertificationContract(') &&
    adminSiteSettingsRoute.includes('schemaVersion: "backy.frontend-database-certification.v1"') &&
    adminSiteSettingsRoute.includes('source: "admin-site-settings-api"') &&
    adminSiteSettingsRoute.includes('command: "npm run ci:sdk-postgres-smoke"') &&
    adminSiteSettingsRoute.includes('workflow: ".github/workflows/sdk-postgres-smoke.yml"') &&
    adminSiteSettingsRoute.includes('localPreflight: "npm run test:sdk-postgres-preflight-contract"') &&
    adminSiteSettingsRoute.includes('disposableGuard: "npm run test:sdk-postgres-disposable-guard"') &&
    adminSiteSettingsRoute.includes('"BACKY_DATABASE_URL"') &&
    adminSiteSettingsRoute.includes('"DATABASE_URL"') &&
    adminSiteSettingsRoute.includes('requiredConfirmationEnv: "BACKY_DATABASE_DISPOSABLE_CONFIRMED=true"') &&
    adminSiteSettingsRoute.includes('operatorCommandTemplate: FRONTEND_DATABASE_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE') &&
    adminSiteSettingsRoute.includes('operatorEnvTemplate') &&
    adminSiteSettingsRoute.includes('buildFrontendDatabaseCertificationCommand') &&
    adminSiteSettingsRoute.includes('buildFrontendDatabaseCertificationEnvTemplate') &&
    adminSiteSettingsRoute.includes('"BACKY_SDK_REQUIRE_DATABASE", "1"') &&
    adminSiteSettingsRoute.includes('"BACKY_RELEASE_CERTIFY_DATABASE", "1"') &&
    adminSiteSettingsRoute.includes('backy.frontend-database-certification-env-template.v1') &&
    adminSiteSettingsRoute.includes('.env.backy-frontend-database-certification') &&
    adminSiteSettingsRoute.includes('getFrontendDatabaseCertificationRuntime') &&
    adminSiteSettingsRoute.includes('databaseUrlConfigured') &&
    adminSiteSettingsRoute.includes('readyForCertification') &&
    adminSiteSettingsRoute.includes('scenarioEvidence') &&
    adminSiteSettingsRoute.includes('backy.frontend-database-certification-evidence.v1') &&
    adminSiteSettingsRoute.includes('"generated-sdk"') &&
    adminSiteSettingsRoute.includes('Database URLs and service credentials stay in CI/runtime environment'),
  'Site-scoped Settings API must mirror the non-secret SDK Postgres certification handoff for custom admin clients.',
);

assert(
  adminContentApi.includes('export interface FrontendDatabaseCertificationHandoff') &&
    adminContentApi.includes("schemaVersion: 'backy.frontend-database-certification.v1'") &&
    adminContentApi.includes("schemaVersion: 'backy.frontend-database-certification-evidence.v1'") &&
    adminContentApi.includes('frontendDatabaseCertification?: FrontendDatabaseCertificationHandoff') &&
    adminContentApi.includes('const toSiteSettingsInput = (settings: ApiSettings): SiteSettingsInput') &&
    adminContentApi.includes('frontendDatabaseCertification: settings.frontendDatabaseCertification') &&
    adminContentApi.includes('return toSiteSettingsInput(payload.data.settings)'),
  'Admin content API must type and preserve the Settings frontend database certification handoff.',
);

assert(
  manifestRoute.includes('buildFrontendLaunchReadiness') &&
    manifestRoute.includes("schemaVersion: 'backy.frontend-launch-readiness.v1'") &&
    manifestRoute.includes("schemaVersion: 'backy.frontend-launch-action-plan.v1'") &&
    manifestRoute.includes('frontendLaunchReadiness: null as ReturnType<typeof buildFrontendLaunchReadiness> | null') &&
    manifestRoute.includes('manifest.data.contract.frontendLaunchReadiness = buildFrontendLaunchReadiness') &&
    manifestRoute.includes("key: 'routing-render-contracts'") &&
    manifestRoute.includes("key: 'content-design-modules'") &&
    manifestRoute.includes("key: 'media-font-delivery'") &&
    manifestRoute.includes("key: 'visitor-interactions'") &&
    manifestRoute.includes("key: 'commerce-handoff'") &&
    manifestRoute.includes("key: 'live-management'") &&
    manifestRoute.includes("key: 'database-certification'") &&
    manifestRoute.includes('databaseCertification.gate.command') &&
    manifestRoute.includes('commerceProviderCertification') &&
    manifestRoute.includes('publicManifestExcludesPrivateQueues: true') &&
    manifestRoute.includes('adminEndpointsRequireAuth: true') &&
    manifestRoute.includes('submissionAndOrderPayloadsPrivate: true') &&
    manifestRoute.includes('Launch readiness exposes endpoint templates, booleans, counts, schema names, and certification gates only'),
  'Frontend manifest must expose a non-secret launch-readiness summary for custom frontend operators.',
);

assert(
    settingsRoute.includes('data-testid="settings-frontend-database-certification"') &&
    settingsRoute.includes('data-testid="settings-frontend-database-certification-copy-button"') &&
    settingsRoute.includes('data-testid="settings-frontend-database-certification-download-button"') &&
    settingsRoute.includes('data-testid="settings-frontend-database-certification-evidence"') &&
    settingsRoute.includes('data-testid="settings-frontend-database-certification-command-builder"') &&
    settingsRoute.includes('data-testid="settings-frontend-database-certification-env-copy-button"') &&
    settingsRoute.includes('data-testid="settings-frontend-database-certification-env-template"') &&
    settingsRoute.includes('data-testid="settings-frontend-database-certification-env-template-body"') &&
    settingsRoute.includes('data-testid="settings-frontend-database-certification-command-builder-copy-button"') &&
    settingsRoute.includes('data-testid="settings-frontend-database-certification-database-alias-select"') &&
    settingsRoute.includes('data-testid="settings-frontend-database-certification-expected-host-input"') &&
    settingsRoute.includes('data-testid="settings-frontend-database-certification-expected-database-input"') &&
    settingsRoute.includes('data-testid="settings-frontend-database-certification-required-inputs"') &&
    settingsRoute.includes('data-testid="settings-site-scope-frontend-database-certification"') &&
    settingsRoute.includes('Frontend SDK database certification') &&
    settingsRoute.includes('frontendDatabaseCertificationHandoff') &&
    settingsRoute.includes('frontendDatabaseCertification: siteSettingsScope.frontendDatabaseCertification') &&
    settingsRoute.includes('frontendDatabaseCertificationScenarioEvidence') &&
    settingsRoute.includes('scenarioEvidence: frontendDatabaseCertificationScenarioEvidence') &&
    settingsRoute.includes('backy.frontend-database-certification-evidence.v1') &&
    settingsRoute.includes('Frontend database scenario evidence') &&
    settingsRoute.includes('Manifest and OpenAPI discovery') &&
    settingsRoute.includes('Commerce contracts') &&
    settingsRoute.includes('Generated SDK and cache') &&
    settingsRoute.includes('operatorCommandTemplate: FRONTEND_DATABASE_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE') &&
    settingsRoute.includes('operatorEnvTemplate') &&
    settingsRoute.includes('buildFrontendDatabaseCertificationCommand') &&
    settingsRoute.includes('buildFrontendDatabaseCertificationEnvTemplate') &&
    settingsRoute.includes('backy-frontend-database-certification-handoff.json') &&
    settingsRoute.includes('Frontend database certification handoff downloaded.') &&
    settingsRoute.includes('backy.frontend-database-certification-env-template.v1') &&
    settingsRoute.includes('Copy env template') &&
    settingsRoute.includes('npm run ci:sdk-postgres-smoke') &&
    settingsRoute.includes('npm run doctor:release-certification') &&
    settingsRoute.includes('npm run test:sdk-postgres-preflight-contract') &&
    settingsRoute.includes('npm run test:frontend-contract-types') &&
    settingsRoute.includes('.github/workflows/sdk-postgres-smoke.yml') &&
    settingsRoute.includes('BACKY_DATABASE_URL or DATABASE_URL') &&
    settingsRoute.includes('BACKY_SDK_REQUIRE_DATABASE=1') &&
    settingsRoute.includes('BACKY_RELEASE_CERTIFY_DATABASE=1') &&
    settingsRoute.includes('BACKY_DATABASE_DISPOSABLE_CONFIRMED=true') &&
    settingsRoute.includes('backy.frontend-database-certification.v1') &&
    settingsRoute.includes('BackyFrontendDatabaseCertification') &&
    settingsRoute.includes('runtimeDatabase') &&
    settingsRoute.includes('runtimePublicApi'),
  'Settings Delivery tab must expose the SDK Postgres database certification handoff for custom frontend operators.',
);

assert(
  openApiRoute.includes('frontendDatabaseCertification') &&
    openApiRoute.includes('"x-backy-database-certification": frontendDatabaseCertification') &&
    openApiRoute.includes('backy.frontend-database-certification.v1') &&
    openApiRoute.includes('npm run ci:sdk-postgres-smoke') &&
    openApiRoute.includes('npm run test:frontend-contract-types') &&
    openApiRoute.includes('requiredConfirmationEnv: "BACKY_DATABASE_DISPOSABLE_CONFIRMED=true"') &&
    openApiRoute.includes('BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST') &&
    openApiRoute.includes('BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE') &&
    openApiRoute.includes('operatorCommandTemplate: FRONTEND_DATABASE_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE') &&
    openApiRoute.includes('operatorEnvTemplate') &&
    openApiRoute.includes('buildFrontendDatabaseCertificationCommand') &&
    openApiRoute.includes('buildFrontendDatabaseCertificationEnvTemplate') &&
    openApiRoute.includes('"BACKY_SDK_REQUIRE_DATABASE", "1"') &&
    openApiRoute.includes('"BACKY_RELEASE_CERTIFY_DATABASE", "1"') &&
    openApiRoute.includes('backy.frontend-database-certification-env-template.v1') &&
    openApiRoute.includes('npm run doctor:release-certification') &&
    openApiRoute.includes('disposable_database_confirmed=true') &&
    openApiRoute.includes('BACKY_DATABASE_DISPOSABLE_CONFIRMED=true') &&
    openApiRoute.includes('getFrontendDatabaseCertificationRuntime') &&
    openApiRoute.includes('databaseUrlConfigured') &&
    openApiRoute.includes('readyForCertification') &&
    openApiRoute.includes('scenarioEvidence: buildFrontendDatabaseCertificationEvidence(frontendDatabaseCertificationRuntime)') &&
    openApiRoute.includes('backy.frontend-database-certification-evidence.v1') &&
    openApiRoute.includes('"commerce"') &&
    openApiRoute.includes('"generated-sdk"') &&
    openApiRoute.includes('Manifest and OpenAPI discovery') &&
    openApiRoute.includes('Generated SDK and cache') &&
    openApiRoute.includes('runtime: frontendDatabaseCertificationRuntime') &&
    openApiRoute.includes('Database URLs and service credentials are never returned') &&
    openApiRoute.includes('"media"') &&
    openApiRoute.includes('"forms"') &&
    openApiRoute.includes('"interactive-components"') &&
    openApiRoute.includes('OpenAPI exposes only non-secret gate names and requirements'),
  'Site-scoped OpenAPI must expose the same non-secret SDK Postgres database certification extension.',
);

assert(
  openApiRoute.includes('buildFrontendLaunchReadiness') &&
    openApiRoute.includes('"x-backy-frontend-launch-readiness": frontendLaunchReadiness') &&
    openApiRoute.includes('backy.frontend-launch-readiness.v1') &&
    openApiRoute.includes('backy.frontend-launch-action-plan.v1') &&
    openApiRoute.includes('getMediaList') &&
    openApiRoute.includes('media.pagination.total') &&
    openApiRoute.includes('routing-render-contracts') &&
    openApiRoute.includes('content-design-modules') &&
    openApiRoute.includes('commerce-handoff') &&
    openApiRoute.includes('database-certification') &&
    openApiRoute.includes('frontendDatabaseCertification.gate.command') &&
    openApiRoute.includes('publicManifestExcludesPrivateQueues: true') &&
    openApiRoute.includes('adminEndpointsRequireAuth: true') &&
    openApiRoute.includes('submissionAndOrderPayloadsPrivate: true') &&
    openApiRoute.includes('Launch readiness exposes endpoint counts, booleans, schema names, and certification gates only'),
  'Site-scoped OpenAPI must mirror the non-secret custom-frontend launch readiness extension.',
);

assert(
  frontendManifestSchema.includes('"databaseCertification"') &&
    frontendManifestSchema.includes('"backy.frontend-database-certification.v1"') &&
    frontendManifestSchema.includes('"npm run ci:sdk-postgres-smoke"') &&
    frontendManifestSchema.includes('"npm run test:frontend-contract-types"') &&
    frontendManifestSchema.includes('"BACKY_DATABASE_URL"') &&
    frontendManifestSchema.includes('"DATABASE_URL"') &&
    frontendManifestSchema.includes('"requiredConfirmationEnv": { "const": "BACKY_DATABASE_DISPOSABLE_CONFIRMED=true" }') &&
    frontendManifestSchema.includes('"operatorCommandTemplate"') &&
    frontendManifestSchema.includes('"operatorEnvTemplate"') &&
    frontendManifestSchema.includes('"envTemplateSchemaVersion": { "const": "backy.frontend-database-certification-env-template.v1" }') &&
    frontendManifestSchema.includes('"fileName": { "const": ".env.backy-frontend-database-certification" }') &&
    frontendManifestSchema.includes('"command": { "type": "string", "minLength": 1 }') &&
    frontendManifestSchema.includes('"required": ["command", "envTemplate", "envTemplateSchemaVersion", "databaseUrlAliases", "requiredInputs", "targetGuards", "secretHandling"]') &&
    frontendManifestSchema.includes('"runtime"') &&
    frontendManifestSchema.includes('"databaseUrlConfigured"') &&
    frontendManifestSchema.includes('"readyForCertification"') &&
    frontendManifestSchema.includes('"scenarioEvidence"') &&
    frontendManifestSchema.includes('"backy.frontend-database-certification-evidence.v1"') &&
    frontendManifestSchema.includes('"BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:sdk-postgres-smoke"') &&
    frontendManifestSchema.includes('"covered"') &&
    frontendManifestSchema.includes('"expectedEvidence"') &&
    frontendManifestSchema.includes('"version", "schemas", "databaseCertification"'),
  'Frontend manifest schema must require and type the database certification handoff.',
);

assert(
  frontendManifestSchema.includes('"launchReadiness"') &&
    frontendManifestSchema.includes('"backy.frontend-launch-readiness.v1"') &&
    frontendManifestSchema.includes('"backy.frontend-launch-action-plan.v1"') &&
    frontendManifestSchema.includes('"status": { "enum": ["ready", "attention", "blocked"] }') &&
    frontendManifestSchema.includes('"score": { "type": "integer", "minimum": 0, "maximum": 100 }') &&
    frontendManifestSchema.includes('"moduleCounts"') &&
    frontendManifestSchema.includes('"checks"') &&
    frontendManifestSchema.includes('"actionPlan"') &&
    frontendManifestSchema.includes('"privacy"') &&
    frontendManifestSchema.includes('"includesSecretValues": { "const": false }') &&
    frontendManifestSchema.includes('"frontendLaunchReadiness": { "$ref": "#/$defs/launchReadiness" }') &&
    frontendManifestSchema.includes('"version", "schemas", "databaseCertification", "frontendLaunchReadiness"'),
  'Frontend manifest schema must require and type the launch-readiness handoff.',
);

assert(
  generatedSdkTypes.includes('GeneratedBackyFrontendManifestDatabaseCertification') &&
    generatedSdkTypes.includes('"x-backy-database-certification"?: GeneratedBackyFrontendManifestDatabaseCertification') &&
    generatedSdkTypes.includes('databaseCertification: GeneratedBackyFrontendManifestDatabaseCertification') &&
    generatedSdkTypes.includes('"npm run ci:sdk-postgres-smoke"') &&
    generatedSdkTypes.includes('requiredConfirmationEnv: "BACKY_DATABASE_DISPOSABLE_CONFIRMED=true"') &&
    generatedSdkTypes.includes('operatorCommandTemplate: {') &&
    generatedSdkTypes.includes('operatorEnvTemplate: {') &&
    generatedSdkTypes.includes('envTemplateSchemaVersion: "backy.frontend-database-certification-env-template.v1"') &&
    generatedSdkTypes.includes('fileName: ".env.backy-frontend-database-certification"') &&
    generatedSdkTypes.includes('databaseUrlAliases: Array<"BACKY_DATABASE_URL" | "DATABASE_URL">') &&
    generatedSdkTypes.includes('databaseUrlConfigured: boolean') &&
    generatedSdkTypes.includes('readyForCertification: boolean') &&
    generatedSdkTypes.includes('schemaVersion: "backy.frontend-database-certification-evidence.v1"') &&
    generatedSdkTypes.includes('requiredGate: "BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:sdk-postgres-smoke"') &&
    generatedSdkTypes.includes('expectedEvidence: Array<string>') &&
    generatedSdkTypes.includes('"npm run test:frontend-contract-types"'),
  'Generated SDK types must export the manifest/OpenAPI database certification contract.',
);

assert(
  generatedSdkTypes.includes('GeneratedBackyFrontendManifestLaunchReadiness') &&
    generatedSdkTypes.includes('"x-backy-frontend-launch-readiness"?: GeneratedBackyFrontendManifestLaunchReadiness') &&
    generatedSdkTypes.includes('frontendLaunchReadiness: GeneratedBackyFrontendManifestLaunchReadiness') &&
    generatedSdkTypes.includes('schemaVersion: "backy.frontend-launch-readiness.v1"') &&
    generatedSdkTypes.includes('schemaVersion: "backy.frontend-launch-action-plan.v1"') &&
    generatedSdkTypes.includes('includesSecretValues: false') &&
    generatedSdkTypes.includes('recommendedCommands: Array<string>'),
  'Generated SDK types must export the manifest/OpenAPI launch-readiness contract.',
);

assert(
  sdkIndex.includes('export interface BackyFrontendDatabaseCertification') &&
    sdkIndex.includes('schemaVersion: "backy.frontend-database-certification.v1"') &&
    sdkIndex.includes('readyForCertification: boolean') &&
    sdkIndex.includes('schemaVersion: "backy.frontend-database-certification-evidence.v1"') &&
    sdkIndex.includes('expectedEvidence: string[]') &&
    sdkIndex.includes('operatorCommandTemplate: {') &&
    sdkIndex.includes('operatorEnvTemplate: {') &&
    sdkIndex.includes('envTemplateSchemaVersion: "backy.frontend-database-certification-env-template.v1"') &&
    sdkIndex.includes('export interface BackyFrontendManifestContract') &&
    sdkIndex.includes('databaseCertification: BackyFrontendDatabaseCertification') &&
    sdkIndex.includes('contract: BackyFrontendManifestContract') &&
    generatedSdkTypeSmoke.includes('convenienceFrontendDatabaseCertification') &&
    generatedSdkTypeSmoke.includes('operatorCommandTemplate') &&
    generatedSdkTypeSmoke.includes('operatorEnvTemplate') &&
    generatedSdkTypeSmoke.includes('scenarioEvidence') &&
    generatedSdkTypeSmoke.includes('generated-sdk-cache') &&
    generatedSdkTypeSmoke.includes('export BACKY_SDK_REQUIRE_DATABASE') &&
    generatedSdkTypeSmoke.includes('satisfies BackyFrontendDatabaseCertification'),
  'SDK convenience manifest types must expose the same database certification runtime handoff as generated types.',
);

assert(
  sdkIndex.includes('GeneratedBackyFrontendManifestLaunchReadiness') &&
    sdkIndex.includes('export interface BackyFrontendLaunchReadiness') &&
    sdkIndex.includes('schemaVersion: "backy.frontend-launch-readiness.v1"') &&
    sdkIndex.includes('schemaVersion: "backy.frontend-launch-action-plan.v1"') &&
    sdkIndex.includes('includesSecretValues: false') &&
    sdkIndex.includes('frontendLaunchReadiness: BackyFrontendLaunchReadiness') &&
    generatedSdkTypeSmoke.includes('frontendLaunchReadiness') &&
    generatedSdkTypeSmoke.includes('convenienceFrontendLaunchReadiness') &&
    generatedSdkTypeSmoke.includes('satisfies BackyFrontendLaunchReadiness') &&
    generatedSdkTypeSmoke.includes('satisfies GeneratedBackyFrontendManifestLaunchReadiness'),
  'SDK convenience manifest types must expose the same launch-readiness handoff as generated types.',
);

assert(
  sdkSmokeCi.includes('requiredDatabaseSchema') &&
    sdkSmokeCi.includes('requiredDatabaseEnums') &&
    sdkSmokeCi.includes('requiredDatabaseRlsTables') &&
    sdkSmokeCi.includes('requiredDatabasePolicies') &&
    sdkSmokeCi.includes('requiredDatabaseIndexes') &&
    sdkSmokeCi.includes('requiredDatabaseConstraints') &&
    sdkSmokeCi.includes('assertExpectedDatabaseTarget') &&
    sdkSmokeCi.includes('assertDisposableDatabaseConfirmed') &&
    sdkSmokeCi.includes('BACKY_DATABASE_DISPOSABLE_CONFIRMED=true is required') &&
    sdkSmokeCi.includes('BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST') &&
    sdkSmokeCi.includes('BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE') &&
    sdkSmokeCi.includes('SDK Postgres certification expected database host') &&
    sdkSmokeCi.includes('SDK Postgres certification expected database name') &&
    sdkSmokeCi.includes('SDK_DATABASE_DISCOVERY_SITE_SLUG') &&
    sdkSmokeCi.includes('ensureSdkDatabaseDiscoverySite') &&
    sdkSmokeCi.includes("'database-mode published discovery site'") &&
    sdkSmokeCi.includes('backy.sdk-postgres-smoke-ci.v1') &&
    sdkSmokeCi.includes('targetGuard') &&
    sdkSmokeCi.includes('urlValid: requireDatabaseMode ? true : null') &&
    sdkSmokeCi.includes('expectedHostConfigured') &&
    sdkSmokeCi.includes('expectedDatabaseConfigured'),
  'SDK Postgres smoke must preflight target host/name, seed a database-mode discovery site, verify schema, enum, RLS, policy, index, and constraint readiness, then emit machine-readable certification evidence.',
);

assert(
  sdkSmokeCi.includes("import net from 'node:net'") &&
    sdkSmokeCi.includes('const freePort = async ()') &&
    sdkSmokeCi.includes('node_modules/next/dist/bin/next') &&
    sdkSmokeCi.includes("`http://127.0.0.1:${await freePort()}`") &&
    sdkSmokeCi.includes("process.execPath, [nextBin, 'dev', '-p', localServerPort]") &&
    sdkSmokeCi.includes('BACKY_NEXT_DIST_DIR') &&
    sdkSmokeCi.includes("localNextDistDir = '.next-sdk-smoke'") &&
    sdkSmokeCi.includes('localNextDistDir') &&
    nextConfig.includes('process.env.BACKY_NEXT_DIST_DIR') &&
    nextConfig.includes('distDir: process.env.BACKY_NEXT_DIST_DIR') &&
    sdkSmokeCi.includes('shouldStartLocalServer'),
  'SDK smoke CI must allocate a fresh local Next port and isolated distDir instead of reusing a stale fixed-port server.',
);

assert(
  sdkSmokeCi.includes("contract: 'backy.sdk-postgres-smoke-ci.v1'") &&
    sdkSmokeCi.includes('targetGuard') &&
    sdkSmokeCi.includes('databaseDiscovery') &&
    sdkSmokeCi.includes('urlValid: requireDatabaseMode ? true : null') &&
    sdkSmokeCi.includes('expectedHostConfigured') &&
    sdkSmokeCi.includes('expectedDatabaseConfigured'),
  'SDK Postgres smoke must emit machine-readable target-guard and discovery-site evidence after the configured database run.',
);

assert(
  sdkSmoke.includes('manifest() missing database certification schema') &&
    sdkSmoke.includes('manifest() missing SDK Postgres certification command') &&
    sdkSmoke.includes('manifest() missing BACKY_DATABASE_URL certification alias') &&
    sdkSmoke.includes('manifest() missing SDK Postgres disposable confirmation env requirement') &&
    sdkSmoke.includes('manifest() missing database expected-host guard') &&
    sdkSmoke.includes('manifest() missing disposable database confirmation requirement') &&
    sdkSmoke.includes('manifest() missing media database certification coverage') &&
    sdkSmoke.includes('manifest() missing forms database certification coverage') &&
    sdkSmoke.includes('manifest() missing interactive component database certification coverage') &&
    sdkSmoke.includes('manifest() missing non-secret database certification boundary') &&
    sdkSmoke.includes('openapi() database certification command drifted from manifest') &&
    sdkSmoke.includes('openapi() missing DATABASE_URL certification alias') &&
    sdkSmoke.includes('openapi() missing SDK Postgres disposable confirmation env requirement') &&
    sdkSmoke.includes('openapi() missing disposable database confirmation requirement') &&
    sdkSmoke.includes('openapi() missing media database certification coverage') &&
    sdkSmoke.includes('openapi() missing forms database certification coverage') &&
    sdkSmoke.includes('openapi() missing interactive component database certification coverage') &&
    sdkSmoke.includes('openapi() missing non-secret database certification boundary'),
  'SDK smoke must response-test the manifest/OpenAPI database certification handoff.',
);

assert(
  sdkSmoke.includes('manifest() missing frontend launch readiness schema') &&
    sdkSmoke.includes('manifest() frontend launch readiness status drifted') &&
    sdkSmoke.includes('manifest() missing frontend launch readiness score') &&
    sdkSmoke.includes('manifest() missing frontend launch action plan schema') &&
    sdkSmoke.includes('manifest() missing routing/render launch readiness check') &&
    sdkSmoke.includes('manifest() missing database launch readiness check') &&
    sdkSmoke.includes('manifest() launch readiness must not include secret values') &&
    sdkSmoke.includes('manifest() launch readiness missing admin auth boundary') &&
    sdkSmoke.includes('manifest() launch readiness missing SDK Postgres recommended command') &&
    sdkSmoke.includes('openapi() missing frontend launch readiness extension') &&
    sdkSmoke.includes('openapi() missing frontend launch action plan extension') &&
    sdkSmoke.includes('openapi() missing database frontend launch check') &&
    sdkSmoke.includes('openapi() launch readiness must not include secret values') &&
    sdkSmoke.includes('openapi() launch readiness missing SDK Postgres recommended command'),
  'SDK smoke must response-test the manifest/OpenAPI launch-readiness handoff.',
);

assert(
  sdkSmokeCi.includes('content_collections') &&
    sdkSmokeCi.includes('content_collection_records') &&
    sdkSmokeCi.includes('reusable_sections') &&
    sdkSmokeCi.includes('form_definitions') &&
    sdkSmokeCi.includes('form_submissions') &&
    sdkSmokeCi.includes('form_contacts') &&
    sdkSmokeCi.includes('comments') &&
    sdkSmokeCi.includes('activity_logs') &&
    sdkSmokeCi.includes('platform_settings') &&
    sdkSmokeCi.includes('media_folders') &&
    sdkSmokeCi.includes('media_versions') &&
    sdkSmokeCi.includes('cache_invalidation_events') &&
    sdkSmokeCi.includes('interactive_components'),
  'SDK Postgres smoke must preflight every public SDK service-data table used by the smoke.',
);

assert(
  sdkSmokeCi.includes('Team members can view activity logs') &&
    sdkSmokeCi.includes('Owners and admins can manage platform settings') &&
    sdkSmokeCi.includes('idx_activity_logs_site_id') &&
    sdkSmokeCi.includes('idx_activity_logs_created_at') &&
    sdkSmokeCi.includes('platform_settings_delivery_mode_check'),
  'SDK Postgres smoke must preflight activity log and platform settings RLS, index, and constraint readiness.',
);

assert(
  sdkSmokeCi.includes('Team members can view folders') &&
    sdkSmokeCi.includes('Editors can manage folders') &&
    sdkSmokeCi.includes('Team members can view media versions') &&
    sdkSmokeCi.includes('Editors can manage media versions') &&
    sdkSmokeCi.includes('Team members can view cache invalidations') &&
    sdkSmokeCi.includes('Editors can create cache invalidations') &&
    sdkSmokeCi.includes('Public can view approved active interactive components') &&
    sdkSmokeCi.includes('Team members can view interactive components') &&
    sdkSmokeCi.includes('Editors can manage interactive components'),
  'SDK Postgres smoke must preflight media folder/version, cache invalidation, and interactive component RLS policy names.',
);

assert(
  sdkSmokeCi.includes('media_type') &&
    sdkSmokeCi.includes("'image'") &&
    sdkSmokeCi.includes("'video'") &&
    sdkSmokeCi.includes("'audio'") &&
    sdkSmokeCi.includes("'document'") &&
    sdkSmokeCi.includes("'font'") &&
    sdkSmokeCi.includes("'other'"),
  'SDK Postgres smoke must preflight all supported media_type enum values.',
);

assert(
  sdkSmokeCi.includes('Public can view published content collections') &&
    sdkSmokeCi.includes('Public can view published content collection records') &&
    sdkSmokeCi.includes('Public can view active published form definitions') &&
    sdkSmokeCi.includes('Service role can create form submissions') &&
    sdkSmokeCi.includes('Public can view approved active interactive components'),
  'SDK Postgres smoke must preflight public read policies plus the service-role form submission write policy required by generated/custom frontends.',
);

assert(
  sdkSmokeCi.includes('content_collection_records_public_updated_idx') &&
    sdkSmokeCi.includes('form_submissions_site_form_status_submitted_idx') &&
    sdkSmokeCi.includes('form_contacts_site_email_idx') &&
    sdkSmokeCi.includes('idx_comments_site_target') &&
    sdkSmokeCi.includes('idx_media_versions_media_id') &&
    sdkSmokeCi.includes('idx_cache_invalidations_site_scope') &&
    sdkSmokeCi.includes('interactive_components_site_key_version_idx'),
  'SDK Postgres smoke must preflight key query indexes for frontend contract tables.',
);

assert(
  sdkSmokeCi.includes('content_collections_status_check') &&
    sdkSmokeCi.includes('content_collection_records_status_check') &&
    sdkSmokeCi.includes('reusable_sections_status_check') &&
    sdkSmokeCi.includes('form_definitions_audience_check') &&
    sdkSmokeCi.includes('form_submissions_status_check') &&
    sdkSmokeCi.includes('form_contacts_source_submission_id_fkey') &&
    sdkSmokeCi.includes('comments_status_check') &&
    sdkSmokeCi.includes('interactive_components_render_mode_check'),
  'SDK Postgres smoke must preflight status and relationship constraints for frontend contract tables.',
);

assert(
    rootPackage.includes('"test:sdk-postgres-disposable-guard": "node scripts/sdk-postgres-disposable-guard-smoke.mjs"') &&
    rootPackage.includes('"ci:sdk-postgres-smoke": "npm run test:sdk-postgres-preflight-contract && npm run test:sdk-postgres-disposable-guard && BACKY_SDK_REQUIRE_DATABASE=1 node scripts/sdk-smoke-ci.mjs"') &&
    rootPackage.includes('npm run test:sdk-postgres-disposable-guard && npm run test:admin-contract-source') &&
    rootPackage.includes('npm run test:settings-provider-certification-preflight-contract') &&
    sdkPostgresWorkflow.includes('Run SDK Postgres preflight contract') &&
    sdkPostgresWorkflow.includes('npm run test:sdk-postgres-preflight-contract') &&
    sdkPostgresWorkflow.includes('DATABASE_URL') &&
    sdkPostgresWorkflow.includes('BACKY_DATABASE_URL or DATABASE_URL') &&
    sdkPostgresWorkflow.includes('I confirm BACKY_DATABASE_URL or DATABASE_URL points to a disposable migrated Supabase/Postgres database.') &&
    sdkSmokeCi.includes('configured database URL points at') &&
    sdkPostgresWorkflow.includes('database_expected_host:') &&
    sdkPostgresWorkflow.includes('database_expected_name:') &&
    sdkPostgresWorkflow.includes('BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST') &&
    sdkPostgresWorkflow.includes('BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE') &&
    sdkPostgresWorkflow.includes('BACKY_DATABASE_DISPOSABLE_CONFIRMED') &&
    sdkSmokeCi.includes('assertPostgresDatabaseUrl') &&
    sdkSmokeCi.includes('valid postgres:// or postgresql:// URL for the SDK database smoke') &&
    sdkPostgresWorkflow.includes("BACKY_RELEASE_CERTIFY_DATABASE: '1'") &&
    sdkPostgresWorkflow.includes("BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1'") &&
    sdkPostgresWorkflow.includes('Run non-secret database certification doctor') &&
    sdkPostgresWorkflow.includes('npm run doctor:release-certification') &&
    sdkPostgresWorkflow.includes('Write non-secret SDK database summary') &&
    sdkPostgresWorkflow.includes('GITHUB_STEP_SUMMARY') &&
    sdkPostgresWorkflow.includes('| Certified regression gate | Gate | Requested | Aggregate preflight | Admin source guard | Non-secret target evidence |') &&
    sdkPostgresWorkflow.includes('| Frontend manifest/OpenAPI/SDK APIs | npm run ci:sdk-postgres-smoke | true | npm run test:partial-gate-preflights | npm run test:admin-contract-source |') &&
    sdkPostgresWorkflow.includes('disposable confirmed:') &&
    sdkPostgresWorkflow.includes('expected host configured:') &&
    sdkPostgresWorkflow.includes('expected database configured:') &&
    sdkPostgresWorkflow.includes('disposable_database_confirmed:') &&
    sdkPostgresWorkflow.includes('Require disposable Postgres or Supabase database URL') &&
    sdkPostgresWorkflow.includes('inputs.disposable_database_confirmed') &&
    sdkPostgresWorkflow.includes('Confirm disposable_database_confirmed=true') &&
    sdkPostgresWorkflow.indexOf('Run SDK Postgres preflight contract') < sdkPostgresWorkflow.indexOf('Require disposable Postgres or Supabase database URL') &&
    sdkPostgresWorkflow.indexOf('Run SDK Postgres preflight contract') < sdkPostgresWorkflow.indexOf('Run non-secret database certification doctor') &&
    sdkPostgresWorkflow.indexOf('Run non-secret database certification doctor') < sdkPostgresWorkflow.indexOf('Write non-secret SDK database summary') &&
    sdkPostgresWorkflow.indexOf('Run SDK Postgres preflight contract') < sdkPostgresWorkflow.indexOf('Write non-secret SDK database summary') &&
    sdkPostgresWorkflow.indexOf('Write non-secret SDK database summary') < sdkPostgresWorkflow.indexOf('Require disposable Postgres or Supabase database URL') &&
    sdkPostgresWorkflow.indexOf('Run SDK Postgres preflight contract') < sdkPostgresWorkflow.indexOf('Run SDK Postgres/Supabase smoke'),
  'SDK Postgres root script and manual workflow must run the preflight contract and require disposable database confirmation before the DB-backed smoke.',
);

assert(
  sdkSmokeCi.indexOf('assertPostgresDatabaseUrl();') < sdkSmokeCi.indexOf('assertExpectedDatabaseTarget();') &&
    sdkSmokeCi.indexOf('assertPostgresDatabaseUrl();') < sdkSmokeCi.indexOf('assertDisposableDatabaseConfirmed();') &&
    sdkSmokeCi.indexOf('assertDisposableDatabaseConfirmed();') < sdkSmokeCi.indexOf('assertExpectedDatabaseTarget();') &&
    sdkSmokeCi.indexOf('assertExpectedDatabaseTarget();') < sdkSmokeCi.indexOf('await assertSdkDatabaseSchemaReady();'),
  'SDK Postgres smoke must verify database URL format, disposable confirmation, and expected database host/name before schema checks or runtime startup.',
);

assert(
  sdkPostgresWorkflow.indexOf('Require disposable Postgres or Supabase database URL') < sdkPostgresWorkflow.indexOf('Run SDK Postgres/Supabase smoke') &&
    sdkPostgresWorkflow.indexOf('inputs.disposable_database_confirmed') < sdkPostgresWorkflow.indexOf('Run SDK Postgres/Supabase smoke'),
  'SDK Postgres manual workflow must require explicit disposable database confirmation before the DB-backed smoke.',
);

assert(
  sdkReadme.includes('BACKY_DATABASE_URL` or `DATABASE_URL` pointing at a disposable migrated Supabase/Postgres database') &&
    sdkReadme.includes('BACKY_DATABASE_DISPOSABLE_CONFIRMED=true') &&
    sdkReadme.includes('operatorCommandTemplate') &&
    sdkReadme.includes('BACKY_SDK_REQUIRE_DATABASE=1') &&
    sdkReadme.includes('npm run doctor:release-certification') &&
    sdkReadme.includes('forwards `disposable_database_confirmed=true` to `BACKY_DATABASE_DISPOSABLE_CONFIRMED`') &&
    sdkReadme.includes('with the `BACKY_DATABASE_URL` or `DATABASE_URL` repository secret alias') &&
    sdkReadme.includes('coverage families for media, forms, commerce, generated SDK/cache behavior, and interactive components') &&
    sdkReadme.includes('backy.frontend-database-certification-evidence.v1') &&
    sdkReadme.includes('scenario coverage for manifest/OpenAPI discovery, render and route resolution'),
  'SDK README must document both database secret aliases and the disposable confirmation env for the Supabase/Postgres smoke.',
);

assert(
  sdkReadme.includes('data.contract.frontendLaunchReadiness') &&
    sdkReadme.includes('x-backy-frontend-launch-readiness') &&
    sdkReadme.includes('BackyFrontendLaunchReadiness') &&
    sdkReadme.includes('GeneratedBackyFrontendManifestLaunchReadiness') &&
    sdkReadme.includes('backy.frontend-launch-readiness.v1') &&
    sdkReadme.includes('backy.frontend-launch-action-plan.v1') &&
    sdkReadme.includes('routing/render, CMS/design, media/font, visitor interaction, commerce, live-management, and database-certification checks') &&
    sdkReadme.includes('does not expose database URLs, provider keys, order records, or submission values'),
  'SDK README must document the manifest/OpenAPI custom-frontend launch-readiness handoff.',
);

assert(
    apiContracts.includes('forms-postgres-contract.yml` exposes the same gate as a manual GitHub Actions workflow using the `BACKY_DATABASE_URL` or `DATABASE_URL` repository secret alias for a disposable migrated Supabase/Postgres database') &&
    apiContracts.includes('against `BACKY_DATABASE_URL`/`DATABASE_URL` only after `BACKY_DATABASE_DISPOSABLE_CONFIRMED=true`') &&
    apiContracts.includes('GET /api/admin/sites/:siteId/settings` mirrors it at `data.settings.frontendDatabaseCertification`') &&
    apiContracts.includes('source: admin-site-settings-api') &&
    apiContracts.includes('`operatorCommandTemplate` for a copyable guarded command with `BACKY_SDK_REQUIRE_DATABASE=1` and `npm run doctor:release-certification`') &&
    apiContracts.includes('`operatorEnvTemplate` for `.env.backy-frontend-database-certification`') &&
    apiContracts.includes('backy.frontend-database-certification-evidence.v1') &&
    apiContracts.includes('scenario coverage for manifest/OpenAPI discovery, render/route resolution, media/font delivery') &&
    apiContracts.includes('sdk-postgres-smoke.yml` exposes the same gate as a manual GitHub Actions workflow using the `BACKY_DATABASE_URL` or `DATABASE_URL` repository secret alias for a disposable migrated Supabase/Postgres database'),
  'API contracts must document both database secret aliases and the SDK disposable confirmation env for Postgres manual gates.',
);

assert(
  apiContracts.includes('data.contract.frontendLaunchReadiness') &&
    apiContracts.includes('x-backy-frontend-launch-readiness') &&
    apiContracts.includes('backy.frontend-launch-readiness.v1') &&
    apiContracts.includes('backy.frontend-launch-action-plan.v1') &&
    apiContracts.includes('routing/render, CMS/design, media/font, visitor interaction, commerce, live-management, and database-certification checks') &&
    apiContracts.includes('without exposing database URLs, provider secrets, private order records, or form submission values'),
  'API contracts must document the non-secret custom-frontend launch-readiness contract.',
);

assert(
  sdkSmokeCi.indexOf('assertExpectedDatabaseTarget();') < sdkSmokeCi.indexOf('await assertSdkDatabaseSchemaReady();'),
  'SDK Postgres smoke must verify expected database host/name before schema checks or runtime smoke startup.',
);

assert(
  audit.includes('Supabase RLS, named policies, indexes, and interactive-component constraints') &&
    audit.includes('collection, reusable-section, form, contact, comment, media folder, media version, cache invalidation, and interactive component contract tables') &&
    audit.includes('media/forms/interactive-component coverage families') &&
    audit.includes('non-secret database credential boundary') &&
    audit.includes('SDK certification gate wording update') &&
    audit.includes('SDK database scenario evidence update') &&
    audit.includes('Site Settings frontend database handoff update') &&
    audit.includes('admin-site-settings-api') &&
    audit.includes('backy.frontend-database-certification-evidence.v1') &&
    audit.includes('generated SDK/cache behavior') &&
    audit.includes('Settings Delivery SDK Postgres command builder') &&
    audit.includes('databaseCertification.operatorCommandTemplate') &&
    audit.includes('BACKY_SDK_REQUIRE_DATABASE=1 npm run ci:sdk-postgres-smoke') &&
    audit.includes('BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:sdk-postgres-smoke') &&
    audit.includes('test:sdk-postgres-disposable-guard') &&
    audit.includes('public manifest, OpenAPI, render, media, CMS, forms, comments, events, commerce, and interactive-component service-data verification'),
  'Page completion audit must document the SDK Postgres preflight coverage.',
);

assert(
  audit.includes('Frontend launch readiness contract') &&
    audit.includes('data.contract.frontendLaunchReadiness') &&
    audit.includes('x-backy-frontend-launch-readiness') &&
    audit.includes('BackyFrontendLaunchReadiness') &&
    audit.includes('GeneratedBackyFrontendManifestLaunchReadiness') &&
    audit.includes('backy.frontend-launch-readiness.v1') &&
    audit.includes('backy.frontend-launch-action-plan.v1') &&
    audit.includes('routing/render, CMS/design, media/font, visitor interaction, commerce, live-management, and database-certification checks') &&
    audit.includes('private order/submission payloads and provider/database secrets out of public responses'),
  'Page completion audit must document the custom-frontend launch readiness contract.',
);

console.log(JSON.stringify({
  ok: true,
  contract: 'backy.sdk-postgres-preflight.v1',
  postgresDriver: true,
}, null, 2));
