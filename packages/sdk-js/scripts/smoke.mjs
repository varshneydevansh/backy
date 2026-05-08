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
  const redirectPath = `/sdk-old-${pageSlug}`;
  const gonePath = `/sdk-retired-${pageSlug}`;

  const routeSettings = await request(`/api/admin/sites/${siteId}/redirects`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      redirectRules: [
        {
          id: 'sdk-smoke-redirect',
          from: redirectPath,
          to: `/${pageSlug}`,
          statusCode: 301,
          enabled: true,
        },
        {
          id: 'sdk-smoke-gone',
          from: gonePath,
          statusCode: 410,
          enabled: true,
        },
      ],
    }),
  });
  assert(routeSettings.response.status === 200, `${routeSettings.url} expected redirect settings update 200`);

  const navigationSettings = await request(`/api/admin/sites/${siteId}/navigation`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      primary: [
        {
          id: 'sdk-smoke-nav-page',
          type: 'page',
          pageId,
          label: 'SDK Smoke Page',
          children: [
            {
              id: 'sdk-smoke-nav-child',
              type: 'route',
              label: 'SDK Child',
              path: `/${pageSlug}#child`,
            },
          ],
        },
        {
          id: 'sdk-smoke-nav-docs',
          type: 'url',
          label: 'SDK Docs',
          href: 'https://example.com/sdk',
          target: '_blank',
        },
      ],
    }),
  });
  assert(navigationSettings.response.status === 200, `${navigationSettings.url} expected navigation settings update 200`);

  const reusableSection = await request(`/api/admin/sites/${siteId}/reusable-sections`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'SDK Smoke Reusable Section',
      slug: `sdk-smoke-section-${unique}`,
      description: 'Temporary reusable section for SDK smoke.',
      category: 'layout',
      tags: ['sdk', 'template'],
      content: {
        canvasSize: { width: 720, height: 240 },
        elements: [
          {
            id: 'sdk-smoke-section-root',
            type: 'section',
            x: 0,
            y: 0,
            width: 720,
            height: 240,
            zIndex: 1,
            props: { backgroundColor: '#f8fafc' },
            children: [
              {
                id: 'sdk-smoke-section-heading',
                type: 'heading',
                x: 48,
                y: 48,
                width: 520,
                height: 72,
                zIndex: 1,
                props: { content: 'SDK reusable section', level: 'h2' },
              },
            ],
          },
        ],
      },
    }),
  });
  assert(reusableSection.response.status === 201, `${reusableSection.url} expected reusable section create 201, got ${reusableSection.response.status}`);
  const reusableSectionId = reusableSection.json?.data?.section?.id;
  assert(reusableSectionId, 'temporary SDK smoke reusable section missing id');

  return {
    siteId,
    siteSlug,
    pageId,
    pageSlug,
    redirectPath,
    gonePath,
    collectionId,
    reusableSectionId,
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
  const publishedSites = sites.data.sites.filter((candidate) => candidate.isPublished !== false);
  const firstSite = publishedSites.find((candidate) => candidate.slug === 'demo' || candidate.id === 'site-demo') || publishedSites[0];
  assert(firstSite?.slug || firstSite?.id, 'sites() did not return a published site to smoke');
  identifier = String(firstSite.slug || firstSite.id);
}

const site = await client.discoverSite(identifier);
assert(site.data.site?.id, 'discoverSite() did not return a site id');

const manifest = await client.manifest();
assert(manifest.data.capabilities?.renderPayload === true, 'manifest() missing render payload capability');
assert(typeof manifest.data.endpoints?.render === 'string', 'manifest() missing render endpoint');
const smokePath = manifest.data.modules?.pages?.items?.find?.((page) => typeof page.path === 'string')?.path || '/';

const cachedManifest = await client.manifestCached();
assert(cachedManifest.notModified === false, 'manifestCached() first request should return a body');
assert(cachedManifest.meta.etag, 'manifestCached() missing response ETag');
assert(cachedManifest.body.data.capabilities?.renderPayload === true, 'manifestCached() missing render payload capability');
const revalidatedManifest = await client.manifestCached({ etag: cachedManifest.meta.etag });
assert(revalidatedManifest.notModified === true, 'manifestCached() did not return notModified for matching ETag');

const openapi = await client.openapi();
assert(openapi.openapi === '3.1.0', 'openapi() did not return an OpenAPI 3.1 document');
assert(openapi.paths?.[manifest.data.endpoints.openapi]?.get, 'openapi() missing manifest-advertised OpenAPI path');
assert(openapi.components?.schemas?.RedirectRoute, 'openapi() missing redirect route schema');
assert(openapi.components?.schemas?.GoneRoute, 'openapi() missing gone route schema');

const cachedOpenapi = await client.openapiCached();
assert(cachedOpenapi.notModified === false, 'openapiCached() first request should return a body');
assert(cachedOpenapi.meta.etag, 'openapiCached() missing response ETag');
assert(cachedOpenapi.body.openapi === '3.1.0', 'openapiCached() did not return an OpenAPI 3.1 document');
const revalidatedOpenapi = await client.openapiCached({ etag: cachedOpenapi.meta.etag });
assert(revalidatedOpenapi.notModified === true, 'openapiCached() did not return notModified for matching ETag');

