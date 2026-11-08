import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { load } from './admin-access-test-fixtures.mts';

// Execute the actual proxy: its response headers override handler headers in
// Next's served response, which handler-only tests cannot detect.
const { proxy } = load('../src/proxy.ts', {
  '@/lib/admin-auth/cookieWriteOrigin': load('../src/lib/admin-auth/cookieWriteOrigin.ts'),
  '@/lib/publicOriginPolicy': { isAllowedPublicOrigin: () => false },
});
let checks = 0;
// Legacy protected routes under /api/sites return this helper directly, without
// the /api/admin proxy cache override. Denials must carry their own policy.
const { adminAccessError } = load('../src/lib/adminAccess.ts');
for (const [status, code] of [[401, 'UNAUTHORIZED'], [403, 'FORBIDDEN_PERMISSION']] as const) {
  const response = adminAccessError(status, code, 'Synthetic access denial', 'req-cache-denial');
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), {
    success: false,
    requestId: 'req-cache-denial',
    error: { code, message: 'Synthetic access denial' },
  });
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  checks += 3;
}
for (const path of [
  '/api/admin/sites/site-fixture/pages/page-fixture/preview',
  '/api/admin/sites/site-fixture/blog/post-fixture/preview',
  '/api/admin/sites/site-fixture/forms/form-fixture/submissions/submission-fixture/attachments/file-fixture',
  '/api/admin/sites/site-fixture/forms/attachment-cleanup',
  '/api/admin/settings',
  '/api/admin/auth/session',
]) {
  const response = await proxy(new NextRequest(`http://fixture.invalid${path}`));
  assert.equal(response.headers.get('cache-control'), 'private, no-store', path);
  assert.equal(response.headers.get('x-backy-cache-scope'), 'admin', path);
  checks += 2;
}
const publicResponse = await proxy(new NextRequest('http://fixture.invalid/api/sites/site-fixture/manifest'));
assert.equal(publicResponse.headers.has('cache-control'), false);
checks++;
const hosted = await proxy(new NextRequest('http://fixture.invalid/sites/fixture/blog/article?previewToken=synthetic'));
assert.equal(hosted.headers.get('cache-control'), 'no-store');
assert.equal(hosted.headers.get('x-backy-cache-scope'), 'private');
checks += 2;
console.log(`Admin proxy cache policy: ${checks} checks passed`);
