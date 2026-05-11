#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_MEDIA_SMOKE_SITE_ID || 'site-demo';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_MEDIA_CDP_PORT || 9384);
const SCREENSHOT_PATH = process.env.BACKY_MEDIA_SCREENSHOT || path.join(os.tmpdir(), 'backy-media-smoke.png');
let apiAdminSessionToken = '';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

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
  if (options.body && !(options.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (endpoint.startsWith('/api/admin/') && apiAdminSessionToken && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${apiAdminSessionToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(payload.error || payload).slice(0, 500)}`);
  }

  return payload;
};

const loginAdminApi = async () => {
  const response = await fetch(`${API_BASE_URL}/api/admin/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: 'admin@backy.io',
      password: process.env.BACKY_ADMIN_DEMO_PASSWORD || 'admin123',
    }),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false || !payload.data?.session?.token) {
    throw new Error(`Unable to create API admin session: ${JSON.stringify(payload).slice(0, 500)}`);
  }

  apiAdminSessionToken = payload.data.session.token;
  return payload.data;
};

const readSettings = async () => {
  const payload = await requestApi('/api/admin/settings');
  assert(payload.data?.settings, 'Settings API returned no settings payload');
  return payload.data.settings;
};

const restoreSettings = async (settings) => {
  if (!settings) return;

  await requestApi('/api/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify({
      deliveryMode: settings.deliveryMode,
      auth: settings.auth,
      integrations: settings.integrations || {},
    }),
  });
};

const createFolder = async (name, input = {}) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/media/folders`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    }),
  });
  const folder = payload.data?.folder || payload.folder;
  assert(folder?.id, `Create folder did not return a folder: ${JSON.stringify(payload).slice(0, 500)}`);
  return folder;
};

const updateFolder = async (folderId, input) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/media/folders/${folderId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  const folder = payload.data?.folder || payload.folder;
  assert(folder?.id, `Update folder did not return a folder: ${JSON.stringify(payload).slice(0, 500)}`);
  return folder;
};

const deleteFolder = async (folderId) => {
  if (!folderId) return;
  await requestApi(`/api/admin/sites/${SITE_ID}/media/folders/${folderId}`, { method: 'DELETE' });
};

const uploadMedia = async ({ filename, mimeType, bytes, visibility = 'public', folderId = null, tags = [], altText, caption }) => {
  const formData = new FormData();
  formData.append('file', new Blob([bytes], { type: mimeType }), filename);
  formData.set('visibility', visibility);
  formData.set('scope', 'global');
  if (folderId !== undefined) formData.set('folderId', folderId || '');
  if (tags.length > 0) formData.set('tags', tags.join(','));
  if (altText) formData.set('altText', altText);
  if (caption) formData.set('caption', caption);

  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/media`, {
    method: 'POST',
    body: formData,
  });
  const media = payload.data?.media || payload.media;
  assert(media?.id, `Upload did not return media: ${JSON.stringify(payload).slice(0, 500)}`);
  return media;
};

const updateMedia = async (mediaId, input) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/media/${mediaId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  const media = payload.data?.media || payload.media;
  assert(media?.id, `Update did not return media: ${JSON.stringify(payload).slice(0, 500)}`);
  return media;
};

const deleteMedia = async (mediaId) => {
  if (!mediaId) return;
  await requestApi(`/api/admin/sites/${SITE_ID}/media/${mediaId}`, { method: 'DELETE' });
};

const expectApiError = async (endpoint, options, expectedStatus, expectedCode) => {
  try {
    await requestApi(endpoint, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(`returned ${expectedStatus}`), `Expected ${endpoint} to return ${expectedStatus}, got ${message}`);
    assert(message.includes(expectedCode), `Expected ${endpoint} error code ${expectedCode}, got ${message}`);
    return;
  }

  throw new Error(`Expected ${endpoint} to fail with ${expectedStatus} ${expectedCode}`);
};

