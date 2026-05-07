#!/usr/bin/env node

import { createBackyClient } from '../dist/index.js';

const baseUrl = (process.env.BACKY_SDK_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const configuredIdentifier = process.env.BACKY_SDK_SITE_IDENTIFIER || '';
const runWriteSmoke = process.env.BACKY_SDK_SKIP_WRITE_SMOKE !== '1';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

async function request(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Keep null JSON for clear assertion failures below.
  }

  return { response, json, text, url: `${baseUrl}${path}` };
}

async function createSdkSmokeFixture() {
  const unique = Date.now();
  const siteSlug = `sdk-smoke-site-${unique}`;
  const pageSlug = `sdk-smoke-page-${unique}`;
  const collectionSlug = `sdk-smoke-collection-${unique}`;

  const site = await request('/api/admin/sites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'SDK Smoke Site',
      slug: siteSlug,
      description: 'Temporary site for SDK write smoke.',
      status: 'published',
    }),
  });
  assert(site.response.status === 201, `${site.url} expected site create 201, got ${site.response.status}`);
  const siteId = site.json?.data?.site?.id;
  assert(siteId, 'temporary SDK smoke site missing id');

  const collection = await request(`/api/admin/sites/${siteId}/collections`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'SDK Smoke Collection',
      slug: collectionSlug,
      status: 'published',
      fields: [
        { key: 'title', label: 'Title', type: 'text', required: true, unique: true },
        { key: 'summary', label: 'Summary', type: 'richText' },
        { key: 'category', label: 'Category', type: 'select', options: ['Featured', 'Standard'] },
      ],
      permissions: {
        publicRead: true,
        publicCreate: true,
        publicUpdate: false,
        publicDelete: false,
      },
    }),
  });
  assert(collection.response.status === 201, `${collection.url} expected collection create 201, got ${collection.response.status}`);
  const collectionId = collection.json?.data?.collection?.id;
  assert(collectionId, 'temporary SDK smoke collection missing id');

  const page = await request(`/api/admin/sites/${siteId}/pages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'SDK Smoke Page',
      slug: pageSlug,
      status: 'published',
      content: {
        elements: [
          {
            id: 'sdk-smoke-form',
            type: 'form',
            x: 80,
            y: 80,
            width: 520,
            height: 360,
            props: {
              formId: 'sdk-smoke-form',
              formTitle: 'SDK Smoke Form',
              formActive: true,
              moderationMode: 'auto-approve',
              enableHoneypot: false,
              collectionWriteEnabled: true,
              collectionWriteCollectionId: collectionId,
              collectionWriteSlugField: 'title',
              collectionWriteFieldMap: {
                title: 'title',
                message: 'summary',
                category: 'category',
              },
            },
            children: [
              {
                id: 'sdk-smoke-form-title',
                type: 'input',
                x: 0,
                y: 0,
                width: 420,
                height: 44,
                props: { name: 'title', placeholder: 'Title', required: true },
              },
              {
                id: 'sdk-smoke-form-message',
                type: 'textarea',
                x: 0,
                y: 64,
                width: 420,
                height: 120,
                props: { name: 'message', placeholder: 'Message' },
              },
              {
                id: 'sdk-smoke-form-category',
                type: 'select',
                x: 0,
                y: 204,
                width: 260,
                height: 44,
                props: { name: 'category', options: ['Featured', 'Standard'] },
              },
            ],
          },
        ],
        canvasSize: { width: 1200, height: 760 },
      },
    }),
  });
  assert(page.response.status === 201, `${page.url} expected page create 201, got ${page.response.status}`);
  const pageId = page.json?.data?.page?.id;
  assert(pageId, 'temporary SDK smoke page missing id');

  return {
    siteId,
    siteSlug,
    pageId,
    pageSlug,
    collectionId,
  };
}

async function deleteFixture(siteId) {
  if (!siteId) {
    return;
  }

  await request(`/api/admin/sites/${siteId}`, { method: 'DELETE' }).catch(() => {});
}

const client = createBackyClient({
  baseUrl,
  requestIdFactory: () => 'sdk-smoke-request',
});

let identifier = configuredIdentifier;
if (!identifier) {
  const sites = await client.sites();
  const firstSite = sites.data.sites.find((candidate) => candidate.isPublished !== false);
  assert(firstSite?.slug || firstSite?.id, 'sites() did not return a published site to smoke');
  identifier = String(firstSite.slug || firstSite.id);
}

const site = await client.discoverSite(identifier);
assert(site.data.site?.id, 'discoverSite() did not return a site id');

const manifest = await client.manifest();
assert(manifest.data.capabilities?.renderPayload === true, 'manifest() missing render payload capability');
assert(typeof manifest.data.endpoints?.render === 'string', 'manifest() missing render endpoint');

const openapi = await client.openapi();
assert(openapi.openapi === '3.1.0', 'openapi() did not return an OpenAPI 3.1 document');
assert(openapi.paths?.[manifest.data.endpoints.openapi]?.get, 'openapi() missing manifest-advertised OpenAPI path');

const resolved = await client.resolve('/');
assert(resolved.data.route, 'resolve() did not return a route');

const rendered = await client.render('/');
assert(rendered.data, 'render() did not return a payload envelope');

const navigation = await client.navigation();
assert(navigation.data.navigation, 'navigation() missing navigation data');

const media = await client.media({ limit: 5 });
assert(media.data.media || media.data.pagination, 'media() missing media list data');

const forms = await client.forms();
assert(Array.isArray(forms.data.forms), 'forms() missing forms array');

const comments = await client.siteComments({ limit: 5 });
assert(Array.isArray(comments.data.comments), 'siteComments() missing comments array');

const events = await client.events({ limit: 5 });
assert(Array.isArray(events.data.events), 'events() missing events array');

const writeChecks = [];
let fixture = null;

if (runWriteSmoke) {
  fixture = await createSdkSmokeFixture();
  try {
    const writeClient = createBackyClient({
      baseUrl,
      requestIdFactory: () => 'sdk-write-smoke-request',
    });
    await writeClient.discoverSite(fixture.siteSlug);

    const fixtureManifest = await writeClient.manifest();
    assert(
      fixtureManifest.data.modules?.forms?.some?.((form) => form.id === 'sdk-smoke-form'),
      'fixture manifest missing SDK smoke form',
    );

    const createdRecord = await writeClient.createRecord(fixture.collectionId, {
      title: 'SDK Public Record',
      summary: 'Created through the SDK write smoke.',
      category: 'Featured',
    }, `sdk-public-record-${Date.now()}`);
    assert(createdRecord.data.record?.status === 'draft', 'createRecord() should create draft public records');
    writeChecks.push('createRecord');

    const form = await writeClient.form('sdk-smoke-form');
    assert(form.data.form?.id === 'sdk-smoke-form', 'form() missing SDK smoke form');
    writeChecks.push('form');

    const submittedForm = await writeClient.submitForm('sdk-smoke-form', {
      values: {
        title: 'SDK Form Record',
        message: 'Submitted through the SDK.',
        category: 'Standard',
      },
      pageId: fixture.pageId,
      requestId: 'sdk-form-submit',
      rateLimitBypass: true,
      contactShareOverride: {
        enabled: true,
        nameField: 'title',
        notesField: 'message',
      },
    });
    const submissionId = submittedForm.data.submission?.id;
    const contactId = submittedForm.data.contact?.id;
    assert(submissionId, 'submitForm() missing submission id');
    assert(submittedForm.data.collectionRecord?.status === 'draft', 'submitForm() missing draft collection record');
    assert(contactId, 'submitForm() missing generated contact id');
    writeChecks.push('submitForm');

    const submissions = await writeClient.formSubmissions('sdk-smoke-form', {
      status: 'approved',
      requestId: 'sdk-form-submit',
    });
    assert(
      submissions.data.submissions?.data?.some?.((submission) => submission.id === submissionId),
      'formSubmissions() missing submitted form',
    );
    writeChecks.push('formSubmissions');

    const submissionDetail = await writeClient.formSubmission('sdk-smoke-form', submissionId);
    assert(submissionDetail.data.submission?.id === submissionId, 'formSubmission() returned wrong submission');
    writeChecks.push('formSubmission');

    const updatedSubmission = await writeClient.updateFormSubmission('sdk-smoke-form', submissionId, {
      status: 'approved',
      reviewedBy: 'sdk-smoke',
    });
    assert(updatedSubmission.data.submission?.status === 'approved', 'updateFormSubmission() did not keep approved status');
    writeChecks.push('updateFormSubmission');

    const contacts = await writeClient.formContacts('sdk-smoke-form', { requestId: 'sdk-form-submit' });
    assert(contacts.data.contacts?.some?.((contact) => contact.id === contactId), 'formContacts() missing generated contact');
    writeChecks.push('formContacts');

    const updatedContact = await writeClient.updateFormContact('sdk-smoke-form', contactId, { status: 'qualified' });
    assert(updatedContact.data.contact?.status === 'qualified', 'updateFormContact() did not update contact status');
    writeChecks.push('updateFormContact');

    const comment = await writeClient.submitPageComment(fixture.pageId, {
      content: 'SDK comment body',
      authorName: 'SDK Commenter',
      moderationMode: 'auto-approve',
      requestId: 'sdk-page-comment',
      rateLimitBypass: true,
    });
    const commentId = comment.data.comment?.id;
    assert(commentId, 'submitPageComment() missing comment id');
    assert(comment.data.comment?.status === 'approved', 'submitPageComment() did not auto-approve comment');
    writeChecks.push('submitPageComment');

    const pageComments = await writeClient.pageComments(fixture.pageId, {
      status: 'approved',
      requestId: 'sdk-page-comment',
    });
    assert(pageComments.data.comments?.some?.((item) => item.id === commentId), 'pageComments() missing submitted comment');
    writeChecks.push('pageComments');

    const pageComment = await writeClient.pageComment(fixture.pageId, commentId);
    assert(pageComment.data.comment?.id === commentId, 'pageComment() returned wrong comment');
    writeChecks.push('pageComment');

    const updatedPageComment = await writeClient.updatePageComment(fixture.pageId, commentId, {
      status: 'approved',
      reviewedBy: 'sdk-smoke',
      requestId: 'sdk-page-comment-review',
    });
    assert(updatedPageComment.data.comment?.id === commentId, 'updatePageComment() returned wrong comment');
    writeChecks.push('updatePageComment');

    const siteComment = await writeClient.comment(commentId);
    assert(siteComment.data.comment?.id === commentId, 'comment() returned wrong site comment');
    writeChecks.push('comment');

    const updatedSiteComment = await writeClient.updateComment(commentId, {
      status: 'approved',
      reviewedBy: 'sdk-smoke',
      requestId: 'sdk-site-comment-review',
    });
    assert(updatedSiteComment.data.comment?.id === commentId, 'updateComment() returned wrong site comment');
    writeChecks.push('updateComment');

    const reasons = await writeClient.reportReasons();
    assert(reasons.data.reasons?.includes?.('spam'), 'reportReasons() missing spam reason');
    writeChecks.push('reportReasons');

    const report = await writeClient.reportComment(commentId, {
      reason: 'spam',
      requestId: 'sdk-comment-report',
    });
    assert(report.data.comment?.id === commentId, 'reportComment() returned wrong comment');
    writeChecks.push('reportComment');

    const reportEvents = await writeClient.events({
      kind: 'comment-reported',
      requestId: 'sdk-comment-report',
    });
    assert(reportEvents.data.events?.some?.((event) => event.commentId === commentId), 'events() missing comment report event');
    writeChecks.push('events:write');
  } finally {
    await deleteFixture(fixture.siteId);
  }
}

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  siteId: client.getSiteId(),
  identifier,
  checked: [
    'discoverSite',
    'sites',
    'manifest',
    'openapi',
    'resolve',
    'render',
    'navigation',
    'media',
    'forms',
    'siteComments',
    'events',
  ],
  writeChecked: writeChecks,
}, null, 2));
