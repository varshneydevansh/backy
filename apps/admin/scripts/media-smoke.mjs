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

const createFolder = async (name) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/media/folders`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  const folder = payload.data?.folder || payload.folder;
  assert(folder?.id, `Create folder did not return a folder: ${JSON.stringify(payload).slice(0, 500)}`);
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
    hasApi: document.body?.innerText?.includes('Frontend media API') || false,
    hasStorage: document.body?.innerText?.includes('Storage runtime') || document.body?.innerText?.includes('Media storage runtime') || false,
    hasFolders: document.body?.innerText?.includes('Folders') || false,
    hasBulk: document.body?.innerText?.includes('Bulk organize') || document.body?.innerText?.includes('Select visible assets') || false,
    hasAsset: document.body?.innerText?.includes(${JSON.stringify(expectedText)}) || false,
    hasSearch: Boolean(document.querySelector('input[aria-label="Search media"]')),
  }))()`);
  assert(layout.scrollWidth <= layout.width + 8, `Media page has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(
    layout.hasCommandCenter && layout.hasDropzone && layout.hasApi && layout.hasFolders && layout.hasBulk && layout.hasAsset && layout.hasSearch,
    `Media page missing expected regions: ${JSON.stringify(layout)}`,
  );
  return layout;
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
    const control = label.querySelector('input, select, textarea');
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) {
      return { ok: false, reason: 'control-not-found', labelText };
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

const cleanup = async ({ client, childProcess, userDataDir, mediaIds, folderId }) => {
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

  if (folderId) {
    try {
      await deleteFolder(folderId);
    } catch {
      // The UI flow or cleanup may already have removed the folder.
    }
  }
};

const main = async () => {
  let client;
  let childProcess;
  let userDataDir;
  let folderId;
  const mediaIds = [];
  const suffix = Date.now().toString(36);
  const marker = `media-smoke-${suffix}`;
  const folderName = `Media Smoke ${suffix}`;
  const imageName = `${marker}.png`;
  const privateName = `${marker}.txt`;
  const updatedAltText = `Updated central media smoke ${suffix}`;

  try {
    const existing = await listMedia(marker);
    assert(existing.length === 0, `Temporary media already exists for marker ${marker}`);

    const folder = await createFolder(folderName);
    folderId = folder.id;
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
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: AUTH_STORAGE_SCRIPT });

    await navigateToMedia(client, marker);
    await waitForMediaPageAsset(client, imageName);
    await waitForMediaPageAsset(client, privateName);
    await assertMediaLayout(client, imageName);

    await openMediaDetails(client, imageName);
    await setDetailsField(client, 'Alt text', updatedAltText);
    await setDetailsField(client, 'Visibility', 'private');
    await saveDetails(client);
    const updatedImage = await waitForMedia(marker, (item) => item.id === publicImage.id && item.altText === updatedAltText && item.visibility === 'private');
    assert(updatedImage.folderId === folderId, 'Media metadata save lost the folder assignment.');
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
    await deleteFolder(folderId);
    folderId = null;
    await waitForMediaMissing(marker);

    console.log(JSON.stringify({
      ok: true,
      marker,
      folderName,
      screenshot: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, mediaIds, folderId });
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
