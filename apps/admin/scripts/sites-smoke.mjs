#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_SITES_CDP_PORT || 9383);
const SCREENSHOT_PATH = process.env.BACKY_SITES_SCREENSHOT || path.join(os.tmpdir(), 'backy-sites-smoke.png');
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

const createUser = async (input) => {
  const payload = await requestApi('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const user = payload.data?.user || payload.user;
  assert(user?.id, `Create sites RBAC user did not return a user: ${JSON.stringify(payload).slice(0, 500)}`);
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

const listSites = async () => {
  const payload = await requestApi('/api/admin/sites?includeUnpublished=true');
  return payload.data?.sites || payload.sites || [];
};

const getSite = async (siteId) => {
  const payload = await requestApi(`/api/admin/sites/${siteId}`);
  return payload.data?.site || payload.site;
};

const listSitePages = async (siteId) => {
  const payload = await requestApi(`/api/admin/sites/${siteId}/pages?includeUnpublished=true`);
  return payload.data?.pages || payload.pages || [];
};

const listSiteAuditLogs = async (siteId) => {
  const payload = await requestApi(`/api/admin/audit-logs?entity=site&entityId=${encodeURIComponent(siteId)}&limit=20`);
  return payload.data?.logs || payload.logs || [];
};

const deleteSite = async (siteId) => {
  if (!siteId) return;
  await requestApi(`/api/admin/sites/${siteId}`, { method: 'DELETE' });
};

const findSiteBySlug = async (slug) => {
  const sites = await listSites();
  return sites.find((site) => site.slug === slug) || null;
};

const waitForSite = async (slug, predicate = () => true) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const site = await findSiteBySlug(slug);
    if (site && predicate(site)) {
      return site;
    }
    await sleep(250);
  }

  throw new Error(`Timed out waiting for site ${slug}`);
};

const waitForSiteMissing = async (slug) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const site = await findSiteBySlug(slug);
    if (!site) {
      return;
    }
    await sleep(250);
  }

  throw new Error(`Temporary site ${slug} still exists after cleanup`);
};

const waitForSeededPages = async (siteId, expectedSlugs) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const pages = await listSitePages(siteId);
    const slugs = new Set(pages.map((page) => page.slug));
    if (expectedSlugs.every((slug) => slugs.has(slug))) {
      return pages;
    }
    await sleep(250);
  }

  throw new Error(`Starter pages were not created for site ${siteId}`);
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

const navigateToCreateSite = (client) => navigate(
  client,
  `${ADMIN_BASE_URL}/sites/new`,
  `(() => ({
    ready: Boolean(document.querySelector('[data-testid="site-creation-command-center"]')) &&
      document.body?.innerText?.includes('Starter structure') &&
      document.body?.innerText?.includes('API handoff'),
    body: document.body?.innerText?.slice(0, 900) || '',
  }))()`,
  'Create site page',
);

const navigateToSites = (client, expectedText = 'Sites command center') => navigate(
  client,
  `${ADMIN_BASE_URL}/sites`,
  `(() => ({
    ready: Boolean(document.querySelector('[data-testid="sites-command-center"]')) &&
      document.body?.innerText?.includes(${JSON.stringify(expectedText)}),
    body: document.body?.innerText?.slice(0, 900) || '',
  }))()`,
  'Sites page',
);

const setCreateSiteControl = async (client, labelText, value) => {
  const result = await evaluate(client, `(() => {
    const labelText = ${JSON.stringify(labelText)};
    const value = ${JSON.stringify(value)};
    const normalize = (text) => String(text || '').replace(/\\s+/g, ' ').trim();
    const labels = Array.from(document.querySelectorAll('label'));
    const label = labels.find((candidate) => {
      const firstSpan = candidate.querySelector('span');
      return normalize(firstSpan?.textContent || candidate.textContent) === labelText;
    });
    if (!(label instanceof HTMLLabelElement)) {
      return {
        ok: false,
        reason: 'label-missing',
        labelText,
        labels: labels.map((candidate) => normalize(candidate.querySelector('span')?.textContent || candidate.textContent)).slice(0, 80),
      };
    }
    const control = label.querySelector('input, select, textarea');
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) {
      return { ok: false, reason: 'control-missing', labelText };
    }
    if (control.disabled) return { ok: false, reason: 'control-disabled', labelText };
    const prototype = control instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : control instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(control, String(value));
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    control.dispatchEvent(new Event('blur', { bubbles: true }));
    return { ok: true, value: control.value };
  })()`);
  assert(result.ok, `Unable to set create-site ${labelText}: ${JSON.stringify(result)}`);
  await sleep(150);
  return result;
};