const resolved = await client.resolve(smokePath);
assert(resolved.data.route, 'resolve() did not return a route');

const rendered = await client.render(smokePath);
assert(rendered.data, 'render() did not return a payload envelope');

const cachedRender = await client.renderCached(smokePath);
assert(cachedRender.notModified === false, 'renderCached() first request should return a body');
assert(cachedRender.meta.etag, 'renderCached() missing response ETag');
assert(cachedRender.body.data.content?.elements, 'renderCached() did not return a render payload');
const revalidatedRender = await client.renderCached(smokePath, { etag: cachedRender.meta.etag });
assert(revalidatedRender.notModified === true, 'renderCached() did not return notModified for matching ETag');

const navigation = await client.navigation();
assert(navigation.data.navigation, 'navigation() missing navigation data');

const seo = await client.seo();
assert(Array.isArray(seo.data.routes), 'seo() missing route metadata');
assert(seo.data.sitemap?.url, 'seo() missing sitemap URL');
assert(Array.isArray(seo.data.defaults?.jsonLd), 'seo() missing JSON-LD defaults array');

const media = await client.media({ limit: 5 });
assert(media.data.media || media.data.pagination, 'media() missing media list data');
if (media.data.media?.length > 0) {
  const mediaDetail = await client.mediaAsset(media.data.media[0].id);
  assert(mediaDetail.data.media?.id === media.data.media[0].id, 'mediaAsset() returned wrong media asset');
}

const reusableSections = await client.reusableSections();
assert(Array.isArray(reusableSections.data.sections), 'reusableSections() missing sections array');
if (reusableSections.data.sections.length > 0) {
  const reusableSection = await client.reusableSection(reusableSections.data.sections[0].id);
  assert(reusableSection.data.section?.content?.elements, 'reusableSection() missing reusable section content');
}

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
    assert(fixtureManifest.data.capabilities?.redirectRoutes === true, 'fixture manifest missing redirect route capability');
    assert(
      fixtureManifest.data.modules?.routing?.redirectRules?.items?.some?.((rule) => rule.from === fixture.redirectPath && rule.statusCode === 301),
      'fixture manifest missing redirect route metadata',
    );
    assert(
      fixtureManifest.data.navigation?.primary?.some?.((item) => (
        item.id === 'sdk-smoke-nav-page'
        && item.pageId === fixture.pageId
        && item.children?.some?.((child) => child.id === 'sdk-smoke-nav-child')
      )),
      'fixture manifest missing configured navigation',
    );
    assert(
      fixtureManifest.data.navigation?.primary?.some?.((item) => item.id === 'sdk-smoke-nav-docs' && item.href === 'https://example.com/sdk'),
      'fixture manifest missing custom URL navigation',
    );
    assert(
      fixtureManifest.data.modules?.forms?.some?.((form) => form.id === 'sdk-smoke-form'),
      'fixture manifest missing SDK smoke form',
    );
    assert(
      fixtureManifest.data.modules?.reusableSections?.items?.some?.((section) => section.id === fixture.reusableSectionId),
      'fixture manifest missing SDK smoke reusable section',
    );

    const fixtureOpenapi = await writeClient.openapi();
    assert(
      fixtureOpenapi['x-backy']?.redirectRules?.some?.((rule) => rule.from === fixture.redirectPath && rule.statusCode === 301),
      'fixture OpenAPI missing redirect route vendor metadata',
    );

    const redirected = await writeClient.resolve(fixture.redirectPath);
    assert(redirected.data.route?.type === 'redirect', 'resolve() did not return a redirect route');
    assert(redirected.data.route?.resource?.to === `/${fixture.pageSlug}`, 'resolve() returned the wrong redirect target');

    const gone = await writeClient.resolve(fixture.gonePath);
    assert(gone.success === false, 'resolve() should return a non-throwing gone envelope');
    assert(gone.data.route?.type === 'gone', 'resolve() did not expose gone route data');
    writeChecks.push('routeRedirects');

    const configuredNavigation = await writeClient.navigation();
    assert(
      configuredNavigation.data.navigation?.primary?.some?.((item) => item.id === 'sdk-smoke-nav-page' && item.pageId === fixture.pageId),
      'navigation() missing configured page item',
    );
    assert(
      configuredNavigation.data.navigation?.primary?.some?.((item) => item.id === 'sdk-smoke-nav-docs' && item.href === 'https://example.com/sdk'),
      'navigation() missing configured URL item',
    );
    writeChecks.push('navigation');

    const savedSections = await writeClient.reusableSections({ tag: 'sdk' });
    assert(savedSections.data.sections?.some?.((section) => section.id === fixture.reusableSectionId), 'reusableSections() missing SDK smoke reusable section');
    writeChecks.push('reusableSections');

    const savedSection = await writeClient.reusableSection(fixture.reusableSectionId);
    assert(savedSection.data.section?.content?.elements?.[0]?.id === 'sdk-smoke-section-root', 'reusableSection() missing SDK smoke section detail');
    writeChecks.push('reusableSection');

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
    'manifestCached',
    'openapi',
    'openapiCached',
    'resolve',
    'render',
    'renderCached',
    'navigation',
    'seo',
    'media',
    'reusableSections',
    'forms',
    'siteComments',
    'events',
  ],
  writeChecked: writeChecks,
}, null, 2));
