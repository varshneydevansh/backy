#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_SETTINGS_CDP_PORT || 9376);
const SCREENSHOT_PATH = process.env.BACKY_SETTINGS_SCREENSHOT || path.join(os.tmpdir(), 'backy-settings-smoke.png');
const STALE_ADMIN_API_KEY = 'sk_live_stale_settings_smoke_admin_key';
let apiAdminSessionToken = '';

const commerceWebhookSecretReference = (suffix) => `env:STRIPE_WEBHOOK_SECRET_${suffix.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
const shippingOriginAddressForSuffix = (suffix) => JSON.stringify({
  name: `Backy Warehouse ${suffix}`,
  street1: '100 Fulfillment Way',
  city: 'Austin',
  state: 'TX',
  zip: '78701',
  country: 'US',
  phone: '555-0100',
});
const shippingParcelForSuffix = (suffix) => JSON.stringify({
  length: 8,
  width: 6,
  height: 2,
  weight: 12,
  predefined_package: `parcel-${suffix}`,
});

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

const createWebhookCaptureServer = async () => {
  const requests = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      let body = {};
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        body = { rawBody };
      }
      requests.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body,
      });
      response.writeHead(204);
      response.end();
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  assert(address && typeof address === 'object', 'Webhook capture server did not expose a port');

  return {
    url: `http://127.0.0.1:${address.port}/settings-webhook`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
};

const requestApi = async (endpoint, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(endpoint.startsWith('/api/admin/') && apiAdminSessionToken ? { authorization: `Bearer ${apiAdminSessionToken}` } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(payload.error || payload).slice(0, 300)}`);
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

const readSettings = async (sessionToken = apiAdminSessionToken) => {
  const payload = await requestApi('/api/admin/settings', {
    headers: sessionToken ? { authorization: `Bearer ${sessionToken}` } : {},
  });
  assert(payload.data?.settings, 'Settings API returned no settings payload');
  return payload.data.settings;
};

const setAdminPermissionOverrides = async (overrides) => {
  await requestApi('/api/admin/users/user-admin/permissions', {
    method: 'PATCH',
    body: JSON.stringify({ overrides }),
  });
};

const assertSettingsApiForbidden = async (label, { method = 'POST', body } = {}) => {
  const response = await fetch(`${API_BASE_URL}/api/admin/settings`, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiAdminSessionToken}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => ({}));

  assert(response.status === 403, `${label} should reject denied permission with 403, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(payload?.error?.code === 'FORBIDDEN_PERMISSION', `${label} should return FORBIDDEN_PERMISSION: ${JSON.stringify(payload).slice(0, 500)}`);

  return {
    label,
    status: response.status,
    code: payload.error?.code,
  };
};

const assertAdminKeyRotationDenied = async () => {
  const response = await fetch(`${API_BASE_URL}/api/admin/settings`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiAdminSessionToken}`,
    },
    body: JSON.stringify({ action: 'regenerate-api-keys', scope: 'public' }),
  });
  const payload = await response.json().catch(() => ({}));

  assert(response.status === 403, `Admin without settings.manageKeys should not rotate API keys, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(payload?.error?.code === 'FORBIDDEN_PERMISSION', `Key rotation denial should return FORBIDDEN_PERMISSION: ${JSON.stringify(payload).slice(0, 500)}`);

  return {
    label: 'settings.manageKeys regenerate',
    status: response.status,
    code: payload.error?.code,
  };
};

const assertAdminApiKeyPatchDenied = async () => {
  const response = await fetch(`${API_BASE_URL}/api/admin/settings`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiAdminSessionToken}`,
    },
    body: JSON.stringify({
      apiKeys: {
        publicApiKey: 'should-not-persist-public-key',
        adminApiKey: 'should-not-persist-admin-key',
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));

  assert(response.status === 403, `Admin without settings.manageKeys should not patch API keys, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(payload?.error?.code === 'FORBIDDEN_PERMISSION', `API key patch denial should return FORBIDDEN_PERMISSION: ${JSON.stringify(payload).slice(0, 500)}`);

  return {
    label: 'settings.manageKeys patch',
    status: response.status,
    code: payload.error?.code,
  };
};

const assertSettingsPermissionDenials = async (settings) => {
  const deliveryMode = settings.deliveryMode === 'managed-hosting' ? 'custom-frontend' : 'managed-hosting';
  const currentDeliveryMode = settings.deliveryMode || 'managed-hosting';
  const permissionDenials = [];

  try {
    await setAdminPermissionOverrides({ 'settings.manageKeys': 'deny' });
    permissionDenials.push(await assertAdminKeyRotationDenied());
    permissionDenials.push(await assertAdminApiKeyPatchDenied());
  } finally {
    await setAdminPermissionOverrides({ 'settings.manageKeys': null });
  }

  try {
    await setAdminPermissionOverrides({ 'settings.view': 'deny' });
    permissionDenials.push(await assertSettingsApiForbidden('Denied settings.view GET', { method: 'GET' }));
  } finally {
    await setAdminPermissionOverrides({ 'settings.view': null });
  }

  try {
    await setAdminPermissionOverrides({ 'settings.configure': 'deny' });
    permissionDenials.push(await assertSettingsApiForbidden('Denied settings.configure PATCH', {
      method: 'PATCH',
      body: { deliveryMode },
    }));
    permissionDenials.push(await assertSettingsApiForbidden('Denied settings.configure infrastructure check', {
      method: 'POST',
      body: {
        action: 'validate-infrastructure',
        deliveryMode: currentDeliveryMode,
        integrations: settings.integrations || {},
      },
    }));
  } finally {
    await setAdminPermissionOverrides({ 'settings.configure': null });
  }

  try {
    await setAdminPermissionOverrides({ 'media.configure': 'deny' });
    permissionDenials.push(await assertSettingsApiForbidden('Denied media.configure storage PATCH', {
      method: 'PATCH',
      body: {
        integrations: {
          storage: {
            provider: 'local',
            bucket: 'denied-settings-smoke',
          },
        },
      },
    }));
    permissionDenials.push(await assertSettingsApiForbidden('Denied media.configure infrastructure check', {
      method: 'POST',
      body: {
        action: 'validate-infrastructure',
        deliveryMode: currentDeliveryMode,
        integrations: {
          storage: {
            provider: 'local',
            bucket: 'denied-settings-smoke',
          },
        },
      },
    }));
  } finally {
    await setAdminPermissionOverrides({ 'media.configure': null });
  }

  assert(permissionDenials.length === 7, `Settings permission denial coverage changed unexpectedly: ${JSON.stringify(permissionDenials).slice(0, 500)}`);
  return permissionDenials;
};

const restoreSettings = async (settings, options = {}) => {
  if (!settings) return;

  await requestApi('/api/admin/settings', {
    method: 'PATCH',
    headers: options.sessionToken ? { authorization: `Bearer ${options.sessionToken}` } : {},
    body: JSON.stringify({
      deliveryMode: settings.deliveryMode,
      auth: settings.auth,
      integrations: settings.integrations || {},
      ...(options.includeApiKeys && settings.apiKeys ? { apiKeys: settings.apiKeys } : {}),
    }),
  });
};

