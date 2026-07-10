import assert from 'node:assert/strict';

import { normalizeCommerceReturnPath } from '../src/lib/commerceCatalog';
import {
  isAllowedPublicOrigin,
  normalizePublicOrigin,
} from '../src/lib/publicOriginPolicy';

assert.equal(
  normalizeCommerceReturnPath('/checkout/success?source=provider', '/fallback'),
  '/checkout/success?source=provider',
);
for (const malicious of [
  '//evil.example/checkout',
  '/\\evil.example/checkout',
  'https://evil.example/checkout',
  '\u0000//evil.example',
]) {
  assert.equal(normalizeCommerceReturnPath(malicious, '/fallback'), '/fallback');
}

const previousOrigins = process.env.BACKY_CORS_ALLOWED_ORIGINS;
process.env.BACKY_CORS_ALLOWED_ORIGINS =
  'https://store.example.com,https://admin.example.com';
try {
  assert.equal(normalizePublicOrigin('https://store.example.com/path'), 'https://store.example.com');
  assert.equal(normalizePublicOrigin('https://user:pass@store.example.com'), null);
  assert.equal(normalizePublicOrigin('javascript:alert(1)'), null);
  assert.equal(isAllowedPublicOrigin('https://store.example.com'), true);
  assert.equal(isAllowedPublicOrigin('https://evil.example.com'), false);
} finally {
  if (previousOrigins === undefined) delete process.env.BACKY_CORS_ALLOWED_ORIGINS;
  else process.env.BACKY_CORS_ALLOWED_ORIGINS = previousOrigins;
}

console.log('Commerce checkout security smoke passed');
