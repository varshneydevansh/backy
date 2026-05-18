#!/usr/bin/env node

import { createBackyContentDocument } from '../../core/dist/index.mjs';
import { createDatabaseAdapter } from '../dist/adapters/index.js';
import { createDatabaseRepositories } from '../dist/repositories/index.js';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const usage = () => {
  console.log(`Backy forms Postgres/Supabase smoke

Runs a destructive-safe repository smoke against a configured Postgres database.
It creates a temporary site, page, form, submission, and contact, then deletes the site.

Required:
  BACKY_DATABASE_URL or DATABASE_URL

Optional:
  BACKY_DATABASE_LOGGING=true
  BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST=...
  BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE=...

Example:
  BACKY_DATABASE_URL="postgres://..." npm run test:forms-postgres --workspace @backy/db
`);
};

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  usage();
  process.exit(0);
}

const databaseUrl = process.env.BACKY_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  usage();
  throw new Error('BACKY_DATABASE_URL or DATABASE_URL is required for the forms Postgres smoke.');
}

const assertPostgresDatabaseUrl = () => {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('BACKY_DATABASE_URL or DATABASE_URL must be a valid postgres:// or postgresql:// URL for the forms Postgres smoke.');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('BACKY_DATABASE_URL or DATABASE_URL must be a valid postgres:// or postgresql:// URL for the forms Postgres smoke.');
  }
};

const assertExpectedDatabaseTarget = () => {
  const expectedHost = (process.env.BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST || '').trim();
  const expectedDatabase = (process.env.BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE || '').trim();
  if (!expectedHost && !expectedDatabase) return;

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('BACKY_DATABASE_URL or DATABASE_URL must be a valid Postgres URL before target certification can run.');
  }

  const actualHost = parsed.hostname;
  const actualDatabase = decodeURIComponent(parsed.pathname.replace(/^\/+/, '').split('/')[0] || '');
  if (expectedHost && actualHost !== expectedHost) {
    throw new Error(`Forms Postgres certification expected database host ${expectedHost}, but the configured database URL points at ${actualHost || 'unknown'}.`);
  }
  if (expectedDatabase && actualDatabase !== expectedDatabase) {
    throw new Error(`Forms Postgres certification expected database name ${expectedDatabase}, but the configured database URL points at ${actualDatabase || 'unknown'}.`);
  }
};

assertPostgresDatabaseUrl();
assertExpectedDatabaseTarget();

