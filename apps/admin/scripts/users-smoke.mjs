#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_USERS_SMOKE_SITE_ID || 'site-demo';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_USERS_CDP_PORT || 9382);
const SCREENSHOT_PATH = process.env.BACKY_USERS_SCREENSHOT || path.join(os.tmpdir(), 'backy-users-smoke.png');
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
      ...(apiAdminSessionToken ? { authorization: `Bearer ${apiAdminSessionToken}` } : {}),
      ...(options.headers || {}),
    },
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

const assertUsersApiRequiresAuth = async () => {
  const response = await fetch(`${API_BASE_URL}/api/admin/users`);
  const payload = await response.json().catch(() => ({}));

  assert(response.status === 401, `Users API should reject missing auth, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(payload?.success === false && payload?.error?.code === 'UNAUTHORIZED', `Users API missing auth envelope: ${JSON.stringify(payload).slice(0, 500)}`);
};

const assertUserPermissionOverridesAreEnforced = async () => {
  await requestApi('/api/admin/users/user-admin/permissions', {
    method: 'PATCH',
    body: JSON.stringify({
      overrides: {
        'users.create': 'deny',
      },
    }),
  });

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiAdminSessionToken}`,
      },
      body: JSON.stringify({
        fullName: 'Denied Permission Smoke',
        email: `denied-${Date.now()}@example.com`,
        role: 'viewer',
        status: 'invited',
      }),
    });
    const payload = await response.json().catch(() => ({}));

    assert(response.status === 403, `Denied users.create override should reject user creation, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(payload?.error?.code === 'FORBIDDEN_PERMISSION', `Denied override should return FORBIDDEN_PERMISSION: ${JSON.stringify(payload).slice(0, 500)}`);
  } finally {
    await requestApi('/api/admin/users/user-admin/permissions', {
      method: 'PATCH',
      body: JSON.stringify({
        overrides: {
          'users.create': null,
        },
      }),
    });
  }
};

const listUsers = async () => {
  const payload = await requestApi('/api/admin/users');
  return payload.data?.users || payload.users || [];
};

const createUser = async ({ fullName, email, role = 'admin', status = 'invited' }) => {
  const payload = await requestApi('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      fullName,
      email,
      role,
      status,
    }),
  });
  const user = payload.data?.user || payload.user;
  assert(user?.id, `Create user did not return a user: ${JSON.stringify(payload).slice(0, 500)}`);
  if (status === 'invited') {
    const invite = payload.data?.invite || payload.invite;
    const inviteDelivery = payload.data?.inviteDelivery;
    assert(invite?.inviteUrl?.includes('/accept-invite?token='), `Invited user create did not return an invite URL: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(invite.deliveryConfigured === true, `Invited user create did not queue invite delivery: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(inviteDelivery?.provider && inviteDelivery.status === 'queued', `Invited user create did not expose delivery metadata: ${JSON.stringify(inviteDelivery).slice(0, 500)}`);
  }
  return user;
};

const bulkUpdateUsers = async (input) => {
  const payload = await requestApi('/api/admin/users/bulk', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return payload.data;
};

const getUser = async (userId) => {
  const payload = await requestApi(`/api/admin/users/${userId}`);
  return payload.data?.user || payload.user;
};

const listUserAuditLogs = async (userId) => {
  const params = new URLSearchParams({ entity: 'user', entityId: userId, limit: '20' });
  const payload = await requestApi(`/api/admin/audit-logs?${params.toString()}`);
  return payload.data?.logs || payload.logs || [];
};

const deleteUser = async (userId) => {
  if (!userId) return;
  await requestApi(`/api/admin/users/${userId}`, { method: 'DELETE' });
};

const findUserByEmail = async (email) => {
  const users = await listUsers();
  return users.find((user) => user.email === email) || null;
};

const waitForUser = async (email, predicate = () => true) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const user = await findUserByEmail(email);
    if (user && predicate(user)) {
      return user;
    }
    await sleep(250);
  }

  throw new Error(`Timed out waiting for user ${email}`);
};

const waitForUserMissing = async (email) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const user = await findUserByEmail(email);
    if (!user) {
      return;
    }
    await sleep(250);
  }

  throw new Error(`Temporary user ${email} still exists after cleanup`);
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
    if ((attempt === 40 || attempt === 80) && !(state.body || '').trim()) {
      await client.send('Page.navigate', { url });
    }
    if (attempt === 119) {
      throw new Error(`${description} did not become ready: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const setInputValue = async (client, selector, value) => {
  const result = await evaluate(client, `(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!(input instanceof HTMLInputElement)) return { ok: false, reason: 'input-missing', selector: ${JSON.stringify(selector)} };
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: input.value };
  })()`);
  assert(result.ok, `Unable to set ${selector}: ${JSON.stringify(result)}`);
  return result;
};

const clickButton = async (client, label) => {
  const result = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
      (candidate.textContent || '').trim() === ${JSON.stringify(label)}
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        reason: 'button-missing',
        buttons: Array.from(document.querySelectorAll('button')).map((candidate) => candidate.textContent || '').slice(0, 40),
      };
    }
    if (button.disabled) return { ok: false, reason: 'button-disabled', label: ${JSON.stringify(label)} };
    button.click();
    return { ok: true };
  })()`);
  assert(result.ok, `Unable to click ${label}: ${JSON.stringify(result)}`);
};

const signInAdmin = async (client) => {
  await navigate(
    client,
    `${ADMIN_BASE_URL}/login`,
    `(() => ({
      ready: document.body?.innerText?.includes('Authenticated admin access') &&
        Boolean(document.querySelector('#email')) &&
        Boolean(document.querySelector('#password')),
      body: document.body?.innerText?.slice(0, 900) || '',
    }))()`,
    'Login page',
  );

  const loginResult = await evaluate(client, `(async () => {
    const response = await fetch(${JSON.stringify(`${API_BASE_URL}/api/admin/auth/login`)}, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@backy.io',
        password: ${JSON.stringify(process.env.BACKY_ADMIN_DEMO_PASSWORD || 'admin123')},
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false || !payload.data?.user || !payload.data?.session) {
      return { ok: false, status: response.status, payload };
    }
    localStorage.setItem('backy-auth-storage', JSON.stringify({
      state: {
        user: payload.data.user,
        session: payload.data.session,
      },
      version: 0,
    }));
    return {
      ok: true,
      userEmail: payload.data.user.email,
      hasToken: Boolean(payload.data.session.token),
    };
  })()`);
  assert(loginResult.ok, `Unable to create browser admin session: ${JSON.stringify(loginResult).slice(0, 1000)}`);

  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}/` });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const stored = JSON.parse(localStorage.getItem('backy-auth-storage') || '{}');
      return {
        ready: (
          (window.location.pathname === '/' && Boolean(document.querySelector('[data-testid="dashboard-command-center"]'))) ||
          Boolean(document.querySelector('[data-testid="dashboard-command-center"]'))
        ) &&
          stored?.state?.user?.email === 'admin@backy.io' &&
          Boolean(stored?.state?.session?.token),
        path: window.location.pathname,
        hasToken: Boolean(stored?.state?.session?.token),
        userEmail: stored?.state?.user?.email || '',
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`);
    if (state.ready) return state;
    if (attempt === 119) throw new Error(`Dashboard after login did not become ready: ${JSON.stringify(state)}`);
    await sleep(250);
  }

  return null;
};

const navigateToInvite = (client) => navigate(
  client,
  `${ADMIN_BASE_URL}/users/new?siteId=${encodeURIComponent(SITE_ID)}`,
  `(() => ({
    ready: Boolean(document.querySelector('[data-testid="user-invite-command-center"]')) &&
      document.body?.innerText?.includes('Invitation details'),
    body: document.body?.innerText?.slice(0, 800) || '',
  }))()`,
  'Invite page',
);

const navigateToUsers = (client, expectedText = 'Users command center') => navigate(
  client,
  `${ADMIN_BASE_URL}/users?siteId=${encodeURIComponent(SITE_ID)}`,
  `(() => ({
    ready: Boolean(document.querySelector('[data-testid="users-command-center"]')) &&
      document.body?.innerText?.includes(${JSON.stringify(expectedText)}),
    body: document.body?.innerText?.slice(0, 800) || '',
  }))()`,
  'Users page',
);

const fillInviteForm = async (client, { fullName, email }) => {
  let result = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    result = await evaluate(client, `(() => {
      const setInputValue = (input, value) => {
        const previousValue = input.value;
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        descriptor?.set?.call(input, value);
        input._valueTracker?.setValue(previousValue);
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
      };
      const nameInput = document.querySelector('[data-testid="user-invite-full-name"]');
      const emailInput = document.querySelector('[data-testid="user-invite-email"]');
      const adminRole = document.querySelector('[data-testid="user-invite-role-admin"]');
      const invitedStatus = document.querySelector('[data-testid="user-invite-status-invited"]');
      if (!(nameInput instanceof HTMLInputElement) || !(emailInput instanceof HTMLInputElement)) {
        return { ok: false, reason: 'inputs-missing', body: document.body?.innerText?.slice(0, 900) || '' };
      }
      setInputValue(nameInput, ${JSON.stringify(fullName)});
      setInputValue(emailInput, ${JSON.stringify(email)});
      if (adminRole instanceof HTMLInputElement && !adminRole.checked) {
        adminRole.click();
      }
      if (invitedStatus instanceof HTMLInputElement && !invitedStatus.checked) {
        invitedStatus.click();
      }
      const form = document.querySelector('[data-testid="user-invite-form"]');
      const payloadPreview = document.querySelector('[data-testid="user-invite-payload-preview"]');
      const payload = JSON.parse(payloadPreview?.textContent || '{}');
      const primarySubmit = document.querySelector('[data-testid="user-invite-submit-primary"]');
      const footerSubmit = document.querySelector('[data-testid="user-invite-submit-footer"]');
      return {
        ok: nameInput.value === ${JSON.stringify(fullName)} &&
          emailInput.value === ${JSON.stringify(email)} &&
          form?.getAttribute('data-can-submit') === 'true' &&
          form?.getAttribute('data-selected-role') === 'admin' &&
          form?.getAttribute('data-selected-status') === 'invited' &&
          payload.fullName === ${JSON.stringify(fullName)} &&
          payload.email === ${JSON.stringify(email.toLowerCase())} &&
          payload.role === 'admin' &&
          payload.status === 'invited' &&
          payload.createInvite === true &&
          primarySubmit instanceof HTMLButtonElement &&
          primarySubmit.disabled === false &&
          footerSubmit instanceof HTMLButtonElement &&
          footerSubmit.disabled === false,
        name: nameInput.value,
        email: emailInput.value,
        canSubmit: form?.getAttribute('data-can-submit') || '',
        selectedRole: form?.getAttribute('data-selected-role') || '',
        selectedStatus: form?.getAttribute('data-selected-status') || '',
        payload,
        primaryDisabled: primarySubmit instanceof HTMLButtonElement ? primarySubmit.disabled : null,
        footerDisabled: footerSubmit instanceof HTMLButtonElement ? footerSubmit.disabled : null,
      };
    })()`);
    if (result.ok) return result;
    await sleep(250);
  }

  assert(result?.ok, `Unable to fill invite form: ${JSON.stringify(result)}`);
};

const submitInviteFormAndAssertLink = async (client, email) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const clicked = await evaluate(client, `(() => {
      const button = document.querySelector('[data-testid="user-invite-submit-primary"]') ||
        Array.from(document.querySelectorAll('button')).find((candidate) => (candidate.textContent || '').trim() === 'Send invite');
      if (!(button instanceof HTMLButtonElement)) {
        return { ok: false, reason: 'button-missing' };
      }
      if (button.disabled) {
        return {
          ok: false,
          reason: 'button-disabled',
          values: {
            name: document.querySelector('[data-testid="user-invite-full-name"]') instanceof HTMLInputElement ? document.querySelector('[data-testid="user-invite-full-name"]').value : null,
            email: document.querySelector('[data-testid="user-invite-email"]') instanceof HTMLInputElement ? document.querySelector('[data-testid="user-invite-email"]').value : null,
            canSubmit: document.querySelector('[data-testid="user-invite-form"]')?.getAttribute('data-can-submit') || '',
            body: document.body?.innerText?.slice(0, 700) || '',
          },
        };
      }
      button.click();
      return { ok: true };
    })()`);
    if (clicked.ok) break;
    if (attempt === 79) {
      throw new Error(`Unable to click Send invite: ${JSON.stringify(clicked)}`);
    }
    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="user-invite-created-panel"]');
      const text = panel?.textContent || '';
      return {
        hasPanel: Boolean(panel),
        hasNotice: (document.body?.innerText || '').includes('Invited user created and invite email delivery was queued') ||
          (document.body?.innerText || '').includes('Invited user created. Copy the invite link below for manual delivery.'),
        hasDeliveryBackup: text.includes('Transactional delivery was queued') || text.includes('Delivery is still manual'),
        hasLink: text.includes('/accept-invite?token='),
        hasCopy: text.includes('Copy link'),
        hasEmail: (document.body?.innerText || '').includes(${JSON.stringify(email)}),
        text: text.slice(0, 900),
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`);
    if (state.hasPanel && state.hasNotice && state.hasDeliveryBackup && state.hasLink && state.hasCopy && state.hasEmail) {
      return state;
    }
    if (attempt === 79) {
      throw new Error(`Invite form did not expose manual invite link after create: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const waitForUsersPageUser = async (client, email) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="users-command-center"]')),
      hasUser: document.body?.innerText?.includes(${JSON.stringify(email)}) || false,
      path: window.location.pathname,
      body: document.body?.innerText?.slice(0, 900) || '',
    }))()`);
    if (state.ready && state.hasUser && state.path === '/users') {
      return state;
    }
    if (attempt === 119) {
      throw new Error(`Users page did not show invited user: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const waitForUsersSelfProtection = async (client) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const roleSelect = document.querySelector('select[aria-label="Change role for Admin User"]');
      const statusSelect = document.querySelector('select[aria-label="Change status for Admin User"]');
      const removeButton = document.querySelector('button[aria-label="Self removal locked for Admin User"]');
      return {
        hasYouPill: document.body?.innerText?.includes('You') || false,
        hasRoleLock: document.body?.innerText?.includes('Self role locked') || false,
        hasStatusLock: document.body?.innerText?.includes('Self status locked') || false,
        roleDisabled: roleSelect instanceof HTMLSelectElement && roleSelect.disabled,
        statusDisabled: statusSelect instanceof HTMLSelectElement && statusSelect.disabled,
        removeDisabled: removeButton instanceof HTMLButtonElement && removeButton.disabled,
        body: document.body?.innerText?.slice(0, 1600) || '',
      };
    })()`);
    if (state.hasYouPill && state.hasRoleLock && state.hasStatusLock && state.roleDisabled && state.statusDisabled && state.removeDisabled) {
      return state;
    }
    await sleep(250);
  }

  throw new Error('Users self-protection controls did not render for Admin User');
};

