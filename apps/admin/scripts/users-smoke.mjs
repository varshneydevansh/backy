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
  return user;
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
  const result = await evaluate(client, `(() => {
    const setInputValue = (input, value) => {
      const previousValue = input.value;
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      descriptor?.set?.call(input, value);
      input._valueTracker?.setValue(previousValue);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const nameInput = document.querySelector('input[type="text"]');
    const emailInput = document.querySelector('input[type="email"]');
    const adminRole = document.querySelector('input[name="role"][value="admin"]');
    const invitedStatus = document.querySelector('input[name="status"][value="invited"]');
    if (!(nameInput instanceof HTMLInputElement) || !(emailInput instanceof HTMLInputElement)) {
      return { ok: false, reason: 'inputs-missing' };
    }
    setInputValue(nameInput, ${JSON.stringify(fullName)});
    setInputValue(emailInput, ${JSON.stringify(email)});
    if (adminRole instanceof HTMLInputElement) {
      adminRole.click();
    }
    if (invitedStatus instanceof HTMLInputElement && !invitedStatus.checked) {
      invitedStatus.click();
    }
    return { ok: true };
  })()`);

  assert(result.ok, `Unable to fill invite form: ${JSON.stringify(result)}`);
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

const assertLayout = async (client, expectedName) => {
  const layout = await evaluate(client, `(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    hasCommandCenter: Boolean(document.querySelector('[data-testid="users-command-center"]')),
    hasDirectory: document.body?.innerText?.includes('People directory') || document.body?.innerText?.includes(${JSON.stringify(expectedName)}) || false,
    hasApi: document.body?.innerText?.includes('User access API') || false,
    hasMembership: document.body?.innerText?.includes('Membership registration') || false,
    hasActivity: document.body?.innerText?.includes('Access activity') || false,
  }))()`);
  assert(layout.scrollWidth <= layout.width + 8, `Users page has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(layout.hasCommandCenter && layout.hasDirectory && layout.hasApi && layout.hasMembership && layout.hasActivity, `Users page missing expected regions: ${JSON.stringify(layout)}`);
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
  const suffix = Date.now().toString(36);
  const fullName = `Users Smoke ${suffix}`;
  const email = `users-smoke-${suffix}@example.com`;

  try {
    const existing = await findUserByEmail(email);
    assert(!existing, `Temporary user already exists: ${email}`);

    const created = await createUser({ fullName, email });
    createdUserId = created.id;
    assert(created.role === 'admin' && created.status === 'invited', `Unexpected created user state: ${JSON.stringify(created)}`);

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

    await navigateToInvite(client);
    await fillInviteForm(client, { fullName: `${fullName} Preview`, email: `preview-${email}` });
    await navigateToUsers(client);
    await waitForUsersPageUser(client, email);
    await waitForUsersSelfProtection(client);
    await openUserDetail(client, 'Admin User');
    await waitForUserDetailSelfProtection(client);
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
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
