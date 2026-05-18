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
const VISUAL_SCREENSHOT_DIR = process.env.BACKY_BLOG_LIST_VISUAL_DIR || path.join(os.tmpdir(), 'backy-blog-list-visual');
const DESKTOP_VISUAL_SCREENSHOT_PATH = path.join(VISUAL_SCREENSHOT_DIR, 'backy-blog-list-desktop.png');
let apiAdminSessionToken = '';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertBlogTaxonomyEmptyStatesUseSharedComponent = () => {
  const source = fs.readFileSync(new URL('../src/routes/blog.tsx', import.meta.url), 'utf8');
  assert(source.includes("import { EmptyState } from '@/components/ui/EmptyState';"), 'Blog list route must use the shared EmptyState component');
  assert(source.includes('title="No categories yet"'), 'Blog taxonomy manager must keep the categories empty-state title visible');
  assert(source.includes('Create category terms to power blog archive navigation'), 'Blog categories empty state must explain frontend archive/filter value');
  assert(source.includes('title="No tags yet"'), 'Blog taxonomy manager must keep the tags empty-state title visible');
  assert(source.includes('Create tags to expose lightweight topic filters'), 'Blog tags empty state must explain frontend topic/filter value');
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
    const errorPayload = typeof payload.error === 'string'
      ? payload
      : payload.error || payload;
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(errorPayload).slice(0, 500)}`);
  }

  return payload;
};

const loginAdminApi = async () => {
  const login = (twoFactorCode) => fetch(`${API_BASE_URL}/api/admin/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: 'admin@backy.io',
      password: process.env.BACKY_ADMIN_DEMO_PASSWORD || 'admin123',
      ...(twoFactorCode ? { twoFactorCode } : {}),
    }),
  });

  let response = await login();
  let payload = await response.json().catch(() => ({}));
  const smokeMfaCode = process.env.BACKY_BLOG_LIST_SMOKE_MFA_CODE
    || process.env.BACKY_ADMIN_MFA_CODE
    || process.env.BACKY_ADMIN_2FA_CODE;
  if (!response.ok && payload.error?.code === 'MFA_REQUIRED' && smokeMfaCode) {
    response = await login(smokeMfaCode);
    payload = await response.json().catch(() => ({}));
  }

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

const recordBlogPostRevision = async ({ postId, excerpt, expectedUpdatedAt }) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/blog/${postId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      excerpt,
      revisionNote: 'Blog list revision smoke snapshot',
      expectedUpdatedAt,
    }),
  });
  const post = payload.data?.post || payload.post;
  assert(post?.id, `Revision snapshot update did not return a post: ${JSON.stringify(payload).slice(0, 500)}`);
  return post;
};