const setDirectoryUserSelect = async (client, fullName, labelPrefix, value) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const select = Array.from(document.querySelectorAll('select')).find((candidate) => (
        (candidate.getAttribute('aria-label') || '').startsWith(${JSON.stringify(labelPrefix)}) &&
        (candidate.getAttribute('aria-label') || '').includes(${JSON.stringify(fullName)})
      ));
      if (!(select instanceof HTMLSelectElement)) {
        return {
          ok: false,
          reason: 'select-missing',
          labels: Array.from(document.querySelectorAll('select')).map((candidate) => candidate.getAttribute('aria-label') || ''),
        };
      }
      const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
      descriptor?.set?.call(select, ${JSON.stringify(value)});
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true };
    })()`);

    if (result.ok) {
      return;
    }
    if (attempt === 79) {
      throw new Error(`Unable to set ${labelPrefix} to ${value}: ${JSON.stringify(result)}`);
    }
    await sleep(250);
  }
};

const openUserDetail = async (client, fullName) => {
  const result = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
      (candidate.getAttribute('aria-label') || '') === ${JSON.stringify(`Edit ${fullName}`)}
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        buttons: Array.from(document.querySelectorAll('button')).map((candidate) => candidate.getAttribute('aria-label') || candidate.textContent || '').slice(0, 80),
      };
    }
    if (button.disabled) return { ok: false, reason: 'button-disabled' };
    button.click();
    return { ok: true };
  })()`);

  assert(result.ok, `Unable to open user detail: ${JSON.stringify(result)}`);

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="user-detail-command-center"]')) &&
        document.body?.innerText?.includes(${JSON.stringify(fullName)}),
      path: window.location.pathname,
      body: document.body?.innerText?.slice(0, 900) || '',
    }))()`);
    if (state.ready && state.path.startsWith('/users/')) {
      return state;
    }
    if (attempt === 119) {
      throw new Error(`User detail did not render: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const waitForUserDetailSelfProtection = async (client) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const accessSelects = Array.from(document.querySelectorAll('#user-detail-access select'));
      const lifecycleButtons = Array.from(document.querySelectorAll('button')).filter((button) => (
        ['Activate', 'Set invited', 'Mark inactive', 'Suspend'].some((label) => (button.textContent || '').includes(label))
      ));
      const removeButton = Array.from(document.querySelectorAll('button')).find((button) => (
        (button.textContent || '').trim() === 'Remove user'
      ));
      const text = document.body?.innerText || '';
      return {
        hasSelfNotice: text.includes('You are editing your signed-in account'),
        roleDisabled: accessSelects[0] instanceof HTMLSelectElement && accessSelects[0].disabled,
        statusDisabled: accessSelects[1] instanceof HTMLSelectElement && accessSelects[1].disabled,
        lifecycleDisabled: lifecycleButtons.length >= 3 && lifecycleButtons.every((button) => button.disabled),
        removeDisabled: removeButton instanceof HTMLButtonElement && removeButton.disabled,
        body: text.slice(0, 1600),
      };
    })()`);
    if (state.hasSelfNotice && state.roleDisabled && state.statusDisabled && state.lifecycleDisabled && state.removeDisabled) {
      return state;
    }
    await sleep(250);
  }

  throw new Error('User detail self-protection controls did not render for Admin User');
};

const waitForUserDetailSessions = async (client) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="user-detail-sessions"]');
      const text = panel?.textContent || '';
      const protectedButton = Array.from(panel?.querySelectorAll('button') || []).find((button) => (
        (button.textContent || '').includes('Protected')
      ));
      return {
        ready: Boolean(panel),
        hasSessions: text.includes('Admin sessions'),
        hasCurrent: text.includes('Current session'),
        hasLocalDemo: text.includes('local-demo'),
        protectedDisabled: protectedButton instanceof HTMLButtonElement && protectedButton.disabled,
        text: text.slice(0, 1600),
      };
    })()`);
    if (state.ready && state.hasSessions && state.hasCurrent && state.hasLocalDemo && state.protectedDisabled) {
      return state;
    }
    await sleep(250);
  }

  throw new Error('User detail sessions panel did not show the protected current session');
};

