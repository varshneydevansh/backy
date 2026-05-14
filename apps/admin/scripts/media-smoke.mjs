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

const MINIMAL_WOFF2 = Buffer.from([
  0x77, 0x4f, 0x46, 0x32, 0x00, 0x01, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x30, 0x00, 0x01, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x10, 0x4f, 0x54, 0x54, 0x4f,
  0x00, 0x00, 0x00, 0x00,
]);

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

const setAdminPermissionOverrides = async (overrides) => {
  await requestApi('/api/admin/users/user-admin/permissions', {
    method: 'PATCH',
    body: JSON.stringify({ overrides }),
  });
};

const expectForbiddenPermission = async (endpoint, options = {}, label = endpoint) => {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (apiAdminSessionToken && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${apiAdminSessionToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });
  const payload = await response.json().catch(() => ({}));

  assert(response.status === 403, `${label} should reject denied permission with 403, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(payload?.error?.code === 'FORBIDDEN_PERMISSION', `${label} should return FORBIDDEN_PERMISSION, got: ${JSON.stringify(payload).slice(0, 500)}`);
};

const assertMediaViewPermissionIsEnforced = async () => {
  const fakeMediaId = 'media-denied-view-smoke';

  try {
    await setAdminPermissionOverrides({
      'media.view': 'deny',
    });
    await expectForbiddenPermission(`/api/admin/sites/${SITE_ID}/media?limit=1`, {
      method: 'GET',
    }, 'Denied media.view library list');
    await expectForbiddenPermission(`/api/admin/sites/${SITE_ID}/media/folders`, {
      method: 'GET',
    }, 'Denied media.view folder list');
    await expectForbiddenPermission(`/api/admin/sites/${SITE_ID}/media/${fakeMediaId}/signed-url`, {
      method: 'POST',
      body: JSON.stringify({ expiresInSeconds: 300 }),
    }, 'Denied media.view signed URL');
  } finally {
    await setAdminPermissionOverrides({
      'media.view': null,
    });
  }
};

const assertMediaMutationPermissionOverridesAreEnforced = async () => {
  const fakeMediaId = 'media-denied-permission-smoke';
  const fakeFolderId = 'folder-denied-permission-smoke';
  const fakeVersionId = 'version-denied-permission-smoke';

  try {
    await setAdminPermissionOverrides({
      'media.create': 'deny',
    });
    await expectForbiddenPermission(`/api/admin/sites/${SITE_ID}/media`, {
      method: 'POST',
      body: JSON.stringify({}),
    }, 'Denied media.create upload');
    await expectForbiddenPermission(`/api/admin/sites/${SITE_ID}/media/folders`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Denied media folder' }),
    }, 'Denied media.create folder');

    await setAdminPermissionOverrides({
      'media.create': null,
      'media.edit': 'deny',
    });
    await expectForbiddenPermission(`/api/admin/sites/${SITE_ID}/media/${fakeMediaId}`, {
      method: 'PATCH',
      body: JSON.stringify({ altText: 'Denied edit' }),
    }, 'Denied media.edit metadata update');
    await expectForbiddenPermission(`/api/admin/sites/${SITE_ID}/media/${fakeMediaId}`, {
      method: 'POST',
      body: JSON.stringify({}),
    }, 'Denied media.edit replacement');
    await expectForbiddenPermission(`/api/admin/sites/${SITE_ID}/media/${fakeMediaId}/bind`, {
      method: 'POST',
      body: JSON.stringify({ action: 'bind', targetType: 'page', targetId: 'page-home' }),
    }, 'Denied media.edit binding');
    await expectForbiddenPermission(`/api/admin/sites/${SITE_ID}/media/${fakeMediaId}/transforms`, {
      method: 'POST',
      body: JSON.stringify({ widths: [320] }),
    }, 'Denied media.edit transforms');
    await expectForbiddenPermission(`/api/admin/sites/${SITE_ID}/media/${fakeMediaId}/versions/${fakeVersionId}`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Denied restore' }),
    }, 'Denied media.edit retained-version restore');
    await expectForbiddenPermission(`/api/admin/sites/${SITE_ID}/media/folders/${fakeFolderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Denied folder edit' }),
    }, 'Denied media.edit folder update');
    await expectForbiddenPermission(`/api/admin/sites/${SITE_ID}/media/provider-analytics`, {
      method: 'POST',
      body: JSON.stringify({
        entries: [{ mediaId: fakeMediaId, totalRequests: 1 }],
      }),
    }, 'Denied media.edit provider analytics');

    await setAdminPermissionOverrides({
      'media.edit': null,
      'media.delete': 'deny',
    });
    await expectForbiddenPermission(`/api/admin/sites/${SITE_ID}/media/${fakeMediaId}`, {
      method: 'DELETE',
    }, 'Denied media.delete asset delete');
    await expectForbiddenPermission(`/api/admin/sites/${SITE_ID}/media/${fakeMediaId}/versions/${fakeVersionId}`, {
      method: 'DELETE',
    }, 'Denied media.delete retained-version delete');
    await expectForbiddenPermission(`/api/admin/sites/${SITE_ID}/media/folders/${fakeFolderId}`, {
      method: 'DELETE',
    }, 'Denied media.delete folder delete');
  } finally {
    await setAdminPermissionOverrides({
      'media.create': null,
      'media.edit': null,
      'media.delete': null,
    });
  }
};

const assertMediaConfigurePermissionIsEnforced = async () => {
  await setAdminPermissionOverrides({
    'media.configure': 'deny',
  });

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/settings`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiAdminSessionToken}`,
      },
      body: JSON.stringify({
        deliveryMode: 'custom-frontend',
        integrations: {
          storage: {
            provider: 'local',
            bucket: 'denied-media-config',
            publicBaseUrl: '',
            pathPrefix: '',
            privateFilesEnabled: true,
            imageTransformsEnabled: true,
          },
          supabase: {
            projectUrl: '',
            projectRef: '',
            storageEnabled: false,
          },
        },
      }),
    });
    const payload = await response.json().catch(() => ({}));

    assert(response.status === 403, `Denied media.configure override should reject storage metadata save, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(payload?.error?.code === 'FORBIDDEN_PERMISSION', `Denied media.configure override should return FORBIDDEN_PERMISSION: ${JSON.stringify(payload).slice(0, 500)}`);
    await expectForbiddenPermission('/api/admin/settings', {
      method: 'POST',
      body: JSON.stringify({ action: 'media-storage-provisioning-probe' }),
    }, 'Denied media.configure provisioning probe');
  } finally {
    await setAdminPermissionOverrides({
      'media.configure': null,
    });
  }
};

const assertMediaActivityPermissionIsEnforced = async () => {
  try {
    await setAdminPermissionOverrides({
      'activity.export': 'deny',
    });
    await expectForbiddenPermission(`/api/admin/audit-logs?siteId=${encodeURIComponent(SITE_ID)}&entity=media&limit=1`, {
      method: 'GET',
    }, 'Denied activity.export media audit list');
  } finally {
    await setAdminPermissionOverrides({
      'activity.export': null,
    });
  }
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

const uploadMedia = async ({
  filename,
  mimeType,
  bytes,
  visibility = 'public',
  folderId = null,
  tags = [],
  altText,
  caption,
  fontFamily,
  fontWeight,
  fontStyle,
  fontFallback,
  fontDisplay,
}) => {
  const formData = new FormData();
  formData.append('file', new Blob([bytes], { type: mimeType }), filename);
  formData.set('visibility', visibility);
  formData.set('scope', 'global');
  if (folderId !== undefined) formData.set('folderId', folderId || '');
  if (tags.length > 0) formData.set('tags', tags.join(','));
  if (altText) formData.set('altText', altText);
  if (caption) formData.set('caption', caption);
  if (fontFamily) formData.set('fontFamily', fontFamily);
  if (fontWeight) formData.set('fontWeight', fontWeight);
  if (fontStyle) formData.set('fontStyle', fontStyle);
  if (fontFallback) formData.set('fontFallback', fontFallback);
  if (fontDisplay) formData.set('fontDisplay', fontDisplay);

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

const listMedia = async (search, options = {}) => {
  const query = new URLSearchParams({ limit: '100' });
  if (search) query.set('search', search);
  if (options.tag) query.set('tag', options.tag);
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/media?${query.toString()}`);
  return payload.data?.media || payload.media || [];
};

const waitForMedia = async (search, predicate = () => true) => {
  let lastMedia = [];
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const media = await listMedia(search);
    lastMedia = media;
    const match = media.find(predicate);
    if (match) {
      return match;
    }
    await sleep(250);
  }

  throw new Error(`Timed out waiting for media matching ${search}: ${JSON.stringify(lastMedia.map((item) => ({
    id: item.id,
    originalName: item.originalName,
    filename: item.filename,
    type: item.type,
    folderId: item.folderId,
    visibility: item.visibility,
    tags: item.tags,
  }))).slice(0, 1200)}`);
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

