#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_SETTINGS_CDP_PORT || 9376);
const SCREENSHOT_PATH = process.env.BACKY_SETTINGS_SCREENSHOT || path.join(os.tmpdir(), 'backy-settings-smoke.png');
let apiAdminSessionToken = '';

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

const readSettings = async () => {
  const payload = await requestApi('/api/admin/settings');
  assert(payload.data?.settings, 'Settings API returned no settings payload');
  return payload.data.settings;
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

const authStorageScript = (sessionToken) => `
localStorage.setItem('backy-auth-storage', ${JSON.stringify(JSON.stringify({
  state: {
    user: { id: 'user-admin', email: 'admin@backy.io', fullName: 'Admin User', role: 'admin' },
    session: {
      token: sessionToken,
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

const updateSettingsThroughUi = async (client, suffix, originalSettings) => {
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
  await setLabeledControl(client, 'Private files', true);
  await setLabeledControl(client, 'Image transforms', true);
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
    hasInfrastructureCheck: document.body?.innerText?.includes('Run infrastructure check') || false,
  }))()`);
  assert(infrastructureState.search.includes('tab=infrastructure'), `Infrastructure tab search state was not persisted: ${JSON.stringify(infrastructureState)}`);
  assert(infrastructureState.hasEnvContract, `Infrastructure env contract was not visible: ${JSON.stringify(infrastructureState)}`);
  assert(infrastructureState.hasInfrastructureCheck, `Infrastructure check control was not visible: ${JSON.stringify(infrastructureState)}`);
  await clickByText(client, 'Run infrastructure check');
  await waitForText(client, 'Infrastructure check results');
  const checkState = await evaluate(client, `(() => ({
    hasSupabase: document.body?.innerText?.includes('Supabase connection') || false,
    hasVercel: document.body?.innerText?.includes('Vercel deployment') || false,
    hasBlocked: document.body?.innerText?.includes('blocked') || false,
    body: document.querySelector('#settings-tab-content')?.textContent?.slice(0, 1200) || '',
  }))()`);
  assert(
    checkState.hasSupabase && checkState.hasVercel,
    `Infrastructure check did not show provider diagnostics: ${JSON.stringify(checkState)}`,
  );

  await openSettingsTab(client, 'Commerce', 'tab=commerce');
  await setLabeledControl(client, 'Commerce mode', 'checkout-provider');
  await setLabeledControl(client, 'Default currency', 'EUR');
  await setLabeledControl(client, 'Payment provider', 'stripe');
  await setLabeledControl(client, 'Provider account ID', `acct_${suffix}`);
  await setLabeledControl(client, 'Provider mode', 'live');
  await setLabeledControl(client, 'Provider webhook URL', `https://hooks.example.com/commerce/${suffix}`);
  await setLabeledControl(client, 'Webhook secret reference', `stripe_whsec_${suffix}`);
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
  await setLabeledControl(client, 'Webhook events', true);
  const commerceState = await evaluate(client, `(() => ({
    search: window.location.search,
    hasStorefrontHandoff: document.body?.innerText?.includes('Storefront API handoff') || false,
    hasCheckoutProvider: document.body?.innerText?.includes('Checkout provider') || false,
    hasSettlement: document.body?.innerText?.includes('Settlement') || false,
  }))()`);
  assert(commerceState.search.includes('tab=commerce'), `Commerce tab search state was not persisted: ${JSON.stringify(commerceState)}`);
  assert(commerceState.hasStorefrontHandoff && commerceState.hasCheckoutProvider && commerceState.hasSettlement, `Commerce tab did not expose storefront handoff controls: ${JSON.stringify(commerceState)}`);

  await openSettingsTab(client, 'Notifications', 'tab=notifications');
  await setLabeledControl(client, 'New user registration', true);
  await setLabeledControl(client, 'Page published', true);
  await setLabeledControl(client, 'New form submission', true);
  await setLabeledControl(client, 'Pending comments', true);
  await setLabeledControl(client, 'Digest frequency', 'daily');
  await setLabeledControl(client, 'Webhook URL', `https://hooks.example.com/${suffix}`);

  await openSettingsTab(client, 'Security', 'tab=security');
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
    saved,
    layout,
  };
};