const setCreateSiteBlueprint = async (client, blueprint) => {
  const result = await evaluate(client, `(() => {
    const input = document.querySelector('input[name="site-blueprint"][value="' + CSS.escape(${JSON.stringify(blueprint)}) + '"]');
    if (!(input instanceof HTMLInputElement)) {
      return {
        ok: false,
        reason: 'blueprint-missing',
        blueprints: Array.from(document.querySelectorAll('input[name="site-blueprint"]')).map((candidate) => candidate.value),
      };
    }
    if (input.disabled) return { ok: false, reason: 'blueprint-disabled' };
    input.click();
    return { ok: true, checked: input.checked, value: input.value };
  })()`);
  assert(result.ok, `Unable to select create-site blueprint: ${JSON.stringify(result)}`);
  await sleep(150);
  return result;
};

const submitCreateSiteForm = async (client) => {
  const result = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button[type="submit"]')).find((candidate) => (
      (candidate.textContent || '').includes('Create site')
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        reason: 'submit-missing',
        buttons: Array.from(document.querySelectorAll('button')).map((candidate) => candidate.textContent || '').slice(0, 80),
      };
    }
    if (button.disabled) return { ok: false, reason: 'submit-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(result.ok, `Unable to submit create-site form: ${JSON.stringify(result)}`);
};

const createSiteThroughUi = async (client, { siteName, slug, customDomain }) => {
  await setCreateSiteControl(client, 'Site name', siteName);
  await setCreateSiteControl(client, 'URL slug', slug);
  await setCreateSiteControl(client, 'Custom domain', customDomain);
  await setCreateSiteControl(client, 'Description', 'Temporary storefront workspace created through the Backy admin UI smoke.');
  await setCreateSiteControl(client, 'Status', 'published');
  await setCreateSiteBlueprint(client, 'storefront');
  await submitCreateSiteForm(client);

  const created = await waitForSite(slug, (site) => site.status === 'published' || site.isPublished === true);
  const siteId = created.publicSiteId || created.id;
  const pages = await waitForSeededPages(siteId, ['home', 'shop', 'contact']);
  const homepage = pages.find((page) => page.slug === 'home');
  assert(homepage?.isHomepage === true, `Storefront blueprint did not create a homepage: ${JSON.stringify(pages).slice(0, 700)}`);
  assert(pages.every((page) => page.status === 'published'), `Storefront blueprint pages did not inherit published status: ${JSON.stringify(pages).slice(0, 700)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      path: window.location.pathname,
      search: window.location.search,
      body: document.body?.innerText?.slice(0, 700) || '',
    }))()`);
    if (state.path === '/pages' && state.search.includes(siteId)) {
      return { site: created, pages };
    }
    await sleep(250);
  }

  throw new Error(`Create-site form did not route to the seeded page workspace for ${slug}`);
};