const createUser = async (input) => {
  const payload = await requestApi('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const user = payload.data?.user || payload.user;
  assert(user?.id, `Create settings owner user did not return a user: ${JSON.stringify(payload).slice(0, 500)}`);
  return user;
};

const createInviteToken = async (userId) => {
  const payload = await requestApi(`/api/admin/users/${userId}/invite-link`, {
    method: 'POST',
    body: JSON.stringify({ expiresInMinutes: 60 }),
  });
  const invite = payload.data?.invite || payload.invite;
  assert(invite?.token, `Invite link endpoint did not return a token: ${JSON.stringify(payload).slice(0, 500)}`);
  return invite;
};

const acceptInviteToken = async (token) => {
  const payload = await requestApi('/api/admin/auth/accept-invite', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  const session = payload.data?.session;
  const user = payload.data?.user;
  assert(session?.token && user?.id, `Invite accept did not return an owner session: ${JSON.stringify(payload).slice(0, 500)}`);
  return { session, user };
};

const deleteUser = async (userId) => {
  if (!userId) return;
  await requestApi(`/api/admin/users/${userId}`, { method: 'DELETE' });
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

const authStorageScript = (
  sessionToken,
  user = { id: 'user-admin', email: 'admin@backy.io', fullName: 'Admin User', role: 'admin' },
) => `
localStorage.setItem('backy-auth-storage', ${JSON.stringify(JSON.stringify({
  state: {
    user,
    session: {
      token: sessionToken,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      authMode: 'local-demo',
    },
  },
  version: 0,
}))});
localStorage.setItem('backy-db', ${JSON.stringify(JSON.stringify({
  state: {
    settings: {
      deliveryMode: 'managed-hosting',
      apiKeys: {
        publicApiKey: 'pk_live_stale_settings_smoke_public_key',
        adminApiKey: STALE_ADMIN_API_KEY,
      },
    },
  },
  version: 0,
}))});
`;

const setBrowserSession = async (client, sessionToken, user) => {
  const state = await evaluate(client, `(() => {
    ${authStorageScript(sessionToken, user)}
    return {
      userEmail: ${JSON.stringify(user.email)},
      hasToken: Boolean(JSON.parse(localStorage.getItem('backy-auth-storage') || '{}')?.state?.session?.token),
    };
  })()`);
  assert(state.hasToken, `Unable to seed browser session: ${JSON.stringify(state)}`);
  return state;
};

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

const navigateToSettings = async (client) => {
  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}/settings` });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="settings-command-center"]')),
      ownershipMap: Boolean(document.querySelector('[data-testid="settings-platform-ownership-map"]')),
      hasBackyOwner: document.body?.innerText?.includes('Backy in-house') || false,
      hasSupabaseOwner: document.body?.innerText?.includes('Supabase connection') || false,
      hasVercelOwner: document.body?.innerText?.includes('Vercel connection') || false,
      tabs: Boolean(document.querySelector('#settings-tabs')),
      title: document.body?.innerText?.includes('Settings command center') || false,
      handoff: document.body?.innerText?.includes('Copy handoff') || false,
      settingsLoaded: performance.getEntriesByType('resource').some((entry) => (
        String(entry.name).includes('/api/admin/settings') && entry.responseEnd > 0
      )),
      fallbackNotice: document.body?.innerText?.includes('Using local fallback settings') || false,
      body: document.body?.innerText?.slice(0, 300) || '',
    }))()`);

    if (
      state.ready &&
      state.ownershipMap &&
      state.hasBackyOwner &&
      state.hasSupabaseOwner &&
      state.hasVercelOwner &&
      state.tabs &&
      state.title &&
      state.handoff &&
      state.settingsLoaded &&
      !state.fallbackNotice
    ) {
      await sleep(150);
      return state;
    }

    if (attempt === 99) {
      throw new Error(`Settings page did not render expected controls: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const clickByText = async (client, text) => {
  const result = await evaluate(client, `(() => {
    const text = ${JSON.stringify(text)};
    const candidates = Array.from(document.querySelectorAll('button, a, label'));
    const target = candidates.find((candidate) => (candidate.textContent || '').trim().includes(text));
    if (!(target instanceof HTMLElement)) {
      return { ok: false, text };
    }
    target.click();
    return { ok: true, text: target.textContent || '', tag: target.tagName };
  })()`);
  assert(result.ok, `Unable to click control with text ${text}: ${JSON.stringify(result)}`);
  await sleep(150);
  return result;
};

const clickByTestId = async (client, testId) => {
  const result = await evaluate(client, `(() => {
    const testId = ${JSON.stringify(testId)};
    const target = document.querySelector(${JSON.stringify(`[data-testid="${testId}"]`)});
    if (!(target instanceof HTMLElement)) {
      return { ok: false, testId, body: document.body?.innerText?.slice(0, 500) || '' };
    }
    if (target instanceof HTMLButtonElement && target.disabled) {
      return { ok: false, testId, reason: 'button-disabled', text: target.textContent || '' };
    }
    target.click();
    return { ok: true, testId, text: target.textContent || '', tag: target.tagName };
  })()`);
  assert(result.ok, `Unable to click ${testId}: ${JSON.stringify(result)}`);
  await sleep(150);
  return result;
};

const waitForText = async (client, text) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      hasText: document.body?.innerText?.includes(${JSON.stringify(text)}) || false,
      body: document.body?.innerText?.slice(0, 1200) || '',
    }))()`);
    if (state.hasText) {
      return state;
    }
    await sleep(150);
  }

  throw new Error(`Timed out waiting for text ${text}`);
};

const openSettingsTab = async (client, label, expectedQuery) => {
  await clickByText(client, label);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      search: window.location.search,
      text: document.querySelector('#settings-tab-content')?.textContent || '',
    }))()`);

    if (state.search.includes(expectedQuery) && state.text.trim().length > 0) {
      return state;
    }

    if (attempt === 59) {
      throw new Error(`Settings tab ${label} did not become active: ${JSON.stringify(state)}`);
    }

    await sleep(100);
  }

  return null;
};

const setLabeledControl = async (client, labelText, value, options = {}) => {
  const result = await evaluate(client, `(() => {
    const labelText = ${JSON.stringify(labelText)};
    const value = ${JSON.stringify(value)};
    const exact = ${JSON.stringify(Boolean(options.exact))};
    const labels = Array.from(document.querySelectorAll('label'));
    const normalized = (text) => (text || '').replace(/\\s+/g, ' ').trim();
    const label = labels.find((candidate) => {
      const text = normalized(candidate.textContent);
      return exact ? text === labelText : text.includes(labelText);
    });
    if (!(label instanceof HTMLLabelElement)) {
      return { ok: false, reason: 'label-not-found', labelText };
    }
    const control = label.querySelector('input, select, textarea') || (
      label.htmlFor ? document.getElementById(label.htmlFor) : null
    );
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) {
      return { ok: false, reason: 'control-not-found', labelText, text: normalized(label.textContent) };
    }
    if (control.disabled) {
      return { ok: false, reason: 'control-disabled', labelText };
    }
    if (control instanceof HTMLInputElement && control.type === 'checkbox') {
      if (control.checked !== Boolean(value)) {
        control.click();
      }
      return { ok: true, labelText, type: control.type, value: control.checked };
    }
    if (control instanceof HTMLInputElement && control.type === 'radio') {
      if (!control.checked) {
        control.click();
      }
      return { ok: true, labelText, type: control.type, value: control.checked };
    }
    const shouldType = control instanceof HTMLTextAreaElement || (
      control instanceof HTMLInputElement &&
      ['text', 'url', 'number', 'search', 'email', 'password', 'color'].includes(control.type || 'text')
    );
    if (shouldType) {
      control.focus();
      const previousValue = control.value;
      if (control instanceof HTMLInputElement) {
        control.select();
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(control, String(value));
        control._valueTracker?.setValue?.(previousValue);
        control.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          inputType: 'insertReplacementText',
          data: String(value),
        }));
        control.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (control instanceof HTMLTextAreaElement) {
        control.select();
        control.setRangeText(String(value), 0, previousValue.length, 'end');
        control._valueTracker?.setValue?.(previousValue);
        control.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          inputType: 'insertReplacementText',
          data: String(value),
        }));
        control.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return { ok: true, labelText, type: control.tagName, value: control.value };
    }
    const prototype = control instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : control instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    const previousValue = control.value;
    descriptor?.set?.call(control, String(value));
    control._valueTracker?.setValue?.(previousValue);
    if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
      control.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(value) }));
    } else {
      control.dispatchEvent(new Event('input', { bubbles: true }));
    }
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, labelText, type: control.tagName, value: control.value };
  })()`);

  assert(result.ok, `Unable to set ${labelText}: ${JSON.stringify(result)}`);
  await sleep(180);
  return result;
};

const assertTwoFactorAvailable = async (client) => {
  const state = await evaluate(client, `(() => {
    const normalized = (text) => (text || '').replace(/\\s+/g, ' ').trim();
    const label = Array.from(document.querySelectorAll('label')).find((candidate) => (
      normalized(candidate.textContent).includes('Require two-factor authentication')
    ));
    const control = label?.querySelector('input[type="checkbox"]');
    return {
      found: Boolean(label),
      disabled: control instanceof HTMLInputElement ? control.disabled : false,
      checked: control instanceof HTMLInputElement ? control.checked : null,
      text: normalized(label?.textContent),
      title: control instanceof HTMLInputElement ? control.title : '',
    };
  })()`);

  assert(
    state.found && !state.disabled && state.checked === false && /MFA code|TOTP secret/i.test(state.text),
    `Require 2FA should be available now that login enforcement exists: ${JSON.stringify(state)}`,
  );
  return state;
};

const setDeliveryMode = async (client, mode) => {
  const result = await evaluate(client, `(() => {
    const radio = document.querySelector('input[name="delivery-mode"][value="${mode}"]');
    if (!(radio instanceof HTMLInputElement)) {
      return { ok: false, reason: 'radio-not-found' };
    }
    if (!radio.checked) {
      radio.click();
    }
    return { ok: true, checked: radio.checked };
  })()`);
  assert(result.ok, `Unable to set delivery mode ${mode}: ${JSON.stringify(result)}`);
  await sleep(120);
  return result;
};

const saveSettings = async (client) => {
  const clicked = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => {
      const text = candidate.textContent || '';
      return text.includes('Save changes') || text.includes('Saving...');
    });
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'button-not-found', body: document.body?.innerText?.slice(0, 300) || '' };
    }
    if (button.disabled) {
      return { ok: false, reason: 'button-disabled', text: button.textContent || '' };
    }
    button.click();
    return { ok: true, text: button.textContent || '' };
  })()`);
  assert(clicked.ok, `Save changes button was not ready: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const saveButton = Array.from(document.querySelectorAll('button')).find((candidate) => {
        const text = candidate.textContent || '';
        return text.includes('Saved') || text.includes('No changes') || text.includes('Save changes') || text.includes('Saving...');
      });
      return {
        text: saveButton?.textContent || '',
        disabled: saveButton instanceof HTMLButtonElement ? saveButton.disabled : null,
        warning: document.body?.innerText?.includes('Backend save failed') || false,
      };
    })()`);

    assert(!state.warning, `Settings save reported a backend failure: ${JSON.stringify(state)}`);
    if (state.text.includes('Saved') || state.text.includes('No changes')) {
      return state;
    }

    if (attempt === 99) {
      throw new Error(`Settings did not finish saving: ${JSON.stringify(state)}`);
    }

    await sleep(150);
  }

  return null;
};

