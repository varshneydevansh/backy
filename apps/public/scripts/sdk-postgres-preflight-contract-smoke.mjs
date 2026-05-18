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

const sdkSmokeCi = read('../../../scripts/sdk-smoke-ci.mjs');
const manifestRoute = read('../src/app/api/sites/[siteId]/manifest/route.ts');
const openApiRoute = read('../src/app/api/sites/[siteId]/openapi/route.ts');
const frontendManifestSchema = read('../../../specs/ai-frontend-contract/frontend-manifest.schema.json');
const generatedSdkTypes = read('../../../packages/sdk-js/src/generated-contract-types.ts');
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
    manifestRoute.includes("'BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST'") &&
    manifestRoute.includes("'BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE'") &&
    manifestRoute.includes('disposable_database_confirmed=true') &&
    manifestRoute.includes('Database URLs and service credentials stay in CI/runtime environment'),
  'Frontend manifest must expose a non-secret SDK Postgres database certification handoff.',
);

assert(
  openApiRoute.includes('frontendDatabaseCertification') &&
    openApiRoute.includes('"x-backy-database-certification": frontendDatabaseCertification') &&
    openApiRoute.includes('backy.frontend-database-certification.v1') &&
    openApiRoute.includes('npm run ci:sdk-postgres-smoke') &&
    openApiRoute.includes('npm run test:frontend-contract-types') &&
    openApiRoute.includes('BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST') &&
    openApiRoute.includes('BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE') &&
    openApiRoute.includes('disposable_database_confirmed=true'),
  'Site-scoped OpenAPI must expose the same non-secret SDK Postgres database certification extension.',
);

assert(
  frontendManifestSchema.includes('"databaseCertification"') &&
    frontendManifestSchema.includes('"backy.frontend-database-certification.v1"') &&
    frontendManifestSchema.includes('"npm run ci:sdk-postgres-smoke"') &&
    frontendManifestSchema.includes('"npm run test:frontend-contract-types"') &&
    frontendManifestSchema.includes('"BACKY_DATABASE_URL"') &&
    frontendManifestSchema.includes('"DATABASE_URL"') &&
    frontendManifestSchema.includes('"version", "schemas", "databaseCertification"'),
  'Frontend manifest schema must require and type the database certification handoff.',
);

assert(
  generatedSdkTypes.includes('GeneratedBackyFrontendManifestDatabaseCertification') &&
    generatedSdkTypes.includes('"x-backy-database-certification"?: GeneratedBackyFrontendManifestDatabaseCertification') &&
    generatedSdkTypes.includes('databaseCertification: GeneratedBackyFrontendManifestDatabaseCertification') &&
    generatedSdkTypes.includes('"npm run ci:sdk-postgres-smoke"') &&
    generatedSdkTypes.includes('"npm run test:frontend-contract-types"'),
  'Generated SDK types must export the manifest/OpenAPI database certification contract.',
);

assert(
  sdkSmokeCi.includes('requiredDatabaseSchema') &&
    sdkSmokeCi.includes('requiredDatabaseEnums') &&
    sdkSmokeCi.includes('requiredDatabaseRlsTables') &&
    sdkSmokeCi.includes('requiredDatabasePolicies') &&
    sdkSmokeCi.includes('requiredDatabaseIndexes') &&
    sdkSmokeCi.includes('requiredDatabaseConstraints') &&
    sdkSmokeCi.includes('assertExpectedDatabaseTarget') &&
    sdkSmokeCi.includes('BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST') &&
    sdkSmokeCi.includes('BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE') &&
    sdkSmokeCi.includes('SDK Postgres certification expected database host') &&
    sdkSmokeCi.includes('SDK Postgres certification expected database name') &&
    sdkSmokeCi.includes('backy.sdk-postgres-smoke-ci.v1') &&
    sdkSmokeCi.includes('targetGuard') &&
    sdkSmokeCi.includes('expectedHostConfigured') &&
    sdkSmokeCi.includes('expectedDatabaseConfigured'),
  'SDK Postgres smoke must preflight target host/name, schema, enum, RLS, policy, index, and constraint readiness, then emit machine-readable certification evidence.',
);

