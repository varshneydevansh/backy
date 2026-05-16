#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(publicRoot, '../..');
const NEXT_BIN = path.join(repoRoot, 'node_modules/next/dist/bin/next');
const SUPABASE_KEY = 'supabase-route-smoke-key';
const SUPABASE_EMAIL = 'admin@backy.io';
const SUPABASE_PASSWORD = 'supabase-route-password';
const MFA_CODE = '654321';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const readBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
};

const listen = (server, port = 0) => new Promise((resolve) => {
  server.listen(port, '127.0.0.1', () => resolve(server.address()));
});

const closeServer = (server) => new Promise((resolve) => {
  server.close(() => resolve());
});

const freePort = async () => {
  const server = net.createServer();
  const address = await listen(server);
  await closeServer(server);
  return address.port;
};

const waitForExit = (childProcess, timeoutMs = 1500) => new Promise((resolve) => {
  if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
    resolve(true);
    return;
  }

  const timeout = setTimeout(() => {
    childProcess.off('exit', onExit);
    resolve(false);
  }, timeoutMs);

  const onExit = () => {
    clearTimeout(timeout);
    resolve(true);
  };

  childProcess.once('exit', onExit);
});

const stopProcess = async (childProcess) => {
  if (!childProcess || childProcess.exitCode !== null || childProcess.signalCode !== null) return;
  childProcess.kill('SIGTERM');
  if (!(await waitForExit(childProcess))) {
    childProcess.kill('SIGKILL');
    await waitForExit(childProcess, 500);
  }
};

const startSupabaseMock = async () => {
  const requests = [];
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/auth/v1/token?grant_type=password') {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not_found' }));
      return;
    }

    const bodyText = await readBody(request);
    const body = bodyText ? JSON.parse(bodyText) : {};
    requests.push({
      headers: request.headers,
      body,
    });

    if (
      request.headers.apikey !== SUPABASE_KEY ||
      request.headers.authorization !== `Bearer ${SUPABASE_KEY}` ||
      body.email !== SUPABASE_EMAIL ||
      body.password !== SUPABASE_PASSWORD
    ) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'invalid_grant' }));
      return;
    }

    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      access_token: 'sb_route_access_smoke',
      token_type: 'bearer',
      user: {
        id: 'supabase-route-user',
        email: SUPABASE_EMAIL,
      },
    }));
  });

  const address = await listen(server);
  return {
    server,
    requests,
    url: `http://127.0.0.1:${address.port}`,
  };
};

const startPublicServer = async (port, supabaseUrl) => {
  const childProcess = spawn(process.execPath, [NEXT_BIN, 'dev', '-p', String(port)], {
    cwd: publicRoot,
    env: {
      ...process.env,
      BACKY_SUPABASE_URL: supabaseUrl,
      BACKY_SUPABASE_ANON_KEY: SUPABASE_KEY,
      BACKY_ADMIN_MFA_CODE: MFA_CODE,
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  const append = (chunk) => {
    output = `${output}${chunk.toString()}`.slice(-8000);
  };
  childProcess.stdout.on('data', append);
  childProcess.stderr.on('data', append);

  const baseUrl = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
      throw new Error(`Public Next server exited early:\n${output}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/sites`);
      if (response.status < 500) {
        return { childProcess, baseUrl };
      }
    } catch {
      // Keep waiting for Next dev.
    }
    await sleep(250);
  }

  throw new Error(`Public Next server did not become ready:\n${output}`);
};

const loginLocalAdmin = async (baseUrl) => {
  const response = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: SUPABASE_EMAIL,
      password: process.env.BACKY_ADMIN_DEMO_PASSWORD || 'admin123',
    }),
  });
  const payload = await response.json().catch(() => ({}));
  assert(response.ok && payload.data?.session?.token, `Unable to create local admin session: ${JSON.stringify(payload).slice(0, 500)}`);
  return payload.data.session.token;
};

const readSettings = async (baseUrl, token) => {
  const response = await fetch(`${baseUrl}/api/admin/settings`, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  const payload = await response.json().catch(() => ({}));
  assert(response.ok && payload.data?.settings, `Unable to read settings: ${JSON.stringify(payload).slice(0, 500)}`);
  return payload.data.settings;
};

const patchAuthSettings = async (baseUrl, token, auth) => {
  const response = await fetch(`${baseUrl}/api/admin/settings`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ auth }),
  });
  const payload = await response.json().catch(() => ({}));
  assert(response.ok && payload.success !== false, `Unable to patch auth settings: ${JSON.stringify(payload).slice(0, 500)}`);
  return payload.data?.settings;
};

