#!/usr/bin/env node

const baseUrl = (process.env.BACKY_PUBLIC_CONTRACT_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

const checks = [];
let createdSiteId = null;
let createdPageId = null;
let createdPostId = null;
let createdCategoryId = null;
let createdTagId = null;
let createdUserId = null;
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
    assert(
      renderPayload.json?.data?.navigation?.primary?.some((item) => item.pageId === createdPageId && item.path === `/${pageSlug}`),
      `${renderPayload.url} missing render navigation manifest`,
    );

    const resolvedPage = await request(`/api/sites/${createdSiteId}/resolve?path=/${pageSlug}`);
    assert(resolvedPage.response.status === 200, `${resolvedPage.url} expected 200, got ${resolvedPage.response.status}`);
    assert(resolvedPage.json?.success === true, `${resolvedPage.url} expected success envelope`);
    assert(resolvedPage.json?.data?.route?.type === 'page', `${resolvedPage.url} expected page route`);
    assert(resolvedPage.json?.data?.route?.resource?.id === createdPageId, `${resolvedPage.url} returned wrong resolved page`);

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
    assert(visibleScheduledPost.json?.post?.id === createdPostId, `${visibleScheduledPost.url} returned wrong scheduled post`);

    const visibleScheduledPostResolve = await request(`/api/sites/${createdSiteId}/resolve?path=/blog/${postSlug}`);
    assert(visibleScheduledPostResolve.response.status === 200, `${visibleScheduledPostResolve.url} expected past scheduled post route to be visible`);
    assert(visibleScheduledPostResolve.json?.data?.route?.type === 'post', `${visibleScheduledPostResolve.url} expected post route type`);
    assert(visibleScheduledPostResolve.json?.data?.route?.resource?.id === createdPostId, `${visibleScheduledPostResolve.url} returned wrong resolved post`);

    const visibleScheduledPostRender = await request(`/api/sites/${createdSiteId}/render?path=/blog/${postSlug}`);
    assert(visibleScheduledPostRender.response.status === 200, `${visibleScheduledPostRender.url} expected past scheduled post render to be visible`);
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
    assert(publicCategories.json?.categories?.some((category) => category.id === createdCategoryId), `${publicCategories.url} missing public category`);

    const publicTags = await request(`/api/sites/${createdSiteId}/blog/tags`);
    assert(publicTags.response.status === 200, `${publicTags.url} expected 200, got ${publicTags.response.status}`);
    assert(publicTags.json?.tags?.some((tag) => tag.id === createdTagId), `${publicTags.url} missing public tag`);

    const publicCategoryFilter = await request(`/api/sites/${createdSiteId}/blog?categorySlug=${categorySlug}`);
    assert(publicCategoryFilter.response.status === 200, `${publicCategoryFilter.url} expected 200, got ${publicCategoryFilter.response.status}`);
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
