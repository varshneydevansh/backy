#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_BLOG_LIST_SMOKE_SITE_ID || 'site-demo';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_BLOG_LIST_CDP_PORT || 9388);
const SCREENSHOT_PATH = process.env.BACKY_BLOG_LIST_SCREENSHOT || path.join(os.tmpdir(), 'backy-blog-list-smoke.png');
let apiAdminSessionToken = '';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const waitForExit = (childProcess, timeoutMs = 1500) => new Promise((resolve) => {
  if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
    resolve(true);
    return;
  }

  const timeout = setTimeout(() => {
    childProcess.off('exit', onExit);
    resolve(false);
  }, timeoutMs);

  const onExit = () => {
    clearTimeout(timeout);
    resolve(true);
  };

  childProcess.once('exit', onExit);
});

const requestApi = async (endpoint, options = {}) => {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (endpoint.startsWith('/api/admin/') && apiAdminSessionToken && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${apiAdminSessionToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(payload.error || payload).slice(0, 500)}`);
  }

  return payload;
};

const loginAdminApi = async () => {
  const response = await fetch(`${API_BASE_URL}/api/admin/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: 'admin@backy.io',
      password: process.env.BACKY_ADMIN_DEMO_PASSWORD || 'admin123',
    }),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false || !payload.data?.session?.token) {
    throw new Error(`Unable to create API admin session: ${JSON.stringify(payload).slice(0, 500)}`);
  }

  apiAdminSessionToken = payload.data.session.token;
  return payload.data;
};

const createBlogCategory = async ({ name, slug }) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/blog/categories`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      slug,
      description: 'Temporary smoke category for editorial list filtering.',
      color: '#0f766e',
    }),
  });
  const category = payload.data?.category || payload.category;
  assert(category?.id, `Create category did not return a category: ${JSON.stringify(payload).slice(0, 500)}`);
  return category;
};

const createBlogTag = async ({ name, slug }) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/blog/tags`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      slug,
      description: 'Temporary smoke tag for editorial list filtering.',
    }),
  });
  const tag = payload.data?.tag || payload.tag;
  assert(tag?.id, `Create tag did not return a tag: ${JSON.stringify(payload).slice(0, 500)}`);
  return tag;
};

const listBlogCategories = async () => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/blog/categories`);
  return payload.data?.categories || payload.categories || [];
};

const listBlogTags = async () => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/blog/tags`);
  return payload.data?.tags || payload.tags || [];
};

const listAuthors = async () => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/blog/authors`);
  return payload.data?.authors || payload.authors || [];
};

const createBlogPost = async ({ title, slug, categoryId, tagId, authorId }) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/blog`, {
    method: 'POST',
    body: JSON.stringify({
      title,
      slug,
      excerpt: 'Temporary blog list smoke excerpt for filters, public feeds, preview links, and bulk publishing.',
      status: 'draft',
      authorId,
      categoryIds: [categoryId],
      tagIds: [tagId],
      meta: {
        title: `${title} SEO`,
        description: 'Temporary smoke SEO description used to prove list handoff data stays connected.',
        canonical: `/blog/${slug}`,
        noIndex: true,
      },
      content: {
        elements: [
          {
            id: `smoke-heading-${slug}`,
            type: 'heading',
            x: 72,
            y: 56,
            width: 780,
            height: 96,
            content: {
              text: title,
              level: 1,
            },
          },
          {
            id: `smoke-text-${slug}`,
            type: 'text',
            x: 72,
            y: 180,
            width: 760,
            height: 140,
            content: {
              text: 'This post is created by the blog list smoke test and removed after verification.',
            },
          },
        ],
        canvasSize: {
          width: 1200,
          height: 800,
        },
      },
    }),
  });
  const post = payload.data?.post || payload.post;
  assert(post?.id, `Create post did not return a post: ${JSON.stringify(payload).slice(0, 500)}`);
  return post;
};

const deleteBlogPost = async (postId) => {
  if (!postId) return;
  await requestApi(`/api/admin/sites/${SITE_ID}/blog/${postId}`, { method: 'DELETE' });
};

