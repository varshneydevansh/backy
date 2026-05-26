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

const assertTeamsRouteSourceContract = () => {
  const source = fs.readFileSync(new URL('../src/routes/teams.tsx', import.meta.url), 'utf8');
  const componentSource = fs.readFileSync(new URL('../src/components/teams/TeamManagement.tsx', import.meta.url), 'utf8');
  assert(source.includes("import { EmptyState } from '@/components/ui/EmptyState';"), 'Teams route must use the shared EmptyState component for the primary no-teams state');
  assert(source.includes('title="No teams yet"'), 'Teams empty state must keep the no-teams title visible');
  assert(source.includes('assigning members, roles, sites, and workspace ownership'), 'Teams empty state must explain what the first team unlocks');
  assert(source.includes('title="No team activity yet"'), 'Teams audit panel must keep the empty activity title visible');
  assert(source.includes('Team creation, member invites, role changes, and workspace ownership updates will appear here.'), 'Teams audit empty state must explain which actions populate activity');
  assert(
    source.includes('data-testid="teams-audit-panel"') &&
      source.includes('data-default-collapsed="true"') &&
      source.includes('Show activity') &&
      source.includes('Hide activity') &&
      source.includes('Audit log evidence for selected team changes. Required permission: activity.export.'),
    'Teams route must keep low-frequency team audit evidence behind a default-collapsed activity disclosure.',
  );
  assert(!source.includes('window.confirm') && !componentSource.includes('window.confirm'), 'Teams surfaces must not use browser confirm dialogs for account/workspace mutations');
  assert(
    componentSource.includes('aria-labelledby="teams-delete-team-title"') &&
      componentSource.includes('aria-describedby="teams-delete-team-description"') &&
      componentSource.includes('data-testid="teams-delete-team-confirmation"') &&
      componentSource.includes('data-testid="teams-delete-team-confirm"') &&
      componentSource.includes('aria-label={`Confirm deleting team ${pendingDeleteTeam.name}`}'),
    'Teams delete flow must expose an accessible in-app confirmation dialog with testable actions.',
  );
  assert(
    componentSource.includes('aria-labelledby="teams-remove-member-title"') &&
      componentSource.includes('aria-describedby="teams-remove-member-description"') &&
      componentSource.includes('data-testid="teams-remove-member-confirmation"') &&
      componentSource.includes('data-testid="teams-remove-member-confirm"') &&
      componentSource.includes('aria-label={`Confirm removing ${pendingRemoveMember.member.name}`}'),
    'Teams member removal must expose an accessible in-app confirmation dialog with testable actions.',
  );
  const noValidateCount = (componentSource.match(/noValidate/g) || []).length;
  assert(
    noValidateCount >= 3 &&
      componentSource.includes('validateTeamName') &&
      componentSource.includes('validateTeamSlug') &&
      componentSource.includes('validateTeamInviteEmail') &&
      componentSource.includes('validateTeamInviteRole') &&
      componentSource.includes('id="teams-create-name-error"') &&
      componentSource.includes('id="teams-edit-slug-error"') &&
      componentSource.includes('id="teams-invite-email-error"') &&
      componentSource.includes('data-testid="teams-create-inline-error"') &&
      componentSource.includes('data-testid="teams-edit-inline-error"') &&
      componentSource.includes('data-testid="teams-invite-inline-error"') &&
      componentSource.includes('aria-invalid={Boolean') &&
      componentSource.includes('Fix team fields before creating.') &&
      componentSource.includes('Fix team fields before saving.') &&
      componentSource.includes('Fix invitation fields before sending.'),
    'Teams create/edit/invite forms must use source-guarded inline validation instead of browser-only required fields.',
  );
  assert(
    source.includes('const canUseTeamRoleDefaults = isPermissionsLoading && !permissionMatrix && Boolean(currentAdmin);') &&
      source.includes('const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix && !canUseTeamRoleDefaults;') &&
      source.includes('const isTeamPermissionAllowed = (key: TeamPermissionKey) => (') &&
      source.includes("const canViewTeams = isTeamPermissionAllowed('users.view');") &&
      source.includes("const canManageTeams = isTeamPermissionAllowed('users.manage');") &&
      source.includes("const canExportActivity = isTeamPermissionAllowed('activity.export');") &&
      source.includes('const isTeamsBusy = isLoading || isRefreshing;') &&
      source.includes('const isTeamAuditDisabled = isLoadingTeamAudit || !canExportActivity || !currentTeamId;') &&
      !source.includes('const canViewTeams = !isPermissionMatrixPending') &&
      !source.includes('const isTeamsBusy = isLoading || isRefreshing || isPermissionMatrixPending;') &&
      !source.includes('const isTeamAuditDisabled = isLoadingTeamAudit || isPermissionMatrixPending'),
    'Teams permission state must keep owner/admin role-default workflows usable while backend permission details hydrate.',
  );
  assert(
    componentSource.includes('data-testid="teams-workspace-sites-details"') &&
      componentSource.includes('data-testid="teams-workspace-sites-panel"') &&
      componentSource.includes('data-default-collapsed="true"') &&
      componentSource.includes('Show sites') &&
      componentSource.includes('Create teams, assign members, and keep workspace ownership tied to the right site portfolio.') &&
      componentSource.includes("width: '100%'") &&
      componentSource.includes("maxWidth: 'none'") &&
      !componentSource.includes('+ Create Team'),
    'Teams management UI must use the current app shell width and keep low-frequency workspace-site ownership details collapsed by default.',
  );
  assert(
    componentSource.includes('data-testid="teams-create-actions"') &&
      componentSource.includes('data-testid="teams-create-action-status"') &&
      componentSource.includes('data-testid="teams-current-actions"') &&
      componentSource.includes('data-testid="teams-current-actions-status"') &&
      componentSource.includes('data-testid="teams-invite-actions"') &&
      componentSource.includes('data-testid="teams-invite-action-status"') &&
      componentSource.includes('data-testid="teams-invite-submit-action-status"') &&
      componentSource.includes("const inviteSubmitStatusId = 'teams-invite-submit-action-status';") &&
      componentSource.includes('data-action-state={inviteSubmitActionState}') &&
      componentSource.includes('data-action-status={inviteSubmitActionStatus}') &&
      componentSource.includes('data-disabled-reason={inviteSubmitDisabledReason || undefined}') &&
      componentSource.includes('data-target-email={normalizedEmail || undefined}') &&
      componentSource.includes('data-target-role={role}') &&
      componentSource.includes('data-testid={`teams-member-actions-${member.id}`}') &&
      componentSource.includes('data-testid={`teams-member-actions-status-${member.id}`}') &&
      componentSource.includes('data-action-status={currentTeamActionStatus}') &&
      componentSource.includes('data-action-state={actionState(teamDeleteDisabledReason)}') &&
      componentSource.includes('data-disabled-reason={removeDisabledReason || undefined}') &&
      componentSource.includes('aria-live="polite"') &&
      componentSource.includes('Role change unavailable:') &&
      componentSource.includes('Remove unavailable:'),
    'Teams action clusters and invite modal submit must expose named status summaries, action-state metadata, targets, and disabled reasons for team/member controls.',
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

const expectApiError = async (endpoint, options = {}, expectedCode) => {
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
  assert(!response.ok || payload.success === false, `${endpoint} unexpectedly succeeded: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(
    !expectedCode || payload.error?.code === expectedCode,
    `${endpoint} returned unexpected error: ${JSON.stringify(payload.error || payload).slice(0, 500)}`,
  );
  return payload;
};

const loginAdminApi = async () => {
  const login = (twoFactorCode) => fetch(`${API_BASE_URL}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@backy.io',
      password: process.env.BACKY_ADMIN_DEMO_PASSWORD || 'admin123',
      ...(twoFactorCode ? { twoFactorCode } : {}),
    }),
  });

  let response = await login();
  let payload = await response.json().catch(() => ({}));
  const smokeMfaCode = process.env.BACKY_TEAMS_SMOKE_MFA_CODE
    || process.env.BACKY_ADMIN_MFA_CODE
    || process.env.BACKY_ADMIN_2FA_CODE
    || 'backy-dev-mfa';
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

