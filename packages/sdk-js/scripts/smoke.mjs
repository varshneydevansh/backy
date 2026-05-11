#!/usr/bin/env node

import { createBackyClient } from '../dist/index.js';

const baseUrl = (process.env.BACKY_SDK_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const configuredIdentifier = process.env.BACKY_SDK_SITE_IDENTIFIER || '';
const runWriteSmoke = process.env.BACKY_SDK_SKIP_WRITE_SMOKE !== '1';
const configuredAdminApiKey = (process.env.BACKY_ADMIN_API_KEY || process.env.BACKY_ADMIN_SECRET_KEY || '').trim();
let adminRequestApiKey = configuredAdminApiKey;
let adminSessionToken = '';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

async function request(path, init) {
  const headers = new Headers(init?.headers || {});

  if (path.startsWith('/api/admin/')) {
    if (adminRequestApiKey && !headers.has('x-backy-admin-key') && !headers.has('authorization')) {
      headers.set('x-backy-admin-key', adminRequestApiKey);
    } else if (adminSessionToken && !headers.has('authorization')) {
      headers.set('authorization', `Bearer ${adminSessionToken}`);
    }
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Keep null JSON for clear assertion failures below.
  }

  return { response, json, text, url: `${baseUrl}${path}` };
}

async function loginAdminApi() {
  if (adminRequestApiKey || adminSessionToken) {
    return;
  }

  const response = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@backy.io',
      password: process.env.BACKY_ADMIN_DEMO_PASSWORD || 'admin123',
    }),
  });
  const json = await response.json().catch(() => ({}));

  if (!response.ok || json.success === false || !json.data?.session?.token) {
    throw new Error(`Unable to create admin session for SDK smoke: ${JSON.stringify(json).slice(0, 500)}`);
  }

  adminSessionToken = json.data.session.token;
}

function adminClientHeaders() {
  if (adminRequestApiKey) {
    return { 'x-backy-admin-key': adminRequestApiKey };
  }

  if (adminSessionToken) {
    return { authorization: `Bearer ${adminSessionToken}` };
  }

  return {};
}

