#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_DASHBOARD_CDP_PORT || 9385);
const SCREENSHOT_PATH = process.env.BACKY_DASHBOARD_SCREENSHOT || path.join(os.tmpdir(), 'backy-dashboard-smoke.png');
const MOBILE_SCREENSHOT_PATH = process.env.BACKY_DASHBOARD_MOBILE_SCREENSHOT || path.join(os.tmpdir(), 'backy-dashboard-smoke-mobile.png');
const COMMAND_ACTION_STATUS_SMOKE = process.env.BACKY_DASHBOARD_COMMAND_ACTION_STATUS_SMOKE === '1';
let apiAdminSessionToken = '';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertDashboardSourceContracts = () => {
  const source = fs.readFileSync(new URL('../src/routes/index.tsx', import.meta.url), 'utf8');
  const customFrontendLaunchSource = fs.readFileSync(new URL('../src/lib/customFrontendLaunch.ts', import.meta.url), 'utf8');
  const contractSource = `${source}\n${customFrontendLaunchSource}`;
  const sidebarSource = fs.readFileSync(new URL('../src/components/layout/Sidebar.tsx', import.meta.url), 'utf8');
  for (const snippet of [
    "schemaVersion: 'backy.dashboard-handoff.v1'",
    'generatedAt: new Date().toISOString()',
    'source: dashboard.source',
    'attention: {',
    'issueCount: issues.length',
    'issues: issues.map',
    'frontendHandoffText',
    'Download JSON',
    "import { EmptyState } from '@/components/ui/EmptyState';",
    'title="No deployment preflight runs yet"',
    'Run a deployment preflight to capture readiness, domain, cache, and frontend delivery evidence for this dashboard session.',
    'title="No infrastructure diagnostics yet"',
    'Run the infrastructure check to reveal missing runtime fields for Supabase, storage, database persistence, and Vercel deployment.',
    'title="No backend activity yet"',
    'title="No publish blockers found"',
    'search={getDashboardRouteSearch(issue.to)}',
    '{canEditPages && (',
    '{canViewCommerce && (',
    '{canViewForms && (',
    '{canViewUsers && (',
    'data-testid="dashboard-platform-details"',
    'Backend platform health and workflow',
    'detail: `${platformReadiness.readyCount}/${platformReadiness.total} checks`',
    'data-testid="dashboard-focus-lane"',
    'Start here',
    'Your current role has read-only dashboard access.',
    'const dashboardCommandActionStatusId =',
    'const dashboardCommandSecondaryActionStatusId =',
    'data-testid="dashboard-command-actions"',
    'data-testid="dashboard-command-actions-status"',
    'data-testid="dashboard-command-secondary-action-status"',
    'data-testid="dashboard-primary-actions"',
    'data-testid="dashboard-secondary-actions"',
    'data-action-status={dashboardCommandSecondaryActionStatus}',
    'data-testid="dashboard-more-actions"',
    'data-testid="dashboard-secondary-action-menu"',
    "label: 'New product'",
    "label: 'New form'",
    'const buildDashboardPageCreateRoute = useCallback',
    "templateSource: 'backy-canvas'",
    "focus: 'canvas'",
    'pageBuilder: buildDashboardPageCreateRoute()',
    "contactPageTemplate: buildDashboardPageCreateRoute('contact')",
    "registrationPageTemplate: buildDashboardPageCreateRoute('registration')",
    "storefrontPageTemplate: buildDashboardPageCreateRoute('storefront')",
    "blogIndexPageTemplate: buildDashboardPageCreateRoute('blog-index')",
    "quickCreate: 'product'",
    "quickCreate: 'blank'",
    "'commerce.edit'",
    "'forms.create'",
    'data-testid="dashboard-command-refresh"',
    'data-testid="dashboard-command-copy-handoff"',
    'data-testid="dashboard-command-download-handoff"',
    'data-action-state={dashboardCommandActionState}',
    'data-action-state={dashboardCommandSecondaryActionState}',
    'data-action-status={dashboardRefreshActionStatus}',
    'data-action-status={dashboardCopyHandoffActionStatus}',
    'data-action-status={dashboardDownloadHandoffActionStatus}',
    'data-disabled-reason={dashboardCommandDisabledReason || undefined}',
    'data-testid="dashboard-control-map-details"',
    'aria-label={`${area.title}: ${area.detail}`}',
    'data-dashboard-disclosure="workspace-context"',
    'data-testid="dashboard-account-authority"',
    'data-owner-count={activeOwnerUsers.length}',
    'data-access-state={ownerAccessState}',
    'Multiple active owners. Review access if any setup account should be demoted or removed.',
    'Signed-in role',
    'Active owners',
    'Review users',
    'getSitePrimaryHost(activeSite, {',
    "const canViewSites = isDashboardPermissionAllowed(permissionMatrix, user, 'sites.view');",
    "label: 'Custom frontend'",
    "detail: 'API handoff'",
    'data-testid="dashboard-module-map-details"',
    "schemaVersion: 'backy.dashboard-custom-frontend-launch.v1'",
    "schemaVersion: 'backy.dashboard-custom-frontend-control-readiness.v1'",
    "schemaVersion: 'backy.dashboard-custom-frontend-next-action.v1'",
    "schemaVersion: 'backy.dashboard-custom-frontend-content-creation.v1'",
    'backy.dashboard-custom-frontend-agent-brief.v1',
    "domainOwner: 'custom-frontend-vercel-project'",
    'buildDashboardCustomFrontendLaunch',
    'buildDashboardCustomFrontendControlReadiness',
    'buildDashboardCustomFrontendContentCreation',
    'buildDashboardCustomFrontendAgentBrief',
    'customFrontendLaunch',
    'customFrontendControlReadiness',
    'customFrontendContentCreation',
    'customFrontendAgentBrief',
    "params.set('templateSource', 'custom-frontend')",
    'frontendDesignTemplateId',
    'NEXT_PUBLIC_BACKY_API_BASE_URL',
    'NEXT_PUBLIC_BACKY_SITE_ID',
    'NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST',
    'BACKY_PUBLIC_API_BASE_URL',
    'data-testid="dashboard-custom-frontend-launch"',
    'data-testid="dashboard-custom-frontend-control-readiness"',
    'data-testid="dashboard-custom-frontend-next-action"',
    'data-testid="dashboard-copy-custom-frontend-next-action"',
    'data-testid="dashboard-custom-frontend-agent-brief"',
    'data-testid="dashboard-copy-custom-frontend-agent-brief"',
    'data-agent-brief-content-creation-schema',
    'data-testid="dashboard-custom-frontend-content-creation"',
    'dashboard-create-custom-frontend-${item.id}',
    "'dashboard-create-custom-frontend-post'",
    'data-testid={actionTestId}',
    'data-form-create-route',
    'data-product-create-route',
    'data-collection-create-route',
    'data-section-create-route',
    'frontendTemplate',
    'data-testid={`dashboard-custom-frontend-content-item-${item.id}`}',
    'data-testid="dashboard-open-custom-frontend-verifier"',
    'data-testid={`dashboard-custom-frontend-control-check-${check.id}`}',
    'data-testid="dashboard-custom-frontend-browser-env"',
    'data-testid="dashboard-custom-frontend-server-env"',
    'Open Sites handoff',
  ]) {
    assert(contractSource.includes(snippet), `Dashboard handoff contract is missing ${snippet}`);
  }
  {
    const commandCenterStart = source.indexOf('data-testid="dashboard-command-center"');
    const commandCenterEnd = source.indexOf('<div className="grid gap-3 border-t border-border bg-background/55', commandCenterStart);
    const commandCenterSource = commandCenterStart >= 0 && commandCenterEnd > commandCenterStart
      ? source.slice(commandCenterStart, commandCenterEnd)
      : '';
    const primaryIndex = commandCenterSource.indexOf('data-testid="dashboard-primary-actions"');
    const newSiteIndex = commandCenterSource.indexOf('dashboard-command-${action.label.toLowerCase().replace');
    const refreshIndex = commandCenterSource.indexOf('data-testid="dashboard-command-refresh"');
    const secondaryIndex = commandCenterSource.indexOf('data-testid="dashboard-secondary-actions"');
    const moreIndex = commandCenterSource.indexOf('data-testid="dashboard-more-actions"');
    const copyIndex = commandCenterSource.indexOf('data-testid="dashboard-command-copy-handoff"');
    const downloadIndex = commandCenterSource.indexOf('data-testid="dashboard-command-download-handoff"');
    assert(
      primaryIndex >= 0 &&
        newSiteIndex > primaryIndex &&
        refreshIndex > newSiteIndex &&
        secondaryIndex > refreshIndex &&
        commandCenterSource.includes('data-testid="dashboard-secondary-actions"') &&
        commandCenterSource.includes('data-default-collapsed="true"') &&
        moreIndex > secondaryIndex &&
        copyIndex > moreIndex &&
        downloadIndex > copyIndex,
      'Dashboard command center must lead with workspace creation and Refresh before collapsed frontend handoff actions.',
    );
  }
  assert(
    !source.includes('setInfrastructureDiagnostics([]);'),
    'Dashboard refresh/hydration must not clear completed infrastructure diagnostics after the check succeeds.',
  );
  assert(
    sidebarSource.includes('data-testid={`${testIdPrefix}-brand-header`}') &&
      sidebarSource.includes("data-brand-header-layout={collapsed ? 'compact-brand' : 'expanded-site-controls'}") &&
      sidebarSource.includes("collapsed ? 'h-16 items-center justify-center' : 'min-h-[120px] items-start justify-start py-3'") &&
      sidebarSource.includes("data-expanded-site-switcher-layout={collapsed ? 'compact-brand' : 'stacked-site-controls'}"),
    'Sidebar expanded site switcher must reserve enough vertical space for Backy, Manage, Site, Domains, and Help controls.',
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
  const smokeMfaCode = process.env.BACKY_DASHBOARD_SMOKE_MFA_CODE
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

const createSite = async ({ name, slug }) => {
  const payload = await requestApi('/api/admin/sites', {
    method: 'POST',
    body: JSON.stringify({
      name,
      slug,
      description: 'Temporary dashboard smoke workspace.',
      status: 'draft',
    }),
  });
  const site = payload.data?.site || payload.site;
  assert(site?.id, `Create site did not return a site: ${JSON.stringify(payload).slice(0, 500)}`);
  return site;
};

const deleteSite = async (siteId) => {
  if (!siteId) return;
  await requestApi(`/api/admin/sites/${siteId}`, { method: 'DELETE' });
};

const fetchJson = async (endpoint) => {
  const response = await fetch(`http://127.0.0.1:${PORT}${endpoint}`);
  if (!response.ok) {
    throw new Error(`${endpoint} returned ${response.status}`);
  }
  return response.json();
};

const isUsablePageTarget = (target) => {
  if (!target || target.type !== 'page' || !target.webSocketDebuggerUrl) return false;
  const url = target.url || '';
  return !(
    url.startsWith('chrome://') ||
    url.startsWith('devtools://') ||
    url.startsWith('chrome-error://') ||
    url.startsWith('chrome-extension://')
  );
};

const getTargetScore = (target) => {
  const url = target.url || '';
  if (url.startsWith(ADMIN_BASE_URL)) return 0;
  if (url === 'about:blank') return 1;
  if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) return 2;
  if (url.startsWith('http://') || url.startsWith('https://')) return 3;
  return 4;
};

const selectUsablePageTarget = (targets) => (
  [...targets]
    .filter(isUsablePageTarget)
    .sort((left, right) => getTargetScore(left) - getTargetScore(right))[0]
);

const waitForCdp = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const pages = await fetchJson('/json/list');
      const page = selectUsablePageTarget(pages);
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

const authStorageScript = (sessionToken, user = { id: 'user-admin', email: 'admin@backy.io', fullName: 'Admin User', role: 'owner' }) => `
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

const createUser = async (input) => {
  const payload = await requestApi('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const user = payload.data?.user || payload.user;
  assert(user?.id, `Create dashboard RBAC user did not return a user: ${JSON.stringify(payload).slice(0, 500)}`);
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
  assert(session?.token && user?.id, `Invite accept did not return a user session: ${JSON.stringify(payload).slice(0, 500)}`);
  return { session, user };
};

const deleteUser = async (userId) => {
  if (!userId) return;
  await requestApi(`/api/admin/users/${userId}`, { method: 'DELETE' });
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
    if (attempt === 119) {
      throw new Error(`${description} did not become ready: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const navigateToDashboard = (client) => navigate(
  client,
  `${ADMIN_BASE_URL}/`,
  `(() => ({
    ready: Boolean(document.querySelector('[data-testid="dashboard-command-center"]')) &&
      Boolean(document.querySelector('#dashboard-active-site')) &&
      document.body?.innerText?.includes('Dashboard command center'),
    body: document.body?.innerText?.slice(0, 900) || '',
  }))()`,
  'Dashboard',
);

const captureScreenshot = async (client, screenshotPath) => {
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  const screenshot = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
  });
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  return screenshotPath;
};

