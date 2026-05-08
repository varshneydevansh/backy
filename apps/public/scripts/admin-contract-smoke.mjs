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
let createdMediaFolderId = null;
let createdReusableSectionId = null;
let routeConflictCleanupPageId = null;
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

  if (createdSiteId && routeConflictCleanupPageId) {
    await request(`/api/admin/sites/${createdSiteId}/pages/${routeConflictCleanupPageId}`, { method: 'DELETE' }).catch(() => {});
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

  if (createdSiteId && createdReusableSectionId) {
    await request(`/api/admin/sites/${createdSiteId}/reusable-sections/${createdReusableSectionId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (createdSiteId && createdMediaFolderId) {
    await request(`/api/admin/sites/${createdSiteId}/media/folders/${createdMediaFolderId}`, { method: 'DELETE' }).catch(() => {});
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
  const customDomain = `${siteSlug}.example.test`;
  const pageSlug = `admin-contract-page-${unique}`;
  const postSlug = `admin-contract-post-${unique}`;
  const categorySlug = `admin-contract-category-${unique}`;
  const tagSlug = `admin-contract-tag-${unique}`;
  const collectionSlug = `admin-contract-collection-${unique}`;
  const collectionRecordSlug = `admin-contract-record-${unique}`;
  const boundPageSlug = `admin-contract-bound-page-${unique}`;
  const routeConflictPageSlug = `admin-contract-route-conflict-${unique}`;
  const adminDevOrigin = 'http://localhost:5173';

  await record('api cors allows local admin dev origin', async () => {
    const preflight = await request('/api/admin/sites', {
      method: 'OPTIONS',
      headers: {
        origin: adminDevOrigin,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'content-type,x-backy-admin-key',
      },
    });
    assert(preflight.response.status === 204, `${preflight.url} expected 204 preflight, got ${preflight.response.status}`);
    assert(preflight.response.headers.get('access-control-allow-origin') === adminDevOrigin, `${preflight.url} missing allowed origin`);
    assert(preflight.response.headers.get('access-control-allow-methods')?.includes('GET'), `${preflight.url} missing allowed methods`);
    assert(preflight.response.headers.get('access-control-allow-headers')?.toLowerCase().includes('x-backy-admin-key'), `${preflight.url} missing admin key header`);
    assert(preflight.response.headers.get('x-backy-request-id'), `${preflight.url} missing request id header`);

    const actual = await request('/api/admin/sites?includeUnpublished=true', {
      headers: {
        origin: adminDevOrigin,
      },
    });
    assert(actual.response.status === 200, `${actual.url} expected 200, got ${actual.response.status}`);
    assert(actual.response.headers.get('access-control-allow-origin') === adminDevOrigin, `${actual.url} missing CORS header`);
    assert(actual.response.headers.get('x-backy-request-id'), `${actual.url} missing request id header`);
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
    assert(draftManifest.response.headers.get('cache-control') === 'no-store', `${draftManifest.url} expected hidden manifest to be no-store`);

    const draftOpenApi = await request(`/api/sites/${createdSiteId}/openapi`);
    assert(draftOpenApi.response.status === 404, `${draftOpenApi.url} expected draft site OpenAPI to be hidden`);
    assert(draftOpenApi.json?.success === false, `${draftOpenApi.url} expected error envelope`);
    assert(draftOpenApi.response.headers.get('cache-control') === 'no-store', `${draftOpenApi.url} expected hidden OpenAPI to be no-store`);
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
        customDomain,
        status: 'published',
      }),
    });

    assert(update.response.status === 200, `${update.url} expected 200, got ${update.response.status}`);
    assert(update.json?.success === true, `${update.url} expected success envelope`);
    assert(update.json?.data?.site?.status === 'published', `${update.url} expected published status`);
    assert(update.json?.data?.site?.description === 'Updated contract smoke site', `${update.url} expected updated description`);
    assert(update.json?.data?.site?.customDomain === customDomain, `${update.url} expected updated custom domain`);

    const publicSiteBySlug = await request(`/api/sites?identifier=${siteSlug}`);
    assert(publicSiteBySlug.response.status === 200, `${publicSiteBySlug.url} expected 200, got ${publicSiteBySlug.response.status}`);
    assert(publicSiteBySlug.json?.success === true, `${publicSiteBySlug.url} expected success envelope`);
    assert(publicSiteBySlug.json?.data?.site?.id === createdSiteId, `${publicSiteBySlug.url} returned wrong site`);

    const publicSiteByDomain = await request(`/api/sites?identifier=${customDomain}`);
    assert(publicSiteByDomain.response.status === 200, `${publicSiteByDomain.url} expected 200, got ${publicSiteByDomain.response.status}`);
    assert(publicSiteByDomain.json?.data?.site?.id === createdSiteId, `${publicSiteByDomain.url} did not resolve custom domain`);

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
    formData.set('metadata', JSON.stringify({
      license: 'contract-smoke',
      source: 'admin-contract',
    }));

    const upload = await request(`/api/admin/sites/${createdSiteId}/media`, {
      method: 'POST',
      body: formData,
    });
    assert(upload.response.status === 201, `${upload.url} expected 201, got ${upload.response.status}`);
    assert(upload.json?.data?.media?.type === 'font', `${upload.url} expected font media type`);
    assert(upload.json?.data?.media?.metadata?.fontFamily === 'Contract Sans', `${upload.url} expected font family metadata`);
    assert(upload.json?.data?.media?.metadata?.extension === 'woff2', `${upload.url} expected preserved font extension metadata`);
    assert(upload.json?.data?.media?.metadata?.license === 'contract-smoke', `${upload.url} expected custom upload metadata`);
    assert(
      upload.json?.data?.media?.url?.startsWith(`/uploads/sites/${createdSiteId}/fonts/`),
      `${upload.url} expected storage-backed public font URL`,
    );
    const storedFont = await request(upload.json.data.media.url);
    assert(storedFont.response.status === 200, `${storedFont.url} expected uploaded font asset to be publicly readable`);
    assert(storedFont.text === 'contract-font', `${storedFont.url} returned unexpected uploaded font content`);
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
    assert(update.json?.data?.media?.metadata?.extension === 'woff2', `${update.url} lost extension metadata during font update`);
    assert(update.json?.data?.media?.metadata?.license === 'contract-smoke', `${update.url} lost custom upload metadata during font update`);

    const publicFonts = await request(`/api/sites/${createdSiteId}/media?type=font&search=${encodeURIComponent('Contract Sans')}&tag=font`);
    assert(publicFonts.response.status === 200, `${publicFonts.url} expected 200, got ${publicFonts.response.status}`);
    assert(publicFonts.json?.success === true, `${publicFonts.url} expected success envelope`);
    assert(publicFonts.json?.data?.media?.some((item) => (
      item.id === createdMediaId &&
      item.metadata?.fontFamily === 'Contract Sans Display' &&
      item.metadata?.extension === 'woff2' &&
      item.metadata?.license === 'contract-smoke'
    )), `${publicFonts.url} missing public font media in data envelope`);
    assert(publicFonts.json?.media?.some((item) => (
      item.id === createdMediaId &&
      item.metadata?.fontFamily === 'Contract Sans Display' &&
      item.metadata?.extension === 'woff2' &&
      item.metadata?.license === 'contract-smoke'
    )), `${publicFonts.url} missing public font media`);

    const publicFontDetail = await request(`/api/sites/${createdSiteId}/media/${createdMediaId}`);
    assert(publicFontDetail.response.status === 200, `${publicFontDetail.url} expected 200, got ${publicFontDetail.response.status}`);
    assert(publicFontDetail.json?.success === true, `${publicFontDetail.url} expected success envelope`);
    assert(publicFontDetail.json?.data?.media?.id === createdMediaId, `${publicFontDetail.url} missing media detail in data envelope`);
    assert(publicFontDetail.json?.media?.metadata?.fontFamily === 'Contract Sans Display', `${publicFontDetail.url} missing legacy media detail`);

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
    const hiddenPrivateFontDetail = await request(`/api/sites/${createdSiteId}/media/${createdMediaId}`);
    assert(hiddenPrivateFontDetail.response.status === 404, `${hiddenPrivateFontDetail.url} expected private media detail to be hidden`);

    const publicUpdate = await request(`/api/admin/sites/${createdSiteId}/media/${createdMediaId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ visibility: 'public' }),
    });
    assert(publicUpdate.response.status === 200, `${publicUpdate.url} expected 200, got ${publicUpdate.response.status}`);
  });

  await record('admin media folders create/list/update/delete and detach assets', async () => {
    const create = await request(`/api/admin/sites/${createdSiteId}/media/folders`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Contract Assets',
        sortOrder: 7,
      }),
    });
    assert(create.response.status === 201, `${create.url} expected 201, got ${create.response.status}`);
    assert(create.json?.success === true, `${create.url} expected success envelope`);
    assert(create.json?.data?.folder?.name === 'Contract Assets', `${create.url} expected created folder name`);
    createdMediaFolderId = create.json.data.folder.id;

    const list = await request(`/api/admin/sites/${createdSiteId}/media/folders`);
    assert(list.response.status === 200, `${list.url} expected 200, got ${list.response.status}`);
    assert(list.json?.data?.folders?.some((folder) => folder.id === createdMediaFolderId), `${list.url} missing created folder`);

    const assignMedia = await request(`/api/admin/sites/${createdSiteId}/media/${createdMediaId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        folderId: createdMediaFolderId,
      }),
    });
    assert(assignMedia.response.status === 200, `${assignMedia.url} expected 200, got ${assignMedia.response.status}`);
    assert(assignMedia.json?.data?.media?.folderId === createdMediaFolderId, `${assignMedia.url} did not assign media folder`);

    const folderMedia = await request(`/api/admin/sites/${createdSiteId}/media?folderId=${createdMediaFolderId}&type=font`);
    assert(folderMedia.response.status === 200, `${folderMedia.url} expected 200, got ${folderMedia.response.status}`);
    assert(folderMedia.json?.data?.media?.some((item) => item.id === createdMediaId), `${folderMedia.url} missing folder-scoped media`);

    const update = await request(`/api/admin/sites/${createdSiteId}/media/folders/${createdMediaFolderId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Contract Brand Assets',
        sortOrder: 11,
      }),
    });
    assert(update.response.status === 200, `${update.url} expected 200, got ${update.response.status}`);
    assert(update.json?.data?.folder?.name === 'Contract Brand Assets', `${update.url} did not update folder name`);
    assert(update.json?.data?.folder?.sortOrder === 11, `${update.url} did not update folder sort order`);

    const remove = await request(`/api/admin/sites/${createdSiteId}/media/folders/${createdMediaFolderId}`, { method: 'DELETE' });
    assert(remove.response.status === 200, `${remove.url} expected 200, got ${remove.response.status}`);
    assert(remove.json?.data?.deleted === true, `${remove.url} expected deleted true`);
    createdMediaFolderId = null;

    const detachedMedia = await request(`/api/admin/sites/${createdSiteId}/media?type=font`);
    assert(detachedMedia.response.status === 200, `${detachedMedia.url} expected 200, got ${detachedMedia.response.status}`);
    assert(detachedMedia.json?.data?.media?.some((item) => (
      item.id === createdMediaId && item.folderId === null
    )), `${detachedMedia.url} did not detach media from deleted folder`);
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
        meta: {
          title: 'Admin Contract Page',
          description: 'Admin contract page description.',
          jsonLd: [
            {
              '@context': 'https://schema.org',
              '@type': 'WebPage',
              name: 'Admin Contract Page',
            },
          ],
        },
        content: {
          elements: [
            {
              id: 'contract-page-heading',
              type: 'heading',
              x: 80,
              y: 96,
              width: 520,
              height: 72,
              zIndex: 1,
              props: {
                content: 'Contract page readiness',
                level: 'h1',
                fontSize: 42,
                fontWeight: '700',
              },
            },
          ],
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

    const pageReadiness = await request(`/api/admin/sites/${createdSiteId}/pages/${createdPageId}/readiness`);
    assert(pageReadiness.response.status === 200, `${pageReadiness.url} expected 200, got ${pageReadiness.response.status}`);
    assert(pageReadiness.json?.success === true, `${pageReadiness.url} expected success envelope`);
    assert(pageReadiness.json?.data?.readiness?.id === createdPageId, `${pageReadiness.url} returned wrong page readiness`);
    assert(pageReadiness.json?.data?.readiness?.elementCount === 1, `${pageReadiness.url} expected one canvas element`);
    assert(
      pageReadiness.json?.readiness?.checks?.some((check) => check.id === `page:${createdPageId}:canvas-size` && check.status === 'pass'),
      `${pageReadiness.url} missing legacy page readiness checks`,
    );

    const canonicalConflictPage = await request(`/api/admin/sites/${createdSiteId}/pages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Canonical Conflict Page',
        slug: `${pageSlug}-canonical-conflict`,
        status: 'draft',
        meta: {
          title: 'Canonical Conflict Page',
          description: 'Conflicts with the primary admin contract page.',
          canonical: `/${pageSlug}`,
        },
        content: {
          elements: [
            {
              id: 'canonical-conflict-heading',
              type: 'heading',
              x: 100,
              y: 100,
              width: 520,
              height: 80,
              zIndex: 1,
              props: { content: 'Canonical conflict' },
            },
          ],
          canvasSize: { width: 1200, height: 900 },
        },
      }),
    });
    assert(canonicalConflictPage.response.status === 201, `${canonicalConflictPage.url} expected 201, got ${canonicalConflictPage.response.status}`);
    const canonicalConflictPageId = canonicalConflictPage.json?.data?.page?.id;
    assert(canonicalConflictPageId, `${canonicalConflictPage.url} missing canonical conflict page id`);
    const canonicalConflictReadiness = await request(`/api/admin/sites/${createdSiteId}/readiness`);
    assert(canonicalConflictReadiness.response.status === 200, `${canonicalConflictReadiness.url} expected 200, got ${canonicalConflictReadiness.response.status}`);
    assert(canonicalConflictReadiness.json?.data?.readiness?.checks?.some((check) => (
      check.id === `page:${createdPageId}:canonical-conflict`
      && check.status === 'fail'
      && check.severity === 'error'
      && check.details?.canonical === `/${pageSlug}`
    )), `${canonicalConflictReadiness.url} missing canonical conflict readiness error`);
    await request(`/api/admin/sites/${createdSiteId}/pages/${canonicalConflictPageId}`, { method: 'DELETE' });

    const invalidPage = await request(`/api/admin/sites/${createdSiteId}/pages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Invalid Publish Page',
        slug: `${pageSlug}-invalid`,
        status: 'draft',
        content: {
          elements: [
            {
              id: 'invalid-heading',
              type: 'heading',
              x: -10,
              y: 10,
              width: 100,
              height: 40,
              zIndex: 1,
              props: { content: 'Invalid' },
            },
          ],
          canvasSize: { width: 200, height: 200 },
        },
      }),
    });
    assert(invalidPage.response.status === 201, `${invalidPage.url} expected 201, got ${invalidPage.response.status}`);
    const invalidPageId = invalidPage.json?.data?.page?.id;
    const blockedPublish = await request(`/api/admin/sites/${createdSiteId}/pages/${invalidPageId}/publish`, { method: 'POST' });
    assert(blockedPublish.response.status === 400, `${blockedPublish.url} expected readiness 400, got ${blockedPublish.response.status}`);
    assert(blockedPublish.json?.error?.code === 'READINESS_BLOCKED', `${blockedPublish.url} expected readiness error code`);
    assert(blockedPublish.json?.error?.details?.checks?.some((check) => check.severity === 'error'), `${blockedPublish.url} missing readiness error details`);
    await request(`/api/admin/sites/${createdSiteId}/pages/${invalidPageId}`, { method: 'DELETE' });

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
    assert(visibleScheduledPage.response.headers.get('x-backy-cache-scope') === 'discovery', `${visibleScheduledPage.url} missing discovery cache scope`);
    assert(visibleScheduledPage.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${visibleScheduledPage.url} missing contract version header`);
    assert(visibleScheduledPage.response.headers.get('x-backy-site-id') === createdSiteId, `${visibleScheduledPage.url} missing site id header`);
    assert(visibleScheduledPage.response.headers.get('x-backy-cache-revision'), `${visibleScheduledPage.url} missing page cache revision`);
    const visibleScheduledPageEtag = visibleScheduledPage.response.headers.get('etag');
    assert(visibleScheduledPageEtag?.startsWith('"backy-'), `${visibleScheduledPage.url} missing page etag`);
    const revalidatedVisibleScheduledPage = await request(`/api/sites/${createdSiteId}/pages?slug=${pageSlug}`, {
      headers: { 'if-none-match': visibleScheduledPageEtag },
    });
    assert(revalidatedVisibleScheduledPage.response.status === 304, `${revalidatedVisibleScheduledPage.url} expected page 304, got ${revalidatedVisibleScheduledPage.response.status}`);
    assert(revalidatedVisibleScheduledPage.response.headers.get('etag') === visibleScheduledPageEtag, `${revalidatedVisibleScheduledPage.url} expected matching page etag`);
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

    const invalidNavigation = await request(`/api/admin/sites/${createdSiteId}/navigation`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        primary: [
          {
            id: 'contract-nav-missing-page',
            type: 'page',
            pageId: 'missing-page-id',
            label: 'Missing page',
          },
        ],
      }),
    });
    assert(invalidNavigation.response.status === 400, `${invalidNavigation.url} expected invalid navigation 400`);
    assert(invalidNavigation.json?.error?.code === 'NAVIGATION_VALIDATION', `${invalidNavigation.url} expected NAVIGATION_VALIDATION`);

    const navigationSettings = await request(`/api/admin/sites/${createdSiteId}/navigation`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        primary: [
          {
            id: 'contract-nav-page',
            type: 'page',
            pageId: createdPageId,
            label: 'Contract Page',
            children: [
              {
                id: 'contract-nav-child',
                type: 'route',
                label: 'Child Route',
                path: `/${pageSlug}#details`,
              },
            ],
          },
          {
            id: 'contract-nav-docs',
            type: 'url',
            label: 'Docs',
            href: 'https://example.com/docs',
            target: '_blank',
          },
        ],
        footer: [
          {
            id: 'contract-footer-page',
            type: 'page',
            pageId: createdPageId,
            label: 'Footer Page',
          },
        ],
      }),
    });
    assert(navigationSettings.response.status === 200, `${navigationSettings.url} expected navigation settings update`);
    assert(navigationSettings.json?.data?.navigation?.settings?.primary?.some((item) => item.id === 'contract-nav-page'), `${navigationSettings.url} missing persisted navigation item`);
    assert(navigationSettings.json?.data?.navigation?.resolved?.primary?.some((item) => item.id === 'contract-nav-docs' && item.href === 'https://example.com/docs'), `${navigationSettings.url} missing resolved custom URL item`);

    const adminNavigation = await request(`/api/admin/sites/${createdSiteId}/navigation`);
    assert(adminNavigation.response.status === 200, `${adminNavigation.url} expected navigation read 200`);
    assert(adminNavigation.json?.data?.navigation?.settings?.primary?.some((item) => item.id === 'contract-nav-page'), `${adminNavigation.url} missing saved navigation item`);

    const publicNavigation = await request(`/api/sites/${createdSiteId}/navigation`);
    assert(publicNavigation.response.status === 200, `${publicNavigation.url} expected 200, got ${publicNavigation.response.status}`);
    assert(publicNavigation.response.headers.get('x-backy-cache-scope') === 'discovery', `${publicNavigation.url} missing navigation cache scope`);
    assert(publicNavigation.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${publicNavigation.url} missing navigation contract version`);
    assert(publicNavigation.response.headers.get('x-backy-site-id') === createdSiteId, `${publicNavigation.url} missing navigation site id header`);
    assert(publicNavigation.response.headers.get('x-backy-cache-revision'), `${publicNavigation.url} missing navigation cache revision`);
    const publicNavigationEtag = publicNavigation.response.headers.get('etag');
    assert(publicNavigationEtag?.startsWith('"backy-'), `${publicNavigation.url} missing navigation etag`);
    const revalidatedPublicNavigation = await request(`/api/sites/${createdSiteId}/navigation`, {
      headers: { 'if-none-match': publicNavigationEtag },
    });
    assert(revalidatedPublicNavigation.response.status === 304, `${revalidatedPublicNavigation.url} expected navigation 304, got ${revalidatedPublicNavigation.response.status}`);
    assert(revalidatedPublicNavigation.response.headers.get('etag') === publicNavigationEtag, `${revalidatedPublicNavigation.url} expected matching navigation etag`);
    assert(publicNavigation.json?.success === true, `${publicNavigation.url} expected success envelope`);
    assert(
      publicNavigation.json?.data?.navigation?.primary?.some((item) => (
        item.id === 'contract-nav-page'
        && item.pageId === createdPageId
        && item.path === `/${pageSlug}`
        && item.children?.some((child) => child.id === 'contract-nav-child' && child.path === `/${pageSlug}#details`)
      )),
      `${publicNavigation.url} missing configured nested page navigation item`,
    );
    assert(
      publicNavigation.json?.data?.navigation?.primary?.some((item) => (
        item.id === 'contract-nav-docs' && item.type === 'url' && item.href === 'https://example.com/docs' && item.target === '_blank'
      )),
      `${publicNavigation.url} missing custom URL navigation item`,
    );
    assert(
      publicNavigation.json?.data?.navigation?.footer?.some((item) => item.id === 'contract-footer-page' && item.pageId === createdPageId),
      `${publicNavigation.url} missing configured footer navigation item`,
    );

    const renderPayload = await request(`/api/sites/${createdSiteId}/render?path=/${pageSlug}`);
    assert(renderPayload.response.status === 200, `${renderPayload.url} expected 200, got ${renderPayload.response.status}`);
    assert(renderPayload.response.headers.get('cache-control')?.includes('max-age=30'), `${renderPayload.url} missing render cache header`);
    assert(renderPayload.response.headers.get('x-backy-cache-scope') === 'render', `${renderPayload.url} missing render cache scope`);
    assert(renderPayload.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${renderPayload.url} missing contract version header`);
    assert(renderPayload.response.headers.get('x-backy-schema-version') === 'backy.content-payload.v1', `${renderPayload.url} missing render schema version header`);
    assert(renderPayload.response.headers.get('x-backy-site-id') === createdSiteId, `${renderPayload.url} missing site id header`);
    const renderCacheRevision = renderPayload.response.headers.get('x-backy-cache-revision');
    assert(renderCacheRevision, `${renderPayload.url} missing render cache revision`);
    const renderEtag = renderPayload.response.headers.get('etag');
    assert(renderEtag?.startsWith('"backy-'), `${renderPayload.url} missing render etag`);
    const revalidatedRender = await request(`/api/sites/${createdSiteId}/render?path=/${pageSlug}`, {
      headers: { 'if-none-match': renderEtag },
    });
    assert(revalidatedRender.response.status === 304, `${revalidatedRender.url} expected render 304, got ${revalidatedRender.response.status}`);
    assert(revalidatedRender.response.headers.get('etag') === renderEtag, `${revalidatedRender.url} expected matching render etag`);
    assert(revalidatedRender.response.headers.get('x-backy-cache-revision') === renderCacheRevision, `${revalidatedRender.url} expected matching render cache revision`);
    validateAiRenderPayload(renderPayload.json, 'page render payload');
    assert(
      renderPayload.json?.data?.navigation?.primary?.some((item) => item.id === 'contract-nav-page' && item.pageId === createdPageId),
      `${renderPayload.url} missing configured render navigation manifest`,
    );
    assert(
      renderPayload.json?.data?.assets?.fonts?.some((font) => font.id === createdMediaId && font.family === 'Contract Sans Display'),
      `${renderPayload.url} missing uploaded font asset manifest`,
    );
    assert(
      renderPayload.json?.data?.seo?.jsonLd?.some((entry) => entry?.['@type'] === 'WebPage' && entry?.name === 'Admin Contract Page'),
      `${renderPayload.url} missing route JSON-LD in render SEO`,
    );

    const resolvedPage = await request(`/api/sites/${createdSiteId}/resolve?path=/${pageSlug}`);
    assert(resolvedPage.response.status === 200, `${resolvedPage.url} expected 200, got ${resolvedPage.response.status}`);
    assert(resolvedPage.response.headers.get('x-backy-cache-scope') === 'discovery', `${resolvedPage.url} missing resolve cache scope`);
    assert(resolvedPage.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${resolvedPage.url} missing resolve contract version`);
    assert(resolvedPage.response.headers.get('x-backy-site-id') === createdSiteId, `${resolvedPage.url} missing resolve site id header`);
    assert(resolvedPage.response.headers.get('x-backy-cache-revision'), `${resolvedPage.url} missing resolve cache revision`);
    const resolvedPageEtag = resolvedPage.response.headers.get('etag');
    assert(resolvedPageEtag?.startsWith('"backy-'), `${resolvedPage.url} missing resolve etag`);
    const revalidatedResolvedPage = await request(`/api/sites/${createdSiteId}/resolve?path=/${pageSlug}`, {
      headers: { 'if-none-match': resolvedPageEtag },
    });
    assert(revalidatedResolvedPage.response.status === 304, `${revalidatedResolvedPage.url} expected resolve 304, got ${revalidatedResolvedPage.response.status}`);
    assert(revalidatedResolvedPage.response.headers.get('etag') === resolvedPageEtag, `${revalidatedResolvedPage.url} expected matching resolve etag`);
    assert(resolvedPage.json?.success === true, `${resolvedPage.url} expected success envelope`);
    assert(resolvedPage.json?.data?.route?.type === 'page', `${resolvedPage.url} expected page route`);
    assert(resolvedPage.json?.data?.route?.resource?.id === createdPageId, `${resolvedPage.url} returned wrong resolved page`);

    const redirectSourcePath = `/old-${pageSlug}`;
    const goneSourcePath = `/retired-${pageSlug}`;
    const invalidRedirectSettings = await request(`/api/admin/sites/${createdSiteId}/redirects`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        redirectRules: [
          {
            id: 'contract-invalid-redirect',
            from: redirectSourcePath,
            to: redirectSourcePath,
            statusCode: 301,
            enabled: true,
          },
        ],
      }),
    });
    assert(invalidRedirectSettings.response.status === 400, `${invalidRedirectSettings.url} expected invalid redirect 400`);
    assert(invalidRedirectSettings.json?.error?.code === 'REDIRECT_VALIDATION', `${invalidRedirectSettings.url} expected REDIRECT_VALIDATION`);

    const redirectPreview = await request(`/api/admin/sites/${createdSiteId}/redirects`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        redirectRules: [
          {
            id: 'contract-redirect-preview-conflict',
            from: `/${pageSlug}`,
            to: '/missing-contract-target',
            statusCode: 302,
            enabled: true,
          },
        ],
      }),
    });
    assert(redirectPreview.response.status === 200, `${redirectPreview.url} expected redirect preview 200`);
    assert(redirectPreview.json?.data?.redirects?.persisted === false, `${redirectPreview.url} expected non-persisted preview`);
    assert(
      redirectPreview.json?.data?.redirects?.conflicts?.some((conflict) => (
        conflict.kind === 'source-route-conflict'
        && conflict.from === `/${pageSlug}`
        && conflict.route?.type === 'page'
      )),
      `${redirectPreview.url} missing redirect source route conflict preview`,
    );
    assert(
      redirectPreview.json?.data?.redirects?.conflicts?.some((conflict) => (
        conflict.kind === 'target-route-missing'
        && conflict.to === '/missing-contract-target'
      )),
      `${redirectPreview.url} missing redirect missing target preview`,
    );

    const redirectSettings = await request(`/api/admin/sites/${createdSiteId}/redirects`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        redirectRules: [
          {
            id: 'contract-redirect',
            from: redirectSourcePath,
            to: `/${pageSlug}`,
            statusCode: 301,
            enabled: true,
          },
          {
            id: 'contract-gone',
            from: goneSourcePath,
            statusCode: 410,
            enabled: true,
          },
        ],
      }),
    });
    assert(redirectSettings.response.status === 200, `${redirectSettings.url} expected redirect settings update`);
    assert(
      redirectSettings.json?.data?.redirects?.rules?.some((rule) => (
        rule.id === 'contract-redirect' && rule.from === redirectSourcePath && rule.to === `/${pageSlug}`
      )),
      `${redirectSettings.url} missing persisted redirect rule`,
    );
    assert(Array.isArray(redirectSettings.json?.data?.redirects?.conflicts), `${redirectSettings.url} missing redirect conflict preview array`);

    const adminRedirects = await request(`/api/admin/sites/${createdSiteId}/redirects`);
    assert(adminRedirects.response.status === 200, `${adminRedirects.url} expected redirects read 200`);
    assert(adminRedirects.json?.data?.redirects?.rules?.some((rule) => rule.id === 'contract-gone' && rule.statusCode === 410), `${adminRedirects.url} missing saved gone rule`);
    assert(Array.isArray(adminRedirects.json?.data?.redirects?.conflicts), `${adminRedirects.url} missing saved redirect conflict preview array`);

    const redirectedRoute = await request(`/api/sites/${createdSiteId}/resolve?path=${encodeURIComponent(redirectSourcePath)}`);
    assert(redirectedRoute.response.status === 200, `${redirectedRoute.url} expected redirect route resolve`);
    assert(redirectedRoute.response.headers.get('x-backy-cache-scope') === 'discovery', `${redirectedRoute.url} missing redirect resolve cache scope`);
    assert(redirectedRoute.response.headers.get('etag')?.startsWith('"backy-'), `${redirectedRoute.url} missing redirect resolve etag`);
    assert(redirectedRoute.json?.data?.route?.type === 'redirect', `${redirectedRoute.url} expected redirect route`);
    assert(redirectedRoute.json?.data?.route?.resource?.to === `/${pageSlug}`, `${redirectedRoute.url} returned wrong redirect target`);
    assert(redirectedRoute.json?.data?.route?.resource?.statusCode === 301, `${redirectedRoute.url} returned wrong redirect status code`);

    const goneRoute = await request(`/api/sites/${createdSiteId}/resolve?path=${encodeURIComponent(goneSourcePath)}`);
    assert(goneRoute.response.status === 410, `${goneRoute.url} expected 410 gone route`);
    assert(goneRoute.response.headers.get('x-backy-cache-scope') === 'discovery', `${goneRoute.url} missing gone resolve cache scope`);
    assert(goneRoute.json?.success === false, `${goneRoute.url} expected gone error envelope`);
    assert(goneRoute.json?.data?.route?.type === 'gone', `${goneRoute.url} expected gone route`);

    const readiness = await request(`/api/admin/sites/${createdSiteId}/readiness`);
    assert(readiness.response.status === 200, `${readiness.url} expected 200, got ${readiness.response.status}`);
    assert(readiness.json?.success === true, `${readiness.url} expected success envelope`);
    assert(readiness.json?.data?.readiness?.site?.id === createdSiteId, `${readiness.url} returned wrong site readiness`);
    assert(Number.isFinite(readiness.json?.data?.readiness?.score), `${readiness.url} missing readiness score`);
    assert(readiness.json?.data?.readiness?.summary?.pages >= 1, `${readiness.url} missing page summary count`);
    assert(readiness.json?.data?.readiness?.pages?.some((page) => (
      page.id === createdPageId &&
      page.elementCount > 0 &&
      page.checks?.some((check) => check.id === `page:${createdPageId}:canvas-size` && check.status === 'pass')
    )), `${readiness.url} missing created page readiness checks`);
    assert(
      readiness.json?.readiness?.checks?.some((check) => check.id === 'site:homepage'),
      `${readiness.url} missing legacy readiness checks`,
    );

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
    const pageCommentId = pageComment.json.data.comment.id;

    const pageComments = await request(`/api/sites/${createdSiteId}/pages/${createdPageId}/comments?status=approved&requestId=contract-page-comment`);
    assert(pageComments.response.status === 200, `${pageComments.url} expected 200, got ${pageComments.response.status}`);
    assert(pageComments.json?.success === true, `${pageComments.url} expected success envelope`);
    assert(pageComments.json?.data?.comments?.some((comment) => comment.id === pageCommentId), `${pageComments.url} missing comment in data envelope`);
    assert(pageComments.json?.comments?.some((comment) => comment.id === pageCommentId), `${pageComments.url} missing legacy comment list`);

    const pageCommentDetail = await request(`/api/sites/${createdSiteId}/pages/${createdPageId}/comments/${pageCommentId}`);
    assert(pageCommentDetail.response.status === 200, `${pageCommentDetail.url} expected 200, got ${pageCommentDetail.response.status}`);
    assert(pageCommentDetail.json?.success === true, `${pageCommentDetail.url} expected success envelope`);
    assert(pageCommentDetail.json?.data?.comment?.id === pageCommentId, `${pageCommentDetail.url} missing comment in data envelope`);
    assert(pageCommentDetail.json?.comment?.id === pageCommentId, `${pageCommentDetail.url} missing legacy comment`);

    const pageCommentReview = await request(`/api/sites/${createdSiteId}/pages/${createdPageId}/comments/${pageCommentId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        status: 'approved',
        reviewedBy: 'contract-smoke',
        requestId: 'contract-page-comment-review',
      }),
    });
    assert(pageCommentReview.response.status === 200, `${pageCommentReview.url} expected 200, got ${pageCommentReview.response.status}`);
    assert(pageCommentReview.json?.success === true, `${pageCommentReview.url} expected success envelope`);
    assert(pageCommentReview.json?.requestId === 'contract-page-comment-review', `${pageCommentReview.url} expected request id`);
    assert(pageCommentReview.json?.data?.comment?.id === pageCommentId, `${pageCommentReview.url} missing reviewed comment in data envelope`);

    const siteComments = await request(`/api/sites/${createdSiteId}/comments?targetType=page&targetId=${createdPageId}&status=approved&requestId=contract-page-comment`);
    assert(siteComments.response.status === 200, `${siteComments.url} expected 200, got ${siteComments.response.status}`);
    assert(siteComments.json?.success === true, `${siteComments.url} expected success envelope`);
    assert(siteComments.json?.data?.comments?.some((comment) => comment.id === pageCommentId), `${siteComments.url} missing site comment in data envelope`);
    assert(siteComments.json?.comments?.some((comment) => comment.id === pageCommentId), `${siteComments.url} missing legacy site comment list`);

    const siteCommentDetail = await request(`/api/sites/${createdSiteId}/comments/${pageCommentId}`);
    assert(siteCommentDetail.response.status === 200, `${siteCommentDetail.url} expected 200, got ${siteCommentDetail.response.status}`);
    assert(siteCommentDetail.json?.success === true, `${siteCommentDetail.url} expected success envelope`);
    assert(siteCommentDetail.json?.data?.comment?.id === pageCommentId, `${siteCommentDetail.url} missing site comment in data envelope`);
    assert(siteCommentDetail.json?.comment?.id === pageCommentId, `${siteCommentDetail.url} missing legacy site comment`);

    const siteCommentReview = await request(`/api/sites/${createdSiteId}/comments/${pageCommentId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        status: 'approved',
        reviewedBy: 'contract-smoke',
        requestId: 'contract-site-comment-review',
      }),
    });
    assert(siteCommentReview.response.status === 200, `${siteCommentReview.url} expected 200, got ${siteCommentReview.response.status}`);
    assert(siteCommentReview.json?.success === true, `${siteCommentReview.url} expected success envelope`);
    assert(siteCommentReview.json?.data?.comment?.id === pageCommentId, `${siteCommentReview.url} missing reviewed site comment in data envelope`);

    const reportReasons = await request(`/api/sites/${createdSiteId}/comments/report-reasons`);
    assert(reportReasons.response.status === 200, `${reportReasons.url} expected 200, got ${reportReasons.response.status}`);
    assert(reportReasons.json?.success === true, `${reportReasons.url} expected success envelope`);
    assert(reportReasons.json?.data?.reasons?.includes('spam'), `${reportReasons.url} missing report reason in data envelope`);
    assert(reportReasons.json?.reasons?.includes('spam'), `${reportReasons.url} missing legacy report reasons`);

    const commentReportReasons = await request(`/api/sites/${createdSiteId}/comments/${pageCommentId}/report`);
    assert(commentReportReasons.response.status === 200, `${commentReportReasons.url} expected 200, got ${commentReportReasons.response.status}`);
    assert(commentReportReasons.json?.success === true, `${commentReportReasons.url} expected success envelope`);
    assert(commentReportReasons.json?.data?.reasons?.includes('spam'), `${commentReportReasons.url} missing report reason in data envelope`);
    assert(commentReportReasons.json?.reasons?.includes('spam'), `${commentReportReasons.url} missing legacy report reasons`);

    const reportedComment = await request(`/api/sites/${createdSiteId}/comments/${pageCommentId}/report`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        reason: 'spam',
        actor: 'contract-smoke',
        requestId: 'contract-page-comment-report',
      }),
    });
    assert(reportedComment.response.status === 201, `${reportedComment.url} expected 201, got ${reportedComment.response.status}`);
    assert(reportedComment.json?.success === true, `${reportedComment.url} expected success envelope`);
    assert(reportedComment.json?.requestId === 'contract-page-comment-report', `${reportedComment.url} expected request id`);
    assert(reportedComment.json?.data?.comment?.id === pageCommentId, `${reportedComment.url} missing reported comment in data envelope`);
    assert(reportedComment.json?.comment?.id === pageCommentId, `${reportedComment.url} missing legacy reported comment`);

    const commentReportEvents = await request(`/api/sites/${createdSiteId}/events?kind=comment-reported&requestId=contract-page-comment-report`);
    assert(commentReportEvents.response.status === 200, `${commentReportEvents.url} expected 200, got ${commentReportEvents.response.status}`);
    assert(commentReportEvents.json?.success === true, `${commentReportEvents.url} expected success envelope`);
    assert(commentReportEvents.json?.data?.events?.some((event) => event.commentId === pageCommentId), `${commentReportEvents.url} missing comment report event in data envelope`);
    assert(commentReportEvents.json?.events?.some((event) => event.commentId === pageCommentId), `${commentReportEvents.url} missing legacy comment report event`);

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

  await record('admin reusable sections create/list/detail/update/delete works for temporary site', async () => {
    const create = await request(`/api/admin/sites/${createdSiteId}/reusable-sections`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Admin Contract Hero Section',
        slug: `admin-contract-hero-${unique}`,
        description: 'Temporary reusable section contract smoke',
        category: 'layout',
        tags: ['hero', 'contract'],
        sourceElementId: 'contract-source-element',
        content: {
          canvasSize: { width: 1200, height: 420 },
          elements: [
            {
              id: 'contract-section-root',
              type: 'section',
              x: 0,
              y: 0,
              width: 1200,
              height: 420,
              zIndex: 1,
              props: {
                backgroundColor: '#0f172a',
              },
              children: [
                {
                  id: 'contract-section-heading',
                  type: 'heading',
                  x: 72,
                  y: 80,
                  width: 620,
                  height: 88,
                  zIndex: 1,
                  props: {
                    content: 'Reusable section smoke',
                    level: 'h2',
                    fontSize: 42,
                    color: '#ffffff',
                  },
                },
              ],
            },
          ],
        },
        createdBy: 'contract-smoke',
      }),
    });
    assert(create.response.status === 201, `${create.url} expected 201, got ${create.response.status}`);
    assert(create.json?.success === true, `${create.url} expected success envelope`);
    assert(create.json?.data?.section?.slug === `admin-contract-hero-${unique}`, `${create.url} returned wrong section slug`);
    assert(create.json?.data?.section?.content?.elements?.[0]?.children?.[0]?.id === 'contract-section-heading', `${create.url} did not preserve nested section content`);
    createdReusableSectionId = create.json.data.section.id;

    const duplicate = await request(`/api/admin/sites/${createdSiteId}/reusable-sections`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Duplicate reusable section',
        slug: `admin-contract-hero-${unique}`,
        content: {
          elements: [{ id: 'duplicate-root', type: 'section', x: 0, y: 0, width: 100, height: 100, zIndex: 1, props: {} }],
        },
      }),
    });
    assert(duplicate.response.status === 409, `${duplicate.url} expected 409, got ${duplicate.response.status}`);
    assert(duplicate.json?.error?.code === 'SLUG_CONFLICT', `${duplicate.url} expected SLUG_CONFLICT`);

    const invalid = await request(`/api/admin/sites/${createdSiteId}/reusable-sections`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Invalid reusable section',
        slug: `invalid-section-${unique}`,
        content: { elements: [] },
      }),
    });
    assert(invalid.response.status === 400, `${invalid.url} expected 400, got ${invalid.response.status}`);
    assert(invalid.json?.error?.code === 'VALIDATION_ERROR', `${invalid.url} expected validation error`);

    const list = await request(`/api/admin/sites/${createdSiteId}/reusable-sections?tag=hero&category=layout&search=contract`);
    assert(list.response.status === 200, `${list.url} expected 200, got ${list.response.status}`);
    assert(list.json?.data?.sections?.some((section) => section.id === createdReusableSectionId), `${list.url} missing created reusable section`);

    const detail = await request(`/api/admin/sites/${createdSiteId}/reusable-sections/${createdReusableSectionId}`);
    assert(detail.response.status === 200, `${detail.url} expected 200, got ${detail.response.status}`);
    assert(detail.json?.data?.section?.content?.canvasSize?.width === 1200, `${detail.url} did not preserve canvas size`);

    const invalidUpdate = await request(`/api/admin/sites/${createdSiteId}/reusable-sections/${createdReusableSectionId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        content: { elements: [] },
      }),
    });
    assert(invalidUpdate.response.status === 400, `${invalidUpdate.url} expected 400, got ${invalidUpdate.response.status}`);
    assert(invalidUpdate.json?.error?.code === 'VALIDATION_ERROR', `${invalidUpdate.url} expected validation error for empty content update`);

    const update = await request(`/api/admin/sites/${createdSiteId}/reusable-sections/${createdReusableSectionId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Updated Contract Hero Section',
        tags: ['hero', 'updated'],
        status: 'archived',
        updatedBy: 'contract-smoke',
      }),
    });
    assert(update.response.status === 200, `${update.url} expected 200, got ${update.response.status}`);
    assert(update.json?.data?.section?.name === 'Updated Contract Hero Section', `${update.url} did not update section name`);
    assert(update.json?.data?.section?.tags?.includes('updated'), `${update.url} did not update section tags`);
    assert(update.json?.data?.section?.status === 'archived', `${update.url} did not archive section`);

    const activeList = await request(`/api/admin/sites/${createdSiteId}/reusable-sections`);
    assert(!activeList.json?.data?.sections?.some((section) => section.id === createdReusableSectionId), `${activeList.url} included archived section in active default list`);

    const allList = await request(`/api/admin/sites/${createdSiteId}/reusable-sections?status=all`);
    assert(allList.json?.data?.sections?.some((section) => section.id === createdReusableSectionId), `${allList.url} missing archived section when status=all`);

    const remove = await request(`/api/admin/sites/${createdSiteId}/reusable-sections/${createdReusableSectionId}`, { method: 'DELETE' });
    assert(remove.response.status === 200, `${remove.url} expected 200, got ${remove.response.status}`);
    assert(remove.json?.data?.deleted === true, `${remove.url} expected deleted true`);
    createdReusableSectionId = null;
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
    assert(publicAuthors.response.headers.get('x-backy-cache-scope') === 'discovery', `${publicAuthors.url} missing public authors cache scope`);
    assert(publicAuthors.response.headers.get('etag')?.startsWith('"backy-'), `${publicAuthors.url} missing public authors etag`);
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

    const readiness = await request(`/api/admin/sites/${createdSiteId}/blog/${createdPostId}/readiness`);
    assert(readiness.response.status === 200, `${readiness.url} expected 200, got ${readiness.response.status}`);
    assert(readiness.json?.success === true, `${readiness.url} expected success envelope`);
    assert(readiness.json?.data?.readiness?.id === createdPostId, `${readiness.url} returned wrong post readiness`);
    assert(
      readiness.json?.data?.readiness?.checks?.some((check) => check.id === `post:${createdPostId}:title`),
      `${readiness.url} missing post title readiness check`,
    );

    const invalidPost = await request(`/api/admin/sites/${createdSiteId}/blog`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Blocked Admin Contract Post',
        slug: `${postSlug}-blocked`,
        excerpt: 'Temporary invalid post',
        status: 'draft',
        content: {
          canvasSize: { width: 200, height: 200 },
          elements: [
            {
              id: `el-invalid-post-${unique}`,
              type: 'text',
              x: -12,
              y: 20,
              width: 180,
              height: 60,
              rotation: 0,
              opacity: 1,
              locked: false,
              visible: true,
              props: {
                content: 'Invalid post element',
              },
            },
          ],
        },
      }),
    });
    assert(invalidPost.response.status === 201, `${invalidPost.url} expected 201, got ${invalidPost.response.status}`);
    const invalidPostId = invalidPost.json?.data?.post?.id;
    assert(invalidPostId, `${invalidPost.url} missing invalid post id`);

    const blockedPublish = await request(`/api/admin/sites/${createdSiteId}/blog/${invalidPostId}/publish`, {
      method: 'POST',
    });
    assert(blockedPublish.response.status === 400, `${blockedPublish.url} expected 400, got ${blockedPublish.response.status}`);
    assert(blockedPublish.json?.error?.code === 'READINESS_BLOCKED', `${blockedPublish.url} expected READINESS_BLOCKED`);
    assert(
      blockedPublish.json?.error?.details?.checks?.some((check) => check.severity === 'error'),
      `${blockedPublish.url} missing blocking readiness checks`,
    );
    await request(`/api/admin/sites/${createdSiteId}/blog/${invalidPostId}`, { method: 'DELETE' });

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
    assert(visibleScheduledPost.response.headers.get('x-backy-cache-scope') === 'discovery', `${visibleScheduledPost.url} missing discovery cache scope`);
    assert(visibleScheduledPost.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${visibleScheduledPost.url} missing contract version header`);
    assert(visibleScheduledPost.response.headers.get('x-backy-site-id') === createdSiteId, `${visibleScheduledPost.url} missing site id header`);
    assert(visibleScheduledPost.response.headers.get('x-backy-cache-revision'), `${visibleScheduledPost.url} missing post cache revision`);
    const visibleScheduledPostEtag = visibleScheduledPost.response.headers.get('etag');
    assert(visibleScheduledPostEtag?.startsWith('"backy-'), `${visibleScheduledPost.url} missing post etag`);
    const revalidatedVisibleScheduledPost = await request(`/api/sites/${createdSiteId}/blog?slug=${postSlug}`, {
      headers: { 'if-none-match': visibleScheduledPostEtag },
    });
    assert(revalidatedVisibleScheduledPost.response.status === 304, `${revalidatedVisibleScheduledPost.url} expected post 304, got ${revalidatedVisibleScheduledPost.response.status}`);
    assert(revalidatedVisibleScheduledPost.response.headers.get('etag') === visibleScheduledPostEtag, `${revalidatedVisibleScheduledPost.url} expected matching post etag`);
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
    assert(publicCategories.response.headers.get('x-backy-cache-scope') === 'discovery', `${publicCategories.url} missing public categories cache scope`);
    assert(publicCategories.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${publicCategories.url} missing public categories contract version`);
    assert(publicCategories.response.headers.get('x-backy-site-id') === createdSiteId, `${publicCategories.url} missing public categories site id header`);
    assert(publicCategories.response.headers.get('x-backy-cache-revision'), `${publicCategories.url} missing public categories cache revision`);
    const publicCategoriesEtag = publicCategories.response.headers.get('etag');
    assert(publicCategoriesEtag?.startsWith('"backy-'), `${publicCategories.url} missing public categories etag`);
    const revalidatedPublicCategories = await request(`/api/sites/${createdSiteId}/blog/categories`, {
      headers: { 'if-none-match': publicCategoriesEtag },
    });
    assert(revalidatedPublicCategories.response.status === 304, `${revalidatedPublicCategories.url} expected categories 304, got ${revalidatedPublicCategories.response.status}`);
    assert(revalidatedPublicCategories.response.headers.get('etag') === publicCategoriesEtag, `${revalidatedPublicCategories.url} expected matching categories etag`);
    assert(publicCategories.json?.success === true, `${publicCategories.url} expected success envelope`);
    assert(publicCategories.json?.data?.categories?.some((category) => category.id === createdCategoryId), `${publicCategories.url} missing public category in data envelope`);
    assert(publicCategories.json?.categories?.some((category) => category.id === createdCategoryId), `${publicCategories.url} missing public category`);

    const publicTags = await request(`/api/sites/${createdSiteId}/blog/tags`);
    assert(publicTags.response.status === 200, `${publicTags.url} expected 200, got ${publicTags.response.status}`);
    assert(publicTags.response.headers.get('x-backy-cache-scope') === 'discovery', `${publicTags.url} missing public tags cache scope`);
    assert(publicTags.response.headers.get('etag')?.startsWith('"backy-'), `${publicTags.url} missing public tags etag`);
    assert(publicTags.json?.success === true, `${publicTags.url} expected success envelope`);
    assert(publicTags.json?.data?.tags?.some((tag) => tag.id === createdTagId), `${publicTags.url} missing public tag in data envelope`);
    assert(publicTags.json?.tags?.some((tag) => tag.id === createdTagId), `${publicTags.url} missing public tag`);

    const publicCategoryFilter = await request(`/api/sites/${createdSiteId}/blog?categorySlug=${categorySlug}`);
    assert(publicCategoryFilter.response.status === 200, `${publicCategoryFilter.url} expected 200, got ${publicCategoryFilter.response.status}`);
    assert(publicCategoryFilter.response.headers.get('x-backy-cache-scope') === 'discovery', `${publicCategoryFilter.url} missing discovery cache scope`);
    assert(publicCategoryFilter.response.headers.get('etag')?.startsWith('"backy-'), `${publicCategoryFilter.url} missing filtered posts etag`);
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
        listRoutePattern: `/directory`,
        routePattern: `/directory/:recordSlug`,
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
    assert(createCollection.json?.data?.collection?.listRoutePattern === '/directory', `${createCollection.url} returned wrong collection list route pattern`);
    assert(createCollection.json?.data?.collection?.routePattern === '/directory/:recordSlug', `${createCollection.url} returned wrong collection route pattern`);
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
    assert(publicCollections.response.headers.get('x-backy-cache-scope') === 'discovery', `${publicCollections.url} missing discovery cache scope`);
    assert(publicCollections.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${publicCollections.url} missing contract version header`);
    assert(publicCollections.response.headers.get('x-backy-site-id') === createdSiteId, `${publicCollections.url} missing site id header`);
    const publicCollectionsCacheRevision = publicCollections.response.headers.get('x-backy-cache-revision');
    assert(publicCollectionsCacheRevision, `${publicCollections.url} missing collection cache revision`);
    const publicCollectionsEtag = publicCollections.response.headers.get('etag');
    assert(publicCollectionsEtag?.startsWith('"backy-'), `${publicCollections.url} missing collection etag`);
    const revalidatedPublicCollections = await request(`/api/sites/${createdSiteId}/collections`, {
      headers: { 'if-none-match': publicCollectionsEtag },
    });
    assert(revalidatedPublicCollections.response.status === 304, `${revalidatedPublicCollections.url} expected collection 304, got ${revalidatedPublicCollections.response.status}`);
    assert(revalidatedPublicCollections.response.headers.get('etag') === publicCollectionsEtag, `${revalidatedPublicCollections.url} expected matching collection etag`);
    assert(revalidatedPublicCollections.response.headers.get('x-backy-cache-revision') === publicCollectionsCacheRevision, `${revalidatedPublicCollections.url} expected matching collection cache revision`);
    assert(publicCollections.json?.success === true, `${publicCollections.url} expected success envelope`);
    assert(publicCollections.json?.data?.collections?.some((collection) => collection.id === createdCollectionId), `${publicCollections.url} missing public collection in data envelope`);
    assert(publicCollections.json?.collections?.some((collection) => collection.id === createdCollectionId), `${publicCollections.url} missing public collection`);
    const publicCollectionSchema = publicCollections.json?.collections?.find((collection) => collection.id === createdCollectionId);
    assert(publicCollectionSchema?.listRoutePattern === '/directory', `${publicCollections.url} missing collection list route pattern`);
    assert(publicCollectionSchema?.routePattern === '/directory/:recordSlug', `${publicCollections.url} missing collection route pattern`);
    assert(publicCollectionSchema?.fields?.some((field) => field.key === 'category' && field.type === 'select' && field.options?.includes('Featured')), `${publicCollections.url} missing select option schema`);
    assert(publicCollectionSchema?.fields?.some((field) => field.key === 'labels' && field.type === 'tags' && field.options?.includes('Evergreen')), `${publicCollections.url} missing tags option schema`);

    const publicCollectionDetail = await request(`/api/sites/${createdSiteId}/collections/${createdCollectionId}`);
    assert(publicCollectionDetail.response.status === 200, `${publicCollectionDetail.url} expected 200, got ${publicCollectionDetail.response.status}`);
    assert(publicCollectionDetail.response.headers.get('x-backy-cache-scope') === 'discovery', `${publicCollectionDetail.url} missing discovery cache scope`);
    assert(publicCollectionDetail.response.headers.get('x-backy-cache-revision'), `${publicCollectionDetail.url} missing collection detail cache revision`);
    assert(publicCollectionDetail.response.headers.get('etag')?.startsWith('"backy-'), `${publicCollectionDetail.url} missing collection detail etag`);
    assert(publicCollectionDetail.json?.data?.collection?.id === createdCollectionId, `${publicCollectionDetail.url} returned wrong public collection detail`);

    const conflictingPage = await request(`/api/admin/sites/${createdSiteId}/pages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Route Conflict Page',
        slug: routeConflictPageSlug,
        status: 'published',
        content: { canvasSize: { width: 1200, height: 720 }, elements: [] },
      }),
    });
    assert(conflictingPage.response.status === 201, `${conflictingPage.url} expected 201, got ${conflictingPage.response.status}`);
    const routeConflictPageId = conflictingPage.json.data.page.id;
    routeConflictCleanupPageId = routeConflictPageId;

    const blockedCollectionRoute = await request(`/api/admin/sites/${createdSiteId}/collections`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Route Conflict Collection',
        slug: `route-conflict-collection-${unique}`,
        listRoutePattern: `/${routeConflictPageSlug}`,
        routePattern: `/${routeConflictPageSlug}/:recordSlug`,
        status: 'published',
        fields: [{ key: 'title', label: 'Title', type: 'text' }],
      }),
    });
    assert(blockedCollectionRoute.response.status === 409, `${blockedCollectionRoute.url} expected route conflict 409`);
    assert(blockedCollectionRoute.json?.error?.code === 'ROUTE_CONFLICT', `${blockedCollectionRoute.url} expected ROUTE_CONFLICT`);

    const removeRouteConflictPage = await request(`/api/admin/sites/${createdSiteId}/pages/${routeConflictPageId}`, { method: 'DELETE' });
    assert(removeRouteConflictPage.response.status === 200, `${removeRouteConflictPage.url} expected 200, got ${removeRouteConflictPage.response.status}`);
    routeConflictCleanupPageId = null;

    const blockedPageRoute = await request(`/api/admin/sites/${createdSiteId}/pages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Directory Conflict Page',
        slug: 'directory',
        status: 'published',
        content: { canvasSize: { width: 1200, height: 720 }, elements: [] },
      }),
    });
    assert(blockedPageRoute.response.status === 409, `${blockedPageRoute.url} expected route conflict 409`);
    assert(blockedPageRoute.json?.error?.code === 'ROUTE_CONFLICT', `${blockedPageRoute.url} expected ROUTE_CONFLICT`);

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
    let manifestReusableSectionId = null;
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
          meta: {
            title: 'Collection Form Write Page',
            description: 'Public collection write form page.',
            jsonLd: [
              {
                '@context': 'https://schema.org',
                '@type': 'WebPage',
                name: 'Collection Form Write Page',
              },
            ],
          },
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
      assert(listedForms.response.headers.get('x-backy-cache-scope') === 'discovery', `${listedForms.url} missing forms cache scope`);
      assert(listedForms.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${listedForms.url} missing forms contract version`);
      assert(listedForms.response.headers.get('x-backy-site-id') === createdSiteId, `${listedForms.url} missing forms site id header`);
      assert(listedForms.response.headers.get('x-backy-cache-revision'), `${listedForms.url} missing forms cache revision`);
      const listedFormsEtag = listedForms.response.headers.get('etag');
      assert(listedFormsEtag?.startsWith('"backy-'), `${listedForms.url} missing forms etag`);
      const revalidatedListedForms = await request(`/api/sites/${createdSiteId}/forms?pageId=${formWritePageId}`, {
        headers: { 'if-none-match': listedFormsEtag },
      });
      assert(revalidatedListedForms.response.status === 304, `${revalidatedListedForms.url} expected forms 304, got ${revalidatedListedForms.response.status}`);
      assert(revalidatedListedForms.response.headers.get('etag') === listedFormsEtag, `${revalidatedListedForms.url} expected matching forms etag`);
      assert(listedForms.json?.success === true, `${listedForms.url} expected success envelope`);
      assert(listedForms.json?.data?.forms?.some((form) => form.id === 'contract-form-write'), `${listedForms.url} missing form in data envelope`);
      assert(listedForms.json?.forms?.some((form) => form.id === 'contract-form-write'), `${listedForms.url} missing legacy forms list`);

      const formDetailBeforeSubmission = await request(`/api/sites/${createdSiteId}/forms/contract-form-write`);
      assert(formDetailBeforeSubmission.response.status === 200, `${formDetailBeforeSubmission.url} expected 200, got ${formDetailBeforeSubmission.response.status}`);
      assert(formDetailBeforeSubmission.response.headers.get('x-backy-cache-scope') === 'private', `${formDetailBeforeSubmission.url} expected private form detail cache scope`);
      assert(formDetailBeforeSubmission.response.headers.get('cache-control') === 'no-store', `${formDetailBeforeSubmission.url} expected no-store form detail cache`);
      assert(formDetailBeforeSubmission.json?.success === true, `${formDetailBeforeSubmission.url} expected success envelope`);
      assert(formDetailBeforeSubmission.json?.data?.form?.id === 'contract-form-write', `${formDetailBeforeSubmission.url} missing form in data envelope`);
      assert(formDetailBeforeSubmission.json?.form?.id === 'contract-form-write', `${formDetailBeforeSubmission.url} missing legacy form`);

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
          contactShareOverride: {
            enabled: true,
            nameField: 'title',
            notesField: 'message',
          },
        }),
      });
      assert(formWriteSubmission.response.status === 201, `${formWriteSubmission.url} expected 201, got ${formWriteSubmission.response.status}`);
      assert(formWriteSubmission.json?.success === true, `${formWriteSubmission.url} expected success envelope`);
      assert(formWriteSubmission.json?.requestId === 'contract-form-write', `${formWriteSubmission.url} expected request id`);
      assert(formWriteSubmission.json?.data?.submission?.id, `${formWriteSubmission.url} missing submission in data envelope`);
      assert(formWriteSubmission.json?.data?.collectionRecord?.status === 'draft', `${formWriteSubmission.url} expected draft collection record in data envelope`);
      assert(formWriteSubmission.json?.data?.contact?.name === 'Form Write Record', `${formWriteSubmission.url} expected contact in data envelope`);
      assert(formWriteSubmission.json?.collectionRecord?.status === 'draft', `${formWriteSubmission.url} expected draft collection record`);
      assert(formWriteSubmission.json?.collectionRecord?.slug === 'form-write-record', `${formWriteSubmission.url} expected slug from title`);
      assert(formWriteSubmission.json?.collectionRecord?.values?.summary === 'Form submissions can become draft collection records.', `${formWriteSubmission.url} expected mapped summary value`);
      assert(formWriteSubmission.json?.collectionRecordErrors?.length === 0, `${formWriteSubmission.url} expected no collection record errors`);

      const formWrittenRecordSlug = formWriteSubmission.json.collectionRecord.slug;
      const formWriteSubmissionId = formWriteSubmission.json.data.submission.id;
      const formWriteContactId = formWriteSubmission.json.data.contact.id;
      const hiddenFormWrittenRecord = await request(`/api/sites/${createdSiteId}/collections/${createdCollectionId}/records?slug=${formWrittenRecordSlug}`);
      assert(hiddenFormWrittenRecord.response.status === 404, `${hiddenFormWrittenRecord.url} expected draft form-written record to stay hidden`);

      const adminFormWrittenRecord = await request(`/api/admin/sites/${createdSiteId}/collections/${createdCollectionId}/records?slug=${formWrittenRecordSlug}`);
      assert(adminFormWrittenRecord.response.status === 200, `${adminFormWrittenRecord.url} expected 200, got ${adminFormWrittenRecord.response.status}`);
      assert(adminFormWrittenRecord.json?.data?.records?.[0]?.status === 'draft', `${adminFormWrittenRecord.url} missing draft form-written record`);

      const listedFormWriteSubmissions = await request(`/api/sites/${createdSiteId}/forms/contract-form-write/submissions?status=approved&requestId=contract-form-write`);
      assert(listedFormWriteSubmissions.response.status === 200, `${listedFormWriteSubmissions.url} expected 200, got ${listedFormWriteSubmissions.response.status}`);
      assert(listedFormWriteSubmissions.json?.success === true, `${listedFormWriteSubmissions.url} expected success envelope`);
      assert(listedFormWriteSubmissions.json?.data?.form?.id === 'contract-form-write', `${listedFormWriteSubmissions.url} missing form in data envelope`);
      assert(listedFormWriteSubmissions.json?.data?.submissions?.data?.[0]?.id === formWriteSubmissionId, `${listedFormWriteSubmissions.url} missing submission in data envelope`);
      const listedFormWriteSubmission = listedFormWriteSubmissions.json?.submissions?.data?.[0];
      assert(listedFormWriteSubmission?.collectionRecord?.collectionId === createdCollectionId, `${listedFormWriteSubmissions.url} missing linked collection id`);
      assert(listedFormWriteSubmission?.collectionRecord?.recordSlug === formWrittenRecordSlug, `${listedFormWriteSubmissions.url} missing linked collection record slug`);
      assert(listedFormWriteSubmission?.collectionRecordErrors?.length === 0, `${listedFormWriteSubmissions.url} expected no linked collection errors`);

      const fetchedFormWriteSubmission = await request(`/api/sites/${createdSiteId}/forms/contract-form-write/submissions/${formWriteSubmissionId}`);
      assert(fetchedFormWriteSubmission.response.status === 200, `${fetchedFormWriteSubmission.url} expected 200, got ${fetchedFormWriteSubmission.response.status}`);
      assert(fetchedFormWriteSubmission.json?.success === true, `${fetchedFormWriteSubmission.url} expected success envelope`);
      assert(fetchedFormWriteSubmission.json?.data?.submission?.id === formWriteSubmissionId, `${fetchedFormWriteSubmission.url} missing submission in data envelope`);
      assert(fetchedFormWriteSubmission.json?.submission?.id === formWriteSubmissionId, `${fetchedFormWriteSubmission.url} missing legacy submission`);

      const reviewedFormWriteSubmission = await request(`/api/sites/${createdSiteId}/forms/contract-form-write/submissions/${formWriteSubmissionId}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          status: 'approved',
          reviewedBy: 'contract-smoke',
        }),
      });
      assert(reviewedFormWriteSubmission.response.status === 200, `${reviewedFormWriteSubmission.url} expected 200, got ${reviewedFormWriteSubmission.response.status}`);
      assert(reviewedFormWriteSubmission.json?.success === true, `${reviewedFormWriteSubmission.url} expected success envelope`);
      assert(reviewedFormWriteSubmission.json?.data?.submission?.status === 'approved', `${reviewedFormWriteSubmission.url} missing updated submission in data envelope`);

      const listedFormWriteContacts = await request(`/api/sites/${createdSiteId}/forms/contract-form-write/contacts?requestId=contract-form-write`);
      assert(listedFormWriteContacts.response.status === 200, `${listedFormWriteContacts.url} expected 200, got ${listedFormWriteContacts.response.status}`);
      assert(listedFormWriteContacts.json?.success === true, `${listedFormWriteContacts.url} expected success envelope`);
      assert(listedFormWriteContacts.json?.data?.contacts?.[0]?.id === formWriteContactId, `${listedFormWriteContacts.url} missing contact in data envelope`);
      assert(listedFormWriteContacts.json?.contacts?.[0]?.id === formWriteContactId, `${listedFormWriteContacts.url} missing legacy contact`);

      const updatedFormWriteContact = await request(`/api/sites/${createdSiteId}/forms/contract-form-write/contacts/${formWriteContactId}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ status: 'qualified' }),
      });
      assert(updatedFormWriteContact.response.status === 200, `${updatedFormWriteContact.url} expected 200, got ${updatedFormWriteContact.response.status}`);
      assert(updatedFormWriteContact.json?.success === true, `${updatedFormWriteContact.url} expected success envelope`);
      assert(updatedFormWriteContact.json?.data?.contact?.status === 'qualified', `${updatedFormWriteContact.url} missing updated contact in data envelope`);
      assert(updatedFormWriteContact.json?.contact?.status === 'qualified', `${updatedFormWriteContact.url} missing legacy contact`);

      const createReusableSection = await request(`/api/admin/sites/${createdSiteId}/reusable-sections`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Frontend Contract Reusable Section',
          slug: `frontend-contract-section-${unique}`,
          description: 'Temporary reusable section for frontend contract smoke',
          category: 'layout',
          tags: ['frontend-contract', 'template'],
          content: {
            canvasSize: { width: 960, height: 320 },
            elements: [
              {
                id: 'frontend-contract-section-root',
                type: 'section',
                x: 0,
                y: 0,
                width: 960,
                height: 320,
                zIndex: 1,
                props: { backgroundColor: '#f8fafc' },
                children: [
                  {
                    id: 'frontend-contract-section-heading',
                    type: 'heading',
                    x: 64,
                    y: 72,
                    width: 620,
                    height: 80,
                    zIndex: 1,
                    props: { content: 'Frontend reusable section', level: 'h2' },
                  },
                ],
              },
            ],
          },
        }),
      });
      assert(createReusableSection.response.status === 201, `${createReusableSection.url} expected 201, got ${createReusableSection.response.status}`);
      manifestReusableSectionId = createReusableSection.json?.data?.section?.id;
      assert(manifestReusableSectionId, `${createReusableSection.url} missing reusable section id`);

      const publicReusableSections = await request(`/api/sites/${createdSiteId}/reusable-sections?tag=frontend-contract&category=layout`);
      assert(publicReusableSections.response.status === 200, `${publicReusableSections.url} expected 200, got ${publicReusableSections.response.status}`);
      assert(publicReusableSections.response.headers.get('x-backy-cache-scope') === 'discovery', `${publicReusableSections.url} missing discovery cache scope`);
      assert(publicReusableSections.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${publicReusableSections.url} missing contract version header`);
      assert(publicReusableSections.response.headers.get('x-backy-site-id') === createdSiteId, `${publicReusableSections.url} missing site id header`);
      assert(publicReusableSections.response.headers.get('x-backy-cache-revision'), `${publicReusableSections.url} missing reusable sections cache revision`);
      const reusableSectionsEtag = publicReusableSections.response.headers.get('etag');
      assert(reusableSectionsEtag?.startsWith('"backy-'), `${publicReusableSections.url} missing reusable sections etag`);
      const revalidatedReusableSections = await request(`/api/sites/${createdSiteId}/reusable-sections?tag=frontend-contract&category=layout`, {
        headers: { 'if-none-match': reusableSectionsEtag },
      });
      assert(revalidatedReusableSections.response.status === 304, `${revalidatedReusableSections.url} expected reusable sections 304, got ${revalidatedReusableSections.response.status}`);
      assert(revalidatedReusableSections.response.headers.get('etag') === reusableSectionsEtag, `${revalidatedReusableSections.url} expected matching reusable sections etag`);
      assert(publicReusableSections.json?.success === true, `${publicReusableSections.url} expected success envelope`);
      assert(publicReusableSections.json?.data?.sections?.some((section) => section.id === manifestReusableSectionId), `${publicReusableSections.url} missing reusable section in data envelope`);
      assert(publicReusableSections.json?.sections?.some((section) => section.id === manifestReusableSectionId), `${publicReusableSections.url} missing legacy reusable sections`);

      const publicReusableSection = await request(`/api/sites/${createdSiteId}/reusable-sections/${manifestReusableSectionId}`);
      assert(publicReusableSection.response.status === 200, `${publicReusableSection.url} expected 200, got ${publicReusableSection.response.status}`);
      assert(publicReusableSection.response.headers.get('x-backy-cache-scope') === 'discovery', `${publicReusableSection.url} missing discovery cache scope`);
      assert(publicReusableSection.response.headers.get('x-backy-cache-revision'), `${publicReusableSection.url} missing reusable section cache revision`);
      assert(publicReusableSection.response.headers.get('etag')?.startsWith('"backy-'), `${publicReusableSection.url} missing reusable section etag`);
      assert(publicReusableSection.json?.data?.section?.content?.elements?.[0]?.id === 'frontend-contract-section-root', `${publicReusableSection.url} missing reusable section content`);

      const invalidSeoSettings = await request(`/api/admin/sites/${createdSiteId}/seo`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          seo: {
            titleTemplate: 'Missing title token',
          },
        }),
      });
      assert(invalidSeoSettings.response.status === 400, `${invalidSeoSettings.url} expected invalid SEO 400`);
      assert(invalidSeoSettings.json?.error?.code === 'SEO_VALIDATION', `${invalidSeoSettings.url} expected SEO_VALIDATION`);

      const invalidJsonLdSettings = await request(`/api/admin/sites/${createdSiteId}/seo`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          seo: {
            titleTemplate: 'SEO %s | {siteName}',
            jsonLd: [{ '@context': 'https://schema.org' }, 'not-an-object'],
          },
        }),
      });
      assert(invalidJsonLdSettings.response.status === 400, `${invalidJsonLdSettings.url} expected invalid JSON-LD 400`);
      assert(invalidJsonLdSettings.json?.error?.code === 'SEO_VALIDATION', `${invalidJsonLdSettings.url} expected JSON-LD SEO_VALIDATION`);

      const seoSettings = await request(`/api/admin/sites/${createdSiteId}/seo`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          seo: {
            titleTemplate: 'SEO %s | {siteName}',
            defaultDescription: 'Fallback SEO description from admin contract.',
            defaultOgImage: '/uploads/sites/contract/social-card.jpg',
            favicon: '/favicon-contract.ico',
            jsonLd: [
              {
                '@context': 'https://schema.org',
                '@type': 'Organization',
                name: 'Admin Contract Organization',
                url: `https://${siteSlug}.example.test`,
              },
            ],
            sitemap: {
              enabled: true,
              defaultChangeFrequency: 'monthly',
              defaultPriority: 0.4,
              includeDynamicRoutes: false,
            },
            robots: {
              index: true,
              follow: true,
              extraRules: 'Disallow: /contract-private',
            },
          },
        }),
      });
      assert(seoSettings.response.status === 200, `${seoSettings.url} expected SEO settings update 200`);
      assert(seoSettings.json?.data?.seo?.titleTemplate === 'SEO %s | {siteName}', `${seoSettings.url} missing saved title template`);

      const adminSeoSettings = await request(`/api/admin/sites/${createdSiteId}/seo`);
      assert(adminSeoSettings.response.status === 200, `${adminSeoSettings.url} expected SEO settings read 200`);
      assert(adminSeoSettings.json?.data?.seo?.defaultDescription === 'Fallback SEO description from admin contract.', `${adminSeoSettings.url} missing saved SEO defaults`);
      assert(adminSeoSettings.json?.data?.seo?.jsonLd?.[0]?.['@type'] === 'Organization', `${adminSeoSettings.url} missing saved JSON-LD defaults`);
      assert(
        adminSeoSettings.json?.data?.preview?.supportedVariables?.includes('{recordTitle}'),
        `${adminSeoSettings.url} missing dynamic SEO preview variables`,
      );
      assert(
        adminSeoSettings.json?.data?.preview?.routes?.some((route) => (
          route.type === 'dynamicList'
          && route.canonical === '/directory'
          && route.title?.startsWith('SEO ')
        )),
        `${adminSeoSettings.url} missing dynamic list SEO preview`,
      );
      assert(
        adminSeoSettings.json?.data?.preview?.routes?.some((route) => (
          route.type === 'dynamicItem'
          && typeof route.variables?.recordSlug === 'string'
          && route.canonical?.startsWith('/directory/')
          && route.title?.startsWith('SEO ')
        )),
        `${adminSeoSettings.url} missing dynamic item SEO preview`,
      );

      const seoDiscovery = await request(`/api/sites/${createdSiteId}/seo`);
      assert(seoDiscovery.response.status === 200, `${seoDiscovery.url} expected 200, got ${seoDiscovery.response.status}`);
      assert(seoDiscovery.response.headers.get('x-backy-cache-scope') === 'discovery', `${seoDiscovery.url} missing SEO cache scope`);
      const seoCacheRevision = seoDiscovery.response.headers.get('x-backy-cache-revision');
      assert(seoCacheRevision, `${seoDiscovery.url} missing SEO cache revision`);
      const seoEtag = seoDiscovery.response.headers.get('etag');
      assert(seoEtag?.startsWith('"backy-'), `${seoDiscovery.url} missing SEO etag`);
      const revalidatedSeo = await request(`/api/sites/${createdSiteId}/seo`, {
        headers: { 'if-none-match': seoEtag },
      });
      assert(revalidatedSeo.response.status === 304, `${revalidatedSeo.url} expected SEO 304, got ${revalidatedSeo.response.status}`);
      assert(revalidatedSeo.response.headers.get('x-backy-cache-revision') === seoCacheRevision, `${revalidatedSeo.url} expected matching SEO cache revision`);
      assert(seoDiscovery.json?.success === true, `${seoDiscovery.url} expected success envelope`);
      assert(seoDiscovery.json?.data?.routes?.some((route) => route.type === 'page' && route.canonical === `/${pageSlug}-form-write`), `${seoDiscovery.url} missing temporary page SEO route`);
      assert(seoDiscovery.json?.data?.site?.canonicalBaseUrl === `https://${customDomain}`, `${seoDiscovery.url} missing custom-domain canonical base URL`);
      assert(seoDiscovery.json?.data?.routes?.some((route) => (
        route.type === 'page'
        && route.canonical === `/${pageSlug}-form-write`
        && route.canonicalUrl === `https://${customDomain}/${pageSlug}-form-write`
      )), `${seoDiscovery.url} missing custom-domain route canonical URL`);
      assert(seoDiscovery.json?.data?.defaults?.description === 'Fallback SEO description from admin contract.', `${seoDiscovery.url} missing SEO default description`);
      assert(seoDiscovery.json?.data?.defaults?.jsonLd?.[0]?.['@type'] === 'Organization', `${seoDiscovery.url} missing SEO JSON-LD defaults`);
      assert(seoDiscovery.json?.data?.routes?.some((route) => (
        route.type === 'page'
        && route.id === formWritePageId
        && route.jsonLd?.some((entry) => entry?.['@type'] === 'WebPage' && entry?.name === 'Collection Form Write Page')
      )), `${seoDiscovery.url} missing page route JSON-LD`);
      assert(seoDiscovery.json?.data?.routes?.some((route) => route.title?.startsWith('SEO ') && route.openGraph?.image === '/uploads/sites/contract/social-card.jpg'), `${seoDiscovery.url} missing applied SEO defaults`);
      assert(seoDiscovery.json?.data?.sitemap?.enabled === true, `${seoDiscovery.url} missing sitemap enabled flag`);
      assert(seoDiscovery.json?.data?.sitemap?.includeDynamicRoutes === false, `${seoDiscovery.url} missing dynamic sitemap flag`);
      assert(seoDiscovery.json?.data?.robots?.extraRules === 'Disallow: /contract-private', `${seoDiscovery.url} missing robots extra rules`);
      assert(seoDiscovery.json?.data?.routes?.some((route) => route.type === 'page' && route.changeFrequency === 'monthly' && route.priority === 0.4), `${seoDiscovery.url} missing sitemap route defaults`);
      assert(seoDiscovery.json?.data?.sitemap?.url === `/api/sites/${createdSiteId}/seo?format=sitemap`, `${seoDiscovery.url} missing sitemap URL`);
      assert(seoDiscovery.json?.data?.sitemap?.publicUrl === `https://${customDomain}/sitemap.xml`, `${seoDiscovery.url} missing custom-domain sitemap URL`);
      assert(seoDiscovery.json?.data?.robots?.publicUrl === `https://${customDomain}/robots.txt`, `${seoDiscovery.url} missing custom-domain robots URL`);

      const seoSitemap = await request(`/api/sites/${createdSiteId}/seo?format=sitemap`);
      assert(seoSitemap.response.status === 200, `${seoSitemap.url} expected 200, got ${seoSitemap.response.status}`);
      assert(seoSitemap.response.headers.get('content-type')?.includes('application/xml'), `${seoSitemap.url} expected XML sitemap content type`);
      assert(seoSitemap.response.headers.get('x-backy-cache-revision') === seoCacheRevision, `${seoSitemap.url} missing matching SEO cache revision`);
      assert(seoSitemap.text.includes(`https://${customDomain}/${pageSlug}-form-write`), `${seoSitemap.url} missing custom-domain temporary page in sitemap`);

      const seoRobots = await request(`/api/sites/${createdSiteId}/seo?format=robots`);
      assert(seoRobots.response.status === 200, `${seoRobots.url} expected 200, got ${seoRobots.response.status}`);
      assert(seoRobots.response.headers.get('content-type')?.includes('text/plain'), `${seoRobots.url} expected robots text content type`);
      assert(seoRobots.response.headers.get('x-backy-cache-revision') === seoCacheRevision, `${seoRobots.url} missing matching SEO cache revision`);
      assert(seoRobots.text.includes(`Sitemap: https://${customDomain}/sitemap.xml`), `${seoRobots.url} missing custom-domain sitemap pointer`);
      assert(seoRobots.text.includes('Disallow: /contract-private'), `${seoRobots.url} missing custom robots rule`);

      const hostedSitemap = await request(`/sites/${siteSlug}/sitemap.xml`);
      assert(hostedSitemap.response.status === 200, `${hostedSitemap.url} expected 200, got ${hostedSitemap.response.status}`);
      assert(hostedSitemap.response.headers.get('content-type')?.includes('application/xml'), `${hostedSitemap.url} expected XML sitemap content type`);
      assert(hostedSitemap.text.includes(`https://${customDomain}/${pageSlug}-form-write`), `${hostedSitemap.url} missing custom-domain hosted temporary page URL`);

      const hostedRobots = await request(`/sites/${siteSlug}/robots.txt`);
      assert(hostedRobots.response.status === 200, `${hostedRobots.url} expected 200, got ${hostedRobots.response.status}`);
      assert(hostedRobots.response.headers.get('content-type')?.includes('text/plain'), `${hostedRobots.url} expected robots text content type`);
      assert(hostedRobots.text.includes(`Sitemap: https://${customDomain}/sitemap.xml`), `${hostedRobots.url} missing custom-domain hosted sitemap pointer`);

      const frontendManifest = await request(`/api/sites/${createdSiteId}/manifest`);
      assert(frontendManifest.response.status === 200, `${frontendManifest.url} expected 200, got ${frontendManifest.response.status}`);
      assert(frontendManifest.response.headers.get('cache-control')?.includes('max-age=60'), `${frontendManifest.url} missing discovery cache header`);
      assert(frontendManifest.response.headers.get('x-backy-cache-scope') === 'discovery', `${frontendManifest.url} missing discovery cache scope`);
      assert(frontendManifest.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${frontendManifest.url} missing contract version header`);
      assert(frontendManifest.response.headers.get('x-backy-schema-version') === 'backy.frontend-manifest.v1', `${frontendManifest.url} missing manifest schema version header`);
      const manifestCacheRevision = frontendManifest.response.headers.get('x-backy-cache-revision');
      assert(manifestCacheRevision, `${frontendManifest.url} missing manifest cache revision`);
      const manifestEtag = frontendManifest.response.headers.get('etag');
      assert(manifestEtag?.startsWith('"backy-'), `${frontendManifest.url} missing manifest etag`);
      const revalidatedManifest = await request(`/api/sites/${createdSiteId}/manifest`, {
        headers: { 'if-none-match': manifestEtag },
      });
      assert(revalidatedManifest.response.status === 304, `${revalidatedManifest.url} expected manifest 304, got ${revalidatedManifest.response.status}`);
      assert(revalidatedManifest.response.headers.get('etag') === manifestEtag, `${revalidatedManifest.url} expected matching manifest etag`);
      assert(revalidatedManifest.response.headers.get('x-backy-cache-revision') === manifestCacheRevision, `${revalidatedManifest.url} expected matching manifest cache revision`);
      validateAiFrontendManifest(frontendManifest.json, 'site frontend manifest');
      assert(frontendManifest.json?.data?.capabilities?.renderPayload === true, `${frontendManifest.url} missing render payload capability`);
      assert(frontendManifest.json?.data?.capabilities?.openApi === true, `${frontendManifest.url} missing OpenAPI capability`);
      assert(frontendManifest.json?.data?.capabilities?.seoDiscovery === true, `${frontendManifest.url} missing SEO discovery capability`);
      assert(frontendManifest.json?.data?.capabilities?.collectionWriteForms === true, `${frontendManifest.url} missing collection write form capability`);
      assert(frontendManifest.json?.data?.capabilities?.dynamicListRoutes === true, `${frontendManifest.url} missing dynamic list route capability`);
      assert(frontendManifest.json?.data?.capabilities?.redirectRoutes === true, `${frontendManifest.url} missing redirect route capability`);
      assert(frontendManifest.json?.data?.capabilities?.reusableSections === true, `${frontendManifest.url} missing reusable sections capability`);
      assert(frontendManifest.json?.data?.contract?.schemas?.renderPayload?.includes('content-payload.schema.json'), `${frontendManifest.url} missing render schema reference`);
      assert(frontendManifest.json?.data?.endpoints?.openapi === `/api/sites/${createdSiteId}/openapi`, `${frontendManifest.url} missing OpenAPI endpoint`);
      assert(frontendManifest.json?.data?.endpoints?.seo === `/api/sites/${createdSiteId}/seo`, `${frontendManifest.url} missing SEO endpoint`);
      assert(frontendManifest.json?.data?.endpoints?.sitemap === `/api/sites/${createdSiteId}/seo?format=sitemap`, `${frontendManifest.url} missing sitemap endpoint`);
      assert(frontendManifest.json?.data?.endpoints?.mediaDetail === `/api/sites/${createdSiteId}/media/{mediaId}`, `${frontendManifest.url} missing media detail endpoint template`);
      assert(frontendManifest.json?.data?.endpoints?.reusableSections === `/api/sites/${createdSiteId}/reusable-sections`, `${frontendManifest.url} missing reusable sections endpoint`);
      assert(frontendManifest.json?.data?.endpoints?.formDetail === `/api/sites/${createdSiteId}/forms/{formId}`, `${frontendManifest.url} missing form detail endpoint template`);
      assert(frontendManifest.json?.data?.endpoints?.formContacts === `/api/sites/${createdSiteId}/forms/{formId}/contacts`, `${frontendManifest.url} missing form contacts endpoint template`);
      assert(frontendManifest.json?.data?.endpoints?.commentReport === `/api/sites/${createdSiteId}/comments/{commentId}/report`, `${frontendManifest.url} missing comment report endpoint template`);
      assert(frontendManifest.json?.data?.endpoints?.events === `/api/sites/${createdSiteId}/events`, `${frontendManifest.url} missing events endpoint`);
      assert(frontendManifest.json?.data?.modules?.routing?.supportedRouteTypes?.includes('redirect'), `${frontendManifest.url} missing redirect route type support`);
      assert(frontendManifest.json?.data?.modules?.routing?.supportedRouteTypes?.includes('gone'), `${frontendManifest.url} missing gone route type support`);
      assert(frontendManifest.json?.data?.modules?.routing?.redirectRules?.items?.some((rule) => (
        rule.id === 'contract-redirect'
        && rule.type === 'redirect'
        && rule.from === `/old-${pageSlug}`
        && rule.to === `/${pageSlug}`
        && rule.statusCode === 301
      )), `${frontendManifest.url} missing redirect rule manifest`);
      assert(frontendManifest.json?.data?.modules?.routing?.redirectRules?.items?.some((rule) => (
        rule.id === 'contract-gone'
        && rule.type === 'gone'
        && rule.from === `/retired-${pageSlug}`
        && rule.statusCode === 410
      )), `${frontendManifest.url} missing gone rule manifest`);
      assert(frontendManifest.json?.data?.modules?.collections?.some((collection) => (
        collection.id === createdCollectionId
        && collection.listRoutePattern === '/directory'
        && collection.dynamicListRoutePattern === '/directory'
        && collection.dynamicListRouteResolveUrl === `/api/sites/${createdSiteId}/resolve?path=/directory`
        && collection.dynamicListRouteRenderUrl === `/api/sites/${createdSiteId}/render?path=/directory`
        && collection.routePattern === '/directory/:recordSlug'
        && collection.dynamicRoutePattern === '/directory/:recordSlug'
        && collection.dynamicRouteResolveUrl === `/api/sites/${createdSiteId}/resolve?path=/directory/:recordSlug`
        && collection.dynamicRouteRenderUrl === `/api/sites/${createdSiteId}/render?path=/directory/:recordSlug`
      )), `${frontendManifest.url} missing collection manifest`);
      assert(frontendManifest.json?.data?.modules?.reusableSections?.items?.some((section) => (
        section.id === manifestReusableSectionId &&
        section.detailUrl === `/api/sites/${createdSiteId}/reusable-sections/${manifestReusableSectionId}` &&
        section.elementCount === 1
      )), `${frontendManifest.url} missing reusable section manifest`);
      assert(frontendManifest.json?.data?.modules?.forms?.some((form) => (
        form.id === 'contract-form-write' &&
        form.collectionTarget?.collectionId === createdCollectionId &&
        form.detailUrl === `/api/sites/${createdSiteId}/forms/contract-form-write` &&
        form.contactsUrl === `/api/sites/${createdSiteId}/forms/contract-form-write/contacts`
      )), `${frontendManifest.url} missing form collection target manifest`);
      assert(frontendManifest.json?.data?.routePatterns?.some((route) => route.type === 'dynamicCollectionItem'), `${frontendManifest.url} missing dynamic item route pattern`);
      assert(frontendManifest.json?.data?.routePatterns?.some((route) => (
        route.type === 'dynamicCollectionList'
        && route.collectionId === createdCollectionId
        && route.pattern === '/directory'
      )), `${frontendManifest.url} missing dynamic list route pattern`);

      const publicOpenApi = await request(`/api/sites/${createdSiteId}/openapi`);
      assert(publicOpenApi.response.status === 200, `${publicOpenApi.url} expected 200, got ${publicOpenApi.response.status}`);
      assert(publicOpenApi.response.headers.get('cache-control')?.includes('max-age=60'), `${publicOpenApi.url} missing discovery cache header`);
      assert(publicOpenApi.response.headers.get('x-backy-cache-scope') === 'discovery', `${publicOpenApi.url} missing discovery cache scope`);
      assert(publicOpenApi.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${publicOpenApi.url} missing contract version header`);
      assert(publicOpenApi.response.headers.get('x-backy-schema-version') === 'openapi.3.1', `${publicOpenApi.url} missing OpenAPI schema version header`);
      const openApiCacheRevision = publicOpenApi.response.headers.get('x-backy-cache-revision');
      assert(openApiCacheRevision, `${publicOpenApi.url} missing OpenAPI cache revision`);
      const openApiEtag = publicOpenApi.response.headers.get('etag');
      assert(openApiEtag?.startsWith('"backy-'), `${publicOpenApi.url} missing OpenAPI etag`);
      const revalidatedOpenApi = await request(`/api/sites/${createdSiteId}/openapi`, {
        headers: { 'if-none-match': openApiEtag },
      });
      assert(revalidatedOpenApi.response.status === 304, `${revalidatedOpenApi.url} expected OpenAPI 304, got ${revalidatedOpenApi.response.status}`);
      assert(revalidatedOpenApi.response.headers.get('etag') === openApiEtag, `${revalidatedOpenApi.url} expected matching OpenAPI etag`);
      assert(revalidatedOpenApi.response.headers.get('x-backy-cache-revision') === openApiCacheRevision, `${revalidatedOpenApi.url} expected matching OpenAPI cache revision`);
      assert(publicOpenApi.json?.openapi === '3.1.0', `${publicOpenApi.url} expected OpenAPI 3.1 document`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/manifest`]?.get, `${publicOpenApi.url} missing manifest operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/render`]?.get, `${publicOpenApi.url} missing render operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/seo`]?.get, `${publicOpenApi.url} missing SEO discovery operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/media/{mediaId}`]?.get, `${publicOpenApi.url} missing media detail operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/collections/{collectionId}/records`]?.post, `${publicOpenApi.url} missing public collection create operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/reusable-sections`]?.get, `${publicOpenApi.url} missing reusable sections list operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/reusable-sections/{sectionId}`]?.get, `${publicOpenApi.url} missing reusable section detail operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/forms/{formId}`]?.get, `${publicOpenApi.url} missing form detail operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/forms/{formId}/submissions`]?.get, `${publicOpenApi.url} missing form submission list operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/forms/{formId}/submissions`]?.post, `${publicOpenApi.url} missing form submission operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/forms/{formId}/submissions/{submissionId}`]?.patch, `${publicOpenApi.url} missing form submission review operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/forms/{formId}/contacts`]?.get, `${publicOpenApi.url} missing form contacts operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/pages/{pageId}/comments`]?.get, `${publicOpenApi.url} missing page comments list operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/pages/{pageId}/comments/{commentId}`]?.patch, `${publicOpenApi.url} missing page comment update operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/blog/{postId}/comments`]?.get, `${publicOpenApi.url} missing blog comments list operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/comments/{commentId}/report`]?.post, `${publicOpenApi.url} missing comment report operation`);
      assert(publicOpenApi.json?.paths?.[`/api/sites/${createdSiteId}/events`]?.get, `${publicOpenApi.url} missing interaction events operation`);
      assert(publicOpenApi.json?.components?.schemas?.FormSubmissionEnvelope, `${publicOpenApi.url} missing form submission schema`);
      assert(publicOpenApi.json?.components?.schemas?.SeoDiscoveryEnvelope, `${publicOpenApi.url} missing SEO discovery schema`);
      assert(publicOpenApi.json?.components?.schemas?.MediaDetailEnvelope, `${publicOpenApi.url} missing media detail schema`);
      assert(publicOpenApi.json?.components?.schemas?.ReusableSectionListEnvelope, `${publicOpenApi.url} missing reusable section list schema`);
      assert(publicOpenApi.json?.components?.schemas?.CommentReportEnvelope, `${publicOpenApi.url} missing comment report schema`);
      assert(publicOpenApi.json?.components?.schemas?.EventsEnvelope, `${publicOpenApi.url} missing interaction event schema`);
      assert(publicOpenApi.json?.components?.schemas?.RedirectRoute, `${publicOpenApi.url} missing redirect route schema`);
      assert(publicOpenApi.json?.components?.schemas?.GoneRoute, `${publicOpenApi.url} missing gone route schema`);
      assert(publicOpenApi.json?.components?.schemas?.GoneRouteResolveEnvelope, `${publicOpenApi.url} missing gone route resolve envelope schema`);
      assert(publicOpenApi.json?.['x-backy']?.collectionIds?.includes(createdCollectionId), `${publicOpenApi.url} missing collection id vendor extension`);
      assert(publicOpenApi.json?.['x-backy']?.reusableSectionIds?.includes(manifestReusableSectionId), `${publicOpenApi.url} missing reusable section id vendor extension`);
      assert(publicOpenApi.json?.['x-backy']?.formIds?.includes('contract-form-write'), `${publicOpenApi.url} missing form id vendor extension`);
      assert(publicOpenApi.json?.['x-backy']?.redirectRules?.some((rule) => (
        rule.id === 'contract-redirect'
        && rule.from === `/old-${pageSlug}`
        && rule.statusCode === 301
      )), `${publicOpenApi.url} missing redirect rule vendor extension`);
    } finally {
      if (manifestReusableSectionId) {
        await request(`/api/admin/sites/${createdSiteId}/reusable-sections/${manifestReusableSectionId}`, { method: 'DELETE' }).catch(() => {});
      }
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
    assert(publicRecords.response.headers.get('x-backy-cache-scope') === 'discovery', `${publicRecords.url} missing discovery cache scope`);
    assert(publicRecords.response.headers.get('x-backy-contract-version') === 'backy.ai-frontend.v1', `${publicRecords.url} missing contract version header`);
    assert(publicRecords.response.headers.get('x-backy-site-id') === createdSiteId, `${publicRecords.url} missing site id header`);
    const publicRecordsCacheRevision = publicRecords.response.headers.get('x-backy-cache-revision');
    assert(publicRecordsCacheRevision, `${publicRecords.url} missing collection records cache revision`);
    const publicRecordsEtag = publicRecords.response.headers.get('etag');
    assert(publicRecordsEtag?.startsWith('"backy-'), `${publicRecords.url} missing collection records etag`);
    const revalidatedPublicRecords = await request(`/api/sites/${createdSiteId}/collections/${createdCollectionId}/records?slug=${collectionRecordSlug}`, {
      headers: { 'if-none-match': publicRecordsEtag },
    });
    assert(revalidatedPublicRecords.response.status === 304, `${revalidatedPublicRecords.url} expected collection records 304, got ${revalidatedPublicRecords.response.status}`);
    assert(revalidatedPublicRecords.response.headers.get('etag') === publicRecordsEtag, `${revalidatedPublicRecords.url} expected matching collection records etag`);
    assert(revalidatedPublicRecords.response.headers.get('x-backy-cache-revision') === publicRecordsCacheRevision, `${revalidatedPublicRecords.url} expected matching collection records cache revision`);
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

    const dynamicListPath = `/directory`;
    const dynamicListResolve = await request(`/api/sites/${createdSiteId}/resolve?path=${encodeURIComponent(dynamicListPath)}`);
    assert(dynamicListResolve.response.status === 200, `${dynamicListResolve.url} expected 200, got ${dynamicListResolve.response.status}`);
    assert(dynamicListResolve.response.headers.get('x-backy-cache-scope') === 'discovery', `${dynamicListResolve.url} missing dynamic list resolve cache scope`);
    assert(dynamicListResolve.response.headers.get('etag')?.startsWith('"backy-'), `${dynamicListResolve.url} missing dynamic list resolve etag`);
    assert(dynamicListResolve.json?.data?.route?.type === 'dynamicList', `${dynamicListResolve.url} expected dynamic list route`);
    assert(dynamicListResolve.json?.data?.route?.resource?.id === createdCollectionId, `${dynamicListResolve.url} returned wrong dynamic list collection`);
    assert(dynamicListResolve.json?.data?.route?.resource?.recordsUrl === `/api/sites/${createdSiteId}/collections/${createdCollectionId}/records`, `${dynamicListResolve.url} returned wrong dynamic list records URL`);

    const dynamicListRender = await request(`/api/sites/${createdSiteId}/render?path=${encodeURIComponent(dynamicListPath)}`);
    assert(dynamicListRender.response.status === 200, `${dynamicListRender.url} expected 200, got ${dynamicListRender.response.status}`);
    validateAiRenderPayload(dynamicListRender.json, 'collection dynamic list render payload');
    assert(dynamicListRender.json?.data?.route?.type === 'dynamicList', `${dynamicListRender.url} expected dynamic list render route`);
    assert(dynamicListRender.json?.data?.content?.kind === 'dynamicList', `${dynamicListRender.url} expected dynamic list content`);
    assert(dynamicListRender.json?.data?.content?.id === createdCollectionId, `${dynamicListRender.url} returned wrong rendered collection`);
    assert(
      dynamicListRender.json?.data?.dataBindings?.datasets?.some((dataset) => (
        dataset.id === `dataset_${createdCollectionId}_list`
        && dataset.collectionId === createdCollectionId
        && dataset.records?.some((record) => record.id === createdCollectionRecordId && record.values?.title === 'Collection Record')
      )),
      `${dynamicListRender.url} missing dynamic list dataset record`,
    );

    const hostedDynamicList = await request(`/sites/${siteSlug}${dynamicListPath}`);
    assert(hostedDynamicList.response.status === 200, `${hostedDynamicList.url} expected hosted dynamic list page`);
    assert(hostedDynamicList.text.includes('Admin Contract Collection'), `${hostedDynamicList.url} missing hosted dynamic list title`);
    assert(hostedDynamicList.text.includes('Collection Record'), `${hostedDynamicList.url} missing hosted dynamic list record`);

    const dynamicItemPath = `/directory/${collectionRecordSlug}`;
    const dynamicResolve = await request(`/api/sites/${createdSiteId}/resolve?path=${encodeURIComponent(dynamicItemPath)}`);
    assert(dynamicResolve.response.status === 200, `${dynamicResolve.url} expected 200, got ${dynamicResolve.response.status}`);
    assert(dynamicResolve.response.headers.get('x-backy-cache-scope') === 'discovery', `${dynamicResolve.url} missing dynamic item resolve cache scope`);
    assert(dynamicResolve.response.headers.get('etag')?.startsWith('"backy-'), `${dynamicResolve.url} missing dynamic item resolve etag`);
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

    const hostedDynamicItem = await request(`/sites/${siteSlug}${dynamicItemPath}`);
    assert(hostedDynamicItem.response.status === 200, `${hostedDynamicItem.url} expected hosted dynamic item page`);
    assert(hostedDynamicItem.text.includes('Collection Record'), `${hostedDynamicItem.url} missing hosted dynamic item title`);

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
            {
              id: 'bound_repeater',
              type: 'repeater',
              x: 100,
              y: 220,
              width: 720,
              height: 260,
              props: {
                collectionId: createdCollectionId,
                datasetId: 'dataset_contract_repeater',
                titleField: 'title',
                descriptionField: 'summary',
                columns: 2,
                limit: 6,
                sortBy: 'rank',
                sortDirection: 'asc',
              },
              children: [],
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
      boundRender.json?.data?.dataBindings?.datasets?.some((dataset) => (
        dataset.id === 'dataset_contract_repeater'
        && dataset.collectionId === createdCollectionId
        && dataset.query?.sortBy === 'rank'
        && dataset.records?.some((record) => record.id === createdCollectionRecordId)
      )),
      `${boundRender.url} missing repeater dataset manifest`,
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
      boundRender.json?.data?.content?.elements?.some((element) => (
        element.id === 'bound_repeater'
        && element.type === 'repeater'
        && element.props?.datasetId === 'dataset_contract_repeater'
        && element.props?.records?.some((record) => record.id === createdCollectionRecordId && record.href === dynamicItemPath)
      )),
      `${boundRender.url} did not hydrate repeater records into element props`,
    );
    assert(
      boundRender.json?.data?.editableMap?.[`collection.${createdCollectionId}.bound_title.title`]?.scope === 'collectionRecord',
      `${boundRender.url} missing collection record editable map entry`,
    );

    const hostedBoundPage = await request(`/sites/${siteSlug}/${boundPageSlug}`);
    assert(hostedBoundPage.response.status === 200, `${hostedBoundPage.url} expected hosted bound page`);
    assert(hostedBoundPage.text.includes('Collection Record'), `${hostedBoundPage.url} missing hosted repeater record`);

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

    const hiddenDynamicListResolve = await request(`/api/sites/${createdSiteId}/resolve?path=${encodeURIComponent(dynamicListPath)}`);
    assert(hiddenDynamicListResolve.response.status === 404, `${hiddenDynamicListResolve.url} expected draft collection dynamic list route to be hidden`);

    const hiddenDynamicListRender = await request(`/api/sites/${createdSiteId}/render?path=${encodeURIComponent(dynamicListPath)}`);
    assert(hiddenDynamicListRender.response.status === 404, `${hiddenDynamicListRender.url} expected draft collection dynamic list render to be hidden`);

    const hiddenHostedDynamicList = await request(`/sites/${siteSlug}${dynamicListPath}`);
    assert(hiddenHostedDynamicList.response.status === 404, `${hiddenHostedDynamicList.url} expected draft collection hosted dynamic list to be hidden`);

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
