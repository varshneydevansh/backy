#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_TEAMS_CDP_PORT || 9394);
const SCREENSHOT_PATH = process.env.BACKY_TEAMS_SCREENSHOT || path.join(os.tmpdir(), 'backy-teams-smoke.png');
let apiAdminSessionToken = '';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
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
  if (options.body && !headers.has('content-type')) {
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
    headers: { 'content-type': 'application/json' },
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

const listTeams = async () => {
  const payload = await requestApi('/api/admin/teams');
  return payload.data?.teams || [];
};

const createTeam = async (name) => {
  const payload = await requestApi('/api/admin/teams', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  const team = payload.data?.team;
  assert(team?.id, `Create team did not return a team: ${JSON.stringify(payload).slice(0, 500)}`);
  return team;
};

const createUser = async ({ fullName, email, role = 'viewer', status = 'invited' }) => {
  const payload = await requestApi('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      fullName,
      email,
      role,
      status,
      createInvite: status === 'invited',
    }),
  });
  const user = payload.data?.user;
  assert(user?.id, `Create user did not return a user: ${JSON.stringify(payload).slice(0, 500)}`);
  return { user, invite: payload.data?.invite || null };
};

const setUserPermissionOverrides = async (userId, overrides) => {
  const payload = await requestApi(`/api/admin/users/${encodeURIComponent(userId)}/permissions`, {
    method: 'PATCH',
    body: JSON.stringify({ overrides }),
  });
  assert(payload.data?.permissions, `Permission override did not return a matrix: ${JSON.stringify(payload).slice(0, 500)}`);
  return payload.data;
};

const acceptInvite = async (token) => {
  const response = await fetch(`${API_BASE_URL}/api/admin/auth/accept-invite`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false || !payload.data?.session?.token) {
    throw new Error(`Unable to accept invite: ${JSON.stringify(payload).slice(0, 500)}`);
  }
  return payload.data;
};

const deleteTeam = async (teamId) => {
  if (!teamId) return;
  await requestApi(`/api/admin/teams/${encodeURIComponent(teamId)}`, { method: 'DELETE' });
};

const deleteUser = async (userId) => {
  if (!userId) return;
  await requestApi(`/api/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
};

const findTeamBySlug = async (slug) => {
  const teams = await listTeams();
  return teams.find((team) => team.slug === slug) || null;
};

const waitForTeam = async (slug, predicate = () => true) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const team = await findTeamBySlug(slug);
    if (team && predicate(team)) return team;
    await sleep(250);
  }

  throw new Error(`Timed out waiting for team ${slug}`);
};

const waitForTeamMissing = async (slug) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const team = await findTeamBySlug(slug);
    if (!team) return;
    await sleep(250);
  }

  throw new Error(`Team ${slug} still exists after cleanup`);
};

const fetchJson = async (endpoint) => {
  const response = await fetch(`http://127.0.0.1:${PORT}${endpoint}`);
  if (!response.ok) throw new Error(`${endpoint} returned ${response.status}`);
  return response.json();
};

const waitForCdp = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const pages = await fetchJson('/json/list');
      const page = pages.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) return page;
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
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
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

const waitForState = async (client, readyExpression, description) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, readyExpression);
    if (state.ready) return state;
    if (attempt === 119) throw new Error(`${description} did not become ready: ${JSON.stringify(state)}`);
    await sleep(250);
  }

  return null;
};

const navigate = async (client, url, readyExpression, description) => {
  await client.send('Page.navigate', { url });
  return waitForState(client, readyExpression, description);
};

const waitForTeamAuditPanel = async (client, expectedLabels, description) => waitForState(
  client,
  `(() => {
    const panel = document.querySelector('[data-testid="teams-audit-panel"]');
    const text = panel?.innerText || '';
    const expectedLabels = ${JSON.stringify(expectedLabels)};
    return {
      ready: Boolean(panel) &&
        text.includes('Team activity') &&
        text.includes('activity.export') &&
        text.includes('Request') &&
        expectedLabels.every((label) => text.includes(label)),
      text: text.slice(0, 1600),
    };
  })()`,
  description,
);

const authStorageScript = (sessionToken, user) => `
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
`;

const setBrowserAuthStorage = async (client, sessionToken, user) => evaluate(
  client,
  authStorageScript(sessionToken, user),
);

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

