import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { load } from './admin-access-test-fixtures.mts';
const env: Record<string, string | undefined> = {};
const { adminCookieWriteOriginError: gate } = load('../src/lib/admin-auth/cookieWriteOrigin.ts', {}, [], env);
const { getAdminSessionTokenFromRequest: token } = load('../src/lib/admin-auth/sessionCookie.ts');
let checks = 0;
function check(headers: Record<string, string>, allowed: boolean, method = 'PATCH', cookie = true) {
  const request = new NextRequest('https://backend.fixture.invalid/api/admin/settings', {
    method, headers: { ...(cookie ? { cookie: 'backy_admin_session=synthetic-cookie' } : {}), ...headers },
  });
  const error = gate(request);
  assert.equal(error === null, allowed, JSON.stringify({ headerNames: Object.keys(headers), method, allowed }));
  if (error) assert.equal(error.code, 'ADMIN_COOKIE_ORIGIN_DENIED');
  checks++; return request;
}
check({ origin: 'https://backend.fixture.invalid' }, true);
check({ origin: 'https://BACKEND.fixture.invalid:443' }, true);
for (const origin of ['', 'null', 'https://foreign.fixture.invalid', 'https://backend.fixture.invalid/', 'https://backend.fixture.invalid/path', 'https://backend.fixture.invalid?', 'https://backend.fixture.invalid#', 'https://user@backend.fixture.invalid', 'https://backend.fixture.invalid https://foreign.fixture.invalid', 'file:///tmp/fixture', '*', 'https://backend.fixture.invalid\\path', 'https://backend.fixture.invalid\\@foreign.fixture.invalid']) check({ origin, referer: 'https://backend.fixture.invalid/editor' }, false);
check({}, false);
check({ referer: 'https://backend.fixture.invalid/editor?post=synthetic' }, true);
for (const referer of ['null', 'https://foreign.fixture.invalid/editor', 'https://user@backend.fixture.invalid/editor', 'javascript:alert(1)', 'https://backend.fixture.invalid\\path', 'https:backend.fixture.invalid/editor', 'https://backend.fixture.invalid/path with space']) check({ referer }, false);
for (const method of ['GET', 'HEAD', 'OPTIONS']) check({ origin: 'null' }, true, method);
check({ origin: 'null' }, true, 'POST', false);
for (const credential of [{ authorization: 'Bearer synthetic-explicit' }, { 'x-backy-admin-session': 'synthetic-explicit' }]) {
  assert.equal(token(check({ ...credential, origin: 'null' }, true)), 'synthetic-explicit'); checks++;
}
assert.equal(token(check({ authorization: 'Bearer synthetic-bearer', 'x-backy-admin-session': 'synthetic-header', origin: 'null' }, true)), 'synthetic-bearer'); checks++;
assert.equal(token(check({ authorization: 'Basic synthetic', origin: 'null' }, false)), 'synthetic-cookie'); checks++;
check({ 'x-backy-admin-key': 'synthetic-key', origin: 'null' }, false);
check({ 'x-api-key': 'synthetic-key', origin: 'null' }, false);
check({ origin: 'https://spoofed.fixture.invalid', 'x-forwarded-host': 'spoofed.fixture.invalid', 'x-forwarded-proto': 'https', host: 'spoofed.fixture.invalid' }, false);
env.BACKY_CORS_ALLOWED_ORIGINS = 'https://public.fixture.invalid';
check({ origin: 'https://public.fixture.invalid' }, false);
check({ origin: 'http://localhost:5173' }, false);
env.BACKY_ADMIN_TRUSTED_ORIGINS = ' https://admin.fixture.invalid ,http://127.0.0.1:5199';
check({ origin: 'https://admin.fixture.invalid' }, true);
check({ referer: 'https://admin.fixture.invalid/blog/new' }, true);
check({ origin: 'http://127.0.0.1:5199' }, true);
check({ origin: 'http://127.0.0.1:5200' }, false);
for (const entry of ['https://admin.fixture.invalid/', 'https://admin.fixture.invalid/path', 'https://admin.fixture.invalid?', 'https://admin.fixture.invalid#', 'https://user@admin.fixture.invalid', 'https://*.fixture.invalid', '*', 'null', 'ftp://admin.fixture.invalid', 'admin.fixture.invalid', 'https://admin.fixture.invalid\\path', 'https://admin.fixture.invalid\\@foreign.fixture.invalid']) {
  env.BACKY_ADMIN_TRUSTED_ORIGINS = entry; check({ origin: 'https://admin.fixture.invalid' }, false);
}
env.BACKY_ADMIN_TRUSTED_ORIGINS = '*,https://admin.fixture.invalid/path,https://admin.fixture.invalid';
check({ origin: 'https://admin.fixture.invalid' }, true);
console.log(`Admin cookie write origin: ${checks} actual-helper/credential-selection checks passed.`);
