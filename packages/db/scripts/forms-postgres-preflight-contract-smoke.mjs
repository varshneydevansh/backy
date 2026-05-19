#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const files = {
  smoke: new URL('./forms-postgres-smoke.mjs', import.meta.url),
  migration: new URL('../../../supabase/migrations/002_forms_contacts_persistence.sql', import.meta.url),
  hardeningMigration: new URL('../../../supabase/migrations/003_schema_parity_and_rls_hardening.sql', import.meta.url),
  workflow: new URL('../../../.github/workflows/forms-postgres-contract.yml', import.meta.url),
  rootPackage: new URL('../../../package.json', import.meta.url),
  packageJson: new URL('../package.json', import.meta.url),
  adminFormsRoute: new URL('../../../apps/public/src/app/api/admin/sites/[siteId]/forms/route.ts', import.meta.url),
  adminFormsPage: new URL('../../../apps/admin/src/routes/forms.tsx', import.meta.url),
  adminFormsSmoke: new URL('../../../apps/admin/scripts/forms-smoke.mjs', import.meta.url),
  apiContracts: new URL('../../../specs/backy-api-contracts.md', import.meta.url),
  audit: new URL('../../../specs/page-completion-audit/backy-page-surface-audit.md', import.meta.url),
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const includesEvery = (source, values, label) => {
  const missing = values.filter((value) => !source.includes(value));
  assert(missing.length === 0, `${label} missing: ${missing.join(', ')}`);
};

const smoke = await readFile(files.smoke, 'utf8');
const migration = await readFile(files.migration, 'utf8');
const hardeningMigration = await readFile(files.hardeningMigration, 'utf8');
const workflow = await readFile(files.workflow, 'utf8').catch(() => '');
const rootPackage = await readFile(files.rootPackage, 'utf8');
const packageJson = await readFile(files.packageJson, 'utf8');
const adminFormsRoute = await readFile(files.adminFormsRoute, 'utf8');
const adminFormsPage = await readFile(files.adminFormsPage, 'utf8');
const adminFormsSmoke = await readFile(files.adminFormsSmoke, 'utf8');
const apiContracts = await readFile(files.apiContracts, 'utf8');
const audit = await readFile(files.audit, 'utf8');

const formTables = [
  'form_definitions',
  'form_submissions',
  'form_contacts',
];

const formColumns = {
  form_definitions: [
    'site_id',
    'page_id',
    'post_id',
    'name',
    'title',
    'description',
    'audience',
    'is_active',
    'fields',
    'notification_email',
    'notification_webhook',
    'success_redirect_url',
    'success_message',
    'enable_honeypot',
    'enable_captcha',
    'moderation_mode',
    'contact_share',
    'collection_target',
    'settings',
    'created_by',
    'updated_by',
    'created_at',
    'updated_at',
  ],
  form_submissions: [
    'site_id',
    'form_id',
    'page_id',
    'post_id',
    'values',
    'ip_hash',
    'user_agent',
    'request_id',
    'status',
    'reviewed_by',
    'reviewed_at',
    'admin_notes',
    'collection_record',
    'collection_record_errors',
    'submitted_at',
    'updated_at',
  ],
  form_contacts: [
    'site_id',
    'form_id',
    'page_id',
    'post_id',
    'name',
    'email',
    'phone',
    'notes',
    'source_values',
    'status',
    'source_submission_id',
    'request_id',
    'source_ip_hash',
    'created_at',
    'updated_at',
  ],
};

const initialMigrationPolicies = [
  'Team members can view form definitions',
  'Public can view active published form definitions',
  'Editors can manage form definitions',
  'Team members can view form submissions',
  'Public can create active published form submissions',
  'Editors can manage form submissions',
  'Team members can view form contacts',
  'Editors can manage form contacts',
];

const policies = initialMigrationPolicies.map((policy) => (
  policy === 'Public can create active published form submissions'
    ? 'Service role can create form submissions'
    : policy
));