const waitForDashboardSite = async (client, siteName) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="dashboard-command-center"]')),
      hasSite: Array.from(document.querySelectorAll('#dashboard-active-site option')).some((option) => option.textContent?.includes(${JSON.stringify(siteName)})),
      path: window.location.pathname,
      body: document.body?.innerText?.slice(0, 1000) || '',
    }))()`);
    if (state.ready && state.hasSite && state.path === '/') {
      return state;
    }
    if (attempt === 119) {
      throw new Error(`Dashboard did not load temporary site option: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const selectDashboardSite = async (client, siteId) => {
  const result = await evaluate(client, `(() => {
    const select = document.querySelector('#dashboard-active-site');
    if (!(select instanceof HTMLSelectElement)) {
      return { ok: false, reason: 'select-missing' };
    }
    const option = Array.from(select.options).find((candidate) => candidate.value === ${JSON.stringify(siteId)});
    if (!option) {
      return {
        ok: false,
        reason: 'option-missing',
        values: Array.from(select.options).map((candidate) => ({ value: candidate.value, text: candidate.textContent })).slice(0, 40),
      };
    }
    const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    descriptor?.set?.call(select, ${JSON.stringify(siteId)});
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: select.value };
  })()`);
  assert(result.ok, `Unable to select dashboard site: ${JSON.stringify(result)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      search: window.location.search,
      selected: document.querySelector('#dashboard-active-site')?.value || '',
      hasScopedApi: document.body?.innerText?.includes(${JSON.stringify(`/api/sites/${siteId}/manifest`)}) ||
        document.body?.innerText?.includes(${JSON.stringify(`/api/admin/sites/${siteId}/pages`)}) ||
        false,
    }))()`);
    if (state.search.includes(`siteId=${encodeURIComponent(siteId)}`) && state.selected === siteId && state.hasScopedApi) {
      return state;
    }
    if (attempt === 79) {
      throw new Error(`Dashboard did not switch API site: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const clickDashboardRefresh = async (client) => {
  let result = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    result = await evaluate(client, `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
        (candidate.getAttribute('aria-label') || '') === 'Refresh dashboard data' ||
        (candidate.textContent || '').includes('Refresh data')
      ));
      if (!(button instanceof HTMLButtonElement)) {
        return { ok: false, reason: 'button-missing', buttons: Array.from(document.querySelectorAll('button')).map((candidate) => candidate.textContent || '').slice(0, 40) };
      }
      if (button.disabled) return { ok: false, reason: 'button-disabled', text: button.textContent || '' };
      button.click();
      return { ok: true };
    })()`);
    if (result.ok) {
      break;
    }
    await sleep(250);
  }
  assert(result.ok, `Unable to refresh dashboard: ${JSON.stringify(result)}`);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
        (candidate.getAttribute('aria-label') || '') === 'Refresh dashboard data' ||
        (candidate.textContent || '').includes('Refresh data') ||
        (candidate.textContent || '').includes('Refresh')
      ));
      return {
        ready: Boolean(document.querySelector('[data-testid="dashboard-command-center"]')),
        disabled: button instanceof HTMLButtonElement ? button.disabled : null,
        body: document.body?.innerText?.slice(0, 500) || '',
      };
    })()`);
    if (state.ready && state.disabled === false) {
      return state;
    }
    if (attempt === 99) {
      throw new Error(`Dashboard refresh did not settle: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return null;
};

const runDashboardInfrastructureCheck = async (client) => {
  const result = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
      (candidate.getAttribute('aria-label') || '') === 'Run dashboard infrastructure check' ||
      (candidate.textContent || '').includes('Run infrastructure check')
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'button-missing', buttons: Array.from(document.querySelectorAll('button')).map((candidate) => candidate.textContent || '').slice(0, 60) };
    }
    if (button.disabled) return { ok: false, reason: 'button-disabled', text: button.textContent || '' };
    button.click();
    return { ok: true };
  })()`);
  assert(result.ok, `Unable to run dashboard infrastructure check: ${JSON.stringify(result)}`);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="dashboard-infrastructure-diagnostics"]');
      const text = panel?.textContent || '';
      const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
        (candidate.getAttribute('aria-label') || '') === 'Run dashboard infrastructure check' ||
        (candidate.textContent || '').includes('Run infrastructure check')
      ));
      return {
        ready: Boolean(panel) &&
          text.includes('Database runtime') &&
          text.includes('Media storage') &&
          text.includes('Supabase connection') &&
          text.includes('Vercel deployment'),
        disabled: button instanceof HTMLButtonElement ? button.disabled : null,
        text: text.slice(0, 1200),
        body: document.body?.innerText?.slice(0, 2200) || '',
        buttons: Array.from(document.querySelectorAll('button')).map((candidate) => ({
          ariaLabel: candidate.getAttribute('aria-label') || '',
          disabled: candidate instanceof HTMLButtonElement ? candidate.disabled : null,
          text: (candidate.textContent || '').trim().slice(0, 90),
        })).slice(0, 80),
        settingsRequests: performance.getEntriesByType('resource')
          .filter((entry) => entry.name.includes('/api/admin/settings'))
          .slice(-8)
          .map((entry) => ({
            name: entry.name,
            initiatorType: entry.initiatorType,
            duration: Math.round(entry.duration),
            transferSize: entry.transferSize,
          })),
        authStorage: (localStorage.getItem('backy-auth-storage') || '').slice(0, 220),
      };
    })()`);
    if (state.ready && state.disabled === false) {
      return state;
    }
    if (attempt === 99) {
      throw new Error(`Dashboard infrastructure diagnostics did not render: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return null;
};

