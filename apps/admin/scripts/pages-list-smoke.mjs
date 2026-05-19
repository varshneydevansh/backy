#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_PAGES_LIST_CDP_PORT || 9374);
const HIERARCHY_SITE_ID = process.env.BACKY_PAGES_LIST_HIERARCHY_SITE_ID || 'site-demo';
const EMPTY_SITE_ID = process.env.BACKY_PAGES_LIST_EMPTY_SITE_ID || 'site-cook';
const SCREENSHOT_PATH = process.env.BACKY_PAGES_LIST_SCREENSHOT || path.join(os.tmpdir(), 'backy-pages-list-smoke.png');
const VISUAL_SCREENSHOT_DIR = process.env.BACKY_PAGES_LIST_VISUAL_SCREENSHOT_DIR || os.tmpdir();
const VISUAL_SCREENSHOT_PATHS = {
  empty: path.join(VISUAL_SCREENSHOT_DIR, 'backy-pages-list-empty-state.png'),
  delivery: path.join(VISUAL_SCREENSHOT_DIR, 'backy-pages-list-delivery-row.png'),
  bulkModal: path.join(VISUAL_SCREENSHOT_DIR, 'backy-pages-list-bulk-publish-modal.png'),
  postPublish: path.join(VISUAL_SCREENSHOT_DIR, 'backy-pages-list-post-publish-row.png'),
};
let apiAdminSessionToken = '';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertPagesListSourceContract = () => {
  const source = fs.readFileSync(new URL('../src/routes/pages.tsx', import.meta.url), 'utf8');
  assert(source.includes("import { EmptyState } from '@/components/ui/EmptyState';"), 'Pages list route must use the shared EmptyState component');
  assert(source.includes('No saved snapshots yet'), 'Pages revision column must keep an explicit empty revision title visible');
  assert(source.includes('Save this page in the editor to capture a rollback-ready revision.'), 'Pages revision empty state must explain how snapshots are captured');
  assert(source.includes('data-testid="pages-error-state"') && source.includes('Pages workspace needs attention'), 'Pages list must expose a labelled backend error state');
  assert(source.includes('aria-label="Retry loading pages"') && source.includes('Retry load'), 'Pages list backend error state must expose a retry action');
  assert(source.includes('hasPageFilters') && source.includes('Clear filters'), 'Pages list backend error state must expose filter recovery when filters are active');
  assert(source.includes('data-testid="pages-permission-state"') && source.includes('Page permissions could not be verified'), 'Pages list must expose a labelled permission error state');
  assert(source.includes('to="/users"') && source.includes('Review users'), 'Pages permission error state must link to user access management');
  assert(source.includes('function PageTemplateCell') && source.includes('data-testid={`pages-template-${page.id}`}'), 'Pages list must render page template provenance per row');
  assert(source.includes("'template_source'") && source.includes("'frontend_design_template_id'") && source.includes("'collection_dataset_slug'"), 'Pages CSV export must include template provenance columns');
  assert(source.includes('const templateInfo = pageTemplateInfo(page)') && source.includes('template: templateInfo') && source.includes("pageMetaString(page, 'frontendDesignTemplateId')") && source.includes("pageMetaRecord(page, 'collectionDataset')"), 'Pages handoff must expose starter, frontend-design, and dataset page provenance');
  assert(
      source.includes("key: 'member-login'") &&
      source.includes("key: 'member-account'") &&
      source.includes('data-testid={`pages-create-${shortcut.key}`}') &&
      source.includes("key: 'landing'") &&
      source.includes('landingPageTemplate') &&
      source.includes("key: 'storefront'") &&
      source.includes('storefrontPageTemplate') &&
      source.includes("key: 'contact'") &&
      source.includes('contactPageTemplate') &&
      source.includes("key: 'newsletter'") &&
      source.includes('newsletterPageTemplate') &&
      source.includes("key: 'survey'") &&
      source.includes('surveyPageTemplate') &&
      source.includes('memberLoginPageTemplate') &&
      source.includes('memberAccountPageTemplate') &&
      source.includes("key: 'product-detail'") &&
      source.includes('productDetailPageTemplate') &&
      source.includes("key: 'pricing'") &&
      source.includes('pricingPageTemplate') &&
      source.includes("key: 'services'") &&
      source.includes('servicesPageTemplate') &&
      source.includes("key: 'booking'") &&
      source.includes('bookingPageTemplate') &&
      source.includes("key: 'portfolio'") &&
      source.includes('portfolioPageTemplate') &&
      source.includes("key: 'gallery'") &&
      source.includes('galleryPageTemplate') &&
      source.includes("key: 'events'") &&
      source.includes('eventsPageTemplate') &&
      source.includes("key: 'privacy'") &&
      source.includes('privacyPageTemplate') &&
      source.includes("key: 'terms'") &&
      source.includes('termsPageTemplate') &&
      source.includes("key: 'cookie-policy'") &&
      source.includes('cookiePolicyPageTemplate') &&
      source.includes("key: 'accessibility-statement'") &&
      source.includes('accessibilityStatementPageTemplate') &&
      source.includes("key: 'refund-policy'") &&
      source.includes('refundPolicyPageTemplate') &&
      source.includes("key: 'shipping-policy'") &&
      source.includes('shippingPolicyPageTemplate') &&
      source.includes("key: 'cart'") &&
      source.includes('cartPageTemplate') &&
      source.includes("key: 'checkout'") &&
      source.includes('checkoutPageTemplate') &&
      source.includes("key: 'order-confirmation'") &&
      source.includes('orderConfirmationPageTemplate') &&
      source.includes("key: 'help-center'") &&
      source.includes('helpCenterPageTemplate') &&
      source.includes("key: 'faq'") &&
      source.includes('faqPageTemplate') &&
      source.includes("key: 'testimonials'") &&
      source.includes('testimonialsPageTemplate') &&
      source.includes("key: 'blog-index'") &&
      source.includes('blogIndexPageTemplate') &&
      source.includes("key: 'blog-post'") &&
      source.includes('blogPostPageTemplate') &&
      source.includes("key: 'team'") &&
      source.includes('teamPageTemplate') &&
      source.includes("key: 'careers'") &&
      source.includes('careersPageTemplate') &&
      source.includes("key: 'about'") &&
      source.includes('aboutPageTemplate'),
    'Pages list must expose the landing, contact, member, newsletter, survey, commerce, pricing, services, booking, portfolio, gallery, events, privacy, terms, cookie policy, accessibility statement, refund policy, shipping policy, help-center, FAQ, testimonials, blog, team, careers, and about starters and handoff routes',
  );
};

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
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(payload.error || payload).slice(0, 300)}`);
  }

  return payload;
};

const requestApiRaw = async (endpoint, options = {}) => {
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
  return { response, payload };
};

const getSite = async (siteId) => {
  const payload = await requestApi(`/api/admin/sites/${encodeURIComponent(siteId)}`);
  return payload.data?.site || payload.site;
};

const updateSite = async (siteId, input) => {
  const payload = await requestApi(`/api/admin/sites/${encodeURIComponent(siteId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return payload.data?.site || payload.site;
};

const listPages = async (siteId) => {
  const payload = await requestApi(`/api/admin/sites/${encodeURIComponent(siteId)}/pages?includeUnpublished=true`);
  return payload.data?.pages || payload.pages || [];
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
  const smokeMfaCode = process.env.BACKY_PAGES_LIST_SMOKE_MFA_CODE
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

const createUser = async (input) => {
  const payload = await requestApi('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const user = payload.data?.user || payload.user;
  assert(user?.id, `Create pages RBAC user did not return a user: ${JSON.stringify(payload).slice(0, 500)}`);
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

const assertPageBillingLimitEnforced = async (suffix) => {
  const site = await getSite(HIERARCHY_SITE_ID);
  const settings = await getSettings();
  const existingPages = await listPages(HIERARCHY_SITE_ID);
  const originalSettings = site.settings || {};
  const originalBillingQuota = originalSettings.billingQuota || {};
  const originalLimits = originalBillingQuota.limits || {};
  const originalIntegrations = settings.integrations || {};
  const originalCommerce = originalIntegrations.commerce || {};
  const blockedSlug = `blocked-page-limit-${suffix}`;

  await updateSettings({
    integrations: {
      ...originalIntegrations,
      commerce: {
        ...originalCommerce,
        overageMode: 'block',
      },
    },
  });
  await updateSite(HIERARCHY_SITE_ID, {
    settings: {
      ...originalSettings,
      billingQuota: {
        ...originalBillingQuota,
        limits: {
          ...originalLimits,
          pages: existingPages.length,
        },
      },
    },
  });

  try {
    const { response, payload } = await requestApiRaw(`/api/admin/sites/${encodeURIComponent(HIERARCHY_SITE_ID)}/pages`, {
      method: 'POST',
      body: JSON.stringify({
        title: `Blocked Page Limit ${suffix}`,
        slug: blockedSlug,
        status: 'draft',
        description: 'Temporary page that should be blocked by billing quota.',
        content: [],
      }),
    });

    assert(response.status === 402, `Billing page limit should reject page creation, got ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
    assert(payload?.error?.code === 'BILLING_PAGE_LIMIT', `Billing page limit should return BILLING_PAGE_LIMIT: ${JSON.stringify(payload).slice(0, 500)}`);
    const afterPages = await listPages(HIERARCHY_SITE_ID);
    assert(!afterPages.some((page) => page.slug === blockedSlug), 'Billing-limited page creation unexpectedly persisted a page.');
  } finally {
    await updateSite(HIERARCHY_SITE_ID, { settings: originalSettings });
    await updateSettings({ integrations: originalIntegrations });
  }
};

const deleteUser = async (userId) => {
  if (!userId) return;
  await requestApi(`/api/admin/users/${userId}`, { method: 'DELETE' });
};

const createHierarchyPages = async () => {
  const suffix = Date.now().toString(36);
  const parentTitle = `Smoke Hierarchy Parent ${suffix}`;
  const childTitle = `Smoke Hierarchy Child ${suffix}`;
  const parentSlug = `smoke-hierarchy-parent-${suffix}`;
  const childSlug = `smoke-hierarchy-child-${suffix}`;
  const parentPayload = await requestApi(`/api/admin/sites/${HIERARCHY_SITE_ID}/pages`, {
    method: 'POST',
    body: JSON.stringify({
      title: parentTitle,
      slug: parentSlug,
      status: 'published',
      description: 'Temporary parent page for pages list hierarchy smoke.',
      content: [],
      meta: {
        title: parentTitle,
        description: 'Temporary parent page for pages list hierarchy smoke.',
        canonical: `/${parentSlug}`,
        template: 'landing',
      },
    }),
  });
  const parentPage = parentPayload.data.page;
  const childPayload = await requestApi(`/api/admin/sites/${HIERARCHY_SITE_ID}/pages`, {
    method: 'POST',
    body: JSON.stringify({
      title: childTitle,
      slug: childSlug,
      status: 'draft',
      parentId: parentPage.id,
      description: 'Temporary child page for pages list hierarchy smoke.',
      content: [],
      meta: {
        title: childTitle,
        description: 'Temporary child page for pages list hierarchy smoke.',
        canonical: `/${childSlug}`,
        parentPageId: parentPage.id,
        parentPageTitle: parentPage.title,
        navigationPlacement: 'primary',
        navigationLabel: 'Smoke Child Link',
        template: 'about',
      },
    }),
  });
  await requestApi(`/api/admin/sites/${HIERARCHY_SITE_ID}/pages/${childPayload.data.page.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: childTitle,
      slug: childSlug,
      status: 'draft',
      description: 'Temporary child page with a saved revision for pages list smoke.',
      revisionNote: 'Pages list revision smoke snapshot',
    }),
  });

  return { parentPage, childPage: childPayload.data.page };
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

const captureScreenshot = async (client, screenshotPath) => {
  const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  return screenshotPath;
};

const assertPagesVisualState = async (client, label, screenshotPath, options = {}) => {
  const state = await evaluate(client, `(() => {
    const expectedText = ${JSON.stringify(options.expectedText || '')};
    const bodyText = document.body?.innerText || '';
    const tableRows = Array.from(document.querySelectorAll('tbody tr'));
    const modal = document.querySelector('[data-testid="pages-bulk-publish-modal"]');
    const deliveryPanels = Array.from(document.querySelectorAll('[data-testid^="pages-delivery-"]'));
    const commandCenter = document.querySelector('[data-testid="pages-command-center"]');
    const bindingContract = document.querySelector('[data-testid="pages-binding-contract"]');
    const commandRect = commandCenter?.getBoundingClientRect();
    const searchableText = [
      bodyText,
      modal?.textContent || '',
      ...tableRows.map((row) => row.textContent || ''),
      ...deliveryPanels.map((panel) => panel.textContent || ''),
      bindingContract?.textContent || '',
    ].join('\\n');
    return {
      label: ${JSON.stringify(label)},
      ready: Boolean(commandCenter),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      commandCenterVisible: Boolean(commandRect && commandRect.width > 300 && commandRect.height > 120),
      tableRowCount: tableRows.length,
      emptyCreateVisible: Boolean(document.querySelector('[data-testid="pages-empty-create"]')),
      bindingContractVisible: Boolean(bindingContract) && bindingContract.textContent.includes('Page data-binding contract') && bindingContract.textContent.includes('Collection repeaters'),
      modalOpen: Boolean(modal),
      modalText: modal?.textContent || '',
      hasExpectedText: expectedText ? searchableText.includes(expectedText) : true,
      hasFrameworkOverlay: /Failed to compile|Unhandled Runtime Error|Vite Error|Internal Server Error/i.test(bodyText),
      body: bodyText.slice(0, 4000),
    };
  })()`);

  assert(state.ready && state.commandCenterVisible, `${label} pages command center was not visibly rendered: ${JSON.stringify(state)}`);
  assert(state.bindingContractVisible, `${label} did not render the page data-binding contract: ${JSON.stringify(state)}`);
  assert(state.horizontalOverflow <= 4, `${label} has horizontal overflow: ${JSON.stringify(state)}`);
  assert(!state.hasFrameworkOverlay, `${label} rendered a framework/runtime overlay: ${JSON.stringify(state)}`);

  if (options.empty) {
    assert(state.emptyCreateVisible && state.body.includes('Create a page for this site.') && state.body.includes('New Page'), `${label} did not render the empty state controls: ${JSON.stringify(state)}`);
  }

  if (options.table) {
    assert(state.tableRowCount >= 1 && state.body.includes('Page library'), `${label} did not render a populated page table: ${JSON.stringify(state)}`);
  }

  if (options.expectedText) {
    assert(state.hasExpectedText, `${label} did not include expected text "${options.expectedText}": ${JSON.stringify(state)}`);
  }

  if (options.modal) {
    assert(state.modalOpen && state.modalText.includes('Publish 1 selected page?'), `${label} did not render the bulk publish modal: ${JSON.stringify(state)}`);
  }

  await captureScreenshot(client, screenshotPath);
  return { ...state, screenshotPath };
};

const waitForPagesEmptyState = async (client) => {
  const url = `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(EMPTY_SITE_ID)}`;
  await client.send('Page.navigate', { url });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const emptyCreate = document.querySelector('[data-testid="pages-empty-create"]');
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        loading: document.body?.innerText?.includes('Loading pages from backend...') || false,
        emptyCreate: Boolean(emptyCreate),
        emptyCreateTag: emptyCreate?.tagName || null,
        emptyCreateHref: emptyCreate?.getAttribute('href') || '',
        selectValue: document.querySelector('#pages-active-site')?.value || '',
        body: document.body?.innerText?.slice(0, 500) || '',
      };
    })()`);

    if (
      state.ready
      && !state.loading
      && state.emptyCreate
      && state.emptyCreateTag === 'A'
      && state.emptyCreateHref.includes('/pages/new')
      && state.emptyCreateHref.includes(`siteId=${encodeURIComponent(EMPTY_SITE_ID)}`)
      && state.selectValue === EMPTY_SITE_ID
    ) {
      return { url, state };
    }

    if (attempt === 99) {
      throw new Error(`Pages empty state did not render expected create link: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const clickEmptyCreate = async (client, testId, expectedSearch, expectedCreate = {}) => {
  const clicked = await evaluate(client, `(() => {
    const link = document.querySelector('[data-testid="${testId}"]');
    if (!(link instanceof HTMLAnchorElement)) {
      return { clicked: false, tag: link?.tagName || null, href: link?.getAttribute('href') || null };
    }
    link.click();
    return { clicked: true, href: link.href };
  })()`);
  assert(clicked.clicked, `Unable to click ${testId}: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      path: window.location.pathname,
      search: window.location.search,
      ready: Boolean(document.querySelector('[data-testid="page-creation-command-center"]')),
      targetSite: document.querySelector('#page-target-site')?.value || '',
      title: document.querySelector('#page-title')?.value || '',
      slug: document.querySelector('#page-slug')?.value || '',
      template: document.querySelector('input[name="template"]:checked')?.value || '',
      homepage: document.querySelector('#page-basics input[type="checkbox"]')?.checked ?? false,
      createButton: Boolean(Array.from(document.querySelectorAll('button')).find((candidate) => (candidate.textContent || '').includes('Create Page'))),
      createDisabled: Array.from(document.querySelectorAll('button')).find((candidate) => (candidate.textContent || '').includes('Create Page'))?.disabled ?? null,
      body: document.body?.innerText?.slice(0, 300) || '',
    }))()`);

    if (
      state.path === '/pages/new'
      && state.search.includes(`siteId=${encodeURIComponent(EMPTY_SITE_ID)}`)
      && expectedSearch.every((fragment) => state.search.includes(fragment))
      && state.ready
      && state.targetSite === EMPTY_SITE_ID
      && (!expectedCreate.title || state.title === expectedCreate.title)
      && (!expectedCreate.slug || state.slug === expectedCreate.slug)
      && (!expectedCreate.template || state.template === expectedCreate.template)
      && (typeof expectedCreate.homepage !== 'boolean' || state.homepage === expectedCreate.homepage)
      && state.createButton
      && (expectedCreate.allowDisabled === true || state.createDisabled === false)
    ) {
      return { clicked, state };
    }

    if (attempt === 79) {
      throw new Error(`${testId} did not navigate to a usable page create workspace: ${JSON.stringify({ state, expectedCreate })}`);
    }

    await sleep(250);
  }

  return null;
};

const waitForHierarchyRow = async (client, page, expectedText, expectedSearch = page.title) => {
  const url = `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}&q=${encodeURIComponent(expectedSearch)}`;
  await client.send('Page.navigate', { url });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const hierarchy = document.querySelector('[data-testid="pages-hierarchy-${page.id}"]');
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        hierarchyText: hierarchy?.textContent || '',
        body: document.body?.innerText?.slice(0, 700) || '',
      };
    })()`);

    if (
      state.ready
      && state.hierarchyText.includes(expectedText)
    ) {
      return { url, state };
    }

    if (attempt === 99) {
      throw new Error(`Hierarchy row did not render expected text "${expectedText}": ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const waitForTemplateRow = async (client, page, expectedText, expectedSearch = page.title) => {
  const url = `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}&q=${encodeURIComponent(expectedSearch)}`;
  await client.send('Page.navigate', { url });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const template = document.querySelector('[data-testid="pages-template-${page.id}"]');
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        templateText: template?.textContent || '',
        body: document.body?.innerText?.slice(0, 700) || '',
      };
    })()`);

    if (
      state.ready
      && state.templateText.includes(expectedText)
    ) {
      return { url, state };
    }

    if (attempt === 99) {
      throw new Error(`Template row did not render expected text "${expectedText}": ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const waitForRevisionRow = async (client, page, expectedText, expectedSearch = page.title) => {
  const url = `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}&q=${encodeURIComponent(expectedSearch)}`;
  await client.send('Page.navigate', { url });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const revisions = document.querySelector('[data-testid="pages-revisions-${page.id}"]');
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        revisionsText: revisions?.textContent || '',
        body: document.body?.innerText?.slice(0, 700) || '',
      };
    })()`);

    if (
      state.ready
      && state.revisionsText.includes(expectedText)
    ) {
      return { url, state };
    }

    if (attempt === 99) {
      throw new Error(`Revision row did not render expected text "${expectedText}": ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const waitForRouteRow = async (client, page, expectedText, expectedSearch = page.title) => {
  const url = `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}&q=${encodeURIComponent(expectedSearch)}`;
  await client.send('Page.navigate', { url });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const route = document.querySelector('[data-testid="pages-route-${page.id}"]');
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        routeText: route?.textContent || '',
        body: document.body?.innerText?.slice(0, 700) || '',
      };
    })()`);

    if (
      state.ready
      && state.routeText.includes(expectedText)
    ) {
      return { url, state };
    }

    if (attempt === 99) {
      throw new Error(`Route row did not render expected text "${expectedText}": ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const waitForDeliveryRow = async (client, page, expectedText, expectedSearch = page.title) => {
  const url = `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}&q=${encodeURIComponent(expectedSearch)}`;
  await client.send('Page.navigate', { url });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const delivery = document.querySelector('[data-testid="pages-delivery-${page.id}"]');
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        deliveryText: delivery?.textContent || '',
        renderLink: delivery?.querySelector('a[href*="/render?path="]')?.getAttribute('href') || '',
        resolveLink: delivery?.querySelector('a[href*="/resolve?path="]')?.getAttribute('href') || '',
        body: document.body?.innerText?.slice(0, 700) || '',
      };
    })()`);

    if (
      state.ready
      && state.deliveryText.includes(expectedText)
      && state.renderLink.includes('/api/sites/')
      && state.resolveLink.includes('/api/sites/')
    ) {
      return { url, state };
    }

    if (attempt === 99) {
      throw new Error(`Delivery row did not render expected text "${expectedText}": ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const assertDeliveryRefreshControl = async (client, page, expectedSearch = page.title) => {
  const url = `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}&q=${encodeURIComponent(expectedSearch)}`;
  await client.send('Page.navigate', { url });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const globalRefresh = document.querySelector('[data-testid="pages-refresh-delivery-health"]');
      const rowRefresh = document.querySelector('[data-testid="pages-delivery-refresh-${page.id}"]');
      const delivery = document.querySelector('[data-testid="pages-delivery-${page.id}"]');
      const history = document.querySelector('[data-testid="pages-delivery-history-${page.id}"]');
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        globalRefresh: Boolean(globalRefresh),
        globalDisabled: globalRefresh?.disabled === true,
        rowRefresh: Boolean(rowRefresh),
        rowDisabled: rowRefresh?.disabled === true,
        deliveryText: delivery?.textContent || '',
        historyText: history?.textContent || '',
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`);

    if (
      state.ready
      && state.globalRefresh
      && !state.globalDisabled
      && state.rowRefresh
      && !state.rowDisabled
      && state.deliveryText.includes('Health')
    ) {
      const clicked = await evaluate(client, `(() => {
        const rowRefresh = document.querySelector('[data-testid="pages-delivery-refresh-${page.id}"]');
        rowRefresh?.click();
        return { clicked: Boolean(rowRefresh) };
      })()`);
      assert(clicked.clicked, `Unable to click delivery refresh: ${JSON.stringify(clicked)}`);

      let lastRefreshState = null;
      for (let refreshAttempt = 0; refreshAttempt < 100; refreshAttempt += 1) {
        const refreshed = await evaluate(client, `(() => {
          const rowRefresh = document.querySelector('[data-testid="pages-delivery-refresh-${page.id}"]');
          const delivery = document.querySelector('[data-testid="pages-delivery-${page.id}"]');
          const history = document.querySelector('[data-testid="pages-delivery-history-${page.id}"]');
          return {
            rowDisabled: rowRefresh?.disabled === true,
            deliveryText: delivery?.textContent || '',
            historyText: history?.textContent || '',
          };
        })()`);
        lastRefreshState = refreshed;

        if (
          !refreshed.rowDisabled
          && refreshed.deliveryText.includes('Health')
          && refreshed.deliveryText.includes('Recent probes')
          && refreshed.historyText.includes('public')
          && refreshed.historyText.includes('render')
          && refreshed.historyText.includes('resolve')
          && !refreshed.deliveryText.includes('Refreshing public, render, and resolve endpoint health.')
        ) {
          return { url, state, clicked, refreshed };
        }

        await sleep(250);
      }

      throw new Error(`Delivery refresh control did not finish refreshing: ${JSON.stringify(lastRefreshState)}`);
    }

    if (attempt === 99) {
      throw new Error(`Delivery refresh controls did not render: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const assertPublishReviewModal = async (client, page, expectedSearch = page.title) => {
  const url = `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}&q=${encodeURIComponent(expectedSearch)}`;
  await client.send('Page.navigate', { url });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const button = document.querySelector('[data-testid="pages-publish-${page.id}"]');
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        hasButton: Boolean(button),
        disabled: button?.disabled === true,
        body: document.body?.innerText?.slice(0, 700) || '',
      };
    })()`);

    if (state.ready && state.hasButton && !state.disabled) {
      break;
    }

    if (attempt === 99) {
      throw new Error(`Publish button was not ready for review modal: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  const opened = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="pages-publish-${page.id}"]');
    button?.click();
    const modal = document.querySelector('[data-testid="pages-publish-modal"]');
    return {
      clicked: Boolean(button),
      modalText: modal?.textContent || '',
      confirm: Boolean(document.querySelector('[data-testid="pages-publish-confirm"]')),
      cancel: Boolean(document.querySelector('[data-testid="pages-publish-cancel"]')),
    };
  })()`);

  assert(opened.clicked, `Unable to click publish button: ${JSON.stringify(opened)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const modal = document.querySelector('[data-testid="pages-publish-modal"]');
      return {
        modalText: modal?.textContent || '',
        confirm: Boolean(document.querySelector('[data-testid="pages-publish-confirm"]')),
        cancel: Boolean(document.querySelector('[data-testid="pages-publish-cancel"]')),
      };
    })()`);

    if (
      state.modalText.includes(`Publish ${page.title}?`)
      && state.modalText.includes('Render API')
      && state.modalText.includes('Resolve API')
      && state.confirm
      && state.cancel
    ) {
      await evaluate(client, `(() => {
        document.querySelector('[data-testid="pages-publish-cancel"]')?.click();
      })()`);
      for (let cancelAttempt = 0; cancelAttempt < 40; cancelAttempt += 1) {
        const cancelled = await evaluate(client, `(() => !document.querySelector('[data-testid="pages-publish-modal"]'))()`);
        if (cancelled) {
          return { url, opened, state, cancelled };
        }
        await sleep(100);
      }

      throw new Error('Publish review modal did not close after cancel.');
    }

    if (attempt === 79) {
      throw new Error(`Publish review modal did not render expected details: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const clearVisibleBulkSelection = async (client) => evaluate(client, `(() => {
  const setSelectValue = (select, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    descriptor?.set?.call(select, value);
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const checkboxes = [...document.querySelectorAll('input[type="checkbox"]')]
    .filter((input) => input.getAttribute('aria-label')?.startsWith('Select '));
  checkboxes.forEach((checkbox) => {
    if (checkbox.checked) {
      checkbox.click();
    }
  });

  const select = document.querySelector('[data-testid="pages-bulk-action-select"]');
  if (select) {
    setSelectValue(select, '');
  }

  return {
    clearedVisible: checkboxes.length,
    selectedVisible: checkboxes.filter((checkbox) => checkbox.checked).length,
    selectValue: select?.value || '',
  };
})()`);

