#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_PAGES_LIST_CDP_PORT || 9374);
const HIERARCHY_SITE_ID = process.env.BACKY_PAGES_LIST_HIERARCHY_SITE_ID || 'site-demo';
const EMPTY_SITE_ID = process.env.BACKY_PAGES_LIST_EMPTY_SITE_ID || 'site-cook';
const SCREENSHOT_PATH = process.env.BACKY_PAGES_LIST_SCREENSHOT || path.join(os.tmpdir(), 'backy-pages-list-smoke.png');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const requestApi = async (endpoint, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(payload.error || payload).slice(0, 300)}`);
  }

  return payload;
};

const createHierarchyPages = async () => {
  const suffix = Date.now().toString(36);
  const parentTitle = `Smoke Hierarchy Parent ${suffix}`;
  const childTitle = `Smoke Hierarchy Child ${suffix}`;
  const parentSlug = `smoke-hierarchy-parent-${suffix}`;
  const childSlug = `smoke-hierarchy-child-${suffix}`;
  const parentPayload = await requestApi(`/api/admin/sites/${HIERARCHY_SITE_ID}/pages`, {
    method: 'POST',
    body: JSON.stringify({
      title: parentTitle,
      slug: parentSlug,
      status: 'published',
      description: 'Temporary parent page for pages list hierarchy smoke.',
      content: [],
      meta: {
        title: parentTitle,
        description: 'Temporary parent page for pages list hierarchy smoke.',
        canonical: `/${parentSlug}`,
      },
    }),
  });
  const parentPage = parentPayload.data.page;
  const childPayload = await requestApi(`/api/admin/sites/${HIERARCHY_SITE_ID}/pages`, {
    method: 'POST',
    body: JSON.stringify({
      title: childTitle,
      slug: childSlug,
      status: 'draft',
      parentId: parentPage.id,
      description: 'Temporary child page for pages list hierarchy smoke.',
      content: [],
      meta: {
        title: childTitle,
        description: 'Temporary child page for pages list hierarchy smoke.',
        canonical: `/${childSlug}`,
        parentPageId: parentPage.id,
        parentPageTitle: parentPage.title,
        navigationPlacement: 'primary',
        navigationLabel: 'Smoke Child Link',
      },
    }),
  });

  return { parentPage, childPage: childPayload.data.page };
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
      return await fetchJson('/json/list');
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
  const events = [];

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
      return;
    }

    events.push(message);
  });

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  return {
    events,
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

const waitForPagesEmptyState = async (client) => {
  const url = `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(EMPTY_SITE_ID)}`;
  await client.send('Page.navigate', { url });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const emptyCreate = document.querySelector('[data-testid="pages-empty-create"]');
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        emptyCreate: Boolean(emptyCreate),
        emptyCreateTag: emptyCreate?.tagName || null,
        emptyCreateHref: emptyCreate?.getAttribute('href') || '',
        selectValue: document.querySelector('#pages-active-site')?.value || '',
        body: document.body?.innerText?.slice(0, 500) || '',
      };
    })()`);

    if (
      state.ready
      && state.emptyCreate
      && state.emptyCreateTag === 'A'
      && state.emptyCreateHref.includes('/pages/new')
      && state.emptyCreateHref.includes(`siteId=${encodeURIComponent(EMPTY_SITE_ID)}`)
      && state.selectValue === EMPTY_SITE_ID
    ) {
      return { url, state };
    }

    if (attempt === 99) {
      throw new Error(`Pages empty state did not render expected create link: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const clickEmptyCreate = async (client, testId, expectedSearch) => {
  const clicked = await evaluate(client, `(() => {
    const link = document.querySelector('[data-testid="${testId}"]');
    if (!(link instanceof HTMLAnchorElement)) {
      return { clicked: false, tag: link?.tagName || null, href: link?.getAttribute('href') || null };
    }
    link.click();
    return { clicked: true, href: link.href };
  })()`);
  assert(clicked.clicked, `Unable to click ${testId}: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      path: window.location.pathname,
      search: window.location.search,
      title: document.querySelector('#page-title')?.value || '',
      body: document.body?.innerText?.slice(0, 300) || '',
    }))()`);

    if (
      state.path === '/pages/new'
      && state.search.includes(`siteId=${encodeURIComponent(EMPTY_SITE_ID)}`)
      && expectedSearch.every((fragment) => state.search.includes(fragment))
    ) {
      return { clicked, state };
    }

    if (attempt === 79) {
      throw new Error(`${testId} did not navigate to page create with expected search: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const waitForHierarchyRow = async (client, page, expectedText, expectedSearch = page.title) => {
  const url = `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}&q=${encodeURIComponent(expectedSearch)}`;
  await client.send('Page.navigate', { url });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const hierarchy = document.querySelector('[data-testid="pages-hierarchy-${page.id}"]');
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        hierarchyText: hierarchy?.textContent || '',
        body: document.body?.innerText?.slice(0, 700) || '',
      };
    })()`);

    if (
      state.ready
      && state.hierarchyText.includes(expectedText)
    ) {
      return { url, state };
    }

    if (attempt === 99) {
      throw new Error(`Hierarchy row did not render expected text "${expectedText}": ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-pages-list-${Date.now()}`);
  const childProcess = spawn(CHROME_BIN, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,1100',
    'about:blank',
  ], { stdio: 'ignore' });

  return { childProcess, userDataDir };
};

const cleanup = async ({ client, childProcess, userDataDir, hierarchyPages }) => {
  if (hierarchyPages?.childPage?.id) {
    try {
      await requestApi(`/api/admin/sites/${HIERARCHY_SITE_ID}/pages/${hierarchyPages.childPage.id}`, { method: 'DELETE' });
    } catch (error) {
      console.warn(`Unable to delete smoke child page ${hierarchyPages.childPage.id}:`, error instanceof Error ? error.message : error);
    }
  }

  if (hierarchyPages?.parentPage?.id) {
    try {
      await requestApi(`/api/admin/sites/${HIERARCHY_SITE_ID}/pages/${hierarchyPages.parentPage.id}`, { method: 'DELETE' });
    } catch (error) {
      console.warn(`Unable to delete smoke parent page ${hierarchyPages.parentPage.id}:`, error instanceof Error ? error.message : error);
    }
  }

  if (client) {
    try {
      await client.send('Browser.close');
    } catch {
      // Chrome may already be closing.
    }
    client.close();
  }

  if (childProcess.exitCode === null && childProcess.signalCode === null) {
    childProcess.kill('SIGTERM');
    const exited = await waitForExit(childProcess);
    if (!exited) {
      childProcess.kill('SIGKILL');
      await waitForExit(childProcess, 500);
    }
  }

  fs.rmSync(userDataDir, { recursive: true, force: true });
};

const main = async () => {
  const { childProcess, userDataDir } = launchChrome();
  let client;
  let hierarchyPages = null;

  try {
    hierarchyPages = await createHierarchyPages();
    await waitForCdp();
    const page = (await fetchJson('/json/list')).find((candidate) => candidate.type === 'page');
    assert(page?.webSocketDebuggerUrl, 'No Chrome page target found');

    client = connectCdp(page.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('Log.enable');
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: AUTH_STORAGE_SCRIPT,
    });

    const initialRender = await waitForPagesEmptyState(client);
    const emptyCreate = await clickEmptyCreate(client, 'pages-empty-create', []);
    await waitForPagesEmptyState(client);
    const registrationShortcut = await clickEmptyCreate(client, 'pages-empty-create-registration', ['template=registration']);
    const childHierarchy = await waitForHierarchyRow(
      client,
      hierarchyPages.childPage,
      `Nested under ${hierarchyPages.parentPage.title}`,
    );
    const parentHierarchy = await waitForHierarchyRow(
      client,
      hierarchyPages.parentPage,
      '1 child page',
    );

    const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));

    const browserErrors = client.events
      .filter((event) => (
        event.method === 'Runtime.exceptionThrown'
        || (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error')
      ))
      .map((event) => event.params);

    assert(browserErrors.length === 0, `Browser emitted errors: ${JSON.stringify(browserErrors.slice(0, 3))}`);

    console.log(JSON.stringify({
      ok: true,
      initialRender,
      emptyCreate,
      registrationShortcut,
      childHierarchy,
      parentHierarchy,
      screenshotPath: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, hierarchyPages });
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