const runDashboardDeploymentPreflight = async (client) => {
  const result = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
      (candidate.getAttribute('aria-label') || '') === 'Run dashboard deployment preflight' ||
      (candidate.textContent || '').includes('Run deployment preflight')
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'button-missing', buttons: Array.from(document.querySelectorAll('button')).map((candidate) => candidate.textContent || '').slice(0, 80) };
    }
    if (button.disabled) return { ok: false, reason: 'button-disabled', text: button.textContent || '' };
    button.click();
    return { ok: true };
  })()`);
  assert(result.ok, `Unable to run dashboard deployment preflight: ${JSON.stringify(result)}`);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="dashboard-deployment-history"]');
      const text = panel?.textContent || '';
      const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
        (candidate.getAttribute('aria-label') || '') === 'Run dashboard deployment preflight' ||
        (candidate.textContent || '').includes('Run deployment preflight')
      ));
      return {
        ready: Boolean(panel) &&
          text.includes('Deployment execution and history') &&
          text.includes('Preflight history') &&
          /ready|warning|blocked/i.test(text),
        disabled: button instanceof HTMLButtonElement ? button.disabled : null,
        text: text.slice(0, 1200),
      };
    })()`);
    if (state.ready && state.disabled === false) {
      return state;
    }
    if (attempt === 99) {
      throw new Error(`Dashboard deployment preflight did not render history: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return null;
};

const assertDashboardLayout = async (client, siteName) => {
  const layout = await evaluate(client, `(() => {
    const apiConsumers = document.querySelector('[data-testid="dashboard-api-consumers"]');
    const customLaunch = document.querySelector('[data-testid="dashboard-custom-frontend-launch"]');
    const customReadiness = document.querySelector('[data-testid="dashboard-custom-frontend-control-readiness"]');
    const customNextAction = document.querySelector('[data-testid="dashboard-custom-frontend-next-action"]');
    const customAgentBrief = document.querySelector('[data-testid="dashboard-custom-frontend-agent-brief"]');
    const customContentCreation = document.querySelector('[data-testid="dashboard-custom-frontend-content-creation"]');
    const customPageCreate = document.querySelector('[data-testid="dashboard-create-custom-frontend-page"]');
    const customPostCreate = document.querySelector('[data-testid="dashboard-create-custom-frontend-post"]');
    const customLaunchText = customLaunch?.textContent || '';
    const customLaunchState = {
      exists: Boolean(customLaunch),
      schema: customLaunch?.getAttribute('data-schema') || '',
      domainOwner: customLaunch?.getAttribute('data-domain-owner') || '',
      browserEnvKeys: customLaunch?.getAttribute('data-browser-env-keys') || '',
      serverEnvKeys: customLaunch?.getAttribute('data-server-env-keys') || '',
      controlSchema: customLaunch?.getAttribute('data-control-readiness-schema') || '',
      controlStatus: customLaunch?.getAttribute('data-control-readiness-status') || '',
      backyReady: customLaunch?.getAttribute('data-control-backy-ready') || '',
      controlReadiness: {
        exists: Boolean(customReadiness),
        schema: customReadiness?.getAttribute('data-schema') || '',
        status: customReadiness?.getAttribute('data-status') || '',
        readyCount: Number(customReadiness?.getAttribute('data-ready-count') || 0),
        reviewCount: Number(customReadiness?.getAttribute('data-review-count') || 0),
        manualCount: Number(customReadiness?.getAttribute('data-manual-count') || 0),
        backyReadyCount: Number(customReadiness?.getAttribute('data-backy-ready-count') || 0),
        backyTotal: Number(customReadiness?.getAttribute('data-backy-total') || 0),
        expectedProbe: customReadiness?.getAttribute('data-expected-probe') || '',
        checkIds: Array.from(customReadiness?.querySelectorAll('[data-testid^="dashboard-custom-frontend-control-check-"]') || []).map((node) => node.getAttribute('data-testid') || ''),
        ownerStatuses: Array.from(customReadiness?.querySelectorAll('[data-testid^="dashboard-custom-frontend-control-check-"]') || []).map((node) => ({
          owner: node.getAttribute('data-check-owner') || '',
          status: node.getAttribute('data-check-status') || '',
        })),
      },
      nextAction: {
        exists: Boolean(customNextAction),
        schema: customNextAction?.getAttribute('data-next-action-schema') || '',
        id: customNextAction?.getAttribute('data-next-action-id') || '',
        owner: customNextAction?.getAttribute('data-next-action-owner') || '',
        readiness: customNextAction?.getAttribute('data-next-action-readiness') || '',
        target: customNextAction?.getAttribute('data-next-action-target') || '',
        copyAction: Boolean(document.querySelector('[data-testid="dashboard-copy-custom-frontend-next-action"]')),
        copySchema: document.querySelector('[data-testid="dashboard-copy-custom-frontend-next-action"]')?.getAttribute('data-copy-schema') || '',
        verifierLink: Boolean(document.querySelector('[data-testid="dashboard-open-custom-frontend-verifier"]')),
      },
      agentBrief: {
        exists: Boolean(customAgentBrief),
        schema: customAgentBrief?.getAttribute('data-agent-brief-schema') || '',
        source: customAgentBrief?.getAttribute('data-agent-brief-source') || '',
        contentCreationSchema: customAgentBrief?.getAttribute('data-agent-brief-content-creation-schema') || '',
        pageCreateRoute: customAgentBrief?.getAttribute('data-agent-brief-page-create-route') || '',
        blogCreateRoute: customAgentBrief?.getAttribute('data-agent-brief-blog-create-route') || '',
        formCreateRoute: customAgentBrief?.getAttribute('data-agent-brief-form-create-route') || '',
        productCreateRoute: customAgentBrief?.getAttribute('data-agent-brief-product-create-route') || '',
        collectionCreateRoute: customAgentBrief?.getAttribute('data-agent-brief-collection-create-route') || '',
        sectionCreateRoute: customAgentBrief?.getAttribute('data-agent-brief-section-create-route') || '',
        readOrderCount: Number(customAgentBrief?.getAttribute('data-agent-brief-read-order-count') || 0),
        manualGates: Number(customAgentBrief?.getAttribute('data-agent-brief-manual-gates') || 0),
        scaffoldCommand: customAgentBrief?.getAttribute('data-agent-brief-scaffold-command') || '',
        verifyCommand: customAgentBrief?.getAttribute('data-agent-brief-verify-command') || '',
        copyAction: Boolean(document.querySelector('[data-testid="dashboard-copy-custom-frontend-agent-brief"]')),
        copySchema: document.querySelector('[data-testid="dashboard-copy-custom-frontend-agent-brief"]')?.getAttribute('data-copy-schema') || '',
      },
      contentCreation: {
        exists: Boolean(customContentCreation),
        schema: customContentCreation?.getAttribute('data-schema') || '',
        source: customContentCreation?.getAttribute('data-source') || '',
        status: customContentCreation?.getAttribute('data-status') || '',
        pageTemplateId: customContentCreation?.getAttribute('data-page-template-id') || '',
        pageCreateRoute: customContentCreation?.getAttribute('data-page-create-route') || '',
        pageFallbackRoute: customContentCreation?.getAttribute('data-page-fallback-route') || '',
        blogTemplateId: customContentCreation?.getAttribute('data-blog-template-id') || '',
        blogCreateRoute: customContentCreation?.getAttribute('data-blog-create-route') || '',
        blogFallbackRoute: customContentCreation?.getAttribute('data-blog-fallback-route') || '',
        formTemplateId: customContentCreation?.getAttribute('data-form-template-id') || '',
        formCreateRoute: customContentCreation?.getAttribute('data-form-create-route') || '',
        formFallbackRoute: customContentCreation?.getAttribute('data-form-fallback-route') || '',
        productTemplateId: customContentCreation?.getAttribute('data-product-template-id') || '',
        productCreateRoute: customContentCreation?.getAttribute('data-product-create-route') || '',
        productFallbackRoute: customContentCreation?.getAttribute('data-product-fallback-route') || '',
        collectionTemplateId: customContentCreation?.getAttribute('data-collection-template-id') || '',
        collectionCreateRoute: customContentCreation?.getAttribute('data-collection-create-route') || '',
        collectionFallbackRoute: customContentCreation?.getAttribute('data-collection-fallback-route') || '',
        sectionTemplateId: customContentCreation?.getAttribute('data-section-template-id') || '',
        sectionCreateRoute: customContentCreation?.getAttribute('data-section-create-route') || '',
        sectionFallbackRoute: customContentCreation?.getAttribute('data-section-fallback-route') || '',
        itemCount: Number(customContentCreation?.getAttribute('data-item-count') || 0),
        pageAction: {
          exists: Boolean(customPageCreate),
          templateSource: customPageCreate?.getAttribute('data-template-source') || '',
          templateId: customPageCreate?.getAttribute('data-template-id') || '',
          route: customPageCreate?.getAttribute('data-create-route') || '',
        },
        postAction: {
          exists: Boolean(customPostCreate),
          templateSource: customPostCreate?.getAttribute('data-template-source') || '',
          templateId: customPostCreate?.getAttribute('data-template-id') || '',
          route: customPostCreate?.getAttribute('data-create-route') || '',
        },
        actionIds: Array.from(customContentCreation?.querySelectorAll('[data-testid^="dashboard-create-custom-frontend-"]') || [])
          .map((node) => node.getAttribute('data-item-id') || ''),
        itemStatuses: Array.from(customContentCreation?.querySelectorAll('[data-testid^="dashboard-custom-frontend-content-item-"]') || []).map((node) => ({
          id: node.getAttribute('data-testid') || '',
          status: node.getAttribute('data-status') || '',
          templateType: node.getAttribute('data-template-type') || '',
          createRoute: node.getAttribute('data-create-route') || '',
          fallbackRoute: node.getAttribute('data-fallback-route') || '',
        })),
      },
      text: customLaunchText.slice(0, 1000),
    };

    return ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    hasCommandCenter: Boolean(document.querySelector('[data-testid="dashboard-command-center"]')),
    hasFocusLane: Boolean(document.querySelector('[data-testid="dashboard-focus-lane"]')) &&
      document.querySelector('[data-testid="dashboard-focus-lane"]')?.textContent?.includes('Start here') &&
      document.querySelector('[data-testid="dashboard-focus-lane"]')?.textContent?.includes('New page'),
    hasSiteSelector: Boolean(document.querySelector('#dashboard-active-site')),
    hasSite: Array.from(document.querySelectorAll('#dashboard-active-site option')).some((option) => option.textContent?.includes(${JSON.stringify(siteName)})),
    hasStats: Boolean(document.querySelector('#dashboard-stats')),
    hasOnboarding: Boolean(document.querySelector('[data-testid="dashboard-onboarding-state"]')) &&
      document.body?.innerText?.includes('Launch onboarding') &&
      document.body?.innerText?.includes('Create a workspace site') &&
      document.body?.innerText?.includes('Connect APIs and infrastructure'),
    hasRbacScope: Boolean(document.querySelector('[data-testid="dashboard-rbac-scope"]')) &&
      document.querySelector('[data-testid="dashboard-rbac-scope"]')?.textContent?.includes('Workspace RBAC scope') &&
      document.querySelector('[data-testid="dashboard-rbac-scope"]')?.textContent?.includes('Account authority') &&
      document.querySelector('[data-testid="dashboard-rbac-scope"]')?.textContent?.includes('Signed-in role') &&
      document.querySelector('[data-testid="dashboard-rbac-scope"]')?.textContent?.includes('Active owners') &&
      document.querySelector('[data-testid="dashboard-rbac-scope"]')?.textContent?.includes('Settings') &&
      document.querySelector('[data-testid="dashboard-rbac-scope"]')?.textContent?.includes('Users'),
    compactCommandCenter: {
      platformDetailsOpen: document.querySelector('[data-testid="dashboard-platform-details"]') instanceof HTMLDetailsElement
        ? document.querySelector('[data-testid="dashboard-platform-details"]').open
        : null,
      controlMapOpen: document.querySelector('[data-testid="dashboard-control-map-details"]') instanceof HTMLDetailsElement
        ? document.querySelector('[data-testid="dashboard-control-map-details"]').open
        : null,
      rbacScopeOpen: document.querySelector('[data-testid="dashboard-rbac-scope"]') instanceof HTMLDetailsElement
        ? document.querySelector('[data-testid="dashboard-rbac-scope"]').open
        : null,
      moduleMapOpen: document.querySelector('[data-testid="dashboard-module-map-details"]') instanceof HTMLDetailsElement
        ? document.querySelector('[data-testid="dashboard-module-map-details"]').open
        : null,
    },
    hasDeploymentHistory: Boolean(document.querySelector('[data-testid="dashboard-deployment-history"]')) &&
      document.body?.innerText?.includes('Deployment execution and history') &&
      document.body?.innerText?.includes('Run deployment preflight') &&
      document.body?.innerText?.includes('Preflight history'),
    hasDeploymentHealth: Boolean(document.querySelector('[data-testid="dashboard-deployment-health"]')) &&
      document.body?.innerText?.includes('Deployment health') &&
      document.body?.innerText?.includes('Vercel project status') &&
      document.body?.innerText?.includes('Last deploy') &&
      document.body?.innerText?.includes('Domain and rebuild status'),
    hasOperationsSignals: Boolean(document.querySelector('[data-testid="dashboard-operations-signal-board"]')) &&
      document.body?.innerText?.includes('Operations signal board') &&
      document.body?.innerText?.includes('Commerce catalog') &&
      document.body?.innerText?.includes('Moderation queue') &&
      document.body?.innerText?.includes('Workflow alerts'),
    hasCommerceHealth: Boolean(document.querySelector('[data-testid="dashboard-commerce-health"]')) &&
      document.body?.innerText?.includes('Product commerce health') &&
      document.body?.innerText?.includes('Inventory warnings') &&
      document.body?.innerText?.includes('Checkout setup') &&
      document.body?.innerText?.includes('Orders needing attention'),
    hasModerationQueue: Boolean(document.querySelector('[data-testid="dashboard-moderation-queue"]')) &&
      document.body?.innerText?.includes('Form and comment moderation queue') &&
      document.body?.innerText?.includes('Pending submissions') &&
      document.body?.innerText?.includes('Spam reports') &&
      document.body?.innerText?.includes('Approval throughput'),
    hasAggregateAnalytics: Boolean(document.querySelector('[data-testid="dashboard-aggregate-analytics"]')) &&
      document.body?.innerText?.includes('Aggregate analytics') &&
      document.body?.innerText?.includes('Publishing mix') &&
      document.body?.innerText?.includes('Activity velocity') &&
      document.body?.innerText?.includes('Engagement and commerce'),
    customLaunchState,
    hasApiConsumers: Boolean(apiConsumers) &&
      document.body?.innerText?.includes('API consumer readiness') &&
      document.body?.innerText?.includes('Contract coverage') &&
      document.body?.innerText?.includes('Credentials') &&
      document.body?.innerText?.includes('Access changes') &&
      customLaunchText.includes('Custom frontend launch') &&
      customLaunchText.includes('Browser-safe env') &&
      customLaunchText.includes('Server loader env') &&
      customLaunchText.includes('Control readiness') &&
      customLaunchText.includes('Next action') &&
      customLaunchText.includes('Frontend agent brief ready') &&
      customLaunchText.includes('Create from custom frontend design') &&
      customLaunchText.includes('frontendDesignTemplateId') &&
      customLaunchText.includes('frontendTemplate') &&
      customLaunchText.includes('NEXT_PUBLIC_BACKY_API_BASE_URL') &&
      customLaunchState.schema === 'backy.dashboard-custom-frontend-launch.v1' &&
      customLaunchState.domainOwner === 'custom-frontend-vercel-project' &&
      customLaunchState.controlSchema === 'backy.dashboard-custom-frontend-control-readiness.v1' &&
      ['needs-review', 'backy-ready-manual-externals', 'ready'].includes(customLaunchState.controlStatus) &&
      customLaunchState.backyReady.includes('/') &&
      customLaunchState.controlReadiness.exists &&
      customLaunchState.controlReadiness.schema === 'backy.dashboard-custom-frontend-control-readiness.v1' &&
      customLaunchState.controlReadiness.expectedProbe === '/api/backy-connection' &&
      customLaunchState.controlReadiness.backyTotal >= 4 &&
      customLaunchState.controlReadiness.checkIds.includes('dashboard-custom-frontend-control-check-public-api-contract') &&
      customLaunchState.controlReadiness.checkIds.includes('dashboard-custom-frontend-control-check-frontend-design-source') &&
      customLaunchState.controlReadiness.checkIds.includes('dashboard-custom-frontend-control-check-template-registry') &&
      customLaunchState.controlReadiness.checkIds.includes('dashboard-custom-frontend-control-check-deployed-frontend-verifier') &&
      customLaunchState.controlReadiness.ownerStatuses.some((entry) => entry.owner === 'operator' && entry.status === 'manual') &&
      customLaunchState.nextAction.exists &&
      customLaunchState.nextAction.schema === 'backy.dashboard-custom-frontend-next-action.v1' &&
      customLaunchState.nextAction.id.length > 0 &&
      ['backy', 'operator'].includes(customLaunchState.nextAction.owner) &&
      ['ready', 'review', 'manual'].includes(customLaunchState.nextAction.readiness) &&
      customLaunchState.nextAction.target.length > 0 &&
      customLaunchState.nextAction.copyAction &&
      customLaunchState.nextAction.copySchema === 'backy.dashboard-custom-frontend-next-action.v1' &&
      customLaunchState.nextAction.verifierLink &&
      customLaunchState.agentBrief.exists &&
      customLaunchState.agentBrief.schema === 'backy.dashboard-custom-frontend-agent-brief.v1' &&
      customLaunchState.agentBrief.source === 'backy-dashboard' &&
      customLaunchState.agentBrief.contentCreationSchema === 'backy.dashboard-custom-frontend-content-creation.v1' &&
      customLaunchState.agentBrief.readOrderCount >= 4 &&
      customLaunchState.agentBrief.manualGates >= 1 &&
      customLaunchState.agentBrief.scaffoldCommand.includes('custom-frontend:scaffold') &&
      customLaunchState.agentBrief.verifyCommand.includes('test:custom-frontend-connection') &&
      customLaunchState.agentBrief.copyAction &&
      customLaunchState.agentBrief.copySchema === 'backy.dashboard-custom-frontend-agent-brief.v1' &&
      customLaunchState.contentCreation.exists &&
      customLaunchState.contentCreation.schema === 'backy.dashboard-custom-frontend-content-creation.v1' &&
      customLaunchState.contentCreation.source === 'custom-frontend-template-registry' &&
      ['ready', 'review'].includes(customLaunchState.contentCreation.status) &&
      customLaunchState.contentCreation.pageFallbackRoute.includes('/pages/new') &&
      customLaunchState.contentCreation.pageFallbackRoute.includes('templateSource=backy-canvas') &&
      customLaunchState.contentCreation.blogFallbackRoute.includes('/blog/new') &&
      customLaunchState.contentCreation.blogFallbackRoute.includes('templateSource=backy-canvas') &&
      customLaunchState.contentCreation.formFallbackRoute.includes('/forms') &&
      customLaunchState.contentCreation.formFallbackRoute.includes('quickCreate=blank') &&
      customLaunchState.contentCreation.productFallbackRoute.includes('/products') &&
      customLaunchState.contentCreation.productFallbackRoute.includes('quickCreate=product') &&
      customLaunchState.contentCreation.collectionFallbackRoute.includes('/collections') &&
      customLaunchState.contentCreation.collectionFallbackRoute.includes('draft=new') &&
      customLaunchState.contentCreation.sectionFallbackRoute.includes('/reusable-sections') &&
      customLaunchState.contentCreation.sectionFallbackRoute.includes('draft=new') &&
      customLaunchState.contentCreation.itemCount >= 6 &&
      customLaunchState.contentCreation.pageAction.exists &&
      customLaunchState.contentCreation.pageAction.templateSource === 'custom-frontend' &&
      customLaunchState.contentCreation.postAction.exists &&
      customLaunchState.contentCreation.postAction.templateSource === 'custom-frontend' &&
      ['page', 'blogPost', 'form', 'product', 'collection', 'section'].every((id) => customLaunchState.contentCreation.actionIds.includes(id)) &&
      customLaunchState.contentCreation.itemStatuses.some((item) => item.templateType === 'page') &&
      customLaunchState.contentCreation.itemStatuses.some((item) => item.templateType === 'blogPost') &&
      customLaunchState.contentCreation.itemStatuses.some((item) => item.templateType === 'form') &&
      customLaunchState.contentCreation.itemStatuses.some((item) => item.templateType === 'product') &&
      customLaunchState.contentCreation.itemStatuses.some((item) => item.templateType === 'collection') &&
      customLaunchState.contentCreation.itemStatuses.some((item) => item.templateType === 'section') &&
      (!customLaunchState.contentCreation.pageCreateRoute || (
        customLaunchState.contentCreation.pageCreateRoute.includes('/pages/new') &&
        customLaunchState.contentCreation.pageCreateRoute.includes('templateSource=custom-frontend') &&
        customLaunchState.contentCreation.pageCreateRoute.includes('frontendDesignTemplateId=') &&
        customLaunchState.contentCreation.pageCreateRoute.includes('frontendTemplate=') &&
        customLaunchState.contentCreation.pageCreateRoute.includes('designTemplate=')
      )) &&
      (!customLaunchState.contentCreation.blogCreateRoute || (
        customLaunchState.contentCreation.blogCreateRoute.includes('/blog/new') &&
        customLaunchState.contentCreation.blogCreateRoute.includes('templateSource=custom-frontend') &&
        customLaunchState.contentCreation.blogCreateRoute.includes('frontendDesignTemplateId=') &&
        customLaunchState.contentCreation.blogCreateRoute.includes('frontendTemplate=') &&
        customLaunchState.contentCreation.blogCreateRoute.includes('designTemplate=')
      )) &&
      (!customLaunchState.contentCreation.formCreateRoute || (
        customLaunchState.contentCreation.formCreateRoute.includes('/forms') &&
        customLaunchState.contentCreation.formCreateRoute.includes('frontendTemplate=')
      )) &&
      (!customLaunchState.contentCreation.productCreateRoute || (
        customLaunchState.contentCreation.productCreateRoute.includes('/products') &&
        customLaunchState.contentCreation.productCreateRoute.includes('frontendTemplate=')
      )) &&
      (!customLaunchState.contentCreation.collectionCreateRoute || (
        customLaunchState.contentCreation.collectionCreateRoute.includes('/collections') &&
        customLaunchState.contentCreation.collectionCreateRoute.includes('frontendTemplate=')
      )) &&
      (!customLaunchState.contentCreation.sectionCreateRoute || (
        customLaunchState.contentCreation.sectionCreateRoute.includes('/reusable-sections') &&
        customLaunchState.contentCreation.sectionCreateRoute.includes('frontendTemplate=')
      )) &&
      customLaunchState.agentBrief.pageCreateRoute === customLaunchState.contentCreation.pageCreateRoute &&
      customLaunchState.agentBrief.blogCreateRoute === customLaunchState.contentCreation.blogCreateRoute &&
      customLaunchState.agentBrief.formCreateRoute === customLaunchState.contentCreation.formCreateRoute &&
      customLaunchState.agentBrief.productCreateRoute === customLaunchState.contentCreation.productCreateRoute &&
      customLaunchState.agentBrief.collectionCreateRoute === customLaunchState.contentCreation.collectionCreateRoute &&
      customLaunchState.agentBrief.sectionCreateRoute === customLaunchState.contentCreation.sectionCreateRoute &&
      customLaunchState.browserEnvKeys.includes('NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST'),
    hasPersistenceReadiness: Boolean(document.querySelector('[data-testid="dashboard-persistence-readiness"]')) &&
      document.body?.innerText?.includes('Persistence and Supabase readiness') &&
      document.body?.innerText?.includes('Database runtime') &&
      document.body?.innerText?.includes('Supabase connection') &&
      document.body?.innerText?.includes('Storage and blockers'),
    hasReadiness: Boolean(document.querySelector('#dashboard-readiness')) && document.body?.innerText?.includes('Backy platform readiness'),
    hasInfrastructureDiagnostics: Boolean(document.querySelector('[data-testid="dashboard-infrastructure-diagnostics"]') && document.body?.innerText?.includes('Infrastructure diagnostics')),
    hasWorkflows: Boolean(document.querySelector('#dashboard-workflows')) && document.body?.innerText?.includes('Build and manage'),
    hasAttention: Boolean(document.querySelector('#dashboard-attention')) && document.body?.innerText?.includes('Needs attention'),
    hasActivity: Boolean(document.querySelector('#dashboard-activity')) && document.body?.innerText?.includes('Recent backend activity'),
    hasApi: Boolean(document.querySelector('#dashboard-api')) && document.body?.innerText?.includes('API control plane'),
    hasModules: document.body?.innerText?.includes('Backy module map') || false,
    hasLaunchWorkflows: document.body?.innerText?.includes('Registration page') &&
      document.body?.innerText?.includes('Product catalog') &&
      document.body?.innerText?.includes('Member access'),
  });
})()`);
  assert(layout.scrollWidth <= layout.width + 8, `Dashboard has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(
    layout.hasCommandCenter &&
      layout.hasFocusLane &&
      layout.hasSiteSelector &&
      layout.hasSite &&
      layout.hasStats &&
      layout.hasOnboarding &&
      layout.hasRbacScope &&
      layout.hasDeploymentHistory &&
      layout.hasDeploymentHealth &&
      layout.hasOperationsSignals &&
      layout.hasCommerceHealth &&
      layout.hasModerationQueue &&
      layout.hasAggregateAnalytics &&
      layout.hasApiConsumers &&
      layout.hasPersistenceReadiness &&
      layout.hasReadiness &&
      layout.hasInfrastructureDiagnostics &&
      layout.hasWorkflows &&
      layout.hasAttention &&
      layout.hasActivity &&
      layout.hasApi &&
      layout.hasModules &&
      layout.hasLaunchWorkflows,
    `Dashboard missing expected regions: ${JSON.stringify(layout)}`,
  );
  assert(
    layout.compactCommandCenter.platformDetailsOpen === false &&
      layout.compactCommandCenter.controlMapOpen === false &&
      layout.compactCommandCenter.rbacScopeOpen === false &&
      layout.compactCommandCenter.moduleMapOpen === false,
    `Dashboard command center disclosures should start collapsed: ${JSON.stringify(layout.compactCommandCenter)}`,
  );
  return layout;
};