const assertOwnerCanRotateApiKeyThroughUi = async (client, ownerSession, ownerOriginalSettings, adminPreloadIdentifier) => {
  assert(ownerSession?.session?.token && ownerSession?.user?.id, 'Owner session is required for API key rotation coverage.');

  if (adminPreloadIdentifier) {
    await client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: adminPreloadIdentifier });
  }
  await client.send('Page.addScriptToEvaluateOnNewDocument', {
    source: authStorageScript(ownerSession.session.token, ownerSession.user),
  });
  await setBrowserSession(client, ownerSession.session.token, ownerSession.user);
  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}/settings?tab=security` });

  let securityState = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    securityState = await evaluate(client, `(() => ({
      search: window.location.search,
      adminKeyStatus: document.querySelector('[data-testid="settings-api-key-status-admin"]')?.textContent?.trim() || '',
      publicKeyStatus: document.querySelector('[data-testid="settings-api-key-status-public"]')?.textContent?.trim() || '',
      hasRotationButton: Boolean(document.querySelector('[data-testid="settings-api-key-regenerate-public"]')),
      publicButtonDisabled: document.querySelector('[data-testid="settings-api-key-regenerate-public"]')?.disabled ?? true,
      hiddenAdminKey: document.body?.innerText?.includes('Hidden without settings.manageKeys') || false,
      body: document.body?.innerText?.slice(0, 1000) || '',
    }))()`);
    if (
      securityState.search.includes('tab=security') &&
      securityState.adminKeyStatus === 'Active' &&
      securityState.publicKeyStatus === 'Active' &&
      securityState.hasRotationButton &&
      !securityState.publicButtonDisabled &&
      !securityState.hiddenAdminKey
    ) {
      break;
    }
    if (attempt === 99) {
      throw new Error(`Owner security tab did not expose key rotation controls: ${JSON.stringify(securityState)}`);
    }
    await sleep(250);
  }

  const before = await readSettings(ownerSession.session.token);
  const beforePublicKey = before.apiKeys?.publicApiKey || '';
  const beforeAdminKey = before.apiKeys?.adminApiKey || '';
  assert(beforePublicKey && beforeAdminKey, `Owner should be able to read both keys before rotation: ${JSON.stringify(before.apiKeys)}`);

  const serviceKeyLabel = `Settings smoke server key ${Date.now()}`;
  await setLabeledControl(client, 'New key label', serviceKeyLabel);
  await clickByTestId(client, 'settings-admin-service-key-issue');
  await waitForText(client, 'Copy this key now');
  const issuedServiceKeyState = await evaluate(client, `(() => {
    const panel = document.querySelector('[data-testid="settings-admin-service-key-issued"]');
    const text = panel?.innerText || '';
    const match = text.match(/sk_srv_[a-z0-9]+/i);
    return {
      rawKey: match?.[0] || '',
      text,
      hasHashNotice: text.includes('stores only the hash'),
    };
  })()`);
  assert(
    issuedServiceKeyState.rawKey && issuedServiceKeyState.hasHashNotice,
    `Issued service key was not rendered once with hash notice: ${JSON.stringify(issuedServiceKeyState).slice(0, 1000)}`,
  );

  const afterIssue = await readSettings(ownerSession.session.token);
  const issuedGrant = (afterIssue.auth?.apiKeyServiceKeys || []).find((entry) => entry.label === serviceKeyLabel);
  assert(
    issuedGrant?.id &&
      issuedGrant.status === 'active' &&
      issuedGrant.keyFingerprint &&
      !JSON.stringify(issuedGrant).includes('keyHash'),
    `Issued service key metadata was not persisted safely: ${JSON.stringify(afterIssue.auth?.apiKeyServiceKeys).slice(0, 1000)}`,
  );
  const serviceKeyAccepted = await fetch(`${API_BASE_URL}/api/admin/settings`, {
    headers: {
      'x-backy-admin-key': issuedServiceKeyState.rawKey,
    },
  });
  const serviceKeyAcceptedPayload = await serviceKeyAccepted.json().catch(() => ({}));
  assert(
    serviceKeyAccepted.ok && serviceKeyAcceptedPayload?.data?.settings,
    `Issued service key should authenticate admin settings reads: ${serviceKeyAccepted.status} ${JSON.stringify(serviceKeyAcceptedPayload).slice(0, 500)}`,
  );
  const afterServiceUse = await readSettings(ownerSession.session.token);
  const usedGrant = (afterServiceUse.auth?.apiKeyServiceKeys || []).find((entry) => entry.id === issuedGrant.id);
  assert(
    usedGrant?.lastUsedAt &&
      (usedGrant.permissionScope === 'non-owner-admin' || !usedGrant.permissionScope),
    `Issued service key usage metadata was not persisted: ${JSON.stringify(usedGrant).slice(0, 1000)}`,
  );

  await clickByTestId(client, `settings-admin-service-key-revoke-${issuedGrant.id}`);
  await waitForText(client, 'Admin API key revoked.');
  const afterServiceRevoke = await readSettings(ownerSession.session.token);
  const revokedGrant = (afterServiceRevoke.auth?.apiKeyServiceKeys || []).find((entry) => entry.id === issuedGrant.id);
  const serviceRevocation = afterServiceRevoke.auth?.apiKeyRevocationHistory?.find((entry) => (
    entry.reason === 'manual' && entry.revokedKeyFingerprint === issuedGrant.keyFingerprint
  ));
  assert(
    revokedGrant?.status === 'revoked' &&
      revokedGrant.revokedAt &&
      serviceRevocation?.keyType === 'admin' &&
      serviceRevocation.reason === 'manual',
    `Issued service key was not revoked with history: ${JSON.stringify({ revokedGrant, serviceRevocation }).slice(0, 1000)}`,
  );
  const serviceKeyRejected = await fetch(`${API_BASE_URL}/api/admin/settings`, {
    headers: {
      'x-backy-admin-key': issuedServiceKeyState.rawKey,
    },
  });
  assert(
    serviceKeyRejected.status === 401,
    `Revoked service key should stop authenticating admin settings reads, got ${serviceKeyRejected.status}`,
  );

  await clickByTestId(client, 'settings-api-key-regenerate-public');
  await waitForText(client, 'Regenerate the public API key?');
  await clickByTestId(client, 'settings-api-key-rotation-confirm');

  let after = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    after = await readSettings(ownerSession.session.token);
    if (after.apiKeys?.publicApiKey && after.apiKeys.publicApiKey !== beforePublicKey) {
      break;
    }
    if (attempt === 99) {
      throw new Error(`Public API key did not rotate: ${JSON.stringify(after.apiKeys)}`);
    }
    await sleep(250);
  }

  assert(
    after.apiKeys.adminApiKey === beforeAdminKey,
    `Public-key rotation should not rotate the admin key: ${JSON.stringify({ before: before.apiKeys, after: after.apiKeys })}`,
  );
  const latestRotation = after.auth?.apiKeyRotationHistory?.[0];
  const latestRevocation = after.auth?.apiKeyRevocationHistory?.[0];
  assert(
    latestRotation?.scope === 'public' &&
      latestRotation.publicKeyChanged === true &&
      latestRotation.adminKeyChanged === false &&
      latestRotation.previousPublicKeyFingerprint &&
      latestRotation.newPublicKeyFingerprint &&
      latestRotation.previousPublicKeyFingerprint !== latestRotation.newPublicKeyFingerprint &&
      latestRotation.previousAdminKeyFingerprint === latestRotation.newAdminKeyFingerprint,
    `Public-key rotation history was not persisted correctly: ${JSON.stringify(after.auth?.apiKeyRotationHistory).slice(0, 1000)}`,
  );
  assert(
    latestRevocation?.scope === 'public' &&
      latestRevocation.keyType === 'public' &&
      latestRevocation.reason === 'rotated' &&
      latestRevocation.revokedKeyFingerprint === latestRotation.previousPublicKeyFingerprint &&
      latestRevocation.replacementKeyFingerprint === latestRotation.newPublicKeyFingerprint,
    `Public-key revocation history was not persisted correctly: ${JSON.stringify(after.auth?.apiKeyRevocationHistory).slice(0, 1000)}`,
  );

  let auditState = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    auditState = await evaluate(client, `(() => {
      const body = document.body?.innerText || '';
      return {
        hasAudit: body.includes('API keys regenerated') && body.includes('Regenerated public API key.'),
        hasRotationHistory: body.includes('API key rotation history') &&
          body.includes('public key') &&
          body.includes(${JSON.stringify(latestRotation.newPublicKeyFingerprint)}),
        hasRevocationHistory: body.includes('API key revocation history') &&
          body.includes('public key revoked') &&
          body.includes(${JSON.stringify(latestRevocation.revokedKeyFingerprint)}),
        body: body.slice(0, 1800),
      };
    })()`);
    if (auditState.hasAudit && auditState.hasRotationHistory && auditState.hasRevocationHistory) break;
    await sleep(250);
  }
  assert(auditState?.hasAudit, `API key rotation audit event did not render: ${JSON.stringify(auditState)}`);
  assert(auditState?.hasRotationHistory, `API key rotation history did not render: ${JSON.stringify(auditState)}`);
  assert(auditState?.hasRevocationHistory, `API key revocation history did not render: ${JSON.stringify(auditState)}`);

  const beforeSessionToken = ownerSession.session.token;
  await clickByTestId(client, 'settings-session-rotate');
  await waitForText(client, 'Current session rotated.');
  const rotatedSessionState = await evaluate(client, `(() => {
    const raw = localStorage.getItem('backy-auth-storage') || '{}';
    const parsed = JSON.parse(raw);
    const session = parsed?.state?.session || null;
    const panel = document.querySelector('[data-testid="settings-session-rotation"]');
    const text = panel?.textContent || '';
    return {
      hasPanel: Boolean(panel),
      hasNotice: text.includes('Current session rotated.'),
      token: session?.token || '',
      issuedAt: session?.issuedAt || '',
      expiresAt: session?.expiresAt || '',
      authMode: session?.authMode || '',
    };
  })()`);
  assert(
    rotatedSessionState.hasPanel &&
      rotatedSessionState.hasNotice &&
      rotatedSessionState.token &&
      rotatedSessionState.token !== beforeSessionToken,
    `Current session did not rotate through Settings UI: ${JSON.stringify(rotatedSessionState)}`,
  );
  ownerSession.session = {
    ...ownerSession.session,
    token: rotatedSessionState.token,
    issuedAt: rotatedSessionState.issuedAt,
    expiresAt: rotatedSessionState.expiresAt,
    authMode: rotatedSessionState.authMode,
  };
  const oldSessionResponse = await fetch(`${API_BASE_URL}/api/admin/settings`, {
    headers: {
      authorization: `Bearer ${beforeSessionToken}`,
    },
  });
  assert(
    oldSessionResponse.status === 401,
    `Rotated session should revoke the previous token, got ${oldSessionResponse.status}`,
  );

  const filterState = await evaluate(client, `(() => {
    const select = document.querySelector('[data-testid="settings-audit-filter"]');
    if (!(select instanceof HTMLSelectElement)) {
      return { ok: false, reason: 'filter-missing', body: document.body?.innerText?.slice(0, 1000) || '' };
    }
    const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    descriptor?.set?.call(select, 'auth');
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: select.value };
  })()`);
  assert(filterState.ok && filterState.value === 'auth', `Unable to select auth audit filter: ${JSON.stringify(filterState)}`);

  let authAuditState = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    authAuditState = await evaluate(client, `(() => {
      const body = document.body?.innerText || '';
      return {
        hasAuthFilter: body.includes('Auth events'),
        hasAuthEvent: body.includes('Admin login accepted'),
        hasAuthDescription: body.includes('admin@backy.io signed in with local-demo'),
        hasSessionRotation: body.includes('Admin session rotated') &&
          body.includes('rotated local-demo session'),
        body: body.slice(0, 1800),
      };
    })()`);
    if (
      authAuditState.hasAuthFilter &&
      authAuditState.hasAuthEvent &&
      authAuditState.hasAuthDescription &&
      authAuditState.hasSessionRotation
    ) break;
    await sleep(250);
  }
  assert(
    authAuditState?.hasAuthFilter &&
      authAuditState?.hasAuthEvent &&
      authAuditState?.hasAuthDescription &&
      authAuditState?.hasSessionRotation,
    `Auth audit filter did not render login event: ${JSON.stringify(authAuditState)}`,
  );
  await clickByTestId(client, 'settings-audit-view-detail');
  const authDetailState = await evaluate(client, `(() => {
    const detail = document.querySelector('[data-testid="settings-audit-detail"]');
    const text = detail?.textContent || '';
    return {
      hasDetail: Boolean(detail),
      hasPayload: text.includes('Audit event detail') &&
        text.includes('auth.session.rotate') &&
        text.includes(${JSON.stringify(ownerSession.user.email)}) &&
        text.includes('local-demo'),
      text: text.slice(0, 1200),
    };
  })()`);
  assert(authDetailState.hasDetail && authDetailState.hasPayload, `Auth audit detail did not expose payload: ${JSON.stringify(authDetailState)}`);

  assert(
    ownerOriginalSettings.apiKeys?.publicApiKey === beforePublicKey &&
      ownerOriginalSettings.apiKeys?.adminApiKey === beforeAdminKey,
    `Owner original settings snapshot did not capture the pre-rotation keys: ${JSON.stringify(ownerOriginalSettings.apiKeys)}`,
  );

  return {
    publicKeyRotated: after.apiKeys.publicApiKey !== beforePublicKey,
    adminKeyPreserved: after.apiKeys.adminApiKey === beforeAdminKey,
    serviceKeyIssued: true,
    serviceKeyRevoked: true,
    sessionRotated: true,
    rotationHistoryPersisted: true,
    revocationHistoryPersisted: true,
    auditRendered: true,
    authAuditFilterRendered: true,
  };
};

const updateSettingsThroughUi = async (client, suffix, originalSettings, notificationWebhookUrl) => {
  const initial = await navigateToSettings(client);

  await openSettingsTab(client, 'Delivery', 'tab=delivery');
  const delivery = await setDeliveryMode(client, 'custom-frontend');

  await openSettingsTab(client, 'General', 'tab=general');
  const originalSiteName = originalSettings?.integrations?.general?.siteName || 'My Website';
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const loaded = await evaluate(client, `(() => ({
      siteName: document.querySelector('#settings-site-name')?.value || '',
    }))()`);
    if (loaded.siteName === originalSiteName) {
      break;
    }
    if (attempt === 79) {
      throw new Error(`General settings did not finish backend hydration: ${JSON.stringify(loaded)}`);
    }
    await sleep(100);
  }
  await setLabeledControl(client, 'Site Name', `Backy Smoke ${suffix}`);
  await setLabeledControl(client, 'Site Description', `Settings smoke coverage ${suffix}`);
  await setLabeledControl(client, 'Timezone', 'America/New_York');
  const generalState = await evaluate(client, `(() => ({
    siteName: document.querySelector('#settings-site-name')?.value || '',
    siteDescription: document.querySelector('#settings-site-description')?.value || '',
    timezone: document.querySelector('#settings-timezone')?.value || '',
  }))()`);
  assert(
    generalState.siteName === `Backy Smoke ${suffix}` &&
    generalState.siteDescription === `Settings smoke coverage ${suffix}` &&
    generalState.timezone === 'America/New_York',
    `General settings controls did not accept input: ${JSON.stringify(generalState)}`,
  );

  await openSettingsTab(client, 'Appearance', 'tab=appearance');
  await setLabeledControl(client, 'Primary', '#0f766e');
  await setLabeledControl(client, 'Secondary', '#7c3aed');
  await setLabeledControl(client, 'Base font size', '17');
  await setLabeledControl(client, 'Corner radius', '8');
  await setLabeledControl(client, 'Motion preset', 'subtle');

  await openSettingsTab(client, 'SEO', 'tab=seo');
  await setLabeledControl(client, 'Default Title Template', `%s | Backy Smoke ${suffix}`);
  await setLabeledControl(client, 'Default Meta Description', `Smoke-tested SEO defaults ${suffix}`);
  await setLabeledControl(client, 'Default Keywords', 'backy, smoke, cms');
  await setLabeledControl(client, 'Analytics ID', `G-SMOKE${suffix.toUpperCase()}`);

  await openSettingsTab(client, 'Infrastructure', 'tab=infrastructure');
  await setLabeledControl(client, 'Provider', 'supabase');
  await setLabeledControl(client, 'Bucket', `media-${suffix}`);
  await setLabeledControl(client, 'Public base URL', `https://${suffix}.supabase.co/storage/v1/object/public/media`);
  await setLabeledControl(client, 'Path prefix', 'sites/{siteId}');
  await setLabeledControl(client, 'Supabase key secret ref', 'env:BACKY_SUPABASE_SERVICE_ROLE_KEY');
  await setLabeledControl(client, 'S3 access key secret ref', 'env:BACKY_S3_ACCESS_KEY_ID');
  await setLabeledControl(client, 'S3 secret access key ref', 'env:BACKY_S3_SECRET_ACCESS_KEY');
  await setLabeledControl(client, 'Private files', true);
  await setLabeledControl(client, 'Image transforms', true);
  await setLabeledControl(client, 'Max upload size (MB)', '128');
  await setLabeledControl(client, 'Workspace storage limit (GB)', '512');
  await setLabeledControl(client, 'Storage warning threshold (%)', '85');
  await setLabeledControl(client, 'Allowed file types', 'image/*,font/*,application/pdf,.zip');
  await setLabeledControl(client, 'Project URL', `https://${suffix}.supabase.co`);
  await setLabeledControl(client, 'Project ref', suffix);
  await setLabeledControl(client, 'Database', true, { exact: true });
  await setLabeledControl(client, 'Storage', true, { exact: true });
  await setLabeledControl(client, 'Auth', true, { exact: true });
  await setLabeledControl(client, 'Project ID', `prj_${suffix}`);
  await setLabeledControl(client, 'Team slug', `team-${suffix}`);
  await setLabeledControl(client, 'Production domain', `${suffix}.vercel.app`);
  await setLabeledControl(client, 'Auto deploy', true);
  await setLabeledControl(client, 'Preview deploys', true);

  const infrastructureState = await evaluate(client, `(() => ({
    search: window.location.search,
    text: document.querySelector('#settings-tab-content')?.textContent?.slice(0, 500) || '',
    hasEnvContract: document.body?.innerText?.includes('Environment contract') || document.body?.innerText?.includes('Copy the environment contract'),
    hasEnvValidationMatrix: Boolean(document.querySelector('[data-testid="settings-env-validation-matrix"]')),
    hasMediaScannerRuntime: document.body?.innerText?.includes('Media scanner runtime') || false,
    hasNotificationRuntime: document.body?.innerText?.includes('Notification runtime') || false,
    hasCommerceRuntime: document.body?.innerText?.includes('Commerce runtime') || false,
    hasCommerceWebhookSecretEnv: document.body?.innerText?.includes('Commerce webhook signing secret') || false,
    hasStripeApiEnv: document.body?.innerText?.includes('Payment provider API key') || false,
    hasStripeApiBaseEnv: document.body?.innerText?.includes('Stripe API base URL') || false,
    hasEasyPostLabelEnv: document.body?.innerText?.includes('EasyPost label API key') || false,
    hasStorageSecretRefs: document.body?.innerText?.includes('Storage credentials stay in deployment env') || false,
    hasInfrastructureCheck: document.body?.innerText?.includes('Run infrastructure check') || false,
  }))()`);
  assert(infrastructureState.search.includes('tab=infrastructure'), `Infrastructure tab search state was not persisted: ${JSON.stringify(infrastructureState)}`);
  assert(infrastructureState.hasEnvContract, `Infrastructure env contract was not visible: ${JSON.stringify(infrastructureState)}`);
  assert(
    infrastructureState.hasEnvValidationMatrix &&
    infrastructureState.hasMediaScannerRuntime &&
    infrastructureState.hasNotificationRuntime &&
    infrastructureState.hasCommerceRuntime &&
    infrastructureState.hasCommerceWebhookSecretEnv &&
    infrastructureState.hasStripeApiEnv &&
    infrastructureState.hasStripeApiBaseEnv &&
    infrastructureState.hasEasyPostLabelEnv &&
    infrastructureState.hasStorageSecretRefs,
    `Infrastructure environment validation did not expose broader runtime coverage: ${JSON.stringify(infrastructureState)}`,
  );
  assert(infrastructureState.hasInfrastructureCheck, `Infrastructure check control was not visible: ${JSON.stringify(infrastructureState)}`);
  await clickByText(client, 'Run infrastructure check');
  await waitForText(client, 'Infrastructure check results');
  const checkState = await evaluate(client, `(() => ({
    hasSupabase: document.body?.innerText?.includes('Supabase connection') || false,
    hasVercel: document.body?.innerText?.includes('Vercel deployment') || false,
    hasMediaScanner: document.body?.innerText?.includes('Media scanner') || false,
    hasNotificationDelivery: document.body?.innerText?.includes('Notification delivery') || false,
    hasCommerceSecrets: document.body?.innerText?.includes('Commerce webhook secrets') || false,
    hasStripeApiExecution: document.body?.innerText?.includes('Stripe API execution') || false,
    hasEasyPostLabelExecution: document.body?.innerText?.includes('EasyPost label execution') || false,
    hasBlocked: document.body?.innerText?.includes('blocked') || false,
    hasDeploymentHistory: document.querySelector('[data-testid="settings-deployment-history"]')?.textContent?.includes('Deployment history') || false,
    hasRecordedDeploymentCheck: document.querySelector('[data-testid="settings-deployment-history"]')?.textContent?.includes('recorded') || false,
    body: document.querySelector('#settings-tab-content')?.textContent?.slice(0, 1200) || '',
  }))()`);
  assert(
    checkState.hasSupabase &&
      checkState.hasVercel &&
      checkState.hasMediaScanner &&
      checkState.hasNotificationDelivery &&
      checkState.hasCommerceSecrets &&
      checkState.hasStripeApiExecution &&
      checkState.hasEasyPostLabelExecution,
    `Infrastructure check did not show provider diagnostics: ${JSON.stringify(checkState)}`,
  );
  assert(
    checkState.hasDeploymentHistory && checkState.hasRecordedDeploymentCheck,
    `Infrastructure check did not record deployment history: ${JSON.stringify(checkState)}`,
  );

  await openSettingsTab(client, 'Commerce', 'tab=commerce');
  await setLabeledControl(client, 'Commerce mode', 'checkout-provider');
  await setLabeledControl(client, 'Default currency', 'EUR');
  await setLabeledControl(client, 'Payment provider', 'stripe');
  await setLabeledControl(client, 'Provider account ID', `acct_${suffix}`);
  await setLabeledControl(client, 'Provider mode', 'live');
  await setLabeledControl(client, 'Provider webhook URL', `https://hooks.example.com/commerce/${suffix}`);
  await setLabeledControl(client, 'Webhook secret reference', commerceWebhookSecretReference(suffix));
  await setLabeledControl(client, 'Webhook event allowlist', 'checkout.session.completed,charge.refunded');
  await setLabeledControl(client, 'Reconciliation mode', 'webhook');
  await setLabeledControl(client, 'Reconciliation window', '36');
  await setLabeledControl(client, 'Success redirect path', '/checkout/complete');
  await setLabeledControl(client, 'Cancel redirect path', '/checkout/cancelled');
  await setLabeledControl(client, 'Guest checkout', true);
  await setLabeledControl(client, 'Taxes', true);
  await setLabeledControl(client, 'Shipping', true);
  await setLabeledControl(client, 'Discounts', true);
  await setLabeledControl(client, 'Inventory reservations', true);
  await setLabeledControl(client, 'Reservation window', '30');
  await setLabeledControl(client, 'Standard tax rate', '9.75');
  await setLabeledControl(client, 'Digital tax rate', '4.25');
  await setLabeledControl(client, 'Shipping base', '11.5');
  await setLabeledControl(client, 'Shipping weight rate', '1.75');
  await setLabeledControl(client, 'Discount percent', '12.5');
  await setLabeledControl(client, 'Tax provider', 'http');
  await setLabeledControl(client, 'Tax endpoint URL', `https://pricing.example.com/${suffix}/tax`);
  await setLabeledControl(client, 'Shipping provider', 'http');
  await setLabeledControl(client, 'Shipping endpoint URL', `https://pricing.example.com/${suffix}/shipping`);
  await setLabeledControl(client, 'Discount provider', 'http');
  await setLabeledControl(client, 'Discount endpoint URL', `https://pricing.example.com/${suffix}/discount`);
  await setLabeledControl(client, 'Fulfillment dispatch provider', 'http');
  await setLabeledControl(client, 'Fulfillment endpoint URL', `https://warehouse.example.com/${suffix}/dispatch`);
  await setLabeledControl(client, 'Label provider', 'easypost');
  await setLabeledControl(client, 'Default carrier', 'UPS');
  await setLabeledControl(client, 'Default service', 'Ground');
  await setLabeledControl(client, 'Origin address JSON', shippingOriginAddressForSuffix(suffix));
  await setLabeledControl(client, 'Rate ID', `rate_${suffix}`);
  await setLabeledControl(client, 'Default parcel JSON', shippingParcelForSuffix(suffix));
  await setLabeledControl(client, 'Billing plan', 'pro');
  await setLabeledControl(client, 'Monthly order limit', '5000');
  await setLabeledControl(client, 'Product limit', '750');
  await setLabeledControl(client, 'Site limit', '12');
  await setLabeledControl(client, 'Team limit', '8');
  await setLabeledControl(client, 'Seat limit', '25');
  await setLabeledControl(client, 'Overage mode', 'manual-review');
  await setLabeledControl(client, 'Billing contact email', `billing+${suffix}@example.com`);
  await setLabeledControl(client, 'Webhook events', true);
  const commerceState = await evaluate(client, `(() => ({
    search: window.location.search,
    hasStorefrontHandoff: document.body?.innerText?.includes('Storefront API handoff') || false,
    hasCheckoutProvider: document.body?.innerText?.includes('Checkout provider') || false,
    hasSettlement: document.body?.innerText?.includes('Settlement') || false,
    hasShippingLabelExecution: document.body?.innerText?.includes('Shipping label execution') || false,
  }))()`);
  assert(commerceState.search.includes('tab=commerce'), `Commerce tab search state was not persisted: ${JSON.stringify(commerceState)}`);
  assert(
    commerceState.hasStorefrontHandoff &&
      commerceState.hasCheckoutProvider &&
      commerceState.hasSettlement &&
      commerceState.hasShippingLabelExecution,
    `Commerce tab did not expose storefront handoff controls: ${JSON.stringify(commerceState)}`,
  );

  await openSettingsTab(client, 'Notifications', 'tab=notifications');
  await setLabeledControl(client, 'Comment moderation events', false);
  await setLabeledControl(client, 'New form submission', true);
  await setLabeledControl(client, 'Pending comments', false);
  await setLabeledControl(client, 'Digest frequency', 'daily');
  await setLabeledControl(client, 'Webhook URL', notificationWebhookUrl);
  await clickByTestId(client, 'settings-notification-webhook-test');
  await waitForText(client, 'Notification webhook test succeeded.');
  await waitForText(client, 'Last delivery: succeeded');
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const retryReady = await evaluate(client, `(() => {
      const button = document.querySelector('[data-testid="settings-notification-webhook-retry"]');
      const result = document.querySelector('[data-testid="settings-notification-webhook-result"]')?.textContent || '';
      return {
        ready: button instanceof HTMLButtonElement && !button.disabled && result.includes('req_'),
        disabled: button instanceof HTMLButtonElement ? button.disabled : null,
        result,
      };
    })()`);
    if (retryReady.ready) break;
    if (attempt === 59) {
      throw new Error(`Notification webhook retry did not become available: ${JSON.stringify(retryReady)}`);
    }
    await sleep(150);
  }
  await clickByTestId(client, 'settings-notification-webhook-retry');
  await waitForText(client, 'Notification webhook retry succeeded.');
  const notificationWebhookState = await evaluate(client, `(() => {
    const result = document.querySelector('[data-testid="settings-notification-webhook-result"]')?.textContent || '';
    return {
      hasResult: result.includes('Last delivery: succeeded'),
      hasRetry: result.includes('/ retry'),
      hasRequestId: result.includes('req_'),
      result,
    };
  })()`);
  assert(
    notificationWebhookState.hasResult && notificationWebhookState.hasRetry && notificationWebhookState.hasRequestId,
    `Notification webhook test/retry result did not render: ${JSON.stringify(notificationWebhookState)}`,
  );

  await openSettingsTab(client, 'Security', 'tab=security');
  const securityKeyState = await evaluate(client, `(() => {
    const body = document.body?.innerText || '';
    return {
      hiddenAdminKey: body.includes('Hidden without settings.manageKeys'),
      adminKeyStatus: document.querySelector('[data-testid="settings-api-key-status-admin"]')?.textContent?.trim() || '',
      publicKeyStatus: document.querySelector('[data-testid="settings-api-key-status-public"]')?.textContent?.trim() || '',
      leakedStaleAdminKey: body.includes(${JSON.stringify(STALE_ADMIN_API_KEY)}),
      copyButtons: Array.from(document.querySelectorAll('button')).map((button) => ({
        text: (button.textContent || '').trim(),
        disabled: button.disabled,
      })),
    };
  })()`);
  assert(
    securityKeyState.hiddenAdminKey &&
      securityKeyState.adminKeyStatus === 'Hidden' &&
      securityKeyState.publicKeyStatus === 'Active' &&
      !securityKeyState.leakedStaleAdminKey,
    `Admin API key should stay hidden from non-key managers even with stale local storage: ${JSON.stringify(securityKeyState)}`,
  );
  await assertTwoFactorAvailable(client);
  await setLabeledControl(client, 'Require two-factor authentication', true);
  await setLabeledControl(client, 'Invite-only workspace access', true);
  await setLabeledControl(client, 'Minimum password length', '12');
  await setLabeledControl(client, 'Session timeout', '120');
  await setLabeledControl(client, 'Allowed email domains', 'example.com, agency.dev');

  await openSettingsTab(client, 'Delivery', 'tab=delivery');
  const finalDelivery = await setDeliveryMode(client, 'custom-frontend');
  const saved = await saveSettings(client);

  const layout = await evaluate(client, `(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    hasAuditTrail: document.body?.innerText?.includes('Audit') || document.body?.innerText?.includes('audit'),
    hasCommandCenter: Boolean(document.querySelector('[data-testid="settings-command-center"]')),
  }))()`);
  assert(layout.scrollWidth <= layout.width + 8, `Settings page has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(layout.hasAuditTrail, `Security tab did not expose audit trail text: ${JSON.stringify(layout)}`);

  return {
    initial,
    delivery: finalDelivery,
    initialDelivery: delivery,
    infrastructureState,
    notificationWebhookState,
    saved,
    layout,
  };
};

const assertPersistedSettings = (settings, suffix, notificationWebhookUrl) => {
  assert(settings.deliveryMode === 'custom-frontend', `Delivery mode was not persisted: ${settings.deliveryMode}`);
  assert(settings.integrations?.general?.siteName === `Backy Smoke ${suffix}`, 'General site name was not persisted');
  assert(settings.integrations?.appearance?.primaryColor === '#0f766e', 'Appearance primary color was not persisted');
  assert(settings.integrations?.seo?.titleTemplate === `%s | Backy Smoke ${suffix}`, 'SEO title template was not persisted');
  assert(settings.integrations?.storage?.provider === 'supabase', 'Storage provider was not persisted');
  assert(settings.integrations?.storage?.bucket === `media-${suffix}`, 'Storage bucket was not persisted');
  assert(settings.integrations?.storage?.maxFileSizeMb === 128, 'Storage max upload size was not persisted');
  assert(settings.integrations?.storage?.workspaceStorageLimitGb === 512, 'Storage workspace limit was not persisted');
  assert(settings.integrations?.storage?.warningThresholdPercent === 85, 'Storage warning threshold was not persisted');
  assert(settings.integrations?.storage?.allowedFileTypes === 'image/*,font/*,application/pdf,.zip', 'Storage allowed file types were not persisted');
  assert(settings.integrations?.storage?.supabaseKeySecretRef === 'env:BACKY_SUPABASE_SERVICE_ROLE_KEY', 'Storage Supabase key secret ref was not persisted');
  assert(settings.integrations?.storage?.accessKeyIdSecretRef === 'env:BACKY_S3_ACCESS_KEY_ID', 'Storage S3 access key secret ref was not persisted');
  assert(settings.integrations?.storage?.secretAccessKeySecretRef === 'env:BACKY_S3_SECRET_ACCESS_KEY', 'Storage S3 secret access key ref was not persisted');
  assert(settings.integrations?.supabase?.projectRef === suffix, 'Supabase project ref was not persisted');
  assert(settings.integrations?.supabase?.databaseEnabled === true, 'Supabase database toggle was not persisted');
  assert(settings.integrations?.vercel?.projectId === `prj_${suffix}`, 'Vercel project id was not persisted');
  assert(settings.integrations?.vercel?.previewDeployments === true, 'Vercel preview toggle was not persisted');
  assert(Array.isArray(settings.integrations?.vercel?.deploymentHistory), 'Vercel deployment history was not persisted');
  assert(settings.integrations?.vercel?.deploymentHistory?.[0]?.requestId, 'Vercel deployment history request ID was not persisted');
  assert(settings.integrations?.commerce?.mode === 'checkout-provider', 'Commerce mode was not persisted');
  assert(settings.integrations?.commerce?.currency === 'EUR', 'Commerce currency was not persisted');
  assert(settings.integrations?.commerce?.paymentProvider === 'stripe', 'Commerce payment provider was not persisted');
  assert(
    settings.runtimeCommerce?.stripeSecretConfigured === Boolean(process.env.BACKY_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY),
    `Commerce runtime Stripe secret readiness did not match env: ${JSON.stringify(settings.runtimeCommerce)}`,
  );
  assert(settings.runtimeCommerce?.stripeApiBaseUrl, `Commerce runtime Stripe API base URL was not reported: ${JSON.stringify(settings.runtimeCommerce)}`);
  assert(settings.integrations?.commerce?.providerAccountId === `acct_${suffix}`, 'Commerce provider account ID was not persisted');
  assert(settings.integrations?.commerce?.providerMode === 'live', 'Commerce provider mode was not persisted');
  assert(settings.integrations?.commerce?.providerWebhookUrl === `https://hooks.example.com/commerce/${suffix}`, 'Commerce provider webhook URL was not persisted');
  assert(settings.integrations?.commerce?.providerWebhookSecretId === commerceWebhookSecretReference(suffix), 'Commerce webhook secret reference was not persisted');
  assert(settings.integrations?.commerce?.providerWebhookEvents === 'checkout.session.completed,charge.refunded', 'Commerce webhook event allowlist was not persisted');
  assert(settings.integrations?.commerce?.reconciliationMode === 'webhook', 'Commerce reconciliation mode was not persisted');
  assert(settings.integrations?.commerce?.reconciliationWindowHours === 36, 'Commerce reconciliation window was not persisted');
  assert(settings.integrations?.commerce?.taxEnabled === true, 'Commerce tax toggle was not persisted');
  assert(settings.integrations?.commerce?.shippingEnabled === true, 'Commerce shipping toggle was not persisted');
  assert(settings.integrations?.commerce?.taxRatePercent === 9.75, 'Commerce standard tax rate was not persisted');
  assert(settings.integrations?.commerce?.digitalTaxRatePercent === 4.25, 'Commerce digital tax rate was not persisted');
  assert(settings.integrations?.commerce?.shippingBaseAmount === 11.5, 'Commerce shipping base was not persisted');
  assert(settings.integrations?.commerce?.shippingWeightRate === 1.75, 'Commerce shipping weight rate was not persisted');
  assert(settings.integrations?.commerce?.discountPercent === 12.5, 'Commerce discount percent was not persisted');
  assert(settings.integrations?.commerce?.taxProvider === 'http', 'Commerce tax provider was not persisted');
  assert(settings.integrations?.commerce?.taxProviderUrl === `https://pricing.example.com/${suffix}/tax`, 'Commerce tax provider URL was not persisted');
  assert(settings.integrations?.commerce?.shippingProvider === 'http', 'Commerce shipping provider was not persisted');
  assert(settings.integrations?.commerce?.shippingProviderUrl === `https://pricing.example.com/${suffix}/shipping`, 'Commerce shipping provider URL was not persisted');
  assert(settings.integrations?.commerce?.discountProvider === 'http', 'Commerce discount provider was not persisted');
  assert(settings.integrations?.commerce?.discountProviderUrl === `https://pricing.example.com/${suffix}/discount`, 'Commerce discount provider URL was not persisted');
  assert(settings.integrations?.commerce?.fulfillmentProvider === 'http', 'Commerce fulfillment provider was not persisted');
  assert(settings.integrations?.commerce?.fulfillmentProviderUrl === `https://warehouse.example.com/${suffix}/dispatch`, 'Commerce fulfillment provider URL was not persisted');
  assert(settings.integrations?.commerce?.shippingLabelProvider === 'easypost', 'Commerce shipping label provider was not persisted');
  assert(settings.integrations?.commerce?.shippingDefaultCarrier === 'UPS', 'Commerce shipping default carrier was not persisted');
  assert(settings.integrations?.commerce?.shippingDefaultServiceLevel === 'Ground', 'Commerce shipping default service was not persisted');
  assert(settings.integrations?.commerce?.shippingOriginAddress === shippingOriginAddressForSuffix(suffix), 'Commerce shipping origin address was not persisted');
  assert(settings.integrations?.commerce?.shippingDefaultRateId === `rate_${suffix}`, 'Commerce shipping default rate ID was not persisted');
  assert(settings.integrations?.commerce?.shippingDefaultParcel === shippingParcelForSuffix(suffix), 'Commerce shipping default parcel was not persisted');
  assert(settings.integrations?.commerce?.reservationMinutes === 30, 'Commerce reservation window was not persisted');
  assert(settings.integrations?.commerce?.billingPlan === 'pro', 'Commerce billing plan was not persisted');
  assert(settings.integrations?.commerce?.monthlyOrderLimit === 5000, 'Commerce monthly order limit was not persisted');
  assert(settings.integrations?.commerce?.productLimit === 750, 'Commerce product limit was not persisted');
  assert(settings.integrations?.commerce?.siteLimit === 12, 'Commerce site limit was not persisted');
  assert(settings.integrations?.commerce?.teamLimit === 8, 'Commerce team limit was not persisted');
  assert(settings.integrations?.commerce?.seatLimit === 25, 'Commerce seat limit was not persisted');
  assert(settings.integrations?.commerce?.overageMode === 'manual-review', 'Commerce overage mode was not persisted');
  assert(settings.integrations?.commerce?.billingContactEmail === `billing+${suffix}@example.com`, 'Commerce billing contact email was not persisted');
  assert(settings.integrations?.notifications?.email?.comments === false, 'Comment notification email toggle was not persisted');
  assert(settings.integrations?.notifications?.email?.formSubmission === true, 'Form notification email toggle was not persisted');
  assert(settings.integrations?.notifications?.email?.newUser !== true, 'Planned new-user notification email should not persist as enabled');
  assert(settings.integrations?.notifications?.email?.pagePublished !== true, 'Planned page-published notification email should not persist as enabled');
  assert(settings.integrations?.notifications?.inApp?.comments === false, 'Notification in-app toggle was not persisted');
  assert(settings.integrations?.notifications?.inApp?.mentions !== true, 'Planned mention notification should not persist as enabled');
  assert(settings.integrations?.notifications?.digestFrequency === 'instant', 'Planned digest frequency should normalize to instant');
  assert(settings.integrations?.notifications?.webhookUrl === notificationWebhookUrl, 'Notification webhook was not persisted');
  assert(settings.auth?.requireTwoFactor === true, 'Require 2FA toggle was not persisted');
  assert(settings.auth?.inviteOnly === true, 'Invite-only toggle was not persisted');
  assert(settings.auth?.minPasswordLength === 12, 'Password length was not persisted');
};