const navigateToMedia = (client, searchText = '', options = {}) => {
  const params = new URLSearchParams({ siteId: SITE_ID });
  if (searchText) params.set('q', searchText);
  if (options.tag) params.set('tag', options.tag);
  if (options.folderId !== undefined) params.set('folderId', options.folderId === null ? 'root' : options.folderId);
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

const assertFolderFilterShowsAsset = async (client, { folderId, assetName, searchText }) => {
  await navigateToMedia(client, searchText, { folderId });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const params = new URLSearchParams(window.location.search);
      return {
        ready: Boolean(document.querySelector('[data-testid="media-library-command-center"]')),
        folderId: params.get('folderId'),
        hasAsset: document.body?.innerText?.includes(${JSON.stringify(assetName)}) || false,
        body: document.body?.innerText?.slice(0, 1400) || '',
      };
    })()`);
    if (state.ready && state.folderId === folderId && state.hasAsset) {
      return state;
    }
    if (attempt === 119) {
      throw new Error(`Media folder filter did not show descendant asset ${assetName}: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const assertDeniedMediaViewUi = async (client, searchText, hiddenAssetName) => {
  try {
    await setAdminPermissionOverrides({
      'media.view': 'deny',
    });
    await navigateToMedia(client, searchText);

    let lastState = null;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      lastState = await evaluate(client, `(() => {
        const uploadInput = document.querySelector('[data-testid="media-upload-input"]');
        const modeButtons = Array.from(document.querySelectorAll('[data-testid^="media-upload-mode-"]'));
        const createFolderButton = document.querySelector('button[aria-label="Create media folder"]');
        const body = document.body?.innerText || '';
        return {
          hasDeniedNotice: body.includes('needs media.view'),
          hidesAsset: !body.includes(${JSON.stringify(hiddenAssetName)}),
          uploadInputDisabled: uploadInput instanceof HTMLInputElement ? uploadInput.disabled : null,
          modeButtonsDisabled: modeButtons.length > 0 && modeButtons.every((button) => button instanceof HTMLButtonElement && button.disabled),
          createFolderDisabled: createFolderButton instanceof HTMLButtonElement ? createFolderButton.disabled : null,
          body: body.slice(0, 1800),
        };
      })()`);

      if (
        lastState.hasDeniedNotice &&
        lastState.hidesAsset &&
        lastState.uploadInputDisabled === true &&
        lastState.modeButtonsDisabled === true &&
        lastState.createFolderDisabled === true
      ) {
        return lastState;
      }
      await sleep(250);
    }

    throw new Error(`Denied media.view UI did not disable library controls: ${JSON.stringify(lastState)}`);
  } finally {
    await setAdminPermissionOverrides({
      'media.view': null,
    });
    await navigateToMedia(client, searchText);
  }
};

const assertDeniedMediaActivityUi = async (client, searchText, assetName) => {
  try {
    await setAdminPermissionOverrides({
      'activity.export': 'deny',
    });
    await navigateToMedia(client, searchText);
    await waitForMediaPageAsset(client, assetName);

    let libraryState = null;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      libraryState = await evaluate(client, `(() => {
        const panel = document.querySelector('[data-testid="media-library-activity"]');
        const filter = panel?.querySelector('select[aria-label="Filter media library activity"]');
        const buttons = Array.from(panel?.querySelectorAll('button') || []).map((button) => ({
          text: button.textContent || '',
          disabled: button.disabled,
        }));
        const text = panel?.textContent || '';
        return {
          hasPanel: panel instanceof HTMLElement,
          hasDeniedNotice: text.includes('needs activity.export'),
          hasHiddenState: text.includes('Media activity is hidden until audit export access is granted.'),
          filterDisabled: filter instanceof HTMLSelectElement ? filter.disabled : null,
          refreshDisabled: buttons.some((button) => button.text.includes('Refresh') && button.disabled),
          exportDisabled: buttons.some((button) => button.text.includes('Export audit') && button.disabled),
          body: text.slice(0, 1800),
        };
      })()`);
      if (
        libraryState.hasPanel &&
        libraryState.hasDeniedNotice &&
        libraryState.hasHiddenState &&
        libraryState.filterDisabled === true &&
        libraryState.refreshDisabled &&
        libraryState.exportDisabled
      ) {
        break;
      }
      if (attempt === 79) {
        throw new Error(`Denied activity.export library UI did not hide audit feed: ${JSON.stringify(libraryState)}`);
      }
      await sleep(250);
    }

    await openMediaDetails(client, assetName);
    let assetState = null;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      assetState = await evaluate(client, `(() => {
        const filter = document.querySelector('select[aria-label="Filter media activity"]');
        const activitySection = Array.from(document.querySelectorAll('div')).find((candidate) => (
          (candidate.textContent || '').includes('Audit trail for this asset')
        ));
        const buttons = Array.from(activitySection?.querySelectorAll('button') || []).map((button) => ({
          text: button.textContent || '',
          disabled: button.disabled,
        }));
        const text = activitySection?.textContent || document.body?.innerText || '';
        return {
          hasDeniedNotice: text.includes('needs activity.export'),
          hasHiddenState: text.includes('Asset activity is hidden until audit export access is granted.'),
          filterDisabled: filter instanceof HTMLSelectElement ? filter.disabled : null,
          refreshDisabled: buttons.some((button) => button.text.includes('Refresh') && button.disabled),
          body: text.slice(0, 1800),
        };
      })()`);
      if (
        assetState.hasDeniedNotice &&
        assetState.hasHiddenState &&
        assetState.filterDisabled === true &&
        assetState.refreshDisabled
      ) {
        break;
      }
      if (attempt === 79) {
        throw new Error(`Denied activity.export asset UI did not hide audit feed: ${JSON.stringify(assetState)}`);
      }
      await sleep(250);
    }
    await closeMediaDetails(client);

    return { library: libraryState, asset: assetState };
  } finally {
    await setAdminPermissionOverrides({
      'activity.export': null,
    });
    await navigateToMedia(client, searchText);
  }
};

const assertTagFilterShowsOnlyExactMatches = async (client, { searchText, tag, includedName, excludedName }) => {
  const taggedMedia = await listMedia(searchText, { tag });
  assert(
    taggedMedia.some((item) => item.originalName === includedName || item.name === includedName),
    `Media API tag filter did not include ${includedName}: ${JSON.stringify(taggedMedia).slice(0, 1000)}`,
  );
  assert(
    !taggedMedia.some((item) => item.originalName === excludedName || item.name === excludedName),
    `Media API tag filter included ${excludedName}: ${JSON.stringify(taggedMedia).slice(0, 1000)}`,
  );

  await navigateToMedia(client, searchText, { tag });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const params = new URLSearchParams(window.location.search);
      const tagInput = document.querySelector('[data-testid="media-tag-filter"]');
      const body = document.body?.innerText || '';
      return {
        ready: Boolean(document.querySelector('[data-testid="media-library-command-center"]')),
        tagParam: params.get('tag'),
        tagValue: tagInput instanceof HTMLInputElement ? tagInput.value : null,
        hasIncluded: body.includes(${JSON.stringify(includedName)}),
        hasExcluded: body.includes(${JSON.stringify(excludedName)}),
        body: body.slice(0, 1600),
      };
    })()`);
    if (state.ready && state.tagParam === tag && state.tagValue === tag && state.hasIncluded && !state.hasExcluded) {
      return state;
    }
    if (attempt === 119) {
      throw new Error(`Media tag filter did not isolate exact tag ${tag}: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
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
    hasStorageEnvContract: Boolean(document.querySelector('[data-testid="media-storage-env-contract"]')) &&
      document.body?.innerText?.includes('Provider env contract'),
    hasStorageProvisioning: document.body?.innerText?.includes('Provision probe') || false,
    hasScannerRuntime: Boolean(document.querySelector('[data-testid="media-scanner-runtime"]')) &&
      document.body?.innerText?.includes('Upload scanner'),
    hasScannerEnvContract: Boolean(document.querySelector('[data-testid="media-scanner-env-contract"]')) &&
      document.body?.innerText?.includes('Scanner env contract') &&
      document.body?.innerText?.includes('BACKY_MEDIA_SCAN_ENDPOINT'),
    hasLibraryActivity: Boolean(document.querySelector('[data-testid="media-library-activity"]')) &&
      document.body?.innerText?.includes('Media activity') &&
      document.body?.innerText?.includes('activity.export') &&
      Boolean(document.querySelector('select[aria-label="Filter media library activity"]')),
    hasFolders: document.body?.innerText?.includes('Folders') || false,
    hasBulk: document.body?.innerText?.includes('Bulk organize') || document.body?.innerText?.includes('Select visible assets') || false,
    hasProviderDelivery: document.body?.innerText?.includes('Provider delivery') || false,
    hasProviderRoi: Boolean(document.querySelector('[data-testid="media-provider-roi"]')) &&
      document.body?.innerText?.includes('Provider ROI'),
    hasAsset: document.body?.innerText?.includes(${JSON.stringify(expectedText)}) || false,
    hasSearch: Boolean(document.querySelector('input[aria-label="Search media"]')),
  }))()`);
  assert(layout.scrollWidth <= layout.width + 8, `Media page has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(
    layout.hasCommandCenter && layout.hasDropzone && layout.hasIntakeRules && layout.hasApi && layout.hasStorageOperations && layout.hasStorageEnvContract && layout.hasStorageProvisioning && layout.hasScannerRuntime && layout.hasScannerEnvContract && layout.hasLibraryActivity && layout.hasFolders && layout.hasBulk && layout.hasProviderDelivery && layout.hasProviderRoi && layout.hasAsset && layout.hasSearch,
    `Media page missing expected regions: ${JSON.stringify(layout)}`,
  );
  return layout;
};

