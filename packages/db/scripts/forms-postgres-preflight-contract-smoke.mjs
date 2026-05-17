#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const files = {
  smoke: new URL('./forms-postgres-smoke.mjs', import.meta.url),
  migration: new URL('../../../supabase/migrations/002_forms_contacts_persistence.sql', import.meta.url),
  workflow: new URL('../../../.github/workflows/forms-postgres-contract.yml', import.meta.url),
  rootPackage: new URL('../../../package.json', import.meta.url),
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
const workflow = await readFile(files.workflow, 'utf8').catch(() => '');
const rootPackage = await readFile(files.rootPackage, 'utf8');

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

const policies = [
  'Team members can view form definitions',
  'Public can view active published form definitions',
  'Editors can manage form definitions',
  'Team members can view form submissions',
  'Public can create active published form submissions',
  'Editors can manage form submissions',
  'Team members can view form contacts',
  'Editors can manage form contacts',
];

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
  'assertExpectedDatabaseTarget',
  'BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST',
  'BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE',
  'Forms Postgres certification expected database host',
  'Forms Postgres certification expected database name',
  'targetGuard',
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
includesEvery(migration, policies, 'Forms migration RLS policies');
includesEvery(smoke, indexes, 'Forms Postgres smoke index contract');
includesEvery(migration, indexes, 'Forms migration indexes');
includesEvery(smoke, constraints, 'Forms Postgres smoke constraint contract');
includesEvery(migration, constraints, 'Forms migration constraints');
includesEvery(smoke, destructiveSafeWorkflowEvidence, 'Forms Postgres destructive-safe cleanup contract');
includesEvery(smoke, repositoryCoverageEvidence, 'Forms Postgres repository workflow coverage contract');

if (workflow) {
  includesEvery(workflow, [
    'BACKY_DATABASE_URL',
    'BACKY_RELEASE_CERTIFY_DATABASE',
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
    'disposable confirmed:',
    'expected host configured:',
    'expected database configured:',
    'npm run test:forms-postgres-preflight-contract',
    'Require disposable Postgres or Supabase database URL',
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
    'Forms Postgres workflow must run the migration preflight before requiring BACKY_DATABASE_URL and before the DB-backed smoke.',
  );

  assert(
    workflow.indexOf('Require disposable Postgres or Supabase database URL') < workflow.indexOf('Run forms Postgres/Supabase contract smoke') &&
      workflow.indexOf('inputs.disposable_database_confirmed') < workflow.indexOf('Run forms Postgres/Supabase contract smoke'),
    'Forms Postgres workflow must require explicit disposable database confirmation before the DB-backed smoke.',
  );
}

assert(
  smoke.indexOf('assertExpectedDatabaseTarget();') < smoke.indexOf('await assertPostgresSchemaReady();'),
  'Forms Postgres smoke must verify expected database host/name before schema checks or repository writes.',
);

includesEvery(rootPackage, [
  '"test:forms-postgres-preflight-contract": "npm run test:forms-postgres-preflight-contract --workspace @backy/db"',
  '"ci:forms-postgres": "npm run test:forms-postgres-preflight-contract && npm run test:forms-postgres --workspace @backy/db"',
], 'Root package Forms Postgres script contract');

console.log(JSON.stringify({
  ok: true,
  contract: 'backy.forms-postgres-preflight.v1',
  checked: {
    tables: formTables,
    policies: policies.length,
    indexes: indexes.length,
    constraints: constraints.length,
    workflow: Boolean(workflow),
  },
}, null, 2));