const waitForSitesPageSite = async (client, siteName) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="sites-command-center"]')),
      hasSite: document.body?.innerText?.includes(${JSON.stringify(siteName)}) || false,
      path: window.location.pathname,
      body: document.body?.innerText?.slice(0, 900) || '',
    }))()`);
    if (state.ready && state.hasSite && state.path === '/sites') {
      return state;
    }
    if (attempt === 119) {
      throw new Error(`Sites page did not show temporary site: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const setSiteStatusSelect = async (client, siteName, status) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const select = Array.from(document.querySelectorAll('select')).find((candidate) => (
        (candidate.getAttribute('aria-label') || '') === ${JSON.stringify(`Change status for ${siteName}`)}
      ));
      if (!(select instanceof HTMLSelectElement)) {
        return {
          ok: false,
          reason: 'select-missing',
          labels: Array.from(document.querySelectorAll('select')).map((candidate) => candidate.getAttribute('aria-label') || '').slice(0, 40),
        };
      }
      if (select.disabled) return { ok: false, reason: 'select-disabled' };
      const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
      descriptor?.set?.call(select, ${JSON.stringify(status)});
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, value: select.value };
    })()`);

    if (result.ok) {
      return result;
    }
    if (attempt === 79) {
      throw new Error(`Unable to set site status to ${status}: ${JSON.stringify(result)}`);
    }
    await sleep(250);
  }

  return null;
};

const setSitesFilter = async (client, ariaLabel, value) => {
  const result = await evaluate(client, `(() => {
    const control = document.querySelector('[aria-label="' + CSS.escape(${JSON.stringify(ariaLabel)}) + '"]');
    const value = ${JSON.stringify(value)};
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) {
      return { ok: false, ariaLabel: ${JSON.stringify(ariaLabel)}, controls: Array.from(document.querySelectorAll('input, select')).map((candidate) => candidate.getAttribute('aria-label') || candidate.getAttribute('placeholder') || '').slice(0, 60) };
    }
    if (control.disabled) return { ok: false, reason: 'control-disabled', ariaLabel: ${JSON.stringify(ariaLabel)} };
    const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(control, String(value));
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: control.value };
  })()`);
  assert(result.ok, `Unable to set ${ariaLabel}: ${JSON.stringify(result)}`);
  await sleep(250);
  return result;
};

const waitForSitesControlsEnabled = async (client) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const search = document.querySelector('[aria-label="Search sites"]');
      return {
        ready: search instanceof HTMLInputElement && !search.disabled,
        disabled: search instanceof HTMLInputElement ? search.disabled : null,
        body: document.body?.innerText?.slice(0, 1000) || '',
      };
    })()`);
    if (state.ready) return state;
    if (attempt === 79) {
      throw new Error(`Sites controls did not become enabled: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const exerciseSitesFilters = async (client, siteName) => {
  await waitForSitesControlsEnabled(client);
  await setSitesFilter(client, 'Search sites', siteName);
  await waitForSitesPageSite(client, siteName);
  await setSitesFilter(client, 'Filter sites by domain', 'custom');
  await waitForSitesPageSite(client, siteName);
  await setSitesFilter(client, 'Filter sites by page coverage', 'with-pages');
  await waitForSitesPageSite(client, siteName);
  await setSitesFilter(client, 'Filter sites by status', 'published');
  await waitForSitesPageSite(client, siteName);
  await setSitesFilter(client, 'Filter sites by status', 'all');
  await setSitesFilter(client, 'Filter sites by domain', 'all');
  await setSitesFilter(client, 'Filter sites by page coverage', 'all');
  await setSitesFilter(client, 'Search sites', '');
};

const clickSiteAction = async (client, siteName, action) => {
  await waitForSitesPageSite(client, siteName);
  const result = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
      (candidate.getAttribute('aria-label') || '') === ${JSON.stringify(`${action} ${siteName}`)}
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        action: ${JSON.stringify(action)},
        buttons: Array.from(document.querySelectorAll('button')).map((candidate) => candidate.getAttribute('aria-label') || candidate.textContent || '').slice(0, 100),
      };
    }
    if (button.disabled) return { ok: false, reason: 'action-disabled', action: ${JSON.stringify(action)} };
    button.click();
    return { ok: true };
  })()`);
  assert(result.ok, `Unable to click ${action} for ${siteName}: ${JSON.stringify(result)}`);
  await sleep(350);
  return result;
};

const duplicateSiteThroughUi = async (client, siteName, originalSlug) => {
  await clickSiteAction(client, siteName, 'Duplicate');

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const sites = await listSites();
    const duplicate = sites.find((site) => (
      site.name === `${siteName} Copy` &&
      site.slug.startsWith(`${originalSlug}-copy-`) &&
      site.status === 'draft' &&
      !site.customDomain
    ));
    if (duplicate) {
      return duplicate;
    }
    await sleep(250);
  }

  throw new Error(`Duplicated site was not created for ${siteName}`);
};

const archiveSiteThroughUi = async (client, siteName, slug) => {
  await clickSiteAction(client, siteName, 'Archive');
  return waitForSite(slug, (site) => site.status === 'archived');
};

