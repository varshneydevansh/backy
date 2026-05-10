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

const createParentPage = async () => {
  const slug = `page-create-parent-${Date.now().toString(36)}`;
  const title = 'Smoke Parent Page';
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages`, {
    method: 'POST',
    body: JSON.stringify({
      title,
      slug,
      status: 'published',
      description: 'Temporary parent page for page create hierarchy smoke.',
      content: [],
      meta: {
        title,
        description: 'Temporary parent page for page create hierarchy smoke.',
        canonical: `/${slug}`,
      },
    }),
  });
  return payload.data.page;
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

const navigateToPageCreate = async (client, slug, title, navLabel, seo, parentPageId) => {
  const query = new URLSearchParams({
    siteId: SITE_ID,
    template: 'about',
    title,
    slug,
    navLabel,
    parentPageId,
    seoTitle: seo.title,
    canonical: seo.canonical,
    keywords: seo.keywords,
    jsonLd: seo.jsonLd,
    ogImage: seo.ogImage,
    noIndex: 'true',
    noFollow: 'true',
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
      parentPageId: document.querySelector('#page-parent-page')?.value || '',
      seoTitle: document.querySelector('#page-seo-title')?.value || '',
      canonical: document.querySelector('#page-canonical-path')?.value || '',
      keywords: document.querySelector('#page-seo-keywords')?.value || '',
      jsonLd: document.querySelector('#page-json-ld')?.value || '',
      ogImage: document.querySelector('#page-og-image')?.value || '',
      noIndex: Array.from(document.querySelectorAll('#page-seo input[type="checkbox"]'))[0]?.checked ?? null,
      noFollow: Array.from(document.querySelectorAll('#page-seo input[type="checkbox"]'))[1]?.checked ?? null,
      templatePreviewCount: document.querySelectorAll('[data-testid^="page-template-preview-"]').length,
      activeTemplatePreview: document.querySelector('[data-testid="page-template-preview-about"]')?.getAttribute('data-active') || '',
      activeTemplateBlockCount: Number(document.querySelector('[data-testid="page-template-preview-about"]')?.getAttribute('data-block-count') || 0),
      selectedTemplatePreview: document.querySelector('[data-testid="page-selected-template-preview"]')?.getAttribute('data-template') || '',
      body: document.body?.innerText?.slice(0, 240) || '',
    }))()`);

    if (
      state.ready
      && state.nav
      && state.title === title
      && state.slug === slug
      && state.navPlacement === 'primary'
      && state.navLabel === navLabel
      && state.parentPageId === parentPageId
      && state.seoTitle === seo.title
      && state.canonical === seo.canonical
      && state.keywords === seo.keywords
      && state.jsonLd === seo.jsonLd
      && state.ogImage === seo.ogImage
      && state.noIndex === true
      && state.noFollow === true
      && state.templatePreviewCount === 7
      && state.activeTemplatePreview === 'true'
      && state.activeTemplateBlockCount > 0
      && state.selectedTemplatePreview === 'about'
    ) {
      return { url, state };
    }

    if (attempt === 99) {
      throw new Error(`Page create route did not render expected controls: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const assertAutosaveWritten = async (client, slug, title, navLabel, seo, parentPageId) => {
  let state = null;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    state = await evaluate(client, `(() => {
      const raw = localStorage.getItem('backy:page-new:draft:v1');
      const parsed = raw ? JSON.parse(raw) : null;
      return {
        hasDraft: Boolean(parsed),
        title: parsed?.formData?.title || null,
        slug: parsed?.formData?.slug || null,
        template: parsed?.formData?.template || null,
        navigationPlacement: parsed?.formData?.navigationPlacement || null,
        navigationLabel: parsed?.formData?.navigationLabel || null,
        parentPageId: parsed?.formData?.parentPageId || null,
        seoTitle: parsed?.formData?.seoTitle || null,
        canonicalPath: parsed?.formData?.canonicalPath || null,
        keywords: parsed?.formData?.keywords || null,
        jsonLdText: parsed?.formData?.jsonLdText || null,
        ogImage: parsed?.formData?.ogImage || null,
        noIndex: parsed?.formData?.noIndex ?? null,
        noFollow: parsed?.formData?.noFollow ?? null,
        badge: Array.from(document.querySelectorAll('span')).map((node) => node.textContent || '').find((text) => /Autosaved|Saving draft|Autosave/.test(text)) || '',
      };
    })()`);

    if (state.hasDraft) {
      break;
    }

    await sleep(250);
  }

  assert(state.hasDraft, `Autosave draft was not written: ${JSON.stringify(state)}`);
  assert(state.title === title, `Autosave title mismatch: ${JSON.stringify(state)}`);
  assert(state.slug === slug, `Autosave slug mismatch: ${JSON.stringify(state)}`);
  assert(state.template === 'about', `Autosave template mismatch: ${JSON.stringify(state)}`);
  assert(state.navigationPlacement === 'primary', `Autosave navigation placement mismatch: ${JSON.stringify(state)}`);
  assert(state.navigationLabel === navLabel, `Autosave navigation label mismatch: ${JSON.stringify(state)}`);
  assert(state.parentPageId === parentPageId, `Autosave parent page mismatch: ${JSON.stringify(state)}`);
  assert(state.seoTitle === seo.title, `Autosave SEO title mismatch: ${JSON.stringify(state)}`);
  assert(state.canonicalPath === seo.canonical, `Autosave canonical mismatch: ${JSON.stringify(state)}`);
  assert(state.keywords === seo.keywords, `Autosave keywords mismatch: ${JSON.stringify(state)}`);
  assert(state.jsonLdText === seo.jsonLd, `Autosave JSON-LD mismatch: ${JSON.stringify(state)}`);
  assert(state.ogImage === seo.ogImage, `Autosave OG image mismatch: ${JSON.stringify(state)}`);
  assert(state.noIndex === true, `Autosave noIndex mismatch: ${JSON.stringify(state)}`);
  assert(state.noFollow === true, `Autosave noFollow mismatch: ${JSON.stringify(state)}`);
  return state;
};

const assertRecoveryRestore = async (client, slug, title, navLabel, seo, parentPageId) => {
  await client.send('Page.reload', { ignoreCache: true });
  await sleep(500);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      recovery: Boolean(document.querySelector('[data-testid="page-create-recovery"]')),
      restore: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent || '').trim() === 'Restore draft'),
      body: document.body?.innerText?.slice(0, 260) || '',
    }))()`);

    if (state.recovery && state.restore) {
      break;
    }

    if (attempt === 79) {
      throw new Error(`Autosave recovery banner did not render: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  const restored = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (candidate.textContent || '').trim() === 'Restore draft');
    if (!(button instanceof HTMLButtonElement)) {
      return { clicked: false };
    }
    button.click();
    return { clicked: true };
  })()`);
  assert(restored.clicked, `Restore draft button was not clickable: ${JSON.stringify(restored)}`);
  await sleep(500);

  const state = await evaluate(client, `(() => ({
    title: document.querySelector('#page-title')?.value || '',
    slug: document.querySelector('#page-slug')?.value || '',
    navPlacement: document.querySelector('#page-navigation-placement-select')?.value || '',
    navLabel: document.querySelector('#page-navigation-label')?.value || '',
    parentPageId: document.querySelector('#page-parent-page')?.value || '',
    seoTitle: document.querySelector('#page-seo-title')?.value || '',
    canonical: document.querySelector('#page-canonical-path')?.value || '',
    keywords: document.querySelector('#page-seo-keywords')?.value || '',
    jsonLd: document.querySelector('#page-json-ld')?.value || '',
    ogImage: document.querySelector('#page-og-image')?.value || '',
    noIndex: Array.from(document.querySelectorAll('#page-seo input[type="checkbox"]'))[0]?.checked ?? null,
    noFollow: Array.from(document.querySelectorAll('#page-seo input[type="checkbox"]'))[1]?.checked ?? null,
    notice: document.body?.innerText?.includes('Recovered local page draft.') || false,
  }))()`);

  assert(state.title === title, `Recovered draft title mismatch: ${JSON.stringify(state)}`);
  assert(state.slug === slug, `Recovered draft slug mismatch: ${JSON.stringify(state)}`);
  assert(state.navPlacement === 'primary', `Recovered draft navigation placement mismatch: ${JSON.stringify(state)}`);
  assert(state.navLabel === navLabel, `Recovered draft navigation label mismatch: ${JSON.stringify(state)}`);
  assert(state.parentPageId === parentPageId, `Recovered draft parent page mismatch: ${JSON.stringify(state)}`);
  assert(state.seoTitle === seo.title, `Recovered draft SEO title mismatch: ${JSON.stringify(state)}`);
  assert(state.canonical === seo.canonical, `Recovered draft canonical mismatch: ${JSON.stringify(state)}`);
  assert(state.keywords === seo.keywords, `Recovered draft keywords mismatch: ${JSON.stringify(state)}`);
  assert(state.jsonLd === seo.jsonLd, `Recovered draft JSON-LD mismatch: ${JSON.stringify(state)}`);
  assert(state.ogImage === seo.ogImage, `Recovered draft OG image mismatch: ${JSON.stringify(state)}`);
  assert(state.noIndex === true, `Recovered draft noIndex mismatch: ${JSON.stringify(state)}`);
  assert(state.noFollow === true, `Recovered draft noFollow mismatch: ${JSON.stringify(state)}`);
  return state;
};

const assertCreatedPageSeo = async (pageId, seo, parentPage) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const page = payload.data?.page;

  assert(page, `Created page ${pageId} detail was not returned`);
  assert(page.parentId === parentPage.id, `Created page parentId mismatch: ${JSON.stringify({ parentId: page.parentId, meta: page.meta })}`);
  assert(page.meta?.title === seo.title, `Created page SEO title mismatch: ${JSON.stringify(page.meta)}`);
  assert(page.meta?.canonical === seo.normalizedCanonical, `Created page canonical mismatch: ${JSON.stringify(page.meta)}`);
  assert(Array.isArray(page.meta?.keywords) && page.meta.keywords.join(',') === seo.expectedKeywords.join(','), `Created page keywords mismatch: ${JSON.stringify(page.meta)}`);
  assert(Array.isArray(page.meta?.jsonLd) && page.meta.jsonLd[0]?.['@type'] === 'AboutPage', `Created page JSON-LD mismatch: ${JSON.stringify(page.meta)}`);
  assert(page.meta?.ogImage === seo.ogImage, `Created page OG image mismatch: ${JSON.stringify(page.meta)}`);
  assert(page.meta?.noIndex === true, `Created page noIndex mismatch: ${JSON.stringify(page.meta)}`);
  assert(page.meta?.noFollow === true, `Created page noFollow mismatch: ${JSON.stringify(page.meta)}`);
  assert(page.meta?.parentPageId === parentPage.id, `Created page meta parent id mismatch: ${JSON.stringify(page.meta)}`);
  assert(page.meta?.parentPageTitle === parentPage.title, `Created page meta parent title mismatch: ${JSON.stringify(page.meta)}`);

  return { parentId: page.parentId, meta: page.meta };
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
      storedDraft: localStorage.getItem('backy:page-new:draft:v1'),
      body: document.body?.innerText?.slice(0, 260) || '',
    }))()`);

    if (editState.path.startsWith('/pages/') && editState.path.endsWith('/edit')) {
      assert(editState.storedDraft === null, `Autosave draft was not cleared after create: ${JSON.stringify(editState)}`);
      return editState;
    }

    if (attempt === 119) {
      throw new Error(`Page create did not navigate into the editor: ${JSON.stringify(editState)}`);
    }

    await sleep(300);
  }

  return editState;
};

const findNavigationItem = (items, predicate) => {
  for (const item of items || []) {
    if (predicate(item)) return item;
    const child = findNavigationItem(item.children || [], predicate);
    if (child) return child;
  }
  return null;
};

const assertNavigationContainsPage = async (pageId, navLabel, parentPageId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/navigation`);
  const primary = payload.data?.navigation?.settings?.primary || [];
  const parentItem = findNavigationItem(primary, (candidate) => candidate.pageId === parentPageId);
  const item = findNavigationItem(parentItem?.children || [], (candidate) => candidate.pageId === pageId);

  assert(parentItem, `Parent page ${parentPageId} was not available in primary navigation: ${JSON.stringify(primary)}`);
  assert(item, `Created page ${pageId} was not nested under parent ${parentPageId}: ${JSON.stringify(parentItem)}`);
  assert(item.label === navLabel, `Created page navigation label mismatch: ${JSON.stringify(item)}`);

  return { parentItem, item };
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

