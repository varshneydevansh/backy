#!/usr/bin/env node

import { spawn } from 'node:child_process';
import process from 'node:process';

const BASE_URL = process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:3001';
const START_TIMEOUT_MS = 90_000;

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForPublicServer = async () => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < START_TIMEOUT_MS) {
    try {
      const response = await fetch(`${BASE_URL}/api/sites`, {
        headers: {
          'x-forwarded-for': '203.0.113.250',
          origin: 'https://site-discovery-health.example',
        },
      });
      if (response.ok || response.status === 404) {
        return;
      }
    } catch {
      // Keep waiting until the dev server is ready.
    }
    await sleep(1000);
  }

  throw new Error(`Timed out waiting for public server at ${BASE_URL}`);
};

const requestDiscovery = () => fetch(`${BASE_URL}/api/sites`, {
  headers: {
    'x-forwarded-for': '203.0.113.10',
    origin: 'https://site-discovery-rate-limit.example',
  },
});

const server = spawn('npm', ['run', 'dev', '--workspace', '@backy/public'], {
  cwd: new URL('../../..', import.meta.url).pathname,
  env: {
    ...process.env,
    BACKY_PUBLIC_DISCOVERY_RATE_LIMIT_MAX: '1',
    BACKY_PUBLIC_DISCOVERY_RATE_LIMIT_WINDOW_MS: '60000',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverOutput = '';
server.stdout.on('data', (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on('data', (chunk) => {
  serverOutput += chunk.toString();
});

const cleanup = async () => {
  if (!server.killed) {
    server.kill('SIGTERM');
  }
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 5000);
    server.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
};

try {
  await waitForPublicServer();

  const first = await requestDiscovery();
  const firstJson = await first.json().catch(() => ({}));
  assert(first.status === 200, `First discovery request expected 200, got ${first.status}: ${JSON.stringify(firstJson).slice(0, 500)}`);
  assert(first.headers.get('x-ratelimit-limit') === '1', 'First discovery response missing configured rate-limit header.');
  assert(first.headers.get('x-ratelimit-remaining') === '0', 'First discovery response should exhaust the one-request limit.');

  const second = await requestDiscovery();
  const secondJson = await second.json().catch(() => ({}));
  assert(second.status === 429, `Second discovery request expected 429, got ${second.status}: ${JSON.stringify(secondJson).slice(0, 500)}`);
  assert(secondJson?.error?.code === 'RATE_LIMITED', `Second discovery response expected RATE_LIMITED: ${JSON.stringify(secondJson).slice(0, 500)}`);
  assert(second.headers.get('retry-after'), 'Rate-limited discovery response missing Retry-After header.');
  assert(second.headers.get('x-backy-cache-scope') === 'error', 'Rate-limited discovery response should be no-store error scope.');

  console.log(JSON.stringify({
    ok: true,
    first: {
      status: first.status,
      limit: first.headers.get('x-ratelimit-limit'),
      remaining: first.headers.get('x-ratelimit-remaining'),
    },
    second: {
      status: second.status,
      retryAfter: second.headers.get('retry-after'),
      code: secondJson?.error?.code,
    },
  }, null, 2));
} catch (error) {
  console.error(serverOutput.slice(-4000));
  throw error;
} finally {
  await cleanup();
}