const waitForUserDetailPermissionMatrix = async (client) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('#user-detail-permissions');
      const text = panel?.textContent || '';
      return {
        ready: Boolean(panel),
        hasMatrix: text.includes('Backend permission matrix'),
        hasUsersAccess: text.includes('Users and access'),
        hasSettings: text.includes('Settings and integrations'),
        hasAllowedSummary: text.includes('Allowed capabilities') && text.includes('/'),
        hasStatusGate: text.includes('Status gate'),
        text: text.slice(0, 1800),
      };
    })()`);
    if (state.ready && state.hasMatrix && state.hasUsersAccess && state.hasSettings && state.hasAllowedSummary && state.hasStatusGate) {
      return state;
    }
    if (attempt === 99) {
      throw new Error(`User detail permission matrix did not render: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const setUserDetailPermissionOverride = async (client, userId) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const button = document.querySelector('[data-testid="permission-activity.export-deny"]');
      if (button instanceof HTMLButtonElement && !button.disabled) {
        button.click();
      }
      const panel = document.querySelector('#user-detail-permissions');
      const text = panel?.textContent || '';
      const row = document.querySelector('[data-testid="permission-activity.export"]');
      return {
        clicked: button instanceof HTMLButtonElement,
        saved: text.includes('Saved deny override for activity.export'),
        hasOverride: (row?.textContent || '').includes('Override'),
        text: text.slice(0, 1800),
      };
    })()`);

    if (state.saved || state.hasOverride) {
      break;
    }

    if (attempt === 79) {
      throw new Error(`User detail permission override did not save: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  const payload = await requestApi(`/api/admin/users/${userId}/permissions`);
  const groups = payload.data?.permissions?.groups || [];
  const rule = groups
    .flatMap((group) => group.permissions || [])
    .find((permission) => permission.key === 'activity.export');

  assert(rule?.override === 'deny', `Permission override API did not persist deny: ${JSON.stringify(rule).slice(0, 500)}`);
};