const submitBlogComment = async ({ postId, requestId }) => {
  const uniqueSuffix = String(requestId || Date.now()).replace(/[^a-z0-9-]/gi, '').slice(-24) || Date.now().toString(36);
  const uniqueOctet = Math.max(2, Math.min(254, (Number.parseInt(uniqueSuffix.slice(-6), 36) % 253) + 2));
  const payload = await requestApi(`/api/sites/${SITE_ID}/blog/${postId}/comments`, {
    method: 'POST',
    headers: {
      'x-forwarded-for': `198.51.100.${uniqueOctet}`,
    },
    body: JSON.stringify({
      authorName: `Blog List Smoke Reader ${uniqueSuffix}`,
      authorEmail: `blog-list-smoke-${uniqueSuffix}@example.com`,
      content: `Temporary comment proving the blog list row shows moderation counts. ${uniqueSuffix}`,
      requestId,
      startedAt: Date.now() - 5000,
      rateLimitBypass: true,
    }),
  });
  const comment = payload.data?.comment || payload.comment;
  assert(comment?.id, `Submit blog comment did not return a comment: ${JSON.stringify(payload).slice(0, 500)}`);
  return comment;
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

const assertPublicSearchAndArchiveFeeds = async ({ slug, title, publishedAt }) => {
  const searchPayload = await requestApi(`/api/sites/${SITE_ID}/blog?q=${encodeURIComponent(title)}`);
  const searchPosts = searchPayload.data?.posts || searchPayload.posts || [];
  assert(searchPosts.some((candidate) => candidate.slug === slug), `Public search feed did not include ${slug}: ${JSON.stringify(searchPayload).slice(0, 500)}`);

  const sourceDate = publishedAt ? new Date(publishedAt) : new Date();
  const safeDate = Number.isNaN(sourceDate.getTime()) ? new Date() : sourceDate;
  const year = safeDate.getUTCFullYear();
  const month = safeDate.getUTCMonth() + 1;
  const archivePayload = await requestApi(`/api/sites/${SITE_ID}/blog?year=${year}&month=${month}`);
  const archivePosts = archivePayload.data?.posts || archivePayload.posts || [];
  assert(archivePosts.some((candidate) => candidate.slug === slug), `Public archive feed did not include ${slug}: ${JSON.stringify(archivePayload).slice(0, 500)}`);

  return { year, month };
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

const seedBrowserSessionCookie = async (client, sessionToken) => {
  await client.send('Network.enable');
  await client.send('Network.setCookie', {
    url: API_BASE_URL,
    name: 'backy_admin_session',
    value: sessionToken,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  });
};

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

const captureScreenshot = async (client, screenshotPath, options = {}) => {
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  const screenshot = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    ...options,
  });
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  return screenshotPath;
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
    searchFeed: document.body?.innerText?.includes('?q=') || false,
    archiveFeed: document.body?.innerText?.includes('?year=') || false,
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
    seoToggle: Boolean(document.querySelector('[data-testid^="blog-post-seo-noindex-"]')),
    commentSummary: Boolean(document.querySelector('[data-testid^="blog-post-comments-"]')),
    revisionSummary: Boolean(document.querySelector('[data-testid^="blog-post-revisions-"]')) &&
      document.body?.innerText?.includes('Blog list revision smoke snapshot'),
  }))()`);

  assert(Object.values(state).every(Boolean), `Blog list layout missing expected regions: ${JSON.stringify(state)}`);
  return state;
};

const assertBlogVisualState = async (client, label, screenshotPath, { title } = {}) => {
  await evaluate(client, `(() => {
    window.scrollTo(0, 0);
    return true;
  })()`);
  await sleep(250);

  const state = await evaluate(client, `(() => {
    const bodyText = document.body?.innerText || '';
    const commandCenter = document.querySelector('[data-testid="blog-command-center"]');
    const taxonomyManager = document.querySelector('[data-testid="blog-taxonomy-manager"]');
    const postsRegion = document.querySelector('#blog-posts');
    const filtersRegion = document.querySelector('#blog-filters');
    const bulkRegion = document.querySelector('#blog-bulk');
    const apiSnippetLabels = Array.from(document.querySelectorAll('#blog-api code, #blog-api [data-testid], #blog-api *'))
      .map((node) => node.textContent || '')
      .join('\\n');
    const tableRows = Array.from(document.querySelectorAll('#blog-posts tbody tr'));
    const commandRect = commandCenter?.getBoundingClientRect();
    const postsRect = postsRegion?.getBoundingClientRect();
    const taxonomyRect = taxonomyManager?.getBoundingClientRect();
    const expectedTitle = ${JSON.stringify(title || '')};

    return {
      label: ${JSON.stringify(label)},
      viewport: { width: window.innerWidth, height: window.innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      commandVisible: Boolean(commandRect && commandRect.width > 320 && commandRect.height > 120),
      filtersVisible: Boolean(filtersRegion),
      bulkVisible: Boolean(bulkRegion),
      postsVisible: Boolean(postsRect && postsRect.width > 320 && postsRect.height > 180),
      taxonomyVisible: Boolean(taxonomyRect && taxonomyRect.width > 280 && taxonomyRect.height > 180),
      tableRows: tableRows.length,
      hasExpectedPost: expectedTitle ? bodyText.includes(expectedTitle) : true,
      hasApiContract: bodyText.includes('Blog API contract'),
      hasPublicPostsSnippet: bodyText.includes('/api/sites/${SITE_ID}/blog'),
      hasSearchFeedSnippet: bodyText.includes('Search feed') && bodyText.includes('?q='),
      hasArchiveFeedSnippet: bodyText.includes('Archive feed') && bodyText.includes('?year=') && bodyText.includes('&month='),
      hasTaxonomyControls: bodyText.includes('Taxonomy manager') || bodyText.includes('Categories') && bodyText.includes('Tags'),
      hasSeoControls: Boolean(document.querySelector('[data-testid^="blog-post-seo-noindex-"]')),
      hasCommentSummary: Boolean(document.querySelector('[data-testid^="blog-post-comments-"]')),
      hasRevisionSummary: Boolean(document.querySelector('[data-testid^="blog-post-revisions-"]')) && bodyText.includes('Blog list revision smoke snapshot'),
      hasFrameworkOverlay: /Failed to compile|Unhandled Runtime Error|Vite Error|Internal Server Error/i.test(bodyText),
      apiSnippetLabels: apiSnippetLabels.slice(0, 1200),
      body: bodyText.slice(0, 3000),
    };
  })()`);

  assert(state.commandVisible, `${label} command center was not visibly rendered: ${JSON.stringify(state)}`);
  assert(state.filtersVisible && state.bulkVisible, `${label} filter or bulk controls missing: ${JSON.stringify(state)}`);
  assert(state.postsVisible && state.tableRows >= 1 && state.hasExpectedPost, `${label} post table did not render the expected smoke post: ${JSON.stringify(state)}`);
  assert(state.taxonomyVisible && state.hasTaxonomyControls, `${label} taxonomy manager was not visibly rendered: ${JSON.stringify(state)}`);
  assert(state.hasApiContract && state.hasPublicPostsSnippet, `${label} API contract snippets missing: ${JSON.stringify(state)}`);
  assert(state.hasSearchFeedSnippet && state.hasArchiveFeedSnippet, `${label} search/archive feed snippets missing: ${JSON.stringify(state)}`);
  assert(state.hasSeoControls && state.hasCommentSummary, `${label} row SEO/comment controls missing: ${JSON.stringify(state)}`);
  assert(state.hasRevisionSummary, `${label} row revision summary missing: ${JSON.stringify(state)}`);
  assert(state.horizontalOverflow <= 4, `${label} has horizontal overflow: ${JSON.stringify(state)}`);
  assert(!state.hasFrameworkOverlay, `${label} rendered a framework/runtime overlay: ${JSON.stringify(state)}`);

  await captureScreenshot(client, screenshotPath);
  return { ...state, screenshotPath };
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
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const clicked = await evaluate(client, `(() => {
      const button = document.querySelector(${JSON.stringify(`[data-testid="${testId}"]`)});
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
      throw new Error(`Unable to click ${testId}: ${JSON.stringify(clicked)}`);
    }
    await sleep(200);
  }
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

const toggleNoIndexInUi = async (client, postId) => {
  const before = await fetchPostBySlugFromAdminId(postId);
  assert(before?.updatedAt, `Blog post ${postId} did not expose updatedAt before SEO toggle: ${JSON.stringify(before).slice(0, 500)}`);
  const nextNoIndex = before.meta?.noIndex !== true;

  const captureInstalled = await evaluate(client, `(() => {
    window.__backyBlogSeoPatchBodies = [];
    if (!window.__backyOriginalFetchForBlogSeo) {
      window.__backyOriginalFetchForBlogSeo = window.fetch.bind(window);
      window.fetch = async (input, init = {}) => {
        const url = String(input instanceof Request ? input.url : input || '');
        const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
        if (method === 'PATCH' && url.includes(${JSON.stringify(`/api/admin/sites/${SITE_ID}/blog/${postId}`)})) {
          let body = init?.body || '';
          if (typeof body !== 'string') {
            body = String(body || '');
          }
          let parsed = null;
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = body;
          }
          window.__backyBlogSeoPatchBodies.push({ url, method, body: parsed });
        }
        return window.__backyOriginalFetchForBlogSeo(input, init);
      };
    }
    return true;
  })()`);
  assert(captureInstalled, 'Unable to install blog SEO PATCH capture');

  await clickButtonByTestId(client, `blog-post-seo-noindex-${postId}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const post = await fetchPostBySlugFromAdminId(postId);
    const captured = await evaluate(client, `window.__backyBlogSeoPatchBodies || []`);
    const seoPatch = captured.find((entry) => entry?.body?.meta && Object.prototype.hasOwnProperty.call(entry.body.meta, 'noIndex'));
    if (post?.meta?.noIndex === nextNoIndex && seoPatch) {
      assert(
        seoPatch.body.expectedUpdatedAt === before.updatedAt,
        `Blog list row SEO toggle did not send expectedUpdatedAt guard: ${JSON.stringify(seoPatch).slice(0, 500)}`,
      );
      assert(
        seoPatch.body.meta.noIndex === nextNoIndex,
        `Blog list row SEO toggle sent unexpected noIndex value: ${JSON.stringify(seoPatch).slice(0, 500)}`,
      );
      return post;
    }
    await sleep(250);
  }

  throw new Error(`Blog post ${postId} did not persist guarded noIndex toggle from list row`);
};

const fetchPostBySlugFromAdminId = async (postId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/blog?limit=100`);
  const posts = payload.data?.posts || payload.posts || [];
  return posts.find((post) => post.id === postId) || null;
};

const assertRowSeoAndComments = async (client, { postId }) => {
  const expectedTargetIdParam = `targetId=${encodeURIComponent(postId)}`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const seo = document.querySelector(${JSON.stringify(`[data-testid="blog-post-seo-noindex-${postId}"]`)});
      const comments = document.querySelector(${JSON.stringify(`[data-testid="blog-post-comments-${postId}"]`)});
      return {
        seoText: seo?.textContent || '',
        commentsText: comments?.textContent || '',
        commentsHref: comments instanceof HTMLAnchorElement ? comments.href : '',
      };
    })()`);
    if (
      /Index|Noindex/.test(state.seoText) &&
      /1 comments/.test(state.commentsText) &&
      state.commentsHref.includes('/comments') &&
      state.commentsHref.includes('targetType=post') &&
      state.commentsHref.includes(expectedTargetIdParam)
    ) {
      return state;
    }
    if (attempt === 79) {
      throw new Error(`Blog row did not expose SEO/comment controls: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
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

