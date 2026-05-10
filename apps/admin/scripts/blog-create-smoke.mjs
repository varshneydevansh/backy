#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_BLOG_CREATE_SMOKE_SITE_ID || 'site-demo';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_BLOG_CREATE_CDP_PORT || 9371);
const SCREENSHOT_PATH = process.env.BACKY_BLOG_CREATE_SCREENSHOT || path.join(os.tmpdir(), 'backy-blog-create-smoke.png');

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

const navigateToBlogCreate = async (client) => {
  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}/blog/new?siteId=${encodeURIComponent(SITE_ID)}` });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="blog-create-command-center"]')),
      title: document.body?.innerText?.includes('New Blog Post') || false,
      seo: Boolean(document.querySelector('#blog-create-seo')),
      media: Boolean(document.querySelector('#blog-create-media')),
      canvas: Boolean(document.querySelector('[data-testid="editor-canvas"]')),
      body: document.body?.innerText?.slice(0, 200) || '',
    }))()`);

    if (state.ready && state.title && state.seo && state.media && state.canvas) {
      return state;
    }

    if (attempt === 99) {
      throw new Error(`Blog create page did not render expected controls: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const fillBlogCreateForm = async (client, slug) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const ready = await evaluate(client, `(() => {
      const title = document.querySelector('#blog-create-title');
      const checkbox = Array.from(document.querySelectorAll('#blog-create-seo label')).find((candidate) => (
        /No index/.test(candidate.textContent || '')
      ))?.querySelector('input[type="checkbox"]');
      return {
        titleReady: title instanceof HTMLInputElement && !title.disabled,
        checkboxReady: checkbox instanceof HTMLInputElement && !checkbox.disabled,
      };
    })()`);

    if (ready.titleReady && ready.checkboxReady) {
      break;
    }

    if (attempt === 79) {
      throw new Error(`Blog create controls stayed disabled: ${JSON.stringify(ready)}`);
    }

    await sleep(250);
  }

  const result = await evaluate(client, `(() => {
    const setInput = (selector, value) => {
      const node = document.querySelector(selector);
      if (!node) return false;
      const proto = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      setter?.call(node, value);
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };

    return {
      title: setInput('#blog-create-title', 'Smoke Blog Create'),
      slug: setInput('#blog-create-slug', '${slug}'),
      excerpt: setInput('#blog-create-excerpt', 'Smoke summary long enough for readiness, feeds, and search previews.'),
      seoTitle: setInput('#blog-create-seo-title', 'Smoke Blog Create SEO Title'),
      canonical: setInput('#blog-create-canonical', '/blog/${slug}'),
      seoDescription: setInput('#blog-create-seo-description', 'Smoke SEO description long enough to satisfy search preview readiness and frontend handoff validation.'),
      ogImage: setInput('#blog-create-og-image', 'https://example.com/smoke-og.jpg'),
      noIndex: (() => {
        const label = Array.from(document.querySelectorAll('#blog-create-seo label')).find((candidate) => (
          /No index/.test(candidate.textContent || '')
        ));
        const node = label?.querySelector('input[type="checkbox"]');
        if (!(node instanceof HTMLInputElement)) return false;
        if (!node.checked) {
          node.click();
        }
        return true;
      })(),
    };
  })()`);

  assert(Object.values(result).every(Boolean), `Unable to fill blog create controls: ${JSON.stringify(result)}`);
  await sleep(1100);
  return result;
};

const assertAutosaveWritten = async (client, slug) => {
  let state = null;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    state = await evaluate(client, `(() => {
      const raw = localStorage.getItem('backy:blog-new:draft:v1');
      const parsed = raw ? JSON.parse(raw) : null;
      return {
        hasDraft: Boolean(parsed),
        slug: parsed?.slug || null,
        title: parsed?.title || null,
        seoDescription: parsed?.seoDescription || null,
        noIndex: parsed?.noIndex ?? null,
        canvasCount: parsed?.canvasElements?.length || 0,
        badge: Array.from(document.querySelectorAll('span')).map((node) => node.textContent || '').find((text) => /Autosaved|Saving draft|Autosave/.test(text)) || '',
      };
    })()`);

    if (state.hasDraft) {
      break;
    }

    await sleep(250);
  }

  assert(state.hasDraft, `Autosave draft was not written: ${JSON.stringify(state)}`);
  assert(state.slug === slug, `Autosave draft slug mismatch: ${JSON.stringify(state)}`);
  assert(state.noIndex === true, `Autosave did not retain robots toggle: ${JSON.stringify(state)}`);
  assert(state.canvasCount > 0, `Autosave did not retain canvas elements: ${JSON.stringify(state)}`);
  return state;
};

const assertFeaturedMediaPicker = async (client) => {
  const clicked = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
      /Select image|Replace image/.test(candidate.textContent || '')
    ));
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { ok: false, label: button?.textContent || null, disabled: button instanceof HTMLButtonElement ? button.disabled : null };
    }
    button.click();
    return { ok: true, label: button.textContent || '' };
  })()`);

  assert(clicked.ok, `Featured media picker button was not ready: ${JSON.stringify(clicked)}`);

  let state = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    state = await evaluate(client, `(() => ({
      hasModal: document.body?.innerText?.includes('Media library') || false,
      hasContext: document.body?.innerText?.includes('Context:') && document.body?.innerText?.includes('Smoke Blog Create'),
      hasUploadTab: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent || '').trim() === 'upload'),
      hasImageFilter: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent || '').trim() === 'image'),
      hasScopeControls: document.body?.innerText?.includes('Selection controls') || false,
      closeButton: Boolean(document.querySelector('button[aria-label="Close media library"]')),
    }))()`);

    if (state.hasModal && state.hasContext && state.hasUploadTab && state.hasImageFilter && state.hasScopeControls && state.closeButton) {
      break;
    }

    if (attempt === 79) {
      throw new Error(`Featured media picker did not render expected controls: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  const closed = await evaluate(client, `(() => {
    const button = document.querySelector('button[aria-label="Close media library"]');
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`);
  assert(closed, 'Unable to close featured media picker');
  await sleep(250);

  return {
    opened: clicked,
    modal: state,
  };
};

const assertRecoveryRestore = async (client, slug) => {
  await client.send('Page.reload', { ignoreCache: true });
  await sleep(500);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      recovery: document.body?.innerText?.includes('Recovered unsaved blog draft') || false,
      restore: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent || '').trim() === 'Restore draft'),
      body: document.body?.innerText?.slice(0, 220) || '',
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
    slug: document.querySelector('#blog-create-slug')?.value || '',
    seoDescription: document.querySelector('#blog-create-seo-description')?.value || '',
    noIndex: Array.from(document.querySelectorAll('#blog-create-seo input[type="checkbox"]'))[0]?.checked ?? null,
    notice: document.body?.innerText?.includes('Recovered local blog draft.') || false,
  }))()`);

  assert(state.slug === slug, `Recovered draft did not restore slug: ${JSON.stringify(state)}`);
  assert(state.noIndex === true, `Recovered draft did not restore robots toggle: ${JSON.stringify(state)}`);
  assert(state.seoDescription.length > 50, `Recovered draft did not restore SEO description: ${JSON.stringify(state)}`);
  return state;
};

const createPreviewFromUi = async (client) => {
  const beforeTargets = await fetchJson('/json/list');
  const clicked = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (candidate.textContent || '').includes('Save draft and preview'));
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { ok: false, label: button?.textContent || null, disabled: button instanceof HTMLButtonElement ? button.disabled : null };
    }
    button.click();
    return { ok: true, label: button.textContent || '' };
  })()`);
  assert(clicked.ok, `Save draft and preview button was not ready: ${JSON.stringify(clicked)}`);

  let editPath = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      path: window.location.pathname,
      text: document.body?.innerText?.slice(0, 260) || '',
      storedDraft: localStorage.getItem('backy:blog-new:draft:v1'),
    }))()`);

    if (state.path.startsWith('/blog/') && state.path !== '/blog/new') {
      editPath = state.path;
      assert(state.storedDraft === null, `Autosave draft was not cleared after create: ${JSON.stringify(state)}`);
      break;
    }

    if (attempt === 99) {
      throw new Error(`Create preview did not navigate to edit page: ${JSON.stringify(state)}`);
    }

    await sleep(300);
  }

  const afterTargets = await fetchJson('/json/list');
  return {
    editPath,
    openedPreviewTargets: Math.max(0, afterTargets.length - beforeTargets.length),
  };
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-blog-create-${Date.now()}`);
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

const cleanup = async ({ client, childProcess, userDataDir, postId }) => {
  if (postId) {
    try {
      await requestApi(`/api/admin/sites/${SITE_ID}/blog/${postId}`, { method: 'DELETE' });
    } catch (error) {
      console.warn(`Unable to delete smoke post ${postId}:`, error instanceof Error ? error.message : error);
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
  const slug = `blog-create-smoke-${Date.now().toString(36)}`;
  const { childProcess, userDataDir } = launchChrome();
  let client;
  let postId = null;

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

    const initialRender = await navigateToBlogCreate(client);
    const filled = await fillBlogCreateForm(client, slug);
    const mediaPicker = await assertFeaturedMediaPicker(client);
    const autosave = await assertAutosaveWritten(client, slug);
    const recovery = await assertRecoveryRestore(client, slug);
    const preview = await createPreviewFromUi(client);
    postId = preview.editPath.split('/').filter(Boolean).at(-1);

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
      url: `${ADMIN_BASE_URL}/blog/new?siteId=${encodeURIComponent(SITE_ID)}`,
      initialRender,
      filled,
      mediaPicker,
      autosave,
      recovery,
      preview,
      postId,
      screenshotPath: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, postId });
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
