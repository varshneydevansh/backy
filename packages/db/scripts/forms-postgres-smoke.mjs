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

const now = Date.now().toString(36);
const suffix = `forms-db-smoke-${now}`;
let adapter;
let createdSiteId = null;

const run = async () => {
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

  assert(await repositories.forms.deleteContact(site.id, contact.id), 'Expected contact delete to report deletion.');
  await repositories.forms.delete(site.id, form.id);
  await repositories.pages.delete(site.id, page.id);
  await repositories.sites.delete(site.id);
  createdSiteId = null;

  console.log(JSON.stringify({
    ok: true,
    database: 'postgres',
    siteSlug: suffix,
    verified: [
      'adapter connection',
      'site/page repository create/delete',
      'form create/list/get/update/delete',
      'spam and consent settings merge',
      'submission create/list/search/update/get',
      'contact create/list/search/update/get/delete',
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