const cleanup = async ({ client, childProcess, userDataDir, pageId, parentPageId }) => {
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

  if (parentPageId) {
    try {
      await removePageFromNavigation(parentPageId);
    } catch (error) {
      console.warn(`Unable to remove smoke parent page ${parentPageId} from navigation:`, error instanceof Error ? error.message : error);
    }

    try {
      await requestApi(`/api/admin/sites/${SITE_ID}/pages/${parentPageId}`, { method: 'DELETE' });
    } catch (error) {
      console.warn(`Unable to delete smoke parent page ${parentPageId}:`, error instanceof Error ? error.message : error);
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
  const seo = {
    title: 'Smoke Page SEO Title',
    canonical: `https://example.com/${slug}`,
    normalizedCanonical: `/${slug}`,
    keywords: 'smoke page, page builder, structured data',
    expectedKeywords: ['smoke page', 'page builder', 'structured data'],
    jsonLd: JSON.stringify([
      {
        '@context': 'https://schema.org',
        '@type': 'AboutPage',
        name: 'Smoke Page SEO Title',
      },
    ], null, 2),
    ogImage: 'https://example.com/smoke-page-og.jpg',
  };
  const { childProcess, userDataDir } = launchChrome();
  let client;
  let pageId = null;
  let parentPage = null;

  try {
    parentPage = await createParentPage();
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

    const initialRender = await navigateToPageCreate(client, slug, title, navLabel, seo, parentPage.id);
    const autosave = await assertAutosaveWritten(client, slug, title, navLabel, seo, parentPage.id);
    const recovery = await assertRecoveryRestore(client, slug, title, navLabel, seo, parentPage.id);
    const editState = await createPageFromUi(client);
    pageId = editState.path.split('/').filter(Boolean).at(-2);
    const navigationItem = await assertNavigationContainsPage(pageId, navLabel, parentPage.id);
    const pageMeta = await assertCreatedPageSeo(pageId, seo, parentPage);

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
      autosave,
      recovery,
      editState,
      pageId,
      parentPageId: parentPage.id,
      navigationItem,
      pageMeta,
      screenshotPath: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, pageId, parentPageId: parentPage?.id || null });
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