const assertBulkPublishReviewModal = async (client, page, expectedSearch = page.title, screenshotPath = null) => {
  const url = `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}&q=${encodeURIComponent(expectedSearch)}`;
  await client.send('Page.navigate', { url });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const checkbox = document.querySelector('[data-testid="pages-select-${page.id}"]');
      const select = document.querySelector('[data-testid="pages-bulk-action-select"]');
      const row = [...document.querySelectorAll('tr')]
        .find((candidate) => (candidate.textContent || '').includes(${JSON.stringify(page.title)}));
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        checkbox: Boolean(checkbox),
        checked: checkbox?.checked === true,
        checkboxDisabled: checkbox?.disabled === true,
        select: Boolean(select),
        selectDisabled: select?.disabled === true,
        rowText: row?.textContent || '',
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`);

    if (
      state.ready &&
      state.checkbox &&
      !state.checkboxDisabled &&
      state.select &&
      !state.selectDisabled &&
      state.rowText.includes(page.title)
    ) {
      break;
    }

    if (attempt === 99) {
      throw new Error(`Bulk publish controls were not ready: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  await clearVisibleBulkSelection(client);

  let prepared = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    prepared = await evaluate(client, `(() => {
      const setSelectValue = (select, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        descriptor?.set?.call(select, value);
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const checkbox = document.querySelector('[data-testid="pages-select-${page.id}"]');
      const select = document.querySelector('[data-testid="pages-bulk-action-select"]');
      const row = [...document.querySelectorAll('tr')]
        .find((candidate) => (candidate.textContent || '').includes(${JSON.stringify(page.title)}));
      if (checkbox instanceof HTMLInputElement && !checkbox.checked && !checkbox.disabled) {
        checkbox.click();
      }
      if (select instanceof HTMLSelectElement && select.value !== 'publish' && !select.disabled) {
        setSelectValue(select, 'publish');
      }

      return {
        prepared: Boolean(checkbox && select),
        checked: checkbox instanceof HTMLInputElement ? checkbox.checked : false,
        checkboxDisabled: checkbox instanceof HTMLInputElement ? checkbox.disabled : null,
        selectValue: select instanceof HTMLSelectElement ? select.value : '',
        selectDisabled: select instanceof HTMLSelectElement ? select.disabled : null,
        applyText: document.querySelector('[data-testid="pages-bulk-action-apply"]')?.textContent || '',
        selectedText: document.body?.innerText?.match(/\\d+ selected/)?.[0] || '',
        rowText: row?.textContent || '',
      };
    })()`);
    if (prepared.prepared && prepared.checked && prepared.selectValue === 'publish' && prepared.rowText.includes(page.title)) {
      break;
    }
    await sleep(250);
  }

  assert(prepared?.prepared && prepared.checked && prepared.selectValue === 'publish', `Unable to prepare bulk publish controls: ${JSON.stringify(prepared)}`);

  let openedState = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const opened = await evaluate(client, `(() => {
      const setSelectValue = (select, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        descriptor?.set?.call(select, value);
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const modal = document.querySelector('[data-testid="pages-bulk-publish-modal"]');
      const applyButton = modal ? null : document.querySelector('[data-testid="pages-bulk-action-apply"]');
      const select = document.querySelector('[data-testid="pages-bulk-action-select"]');
      if (!modal && select instanceof HTMLSelectElement && select.value !== 'publish') {
        setSelectValue(select, 'publish');
      }
      if (!modal && applyButton && !applyButton.disabled) {
        applyButton.click();
      }
      return {
        hasButton: Boolean(applyButton || modal),
        disabled: applyButton?.disabled === true,
        buttonText: applyButton?.textContent || '',
        selectValue: select instanceof HTMLSelectElement ? select.value : '',
        modalText: modal?.textContent || document.querySelector('[data-testid="pages-bulk-publish-modal"]')?.textContent || '',
      };
    })()`);

    if (opened.hasButton && !opened.disabled) {
      openedState = opened;
      break;
    }

    if (attempt === 79) {
      throw new Error(`Bulk publish apply button was not ready: ${JSON.stringify(opened)}`);
    }

    await sleep(250);
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const modal = document.querySelector('[data-testid="pages-bulk-publish-modal"]');
      return {
        modalText: modal?.textContent || '',
        cancel: [...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Cancel'),
        confirm: [...document.querySelectorAll('button')].some((button) => button.textContent.includes('Publish 1 page')),
      };
    })()`);

    if (
      state.modalText.includes('Publish 1 selected page?')
      && state.modalText.includes(page.title)
      && state.cancel
      && state.confirm
    ) {
      const visualState = screenshotPath
        ? await assertPagesVisualState(client, 'bulk publish review modal', screenshotPath, {
          modal: true,
          expectedText: page.title,
        })
        : null;
      await evaluate(client, `(() => {
        [...document.querySelectorAll('button')]
          .find((button) => button.textContent.trim() === 'Cancel')
          ?.click();
      })()`);
      for (let cancelAttempt = 0; cancelAttempt < 40; cancelAttempt += 1) {
        const cancelled = await evaluate(client, `(() => !document.querySelector('[data-testid="pages-bulk-publish-modal"]'))()`);
        if (cancelled) {
          const cleared = await clearVisibleBulkSelection(client);
          return { url, prepared, opened: openedState, state, visualState, cleared };
        }
        await sleep(100);
      }

      throw new Error('Bulk publish review modal did not close after cancel.');
    }

    if (attempt === 79) {
      throw new Error(`Bulk publish review modal did not render expected details: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const assertBulkPublishMutation = async (client, page, expectedSearch = page.title) => {
  const url = `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}&q=${encodeURIComponent(expectedSearch)}`;
  const beforePage = await requestApi(`/api/admin/sites/${HIERARCHY_SITE_ID}/pages/${page.id}`);
  const expectedUpdatedAt = beforePage.data?.page?.updatedAt;
  assert(expectedUpdatedAt, `Bulk publish page did not expose updatedAt before mutation: ${JSON.stringify(beforePage.data?.page).slice(0, 500)}`);
  await client.send('Page.navigate', { url });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const checkbox = document.querySelector('[data-testid="pages-select-${page.id}"]');
      const row = [...document.querySelectorAll('tr')]
        .find((candidate) => (candidate.textContent || '').includes(${JSON.stringify(page.title)}));
      const select = document.querySelector('[data-testid="pages-bulk-action-select"]');
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        checkbox: Boolean(checkbox),
        checkboxDisabled: checkbox?.disabled === true,
        rowText: row?.textContent || '',
        select: Boolean(select),
        selectDisabled: select?.disabled === true,
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`);

    if (
      state.ready
      && state.checkbox
      && !state.checkboxDisabled
      && state.select
      && !state.selectDisabled
      && state.rowText.includes('Draft')
    ) {
      break;
    }

    if (attempt === 99) {
      throw new Error(`Bulk publish mutation controls were not ready for draft page: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  await clearVisibleBulkSelection(client);

  let prepared = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    prepared = await evaluate(client, `(() => {
      const setSelectValue = (select, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        descriptor?.set?.call(select, value);
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const checkbox = document.querySelector('[data-testid="pages-select-${page.id}"]');
      const select = document.querySelector('[data-testid="pages-bulk-action-select"]');
      const row = [...document.querySelectorAll('tr')]
        .find((candidate) => (candidate.textContent || '').includes(${JSON.stringify(page.title)}));
      if (checkbox instanceof HTMLInputElement && !checkbox.checked && !checkbox.disabled) {
        checkbox.click();
      }
      if (select instanceof HTMLSelectElement && select.value !== 'publish' && !select.disabled) {
        setSelectValue(select, 'publish');
      }

      return {
        prepared: Boolean(checkbox && select),
        checked: checkbox instanceof HTMLInputElement ? checkbox.checked : false,
        checkboxDisabled: checkbox instanceof HTMLInputElement ? checkbox.disabled : null,
        selectValue: select instanceof HTMLSelectElement ? select.value : '',
        selectDisabled: select instanceof HTMLSelectElement ? select.disabled : null,
        applyText: document.querySelector('[data-testid="pages-bulk-action-apply"]')?.textContent || '',
        selectedText: document.body?.innerText?.match(/\\d+ selected/)?.[0] || '',
        rowText: row?.textContent || '',
      };
    })()`);
    if (prepared.prepared && prepared.checked && prepared.selectValue === 'publish' && prepared.rowText.includes(page.title)) {
      break;
    }
    await sleep(250);
  }
  assert(prepared?.prepared && prepared.checked && prepared.selectValue === 'publish', `Unable to prepare bulk publish mutation controls: ${JSON.stringify(prepared)}`);

  const captureInstalled = await evaluate(client, `(() => {
    window.__backyPagesListPublishBodies = [];
    if (!window.__backyOriginalFetchForPagesListPublish) {
      window.__backyOriginalFetchForPagesListPublish = window.fetch.bind(window);
      window.fetch = async (input, init = {}) => {
        const url = String(input instanceof Request ? input.url : input || '');
        const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
        if (method === 'POST' && url.includes(${JSON.stringify(`/api/admin/sites/${HIERARCHY_SITE_ID}/pages/${page.id}/publish`)})) {
          let body = init?.body || '';
          if (typeof body !== 'string') {
            body = String(body || '');
          }
          let parsed = null;
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = body;
          }
          window.__backyPagesListPublishBodies.push({ url, method, body: parsed });
        }
        return window.__backyOriginalFetchForPagesListPublish(input, init);
      };
    }
    return true;
  })()`);
  assert(captureInstalled, 'Unable to install pages list publish request capture');

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const opened = await evaluate(client, `(() => {
      const setSelectValue = (select, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        descriptor?.set?.call(select, value);
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const modal = document.querySelector('[data-testid="pages-bulk-publish-modal"]');
      const applyButton = modal ? null : document.querySelector('[data-testid="pages-bulk-action-apply"]');
      const select = document.querySelector('[data-testid="pages-bulk-action-select"]');
      if (!modal && select instanceof HTMLSelectElement && select.value !== 'publish') {
        setSelectValue(select, 'publish');
      }
      if (!modal && applyButton && !applyButton.disabled) {
        applyButton.click();
      }
      return {
        hasButton: Boolean(applyButton || modal),
        disabled: applyButton?.disabled === true,
        buttonText: applyButton?.textContent || '',
        selectValue: select instanceof HTMLSelectElement ? select.value : '',
        modalText: modal?.textContent || document.querySelector('[data-testid="pages-bulk-publish-modal"]')?.textContent || '',
      };
    })()`);

    if (opened.modalText.includes('Publish 1 selected page?') && opened.modalText.includes(page.title)) {
      break;
    }

    if (attempt === 79) {
      throw new Error(`Bulk publish mutation modal did not open: ${JSON.stringify(opened)}`);
    }

    await sleep(250);
  }

  const confirmed = await evaluate(client, `(() => {
    const modal = document.querySelector('[data-testid="pages-bulk-publish-modal"]');
    const button = [...document.querySelectorAll('button')]
      .find((candidate) => candidate.textContent.includes('Publish 1 page'));
    if (button && !button.disabled) {
      button.click();
    }
    return {
      modalText: modal?.textContent || '',
      clicked: Boolean(button),
      disabled: button?.disabled === true,
    };
  })()`);
  assert(confirmed.clicked && !confirmed.disabled, `Unable to confirm bulk publish mutation: ${JSON.stringify(confirmed)}`);

  let uiState = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    uiState = await evaluate(client, `(() => {
      const row = [...document.querySelectorAll('tr')]
        .find((candidate) => (candidate.textContent || '').includes(${JSON.stringify(page.title)}));
      return {
        modalOpen: Boolean(document.querySelector('[data-testid="pages-bulk-publish-modal"]')),
        notice: document.body?.innerText?.includes('1 page published.') || false,
        rowText: row?.textContent || '',
        selectedText: [...document.querySelectorAll('input[type="checkbox"]')]
          .filter((input) => input.getAttribute('aria-label')?.startsWith('Select ') && input.checked)
          .length,
        bulkSelectValue: document.querySelector('[data-testid="pages-bulk-action-select"]')?.value || '',
      };
    })()`);

    if (
      !uiState.modalOpen
      && uiState.notice
      && uiState.rowText.includes('Published')
      && uiState.selectedText === 0
      && uiState.bulkSelectValue === ''
    ) {
      break;
    }

    if (attempt === 119) {
      throw new Error(`Bulk publish mutation did not update the UI: ${JSON.stringify(uiState)}`);
    }

    await sleep(250);
  }

  const apiPage = await requestApi(`/api/admin/sites/${HIERARCHY_SITE_ID}/pages/${page.id}`);
  const status = apiPage.data?.page?.status;
  assert(status === 'published', `Bulk publish mutation did not persist published status: ${JSON.stringify(apiPage.data?.page)}`);
  const capturedBodies = await evaluate(client, `window.__backyPagesListPublishBodies || []`);
  const publishBody = capturedBodies.find((entry) => entry?.body && Object.prototype.hasOwnProperty.call(entry.body, 'expectedUpdatedAt'));
  assert(
    publishBody?.body?.expectedUpdatedAt === expectedUpdatedAt,
    `Bulk publish mutation did not send expectedUpdatedAt guard: ${JSON.stringify(capturedBodies).slice(0, 500)}`,
  );

  return {
    url,
    prepared,
    confirmed,
    uiState,
    api: {
      pageId: page.id,
      status,
      publishedAt: apiPage.data?.page?.publishedAt || null,
      expectedUpdatedAt: publishBody.body.expectedUpdatedAt,
    },
  };
};