const listAdminSessions = async (baseUrl, token, email) => {
  const params = new URLSearchParams({ email });
  const response = await fetch(`${baseUrl}/api/admin/auth/sessions?${params.toString()}`, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  const payload = await response.json().catch(() => ({}));
  assert(response.ok && Array.isArray(payload.data?.sessions), `Unable to list admin sessions: ${JSON.stringify(payload).slice(0, 500)}`);
  return payload.data.sessions;
};

const postLogin = async (baseUrl, body) => {
  const response = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return {
    response,
    payload,
    setCookie: response.headers.get('set-cookie') || '',
  };
};

const main = async () => {
  const supabaseMock = await startSupabaseMock();
  const publicPort = await freePort();
  let publicServer;
  let adminToken = '';
  let originalAuth;

  try {
    publicServer = await startPublicServer(publicPort, supabaseMock.url);
    adminToken = await loginLocalAdmin(publicServer.baseUrl);
    const settings = await readSettings(publicServer.baseUrl, adminToken);
    originalAuth = settings.auth || {};
    await patchAuthSettings(publicServer.baseUrl, adminToken, {
      ...originalAuth,
      requireTwoFactor: true,
    });
    const sessionsBeforeMfa = await listAdminSessions(publicServer.baseUrl, adminToken, SUPABASE_EMAIL);

    const missingMfa = await postLogin(publicServer.baseUrl, {
      email: SUPABASE_EMAIL,
      password: SUPABASE_PASSWORD,
    });
    assert(missingMfa.response.status === 401, `Missing MFA code should return 401, got ${missingMfa.response.status}: ${JSON.stringify(missingMfa.payload).slice(0, 500)}`);
    assert(missingMfa.payload.error?.code === 'MFA_REQUIRED', `Missing MFA code returned wrong error: ${JSON.stringify(missingMfa.payload).slice(0, 500)}`);

    const invalidMfa = await postLogin(publicServer.baseUrl, {
      email: SUPABASE_EMAIL,
      password: SUPABASE_PASSWORD,
      twoFactorCode: '000000',
    });
    assert(invalidMfa.response.status === 401, `Invalid MFA code should return 401, got ${invalidMfa.response.status}: ${JSON.stringify(invalidMfa.payload).slice(0, 500)}`);
    assert(invalidMfa.payload.error?.code === 'INVALID_MFA_CODE', `Invalid MFA code returned wrong error: ${JSON.stringify(invalidMfa.payload).slice(0, 500)}`);
    const sessionsAfterFailedMfa = await listAdminSessions(publicServer.baseUrl, adminToken, SUPABASE_EMAIL);
    assert(
      sessionsAfterFailedMfa.length === sessionsBeforeMfa.length,
      `Failed MFA attempts should not leave active sessions: ${JSON.stringify({ before: sessionsBeforeMfa, after: sessionsAfterFailedMfa }).slice(0, 1000)}`,
    );

    const { response, payload, setCookie } = await postLogin(publicServer.baseUrl, {
      email: SUPABASE_EMAIL,
      password: SUPABASE_PASSWORD,
      twoFactorCode: MFA_CODE,
    });

    assert(response.ok, `Supabase-backed login route returned ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(payload.success === true, `Supabase-backed login route did not return success: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(payload.data?.user?.email === SUPABASE_EMAIL, `Supabase-backed login mapped the wrong user: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(payload.data?.session?.authMode === 'supabase', `Supabase-backed login did not issue authMode=supabase: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(setCookie.includes('backy_admin_session=') && /HttpOnly/i.test(setCookie), `Supabase-backed login did not set an httpOnly session cookie: ${setCookie}`);
    const sessionsAfterSuccessfulMfa = await listAdminSessions(publicServer.baseUrl, adminToken, SUPABASE_EMAIL);
    assert(
      sessionsAfterSuccessfulMfa.length === sessionsBeforeMfa.length + 1,
      `Successful MFA login should create exactly one active session: ${JSON.stringify({ before: sessionsBeforeMfa, after: sessionsAfterSuccessfulMfa }).slice(0, 1000)}`,
    );
    assert(supabaseMock.requests.length === 4, `Supabase Auth mock expected four requests, got ${supabaseMock.requests.length}`);

    console.log(JSON.stringify({
      ok: true,
      route: '/api/admin/auth/login',
      authMode: payload.data.session.authMode,
      mfa: {
        missingCode: missingMfa.payload.error?.code,
        invalidCode: invalidMfa.payload.error?.code,
        failedAttemptsDidNotCreateSessions: true,
      },
      supabaseRequests: supabaseMock.requests.length,
      publicPort,
    }));
  } finally {
    if (publicServer?.baseUrl && adminToken && originalAuth) {
      await patchAuthSettings(publicServer.baseUrl, adminToken, originalAuth).catch(() => undefined);
    }
    await stopProcess(publicServer?.childProcess);
    await closeServer(supabaseMock.server);
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
