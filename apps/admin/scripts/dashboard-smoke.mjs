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

const authStorageScript = (sessionToken, user = { id: 'user-admin', email: 'admin@backy.io', fullName: 'Admin User', role: 'admin' }) => `
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
  const result = await evaluate(client, `(() => {
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
  const layout = await evaluate(client, `(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    hasCommandCenter: Boolean(document.querySelector('[data-testid="dashboard-command-center"]')),
    hasSiteSelector: Boolean(document.querySelector('#dashboard-active-site')),
    hasSite: Array.from(document.querySelectorAll('#dashboard-active-site option')).some((option) => option.textContent?.includes(${JSON.stringify(siteName)})),
    hasStats: Boolean(document.querySelector('#dashboard-stats')),
    hasOnboarding: Boolean(document.querySelector('[data-testid="dashboard-onboarding-state"]')) &&
      document.body?.innerText?.includes('Launch onboarding') &&
      document.body?.innerText?.includes('Create a workspace site') &&
      document.body?.innerText?.includes('Connect APIs and infrastructure'),
    hasRbacScope: Boolean(document.querySelector('[data-testid="dashboard-rbac-scope"]')) &&
      document.body?.innerText?.includes('Workspace RBAC scope') &&
      document.body?.innerText?.includes('Settings') &&
      document.body?.innerText?.includes('Users'),
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
    hasApiConsumers: Boolean(document.querySelector('[data-testid="dashboard-api-consumers"]')) &&
      document.body?.innerText?.includes('API consumer readiness') &&
      document.body?.innerText?.includes('Contract coverage') &&
      document.body?.innerText?.includes('Credentials') &&
      document.body?.innerText?.includes('Access changes'),
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
  }))()`);
  assert(layout.scrollWidth <= layout.width + 8, `Dashboard has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(
    layout.hasCommandCenter &&
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
  return layout;
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
        bodyText.includes('/api/sites/'),
      hasFrameworkOverlay: /Failed to compile|Unhandled Runtime Error|Vite Error|Internal Server Error/i.test(bodyText),
      regions,
      missingRegions,
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
      const deploymentButton = Array.from(document.querySelectorAll('button')).find((candidate) => (
        (candidate.getAttribute('aria-label') || '') === 'Run dashboard deployment preflight'
      ));
      const infrastructureButton = Array.from(document.querySelectorAll('button')).find((candidate) => (
        (candidate.getAttribute('aria-label') || '') === 'Run dashboard infrastructure check'
      ));
      return {
        ready: Boolean(rbacPanel) && bodyText.includes(${JSON.stringify(siteName)}),
        rbacText,
        apiText,
        workflowText,
        moduleText,
        deploymentDisabled: deploymentButton instanceof HTMLButtonElement ? deploymentButton.disabled : null,
        infrastructureDisabled: infrastructureButton instanceof HTMLButtonElement ? infrastructureButton.disabled : null,
        hasSettingsEndpoint: apiText.includes('/settings'),
        hasUsersEndpoint: apiText.includes('/users'),
        hasApiSetupAction: workflowText.includes('API setup'),
        hasNewSiteAction: workflowText.includes('New site'),
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
      assert(!state.hasUsersModule && !state.hasInfrastructureModule, `Viewer dashboard showed privileged module cards: ${JSON.stringify(state)}`);
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
    return { ok: missing.length === 0, missing, hrefs: hrefs.slice(0, 120) };
  })()`);
  assert(links.ok, `Dashboard missing expected navigation links: ${JSON.stringify(links)}`);
  return links;
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
    await assertDashboardLinks(client);
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
