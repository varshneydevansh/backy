#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_PAGE_CREATE_SMOKE_SITE_ID || 'site-demo';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_PAGE_CREATE_CDP_PORT || 9372);
const SCREENSHOT_PATH = process.env.BACKY_PAGE_CREATE_SCREENSHOT || path.join(os.tmpdir(), 'backy-page-create-smoke.png');

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

const navigateToPageCreate = async (client, slug, title, navLabel) => {
  const query = new URLSearchParams({
    siteId: SITE_ID,
    template: 'about',
    title,
    slug,
    navLabel,
  });
  const url = `${ADMIN_BASE_URL}/pages/new?${query.toString()}`;
  await client.send('Page.navigate', { url });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="page-creation-command-center"]')),
      nav: Boolean(document.querySelector('[data-testid="page-navigation-placement"]')),
      title: document.querySelector('#page-title')?.value || '',
      slug: document.querySelector('#page-slug')?.value || '',
      navPlacement: document.querySelector('#page-navigation-placement-select')?.value || '',
      navLabel: document.querySelector('#page-navigation-label')?.value || '',
      body: document.body?.innerText?.slice(0, 240) || '',
    }))()`);

    if (state.ready && state.nav && state.title === title && state.slug === slug && state.navPlacement === 'primary' && state.navLabel === navLabel) {
      return { url, state };
    }

    if (attempt === 99) {
      throw new Error(`Page create route did not render expected controls: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const createPageFromUi = async (client) => {
  let clicked = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    clicked = await evaluate(client, `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
        (candidate.textContent || '').includes('Create Page')
      ));
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return { ok: false, label: button?.textContent || null, disabled: button instanceof HTMLButtonElement ? button.disabled : null };
      }
      button.click();
      return { ok: true, label: button.textContent || '' };
    })()`);

    if (clicked.ok) {
      break;
    }

    await sleep(250);
  }
  assert(clicked.ok, `Create Page button was not ready: ${JSON.stringify(clicked)}`);

  let editState = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    editState = await evaluate(client, `(() => ({
      path: window.location.pathname,
      search: window.location.search,
      body: document.body?.innerText?.slice(0, 260) || '',
    }))()`);

    if (editState.path.startsWith('/pages/') && editState.path.endsWith('/edit')) {
      return editState;
    }

    if (attempt === 119) {
      throw new Error(`Page create did not navigate into the editor: ${JSON.stringify(editState)}`);
    }

    await sleep(300);
  }

  return editState;
};

const assertNavigationContainsPage = async (pageId, navLabel) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/navigation`);
  const primary = payload.data?.navigation?.settings?.primary || [];
  const item = primary.find((candidate) => candidate.pageId === pageId);

  assert(item, `Created page ${pageId} was not added to primary navigation: ${JSON.stringify(primary)}`);
  assert(item.label === navLabel, `Created page navigation label mismatch: ${JSON.stringify(item)}`);

  return item;
};

const removePageFromNavigation = async (pageId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/navigation`);
  const navigation = payload.data?.navigation?.settings;
  if (!navigation) return null;

  const strip = (items = []) => items
    .filter((item) => item.pageId !== pageId)
    .map((item) => ({ ...item, children: strip(item.children || []) }));
  const nextNavigation = {
    ...navigation,
    primary: strip(navigation.primary || []),
    footer: strip(navigation.footer || []),
  };

  await requestApi(`/api/admin/sites/${SITE_ID}/navigation`, {
    method: 'PATCH',
    body: JSON.stringify({ navigation: nextNavigation }),
  });

  return nextNavigation;
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-page-create-${Date.now()}`);
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

const cleanup = async ({ client, childProcess, userDataDir, pageId }) => {
  if (pageId) {
    try {
      await removePageFromNavigation(pageId);
    } catch (error) {
      console.warn(`Unable to remove smoke page ${pageId} from navigation:`, error instanceof Error ? error.message : error);
    }

    try {
      await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`, { method: 'DELETE' });
    } catch (error) {
      console.warn(`Unable to delete smoke page ${pageId}:`, error instanceof Error ? error.message : error);
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
  const slug = `page-create-smoke-${Date.now().toString(36)}`;
  const title = 'Smoke Page Create';
  const navLabel = 'Smoke Nav Page';
  const { childProcess, userDataDir } = launchChrome();
  let client;
  let pageId = null;

  try {
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

    const initialRender = await navigateToPageCreate(client, slug, title, navLabel);
    const editState = await createPageFromUi(client);
    pageId = editState.path.split('/').filter(Boolean).at(-2);
    const navigationItem = await assertNavigationContainsPage(pageId, navLabel);

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
      url: initialRender.url,
      initialRender: initialRender.state,
      editState,
      pageId,
      navigationItem,
      screenshotPath: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, pageId });
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