const assertViewerRbac = async (client, viewerSession, page) => {
  await client.send('Page.addScriptToEvaluateOnNewDocument', {
    source: authStorageScript(viewerSession.session.token, viewerSession.user),
  });
  await client.send('Runtime.evaluate', {
    expression: authStorageScript(viewerSession.session.token, viewerSession.user),
    awaitPromise: true,
  });
  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}/pages?siteId=${encodeURIComponent(HIERARCHY_SITE_ID)}` });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
      hasRow: document.body?.innerText?.includes(${JSON.stringify(page.title)}) || false,
      path: window.location.pathname,
      body: document.body?.innerText?.slice(0, 900) || '',
    }))()`);
    if (state.ready && state.hasRow && state.path === '/pages') {
      break;
    }
    if (attempt === 79) {
      throw new Error(`Viewer pages RBAC pass did not load page list: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  const state = await evaluate(client, `(() => {
    const disabledState = (selector) => {
      const nodes = Array.from(document.querySelectorAll(selector));
      return {
        count: nodes.length,
        disabled: nodes.every((node) => (
          node instanceof HTMLButtonElement || node instanceof HTMLSelectElement || node instanceof HTMLInputElement
            ? node.disabled
            : node.getAttribute('aria-disabled') === 'true'
        )),
      };
    };
    const pageId = ${JSON.stringify(page.id)};
    return {
      headerCreateDisabled: document.querySelector('[data-testid="pages-header-create"]')?.getAttribute('aria-disabled') === 'true',
      shortcutLinksDisabled: disabledState('[data-testid^="pages-create-"]'),
      bulkSelectDisabled: document.querySelector('[data-testid="pages-bulk-action-select"]')?.disabled === true,
      bulkApplyDisabled: document.querySelector('[data-testid="pages-bulk-action-apply"]')?.disabled === true,
      rowCheckboxesDisabled: disabledState('input[aria-label^="Select "]'),
      publishDisabled: disabledState('[data-testid^="pages-publish-"]'),
      unpublishDisabled: disabledState('[data-testid^="pages-unpublish-"]'),
      archiveDisabled: disabledState('[data-testid^="pages-archive-"]'),
      previewDisabled: disabledState('[data-testid^="pages-preview-"]'),
      editDisabled: disabledState('[data-testid^="pages-edit-"]'),
      deleteDisabled: disabledState('[data-testid^="pages-delete-"]'),
      deliveryRefreshAvailable: document.querySelector('[data-testid="pages-delivery-refresh-' + CSS.escape(pageId) + '"]')?.disabled === false,
      body: document.body?.innerText?.slice(0, 1000) || '',
    };
  })()`);

  assert(state.headerCreateDisabled, `Viewer pages page left header create enabled: ${JSON.stringify(state)}`);
  assert(state.shortcutLinksDisabled.count > 0 && state.shortcutLinksDisabled.disabled, `Viewer pages page left create shortcuts enabled: ${JSON.stringify(state)}`);
  assert(state.bulkSelectDisabled && state.bulkApplyDisabled, `Viewer pages page left bulk controls enabled: ${JSON.stringify(state)}`);
  assert(state.rowCheckboxesDisabled.count > 0 && state.rowCheckboxesDisabled.disabled, `Viewer pages page left row selection enabled: ${JSON.stringify(state)}`);
  assert(state.publishDisabled.disabled, `Viewer pages page left publish controls enabled: ${JSON.stringify(state)}`);
  assert(state.unpublishDisabled.count > 0 && state.unpublishDisabled.disabled, `Viewer pages page left unpublish controls enabled: ${JSON.stringify(state)}`);
  assert(state.archiveDisabled.count > 0 && state.archiveDisabled.disabled, `Viewer pages page left archive controls enabled: ${JSON.stringify(state)}`);
  assert(state.previewDisabled.count > 0 && state.previewDisabled.disabled, `Viewer pages page left preview controls enabled: ${JSON.stringify(state)}`);
  assert(state.editDisabled.count > 0 && state.editDisabled.disabled, `Viewer pages page left edit controls enabled: ${JSON.stringify(state)}`);
  assert(state.deleteDisabled.count > 0 && state.deleteDisabled.disabled, `Viewer pages page left delete controls enabled: ${JSON.stringify(state)}`);
  assert(state.deliveryRefreshAvailable, `Viewer pages page should keep read-only delivery refresh available: ${JSON.stringify(state)}`);

  return state;
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-pages-list-${Date.now()}`);
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

const cleanup = async ({ client, childProcess, userDataDir, hierarchyPages, viewerUserId }) => {
  if (hierarchyPages?.childPage?.id) {
    try {
      await requestApi(`/api/admin/sites/${HIERARCHY_SITE_ID}/pages/${hierarchyPages.childPage.id}`, { method: 'DELETE' });
    } catch (error) {
      console.warn(`Unable to delete smoke child page ${hierarchyPages.childPage.id}:`, error instanceof Error ? error.message : error);
    }
  }

  if (hierarchyPages?.parentPage?.id) {
    try {
      await requestApi(`/api/admin/sites/${HIERARCHY_SITE_ID}/pages/${hierarchyPages.parentPage.id}`, { method: 'DELETE' });
    } catch (error) {
      console.warn(`Unable to delete smoke parent page ${hierarchyPages.parentPage.id}:`, error instanceof Error ? error.message : error);
    }
  }

  if (viewerUserId) {
    try {
      await deleteUser(viewerUserId);
    } catch (error) {
      console.warn(`Unable to delete smoke viewer user ${viewerUserId}:`, error instanceof Error ? error.message : error);
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
  assertPagesListSourceContract();
  if (process.env.BACKY_PAGES_LIST_SOURCE_ONLY === '1') {
    console.log(JSON.stringify({ ok: true, guard: 'pages-list-source' }));
    return;
  }
  await loginAdminApi();
  const { childProcess, userDataDir } = launchChrome();
  let client;
  let hierarchyPages = null;
  let viewerUserId = null;
  const suffix = Date.now().toString(36);

  try {
    const viewer = await createUser({
      fullName: `Pages Viewer ${suffix}`,
      email: `pages-viewer-${suffix}@example.com`,
      role: 'viewer',
      status: 'pending',
    });
    viewerUserId = viewer.id;
    const viewerInvite = await createInviteToken(viewer.id);
    const viewerSession = await acceptInviteToken(viewerInvite.token);
    await assertPageBillingLimitEnforced(suffix);
    hierarchyPages = await createHierarchyPages();
    await waitForCdp();
    const page = (await fetchJson('/json/list')).find((candidate) => candidate.type === 'page');
    assert(page?.webSocketDebuggerUrl, 'No Chrome page target found');

    client = connectCdp(page.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('Log.enable');
    await seedBrowserSessionCookie(client, apiAdminSessionToken);
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(apiAdminSessionToken),
    });

    const initialRender = await waitForPagesEmptyState(client);
    const emptyVisual = await assertPagesVisualState(client, 'pages empty state', VISUAL_SCREENSHOT_PATHS.empty, {
      empty: true,
      expectedText: 'Create a page for this site.',
    });
    const emptyCreate = await clickEmptyCreate(
      client,
      'pages-empty-create',
      [],
      { template: 'blank', homepage: false, allowDisabled: true },
    );
    await waitForPagesEmptyState(client);
    const landingShortcut = await clickEmptyCreate(
      client,
      'pages-create-landing',
      ['template=landing'],
      { title: 'Landing page', slug: 'landing', template: 'landing', homepage: false },
    );
    const storefrontShortcut = await clickEmptyCreate(
      client,
      'pages-create-storefront',
      ['template=storefront'],
      { title: 'Storefront', slug: 'store', template: 'storefront', homepage: false },
    );
    const aboutShortcut = await clickEmptyCreate(
      client,
      'pages-create-about',
      ['template=about'],
      { title: 'About', slug: 'about', template: 'about', homepage: false },
    );
    const contactShortcut = await clickEmptyCreate(
      client,
      'pages-create-contact',
      ['template=contact'],
      { title: 'Contact', slug: 'contact', template: 'contact', homepage: false },
    );
    const registrationShortcut = await clickEmptyCreate(
      client,
      'pages-create-registration',
      ['template=registration'],
      { title: 'Member registration', slug: 'register', template: 'registration', homepage: false },
    );
    const newsletterShortcut = await clickEmptyCreate(
      client,
      'pages-create-newsletter',
      ['template=newsletter'],
      { title: 'Newsletter', slug: 'newsletter', template: 'newsletter', homepage: false },
    );
    const surveyShortcut = await clickEmptyCreate(
      client,
      'pages-create-survey',
      ['template=survey'],
      { title: 'Survey', slug: 'survey', template: 'survey', homepage: false },
    );
    const memberLoginShortcut = await clickEmptyCreate(
      client,
      'pages-create-member-login',
      ['template=member-login'],
      { title: 'Member login', slug: 'login', template: 'member-login', homepage: false },
    );
    const memberAccountShortcut = await clickEmptyCreate(
      client,
      'pages-create-member-account',
      ['template=member-account'],
      { title: 'Member account', slug: 'account', template: 'member-account', homepage: false },
    );
    const blogIndexShortcut = await clickEmptyCreate(
      client,
      'pages-create-blog-index',
      ['template=blog-index'],
      { title: 'Blog', slug: 'blog', template: 'blog-index', homepage: false },
    );
    const productDetailShortcut = await clickEmptyCreate(
      client,
      'pages-create-product-detail',
      ['template=product-detail'],
      { title: 'Product detail', slug: 'product', template: 'product-detail', homepage: false },
    );
    const pricingShortcut = await clickEmptyCreate(
      client,
      'pages-create-pricing',
      ['template=pricing'],
      { title: 'Pricing', slug: 'pricing', template: 'pricing', homepage: false },
    );
    const servicesShortcut = await clickEmptyCreate(
      client,
      'pages-create-services',
      ['template=services'],
      { title: 'Services', slug: 'services', template: 'services', homepage: false },
    );
    const bookingShortcut = await clickEmptyCreate(
      client,
      'pages-create-booking',
      ['template=booking'],
      { title: 'Book an appointment', slug: 'booking', template: 'booking', homepage: false },
    );
    const portfolioShortcut = await clickEmptyCreate(
      client,
      'pages-create-portfolio',
      ['template=portfolio'],
      { title: 'Portfolio', slug: 'portfolio', template: 'portfolio', homepage: false },
    );
    const galleryShortcut = await clickEmptyCreate(
      client,
      'pages-create-gallery',
      ['template=gallery'],
      { title: 'Gallery', slug: 'gallery', template: 'gallery', homepage: false },
    );
    const eventsShortcut = await clickEmptyCreate(
      client,
      'pages-create-events',
      ['template=events'],
      { title: 'Events', slug: 'events', template: 'events', homepage: false },
    );
    const privacyShortcut = await clickEmptyCreate(
      client,
      'pages-create-privacy',
      ['template=privacy'],
      { title: 'Privacy policy', slug: 'privacy', template: 'privacy', homepage: false },
    );
    const termsShortcut = await clickEmptyCreate(
      client,
      'pages-create-terms',
      ['template=terms'],
      { title: 'Terms and conditions', slug: 'terms', template: 'terms', homepage: false },
    );
    const cookiePolicyShortcut = await clickEmptyCreate(
      client,
      'pages-create-cookie-policy',
      ['template=cookie-policy'],
      { title: 'Cookie policy', slug: 'cookie-policy', template: 'cookie-policy', homepage: false },
    );
    const accessibilityStatementShortcut = await clickEmptyCreate(
      client,
      'pages-create-accessibility-statement',
      ['template=accessibility-statement'],
      { title: 'Accessibility statement', slug: 'accessibility', template: 'accessibility-statement', homepage: false },
    );
    const refundPolicyShortcut = await clickEmptyCreate(
      client,
      'pages-create-refund-policy',
      ['template=refund-policy'],
      { title: 'Refund policy', slug: 'refund-policy', template: 'refund-policy', homepage: false },
    );
    const shippingPolicyShortcut = await clickEmptyCreate(
      client,
      'pages-create-shipping-policy',
      ['template=shipping-policy'],
      { title: 'Shipping policy', slug: 'shipping-policy', template: 'shipping-policy', homepage: false },
    );
    const cartShortcut = await clickEmptyCreate(
      client,
      'pages-create-cart',
      ['template=cart'],
      { title: 'Cart', slug: 'cart', template: 'cart', homepage: false },
    );
    const checkoutShortcut = await clickEmptyCreate(
      client,
      'pages-create-checkout',
      ['template=checkout'],
      { title: 'Checkout', slug: 'checkout', template: 'checkout', homepage: false },
    );
    const orderConfirmationShortcut = await clickEmptyCreate(
      client,
      'pages-create-order-confirmation',
      ['template=order-confirmation'],
      { title: 'Order confirmation', slug: 'order-confirmation', template: 'order-confirmation', homepage: false },
    );
    const helpCenterShortcut = await clickEmptyCreate(
      client,
      'pages-create-help-center',
      ['template=help-center'],
      { title: 'Help center', slug: 'help', template: 'help-center', homepage: false },
    );
    const blogPostShortcut = await clickEmptyCreate(
      client,
      'pages-create-blog-post',
      ['template=blog-post'],
      { title: 'Article', slug: 'article', template: 'blog-post', homepage: false },
    );
    const teamShortcut = await clickEmptyCreate(
      client,
      'pages-create-team',
      ['template=team'],
      { title: 'Team', slug: 'team', template: 'team', homepage: false },
    );
    const faqShortcut = await clickEmptyCreate(
      client,
      'pages-create-faq',
      ['template=faq'],
      { title: 'FAQ', slug: 'faq', template: 'faq', homepage: false },
    );
    const testimonialsShortcut = await clickEmptyCreate(
      client,
      'pages-create-testimonials',
      ['template=testimonials'],
      { title: 'Testimonials', slug: 'testimonials', template: 'testimonials', homepage: false },
    );
    const careersShortcut = await clickEmptyCreate(
      client,
      'pages-create-careers',
      ['template=careers'],
      { title: 'Careers', slug: 'careers', template: 'careers', homepage: false },
    );
    const childHierarchy = await waitForHierarchyRow(
      client,
      hierarchyPages.childPage,
      `Nested under ${hierarchyPages.parentPage.title}`,
    );
    const parentHierarchy = await waitForHierarchyRow(
      client,
      hierarchyPages.parentPage,
      '1 child page',
    );
    const parentTemplate = await waitForTemplateRow(
      client,
      hierarchyPages.parentPage,
      'Landing',
    );
    const parentDeliveryHealth = await waitForDeliveryRow(
      client,
      hierarchyPages.parentPage,
      'Health',
    );
    const deliveryVisual = await assertPagesVisualState(client, 'pages delivery row', VISUAL_SCREENSHOT_PATHS.delivery, {
      table: true,
      expectedText: 'Health',
    });
    const deliveryRefresh = await assertDeliveryRefreshControl(
      client,
      hierarchyPages.parentPage,
    );
    const childRevisions = await waitForRevisionRow(
      client,
      hierarchyPages.childPage,
      'Pages list revision smoke snapshot',
    );
    const childRoute = await waitForRouteRow(
      client,
      hierarchyPages.childPage,
      'Route is available.',
    );
    const childDelivery = await waitForDeliveryRow(
      client,
      hierarchyPages.childPage,
      'Preview Only',
    );
    const publishReview = await assertPublishReviewModal(
      client,
      hierarchyPages.childPage,
    );
    const bulkPublishReview = await assertBulkPublishReviewModal(
      client,
      hierarchyPages.childPage,
      hierarchyPages.childPage.title,
      VISUAL_SCREENSHOT_PATHS.bulkModal,
    );
    const bulkPublishMutation = await assertBulkPublishMutation(
      client,
      hierarchyPages.childPage,
    );
    const postPublishVisual = await assertPagesVisualState(client, 'pages post-publish table row', VISUAL_SCREENSHOT_PATHS.postPublish, {
      table: true,
      expectedText: 'Published',
    });
    const viewerRbac = await assertViewerRbac(client, viewerSession, hierarchyPages.childPage);

    await captureScreenshot(client, SCREENSHOT_PATH);

    const browserErrors = client.events
      .filter((event) => (
        event.method === 'Runtime.exceptionThrown'
        || (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error')
      ))
      .map((event) => event.params);

    assert(browserErrors.length === 0, `Browser emitted errors: ${JSON.stringify(browserErrors.slice(0, 3))}`);

    console.log(JSON.stringify({
      ok: true,
      initialRender,
      visualStates: {
        empty: emptyVisual,
        delivery: deliveryVisual,
        postPublish: postPublishVisual,
      },
      emptyCreate,
      landingShortcut,
      storefrontShortcut,
      aboutShortcut,
      contactShortcut,
      newsletterShortcut,
      surveyShortcut,
      registrationShortcut,
      memberLoginShortcut,
      memberAccountShortcut,
      blogIndexShortcut,
      productDetailShortcut,
      pricingShortcut,
      servicesShortcut,
      bookingShortcut,
      portfolioShortcut,
      galleryShortcut,
      eventsShortcut,
      privacyShortcut,
      termsShortcut,
      cookiePolicyShortcut,
      accessibilityStatementShortcut,
      refundPolicyShortcut,
      shippingPolicyShortcut,
      cartShortcut,
      checkoutShortcut,
      orderConfirmationShortcut,
      helpCenterShortcut,
      blogPostShortcut,
      teamShortcut,
      faqShortcut,
      testimonialsShortcut,
      careersShortcut,
      childHierarchy,
      parentHierarchy,
      parentTemplate,
      parentDeliveryHealth,
      deliveryRefresh,
      childRevisions,
      childRoute,
      childDelivery,
      publishReview,
      bulkPublishReview,
      bulkPublishMutation,
      viewerRbac: {
        headerCreateDisabled: viewerRbac.headerCreateDisabled,
        rowCheckboxesDisabled: viewerRbac.rowCheckboxesDisabled,
        editDisabled: viewerRbac.editDisabled,
        deleteDisabled: viewerRbac.deleteDisabled,
      },
      visualScreenshotPaths: VISUAL_SCREENSHOT_PATHS,
      screenshotPath: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, hierarchyPages, viewerUserId });
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