const requiredSchema = {
  sites: [
    'id',
    'team_id',
    'name',
    'slug',
    'description',
    'theme',
    'settings',
    'is_published',
    'published_at',
    'created_at',
    'updated_at',
  ],
  pages: [
    'id',
    'site_id',
    'title',
    'slug',
    'description',
    'content',
    'meta',
    'status',
    'published_at',
    'scheduled_at',
    'is_homepage',
    'sort_order',
    'created_at',
    'updated_at',
  ],
  form_definitions: [
    'id',
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
    'id',
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
    'id',
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

const requiredRlsTables = [
  'form_definitions',
  'form_submissions',
  'form_contacts',
];

const requiredPolicies = {
  form_definitions: [
    'Team members can view form definitions',
    'Public can view active published form definitions',
    'Editors can manage form definitions',
  ],
  form_submissions: [
    'Team members can view form submissions',
    'Service role can create form submissions',
    'Editors can manage form submissions',
  ],
  form_contacts: [
    'Team members can view form contacts',
    'Editors can manage form contacts',
  ],
};

const requiredIndexes = {
  form_definitions: [
    'form_definitions_site_active_updated_idx',
    'form_definitions_site_page_updated_idx',
    'form_definitions_site_post_updated_idx',
    'idx_form_definitions_settings_gin',
  ],
  form_submissions: [
    'form_submissions_site_form_submitted_idx',
    'form_submissions_site_form_status_submitted_idx',
    'form_submissions_site_request_idx',
    'form_submissions_site_status_updated_idx',
    'idx_form_submissions_values_gin',
  ],
  form_contacts: [
    'form_contacts_site_form_updated_idx',
    'form_contacts_site_form_status_updated_idx',
    'form_contacts_site_request_idx',
    'form_contacts_site_email_idx',
    'idx_form_contacts_source_submission_id',
  ],
};

const requiredConstraints = {
  form_definitions: [
    'form_definitions_audience_check',
    'form_definitions_moderation_mode_check',
  ],
  form_submissions: [
    'form_submissions_status_check',
  ],
  form_contacts: [
    'form_contacts_status_check',
    'form_contacts_source_submission_id_fkey',
  ],
};

const assertPostgresSchemaReady = async () => {
  const postgres = (await import('postgres')).default;
  const sql = postgres(databaseUrl, { max: 1 });
  const missing = [];

  try {
    for (const [tableName, expectedColumns] of Object.entries(requiredSchema)) {
      const rows = await sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ${tableName}
      `;
      const columns = new Set(rows.map((row) => row.column_name));
      if (columns.size === 0) {
        missing.push(`public.${tableName} table`);
        continue;
      }

      for (const columnName of expectedColumns) {
        if (!columns.has(columnName)) {
          missing.push(`public.${tableName}.${columnName}`);
        }
      }
    }

    for (const tableName of requiredRlsTables) {
      const rows = await sql`
        SELECT c.relrowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = ${tableName}
      `;
      if (rows[0]?.relrowsecurity !== true) {
        missing.push(`public.${tableName} row level security`);
      }
    }

    for (const [tableName, expectedPolicies] of Object.entries(requiredPolicies)) {
      const rows = await sql`
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = ${tableName}
      `;
      const policies = new Set(rows.map((row) => row.policyname));
      for (const policyName of expectedPolicies) {
        if (!policies.has(policyName)) {
          missing.push(`public.${tableName} policy ${policyName}`);
        }
      }
    }

    for (const [tableName, expectedIndexes] of Object.entries(requiredIndexes)) {
      const rows = await sql`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = ${tableName}
      `;
      const indexes = new Set(rows.map((row) => row.indexname));
      for (const indexName of expectedIndexes) {
        if (!indexes.has(indexName)) {
          missing.push(`public.${tableName} index ${indexName}`);
        }
      }
    }

    for (const [tableName, expectedConstraints] of Object.entries(requiredConstraints)) {
      const rows = await sql`
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = rel.relnamespace
        WHERE n.nspname = 'public'
          AND rel.relname = ${tableName}
      `;
      const constraints = new Set(rows.map((row) => row.conname));
      for (const constraintName of expectedConstraints) {
        if (!constraints.has(constraintName)) {
          missing.push(`public.${tableName} constraint ${constraintName}`);
        }
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  if (missing.length > 0) {
    throw new Error([
      'Configured Postgres/Supabase database is not migrated for the Backy Forms/Contacts contract.',
      `Missing schema objects: ${missing.join(', ')}`,
      'Apply supabase/migrations/*.sql or the equivalent Drizzle migrations before running this smoke.',
    ].join(' '));
  }
};

const now = Date.now().toString(36);
const suffix = `forms-db-smoke-${now}`;
let adapter;
let createdSiteId = null;

const run = async () => {
  await assertPostgresSchemaReady();

  adapter = await createDatabaseAdapter({
    type: 'postgres',
    url: databaseUrl,
    logging: /^(1|true|yes|on)$/i.test(process.env.BACKY_DATABASE_LOGGING || ''),
  });

  assert(await adapter.isConnected(), 'Postgres adapter did not report a live connection.');

  const repositories = createDatabaseRepositories({ adapter });
  const site = (await repositories.sites.create({
    name: 'Forms DB Smoke',
    slug: suffix,
    description: 'Temporary Backy forms database-mode smoke site',
    status: 'published',
    settings: {
      siteStatus: 'published',
      contacts: {
        savedLists: [
          {
            id: `${suffix}-saved-list`,
            name: 'Qualified database leads',
            formIds: [],
            contactIds: [],
            filters: {
              statuses: ['qualified'],
            },
          },
        ],
      },
    },
  })).item;
  createdSiteId = site.id;

  assert(site.id, 'Expected created site id.');
  assert(site.slug === suffix, 'Expected created site slug to roundtrip.');

  const page = (await repositories.pages.create({
    siteId: site.id,
    title: 'Forms DB Smoke Page',
    slug: 'forms-db-smoke',
    description: 'Temporary form host page',
    status: 'published',
    isHomepage: false,
    sortOrder: 0,
    content: createBackyContentDocument({
      id: `${suffix}-page-doc`,
      kind: 'page',
      title: 'Forms DB Smoke Page',
      slug: 'forms-db-smoke',
      status: 'published',
      elements: [],
      rootElementIds: [],
    }),
    meta: {
      title: 'Forms DB Smoke Page',
    },
  })).item;

  assert(page.siteId === site.id, 'Expected page to belong to the temporary site.');

  const form = (await repositories.forms.create({
    siteId: site.id,
    pageId: page.id,
    postId: null,
    name: 'database-lead-form',
    title: 'Database Lead Form',
    description: 'Captures real database-mode leads',
    audience: 'public',
    isActive: true,
    fields: [
      {
        key: 'email',
        label: 'Email',
        type: 'email',
        required: true,
      },
      {
        key: 'company',
        label: 'Company',
        type: 'text',
        required: false,
        validation: {
          minLength: 2,
        },
      },
      {
        key: 'message',
        label: 'Message',
        type: 'textarea',
        required: true,
      },
    ],
    notificationEmail: 'forms-db-smoke@example.com',
    notificationWebhook: null,
    successRedirectUrl: null,
    successMessage: 'Thanks from database mode',
    enableHoneypot: true,
    enableCaptcha: false,
    spamSettings: {
      minFillMs: 1200,
      rateLimitWindowMs: 60000,
      rateLimitMax: 5,
      duplicateWindowMs: 300000,
      blockedTerms: ['blocked-db-smoke'],
    },
    consentSettings: {
      policyLabel: 'Database smoke consent',
      retentionDays: 30,
      deleteAfterDays: 365,
      requestEmail: 'privacy-db-smoke@example.com',
      exportIncludesIp: false,
    },
    moderationMode: 'manual',
    contactShare: {
      enabled: true,
      emailField: 'email',
      nameField: 'company',
      notesField: 'message',
    },
    collectionTarget: null,
  })).item;

  assert(form.id, 'Expected created form id.');
  assert(form.spamSettings?.blockedTerms?.includes('blocked-db-smoke'), 'Expected spam settings to persist through form create.');
  assert(form.consentSettings?.requestEmail === 'privacy-db-smoke@example.com', 'Expected consent settings to persist through form create.');
  assert((await repositories.forms.getById(site.id, form.id))?.title === 'Database Lead Form', 'Expected form getById to read the created form.');
  assert((await repositories.forms.list({ siteId: site.id, pageId: page.id, search: 'database' })).items.length === 1, 'Expected form list filters to find the created form.');

  const updatedForm = (await repositories.forms.update(site.id, form.id, {
    title: 'Database Lead Form Updated',
    spamSettings: {
      rateLimitMax: 8,
    },
    consentSettings: {
      retentionDays: 45,
    },
  })).item;
  assert(updatedForm.title === 'Database Lead Form Updated', 'Expected form title update to persist.');
  assert(updatedForm.spamSettings?.minFillMs === 1200 && updatedForm.spamSettings?.rateLimitMax === 8, 'Expected spam settings to merge on update.');
  assert(updatedForm.consentSettings?.retentionDays === 45 && updatedForm.consentSettings?.requestEmail === 'privacy-db-smoke@example.com', 'Expected consent settings to merge on update.');

  const submission = (await repositories.forms.createSubmission({
    siteId: site.id,
    formId: form.id,
    pageId: page.id,
    postId: null,
    values: {
      email: 'reader-db-smoke@example.com',
      company: 'Backy DB Smoke',
      message: 'Hello from the real database-mode smoke.',
    },
    ipHash: 'forms-db-smoke-ip-hash',
    userAgent: 'backy-forms-postgres-smoke',
    requestId: `${suffix}-submission`,
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    adminNotes: null,
    collectionRecord: null,
    collectionRecordErrors: [],
  })).item;

  assert(submission.id, 'Expected created submission id.');
  assert((await repositories.forms.listSubmissions({ siteId: site.id, formId: form.id, requestId: `${suffix}-submission` })).items.length === 1, 'Expected submission request-id filter to find the created submission.');
  assert((await repositories.forms.listSubmissions({ siteId: site.id, formId: form.id, status: 'pending', search: 'Backy DB Smoke' })).items.length === 1, 'Expected submission status/search filters to find the created submission.');

  const approvedSubmission = (await repositories.forms.updateSubmission(site.id, submission.id, {
    status: 'approved',
    adminNotes: 'Approved by real database smoke',
  })).item;
  assert(approvedSubmission.status === 'approved', 'Expected submission status update to persist.');
  assert((await repositories.forms.getSubmissionById(site.id, form.id, submission.id))?.adminNotes === 'Approved by real database smoke', 'Expected submission getById to read updated notes.');

  const contact = (await repositories.forms.createContact({
    siteId: site.id,
    formId: form.id,
    pageId: page.id,
    postId: null,
    name: 'Backy DB Smoke',
    email: 'reader-db-smoke@example.com',
    phone: '+15555550123',
    notes: 'Lead promoted from database smoke',
    sourceValues: approvedSubmission.values,
    status: 'new',
    sourceSubmissionId: approvedSubmission.id,
    requestId: `${suffix}-contact`,
    sourceIpHash: approvedSubmission.ipHash,
  })).item;

  assert(contact.id, 'Expected created contact id.');
  assert((await repositories.forms.listContacts({ siteId: site.id, formId: form.id, requestId: `${suffix}-contact` })).items.length === 1, 'Expected contact request-id filter to find the created contact.');
  assert((await repositories.forms.listContacts({ siteId: site.id, formId: form.id, status: 'new', search: 'reader-db-smoke' })).items.length === 1, 'Expected contact status/search filters to find the created contact.');

  const qualifiedContact = (await repositories.forms.updateContact(site.id, contact.id, {
    status: 'qualified',
    notes: 'Qualified by real database smoke',
  })).item;
  assert(qualifiedContact.status === 'qualified', 'Expected contact status update to persist.');
  assert((await repositories.forms.getContactById(site.id, form.id, contact.id))?.notes === 'Qualified by real database smoke', 'Expected contact getById to read updated notes.');

  const duplicateContact = (await repositories.forms.createContact({
    siteId: site.id,
    formId: form.id,
    pageId: page.id,
    postId: null,
    name: 'Backy DB Smoke Duplicate',
    email: 'reader-db-smoke@example.com',
    phone: '+15555550124',
    notes: 'Duplicate lead from the same database smoke reader',
    sourceValues: {
      email: 'reader-db-smoke@example.com',
      company: 'Backy DB Smoke Duplicate',
      message: 'Duplicate lead follow-up from the real database-mode smoke.',
      consent: true,
    },
    status: 'contacted',
    sourceSubmissionId: approvedSubmission.id,
    requestId: `${suffix}-contact-duplicate`,
    sourceIpHash: 'forms-db-smoke-duplicate-ip-hash',
  })).item;
  const unrelatedContact = (await repositories.forms.createContact({
    siteId: site.id,
    formId: form.id,
    pageId: page.id,
    postId: null,
    name: 'Backy DB Smoke Other',
    email: 'other-reader-db-smoke@example.com',
    phone: null,
    notes: 'Separate database smoke lead',
    sourceValues: {
      email: 'other-reader-db-smoke@example.com',
      consent: true,
    },
    status: 'new',
    sourceSubmissionId: null,
    requestId: `${suffix}-contact-other`,
    sourceIpHash: 'forms-db-smoke-other-ip-hash',
  })).item;
  assert((await repositories.forms.listContacts({ siteId: site.id, formId: form.id, status: 'contacted' })).items.some((item) => item.id === duplicateContact.id), 'Expected duplicate contact status filter to find the duplicate lead.');
  assert((await repositories.forms.listContacts({ siteId: site.id, formId: form.id, search: 'duplicate' })).items.some((item) => item.id === duplicateContact.id), 'Expected duplicate contact search filter to find the duplicate lead.');
  assert((await repositories.forms.getContactById(site.id, form.id, unrelatedContact.id))?.email === 'other-reader-db-smoke@example.com', 'Expected contact getById to honor the exact unrelated contact id.');

  const mergedPrimaryContact = (await repositories.forms.updateContact(site.id, duplicateContact.id, {
    status: 'qualified',
    notes: 'Merged duplicate lead into primary database smoke contact',
    sourceValues: {
      ...duplicateContact.sourceValues,
      __backyMerge: {
        primaryContactId: duplicateContact.id,
        mergedDuplicateIds: [contact.id],
        mergedAt: '2030-01-02T03:04:05.000Z',
      },
      __backyPromotion: {
        userId: 'user_forms_db_smoke',
        email: 'reader-db-smoke@example.com',
        status: 'invited',
        promotedAt: '2030-01-02T03:04:05.000Z',
      },
      __backyCustomerPromotion: {
        collectionId: 'collection_forms_db_smoke_customers',
        recordId: 'record_forms_db_smoke_customer',
        promotedAt: '2030-01-02T03:04:05.000Z',
      },
    },
  })).item;
  const archivedMergedContact = (await repositories.forms.updateContact(site.id, contact.id, {
    status: 'archived',
    notes: 'Merged into reader-db-smoke@example.com primary database smoke contact',
  })).item;
  assert(mergedPrimaryContact.id === duplicateContact.id && mergedPrimaryContact.sourceValues?.__backyMerge?.mergedDuplicateIds?.includes(contact.id), 'Expected duplicate merge metadata to persist on the primary contact.');
  assert(mergedPrimaryContact.sourceValues?.__backyPromotion?.userId === 'user_forms_db_smoke', 'Expected contact-to-user promotion metadata to persist on the primary contact.');
  assert(mergedPrimaryContact.sourceValues?.__backyCustomerPromotion?.recordId === 'record_forms_db_smoke_customer', 'Expected contact-to-customer promotion metadata to persist on the primary contact.');
  assert(archivedMergedContact.id === contact.id && archivedMergedContact.status === 'archived', 'Expected merged duplicate contact to archive by exact id.');
  assert((await repositories.forms.getContactById(site.id, form.id, contact.id))?.notes?.includes('Merged into'), 'Expected archived duplicate merge notes to persist.');

  assert(await repositories.forms.deleteContact(site.id, unrelatedContact.id), 'Expected unrelated contact delete to report deletion.');
  assert(await repositories.forms.deleteContact(site.id, duplicateContact.id), 'Expected merged primary contact delete to report deletion.');
  assert(await repositories.forms.deleteContact(site.id, contact.id), 'Expected contact delete to report deletion.');
  await repositories.forms.delete(site.id, form.id);
  await repositories.pages.delete(site.id, page.id);
  await repositories.sites.delete(site.id);
  createdSiteId = null;

  console.log(JSON.stringify({
    ok: true,
    database: 'postgres',
    targetGuard: {
      expectedHostConfigured: Boolean((process.env.BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST || '').trim()),
      expectedDatabaseConfigured: Boolean((process.env.BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE || '').trim()),
    },
    siteSlug: suffix,
    verified: [
      'schema preflight for Forms/Contacts contract tables, RLS, policies, indexes, and constraints',
      'adapter connection',
      'site/page repository create/delete',
      'form create/list/get/update/delete',
      'spam and consent settings merge',
      'submission create/list/search/update/get',
      'contact create/list/search/update/get/delete',
      'duplicate contact merge and promotion metadata',
    ],
  }, null, 2));
};

try {
  await run();
} finally {
  if (createdSiteId && adapter) {
    try {
      const repositories = createDatabaseRepositories({ adapter });
      await repositories.sites.delete(createdSiteId);
    } catch (error) {
      console.warn('Unable to clean up temporary forms DB smoke site:', error instanceof Error ? error.message : error);
    }
  }
  if (adapter) {
    await adapter.close();
  }
}
