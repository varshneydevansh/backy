#!/usr/bin/env node

const baseUrl = (process.env.BACKY_PUBLIC_CONTRACT_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

const checks = [];

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

async function record(name, fn) {
  const startedAt = Date.now();
  await fn();
  checks.push({ name, ms: Date.now() - startedAt });
}

async function createPreview(path) {
  const { response, json, url } = await request(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
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

console.log(`Preview contract smoke passed against ${baseUrl}`);
for (const check of checks) {
  console.log(`- ${check.name} (${check.ms}ms)`);
}