const indexes = [
  'form_definitions_site_active_updated_idx',
  'form_definitions_site_page_updated_idx',
  'form_definitions_site_post_updated_idx',
  'idx_form_definitions_settings_gin',
  'form_submissions_site_form_submitted_idx',
  'form_submissions_site_form_status_submitted_idx',
  'form_submissions_site_request_idx',
  'form_submissions_site_status_updated_idx',
  'idx_form_submissions_values_gin',
  'form_contacts_site_form_updated_idx',
  'form_contacts_site_form_status_updated_idx',
  'form_contacts_site_request_idx',
  'form_contacts_site_email_idx',
  'idx_form_contacts_source_submission_id',
];

const constraints = [
  'form_definitions_audience_check',
  'form_definitions_moderation_mode_check',
  'form_submissions_status_check',
  'form_contacts_status_check',
  'form_contacts_source_submission_id_fkey',
];

const destructiveSafeWorkflowEvidence = [
  'assertPostgresDatabaseUrl',
  'valid postgres:// or postgresql:// URL for the forms Postgres smoke',
  'assertExpectedDatabaseTarget',
  'BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST',
  'BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE',
  'Forms Postgres certification expected database host',
  'Forms Postgres certification expected database name',
  'configured database URL points at',
  'targetGuard',
  'urlValid: true',
  'expectedHostConfigured',
  'expectedDatabaseConfigured',
  'assertExpectedDatabaseTarget();',
  'await assertPostgresSchemaReady();',
  'Temporary Backy forms database-mode smoke site',
  'repositories.sites.delete(createdSiteId)',
  'repositories.forms.deleteContact',
  'repositories.forms.delete(site.id, form.id)',
  'repositories.pages.delete(site.id, page.id)',
  'repositories.sites.delete(site.id)',
];

const repositoryCoverageEvidence = [
  'form create/list/get/update/delete',
  'spam and consent settings merge',
  'submission create/list/search/update/get',
  'contact create/list/search/update/get/delete',
  'duplicate contact merge and promotion metadata',
  '__backyMerge',
  '__backyPromotion',
  '__backyCustomerPromotion',
];

includesEvery(smoke, formTables, 'Forms Postgres smoke table preflight');
includesEvery(migration, formTables.map((table) => `CREATE TABLE IF NOT EXISTS public.${table}`), 'Forms migration table DDL');

for (const [table, columns] of Object.entries(formColumns)) {
  includesEvery(smoke, [table, ...columns], `Forms Postgres smoke ${table} contract`);
  includesEvery(migration, columns, `Forms migration ${table} columns`);
  includesEvery(migration, [`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`], `Forms migration ${table} RLS`);
}

