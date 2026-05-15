#!/usr/bin/env node

const baseUrl = (process.env.BACKY_PUBLIC_CONTRACT_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const siteId = process.env.BACKY_MEDIA_QUOTA_SMOKE_SITE_ID || 'site-demo';
const adminApiKey = (process.env.BACKY_ADMIN_API_KEY || process.env.BACKY_ADMIN_SECRET_KEY || '').trim();
const adminPassword = process.env.BACKY_ADMIN_DEMO_PASSWORD || 'admin123';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const headers = new Headers();
if (adminApiKey) {
  headers.set('x-backy-admin-key', adminApiKey);
}

async function loginAdmin() {
  const response = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: 'admin@backy.io',
      password: adminPassword,
    }),
  });
  const json = await response.json().catch(() => null);
  assert(response.ok && json?.data?.session?.token, `Unable to login admin for media policy smoke: ${response.status} ${JSON.stringify(json).slice(0, 300)}`);
  return json.data.session.token;
}

async function adminJson(endpoint, token, options = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const json = await response.json().catch(() => null);
  assert(response.ok && json?.success !== false, `${endpoint} returned ${response.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

async function upload(uploadFormData, token = '') {
  const uploadHeaders = new Headers(headers);
  if (token) {
    uploadHeaders.set('authorization', `Bearer ${token}`);
    uploadHeaders.delete('x-backy-admin-key');
  }

  return fetch(`${baseUrl}/api/admin/sites/${siteId}/media`, {
    method: 'POST',
    headers: uploadHeaders,
    body: uploadFormData,
  });
}

const token = adminApiKey ? '' : await loginAdmin();
const formData = new FormData();
formData.set('file', new Blob(['this upload should exceed the configured site quota'], { type: 'text/plain' }), 'quota-check.txt');

const response = await upload(formData, token);
const json = await response.json().catch(() => null);

assert(response.status === 413, `Expected media quota upload to return 413, got ${response.status}`);
assert(json?.success === false, 'Expected error envelope');
assert(json?.error?.code === 'SITE_MEDIA_QUOTA_EXCEEDED', `Expected SITE_MEDIA_QUOTA_EXCEEDED, got ${json?.error?.code}`);
assert(typeof json?.error?.details?.limitBytes === 'number', 'Expected quota limit details');
assert(typeof json?.error?.details?.usedBytes === 'number', 'Expected quota usage details');

const settingsToken = token || await loginAdmin();
const beforeSettings = (await adminJson('/api/admin/settings', settingsToken)).data.settings;

try {
  await adminJson('/api/admin/settings', settingsToken, {
    method: 'PATCH',
    body: JSON.stringify({
      integrations: {
        ...(beforeSettings.integrations || {}),
        storage: {
          ...(beforeSettings.integrations?.storage || {}),
          maxFileSizeMb: 1,
          allowedFileTypes: 'image/*',
        },
      },
    }),
  });

  const disallowedTypeFormData = new FormData();
  disallowedTypeFormData.set('file', new Blob(['disallowed by settings storage policy'], { type: 'text/plain' }), 'policy-check.txt');
  const disallowedTypeResponse = await upload(disallowedTypeFormData, settingsToken);
  const disallowedTypeJson = await disallowedTypeResponse.json().catch(() => null);
  assert(disallowedTypeResponse.status === 415, `Expected disallowed media type to return 415, got ${disallowedTypeResponse.status}`);
  assert(disallowedTypeJson?.error?.code === 'FILE_TYPE_NOT_ALLOWED', `Expected FILE_TYPE_NOT_ALLOWED, got ${disallowedTypeJson?.error?.code}`);

  const tooLargeImageFormData = new FormData();
  tooLargeImageFormData.set('file', new Blob([new Uint8Array(1024 * 1024 + 1)], { type: 'image/png' }), 'policy-too-large.png');
  const tooLargeImageResponse = await upload(tooLargeImageFormData, settingsToken);
  const tooLargeImageJson = await tooLargeImageResponse.json().catch(() => null);
  assert(tooLargeImageResponse.status === 413, `Expected settings max file size to return 413, got ${tooLargeImageResponse.status}`);
  assert(tooLargeImageJson?.error?.code === 'FILE_TOO_LARGE', `Expected FILE_TOO_LARGE, got ${tooLargeImageJson?.error?.code}`);
  assert(tooLargeImageJson?.error?.details?.maxUploadBytes === 1024 * 1024, 'Expected max upload details from settings policy');
} finally {
  await adminJson('/api/admin/settings', settingsToken, {
    method: 'PATCH',
    body: JSON.stringify({
      deliveryMode: beforeSettings.deliveryMode,
      integrations: beforeSettings.integrations || {},
      auth: beforeSettings.auth || {},
    }),
  });
}

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  siteId,
  code: json.error.code,
  details: json.error.details,
  policy: {
    typeRejected: true,
    maxSizeRejected: true,
  },
}, null, 2));
