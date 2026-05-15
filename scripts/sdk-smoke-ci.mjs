#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const root = new URL('..', import.meta.url);
const nextEnvUrl = new URL('apps/public/next-env.d.ts', root);
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const baseUrl = (process.env.BACKY_SDK_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

const runStep = (label, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(npmBin, args, {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...options.env,
    },
  });

  child.once('error', reject);
  child.once('exit', (code, signal) => {
    if (code === 0) {
      resolve();
      return;
    }

    reject(new Error(`${label} failed with ${signal || `exit code ${code}`}`));
  });
});

const waitForDiscovery = async (serverState) => {
  const deadline = Date.now() + Number(process.env.BACKY_SDK_CI_SERVER_TIMEOUT_MS || 60000);
  let lastError = null;

  while (Date.now() < deadline) {
    if (serverState.exited && lastError) {
      break;
    }

    try {
      const response = await fetch(`${baseUrl}/api/sites/site-demo/manifest`, {
        headers: { accept: 'application/json' },
      });

      if (response.ok) {
        const json = await response.json();
        if (json?.success !== false && json?.data?.site) {
          return;
        }
      }

      lastError = new Error(`discovery returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(500);
  }

  throw new Error(`Backy public app did not become ready at ${baseUrl}: ${lastError?.message || 'timeout'}`);
};

const stopServer = async (server) => {
  if (!server || server.exitCode !== null || server.signalCode) return;

  server.kill('SIGTERM');

  const exited = await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    delay(5000).then(() => false),
  ]);

  if (exited === false && server.exitCode === null) {
    server.kill('SIGKILL');
  }
};

let originalNextEnv = null;
let server = null;

try {
  originalNextEnv = await readFile(nextEnvUrl, 'utf8').catch(() => null);

  await runStep('SDK typecheck', ['--workspace', '@backy/sdk-js', 'run', 'typecheck']);
  await runStep('SDK build', ['--workspace', '@backy/sdk-js', 'run', 'build']);

  const serverState = { exited: false };
  server = spawn(npmBin, ['--workspace', '@backy/public', 'run', 'dev'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  server.stdout.on('data', (chunk) => process.stdout.write(chunk));
  server.stderr.on('data', (chunk) => process.stderr.write(chunk));
  server.once('exit', () => {
    serverState.exited = true;
  });

  await waitForDiscovery(serverState);
  await runStep('SDK smoke', ['run', 'test:smoke:sdk'], {
    env: {
      BACKY_SDK_BASE_URL: baseUrl,
    },
  });
} finally {
  await stopServer(server);

  if (originalNextEnv !== null) {
    await writeFile(nextEnvUrl, originalNextEnv);
  }
}
