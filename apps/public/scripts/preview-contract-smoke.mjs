#!/usr/bin/env node

const baseUrl = (process.env.BACKY_PUBLIC_CONTRACT_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

const checks = [];
let adminSessionToken = '';

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
    // HTML responses are expected for hosted preview smoke checks.
  }

  return {
    response,
    text,
    json,
    url,
  };
}

async function loginAdminApi() {
  if (adminSessionToken) {
    return adminSessionToken;
  }

  const { response, json, url } = await request('/api/admin/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: 'admin@backy.io',
      password: process.env.BACKY_ADMIN_DEMO_PASSWORD || 'admin123',
    }),
  });

  assert(response.status === 200, `${url} expected admin login 200, got ${response.status}`);
  assert(json?.success === true && json?.data?.session?.token, `${url} missing admin session token`);
  adminSessionToken = json.data.session.token;
  return adminSessionToken;
}

async function record(name, fn) {
  const startedAt = Date.now();
  await fn();
  checks.push({ name, ms: Date.now() - startedAt });
}

async function createPreview(path) {
  const sessionToken = await loginAdminApi();
  const { response, json, url } = await request(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ ttlSeconds: 600 }),
  });

  assert(response.status === 200, `${url} expected 200, got ${response.status}`);
  assert(json?.success === true, `${url} expected success envelope`);
  assert(json?.data?.previewToken, `${url} missing previewToken`);
  assert(json?.data?.expiresAt, `${url} missing expiresAt`);

  return json.data;
}

await record('draft page API is blocked without token', async () => {
  const { response, url } = await request('/api/sites/site-demo/pages?slug=draft-page');
  assert(response.status === 404, `${url} expected 404, got ${response.status}`);
});

let pagePreview;
await record('admin page preview creates hosted/render/API URLs', async () => {
  pagePreview = await createPreview('/api/admin/sites/site-demo/pages/page-draft/preview');
  assert(pagePreview.hostedUrl, 'page preview missing hostedUrl');
  assert(pagePreview.renderUrl, 'page preview missing renderUrl');
  assert(pagePreview.pageApiUrl, 'page preview missing pageApiUrl');
});

await record('page preview API exposes draft page only with token', async () => {
  const { response, json, url } = await request(pagePreview.pageApiUrl);
  assert(response.status === 200, `${url} expected 200, got ${response.status}`);
  assert(json?.page?.id === 'page-draft', `${url} returned wrong page`);
  assert(json?.page?.status === 'draft', `${url} expected draft status`);
});

await record('render preview API exposes draft route only with token', async () => {
  const { response, json, url } = await request(pagePreview.renderUrl);
  assert(response.status === 200, `${url} expected 200, got ${response.status}`);
  assert(json?.success === true, `${url} expected success envelope`);
  assert(json?.data?.route?.status === 'draft', `${url} expected draft route status`);
});

await record('hosted page preview renders draft HTML with noindex', async () => {
  const { response, text, url } = await request(pagePreview.hostedUrl);
  assert(response.status === 200, `${url} expected 200, got ${response.status}`);
  assert(text.includes('Draft-only page'), `${url} missing draft page content`);
  assert(text.includes('noindex'), `${url} missing noindex metadata`);
});

await record('draft post API is blocked without token', async () => {
  const { response, url } = await request('/api/sites/site-demo/blog?slug=cms-parity');
  assert(response.status === 404, `${url} expected 404, got ${response.status}`);
});

await record('hosted draft post is blocked without token', async () => {
  const { response, url } = await request('/sites/demo/blog/cms-parity');
  assert(response.status === 404, `${url} expected 404, got ${response.status}`);
});

let postPreview;
await record('admin post preview creates hosted/API URLs', async () => {
  postPreview = await createPreview('/api/admin/sites/site-demo/blog/post-product/preview');
  assert(postPreview.hostedUrl, 'post preview missing hostedUrl');
  assert(postPreview.postApiUrl, 'post preview missing postApiUrl');
});

await record('post preview API exposes draft post only with token', async () => {
  const { response, json, url } = await request(postPreview.postApiUrl);
  assert(response.status === 200, `${url} expected 200, got ${response.status}`);
  assert(json?.post?.id === 'post-product', `${url} returned wrong post`);
  assert(json?.post?.status === 'draft', `${url} expected draft status`);
});

await record('hosted post preview renders draft HTML with noindex', async () => {
  const { response, text, url } = await request(postPreview.hostedUrl);
  assert(response.status === 200, `${url} expected 200, got ${response.status}`);
  assert(text.includes('split-brain contracts'), `${url} missing draft post content`);
  assert(text.includes('noindex'), `${url} missing noindex metadata`);
});

await record('published hosted post remains public', async () => {
  const { response, text, url } = await request('/sites/demo/blog/welcome');
  assert(response.status === 200, `${url} expected 200, got ${response.status}`);
  assert(text.includes('Backy CMS helps you ship'), `${url} missing published post content`);
});

await record('hosted blog archive renders published post cards and filters', async () => {
  const { response, text, url } = await request('/sites/demo/blog');
  assert(response.status === 200, `${url} expected 200, got ${response.status}`);
  assert(text.includes('backy-blog-archive'), `${url} missing archive shell`);
  assert(text.includes('Welcome to Backy'), `${url} missing published post card`);
  assert(text.includes('href="/sites/demo/blog/welcome"'), `${url} missing hosted post link`);
  assert(!text.includes('Building CMS parity page by page'), `${url} rendered draft post in public archive`);
  assert(text.includes('News'), `${url} missing category filter`);
  assert(text.includes('Getting Started'), `${url} missing tag filter`);
});

await record('hosted blog archive supports taxonomy and empty filters', async () => {
  const category = await request('/sites/demo/blog?category=news');
  assert(category.response.status === 200, `${category.url} expected 200, got ${category.response.status}`);
  assert(category.text.includes('News Articles'), `${category.url} missing category metadata`);
  assert(category.text.includes('backy-blog-kicker">News') || category.text.includes('children":["News"," · "'), `${category.url} missing active category label`);
  assert(category.text.includes('Welcome to Backy'), `${category.url} missing category post`);

  const empty = await request('/sites/demo/blog?search=definitely-no-post');
  assert(empty.response.status === 200, `${empty.url} expected 200, got ${empty.response.status}`);
  assert(empty.text.includes('No posts found'), `${empty.url} missing empty state`);
});

console.log(`Preview contract smoke passed against ${baseUrl}`);
for (const check of checks) {
  console.log(`- ${check.name} (${check.ms}ms)`);
}
