#!/usr/bin/env node

const baseUrl = (process.env.BACKY_PUBLIC_CONTRACT_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const siteId = process.env.BACKY_MEDIA_QUOTA_SMOKE_SITE_ID || 'site-demo';
const adminApiKey = (process.env.BACKY_ADMIN_API_KEY || process.env.BACKY_ADMIN_SECRET_KEY || '').trim();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const formData = new FormData();
formData.set('file', new Blob(['this upload should exceed the configured site quota'], { type: 'text/plain' }), 'quota-check.txt');

const headers = new Headers();
if (adminApiKey) {
  headers.set('x-backy-admin-key', adminApiKey);
}

const response = await fetch(`${baseUrl}/api/admin/sites/${siteId}/media`, {
  method: 'POST',
  headers,
  body: formData,
});
const json = await response.json().catch(() => null);

assert(response.status === 413, `Expected media quota upload to return 413, got ${response.status}`);
assert(json?.success === false, 'Expected error envelope');
assert(json?.error?.code === 'SITE_MEDIA_QUOTA_EXCEEDED', `Expected SITE_MEDIA_QUOTA_EXCEEDED, got ${json?.error?.code}`);
assert(typeof json?.error?.details?.limitBytes === 'number', 'Expected quota limit details');
assert(typeof json?.error?.details?.usedBytes === 'number', 'Expected quota usage details');

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  siteId,
  code: json.error.code,
  details: json.error.details,
}, null, 2));