const generateUserDetailInviteLink = async (client, email) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="user-detail-recovery"]');
      const text = panel?.textContent || '';
      const button = Array.from(panel?.querySelectorAll('button') || []).find((candidate) => (
        (candidate.textContent || '').trim() === 'Generate invite link'
      ));
      return {
        ready: Boolean(panel),
        hasPanel: text.includes('Account recovery'),
        hasEmail: document.body?.innerText?.includes(${JSON.stringify(email)}) || false,
        buttonEnabled: button instanceof HTMLButtonElement && !button.disabled,
        text: text.slice(0, 1600),
      };
    })()`);
    if (state.ready && state.hasPanel && state.hasEmail && state.buttonEnabled) {
      break;
    }
    if (attempt === 79) {
      throw new Error(`User detail invite panel was not ready: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  const expiryResult = await evaluate(client, `(() => {
    const panel = document.querySelector('[data-testid="user-detail-recovery"]');
    const select = panel?.querySelector('select[aria-label="Invite link expiry"]');
    if (!(select instanceof HTMLSelectElement)) {
      return { ok: false, reason: 'invite-expiry-missing' };
    }
    select.value = '43200';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: select.value };
  })()`);
  assert(expiryResult.ok && expiryResult.value === '43200', `Unable to set invite expiry: ${JSON.stringify(expiryResult)}`);

  await clickButton(client, 'Generate invite link');

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="user-detail-recovery"]');
      const text = panel?.textContent || '';
      return {
        ready: Boolean(panel),
        hasNotice: text.includes('Local invite link generated') || text.includes('Invite delivery was queued'),
        hidesInviteUrl: text.includes('Invite URL hidden') && !text.includes('/accept-invite?token=bit_'),
        hasMaskedToken: /bit_[a-z0-9]{2}\.\.\.[a-z0-9]{4}/.test(text),
        hasTokenId: text.includes('invite_'),
        hasCopyControls: text.includes('Copy invite URL') && text.includes('Copy invite token'),
        token: '',
        text: text.slice(0, 1800),
      };
    })()`);
    if (state.ready && state.hasNotice && state.hidesInviteUrl && state.hasMaskedToken && state.hasTokenId && state.hasCopyControls) {
      const copied = await evaluate(client, `(async () => {
        window.__backyUsersSmokeClipboard = '';
        const clipboard = {
          writeText: async (value) => {
            window.__backyUsersSmokeClipboard = String(value || '');
          },
        };
        try {
          Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
        } catch {
          navigator.clipboard.writeText = clipboard.writeText;
        }
        const panel = document.querySelector('[data-testid="user-detail-recovery"]');
        const button = Array.from(panel?.querySelectorAll('button') || []).find((candidate) => (
          (candidate.textContent || '').trim() === 'Copy invite token'
        ));
        if (!(button instanceof HTMLButtonElement) || button.disabled) {
          return { ok: false, reason: 'copy-token-button-unavailable' };
        }
        button.click();
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { ok: /^bit_[a-z0-9]+$/.test(window.__backyUsersSmokeClipboard || ''), token: window.__backyUsersSmokeClipboard || '' };
      })()`);
      assert(copied.ok, `Invite token copy action did not expose a usable token to clipboard: ${JSON.stringify(copied)}`);
      return { ...state, token: copied.token };
    }
    if (attempt === 99) {
      throw new Error(`Invite link UI did not render masked generated token state: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const acceptUserInviteToken = async (token, userId) => {
  assert(token, 'Invite token was not captured from the detail page');
  const payload = await requestApi('/api/admin/auth/accept-invite', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });

  assert(payload.data?.accepted === true, `Invite accept endpoint did not accept token: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(payload.data?.session?.token, `Invite accept endpoint did not return a session: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(payload.data?.user?.id === userId, `Invite accept returned the wrong user: ${JSON.stringify(payload.data?.user).slice(0, 500)}`);

  const acceptedUser = await getUser(userId);
  assert(acceptedUser.status === 'active', `Invite acceptance did not activate user: ${JSON.stringify(acceptedUser).slice(0, 500)}`);
};