const assertDirectSettingsApiNormalizesPlannedNotifications = async (settings) => {
  await requestApi('/api/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify({
      integrations: {
        ...(settings.integrations || {}),
        notifications: {
          ...(settings.integrations?.notifications || {}),
          email: {
            ...(settings.integrations?.notifications?.email || {}),
            newUser: true,
            pagePublished: true,
            systemUpdates: true,
          },
          inApp: {
            ...(settings.integrations?.notifications?.inApp || {}),
            mentions: true,
          },
          digestFrequency: 'weekly',
        },
      },
    }),
  });

  const normalized = await readSettings();
  assert(normalized.integrations?.notifications?.email?.newUser === false, 'Settings API should normalize planned new-user email notifications');
  assert(normalized.integrations?.notifications?.email?.pagePublished === false, 'Settings API should normalize planned page-published email notifications');
  assert(normalized.integrations?.notifications?.email?.systemUpdates === false, 'Settings API should normalize planned system update email notifications');
  assert(normalized.integrations?.notifications?.inApp?.mentions === false, 'Settings API should normalize planned mention notifications');
  assert(normalized.integrations?.notifications?.digestFrequency === 'instant', 'Settings API should normalize planned digest frequencies');

  return {
    email: normalized.integrations?.notifications?.email,
    inApp: normalized.integrations?.notifications?.inApp,
    digestFrequency: normalized.integrations?.notifications?.digestFrequency,
  };
};