const listTeams = async () => {
  const payload = await requestApi('/api/admin/teams');
  return payload.data?.teams || [];
};

const listSites = async () => {
  const payload = await requestApi('/api/admin/sites?includeUnpublished=true');
  return payload.data?.sites || [];
};

const listUsers = async () => {
  const payload = await requestApi('/api/admin/users');
  return payload.data?.users || [];
};

const getSettings = async () => {
  const payload = await requestApi('/api/admin/settings');
  return payload.data?.settings || payload.settings;
};

const updateSettings = async (input) => {
  const payload = await requestApi('/api/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return payload.data?.settings || payload.settings;
};

const createTeam = async (name, overrides = {}) => {
  const payload = await requestApi('/api/admin/teams', {
    method: 'POST',
    body: JSON.stringify({ name, ...overrides }),
  });
  const team = payload.data?.team;
  assert(team?.id, `Create team did not return a team: ${JSON.stringify(payload).slice(0, 500)}`);
  return team;
};

const createSite = async ({ name, slug, teamId }) => {
  const payload = await requestApi('/api/admin/sites', {
    method: 'POST',
    body: JSON.stringify({
      name,
      slug,
      teamId,
      status: 'draft',
    }),
  });
  const site = payload.data?.site;
  assert(site?.id, `Create site did not return a site: ${JSON.stringify(payload).slice(0, 500)}`);
  return site;
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

const deleteSite = async (siteId) => {
  if (!siteId) return;
  await requestApi(`/api/admin/sites/${encodeURIComponent(siteId)}`, { method: 'DELETE' });
};

const cleanupPreviousSmokeRecords = async () => {
  const sites = await listSites();
  for (const site of sites) {
    if (typeof site.slug === 'string' && site.slug.startsWith('team-owned-site-')) {
      await deleteSite(site.id);
    }
  }

  const teams = await listTeams();
  for (const team of teams) {
    if (typeof team.slug === 'string' && (team.slug.startsWith('smoke-team-') || team.slug.startsWith('api-smoke-team-'))) {
      await deleteTeam(team.id);
    }
  }

  const users = await listUsers();
  for (const user of users) {
    if (typeof user.email === 'string' && user.email.startsWith('teams-') && user.email.endsWith('@example.com')) {
      await deleteUser(user.id);
    }
  }
};

const deleteUser = async (userId) => {
  if (!userId) return;
  await requestApi(`/api/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
};

const findUserByEmail = async (email) => {
  const users = await listUsers();
  return users.find((user) => user.email === email) || null;
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

const assertTeamInviteBillingSeatLimitEnforced = async (teamId, suffix) => {
  const settings = await getSettings();
  const existingUsers = await listUsers();
  const originalIntegrations = settings.integrations || {};
  const originalCommerce = originalIntegrations.commerce || {};
  const blockedEmail = `teams-seat-blocked-${suffix}@example.com`;

  await updateSettings({
    integrations: {
      ...originalIntegrations,
      commerce: {
        ...originalCommerce,
        seatLimit: Math.max(1, existingUsers.length),
        overageMode: 'block',
      },
    },
  });

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/teams/${encodeURIComponent(teamId)}/members`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiAdminSessionToken}`,
      },
      body: JSON.stringify({
        email: blockedEmail,
        role: 'viewer',
      }),
    });
    const payload = await response.json().catch(() => ({}));

    assert(response.status === 402, `Billing seat limit should reject team invite creation, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(payload?.error?.code === 'BILLING_SEAT_LIMIT', `Billing seat-limited team invite should return BILLING_SEAT_LIMIT: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(!(await findUserByEmail(blockedEmail)), 'Billing-limited team invite unexpectedly persisted a user.');
    const team = (await listTeams()).find((item) => item.id === teamId);
    assert(!team?.members?.some((member) => member.email === blockedEmail), 'Billing-limited team invite unexpectedly persisted a member.');
  } finally {
    await updateSettings({ integrations: originalIntegrations });
  }
};

const assertTeamCreateBillingTeamLimitEnforced = async (suffix) => {
  const settings = await getSettings();
  const teams = await listTeams();
  const originalIntegrations = settings.integrations || {};
  const originalCommerce = originalIntegrations.commerce || {};
  const blockedName = `Team Limit Blocked ${suffix}`;
  const blockedSlug = `team-limit-blocked-${suffix}`;

  await updateSettings({
    integrations: {
      ...originalIntegrations,
      commerce: {
        ...originalCommerce,
        teamLimit: Math.max(1, teams.length),
        overageMode: 'block',
      },
    },
  });

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/teams`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiAdminSessionToken}`,
      },
      body: JSON.stringify({
        name: blockedName,
        slug: blockedSlug,
      }),
    });
    const payload = await response.json().catch(() => ({}));

    assert(response.status === 402, `Billing team limit should reject team creation, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(payload?.error?.code === 'BILLING_TEAM_LIMIT', `Billing team-limited create should return BILLING_TEAM_LIMIT: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(!(await findTeamBySlug(blockedSlug)), 'Billing-limited team creation unexpectedly persisted a team.');
  } finally {
    await updateSettings({ integrations: originalIntegrations });
  }
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
    if (panel instanceof HTMLDetailsElement && !panel.open) {
      panel.open = true;
    }
    const text = panel?.innerText || '';
    const expectedLabels = ${JSON.stringify(expectedLabels)};
    return {
      ready: Boolean(panel) &&
        text.includes('Team activity') &&
        text.includes('activity.export') &&
        text.includes('Hide activity') &&
        text.includes('Request') &&
        expectedLabels.every((label) => text.includes(label)),
      panelOpen: panel instanceof HTMLDetailsElement ? panel.open : null,
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

const installBrowserAuthPreload = async (client, sessionToken, user) => client.send('Page.addScriptToEvaluateOnNewDocument', {
  source: authStorageScript(sessionToken, user),
});

const seedBrowserSessionCookie = async (client, sessionToken) => {
  await client.send('Network.enable');
  await client.send('Network.setCookie', {
    url: API_BASE_URL,
    name: 'backy_admin_session',
    value: sessionToken,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  });
};

const setBrowserAuth = async (client, sessionToken, user) => {
  await seedBrowserSessionCookie(client, sessionToken);
  await setBrowserAuthStorage(client, sessionToken, user);
};

const removeBrowserPreload = async (client, preload) => {
  if (preload?.identifier) {
    await client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: preload.identifier });
  }
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

const cleanup = async ({ client, childProcess, userDataDir, siteIds = [], teamIds = [], userIds = [] }) => {
  for (const siteId of siteIds) {
    try {
      await deleteSite(siteId);
    } catch {
      // Best-effort cleanup for temporary smoke sites.
    }
  }
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
  const temporarySiteIds = [];
  const temporaryTeamIds = [];
  const temporaryUserIds = [];
  const suffix = Date.now().toString(36);
  const teamName = `Smoke Team ${suffix}`;
  const editedName = `Smoke Team Edited ${suffix}`;
  const editedSlug = `smoke-team-edited-${suffix}`;
  const inviteEmail = `teams-smoke-${suffix}@example.com`;
  const adminEmail = `teams-admin-${suffix}@example.com`;
  const adminFullName = `Teams Admin ${suffix}`;
  const editorEmail = `teams-editor-${suffix}@example.com`;
  const editorFullName = `Teams Editor ${suffix}`;
  const defaultViewerEmail = `teams-viewer-${suffix}@example.com`;
  const defaultViewerFullName = `Teams Viewer ${suffix}`;
  const readOnlyEmail = `teams-readonly-${suffix}@example.com`;
  const readOnlyFullName = `Teams Readonly ${suffix}`;
  let activeAuthPreload = null;
  let adminUserId = '';

  try {
    assertTeamsRouteSourceContract();
    if (process.env.BACKY_TEAMS_SOURCE_ONLY === '1') {
      console.log(JSON.stringify({ ok: true, guard: 'teams-source' }));
      return;
    }

    const adminSession = await loginAdminApi();
    adminUserId = adminSession.user?.id || '';
    if (adminUserId) {
      await setUserPermissionOverrides(adminUserId, { 'sites.delete': 'allow' });
    }
    await cleanupPreviousSmokeRecords();
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

    const memberPolicyTeam = await createTeam(`API Member Policy ${suffix}`);
    temporaryTeamIds.push(memberPolicyTeam.id);
    const selfMember = memberPolicyTeam.members.find((member) => member.userId === adminSession.user.id);
    assert(selfMember?.id, `Current admin owner member missing from policy team: ${JSON.stringify(memberPolicyTeam).slice(0, 500)}`);
    await expectApiError(
      `/api/admin/teams/${encodeURIComponent(memberPolicyTeam.id)}/members/${encodeURIComponent(selfMember.id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role: 'editor' }),
      },
      'SELF_TEAM_MEMBER_RESTRICTED',
    );
    await expectApiError(
      `/api/admin/teams/${encodeURIComponent(memberPolicyTeam.id)}/members/${encodeURIComponent(selfMember.id)}`,
      { method: 'DELETE' },
      'SELF_TEAM_MEMBER_RESTRICTED',
    );
    const nonOwnerActorAccount = await createUser({
      fullName: `Teams Non Owner Actor ${suffix}`,
      email: `teams-non-owner-actor-${suffix}@example.com`,
      role: 'admin',
      status: 'invited',
    });
    temporaryUserIds.push(nonOwnerActorAccount.user.id);
    assert(nonOwnerActorAccount.invite?.token, `Non-owner actor invite token missing: ${JSON.stringify(nonOwnerActorAccount).slice(0, 500)}`);
    const nonOwnerActorSession = await acceptInvite(nonOwnerActorAccount.invite.token);
    const ownerPolicySessionToken = apiAdminSessionToken;
    try {
      apiAdminSessionToken = nonOwnerActorSession.session.token;
      await expectApiError(
        `/api/admin/teams/${encodeURIComponent(memberPolicyTeam.id)}/members`,
        {
          method: 'POST',
          body: JSON.stringify({ email: `teams-owner-denied-${suffix}@example.com`, role: 'owner' }),
        },
        'OWNER_ROLE_RESTRICTED',
      );
    } finally {
      apiAdminSessionToken = ownerPolicySessionToken;
    }
    await assertTeamInviteBillingSeatLimitEnforced(memberPolicyTeam.id, suffix);
    await assertTeamCreateBillingTeamLimitEnforced(suffix);
    await deleteTeam(memberPolicyTeam.id);
    temporaryTeamIds.pop();

    const ownerActorAccount = await createUser({
      fullName: `Teams Owner Actor ${suffix}`,
      email: `teams-owner-actor-${suffix}@example.com`,
      role: 'owner',
      status: 'invited',
    });
    temporaryUserIds.push(ownerActorAccount.user.id);
    assert(ownerActorAccount.invite?.token, `Owner actor invite token missing: ${JSON.stringify(ownerActorAccount).slice(0, 500)}`);
    const ownerTargetAccount = await createUser({
      fullName: `Teams Owner Target ${suffix}`,
      email: `teams-owner-target-${suffix}@example.com`,
      role: 'owner',
      status: 'invited',
    });
    temporaryUserIds.push(ownerTargetAccount.user.id);
    const ownerActorSession = await acceptInvite(ownerActorAccount.invite.token);
    const originalAdminSessionToken = apiAdminSessionToken;
    try {
      apiAdminSessionToken = ownerActorSession.session.token;
      const finalOwnerPolicyTeam = await createTeam(`API Final Owner Policy ${suffix}`, {
        ownerId: ownerTargetAccount.user.id,
      });
      temporaryTeamIds.push(finalOwnerPolicyTeam.id);
      const finalOwnerMember = finalOwnerPolicyTeam.members.find((member) => member.userId === ownerTargetAccount.user.id);
      assert(finalOwnerMember?.id, `Final owner member missing from policy team: ${JSON.stringify(finalOwnerPolicyTeam).slice(0, 500)}`);
      await expectApiError(
        `/api/admin/teams/${encodeURIComponent(finalOwnerPolicyTeam.id)}/members/${encodeURIComponent(finalOwnerMember.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ role: 'admin' }),
        },
        'FINAL_TEAM_OWNER_REQUIRED',
      );
      await expectApiError(
        `/api/admin/teams/${encodeURIComponent(finalOwnerPolicyTeam.id)}/members/${encodeURIComponent(finalOwnerMember.id)}`,
        { method: 'DELETE' },
        'FINAL_TEAM_OWNER_REQUIRED',
      );
      await deleteTeam(finalOwnerPolicyTeam.id);
      temporaryTeamIds.pop();
    } finally {
      apiAdminSessionToken = originalAdminSessionToken;
    }

    ({ childProcess, userDataDir } = launchChrome());
    const target = await waitForCdp();
    client = connectCdp(target.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await seedBrowserSessionCookie(client, adminSession.session.token);
    activeAuthPreload = await installBrowserAuthPreload(client, adminSession.session.token, adminSession.user);

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
        const siteDetails = document.querySelector('[data-testid="teams-workspace-sites-details"]');
        const siteText = siteDetails?.textContent || '';
        const createButton = document.querySelector('[data-testid="teams-create-button"]');
        const createStatus = document.querySelector('[data-testid="teams-create-action-status"]');
        const currentActions = document.querySelector('[data-testid="teams-current-actions"]');
        const currentStatus = document.querySelector('[data-testid="teams-current-actions-status"]');
        const editButton = document.querySelector('[data-testid="teams-edit-button"]');
        const deleteButton = document.querySelector('[data-testid="teams-delete-button"]');
        const inviteActions = document.querySelector('[data-testid="teams-invite-actions"]');
        const inviteStatus = document.querySelector('[data-testid="teams-invite-action-status"]');
        const inviteButton = document.querySelector('[data-testid="teams-invite-button"]');
        const auditPanel = document.querySelector('[data-testid="teams-audit-panel"]');
        const auditText = auditPanel?.textContent || '';
        return {
          ready: body.includes(${JSON.stringify(teamName)}) &&
            body.includes('/smoke-team-${suffix}') &&
            body.includes('Team created.') &&
            siteDetails instanceof HTMLDetailsElement &&
            siteDetails.open === false &&
            siteDetails.getAttribute('data-default-collapsed') === 'true' &&
            siteText.includes('Workspace Sites') &&
            siteText.includes('Show sites') &&
            siteText.includes('No sites are currently owned by this team.') &&
            auditPanel instanceof HTMLDetailsElement &&
            auditPanel.open === false &&
            auditPanel.getAttribute('data-default-collapsed') === 'true' &&
            auditText.includes('Team activity') &&
            auditText.includes('Show activity') &&
            auditText.includes('activity.export') &&
            createButton instanceof HTMLButtonElement &&
            createButton.getAttribute('aria-describedby') === 'teams-create-action-status' &&
            createButton.getAttribute('data-action-state') === 'ready' &&
            createStatus?.textContent?.includes('Create team available.') &&
            currentActions?.getAttribute('role') === 'group' &&
            currentActions?.getAttribute('aria-label') === ${JSON.stringify(`Actions for ${teamName}`)} &&
            currentActions?.getAttribute('aria-describedby') === 'teams-current-actions-status' &&
            currentActions?.getAttribute('data-action-status')?.includes('Edit available.') &&
            currentActions?.getAttribute('data-action-status')?.includes('Delete available.') &&
            currentStatus?.textContent?.includes('Edit available. Delete available.') &&
            editButton instanceof HTMLButtonElement &&
            editButton.getAttribute('aria-describedby') === 'teams-current-actions-status' &&
            editButton.getAttribute('data-action-state') === 'ready' &&
            deleteButton instanceof HTMLButtonElement &&
            deleteButton.getAttribute('aria-describedby') === 'teams-current-actions-status' &&
            deleteButton.getAttribute('data-action-state') === 'ready' &&
            inviteActions?.getAttribute('role') === 'group' &&
            inviteStatus?.textContent?.includes('Invite member available.') &&
            inviteButton instanceof HTMLButtonElement &&
            inviteButton.getAttribute('aria-describedby') === 'teams-invite-action-status' &&
            inviteButton.getAttribute('data-action-state') === 'ready',
          body: body.slice(0, 900),
          siteText: siteText.slice(0, 900),
          createStatus: createStatus?.textContent || '',
          currentActionStatus: currentActions?.getAttribute('data-action-status') || '',
          currentStatus: currentStatus?.textContent || '',
          inviteStatus: inviteStatus?.textContent || '',
          siteDetailsOpen: siteDetails instanceof HTMLDetailsElement ? siteDetails.open : null,
          auditPanelOpen: auditPanel instanceof HTMLDetailsElement ? auditPanel.open : null,
          auditText: auditText.slice(0, 900),
        };
      })()`,
      'Created team visible',
    );
    await waitForTeamAuditPanel(client, ['Team created'], 'Team create audit panel');

    const ownedSite = await createSite({
      name: `Team Owned Site ${suffix}`,
      slug: `team-owned-site-${suffix}`,
      teamId: createdTeam.id,
    });
    temporarySiteIds.push(ownedSite.id);
    await expectApiError(
      `/api/admin/teams/${encodeURIComponent(createdTeam.id)}`,
      { method: 'DELETE' },
      'TEAM_HAS_SITES',
    );
    await navigate(
      client,
      `${ADMIN_BASE_URL}/teams`,
      `(() => {
        const body = document.body?.innerText || '';
        const deleteButton = document.querySelector('[data-testid="teams-delete-button"]');
        const currentActions = document.querySelector('[data-testid="teams-current-actions"]');
        const currentStatus = document.querySelector('[data-testid="teams-current-actions-status"]');
        const siteDetails = document.querySelector('[data-testid="teams-workspace-sites-details"]');
        const siteText = siteDetails?.textContent || '';
        return {
          ready: siteDetails instanceof HTMLDetailsElement &&
            siteDetails.open === false &&
            siteDetails.getAttribute('data-default-collapsed') === 'true' &&
            siteText.includes(${JSON.stringify(ownedSite.name)}) &&
            siteText.includes('Workspace Sites') &&
            siteText.includes('1 total') &&
            deleteButton instanceof HTMLButtonElement &&
            deleteButton.disabled === true &&
            deleteButton.title.includes('Move or delete') &&
            deleteButton.getAttribute('aria-describedby') === 'teams-current-actions-status' &&
            deleteButton.getAttribute('data-action-state') === 'blocked' &&
            deleteButton.getAttribute('data-disabled-reason')?.includes('Move or delete') &&
            currentActions?.getAttribute('data-action-status')?.includes('Delete unavailable: Move or delete') &&
            currentStatus?.textContent?.includes('Delete unavailable: Move or delete'),
          body: body.slice(0, 1400),
          siteText: siteText.slice(0, 1400),
          siteDetailsOpen: siteDetails instanceof HTMLDetailsElement ? siteDetails.open : null,
          deleteDisabled: deleteButton instanceof HTMLButtonElement ? deleteButton.disabled : null,
          deleteTitle: deleteButton instanceof HTMLButtonElement ? deleteButton.title : null,
          deleteState: deleteButton instanceof HTMLButtonElement ? deleteButton.getAttribute('data-action-state') : null,
          deleteReason: deleteButton instanceof HTMLButtonElement ? deleteButton.getAttribute('data-disabled-reason') : null,
          currentActionStatus: currentActions?.getAttribute('data-action-status') || '',
          currentStatus: currentStatus?.textContent || '',
        };
      })()`,
      'Team workspace site ownership panel',
    );
    await deleteSite(ownedSite.id);
    temporarySiteIds.pop();
    await navigate(
      client,
      `${ADMIN_BASE_URL}/teams`,
      `(() => {
        const body = document.body?.innerText || '';
        const deleteButton = document.querySelector('[data-testid="teams-delete-button"]');
        const siteDetails = document.querySelector('[data-testid="teams-workspace-sites-details"]');
        const siteText = siteDetails?.textContent || '';
        return {
          ready: body.includes(${JSON.stringify(teamName)}) &&
            siteDetails instanceof HTMLDetailsElement &&
            siteDetails.open === false &&
            siteText.includes('No sites are currently owned by this team.') &&
            deleteButton instanceof HTMLButtonElement &&
            deleteButton.disabled === false,
          body: body.slice(0, 1400),
          siteText: siteText.slice(0, 1400),
          siteDetailsOpen: siteDetails instanceof HTMLDetailsElement ? siteDetails.open : null,
          deleteDisabled: deleteButton instanceof HTMLButtonElement ? deleteButton.disabled : null,
        };
      })()`,
      'Team workspace ownership cleared',
    );

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
    await waitForState(
      client,
      `(() => {
        const status = document.querySelector('[data-testid="teams-invite-submit-action-status"]');
        const submit = document.querySelector('[data-testid="teams-invite-submit"]');
        return {
          ready: submit instanceof HTMLButtonElement &&
            submit.disabled === false &&
            submit.getAttribute('aria-describedby') === 'teams-invite-submit-action-status' &&
            submit.getAttribute('data-action-state') === 'blocked' &&
            submit.getAttribute('data-action-status') === status?.textContent &&
            submit.getAttribute('data-target-role') === 'editor' &&
            status?.textContent?.includes('Send invite needs a valid email address.'),
          statusText: status?.textContent || '',
          buttonState: submit instanceof HTMLButtonElement ? submit.getAttribute('data-action-state') : null,
          targetRole: submit instanceof HTMLButtonElement ? submit.getAttribute('data-target-role') : null,
          body: document.body?.innerText?.slice(0, 900) || '',
        };
      })()`,
      'Invite modal initial action status',
    );
    await setInputValue(client, '[data-testid="teams-invite-email-input"]', inviteEmail);
    await setSelectValue(client, '[data-testid="teams-invite-role-select"]', 'viewer');
    await waitForState(
      client,
      `(() => {
        const status = document.querySelector('[data-testid="teams-invite-submit-action-status"]');
        const submit = document.querySelector('[data-testid="teams-invite-submit"]');
        return {
          ready: submit instanceof HTMLButtonElement &&
            submit.disabled === false &&
            submit.getAttribute('aria-describedby') === 'teams-invite-submit-action-status' &&
            submit.getAttribute('data-action-state') === 'ready' &&
            submit.getAttribute('data-action-status') === status?.textContent &&
            submit.getAttribute('data-target-email') === ${JSON.stringify(inviteEmail)} &&
            submit.getAttribute('data-target-role') === 'viewer' &&
            status?.textContent?.includes(${JSON.stringify(`Send invite available for ${inviteEmail} as viewer.`)}),
          statusText: status?.textContent || '',
          actionStatus: submit instanceof HTMLButtonElement ? submit.getAttribute('data-action-status') : null,
          targetEmail: submit instanceof HTMLButtonElement ? submit.getAttribute('data-target-email') : null,
          targetRole: submit instanceof HTMLButtonElement ? submit.getAttribute('data-target-role') : null,
          body: document.body?.innerText?.slice(0, 900) || '',
        };
      })()`,
      'Invite modal ready action status',
    );
    await clickSelector(client, '[data-testid="teams-invite-submit"]');
    await waitForState(
      client,
      `(() => {
        const body = document.body?.innerText || '';
        return {
          ready: Boolean(document.querySelector('[data-testid="team-invite-delivery-panel"]')) &&
            body.includes(${JSON.stringify(inviteEmail)}) &&
            (body.includes('Invite delivery queued') || body.includes('Manual invite delivery')) &&
            body.includes('/accept-invite?token=') &&
            body.includes('Provider ') &&
            body.includes('status queued'),
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
    await waitForState(
      client,
      `(() => {
        const group = document.querySelector('[data-testid="teams-member-actions-${invitedMember.id}"]');
        const status = document.querySelector('[data-testid="teams-member-actions-status-${invitedMember.id}"]');
        const roleSelect = document.querySelector('[data-testid="teams-member-role-${invitedMember.id}"]');
        const removeButton = document.querySelector('[data-testid="teams-member-remove-${invitedMember.id}"]');
        return {
          ready: group?.getAttribute('role') === 'group' &&
            group?.getAttribute('aria-describedby') === 'teams-member-actions-status-${invitedMember.id}' &&
            group?.getAttribute('data-action-status')?.includes('Role change available.') &&
            group?.getAttribute('data-action-status')?.includes('Remove available.') &&
            status?.textContent?.includes('Role change available. Remove available.') &&
            roleSelect instanceof HTMLSelectElement &&
            roleSelect.getAttribute('aria-describedby') === 'teams-member-actions-status-${invitedMember.id}' &&
            roleSelect.getAttribute('data-action-state') === 'ready' &&
            removeButton instanceof HTMLButtonElement &&
            removeButton.getAttribute('aria-describedby') === 'teams-member-actions-status-${invitedMember.id}' &&
            removeButton.getAttribute('data-action-state') === 'ready',
          groupLabel: group?.getAttribute('aria-label') || '',
          groupStatus: group?.getAttribute('data-action-status') || '',
          status: status?.textContent || '',
          roleState: roleSelect instanceof HTMLElement ? roleSelect.getAttribute('data-action-state') : null,
          removeState: removeButton instanceof HTMLElement ? removeButton.getAttribute('data-action-state') : null,
        };
      })()`,
      'Team member action semantics',
    );
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

    await clickSelector(client, `[data-testid="teams-member-remove-${invitedMember.id}"]`);
    await waitForState(
      client,
      `(() => {
        const dialog = document.querySelector('[data-testid="teams-remove-member-confirmation"]');
        const confirm = document.querySelector('[data-testid="teams-remove-member-confirm"]');
        const text = dialog?.textContent || '';
        return {
          ready: Boolean(dialog) && confirm instanceof HTMLButtonElement && text.includes(${JSON.stringify(inviteEmail)}),
          text: text.slice(0, 900),
        };
      })()`,
      'Member removal confirmation',
    );
    await clickSelector(client, '[data-testid="teams-remove-member-confirm"]');
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
    await waitForState(
      client,
      `(() => {
        const dialog = document.querySelector('[data-testid="teams-delete-team-confirmation"]');
        const confirm = document.querySelector('[data-testid="teams-delete-team-confirm"]');
        const text = dialog?.textContent || '';
        return {
          ready: Boolean(dialog) && confirm instanceof HTMLButtonElement && text.includes(${JSON.stringify(editedName)}),
          text: text.slice(0, 900),
        };
      })()`,
      'Team delete confirmation',
    );
    await clickSelector(client, '[data-testid="teams-delete-team-confirm"]');
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

    const adminAccount = await createUser({
      fullName: adminFullName,
      email: adminEmail,
      role: 'admin',
      status: 'invited',
    });
    temporaryUserIds.push(adminAccount.user.id);
    assert(adminAccount.invite?.token, `Admin role invite token missing: ${JSON.stringify(adminAccount).slice(0, 500)}`);
    const adminRoleSession = await acceptInvite(adminAccount.invite.token);
    await removeBrowserPreload(client, activeAuthPreload);
    activeAuthPreload = await installBrowserAuthPreload(client, adminRoleSession.session.token, adminRoleSession.user);
    await setBrowserAuth(client, adminRoleSession.session.token, adminRoleSession.user);
    await navigate(
      client,
      `${ADMIN_BASE_URL}/teams`,
      `(() => {
        const body = document.body?.innerText || '';
        const createButton = document.querySelector('[data-testid="teams-create-button"]');
        const editButton = document.querySelector('[data-testid="teams-edit-button"]');
        const inviteButton = document.querySelector('[data-testid="teams-invite-button"]');
        const deleteButton = document.querySelector('[data-testid="teams-delete-button"]');
        const siteDetails = document.querySelector('[data-testid="teams-workspace-sites-details"]');
        const siteText = siteDetails?.textContent || '';
        const auditPanel = document.querySelector('[data-testid="teams-audit-panel"]');
        const auditRefresh = auditPanel ? Array.from(auditPanel.querySelectorAll('button')).find((button) => (
          (button.textContent || '').includes('Refresh audit')
        )) : null;
        const auditText = auditPanel?.textContent || '';
        return {
          ready: window.location.pathname === '/teams' &&
            body.includes('Team Management') &&
            body.includes('Team activity') &&
            !body.includes('Team permissions unavailable') &&
            createButton instanceof HTMLButtonElement &&
            createButton.disabled === false &&
            (!(editButton instanceof HTMLButtonElement) || editButton.disabled === false) &&
            (!(inviteButton instanceof HTMLButtonElement) || inviteButton.disabled === false) &&
            deleteButton instanceof HTMLButtonElement &&
            (deleteButton.disabled === false || deleteButton.title.includes('Move or delete')) &&
            siteDetails instanceof HTMLDetailsElement &&
            siteDetails.open === false &&
            siteText.includes('Workspace Sites') &&
            auditPanel instanceof HTMLDetailsElement &&
            auditPanel.open === false &&
            auditPanel.getAttribute('data-default-collapsed') === 'true' &&
            auditText.includes('Show activity') &&
            auditText.includes('activity.export') &&
            auditRefresh instanceof HTMLButtonElement &&
            auditRefresh.disabled === false,
          path: window.location.pathname,
          body: body.slice(0, 1600),
          siteText: siteText.slice(0, 1200),
          siteDetailsOpen: siteDetails instanceof HTMLDetailsElement ? siteDetails.open : null,
          auditPanelOpen: auditPanel instanceof HTMLDetailsElement ? auditPanel.open : null,
          auditText: auditText.slice(0, 900),
          createDisabled: createButton instanceof HTMLButtonElement ? createButton.disabled : null,
          editDisabled: editButton instanceof HTMLButtonElement ? editButton.disabled : null,
          inviteDisabled: inviteButton instanceof HTMLButtonElement ? inviteButton.disabled : null,
          deleteDisabled: deleteButton instanceof HTMLButtonElement ? deleteButton.disabled : null,
          auditRefreshDisabled: auditRefresh instanceof HTMLButtonElement ? auditRefresh.disabled : null,
        };
      })()`,
      'Admin Teams permission pass',
    );

    const editorAccount = await createUser({
      fullName: editorFullName,
      email: editorEmail,
      role: 'editor',
      status: 'invited',
    });
    temporaryUserIds.push(editorAccount.user.id);
    assert(editorAccount.invite?.token, `Editor role invite token missing: ${JSON.stringify(editorAccount).slice(0, 500)}`);
    const editorRoleSession = await acceptInvite(editorAccount.invite.token);
    await removeBrowserPreload(client, activeAuthPreload);
    activeAuthPreload = await installBrowserAuthPreload(client, editorRoleSession.session.token, editorRoleSession.user);
    await setBrowserAuth(client, editorRoleSession.session.token, editorRoleSession.user);
    await navigate(
      client,
      `${ADMIN_BASE_URL}/teams`,
      `(() => {
        const body = document.body?.innerText || '';
        const createButton = document.querySelector('[data-testid="teams-create-button"]');
        const refreshButton = Array.from(document.querySelectorAll('button')).find((button) => (
          (button.textContent || '').trim() === 'Refresh'
        ));
        return {
          ready: window.location.pathname === '/teams' &&
            body.includes('Teams unavailable') &&
            body.includes('editor role does not include this capability.') &&
            body.includes('No teams yet') &&
            createButton instanceof HTMLButtonElement &&
            createButton.disabled === true &&
            refreshButton instanceof HTMLButtonElement &&
            refreshButton.disabled === true,
          path: window.location.pathname,
          body: body.slice(0, 1600),
          createDisabled: createButton instanceof HTMLButtonElement ? createButton.disabled : null,
          refreshDisabled: refreshButton instanceof HTMLButtonElement ? refreshButton.disabled : null,
        };
      })()`,
      'Editor Teams permission block',
    );

    const defaultViewerAccount = await createUser({
      fullName: defaultViewerFullName,
      email: defaultViewerEmail,
      role: 'viewer',
      status: 'invited',
    });
    temporaryUserIds.push(defaultViewerAccount.user.id);
    assert(defaultViewerAccount.invite?.token, `Default viewer invite token missing: ${JSON.stringify(defaultViewerAccount).slice(0, 500)}`);
    const defaultViewerSession = await acceptInvite(defaultViewerAccount.invite.token);
    await removeBrowserPreload(client, activeAuthPreload);
    activeAuthPreload = await installBrowserAuthPreload(client, defaultViewerSession.session.token, defaultViewerSession.user);
    await setBrowserAuth(client, defaultViewerSession.session.token, defaultViewerSession.user);
    await navigate(
      client,
      `${ADMIN_BASE_URL}/teams`,
      `(() => {
        const body = document.body?.innerText || '';
        const createButton = document.querySelector('[data-testid="teams-create-button"]');
        const refreshButton = Array.from(document.querySelectorAll('button')).find((button) => (
          (button.textContent || '').trim() === 'Refresh'
        ));
        return {
          ready: window.location.pathname === '/teams' &&
            body.includes('Teams unavailable') &&
            body.includes('viewer role does not include this capability.') &&
            body.includes('No teams yet') &&
            createButton instanceof HTMLButtonElement &&
            createButton.disabled === true &&
            refreshButton instanceof HTMLButtonElement &&
            refreshButton.disabled === true,
          path: window.location.pathname,
          body: body.slice(0, 1600),
          createDisabled: createButton instanceof HTMLButtonElement ? createButton.disabled : null,
          refreshDisabled: refreshButton instanceof HTMLButtonElement ? refreshButton.disabled : null,
        };
      })()`,
      'Default viewer Teams permission block',
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
    await removeBrowserPreload(client, activeAuthPreload);
    activeAuthPreload = await installBrowserAuthPreload(client, readOnlySession.session.token, readOnlySession.user);
    await setBrowserAuth(client, readOnlySession.session.token, readOnlySession.user);
    await navigate(
      client,
      `${ADMIN_BASE_URL}/teams`,
      `(() => {
        const body = document.body?.innerText || '';
        const createButton = document.querySelector('[data-testid="teams-create-button"]');
        const editButton = document.querySelector('[data-testid="teams-edit-button"]');
        const inviteButton = document.querySelector('[data-testid="teams-invite-button"]');
        const deleteButton = document.querySelector('[data-testid="teams-delete-button"]');
        const createStatus = document.querySelector('[data-testid="teams-create-action-status"]');
        const currentActions = document.querySelector('[data-testid="teams-current-actions"]');
        const currentStatus = document.querySelector('[data-testid="teams-current-actions-status"]');
        const inviteStatus = document.querySelector('[data-testid="teams-invite-action-status"]');
        const auditPanel = document.querySelector('[data-testid="teams-audit-panel"]');
        const auditRefresh = auditPanel ? Array.from(auditPanel.querySelectorAll('button')).find((button) => (
          (button.textContent || '').includes('Refresh audit')
        )) : null;
        const auditText = auditPanel?.textContent || '';
        const roleSelects = Array.from(document.querySelectorAll('[data-testid^="teams-member-role-"]'));
        const removeButtons = Array.from(document.querySelectorAll('[data-testid^="teams-member-remove-"]'));
        const memberGroups = Array.from(document.querySelectorAll('[data-testid^="teams-member-actions-"]')).filter((element) => (
          !element.getAttribute('data-testid')?.startsWith('teams-member-actions-status-')
        ));
        return {
          ready: window.location.pathname === '/teams' &&
            body.includes('Team Management') &&
            body.includes('Team activity') &&
            body.includes('activity.export') &&
            body.includes('Explicit override denies this capability.') &&
            auditPanel instanceof HTMLDetailsElement &&
            auditPanel.open === false &&
            auditPanel.getAttribute('data-default-collapsed') === 'true' &&
            auditText.includes('Show activity') &&
            createButton instanceof HTMLButtonElement &&
            createButton.disabled === true &&
            (!(editButton instanceof HTMLButtonElement) || editButton.disabled === true) &&
            (!(inviteButton instanceof HTMLButtonElement) || inviteButton.disabled === true) &&
            (!(deleteButton instanceof HTMLButtonElement) || deleteButton.disabled === true) &&
            (!(auditRefresh instanceof HTMLButtonElement) || auditRefresh.disabled === true) &&
            roleSelects.every((select) => select.disabled === true) &&
            removeButtons.every((button) => button.disabled === true) &&
            createButton.getAttribute('aria-describedby') === 'teams-create-action-status' &&
            createButton.getAttribute('data-action-state') === 'blocked' &&
            createStatus?.textContent?.includes('Create team unavailable: Explicit override denies this capability.') &&
            (!(currentActions instanceof HTMLElement) || currentActions.getAttribute('data-action-status')?.includes('Edit unavailable: Explicit override denies this capability.')) &&
            (!(currentStatus instanceof HTMLElement) || (
              currentStatus.textContent?.includes('Delete unavailable: Explicit override denies this capability.') ||
              currentStatus.textContent?.includes('Delete unavailable: Move or delete this team\\'s sites before deleting the team.')
            )) &&
            (!(inviteStatus instanceof HTMLElement) || inviteStatus.textContent?.includes('Invite member unavailable: Explicit override denies this capability.')) &&
            roleSelects.every((select) => select.getAttribute('data-action-state') === 'blocked') &&
            removeButtons.every((button) => button.getAttribute('data-action-state') === 'blocked') &&
            memberGroups.every((group) => group.getAttribute('data-action-status')?.includes('Explicit override denies this capability.')),
          path: window.location.pathname,
          body: body.slice(0, 1600),
          createStatus: createStatus?.textContent || '',
          currentActionStatus: currentActions?.getAttribute('data-action-status') || '',
          currentStatus: currentStatus?.textContent || '',
          inviteStatus: inviteStatus?.textContent || '',
          auditPanelOpen: auditPanel instanceof HTMLDetailsElement ? auditPanel.open : null,
          auditText: auditText.slice(0, 900),
          createDisabled: createButton instanceof HTMLButtonElement ? createButton.disabled : null,
          editDisabled: editButton instanceof HTMLButtonElement ? editButton.disabled : null,
          inviteDisabled: inviteButton instanceof HTMLButtonElement ? inviteButton.disabled : null,
          deleteDisabled: deleteButton instanceof HTMLButtonElement ? deleteButton.disabled : null,
          auditRefreshDisabled: auditRefresh instanceof HTMLButtonElement ? auditRefresh.disabled : null,
          roleDisabled: roleSelects.map((select) => select.disabled),
          removeDisabled: removeButtons.map((button) => button.disabled),
          roleStates: roleSelects.map((select) => select.getAttribute('data-action-state')),
          removeStates: removeButtons.map((button) => button.getAttribute('data-action-state')),
          memberStatuses: memberGroups.map((group) => group.getAttribute('data-action-status')),
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
      adminEmail,
      editorEmail,
      defaultViewerEmail,
      readOnlyEmail,
      screenshot: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, siteIds: temporarySiteIds, teamIds: temporaryTeamIds, userIds: temporaryUserIds });
    if (adminUserId) {
      try {
        await setUserPermissionOverrides(adminUserId, { 'sites.delete': null });
      } catch {
        // Best-effort restoration for the smoke-only cleanup permission.
      }
    }
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