includesEvery(smoke, policies, 'Forms Postgres smoke RLS policy contract');
includesEvery(migration, initialMigrationPolicies, 'Forms initial migration RLS policies');
includesEvery(hardeningMigration, [
  'DROP POLICY IF EXISTS "Public can create active published form submissions" ON public.form_submissions',
  'CREATE POLICY "Service role can create form submissions"',
  'ON public.form_submissions FOR INSERT',
  'TO service_role',
  'WITH CHECK (TRUE)',
], 'Forms hardening migration service-role submission policy');
includesEvery(smoke, indexes, 'Forms Postgres smoke index contract');
includesEvery(migration, indexes, 'Forms migration indexes');
includesEvery(smoke, constraints, 'Forms Postgres smoke constraint contract');
includesEvery(migration, constraints, 'Forms migration constraints');
includesEvery(smoke, destructiveSafeWorkflowEvidence, 'Forms Postgres destructive-safe cleanup contract');
includesEvery(smoke, repositoryCoverageEvidence, 'Forms Postgres repository workflow coverage contract');
includesEvery(adminFormsRoute, [
  'formPersistenceCertification',
  'getFormsPersistenceRuntimeSummary',
  "schemaVersion: 'backy.forms-persistence-certification.v1'",
  "status: 'external-database-gate'",
  "'BACKY_DATABASE_URL', 'DATABASE_URL'",
  "requiredConfirmationEnv: 'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true'",
  "databaseGate: 'npm run test:forms-postgres --workspace @backy/db'",
  "ciGate: 'npm run ci:forms-postgres'",
  "workflow: '.github/workflows/forms-postgres-contract.yml'",
  "'BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST'",
  "'BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE'",
  'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true',
  'disposable_database_confirmed=true',
  'databaseUrlConfigured',
  'readyForCertification',
  'runtime: getFormsPersistenceRuntimeSummary()',
  'persistenceCertification: formPersistenceCertification(site.id)',
  'Database URLs stay in server/CI environment variables',
  'Database URLs and credentials are never returned',
], 'Admin Forms API persistence certification handoff');
includesEvery(adminFormsPage, [
  'formPersistenceCertification',
  "schemaVersion: 'backy.forms-persistence-certification.v1'",
  "status: 'external-database-gate'",
  "'BACKY_DATABASE_URL', 'DATABASE_URL'",
  "requiredConfirmationEnv: 'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true'",
  "databaseGate: 'npm run test:forms-postgres --workspace @backy/db'",
  "ciGate: 'npm run ci:forms-postgres'",
  "workflow: '.github/workflows/forms-postgres-contract.yml'",
  "'BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST'",
  "'BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE'",
  'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true',
  'disposable migrated Supabase/Postgres database',
  'disposable_database_confirmed=true',
  'runtime: formsPersistenceCertification?.runtime',
  'forms-persistence-runtime-evidence',
  'readyForCertification',
  'databaseUrlConfigured',
  'Database URLs and credentials are never returned',
  'persistenceCertification: formPersistenceCertification',
  'forms handoff manifests only expose non-secret gate names and readiness evidence',
], 'Admin Forms page handoff persistence certification manifest');
includesEvery(adminFormsSmoke, [
  'assertFormsPersistenceCertificationResponse',
  'backy.forms-persistence-certification.v1',
  'data.persistenceCertification',
  'legacy persistenceCertification',
  'backy.forms-persistence-certification.v1',
  'external-database-gate',
  'npm run test:forms-postgres --workspace @backy/db',
  'npm run ci:forms-postgres',
  '.github/workflows/forms-postgres-contract.yml',
  'BACKY_DATABASE_URL',
  'DATABASE_URL',
  'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true',
  'BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST',
  'BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE',
  'disposable migrated Supabase/Postgres database',
  'disposable_database_confirmed=true',
  'Database URLs stay in server/CI environment variables',
  'certification.runtime',
  'databaseUrlConfigured',
  'readyForCertification',
  'assertFormsPersistenceCertificationResponse(payload);',
], 'Forms admin smoke runtime persistence certification response guard');