const deleteBlogCategory = async (categoryId) => {
  if (!categoryId) return;
  await requestApi(`/api/admin/sites/${SITE_ID}/blog/categories/${categoryId}`, { method: 'DELETE' });
};

const deleteBlogTag = async (tagId) => {
  if (!tagId) return;
  await requestApi(`/api/admin/sites/${SITE_ID}/blog/tags/${tagId}`, { method: 'DELETE' });
};

const fetchPostBySlug = async (slug) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/blog?limit=100`);
  const posts = payload.data?.posts || payload.posts || [];
  return posts.find((post) => post.slug === slug) || null;
};

const waitForPostStatus = async (slug, status) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const post = await fetchPostBySlug(slug);
    if (post?.status === status) {
      return post;
    }
    await sleep(250);
  }

  throw new Error(`Blog post ${slug} did not reach status ${status}`);
};

const assertPublicPost = async (slug, categoryId, tagId) => {
  const bySlugPayload = await requestApi(`/api/sites/${SITE_ID}/blog?slug=${encodeURIComponent(slug)}`);
  const post = bySlugPayload.data?.post || bySlugPayload.post;
  assert(post?.slug === slug && post.status === 'published', `Public slug endpoint did not return published post ${slug}: ${JSON.stringify(bySlugPayload).slice(0, 500)}`);

  const filteredPayload = await requestApi(`/api/sites/${SITE_ID}/blog?categoryId=${encodeURIComponent(categoryId)}&tagId=${encodeURIComponent(tagId)}`);
  const posts = filteredPayload.data?.posts || filteredPayload.posts || [];
  assert(posts.some((candidate) => candidate.slug === slug), `Public taxonomy feed did not include ${slug}: ${JSON.stringify(filteredPayload).slice(0, 500)}`);

  return post;
};

const fetchJson = async (endpoint) => {
  const response = await fetch(`http://127.0.0.1:${PORT}${endpoint}`);
  if (!response.ok) {
    throw new Error(`${endpoint} returned ${response.status}`);
  }
  return response.json();
};

const waitForCdp = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const pages = await fetchJson('/json/list');
      const page = pages.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) {
        return page;
      }
    } catch {
      await sleep(100);
    }
  }

  throw new Error(`Chrome DevTools did not start on port ${PORT}`);
};

const connectCdp = (webSocketDebuggerUrl) => {
  const socket = new WebSocket(webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);

    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id);
      pending.delete(message.id);

      if (message.error) {
        request.reject(new Error(JSON.stringify(message.error)));
      } else {
        request.resolve(message.result);
      }
    }
  });

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  return {
    opened,
    close: () => socket.close(),
    send: (method, params = {}) => {
      const messageId = id += 1;
      socket.send(JSON.stringify({ id: messageId, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(messageId, { resolve, reject });
      });
    },
  };
};

const authStorageScript = (sessionToken) => `
localStorage.setItem('backy-auth-storage', ${JSON.stringify(JSON.stringify({
  state: {
    user: { id: 'user-admin', email: 'admin@backy.io', fullName: 'Admin User', role: 'admin' },
    session: {
      token: sessionToken,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      authMode: 'local-demo',
    },
  },
  version: 0,
}))});
window.__backyOpenedUrls = [];
window.open = (url) => {
  window.__backyOpenedUrls.push(String(url || ''));
  return null;
};
`;

const evaluate = async (client, expression) => {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(`Runtime evaluation failed: ${JSON.stringify(result.exceptionDetails)}`);
  }

  return result.result.value;
};