const assertDirectSettingsApiRejectsRawSecrets = async (settings) => {
  const commerceResponse = await fetch(`${API_BASE_URL}/api/admin/settings`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiAdminSessionToken}`,
    },
    body: JSON.stringify({
      integrations: {
        ...(settings.integrations || {}),
        commerce: {
          ...(settings.integrations?.commerce || {}),
          providerWebhookSecretId: 'whsec_settings_smoke_raw_secret_should_not_persist',
        },
      },
    }),
  });
  const commercePayload = await commerceResponse.json().catch(() => ({}));

  assert(commerceResponse.status === 400, `Raw commerce webhook secret should be rejected, got ${commerceResponse.status}: ${JSON.stringify(commercePayload).slice(0, 500)}`);
  assert(commercePayload?.error?.code === 'SECRET_REFERENCE_REQUIRED', `Raw commerce secret rejection should return SECRET_REFERENCE_REQUIRED: ${JSON.stringify(commercePayload).slice(0, 500)}`);

  const storageResponse = await fetch(`${API_BASE_URL}/api/admin/settings`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiAdminSessionToken}`,
    },
    body: JSON.stringify({
      integrations: {
        ...(settings.integrations || {}),
        storage: {
          ...(settings.integrations?.storage || {}),
          supabaseKeySecretRef: 'sk_live_settings_storage_secret_should_not_persist',
        },
      },
    }),
  });
  const storagePayload = await storageResponse.json().catch(() => ({}));

  assert(storageResponse.status === 400, `Raw storage secret should be rejected, got ${storageResponse.status}: ${JSON.stringify(storagePayload).slice(0, 500)}`);
  assert(storagePayload?.error?.code === 'SECRET_REFERENCE_REQUIRED', `Raw storage secret rejection should return SECRET_REFERENCE_REQUIRED: ${JSON.stringify(storagePayload).slice(0, 500)}`);

  const after = await readSettings();
  assert(
    after.integrations?.commerce?.providerWebhookSecretId === settings.integrations?.commerce?.providerWebhookSecretId,
    `Rejected raw secret patch should not mutate persisted commerce reference: ${JSON.stringify(after.integrations?.commerce).slice(0, 500)}`,
  );
  assert(
    after.integrations?.storage?.supabaseKeySecretRef === settings.integrations?.storage?.supabaseKeySecretRef,
    `Rejected raw storage secret patch should not mutate persisted storage reference: ${JSON.stringify(after.integrations?.storage).slice(0, 500)}`,
  );

  return {
    commerceStatus: commerceResponse.status,
    storageStatus: storageResponse.status,
    code: storagePayload.error?.code,
  };
};