if (workflow) {
  includesEvery(workflow, [
    'BACKY_DATABASE_URL',
    'DATABASE_URL',
    'BACKY_RELEASE_CERTIFY_DATABASE',
    'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED',
    'BACKY_DATABASE_DISPOSABLE_CONFIRMED',
    'database_expected_host:',
    'database_expected_name:',
    'BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST',
    'BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE',
    'disposable_database_confirmed:',
    'Run forms migration preflight contract',
    'Run non-secret database certification doctor',
    'npm run doctor:release-certification',
    'Write non-secret Forms database summary',
    'GITHUB_STEP_SUMMARY',
    '| Partial row | Gate | Requested | Aggregate preflight | Admin source guard | Non-secret target evidence |',
    '| /forms | npm run ci:forms-postgres | true | npm run test:partial-gate-preflights | npm run test:admin-contract-source |',
    'disposable confirmed:',
    'expected host configured:',
    'expected database configured:',
    'npm run test:forms-postgres-preflight-contract',
    'Require disposable Postgres or Supabase database URL',
    'BACKY_DATABASE_URL or DATABASE_URL',
    'I confirm BACKY_DATABASE_URL or DATABASE_URL points to a disposable migrated Supabase/Postgres database.',
    'Set the BACKY_DATABASE_URL or DATABASE_URL repository secret to a disposable migrated Supabase/Postgres database before running this workflow.',
    'inputs.disposable_database_confirmed',
    'Confirm disposable_database_confirmed=true',
    'npm run ci:forms-postgres',
  ], 'Forms Postgres workflow contract');

  assert(
    workflow.indexOf('Run forms migration preflight contract') < workflow.indexOf('Require disposable Postgres or Supabase database URL') &&
      workflow.indexOf('Run forms migration preflight contract') < workflow.indexOf('Run non-secret database certification doctor') &&
      workflow.indexOf('Run non-secret database certification doctor') < workflow.indexOf('Write non-secret Forms database summary') &&
      workflow.indexOf('Run forms migration preflight contract') < workflow.indexOf('Write non-secret Forms database summary') &&
      workflow.indexOf('Write non-secret Forms database summary') < workflow.indexOf('Require disposable Postgres or Supabase database URL') &&
      workflow.indexOf('Run forms migration preflight contract') < workflow.indexOf('Run forms Postgres/Supabase contract smoke'),
    'Forms Postgres workflow must run the migration preflight before requiring BACKY_DATABASE_URL or DATABASE_URL and before the DB-backed smoke.',
  );

  assert(
    workflow.indexOf('Require disposable Postgres or Supabase database URL') < workflow.indexOf('Run forms Postgres/Supabase contract smoke') &&
      workflow.indexOf('inputs.disposable_database_confirmed') < workflow.indexOf('Run forms Postgres/Supabase contract smoke'),
    'Forms Postgres workflow must require explicit disposable database confirmation before the DB-backed smoke.',
  );
}

assert(
  smoke.indexOf('assertPostgresDatabaseUrl();') < smoke.indexOf('assertExpectedDatabaseTarget();') &&
  smoke.indexOf('assertPostgresDatabaseUrl();') < smoke.indexOf('assertDisposableDatabaseConfirmed();') &&
  smoke.indexOf('assertDisposableDatabaseConfirmed();') < smoke.indexOf('assertExpectedDatabaseTarget();') &&
  smoke.indexOf('assertExpectedDatabaseTarget();') < smoke.indexOf('await assertPostgresSchemaReady();'),
  'Forms Postgres smoke must verify database URL format, disposable confirmation, and expected database host/name before schema checks or repository writes.',
);

includesEvery(rootPackage, [
  '"test:forms-postgres-preflight-contract": "npm run test:forms-postgres-preflight-contract --workspace @backy/db"',
  '"test:forms-postgres-disposable-guard": "npm run test:forms-postgres-disposable-guard --workspace @backy/db"',
  '"test:partial-gate-preflights": "npm run test:forms-postgres-preflight-contract && npm run test:forms-postgres-disposable-guard && npm run test:sdk-postgres-preflight-contract',
  '"ci:forms-postgres": "npm run test:forms-postgres-preflight-contract && npm run test:forms-postgres-disposable-guard && npm run test:forms-postgres --workspace @backy/db"',
], 'Root package Forms Postgres script contract');

includesEvery(packageJson, [
  '"test:forms-postgres-disposable-guard": "node scripts/forms-postgres-disposable-guard-smoke.mjs"',
], 'DB package Forms Postgres disposable guard script contract');

includesEvery(apiContracts, [
  'data.persistenceCertification',
  'backy.forms-persistence-certification.v1',
  'npm run ci:forms-postgres',
  'BACKY_DATABASE_URL',
  'DATABASE_URL',
], 'Forms API contract persistence certification documentation');

includesEvery(audit, [
  'Forms API persistence certification handoff',
  'Forms certification gate wording update',
  'backy.forms-persistence-certification.v1',
  'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:forms-postgres',
  'test:forms-postgres-disposable-guard',
  'GET /api/admin/sites/:siteId/forms',
], 'Forms audit persistence certification evidence');

console.log(JSON.stringify({
  ok: true,
  contract: 'backy.forms-postgres-preflight.v1',
  checked: {
    tables: formTables,
    policies: policies.length,
    hardeningMigration: true,
    indexes: indexes.length,
    constraints: constraints.length,
    workflow: Boolean(workflow),
  },
}, null, 2));
