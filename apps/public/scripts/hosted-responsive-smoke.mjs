#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const baseUrl = (process.env.BACKY_PUBLIC_CONTRACT_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const chromeBin = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cdpPort = Number(process.env.BACKY_HOSTED_RESPONSIVE_CDP_PORT || 9396);
const screenshotDir = process.env.BACKY_HOSTED_RESPONSIVE_SCREENSHOT_DIR
  || path.join(os.tmpdir(), 'backy-hosted-responsive');
const configuredAdminApiKey = (process.env.BACKY_ADMIN_API_KEY || process.env.BACKY_ADMIN_SECRET_KEY || '').trim();

let adminRequestApiKey = configuredAdminApiKey;
let adminSessionToken = '';
let createdPageId = '';
let chrome = null;
let client = null;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

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

async function request(pathOrUrl, init = {}) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${baseUrl}${pathOrUrl}`;
  const headers = new Headers(init.headers || {});
  const pathname = pathOrUrl.startsWith('http') ? new URL(pathOrUrl).pathname : pathOrUrl;

  if (pathname.startsWith('/api/admin/') && !headers.has('authorization') && !headers.has('x-backy-admin-key')) {
    if (adminRequestApiKey) {
      headers.set('x-backy-admin-key', adminRequestApiKey);
    } else if (adminSessionToken) {
      headers.set('authorization', `Bearer ${adminSessionToken}`);
    }
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });
  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Keep raw text for diagnostics below.
  }

  return { response, text, json, url };
}

async function loginAdminApi() {
  if (adminRequestApiKey) {
    return;
  }

  const response = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: 'admin@backy.io',
      password: process.env.BACKY_ADMIN_DEMO_PASSWORD || 'admin123',
    }),
  });
  const json = await response.json().catch(() => ({}));

  if (!response.ok || json.success === false || !json.data?.session?.token) {
    throw new Error(`Unable to create admin session for hosted responsive smoke: ${JSON.stringify(json).slice(0, 500)}`);
  }

  adminSessionToken = json.data.session.token;

  const settingsResponse = await fetch(`${baseUrl}/api/admin/settings`, {
    headers: {
      authorization: `Bearer ${adminSessionToken}`,
    },
  });
  const settingsJson = await settingsResponse.json().catch(() => ({}));
  const settingsAdminKey = settingsJson?.data?.settings?.apiKeys?.adminApiKey;
  if (settingsResponse.ok && typeof settingsAdminKey === 'string' && settingsAdminKey.trim()) {
    adminRequestApiKey = settingsAdminKey.trim();
  }
}

async function createResponsivePage() {
  const unique = Date.now().toString(36);
  const slug = `responsive-smoke-${unique}`;
  const create = await request('/api/admin/sites/site-demo/pages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      title: `Responsive Smoke ${unique}`,
      slug,
      status: 'published',
      description: 'Temporary browser smoke page for hosted responsive rendering.',
      meta: {
        title: `Responsive Smoke ${unique}`,
        description: 'Temporary browser smoke page for hosted responsive rendering.',
        noIndex: true,
      },
      content: {
        canvasSize: { width: 1200, height: 720 },
        elements: [
          {
            id: 'responsive-smoke-heading',
            type: 'heading',
            x: 120,
            y: 96,
            width: 720,
            height: 88,
            zIndex: 2,
            props: {
              level: 'h1',
              content: 'Desktop responsive heading',
              fontSize: 48,
              color: '#0f172a',
              fontWeight: 700,
            },
            responsive: {
              tablet: {
                x: 48,
                y: 72,
                width: 640,
                height: 76,
                props: {
                  content: 'Tablet responsive heading',
                  fontSize: 36,
                },
              },
              mobile: {
                x: 16,
                y: 40,
                width: 320,
                height: 72,
                props: {
                  content: 'Mobile responsive heading',
                  fontSize: 28,
                },
              },
            },
          },
          {
            id: 'responsive-smoke-marker',
            type: 'text',
            x: 120,
            y: 214,
            width: 340,
            height: 44,
            zIndex: 1,
            props: {
              content: 'Desktop and tablet marker',
              fontSize: 18,
              color: '#334155',
            },
            responsive: {
              tablet: {
                x: 48,
                y: 174,
                width: 300,
              },
              mobile: {
                visible: false,
              },
            },
          },
        ],
      },
    }),
  });

  assert(create.response.status === 201, `${create.url} expected 201, got ${create.response.status}: ${create.text.slice(0, 500)}`);
  createdPageId = create.json?.data?.page?.id;
  assert(createdPageId, `${create.url} did not return a page id`);

  return {
    id: createdPageId,
    slug,
    url: `${baseUrl}/sites/demo/${slug}`,
  };
}

async function deleteResponsivePage() {
  if (!createdPageId) {
    return;
  }
  await request(`/api/admin/sites/site-demo/pages/${createdPageId}`, { method: 'DELETE' }).catch(() => {});
  createdPageId = '';
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status}`);
  }
  return response.json();
}

