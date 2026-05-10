#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_SITES_CDP_PORT || 9383);
const SCREENSHOT_PATH = process.env.BACKY_SITES_SCREENSHOT || path.join(os.tmpdir(), 'backy-sites-smoke.png');

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
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(payload.error || payload).slice(0, 500)}`);
  }

  return payload;
};

const listSites = async () => {
  const payload = await requestApi('/api/admin/sites?includeUnpublished=true');
  return payload.data?.sites || payload.sites || [];
};

const createSite = async ({ name, slug, customDomain }) => {
  const payload = await requestApi('/api/admin/sites', {
    method: 'POST',
    body: JSON.stringify({
      name,
      slug,
      customDomain,
      description: 'Temporary multi-site smoke workspace.',
      status: 'draft',
    }),
  });
  const site = payload.data?.site || payload.site;
  assert(site?.id, `Create site did not return a site: ${JSON.stringify(payload).slice(0, 500)}`);
  return site;
};

const getSite = async (siteId) => {
  const payload = await requestApi(`/api/admin/sites/${siteId}`);
  return payload.data?.site || payload.site;
};

const deleteSite = async (siteId) => {
  if (!siteId) return;
  await requestApi(`/api/admin/sites/${siteId}`, { method: 'DELETE' });
};

const findSiteBySlug = async (slug) => {
  const sites = await listSites();
  return sites.find((site) => site.slug === slug) || null;
};

const waitForSite = async (slug, predicate = () => true) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const site = await findSiteBySlug(slug);
    if (site && predicate(site)) {
      return site;
    }
    await sleep(250);
  }

  throw new Error(`Timed out waiting for site ${slug}`);
};

const waitForSiteMissing = async (slug) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const site = await findSiteBySlug(slug);
    if (!site) {
      return;
    }
    await sleep(250);
  }

  throw new Error(`Temporary site ${slug} still exists after cleanup`);
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

const navigateToCreateSite = (client) => navigate(
  client,
  `${ADMIN_BASE_URL}/sites/new`,
  `(() => ({
    ready: Boolean(document.querySelector('[data-testid="site-creation-command-center"]')) &&
      document.body?.innerText?.includes('Starter structure') &&
      document.body?.innerText?.includes('API handoff'),
    body: document.body?.innerText?.slice(0, 900) || '',
  }))()`,
  'Create site page',
);

const navigateToSites = (client, expectedText = 'Sites command center') => navigate(
  client,
  `${ADMIN_BASE_URL}/sites`,
  `(() => ({
    ready: Boolean(document.querySelector('[data-testid="sites-command-center"]')) &&
      document.body?.innerText?.includes(${JSON.stringify(expectedText)}),
    body: document.body?.innerText?.slice(0, 900) || '',
  }))()`,
  'Sites page',
);

const waitForSitesPageSite = async (client, siteName) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="sites-command-center"]')),
      hasSite: document.body?.innerText?.includes(${JSON.stringify(siteName)}) || false,
      path: window.location.pathname,
      body: document.body?.innerText?.slice(0, 900) || '',
    }))()`);
    if (state.ready && state.hasSite && state.path === '/sites') {
      return state;
    }
    if (attempt === 119) {
      throw new Error(`Sites page did not show temporary site: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const setSiteStatusSelect = async (client, siteName, status) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const select = Array.from(document.querySelectorAll('select')).find((candidate) => (
        (candidate.getAttribute('aria-label') || '') === ${JSON.stringify(`Change status for ${siteName}`)}
      ));
      if (!(select instanceof HTMLSelectElement)) {
        return {
          ok: false,
          reason: 'select-missing',
          labels: Array.from(document.querySelectorAll('select')).map((candidate) => candidate.getAttribute('aria-label') || '').slice(0, 40),
        };
      }
      if (select.disabled) return { ok: false, reason: 'select-disabled' };
      const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
      descriptor?.set?.call(select, ${JSON.stringify(status)});
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, value: select.value };
    })()`);

    if (result.ok) {
      return result;
    }
    if (attempt === 79) {
      throw new Error(`Unable to set site status to ${status}: ${JSON.stringify(result)}`);
    }
    await sleep(250);
  }

  return null;
};