const deleteSiteThroughUi = async (client, siteName) => {
  await waitForSitesPageSite(client, siteName);
  const openResult = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
      (candidate.getAttribute('aria-label') || '') === ${JSON.stringify(`Delete ${siteName}`)}
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        buttons: Array.from(document.querySelectorAll('button')).map((candidate) => candidate.getAttribute('aria-label') || candidate.textContent || '').slice(0, 80),
      };
    }
    if (button.disabled) return { ok: false, reason: 'delete-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(openResult.ok, `Unable to open site delete confirmation: ${JSON.stringify(openResult)}`);

  const typedResult = await evaluate(client, `(() => {
    const input = document.querySelector('[aria-label="Confirm site deletion name"]');
    if (!(input instanceof HTMLInputElement)) {
      return { ok: false, reason: 'input-missing' };
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, ${JSON.stringify(siteName)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: input.value };
  })()`);
  assert(typedResult.ok, `Unable to type delete confirmation: ${JSON.stringify(typedResult)}`);

  const confirmResult = await evaluate(client, `(() => {
    const dialog = Array.from(document.querySelectorAll('[class*="fixed"]')).find((candidate) => (
      (candidate.textContent || '').includes(${JSON.stringify(`Delete ${siteName}?`)})
    ));
    const button = dialog && Array.from(dialog.querySelectorAll('button')).find((candidate) => (
      (candidate.textContent || '').trim() === 'Delete site'
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'confirm-missing', dialog: dialog?.textContent?.slice(0, 500) || '' };
    }
    if (button.disabled) return { ok: false, reason: 'confirm-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(confirmResult.ok, `Unable to confirm site deletion: ${JSON.stringify(confirmResult)}`);
};

const assertLayout = async (client, siteName) => {
  const layout = await evaluate(client, `(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    hasCommandCenter: Boolean(document.querySelector('[data-testid="sites-command-center"]')),
    hasSite: document.body?.innerText?.includes(${JSON.stringify(siteName)}) || false,
    hasFrontendApi: document.body?.innerText?.includes('Site frontend API') || false,
    hasDomainVerification: Boolean(document.querySelector('[data-testid="sites-domain-verification"]')),
    hasVercelDeployment: Boolean(document.querySelector('[data-testid="sites-vercel-deployment"]')),
    hasFeatureContract: document.body?.innerText?.includes('Website feature contract') || false,
    hasRequiredControls: document.body?.innerText?.includes('What Backy still needs here') || false,
    hasAuditPanel: Boolean(document.querySelector('[data-testid="sites-audit-panel"]')),
    hasLibrary: Boolean(document.querySelector('input[aria-label="Search sites"]')),
  }))()`);
  assert(layout.scrollWidth <= layout.width + 8, `Sites page has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(
    layout.hasCommandCenter && layout.hasSite && layout.hasFrontendApi && layout.hasDomainVerification && layout.hasVercelDeployment && layout.hasFeatureContract && layout.hasRequiredControls && layout.hasAuditPanel && layout.hasLibrary,
    `Sites page missing expected regions: ${JSON.stringify(layout)}`,
  );
  return layout;
};

