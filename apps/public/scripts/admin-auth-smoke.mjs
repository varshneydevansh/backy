#!/usr/bin/env node

const baseUrl = (process.env.BACKY_PUBLIC_CONTRACT_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const adminApiKey = (process.env.BACKY_ADMIN_API_KEY || process.env.BACKY_ADMIN_SECRET_KEY || '').trim();
const adminDevOrigin = 'http://localhost:5173';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(path, init) {
  const url = `${baseUrl}${path}`;
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

function assertCorsAndRequestId(result) {
  assert(result.response.headers.get('access-control-allow-origin') === adminDevOrigin, `${result.url} missing CORS header`);
  assert(result.response.headers.get('x-backy-request-id'), `${result.url} missing request id header`);
  assert(result.response.headers.get('cache-control') === 'no-store', `${result.url} expected admin no-store cache control`);
  assert(result.response.headers.get('x-backy-cache-scope') === 'admin', `${result.url} expected admin cache scope`);
  assert(result.response.headers.get('x-backy-admin-contract-version') === 'backy.admin.v1', `${result.url} missing admin contract version`);
}

assert(adminApiKey, 'BACKY_ADMIN_API_KEY or BACKY_ADMIN_SECRET_KEY is required for admin auth smoke');

const checks = [];

async function record(name, fn) {
  const startedAt = Date.now();
  await fn();
  checks.push({ name, ms: Date.now() - startedAt });
}

await record('admin api rejects missing key', async () => {
  const result = await request('/api/admin/settings', {
    headers: {
      origin: adminDevOrigin,
    },
  });

  assert(result.response.status === 401, `${result.url} expected 401 without admin key, got ${result.response.status}`);
  assert(result.json?.success === false, `${result.url} expected error envelope`);
  assert(result.json?.error?.code === 'UNAUTHORIZED', `${result.url} expected UNAUTHORIZED error code`);
  assertCorsAndRequestId(result);
});

await record('admin api rejects wrong key', async () => {
  const result = await request('/api/admin/settings', {
    headers: {
      origin: adminDevOrigin,
      'x-backy-admin-key': `${adminApiKey}-wrong`,
    },
  });

  assert(result.response.status === 401, `${result.url} expected 401 with wrong admin key, got ${result.response.status}`);
  assert(result.json?.success === false, `${result.url} expected error envelope`);
  assert(result.json?.error?.code === 'UNAUTHORIZED', `${result.url} expected UNAUTHORIZED error code`);
  assertCorsAndRequestId(result);
});

await record('admin api accepts x-backy-admin-key', async () => {
  const result = await request('/api/admin/settings', {
    headers: {
      origin: adminDevOrigin,
      'x-backy-admin-key': adminApiKey,
    },
  });

  assert(result.response.status === 200, `${result.url} expected 200 with admin key, got ${result.response.status}`);
  assert(result.json?.success === true, `${result.url} expected success envelope`);
  assertCorsAndRequestId(result);
});

await record('admin api accepts bearer key', async () => {
  const result = await request('/api/admin/settings', {
    headers: {
      origin: adminDevOrigin,
      authorization: `Bearer ${adminApiKey}`,
    },
  });

  assert(result.response.status === 200, `${result.url} expected 200 with bearer key, got ${result.response.status}`);
  assert(result.json?.success === true, `${result.url} expected success envelope`);
  assertCorsAndRequestId(result);
});

console.log(`Admin auth smoke passed against ${baseUrl}`);
for (const check of checks) {
  console.log(`- ${check.name} (${check.ms}ms)`);
}