const assertDirectSettingsApiRejectsInvalidCommerceProviderEndpoints = async (settings) => {
  const response = await fetch(`${API_BASE_URL}/api/admin/settings`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiAdminSessionToken}`,
    },
    body: JSON.stringify({
      integrations: {
        ...(settings.integrations || {}),
        commerce: {
          ...(settings.integrations?.commerce || {}),
          shippingProvider: 'http',
          shippingProviderUrl: 'not-a-valid-url',
        },
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));

  assert(response.status === 400, `Invalid commerce provider endpoint should be rejected, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(payload?.error?.code === 'VALIDATION_ERROR', `Invalid provider endpoint rejection should return VALIDATION_ERROR: ${JSON.stringify(payload).slice(0, 500)}`);

  const after = await readSettings();
  assert(
    after.integrations?.commerce?.shippingProviderUrl === settings.integrations?.commerce?.shippingProviderUrl,
    `Rejected provider endpoint patch should not mutate persisted commerce URL: ${JSON.stringify(after.integrations?.commerce).slice(0, 500)}`,
  );

  return {
    status: response.status,
    code: payload.error?.code,
  };
};

const assertDirectSettingsApiRejectsInvalidCallbackUrls = async (settings) => {
  const commerceResponse = await fetch(`${API_BASE_URL}/api/admin/settings`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiAdminSessionToken}`,
    },
    body: JSON.stringify({
      integrations: {
        ...(settings.integrations || {}),
        commerce: {
          ...(settings.integrations?.commerce || {}),
          providerWebhookUrl: 'ftp://hooks.example.com/not-allowed',
        },
      },
    }),
  });
  const commercePayload = await commerceResponse.json().catch(() => ({}));

  assert(commerceResponse.status === 400, `Invalid commerce webhook URL should be rejected, got ${commerceResponse.status}: ${JSON.stringify(commercePayload).slice(0, 500)}`);
  assert(commercePayload?.error?.code === 'VALIDATION_ERROR', `Invalid commerce webhook URL rejection should return VALIDATION_ERROR: ${JSON.stringify(commercePayload).slice(0, 500)}`);

  const notificationResponse = await fetch(`${API_BASE_URL}/api/admin/settings`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiAdminSessionToken}`,
    },
    body: JSON.stringify({
      integrations: {
        ...(settings.integrations || {}),
        notifications: {
          ...(settings.integrations?.notifications || {}),
          webhookUrl: 'not-a-valid-url',
        },
      },
    }),
  });
  const notificationPayload = await notificationResponse.json().catch(() => ({}));

  assert(notificationResponse.status === 400, `Invalid notification webhook URL should be rejected, got ${notificationResponse.status}: ${JSON.stringify(notificationPayload).slice(0, 500)}`);
  assert(notificationPayload?.error?.code === 'VALIDATION_ERROR', `Invalid notification webhook URL rejection should return VALIDATION_ERROR: ${JSON.stringify(notificationPayload).slice(0, 500)}`);

  const after = await readSettings();
  assert(
    after.integrations?.commerce?.providerWebhookUrl === settings.integrations?.commerce?.providerWebhookUrl,
    `Rejected commerce webhook URL patch should not mutate persisted commerce URL: ${JSON.stringify(after.integrations?.commerce).slice(0, 500)}`,
  );
  assert(
    after.integrations?.notifications?.webhookUrl === settings.integrations?.notifications?.webhookUrl,
    `Rejected notification webhook URL patch should not mutate persisted notification URL: ${JSON.stringify(after.integrations?.notifications).slice(0, 500)}`,
  );

  return {
    commerceStatus: commerceResponse.status,
    notificationStatus: notificationResponse.status,
    commerceCode: commercePayload.error?.code,
    notificationCode: notificationPayload.error?.code,
  };
};

