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

const main = async () => {
  const supabaseMock = await startSupabaseMock();
  const publicPort = await freePort();
  let publicServer;

  try {
    publicServer = await startPublicServer(publicPort, supabaseMock.url);
    const response = await fetch(`${publicServer.baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: SUPABASE_EMAIL,
        password: SUPABASE_PASSWORD,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    const setCookie = response.headers.get('set-cookie') || '';

    assert(response.ok, `Supabase-backed login route returned ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(payload.success === true, `Supabase-backed login route did not return success: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(payload.data?.user?.email === SUPABASE_EMAIL, `Supabase-backed login mapped the wrong user: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(payload.data?.session?.authMode === 'supabase', `Supabase-backed login did not issue authMode=supabase: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(setCookie.includes('backy_admin_session=') && /HttpOnly/i.test(setCookie), `Supabase-backed login did not set an httpOnly session cookie: ${setCookie}`);
    assert(supabaseMock.requests.length === 1, `Supabase Auth mock expected one request, got ${supabaseMock.requests.length}`);

    console.log(JSON.stringify({
      ok: true,
      route: '/api/admin/auth/login',
      authMode: payload.data.session.authMode,
      supabaseRequests: supabaseMock.requests.length,
      publicPort,
    }));
  } finally {
    await stopProcess(publicServer?.childProcess);
    await closeServer(supabaseMock.server);
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