const navigateToBlog = async (client, title) => {
  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}/blog?siteId=${encodeURIComponent(SITE_ID)}` });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="blog-command-center"]')) &&
        Boolean(document.querySelector('[data-testid="blog-taxonomy-manager"]')) &&
        Boolean(document.querySelector('#blog-bulk')) &&
        Boolean(document.querySelector('#blog-filters')) &&
        Boolean(document.querySelector('#blog-posts')) &&
        document.body?.innerText?.includes(${JSON.stringify(title)}),
      command: Boolean(document.querySelector('[data-testid="blog-command-center"]')),
      taxonomy: Boolean(document.querySelector('[data-testid="blog-taxonomy-manager"]')),
      bulk: Boolean(document.querySelector('#blog-bulk')),
      filters: Boolean(document.querySelector('#blog-filters')),
      posts: Boolean(document.querySelector('#blog-posts')),
      titleFound: document.body?.innerText?.includes(${JSON.stringify(title)}) || false,
      body: document.body?.innerText?.slice(0, 400) || '',
    }))()`);

    if (state.ready) {
      return state;
    }

    if (attempt === 119) {
      throw new Error(`Blog list page did not render expected controls: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const assertBlogListLayout = async (client, { title, categoryName, tagName, authorName }) => {
  const state = await evaluate(client, `(() => ({
    commandCenter: Boolean(document.querySelector('[data-testid="blog-command-center"]')),
    commandCreate: Boolean(document.querySelector('[data-testid="blog-command-create"]')),
    apiContract: document.body?.innerText?.includes('Blog API contract') || false,
    publicPostsApi: document.body?.innerText?.includes('/api/sites/${SITE_ID}/blog') || false,
    taxonomyManager: Boolean(document.querySelector('[data-testid="blog-taxonomy-manager"]')),
    previewEndpoint: document.body?.innerText?.includes('/preview') || false,
    bulkControl: Boolean(document.querySelector('#blog-bulk select')),
    filters: Boolean(document.querySelector('#blog-filters input[placeholder="Search posts..."]')),
    category: document.body?.innerText?.includes(${JSON.stringify(categoryName)}) || false,
    tag: document.body?.innerText?.includes(${JSON.stringify(tagName)}) || false,
    author: ${JSON.stringify(Boolean(authorName))} ? document.body?.innerText?.includes(${JSON.stringify(authorName || '')}) : true,
    post: document.body?.innerText?.includes(${JSON.stringify(title)}) || false,
    previewButton: Boolean(Array.from(document.querySelectorAll('button')).find((button) => button.getAttribute('title') === 'Preview post')),
    editButton: Boolean(Array.from(document.querySelectorAll('button')).find((button) => button.getAttribute('title') === 'Edit post')),
  }))()`);

  assert(Object.values(state).every(Boolean), `Blog list layout missing expected regions: ${JSON.stringify(state)}`);
  return state;
};

const setInputValue = async (client, selector, value) => evaluate(client, `(() => {
  const node = document.querySelector(${JSON.stringify(selector)});
  if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) {
    return false;
  }
  const proto = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(node, ${JSON.stringify(value)});
  node.dispatchEvent(new Event('input', { bubbles: true }));
  node.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`);

const setSelectValue = async (client, selector, value) => evaluate(client, `(() => {
  const node = document.querySelector(${JSON.stringify(selector)});
  if (!(node instanceof HTMLSelectElement)) {
    return false;
  }
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  setter?.call(node, ${JSON.stringify(value)});
  node.dispatchEvent(new Event('input', { bubbles: true }));
  node.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`);

const assertPostVisible = async (client, title, message) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      visible: document.body?.innerText?.includes(${JSON.stringify(title)}) || false,
      body: document.body?.innerText?.slice(0, 500) || '',
    }))()`);
    if (state.visible) {
      return state;
    }
    if (attempt === 39) {
      throw new Error(`${message}: ${JSON.stringify(state)}`);
    }
    await sleep(200);
  }

  return null;
};

const exerciseFilters = async (client, { title, categoryId, tagId, authorId }) => {
  assert(await setInputValue(client, '#blog-filters input[placeholder="Search posts..."]', title), 'Unable to set blog search field');
  await assertPostVisible(client, title, 'Search filter hid the smoke post');

  assert(await setSelectValue(client, '#blog-filters select:nth-of-type(1)', categoryId), 'Unable to set category filter');
  await assertPostVisible(client, title, 'Category filter hid the smoke post');

  assert(await setSelectValue(client, '#blog-filters select:nth-of-type(2)', tagId), 'Unable to set tag filter');
  await assertPostVisible(client, title, 'Tag filter hid the smoke post');

  if (authorId) {
    assert(await setSelectValue(client, '#blog-filters select:nth-of-type(3)', authorId), 'Unable to set author filter');
    await assertPostVisible(client, title, 'Author filter hid the smoke post');
  }

  const cleared = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('#blog-filters button')).find((candidate) => (
      (candidate.textContent || '').trim() === 'Clear Filters'
    ));
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return false;
    }
    button.click();
    return true;
  })()`);
  assert(cleared, 'Unable to clear blog filters');
  await assertPostVisible(client, title, 'Smoke post disappeared after clearing filters');
};

const waitForTaxonomy = async ({ kind, slug, exists = true }) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const items = kind === 'category' ? await listBlogCategories() : await listBlogTags();
    const item = items.find((candidate) => candidate.slug === slug);
    if (exists && item) {
      return item;
    }
    if (!exists && !item) {
      return null;
    }
    await sleep(250);
  }

  throw new Error(`Blog ${kind} ${slug} ${exists ? 'was not created' : 'was not deleted'}`);
};

const clickButtonByTestId = async (client, testId) => {
  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector(${JSON.stringify(`[data-testid="${testId}"]`)});
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { ok: false, found: Boolean(button), disabled: button instanceof HTMLButtonElement ? button.disabled : null };
    }
    button.click();
    return { ok: true };
  })()`);
  assert(clicked.ok, `Unable to click ${testId}: ${JSON.stringify(clicked)}`);
};