const assertMediaPaginationControls = async (client) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="media-library-pagination"]');
      const text = panel?.textContent || '';
      const buttons = Array.from(panel?.querySelectorAll('button') || []).map((button) => ({
        text: button.textContent || '',
        disabled: button.disabled,
      }));
      return {
        hasPanel: panel instanceof HTMLElement,
        hasLoadedCount: /Loaded\\s+\\d+\\s+of\\s+\\d+/.test(text),
        hasLoadMore: buttons.some((button) => button.text.includes('Load more')),
        hasLoadAll: buttons.some((button) => button.text.includes('Load all matching')),
        hasRefresh: buttons.some((button) => button.text.includes('Refresh')),
        hasBulkLoadedCopy: document.body?.innerText?.includes('Select visible loaded') || false,
        body: text.slice(0, 1200),
      };
    })()`);
    if (state.hasPanel && state.hasLoadedCount && state.hasLoadMore && state.hasLoadAll && state.hasRefresh && state.hasBulkLoadedCopy) {
      return state;
    }
    if (attempt === 79) {
      throw new Error(`Media pagination controls did not render: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const uploadCentralMediaThroughUi = async (client, uploadPath, uploadName, options = {}) => {
  const mode = options.mode || 'file';
  const acceptIncludes = options.acceptIncludes || '.txt';
  const modeResult = await evaluate(client, `(() => {
    const modeButton = document.querySelector(${JSON.stringify(`[data-testid="media-upload-mode-${mode}"]`)});
    if (!(modeButton instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'mode-button-not-found' };
    }
    if (modeButton.disabled) {
      return { ok: false, reason: 'mode-button-disabled', text: modeButton.textContent || '' };
    }
    modeButton.click();
    return { ok: true };
  })()`);
  assert(modeResult.ok, `Unable to select central ${mode} upload mode: ${JSON.stringify(modeResult)}`);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const input = document.querySelector('[data-testid="media-upload-input"]');
      const selectedButton = document.querySelector(${JSON.stringify(`[data-testid="media-upload-mode-${mode}"]`)});
      return {
        hasInput: input instanceof HTMLInputElement,
        accept: input instanceof HTMLInputElement ? input.accept : '',
        selected: selectedButton instanceof HTMLButtonElement ? selectedButton.className.includes('bg-primary') : false,
      };
    })()`);
    if (state.hasInput && state.selected && (!acceptIncludes || state.accept.includes(acceptIncludes))) {
      break;
    }
    if (attempt === 39) {
      throw new Error(`Central ${mode} upload mode did not expose expected accept filters: ${JSON.stringify(state)}`);
    }
    await sleep(100);
  }

  await client.send('DOM.enable');
  const documentResult = await client.send('DOM.getDocument', { depth: 1 });
  const queryResult = await client.send('DOM.querySelector', {
    nodeId: documentResult.root.nodeId,
    selector: '[data-testid="media-upload-input"]',
  });
  assert(queryResult.nodeId, `Unable to resolve central upload input node: ${JSON.stringify(queryResult)}`);
  await client.send('DOM.setFileInputFiles', {
    nodeId: queryResult.nodeId,
    files: [uploadPath],
  });

  for (let attempt = 0; attempt < 160; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      hasUploadName: document.body?.innerText?.includes(${JSON.stringify(uploadName)}) || false,
      hasSummary: Boolean(document.querySelector('[data-testid="media-upload-summary"]')),
      uploading: document.body?.innerText?.includes('Uploading files') || false,
      body: document.body?.innerText?.slice(0, 1800) || '',
    }))()`);
    if (state.hasUploadName && state.hasSummary && !state.uploading) {
      return state;
    }
    if (attempt === 159) {
      throw new Error(`Central upload input did not complete: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const assertUploadModeRejectsDroppedFiles = async (client, rejectedName) => {
  const selected = await evaluate(client, `(() => {
    const modeButton = document.querySelector('[data-testid="media-upload-mode-image"]');
    if (!(modeButton instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'image-mode-button-not-found' };
    }
    if (modeButton.disabled) {
      return { ok: false, reason: 'image-mode-button-disabled' };
    }
    modeButton.click();
    return { ok: true };
  })()`);
  assert(selected.ok, `Unable to select image upload mode: ${JSON.stringify(selected)}`);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const selectedButton = document.querySelector('[data-testid="media-upload-mode-image"]');
      const input = document.querySelector('[data-testid="media-upload-input"]');
      return {
        selected: selectedButton instanceof HTMLButtonElement ? selectedButton.className.includes('bg-primary') : false,
        accept: input instanceof HTMLInputElement ? input.accept : '',
      };
    })()`);
    if (state.selected && state.accept.includes('image/*')) {
      break;
    }
    if (attempt === 39) {
      throw new Error(`Image upload mode was not selected before rejected drop: ${JSON.stringify(state)}`);
    }
    await sleep(100);
  }

  const dropped = await evaluate(client, `(() => {
    const dropzone = document.querySelector('[data-testid="media-upload-dropzone"]');
    if (!(dropzone instanceof HTMLElement)) {
      return { ok: false, reason: 'dropzone-not-found' };
    }
    const file = new File(['Backy rejected upload mode smoke'], ${JSON.stringify(rejectedName)}, { type: 'text/plain' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    dropzone.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
    }));
    return { ok: true };
  })()`);
  assert(dropped.ok, `Unable to dispatch rejected upload-mode drop: ${JSON.stringify(dropped)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const body = document.body?.innerText || '';
      return {
        hasSummary: Boolean(document.querySelector('[data-testid="media-upload-summary"]')),
        hasSkippedMessage: body.includes(${JSON.stringify(`${rejectedName} skipped because Images upload mode is selected.`)}),
        hasFailedCount: body.includes('Last upload: 0/1 saved') && body.includes('1 failed'),
        uploading: body.includes('Uploading files'),
        body: body.slice(0, 1800),
      };
    })()`);
    if (state.hasSummary && state.hasSkippedMessage && state.hasFailedCount && !state.uploading) {
      return state;
    }
    if (attempt === 79) {
      throw new Error(`Upload mode drop rejection did not render feedback: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const assertProviderRoiDashboard = async (client) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="media-provider-roi"]');
      const text = panel?.textContent || '';
      return {
        ready: Boolean(panel) &&
          text.includes('Provider ROI') &&
          text.includes('USD 166.25') &&
          text.includes('5 conv') &&
          text.includes('10% CVR') &&
          text.includes('USD 3.33/req') &&
          text.includes('50 provider requests'),
        text: text.slice(0, 1600),
      };
    })()`);
    if (state.ready) {
      return state;
    }
    if (attempt === 99) {
      throw new Error(`Provider ROI dashboard did not render expected metrics: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return null;
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

const runMediaStorageProvisioningProbe = async (client) => {
  let clicked = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    clicked = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="media-storage-operations"]');
      if (!(panel instanceof HTMLElement)) return { ok: false, reason: 'panel-not-found' };
      const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
        /Provision probe|Probing/.test(candidate.textContent || '')
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
  assert(clicked.ok, `Unable to start media storage provisioning probe: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="media-storage-provisioning-results"]');
      const text = panel?.textContent || '';
      return {
        ready: Boolean(panel) &&
          text.includes('Provisioning and rotation probe') &&
          text.includes('Probe upload') &&
          text.includes('Readback') &&
          text.includes('Probe cleanup') &&
          text.includes('Credential fields') &&
          text.includes('Rotation runbook'),
        text: text.slice(0, 1800),
      };
    })()`);
    if (state.ready) {
      return state;
    }
    if (attempt === 99) {
      throw new Error(`Media storage provisioning probe did not render expected results: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const openMediaDetails = async (client, assetName) => {
  const result = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
      (candidate.getAttribute('aria-label') || '') === ${JSON.stringify(`Edit metadata for ${assetName}`)}
    )) || Array.from(document.querySelectorAll('button')).find((candidate) => (
      (candidate.textContent || '').trim() === ${JSON.stringify(`Open ${assetName}`)}
    )) || Array.from(document.querySelectorAll('button')).find((candidate) => (
      (candidate.textContent || '').includes(${JSON.stringify(assetName)})
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
        document.body?.innerText?.includes('Provider and CDN boundary') &&
        document.body?.innerText?.includes('Activity') &&
        document.body?.innerText?.includes('Read audit feed') &&
        document.body?.innerText?.includes('activity.export') &&
        Boolean(document.querySelector('select[aria-label="Filter media activity"]')),
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

const assertMediaActivityDetails = async (client, expectedText) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const filter = document.querySelector('select[aria-label="Filter media activity"]');
      if (filter instanceof HTMLSelectElement) {
        filter.value = 'media.replace';
        filter.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return {
        hasFilter: filter instanceof HTMLSelectElement,
        hasPermission: document.body?.innerText?.includes('media.edit') || false,
        hasBefore: document.body?.innerText?.includes('Before') || false,
        hasAfter: document.body?.innerText?.includes('After') || false,
        hasExpected: document.body?.innerText?.includes(${JSON.stringify(expectedText)}) || false,
        body: document.body?.innerText?.slice(0, 2200) || '',
      };
    })()`);
    if (state.hasFilter && state.hasPermission && state.hasBefore && state.hasAfter && state.hasExpected) {
      return state;
    }
    if (attempt === 79) {
      throw new Error(`Media activity details did not render: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const assertMediaLibraryActivity = async (client, expectedText) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const filter = document.querySelector('select[aria-label="Filter media library activity"]');
      if (filter instanceof HTMLSelectElement) {
        filter.value = 'media.replace';
        filter.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const panel = document.querySelector('[data-testid="media-library-activity"]');
      const panelText = panel?.textContent || '';
      return {
        hasPanel: panel instanceof HTMLElement,
        hasFilter: filter instanceof HTMLSelectElement,
        hasExport: panelText.includes('Export audit'),
        hasPermission: panelText.includes('activity.export'),
        hasReplacement: panelText.includes('Asset file replaced') || panelText.includes('Replacements'),
        hasExpected: panelText.includes(${JSON.stringify(expectedText)}),
        body: panelText.slice(0, 2200),
      };
    })()`);
    if (state.hasPanel && state.hasFilter && state.hasExport && state.hasPermission && state.hasReplacement && state.hasExpected) {
      return state;
    }
    if (attempt === 99) {
      throw new Error(`Media library activity did not render: ${JSON.stringify(state)}`);
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

  const envContract = await evaluate(client, `(() => {
    const panel = document.querySelector('[data-testid="media-storage-env-contract"]');
    const text = panel?.textContent || '';
    return {
      ready: Boolean(panel) &&
        text.includes('Provider env contract') &&
        text.includes('BACKY_SUPABASE_URL') &&
        text.includes('BACKY_SUPABASE_SERVICE_ROLE_KEY') &&
        text.includes('BACKY_SUPABASE_STORAGE_BUCKET') &&
        text.includes('secret'),
      text: text.slice(0, 1200),
    };
  })()`);
  assert(envContract.ready, `Media storage env contract did not render Supabase credential requirements: ${JSON.stringify(envContract)}`);

  const scannerEnvContract = await evaluate(client, `(() => {
    const panel = document.querySelector('[data-testid="media-scanner-env-contract"]');
    const runtime = document.querySelector('[data-testid="media-scanner-runtime"]');
    const text = panel?.textContent || '';
    const runtimeText = runtime?.textContent || '';
    return {
      ready: Boolean(panel) &&
        Boolean(runtime) &&
        text.includes('Scanner env contract') &&
        text.includes('BACKY_MEDIA_SCAN_PROVIDER') &&
        text.includes('BACKY_MEDIA_SCAN_ENDPOINT') &&
        text.includes('BACKY_MEDIA_SCAN_API_KEY') &&
        text.includes('failOpen') &&
        runtimeText.includes('Upload scanner') &&
        runtimeText.includes('Provider'),
      text: (runtimeText + '\\n' + text).slice(0, 1600),
    };
  })()`);
  assert(scannerEnvContract.ready, `Media scanner env contract did not render scan provider requirements: ${JSON.stringify(scannerEnvContract)}`);

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

const recordProviderMetricsThroughDetails = async (client) => {
  await setDetailsField(client, 'Provider requests', 42);
  await setDetailsField(client, 'Provider bytes served', 2048);
  await setDetailsField(client, 'Conversions', 3);
  await setDetailsField(client, 'Conversion value', 120.5);
  await setDetailsField(client, 'Currency', 'USD');
  await setDetailsField(client, 'Attribution window', 'last-click');
  await setDetailsField(client, 'Analytics source', 'media-smoke-cdn');
  await setDetailsField(client, 'Reporting window', 'smoke-window');
  await clickDetailsButton(client, 'Record provider metrics');

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="media-provider-analytics"]');
      const text = panel?.textContent || '';
      return {
        ready: text.includes('Provider metrics recorded') &&
          text.includes('42') &&
          text.includes('2 KB') &&
          text.includes('3') &&
          text.includes('120.50') &&
          text.includes('USD') &&
          text.includes('last-click') &&
          text.includes('media-smoke-cdn') &&
          text.includes('smoke-window'),
        text: text.slice(0, 1600),
      };
    })()`);
    if (state.ready) {
      return state;
    }
    if (attempt === 99) {
      throw new Error(`Provider metrics did not render after save: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return null;
};

const ingestProviderMetricsThroughApi = async (media) => {
  const storagePath = media.metadata?.storagePath;
  assert(storagePath, 'Provider analytics ingest smoke needs the media storage path.');

  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/media/provider-analytics`, {
    method: 'POST',
    body: JSON.stringify({
      source: 'media-smoke-provider-ingest',
      reportingWindow: 'automated-smoke-window',
      mergeMode: 'increment',
      entries: [
        {
          storagePath,
          requests: 8,
          bytes: 1024,
          conversions: 2,
          conversionValue: 45.75,
          currency: 'USD',
          attributionWindow: 'view-through-7d',
          lastDeliveredAt: new Date().toISOString(),
        },
        {
          storagePath: `missing/${Date.now()}/asset.png`,
          requests: 99,
          bytes: 99,
        },
      ],
    }),
  });

  assert(payload.data?.matchedCount === 1, `Provider analytics ingest did not match one asset: ${JSON.stringify(payload.data).slice(0, 500)}`);
  assert(payload.data?.unmatchedCount === 1, `Provider analytics ingest did not report one unmatched entry: ${JSON.stringify(payload.data).slice(0, 500)}`);
  assert(payload.data?.matched?.[0]?.matchedBy === 'storagePath', 'Provider analytics ingest did not match by storage path.');

  return payload.data;
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

const restoreAssetVersionThroughDetails = async (client) => {
  await clickDetailsButton(client, 'Restore');
  await clickDetailsButton(client, 'Confirm restore');

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      restoring: document.body?.innerText?.includes('Restoring...') || false,
      hasHistory: document.body?.innerText?.includes('Replacement history') || false,
      hasVersionCount: document.body?.innerText?.includes('1 previous') || false,
      body: document.body?.innerText?.slice(0, 1800) || '',
    }))()`);
    if (!state.restoring && state.hasHistory && state.hasVersionCount) {
      return state;
    }
    if (attempt === 119) {
      throw new Error(`Media retained version restore did not finish in details dialog: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const compareAssetVersionThroughDetails = async (client) => {
  await clickDetailsButton(client, 'Compare');

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      hasComparison: Boolean(document.querySelector('[data-testid="media-version-comparison"]')),
      panelText: document.querySelector('[data-testid="media-version-comparison"]')?.textContent || '',
      previewCount: document.querySelectorAll('[data-testid="media-version-preview"]').length,
      imagePreviewCount: document.querySelectorAll('[data-testid="media-version-preview"][data-preview-kind="image"]').length,
      body: document.body?.innerText?.slice(0, 1600) || '',
    }))()`);
    if (
      state.hasComparison &&
      state.previewCount === 2 &&
      state.imagePreviewCount === 2 &&
      state.panelText.includes('Current preview') &&
      state.panelText.includes('Retained preview') &&
      state.panelText.includes('Current') &&
      state.panelText.includes('Retained') &&
      state.panelText.includes('Size delta') &&
      state.panelText.includes('Binary fingerprint') &&
      state.panelText.includes('sha256:') &&
      state.panelText.includes('Path changed') &&
      state.panelText.includes('Name changed')
    ) {
      return state;
    }
    if (attempt === 79) {
      throw new Error(`Media retained version comparison did not render: ${JSON.stringify(state)}`);
    }
    await sleep(150);
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

const setBulkSafetyAction = async (client, value) => {
  const result = await evaluate(client, `(() => {
    const select = document.querySelector('select[aria-label="Bulk safety action"]');
    if (!(select instanceof HTMLSelectElement)) {
      return {
        ok: false,
        reason: 'select-not-found',
        selects: Array.from(document.querySelectorAll('select')).map((item) => item.getAttribute('aria-label') || item.textContent || '').slice(0, 80),
      };
    }
    if (select.disabled) return { ok: false, reason: 'select-disabled' };
    const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    descriptor?.set?.call(select, ${JSON.stringify(value)});
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: select.value };
  })()`);
  assert(result.ok, `Unable to set bulk safety action: ${JSON.stringify(result)}`);
  await sleep(100);
  return result;
};

const setBulkSelectValue = async (client, ariaLabel, value) => {
  let result;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    result = await evaluate(client, `(() => {
      const select = document.querySelector(\`select[aria-label="${ariaLabel}"]\`);
      if (!(select instanceof HTMLSelectElement)) {
        return {
          ok: false,
          retry: true,
          reason: 'select-not-found',
          ariaLabel: ${JSON.stringify(ariaLabel)},
          selects: Array.from(document.querySelectorAll('select')).map((item) => item.getAttribute('aria-label') || item.textContent || '').slice(0, 80),
        };
      }
      if (select.disabled) return { ok: false, retry: true, reason: 'select-disabled', ariaLabel: ${JSON.stringify(ariaLabel)} };
      const optionExists = Array.from(select.options).some((option) => option.value === ${JSON.stringify(value)});
      if (!optionExists) {
        return {
          ok: false,
          retry: true,
          reason: 'option-not-found',
          value: ${JSON.stringify(value)},
          options: Array.from(select.options).map((option) => ({ value: option.value, text: option.textContent || '' })).slice(0, 80),
        };
      }
      const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
      descriptor?.set?.call(select, ${JSON.stringify(value)});
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, value: select.value };
    })()`);
    if (result.ok) break;
    if (!result.retry || attempt === 79) {
      assert(false, `Unable to set ${ariaLabel}: ${JSON.stringify(result)}`);
    }
    await sleep(250);
  }
  await sleep(100);
  return result;
};

