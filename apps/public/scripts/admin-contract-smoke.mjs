#!/usr/bin/env node

import { validateAiFrontendManifest, validateAiRenderPayload } from './validate-ai-render-payload.mjs';

const baseUrl = (process.env.BACKY_PUBLIC_CONTRACT_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

const checks = [];
let createdSiteId = null;
let createdPageId = null;
let createdPostId = null;
let createdCategoryId = null;
let createdTagId = null;
let createdUserId = null;
let createdCollectionId = null;
let createdCollectionRecordId = null;
let createdMediaId = null;
let originalDeliveryMode = null;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(pathOrUrl, init) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${baseUrl}${pathOrUrl}`;
  const response = await fetch(url, init);
  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Keep raw text for diagnostics below.
  }

  return {
    response,
    text,
    json,
    url,
  };
}

async function record(name, fn) {
  const startedAt = Date.now();
  await fn();
  checks.push({ name, ms: Date.now() - startedAt });
}

async function cleanup() {
  if (createdSiteId && createdPostId) {
    await request(`/api/admin/sites/${createdSiteId}/blog/${createdPostId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (createdSiteId && createdPageId) {
    await request(`/api/admin/sites/${createdSiteId}/pages/${createdPageId}`, { method: 'DELETE' }).catch(() => {});
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

  if (createdSiteId && createdMediaId) {
    await request(`/api/admin/sites/${createdSiteId}/media/${createdMediaId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (createdSiteId) {
    await request(`/api/admin/sites/${createdSiteId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (createdUserId) {
    await request(`/api/admin/users/${createdUserId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (originalDeliveryMode) {
    await request('/api/admin/settings', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ deliveryMode: originalDeliveryMode }),
    }).catch(() => {});
  }
}

try {
  const unique = Date.now();
  const siteSlug = `admin-contract-site-${unique}`;
  const pageSlug = `admin-contract-page-${unique}`;
  const postSlug = `admin-contract-post-${unique}`;
  const categorySlug = `admin-contract-category-${unique}`;
  const tagSlug = `admin-contract-tag-${unique}`;
  const collectionSlug = `admin-contract-collection-${unique}`;
  const collectionRecordSlug = `admin-contract-record-${unique}`;
  const boundPageSlug = `admin-contract-bound-page-${unique}`;
  const adminDevOrigin = 'http://localhost:5173';

  await record('api cors allows local admin dev origin', async () => {
    const preflight = await request('/api/admin/sites', {
      method: 'OPTIONS',
      headers: {
        origin: adminDevOrigin,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'content-type',
      },
    });
    assert(preflight.response.status === 204, `${preflight.url} expected 204 preflight, got ${preflight.response.status}`);
    assert(preflight.response.headers.get('access-control-allow-origin') === adminDevOrigin, `${preflight.url} missing allowed origin`);
    assert(preflight.response.headers.get('access-control-allow-methods')?.includes('GET'), `${preflight.url} missing allowed methods`);

    const actual = await request('/api/admin/sites?includeUnpublished=true', {
      headers: {
        origin: adminDevOrigin,
      },
    });
    assert(actual.response.status === 200, `${actual.url} expected 200, got ${actual.response.status}`);
    assert(actual.response.headers.get('access-control-allow-origin') === adminDevOrigin, `${actual.url} missing CORS header`);
  });

  await record('admin sites list returns success envelope', async () => {
    const { response, json, url } = await request('/api/admin/sites?includeUnpublished=true');
    assert(response.status === 200, `${url} expected 200, got ${response.status}`);
    assert(json?.success === true, `${url} expected success envelope`);
    assert(Array.isArray(json?.data?.sites), `${url} expected sites array`);
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
    assert(publicDraft.json?.success === false, `${publicDraft.url} expected error envelope`);

    const draftManifest = await request(`/api/sites/${createdSiteId}/manifest`);
    assert(draftManifest.response.status === 404, `${draftManifest.url} expected draft site manifest to be hidden`);
    assert(draftManifest.json?.success === false, `${draftManifest.url} expected error envelope`);

    const draftOpenApi = await request(`/api/sites/${createdSiteId}/openapi`);
    assert(draftOpenApi.response.status === 404, `${draftOpenApi.url} expected draft site OpenAPI to be hidden`);
    assert(draftOpenApi.json?.success === false, `${draftOpenApi.url} expected error envelope`);
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
        status: 'published',
      }),
    });

    assert(update.response.status === 200, `${update.url} expected 200, got ${update.response.status}`);
    assert(update.json?.success === true, `${update.url} expected success envelope`);
    assert(update.json?.data?.site?.status === 'published', `${update.url} expected published status`);
    assert(update.json?.data?.site?.description === 'Updated contract smoke site', `${update.url} expected updated description`);

    const publicSiteBySlug = await request(`/api/sites?identifier=${siteSlug}`);
    assert(publicSiteBySlug.response.status === 200, `${publicSiteBySlug.url} expected 200, got ${publicSiteBySlug.response.status}`);
    assert(publicSiteBySlug.json?.success === true, `${publicSiteBySlug.url} expected success envelope`);
    assert(publicSiteBySlug.json?.data?.site?.id === createdSiteId, `${publicSiteBySlug.url} returned wrong site`);

    const publicSiteList = await request('/api/sites');
    assert(publicSiteList.response.status === 200, `${publicSiteList.url} expected 200, got ${publicSiteList.response.status}`);
    assert(publicSiteList.json?.success === true, `${publicSiteList.url} expected success envelope`);
    assert(publicSiteList.json?.data?.sites?.some((site) => site.id === createdSiteId), `${publicSiteList.url} missing published temporary site`);
  });

  await record('admin media font upload registers public font asset', async () => {
    const formData = new FormData();
    formData.set('file', new Blob(['contract-font'], { type: 'font/woff2' }), 'ContractSans.woff2');
    formData.set('visibility', 'public');
    formData.set('fontFamily', 'Contract Sans');
    formData.set('fontWeight', '500');
    formData.set('tags', 'brand,font');

    const upload = await request(`/api/admin/sites/${createdSiteId}/media`, {
      method: 'POST',
      body: formData,
    });
    assert(upload.response.status === 201, `${upload.url} expected 201, got ${upload.response.status}`);
    assert(upload.json?.data?.media?.type === 'font', `${upload.url} expected font media type`);
    assert(upload.json?.data?.media?.metadata?.fontFamily === 'Contract Sans', `${upload.url} expected font family metadata`);
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
        },
      }),
    });
    assert(update.response.status === 200, `${update.url} expected 200, got ${update.response.status}`);
    assert(update.json?.data?.media?.metadata?.fontFamily === 'Contract Sans Display', `${update.url} expected updated font family metadata`);

    const publicFonts = await request(`/api/sites/${createdSiteId}/media?type=font&search=${encodeURIComponent('Contract Sans')}&tag=font`);
    assert(publicFonts.response.status === 200, `${publicFonts.url} expected 200, got ${publicFonts.response.status}`);
    assert(publicFonts.json?.success === true, `${publicFonts.url} expected success envelope`);
    assert(publicFonts.json?.data?.media?.some((item) => item.id === createdMediaId && item.metadata?.fontFamily === 'Contract Sans Display'), `${publicFonts.url} missing public font media in data envelope`);
    assert(publicFonts.json?.media?.some((item) => item.id === createdMediaId && item.metadata?.fontFamily === 'Contract Sans Display'), `${publicFonts.url} missing public font media`);

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

    const publicUpdate = await request(`/api/admin/sites/${createdSiteId}/media/${createdMediaId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ visibility: 'public' }),
    });
    assert(publicUpdate.response.status === 200, `${publicUpdate.url} expected 200, got ${publicUpdate.response.status}`);
  });

  await record('admin pages create/list/detail/update/delete works for temporary site', async () => {
    const create = await request(`/api/admin/sites/${createdSiteId}/pages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Admin Contract Page',
        slug: pageSlug,
        status: 'draft',
        content: {
          elements: [],
          canvasSize: { width: 1200, height: 900 },
        },
      }),
    });
    assert(create.response.status === 201, `${create.url} expected 201, got ${create.response.status}`);
    assert(create.json?.data?.page?.slug === pageSlug, `${create.url} returned wrong page slug`);
    createdPageId = create.json.data.page.id;

    const list = await request(`/api/admin/sites/${createdSiteId}/pages?includeUnpublished=true`);
    assert(list.response.status === 200, `${list.url} expected 200, got ${list.response.status}`);
    assert(list.json?.data?.pages?.some((page) => page.id === createdPageId), `${list.url} missing created page`);

    const detail = await request(`/api/admin/sites/${createdSiteId}/pages/${createdPageId}`);
    assert(detail.response.status === 200, `${detail.url} expected 200, got ${detail.response.status}`);
    assert(detail.json?.data?.page?.id === createdPageId, `${detail.url} returned wrong page`);

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

    const pageMediaList = await request(`/api/admin/sites/${createdSiteId}/media?pageId=${createdPageId}&type=font`);
    assert(pageMediaList.response.status === 200, `${pageMediaList.url} expected 200, got ${pageMediaList.response.status}`);
    assert(pageMediaList.json?.data?.media?.some((item) => item.id === createdMediaId && item.pageIds?.includes(createdPageId)), `${pageMediaList.url} missing page-bound media`);

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
    assert(pastScheduledPage.response.status === 200, `${pastScheduledPage.url} expected 200, got ${pastScheduledPage.response.status}`);
    assert(pastScheduledPage.json?.data?.page?.scheduledAt === pastPageSchedule, `${pastScheduledPage.url} expected past schedule`);

    const visibleScheduledPage = await request(`/api/sites/${createdSiteId}/pages?slug=${pageSlug}`);
    assert(visibleScheduledPage.response.status === 200, `${visibleScheduledPage.url} expected past scheduled page to be visible`);
    assert(visibleScheduledPage.json?.success === true, `${visibleScheduledPage.url} expected success envelope`);
    assert(visibleScheduledPage.json?.data?.page?.id === createdPageId, `${visibleScheduledPage.url} returned wrong scheduled page in data envelope`);
    assert(visibleScheduledPage.json?.page?.id === createdPageId, `${visibleScheduledPage.url} returned wrong scheduled page`);

    const visibleScheduledPageResolve = await request(`/api/sites/${createdSiteId}/resolve?path=/${pageSlug}`);
    assert(visibleScheduledPageResolve.response.status === 200, `${visibleScheduledPageResolve.url} expected past scheduled page route to be visible`);
    assert(visibleScheduledPageResolve.json?.data?.route?.type === 'page', `${visibleScheduledPageResolve.url} expected page route type`);
    assert(visibleScheduledPageResolve.json?.data?.route?.resource?.id === createdPageId, `${visibleScheduledPageResolve.url} returned wrong resolved page`);

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

    const publicNavigation = await request(`/api/sites/${createdSiteId}/navigation`);
    assert(publicNavigation.response.status === 200, `${publicNavigation.url} expected 200, got ${publicNavigation.response.status}`);
    assert(publicNavigation.json?.success === true, `${publicNavigation.url} expected success envelope`);
    assert(
      publicNavigation.json?.data?.navigation?.primary?.some((item) => item.pageId === createdPageId && item.path === `/${pageSlug}`),
      `${publicNavigation.url} missing created page navigation item`,
    );

    const renderPayload = await request(`/api/sites/${createdSiteId}/render?path=/${pageSlug}`);
    assert(renderPayload.response.status === 200, `${renderPayload.url} expected 200, got ${renderPayload.response.status}`);
    validateAiRenderPayload(renderPayload.json, 'page render payload');
    assert(
      renderPayload.json?.data?.navigation?.primary?.some((item) => item.pageId === createdPageId && item.path === `/${pageSlug}`),
      `${renderPayload.url} missing render navigation manifest`,
    );
    assert(
      renderPayload.json?.data?.assets?.fonts?.some((font) => font.id === createdMediaId && font.family === 'Contract Sans Display'),
      `${renderPayload.url} missing uploaded font asset manifest`,
    );

    const resolvedPage = await request(`/api/sites/${createdSiteId}/resolve?path=/${pageSlug}`);
    assert(resolvedPage.response.status === 200, `${resolvedPage.url} expected 200, got ${resolvedPage.response.status}`);
    assert(resolvedPage.json?.success === true, `${resolvedPage.url} expected success envelope`);
    assert(resolvedPage.json?.data?.route?.type === 'page', `${resolvedPage.url} expected page route`);
    assert(resolvedPage.json?.data?.route?.resource?.id === createdPageId, `${resolvedPage.url} returned wrong resolved page`);

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
    assert(pageComment.json?.success === true, `${pageComment.url} expected success envelope`);
    assert(pageComment.json?.data?.comment?.status === 'approved', `${pageComment.url} expected approved comment in data envelope`);
    assert(pageComment.json?.comment?.id === pageComment.json?.data?.comment?.id, `${pageComment.url} expected legacy comment to match data envelope`);

    const pageComments = await request(`/api/sites/${createdSiteId}/pages/${createdPageId}/comments?status=approved&requestId=contract-page-comment`);
    assert(pageComments.response.status === 200, `${pageComments.url} expected 200, got ${pageComments.response.status}`);
    assert(pageComments.json?.success === true, `${pageComments.url} expected success envelope`);
    assert(pageComments.json?.data?.comments?.some((comment) => comment.id === pageComment.json.data.comment.id), `${pageComments.url} missing comment in data envelope`);
    assert(pageComments.json?.comments?.some((comment) => comment.id === pageComment.json.data.comment.id), `${pageComments.url} missing legacy comment list`);

    const siteComments = await request(`/api/sites/${createdSiteId}/comments?targetType=page&targetId=${createdPageId}&status=approved&requestId=contract-page-comment`);
    assert(siteComments.response.status === 200, `${siteComments.url} expected 200, got ${siteComments.response.status}`);
    assert(siteComments.json?.success === true, `${siteComments.url} expected success envelope`);
    assert(siteComments.json?.data?.comments?.some((comment) => comment.id === pageComment.json.data.comment.id), `${siteComments.url} missing site comment in data envelope`);
    assert(siteComments.json?.comments?.some((comment) => comment.id === pageComment.json.data.comment.id), `${siteComments.url} missing legacy site comment list`);

    const reportReasons = await request(`/api/sites/${createdSiteId}/comments/report-reasons`);
    assert(reportReasons.response.status === 200, `${reportReasons.url} expected 200, got ${reportReasons.response.status}`);
    assert(reportReasons.json?.success === true, `${reportReasons.url} expected success envelope`);
    assert(reportReasons.json?.data?.reasons?.includes('spam'), `${reportReasons.url} missing report reason in data envelope`);
    assert(reportReasons.json?.reasons?.includes('spam'), `${reportReasons.url} missing legacy report reasons`);

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

    const remove = await request(`/api/admin/sites/${createdSiteId}/pages/${createdPageId}`, { method: 'DELETE' });
    assert(remove.response.status === 200, `${remove.url} expected 200, got ${remove.response.status}`);
    assert(remove.json?.data?.deleted === true, `${remove.url} expected deleted true`);
    createdPageId = null;
  });

  await record('admin blog categories create/list/detail/update works for temporary site', async () => {
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
        content: {
          elements: [],
          canvasSize: { width: 900, height: 720 },
        },
      }),
    });
    assert(create.response.status === 201, `${create.url} expected 201, got ${create.response.status}`);
    assert(create.json?.data?.post?.slug === postSlug, `${create.url} returned wrong post slug`);
    createdPostId = create.json.data.post.id;

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

    const pastPostSchedule = new Date(Date.now() - 60 * 1000).toISOString();
    const pastScheduledPost = await request(`/api/admin/sites/${createdSiteId}/blog/${createdPostId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status: 'scheduled', scheduledAt: pastPostSchedule }),
    });
    assert(pastScheduledPost.response.status === 200, `${pastScheduledPost.url} expected 200, got ${pastScheduledPost.response.status}`);
    assert(pastScheduledPost.json?.data?.post?.scheduledAt === pastPostSchedule, `${pastScheduledPost.url} expected past schedule`);

    const visibleScheduledPost = await request(`/api/sites/${createdSiteId}/blog?slug=${postSlug}`);
    assert(visibleScheduledPost.response.status === 200, `${visibleScheduledPost.url} expected past scheduled post to be visible`);
    assert(visibleScheduledPost.json?.success === true, `${visibleScheduledPost.url} expected success envelope`);
    assert(visibleScheduledPost.json?.data?.post?.id === createdPostId, `${visibleScheduledPost.url} returned wrong scheduled post in data envelope`);
    assert(visibleScheduledPost.json?.post?.id === createdPostId, `${visibleScheduledPost.url} returned wrong scheduled post`);

    const visibleScheduledPostResolve = await request(`/api/sites/${createdSiteId}/resolve?path=/blog/${postSlug}`);
    assert(visibleScheduledPostResolve.response.status === 200, `${visibleScheduledPostResolve.url} expected past scheduled post route to be visible`);
    assert(visibleScheduledPostResolve.json?.data?.route?.type === 'post', `${visibleScheduledPostResolve.url} expected post route type`);
    assert(visibleScheduledPostResolve.json?.data?.route?.resource?.id === createdPostId, `${visibleScheduledPostResolve.url} returned wrong resolved post`);

    const visibleScheduledPostRender = await request(`/api/sites/${createdSiteId}/render?path=/blog/${postSlug}`);
    assert(visibleScheduledPostRender.response.status === 200, `${visibleScheduledPostRender.url} expected past scheduled post render to be visible`);
    validateAiRenderPayload(visibleScheduledPostRender.json, 'scheduled post render payload');
    assert(visibleScheduledPostRender.json?.data?.content?.kind === 'post', `${visibleScheduledPostRender.url} expected post render content`);
    assert(visibleScheduledPostRender.json?.data?.content?.id === createdPostId, `${visibleScheduledPostRender.url} returned wrong rendered post`);

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
    assert(
      renderedPost.json?.data?.interactions?.comments?.some((thread) => thread.targetType === 'post' && thread.targetId === createdPostId),
      `${renderedPost.url} missing post comment interaction`,
    );

    const publicCategories = await request(`/api/sites/${createdSiteId}/blog/categories`);
    assert(publicCategories.response.status === 200, `${publicCategories.url} expected 200, got ${publicCategories.response.status}`);
    assert(publicCategories.json?.success === true, `${publicCategories.url} expected success envelope`);
    assert(publicCategories.json?.data?.categories?.some((category) => category.id === createdCategoryId), `${publicCategories.url} missing public category in data envelope`);
    assert(publicCategories.json?.categories?.some((category) => category.id === createdCategoryId), `${publicCategories.url} missing public category`);

    const publicTags = await request(`/api/sites/${createdSiteId}/blog/tags`);
    assert(publicTags.response.status === 200, `${publicTags.url} expected 200, got ${publicTags.response.status}`);
    assert(publicTags.json?.success === true, `${publicTags.url} expected success envelope`);
    assert(publicTags.json?.data?.tags?.some((tag) => tag.id === createdTagId), `${publicTags.url} missing public tag in data envelope`);
    assert(publicTags.json?.tags?.some((tag) => tag.id === createdTagId), `${publicTags.url} missing public tag`);

    const publicCategoryFilter = await request(`/api/sites/${createdSiteId}/blog?categorySlug=${categorySlug}`);
    assert(publicCategoryFilter.response.status === 200, `${publicCategoryFilter.url} expected 200, got ${publicCategoryFilter.response.status}`);
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
    const createCollection = await request(`/api/admin/sites/${createdSiteId}/collections`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Admin Contract Collection',
        slug: collectionSlug,
        status: 'published',
        fields: [
          { key: 'title', label: 'Title', type: 'text', required: true, unique: true },
          { key: 'summary', label: 'Summary', type: 'richText' },
          { key: 'rank', label: 'Rank', type: 'number' },
          { key: 'category', label: 'Category', type: 'select', options: ['Featured', 'Standard'] },
          { key: 'labels', label: 'Labels', type: 'tags', options: ['Launch', 'Evergreen', 'Internal'] },
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
    assert(createCollection.json?.data?.collection?.fields?.some((field) => field.key === 'title' && field.required === true), `${createCollection.url} missing title field schema`);
    createdCollectionId = createCollection.json.data.collection.id;

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
    assert(publicCollections.json?.success === true, `${publicCollections.url} expected success envelope`);
    assert(publicCollections.json?.data?.collections?.some((collection) => collection.id === createdCollectionId), `${publicCollections.url} missing public collection in data envelope`);
    assert(publicCollections.json?.collections?.some((collection) => collection.id === createdCollectionId), `${publicCollections.url} missing public collection`);
    const publicCollectionSchema = publicCollections.json?.collections?.find((collection) => collection.id === createdCollectionId);
    assert(publicCollectionSchema?.fields?.some((field) => field.key === 'category' && field.type === 'select' && field.options?.includes('Featured')), `${publicCollections.url} missing select option schema`);
    assert(publicCollectionSchema?.fields?.some((field) => field.key === 'labels' && field.type === 'tags' && field.options?.includes('Evergreen')), `${publicCollections.url} missing tags option schema`);

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
      }),
    });
    assert(enablePublicCreate.response.status === 200, `${enablePublicCreate.url} expected 200, got ${enablePublicCreate.response.status}`);
    assert(enablePublicCreate.json?.data?.collection?.permissions?.publicCreate === true, `${enablePublicCreate.url} expected publicCreate true`);

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
    assert(publicCreateRecord.json?.success === true, `${publicCreateRecord.url} expected success envelope`);
    assert(publicCreateRecord.json?.data?.record?.status === 'draft', `${publicCreateRecord.url} expected public-created records to default to draft`);
    assert(publicCreateRecord.json?.data?.record?.values?.category === 'Standard', `${publicCreateRecord.url} expected validated option value`);

    const hiddenPublicCreatedRecord = await request(`/api/sites/${createdSiteId}/collections/${createdCollectionId}/records?slug=${publicCreatedRecordSlug}`);
    assert(hiddenPublicCreatedRecord.response.status === 404, `${hiddenPublicCreatedRecord.url} expected draft public-created record to stay hidden`);

    let formWritePageId = null;
    try {
      const createFormWritePage = await request(`/api/admin/sites/${createdSiteId}/pages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Collection Form Write Page',
          slug: `${pageSlug}-form-write`,
          status: 'published',
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

      const listedForms = await request(`/api/sites/${createdSiteId}/forms?pageId=${formWritePageId}`);
      assert(listedForms.response.status === 200, `${listedForms.url} expected 200, got ${listedForms.response.status}`);
      assert(listedForms.json?.success === true, `${listedForms.url} expected success envelope`);
      assert(listedForms.json?.data?.forms?.some((form) => form.id === 'contract-form-write'), `${listedForms.url} missing form in data envelope`);
      assert(listedForms.json?.forms?.some((form) => form.id === 'contract-form-write'), `${listedForms.url} missing legacy forms list`);

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
      assert(formWriteSubmission.json?.collectionRecord?.status === 'draft', `${formWriteSubmission.url} expected draft collection record`);
      assert(formWriteSubmission.json?.collectionRecord?.slug === 'form-write-record', `${formWriteSubmission.url} expected slug from title`);
      assert(formWriteSubmission.json?.collectionRecord?.values?.summary === 'Form submissions can become draft collection records.', `${formWriteSubmission.url} expected mapped summary value`);
      assert(formWriteSubmission.json?.collectionRecordErrors?.length === 0, `${formWriteSubmission.url} expected no collection record errors`);

      const formWrittenRecordSlug = formWriteSubmission.json.collectionRecord.slug;
      const hiddenFormWrittenRecord = await request(`/api/sites/${createdSiteId}/collections/${createdCollectionId}/records?slug=${formWrittenRecordSlug}`);
      assert(hiddenFormWrittenRecord.response.status === 404, `${hiddenFormWrittenRecord.url} expected draft form-written record to stay hidden`);

      const adminFormWrittenRecord = await request(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}/records?slug=${formWrittenRecordSlug}`);
      assert(adminFormWrittenRecord.response.status === 200, `${adminFormWrittenRecord.url} expected 200, got ${adminFormWrittenRecord.response.status}`);
      assert(adminFormWrittenRecord.json?.data?.records?.[0]?.status === 'draft', `${adminFormWrittenRecord.url} missing draft form-written record`);

      const listedFormWriteSubmissions = await request(`/api/sites/${createdSiteId}/forms/contract-form-write/submissions?status=approved&requestId=contract-form-write`);
      assert(listedFormWriteSubmissions.response.status === 200, `${listedFormWriteSubmissions.url} expected 200, got ${listedFormWriteSubmissions.response.status}`);
      const listedFormWriteSubmission = listedFormWriteSubmissions.json?.submissions?.data?.[0];
      assert(listedFormWriteSubmission?.collectionRecord?.collectionId === createdCollectionId, `${listedFormWriteSubmissions.url} missing linked collection id`);
      assert(listedFormWriteSubmission?.collectionRecord?.recordSlug === formWrittenRecordSlug, `${listedFormWriteSubmissions.url} missing linked collection record slug`);
      assert(listedFormWriteSubmission?.collectionRecordErrors?.length === 0, `${listedFormWriteSubmissions.url} expected no linked collection errors`);

      const frontendManifest = await request(`/api/sites/${createdSiteId}/manifest`);
      assert(frontendManifest.response.status === 200, `${frontendManifest.url} expected 200, got ${frontendManifest.response.status}`);
      validateAiFrontendManifest(frontendManifest.json, 'site frontend manifest');
      assert(frontendManifest.json?.data?.capabilities?.renderPayload === true, `${frontendManifest.url} missing render payload capability`);
      assert(frontendManifest.json?.data?.capabilities?.openApi === true, `${frontendManifest.url} missing OpenAPI capability`);
      assert(frontendManifest.json?.data?.capabilities?.collectionWriteForms === true, `${frontendManifest.url} missing collection write form capability`);
      assert(frontendManifest.json?.data?.contract?.schemas?.renderPayload?.includes('content-payload.schema.json'), `${frontendManifest.url} missing render schema reference`);
      assert(frontendManifest.json?.data?.endpoints?.openapi === `/api/sites/${createdSiteId}/openapi`, `${frontendManifest.url} missing OpenAPI endpoint`);
      assert(frontendManifest.json?.data?.modules?.collections?.some((collection) => collection.id === createdCollectionId && collection.dynamicRoutePattern === `/${collectionSlug}/:recordSlug`), `${frontendManifest.url} missing collection manifest`);
      assert(frontendManifest.json?.data?.modules?.forms?.some((form) => form.id === 'contract-form-write' && form.collectionTarget?.collectionId === createdCollectionId), `${frontendManifest.url} missing form collection target manifest`);
      assert(frontendManifest.json?.data?.routePatterns?.some((route) => route.type === 'dynamicCollectionItem'), `${frontendManifest.url} missing dynamic item route pattern`);

      const publicOpenApi = await request(`/api/sites/${createdSiteId}/openapi`);
      assert(publicOpenApi.response.status === 200, `${publicOpenApi.url} expected 200, got ${publicOpenApi.response.status}`);
      assert(publicOpenApi.json?.openapi === '3.1.0', `${publicOpenApi.url} expected OpenAPI 3.1 document`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/manifest`]?.get, `${publicOpenApi.url} missing manifest operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/render`]?.get, `${publicOpenApi.url} missing render operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/collections/{collectionId}/records`]?.post, `${publicOpenApi.url} missing public collection create operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/forms/{formId}/submissions`]?.post, `${publicOpenApi.url} missing form submission operation`);
      assert(publicOpenApi.json?.['x-backy']?.collectionIds?.includes(createdCollectionId), `${publicOpenApi.url} missing collection id vendor extension`);
      assert(publicOpenApi.json?.['x-backy']?.formIds?.includes('contract-form-write'), `${publicOpenApi.url} missing form id vendor extension`);
    } finally {
      if (formWritePageId) {
        await request(`/api/admin/sites/${createdSiteId}/pages/${formWritePageId}`, { method: 'DELETE' }).catch(() => {});
      }
    }

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
        },
      }),
    });
    assert(createRecord.response.status === 201, `${createRecord.url} expected 201, got ${createRecord.response.status}`);
    assert(createRecord.json?.data?.record?.slug === collectionRecordSlug, `${createRecord.url} returned wrong record slug`);
    assert(createRecord.json?.data?.record?.values?.rank === 1, `${createRecord.url} expected numeric rank`);
    createdCollectionRecordId = createRecord.json.data.record.id;

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

    const dynamicItemPath = `/${collectionSlug}/${collectionRecordSlug}`;
    const dynamicResolve = await request(`/api/sites/${createdSiteId}/resolve?path=${encodeURIComponent(dynamicItemPath)}`);
    assert(dynamicResolve.response.status === 200, `${dynamicResolve.url} expected 200, got ${dynamicResolve.response.status}`);
    assert(dynamicResolve.json?.data?.route?.type === 'dynamicItem', `${dynamicResolve.url} expected dynamic item route`);
    assert(dynamicResolve.json?.data?.route?.resource?.id === createdCollectionRecordId, `${dynamicResolve.url} returned wrong dynamic item record`);
    assert(dynamicResolve.json?.data?.route?.resource?.collectionId === createdCollectionId, `${dynamicResolve.url} returned wrong dynamic item collection`);

    const dynamicRender = await request(`/api/sites/${createdSiteId}/render?path=${encodeURIComponent(dynamicItemPath)}`);
    assert(dynamicRender.response.status === 200, `${dynamicRender.url} expected 200, got ${dynamicRender.response.status}`);
    validateAiRenderPayload(dynamicRender.json, 'collection dynamic item render payload');
    assert(dynamicRender.json?.data?.route?.type === 'dynamicItem', `${dynamicRender.url} expected dynamic item render route`);
    assert(dynamicRender.json?.data?.content?.kind === 'dynamicItem', `${dynamicRender.url} expected dynamic item content`);
    assert(dynamicRender.json?.data?.content?.id === createdCollectionRecordId, `${dynamicRender.url} returned wrong rendered collection record`);
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
      boundRender.json?.data?.dataBindings?.bindings?.some((binding) => (
        binding.id === 'bind_bound_title'
        && binding.elementId === 'bound_title'
        && binding.source?.collectionId === createdCollectionId
        && binding.source?.field === 'title'
      )),
      `${boundRender.url} missing collection binding manifest`,
    );
    assert(
      boundRender.json?.data?.content?.elements?.some((element) => (
        element.id === 'bound_title'
        && element.props?.content === 'Collection Record'
      )),
      `${boundRender.url} did not resolve bound collection value into element props`,
    );
    assert(
      boundRender.json?.data?.editableMap?.[`collection.${createdCollectionId}.bound_title.title`]?.scope === 'collectionRecord',
      `${boundRender.url} missing collection record editable map entry`,
    );

    const removeBoundPage = await request(`/api/admin/sites/${createdSiteId}/pages/${createdPageId}`, { method: 'DELETE' });
    assert(removeBoundPage.response.status === 200, `${removeBoundPage.url} expected 200, got ${removeBoundPage.response.status}`);
    createdPageId = null;

    const updateRecord = await request(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}/records/${createdCollectionRecordId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        values: {
          summary: 'Updated structured content',
          rank: 2,
        },
      }),
    });
    assert(updateRecord.response.status === 200, `${updateRecord.url} expected 200, got ${updateRecord.response.status}`);
    assert(updateRecord.json?.data?.record?.values?.summary === 'Updated structured content', `${updateRecord.url} expected updated summary`);
    assert(updateRecord.json?.data?.record?.values?.title === 'Collection Record', `${updateRecord.url} expected partial update to preserve title`);

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

    const removeRecord = await request(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}/records/${createdCollectionRecordId}`, { method: 'DELETE' });
    assert(removeRecord.response.status === 200, `${removeRecord.url} expected 200, got ${removeRecord.response.status}`);
    assert(removeRecord.json?.data?.deleted === true, `${removeRecord.url} expected deleted record`);
    createdCollectionRecordId = null;

    const removeCollection = await request(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}`, { method: 'DELETE' });
    assert(removeCollection.response.status === 200, `${removeCollection.url} expected 200, got ${removeCollection.response.status}`);
    assert(removeCollection.json?.data?.deleted === true, `${removeCollection.url} expected deleted collection`);
    createdCollectionId = null;
  });

  await record('admin sites delete removes temporary site', async () => {
    const { response, json, url } = await request(`/api/admin/sites/${createdSiteId}`, { method: 'DELETE' });
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

  const email = `admin-contract-${Date.now()}@backy.test`;
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
        status: 'active',
      }),
    });

    assert(update.response.status === 200, `${update.url} expected 200, got ${update.response.status}`);
    assert(update.json?.success === true, `${update.url} expected success envelope`);
    assert(update.json?.data?.user?.role === 'editor', `${update.url} expected editor role`);
    assert(update.json?.data?.user?.status === 'active', `${update.url} expected active status`);
  });

  await record('admin users delete removes temporary user', async () => {
    const { response, json, url } = await request(`/api/admin/users/${createdUserId}`, { method: 'DELETE' });
    assert(response.status === 200, `${url} expected 200, got ${response.status}`);
    assert(json?.success === true, `${url} expected success envelope`);
    assert(json?.data?.deleted === true, `${url} expected deleted true`);
    createdUserId = null;
  });

  await record('admin settings read returns delivery mode and keys', async () => {
    const { response, json, url } = await request('/api/admin/settings');
    assert(response.status === 200, `${url} expected 200, got ${response.status}`);
    assert(json?.success === true, `${url} expected success envelope`);
    assert(json?.data?.settings?.deliveryMode, `${url} missing deliveryMode`);
    assert(json?.data?.settings?.apiKeys?.publicApiKey, `${url} missing publicApiKey`);
    assert(json?.data?.settings?.apiKeys?.adminApiKey, `${url} missing adminApiKey`);
    originalDeliveryMode = json.data.settings.deliveryMode;
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
  });

  await record('admin settings regenerates API keys', async () => {
    const before = await request('/api/admin/settings');
    const oldPublicKey = before.json?.data?.settings?.apiKeys?.publicApiKey;
    const oldAdminKey = before.json?.data?.settings?.apiKeys?.adminApiKey;

    const { response, json, url } = await request('/api/admin/settings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action: 'regenerate-api-keys' }),
    });

    assert(response.status === 200, `${url} expected 200, got ${response.status}`);
    assert(json?.success === true, `${url} expected success envelope`);
    assert(json?.data?.settings?.apiKeys?.publicApiKey !== oldPublicKey, `${url} public key did not rotate`);
    assert(json?.data?.settings?.apiKeys?.adminApiKey !== oldAdminKey, `${url} admin key did not rotate`);
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