const exerciseDomainVerification = async (client, { siteId, siteName }) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="sites-domain-verification"]');
      const text = panel?.textContent || '';
      const prepare = document.querySelector(${JSON.stringify(`[aria-label="Prepare domain verification for ${siteName}"]`)});
      const verify = document.querySelector(${JSON.stringify(`[aria-label="Mark domain verified for ${siteName}"]`)});
      return {
        ready: prepare instanceof HTMLButtonElement && !prepare.disabled && verify instanceof HTMLButtonElement && !verify.disabled,
        prepareDisabled: prepare instanceof HTMLButtonElement ? prepare.disabled : null,
        verifyDisabled: verify instanceof HTMLButtonElement ? verify.disabled : null,
        hasPanel: Boolean(panel),
        text: text.slice(0, 1400),
      };
    })()`);
    if (state.ready) break;
    if (attempt === 79) {
      throw new Error(`Domain verification controls did not render for ${siteName}: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  for (const action of ['Prepare domain verification for', 'Mark domain verified for']) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const state = await evaluate(client, `(() => {
        const button = document.querySelector(${JSON.stringify(`[aria-label="${action} ${siteName}"]`)});
        const panel = document.querySelector('[data-testid="sites-domain-verification"]');
        return {
          ready: button instanceof HTMLButtonElement && !button.disabled,
          disabled: button instanceof HTMLButtonElement ? button.disabled : null,
          text: panel?.textContent?.slice(0, 1400) || '',
        };
      })()`);
      if (state.ready) break;
      if (attempt === 79) {
        throw new Error(`Domain verification action stayed disabled: ${JSON.stringify({ action, ...state })}`);
      }
      await sleep(250);
    }

    const result = await evaluate(client, `(() => {
      const button = document.querySelector(${JSON.stringify(`[aria-label="${action} ${siteName}"]`)});
      if (!(button instanceof HTMLButtonElement)) {
        return {
          ok: false,
          action: ${JSON.stringify(action)},
          buttons: Array.from(document.querySelectorAll('button')).map((candidate) => candidate.getAttribute('aria-label') || candidate.textContent || '').slice(0, 120),
        };
      }
      if (button.disabled) return { ok: false, reason: 'button-disabled', action: ${JSON.stringify(action)} };
      button.click();
      return { ok: true };
    })()`);
    assert(result.ok, `Unable to run domain verification action: ${JSON.stringify(result)}`);
    await sleep(550);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const site = await getSite(siteId);
    const verification = site?.settings?.domainVerification;
    if (
      verification?.status === 'verified' &&
      verification?.token &&
      verification?.txtValue &&
      verification?.verifiedAt
    ) {
      const state = await evaluate(client, `(() => {
        const panel = document.querySelector('[data-testid="sites-domain-verification"]');
        const text = panel?.textContent || '';
        return {
          hasPanel: Boolean(panel),
          hasVerified: text.includes('Verified'),
          hasToken: text.includes(${JSON.stringify(verification.token)}),
          text: text.slice(0, 1400),
        };
      })()`);
      assert(state.hasPanel && state.hasVerified && state.hasToken, `Domain verification panel did not render persisted state: ${JSON.stringify(state)}`);
      return verification;
    }
    await sleep(250);
  }

  throw new Error(`Domain verification did not persist for ${siteName}`);
};

const exerciseVercelDeployment = async (client, { siteId, siteName }) => {
  const actions = [
    'Prepare Vercel preview deploy for',
    'Record Vercel preview deploy for',
    'Record Vercel production deploy for',
  ];

  for (const action of actions) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const state = await evaluate(client, `(() => {
        const button = document.querySelector(${JSON.stringify(`[aria-label="${action} ${siteName}"]`)});
        const panel = document.querySelector('[data-testid="sites-vercel-deployment"]');
        return {
          ready: button instanceof HTMLButtonElement && !button.disabled,
          disabled: button instanceof HTMLButtonElement ? button.disabled : null,
          text: panel?.textContent?.slice(0, 1600) || '',
        };
      })()`);
      if (state.ready) break;
      if (attempt === 79) {
        throw new Error(`Vercel deployment action stayed disabled: ${JSON.stringify({ action, ...state })}`);
      }
      await sleep(250);
    }

    const result = await evaluate(client, `(() => {
      const button = document.querySelector(${JSON.stringify(`[aria-label="${action} ${siteName}"]`)});
      if (!(button instanceof HTMLButtonElement)) {
        return {
          ok: false,
          action: ${JSON.stringify(action)},
          buttons: Array.from(document.querySelectorAll('button')).map((candidate) => candidate.getAttribute('aria-label') || candidate.textContent || '').slice(0, 140),
        };
      }
      if (button.disabled) return { ok: false, reason: 'button-disabled', action: ${JSON.stringify(action)} };
      button.click();
      return { ok: true };
    })()`);
    assert(result.ok, `Unable to run Vercel deployment action: ${JSON.stringify(result)}`);
    await sleep(550);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const site = await getSite(siteId);
    const deployment = site?.settings?.vercelDeployment;
    if (
      deployment?.status === 'production_ready' &&
      deployment?.previewUrl &&
      deployment?.productionUrl &&
      deployment?.history?.length >= 3
    ) {
      const state = await evaluate(client, `(() => {
        const panel = document.querySelector('[data-testid="sites-vercel-deployment"]');
        const text = panel?.textContent || '';
        return {
          hasPanel: Boolean(panel),
          hasProduction: text.includes('Production ready'),
          hasPreviewUrl: text.includes(${JSON.stringify(deployment.previewUrl)}),
          hasHistory: text.includes('promote production') || text.includes('record preview'),
          text: text.slice(0, 1600),
        };
      })()`);
      assert(state.hasPanel && state.hasProduction && state.hasPreviewUrl && state.hasHistory, `Vercel deployment panel did not render persisted state: ${JSON.stringify(state)}`);
      return deployment;
    }
    await sleep(250);
  }

  throw new Error(`Vercel deployment workflow did not persist for ${siteName}`);
};