const setBulkTagAction = (client, value) => setBulkSelectValue(client, 'Bulk tag action', value);
const setBulkFolder = (client, value) => setBulkSelectValue(client, 'Bulk folder', value);

const setBulkTags = async (client, tags) => {
  const tagText = Array.isArray(tags) ? tags.join(', ') : String(tags || '');
  const result = await evaluate(client, `(async () => {
    const input = document.querySelector('input[aria-label="Bulk media tags"]');
    if (!(input instanceof HTMLInputElement)) {
      return { ok: false, reason: 'input-not-found' };
    }
    if (input.disabled) return { ok: false, reason: 'input-disabled' };
    input.focus();
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    descriptor?.set?.call(input, ${JSON.stringify(tagText)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    input.blur();
    return { ok: true, value: input.value };
  })()`);
  assert(result.ok, `Unable to set bulk tags: ${JSON.stringify(result)}`);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: ${JSON.stringify(tagText ? tagText.split(',').map((tag) => tag.trim()).filter(Boolean) : [])}.every((tag) => document.body?.innerText?.includes(tag)),
      body: document.body?.innerText?.slice(0, 1400) || '',
    }))()`);
    if (state.ready) return state;
    if (attempt === 39) {
      throw new Error(`Bulk tags did not render after entry: ${JSON.stringify(state)}`);
    }
    await sleep(100);
  }

  return null;
};

const selectVisibleMedia = async (client) => {
  let result;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    result = await evaluate(client, `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
        (candidate.textContent || '').includes('Select visible')
      ));
      if (!(button instanceof HTMLButtonElement)) {
        return { ok: false, retry: true, reason: 'button-not-found' };
      }
      if (button.disabled) {
        const alreadySelected = document.body?.innerText?.includes('1 selected') || false;
        return {
          ok: alreadySelected,
          retry: !alreadySelected,
          reason: 'button-disabled',
          text: button.textContent || '',
          body: document.body?.innerText?.slice(0, 1400) || '',
        };
      }
      button.click();
      return { ok: true };
    })()`);
    if (result.ok) break;
    if (!result.retry || attempt === 79) {
      assert(false, `Unable to select visible media: ${JSON.stringify(result)}`);
    }
    await sleep(250);
  }
  await sleep(100);
};

const applyBulkChanges = async (client) => {
  const result = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
      (candidate.textContent || '').includes('Apply changes') || (candidate.textContent || '').includes('Applying...')
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'button-not-found' };
    }
    if (button.disabled) return { ok: false, reason: 'button-disabled', text: button.textContent || '' };
    button.click();
    return { ok: true };
  })()`);
  assert(result.ok, `Unable to apply bulk changes: ${JSON.stringify(result)}`);
};