const listMedia = async (search) => {
  const query = new URLSearchParams({ limit: '100' });
  if (search) query.set('search', search);
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/media?${query.toString()}`);
  return payload.data?.media || payload.media || [];
};

const waitForMedia = async (search, predicate = () => true) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const media = await listMedia(search);
    const match = media.find(predicate);
    if (match) {
      return match;
    }
    await sleep(250);
  }

  throw new Error(`Timed out waiting for media matching ${search}`);
};

const waitForMediaMissing = async (search) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const media = await listMedia(search);
    if (media.length === 0) {
      return;
    }
    await sleep(250);
  }

  throw new Error(`Temporary media still exists after cleanup: ${search}`);
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

const authStorageScript = () => `
localStorage.setItem('backy-auth-storage', ${JSON.stringify(JSON.stringify({
  state: {
    user: { id: 'user-admin', email: 'admin@backy.io', fullName: 'Admin User', role: 'admin' },
    session: {
      token: apiAdminSessionToken,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      authMode: 'local-demo',
    },
  },
  version: 0,
}))});
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

const navigateToMedia = (client, searchText = '') => {
  const params = new URLSearchParams({ siteId: SITE_ID });
  if (searchText) params.set('q', searchText);
  return navigate(
    client,
    `${ADMIN_BASE_URL}/media?${params.toString()}`,
    `(() => ({
      ready: Boolean(document.querySelector('[data-testid="media-library-command-center"]')) &&
        Boolean(document.querySelector('[data-testid="media-upload-dropzone"]')) &&
        document.body?.innerText?.includes('Media command center'),
      body: document.body?.innerText?.slice(0, 900) || '',
    }))()`,
    'Media page',
  );
};

const waitForMediaPageAsset = async (client, name) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="media-library-command-center"]')),
      hasAsset: document.body?.innerText?.includes(${JSON.stringify(name)}) || false,
      path: window.location.pathname,
      body: document.body?.innerText?.slice(0, 1000) || '',
    }))()`);
    if (state.ready && state.hasAsset && state.path === '/media') {
      return state;
    }
    if (attempt === 119) {
      throw new Error(`Media page did not show ${name}: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const assertMediaLayout = async (client, expectedText) => {
  const layout = await evaluate(client, `(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    hasCommandCenter: Boolean(document.querySelector('[data-testid="media-library-command-center"]')),
    hasDropzone: Boolean(document.querySelector('[data-testid="media-upload-dropzone"]')),
    hasIntakeRules: Boolean(document.querySelector('[data-testid="media-upload-intake-rules"]')) &&
      ['Images', 'Video/audio', 'Documents', 'Fonts', 'Other files'].every((label) => document.body?.innerText?.includes(label)),
    hasApi: document.body?.innerText?.includes('Frontend media API') || false,
    hasStorage: document.body?.innerText?.includes('Storage runtime') || document.body?.innerText?.includes('Media storage runtime') || false,
    hasStorageOperations: Boolean(document.querySelector('[data-testid="media-storage-operations"]')),
    hasFolders: document.body?.innerText?.includes('Folders') || false,
    hasBulk: document.body?.innerText?.includes('Bulk organize') || document.body?.innerText?.includes('Select visible assets') || false,
    hasAsset: document.body?.innerText?.includes(${JSON.stringify(expectedText)}) || false,
    hasSearch: Boolean(document.querySelector('input[aria-label="Search media"]')),
  }))()`);
  assert(layout.scrollWidth <= layout.width + 8, `Media page has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(
    layout.hasCommandCenter && layout.hasDropzone && layout.hasIntakeRules && layout.hasApi && layout.hasStorageOperations && layout.hasFolders && layout.hasBulk && layout.hasAsset && layout.hasSearch,
    `Media page missing expected regions: ${JSON.stringify(layout)}`,
  );
  return layout;
};

const runMediaStorageCheck = async (client) => {
  let clicked = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    clicked = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="media-storage-operations"]');
      if (!(panel instanceof HTMLElement)) return { ok: false, reason: 'panel-not-found' };
      const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
        /Run check|Checking/.test(candidate.textContent || '')
      ));
      if (!(button instanceof HTMLButtonElement)) {
        return { ok: false, reason: 'button-not-found', buttons: Array.from(document.querySelectorAll('button')).map((item) => item.textContent?.trim()).slice(0, 80) };
      }
      if (button.disabled) return { ok: false, reason: 'button-disabled', text: button.textContent || '' };
      button.click();
      return { ok: true };
    })()`);
    if (clicked.ok) break;
    await sleep(250);
  }
  assert(clicked.ok, `Unable to start media storage check: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="media-storage-check-results"]')) ||
        document.body?.innerText?.includes('Storage check failed'),
      hasResults: Boolean(document.querySelector('[data-testid="media-storage-check-results"]')),
      body: document.body?.innerText?.slice(0, 1400) || '',
    }))()`);
    if (state.ready) {
      assert(state.hasResults, `Media storage check failed instead of rendering diagnostics: ${JSON.stringify(state)}`);
      return state;
    }
    if (attempt === 79) {
      throw new Error(`Media storage check did not finish: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const openMediaDetails = async (client, assetName) => {
  const result = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
      (candidate.getAttribute('aria-label') || '') === ${JSON.stringify(`Edit metadata for ${assetName}`)}
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        buttons: Array.from(document.querySelectorAll('button')).map((candidate) => candidate.getAttribute('aria-label') || candidate.textContent || '').slice(0, 100),
      };
    }
    if (button.disabled) return { ok: false, reason: 'button-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(result.ok, `Unable to open media details for ${assetName}: ${JSON.stringify(result)}`);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: document.body?.innerText?.includes('Media details') &&
        document.body?.innerText?.includes(${JSON.stringify(assetName)}) &&
        document.body?.innerText?.includes('Safety scan') &&
        document.body?.innerText?.includes('Delivery') &&
        document.body?.innerText?.includes('Activity'),
      body: document.body?.innerText?.slice(0, 1200) || '',
    }))()`);
    if (state.ready) {
      return state;
    }
    if (attempt === 99) {
      throw new Error(`Media details did not render: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const setDetailsField = async (client, labelText, value) => {
  const result = await evaluate(client, `(() => {
    const labelText = ${JSON.stringify(labelText)};
    const value = ${JSON.stringify(value)};
    const normalized = (text) => (text || '').replace(/\\s+/g, ' ').trim();
    const labels = Array.from(document.querySelectorAll('label'));
    const label = labels.find((candidate) => normalized(candidate.textContent) === labelText);
    if (!(label instanceof HTMLLabelElement)) {
      return { ok: false, reason: 'label-not-found', labels: labels.map((item) => normalized(item.textContent)).slice(0, 80) };
    }
    const container = label.parentElement;
    const control = label.querySelector('input, select, textarea') ||
      container?.querySelector('input, select, textarea');
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) {
      return { ok: false, reason: 'control-not-found', labelText, container: container?.textContent?.slice(0, 300) || '' };
    }
    const prototype = control instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : control instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    descriptor?.set?.call(control, String(value));
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: control.value };
  })()`);
  assert(result.ok, `Unable to set ${labelText}: ${JSON.stringify(result)}`);
  await sleep(100);
  return result;
};

const setMediaStorageField = async (client, labelText, value) => {
  let result = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    result = await evaluate(client, `(() => {
      const labelText = ${JSON.stringify(labelText)};
      const value = ${JSON.stringify(value)};
      const normalized = (text) => (text || '').replace(/\\s+/g, ' ').trim();
      const labels = Array.from(document.querySelectorAll('[data-testid="media-storage-settings-editor"] label'));
      const label = labels.find((candidate) => normalized(candidate.textContent).includes(labelText));
      if (!(label instanceof HTMLLabelElement)) {
        return { ok: false, reason: 'label-not-found', labels: labels.map((item) => normalized(item.textContent)).slice(0, 80) };
      }
      const control = label.querySelector('input, select, textarea');
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) {
        return { ok: false, reason: 'control-not-found', labelText, container: label.textContent?.slice(0, 300) || '' };
      }
      if (control.disabled) return { ok: false, reason: 'control-disabled', labelText };
      const prototype = control instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : control instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
      descriptor?.set?.call(control, String(value));
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, value: control.value };
    })()`);
    if (result.ok) break;
    await sleep(250);
  }
  assert(result.ok, `Unable to set media storage field ${labelText}: ${JSON.stringify(result)}`);
  await sleep(100);
  return result;
};

const setMediaStorageCheckbox = async (client, labelText, checked) => {
  const result = await evaluate(client, `(() => {
    const labelText = ${JSON.stringify(labelText)};
    const checked = ${JSON.stringify(checked)};
    const normalized = (text) => (text || '').replace(/\\s+/g, ' ').trim();
    const labels = Array.from(document.querySelectorAll('[data-testid="media-storage-settings-editor"] label'));
    const label = labels.find((candidate) => normalized(candidate.textContent).includes(labelText));
    if (!(label instanceof HTMLLabelElement)) {
      return { ok: false, reason: 'label-not-found', labels: labels.map((item) => normalized(item.textContent)).slice(0, 80) };
    }
    const control = label.querySelector('input[type="checkbox"]');
    if (!(control instanceof HTMLInputElement)) {
      return { ok: false, reason: 'checkbox-not-found', labelText, container: label.textContent?.slice(0, 300) || '' };
    }
    if (control.disabled) return { ok: false, reason: 'control-disabled', labelText };
    if (control.checked !== checked) {
      control.click();
    }
    return { ok: true, checked: control.checked };
  })()`);
  assert(result.ok, `Unable to set media storage checkbox ${labelText}: ${JSON.stringify(result)}`);
  await sleep(100);
  return result;
};

const saveMediaStorageSettingsFromUi = async (client, suffix) => {
  await setMediaStorageField(client, 'Storage provider', 'supabase');
  await setMediaStorageField(client, 'Storage bucket', `media-${suffix}`);
  await setMediaStorageField(client, 'Public media base URL', `https://${suffix}.supabase.co/storage/v1/object/public/media-${suffix}`);
  await setMediaStorageField(client, 'Storage path prefix', `sites/${SITE_ID}/${suffix}`);
  await setMediaStorageField(client, 'Supabase project URL', `https://${suffix}.supabase.co`);
  await setMediaStorageField(client, 'Supabase project ref', suffix);
  await setMediaStorageCheckbox(client, 'Private file delivery', true);
  await setMediaStorageCheckbox(client, 'Image transforms', true);
  await setMediaStorageCheckbox(client, 'Supabase storage', true);

  const clicked = await evaluate(client, `(() => {
    const panel = document.querySelector('[data-testid="media-storage-settings-editor"]');
    if (!(panel instanceof HTMLElement)) return { ok: false, reason: 'panel-not-found' };
    const button = Array.from(panel.querySelectorAll('button')).find((candidate) => (
      /Save storage|Saving/.test(candidate.textContent || '')
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'save-button-not-found', buttons: Array.from(panel.querySelectorAll('button')).map((item) => item.textContent?.trim()).slice(0, 20) };
    }
    if (button.disabled) return { ok: false, reason: 'save-button-disabled', text: button.textContent || '' };
    button.click();
    return { ok: true };
  })()`);
  assert(clicked.ok, `Unable to save media storage settings: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      saved: document.body?.innerText?.includes('Storage metadata saved.'),
      error: document.body?.innerText?.includes('Storage check failed'),
      body: document.body?.innerText?.slice(0, 1400) || '',
    }))()`);
    if (state.saved) return state;
    assert(!state.error, `Media storage settings save failed: ${JSON.stringify(state)}`);
    await sleep(250);
  }

  throw new Error('Timed out waiting for media storage settings save notice');
};

