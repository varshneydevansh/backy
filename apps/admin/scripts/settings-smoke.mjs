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

const assertSettingsSourceContracts = () => {
  const settingsRoute = fs.readFileSync(new URL('../src/routes/settings.tsx', import.meta.url), 'utf8');
  const requiredSettingsRouteSnippets = [
    'formatSiteScopedLocaleRows',
    'parseSiteScopedLocaleRows',
    "localeStrategy: 'none' | 'path-prefix' | 'domain'",
    'data-testid="settings-site-scope-default-locale"',
    'data-testid="settings-site-scope-locale-strategy"',
    'data-testid="settings-site-scope-locales"',
    "editableSections: ['seo', 'analytics', 'social', 'localization', 'commentPolicy']",
    'localization: siteSettingsScope.siteSettings.localization',
    'localization: {',
    'locales: parseSiteScopedLocaleRows',
    'runSettingsStorageCredentialRotationProbe',
    'runSettingsStorageSecretManager',
    "Run rotation probe",
    "Plan env sync",
    "Promote env",
    "Revoke next env",
    'data-testid="settings-release-certification-runbook"',
    '.github/workflows/backy-release-certification.yml',
    'npm run test:release-certification-preflight-contract',
    'certify_database',
    'certify_settings_providers',
    'certify_commerce_providers',
    'BACKY_DATABASE_URL',
    'ci:sdk-postgres-smoke',
    'ci:settings-provider-certification',
    'ci:commerce-provider-certification',
    'data-testid="settings-provider-certification"',
    'providerCertification',
    'npm run test:settings-provider-certification-preflight-contract',
    'external-live-provider-gate',
    'Supabase/Postgres',
    'Vercel env secret manager',
    'Resend',
    'COMMERCE_WEBHOOK_SECRET',
    'releaseCertification',
  ];

  const missingRouteSnippets = requiredSettingsRouteSnippets.filter((snippet) => !settingsRoute.includes(snippet));
  assert(
    missingRouteSnippets.length === 0,
    `Settings route is missing site-scoped localization contract snippets: ${missingRouteSnippets.join(', ')}`,
  );

  const smokeSource = fs.readFileSync(new URL(import.meta.url), 'utf8');
  const requiredSmokeSnippets = [
    "await setLabeledControl(client, 'Default locale', 'en')",
    "await setLabeledControl(client, 'Locale routing', 'path-prefix')",
    "await setLabeledControl(client, 'Locale entries'",
    "siteScopeSaved.localeStrategy === 'path-prefix'",
    "handoffState.editableSections.includes('localization')",
    "handoffState.localization?.localeStrategy === 'path-prefix'",
    "scope.siteSettings?.localization?.localeStrategy === 'path-prefix'",
    "entry.metadata?.changedKeys?.includes('localization')",
  ];
  const missingSmokeSnippets = requiredSmokeSnippets.filter((snippet) => !smokeSource.includes(snippet));
  assert(
    missingSmokeSnippets.length === 0,
    `Settings smoke is missing site-scoped localization coverage snippets: ${missingSmokeSnippets.join(', ')}`,
  );
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
  const login = (twoFactorCode) => fetch(`${API_BASE_URL}/api/admin/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: 'admin@backy.io',
      password: process.env.BACKY_ADMIN_DEMO_PASSWORD || 'admin123',
      ...(twoFactorCode ? { twoFactorCode } : {}),
    }),
  });

  let response = await login();
  let payload = await response.json().catch(() => ({}));
  const smokeMfaCode = process.env.BACKY_SETTINGS_SMOKE_MFA_CODE
    || process.env.BACKY_ADMIN_MFA_CODE
    || process.env.BACKY_ADMIN_2FA_CODE;
  if (!response.ok && payload.error?.code === 'MFA_REQUIRED' && smokeMfaCode) {
    response = await login(smokeMfaCode);
    payload = await response.json().catch(() => ({}));
  }

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

const createSite = async (input) => {
  const payload = await requestApi('/api/admin/sites', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const site = payload.data?.site;
  assert(site?.id, `Create settings smoke site did not return a site: ${JSON.stringify(payload).slice(0, 500)}`);
  return site;
};

const deleteSite = async (siteId) => {
  if (!siteId) return;
  await requestApi(`/api/admin/sites/${siteId}`, { method: 'DELETE' });
};

const readSiteSettingsScope = async (siteId) => {
  const payload = await requestApi(`/api/admin/sites/${siteId}/settings`);
  assert(payload.data?.settings, `Site settings scope API returned no settings payload: ${JSON.stringify(payload).slice(0, 500)}`);
  return payload.data.settings;
};

const setAdminPermissionOverrides = async (overrides) => {
  await requestApi('/api/admin/users/user-admin/permissions', {
    method: 'PATCH',
    body: JSON.stringify({ overrides }),
  });
};

const readAdminPermissionMatrix = async () => {
  const payload = await requestApi('/api/admin/users/user-admin/permissions');
  const permissions = payload.data?.permissions;
  assert(permissions?.groups, `User permissions API returned no permission matrix: ${JSON.stringify(payload).slice(0, 500)}`);
  return permissions;
};

const findAdminPermissionRule = (matrix, key) => matrix.groups
  .flatMap((group) => group.permissions || [])
  .find((permission) => permission.key === key) || null;

const waitForAdminPermissionRules = async (expectedRules) => {
  let last = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const matrix = await readAdminPermissionMatrix();
    const rules = Object.fromEntries(
      Object.keys(expectedRules).map((key) => [key, findAdminPermissionRule(matrix, key)]),
    );
    last = { role: matrix.role, status: matrix.status, rules };

    if (Object.entries(expectedRules).every(([key, expected]) => rules[key]?.allowed === expected)) {
      return last;
    }

    await sleep(100);
  }

  throw new Error(`Admin permission overrides did not settle: ${JSON.stringify(last).slice(0, 800)}`);
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

const normalizeSettingsSmokePreconditions = async (settings) => {
  if (settings.auth?.requireTwoFactor !== true) {
    return settings;
  }

  await restoreSettings({
    ...settings,
    auth: {
      ...(settings.auth || {}),
      requireTwoFactor: false,
    },
  });
  return readSettings();
};

const buildRestoreSettingsSnapshot = (originalSettings, ownerOriginalSettings) => {
  if (!ownerOriginalSettings) return originalSettings;
  return {
    ...ownerOriginalSettings,
    auth: originalSettings.auth,
  };
};

const restoreSettingsWithFallback = async (settings, options = {}) => {
  try {
    await restoreSettings(settings, options);
  } catch (error) {
    if (!options.sessionToken || options.sessionToken === apiAdminSessionToken) {
      throw error;
    }
    await restoreSettings(settings, {
      ...options,
      sessionToken: apiAdminSessionToken,
    });
  }
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
  for (let attempt = 0; attempt < 160; attempt += 1) {
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

const seedBrowserSessionCookie = async (client, sessionToken) => {
  await client.send('Network.setCookie', {
    name: 'backy_admin_session',
    value: sessionToken,
    url: API_BASE_URL,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  });
};

const setBrowserSession = async (client, sessionToken, user) => {
  await seedBrowserSessionCookie(client, sessionToken);
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
    if (control.disabled || control.matches(':disabled')) {
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

const setControlValueById = async (client, id, value) => {
  const result = await evaluate(client, `(() => {
    const id = ${JSON.stringify(id)};
    const control = document.getElementById(id);
    const value = ${JSON.stringify(value)};
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) {
      return { ok: false, reason: 'control-not-found', id };
    }
    if (control.disabled || control.matches(':disabled')) {
      return { ok: false, reason: 'control-disabled', id };
    }
    const previousValue = control.value;
    const prototype = control instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : control instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(control, String(value));
    control._valueTracker?.setValue?.(previousValue);
    if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
      control.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertReplacementText',
        data: String(value),
      }));
    } else {
      control.dispatchEvent(new Event('input', { bubbles: true }));
    }
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, id, value: control.value };
  })()`);
  assert(result.ok && result.value === String(value), `Unable to set control ${id}: ${JSON.stringify(result)}`);
  await sleep(80);
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

const selectSiteScopeSite = async (client, siteId) => {
  let result = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    result = await evaluate(client, `(() => {
      const select = document.querySelector('[data-testid="settings-site-scope-site"]');
      if (!(select instanceof HTMLSelectElement)) {
        return { ok: false, reason: 'select-not-found' };
      }
      const options = Array.from(select.options).map((option) => option.value);
      if (!options.includes(${JSON.stringify(siteId)})) {
        return {
          ok: true,
          waiting: true,
          value: select.value,
          options,
          notice: document.querySelector('[data-testid="settings-site-scope"]')?.textContent?.replace(/\\s+/g, ' ').trim().slice(0, 1000) || '',
          resources: performance.getEntriesByType('resource')
            .filter((entry) => String(entry.name).includes('/api/admin/sites'))
            .map((entry) => ({ name: entry.name, responseEnd: entry.responseEnd, transferSize: entry.transferSize }))
            .slice(-6),
        };
      }
      const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
      const previousValue = select.value;
      descriptor?.set?.call(select, ${JSON.stringify(siteId)});
      select._valueTracker?.setValue?.(previousValue);
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        ok: true,
        value: select.value,
        options,
        notice: document.querySelector('[data-testid="settings-site-scope"]')?.textContent?.replace(/\\s+/g, ' ').trim().slice(0, 1000) || '',
      };
    })()`);
    if (result.ok && result.value === siteId) {
      break;
    }
    await sleep(250);
  }
  assert(result?.ok && result.value === siteId, `Unable to select site-scoped settings site: ${JSON.stringify(result)}`);
  await sleep(250);
  return result;
};

const waitForSiteScopeEditable = async (client, siteId) => {
  let last = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      hasPanel: Boolean(document.querySelector('[data-testid="settings-site-scope-panel"]')),
      schema: document.querySelector('[data-testid="settings-site-scope-panel"]')?.textContent?.includes('backy.site-settings-scope.v1') || false,
      endpoint: document.querySelector('[data-testid="settings-site-scope-panel"]')?.textContent?.includes('/api/admin/sites/') || false,
      selected: document.querySelector('[data-testid="settings-site-scope-site"]')?.value || '',
      titleTemplateDisabled: document.querySelector('[data-testid="settings-site-scope-title-template"]')?.matches(':disabled') ?? true,
      saveDisabled: Array.from(document.querySelectorAll('button')).some((button) => (
        (button.textContent || '').includes('No site changes') && button.disabled
      )),
      notice: document.querySelector('[data-testid="settings-site-scope-panel"]')?.textContent?.slice(0, 500) || '',
    }))()`);
    last = state;
    if (
      state.hasPanel &&
      state.schema &&
      state.endpoint &&
      state.selected === siteId &&
      !state.titleTemplateDisabled &&
      state.saveDisabled
    ) {
      return state;
    }
    await sleep(150);
  }

  throw new Error(`Site-scoped settings panel did not become editable: ${JSON.stringify(last)}`);
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
      !rotatedSessionState.token &&
      rotatedSessionState.issuedAt &&
      rotatedSessionState.expiresAt &&
      rotatedSessionState.authMode === 'local-demo',
    `Current session did not rotate through Settings UI: ${JSON.stringify(rotatedSessionState)}`,
  );
  const rotatedSessionPayload = await evaluate(client, `(async () => {
    const response = await fetch(${JSON.stringify(`${API_BASE_URL}/api/admin/auth/session`)}, {
      credentials: 'include',
    });
    const payload = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      status: response.status,
      payload,
    };
  })()`);
  assert(
    rotatedSessionPayload.ok && rotatedSessionPayload.payload?.data?.session?.token,
    `Rotated cookie session was not readable through auth/session: ${rotatedSessionPayload.status} ${JSON.stringify(rotatedSessionPayload.payload).slice(0, 500)}`,
  );
  ownerSession.session = {
    ...ownerSession.session,
    token: rotatedSessionPayload.payload.data.session.token,
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

const updateSettingsThroughUi = async (client, suffix, originalSettings, notificationWebhookUrl, siteScopeSite) => {
  const initial = await navigateToSettings(client);
  const originalGeneral = originalSettings?.integrations?.general || {};

  await openSettingsTab(client, 'Delivery', 'tab=delivery');
  const delivery = await setDeliveryMode(client, 'custom-frontend');

  await openSettingsTab(client, 'General', 'tab=general');
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const loaded = await evaluate(client, `(() => ({
      siteName: document.querySelector('#settings-site-name')?.value || '',
      disabled: document.querySelector('#settings-site-name')?.matches(':disabled') ?? true,
      fieldsetTitle: document.querySelector('#settings-tab-content fieldset')?.getAttribute('title') || '',
      permissionWarning: Array.from(document.querySelectorAll('[role="alert"], [data-testid*="notice"], .border-warning'))
        .map((element) => element.textContent?.replace(/\\s+/g, ' ').trim())
        .filter(Boolean)
        .join(' | ')
        .slice(0, 500),
      authUser: (() => {
        try {
          return JSON.parse(localStorage.getItem('backy-auth-storage') || '{}')?.state?.user || null;
        } catch {
          return null;
        }
      })(),
	      permissionResource: performance.getEntriesByType('resource')
	        .filter((entry) => String(entry.name).includes('/api/admin/users/user-admin/permissions'))
	        .map((entry) => ({ name: entry.name, responseEnd: entry.responseEnd, transferSize: entry.transferSize }))
	        .at(-1) || null,
	      body: document.body?.innerText?.slice(0, 700) || '',
	    }))()`);
    if (
      loaded.siteName === (originalGeneral.siteName || '') &&
      !loaded.disabled
    ) {
      break;
    }
    if (attempt === 79) {
      throw new Error(`General settings did not finish backend hydration: ${JSON.stringify(loaded)}`);
    }
    await sleep(150);
  }
  const expectedGeneralState = {
    siteName: `Backy Smoke ${suffix}`,
    siteDescription: `Settings smoke coverage ${suffix}`,
    timezone: 'America/New_York',
  };
  let generalState = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await setLabeledControl(client, 'Site Name', expectedGeneralState.siteName, { exact: true });
    await setLabeledControl(client, 'Site Description', expectedGeneralState.siteDescription, { exact: true });
    await setLabeledControl(client, 'Timezone', expectedGeneralState.timezone, { exact: true });
    await sleep(150);
    generalState = await evaluate(client, `(() => ({
      siteName: document.querySelector('#settings-site-name')?.value || '',
      siteDescription: document.querySelector('#settings-site-description')?.value || '',
      timezone: document.querySelector('#settings-timezone')?.value || '',
    }))()`);
    if (
      generalState.siteName === expectedGeneralState.siteName &&
      generalState.siteDescription === expectedGeneralState.siteDescription &&
      generalState.timezone === expectedGeneralState.timezone
    ) {
      break;
    }
  }
  assert(
    generalState?.siteName === expectedGeneralState.siteName &&
    generalState?.siteDescription === expectedGeneralState.siteDescription &&
    generalState?.timezone === expectedGeneralState.timezone,
    `General settings controls did not accept input: ${JSON.stringify({ actual: generalState, expected: expectedGeneralState })}`,
  );
  const generalSaved = await saveSettings(client);
  let persistedGeneral = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const persisted = await readSettings();
    persistedGeneral = persisted.integrations?.general || null;
    if (
      persistedGeneral?.siteName === expectedGeneralState.siteName &&
      persistedGeneral?.siteDescription === expectedGeneralState.siteDescription &&
      persistedGeneral?.timezone === expectedGeneralState.timezone
    ) {
      break;
    }
    if (attempt === 39) {
      throw new Error(`General settings did not persist before continuing: ${JSON.stringify({
        actual: persistedGeneral,
        expected: expectedGeneralState,
      })}`);
    }
    await sleep(250);
  }

  await selectSiteScopeSite(client, siteScopeSite.id);
  const siteScopeInitial = await waitForSiteScopeEditable(client, siteScopeSite.id);
  const expectedSiteScopeDraft = {
    titleTemplate: `%s | Scoped ${suffix}`,
    description: `Scoped site description ${suffix}`,
    googleAnalyticsId: `G-SCOPED${suffix.toUpperCase().replace(/[^A-Z0-9]/g, '')}`,
    plausibleDomain: `scoped-${suffix}.example.com`,
    twitter: `https://twitter.com/${suffix}`,
    github: `https://github.com/backy/${suffix}`,
    linkedin: `https://www.linkedin.com/company/${suffix}`,
    defaultLocale: 'en',
    localeStrategy: 'path-prefix',
    locales: `en | English | ltr | |\nfr | French | ltr | /fr |`,
    moderationMode: 'auto-approve',
    blockedTerms: `scoped-${suffix}\nblocked-${suffix}`,
  };
  let siteScopeDraftState = null;
  let siteScopeDraftError = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await waitForSiteScopeEditable(client, siteScopeSite.id);
      await setControlValueById(client, 'settings-site-scope-title-template', expectedSiteScopeDraft.titleTemplate);
      await setControlValueById(client, 'settings-site-scope-description', expectedSiteScopeDraft.description);
      await setControlValueById(client, 'settings-site-scope-ga', expectedSiteScopeDraft.googleAnalyticsId);
      await setControlValueById(client, 'settings-site-scope-plausible', expectedSiteScopeDraft.plausibleDomain);
      await setControlValueById(client, 'settings-site-scope-twitter', expectedSiteScopeDraft.twitter);
      await setControlValueById(client, 'settings-site-scope-github', expectedSiteScopeDraft.github);
      await setControlValueById(client, 'settings-site-scope-linkedin', expectedSiteScopeDraft.linkedin);
      await setControlValueById(client, 'settings-site-scope-default-locale', expectedSiteScopeDraft.defaultLocale);
      await setControlValueById(client, 'settings-site-scope-locale-strategy', expectedSiteScopeDraft.localeStrategy);
      await setControlValueById(client, 'settings-site-scope-locales', expectedSiteScopeDraft.locales);
      await setControlValueById(client, 'settings-site-scope-moderation', expectedSiteScopeDraft.moderationMode);
      await setControlValueById(client, 'settings-site-scope-blocked-terms', expectedSiteScopeDraft.blockedTerms);
    } catch (error) {
      siteScopeDraftError = error instanceof Error ? error.message : String(error);
      await sleep(150);
      continue;
    }
    await sleep(150);
    siteScopeDraftState = await evaluate(client, `(() => ({
      titleTemplate: document.querySelector('[data-testid="settings-site-scope-title-template"]')?.value || '',
      description: document.querySelector('[data-testid="settings-site-scope-description"]')?.value || '',
      googleAnalyticsId: document.querySelector('[data-testid="settings-site-scope-ga"]')?.value || '',
      plausibleDomain: document.querySelector('[data-testid="settings-site-scope-plausible"]')?.value || '',
      twitter: document.querySelector('[data-testid="settings-site-scope-twitter"]')?.value || '',
      github: document.querySelector('[data-testid="settings-site-scope-github"]')?.value || '',
      linkedin: document.querySelector('[data-testid="settings-site-scope-linkedin"]')?.value || '',
      defaultLocale: document.querySelector('[data-testid="settings-site-scope-default-locale"]')?.value || '',
      localeStrategy: document.querySelector('[data-testid="settings-site-scope-locale-strategy"]')?.value || '',
      locales: document.querySelector('[data-testid="settings-site-scope-locales"]')?.value || '',
      moderationMode: document.querySelector('[data-testid="settings-site-scope-moderation"]')?.value || '',
      blockedTerms: document.querySelector('[data-testid="settings-site-scope-blocked-terms"]')?.value || '',
    }))()`);
    if (Object.entries(expectedSiteScopeDraft).every(([key, value]) => siteScopeDraftState?.[key] === value)) {
      break;
    }
  }
  assert(
    Object.entries(expectedSiteScopeDraft).every(([key, value]) => siteScopeDraftState?.[key] === value),
    `Site-scoped settings controls did not accept input: ${JSON.stringify({ actual: siteScopeDraftState, expected: expectedSiteScopeDraft, lastError: siteScopeDraftError })}`,
  );
  await clickByText(client, 'Save site settings');
  await waitForText(client, 'Site-scoped settings saved.');
  await waitForText(client, 'Site settings updated');
  await waitForSiteScopeEditable(client, siteScopeSite.id);
  await setControlValueById(client, 'settings-site-scope-description', `Discard me ${suffix}`);
  await clickByText(client, 'Discard site changes');
  await waitForText(client, 'Site-scoped settings changes discarded.');
  const siteScopeSaved = await evaluate(client, `(() => ({
    titleTemplate: document.querySelector('[data-testid="settings-site-scope-title-template"]')?.value || '',
    description: document.querySelector('[data-testid="settings-site-scope-description"]')?.value || '',
    googleAnalyticsId: document.querySelector('[data-testid="settings-site-scope-ga"]')?.value || '',
    plausibleDomain: document.querySelector('[data-testid="settings-site-scope-plausible"]')?.value || '',
    twitter: document.querySelector('[data-testid="settings-site-scope-twitter"]')?.value || '',
    github: document.querySelector('[data-testid="settings-site-scope-github"]')?.value || '',
    linkedin: document.querySelector('[data-testid="settings-site-scope-linkedin"]')?.value || '',
    defaultLocale: document.querySelector('[data-testid="settings-site-scope-default-locale"]')?.value || '',
    localeStrategy: document.querySelector('[data-testid="settings-site-scope-locale-strategy"]')?.value || '',
    locales: document.querySelector('[data-testid="settings-site-scope-locales"]')?.value || '',
    moderationMode: document.querySelector('[data-testid="settings-site-scope-moderation"]')?.value || '',
    blockedTerms: document.querySelector('[data-testid="settings-site-scope-blocked-terms"]')?.value || '',
    notice: document.querySelector('[data-testid="settings-site-scope-panel"]')?.textContent || '',
    audit: document.querySelector('[data-testid="settings-site-scope-audit"]')?.textContent || '',
    discardDisabled: Array.from(document.querySelectorAll('button')).some((button) => (
      (button.textContent || '').includes('Discard site changes') && button.disabled
    )),
  }))()`);
  assert(
    siteScopeSaved.titleTemplate === `%s | Scoped ${suffix}` &&
      siteScopeSaved.description === `Scoped site description ${suffix}` &&
      siteScopeSaved.googleAnalyticsId === `G-SCOPED${suffix.toUpperCase().replace(/[^A-Z0-9]/g, '')}` &&
      siteScopeSaved.plausibleDomain === `scoped-${suffix}.example.com` &&
      siteScopeSaved.twitter === `https://twitter.com/${suffix}` &&
      siteScopeSaved.github === `https://github.com/backy/${suffix}` &&
      siteScopeSaved.linkedin === `https://www.linkedin.com/company/${suffix}` &&
      siteScopeSaved.defaultLocale === 'en' &&
      siteScopeSaved.localeStrategy === 'path-prefix' &&
      siteScopeSaved.locales.includes('fr | French | ltr | /fr') &&
      siteScopeSaved.moderationMode === 'auto-approve' &&
      siteScopeSaved.blockedTerms.includes(`scoped-${suffix}`) &&
      siteScopeSaved.notice.includes('Site-scoped settings changes discarded.') &&
      siteScopeSaved.discardDisabled,
    `Site-scoped settings UI did not retain saved values: ${JSON.stringify(siteScopeSaved)}`,
  );
  let siteScopeAudit = siteScopeSaved.audit;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    siteScopeAudit = await evaluate(client, `document.querySelector('[data-testid="settings-site-scope-audit"]')?.textContent || ''`);
    if (
      siteScopeAudit.includes('Site settings audit') &&
      siteScopeAudit.includes('Site settings updated') &&
      siteScopeAudit.includes('analytics') &&
      siteScopeAudit.includes('req_')
    ) {
      break;
    }
    await sleep(250);
  }
  assert(
    siteScopeAudit.includes('Site settings audit') &&
      siteScopeAudit.includes('Site settings updated') &&
      siteScopeAudit.includes('analytics') &&
      siteScopeAudit.includes('req_'),
    `Site-scoped settings audit did not render the saved request: ${JSON.stringify({ ...siteScopeSaved, audit: siteScopeAudit })}`,
  );

  const handoffState = await evaluate(client, `(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const copy = buttons.find((button) => (button.textContent || '').includes('Copy handoff'));
    if (!(copy instanceof HTMLButtonElement) || copy.disabled) {
      return { ok: false, reason: 'copy-unavailable' };
    }
    const writes = [];
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value) => {
          writes.push(value);
        },
      },
    });
    copy.click();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard,
    });
    const payload = JSON.parse(writes[0] || '{}');
    return {
      ok: true,
      hasScopedSettings: payload.siteScopedSettings?.schemaVersion === 'backy.site-settings-scope.v1',
      siteId: payload.siteScopedSettings?.scope?.siteId || '',
      endpoint: payload.siteScopedSettings?.endpoints?.siteSettings || '',
      editableSections: payload.siteScopedSettings?.editableSections || [],
      dirty: payload.siteScopedSettings?.dirty,
      description: payload.siteScopedSettings?.savedSiteSettings?.seo?.defaultDescription || '',
      analytics: payload.siteScopedSettings?.savedSiteSettings?.analytics?.googleAnalyticsId || '',
      localization: payload.siteScopedSettings?.savedSiteSettings?.localization || null,
    };
  })()`);
  assert(
    handoffState.ok &&
      handoffState.hasScopedSettings &&
      handoffState.siteId === siteScopeSite.id &&
      handoffState.endpoint.includes(`/api/admin/sites/${siteScopeSite.id}/settings`) &&
      handoffState.editableSections.includes('analytics') &&
      handoffState.editableSections.includes('localization') &&
      handoffState.dirty === false &&
      handoffState.description === `Scoped site description ${suffix}` &&
      handoffState.analytics === `G-SCOPED${suffix.toUpperCase().replace(/[^A-Z0-9]/g, '')}` &&
      handoffState.localization?.defaultLocale === 'en' &&
      handoffState.localization?.localeStrategy === 'path-prefix' &&
      handoffState.localization?.locales?.some((locale) => locale.code === 'fr' && locale.pathPrefix === '/fr'),
    `Settings handoff manifest did not include saved site-scoped settings: ${JSON.stringify(handoffState)}`,
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

  const infrastructureState = await evaluate(client, `(() => {
    const runbookText = document.querySelector('[data-testid="settings-release-certification-runbook"]')?.textContent || '';
    return {
    search: window.location.search,
    text: document.querySelector('#settings-tab-content')?.textContent?.slice(0, 500) || '',
    hasEnvContract: document.body?.innerText?.includes('Environment contract') || document.body?.innerText?.includes('Copy the environment contract'),
    hasEnvValidationMatrix: Boolean(document.querySelector('[data-testid="settings-env-validation-matrix"]')),
    hasMediaScannerRuntime: document.body?.innerText?.includes('Media scanner runtime') || false,
    hasNotificationRuntime: document.body?.innerText?.includes('Notification runtime') || false,
    hasCommerceRuntime: document.body?.innerText?.includes('Commerce runtime') || false,
    hasInteractiveComponentRuntime: document.body?.innerText?.includes('Interactive component runtime') || false,
    hasCommerceWebhookSecretEnv: document.body?.innerText?.includes('Commerce webhook signing secret') || false,
    hasNotificationHttpEndpointEnv: document.body?.innerText?.includes('HTTP delivery endpoint') && document.body?.innerText?.includes('BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL'),
    hasNotificationSmtpAuthEnv: document.body?.innerText?.includes('SMTP username') && document.body?.innerText?.includes('SMTP_PASSWORD'),
    hasVercelAliasEnv: document.body?.innerText?.includes('BACKY_VERCEL_TOKEN') && document.body?.innerText?.includes('BACKY_VERCEL_PROJECT_ID'),
    hasComponentRegistryEnv: document.body?.innerText?.includes('Interactive component registry') || false,
    hasComponentSandboxEnv: document.body?.innerText?.includes('Code component sandbox origin') || false,
    hasStripeApiEnv: document.body?.innerText?.includes('Payment provider API key') || false,
    hasStripeApiBaseEnv: document.body?.innerText?.includes('Stripe API base URL') || false,
    hasStripeApiVersionEnv: document.body?.innerText?.includes('Stripe API version') || false,
    hasStripeDiscountApiBaseEnv: document.body?.innerText?.includes('Stripe discount API base URL') || false,
    hasPaddleSubscriptionEnv: document.body?.innerText?.includes('Paddle subscription API key') || false,
    hasShopifyCatalogEnv: document.body?.innerText?.includes('Shopify catalog access token') || false,
    hasBigCommerceCatalogEnv: document.body?.innerText?.includes('BigCommerce catalog access token') || false,
    hasWooCommerceCatalogEnv: document.body?.innerText?.includes('WooCommerce consumer key') || false,
    hasEtsyCatalogEnv: document.body?.innerText?.includes('Etsy access token') || false,
    hasEasyPostLabelEnv: document.body?.innerText?.includes('EasyPost label API key') || false,
    hasStorageSecretRefs: document.body?.innerText?.includes('Storage credentials stay in deployment env') || false,
    hasInfrastructureCheck: document.body?.innerText?.includes('Run infrastructure check') || false,
    hasStorageProbe: document.body?.innerText?.includes('Run storage probe') || false,
    hasRotationProbe: document.body?.innerText?.includes('Run rotation probe') || false,
    hasSecretManagerPlan: document.body?.innerText?.includes('Plan env sync') || false,
    hasSecretManagerPromote: document.body?.innerText?.includes('Promote env') || false,
    hasSecretManagerRevoke: document.body?.innerText?.includes('Revoke next env') || false,
    hasReleaseCertificationRunbook: Boolean(runbookText),
    hasReleaseCertificationWorkflow: runbookText.includes('.github/workflows/backy-release-certification.yml'),
    hasReleaseCertificationPreflight: runbookText.includes('npm run test:release-certification-preflight-contract'),
    hasReleaseCertificationDatabaseGate: runbookText.includes('certify_database') && runbookText.includes('BACKY_DATABASE_URL') && runbookText.includes('DATABASE_URL'),
    hasReleaseCertificationSettingsGate: runbookText.includes('certify_settings_providers') && runbookText.includes('ci:settings-provider-certification'),
    hasReleaseCertificationCommerceGate: runbookText.includes('certify_commerce_providers') && runbookText.includes('ci:commerce-provider-certification'),
    hasProviderCertificationMatrix: Boolean(document.querySelector('[data-testid="settings-provider-certification"]')),
    hasProviderCertificationSettings: runbookText.includes('Provider certification matrix') && runbookText.includes('npm run ci:settings-provider-certification'),
    hasProviderCertificationCommerce: runbookText.includes('npm run ci:commerce-provider-certification') && runbookText.includes('COMMERCE_WEBHOOK_SECRET'),
    hasProviderCertificationFamilies: runbookText.includes('Supabase/Postgres') && runbookText.includes('Vercel env secret manager') && runbookText.includes('Resend') && runbookText.includes('Magento'),
    hasReleaseCertificationStorageAliases: runbookText.includes('BACKY_MEDIA_STORAGE_PROVIDER') && runbookText.includes('SUPABASE_SERVICE_ROLE_KEY') && runbookText.includes('AWS_ACCESS_KEY_ID'),
    hasReleaseCertificationNotificationAliases: runbookText.includes('RESEND_API_KEY') && runbookText.includes('SMTP_HOST') && runbookText.includes('SMTP_USER') && runbookText.includes('SMTP_PASSWORD') && runbookText.includes('BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL'),
    hasReleaseCertificationCommerceAliases: runbookText.includes('STRIPE_SECRET_KEY') && runbookText.includes('PAYPAL_ACCESS_TOKEN') && runbookText.includes('SHOPIFY_ADMIN_ACCESS_TOKEN') && runbookText.includes('COMMERCE_WEBHOOK_SECRET'),
    hasReleaseCertificationCommerceHttpAliases: runbookText.includes('COMMERCE_TAX_PROVIDER_URL') && runbookText.includes('COMMERCE_SHIPPING_PROVIDER_URL') && runbookText.includes('COMMERCE_PRODUCT_SYNC_URL') && runbookText.includes('COMMERCE_SUBSCRIPTION_ACTION_URL'),
  };
})()`);
  assert(infrastructureState.search.includes('tab=infrastructure'), `Infrastructure tab search state was not persisted: ${JSON.stringify(infrastructureState)}`);
  assert(infrastructureState.hasEnvContract, `Infrastructure env contract was not visible: ${JSON.stringify(infrastructureState)}`);
  assert(
    infrastructureState.hasEnvValidationMatrix &&
    infrastructureState.hasMediaScannerRuntime &&
    infrastructureState.hasNotificationRuntime &&
    infrastructureState.hasCommerceRuntime &&
    infrastructureState.hasInteractiveComponentRuntime &&
    infrastructureState.hasCommerceWebhookSecretEnv &&
    infrastructureState.hasNotificationHttpEndpointEnv &&
    infrastructureState.hasNotificationSmtpAuthEnv &&
    infrastructureState.hasVercelAliasEnv &&
    infrastructureState.hasComponentRegistryEnv &&
    infrastructureState.hasComponentSandboxEnv &&
    infrastructureState.hasStripeApiEnv &&
    infrastructureState.hasStripeApiBaseEnv &&
    infrastructureState.hasStripeApiVersionEnv &&
    infrastructureState.hasStripeDiscountApiBaseEnv &&
    infrastructureState.hasPaddleSubscriptionEnv &&
    infrastructureState.hasShopifyCatalogEnv &&
    infrastructureState.hasBigCommerceCatalogEnv &&
    infrastructureState.hasWooCommerceCatalogEnv &&
    infrastructureState.hasEtsyCatalogEnv &&
    infrastructureState.hasEasyPostLabelEnv &&
    infrastructureState.hasStorageSecretRefs,
    `Infrastructure environment validation did not expose broader runtime coverage: ${JSON.stringify(infrastructureState)}`,
  );
  assert(infrastructureState.hasInfrastructureCheck, `Infrastructure check control was not visible: ${JSON.stringify(infrastructureState)}`);
  assert(infrastructureState.hasStorageProbe, `Storage provisioning probe control was not visible: ${JSON.stringify(infrastructureState)}`);
  await clickByText(client, 'Run storage probe');
  await waitForText(client, 'Run rotation probe');
  const storageOperationState = await evaluate(client, `(() => ({
    hasRotationProbe: document.body?.innerText?.includes('Run rotation probe') || false,
    hasSecretManagerPlan: document.body?.innerText?.includes('Plan env sync') || false,
    hasSecretManagerPromote: document.body?.innerText?.includes('Promote env') || false,
    hasSecretManagerRevoke: document.body?.innerText?.includes('Revoke next env') || false,
    body: document.querySelector('#settings-tab-content')?.textContent?.slice(0, 1200) || '',
  }))()`);
  assert(
    storageOperationState.hasRotationProbe &&
      storageOperationState.hasSecretManagerPlan &&
      storageOperationState.hasSecretManagerPromote &&
      storageOperationState.hasSecretManagerRevoke,
    `Storage provider operation controls were not visible after storage probe: ${JSON.stringify(storageOperationState)}`,
  );
  assert(
    infrastructureState.hasReleaseCertificationRunbook &&
      infrastructureState.hasReleaseCertificationWorkflow &&
      infrastructureState.hasReleaseCertificationPreflight &&
      infrastructureState.hasReleaseCertificationDatabaseGate &&
      infrastructureState.hasReleaseCertificationSettingsGate &&
      infrastructureState.hasReleaseCertificationCommerceGate &&
      infrastructureState.hasProviderCertificationMatrix &&
      infrastructureState.hasProviderCertificationSettings &&
      infrastructureState.hasProviderCertificationCommerce &&
      infrastructureState.hasProviderCertificationFamilies &&
      infrastructureState.hasReleaseCertificationStorageAliases &&
      infrastructureState.hasReleaseCertificationNotificationAliases &&
      infrastructureState.hasReleaseCertificationCommerceAliases &&
      infrastructureState.hasReleaseCertificationCommerceHttpAliases &&
      infrastructureState.hasVercelAliasEnv,
    `Settings release certification runbook was not visible: ${JSON.stringify(infrastructureState)}`,
  );
  await clickByText(client, 'Run infrastructure check');
  await waitForText(client, 'Infrastructure check results');
  const checkState = await evaluate(client, `(() => ({
    hasSupabase: document.body?.innerText?.includes('Supabase connection') || false,
    hasVercel: document.body?.innerText?.includes('Vercel deployment') || false,
    hasMediaScanner: document.body?.innerText?.includes('Media scanner') || false,
    hasNotificationDelivery: document.body?.innerText?.includes('Notification delivery') || false,
    hasCommerceSecrets: document.body?.innerText?.includes('Commerce webhook secrets') || false,
    hasStripeApiExecution: document.body?.innerText?.includes('Stripe API execution') || false,
    hasCatalogProviderCredentials: document.body?.innerText?.includes('Catalog provider credentials') || false,
    hasShippingProviderExecution: document.body?.innerText?.includes('Shipping provider execution') || false,
    hasSubscriptionLifecycleExecution: document.body?.innerText?.includes('Subscription lifecycle execution') || false,
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
      checkState.hasCatalogProviderCredentials &&
      checkState.hasShippingProviderExecution &&
      checkState.hasSubscriptionLifecycleExecution,
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
  await setLabeledControl(client, 'Product catalog sync provider', 'http');
  await setLabeledControl(client, 'Catalog sync endpoint URL', `https://catalog.example.com/${suffix}/products`);
  await setLabeledControl(client, 'Subscription lifecycle provider', 'http');
  await setLabeledControl(client, 'Subscription lifecycle endpoint URL', `https://subscriptions.example.com/${suffix}/actions`);
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
    hasCatalogSync: document.body?.innerText?.includes('Product catalog sync provider') &&
      document.body?.innerText?.includes('Catalog sync endpoint URL'),
    hasSubscriptionLifecycle: document.body?.innerText?.includes('Subscription lifecycle provider') &&
      document.body?.innerText?.includes('Subscription lifecycle endpoint URL'),
    hasShippingLabelExecution: document.body?.innerText?.includes('Shipping label execution') || false,
  }))()`);
  assert(commerceState.search.includes('tab=commerce'), `Commerce tab search state was not persisted: ${JSON.stringify(commerceState)}`);
  assert(
    commerceState.hasStorefrontHandoff &&
      commerceState.hasCheckoutProvider &&
      commerceState.hasSettlement &&
      commerceState.hasCatalogSync &&
      commerceState.hasSubscriptionLifecycle &&
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
  const deliveryApiState = await evaluate(client, `(() => {
    const text = document.querySelector('#settings-tab-content')?.textContent || document.body?.innerText || '';
    return {
      hasSiteSettingsRead: text.includes('GET') && text.includes('/sites/:siteId/settings'),
      hasSiteSettingsPatch: text.includes('PATCH') && text.includes('/sites/:siteId/settings'),
      hasScopedDescription: text.includes('site-scoped Settings envelope') || text.includes('site-owned Settings sections'),
    };
  })()`);
  assert(
    deliveryApiState.hasSiteSettingsRead && deliveryApiState.hasSiteSettingsPatch && deliveryApiState.hasScopedDescription,
    `Delivery API handoff did not expose site-scoped settings endpoints: ${JSON.stringify(deliveryApiState)}`,
  );
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
    generalSaved,
    infrastructureState,
    notificationWebhookState,
    siteScopeSaved,
    deliveryApiState,
    saved,
    layout,
  };
};

const assertPersistedSettings = (settings, suffix, notificationWebhookUrl) => {
  assert(settings.deliveryMode === 'custom-frontend', `Delivery mode was not persisted: ${settings.deliveryMode}`);
  assert(
    settings.integrations?.general?.siteName === `Backy Smoke ${suffix}`,
    `General site name was not persisted: ${JSON.stringify({
      expected: `Backy Smoke ${suffix}`,
      actual: settings.integrations?.general,
      appearance: settings.integrations?.appearance,
      seo: settings.integrations?.seo,
      deliveryMode: settings.deliveryMode,
    }).slice(0, 1000)}`,
  );
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
  assert(settings.runtimeCommerce?.stripeDiscountApiBaseUrl, `Commerce runtime Stripe discount API base URL was not reported: ${JSON.stringify(settings.runtimeCommerce)}`);
  assert(
    settings.runtimeCommerce?.paddleApiKeyConfigured === Boolean(process.env.BACKY_PADDLE_API_KEY || process.env.PADDLE_API_KEY),
    `Commerce runtime Paddle API key readiness did not match env: ${JSON.stringify(settings.runtimeCommerce)}`,
  );
  assert(settings.runtimeCommerce?.paddleApiBaseUrl, `Commerce runtime Paddle API base URL was not reported: ${JSON.stringify(settings.runtimeCommerce)}`);
  assert(settings.runtimeCommerce?.adyenRecurringApiBaseUrl, `Commerce runtime Adyen recurring API base URL was not reported: ${JSON.stringify(settings.runtimeCommerce)}`);
  assert(
    settings.runtimeCommerce?.shopifyAdminAccessTokenConfigured === Boolean(process.env.BACKY_SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN),
    `Commerce runtime Shopify catalog token readiness did not match env: ${JSON.stringify(settings.runtimeCommerce)}`,
  );
  assert(
    settings.runtimeCommerce?.bigCommerceAccessTokenConfigured === Boolean(process.env.BACKY_BIGCOMMERCE_ACCESS_TOKEN || process.env.BIGCOMMERCE_ACCESS_TOKEN),
    `Commerce runtime BigCommerce catalog token readiness did not match env: ${JSON.stringify(settings.runtimeCommerce)}`,
  );
  assert(
    settings.runtimeCommerce?.wooCommerceConsumerKeyConfigured === Boolean(process.env.BACKY_WOOCOMMERCE_CONSUMER_KEY || process.env.WOOCOMMERCE_CONSUMER_KEY),
    `Commerce runtime WooCommerce consumer key readiness did not match env: ${JSON.stringify(settings.runtimeCommerce)}`,
  );
  assert(
    settings.runtimeCommerce?.etsyAccessTokenConfigured === Boolean(process.env.BACKY_ETSY_ACCESS_TOKEN || process.env.ETSY_ACCESS_TOKEN),
    `Commerce runtime Etsy access token readiness did not match env: ${JSON.stringify(settings.runtimeCommerce)}`,
  );
  assert(
    settings.runtimeCommerce?.etsyApiKeyConfigured === Boolean(process.env.BACKY_ETSY_API_KEY || process.env.ETSY_API_KEY),
    `Commerce runtime Etsy API key readiness did not match env: ${JSON.stringify(settings.runtimeCommerce)}`,
  );
  assert(settings.runtimeCommerce?.etsyApiBaseUrl, `Commerce runtime Etsy API base URL was not reported: ${JSON.stringify(settings.runtimeCommerce)}`);
  assert(settings.runtimeInteractiveComponents?.registryProvider, `Interactive component registry runtime was not reported: ${JSON.stringify(settings.runtimeInteractiveComponents)}`);
  assert(
    settings.runtimeInteractiveComponents?.registryConfigured === true,
    `Interactive component registry readiness did not default to local-ready: ${JSON.stringify(settings.runtimeInteractiveComponents)}`,
  );
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
  assert(settings.integrations?.commerce?.catalogSyncProvider === 'http', 'Commerce catalog sync provider was not persisted');
  assert(settings.integrations?.commerce?.catalogSyncProviderUrl === `https://catalog.example.com/${suffix}/products`, 'Commerce catalog sync provider URL was not persisted');
  assert(settings.integrations?.commerce?.subscriptionActionProvider === 'http', 'Commerce subscription lifecycle provider was not persisted');
  assert(settings.integrations?.commerce?.subscriptionActionProviderUrl === `https://subscriptions.example.com/${suffix}/actions`, 'Commerce subscription lifecycle provider URL was not persisted');
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