const waitForBulkNotice = async (client, expectedText) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      hasExpected: document.body?.innerText?.includes(${JSON.stringify(expectedText)}) || false,
      applying: document.body?.innerText?.includes('Applying...') || document.body?.innerText?.includes('Deleting...'),
      body: document.body?.innerText?.slice(0, 1800) || '',
    }))()`);
    if (state.hasExpected && !state.applying) {
      return state;
    }
    if (attempt === 119) {
      throw new Error(`Bulk notice ${expectedText} did not appear: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const selectSingleAssetForBulk = async (client, assetName) => {
  await navigateToMedia(client, assetName);
  await waitForMediaPageAsset(client, assetName);
  await selectVisibleMedia(client);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      selected: document.body?.innerText?.includes('1 selected') || false,
      body: document.body?.innerText?.slice(0, 1400) || '',
    }))()`);
    if (state.selected) return state;
    if (attempt === 79) {
      throw new Error(`Bulk selection did not select ${assetName}: ${JSON.stringify(state)}`);
    }
    await sleep(100);
  }

  return null;
};

const applySingleAssetBulkUpdate = async (client, assetName, options = {}) => {
  await selectSingleAssetForBulk(client, assetName);
  if (options.folderId !== undefined) {
    await setBulkFolder(client, options.folderId === null ? 'root' : options.folderId);
  }
  if (options.tagMode) {
    await setBulkTagAction(client, options.tagMode);
    if (options.tags?.length) {
      await setBulkTags(client, options.tags);
    }
  }
  await applyBulkChanges(client);
  await waitForBulkNotice(client, 'Updated 1 asset');
};

const deleteSingleAssetThroughBulk = async (client, assetName) => {
  await selectSingleAssetForBulk(client, assetName);
  const openResult = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
      (candidate.textContent || '').includes('Delete selected')
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'button-not-found' };
    }
    if (button.disabled) return { ok: false, reason: 'button-disabled', text: button.textContent || '' };
    button.click();
    return { ok: true };
  })()`);
  assert(openResult.ok, `Unable to open bulk delete confirmation: ${JSON.stringify(openResult)}`);

  const confirmResult = await evaluate(client, `(() => {
    const dialog = Array.from(document.querySelectorAll('[class*="fixed"]')).find((candidate) => (
      (candidate.textContent || '').includes('Delete 1 selected asset?')
    ));
    const button = dialog && Array.from(dialog.querySelectorAll('button')).find((candidate) => (
      (candidate.textContent || '').trim() === 'Delete assets'
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'confirm-missing', dialog: dialog?.textContent?.slice(0, 500) || '' };
    }
    if (button.disabled) return { ok: false, reason: 'confirm-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(confirmResult.ok, `Unable to confirm bulk delete: ${JSON.stringify(confirmResult)}`);
  await waitForBulkNotice(client, 'Deleted 1 asset');
};

const releaseQuarantineThroughBulk = async (client) => {
  const focusResult = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
      (candidate.textContent || '').trim() === 'Quarantined'
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'quarantine-filter-not-found' };
    }
    if (button.disabled) return { ok: false, reason: 'quarantine-filter-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(focusResult.ok, `Unable to focus quarantined media: ${JSON.stringify(focusResult)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      focused: document.body?.innerText?.includes('Quarantined') || false,
      hasReleaseOption: document.body?.innerText?.includes('Release quarantine') || false,
      body: document.body?.innerText?.slice(0, 1600) || '',
    }))()`);
    if (state.focused && state.hasReleaseOption) break;
    if (attempt === 79) {
      throw new Error(`Quarantined focus did not render bulk safety controls: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  await selectVisibleMedia(client);
  await setBulkSafetyAction(client, 'release');
  await applyBulkChanges(client);

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      released: document.body?.innerText?.includes('Updated 1 asset') ||
        document.body?.innerText?.includes('No assets match this view'),
      applying: document.body?.innerText?.includes('Applying...'),
      body: document.body?.innerText?.slice(0, 1800) || '',
    }))()`);
    if (state.released && !state.applying) {
      return state;
    }
    if (attempt === 119) {
      throw new Error(`Bulk quarantine release did not finish: ${JSON.stringify(state)}`);
    }
    await sleep(250);
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

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      closed: !(document.body?.innerText || '').includes('Safety scan') &&
        !(document.body?.innerText || '').includes('Read audit feed') &&
        !(document.body?.innerText || '').includes('Provider and CDN boundary'),
      body: document.body?.innerText?.slice(0, 1000) || '',
    }))()`);
    if (state.closed) return state;
    if (attempt === 79) {
      throw new Error(`Media details did not close: ${JSON.stringify(state)}`);
    }
    await sleep(100);
  }

  return null;
};