const assertSiteAuditTrail = async (client, { siteId, siteName }) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const logs = await listSiteAuditLogs(siteId);
    const actions = new Set(logs.map((log) => log.action));
    if (actions.has('site.created') && actions.has('site.updated')) {
      break;
    }
    if (attempt === 39) {
      throw new Error(`Site audit API did not record create/update actions: ${JSON.stringify(logs).slice(0, 900)}`);
    }
    await sleep(250);
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="sites-audit-panel"]');
      const text = panel?.textContent || '';
      return {
        hasPanel: Boolean(panel),
        hasRows: document.querySelectorAll('[data-testid="sites-audit-row"]').length > 0,
        hasSite: text.includes(${JSON.stringify(siteName)}),
        hasUpdate: text.includes('Updated') || text.includes('Created'),
        text: text.slice(0, 1000),
      };
    })()`);
    if (state.hasPanel && state.hasRows && state.hasSite && state.hasUpdate) {
      return;
    }
    await evaluate(client, `document.querySelector('[data-testid="sites-audit-panel"] button')?.click()`);
    if (attempt === 39) {
      throw new Error(`Site audit panel did not render site activity: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }
};

const assertSitesRbacFiltering = async (client, viewerSession, siteName, preloadScriptIdentifier) => {
  if (preloadScriptIdentifier) {
    await client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: preloadScriptIdentifier });
  }
  const viewerPreload = await client.send('Page.addScriptToEvaluateOnNewDocument', {
    source: authStorageScript(viewerSession.session.token, viewerSession.user),
  });
  await navigateToSites(client, siteName);
  await waitForSitesPageSite(client, siteName);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const bodyText = document.body?.innerText || '';
      const rbacPanel = document.querySelector('[data-testid="sites-rbac-scope"]');
      const rbacText = rbacPanel?.textContent || '';
      const newSiteButtons = Array.from(document.querySelectorAll('button')).filter((button) => (
        (button.textContent || '').trim() === 'New site'
      ));
      const statusSelect = Array.from(document.querySelectorAll('select')).find((select) => (
        (select.getAttribute('aria-label') || '') === ${JSON.stringify(`Change status for ${siteName}`)}
      ));
      const duplicateButton = document.querySelector(${JSON.stringify(`[aria-label="Duplicate ${siteName}"]`)});
      const archiveButton = document.querySelector(${JSON.stringify(`[aria-label="Archive ${siteName}"]`)});
      const deleteButton = document.querySelector(${JSON.stringify(`[aria-label="Delete ${siteName}"]`)});
      const prepareDomainButtons = Array.from(document.querySelectorAll('button')).filter((button) => (
        (button.getAttribute('aria-label') || '').startsWith('Prepare domain verification for ')
      ));
      const verifyDomainButtons = Array.from(document.querySelectorAll('button')).filter((button) => (
        (button.getAttribute('aria-label') || '').startsWith('Mark domain verified for ')
      ));
      const auditPanel = document.querySelector('[data-testid="sites-audit-panel"]');
      const deployButtons = Array.from(document.querySelectorAll('button')).filter((button) => (
        (button.getAttribute('aria-label') || '').startsWith('Prepare Vercel preview deploy for ') ||
        (button.getAttribute('aria-label') || '').startsWith('Record Vercel preview deploy for ') ||
        (button.getAttribute('aria-label') || '').startsWith('Record Vercel production deploy for ') ||
        (button.getAttribute('aria-label') || '').startsWith('Record Vercel rollback for ')
      ));
      const auditText = auditPanel?.textContent || '';
      const auditRefreshButton = Array.from(auditPanel?.querySelectorAll('button') || []).find((button) => (
        (button.textContent || '').includes('Refresh activity')
      ));
      return {
        ready: Boolean(rbacPanel) &&
          bodyText.includes(${JSON.stringify(siteName)}) &&
          statusSelect instanceof HTMLSelectElement &&
          duplicateButton instanceof HTMLButtonElement &&
          archiveButton instanceof HTMLButtonElement &&
          deleteButton instanceof HTMLButtonElement,
        rbacText,
        newSiteDisabled: newSiteButtons.length > 0 && newSiteButtons.every((button) => button.disabled),
        statusDisabled: statusSelect instanceof HTMLSelectElement ? statusSelect.disabled : null,
        duplicateDisabled: duplicateButton instanceof HTMLButtonElement ? duplicateButton.disabled : null,
        archiveDisabled: archiveButton instanceof HTMLButtonElement ? archiveButton.disabled : null,
        deleteDisabled: deleteButton instanceof HTMLButtonElement ? deleteButton.disabled : null,
        prepareDomainDisabled: prepareDomainButtons.length > 0 && prepareDomainButtons.every((button) => button.disabled),
        verifyDomainDisabled: verifyDomainButtons.length > 0 && verifyDomainButtons.every((button) => button.disabled),
        deployActionsDisabled: deployButtons.length > 0 && deployButtons.every((button) => button.disabled),
        auditRefreshDisabled: auditRefreshButton instanceof HTMLButtonElement ? auditRefreshButton.disabled : null,
        auditDenied: auditText.includes('role does not include') || auditText.includes('Blocked by viewer'),
        hasFrameworkOverlay: /Failed to compile|Unhandled Runtime Error|Vite Error|Internal Server Error/i.test(bodyText),
        body: bodyText.slice(0, 2600),
      };
    })()`);
    if (state.ready) {
      assert(/viewer/i.test(state.rbacText), `Viewer sites page did not show viewer RBAC scope: ${JSON.stringify(state)}`);
      assert(state.rbacText.includes('Create sites') && state.rbacText.includes('Hidden'), `Viewer sites page did not hide create permission: ${JSON.stringify(state)}`);
      assert(state.rbacText.includes('Configure sites') && state.rbacText.includes('Hidden'), `Viewer sites page did not hide configure permission: ${JSON.stringify(state)}`);
      assert(state.rbacText.includes('Archive/delete') && state.rbacText.includes('Hidden'), `Viewer sites page did not hide delete permission: ${JSON.stringify(state)}`);
      assert(state.newSiteDisabled === true, `Viewer sites page left New site enabled: ${JSON.stringify(state)}`);
      assert(state.statusDisabled === true, `Viewer sites page left status control enabled: ${JSON.stringify(state)}`);
      assert(state.duplicateDisabled === true, `Viewer sites page left duplicate enabled: ${JSON.stringify(state)}`);
      assert(state.archiveDisabled === true, `Viewer sites page left archive enabled: ${JSON.stringify(state)}`);
      assert(state.deleteDisabled === true, `Viewer sites page left delete enabled: ${JSON.stringify(state)}`);
      assert(state.prepareDomainDisabled === true, `Viewer sites page left domain prepare enabled: ${JSON.stringify(state)}`);
      assert(state.verifyDomainDisabled === true, `Viewer sites page left domain verify enabled: ${JSON.stringify(state)}`);
      assert(state.deployActionsDisabled === true, `Viewer sites page left Vercel deployment actions enabled: ${JSON.stringify(state)}`);
      assert(state.auditRefreshDisabled === true && state.auditDenied, `Viewer sites page did not hide audit activity: ${JSON.stringify(state)}`);
      assert(!state.hasFrameworkOverlay, `Viewer sites page rendered a framework/runtime overlay: ${JSON.stringify(state)}`);
      return { state, preloadScriptIdentifier: viewerPreload.identifier };
    }
    if (attempt === 79) {
      throw new Error(`Viewer sites RBAC scope did not render: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return { state: null, preloadScriptIdentifier: viewerPreload.identifier };
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-sites-${Date.now()}`);
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

const cleanup = async ({ client, childProcess, userDataDir, siteId }) => {
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
      // The UI flow may already have removed the temporary site.
    }
  }
};

const main = async () => {
  let client;
  let childProcess;
  let userDataDir;
  let createdSiteId;
  let duplicatedSiteId;
  let ownerUserId;
  let viewerUserId;
  const suffix = Date.now().toString(36);
  const siteName = `Sites Smoke ${suffix}`;
  const slug = `sites-smoke-${suffix}`;
  const customDomain = `${slug}.example.com`;
  const ownerEmail = `sites-owner-${suffix}@example.com`;
  const viewerEmail = `sites-viewer-${suffix}@example.com`;

  try {
    await loginAdminApi();
    const existing = await findSiteBySlug(slug);
    assert(!existing, `Temporary site already exists: ${slug}`);
    const owner = await createUser({
      fullName: `Sites Owner ${suffix}`,
      email: ownerEmail,
      role: 'owner',
      status: 'invited',
    });
    ownerUserId = owner.id;
    const ownerInvite = await createInviteToken(owner.id);
    const ownerSession = await acceptInviteToken(ownerInvite.token);
    const viewer = await createUser({
      fullName: `Sites Viewer ${suffix}`,
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
    const authPreload = await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(ownerSession.session.token, ownerSession.user),
    });

    await navigateToCreateSite(client);
    const { site: created, pages } = await createSiteThroughUi(client, { siteName, slug, customDomain });
    createdSiteId = created.id;
    assert(created.status === 'published', `Unexpected created site status: ${JSON.stringify(created)}`);
    assert(pages.length >= 3, `Storefront blueprint did not seed enough pages: ${JSON.stringify(pages).slice(0, 700)}`);

    await navigateToSites(client, siteName);
    await waitForSitesPageSite(client, siteName);
    await assertLayout(client, siteName);
    await exerciseDomainVerification(client, { siteId: createdSiteId, siteName });
    await exerciseVercelDeployment(client, { siteId: createdSiteId, siteName });

    await setSiteStatusSelect(client, siteName, 'draft');
    await waitForSite(slug, (site) => site.status === 'draft' || site.isPublished === false);
    await setSiteStatusSelect(client, siteName, 'published');
    const published = await waitForSite(slug, (site) => site.status === 'published' || site.isPublished === true);
    assert((await getSite(published.id)).status === 'published', 'Site status update did not persist through the admin API.');
    await exerciseSitesFilters(client, siteName);

    const duplicated = await duplicateSiteThroughUi(client, siteName, slug);
    duplicatedSiteId = duplicated.id;
    assert((await getSite(duplicated.id)).status === 'draft', 'Duplicated site did not persist as a draft through the admin API.');

    await archiveSiteThroughUi(client, siteName, slug);
    assert((await getSite(createdSiteId)).status === 'archived', 'Archive action did not persist through the admin API.');
    await assertSiteAuditTrail(client, { siteId: createdSiteId, siteName });
    const viewerRbac = await assertSitesRbacFiltering(client, viewerSession, siteName, authPreload.identifier);
    if (viewerRbac?.preloadScriptIdentifier) {
      await client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: viewerRbac.preloadScriptIdentifier });
    }
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(ownerSession.session.token, ownerSession.user),
    });
    await navigateToSites(client, siteName);
    await waitForSitesPageSite(client, siteName);
    await waitForSitesControlsEnabled(client);
    await setSitesFilter(client, 'Search sites', siteName);
    await setSitesFilter(client, 'Filter sites by status', 'all');
    await setSitesFilter(client, 'Filter sites by domain', 'all');
    await setSitesFilter(client, 'Filter sites by page coverage', 'all');

    await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }).then((result) => {
      fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(result.data, 'base64'));
    });

    await deleteSiteThroughUi(client, siteName);
    await waitForSiteMissing(slug);
    createdSiteId = null;

    await deleteSite(duplicatedSiteId);
    duplicatedSiteId = null;
    await deleteUser(viewerUserId);
    viewerUserId = null;
    await deleteUser(ownerUserId);
    ownerUserId = null;

    console.log(JSON.stringify({
      ok: true,
      siteName,
      slug,
      duplicatedSlug: duplicated.slug,
      screenshot: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, siteId: createdSiteId });
    if (duplicatedSiteId) {
      await deleteSite(duplicatedSiteId).catch(() => {});
    }
    if (viewerUserId) {
      await deleteUser(viewerUserId).catch(() => {});
    }
    if (ownerUserId) {
      await deleteUser(ownerUserId).catch(() => {});
    }
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
