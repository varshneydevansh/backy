#!/usr/bin/env node

const baseUrl = (process.env.BACKY_PUBLIC_CONTRACT_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const adminApiKey = (process.env.BACKY_ADMIN_API_KEY || process.env.BACKY_ADMIN_SECRET_KEY || '').trim();
const adminDevOrigin = 'http://localhost:5173';
const recoveryRateLimitMax = Math.min(Math.max(Number.parseInt(process.env.BACKY_AUTH_RECOVERY_RATE_LIMIT_MAX || '5', 10) || 5, 1), 100);

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

await record('admin api key cannot use owner-only permissions', async () => {
  const result = await request('/api/admin/settings', {
    method: 'POST',
    headers: {
      origin: adminDevOrigin,
      'content-type': 'application/json',
      'x-backy-admin-key': adminApiKey,
    },
    body: JSON.stringify({ action: 'regenerate-api-keys', scope: 'public' }),
  });

  assert(result.response.status === 403, `${result.url} expected 403 for owner-only API key route, got ${result.response.status}`);
  assert(result.json?.success === false, `${result.url} expected error envelope`);
  assert(result.json?.error?.code === 'FORBIDDEN_PERMISSION', `${result.url} expected FORBIDDEN_PERMISSION error code`);
  assertCorsAndRequestId(result);
});

await record('password recovery does not enumerate local accounts', async () => {
  const known = await request('/api/admin/auth/password-recovery', {
    method: 'POST',
    headers: {
      origin: adminDevOrigin,
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.10',
    },
    body: JSON.stringify({ email: 'admin@backy.io' }),
  });
  const unknown = await request('/api/admin/auth/password-recovery', {
    method: 'POST',
    headers: {
      origin: adminDevOrigin,
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.11',
    },
    body: JSON.stringify({ email: `missing-${Date.now()}@example.invalid` }),
  });

  assert(known.response.status === 200, `${known.url} expected 200 for known recovery request, got ${known.response.status}`);
  assert(unknown.response.status === 200, `${unknown.url} expected 200 for unknown recovery request, got ${unknown.response.status}`);
  assert(known.json?.success === true && unknown.json?.success === true, 'recovery requests should return success envelopes');
  assert(known.json?.data?.accepted === true && unknown.json?.data?.accepted === true, 'recovery requests should be accepted generically');
  assert(!Object.hasOwn(known.json?.data || {}, 'localRecovery'), 'known recovery response must not include localRecovery');
  assert(!Object.hasOwn(unknown.json?.data || {}, 'localRecovery'), 'unknown recovery response must not include localRecovery');
  assert(
    JSON.stringify(known.json.data) === JSON.stringify(unknown.json.data),
    'known and unknown recovery responses should have the same data envelope',
  );
  assertCorsAndRequestId(known);
  assertCorsAndRequestId(unknown);
});

await record('password recovery rate limits repeated requests', async () => {
  const email = `rate-limit-${Date.now()}@example.invalid`;
  const headers = {
    origin: adminDevOrigin,
    'content-type': 'application/json',
    'x-forwarded-for': '203.0.113.12',
  };
  let limited = null;

  for (let attempt = 0; attempt < recoveryRateLimitMax + 1; attempt += 1) {
    const result = await request('/api/admin/auth/password-recovery', {
      method: 'POST',
      headers,
      body: JSON.stringify({ email }),
    });
    if (result.response.status === 429) {
      limited = result;
      break;
    }
  }

  assert(limited, 'expected repeated password recovery requests to be rate limited');
  assert(limited.response.status === 429, `${limited.url} expected 429, got ${limited.response.status}`);
  assert(limited.json?.success === false, `${limited.url} expected error envelope`);
  assert(limited.json?.error?.code === 'RATE_LIMITED', `${limited.url} expected RATE_LIMITED error code`);
  assert(Number(limited.response.headers.get('retry-after')) > 0, `${limited.url} expected retry-after header`);
  assertCorsAndRequestId(limited);
});

console.log(`Admin auth smoke passed against ${baseUrl}`);
for (const check of checks) {
  console.log(`- ${check.name} (${check.ms}ms)`);
}