const bulkPublishPost = async (client, title, postId) => {
  const before = await fetchPostBySlugFromAdminId(postId);
  assert(before?.updatedAt, `Blog post ${postId} did not expose updatedAt before bulk publish: ${JSON.stringify(before).slice(0, 500)}`);

  const captureInstalled = await evaluate(client, `(() => {
    window.__backyBlogStatusRequests = [];
    window.__backyBlogStatusPostBodies = [];
    if (!window.__backyOriginalFetchForBlogStatus) {
      window.__backyOriginalFetchForBlogStatus = window.fetch.bind(window);
      window.fetch = async (input, init = {}) => {
        const url = String(input instanceof Request ? input.url : input || '');
        const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
        if (method === 'GET' && url.includes(${JSON.stringify(`/api/admin/sites/${SITE_ID}/blog/${postId}/readiness`)})) {
          window.__backyBlogStatusRequests.push({ url, method });
        }
        if (method === 'POST' && url.includes(${JSON.stringify(`/api/admin/sites/${SITE_ID}/blog/${postId}/publish`)})) {
          let body = init?.body || '';
          if (typeof body !== 'string') {
            body = String(body || '');
          }
          let parsed = null;
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = body;
          }
          window.__backyBlogStatusPostBodies.push({ url, method, body: parsed });
          window.__backyBlogStatusRequests.push({ url, method });
        }
        return window.__backyOriginalFetchForBlogStatus(input, init);
      };
    }
    return true;
  })()`);
  assert(captureInstalled, 'Unable to install blog status POST capture');

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
      notice: document.body?.innerText?.includes('published.') || false,
      body: document.body?.innerText?.slice(0, 600) || '',
    }))()`);
    const captured = await evaluate(client, `window.__backyBlogStatusPostBodies || []`);
    const capturedRequests = await evaluate(client, `window.__backyBlogStatusRequests || []`);
    const statusPost = captured.find((entry) => entry?.body && Object.prototype.hasOwnProperty.call(entry.body, 'expectedUpdatedAt'));
    if (state.notice || statusPost) {
      const readinessIndex = capturedRequests.findIndex((entry) => entry?.method === 'GET' && String(entry.url || '').includes('/readiness'));
      const publishIndex = capturedRequests.findIndex((entry) => entry?.method === 'POST' && String(entry.url || '').includes('/publish'));
      assert(
        readinessIndex !== -1,
        `Blog list bulk publish did not preflight post readiness: ${JSON.stringify(capturedRequests).slice(0, 500)}`,
      );
      assert(
        publishIndex !== -1 && readinessIndex < publishIndex,
        `Blog list bulk publish did not preflight readiness before publishing: ${JSON.stringify(capturedRequests).slice(0, 500)}`,
      );
      assert(
        statusPost?.body?.expectedUpdatedAt === before.updatedAt,
        `Blog list bulk publish did not send expectedUpdatedAt guard: ${JSON.stringify(captured).slice(0, 500)}`,
      );
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
  assertBlogTaxonomyEmptyStatesUseSharedComponent();
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
    await recordBlogPostRevision({
      postId,
      excerpt: 'Temporary blog list smoke excerpt with a saved revision snapshot.',
      expectedUpdatedAt: post.updatedAt,
    });
    await submitBlogComment({
      postId,
      requestId: `blog-list-row-comment-${suffix}`,
    });

    ({ childProcess, userDataDir } = launchChrome());
    const target = await waitForCdp();
    client = connectCdp(target.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await seedBrowserSessionCookie(client, apiAdminSessionToken);
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1720,
      height: 1180,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: authStorageScript(apiAdminSessionToken) });

    await navigateToBlog(client, title);
    await assertBlogListLayout(client, { title, categoryName, tagName, authorName: author?.name || null });
    const visualState = await assertBlogVisualState(client, 'blog list desktop', DESKTOP_VISUAL_SCREENSHOT_PATH, { title });
    await assertRowSeoAndComments(client, { postId });
    await toggleNoIndexInUi(client, postId);
    const taxonomyUi = await manageTaxonomyInUi(client, suffix);
    await exerciseFilters(client, { title, categoryId, tagId, authorId });
    const previewUrls = await clickPreview(client, title);
    await bulkPublishPost(client, title, postId);
    const publishedPost = await waitForPostStatus(slug, 'published');
    await assertPublicPost(slug, categoryId, tagId);
    const archiveFeed = await assertPublicSearchAndArchiveFeeds({ slug, title, publishedAt: publishedPost.publishedAt });

    await captureScreenshot(client, SCREENSHOT_PATH);

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
      archiveFeed,
      visualState: {
        screenshotPath: visualState.screenshotPath,
        horizontalOverflow: visualState.horizontalOverflow,
        tableRows: visualState.tableRows,
      },
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