const generateUserDetailResetToken = async (client, email) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="user-detail-recovery"]');
      const text = panel?.textContent || '';
      const button = Array.from(panel?.querySelectorAll('button') || []).find((candidate) => (
        (candidate.textContent || '').trim() === 'Generate reset token'
      ));
      return {
        ready: Boolean(panel),
        hasPanel: text.includes('Account recovery'),
        hasEmail: document.body?.innerText?.includes(${JSON.stringify(email)}) || false,
        buttonEnabled: button instanceof HTMLButtonElement && !button.disabled,
        text: text.slice(0, 1600),
      };
    })()`);
    if (state.ready && state.hasPanel && state.hasEmail && state.buttonEnabled) {
      break;
    }
    if (attempt === 79) {
      throw new Error(`User detail recovery panel was not ready: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  const expiryResult = await evaluate(client, `(() => {
    const panel = document.querySelector('[data-testid="user-detail-recovery"]');
    const select = panel?.querySelector('select[aria-label="Reset link expiry"]');
    if (!(select instanceof HTMLSelectElement)) {
      return { ok: false, reason: 'reset-expiry-missing' };
    }
    select.value = '240';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: select.value };
  })()`);
  assert(expiryResult.ok && expiryResult.value === '240', `Unable to set reset expiry: ${JSON.stringify(expiryResult)}`);

  await clickButton(client, 'Generate reset token');

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="user-detail-recovery"]');
      const text = panel?.textContent || '';
      return {
        ready: Boolean(panel),
        hasNotice: text.includes('Local reset token generated') || text.includes('Password reset delivery was queued'),
        hidesResetUrl: text.includes('Reset URL hidden') && !text.includes('/reset-password?token=bpr_'),
        hasMaskedToken: /bpr_[a-z0-9]{2}\.\.\.[a-z0-9]{4}/.test(text),
        hasTokenId: text.includes('reset_'),
        hasCopyControls: text.includes('Copy reset URL') && text.includes('Copy token'),
        token: '',
        text: text.slice(0, 1800),
      };
    })()`);
    if (state.ready && state.hasNotice && state.hidesResetUrl && state.hasMaskedToken && state.hasTokenId && state.hasCopyControls) {
      const copied = await evaluate(client, `(async () => {
        window.__backyUsersSmokeClipboard = '';
        const clipboard = {
          writeText: async (value) => {
            window.__backyUsersSmokeClipboard = String(value || '');
          },
        };
        try {
          Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
        } catch {
          navigator.clipboard.writeText = clipboard.writeText;
        }
        const panel = document.querySelector('[data-testid="user-detail-recovery"]');
        const button = Array.from(panel?.querySelectorAll('button') || []).find((candidate) => (
          (candidate.textContent || '').trim() === 'Copy token'
        ));
        if (!(button instanceof HTMLButtonElement) || button.disabled) {
          return { ok: false, reason: 'copy-token-button-unavailable' };
        }
        button.click();
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { ok: /^bpr_[a-z0-9]+$/.test(window.__backyUsersSmokeClipboard || ''), token: window.__backyUsersSmokeClipboard || '' };
      })()`);
      assert(copied.ok, `Reset token copy action did not expose a usable token to clipboard: ${JSON.stringify(copied)}`);
      return { ...state, token: copied.token };
    }
    if (attempt === 99) {
      throw new Error(`Reset token UI did not render masked generated token state: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const resetUserPasswordToken = async (token, userId, email, password) => {
  assert(token, 'Password reset token was not captured from the detail page');
  const payload = await requestApi('/api/admin/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });

  assert(payload.data?.reset === true, `Password reset endpoint did not accept token: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(payload.data?.session?.token, `Password reset endpoint did not return a session: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(payload.data?.user?.id === userId, `Password reset returned the wrong user: ${JSON.stringify(payload.data?.user).slice(0, 500)}`);

  const loginResponse = await fetch(`${API_BASE_URL}/api/admin/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const loginPayload = await loginResponse.json().catch(() => ({}));
  assert(loginResponse.ok && loginPayload.data?.session?.token, `New password did not sign in: ${JSON.stringify(loginPayload).slice(0, 500)}`);
};

const setUserDetailLifecycle = async (client, label) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
        (candidate.textContent || '').includes(${JSON.stringify(label)})
      ));
      if (!(button instanceof HTMLButtonElement)) return { ok: false, reason: 'button-missing' };
      if (button.disabled) return { ok: false, reason: 'button-disabled' };
      button.click();
      return { ok: true };
    })()`);

    if (result.ok) {
      return;
    }
    if (attempt === 79) {
      throw new Error(`Unable to run user lifecycle action ${label}: ${JSON.stringify(result)}`);
    }
    await sleep(250);
  }
};

const removeUserFromDirectory = async (client, fullName) => {
  await waitForUsersPageUser(client, fullName);
  const openResult = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
      (candidate.getAttribute('aria-label') || '') === ${JSON.stringify(`Remove ${fullName}`)}
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        buttons: Array.from(document.querySelectorAll('button')).map((candidate) => candidate.getAttribute('aria-label') || candidate.textContent || '').slice(0, 80),
      };
    }
    if (button.disabled) return { ok: false, reason: 'remove-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(openResult.ok, `Unable to open delete confirmation: ${JSON.stringify(openResult)}`);

  const confirmResult = await evaluate(client, `(() => {
    const dialog = Array.from(document.querySelectorAll('[class*="fixed"]')).find((candidate) => (
      (candidate.textContent || '').includes(${JSON.stringify(`Remove ${fullName}?`)})
    ));
    const button = dialog && Array.from(dialog.querySelectorAll('button')).find((candidate) => (
      (candidate.textContent || '').trim() === 'Remove user'
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'confirm-missing', dialog: dialog?.textContent?.slice(0, 500) || '' };
    }
    if (button.disabled) return { ok: false, reason: 'confirm-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(confirmResult.ok, `Unable to confirm user deletion: ${JSON.stringify(confirmResult)}`);
};

const setUsersBulkStatus = async (client, fullNames, status) => {
  await navigateToUsers(client);
  for (const fullName of fullNames) {
    await waitForUsersPageUser(client, fullName);
  }

  const result = await evaluate(client, `(() => {
    const names = ${JSON.stringify(fullNames)};
    for (const name of names) {
      const row = Array.from(document.querySelectorAll('tbody tr')).find((candidate) => (
        (candidate.textContent || '').includes(name)
      ));
      const checkbox = row?.querySelector('input[type="checkbox"]');
      if (!(checkbox instanceof HTMLInputElement)) {
        return { ok: false, reason: 'checkbox-missing', name };
      }
      if (checkbox.disabled) {
        return { ok: false, reason: 'checkbox-disabled', name };
      }
      if (!checkbox.checked) {
        checkbox.click();
      }
    }

    const panel = document.querySelector('[data-testid="users-bulk-actions"]');
    const select = panel?.querySelector('select[aria-label="Bulk status"]');
    if (!(select instanceof HTMLSelectElement)) {
      return { ok: false, reason: 'bulk-select-missing' };
    }
    select.value = ${JSON.stringify(status)};
    select.dispatchEvent(new Event('change', { bubbles: true }));

    const button = Array.from(panel?.querySelectorAll('button') || []).find((candidate) => (
      (candidate.textContent || '').includes('Apply status')
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'apply-button-missing', panel: panel?.textContent?.slice(0, 500) || '' };
    }
    if (button.disabled) {
      return { ok: false, reason: 'apply-button-disabled', panel: panel?.textContent?.slice(0, 500) || '' };
    }
    button.click();
    return { ok: true };
  })()`);

  assert(result.ok, `Unable to run users bulk status action: ${JSON.stringify(result)}`);
};

const waitForUsersImportReady = async (client) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const modeSelect = document.querySelector('select[aria-label="User import duplicate handling"]');
      const input = document.querySelector('input[aria-label="Import users CSV"]');
      const importButtons = Array.from(document.querySelectorAll('button')).filter((button) => {
        const text = button.textContent || '';
        return text.includes('Preview CSV') || text.includes('Import CSV') || text.includes('Previewing') || text.includes('Importing');
      });
      return {
        ready: Boolean(document.querySelector('[data-testid="users-command-center"]')) &&
          modeSelect instanceof HTMLSelectElement &&
          input instanceof HTMLInputElement &&
          !modeSelect.disabled &&
          importButtons.length >= 2 &&
          importButtons.every((button) => !button.disabled),
        hasInput: input instanceof HTMLInputElement,
        modeDisabled: modeSelect instanceof HTMLSelectElement ? modeSelect.disabled : null,
        importButtons: importButtons.map((button) => ({
          text: (button.textContent || '').trim(),
          disabled: button.disabled,
        })),
        body: document.body?.innerText?.slice(0, 800) || '',
      };
    })()`);
    if (state.ready) return state;
    if (attempt === 119) {
      throw new Error(`Users import controls did not become ready: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const importUsersThroughUi = async (client, csvPath, expectedName, options = {}) => {
  const {
    mode = 'create',
    dryRun = false,
    created = 1,
    updated = 0,
    skipped = 1,
  } = options;
  await navigateToUsers(client);
  await waitForUsersImportReady(client);

  const markResult = await evaluate(client, `(() => {
    const modeSelect = document.querySelector('select[aria-label="User import duplicate handling"]');
    if (!(modeSelect instanceof HTMLSelectElement)) {
      return { ok: false, reason: 'import-mode-missing' };
    }
    if (modeSelect.disabled) {
      return { ok: false, reason: 'import-mode-disabled' };
    }
    modeSelect.value = ${JSON.stringify(mode)};
    modeSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const input = document.querySelector('input[aria-label="Import users CSV"]');
    if (!(input instanceof HTMLInputElement)) {
      return {
        ok: false,
        reason: 'import-input-missing',
        inputs: Array.from(document.querySelectorAll('input')).map((candidate) => candidate.getAttribute('aria-label') || candidate.type).slice(0, 40),
      };
    }
    input.setAttribute('data-users-smoke-import-input', 'true');
    input.setAttribute('data-import-dry-run', ${JSON.stringify(dryRun ? 'true' : 'false')});
    return { ok: true };
  })()`);
  assert(markResult.ok, `Unable to find users import input: ${JSON.stringify(markResult)}`);

  await client.send('DOM.enable');
  const documentResult = await client.send('DOM.getDocument', { depth: 1 });
  const queryResult = await client.send('DOM.querySelector', {
    nodeId: documentResult.root.nodeId,
    selector: 'input[data-users-smoke-import-input="true"]',
  });
  assert(queryResult.nodeId, `Unable to resolve users import input node: ${JSON.stringify(queryResult)}`);
  await client.send('DOM.setFileInputFiles', {
    nodeId: queryResult.nodeId,
    files: [csvPath],
  });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const result = document.querySelector('[data-testid="users-import-result"]');
      const text = result?.textContent || '';
      return {
        hasResult: Boolean(result),
        hasPreview: ${JSON.stringify(dryRun)} ? text.includes('Import preview') && text.includes('No changes applied') : text.includes('Import result'),
        hasCreated: text.includes(${JSON.stringify(`${created} created`)}),
        hasUpdated: text.includes(${JSON.stringify(`${updated} updated`)}),
        hasSkipped: text.includes(${JSON.stringify(`${skipped} skipped`)}),
        hasUser: ${JSON.stringify(dryRun)} ? true : (document.body?.innerText?.includes(${JSON.stringify(expectedName)}) || false),
        text: text.slice(0, 800),
      };
    })()`);
    if (state.hasResult && state.hasPreview && state.hasCreated && state.hasUpdated && state.hasSkipped && state.hasUser) {
      return state;
    }
    if (attempt === 119) {
      throw new Error(`Users import UI did not finish: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const rollbackLatestUsersImport = async (client, email, restoredName) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const button = document.querySelector('[data-testid="users-import-rollback-button"]');
      return {
        ready: button instanceof HTMLButtonElement && button.disabled === false,
        hasButton: Boolean(button),
        disabled: button instanceof HTMLButtonElement ? button.disabled : null,
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`);
    if (state.ready) break;
    if (attempt === 119) throw new Error(`Users import rollback button did not become ready: ${JSON.stringify(state)}`);
    await sleep(250);
  }
  const clickResult = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="users-import-rollback-button"]');
    if (!(button instanceof HTMLButtonElement)) return { ok: false, reason: 'button-missing' };
    window.confirm = () => true;
    button.click();
    return { ok: true };
  })()`);
  assert(clickResult.ok, `Unable to click users import rollback: ${JSON.stringify(clickResult)}`);
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const body = document.body?.innerText || '';
      return {
        ready: body.includes('Rolled back import') &&
          body.includes('1 update restored') &&
          body.includes(${JSON.stringify(restoredName)}) &&
          body.includes(${JSON.stringify(email)}),
        body: body.slice(0, 1200),
      };
    })()`);
    if (state.ready) return state;
    if (attempt === 119) throw new Error(`Users import rollback result did not become ready: ${JSON.stringify(state)}`);
    await sleep(250);
  }
  return null;
};