async function createSdkSmokeFixture() {
  await loginAdminApi();

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

  const publishedRecordSlug = `sdk-published-record-${unique}`;
  const publishedRecord = await request(`/api/admin/sites/${siteId}/collections/${collectionId}/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      slug: publishedRecordSlug,
      status: 'published',
      values: {
        title: 'SDK Published Record',
        summary: 'Published record for SDK cached reads.',
        category: 'Featured',
      },
    }),
  });
  assert(publishedRecord.response.status === 201, `${publishedRecord.url} expected record create 201, got ${publishedRecord.response.status}`);
  const publishedRecordId = publishedRecord.json?.data?.record?.id;
  assert(publishedRecordId, 'temporary SDK smoke published record missing id');

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
    publishedRecordId,
    publishedRecordSlug,
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

const frontendDesign = await client.frontendDesign();
assert(frontendDesign.data.schemaVersion === 'backy.frontend-design-response.v1', 'frontendDesign() did not return the frontend design response schema');
assert(frontendDesign.data.frontendDesign?.schemaVersion === 'backy.frontend-design.v1', 'frontendDesign() missing frontend design contract');
assert(Array.isArray(frontendDesign.data.frontendDesign.templates), 'frontendDesign() missing template registry');
assert(Array.isArray(frontendDesign.data.frontendDesign.editableMap), 'frontendDesign() missing editable map');
assert(typeof frontendDesign.data.capabilities?.hasContract === 'boolean', 'frontendDesign() missing capability summary');
const cachedFrontendDesign = await client.frontendDesignCached();
assert(cachedFrontendDesign.notModified === false, 'frontendDesignCached() first request should return a body');
assert(cachedFrontendDesign.meta.etag, 'frontendDesignCached() missing response ETag');
assert(cachedFrontendDesign.body.data.frontendDesign?.schemaVersion === 'backy.frontend-design.v1', 'frontendDesignCached() missing frontend design contract');
const revalidatedFrontendDesign = await client.frontendDesignCached({ etag: cachedFrontendDesign.meta.etag });
assert(revalidatedFrontendDesign.notModified === true, 'frontendDesignCached() did not return notModified for matching ETag');

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

const pageDetail = await client.pages({ path: smokePath });
assert(pageDetail.data.page, 'pages() path lookup missing page detail');
const cachedPageDetail = await client.pagesCached({ path: smokePath });
assert(cachedPageDetail.notModified === false, 'pagesCached() first path request should return a body');
assert(cachedPageDetail.body.data.page, 'pagesCached() path lookup missing page detail');
assert(cachedPageDetail.meta.etag, 'pagesCached() missing response ETag');
const revalidatedPageDetail = await client.pagesCached({ path: smokePath, etag: cachedPageDetail.meta.etag });
assert(revalidatedPageDetail.notModified === true, 'pagesCached() did not return notModified for matching ETag');

const blogList = await client.blog({ limit: 5 });
assert(Array.isArray(blogList.data.posts), 'blog() missing posts array');
const cachedBlogList = await client.blogCached({ limit: 5 });
assert(cachedBlogList.notModified === false, 'blogCached() first list request should return a body');
assert(Array.isArray(cachedBlogList.body.data.posts), 'blogCached() missing posts array');
assert(cachedBlogList.meta.etag, 'blogCached() missing response ETag');
const revalidatedBlogList = await client.blogCached({ limit: 5, etag: cachedBlogList.meta.etag });
assert(revalidatedBlogList.notModified === true, 'blogCached() did not return notModified for matching ETag');
const firstBlogPost = blogList.data.posts?.find?.((post) => typeof post.slug === 'string' && post.slug.length > 0);
if (firstBlogPost) {
  const blogDetail = await client.blog({ slug: firstBlogPost.slug });
  assert(blogDetail.data.post?.id === firstBlogPost.id, 'blog() slug lookup returned wrong post');
  const cachedBlogDetail = await client.blogCached({ slug: firstBlogPost.slug });
  assert(cachedBlogDetail.notModified === false, 'blogCached() first slug request should return a body');
  assert(cachedBlogDetail.body.data.post?.id === firstBlogPost.id, 'blogCached() slug lookup returned wrong post');
  assert(cachedBlogDetail.meta.etag, 'blogCached() slug lookup missing response ETag');
  const revalidatedBlogDetail = await client.blogCached({ slug: firstBlogPost.slug, etag: cachedBlogDetail.meta.etag });
  assert(revalidatedBlogDetail.notModified === true, 'blogCached() slug lookup did not return notModified for matching ETag');
}

const navigation = await client.navigation();
assert(navigation.data.navigation, 'navigation() missing navigation data');
const cachedNavigation = await client.navigationCached();
assert(cachedNavigation.notModified === false, 'navigationCached() first request should return a body');
assert(cachedNavigation.body.data.navigation, 'navigationCached() missing navigation data');
assert(cachedNavigation.meta.etag, 'navigationCached() missing response ETag');
const revalidatedNavigation = await client.navigationCached({ etag: cachedNavigation.meta.etag });
assert(revalidatedNavigation.notModified === true, 'navigationCached() did not return notModified for matching ETag');

const seo = await client.seo();
assert(Array.isArray(seo.data.routes), 'seo() missing route metadata');
assert(seo.data.sitemap?.url, 'seo() missing sitemap URL');
assert(Array.isArray(seo.data.defaults?.jsonLd), 'seo() missing JSON-LD defaults array');
const cachedSeo = await client.seoCached();
assert(cachedSeo.notModified === false, 'seoCached() first request should return a body');
assert(cachedSeo.meta.etag, 'seoCached() missing response ETag');
assert(Array.isArray(cachedSeo.body.data.routes), 'seoCached() missing route metadata');
const revalidatedSeo = await client.seoCached({ etag: cachedSeo.meta.etag });
assert(revalidatedSeo.notModified === true, 'seoCached() did not return notModified for matching ETag');

const media = await client.media({ limit: 5 });
assert(media.data.media || media.data.pagination, 'media() missing media list data');
const cachedMedia = await client.mediaCached({ limit: 5 });
assert(cachedMedia.notModified === false, 'mediaCached() first request should return a body');
assert(cachedMedia.meta.etag, 'mediaCached() missing response ETag');
assert(Array.isArray(cachedMedia.body.data.media), 'mediaCached() missing media array');
const revalidatedMedia = await client.mediaCached({ limit: 5, etag: cachedMedia.meta.etag });
assert(revalidatedMedia.notModified === true, 'mediaCached() did not return notModified for matching ETag');
if (media.data.media?.length > 0) {
  const mediaDetail = await client.mediaAsset(media.data.media[0].id);
  assert(mediaDetail.data.media?.id === media.data.media[0].id, 'mediaAsset() returned wrong media asset');
  const cachedMediaDetail = await client.mediaAssetCached(media.data.media[0].id);
  assert(cachedMediaDetail.notModified === false, 'mediaAssetCached() first request should return a body');
  assert(cachedMediaDetail.body.data.media?.id === media.data.media[0].id, 'mediaAssetCached() returned wrong media asset');
  assert(cachedMediaDetail.meta.etag, 'mediaAssetCached() missing response ETag');
  const revalidatedMediaDetail = await client.mediaAssetCached(media.data.media[0].id, { etag: cachedMediaDetail.meta.etag });
  assert(revalidatedMediaDetail.notModified === true, 'mediaAssetCached() did not return notModified for matching ETag');
  assert(
    client.mediaFileUrl(media.data.media[0].id).includes(`/api/sites/${client.getSiteId()}/media/${media.data.media[0].id}/file`),
    'mediaFileUrl() returned wrong media file URL',
  );
  assert(
    client.mediaTransformUrl(media.data.media[0].id, { width: 640, quality: 80 }).includes(`/api/sites/${client.getSiteId()}/media/${media.data.media[0].id}/transform?width=640&quality=80`),
    'mediaTransformUrl() returned wrong media transform URL',
  );
}

const mediaFonts = await client.mediaFonts();
assert(mediaFonts.data.schemaVersion === 'backy.font-manifest.v1', 'mediaFonts() missing font manifest schema version');
assert(Array.isArray(mediaFonts.data.families), 'mediaFonts() missing font families array');
assert(Array.isArray(mediaFonts.data.fonts), 'mediaFonts() missing font variants array');
const cachedMediaFonts = await client.mediaFontsCached();
assert(cachedMediaFonts.notModified === false, 'mediaFontsCached() first request should return a body');
assert(cachedMediaFonts.body.data.schemaVersion === 'backy.font-manifest.v1', 'mediaFontsCached() missing font manifest body');
assert(cachedMediaFonts.meta.etag, 'mediaFontsCached() missing response ETag');
const revalidatedMediaFonts = await client.mediaFontsCached({ etag: cachedMediaFonts.meta.etag });
assert(revalidatedMediaFonts.notModified === true, 'mediaFontsCached() did not return notModified for matching ETag');

const collections = await client.collections();
assert(Array.isArray(collections.data.collections), 'collections() missing collections array');
const cachedCollections = await client.collectionsCached();
assert(cachedCollections.notModified === false, 'collectionsCached() first request should return a body');
assert(Array.isArray(cachedCollections.body.data.collections), 'collectionsCached() missing collections array');
assert(cachedCollections.meta.etag, 'collectionsCached() missing response ETag');
const revalidatedCollections = await client.collectionsCached({ etag: cachedCollections.meta.etag });
assert(revalidatedCollections.notModified === true, 'collectionsCached() did not return notModified for matching ETag');
if (collections.data.collections.length > 0) {
  const collection = await client.collection(collections.data.collections[0].id);
  assert(collection.data.collection?.id === collections.data.collections[0].id, 'collection() returned wrong collection');
  const cachedCollection = await client.collectionCached(collections.data.collections[0].id);
  assert(cachedCollection.notModified === false, 'collectionCached() first request should return a body');
  assert(cachedCollection.body.data.collection?.id === collections.data.collections[0].id, 'collectionCached() returned wrong collection');
  assert(cachedCollection.meta.etag, 'collectionCached() missing response ETag');
  const revalidatedCollection = await client.collectionCached(collections.data.collections[0].id, { etag: cachedCollection.meta.etag });
  assert(revalidatedCollection.notModified === true, 'collectionCached() did not return notModified for matching ETag');
}

const reusableSections = await client.reusableSections();
assert(Array.isArray(reusableSections.data.sections), 'reusableSections() missing sections array');
const cachedReusableSections = await client.reusableSectionsCached();
assert(cachedReusableSections.notModified === false, 'reusableSectionsCached() first request should return a body');
assert(Array.isArray(cachedReusableSections.body.data.sections), 'reusableSectionsCached() missing sections array');
assert(cachedReusableSections.meta.etag, 'reusableSectionsCached() missing response ETag');
const revalidatedReusableSections = await client.reusableSectionsCached({ etag: cachedReusableSections.meta.etag });
assert(revalidatedReusableSections.notModified === true, 'reusableSectionsCached() did not return notModified for matching ETag');
if (reusableSections.data.sections.length > 0) {
  const reusableSection = await client.reusableSection(reusableSections.data.sections[0].id);
  assert(reusableSection.data.section?.content?.elements, 'reusableSection() missing reusable section content');
  const cachedReusableSection = await client.reusableSectionCached(reusableSections.data.sections[0].id);
  assert(cachedReusableSection.notModified === false, 'reusableSectionCached() first request should return a body');
  assert(cachedReusableSection.body.data.section?.id === reusableSections.data.sections[0].id, 'reusableSectionCached() returned wrong section');
  assert(cachedReusableSection.meta.etag, 'reusableSectionCached() missing response ETag');
  const revalidatedReusableSection = await client.reusableSectionCached(reusableSections.data.sections[0].id, { etag: cachedReusableSection.meta.etag });
  assert(revalidatedReusableSection.notModified === true, 'reusableSectionCached() did not return notModified for matching ETag');
}

const forms = await client.forms();
assert(Array.isArray(forms.data.forms), 'forms() missing forms array');
if (forms.data.forms.length > 0) {
  const definition = await client.formDefinition(forms.data.forms[0].id);
  assert(definition.data.schemaVersion === 'backy.form-definition.v1', 'formDefinition() missing schema version');
  assert(definition.data.form?.id === forms.data.forms[0].id, 'formDefinition() returned wrong form');
  const cachedDefinition = await client.formDefinitionCached(forms.data.forms[0].id);
  assert(cachedDefinition.notModified === false, 'formDefinitionCached() first request should return a body');
  assert(cachedDefinition.meta.etag, 'formDefinitionCached() missing response ETag');
  const revalidatedDefinition = await client.formDefinitionCached(forms.data.forms[0].id, { etag: cachedDefinition.meta.etag });
  assert(revalidatedDefinition.notModified === true, 'formDefinitionCached() did not return notModified for matching ETag');
}

const comments = await client.siteComments({ limit: 5 });
assert(Array.isArray(comments.data.comments), 'siteComments() missing comments array');

const events = await client.events({ limit: 5 });
assert(Array.isArray(events.data.events), 'events() missing events array');

let commerceCatalogChecked = false;
try {
  const commerceCatalog = await client.commerceCatalog({ limit: 5 });
  assert(commerceCatalog.data.schemaVersion === 'backy.commerce-catalog.v1', 'commerceCatalog() missing schema version');
  assert(Array.isArray(commerceCatalog.data.products), 'commerceCatalog() missing products array');
  const cachedCommerceCatalog = await client.commerceCatalogCached({ limit: 5 });
  assert(cachedCommerceCatalog.notModified === false, 'commerceCatalogCached() first request should return a body');
  assert(cachedCommerceCatalog.body.data.schemaVersion === 'backy.commerce-catalog.v1', 'commerceCatalogCached() missing schema version');
  assert(cachedCommerceCatalog.meta.etag, 'commerceCatalogCached() missing response ETag');
  const revalidatedCommerceCatalog = await client.commerceCatalogCached({ limit: 5, etag: cachedCommerceCatalog.meta.etag });
  assert(revalidatedCommerceCatalog.notModified === true, 'commerceCatalogCached() did not return notModified for matching ETag');
  commerceCatalogChecked = true;
} catch (error) {
  if (error?.status !== 404 || !['PRODUCT_CATALOG_NOT_FOUND', 'SITE_NOT_FOUND'].includes(error?.code)) {
    throw error;
  }
}

const writeChecks = [];
let fixture = null;

if (runWriteSmoke) {
  fixture = await createSdkSmokeFixture();
  try {
    const writeClient = createBackyClient({
      baseUrl,
      requestIdFactory: () => 'sdk-write-smoke-request',
      defaultHeaders: adminClientHeaders(),
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
      fixtureManifest.data.modules?.forms?.some?.((form) => (
        form.id === 'sdk-smoke-form'
        && form.definitionUrl === `/api/sites/${fixture.siteId}/forms/sdk-smoke-form/definition`
      )),
      'fixture manifest missing SDK smoke form definition URL',
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

    const cachedRecords = await writeClient.recordsCached(fixture.collectionId, {
      slug: fixture.publishedRecordSlug,
    });
    assert(cachedRecords.notModified === false, 'recordsCached() should return SDK smoke collection records body');
    assert(cachedRecords.body?.data?.records?.some?.((record) => record.id === fixture.publishedRecordId), 'recordsCached() missing published SDK smoke record');
    assert(cachedRecords.meta.cacheScope === 'discovery', 'recordsCached() expected discovery cache scope');
    assert(cachedRecords.meta.etag, 'recordsCached() SDK smoke missing response ETag');
    const revalidatedRecords = await writeClient.recordsCached(fixture.collectionId, {
      slug: fixture.publishedRecordSlug,
      etag: cachedRecords.meta.etag,
    });
    assert(revalidatedRecords.notModified === true, 'recordsCached() SDK smoke revalidation failed');
    writeChecks.push('recordsCached');

    const form = await writeClient.form('sdk-smoke-form');
    assert(form.data.form?.id === 'sdk-smoke-form', 'form() missing SDK smoke form');
    writeChecks.push('form');

    const formDefinition = await writeClient.formDefinitionCached('sdk-smoke-form');
    assert(formDefinition.notModified === false, 'formDefinitionCached() should return SDK smoke form body');
    assert(formDefinition.body?.data?.form?.id === 'sdk-smoke-form', 'formDefinitionCached() missing SDK smoke form');
    assert(formDefinition.meta.cacheScope === 'discovery', 'formDefinitionCached() expected discovery cache scope');
    assert(formDefinition.meta.etag, 'formDefinitionCached() SDK smoke missing response ETag');
    const revalidatedFormDefinition = await writeClient.formDefinitionCached('sdk-smoke-form', { etag: formDefinition.meta.etag });
    assert(revalidatedFormDefinition.notModified === true, 'formDefinitionCached() SDK smoke revalidation failed');
    writeChecks.push('formDefinitionCached');

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
    'frontendDesign',
    'frontendDesignCached',
    'openapi',
    'openapiCached',
    'resolve',
    'render',
    'renderCached',
    'pages',
    'pagesCached',
    'blog',
    'blogCached',
    'navigation',
    'navigationCached',
    'seo',
    'seoCached',
    'media',
    'mediaCached',
    'mediaAssetCached',
    'mediaFonts',
    'mediaFontsCached',
    'mediaFileUrl',
    'mediaTransformUrl',
    'collections',
    'collectionsCached',
    'collectionCached',
    'reusableSections',
    'reusableSectionsCached',
    'reusableSectionCached',
    'forms',
    'formDefinition',
    'formDefinitionCached',
    'siteComments',
    'events',
    ...(commerceCatalogChecked ? ['commerceCatalog', 'commerceCatalogCached'] : []),
  ],
  writeChecked: writeChecks,
}, null, 2));