const assertPersistedSiteScopedSettings = async (siteId, suffix) => {
  const scope = await readSiteSettingsScope(siteId);
  assert(scope.schemaVersion === 'backy.site-settings-scope.v1', `Site settings scope schema was not returned: ${JSON.stringify(scope).slice(0, 500)}`);
  assert(scope.scope?.siteId === siteId, `Site settings scope returned wrong site: ${JSON.stringify(scope.scope).slice(0, 500)}`);
  assert(scope.scope?.workspaceSettingsScope === 'global', `Site settings scope did not separate workspace settings: ${JSON.stringify(scope.scope).slice(0, 500)}`);
  assert(scope.scope?.siteSettingsScope === 'site', `Site settings scope did not mark site settings scope: ${JSON.stringify(scope.scope).slice(0, 500)}`);
  assert(scope.endpoints?.workspaceSettings === '/api/admin/settings', `Site settings scope missing workspace endpoint: ${JSON.stringify(scope.endpoints).slice(0, 500)}`);
  assert(scope.siteSettings?.seo?.titleTemplate === `%s | Scoped ${suffix}`, 'Site-scoped SEO title template was not persisted');
  assert(scope.siteSettings?.seo?.defaultDescription === `Scoped site description ${suffix}`, 'Site-scoped SEO description was not persisted');
  assert(scope.siteSettings?.analytics?.googleAnalyticsId === `G-SCOPED${suffix.toUpperCase().replace(/[^A-Z0-9]/g, '')}`, 'Site-scoped Google Analytics ID was not persisted');
  assert(scope.siteSettings?.analytics?.plausibleDomain === `scoped-${suffix}.example.com`, 'Site-scoped Plausible domain was not persisted');
  assert(scope.siteSettings?.social?.twitter === `https://twitter.com/${suffix}`, 'Site-scoped Twitter URL was not persisted');
  assert(scope.siteSettings?.social?.github === `https://github.com/backy/${suffix}`, 'Site-scoped GitHub URL was not persisted');
  assert(scope.siteSettings?.social?.linkedin === `https://www.linkedin.com/company/${suffix}`, 'Site-scoped LinkedIn URL was not persisted');
  assert(scope.siteSettings?.localization?.defaultLocale === 'en', 'Site-scoped default locale was not persisted');
  assert(scope.siteSettings?.localization?.localeStrategy === 'path-prefix', 'Site-scoped locale strategy was not persisted');
  assert(
    scope.siteSettings?.localization?.locales?.some((locale) => (
      locale.code === 'fr' &&
        locale.label === 'French' &&
        locale.direction === 'ltr' &&
        locale.pathPrefix === '/fr'
    )),
    `Site-scoped French locale was not persisted: ${JSON.stringify(scope.siteSettings?.localization).slice(0, 500)}`,
  );
  assert(scope.siteSettings?.commentPolicy?.moderationMode === 'auto-approve', 'Site-scoped comment moderation was not persisted');
  assert(scope.siteSettings?.commentPolicy?.blockedTerms?.includes(`scoped-${suffix}`), 'Site-scoped blocked term was not persisted');

  const audit = await requestApi(`/api/admin/audit-logs?siteId=${siteId}&entity=site&entityId=${siteId}&action=${encodeURIComponent('site.settings.updated')}`);
  assert(
    audit.data?.logs?.some((entry) => (
      entry.entity === 'site' &&
      entry.entityId === siteId &&
      entry.action === 'site.settings.updated' &&
      entry.metadata?.source === 'admin-site-settings-api' &&
      entry.metadata?.changedKeys?.includes('seo') &&
      entry.metadata?.changedKeys?.includes('analytics') &&
      entry.metadata?.changedKeys?.includes('social') &&
      entry.metadata?.changedKeys?.includes('localization') &&
      entry.metadata?.changedKeys?.includes('commentPolicy')
    )),
    `Site settings audit log did not include scoped update: ${JSON.stringify(audit.data?.logs || []).slice(0, 500)}`,
  );

  return scope;
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

  const catalogResponse = await fetch(`${API_BASE_URL}/api/admin/settings`, {
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
          catalogSyncProvider: 'http',
          catalogSyncProviderUrl: 'not-a-valid-url',
        },
      },
    }),
  });
  const catalogPayload = await catalogResponse.json().catch(() => ({}));

  assert(catalogResponse.status === 400, `Invalid catalog sync endpoint should be rejected, got ${catalogResponse.status}: ${JSON.stringify(catalogPayload).slice(0, 500)}`);
  assert(catalogPayload?.error?.code === 'VALIDATION_ERROR', `Invalid catalog sync endpoint rejection should return VALIDATION_ERROR: ${JSON.stringify(catalogPayload).slice(0, 500)}`);

  const afterCatalog = await readSettings();
  assert(
    afterCatalog.integrations?.commerce?.catalogSyncProviderUrl === settings.integrations?.commerce?.catalogSyncProviderUrl,
    `Rejected catalog sync endpoint patch should not mutate persisted commerce URL: ${JSON.stringify(afterCatalog.integrations?.commerce).slice(0, 500)}`,
  );

  const subscriptionResponse = await fetch(`${API_BASE_URL}/api/admin/settings`, {
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
          subscriptionActionProvider: 'http',
          subscriptionActionProviderUrl: 'not-a-valid-url',
        },
      },
    }),
  });
  const subscriptionPayload = await subscriptionResponse.json().catch(() => ({}));

  assert(subscriptionResponse.status === 400, `Invalid subscription lifecycle endpoint should be rejected, got ${subscriptionResponse.status}: ${JSON.stringify(subscriptionPayload).slice(0, 500)}`);
  assert(subscriptionPayload?.error?.code === 'VALIDATION_ERROR', `Invalid subscription lifecycle endpoint rejection should return VALIDATION_ERROR: ${JSON.stringify(subscriptionPayload).slice(0, 500)}`);

  const afterSubscription = await readSettings();
  assert(
    afterSubscription.integrations?.commerce?.subscriptionActionProviderUrl === settings.integrations?.commerce?.subscriptionActionProviderUrl,
    `Rejected subscription lifecycle endpoint patch should not mutate persisted commerce URL: ${JSON.stringify(afterSubscription.integrations?.commerce).slice(0, 500)}`,
  );

  return {
    status: response.status,
    catalogStatus: catalogResponse.status,
    subscriptionStatus: subscriptionResponse.status,
    code: payload.error?.code,
    catalogCode: catalogPayload.error?.code,
    subscriptionCode: subscriptionPayload.error?.code,
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
  assertSettingsSourceContracts();

  const suffix = `settings-smoke-${Date.now().toString(36)}`;
  const adminSession = await loginAdminApi();
  const originalSettings = await readSettings();
  const permissionDenials = await assertSettingsPermissionDenials(originalSettings);
  const baselineSettings = await normalizeSettingsSmokePreconditions(originalSettings);
  await setAdminPermissionOverrides({
    'settings.configure': 'allow',
    'settings.manageKeys': 'deny',
    'sites.view': 'allow',
    'sites.configure': 'allow',
  });
  await waitForAdminPermissionRules({
    'settings.view': true,
    'settings.configure': true,
    'settings.manageKeys': false,
    'sites.view': true,
    'sites.configure': true,
  });
  let ownerUserId = '';
  let ownerSession = null;
  let ownerOriginalSettings = null;
  const { childProcess, userDataDir } = launchChrome();
  let client;
  let restored = false;
  let adminPreloadIdentifier = '';
  let siteScopeSiteId = '';
  const webhookCapture = await createWebhookCaptureServer();

  try {
    const siteScopeSite = await createSite({
      name: `Settings Scope ${suffix}`,
      slug: `settings-scope-${suffix}`,
      description: 'Temporary settings smoke site scope target',
      status: 'draft',
    });
    siteScopeSiteId = siteScopeSite.id;
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
    await client.send('Network.enable');
    await seedBrowserSessionCookie(client, adminSession.session.token);
    const adminPreload = await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(adminSession.session.token),
    });
    adminPreloadIdentifier = adminPreload.identifier || '';

    const ui = await updateSettingsThroughUi(client, suffix, baselineSettings, webhookCapture.url, siteScopeSite);
    const ownerRotation = await assertOwnerCanRotateApiKeyThroughUi(
      client,
      ownerSession,
      ownerOriginalSettings,
      adminPreloadIdentifier,
    );
    const persisted = await readSettings();
    assertPersistedSettings(persisted, suffix, webhookCapture.url);
    const siteScope = await assertPersistedSiteScopedSettings(siteScopeSiteId, suffix);
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

    const restoreSnapshot = buildRestoreSettingsSnapshot(originalSettings, ownerOriginalSettings);
    await restoreSettingsWithFallback(restoreSnapshot, {
      sessionToken: ownerSession?.session?.token,
      includeApiKeys: Boolean(restoreSnapshot?.apiKeys && ownerSession?.session?.token),
    });
    restored = true;
    await deleteUser(ownerUserId);
    ownerUserId = '';
    await deleteSite(siteScopeSiteId);
    siteScopeSiteId = '';

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
        siteScope: {
          siteId: siteScope.scope.siteId,
          schemaVersion: siteScope.schemaVersion,
          seo: siteScope.siteSettings.seo,
          analytics: siteScope.siteSettings.analytics,
          social: siteScope.siteSettings.social,
          localization: siteScope.siteSettings.localization,
          commentPolicy: siteScope.siteSettings.commentPolicy,
        },
      },
      restored,
      screenshotPath: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await setAdminPermissionOverrides({
      'settings.configure': null,
      'settings.manageKeys': null,
      'sites.view': null,
      'sites.configure': null,
    }).catch((error) => {
      console.warn('Unable to restore default admin settings smoke permissions:', error instanceof Error ? error.message : error);
    });
    if (!restored) {
      const restoreSnapshot = buildRestoreSettingsSnapshot(originalSettings, ownerOriginalSettings);
      await restoreSettingsWithFallback(restoreSnapshot, {
        sessionToken: ownerSession?.session?.token,
        includeApiKeys: Boolean(restoreSnapshot?.apiKeys && ownerSession?.session?.token),
      }).catch((error) => {
        console.warn('Unable to restore original settings:', error instanceof Error ? error.message : error);
      });
    }
    if (ownerUserId) {
      await deleteUser(ownerUserId).catch((error) => {
        console.warn('Unable to remove temporary settings owner:', error instanceof Error ? error.message : error);
      });
    }
    if (siteScopeSiteId) {
      await deleteSite(siteScopeSiteId).catch((error) => {
        console.warn('Unable to remove temporary settings site:', error instanceof Error ? error.message : error);
      });
    }
    await webhookCapture.close().catch((error) => {
      console.warn('Unable to stop settings webhook capture server:', error instanceof Error ? error.message : error);
    });
    await cleanup({ client, childProcess, userDataDir });
  }
};

if (process.env.BACKY_SETTINGS_SOURCE_GUARD === '1') {
  assertSettingsSourceContracts();
  console.log(JSON.stringify({ ok: true, guard: 'settings-site-scoped-localization' }));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