const assertLayout = async (client, expectedName) => {
  const layout = await evaluate(client, `(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    hasCommandCenter: Boolean(document.querySelector('[data-testid="users-command-center"]')),
    hasDirectory: document.body?.innerText?.includes('People directory') || document.body?.innerText?.includes(${JSON.stringify(expectedName)}) || false,
    hasApi: document.body?.innerText?.includes('User access API') || false,
    hasMembership: document.body?.innerText?.includes('Membership registration') || false,
    hasMemberAuthBoundary: Boolean(document.querySelector('[data-testid="users-member-auth-boundary"]')) &&
      document.body?.innerText?.includes('Member auth boundary') &&
      document.body?.innerText?.includes('Credentialed member login') &&
      document.body?.innerText?.includes('Self-service member portal'),
    hasActivity: document.body?.innerText?.includes('Access activity') || false,
  }))()`);
  assert(layout.scrollWidth <= layout.width + 8, `Users page has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(layout.hasCommandCenter && layout.hasDirectory && layout.hasApi && layout.hasMembership && layout.hasMemberAuthBoundary && layout.hasActivity, `Users page missing expected regions: ${JSON.stringify(layout)}`);
  return layout;
};

const waitForUserActivity = async (client, email) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: document.body?.innerText?.includes('Access activity') || false,
      hasUser: document.body?.innerText?.includes(${JSON.stringify(email)}) || false,
      hasUpdated: document.body?.innerText?.includes('Updated') || false,
      body: document.body?.innerText?.slice(0, 1600) || '',
    }))()`);
    if (state.ready && state.hasUser && state.hasUpdated) {
      return state;
    }
    await sleep(250);
  }

  throw new Error(`Users activity panel did not show ${email}: timed out`);
};