const deleteSiteThroughUi = async (client, siteName) => {
  await waitForSitesPageSite(client, siteName);
  const openResult = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
      (candidate.getAttribute('aria-label') || '') === ${JSON.stringify(`Delete ${siteName}`)}
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        buttons: Array.from(document.querySelectorAll('button')).map((candidate) => candidate.getAttribute('aria-label') || candidate.textContent || '').slice(0, 80),
      };
    }
    if (button.disabled) return { ok: false, reason: 'delete-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(openResult.ok, `Unable to open site delete confirmation: ${JSON.stringify(openResult)}`);

  const confirmResult = await evaluate(client, `(() => {
    const dialog = Array.from(document.querySelectorAll('[class*="fixed"]')).find((candidate) => (
      (candidate.textContent || '').includes(${JSON.stringify(`Delete ${siteName}?`)})
    ));
    const button = dialog && Array.from(dialog.querySelectorAll('button')).find((candidate) => (
      (candidate.textContent || '').trim() === 'Delete site'
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'confirm-missing', dialog: dialog?.textContent?.slice(0, 500) || '' };
    }
    if (button.disabled) return { ok: false, reason: 'confirm-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(confirmResult.ok, `Unable to confirm site deletion: ${JSON.stringify(confirmResult)}`);
};

const assertLayout = async (client, siteName) => {
  const layout = await evaluate(client, `(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    hasCommandCenter: Boolean(document.querySelector('[data-testid="sites-command-center"]')),
    hasSite: document.body?.innerText?.includes(${JSON.stringify(siteName)}) || false,
    hasFrontendApi: document.body?.innerText?.includes('Site frontend API') || false,
    hasFeatureContract: document.body?.innerText?.includes('Website feature contract') || false,
    hasRequiredControls: document.body?.innerText?.includes('What Backy still needs here') || false,
    hasLibrary: Boolean(document.querySelector('input[aria-label="Search sites"]')),
  }))()`);
  assert(layout.scrollWidth <= layout.width + 8, `Sites page has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(
    layout.hasCommandCenter && layout.hasSite && layout.hasFrontendApi && layout.hasFeatureContract && layout.hasRequiredControls && layout.hasLibrary,
    `Sites page missing expected regions: ${JSON.stringify(layout)}`,
  );
  return layout;
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-sites-${Date.now()}`);
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

const cleanup = async ({ client, childProcess, userDataDir, siteId }) => {
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

  if (siteId) {
    try {
      await deleteSite(siteId);
    } catch {
      // The UI flow may already have removed the temporary site.
    }
  }
};

const main = async () => {
  let client;
  let childProcess;
  let userDataDir;
  let createdSiteId;
  const suffix = Date.now().toString(36);
  const siteName = `Sites Smoke ${suffix}`;
  const slug = `sites-smoke-${suffix}`;
  const customDomain = `${slug}.example.com`;

  try {
    const existing = await findSiteBySlug(slug);
    assert(!existing, `Temporary site already exists: ${slug}`);

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

    await navigateToCreateSite(client);

    const created = await createSite({ name: siteName, slug, customDomain });
    createdSiteId = created.id;
    assert(created.status === 'draft', `Unexpected created site status: ${JSON.stringify(created)}`);

    await navigateToSites(client, siteName);
    await waitForSitesPageSite(client, siteName);
    await assertLayout(client, siteName);

    await setSiteStatusSelect(client, siteName, 'published');
    const published = await waitForSite(slug, (site) => site.status === 'published' || site.isPublished === true);
    assert((await getSite(published.id)).status === 'published', 'Site status update did not persist through the admin API.');

    await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }).then((result) => {
      fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(result.data, 'base64'));
    });

    await deleteSiteThroughUi(client, siteName);
    await waitForSiteMissing(slug);
    createdSiteId = null;

    console.log(JSON.stringify({
      ok: true,
      siteName,
      slug,
      screenshot: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, siteId: createdSiteId });
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