const assertPersistedSettings = (settings, suffix) => {
  assert(settings.deliveryMode === 'custom-frontend', `Delivery mode was not persisted: ${settings.deliveryMode}`);
  assert(settings.integrations?.general?.siteName === `Backy Smoke ${suffix}`, 'General site name was not persisted');
  assert(settings.integrations?.appearance?.primaryColor === '#0f766e', 'Appearance primary color was not persisted');
  assert(settings.integrations?.seo?.titleTemplate === `%s | Backy Smoke ${suffix}`, 'SEO title template was not persisted');
  assert(settings.integrations?.storage?.provider === 'supabase', 'Storage provider was not persisted');
  assert(settings.integrations?.storage?.bucket === `media-${suffix}`, 'Storage bucket was not persisted');
  assert(settings.integrations?.supabase?.projectRef === suffix, 'Supabase project ref was not persisted');
  assert(settings.integrations?.supabase?.databaseEnabled === true, 'Supabase database toggle was not persisted');
  assert(settings.integrations?.vercel?.projectId === `prj_${suffix}`, 'Vercel project id was not persisted');
  assert(settings.integrations?.vercel?.previewDeployments === true, 'Vercel preview toggle was not persisted');
  assert(settings.integrations?.commerce?.mode === 'checkout-provider', 'Commerce mode was not persisted');
  assert(settings.integrations?.commerce?.currency === 'EUR', 'Commerce currency was not persisted');
  assert(settings.integrations?.commerce?.paymentProvider === 'stripe', 'Commerce payment provider was not persisted');
  assert(settings.integrations?.commerce?.providerAccountId === `acct_${suffix}`, 'Commerce provider account ID was not persisted');
  assert(settings.integrations?.commerce?.providerMode === 'live', 'Commerce provider mode was not persisted');
  assert(settings.integrations?.commerce?.providerWebhookUrl === `https://hooks.example.com/commerce/${suffix}`, 'Commerce provider webhook URL was not persisted');
  assert(settings.integrations?.commerce?.providerWebhookSecretId === `stripe_whsec_${suffix}`, 'Commerce webhook secret reference was not persisted');
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
  assert(settings.integrations?.commerce?.reservationMinutes === 30, 'Commerce reservation window was not persisted');
  assert(settings.integrations?.notifications?.email?.newUser === true, 'Notification email toggle was not persisted');
  assert(settings.integrations?.notifications?.inApp?.comments === true, 'Notification in-app toggle was not persisted');
  assert(settings.integrations?.notifications?.webhookUrl === `https://hooks.example.com/${suffix}`, 'Notification webhook was not persisted');
  assert(settings.auth?.requireTwoFactor === true, 'Require 2FA toggle was not persisted');
  assert(settings.auth?.inviteOnly === true, 'Invite-only toggle was not persisted');
  assert(settings.auth?.minPasswordLength === 12, 'Password length was not persisted');
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
  await assertAdminKeyRotationDenied();
  const { childProcess, userDataDir } = launchChrome();
  let client;
  let restored = false;

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
      source: authStorageScript(adminSession.session.token),
    });

    const ui = await updateSettingsThroughUi(client, suffix, originalSettings);
    const persisted = await readSettings();
    assertPersistedSettings(persisted, suffix);

    const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));

    const browserErrors = client.events
      .filter((event) => (
        event.method === 'Runtime.exceptionThrown'
        || (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error')
      ))
      .map((event) => event.params);

    assert(browserErrors.length === 0, `Browser emitted errors: ${JSON.stringify(browserErrors.slice(0, 3))}`);

    await restoreSettings(originalSettings);
    restored = true;

    console.log(JSON.stringify({
      ok: true,
      url: `${ADMIN_BASE_URL}/settings`,
      ui,
      persisted: {
        deliveryMode: persisted.deliveryMode,
        general: persisted.integrations?.general,
        storage: persisted.integrations?.storage,
        supabase: persisted.integrations?.supabase,
        vercel: persisted.integrations?.vercel,
        commerce: persisted.integrations?.commerce,
        notifications: persisted.integrations?.notifications,
        auth: persisted.auth,
      },
      restored,
      screenshotPath: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    if (!restored) {
      await restoreSettings(originalSettings).catch((error) => {
        console.warn('Unable to restore original settings:', error instanceof Error ? error.message : error);
      });
    }
    await cleanup({ client, childProcess, userDataDir });
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