const assertDashboardCommandActionStatus = async (client) => {
  let state = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    state = await evaluate(client, `(() => {
      const group = document.querySelector('[data-testid="dashboard-command-actions"]');
      const status = document.querySelector('[data-testid="dashboard-command-actions-status"]');
      const secondaryStatus = document.querySelector('[data-testid="dashboard-command-secondary-action-status"]');
      const primaryActions = document.querySelector('[data-testid="dashboard-primary-actions"]');
      const primaryActionText = Array.from(primaryActions?.querySelectorAll('a, button') || [])
        .map((node) => (node.textContent || '').replace(/\\s+/g, ' ').trim());
      const primaryActionIds = Array.from(primaryActions?.querySelectorAll('[data-testid]') || [])
        .map((node) => node.getAttribute('data-testid') || '')
        .filter(Boolean);
      const secondaryActions = document.querySelector('[data-testid="dashboard-secondary-actions"]');
      const secondaryMenu = document.querySelector('[data-testid="dashboard-secondary-action-menu"]');
      const readAction = (testId) => {
        const element = document.querySelector(\`[data-testid="\${testId}"]\`);
        const disabled = element instanceof HTMLButtonElement ? element.disabled : false;
        return {
          found: Boolean(element),
          label: element?.getAttribute('aria-label') || '',
          href: element instanceof HTMLAnchorElement ? element.getAttribute('href') || '' : '',
          describedBy: element?.getAttribute('aria-describedby') || '',
          state: element?.getAttribute('data-action-state') || '',
          status: element?.getAttribute('data-action-status') || '',
          disabledReason: element?.getAttribute('data-disabled-reason') || '',
          targetSite: element?.getAttribute('data-target-site-id') || '',
          disabled,
          nested: Boolean(secondaryMenu?.querySelector(\`[data-testid="\${testId}"]\`)),
          text: element?.textContent?.replace(/\\s+/g, ' ').trim() || '',
        };
      };
      return {
        role: group?.getAttribute('role') || '',
        label: group?.getAttribute('aria-label') || '',
        describedBy: group?.getAttribute('aria-describedby') || '',
        actionState: group?.getAttribute('data-action-state') || '',
        statusId: status?.id || '',
        statusText: status?.textContent?.replace(/\\s+/g, ' ').trim() || '',
        statusData: group?.getAttribute('data-action-status') || '',
        secondaryStatusId: secondaryStatus?.id || '',
        secondaryStatusText: secondaryStatus?.textContent?.replace(/\\s+/g, ' ').trim() || '',
        secondaryDescribedBy: secondaryActions?.getAttribute('aria-describedby') || '',
        secondaryActionState: secondaryActions?.getAttribute('data-action-state') || '',
        secondaryStatusData: secondaryActions?.getAttribute('data-action-status') || '',
        secondaryTargetSite: secondaryActions?.getAttribute('data-target-site-id') || '',
        firstPrimaryActionText: primaryActionText[0] || '',
        primaryActionIds,
        secondaryCollapsed: secondaryActions instanceof HTMLDetailsElement &&
          secondaryActions.open === false &&
          secondaryActions.getAttribute('data-default-collapsed') === 'true',
        hasMoreActions: Boolean(document.querySelector('[data-testid="dashboard-more-actions"]')),
        newSite: readAction('dashboard-command-new-site'),
        newPage: readAction('dashboard-command-new-page'),
        newPost: readAction('dashboard-command-new-post'),
        newProduct: readAction('dashboard-command-new-product'),
        newForm: readAction('dashboard-command-new-form'),
        refresh: readAction('dashboard-command-refresh'),
        copy: readAction('dashboard-command-copy-handoff'),
        download: readAction('dashboard-command-download-handoff'),
      };
    })()`);
    if (state.actionState === 'ready') {
      break;
    }
    if (attempt < 99) {
      await sleep(150);
    }
  }

  assert(state.role === 'group' && state.label === 'Dashboard command actions', `Dashboard command actions must be a named group: ${JSON.stringify(state)}`);
  assert(state.describedBy === state.statusId, `Dashboard command action group must be described by its status: ${JSON.stringify(state)}`);
  assert(state.statusData === state.statusText, `Dashboard command action status data must mirror hidden copy: ${JSON.stringify(state)}`);
  assert(
    state.secondaryStatusId === 'dashboard-command-secondary-action-status' &&
      state.secondaryDescribedBy === state.secondaryStatusId &&
      state.secondaryStatusData === state.secondaryStatusText &&
      state.secondaryActionState === state.actionState &&
      state.secondaryStatusText.includes('Copy handoff available.') &&
      state.secondaryStatusText.includes('Download JSON available.') &&
      state.secondaryTargetSite,
    `Dashboard secondary action group must expose a dedicated handoff status: ${JSON.stringify(state)}`,
  );
  assert(
    state.statusText.includes('New site available.') &&
      state.statusText.includes('New page available.') &&
      state.statusText.includes('New post available.') &&
      state.statusText.includes('New product available.') &&
      state.statusText.includes('New form available.') &&
      state.statusText.includes('Refresh data available.') &&
      state.statusText.includes('Copy handoff available.') &&
      state.statusText.includes('Download JSON available.') &&
      state.actionState === 'ready',
    `Dashboard command actions should summarize ready state: ${JSON.stringify(state)}`,
  );
  assert(state.firstPrimaryActionText === 'New site', `Dashboard command center should lead with New site: ${JSON.stringify(state)}`);
  assert(
    ['dashboard-command-copy-handoff', 'dashboard-command-download-handoff'].every((testId) => !state.primaryActionIds.includes(testId)),
    `Dashboard handoff actions should not be duplicated in primary actions: ${JSON.stringify(state)}`,
  );
  assert(state.secondaryCollapsed && state.hasMoreActions, `Dashboard handoff actions must be behind collapsed More actions: ${JSON.stringify(state)}`);
  assert(state.newPage.href.includes('/pages/new') && state.newPage.href.includes('templateSource=backy-canvas') && state.newPage.href.includes('focus=canvas'), `Dashboard New page must route into focused Backy canvas creation: ${JSON.stringify(state)}`);
  assert(state.newPost.href.includes('/blog/new') && state.newPost.href.includes('templateSource=backy-canvas') && state.newPost.href.includes('focus=canvas'), `Dashboard New post must route into focused Backy canvas creation: ${JSON.stringify(state)}`);
  assert(state.newProduct.href.includes('/products') && state.newProduct.href.includes('quickCreate=product'), `Dashboard New product must route into quick product creation: ${JSON.stringify(state)}`);
  assert(state.newForm.href.includes('/forms') && state.newForm.href.includes('quickCreate=blank'), `Dashboard New form must route into quick form creation: ${JSON.stringify(state)}`);
  for (const [key, action] of Object.entries({ newSite: state.newSite, newPage: state.newPage, newPost: state.newPost, newProduct: state.newProduct, newForm: state.newForm, refresh: state.refresh, copy: state.copy, download: state.download })) {
    assert(action.found, `Dashboard ${key} command action was not found: ${JSON.stringify(state)}`);
    const expectedStatusId = key === 'copy' || key === 'download' ? state.secondaryStatusId : state.statusId;
    assert(action.describedBy === expectedStatusId, `Dashboard ${key} command action must reference the expected status: ${JSON.stringify(state)}`);
    assert(action.state === 'ready' && action.disabled === false && action.disabledReason === '', `Dashboard ${key} command action should be ready: ${JSON.stringify(state)}`);
    assert(action.status.length > 0, `Dashboard ${key} command action must publish action status: ${JSON.stringify(state)}`);
  }
  assert(state.refresh.label === 'Refresh dashboard command center data', `Dashboard refresh command label drifted: ${JSON.stringify(state)}`);
  assert(state.copy.label === 'Copy dashboard frontend handoff', `Dashboard copy command label drifted: ${JSON.stringify(state)}`);
  assert(state.download.label === 'Download dashboard frontend handoff JSON', `Dashboard download command label drifted: ${JSON.stringify(state)}`);
  assert(state.copy.targetSite === state.secondaryTargetSite && state.download.targetSite === state.secondaryTargetSite, `Dashboard handoff commands must target the active site: ${JSON.stringify(state)}`);
  assert(state.secondaryStatusText.includes(state.copy.status) && state.secondaryStatusText.includes(state.download.status), `Dashboard secondary status must include both handoff statuses: ${JSON.stringify(state)}`);
  assert(state.copy.nested && state.download.nested, `Dashboard handoff actions must be nested inside More actions: ${JSON.stringify(state)}`);
  return state;
};