async function waitForCdp() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    try {
      const targets = await fetchJson(`http://127.0.0.1:${cdpPort}/json/list`);
      const target = targets.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl);
      if (target) {
        return target.webSocketDebuggerUrl;
      }
    } catch {
      // Retry until Chrome exposes the debugger endpoint.
    }
    await sleep(150);
  }
  throw new Error(`Chrome did not expose CDP on port ${cdpPort}`);
}

function connectCdp(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) {
      return;
    }
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      reject(new Error(`${message.error.message}: ${message.error.data || ''}`));
    } else {
      resolve(message.result || {});
    }
  });

  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => {
      resolve({
        send(method, params = {}) {
          const id = nextId;
          nextId += 1;
          socket.send(JSON.stringify({ id, method, params }));
          return new Promise((methodResolve, methodReject) => {
            pending.set(id, { resolve: methodResolve, reject: methodReject });
          });
        },
        close() {
          socket.close();
        },
      });
    });
    socket.addEventListener('error', () => {
      reject(new Error('Unable to connect to Chrome DevTools Protocol'));
    });
  });
}

async function evaluate(expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(`Browser evaluation failed: ${JSON.stringify(result.exceptionDetails).slice(0, 500)}`);
  }

  return result.result?.value;
}

async function captureScreenshot(name) {
  fs.mkdirSync(screenshotDir, { recursive: true });
  const screenshot = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
  });
  const screenshotPath = path.join(screenshotDir, `${name}.png`);
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  const stats = fs.statSync(screenshotPath);
  assert(stats.size > 1000, `${screenshotPath} expected a non-empty screenshot`);
  return screenshotPath;
}

async function launchChrome() {
  assert(fs.existsSync(chromeBin), `Chrome binary not found at ${chromeBin}. Set CHROME_BIN to override.`);
  const userDataDir = path.join(os.tmpdir(), `backy-hosted-responsive-${Date.now()}`);
  const childProcess = spawn(chromeBin, [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,1100',
    'about:blank',
  ], { stdio: 'ignore' });

  return { childProcess, userDataDir };
}

async function waitForResponsiveState(expected) {
  const startedAt = Date.now();
  let lastState = null;
  while (Date.now() - startedAt < 10000) {
    lastState = await evaluate(`
      (() => {
        const root = document.querySelector('.backy-render-root');
        const canvas = document.querySelector('.backy-canvas');
        const frame = document.querySelector('.backy-canvas-frame');
        const heading = document.querySelector('[data-element-id="responsive-smoke-heading"]');
        const marker = document.querySelector('[data-element-id="responsive-smoke-marker"]');
        if (!root || !canvas || !frame || !heading) {
          return { ready: false, reason: 'missing-root-or-heading' };
        }
        const scale = Number(root.getAttribute('data-backy-render-scale'));
        const headingRect = heading.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        const frameRect = frame.getBoundingClientRect();
        return {
          ready: true,
          breakpoint: root.getAttribute('data-backy-render-breakpoint'),
          rootScale: root.getAttribute('data-backy-render-scale'),
          canvasScale: canvas.parentElement?.getAttribute('data-backy-canvas-scale'),
          activeBreakpoint: canvas.getAttribute('data-backy-active-breakpoint'),
          headingText: heading.textContent.trim(),
          markerText: marker ? marker.textContent.trim() : '',
          markerExists: Boolean(marker),
          headingX: Math.round((headingRect.left - canvasRect.left) / scale),
          headingY: Math.round((headingRect.top - canvasRect.top) / scale),
          headingWidth: Math.round(headingRect.width / scale),
          rootScrollWidth: root.scrollWidth,
          rootClientWidth: root.clientWidth,
          frameWidth: Math.round(frameRect.width),
          documentScrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          frameworkOverlay: Boolean(document.querySelector('[data-nextjs-dialog]')),
        };
      })()
    `);

    if (
      lastState?.ready
      && lastState.breakpoint === expected.breakpoint
      && lastState.activeBreakpoint === expected.breakpoint
      && lastState.headingText === expected.headingText
      && lastState.headingX === expected.headingX
      && lastState.headingWidth === expected.headingWidth
      && lastState.markerExists === expected.markerExists
    ) {
      return lastState;
    }
    await sleep(150);
  }

  throw new Error(`Timed out waiting for ${expected.label} responsive state: ${JSON.stringify(lastState)}`);
}

