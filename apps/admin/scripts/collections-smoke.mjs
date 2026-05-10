#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_COLLECTIONS_SMOKE_SITE_ID || 'site-demo';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_COLLECTIONS_CDP_PORT || 9386);
const SCREENSHOT_PATH = process.env.BACKY_COLLECTIONS_SCREENSHOT || path.join(os.tmpdir(), 'backy-collections-smoke.png');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
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

const requestApi = async (endpoint, options = {}) => {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : await response.text();

  if (!response.ok || payload?.success === false) {
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(payload?.error || payload).slice(0, 500)}`);
  }

  return payload;
};

const createCollection = async ({ name, slug }) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      slug,
      description: 'Temporary smoke collection for dynamic frontend datasets.',
      status: 'published',
      routePattern: `/${slug}/:recordSlug`,
      listRoutePattern: `/${slug}`,
      permissions: {
        publicRead: true,
        publicCreate: true,
        publicUpdate: false,
        publicDelete: false,
      },
      fields: [
        {
          key: 'title',
          label: 'Title',
          type: 'text',
          required: true,
          unique: true,
          sortOrder: 10,
        },
        {
          key: 'category',
          label: 'Category',
          type: 'select',
          required: true,
          unique: false,
          sortOrder: 20,
          options: ['Smoke', 'Reference', 'Live'],
        },
        {
          key: 'summary',
          label: 'Summary',
          type: 'richText',
          required: false,
          unique: false,
          sortOrder: 30,
        },
        {
          key: 'featured',
          label: 'Featured',
          type: 'boolean',
          required: false,
          unique: false,
          sortOrder: 40,
          defaultValue: false,
        },
        {
          key: 'website',
          label: 'Website',
          type: 'url',
          required: false,
          unique: false,
          sortOrder: 50,
        },
      ],
    }),
  });
  const collection = payload.data?.collection || payload.collection;
  assert(collection?.id, `Create collection did not return a collection: ${JSON.stringify(payload).slice(0, 500)}`);
  return collection;
};

const deleteCollection = async (collectionId) => {
  if (!collectionId) return;
  await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collectionId}`, { method: 'DELETE' });
};

const createRecord = async ({ collectionId, slug, title }) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collectionId}/records`, {
    method: 'POST',
    body: JSON.stringify({
      slug,
      status: 'draft',
      values: {
        title,
        category: 'Smoke',
        summary: 'Record created by the Collections smoke test.',
        featured: true,
        website: 'https://backy.local/smoke',
      },
    }),
  });
  const record = payload.data?.record || payload.record;
  assert(record?.id, `Create collection record did not return a record: ${JSON.stringify(payload).slice(0, 500)}`);
  return record;
};

const fetchRecordBySlug = async (collectionId, recordSlug) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collectionId}/records?slug=${encodeURIComponent(recordSlug)}`);
  const records = payload.data?.records || payload.records || [];
  return records[0] || null;
};

const waitForRecordStatus = async (collectionId, recordSlug, status) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const record = await fetchRecordBySlug(collectionId, recordSlug);
    if (record?.status === status) {
      return record;
    }
    await sleep(250);
  }

  throw new Error(`Collection record ${recordSlug} did not reach status ${status}`);
};

const assertPublicRecord = async (collectionSlug, recordSlug) => {
  const payload = await requestApi(`/api/sites/${SITE_ID}/collections/${collectionSlug}/records?slug=${encodeURIComponent(recordSlug)}`);
  const records = payload.data?.records || payload.records || [];
  assert(
    records.some((record) => record.slug === recordSlug && record.status === 'published'),
    `Public collection endpoint did not return published record ${recordSlug}: ${JSON.stringify(payload).slice(0, 500)}`,
  );
  return records[0];
};

const fetchJson = async (endpoint) => {
  const response = await fetch(`http://127.0.0.1:${PORT}${endpoint}`);
  if (!response.ok) {
    throw new Error(`${endpoint} returned ${response.status}`);
  }
  return response.json();
};

const waitForCdp = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const pages = await fetchJson('/json/list');
      const page = pages.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) {
        return page;
      }
    } catch {
      await sleep(100);
    }
  }

  throw new Error(`Chrome DevTools did not start on port ${PORT}`);
};