const clickDetailsButton = async (client, text) => {
  const result = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
      (candidate.textContent || '').includes(${JSON.stringify(text)})
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'button-not-found', buttons: Array.from(document.querySelectorAll('button')).map((candidate) => candidate.textContent || '').slice(0, 100) };
    }
    if (button.disabled) return { ok: false, reason: 'button-disabled', text: button.textContent || '' };
    button.click();
    return { ok: true, text: button.textContent || '' };
  })()`);
  assert(result.ok, `Unable to click ${text}: ${JSON.stringify(result)}`);
  return result;
};

const saveDetails = async (client) => {
  await clickDetailsButton(client, 'Save details');

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const saveButton = Array.from(document.querySelectorAll('button')).find((candidate) => (
        (candidate.textContent || '').includes('Save details') || (candidate.textContent || '').includes('Saving...')
      ));
      return {
        exists: Boolean(saveButton),
        disabled: saveButton instanceof HTMLButtonElement ? saveButton.disabled : null,
        text: saveButton?.textContent || '',
      };
    })()`);
    if (state.exists && state.text.includes('Save details') && state.disabled === false) {
      return state;
    }
    if (attempt === 99) {
      throw new Error(`Media details did not finish saving: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return null;
};

const generateSignedUrl = async (client) => {
  await clickDetailsButton(client, 'Generate URL');

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      hasSignedUrl: Array.from(document.querySelectorAll('textarea')).some((textarea) => textarea.value.includes('/api/sites/') && textarea.value.includes('token=')),
      body: document.body?.innerText?.slice(0, 1200) || '',
    }))()`);
    if (state.hasSignedUrl) {
      return state;
    }
    if (attempt === 99) {
      throw new Error(`Signed URL was not generated: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return null;
};

const replaceAssetThroughDetails = async (client, replacementPath, replacementName) => {
  const markResult = await evaluate(client, `(() => {
    const label = Array.from(document.querySelectorAll('label')).find((candidate) => (
      (candidate.textContent || '').includes('Replace file')
    ));
    const input = label?.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) {
      return {
        ok: false,
        reason: 'replacement-input-not-found',
        labels: Array.from(document.querySelectorAll('label')).map((candidate) => candidate.textContent || '').slice(0, 80),
      };
    }
    input.setAttribute('data-media-smoke-replace-input', 'true');
    return { ok: true };
  })()`);
  assert(markResult.ok, `Unable to find replacement file input: ${JSON.stringify(markResult)}`);

  await client.send('DOM.enable');
  const documentResult = await client.send('DOM.getDocument', { depth: 1 });
  const queryResult = await client.send('DOM.querySelector', {
    nodeId: documentResult.root.nodeId,
    selector: 'input[data-media-smoke-replace-input="true"]',
  });
  assert(queryResult.nodeId, `Unable to resolve replacement input node: ${JSON.stringify(queryResult)}`);
  await client.send('DOM.setFileInputFiles', {
    nodeId: queryResult.nodeId,
    files: [replacementPath],
  });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      hasReplacementName: document.body?.innerText?.includes(${JSON.stringify(replacementName)}) || false,
      hasVersionCount: document.body?.innerText?.includes('1 previous') || false,
      hasHistory: document.body?.innerText?.includes('Replacement history') || false,
      replacing: document.body?.innerText?.includes('Replacing...') || false,
      body: document.body?.innerText?.slice(0, 1800) || '',
    }))()`);
    if (state.hasReplacementName && state.hasVersionCount && state.hasHistory && !state.replacing) {
      return state;
    }
    if (attempt === 119) {
      throw new Error(`Media replacement did not finish in details dialog: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const prepareVariantsThroughDetails = async (client) => {
  await clickDetailsButton(client, 'Prepare variants');

  for (let attempt = 0; attempt < 160; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      hasResponsiveManifest: document.body?.innerText?.includes('Responsive image manifest') || false,
      hasPrepared: document.body?.innerText?.includes('Prepared') || false,
      hasWebp: document.body?.innerText?.includes('webp') || false,
      preparing: document.body?.innerText?.includes('Preparing...') || false,
      body: document.body?.innerText?.slice(0, 1800) || '',
    }))()`);
    if (state.hasResponsiveManifest && state.hasPrepared && !state.preparing) {
      return state;
    }
    if (attempt === 159) {
      throw new Error(`Responsive variants were not prepared from details dialog: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const quarantineAssetThroughDetails = async (client) => {
  await clickDetailsButton(client, 'Quarantine asset');

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      quarantined: document.body?.innerText?.includes('Quarantined') &&
        document.body?.innerText?.includes('Release quarantine'),
      body: document.body?.innerText?.slice(0, 1400) || '',
    }))()`);
    if (state.quarantined) {
      return state;
    }
    if (attempt === 99) {
      throw new Error(`Media quarantine did not finish: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return null;
};

const releaseQuarantineThroughDetails = async (client) => {
  await clickDetailsButton(client, 'Release quarantine');

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      released: document.body?.innerText?.includes('Quarantine asset') &&
        !document.body?.innerText?.includes('Release quarantine'),
      body: document.body?.innerText?.slice(0, 1400) || '',
    }))()`);
    if (state.released) {
      return state;
    }
    if (attempt === 99) {
      throw new Error(`Media quarantine release did not finish: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return null;
};

const closeMediaDetails = async (client) => {
  const result = await evaluate(client, `(() => {
    const button = document.querySelector('button[aria-label="Close media details"]');
    if (!(button instanceof HTMLButtonElement)) return { ok: false, reason: 'close-missing' };
    if (button.disabled) return { ok: false, reason: 'close-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(result.ok, `Unable to close media details: ${JSON.stringify(result)}`);
};

const deleteAssetThroughUi = async (client, assetName) => {
  await waitForMediaPageAsset(client, assetName);
  const openResult = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
      (candidate.getAttribute('aria-label') || '') === ${JSON.stringify(`Delete ${assetName}`)}
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        buttons: Array.from(document.querySelectorAll('button')).map((candidate) => candidate.getAttribute('aria-label') || candidate.textContent || '').slice(0, 100),
      };
    }
    if (button.disabled) return { ok: false, reason: 'delete-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(openResult.ok, `Unable to open media delete confirmation: ${JSON.stringify(openResult)}`);

  const confirmResult = await evaluate(client, `(() => {
    const dialog = Array.from(document.querySelectorAll('[class*="fixed"]')).find((candidate) => (
      (candidate.textContent || '').includes(${JSON.stringify(`Delete ${assetName}?`)})
    ));
    const button = dialog && Array.from(dialog.querySelectorAll('button')).find((candidate) => (
      (candidate.textContent || '').trim() === 'Delete asset'
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'confirm-missing', dialog: dialog?.textContent?.slice(0, 500) || '' };
    }
    if (button.disabled) return { ok: false, reason: 'confirm-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(confirmResult.ok, `Unable to confirm media deletion: ${JSON.stringify(confirmResult)}`);
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-media-${Date.now()}`);
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

const cleanup = async ({ client, childProcess, userDataDir, mediaIds, folderIds, tempFiles }) => {
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

  for (const mediaId of mediaIds) {
    try {
      await deleteMedia(mediaId);
    } catch {
      // The UI flow may already have removed the temporary asset.
    }
  }

  for (const folderId of folderIds || []) {
    if (folderId) {
      try {
        await deleteFolder(folderId);
      } catch {
        // The UI flow or cleanup may already have removed the folder.
      }
    }
  }

  for (const tempFile of tempFiles || []) {
    if (tempFile) {
      fs.rmSync(tempFile, { force: true });
    }
  }
};

const main = async () => {
  let client;
  let childProcess;
  let userDataDir;
  let folderId;
  let childFolderId;
  let originalSettings;
  let restoredSettings = false;
  const mediaIds = [];
  const suffix = Date.now().toString(36);
  const marker = `media-smoke-${suffix}`;
  const folderName = `Media Smoke ${suffix}`;
  const imageName = `${marker}.png`;
  const replacementName = `${marker}-replacement.png`;
  const privateName = `${marker}.txt`;
  const updatedAltText = `Updated central media smoke ${suffix}`;
  const replacementPath = path.join(os.tmpdir(), `${replacementName}`);
  const tempFiles = [replacementPath];

  try {
    await loginAdminApi();
    originalSettings = await readSettings();
    fs.writeFileSync(replacementPath, ONE_PIXEL_PNG);
    const existing = await listMedia(marker);
    assert(existing.length === 0, `Temporary media already exists for marker ${marker}`);

    const folder = await createFolder(folderName);
    folderId = folder.id;
    const childFolder = await createFolder(`${folderName} Child`, { parentId: folderId });
    childFolderId = childFolder.id;
    assert(childFolder.parentId === folderId, 'Nested media folder did not preserve its parent id.');
    const movedChildFolder = await updateFolder(childFolderId, { name: `${folderName} Child Root`, parentId: null });
    assert(movedChildFolder.parentId === null, 'Media folder parent update did not move the child folder to Root.');
    const nestedAgainFolder = await updateFolder(childFolderId, { parentId: folderId });
    assert(nestedAgainFolder.parentId === folderId, 'Media folder parent update did not move the child folder under the parent.');
    const publicImage = await uploadMedia({
      filename: imageName,
      mimeType: 'image/png',
      bytes: ONE_PIXEL_PNG,
      visibility: 'public',
      folderId,
      tags: ['smoke', 'central-upload'],
      altText: `Central media smoke ${suffix}`,
      caption: 'Temporary image for media admin smoke.',
    });
    mediaIds.push(publicImage.id);
    const privateFile = await uploadMedia({
      filename: privateName,
      mimeType: 'text/plain',
      bytes: Buffer.from(`Backy media smoke ${suffix}\n`, 'utf8'),
      visibility: 'private',
      folderId: null,
      tags: ['smoke', 'private-file'],
      caption: 'Temporary private file for signed delivery smoke.',
    });
    mediaIds.push(privateFile.id);

    await waitForMedia(marker, (item) => item.id === publicImage.id);
    await waitForMedia(marker, (item) => item.id === privateFile.id);

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
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: authStorageScript() });

    await navigateToMedia(client, marker);
    await waitForMediaPageAsset(client, imageName);
    await waitForMediaPageAsset(client, privateName);
    await assertMediaLayout(client, imageName);
    await saveMediaStorageSettingsFromUi(client, suffix);
    const savedStorageSettings = await readSettings();
    assert(savedStorageSettings.integrations?.storage?.provider === 'supabase', 'Media storage provider was not persisted through the Media page.');
    assert(savedStorageSettings.integrations?.storage?.bucket === `media-${suffix}`, 'Media storage bucket was not persisted through the Media page.');
    assert(savedStorageSettings.integrations?.storage?.privateFilesEnabled === true, 'Media private file setting was not persisted through the Media page.');
    assert(savedStorageSettings.integrations?.storage?.imageTransformsEnabled === true, 'Media image transform setting was not persisted through the Media page.');
    assert(savedStorageSettings.integrations?.supabase?.projectRef === suffix, 'Media Supabase project ref was not persisted through the Media page.');
    assert(savedStorageSettings.integrations?.supabase?.storageEnabled === true, 'Media Supabase storage toggle was not persisted through the Media page.');
    await runMediaStorageCheck(client);

    await openMediaDetails(client, imageName);
    await replaceAssetThroughDetails(client, replacementPath, replacementName);
    const replacedImage = await waitForMedia(marker, (item) => (
      item.id === publicImage.id &&
      item.originalName === replacementName &&
      Array.isArray(item.metadata?.replacementVersions) &&
      item.metadata.replacementVersions.length === 1 &&
      item.metadata.replacementVersions[0]?.originalName === imageName
    ));
    assert(replacedImage.id === publicImage.id, 'Media replacement changed the stable asset id.');
    await prepareVariantsThroughDetails(client);
    const transformedImage = await waitForMedia(marker, (item) => (
      item.id === publicImage.id &&
      Array.isArray(item.metadata?.generatedTransforms?.variants) &&
      item.metadata.generatedTransforms.variants.length > 0
    ));
    assert(transformedImage.metadata.generatedTransforms.preparedBy === 'admin', 'UI transform preparation did not record the admin actor.');
    await setDetailsField(client, 'Focal X', 28);
    await setDetailsField(client, 'Focal Y', 72);
    await setDetailsField(client, 'Crop fit', 'contain');
    await setDetailsField(client, 'Aspect ratio', '16:9');
    await setDetailsField(client, 'Alt text', updatedAltText);
    await setDetailsField(client, 'Visibility', 'private');
    await saveDetails(client);
    const updatedImage = await waitForMedia(marker, (item) => item.id === publicImage.id && item.altText === updatedAltText && item.visibility === 'private');
    assert(updatedImage.folderId === folderId, 'Media metadata save lost the folder assignment.');
    assert(Array.isArray(updatedImage.metadata?.replacementVersions) && updatedImage.metadata.replacementVersions.length === 1, 'Media metadata save lost replacement history.');
    assert(Array.isArray(updatedImage.metadata?.generatedTransforms?.variants) && updatedImage.metadata.generatedTransforms.variants.length > 0, 'Media metadata save lost generated transforms.');
    assert(updatedImage.metadata?.imagePresentation?.focalPoint?.x === 28, 'Media metadata save did not persist focal X.');
    assert(updatedImage.metadata?.imagePresentation?.focalPoint?.y === 72, 'Media metadata save did not persist focal Y.');
    assert(updatedImage.metadata?.imagePresentation?.objectFit === 'contain', 'Media metadata save did not persist crop fit.');
    assert(updatedImage.metadata?.imagePresentation?.aspectRatio === '16:9', 'Media metadata save did not persist aspect ratio.');
    await quarantineAssetThroughDetails(client);
    const quarantinedImage = await waitForMedia(marker, (item) => (
      item.id === publicImage.id &&
      item.visibility === 'private' &&
      item.metadata?.mediaSecurity?.status === 'quarantined' &&
      item.metadata?.mediaSecurity?.previousVisibility === 'private'
    ));
    assert(quarantinedImage.metadata.mediaSecurity.reason.includes('Manual quarantine'), 'Media quarantine did not persist a review reason.');
    await expectApiError(`/api/admin/sites/${SITE_ID}/media/${publicImage.id}/signed-url`, {
      method: 'POST',
      body: JSON.stringify({ expiresInSeconds: 900 }),
    }, 423, 'MEDIA_QUARANTINED');
    await releaseQuarantineThroughDetails(client);
    const releasedImage = await waitForMedia(marker, (item) => (
      item.id === publicImage.id &&
      item.visibility === 'private' &&
      item.metadata?.mediaSecurity?.status === 'clear'
    ));
    assert(releasedImage.metadata.mediaSecurity.previousStatus === 'quarantined', 'Media quarantine release did not preserve previous security status.');
    await closeMediaDetails(client);

    await openMediaDetails(client, privateName);
    await generateSignedUrl(client);
    await closeMediaDetails(client);

    await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }).then((result) => {
      fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(result.data, 'base64'));
    });

    await deleteAssetThroughUi(client, privateName);
    await waitForMediaMissing(privateName);
    mediaIds.splice(mediaIds.indexOf(privateFile.id), 1);

    await deleteMedia(publicImage.id);
    mediaIds.splice(mediaIds.indexOf(publicImage.id), 1);
    await deleteFolder(childFolderId);
    childFolderId = null;
    await deleteFolder(folderId);
    folderId = null;
    await waitForMediaMissing(marker);
    await restoreSettings(originalSettings);
    restoredSettings = true;

    console.log(JSON.stringify({
      ok: true,
      marker,
      folderName,
      replacementName,
      screenshot: SCREENSHOT_PATH,
      restoredSettings,
    }, null, 2));
  } finally {
    if (!restoredSettings) {
      await restoreSettings(originalSettings).catch((error) => {
        console.warn('Unable to restore original settings:', error instanceof Error ? error.message : error);
      });
    }
    await cleanup({
      client,
      childProcess,
      userDataDir,
      mediaIds,
      folderIds: [childFolderId, folderId],
      tempFiles,
    });
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