assert(
  sdkSmokeCi.includes('content_collections') &&
    sdkSmokeCi.includes('content_collection_records') &&
    sdkSmokeCi.includes('reusable_sections') &&
    sdkSmokeCi.includes('form_definitions') &&
    sdkSmokeCi.includes('form_submissions') &&
    sdkSmokeCi.includes('form_contacts') &&
    sdkSmokeCi.includes('comments') &&
    sdkSmokeCi.includes('media_folders') &&
    sdkSmokeCi.includes('media_versions') &&
    sdkSmokeCi.includes('cache_invalidation_events') &&
    sdkSmokeCi.includes('interactive_components'),
  'SDK Postgres smoke must preflight every public SDK service-data table used by the smoke.',
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
    sdkSmokeCi.includes('Public can create active published form submissions') &&
    sdkSmokeCi.includes('Public can view approved active interactive components'),
  'SDK Postgres smoke must preflight public read/create policies required by generated/custom frontends.',
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
  rootPackage.includes('"ci:sdk-postgres-smoke": "npm run test:sdk-postgres-preflight-contract && BACKY_SDK_REQUIRE_DATABASE=1 node scripts/sdk-smoke-ci.mjs"') &&
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
    sdkPostgresWorkflow.includes("BACKY_RELEASE_CERTIFY_DATABASE: '1'") &&
    sdkPostgresWorkflow.includes('Run non-secret database certification doctor') &&
    sdkPostgresWorkflow.includes('npm run doctor:release-certification') &&
    sdkPostgresWorkflow.includes('Write non-secret SDK database summary') &&
    sdkPostgresWorkflow.includes('GITHUB_STEP_SUMMARY') &&
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
  sdkPostgresWorkflow.indexOf('Require disposable Postgres or Supabase database URL') < sdkPostgresWorkflow.indexOf('Run SDK Postgres/Supabase smoke') &&
    sdkPostgresWorkflow.indexOf('inputs.disposable_database_confirmed') < sdkPostgresWorkflow.indexOf('Run SDK Postgres/Supabase smoke'),
  'SDK Postgres manual workflow must require explicit disposable database confirmation before the DB-backed smoke.',
);

assert(
  sdkReadme.includes('BACKY_DATABASE_URL` or `DATABASE_URL` pointing at a disposable migrated Supabase/Postgres database') &&
    sdkReadme.includes('with the `BACKY_DATABASE_URL` or `DATABASE_URL` repository secret alias'),
  'SDK README must document both database secret aliases for the disposable migrated Supabase/Postgres smoke.',
);

assert(
  apiContracts.includes('forms-postgres-contract.yml` exposes the same gate as a manual GitHub Actions workflow using the `BACKY_DATABASE_URL` or `DATABASE_URL` repository secret alias for a disposable migrated Supabase/Postgres database') &&
    apiContracts.includes('sdk-postgres-smoke.yml` exposes the same gate as a manual GitHub Actions workflow using the `BACKY_DATABASE_URL` or `DATABASE_URL` repository secret alias for a disposable migrated Supabase/Postgres database'),
  'API contracts must document both database secret aliases for Forms and SDK Postgres manual gates.',
);

assert(
  sdkSmokeCi.indexOf('assertExpectedDatabaseTarget();') < sdkSmokeCi.indexOf('await assertSdkDatabaseSchemaReady();'),
  'SDK Postgres smoke must verify expected database host/name before schema checks or runtime smoke startup.',
);

assert(
  audit.includes('Supabase RLS, named policies, indexes, and interactive-component constraints') &&
    audit.includes('collection, reusable-section, form, contact, comment, media folder, media version, cache invalidation, and interactive component contract tables'),
  'Page completion audit must document the SDK Postgres preflight coverage.',
);

console.log(JSON.stringify({
  ok: true,
  contract: 'backy.sdk-postgres-preflight.v1',
}, null, 2));