const connectCdp = (webSocketDebuggerUrl) => {
  const socket = new WebSocket(webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);

    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id);
      pending.delete(message.id);

      if (message.error) {
        request.reject(new Error(JSON.stringify(message.error)));
      } else {
        request.resolve(message.result);
      }
    }
  });

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  return {
    opened,
    close: () => socket.close(),
    send: (method, params = {}) => {
      const messageId = id += 1;
      socket.send(JSON.stringify({ id: messageId, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(messageId, { resolve, reject });
      });
    },
  };
};

const AUTH_STORAGE_SCRIPT = `
localStorage.setItem('backy-auth-storage', JSON.stringify({ state: { user: { id: '1', email: 'admin@backy.io', fullName: 'Admin User', role: 'admin' } }, version: 0 }));
`;

const evaluate = async (client, expression) => {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(`Runtime evaluation failed: ${JSON.stringify(result.exceptionDetails)}`);
  }

  return result.result.value;
};

const navigate = async (client, url, readyExpression, description) => {
  await client.send('Page.navigate', { url });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, readyExpression);
    if (state.ready) {
      return state;
    }
    if (attempt === 119) {
      throw new Error(`${description} did not become ready: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const navigateToCollections = (client, { collectionId, recordSlug }) => {
  const params = new URLSearchParams({
    siteId: SITE_ID,
    collectionId,
    search: recordSlug,
  });

  return navigate(
    client,
    `${ADMIN_BASE_URL}/collections?${params.toString()}`,
    `(() => ({
      ready: Boolean(document.querySelector('[data-testid="collections-command-center"]')) &&
        Boolean(document.querySelector('[data-testid="collections-templates"]')) &&
        document.body?.innerText?.includes('Collections command center') &&
        document.body?.innerText?.includes(${JSON.stringify(recordSlug)}),
      body: document.body?.innerText?.slice(0, 1200) || '',
      path: window.location.pathname,
      search: window.location.search,
    }))()`,
    'Collections page',
  );
};

const assertCollectionsLayout = async (client, { collectionName, collectionSlug, recordSlug }) => {
  const layout = await evaluate(client, `(() => {
    const body = document.body?.innerText || '';
    return {
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      path: window.location.pathname,
      hasCommandCenter: Boolean(document.querySelector('[data-testid="collections-command-center"]')),
      hasTemplates: Boolean(document.querySelector('[data-testid="collections-templates"]')),
      hasApiContract: body.includes('Collection API contract') && body.includes('Public records') && body.includes('Bulk records'),
      hasFrontendContract: body.includes('Dynamic data frontend contract') && body.includes('Frontend wiring'),
      hasBuilder: body.includes('Schema builder') && body.includes('Public read') && body.includes('Visitor create'),
      hasRecords: body.includes('Records') && body.includes('Import CSV') && body.includes('Export CSV') && body.includes('New record'),
      hasCollection: body.includes(${JSON.stringify(collectionName)}) && body.includes(${JSON.stringify(`/${collectionSlug}`)}),
      hasRecord: body.includes(${JSON.stringify(recordSlug)}) && body.includes(${JSON.stringify(`/${collectionSlug}/${recordSlug}`)}),
      hasFieldControls: body.includes('Title') && body.includes('Category') && body.includes('Featured') && body.includes('Website'),
      hasSelectionControl: Boolean(Array.from(document.querySelectorAll('input')).find((input) => (
        (input.getAttribute('aria-label') || '') === ${JSON.stringify(`Select record ${recordSlug}`)}
      ))),
    };
  })()`);

  assert(layout.scrollWidth <= layout.width + 8, `Collections page has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(
    layout.path === '/collections' &&
      layout.hasCommandCenter &&
      layout.hasTemplates &&
      layout.hasApiContract &&
      layout.hasFrontendContract &&
      layout.hasBuilder &&
      layout.hasRecords &&
      layout.hasCollection &&
      layout.hasRecord &&
      layout.hasFieldControls &&
      layout.hasSelectionControl,
    `Collections page missing expected regions: ${JSON.stringify(layout)}`,
  );
  return layout;
};

const publishRecordThroughUi = async (client, recordSlug) => {
  const selected = await evaluate(client, `(() => {
    const checkbox = Array.from(document.querySelectorAll('input')).find((input) => (
      (input.getAttribute('aria-label') || '') === ${JSON.stringify(`Select record ${recordSlug}`)}
    ));
    if (!(checkbox instanceof HTMLInputElement)) {
      return { ok: false, reason: 'record-checkbox-missing' };
    }
    if (!checkbox.checked) checkbox.click();
    return { ok: true, checked: checkbox.checked };
  })()`);
  assert(selected.ok, `Unable to select collection record: ${JSON.stringify(selected)}`);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: document.body?.innerText?.includes('1 selected') || false,
      body: document.body?.innerText?.slice(0, 800) || '',
    }))()`);
    if (state.ready) break;
    if (attempt === 39) {
      throw new Error(`Selected collection record toolbar did not appear: ${JSON.stringify(state)}`);
    }
    await sleep(100);
  }

  const clicked = await evaluate(client, `(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const button = buttons.find((candidate) => (candidate.textContent || '').trim() === 'Publish');
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'publish-button-missing', buttons: buttons.map((candidate) => candidate.textContent?.trim()).filter(Boolean).slice(0, 80) };
    }
    if (button.disabled) return { ok: false, reason: 'publish-button-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(clicked.ok, `Unable to publish selected collection record: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: document.body?.innerText?.includes('records moved to published') ||
        document.body?.innerText?.includes('1 records moved to published') ||
        false,
      hasPublishedBadge: document.body?.innerText?.includes('Published') || false,
      body: document.body?.innerText?.slice(0, 1000) || '',
    }))()`);
    if (state.ready || state.hasPublishedBadge) {
      return state;
    }
    if (attempt === 79) {
      throw new Error(`Collection record publish action did not settle: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return null;
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-collections-${Date.now()}`);
  const childProcess = spawn(CHROME_BIN, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1680,1180',
    'about:blank',
  ], { stdio: 'ignore' });

  return { childProcess, userDataDir };
};

const cleanup = async ({ client, childProcess, userDataDir, collectionId }) => {
  if (client) {
    try {
      await client.send('Browser.close');
    } catch {
      // Chrome may already be closing.
    }
    client.close();
  }

  if (childProcess && !(await waitForExit(childProcess))) {
    childProcess.kill('SIGTERM');
    if (!(await waitForExit(childProcess, 1000))) {
      childProcess.kill('SIGKILL');
    }
  }

  if (userDataDir) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }

  if (collectionId) {
    try {
      await deleteCollection(collectionId);
    } catch {
      // The smoke creates a temporary collection and deletes it best-effort.
    }
  }
};

const main = async () => {
  let client;
  let childProcess;
  let userDataDir;
  let collectionId;
  const suffix = Date.now().toString(36);
  const collectionName = `Smoke Directory ${suffix}`;
  const collectionSlug = `smoke-directory-${suffix}`;
  const recordSlug = `smoke-record-${suffix}`;
  const recordTitle = `Smoke record ${suffix}`;

  try {
    const collection = await createCollection({ name: collectionName, slug: collectionSlug });
    collectionId = collection.id;
    await createRecord({ collectionId, slug: recordSlug, title: recordTitle });

    ({ childProcess, userDataDir } = launchChrome());
    const target = await waitForCdp();
    client = connectCdp(target.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1680,
      height: 1180,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: AUTH_STORAGE_SCRIPT });

    await navigateToCollections(client, { collectionId, recordSlug });
    await assertCollectionsLayout(client, { collectionName, collectionSlug, recordSlug });
    await publishRecordThroughUi(client, recordSlug);
    await waitForRecordStatus(collectionId, recordSlug, 'published');
    await assertPublicRecord(collectionSlug, recordSlug);

    await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }).then((result) => {
      fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(result.data, 'base64'));
    });

    await deleteCollection(collectionId);
    collectionId = null;

    console.log(JSON.stringify({
      ok: true,
      siteId: SITE_ID,
      collectionName,
      collectionSlug,
      recordSlug,
      screenshot: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, collectionId });
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