const setSelectValue = async (client, selector, value) => {
  const result = await evaluate(client, `(() => {
    const select = document.querySelector(${JSON.stringify(selector)});
    if (!(select instanceof HTMLSelectElement)) return { ok: false, reason: 'select-missing', selector: ${JSON.stringify(selector)} };
    if (select.disabled) {
      return {
        ok: false,
        reason: 'select-disabled',
        title: select.getAttribute('title') || '',
        value: select.value,
        body: document.body?.innerText?.slice(0, 1200) || '',
      };
    }
    select.value = ${JSON.stringify(value)};
    select.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return { ok: true, value: select.value };
  })()`);
  assert(result.ok, `Unable to select ${selector}: ${JSON.stringify(result)}`);
  return result;
};

const clickSelector = async (client, selector) => {
  const result = await evaluate(client, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!(element instanceof HTMLElement)) return { ok: false, reason: 'element-missing', selector: ${JSON.stringify(selector)} };
    if ('disabled' in element && element.disabled) return { ok: false, reason: 'element-disabled', selector: ${JSON.stringify(selector)} };
    element.click();
    return { ok: true };
  })()`);
  assert(result.ok, `Unable to click ${selector}: ${JSON.stringify(result)}`);
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-teams-${Date.now()}`);
  const childProcess = spawn(CHROME_BIN, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,1000',
    'about:blank',
  ], { stdio: 'ignore' });

  return { childProcess, userDataDir };
};