const assertDirectSettingsApiRejectsInvalidInfrastructureProviderSettings = async (settings) => {
  const sendInvalidInfrastructurePatch = async (label, integrationsPatch) => {
    const response = await fetch(`${API_BASE_URL}/api/admin/settings`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiAdminSessionToken}`,
      },
      body: JSON.stringify({
        integrations: {
          ...(settings.integrations || {}),
          ...integrationsPatch,
        },
      }),
    });
    const payload = await response.json().catch(() => ({}));

    assert(response.status === 400, `${label} should be rejected, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(payload?.error?.code === 'VALIDATION_ERROR', `${label} rejection should return VALIDATION_ERROR: ${JSON.stringify(payload).slice(0, 500)}`);

    return {
      status: response.status,
      code: payload.error?.code,
    };
  };

  const storage = await sendInvalidInfrastructurePatch('Invalid storage public base URL', {
    storage: {
      ...(settings.integrations?.storage || {}),
      publicBaseUrl: 'not-a-valid-url',
    },
  });
  const supabase = await sendInvalidInfrastructurePatch('Invalid Supabase project URL', {
    supabase: {
      ...(settings.integrations?.supabase || {}),
      projectUrl: 'ftp://settings-smoke.invalid.supabase.co',
    },
  });
  const vercel = await sendInvalidInfrastructurePatch('Invalid Vercel production domain', {
    vercel: {
      ...(settings.integrations?.vercel || {}),
      productionDomain: 'https://settings-smoke.invalid/path',
    },
  });

  const after = await readSettings();
  assert(
    after.integrations?.storage?.publicBaseUrl === settings.integrations?.storage?.publicBaseUrl,
    `Rejected storage URL patch should not mutate persisted storage settings: ${JSON.stringify(after.integrations?.storage).slice(0, 500)}`,
  );
  assert(
    after.integrations?.supabase?.projectUrl === settings.integrations?.supabase?.projectUrl,
    `Rejected Supabase URL patch should not mutate persisted Supabase settings: ${JSON.stringify(after.integrations?.supabase).slice(0, 500)}`,
  );
  assert(
    after.integrations?.vercel?.productionDomain === settings.integrations?.vercel?.productionDomain,
    `Rejected Vercel domain patch should not mutate persisted Vercel settings: ${JSON.stringify(after.integrations?.vercel).slice(0, 500)}`,
  );

  return {
    storage,
    supabase,
    vercel,
  };
};

const assertDirectSettingsApiRejectsInvalidStoragePolicySettings = async (settings) => {
  const sendInvalidStoragePolicyPatch = async (label, storagePatch) => {
    const response = await fetch(`${API_BASE_URL}/api/admin/settings`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiAdminSessionToken}`,
      },
      body: JSON.stringify({
        integrations: {
          ...(settings.integrations || {}),
          storage: {
            ...(settings.integrations?.storage || {}),
            ...storagePatch,
          },
        },
      }),
    });
    const payload = await response.json().catch(() => ({}));

    assert(response.status === 400, `${label} should be rejected, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(payload?.error?.code === 'VALIDATION_ERROR', `${label} rejection should return VALIDATION_ERROR: ${JSON.stringify(payload).slice(0, 500)}`);

    return {
      status: response.status,
      code: payload.error?.code,
    };
  };

  const maxFileSize = await sendInvalidStoragePolicyPatch('Invalid max upload size', {
    maxFileSizeMb: 0,
  });
  const workspaceLimit = await sendInvalidStoragePolicyPatch('Invalid workspace storage limit', {
    workspaceStorageLimitGb: 102401,
  });
  const warningThreshold = await sendInvalidStoragePolicyPatch('Invalid storage warning threshold', {
    warningThresholdPercent: 10,
  });

  const after = await readSettings();
  assert(
    after.integrations?.storage?.maxFileSizeMb === settings.integrations?.storage?.maxFileSizeMb,
    `Rejected max upload patch should not mutate persisted storage policy: ${JSON.stringify(after.integrations?.storage).slice(0, 500)}`,
  );
  assert(
    after.integrations?.storage?.workspaceStorageLimitGb === settings.integrations?.storage?.workspaceStorageLimitGb,
    `Rejected workspace storage limit patch should not mutate persisted storage policy: ${JSON.stringify(after.integrations?.storage).slice(0, 500)}`,
  );
  assert(
    after.integrations?.storage?.warningThresholdPercent === settings.integrations?.storage?.warningThresholdPercent,
    `Rejected storage warning threshold patch should not mutate persisted storage policy: ${JSON.stringify(after.integrations?.storage).slice(0, 500)}`,
  );

  return {
    maxFileSize,
    workspaceLimit,
    warningThreshold,
  };
};