async function assertViewport(pageUrl, expected) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: expected.viewportWidth,
    height: expected.viewportHeight,
    deviceScaleFactor: 1,
    mobile: expected.breakpoint === 'mobile',
  });
  await client.send('Page.navigate', { url: pageUrl });
  const state = await waitForResponsiveState(expected);

  assert(state.rootScale === state.canvasScale, `${expected.label} root/canvas scale mismatch: ${JSON.stringify(state)}`);
  assert(!state.frameworkOverlay, `${expected.label} rendered a framework error overlay`);
  assert(state.frameWidth <= state.rootClientWidth + 2, `${expected.label} expected visible canvas to fit the renderer viewport: ${JSON.stringify(state)}`);
  if (expected.scaleBelowOne) {
    assert(Number(state.rootScale) < 1, `${expected.label} expected scale below 1: ${JSON.stringify(state)}`);
  } else {
    assert(Number(state.rootScale) > 0.9, `${expected.label} expected near full scale: ${JSON.stringify(state)}`);
  }
  if (expected.markerExists) {
    assert(state.markerText === 'Desktop and tablet marker', `${expected.label} marker text mismatch: ${JSON.stringify(state)}`);
  }

  const screenshotPath = await captureScreenshot(`hosted-responsive-${expected.breakpoint}`);
  return { ...state, screenshotPath };
}

async function main() {
  await loginAdminApi();
  const page = await createResponsivePage();
  chrome = await launchChrome();
  const webSocketDebuggerUrl = await waitForCdp();
  client = await connectCdp(webSocketDebuggerUrl);
  await client.send('Page.enable');
  await client.send('Runtime.enable');

  const checks = [];
  checks.push(await assertViewport(page.url, {
    label: 'desktop',
    breakpoint: 'desktop',
    viewportWidth: 1440,
    viewportHeight: 1000,
    headingText: 'Desktop responsive heading',
    headingX: 120,
    headingWidth: 720,
    markerExists: true,
    scaleBelowOne: false,
  }));
  checks.push(await assertViewport(page.url, {
    label: 'tablet',
    breakpoint: 'tablet',
    viewportWidth: 820,
    viewportHeight: 1000,
    headingText: 'Tablet responsive heading',
    headingX: 48,
    headingWidth: 640,
    markerExists: true,
    scaleBelowOne: true,
  }));
  checks.push(await assertViewport(page.url, {
    label: 'mobile',
    breakpoint: 'mobile',
    viewportWidth: 390,
    viewportHeight: 900,
    headingText: 'Mobile responsive heading',
    headingX: 16,
    headingWidth: 320,
    markerExists: false,
    scaleBelowOne: true,
  }));

  console.log(JSON.stringify({
    success: true,
    page: page.url,
    screenshots: checks.map((check) => check.screenshotPath),
    breakpoints: checks.map((check) => ({
      breakpoint: check.breakpoint,
      scale: check.rootScale,
      headingX: check.headingX,
      headingWidth: check.headingWidth,
      markerExists: check.markerExists,
    })),
  }, null, 2));
}

async function cleanup() {
  if (client) {
    await client.send('Browser.close').catch(() => {});
    client.close();
  }
  if (chrome?.childProcess) {
    if (!(await waitForExit(chrome.childProcess))) {
      chrome.childProcess.kill('SIGTERM');
      if (!(await waitForExit(chrome.childProcess, 1000))) {
        chrome.childProcess.kill('SIGKILL');
      }
    }
  }
  if (chrome?.userDataDir) {
    fs.rmSync(chrome.userDataDir, { recursive: true, force: true });
  }
  await deleteResponsivePage();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(cleanup);
