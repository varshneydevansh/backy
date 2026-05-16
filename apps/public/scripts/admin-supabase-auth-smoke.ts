import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  authenticateSupabaseAdminCredentials,
  isSupabaseAdminAuthConfigured,
  SupabaseAdminAuthUnavailableError,
} from '../src/lib/admin-auth/supabaseAuth';

const user = {
  email: 'supabase-admin@example.test',
};

const readBody = async (request: NodeJS.ReadableStream): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
};

const server = createServer(async (request, response) => {
  if (request.method !== 'POST' || request.url !== '/auth/v1/token?grant_type=password') {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not_found' }));
    return;
  }

  assert.equal(request.headers.apikey, 'supabase-anon-smoke-key');
  assert.equal(request.headers.authorization, 'Bearer supabase-anon-smoke-key');

  const body = JSON.parse(await readBody(request)) as Record<string, unknown>;
  if (body.email !== user.email || body.password !== 'supabase-password') {
    response.writeHead(400, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'invalid_grant' }));
    return;
  }

  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({
    access_token: 'sb_access_smoke',
    token_type: 'bearer',
    user: {
      id: 'supabase-user-id',
      email: user.email,
    },
  }));
});

const main = async () => {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  assert(address && typeof address === 'object', 'Supabase auth mock did not bind to a port');

  const mutableEnv = process.env as Record<string, string | undefined>;
  const originalNodeEnv = mutableEnv.NODE_ENV;
  const originalAllowLocal = mutableEnv.BACKY_ALLOW_PRODUCTION_LOCAL_ADMIN_AUTH;

  try {
    const env = {
      BACKY_SUPABASE_URL: `http://127.0.0.1:${address.port}`,
      BACKY_SUPABASE_ANON_KEY: 'supabase-anon-smoke-key',
    };
    assert.equal(isSupabaseAdminAuthConfigured(env), true, 'Supabase auth config should be detected from env');

    mutableEnv.NODE_ENV = 'production';
    delete mutableEnv.BACKY_ALLOW_PRODUCTION_LOCAL_ADMIN_AUTH;

    const session = await authenticateSupabaseAdminCredentials(
      user.email,
      'supabase-password',
      { env },
    );

    assert(session, 'Supabase credentials should verify an admin identity');
    assert.equal(session.email, user.email);

    const invalid = await authenticateSupabaseAdminCredentials(
      user.email,
      'wrong-password',
      { env },
    );
    assert.equal(invalid, null, 'Invalid Supabase credentials should not verify an admin identity');

    await assert.rejects(
      () => authenticateSupabaseAdminCredentials(
        user.email,
        'supabase-password',
        {
          env: {
            BACKY_SUPABASE_URL: 'http://127.0.0.1:9',
            BACKY_SUPABASE_ANON_KEY: 'supabase-anon-smoke-key',
          },
        },
      ),
      SupabaseAdminAuthUnavailableError,
      'Unavailable Supabase Auth should fail distinctly from invalid credentials',
    );
  } finally {
    if (originalNodeEnv === undefined) {
      delete mutableEnv.NODE_ENV;
    } else {
      mutableEnv.NODE_ENV = originalNodeEnv;
    }
    if (originalAllowLocal === undefined) {
      delete mutableEnv.BACKY_ALLOW_PRODUCTION_LOCAL_ADMIN_AUTH;
    } else {
      mutableEnv.BACKY_ALLOW_PRODUCTION_LOCAL_ADMIN_AUTH = originalAllowLocal;
    }
    server.close();
  }

  console.log(JSON.stringify({
    ok: true,
    cases: 4,
  }));
};

main().catch((error) => {
  server.close();
  console.error(error);
  process.exitCode = 1;
});