const assertDashboardVisualState = async (client, label, screenshotPath, siteName) => {
  await evaluate(client, `(() => {
    window.scrollTo(0, 0);
    return true;
  })()`);
  await sleep(250);

  const state = await evaluate(client, `(() => {
    const bodyText = document.body?.innerText || '';
    const regionSelectors = [
      ['commandCenter', '[data-testid="dashboard-command-center"]'],
      ['focusLane', '[data-testid="dashboard-focus-lane"]'],
      ['stats', '#dashboard-stats'],
      ['rbacScope', '[data-testid="dashboard-rbac-scope"]'],
      ['onboarding', '[data-testid="dashboard-onboarding-state"]'],
      ['deploymentHistory', '[data-testid="dashboard-deployment-history"]'],
      ['deploymentHealth', '[data-testid="dashboard-deployment-health"]'],
      ['operationsSignals', '[data-testid="dashboard-operations-signal-board"]'],
      ['commerceHealth', '[data-testid="dashboard-commerce-health"]'],
      ['moderationQueue', '[data-testid="dashboard-moderation-queue"]'],
      ['aggregateAnalytics', '[data-testid="dashboard-aggregate-analytics"]'],
      ['apiConsumers', '[data-testid="dashboard-api-consumers"]'],
      ['persistenceReadiness', '[data-testid="dashboard-persistence-readiness"]'],
      ['readiness', '#dashboard-readiness'],
      ['infrastructureDiagnostics', '[data-testid="dashboard-infrastructure-diagnostics"]'],
      ['workflows', '#dashboard-workflows'],
      ['attention', '#dashboard-attention'],
      ['activity', '#dashboard-activity'],
      ['api', '#dashboard-api'],
    ];
    const viewportWidth = window.innerWidth;
    const minRegionWidth = Math.min(300, Math.max(240, viewportWidth - 48));
    const regions = Object.fromEntries(regionSelectors.map(([key, selector]) => {
      const node = document.querySelector(selector);
      const rect = node?.getBoundingClientRect();
      return [key, {
        exists: Boolean(node),
        width: rect?.width || 0,
        height: rect?.height || 0,
        visible: Boolean(rect && rect.width >= minRegionWidth && rect.height > 40),
      }];
    }));
    const controls = Array.from(document.querySelectorAll('button, select'))
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          tag: node.tagName,
          text: (node.textContent || node.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0, 80),
          width: rect.width,
          height: rect.height,
          disabled: node.disabled === true,
        };
      });
    const visibleTinyControls = controls.filter((control) => !control.disabled && (control.width < 28 || control.height < 28));
    const missingRegions = Object.entries(regions)
      .filter(([, region]) => !region.visible)
      .map(([key, region]) => ({ key, ...region }));
    const compactCommandCenter = {
      platformDetailsOpen: document.querySelector('[data-testid="dashboard-platform-details"]') instanceof HTMLDetailsElement
        ? document.querySelector('[data-testid="dashboard-platform-details"]').open
        : null,
      controlMapOpen: document.querySelector('[data-testid="dashboard-control-map-details"]') instanceof HTMLDetailsElement
        ? document.querySelector('[data-testid="dashboard-control-map-details"]').open
        : null,
      rbacScopeOpen: document.querySelector('[data-testid="dashboard-rbac-scope"]') instanceof HTMLDetailsElement
        ? document.querySelector('[data-testid="dashboard-rbac-scope"]').open
        : null,
      moduleMapOpen: document.querySelector('[data-testid="dashboard-module-map-details"]') instanceof HTMLDetailsElement
        ? document.querySelector('[data-testid="dashboard-module-map-details"]').open
        : null,
    };

    return {
      label: ${JSON.stringify(label)},
      viewport: { width: window.innerWidth, height: window.innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      hasSite: bodyText.includes(${JSON.stringify(siteName)}),
      hasPreflightRun: bodyText.includes('Deployment execution and history') &&
        bodyText.includes('Preflight history') &&
        /ready|warning|blocked/i.test(bodyText),
      hasInfrastructureRun: bodyText.includes('Infrastructure diagnostics') &&
        bodyText.includes('Database runtime') &&
        bodyText.includes('Vercel deployment'),
      hasWorkflowLinks: bodyText.includes('Build and manage') &&
        bodyText.includes('Registration page') &&
        bodyText.includes('Product catalog'),
      hasApiHandoff: bodyText.includes('API control plane') &&
        bodyText.includes('/api/sites/') &&
        bodyText.includes('Custom frontend launch') &&
        bodyText.includes('NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST'),
      hasFrameworkOverlay: /Failed to compile|Unhandled Runtime Error|Vite Error|Internal Server Error/i.test(bodyText),
      regions,
      missingRegions,
      compactCommandCenter,
      controls: controls.slice(0, 80),
      visibleTinyControls,
      body: bodyText.slice(0, 4000),
    };
  })()`);

  assert(state.horizontalOverflow <= 8, `${label} dashboard has horizontal overflow: ${JSON.stringify(state)}`);
  assert(state.missingRegions.length === 0, `${label} dashboard has missing or collapsed regions: ${JSON.stringify(state)}`);
  assert(state.hasSite, `${label} dashboard lost the selected smoke site: ${JSON.stringify(state)}`);
  assert(state.hasPreflightRun, `${label} dashboard deployment preflight history was not visually represented: ${JSON.stringify(state)}`);
  assert(state.hasInfrastructureRun, `${label} dashboard infrastructure diagnostics were not visually represented: ${JSON.stringify(state)}`);
  assert(state.hasWorkflowLinks && state.hasApiHandoff, `${label} dashboard workflow/API handoff regions were incomplete: ${JSON.stringify(state)}`);
  assert(
    state.compactCommandCenter.platformDetailsOpen === false &&
      state.compactCommandCenter.controlMapOpen === false &&
      state.compactCommandCenter.rbacScopeOpen === false &&
      state.compactCommandCenter.moduleMapOpen === false,
    `${label} dashboard command center disclosures should remain collapsed by default: ${JSON.stringify(state.compactCommandCenter)}`,
  );
  assert(state.visibleTinyControls.length === 0, `${label} dashboard has visibly undersized controls: ${JSON.stringify(state)}`);
  assert(!state.hasFrameworkOverlay, `${label} dashboard rendered a framework/runtime overlay: ${JSON.stringify(state)}`);

  await captureScreenshot(client, screenshotPath);
  return { ...state, screenshotPath };
};