const clickButtonByLabel = async (client, label) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const clicked = await evaluate(client, `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.getAttribute('aria-label') === ${JSON.stringify(label)});
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return { ok: false, found: Boolean(button), disabled: button instanceof HTMLButtonElement ? button.disabled : null };
      }
      button.click();
      return { ok: true };
    })()`);
    if (clicked.ok) {
      return;
    }
    if (attempt === 79) {
      throw new Error(`Unable to click ${label}: ${JSON.stringify(clicked)}`);
    }
    await sleep(200);
  }
};

const manageTaxonomyInUi = async (client, suffix) => {
  const categoryName = `Smoke UI Category ${suffix}`;
  const categorySlug = `smoke-ui-category-${suffix}`;
  const updatedCategoryName = `${categoryName} Updated`;
  const updatedCategorySlug = `${categorySlug}-updated`;
  const tagName = `Smoke UI Tag ${suffix}`;
  const tagSlug = `smoke-ui-tag-${suffix}`;
  const updatedTagName = `${tagName} Updated`;
  const updatedTagSlug = `${tagSlug}-updated`;

  assert(await setInputValue(client, '[data-testid="blog-category-name"]', categoryName), 'Unable to set category name');
  assert(await setInputValue(client, '[data-testid="blog-category-slug"]', categorySlug), 'Unable to set category slug');
  assert(await setInputValue(client, '[data-testid="blog-category-description"]', 'Created from the rendered taxonomy manager.'), 'Unable to set category description');
  assert(await setInputValue(client, '[data-testid="blog-category-color"]', '#7c3aed'), 'Unable to set category color');
  await clickButtonByTestId(client, 'blog-category-save');
  const createdCategory = await waitForTaxonomy({ kind: 'category', slug: categorySlug });
  assert(createdCategory.color === '#7c3aed', `Category color did not persist: ${JSON.stringify(createdCategory)}`);

  await clickButtonByLabel(client, `Edit category ${categoryName}`);
  assert(await setInputValue(client, '[data-testid="blog-category-name"]', updatedCategoryName), 'Unable to update category name');
  assert(await setInputValue(client, '[data-testid="blog-category-slug"]', updatedCategorySlug), 'Unable to update category slug');
  assert(await setInputValue(client, '[data-testid="blog-category-description"]', 'Updated from the rendered taxonomy manager.'), 'Unable to update category description');
  await clickButtonByTestId(client, 'blog-category-save');
  const updatedCategory = await waitForTaxonomy({ kind: 'category', slug: updatedCategorySlug });
  assert(updatedCategory.name === updatedCategoryName, `Category edit did not persist: ${JSON.stringify(updatedCategory)}`);

  assert(await setInputValue(client, '[data-testid="blog-tag-name"]', tagName), 'Unable to set tag name');
  assert(await setInputValue(client, '[data-testid="blog-tag-slug"]', tagSlug), 'Unable to set tag slug');
  assert(await setInputValue(client, '[data-testid="blog-tag-description"]', 'Created from the rendered taxonomy manager.'), 'Unable to set tag description');
  await clickButtonByTestId(client, 'blog-tag-save');
  await waitForTaxonomy({ kind: 'tag', slug: tagSlug });

  await clickButtonByLabel(client, `Edit tag ${tagName}`);
  assert(await setInputValue(client, '[data-testid="blog-tag-name"]', updatedTagName), 'Unable to update tag name');
  assert(await setInputValue(client, '[data-testid="blog-tag-slug"]', updatedTagSlug), 'Unable to update tag slug');
  assert(await setInputValue(client, '[data-testid="blog-tag-description"]', 'Updated from the rendered taxonomy manager.'), 'Unable to update tag description');
  await clickButtonByTestId(client, 'blog-tag-save');
  const updatedTag = await waitForTaxonomy({ kind: 'tag', slug: updatedTagSlug });
  assert(updatedTag.name === updatedTagName, `Tag edit did not persist: ${JSON.stringify(updatedTag)}`);

  await clickButtonByLabel(client, `Delete category ${updatedCategoryName}`);
  await clickButtonByTestId(client, 'blog-taxonomy-confirm-delete');
  await waitForTaxonomy({ kind: 'category', slug: updatedCategorySlug, exists: false });

  await clickButtonByLabel(client, `Delete tag ${updatedTagName}`);
  await clickButtonByTestId(client, 'blog-taxonomy-confirm-delete');
  await waitForTaxonomy({ kind: 'tag', slug: updatedTagSlug, exists: false });

  return {
    categorySlug: updatedCategorySlug,
    tagSlug: updatedTagSlug,
  };
};