const assertDirectSettingsApiRejectsInvalidOperationalSettings = async (settings) => {
  const sendInvalidSettingsPatch = async (label, body) => {
    const response = await fetch(`${API_BASE_URL}/api/admin/settings`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiAdminSessionToken}`,
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));

    assert(response.status === 400, `${label} should be rejected, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(payload?.error?.code === 'VALIDATION_ERROR', `${label} rejection should return VALIDATION_ERROR: ${JSON.stringify(payload).slice(0, 500)}`);

    return {
      status: response.status,
      code: payload.error?.code,
    };
  };

  const successPath = await sendInvalidSettingsPatch('Invalid commerce success path', {
    integrations: {
      ...(settings.integrations || {}),
      commerce: {
        ...(settings.integrations?.commerce || {}),
        checkoutSuccessPath: 'checkout/complete',
      },
    },
  });
  const billingEmail = await sendInvalidSettingsPatch('Invalid billing contact email', {
    integrations: {
      ...(settings.integrations || {}),
      commerce: {
        ...(settings.integrations?.commerce || {}),
        billingContactEmail: 'billing-not-an-email',
      },
    },
  });
  const notificationRecipient = await sendInvalidSettingsPatch('Invalid notification recipient', {
    integrations: {
      ...(settings.integrations || {}),
      notifications: {
        ...(settings.integrations?.notifications || {}),
        email: {
          ...(settings.integrations?.notifications?.email || {}),
          recipient: 'notify-not-an-email',
        },
      },
    },
  });
  const passwordPolicy = await sendInvalidSettingsPatch('Invalid password policy', {
    auth: {
      ...(settings.auth || {}),
      minPasswordLength: 4,
    },
  });
  const domainPolicy = await sendInvalidSettingsPatch('Invalid email domain policy', {
    auth: {
      ...(settings.auth || {}),
      allowedEmailDomains: 'example.com, invalid_domain',
    },
  });

  const after = await readSettings();
  assert(
    after.integrations?.commerce?.checkoutSuccessPath === settings.integrations?.commerce?.checkoutSuccessPath,
    `Rejected success path patch should not mutate persisted commerce settings: ${JSON.stringify(after.integrations?.commerce).slice(0, 500)}`,
  );
  assert(
    after.integrations?.commerce?.billingContactEmail === settings.integrations?.commerce?.billingContactEmail,
    `Rejected billing email patch should not mutate persisted commerce settings: ${JSON.stringify(after.integrations?.commerce).slice(0, 500)}`,
  );
  assert(
    after.integrations?.notifications?.email?.recipient === settings.integrations?.notifications?.email?.recipient,
    `Rejected notification recipient patch should not mutate persisted notification settings: ${JSON.stringify(after.integrations?.notifications).slice(0, 500)}`,
  );
  assert(
    after.auth?.minPasswordLength === settings.auth?.minPasswordLength,
    `Rejected auth policy patch should not mutate persisted auth settings: ${JSON.stringify(after.auth).slice(0, 500)}`,
  );

  return {
    successPath,
    billingEmail,
    notificationRecipient,
    passwordPolicy,
    domainPolicy,
  };
};

const assertDirectSettingsApiRejectsInvalidBrandSeoSettings = async (settings) => {
  const sendInvalidBrandPatch = async (label, integrationsPatch) => {
    const response = await fetch(`${API_BASE_URL}/api/admin/settings`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiAdminSessionToken}`,
      },
      body: JSON.stringify({
        integrations: {
          ...(settings.integrations || {}),
          ...integrationsPatch,
        },
      }),
    });
    const payload = await response.json().catch(() => ({}));

    assert(response.status === 400, `${label} should be rejected, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(payload?.error?.code === 'VALIDATION_ERROR', `${label} rejection should return VALIDATION_ERROR: ${JSON.stringify(payload).slice(0, 500)}`);

    return {
      status: response.status,
      code: payload.error?.code,
    };
  };

  const general = await sendInvalidBrandPatch('Invalid default site name', {
    general: {
      ...(settings.integrations?.general || {}),
      siteName: '   ',
    },
  });
  const color = await sendInvalidBrandPatch('Invalid appearance color', {
    appearance: {
      ...(settings.integrations?.appearance || {}),
      primaryColor: 'teal',
    },
  });
  const typography = await sendInvalidBrandPatch('Invalid base font size', {
    appearance: {
      ...(settings.integrations?.appearance || {}),
      baseFontSize: 99,
    },
  });
  const seo = await sendInvalidBrandPatch('Invalid default OG image URL', {
    seo: {
      ...(settings.integrations?.seo || {}),
      ogImageUrl: 'ftp://cdn.example.com/og.png',
    },
  });

  const after = await readSettings();
  assert(
    after.integrations?.general?.siteName === settings.integrations?.general?.siteName,
    `Rejected general patch should not mutate persisted general settings: ${JSON.stringify(after.integrations?.general).slice(0, 500)}`,
  );
  assert(
    after.integrations?.appearance?.primaryColor === settings.integrations?.appearance?.primaryColor,
    `Rejected appearance patch should not mutate persisted appearance settings: ${JSON.stringify(after.integrations?.appearance).slice(0, 500)}`,
  );
  assert(
    after.integrations?.seo?.ogImageUrl === settings.integrations?.seo?.ogImageUrl,
    `Rejected SEO patch should not mutate persisted SEO settings: ${JSON.stringify(after.integrations?.seo).slice(0, 500)}`,
  );

  return {
    general,
    color,
    typography,
    seo,
  };
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-settings-${Date.now()}`);
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

const cleanup = async ({ client, childProcess, userDataDir }) => {
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
  const suffix = `settings-smoke-${Date.now().toString(36)}`;
  const adminSession = await loginAdminApi();
  const originalSettings = await readSettings();
  const permissionDenials = await assertSettingsPermissionDenials(originalSettings);
  await setAdminPermissionOverrides({ 'settings.manageKeys': 'deny' });
  let ownerUserId = '';
  let ownerSession = null;
  let ownerOriginalSettings = null;
  const { childProcess, userDataDir } = launchChrome();
  let client;
  let restored = false;
  let adminPreloadIdentifier = '';
  const webhookCapture = await createWebhookCaptureServer();

  try {
    const owner = await createUser({
      fullName: `Settings Owner ${suffix}`,
      email: `settings-owner-${suffix}@example.com`,
      role: 'owner',
      status: 'invited',
    });
    ownerUserId = owner.id;
    ownerSession = await acceptInviteToken((await createInviteToken(owner.id)).token);
    ownerOriginalSettings = await readSettings(ownerSession.session.token);

    await waitForCdp();
    const page = (await fetchJson('/json/list')).find((candidate) => candidate.type === 'page');
    assert(page?.webSocketDebuggerUrl, 'No Chrome page target found');

    client = connectCdp(page.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('Log.enable');
    const adminPreload = await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(adminSession.session.token),
    });
    adminPreloadIdentifier = adminPreload.identifier || '';

    const ui = await updateSettingsThroughUi(client, suffix, originalSettings, webhookCapture.url);
    const ownerRotation = await assertOwnerCanRotateApiKeyThroughUi(
      client,
      ownerSession,
      ownerOriginalSettings,
      adminPreloadIdentifier,
    );
    const persisted = await readSettings();
    assertPersistedSettings(persisted, suffix, webhookCapture.url);
    assert(webhookCapture.requests.length >= 2, `Settings webhook test/retry did not hit capture server: ${JSON.stringify(webhookCapture.requests)}`);
    assert(
      webhookCapture.requests.some((entry) => entry.headers['x-backy-settings-webhook-test'] === 'true' && entry.body?.kind === 'settings.notification_webhook.test'),
      `Settings webhook test payload was not captured: ${JSON.stringify(webhookCapture.requests).slice(0, 500)}`,
    );
    assert(
      webhookCapture.requests.some((entry) => entry.headers['x-backy-webhook-retry'] === 'true' && entry.body?.kind === 'settings.notification_webhook.retry' && entry.body?.retry === true),
      `Settings webhook retry payload was not captured: ${JSON.stringify(webhookCapture.requests).slice(0, 500)}`,
    );
    const apiNormalization = await assertDirectSettingsApiNormalizesPlannedNotifications(persisted);
    const secretStorage = await assertDirectSettingsApiRejectsRawSecrets(await readSettings());
    const providerEndpointValidation = await assertDirectSettingsApiRejectsInvalidCommerceProviderEndpoints(await readSettings());
    const callbackUrlValidation = await assertDirectSettingsApiRejectsInvalidCallbackUrls(await readSettings());
    const infrastructureProviderValidation = await assertDirectSettingsApiRejectsInvalidInfrastructureProviderSettings(await readSettings());
    const storagePolicyValidation = await assertDirectSettingsApiRejectsInvalidStoragePolicySettings(await readSettings());
    const operationalSettingsValidation = await assertDirectSettingsApiRejectsInvalidOperationalSettings(await readSettings());
    const brandSeoValidation = await assertDirectSettingsApiRejectsInvalidBrandSeoSettings(await readSettings());

    const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));

    const browserErrors = client.events
      .filter((event) => (
        event.method === 'Runtime.exceptionThrown'
        || (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error')
      ))
      .map((event) => event.params);

    assert(browserErrors.length === 0, `Browser emitted errors: ${JSON.stringify(browserErrors.slice(0, 3))}`);

    await restoreSettings(ownerOriginalSettings || originalSettings, {
      sessionToken: ownerSession?.session?.token,
      includeApiKeys: Boolean(ownerOriginalSettings && ownerSession?.session?.token),
    });
    restored = true;
    await deleteUser(ownerUserId);
    ownerUserId = '';

    console.log(JSON.stringify({
      ok: true,
      url: `${ADMIN_BASE_URL}/settings`,
      ui,
      ownerRotation,
      permissionDenials,
      apiNormalization,
      secretStorage,
      providerEndpointValidation,
      callbackUrlValidation,
      infrastructureProviderValidation,
      storagePolicyValidation,
      operationalSettingsValidation,
      brandSeoValidation,
      persisted: {
        deliveryMode: persisted.deliveryMode,
        general: persisted.integrations?.general,
        storage: persisted.integrations?.storage,
        supabase: persisted.integrations?.supabase,
        vercel: persisted.integrations?.vercel,
        commerce: persisted.integrations?.commerce,
        notifications: persisted.integrations?.notifications,
        notificationWebhookRequests: webhookCapture.requests.map((entry) => ({
          method: entry.method,
          url: entry.url,
          kind: entry.body?.kind,
          retry: entry.body?.retry,
          requestId: entry.body?.requestId,
        })),
        auth: persisted.auth,
      },
      restored,
      screenshotPath: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await setAdminPermissionOverrides({ 'settings.manageKeys': null }).catch((error) => {
      console.warn('Unable to restore default admin key-management permission:', error instanceof Error ? error.message : error);
    });
    if (!restored) {
      await restoreSettings(ownerOriginalSettings || originalSettings, {
        sessionToken: ownerSession?.session?.token,
        includeApiKeys: Boolean(ownerOriginalSettings && ownerSession?.session?.token),
      }).catch((error) => {
        console.warn('Unable to restore original settings:', error instanceof Error ? error.message : error);
      });
    }
    if (ownerUserId) {
      await deleteUser(ownerUserId).catch((error) => {
        console.warn('Unable to remove temporary settings owner:', error instanceof Error ? error.message : error);
      });
    }
    await webhookCapture.close().catch((error) => {
      console.warn('Unable to stop settings webhook capture server:', error instanceof Error ? error.message : error);
    });
    await cleanup({ client, childProcess, userDataDir });
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