const assertFontRegistrationPanel = async (client, { family, weight, style }) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('#media-fonts');
      const text = panel?.textContent || '';
      return {
        hasPanel: panel instanceof HTMLElement,
        hasFamily: text.includes(${JSON.stringify(family)}),
        hasWeight: text.includes(${JSON.stringify(weight)}),
        hasStyle: text.toLowerCase().includes(${JSON.stringify(style.toLowerCase())}),
        hasEdit: Array.from(panel?.querySelectorAll('button') || []).some((button) => (button.textContent || '').includes('Edit')),
        body: text.slice(0, 1400),
      };
    })()`);
    if (state.hasPanel && state.hasFamily && state.hasWeight && state.hasStyle && state.hasEdit) {
      return state;
    }
    if (attempt === 99) {
      throw new Error(`Font registration panel did not render expected metadata: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const assertPublicFontManifest = async ({ fontId, family, weight, style, display, fallback }) => {
  const payload = await requestApi(`/api/sites/${SITE_ID}/media/fonts`);
  const manifest = payload.data || payload;
  const fonts = Array.isArray(manifest.fonts) ? manifest.fonts : [];
  const families = Array.isArray(manifest.families) ? manifest.families : [];
  const variant = fonts.find((font) => font.mediaId === fontId);

  assert(variant, `Public font manifest did not include uploaded font ${fontId}: ${JSON.stringify(manifest).slice(0, 500)}`);
  assert(variant.family === family, `Public font manifest family mismatch: ${JSON.stringify(variant)}`);
  assert(variant.weight === weight, `Public font manifest weight mismatch: ${JSON.stringify(variant)}`);
  assert(variant.style === style, `Public font manifest style mismatch: ${JSON.stringify(variant)}`);
  assert(variant.display === display, `Public font manifest display mismatch: ${JSON.stringify(variant)}`);
  assert(variant.fallbackStack === fallback, `Public font manifest fallback mismatch: ${JSON.stringify(variant)}`);
  assert(variant.url === `/api/sites/${encodeURIComponent(SITE_ID)}/media/${encodeURIComponent(fontId)}/file`, `Public font manifest URL mismatch: ${JSON.stringify(variant)}`);
  assert(variant.cssFamily === `"${family}", ${fallback}`, `Public font manifest CSS family mismatch: ${JSON.stringify(variant)}`);
  assert((manifest.css || '').includes(`font-family: "${family}";`), `Public font manifest CSS missed family: ${manifest.css || ''}`);
  assert((manifest.css || '').includes(`font-weight: ${weight};`), `Public font manifest CSS missed weight: ${manifest.css || ''}`);
  assert((manifest.css || '').includes(`font-style: ${style};`), `Public font manifest CSS missed style: ${manifest.css || ''}`);
  assert((manifest.css || '').includes(`font-display: ${display};`), `Public font manifest CSS missed display: ${manifest.css || ''}`);
  assert(families.some((fontFamily) => (
    fontFamily.family === family &&
    Array.isArray(fontFamily.assetIds) &&
    fontFamily.assetIds.includes(fontId)
  )), `Public font manifest did not group uploaded font family: ${JSON.stringify(families).slice(0, 500)}`);

  return { variant, counts: manifest.counts };
};

const uploadFontThroughUiAndAssert = async (client, {
  uploadPath,
  uploadName,
  marker,
  family,
  weight,
  style,
  display,
  fallback,
}) => {
  await uploadCentralMediaThroughUi(client, uploadPath, uploadName, { mode: 'font', acceptIncludes: '.woff2' });
  const uploadedFont = await waitForMedia(marker, (item) => (
    item.originalName === uploadName &&
    item.type === 'font' &&
    item.visibility === 'public'
  ));
  await waitForMediaPageAsset(client, uploadName);
  await openMediaDetails(client, uploadName);
  await setDetailsField(client, 'Family', family);
  await setDetailsField(client, 'Weight', weight);
  await setDetailsField(client, 'Style', style);
  await setDetailsField(client, 'Fallback stack', fallback);
  await setDetailsField(client, 'Display', display);
  await saveDetails(client);

  const updatedFont = await waitForMedia(marker, (item) => (
    item.id === uploadedFont.id &&
    item.type === 'font' &&
    item.metadata?.fontFamily === family &&
    item.metadata?.fontWeight === weight &&
    item.metadata?.fontStyle === style &&
    item.metadata?.fontDisplay === display &&
    item.metadata?.fontFallback === fallback
  ));
  await closeMediaDetails(client);
  const panel = await assertFontRegistrationPanel(client, { family, weight, style });
  const manifest = await assertPublicFontManifest({
    fontId: updatedFont.id,
    family,
    weight,
    style,
    display,
    fallback,
  });

  return { uploadedFont: updatedFont, panel, manifest };
};