const cleanup = async ({ client, childProcess, userDataDir, teamIds = [], userIds = [] }) => {
  for (const teamId of teamIds) {
    try {
      await deleteTeam(teamId);
    } catch {
      // Best-effort cleanup for temporary smoke teams.
    }
  }
  for (const userId of userIds) {
    try {
      await deleteUser(userId);
    } catch {
      // Best-effort cleanup for temporary invited users.
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

  if (childProcess && !(await waitForExit(childProcess))) {
    childProcess.kill('SIGTERM');
    if (!(await waitForExit(childProcess, 1000))) childProcess.kill('SIGKILL');
  }

  if (userDataDir) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
};

const main = async () => {
  let client;
  let childProcess;
  let userDataDir;
  const temporaryTeamIds = [];
  const temporaryUserIds = [];
  const suffix = Date.now().toString(36);
  const teamName = `Smoke Team ${suffix}`;
  const editedName = `Smoke Team Edited ${suffix}`;
  const editedSlug = `smoke-team-edited-${suffix}`;
  const inviteEmail = `teams-smoke-${suffix}@example.com`;
  const readOnlyEmail = `teams-readonly-${suffix}@example.com`;
  const readOnlyFullName = `Teams Readonly ${suffix}`;

  try {
    const adminSession = await loginAdminApi();
    const apiCreatedTeam = await createTeam(`API ${teamName}`);
    temporaryTeamIds.push(apiCreatedTeam.id);
    await requestApi(`/api/admin/teams/${encodeURIComponent(apiCreatedTeam.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: `API ${editedName}`, slug: `api-${editedSlug}` }),
    });
    await waitForTeam(`api-${editedSlug}`, (team) => team.name === `API ${editedName}`);
    await deleteTeam(apiCreatedTeam.id);
    temporaryTeamIds.pop();
    await waitForTeamMissing(`api-${editedSlug}`);

    ({ childProcess, userDataDir } = launchChrome());
    const target = await waitForCdp();
    client = connectCdp(target.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    const adminAuthPreload = await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(adminSession.session.token, adminSession.user),
    });

    await navigate(
      client,
      `${ADMIN_BASE_URL}/teams`,
      `(() => {
        const body = document.body?.innerText || '';
        return {
          ready: window.location.pathname === '/teams' &&
            body.includes('Team Management') &&
            Boolean(document.querySelector('[data-testid="teams-create-button"]')) &&
            !body.includes('Team permissions unavailable'),
          path: window.location.pathname,
          body: body.slice(0, 900),
        };
      })()`,
      'Teams page',
    );

    await clickSelector(client, '[data-testid="teams-create-button"]');
    await setInputValue(client, '[data-testid="teams-create-name-input"]', teamName);
    await clickSelector(client, '[data-testid="teams-create-submit"]');
    await waitForState(
      client,
      `(() => {
        const body = document.body?.innerText || '';
        const modalOpen = body.includes('Create New Team');
        return {
          ready: body.includes('Team created.') || body.includes('Unable to create team') || !modalOpen,
          modalOpen,
          createInputValue: document.querySelector('[data-testid="teams-create-name-input"]')?.value || '',
          body: body.slice(0, 1200),
        };
      })()`,
      'Create team submit result',
    );
    const createdTeam = await waitForTeam(`smoke-team-${suffix}`, (team) => team.name === teamName);
    temporaryTeamIds.push(createdTeam.id);
    await waitForState(
      client,
      `(() => {
        const body = document.body?.innerText || '';
        return {
          ready: body.includes(${JSON.stringify(teamName)}) &&
            body.includes('/smoke-team-${suffix}') &&
            body.includes('Team created.'),
          body: body.slice(0, 900),
        };
      })()`,
      'Created team visible',
    );
    await waitForTeamAuditPanel(client, ['Team created'], 'Team create audit panel');

    await clickSelector(client, '[data-testid="teams-edit-button"]');
    await setInputValue(client, '[data-testid="teams-edit-name-input"]', editedName);
    await setInputValue(client, '[data-testid="teams-edit-slug-input"]', editedSlug);
    await clickSelector(client, '[data-testid="teams-edit-submit"]');
    await waitForTeam(editedSlug, (team) => team.name === editedName);
    await waitForState(
      client,
      `(() => {
        const body = document.body?.innerText || '';
        return {
          ready: body.includes(${JSON.stringify(editedName)}) &&
            body.includes('/${editedSlug}') &&
            body.includes('Team saved.'),
          body: body.slice(0, 900),
        };
      })()`,
      'Edited team visible',
    );
    await waitForTeamAuditPanel(client, ['Team created', 'Team updated'], 'Team update audit panel');

    await clickSelector(client, '[data-testid="teams-invite-button"]');
    await setInputValue(client, '[data-testid="teams-invite-email-input"]', inviteEmail);
    await setSelectValue(client, '[data-testid="teams-invite-role-select"]', 'viewer');
    await clickSelector(client, '[data-testid="teams-invite-submit"]');
    await waitForState(
      client,
      `(() => {
        const body = document.body?.innerText || '';
        return {
          ready: Boolean(document.querySelector('[data-testid="team-invite-delivery-panel"]')) &&
            body.includes(${JSON.stringify(inviteEmail)}) &&
            body.includes('Manual invite delivery'),
          body: body.slice(0, 1200),
        };
      })()`,
      'Invite delivery panel',
    );
    await waitForTeamAuditPanel(client, ['Team member invited', inviteEmail, 'viewer'], 'Team invite audit panel');

    const invitedMember = await waitForTeam(editedSlug, (team) => (
      team.members.some((member) => member.email === inviteEmail && member.role === 'viewer')
    )).then((team) => team.members.find((member) => member.email === inviteEmail));
    if (invitedMember?.userId) temporaryUserIds.push(invitedMember.userId);
    await setSelectValue(client, `[data-testid="teams-member-role-${invitedMember.id}"]`, 'editor');
    await waitForTeam(editedSlug, (team) => (
      team.members.some((member) => member.email === inviteEmail && member.role === 'editor')
    ));
    await waitForState(
      client,
      `(() => {
        const body = document.body?.innerText || '';
        return {
          ready: body.includes('Team member role updated.'),
          body: body.slice(0, 900),
        };
      })()`,
      'Member role update notice',
    );
    await waitForTeamAuditPanel(client, ['Team member role updated', 'editor'], 'Team role update audit panel');

    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.confirm = () => true;' });
    await evaluate(client, 'window.confirm = () => true; true');
    await clickSelector(client, `[data-testid="teams-member-remove-${invitedMember.id}"]`);
    await waitForTeam(editedSlug, (team) => !team.members.some((member) => member.email === inviteEmail));
    await waitForState(
      client,
      `(() => {
        const body = document.body?.innerText || '';
        const memberSelect = document.querySelector('[data-testid="teams-member-role-${invitedMember.id}"]');
        return {
          ready: body.includes('Team member removed.') && !(memberSelect instanceof HTMLElement),
          body: body.slice(0, 900),
        };
      })()`,
      'Member removal notice',
    );
    await waitForTeamAuditPanel(client, ['Team member removed'], 'Team member removal audit panel');

    await clickSelector(client, '[data-testid="teams-delete-button"]');
    await waitForTeamMissing(editedSlug);
    temporaryTeamIds.pop();
    await waitForState(
      client,
      `(() => {
        const body = document.body?.innerText || '';
        return {
          ready: body.includes('Team deleted.') && !body.includes(${JSON.stringify(editedName)}),
          body: body.slice(0, 900),
        };
      })()`,
      'Team delete notice',
    );

    const readOnlyAccount = await createUser({
      fullName: readOnlyFullName,
      email: readOnlyEmail,
      role: 'viewer',
      status: 'invited',
    });
    temporaryUserIds.push(readOnlyAccount.user.id);
    assert(readOnlyAccount.invite?.token, `Read-only user invite token missing: ${JSON.stringify(readOnlyAccount).slice(0, 500)}`);
    await setUserPermissionOverrides(readOnlyAccount.user.id, {
      'users.view': 'allow',
      'users.manage': 'deny',
      'activity.export': 'deny',
    });
    const readOnlySession = await acceptInvite(readOnlyAccount.invite.token);
    if (adminAuthPreload?.identifier) {
      await client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: adminAuthPreload.identifier });
    }
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(readOnlySession.session.token, readOnlySession.user),
    });
    await setBrowserAuthStorage(client, readOnlySession.session.token, readOnlySession.user);
    await navigate(
      client,
      `${ADMIN_BASE_URL}/teams`,
      `(() => {
        const body = document.body?.innerText || '';
        const createButton = document.querySelector('[data-testid="teams-create-button"]');
        const editButton = document.querySelector('[data-testid="teams-edit-button"]');
        const inviteButton = document.querySelector('[data-testid="teams-invite-button"]');
        const deleteButton = document.querySelector('[data-testid="teams-delete-button"]');
        const auditPanel = document.querySelector('[data-testid="teams-audit-panel"]');
        const auditRefresh = auditPanel ? Array.from(auditPanel.querySelectorAll('button')).find((button) => (
          (button.textContent || '').includes('Refresh audit')
        )) : null;
        const roleSelects = Array.from(document.querySelectorAll('[data-testid^="teams-member-role-"]'));
        const removeButtons = Array.from(document.querySelectorAll('[data-testid^="teams-member-remove-"]'));
        return {
          ready: window.location.pathname === '/teams' &&
            body.includes('Team Management') &&
            body.includes('Team activity') &&
            body.includes('activity.export') &&
            body.includes('Explicit override denies this capability.') &&
            createButton instanceof HTMLButtonElement &&
            createButton.disabled === true &&
            (!(editButton instanceof HTMLButtonElement) || editButton.disabled === true) &&
            (!(inviteButton instanceof HTMLButtonElement) || inviteButton.disabled === true) &&
            (!(deleteButton instanceof HTMLButtonElement) || deleteButton.disabled === true) &&
            (!(auditRefresh instanceof HTMLButtonElement) || auditRefresh.disabled === true) &&
            roleSelects.every((select) => select.disabled === true) &&
            removeButtons.every((button) => button.disabled === true),
          path: window.location.pathname,
          body: body.slice(0, 1600),
          createDisabled: createButton instanceof HTMLButtonElement ? createButton.disabled : null,
          editDisabled: editButton instanceof HTMLButtonElement ? editButton.disabled : null,
          inviteDisabled: inviteButton instanceof HTMLButtonElement ? inviteButton.disabled : null,
          deleteDisabled: deleteButton instanceof HTMLButtonElement ? deleteButton.disabled : null,
          auditRefreshDisabled: auditRefresh instanceof HTMLButtonElement ? auditRefresh.disabled : null,
          roleDisabled: roleSelects.map((select) => select.disabled),
          removeDisabled: removeButtons.map((button) => button.disabled),
        };
      })()`,
      'Read-only Teams permission pass',
    );

    await client.send('Page.captureScreenshot', { format: 'png' }).then((result) => {
      fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(result.data, 'base64'));
    });

    console.log(JSON.stringify({
      ok: true,
      route: '/teams',
      createdSlug: editedSlug,
      invitedEmail: inviteEmail,
      readOnlyEmail,
      screenshot: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, teamIds: temporaryTeamIds, userIds: temporaryUserIds });
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
