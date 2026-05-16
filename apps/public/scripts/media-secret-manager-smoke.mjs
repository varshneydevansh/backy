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

const PROJECT_ID = 'prj_backy_media_secret_smoke';
const TEAM_ID = 'team_backy_media_secret_smoke';
const VERCEL_TOKEN = 'vercel-media-secret-smoke-token';
const MFA_CODE = '789654';

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

const startVercelMock = async () => {
  const requests = [];
  let envs = [
    { id: 'env_next_access', key: 'BACKY_S3_NEXT_ACCESS_KEY_ID' },
    { id: 'env_next_secret', key: 'BACKY_S3_NEXT_SECRET_ACCESS_KEY' },
    { id: 'env_next_bucket', key: 'BACKY_S3_NEXT_BUCKET' },
    { id: 'env_next_region', key: 'BACKY_S3_NEXT_REGION' },
    { id: 'env_next_endpoint', key: 'BACKY_S3_NEXT_ENDPOINT' },
    { id: 'env_next_public_url', key: 'BACKY_S3_NEXT_PUBLIC_URL' },
  ];

  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const bodyText = await readBody(request);
    const body = bodyText ? JSON.parse(bodyText) : null;
    const entry = {
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      headers: request.headers,
      body,
    };
    requests.push(entry);

    if (request.headers.authorization !== `Bearer ${VERCEL_TOKEN}`) {
      response.writeHead(401, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'missing bearer token' } }));
      return;
    }

    if (url.searchParams.get('teamId') !== TEAM_ID) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'missing teamId' } }));
      return;
    }

    if (request.method === 'GET' && url.pathname === `/v10/projects/${PROJECT_ID}/env`) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ envs }));
      return;
    }

    if (request.method === 'DELETE' && url.pathname.startsWith(`/v9/projects/${PROJECT_ID}/env/`)) {
      const id = decodeURIComponent(url.pathname.split('/').pop() || '');
      envs = envs.filter((item) => item.id !== id);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ removed: id }));
      return;
    }

    if (request.method === 'POST' && url.pathname === `/v10/projects/${PROJECT_ID}/env`) {
      if (url.searchParams.get('upsert') !== 'true') {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { message: 'upsert flag required' } }));
        return;
      }
      const key = String(body?.key || '');
      envs = envs.filter((item) => item.key !== key);
      envs.push({ id: `env_${key.toLowerCase()}`, key });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ created: [{ id: `env_${key.toLowerCase()}`, key }], failed: [] }));
      return;
    }

    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { message: `unhandled ${request.method} ${url.pathname}` } }));
  });

  const address = await listen(server);
  return {
    requests,
    url: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server),
  };
};