const assertPrivateFontPreview = async (client, { fontId, fontName, family }) => {
  const privateFont = await waitForMedia(fontName, (item) => (
    item.id === fontId &&
    item.type === 'font' &&
    item.visibility === 'private'
  ));
  await navigateToMedia(client, fontName);
  await waitForMediaPageAsset(client, fontName);
  await openMediaDetails(client, fontName);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const preview = document.querySelector('[data-testid="media-font-preview"]');
      const status = document.querySelector('[data-testid="media-font-preview-status"]');
      const styleText = Array.from(document.querySelectorAll('style'))
        .map((style) => style.textContent || '')
        .join('\\n');
      return {
        hasPreview: preview instanceof HTMLElement,
        previewSource: preview?.getAttribute('data-preview-source') || '',
        previewReady: preview?.getAttribute('data-preview-ready') || '',
        hasStatus: status instanceof HTMLElement,
        statusText: status?.textContent || '',
        hasSignedFontFace: styleText.includes(${JSON.stringify(`/api/sites/${SITE_ID}/media/${fontId}/file`)}) &&
          styleText.includes('token=') &&
          styleText.includes('expiresAt=') &&
          styleText.includes(${JSON.stringify(`font-family: "${family}";`)}),
        leakedRawAssetUrl: styleText.includes(${JSON.stringify(privateFont.url)}) && !styleText.includes('token='),
        styleText: styleText.slice(0, 1400),
      };
    })()`);

    if (
      state.hasPreview &&
      state.previewSource === 'signed' &&
      state.previewReady === 'true' &&
      state.hasStatus &&
      state.statusText.includes('Private font preview uses a temporary signed URL') &&
      state.hasSignedFontFace &&
      !state.leakedRawAssetUrl
    ) {
      await closeMediaDetails(client);
      return { privateFont, state };
    }

    if (attempt === 99) {
      throw new Error(`Private font preview did not use signed delivery: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return { privateFont, state: null };
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
  let centralUploadedFile;
  let fontUploadedFile;
  let fontSmokeResult;
  let originalSettings;
  let restoredSettings = false;
  const mediaIds = [];
  const suffix = Date.now().toString(36);
  const marker = `media-smoke-${suffix}`;
  const folderName = `Media Smoke ${suffix}`;
  const imageName = `${marker}.png`;
  const replacementName = `${marker}-replacement.png`;
  const renamedImageName = `${marker}-renamed.png`;
  const privateName = `${marker}.txt`;
  const childFolderAssetName = `${marker}-child-folder.txt`;
  const centralUploadName = `${marker}-central-upload.txt`;
  const fontUploadName = `${marker}-brand-font.woff2`;
  const rejectedUploadModeName = `${marker}-image-mode-rejected.txt`;
  const bulkName = `${marker}-bulk.txt`;
  const updatedAltText = `Updated central media smoke ${suffix}`;
  const fontFamily = `Backy Smoke ${suffix}`;
  const fontWeight = '600';
  const fontStyle = 'italic';
  const fontDisplay = 'optional';
  const fontFallback = 'Inter, system-ui, sans-serif';
  const replacementPath = path.join(os.tmpdir(), `${replacementName}`);
  const centralUploadPath = path.join(os.tmpdir(), centralUploadName);
  const fontUploadPath = path.join(os.tmpdir(), fontUploadName);
  const tempFiles = [replacementPath, centralUploadPath, fontUploadPath];

  try {
    await loginAdminApi();
    await assertMediaViewPermissionIsEnforced();
    await assertMediaConfigurePermissionIsEnforced();
    await assertMediaActivityPermissionIsEnforced();
    await assertMediaMutationPermissionOverridesAreEnforced();
    originalSettings = await readSettings();
    fs.writeFileSync(replacementPath, ONE_PIXEL_PNG);
    fs.writeFileSync(centralUploadPath, `Backy central upload UI smoke ${suffix}\n`, 'utf8');
    fs.writeFileSync(fontUploadPath, MINIMAL_WOFF2);
    const existing = await listMedia(marker);
    assert(existing.length === 0, `Temporary media already exists for marker ${marker}`);

    const folder = await createFolder(folderName);
    folderId = folder.id;
    await expectApiError(
      `/api/admin/sites/${SITE_ID}/media/folders`,
      { method: 'POST', body: JSON.stringify({ name: folderName, parentId: null }) },
      409,
      'FOLDER_NAME_CONFLICT',
    );
    const childFolder = await createFolder(`${folderName} Child`, { parentId: folderId });
    childFolderId = childFolder.id;
    assert(childFolder.parentId === folderId, 'Nested media folder did not preserve its parent id.');
    await expectApiError(
      `/api/admin/sites/${SITE_ID}/media/folders`,
      { method: 'POST', body: JSON.stringify({ name: `${folderName} Child`, parentId: folderId }) },
      409,
      'FOLDER_NAME_CONFLICT',
    );
    await expectApiError(
      `/api/admin/sites/${SITE_ID}/media/folders/${childFolderId}`,
      { method: 'PATCH', body: JSON.stringify({ name: folderName, parentId: null }) },
      409,
      'FOLDER_NAME_CONFLICT',
    );
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
    const childFolderFile = await uploadMedia({
      filename: childFolderAssetName,
      mimeType: 'text/plain',
      bytes: Buffer.from(`Backy nested folder media smoke ${suffix}\n`, 'utf8'),
      visibility: 'public',
      folderId: childFolderId,
      tags: ['smoke', 'nested-folder'],
      caption: 'Temporary child-folder file for parent filter smoke.',
    });
    mediaIds.push(childFolderFile.id);
    const bulkFile = await uploadMedia({
      filename: bulkName,
      mimeType: 'text/plain',
      bytes: Buffer.from(`Backy media bulk smoke ${suffix}\n`, 'utf8'),
      visibility: 'public',
      folderId: null,
      tags: ['bulk-original'],
      caption: 'Temporary file for media bulk organization smoke.',
    });
    mediaIds.push(bulkFile.id);

    await waitForMedia(marker, (item) => item.id === publicImage.id);
    await waitForMedia(marker, (item) => item.id === privateFile.id);
    await waitForMedia(marker, (item) => item.id === bulkFile.id);

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
    const deniedViewUi = await assertDeniedMediaViewUi(client, marker, imageName);
    const deniedActivityUi = await assertDeniedMediaActivityUi(client, marker, imageName);
    await waitForMediaPageAsset(client, imageName);
    await assertTagFilterShowsOnlyExactMatches(client, {
      searchText: marker,
      tag: 'central-upload',
      includedName: imageName,
      excludedName: privateName,
    });
    await navigateToMedia(client, marker);
    await assertMediaLayout(client, imageName);
    await assertMediaPaginationControls(client);
    await applySingleAssetBulkUpdate(client, bulkName, { folderId });
    await waitForMedia(marker, (item) => (
      item.id === bulkFile.id &&
      item.folderId === folderId &&
      Array.isArray(item.tags) &&
      item.tags.includes('bulk-original')
    ));
    await applySingleAssetBulkUpdate(client, bulkName, { folderId: null, tagMode: 'merge', tags: ['bulk-merge'] });
    await waitForMedia(marker, (item) => (
      item.id === bulkFile.id &&
      item.folderId === null &&
      Array.isArray(item.tags) &&
      item.tags.includes('bulk-original') &&
      item.tags.includes('bulk-merge')
    ));
    await applySingleAssetBulkUpdate(client, bulkName, { tagMode: 'replace', tags: ['bulk-replace'] });
    await waitForMedia(marker, (item) => (
      item.id === bulkFile.id &&
      Array.isArray(item.tags) &&
      item.tags.length === 1 &&
      item.tags[0] === 'bulk-replace'
    ));
    await applySingleAssetBulkUpdate(client, bulkName, { tagMode: 'clear' });
    await waitForMedia(marker, (item) => (
      item.id === bulkFile.id &&
      Array.isArray(item.tags) &&
      item.tags.length === 0
    ));
    await deleteSingleAssetThroughBulk(client, bulkName);
    await waitForMediaMissing(bulkName);
    const bulkFileIndex = mediaIds.indexOf(bulkFile.id);
    if (bulkFileIndex !== -1) {
      mediaIds.splice(bulkFileIndex, 1);
    }
    await navigateToMedia(client, marker);
    await waitForMediaPageAsset(client, imageName);
    await waitForMediaPageAsset(client, privateName);
    await assertFolderFilterShowsAsset(client, { folderId, assetName: childFolderAssetName, searchText: marker });
    await navigateToMedia(client, marker);
    await uploadCentralMediaThroughUi(client, centralUploadPath, centralUploadName);
    await assertUploadModeRejectsDroppedFiles(client, rejectedUploadModeName);
    const rejectedModeMatches = await listMedia(rejectedUploadModeName);
    assert(rejectedModeMatches.length === 0, `Upload mode rejected file should not be persisted: ${JSON.stringify(rejectedModeMatches).slice(0, 500)}`);
    centralUploadedFile = await waitForMedia(marker, (item) => (
      item.originalName === centralUploadName &&
      (item.type === 'document' || item.type === 'file') &&
      item.visibility === 'public'
    ));
    mediaIds.push(centralUploadedFile.id);
    fontSmokeResult = await uploadFontThroughUiAndAssert(client, {
      uploadPath: fontUploadPath,
      uploadName: fontUploadName,
      marker,
      family: fontFamily,
      weight: fontWeight,
      style: fontStyle,
      display: fontDisplay,
      fallback: fontFallback,
    });
    fontUploadedFile = fontSmokeResult.uploadedFont;
    mediaIds.push(fontUploadedFile.id);
    fontUploadedFile = await updateMedia(fontUploadedFile.id, { visibility: 'private' });
    const privateFontPreview = await assertPrivateFontPreview(client, {
      fontId: fontUploadedFile.id,
      fontName: fontUploadName,
      family: fontFamily,
    });
    assert(privateFontPreview.privateFont.visibility === 'private', 'Font preview smoke did not keep the font private.');
    await saveMediaStorageSettingsFromUi(client, suffix);
    const savedStorageSettings = await readSettings();
    assert(savedStorageSettings.integrations?.storage?.provider === 'supabase', 'Media storage provider was not persisted through the Media page.');
    assert(savedStorageSettings.integrations?.storage?.bucket === `media-${suffix}`, 'Media storage bucket was not persisted through the Media page.');
    assert(savedStorageSettings.integrations?.storage?.privateFilesEnabled === true, 'Media private file setting was not persisted through the Media page.');
    assert(savedStorageSettings.integrations?.storage?.imageTransformsEnabled === true, 'Media image transform setting was not persisted through the Media page.');
    assert(savedStorageSettings.integrations?.supabase?.projectRef === suffix, 'Media Supabase project ref was not persisted through the Media page.');
    assert(savedStorageSettings.integrations?.supabase?.storageEnabled === true, 'Media Supabase storage toggle was not persisted through the Media page.');
    await runMediaStorageCheck(client);
    await runMediaStorageProvisioningProbe(client);

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
    const versionsPayload = await requestApi(`/api/admin/sites/${SITE_ID}/media/${publicImage.id}/versions`);
    const retainedVersions = versionsPayload.data?.versions || [];
    assert(retainedVersions.length >= 1, 'Media versions endpoint did not return retained replacement history.');
    assert(versionsPayload.data?.pagination?.limit > 0, 'Media versions endpoint returned a non-positive page size.');
    const retainedOriginalVersion = retainedVersions.find((version) => version.originalName === imageName);
    assert(
      retainedOriginalVersion,
      `Media versions endpoint did not include the original image: ${JSON.stringify(retainedVersions).slice(0, 500)}`,
    );
    assert(retainedOriginalVersion.id, 'Media versions endpoint did not return a retained version id.');
    assert(
      versionsPayload.data?.source === 'database' || versionsPayload.data?.source === 'metadata',
      `Media versions endpoint did not report a valid source: ${JSON.stringify(versionsPayload.data).slice(0, 500)}`,
    );
    await recordProviderMetricsThroughDetails(client);
    const providerMetricImage = await waitForMedia(marker, (item) => (
      item.id === publicImage.id &&
      item.metadata?.providerDelivery?.totalRequests === 42 &&
      item.metadata?.providerDelivery?.bytesServed === 2048 &&
      item.metadata?.providerDelivery?.conversions === 3 &&
      item.metadata?.providerDelivery?.conversionValue === 120.5 &&
      item.metadata?.providerDelivery?.currency === 'USD' &&
      item.metadata?.providerDelivery?.attributionWindow === 'last-click' &&
      item.metadata?.providerDelivery?.source === 'media-smoke-cdn'
    ));
    assert(providerMetricImage.metadata.providerDelivery.reportingWindow === 'smoke-window', 'Provider metrics did not persist the reporting window.');
    await ingestProviderMetricsThroughApi(providerMetricImage);
    await waitForMedia(marker, (item) => (
      item.id === publicImage.id &&
      item.metadata?.providerDelivery?.totalRequests === 50 &&
      item.metadata?.providerDelivery?.bytesServed === 3072 &&
      item.metadata?.providerDelivery?.conversions === 5 &&
      item.metadata?.providerDelivery?.conversionValue === 166.25 &&
      item.metadata?.providerDelivery?.currency === 'USD' &&
      item.metadata?.providerDelivery?.attributionWindow === 'view-through-7d' &&
      item.metadata?.providerDelivery?.source === 'media-smoke-provider-ingest' &&
      item.metadata?.providerDelivery?.reportingWindow === 'automated-smoke-window' &&
      item.metadata?.providerDelivery?.ingestMode === 'increment' &&
      item.metadata?.providerDelivery?.matchedBy === 'storagePath'
    ));
    await navigateToMedia(client, marker);
    await waitForMediaPageAsset(client, replacementName);
    await assertProviderRoiDashboard(client);
    await openMediaDetails(client, replacementName);
    await compareAssetVersionThroughDetails(client);
    await restoreAssetVersionThroughDetails(client);
    const restoredImage = await waitForMedia(marker, (item) => (
      item.id === publicImage.id &&
      item.originalName === imageName &&
      Array.isArray(item.metadata?.replacementVersions) &&
      item.metadata.replacementVersions.length === 1 &&
      item.metadata.replacementVersions[0]?.originalName === replacementName
    ));
    assert(restoredImage.id === publicImage.id, 'Media version restore changed the stable asset id.');
    const versionsAfterRestorePayload = await requestApi(`/api/admin/sites/${SITE_ID}/media/${publicImage.id}/versions`);
    const retainedAfterRestore = versionsAfterRestorePayload.data?.versions || [];
    const retainedReplacementVersion = retainedAfterRestore.find((version) => version.originalName === replacementName);
    assert(retainedReplacementVersion?.id, `Media version restore did not retain the displaced replacement: ${JSON.stringify(retainedAfterRestore).slice(0, 500)}`);
    assert(
      !retainedAfterRestore.some((version) => version.id === retainedOriginalVersion.id),
      'Media version restore still returned the restored retained version as historical.',
    );
    await assertMediaActivityDetails(client, imageName);
    await prepareVariantsThroughDetails(client);
    const transformedImage = await waitForMedia(marker, (item) => (
      item.id === publicImage.id &&
      Array.isArray(item.metadata?.generatedTransforms?.variants) &&
      item.metadata.generatedTransforms.variants.length > 0
    ));
    assert(transformedImage.metadata.generatedTransforms.preparedBy === 'admin', 'UI transform preparation did not record the admin actor.');
    await assertMediaLibraryActivity(client, imageName);
    await setDetailsField(client, 'File name', renamedImageName);
    await setDetailsField(client, 'Focal X', 28);
    await setDetailsField(client, 'Focal Y', 72);
    await setDetailsField(client, 'Crop fit', 'contain');
    await setDetailsField(client, 'Aspect ratio', '16:9');
    await setDetailsField(client, 'Alt text', updatedAltText);
    await setDetailsField(client, 'Visibility', 'private');
    await saveDetails(client);
    const updatedImage = await waitForMedia(marker, (item) => (
      item.id === publicImage.id &&
      item.originalName === renamedImageName &&
      item.altText === updatedAltText &&
      item.visibility === 'private'
    ));
    assert(updatedImage.folderId === folderId, 'Media metadata save lost the folder assignment.');
    assert(updatedImage.filename === publicImage.filename, 'Media metadata rename should not rewrite the stored file path.');
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
    await closeMediaDetails(client);
    await releaseQuarantineThroughBulk(client);
    const releasedImage = await waitForMedia(marker, (item) => (
      item.id === publicImage.id &&
      item.visibility === 'private' &&
      item.metadata?.mediaSecurity?.status === 'clear'
    ));
    assert(releasedImage.metadata.mediaSecurity.previousStatus === 'quarantined', 'Media quarantine release did not preserve previous security status.');
    await navigateToMedia(client, marker);
    await waitForMediaPageAsset(client, privateName);

    await openMediaDetails(client, privateName);
    await generateSignedUrl(client);
    await closeMediaDetails(client);

    const deleteVersionPayload = await requestApi(`/api/admin/sites/${SITE_ID}/media/${publicImage.id}/versions/${retainedReplacementVersion.id}`, {
      method: 'DELETE',
    });
    assert(deleteVersionPayload.data?.deleted === true, 'Media retained version delete API did not report deletion.');
    assert(
      deleteVersionPayload.data?.source === 'database' || deleteVersionPayload.data?.source === 'metadata',
      `Media retained version delete API did not report a valid source: ${JSON.stringify(deleteVersionPayload.data).slice(0, 500)}`,
    );
    const versionsAfterDeletePayload = await requestApi(`/api/admin/sites/${SITE_ID}/media/${publicImage.id}/versions`);
    const retainedAfterDelete = versionsAfterDeletePayload.data?.versions || [];
    assert(
      !retainedAfterDelete.some((version) => version.id === retainedReplacementVersion.id),
      'Media versions endpoint still returned a deleted retained version.',
    );

    await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }).then((result) => {
      fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(result.data, 'base64'));
    });

    await deleteAssetThroughUi(client, privateName);
    await waitForMediaMissing(privateName);
    mediaIds.splice(mediaIds.indexOf(privateFile.id), 1);

    await deleteMedia(publicImage.id);
    mediaIds.splice(mediaIds.indexOf(publicImage.id), 1);
    await deleteMedia(childFolderFile.id);
    const childFolderFileIndex = mediaIds.indexOf(childFolderFile.id);
    if (childFolderFileIndex !== -1) {
      mediaIds.splice(childFolderFileIndex, 1);
    }
    if (centralUploadedFile) {
      await deleteMedia(centralUploadedFile.id);
      const centralUploadIndex = mediaIds.indexOf(centralUploadedFile.id);
      if (centralUploadIndex !== -1) {
        mediaIds.splice(centralUploadIndex, 1);
      }
      centralUploadedFile = null;
    }
    if (fontUploadedFile) {
      await deleteMedia(fontUploadedFile.id);
      const fontUploadIndex = mediaIds.indexOf(fontUploadedFile.id);
      if (fontUploadIndex !== -1) {
        mediaIds.splice(fontUploadIndex, 1);
      }
      fontUploadedFile = null;
    }
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
      deniedViewUi,
      deniedActivityUi,
      fontSmoke: fontSmokeResult ? {
        family: fontSmokeResult.uploadedFont.metadata?.fontFamily,
        weight: fontSmokeResult.uploadedFont.metadata?.fontWeight,
        style: fontSmokeResult.uploadedFont.metadata?.fontStyle,
        manifestVariantId: fontSmokeResult.manifest.variant.id,
      } : null,
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