const clickPreview = async (client, title) => {
  const clicked = await evaluate(client, `(() => {
    const rows = Array.from(document.querySelectorAll('tr'));
    const row = rows.find((candidate) => (candidate.textContent || '').includes(${JSON.stringify(title)}));
    const button = Array.from((row || document).querySelectorAll('button')).find((candidate) => (
      candidate.getAttribute('title') === 'Preview post'
    ));
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { ok: false, hasRow: Boolean(row), disabled: button instanceof HTMLButtonElement ? button.disabled : null };
    }
    button.click();
    return { ok: true };
  })()`);
  assert(clicked.ok, `Unable to click preview button: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const opened = await evaluate(client, `window.__backyOpenedUrls || []`);
    if (opened.some((url) => url.includes('/blog') && url.includes('previewToken='))) {
      return opened;
    }
    await sleep(250);
  }

  const state = await evaluate(client, `(() => ({
    opened: window.__backyOpenedUrls || [],
    errorText: Array.from(document.querySelectorAll('.border-amber-200, [role="alert"]')).map((node) => node.textContent?.trim()).filter(Boolean),
    previewing: Array.from(document.querySelectorAll('button')).filter((button) => button.getAttribute('title') === 'Preview post').map((button) => ({
      disabled: button.disabled,
      text: button.textContent || '',
    })),
    body: document.body?.innerText?.slice(0, 800) || '',
  }))()`);
  throw new Error(`Preview action did not open a tokenized blog preview URL: ${JSON.stringify(state)}`);
};

const bulkPublishPost = async (client, title) => {
  const selected = await evaluate(client, `(() => {
    const input = Array.from(document.querySelectorAll('input[type="checkbox"]')).find((candidate) => (
      candidate.getAttribute('aria-label') === ${JSON.stringify(`Select ${title}`)}
    ));
    if (!(input instanceof HTMLInputElement) || input.disabled) {
      return { ok: false, found: Boolean(input), disabled: input instanceof HTMLInputElement ? input.disabled : null };
    }
    if (!input.checked) {
      input.click();
    }
    return { ok: input.checked };
  })()`);
  assert(selected.ok, `Unable to select smoke post row: ${JSON.stringify(selected)}`);

  assert(await setSelectValue(client, '#blog-bulk select', 'publish'), 'Unable to choose blog bulk publish action');

  const submitted = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('#blog-bulk button')).find((candidate) => (
      /Publish/.test(candidate.textContent || '')
    ));
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { ok: false, label: button?.textContent || null, disabled: button instanceof HTMLButtonElement ? button.disabled : null };
    }
    button.click();
    return { ok: true };
  })()`);
  assert(submitted.ok, `Unable to submit blog bulk publish action: ${JSON.stringify(submitted)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      publishedBadge: document.body?.innerText?.includes('Published') || false,
      notice: document.body?.innerText?.includes('published.') || false,
      body: document.body?.innerText?.slice(0, 600) || '',
    }))()`);
    if (state.publishedBadge || state.notice) {
      return state;
    }
    if (attempt === 79) {
      throw new Error(`Blog bulk publish action did not settle: ${JSON.stringify(state)}`);
    }
    await sleep(200);
  }

  return null;
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-blog-list-${Date.now()}`);
  const childProcess = spawn(CHROME_BIN, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1720,1180',
    'about:blank',
  ], { stdio: 'ignore' });

  return { childProcess, userDataDir };
};

const cleanup = async ({ client, childProcess, userDataDir, postId, categoryId, tagId }) => {
  if (client) {
    try {
      await client.send('Browser.close');
    } catch {
      // Chrome may already be closing.
    }
    client.close();
  }

  if (childProcess && !(await waitForExit(childProcess))) {
    childProcess.kill('SIGTERM');
    if (!(await waitForExit(childProcess, 1000))) {
      childProcess.kill('SIGKILL');
    }
  }

  if (userDataDir) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }

  if (postId) {
    try {
      await deleteBlogPost(postId);
    } catch {
      // The smoke creates a temporary post and deletes it best-effort.
    }
  }

  if (categoryId) {
    try {
      await deleteBlogCategory(categoryId);
    } catch {
      // The smoke creates a temporary category and deletes it best-effort.
    }
  }

  if (tagId) {
    try {
      await deleteBlogTag(tagId);
    } catch {
      // The smoke creates a temporary tag and deletes it best-effort.
    }
  }
};

const main = async () => {
  await loginAdminApi();
  let client;
  let childProcess;
  let userDataDir;
  let postId;
  let categoryId;
  let tagId;
  const suffix = Date.now().toString(36);
  const categoryName = `Smoke Editorial ${suffix}`;
  const categorySlug = `smoke-editorial-${suffix}`;
  const tagName = `Smoke Launch ${suffix}`;
  const tagSlug = `smoke-launch-${suffix}`;
  const title = `Smoke blog list ${suffix}`;
  const slug = `smoke-blog-list-${suffix}`;

  try {
    const [category, tag, authors] = await Promise.all([
      createBlogCategory({ name: categoryName, slug: categorySlug }),
      createBlogTag({ name: tagName, slug: tagSlug }),
      listAuthors(),
    ]);
    categoryId = category.id;
    tagId = tag.id;
    const author = authors[0] || null;
    const authorId = author?.id || 'admin';
    const post = await createBlogPost({ title, slug, categoryId, tagId, authorId });
    postId = post.id;

    ({ childProcess, userDataDir } = launchChrome());
    const target = await waitForCdp();
    client = connectCdp(target.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1720,
      height: 1180,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: authStorageScript(apiAdminSessionToken) });

    await navigateToBlog(client, title);
    await assertBlogListLayout(client, { title, categoryName, tagName, authorName: author?.name || null });
    const taxonomyUi = await manageTaxonomyInUi(client, suffix);
    await exerciseFilters(client, { title, categoryId, tagId, authorId });
    const previewUrls = await clickPreview(client, title);
    await bulkPublishPost(client, title);
    await waitForPostStatus(slug, 'published');
    await assertPublicPost(slug, categoryId, tagId);

    await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }).then((result) => {
      fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(result.data, 'base64'));
    });

    await deleteBlogPost(postId);
    postId = null;
    await deleteBlogCategory(categoryId);
    categoryId = null;
    await deleteBlogTag(tagId);
    tagId = null;

    console.log(JSON.stringify({
      ok: true,
      siteId: SITE_ID,
      title,
      slug,
      categorySlug,
      tagSlug,
      taxonomyUi,
      previewUrl: previewUrls[previewUrls.length - 1],
      screenshot: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, postId, categoryId, tagId });
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