const assertDashboardRbacFiltering = async (client, viewerUser, siteName, preloadScriptIdentifier) => {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 960,
    deviceScaleFactor: 1,
    mobile: false,
  });
  if (preloadScriptIdentifier) {
    await client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: preloadScriptIdentifier });
  }
  await seedBrowserSessionCookie(client, viewerUser.session.token);
  await client.send('Page.addScriptToEvaluateOnNewDocument', {
    source: authStorageScript(viewerUser.session.token, viewerUser.user),
  });
  await navigateToDashboard(client);
  await waitForDashboardSite(client, siteName);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const bodyText = document.body?.innerText || '';
      const rbacPanel = document.querySelector('[data-testid="dashboard-rbac-scope"]');
      const rbacText = rbacPanel?.textContent || '';
      const apiText = document.querySelector('#dashboard-api')?.textContent || '';
      const workflowText = document.querySelector('#dashboard-workflows')?.textContent || '';
      const moduleText = document.querySelector('[data-testid="dashboard-command-center"]')?.textContent || '';
      const sidebar = document.querySelector('[data-testid="admin-sidebar"]');
      const expandAll = document.querySelector('[data-testid="admin-sidebar-expand-all-sections"]');
      const sectionCount = Number(sidebar?.getAttribute('data-nav-section-count') || 0);
      const expandedCount = Number(sidebar?.getAttribute('data-expanded-section-count') || 0);
      if (
        sidebar instanceof HTMLElement &&
        expandAll instanceof HTMLButtonElement &&
        sectionCount > 0 &&
        expandedCount < sectionCount
      ) {
        expandAll.click();
      }
      const deploymentButton = Array.from(document.querySelectorAll('button')).find((candidate) => (
        (candidate.getAttribute('aria-label') || '') === 'Run dashboard deployment preflight'
      ));
      const infrastructureButton = Array.from(document.querySelectorAll('button')).find((candidate) => (
        (candidate.getAttribute('aria-label') || '') === 'Run dashboard infrastructure check'
      ));
      const currentExpandedCount = Number(sidebar?.getAttribute('data-expanded-section-count') || 0);
      return {
        ready: Boolean(rbacPanel) &&
          bodyText.includes(${JSON.stringify(siteName)}) &&
          sidebar instanceof HTMLElement &&
          sidebar.getAttribute('data-nav-ready') === 'true' &&
          sectionCount > 0 &&
          currentExpandedCount === sectionCount,
        rbacText,
        apiText,
        workflowText,
        moduleText,
        sidebarPermissionSource: sidebar?.getAttribute('data-permission-source') || '',
        sidebarPermissionSyncState: sidebar?.getAttribute('data-permission-sync-state') || '',
        sidebarStatusText: document.querySelector('[data-testid="admin-sidebar-action-status"]')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
        sidebarSectionCount: sectionCount,
        sidebarExpandedCount: currentExpandedCount,
        sidebarNavItemCount: Number(sidebar?.getAttribute('data-nav-item-count') || 0),
        sidebarTotalNavItemCount: Number(sidebar?.getAttribute('data-total-nav-item-count') || 0),
        sidebarHiddenNavItemCount: Number(sidebar?.getAttribute('data-hidden-nav-item-count') || 0),
        quickCreateCount: Number(sidebar?.getAttribute('data-quick-create-count') || 0),
        totalQuickCreateCount: Number(sidebar?.getAttribute('data-total-quick-create-count') || 0),
        hiddenQuickCreateCount: Number(sidebar?.getAttribute('data-hidden-quick-create-count') || 0),
        hasQuickCreateGroup: Boolean(document.querySelector('[data-testid="admin-sidebar-quick-create"]')),
        hasQuickCreatePage: Boolean(document.querySelector('[data-testid="admin-sidebar-quick-create-new-page"]')),
        hasQuickCreatePost: Boolean(document.querySelector('[data-testid="admin-sidebar-quick-create-new-post"]')),
        hasQuickCreateProduct: Boolean(document.querySelector('[data-testid="admin-sidebar-quick-create-new-product"]')),
        hasQuickCreateForm: Boolean(document.querySelector('[data-testid="admin-sidebar-quick-create-new-form"]')),
        hasPagesNav: Boolean(document.querySelector('[data-testid="admin-sidebar-link-pages"]')),
        hasBlogNav: Boolean(document.querySelector('[data-testid="admin-sidebar-link-blog"]')),
        hasMediaNav: Boolean(document.querySelector('[data-testid="admin-sidebar-link-media"]')),
        hasCollectionsNav: Boolean(document.querySelector('[data-testid="admin-sidebar-link-collections"]')),
        hasProductsNav: Boolean(document.querySelector('[data-testid="admin-sidebar-link-products"]')),
        hasOrdersNav: Boolean(document.querySelector('[data-testid="admin-sidebar-link-orders"]')),
        hasFormsNav: Boolean(document.querySelector('[data-testid="admin-sidebar-link-forms"]')),
        hasContactsNav: Boolean(document.querySelector('[data-testid="admin-sidebar-link-contacts"]')),
        hasCommentsNav: Boolean(document.querySelector('[data-testid="admin-sidebar-link-comments"]')),
        hasUsersNav: Boolean(document.querySelector('[data-testid="admin-sidebar-link-users"]')),
        hasTeamsNav: Boolean(document.querySelector('[data-testid="admin-sidebar-link-teams"]')),
        hasSettingsNav: Boolean(document.querySelector('[data-testid="admin-sidebar-link-settings"]')),
        deploymentDisabled: deploymentButton instanceof HTMLButtonElement ? deploymentButton.disabled : null,
        infrastructureDisabled: infrastructureButton instanceof HTMLButtonElement ? infrastructureButton.disabled : null,
        hasSettingsEndpoint: apiText.includes('/settings'),
        hasUsersEndpoint: apiText.includes('/users'),
        hasApiSetupAction: workflowText.includes('API setup'),
        hasNewSiteAction: workflowText.includes('New site'),
        hasMemberAccessAction: workflowText.includes('Member access'),
        hasUsersModule: moduleText.includes('Users and roles'),
        hasInfrastructureModule: moduleText.includes('Infrastructure'),
        hasFrameworkOverlay: /Failed to compile|Unhandled Runtime Error|Vite Error|Internal Server Error/i.test(bodyText),
        body: bodyText.slice(0, 2500),
      };
    })()`);
    if (state.ready) {
      assert(/viewer/i.test(state.rbacText), `Viewer dashboard did not show viewer RBAC scope: ${JSON.stringify(state)}`);
      assert(state.rbacText.includes('Users') && state.rbacText.includes('Hidden'), `Viewer dashboard did not hide users in RBAC panel: ${JSON.stringify(state)}`);
      assert(state.rbacText.includes('Settings') && state.rbacText.includes('Hidden'), `Viewer dashboard did not hide settings in RBAC panel: ${JSON.stringify(state)}`);
      assert(!state.hasSettingsEndpoint && !state.hasUsersEndpoint, `Viewer dashboard leaked privileged admin endpoints: ${JSON.stringify(state)}`);
      assert(!state.hasApiSetupAction && !state.hasNewSiteAction, `Viewer dashboard showed privileged creation/settings actions: ${JSON.stringify(state)}`);
      assert(!state.hasMemberAccessAction, `Viewer dashboard showed privileged member access action: ${JSON.stringify(state)}`);
      assert(!state.hasUsersModule && !state.hasInfrastructureModule, `Viewer dashboard showed privileged module cards: ${JSON.stringify(state)}`);
      assert(
        state.hasPagesNav &&
          state.hasBlogNav &&
          state.hasMediaNav &&
          state.hasCollectionsNav &&
          state.hasProductsNav &&
          state.hasOrdersNav &&
          state.hasFormsNav &&
          state.hasContactsNav &&
          state.hasCommentsNav,
        `Viewer sidebar should expose read-only review surfaces after role/matrix filtering: ${JSON.stringify(state)}`,
      );
      assert(
        !state.hasUsersNav &&
          !state.hasTeamsNav &&
          !state.hasSettingsNav &&
          state.sidebarHiddenNavItemCount >= 3 &&
          state.sidebarStatusText.includes('Role filters hide') &&
          state.sidebarStatusText.includes('create shortcut'),
        `Viewer sidebar should hide privileged admin navigation with explicit role-filter metadata: ${JSON.stringify(state)}`,
      );
      assert(
        !state.hasQuickCreateGroup &&
          !state.hasQuickCreatePage &&
          !state.hasQuickCreatePost &&
          !state.hasQuickCreateProduct &&
          !state.hasQuickCreateForm &&
          state.quickCreateCount === 0 &&
          state.totalQuickCreateCount === 4 &&
          state.hiddenQuickCreateCount === 4,
        `Viewer sidebar must hide create shortcuts instead of rendering disabled-only buttons: ${JSON.stringify(state)}`,
      );
      assert(state.deploymentDisabled === true && state.infrastructureDisabled === true, `Viewer dashboard did not disable settings-backed checks: ${JSON.stringify(state)}`);
      assert(!state.hasFrameworkOverlay, `Viewer dashboard rendered a framework/runtime overlay: ${JSON.stringify(state)}`);
      return state;
    }
    if (attempt === 99) {
      throw new Error(`Viewer dashboard RBAC scope did not render: ${JSON.stringify(state)}`);
    }
    await sleep(200);
  }

  return null;
};

const assertDashboardLinks = async (client) => {
  const links = await evaluate(client, `(() => {
    const hrefs = Array.from(document.querySelectorAll('a')).map((anchor) => ({
      text: (anchor.textContent || '').replace(/\\s+/g, ' ').trim(),
      href: anchor.getAttribute('href') || '',
    }));
    const required = [
      ['New site', '/sites/new'],
      ['New page', '/pages/new'],
      ['New post', '/blog/new'],
      ['New product', '/products'],
      ['New form', '/forms'],
      ['Media library', '/media'],
      ['Registration page', '/pages/new'],
      ['Product catalog', '/products'],
      ['Order queue', '/orders'],
      ['Form builder', '/forms'],
      ['Member access', '/users'],
      ['Open API and delivery settings', '/settings'],
      ['Open infrastructure', '/settings'],
      ['Manage frontend datasets', '/collections'],
    ];
    const missing = required.filter(([text, href]) => !hrefs.some((item) => item.text.includes(text) && item.href.includes(href)));
    const newPage = hrefs.find((item) => item.text.includes('New page') && item.href.includes('/pages/new')) || null;
    const newPost = hrefs.find((item) => item.text.includes('New post') && item.href.includes('/blog/new')) || null;
    const newProduct = hrefs.find((item) => item.text.includes('New product') && item.href.includes('/products')) || null;
    const newForm = hrefs.find((item) => item.text.includes('New form') && item.href.includes('/forms')) || null;
    const focusedWorkflowPages = ['Registration page', 'Contact page', 'Storefront page', 'Blog index page'].map((label) => (
      hrefs.find((item) => item.text.includes(label) && item.href.includes('/pages/new')) || null
    ));
    const quickCreateOk = Boolean(
      newPage?.href.includes('siteId=') &&
        newPage.href.includes('templateSource=backy-canvas') &&
        newPage.href.includes('focus=canvas') &&
        newPost?.href.includes('siteId=') &&
        newPost.href.includes('templateSource=backy-canvas') &&
        newPost.href.includes('focus=canvas') &&
        newProduct?.href.includes('siteId=') &&
        newProduct.href.includes('quickCreate=product') &&
        newForm?.href.includes('siteId=') &&
        newForm.href.includes('quickCreate=blank'),
    );
    const focusedWorkflowPagesOk = focusedWorkflowPages.every((item) => (
      item?.href.includes('siteId=') &&
      item.href.includes('templateSource=backy-canvas') &&
      item.href.includes('focus=canvas')
    ));
    return { ok: missing.length === 0 && quickCreateOk && focusedWorkflowPagesOk, missing, quickCreateOk, focusedWorkflowPagesOk, focusedWorkflowPages, newPage, newPost, newProduct, newForm, hrefs: hrefs.slice(0, 120) };
  })()`);
  assert(links.ok, `Dashboard missing expected navigation links: ${JSON.stringify(links)}`);
  return links;
};

const assertDashboardSidebarNavigation = async (client) => {
  let initial = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    initial = await evaluate(client, `(() => {
      const sidebar = document.querySelector('[data-testid="admin-sidebar"]');
      const sidebarShell = document.querySelector('[data-testid="admin-sidebar-shell"]');
      const brandHeader = document.querySelector('[data-testid="admin-sidebar-brand-header"]');
      const siteSwitcherShell = document.querySelector('[data-testid="admin-sidebar-site-switcher-shell"]');
      const activeSite = document.querySelector('[data-testid="admin-sidebar-active-site"]');
      const discoveryLinks = document.querySelector('[data-testid="admin-sidebar-active-site-discovery-links"]');
      const quickCreate = document.querySelector('[data-testid="admin-sidebar-quick-create"]');
      const sidebarNav = document.querySelector('[data-testid="admin-sidebar-nav"]');
      const workspace = document.querySelector('[data-nav-section="workspace"]');
      const content = document.querySelector('[data-nav-section="content"]');
      const contentToggle = document.querySelector('[data-testid="admin-sidebar-section-toggle-content"]');
      const densityControls = document.querySelector('[data-testid="admin-sidebar-density-controls"]');
      const activeOnlyButton = document.querySelector('[data-testid="admin-sidebar-collapse-inactive-sections"]');
      const expandAllButton = document.querySelector('[data-testid="admin-sidebar-expand-all-sections"]');
      const filterInput = document.querySelector('[data-testid="admin-sidebar-filter-input"]');
      const activeSiteManage = document.querySelector('[data-testid="admin-sidebar-active-site-manage"]');
      return {
        ready: Boolean(sidebar) &&
          sidebar?.getAttribute('data-nav-ready') === 'true' &&
          Boolean(workspace) &&
          Boolean(content) &&
          contentToggle instanceof HTMLButtonElement &&
          densityControls instanceof HTMLElement &&
          filterInput instanceof HTMLInputElement &&
          activeOnlyButton instanceof HTMLButtonElement &&
          expandAllButton instanceof HTMLButtonElement,
        collapsed: sidebar?.getAttribute('data-collapsed') || '',
        activeSection: sidebar?.getAttribute('data-active-nav-section') || '',
        brandHeaderLayout: brandHeader?.getAttribute('data-brand-header-layout') || '',
        brandHeaderMinHeight: brandHeader?.getAttribute('data-brand-header-min-height') || '',
        brandHeaderHeight: brandHeader instanceof HTMLElement ? brandHeader.getBoundingClientRect().height : 0,
        brandHeaderBottom: brandHeader instanceof HTMLElement ? brandHeader.getBoundingClientRect().bottom : 0,
        siteSwitcherLayout: siteSwitcherShell?.getAttribute('data-expanded-site-switcher-layout') || '',
        activeSiteBottom: activeSite instanceof HTMLElement ? activeSite.getBoundingClientRect().bottom : 0,
        discoveryLinksBottom: discoveryLinks instanceof HTMLElement ? discoveryLinks.getBoundingClientRect().bottom : 0,
        quickCreateTop: quickCreate instanceof HTMLElement ? quickCreate.getBoundingClientRect().top : 0,
        shellScrollContract: sidebarShell?.getAttribute('data-scroll-contract') || '',
        scrollContract: sidebar?.getAttribute('data-scroll-contract') || '',
        scrollScope: sidebar?.getAttribute('data-scroll-scope') || '',
        scrollContainerTestId: sidebar?.getAttribute('data-scroll-container-testid') || '',
        navScrollRole: sidebarNav?.getAttribute('data-scroll-role') || '',
        navScrollAxis: sidebarNav?.getAttribute('data-scroll-axis') || '',
        navScrollOwner: sidebarNav?.getAttribute('data-scroll-owned-by') || '',
        navScrollContained: sidebarNav?.getAttribute('data-scroll-contained') || '',
        sidebarOverflowY: sidebar instanceof HTMLElement ? getComputedStyle(sidebar).overflowY : '',
        sidebarMaxHeight: sidebar instanceof HTMLElement ? getComputedStyle(sidebar).maxHeight : '',
        navOverflowY: sidebarNav instanceof HTMLElement ? getComputedStyle(sidebarNav).overflowY : '',
        navMinHeight: sidebarNav instanceof HTMLElement ? getComputedStyle(sidebarNav).minHeight : '',
        sectionCount: Number(sidebar?.getAttribute('data-nav-section-count') || 0),
        expandedCount: Number(sidebar?.getAttribute('data-expanded-section-count') || 0),
        collapsedCount: Number(sidebar?.getAttribute('data-collapsed-section-count') || 0),
        densityExpandedCount: Number(densityControls?.getAttribute('data-expanded-section-count') || 0),
        densitySectionCount: Number(densityControls?.getAttribute('data-section-count') || 0),
        densityActiveSection: densityControls?.getAttribute('data-active-section') || '',
        densityFiltered: densityControls?.getAttribute('data-filtered') || '',
        renderedItemCount: Number(sidebar?.getAttribute('data-rendered-nav-item-count') || 0),
        workspaceExpanded: workspace?.getAttribute('data-nav-section-expanded') || '',
        contentExpanded: content?.getAttribute('data-nav-section-expanded') || '',
        contentAriaExpanded: contentToggle instanceof HTMLButtonElement ? contentToggle.getAttribute('aria-expanded') : '',
        hasDensityControls: densityControls instanceof HTMLElement,
        hasFilterInput: filterInput instanceof HTMLInputElement,
        hasActiveOnlyButton: activeOnlyButton instanceof HTMLButtonElement,
        hasExpandAllButton: expandAllButton instanceof HTMLButtonElement,
        hasPagesLink: Boolean(document.querySelector('[data-testid="admin-sidebar-link-pages"]')),
        hasActiveSiteManage: activeSiteManage instanceof HTMLAnchorElement,
        activeSiteManageHref: activeSiteManage instanceof HTMLAnchorElement ? activeSiteManage.href : '',
        activeSiteManageState: activeSiteManage?.getAttribute('data-action-state') || '',
        activeSiteManageTarget: activeSiteManage?.getAttribute('data-target-site-id') || '',
        activeSiteManageStatus: activeSiteManage?.getAttribute('data-action-status') || '',
        storage: localStorage.getItem('backy:admin-sidebar-section-state') || '',
      };
    })()`);
    if (initial.ready) break;
    await sleep(150);
  }

  assert(initial?.ready, `Dashboard sidebar did not become ready: ${JSON.stringify(initial)}`);
  assert(initial.collapsed === 'false', `Dashboard sidebar should be expanded on dashboard: ${JSON.stringify(initial)}`);
  assert(initial.activeSection === 'workspace', `Dashboard sidebar should keep workspace active: ${JSON.stringify(initial)}`);
  assert(
    initial.brandHeaderLayout === 'expanded-site-controls' &&
      initial.brandHeaderMinHeight === '120' &&
      initial.brandHeaderHeight >= 116 &&
      initial.siteSwitcherLayout === 'stacked-site-controls' &&
      initial.activeSiteBottom <= initial.brandHeaderBottom + 1 &&
      initial.discoveryLinksBottom <= initial.brandHeaderBottom + 1 &&
      initial.quickCreateTop >= initial.brandHeaderBottom - 1,
    `Dashboard sidebar brand/site switcher must not clip or overlap quick-create controls: ${JSON.stringify(initial)}`,
  );
  assert(
    initial.shellScrollContract === 'sidebar-independent-from-main' &&
      initial.scrollContract === 'viewport-bounded-sidebar' &&
      initial.scrollScope === 'sidebar-nav' &&
      initial.scrollContainerTestId === 'admin-sidebar-nav' &&
      initial.navScrollRole === 'primary-navigation' &&
      initial.navScrollAxis === 'y' &&
      initial.navScrollOwner === 'admin-sidebar' &&
      initial.navScrollContained === 'true' &&
      initial.sidebarOverflowY !== 'visible' &&
      initial.sidebarMaxHeight !== 'none' &&
      initial.navOverflowY === 'auto' &&
      initial.navMinHeight === '0px',
    `Dashboard sidebar must be viewport-bounded with an internal navigation scroller: ${JSON.stringify(initial)}`,
  );
  assert(initial.sectionCount >= 5, `Dashboard sidebar lost primary navigation groups: ${JSON.stringify(initial)}`);
  assert(initial.expandedCount >= 1 && initial.collapsedCount >= 1, `Dashboard sidebar should start grouped, not fully expanded: ${JSON.stringify(initial)}`);
  assert(
    initial.hasDensityControls &&
      initial.hasActiveOnlyButton &&
      initial.hasExpandAllButton &&
      initial.hasFilterInput &&
      initial.densityExpandedCount === initial.expandedCount &&
      initial.densitySectionCount === initial.sectionCount &&
      initial.densityFiltered === 'false' &&
      initial.renderedItemCount > 0 &&
      initial.densityActiveSection === initial.activeSection,
    `Dashboard sidebar density controls did not mirror grouped state: ${JSON.stringify(initial)}`,
  );
  assert(
    initial.hasActiveSiteManage &&
      initial.activeSiteManageHref.includes('/sites/') &&
      initial.activeSiteManageState === 'ready' &&
      initial.activeSiteManageTarget &&
      initial.activeSiteManageStatus.includes('without signing out'),
    `Dashboard sidebar must expose a direct active-site management link: ${JSON.stringify(initial)}`,
  );
  assert(initial.workspaceExpanded === 'true', `Dashboard sidebar should keep the active workspace group open: ${JSON.stringify(initial)}`);
  assert(initial.contentExpanded === 'false' && initial.contentAriaExpanded === 'false', `Dashboard content group should start collapsed to reduce sidebar length: ${JSON.stringify(initial)}`);
  assert(!initial.hasPagesLink, `Dashboard content links should not render until the content group is opened: ${JSON.stringify(initial)}`);

  const typedFilter = await evaluate(client, `(() => {
    const input = document.querySelector('[data-testid="admin-sidebar-filter-input"]');
    if (!(input instanceof HTMLInputElement)) {
      return { ok: false, reason: 'filter-input-missing' };
    }
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(input, 'media');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return { ok: true };
  })()`);
  assert(typedFilter.ok, `Unable to type into dashboard sidebar filter: ${JSON.stringify(typedFilter)}`);

  let filteredNav = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    filteredNav = await evaluate(client, `(() => {
      const sidebar = document.querySelector('[data-testid="admin-sidebar"]');
      const densityControls = document.querySelector('[data-testid="admin-sidebar-density-controls"]');
      const content = document.querySelector('[data-nav-section="content"]');
      return {
        filtered: sidebar?.getAttribute('data-nav-filtered') || '',
        densityFiltered: densityControls?.getAttribute('data-filtered') || '',
        renderedSections: Number(sidebar?.getAttribute('data-rendered-nav-section-count') || 0),
        renderedItems: Number(sidebar?.getAttribute('data-rendered-nav-item-count') || 0),
        contentExpanded: content?.getAttribute('data-nav-section-expanded') || '',
        hasMediaLink: Boolean(document.querySelector('[data-testid="admin-sidebar-link-media"]')),
        hasPagesLink: Boolean(document.querySelector('[data-testid="admin-sidebar-link-pages"]')),
        hasFilterClear: Boolean(document.querySelector('[data-testid="admin-sidebar-filter-clear"]')),
        emptyVisible: Boolean(document.querySelector('[data-testid="admin-sidebar-filter-empty"]')),
      };
    })()`);
    if (filteredNav.filtered === 'true' && filteredNav.hasMediaLink && filteredNav.renderedItems === 1) break;
    await sleep(100);
  }
  assert(
    filteredNav?.filtered === 'true' &&
      filteredNav.densityFiltered === 'true' &&
      filteredNav.renderedSections === 1 &&
      filteredNav.renderedItems === 1 &&
      filteredNav.contentExpanded === 'true' &&
      filteredNav.hasMediaLink &&
      !filteredNav.hasPagesLink &&
      filteredNav.hasFilterClear &&
      !filteredNav.emptyVisible,
    `Dashboard sidebar filter did not shorten expanded navigation to the matching tool: ${JSON.stringify(filteredNav)}`,
  );

  const clearedFilter = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="admin-sidebar-filter-clear"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'filter-clear-missing' };
    }
    button.click();
    return { ok: true };
  })()`);
  assert(clearedFilter.ok, `Unable to clear dashboard sidebar filter: ${JSON.stringify(clearedFilter)}`);

  let clearedNav = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    clearedNav = await evaluate(client, `(() => {
      const sidebar = document.querySelector('[data-testid="admin-sidebar"]');
      const content = document.querySelector('[data-nav-section="content"]');
      return {
        filtered: sidebar?.getAttribute('data-nav-filtered') || '',
        renderedItems: Number(sidebar?.getAttribute('data-rendered-nav-item-count') || 0),
        navItems: Number(sidebar?.getAttribute('data-nav-item-count') || 0),
        contentExpanded: content?.getAttribute('data-nav-section-expanded') || '',
        hasPagesLink: Boolean(document.querySelector('[data-testid="admin-sidebar-link-pages"]')),
      };
    })()`);
    if (clearedNav.filtered === 'false' && clearedNav.renderedItems === clearedNav.navItems) break;
    await sleep(100);
  }
  assert(
    clearedNav?.filtered === 'false' &&
      clearedNav.renderedItems === clearedNav.navItems &&
      clearedNav.contentExpanded === 'false' &&
      !clearedNav.hasPagesLink,
    `Dashboard sidebar filter did not clear back to grouped navigation: ${JSON.stringify(clearedNav)}`,
  );

  const clickedExpandAll = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="admin-sidebar-expand-all-sections"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'expand-all-missing' };
    }
    button.click();
    return { ok: true };
  })()`);
  assert(clickedExpandAll.ok, `Unable to expand all dashboard sidebar sections: ${JSON.stringify(clickedExpandAll)}`);

  let allExpanded = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    allExpanded = await evaluate(client, `(() => {
      const sidebar = document.querySelector('[data-testid="admin-sidebar"]');
      const densityControls = document.querySelector('[data-testid="admin-sidebar-density-controls"]');
      return {
        expandedCount: Number(sidebar?.getAttribute('data-expanded-section-count') || 0),
        collapsedCount: Number(sidebar?.getAttribute('data-collapsed-section-count') || 0),
        sectionCount: Number(sidebar?.getAttribute('data-nav-section-count') || 0),
        densityExpandedCount: Number(densityControls?.getAttribute('data-expanded-section-count') || 0),
        hasSettingsLink: Boolean(document.querySelector('[data-testid="admin-sidebar-link-settings"]')),
        storage: localStorage.getItem('backy:admin-sidebar-section-state') || '',
      };
    })()`);
    if (allExpanded.expandedCount === allExpanded.sectionCount && allExpanded.hasSettingsLink) break;
    await sleep(100);
  }
  assert(
    allExpanded?.expandedCount === allExpanded.sectionCount &&
      allExpanded.collapsedCount === 0 &&
      allExpanded.densityExpandedCount === allExpanded.expandedCount &&
      allExpanded.hasSettingsLink &&
      allExpanded.storage.includes('platform'),
    `Dashboard sidebar expand-all control did not open every group: ${JSON.stringify(allExpanded)}`,
  );

  const clickedActiveOnly = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="admin-sidebar-collapse-inactive-sections"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'active-only-missing' };
    }
    button.click();
    return { ok: true };
  })()`);
  assert(clickedActiveOnly.ok, `Unable to collapse inactive dashboard sidebar sections: ${JSON.stringify(clickedActiveOnly)}`);

  let activeOnly = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    activeOnly = await evaluate(client, `(() => {
      const sidebar = document.querySelector('[data-testid="admin-sidebar"]');
      const workspace = document.querySelector('[data-nav-section="workspace"]');
      const content = document.querySelector('[data-nav-section="content"]');
      const densityControls = document.querySelector('[data-testid="admin-sidebar-density-controls"]');
      return {
        expandedCount: Number(sidebar?.getAttribute('data-expanded-section-count') || 0),
        collapsedCount: Number(sidebar?.getAttribute('data-collapsed-section-count') || 0),
        activeSection: sidebar?.getAttribute('data-active-nav-section') || '',
        densityExpandedCount: Number(densityControls?.getAttribute('data-expanded-section-count') || 0),
        workspaceExpanded: workspace?.getAttribute('data-nav-section-expanded') || '',
        contentExpanded: content?.getAttribute('data-nav-section-expanded') || '',
        hasPagesLink: Boolean(document.querySelector('[data-testid="admin-sidebar-link-pages"]')),
        storage: localStorage.getItem('backy:admin-sidebar-section-state') || '',
      };
    })()`);
    if (activeOnly.workspaceExpanded === 'true' && activeOnly.contentExpanded === 'false' && !activeOnly.hasPagesLink) break;
    await sleep(100);
  }
  assert(
    activeOnly?.activeSection === 'workspace' &&
      activeOnly.expandedCount === 1 &&
      activeOnly.densityExpandedCount === 1 &&
      activeOnly.workspaceExpanded === 'true' &&
      activeOnly.contentExpanded === 'false' &&
      !activeOnly.hasPagesLink &&
      !activeOnly.storage.includes('content'),
    `Dashboard sidebar active-only control did not shorten the navigation: ${JSON.stringify(activeOnly)}`,
  );

  const clickedOpen = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="admin-sidebar-section-toggle-content"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'content-toggle-missing' };
    }
    button.click();
    return { ok: true };
  })()`);
  assert(clickedOpen.ok, `Unable to open dashboard sidebar content group: ${JSON.stringify(clickedOpen)}`);

  let opened = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    opened = await evaluate(client, `(() => {
      const sidebar = document.querySelector('[data-testid="admin-sidebar"]');
      const content = document.querySelector('[data-nav-section="content"]');
      const contentToggle = document.querySelector('[data-testid="admin-sidebar-section-toggle-content"]');
      return {
        expandedCount: Number(sidebar?.getAttribute('data-expanded-section-count') || 0),
        collapsedCount: Number(sidebar?.getAttribute('data-collapsed-section-count') || 0),
        contentExpanded: content?.getAttribute('data-nav-section-expanded') || '',
        contentAriaExpanded: contentToggle instanceof HTMLButtonElement ? contentToggle.getAttribute('aria-expanded') : '',
        hasPagesLink: Boolean(document.querySelector('[data-testid="admin-sidebar-link-pages"]')),
        hasBlogLink: Boolean(document.querySelector('[data-testid="admin-sidebar-link-blog"]')),
        storage: localStorage.getItem('backy:admin-sidebar-section-state') || '',
      };
    })()`);
    if (opened.contentExpanded === 'true' && opened.hasPagesLink && opened.hasBlogLink) break;
    await sleep(100);
  }
  assert(
    opened?.contentExpanded === 'true' &&
      opened.contentAriaExpanded === 'true' &&
      opened.hasPagesLink &&
      opened.hasBlogLink &&
      opened.storage.includes('content'),
    `Dashboard sidebar content group did not open and persist: ${JSON.stringify(opened)}`,
  );

  const clickedClose = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="admin-sidebar-section-toggle-content"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'content-toggle-missing' };
    }
    button.click();
    return { ok: true };
  })()`);
  assert(clickedClose.ok, `Unable to close dashboard sidebar content group: ${JSON.stringify(clickedClose)}`);

  let closed = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    closed = await evaluate(client, `(() => {
      const content = document.querySelector('[data-nav-section="content"]');
      const contentToggle = document.querySelector('[data-testid="admin-sidebar-section-toggle-content"]');
      return {
        contentExpanded: content?.getAttribute('data-nav-section-expanded') || '',
        contentAriaExpanded: contentToggle instanceof HTMLButtonElement ? contentToggle.getAttribute('aria-expanded') : '',
        hasPagesLink: Boolean(document.querySelector('[data-testid="admin-sidebar-link-pages"]')),
        storage: localStorage.getItem('backy:admin-sidebar-section-state') || '',
      };
    })()`);
    if (closed.contentExpanded === 'false' && !closed.hasPagesLink) break;
    await sleep(100);
  }
  assert(
    closed?.contentExpanded === 'false' &&
      closed.contentAriaExpanded === 'false' &&
      !closed.hasPagesLink &&
      !closed.storage.includes('content'),
    `Dashboard sidebar content group did not close cleanly: ${JSON.stringify(closed)}`,
  );

  const clickedCollapse = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="admin-sidebar-toggle"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'toggle-missing' };
    }
    button.click();
    return { ok: true };
  })()`);
  assert(clickedCollapse.ok, `Unable to collapse dashboard sidebar: ${JSON.stringify(clickedCollapse)}`);

  let collapsedRail = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    collapsedRail = await evaluate(client, `(() => {
      const sidebar = document.querySelector('[data-testid="admin-sidebar"]');
      const pagesLink = document.querySelector('[data-testid="admin-sidebar-link-pages"]');
      const tooltip = document.querySelector('[data-testid="admin-sidebar-rail-tooltip"]');
      const sidebarRect = sidebar instanceof HTMLElement ? sidebar.getBoundingClientRect() : null;
      return {
        collapsed: sidebar?.getAttribute('data-collapsed') || '',
        sidebarWidth: sidebarRect?.width || 0,
        navReady: sidebar?.getAttribute('data-nav-ready') || '',
        permissionSource: sidebar?.getAttribute('data-permission-source') || '',
        hasPagesLink: pagesLink instanceof HTMLAnchorElement,
        tooltipVisible: tooltip instanceof HTMLElement,
      };
    })()`);
    if (collapsedRail.collapsed === 'true' && collapsedRail.sidebarWidth <= 90 && collapsedRail.hasPagesLink) break;
    await sleep(100);
  }
  assert(
    collapsedRail?.collapsed === 'true' &&
      collapsedRail.sidebarWidth <= 90 &&
      collapsedRail.navReady === 'true' &&
      collapsedRail.hasPagesLink,
    `Collapsed dashboard sidebar rail did not expose all section links: ${JSON.stringify(collapsedRail)}`,
  );

  const railTarget = await evaluate(client, `(() => {
    const pagesLink = document.querySelector('[data-testid="admin-sidebar-link-pages"]');
    if (!(pagesLink instanceof HTMLAnchorElement)) {
      return { ok: false, reason: 'pages-link-missing' };
    }
    const rect = pagesLink.getBoundingClientRect();
    return {
      ok: true,
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      width: rect.width,
      height: rect.height,
    };
  })()`);
  assert(railTarget.ok, `Unable to locate collapsed dashboard sidebar item: ${JSON.stringify(railTarget)}`);
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: railTarget.x,
    y: railTarget.y,
  });

  const focusedRailItem = await evaluate(client, `(() => {
    const pagesLink = document.querySelector('[data-testid="admin-sidebar-link-pages"]');
    if (!(pagesLink instanceof HTMLAnchorElement)) {
      return { ok: false, reason: 'pages-link-missing' };
    }
    pagesLink.focus();
    return { ok: true, activeTestId: document.activeElement?.getAttribute('data-testid') || '' };
  })()`);
  assert(focusedRailItem.ok, `Unable to focus collapsed dashboard sidebar item: ${JSON.stringify(focusedRailItem)}`);

  let railTooltip = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    railTooltip = await evaluate(client, `(() => {
      const tooltip = document.querySelector('[data-testid="admin-sidebar-rail-tooltip"]');
      const rect = tooltip instanceof HTMLElement ? tooltip.getBoundingClientRect() : null;
      return {
        visible: tooltip instanceof HTMLElement,
        item: tooltip?.getAttribute('data-tooltip-item') || '',
        route: tooltip?.getAttribute('data-tooltip-route') || '',
        left: rect?.left || 0,
        text: tooltip?.textContent || '',
      };
    })()`);
    if (railTooltip.visible && railTooltip.item === 'pages') break;
    await sleep(100);
  }
  assert(
    railTooltip?.visible &&
      railTooltip.item === 'pages' &&
      railTooltip.route === '/pages' &&
      railTooltip.left > 64 &&
      railTooltip.text.includes('Pages'),
    `Collapsed dashboard sidebar rail tooltip did not render outside the clipped nav scroll area: ${JSON.stringify({ railTarget, focusedRailItem, railTooltip })}`,
  );

  const clickedExpand = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="admin-sidebar-toggle"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'toggle-missing' };
    }
    button.click();
    return { ok: true };
  })()`);
  assert(clickedExpand.ok, `Unable to re-expand dashboard sidebar after rail tooltip check: ${JSON.stringify(clickedExpand)}`);

  return { initial, opened, closed, collapsedRail, railTooltip };
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-dashboard-${Date.now()}`);
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

const cleanup = async ({ client, childProcess, userDataDir, siteId, userId }) => {
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

  if (siteId) {
    try {
      await deleteSite(siteId);
    } catch {
      // The dashboard smoke creates a temporary site only for selector coverage.
    }
  }

  if (userId) {
    try {
      await deleteUser(userId);
    } catch {
      // The RBAC smoke creates a temporary viewer account only for scoped dashboard coverage.
    }
  }
};

const main = async () => {
  if (process.env.BACKY_DASHBOARD_SOURCE_ONLY === '1') {
    assertDashboardSourceContracts();
    console.log(JSON.stringify({ ok: true, mode: 'source-only' }, null, 2));
    return;
  }

  let client;
  let childProcess;
  let userDataDir;
  let siteId;
  let viewerUserId;
  const suffix = Date.now().toString(36);
  const siteName = `Dashboard Smoke ${suffix}`;
  const slug = `dashboard-smoke-${suffix}`;
  const viewerEmail = `dashboard-viewer-${suffix}@example.com`;

  try {
    assertDashboardSourceContracts();
    await loginAdminApi();
    const created = await createSite({ name: siteName, slug });
    siteId = created.publicSiteId || created.id;
    const viewer = await createUser({
      fullName: `Dashboard Viewer ${suffix}`,
      email: viewerEmail,
      role: 'viewer',
      status: 'invited',
    });
    viewerUserId = viewer.id;
    const invite = await createInviteToken(viewer.id);
    const viewerSession = await acceptInviteToken(invite.token);

    ({ childProcess, userDataDir } = launchChrome());
    const target = await waitForCdp();
    client = connectCdp(target.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await seedBrowserSessionCookie(client, apiAdminSessionToken);
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1680,
      height: 1180,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const authPreload = await client.send('Page.addScriptToEvaluateOnNewDocument', { source: authStorageScript(apiAdminSessionToken) });

    await navigateToDashboard(client);
    await waitForDashboardSite(client, siteName);
    await selectDashboardSite(client, siteId);
    await assertDashboardLayout(client, siteName);
    const commandActionStatus = await assertDashboardCommandActionStatus(client);
    if (COMMAND_ACTION_STATUS_SMOKE) {
      console.log(JSON.stringify({
        ok: true,
        mode: 'dashboard-command-action-status',
        siteName,
        slug,
        commandActionStatus,
      }, null, 2));
      return;
    }
    await assertDashboardLinks(client);
    await assertDashboardSidebarNavigation(client);
    await clickDashboardRefresh(client);
    await runDashboardDeploymentPreflight(client);
    await runDashboardInfrastructureCheck(client);
    const desktopVisualState = await assertDashboardVisualState(client, 'desktop', SCREENSHOT_PATH, siteName);

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 960,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await sleep(250);
    const mobileVisualState = await assertDashboardVisualState(client, 'mobile', MOBILE_SCREENSHOT_PATH, siteName);
    await assertDashboardRbacFiltering(client, viewerSession, siteName, authPreload.identifier);

    await deleteSite(siteId);
    siteId = null;
    await deleteUser(viewerUserId);
    viewerUserId = null;

    console.log(JSON.stringify({
      ok: true,
      siteName,
      slug,
      screenshot: desktopVisualState.screenshotPath,
      mobileScreenshot: mobileVisualState.screenshotPath,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, siteId, userId: viewerUserId });
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