const startPublicServer = async (port, vercelApiBaseUrl) => {
  const childProcess = spawn(process.execPath, [NEXT_BIN, 'dev', '-p', String(port)], {
    cwd: publicRoot,
    env: {
      ...process.env,
      BACKY_STORAGE_PROVIDER: 's3',
      BACKY_S3_ACCESS_KEY_ID: 'active-access-smoke',
      BACKY_S3_SECRET_ACCESS_KEY: 'active-secret-smoke',
      BACKY_S3_BUCKET: 'active-bucket-smoke',
      BACKY_S3_REGION: 'us-east-1',
      BACKY_S3_NEXT_ACCESS_KEY_ID: 'next-access-smoke',
      BACKY_S3_NEXT_SECRET_ACCESS_KEY: 'next-secret-smoke',
      BACKY_S3_NEXT_BUCKET: 'next-bucket-smoke',
      BACKY_S3_NEXT_REGION: 'us-west-2',
      BACKY_S3_NEXT_ENDPOINT: 'https://s3-smoke.example.com',
      BACKY_S3_NEXT_PUBLIC_URL: 'https://cdn-smoke.example.com',
      BACKY_VERCEL_API_BASE_URL: vercelApiBaseUrl,
      VERCEL_TOKEN,
      VERCEL_PROJECT_ID: PROJECT_ID,
      VERCEL_TEAM_ID: TEAM_ID,
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
  for (let attempt = 0; attempt < 140; attempt += 1) {
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

const loginAdmin = async (baseUrl) => {
  const body = {
    email: 'admin@backy.io',
    password: process.env.BACKY_ADMIN_DEMO_PASSWORD || 'admin123',
  };
  const first = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const firstPayload = await first.json().catch(() => ({}));
  if (first.status !== 401 || firstPayload.error?.code !== 'MFA_REQUIRED') {
    assert(first.ok && firstPayload.data?.session?.token, `Unable to create admin session: ${JSON.stringify(firstPayload).slice(0, 500)}`);
    return firstPayload.data.session.token;
  }

  const second = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, twoFactorCode: MFA_CODE }),
  });
  const secondPayload = await second.json().catch(() => ({}));
  assert(second.ok && secondPayload.data?.session?.token, `Unable to create MFA admin session: ${JSON.stringify(secondPayload).slice(0, 500)}`);
  return secondPayload.data.session.token;
};

const postSecretManager = async (baseUrl, token, body) => {
  const response = await fetch(`${baseUrl}/api/admin/settings`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      action: 'media-storage-secret-manager',
      ...body,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  assert(response.ok && payload.success !== false, `Secret manager request failed: ${response.status} ${JSON.stringify(payload).slice(0, 700)}`);
  return payload.data;
};

const main = async () => {
  const vercelMock = await startVercelMock();
  const publicPort = await freePort();
  let publicServer;

  try {
    publicServer = await startPublicServer(publicPort, vercelMock.url);
    const token = await loginAdmin(publicServer.baseUrl);

    const promote = await postSecretManager(publicServer.baseUrl, token, {
      mode: 'promote',
      dryRun: false,
      targetEnvironments: ['production', 'preview'],
    });
    assert(promote.provider === 's3', `Secret manager should run against s3 provider: ${JSON.stringify(promote)}`);
    assert(promote.status === 'ready' && promote.executed === true, `Promote should execute: ${JSON.stringify(promote).slice(0, 700)}`);
    assert(!JSON.stringify(promote).includes('next-secret-smoke'), 'Secret manager response leaked the raw replacement secret.');

    const postRequests = vercelMock.requests.filter((request) => request.method === 'POST');
    assert(postRequests.length >= 6, `Promote did not upsert every mapped Vercel env variable: ${JSON.stringify(vercelMock.requests)}`);
    assert(postRequests.every((request) => request.query.upsert === 'true'), `Promote did not use Vercel upsert=true: ${JSON.stringify(postRequests)}`);
    const accessRequest = postRequests.find((request) => request.body?.key === 'BACKY_S3_ACCESS_KEY_ID');
    const secretRequest = postRequests.find((request) => request.body?.key === 'BACKY_S3_SECRET_ACCESS_KEY');
    assert(accessRequest?.body?.type === 'sensitive', `Access key should be promoted as sensitive: ${JSON.stringify(accessRequest)}`);
    assert(secretRequest?.body?.type === 'sensitive', `Secret key should be promoted as sensitive: ${JSON.stringify(secretRequest)}`);
    assert(Array.isArray(secretRequest.body.target) && secretRequest.body.target.join(',') === 'production,preview', `Secret target environments were not preserved: ${JSON.stringify(secretRequest)}`);
    assert(secretRequest.headers.authorization === `Bearer ${VERCEL_TOKEN}`, `Vercel mock did not receive bearer auth: ${JSON.stringify(secretRequest.headers)}`);

    const requestCountBeforeBlocked = vercelMock.requests.length;
    const blockedDevelopment = await postSecretManager(publicServer.baseUrl, token, {
      mode: 'promote',
      dryRun: false,
      targetEnvironments: ['development'],
    });
    assert(blockedDevelopment.status === 'blocked' && blockedDevelopment.executed === false, `Development secret promotion should be blocked: ${JSON.stringify(blockedDevelopment)}`);
    assert(vercelMock.requests.length === requestCountBeforeBlocked, 'Blocked development promotion should not call the Vercel API.');

    const revoke = await postSecretManager(publicServer.baseUrl, token, {
      mode: 'revoke-replacement',
      dryRun: false,
      targetEnvironments: ['production', 'preview'],
    });
    assert(revoke.status === 'ready' && revoke.executed === true, `Replacement revoke should execute: ${JSON.stringify(revoke).slice(0, 700)}`);
    const deleteRequests = vercelMock.requests.filter((request) => request.method === 'DELETE');
    assert(deleteRequests.length >= 6, `Revoke did not delete replacement env variables: ${JSON.stringify(vercelMock.requests)}`);

    console.log('Media Vercel secret manager smoke passed');
  } finally {
    await stopProcess(publicServer?.childProcess);
    await vercelMock.close();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