const waitForUserDetailActivity = async (client, email) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="user-detail-activity"]');
      const text = panel?.textContent || '';
      return {
        ready: Boolean(panel),
        hasUser: text.includes(${JSON.stringify(email)}),
        hasUpdated: text.includes('Updated'),
        hasSuspended: text.includes('suspended'),
        text: text.slice(0, 1600),
      };
    })()`);
    if (state.ready && state.hasUser && state.hasUpdated && state.hasSuspended) {
      return state;
    }
    await sleep(250);
  }

  throw new Error(`User detail activity panel did not show ${email}: timed out`);
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-users-${Date.now()}`);
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

const cleanup = async ({ client, childProcess, userDataDir, userId }) => {
  if (client) {
    try {
      await client.send('Browser.close');
    } catch {
      // Chrome may already be closing.
    }
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

  if (userId) {
    try {
      await deleteUser(userId);
    } catch {
      // The UI flow may already have removed the temporary user.
    }
  }
};

const main = async () => {
  let client;
  let childProcess;
  let userDataDir;
  let createdUserId;
  let bulkUserId;
  let importedUserId;
  let previewInviteUserId;
  const suffix = Date.now().toString(36);
  const fullName = `Users Smoke ${suffix}`;
  const email = `users-smoke-${suffix}@example.com`;
  const bulkFullName = `Users Bulk ${suffix}`;
  const bulkEmail = `users-bulk-${suffix}@example.com`;
  const previewFullName = `${fullName} Preview`;
  const previewEmail = `preview-${email}`;
  const importedFullName = `Users Import ${suffix}`;
  const importedUpdatedFullName = `Users Import Updated ${suffix}`;
  const importedEmail = `users-import-${suffix}@example.com`;

  try {
    await loginAdminApi();
    await assertUsersApiRequiresAuth();
    await assertUserPermissionOverridesAreEnforced();
    const existing = await findUserByEmail(email);
    assert(!existing, `Temporary user already exists: ${email}`);

    const created = await createUser({ fullName, email });
    createdUserId = created.id;
    assert(created.role === 'admin' && created.status === 'invited', `Unexpected created user state: ${JSON.stringify(created)}`);
    const bulkCreated = await createUser({ fullName: bulkFullName, email: bulkEmail, role: 'viewer', status: 'active' });
    bulkUserId = bulkCreated.id;

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
    await signInAdmin(client);

    await navigateToInvite(client);
    await fillInviteForm(client, { fullName: previewFullName, email: previewEmail });
    await submitInviteFormAndAssertLink(client, previewEmail);
    const previewInviteUser = await waitForUser(previewEmail, (user) => (
      user.fullName === previewFullName && user.status === 'invited'
    ));
    previewInviteUserId = previewInviteUser.id;
    await clickButton(client, 'Back to users');
    await waitForUsersPageUser(client, previewEmail);
    await waitForUsersPageUser(client, email);
    await waitForUsersPageUser(client, bulkEmail);
    const importCsvPath = path.join(os.tmpdir(), `backy-users-import-${suffix}.csv`);
    fs.writeFileSync(
      importCsvPath,
      [
        'full_name,email,role,status',
        `${importedFullName},${importedEmail},editor,invited`,
        `Duplicate ${fullName},${email},viewer,invited`,
      ].join('\n'),
      'utf8',
    );
    await importUsersThroughUi(client, importCsvPath, importedFullName, { dryRun: true });
    const previewOnlyUser = await findUserByEmail(importedEmail);
    assert(!previewOnlyUser, `Dry-run import should not create users: ${JSON.stringify(previewOnlyUser).slice(0, 500)}`);
    await importUsersThroughUi(client, importCsvPath, importedFullName);
    const importedUser = await waitForUser(importedEmail, (user) => user.fullName === importedFullName && user.role === 'editor' && user.status === 'invited');
    importedUserId = importedUser.id;
    const importAuditLogs = await listUserAuditLogs('import');
    assert(
      importAuditLogs.some((log) => log.action === 'user.import.create' && log.metadata?.created === 1 && log.metadata?.skipped === 1),
      `User import audit log was not recorded: ${JSON.stringify(importAuditLogs).slice(0, 500)}`,
    );
    const upsertCsvPath = path.join(os.tmpdir(), `backy-users-import-upsert-${suffix}.csv`);
    fs.writeFileSync(
      upsertCsvPath,
      [
        'full_name,email,role,status',
        `${importedUpdatedFullName},${importedEmail},viewer,active`,
      ].join('\n'),
      'utf8',
    );
    await importUsersThroughUi(client, upsertCsvPath, importedUpdatedFullName, {
      mode: 'upsert',
      created: 0,
      updated: 1,
      skipped: 0,
    });
    await waitForUser(importedEmail, (user) => user.fullName === importedUpdatedFullName && user.role === 'viewer' && user.status === 'active');
    const upsertAuditLogs = await listUserAuditLogs('import');
    assert(
      upsertAuditLogs.some((log) => log.action === 'user.import.upsert' && log.metadata?.updated === 1 && log.metadata?.mode === 'upsert'),
      `User import upsert audit log was not recorded: ${JSON.stringify(upsertAuditLogs).slice(0, 500)}`,
    );
    await rollbackLatestUsersImport(client, importedEmail, importedFullName);
    await waitForUser(importedEmail, (user) => user.fullName === importedFullName && user.role === 'editor' && user.status === 'invited');
    const rollbackAuditLogs = await listUserAuditLogs('import');
    assert(
      rollbackAuditLogs.some((log) => log.action === 'user.import.rollback' && log.metadata?.restoredUserIds?.includes(importedUserId)),
      `User import rollback audit log was not recorded: ${JSON.stringify(rollbackAuditLogs).slice(0, 500)}`,
    );
    await waitForUsersSelfProtection(client);
    await openUserDetail(client, 'Admin User');
    await waitForUserDetailSelfProtection(client);
    await waitForUserDetailSessions(client);
    await navigateToUsers(client);
    await waitForUsersPageUser(client, email);

    await openUserDetail(client, fullName);
    await waitForUserDetailPermissionMatrix(client);
    await setUserDetailPermissionOverride(client, createdUserId);
    const inviteState = await generateUserDetailInviteLink(client, email);
    await acceptUserInviteToken(inviteState?.token, createdUserId);
    const resetState = await generateUserDetailResetToken(client, email);
    await resetUserPasswordToken(resetState?.token, createdUserId, email, `Reset-${suffix}-123`);
    const recoveryAuditLogs = await listUserAuditLogs(createdUserId);
    assert(
      recoveryAuditLogs.some((log) => log.action === 'user.invite.accept'),
      `User invite acceptance audit log was not recorded: ${JSON.stringify(recoveryAuditLogs).slice(0, 500)}`,
    );
    assert(
      recoveryAuditLogs.some((log) => log.action === 'user.permission_overrides.update'),
      `User permission override audit log was not recorded: ${JSON.stringify(recoveryAuditLogs).slice(0, 500)}`,
    );
    assert(
      recoveryAuditLogs.some((log) => log.action === 'user.invite_token.create' && log.metadata?.expiresInMinutes === 43200),
      `User invite token audit log with selected expiry was not recorded: ${JSON.stringify(recoveryAuditLogs).slice(0, 500)}`,
    );
    assert(
      recoveryAuditLogs.some((log) => log.action === 'user.password_reset_token.create' && log.metadata?.expiresInMinutes === 240),
      `User reset token audit log with selected expiry was not recorded: ${JSON.stringify(recoveryAuditLogs).slice(0, 500)}`,
    );
    assert(
      recoveryAuditLogs.some((log) => log.action === 'user.password_reset.accept'),
      `User reset acceptance audit log was not recorded: ${JSON.stringify(recoveryAuditLogs).slice(0, 500)}`,
    );
    await navigateToUsers(client);
    await waitForUsersPageUser(client, email);

    await setDirectoryUserSelect(client, fullName, 'Change role for', 'viewer');
    await waitForUser(email, (user) => user.role === 'viewer');
    await setDirectoryUserSelect(client, fullName, 'Change status for', 'inactive');
    await waitForUser(email, (user) => user.role === 'viewer' && user.status === 'inactive');
    const updateAuditLogs = await listUserAuditLogs(createdUserId);
    assert(updateAuditLogs.some((log) => log.action === 'update'), `User update audit log was not recorded: ${JSON.stringify(updateAuditLogs).slice(0, 500)}`);

    await openUserDetail(client, fullName);
    await setUserDetailLifecycle(client, 'Suspend');
    const suspended = await waitForUser(email, (user) => user.fullName === fullName && user.role === 'viewer' && user.status === 'suspended');
    assert((await getUser(suspended.id)).status === 'suspended', 'User detail lifecycle action did not persist suspended status.');
    await waitForUserDetailActivity(client, email);

    await navigateToUsers(client, fullName);
    await waitForUsersPageUser(client, fullName);
    await setUsersBulkStatus(client, [fullName, bulkFullName], 'inactive');
    await waitForUser(email, (user) => user.status === 'inactive');
    await waitForUser(bulkEmail, (user) => user.status === 'inactive');
    const bulkAuditLogs = await listUserAuditLogs('bulk');
    assert(
      bulkAuditLogs.some((log) => log.action === 'user.bulk.status.update'),
      `Bulk status audit log was not recorded: ${JSON.stringify(bulkAuditLogs).slice(0, 500)}`,
    );

    await bulkUpdateUsers({ action: 'delete', userIds: [bulkUserId] });
    await waitForUserMissing(bulkEmail);
    bulkUserId = null;

    await waitForUserActivity(client, email);
    await assertLayout(client, fullName);
    await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }).then((result) => {
      fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(result.data, 'base64'));
    });

    await removeUserFromDirectory(client, fullName);
    await waitForUserMissing(email);
    createdUserId = null;

    console.log(JSON.stringify({
      ok: true,
      createdEmail: email,
      fullName,
      screenshot: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, userId: createdUserId });
    if (importedUserId) {
      await deleteUser(importedUserId).catch(() => undefined);
    }
    if (bulkUserId) {
      await deleteUser(bulkUserId).catch(() => undefined);
    }
    if (previewInviteUserId) {
      await deleteUser(previewInviteUserId).catch(() => undefined);
    }
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
