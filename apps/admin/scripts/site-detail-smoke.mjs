#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_SITE_DETAIL_CDP_PORT || 9387);
const SCREENSHOT_PATH = process.env.BACKY_SITE_DETAIL_SCREENSHOT || path.join(os.tmpdir(), 'backy-site-detail-smoke.png');
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

const listSites = async () => {
  const payload = await requestApi('/api/admin/sites?includeUnpublished=true');
  return payload.data?.sites || payload.sites || [];
};

const createSite = async ({ name, slug, customDomain }) => {
  const payload = await requestApi('/api/admin/sites', {
    method: 'POST',
    body: JSON.stringify({
      name,
      slug,
      customDomain,
      description: 'Temporary site detail smoke workspace.',
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

const findSiteBySlug = async (slug) => {
  const sites = await listSites();
  return sites.find((site) => site.slug === slug) || null;
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

const getNavigation = async (siteId) => {
  const payload = await requestApi(`/api/admin/sites/${siteId}/navigation`);
  return payload.data?.navigation || payload.navigation;
};

const getRedirects = async (siteId) => {
  const payload = await requestApi(`/api/admin/sites/${siteId}/redirects`);
  return payload.data?.redirects || payload.redirects;
};

const getSeo = async (siteId) => {
  const payload = await requestApi(`/api/admin/sites/${siteId}/seo`);
  return payload.data?.seo || payload.seo;
};

const getFrontendDesign = async (siteId) => {
  const payload = await requestApi(`/api/admin/sites/${siteId}/frontend-design`);
  return payload.data?.frontendDesign || payload.frontendDesign;
};

const getSite = async (siteId) => {
  const payload = await requestApi(`/api/admin/sites/${siteId}`);
  return payload.data?.site || payload.site;
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

const navigateToSites = (client, siteName) => navigate(
  client,
  `${ADMIN_BASE_URL}/sites`,
  `(() => ({
    ready: Boolean(document.querySelector('[data-testid="sites-command-center"]')) &&
      document.body?.innerText?.includes(${JSON.stringify(siteName)}),
    body: document.body?.innerText?.slice(0, 900) || '',
  }))()`,
  'Sites page',
);

const navigateToSiteDetail = (client, siteId, siteName) => navigate(
  client,
  `${ADMIN_BASE_URL}/sites/${encodeURIComponent(siteId)}`,
  `(() => ({
    ready: Boolean(document.querySelector('[data-testid="site-workspace-command-center"]')) &&
      Boolean(document.querySelector('[data-testid="site-navigation-panel"]')) &&
      Boolean(document.querySelector('[data-testid="site-redirects-panel"]')) &&
      Boolean(document.querySelector('[data-testid="site-seo-panel"]')) &&
      document.body?.innerText?.includes(${JSON.stringify(siteName)}),
    body: document.body?.innerText?.slice(0, 1200) || '',
    path: window.location.pathname,
  }))()`,
  'Site detail page',
);

const setInputValue = `
  const setNativeValue = (element, value) => {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };
`;

const clickButtonByText = async (client, selector, text) => {
  const result = await evaluate(client, `(() => {
    const root = document.querySelector(${JSON.stringify(selector)});
    if (!root) return { ok: false, reason: 'root-missing' };
    const button = Array.from(root.querySelectorAll('button')).find((candidate) => (
      (candidate.textContent || '').replace(/\\s+/g, ' ').trim() === ${JSON.stringify(text)}
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        reason: 'button-missing',
        buttons: Array.from(root.querySelectorAll('button')).map((candidate) => (candidate.textContent || '').replace(/\\s+/g, ' ').trim()).slice(0, 80),
      };
    }
    if (button.disabled) return { ok: false, reason: 'button-disabled', text: button.textContent || '' };
    button.click();
    return { ok: true };
  })()`);
  assert(result.ok, `Unable to click ${text}: ${JSON.stringify(result)}`);
};

const waitForText = async (client, selector, text, description) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const root = document.querySelector(${JSON.stringify(selector)});
      return {
        ready: Boolean(root && (root.textContent || '').includes(${JSON.stringify(text)})),
        text: root?.textContent?.replace(/\\s+/g, ' ').slice(0, 900) || '',
      };
    })()`);
    if (state.ready) {
      return state;
    }
    if (attempt === 79) {
      throw new Error(`${description} did not appear: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return null;
};

const waitForNavigationEditorReady = async (client) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const section = document.querySelector('[data-testid="site-navigation-panel"]');
      const text = section?.textContent || '';
      return {
        ready: Boolean(section) &&
          text.includes('Primary menu') &&
          text.includes('Footer menu') &&
          !text.includes('Loading navigation...'),
        text: text.replace(/\\s+/g, ' ').slice(0, 1000),
      };
    })()`);
    if (state.ready) {
      return state;
    }
    if (attempt === 99) {
      throw new Error(`Navigation editor did not finish loading: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return null;
};

const assertSiteDetailLayout = async (client, siteName) => {
  const layout = await evaluate(client, `(() => {
    const body = document.body?.innerText || '';
    return {
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      path: window.location.pathname,
      hasSite: body.includes(${JSON.stringify(siteName)}),
      hasCommandCenter: Boolean(document.querySelector('[data-testid="site-workspace-command-center"]')) && body.includes('Site command center'),
      hasReadiness: Boolean(document.querySelector('[data-testid="site-readiness-panel"]')) && body.includes('Publish readiness'),
      hasNavigation: Boolean(document.querySelector('[data-testid="site-navigation-panel"]')) && body.includes('Site navigation') && body.includes('Primary menu') && body.includes('Footer menu'),
      hasFrontendDesign: Boolean(document.querySelector('[data-testid="site-frontend-design-panel"]')) && body.includes('Frontend design contract') && body.includes('Capture current design') && body.includes('Save contract'),
      hasRedirects: Boolean(document.querySelector('[data-testid="site-redirects-panel"]')) && body.includes('Redirects and retired routes'),
      hasSeo: Boolean(document.querySelector('[data-testid="site-seo-panel"]')) && body.includes('SEO defaults') && body.includes('JSON-LD defaults'),
      hasSettings: body.includes('Site Name') && body.includes('Custom Domain'),
      hasAutomation: body.includes('Forms') && body.includes('Comments moderation'),
      hasCommentPolicy: Boolean(document.querySelector('[data-testid="site-comment-policy-panel"]')) && body.includes('Site comment policy') && body.includes('Save comment policy'),
      hasHandoff: body.includes('Frontend handoff') && body.includes('Public render') && body.includes('OpenAPI'),
    };
  })()`);

  assert(layout.scrollWidth <= layout.width + 8, `Site detail page has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(
    layout.path.startsWith('/sites/') &&
      layout.hasSite &&
      layout.hasCommandCenter &&
      layout.hasReadiness &&
      layout.hasNavigation &&
      layout.hasFrontendDesign &&
      layout.hasRedirects &&
      layout.hasSeo &&
      layout.hasSettings &&
      layout.hasAutomation &&
      layout.hasCommentPolicy &&
      layout.hasHandoff,
    `Site detail page missing expected regions: ${JSON.stringify(layout)}`,
  );
  return layout;
};

const configureNavigationThroughUi = async (client, { routeLabel, routePath, footerLabel, footerHref }) => {
  await waitForNavigationEditorReady(client);

  const addResult = await evaluate(client, `(() => {
    const section = document.querySelector('[data-testid="site-navigation-panel"]');
    if (!section) return { ok: false, reason: 'section-missing' };

    const findMenuCard = (headingText) => {
      const heading = Array.from(section.querySelectorAll('h3')).find((candidate) => (
        (candidate.textContent || '').trim() === headingText
      ));
      let node = heading?.parentElement || null;
      while (node && node !== section) {
        const text = node.textContent || '';
        const buttons = Array.from(node.querySelectorAll('button')).map((button) => (
          (button.textContent || '').replace(/\\s+/g, ' ').trim()
        ));
        const hasEditorBody = Array.from(node.children).some((child) => (
          typeof child.className === 'string' && child.className.includes('space-y-3')
        ));
        if (text.includes(headingText) && buttons.includes('Route') && buttons.includes('URL') && hasEditorBody) {
          return node;
        }
        node = node.parentElement;
      }
      return null;
    };

    const primary = findMenuCard('Primary menu');
    const footer = findMenuCard('Footer menu');
    if (!primary || !footer) {
      return { ok: false, reason: 'menus-missing', text: section.textContent?.slice(0, 1200) || '' };
    }

    const primaryRouteButton = Array.from(primary.querySelectorAll('button')).find((button) => (
      (button.textContent || '').replace(/\\s+/g, ' ').trim() === 'Route'
    ));
    const footerUrlButton = Array.from(footer.querySelectorAll('button')).find((button) => (
      (button.textContent || '').replace(/\\s+/g, ' ').trim() === 'URL'
    ));
    if (!(primaryRouteButton instanceof HTMLButtonElement) || !(footerUrlButton instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'add-buttons-missing' };
    }
    primaryRouteButton.click();
    footerUrlButton.click();
    return { ok: true };
  })()`);
  assert(addResult.ok, `Unable to add navigation items through UI: ${JSON.stringify(addResult)}`);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await evaluate(client, `(() => {
      ${setInputValue}
      const section = document.querySelector('[data-testid="site-navigation-panel"]');
      if (!section) return { ok: false, reason: 'section-missing' };

      const findMenuCard = (headingText) => {
        const heading = Array.from(section.querySelectorAll('h3')).find((candidate) => (
          (candidate.textContent || '').trim() === headingText
        ));
        let node = heading?.parentElement || null;
        while (node && node !== section) {
          const text = node.textContent || '';
          const buttons = Array.from(node.querySelectorAll('button')).map((button) => (
            (button.textContent || '').replace(/\\s+/g, ' ').trim()
          ));
          const hasEditorBody = Array.from(node.children).some((child) => (
            typeof child.className === 'string' && child.className.includes('space-y-3')
          ));
          if (text.includes(headingText) && buttons.includes('Route') && buttons.includes('URL') && hasEditorBody) {
            return node;
          }
          node = node.parentElement;
        }
        return null;
      };

      const primary = findMenuCard('Primary menu');
      const footer = findMenuCard('Footer menu');
      if (!primary || !footer) {
        return { ok: false, reason: 'menus-missing', text: section.textContent?.slice(0, 1200) || '' };
      }

      const primaryLabel = Array.from(primary.querySelectorAll('input')).find((input) => input.getAttribute('placeholder') === 'Label');
      const primaryPath = Array.from(primary.querySelectorAll('input')).find((input) => input.getAttribute('placeholder') === '/about');
      const footerLabelInput = Array.from(footer.querySelectorAll('input')).find((input) => input.getAttribute('placeholder') === 'Label');
      const footerHrefInput = Array.from(footer.querySelectorAll('input')).find((input) => input.getAttribute('placeholder') === 'https://example.com');
      if (
        !(primaryLabel instanceof HTMLInputElement) ||
        !(primaryPath instanceof HTMLInputElement) ||
        !(footerLabelInput instanceof HTMLInputElement) ||
        !(footerHrefInput instanceof HTMLInputElement)
      ) {
        return {
          ok: false,
          reason: 'inputs-missing',
          primaryInputs: Array.from(primary.querySelectorAll('input')).map((input) => ({ placeholder: input.getAttribute('placeholder'), value: input.value })),
          footerInputs: Array.from(footer.querySelectorAll('input')).map((input) => ({ placeholder: input.getAttribute('placeholder'), value: input.value })),
        };
      }

      setNativeValue(primaryLabel, ${JSON.stringify(routeLabel)});
      setNativeValue(primaryPath, ${JSON.stringify(routePath)});
      setNativeValue(footerLabelInput, ${JSON.stringify(footerLabel)});
      setNativeValue(footerHrefInput, ${JSON.stringify(footerHref)});

      const headerSearch = Array.from(section.querySelectorAll('label')).find((label) => (
        (label.textContent || '').includes('Search')
      ))?.querySelector('input[type="checkbox"]');
      if (headerSearch instanceof HTMLInputElement && !headerSearch.checked) {
        headerSearch.click();
      }

      return {
        ok: true,
        primaryLabel: primaryLabel.value,
        primaryPath: primaryPath.value,
        footerLabel: footerLabelInput.value,
        footerHref: footerHrefInput.value,
        headerSearch: headerSearch instanceof HTMLInputElement ? headerSearch.checked : null,
      };
    })()`);
    if (result.ok) {
      break;
    }
    if (attempt === 59) {
      throw new Error(`Unable to configure navigation through UI: ${JSON.stringify(result)}`);
    }
    await sleep(150);
  }

  await clickButtonByText(client, '[data-testid="site-navigation-panel"]', 'Save navigation');
  await waitForText(
    client,
    '[data-testid="site-navigation-panel"]',
    'Navigation saved and available to public/front-end contracts.',
    'Navigation save notice',
  );
};

const configureFrontendDesignThroughUi = async (client, { frontendLabel, frontendUrl, frontendRepository, frontendBranch }) => {
  await clickButtonByText(client, '[data-testid="site-frontend-design-panel"]', 'Capture current design');
  await waitForText(
    client,
    '[data-testid="site-frontend-design-panel"]',
    'Captured current Backy theme, navigation, and page templates',
    'Frontend design capture notice',
  );

  const result = await evaluate(client, `(() => {
    ${setInputValue}
    const section = document.querySelector('[data-testid="site-frontend-design-panel"]');
    if (!section) return { ok: false, reason: 'section-missing' };

    const status = Array.from(section.querySelectorAll('select')).find((select) => (
      Array.from(select.options).some((option) => option.value === 'synced')
    ));
    const sourceType = Array.from(section.querySelectorAll('select')).find((select) => (
      Array.from(select.options).some((option) => option.value === 'custom-frontend')
    ));
    const label = Array.from(section.querySelectorAll('input')).find((input) => input.getAttribute('placeholder')?.includes('Marketing frontend'));
    const url = Array.from(section.querySelectorAll('input')).find((input) => input.getAttribute('placeholder') === 'https://example.com');
    const branch = Array.from(section.querySelectorAll('input')).find((input) => input.getAttribute('placeholder') === 'main');
    const repository = Array.from(section.querySelectorAll('input')).find((input) => input.getAttribute('placeholder') === 'owner/frontend');
    const notes = Array.from(section.querySelectorAll('textarea')).find((textarea) => textarea.getAttribute('placeholder')?.includes('Extraction notes'));
    const textareas = Array.from(section.querySelectorAll('textarea'));
    const tokens = textareas.find((textarea) => textarea.previousElementSibling?.textContent?.includes('Tokens JSON'));
    const chrome = textareas.find((textarea) => textarea.previousElementSibling?.textContent?.includes('Chrome JSON'));
    const templates = textareas.find((textarea) => textarea.previousElementSibling?.textContent?.includes('Templates JSON'));
    const editableMap = textareas.find((textarea) => textarea.previousElementSibling?.textContent?.includes('Editable map JSON'));

    if (
      !(status instanceof HTMLSelectElement) ||
      !(sourceType instanceof HTMLSelectElement) ||
      !(label instanceof HTMLInputElement) ||
      !(url instanceof HTMLInputElement) ||
      !(branch instanceof HTMLInputElement) ||
      !(repository instanceof HTMLInputElement) ||
      !(notes instanceof HTMLTextAreaElement) ||
      !(tokens instanceof HTMLTextAreaElement) ||
      !(chrome instanceof HTMLTextAreaElement) ||
      !(templates instanceof HTMLTextAreaElement) ||
      !(editableMap instanceof HTMLTextAreaElement)
    ) {
      return {
        ok: false,
        reason: 'controls-missing',
        inputs: Array.from(section.querySelectorAll('input')).map((input) => ({ placeholder: input.getAttribute('placeholder'), value: input.value })),
        selects: Array.from(section.querySelectorAll('select')).map((select) => select.value),
        textareaLabels: textareas.map((textarea) => textarea.previousElementSibling?.textContent || ''),
      };
    }

    setNativeValue(status, 'synced');
    setNativeValue(sourceType, 'custom-frontend');
    setNativeValue(label, ${JSON.stringify(frontendLabel)});
    setNativeValue(url, ${JSON.stringify(frontendUrl)});
    setNativeValue(branch, ${JSON.stringify(frontendBranch)});
    setNativeValue(repository, ${JSON.stringify(frontendRepository)});
    setNativeValue(notes, 'Site detail smoke captured and customized this design contract.');
    setNativeValue(tokens, JSON.stringify({
      colors: { primary: '#0f766e', text: '#111827' },
      fonts: { heading: 'Inter', body: 'Inter' },
      spacing: { sectionY: 96 },
    }, null, 2));
    setNativeValue(chrome, JSON.stringify({
      header: { component: 'SmokeHeader' },
      navigation: { source: 'site.navigation.primary' },
      footer: { component: 'SmokeFooter' },
    }, null, 2));
    setNativeValue(templates, JSON.stringify([
      {
        id: 'smoke-page-contract',
        type: 'page',
        name: 'Smoke Page Contract',
        routePattern: '/smoke-page',
        canvasSize: { width: 1440, height: 1100 },
      },
      {
        id: 'smoke-blog-contract',
        type: 'blogPost',
        name: 'Smoke Blog Contract',
        routePattern: '/blog/{slug}',
      },
    ], null, 2));
    setNativeValue(editableMap, JSON.stringify([
      {
        selector: '[data-backy-role="site-header"]',
        role: 'site.header',
        binding: 'site.navigation.primary',
        fields: ['label', 'href'],
      },
    ], null, 2));

    return {
      ok: true,
      status: status.value,
      sourceType: sourceType.value,
      label: label.value,
      url: url.value,
      repository: repository.value,
      branch: branch.value,
    };
  })()`);
  assert(result.ok, `Unable to configure frontend design through UI: ${JSON.stringify(result)}`);

  await clickButtonByText(client, '[data-testid="site-frontend-design-panel"]', 'Save contract');
  await waitForText(
    client,
    '[data-testid="site-frontend-design-panel"]',
    'Frontend design contract saved and exposed in the public manifest.',
    'Frontend design save notice',
  );
};

const configureRedirectsThroughUi = async (client, { from, to }) => {
  await clickButtonByText(client, '[data-testid="site-redirects-panel"]', 'Add rule');

  const result = await evaluate(client, `(() => {
    ${setInputValue}
    const section = document.querySelector('[data-testid="site-redirects-panel"]');
    if (!section) return { ok: false, reason: 'section-missing' };
    const sourceInputs = Array.from(section.querySelectorAll('input')).filter((input) => input.getAttribute('placeholder') === '/old-path');
    const destinationInputs = Array.from(section.querySelectorAll('input')).filter((input) => (input.getAttribute('placeholder') || '').includes('/new-path'));
    const statusSelects = Array.from(section.querySelectorAll('select'));
    const source = sourceInputs.at(-1);
    const destination = destinationInputs.at(-1);
    const status = statusSelects.at(-1);
    if (!(source instanceof HTMLInputElement) || !(destination instanceof HTMLInputElement) || !(status instanceof HTMLSelectElement)) {
      return {
        ok: false,
        reason: 'redirect-controls-missing',
        inputs: Array.from(section.querySelectorAll('input')).map((input) => ({ placeholder: input.getAttribute('placeholder'), value: input.value })).slice(-8),
        selects: statusSelects.map((select) => select.value),
      };
    }
    setNativeValue(source, ${JSON.stringify(from)});
    setNativeValue(destination, ${JSON.stringify(to)});
    setNativeValue(status, '302');
    return { ok: true, source: source.value, destination: destination.value, status: status.value };
  })()`);
  assert(result.ok, `Unable to configure redirect through UI: ${JSON.stringify(result)}`);

  await clickButtonByText(client, '[data-testid="site-redirects-panel"]', 'Preview conflicts');
  await waitForText(client, '[data-testid="site-redirects-panel"]', 'Preview found', 'Redirect preview notice');
  await clickButtonByText(client, '[data-testid="site-redirects-panel"]', 'Save redirects');
  await waitForText(client, '[data-testid="site-redirects-panel"]', 'Redirect rules saved', 'Redirect save notice');
};

const configureSeoThroughUi = async (client, { titleTemplate, description, ogImage, favicon, robotsRule }) => {
  const result = await evaluate(client, `(() => {
    ${setInputValue}
    const section = document.querySelector('[data-testid="site-seo-panel"]');
    if (!section) return { ok: false, reason: 'section-missing' };
    const title = Array.from(section.querySelectorAll('input')).find((input) => input.getAttribute('placeholder') === '%s | {siteName}');
    const og = Array.from(section.querySelectorAll('input')).find((input) => (input.getAttribute('placeholder') || '').includes('social-card'));
    const faviconInput = Array.from(section.querySelectorAll('input')).find((input) => input.getAttribute('placeholder') === '/favicon.ico');
    const descriptionInput = Array.from(section.querySelectorAll('textarea')).find((textarea) => (
      (textarea.getAttribute('placeholder') || '').includes('Used when a page')
    ));
    const robots = Array.from(section.querySelectorAll('textarea')).find((textarea) => (
      textarea.getAttribute('placeholder') === 'Disallow: /private'
    ));
    if (
      !(title instanceof HTMLInputElement) ||
      !(og instanceof HTMLInputElement) ||
      !(faviconInput instanceof HTMLInputElement) ||
      !(descriptionInput instanceof HTMLTextAreaElement) ||
      !(robots instanceof HTMLTextAreaElement)
    ) {
      return {
        ok: false,
        reason: 'seo-controls-missing',
        inputs: Array.from(section.querySelectorAll('input')).map((input) => ({ placeholder: input.getAttribute('placeholder'), value: input.value })).slice(0, 20),
        textareas: Array.from(section.querySelectorAll('textarea')).map((textarea) => ({ placeholder: textarea.getAttribute('placeholder'), value: textarea.value })).slice(0, 12),
      };
    }

    setNativeValue(title, ${JSON.stringify(titleTemplate)});
    setNativeValue(descriptionInput, ${JSON.stringify(description)});
    setNativeValue(og, ${JSON.stringify(ogImage)});
    setNativeValue(faviconInput, ${JSON.stringify(favicon)});
    setNativeValue(robots, ${JSON.stringify(robotsRule)});
    return {
      ok: true,
      title: title.value,
      description: descriptionInput.value,
      og: og.value,
      favicon: faviconInput.value,
      robots: robots.value,
    };
  })()`);
  assert(result.ok, `Unable to configure SEO through UI: ${JSON.stringify(result)}`);

  await clickButtonByText(client, '[data-testid="site-seo-panel"]', 'Save SEO');
  await waitForText(client, '[data-testid="site-seo-panel"]', 'SEO defaults saved and reflected in public SEO discovery.', 'SEO save notice');
};

const configureCommentPolicyThroughUi = async (client, { blockedTerm, closedMessage }) => {
  const result = await evaluate(client, `(() => {
    ${setInputValue}
    const section = document.querySelector('[data-testid="site-comment-policy-panel"]');
    if (!section) return { ok: false, reason: 'section-missing' };
    const findCheckbox = (labelText) => Array.from(section.querySelectorAll('label')).find((label) => (
      (label.textContent || '').includes(labelText)
    ))?.querySelector('input[type="checkbox"]');
    const requireEmail = findCheckbox('Require email');
    const reports = findCheckbox('Enable reports');
    const moderation = section.querySelector('select[aria-label="Site default comment moderation"]');
    const sort = section.querySelector('select[aria-label="Site default comment sort"]');
    const closed = section.querySelector('input[aria-label="Site comment closed message"]');
    const blockedTerms = section.querySelector('textarea[aria-label="Site comment blocked terms"]');
    if (
      !(requireEmail instanceof HTMLInputElement) ||
      !(reports instanceof HTMLInputElement) ||
      !(moderation instanceof HTMLSelectElement) ||
      !(sort instanceof HTMLSelectElement) ||
      !(closed instanceof HTMLInputElement) ||
      !(blockedTerms instanceof HTMLTextAreaElement)
    ) {
      return { ok: false, reason: 'controls-missing', text: section.textContent?.slice(0, 1200) || '' };
    }
    if (!requireEmail.checked) requireEmail.click();
    if (reports.checked) reports.click();
    setNativeValue(moderation, 'auto-approve');
    setNativeValue(sort, 'oldest');
    setNativeValue(closed, ${JSON.stringify(closedMessage)});
    setNativeValue(blockedTerms, ${JSON.stringify(blockedTerm)});
    return {
      ok: true,
      requireEmail: requireEmail.checked,
      reports: reports.checked,
      moderation: moderation.value,
      sort: sort.value,
      closed: closed.value,
      blockedTerms: blockedTerms.value,
    };
  })()`);
  assert(result.ok, `Unable to configure comment policy through UI: ${JSON.stringify(result)}`);

  await clickButtonByText(client, '[data-testid="site-comment-policy-panel"]', 'Save comment policy');
  await waitForText(client, '[data-testid="site-workspace-command-center"]', 'Site comment policy saved.', 'Comment policy save notice');
};

const assertApiReadback = async (siteId, expected) => {
  const navigation = await getNavigation(siteId);
  const redirects = await getRedirects(siteId);
  const seo = await getSeo(siteId);
  const frontendDesign = await getFrontendDesign(siteId);
  const site = await getSite(siteId);

  assert(
    navigation?.settings?.primary?.some((item) => item.label === expected.routeLabel && item.path === expected.routePath),
    `Navigation API did not include primary route item: ${JSON.stringify(navigation).slice(0, 1000)}`,
  );
  assert(
    navigation?.settings?.footer?.some((item) => item.label === expected.footerLabel && item.href === expected.footerHref),
    `Navigation API did not include footer URL item: ${JSON.stringify(navigation).slice(0, 1000)}`,
  );
  assert(
    navigation?.settings?.layout?.header?.showSearch === true,
    `Navigation layout search toggle did not persist: ${JSON.stringify(navigation?.settings?.layout).slice(0, 500)}`,
  );
  assert(
    redirects?.rules?.some((rule) => rule.from === expected.redirectFrom && rule.to === expected.redirectTo && Number(rule.statusCode) === 302),
    `Redirect API did not include saved rule: ${JSON.stringify(redirects).slice(0, 1000)}`,
  );
  assert(
    seo?.titleTemplate === expected.titleTemplate &&
      seo?.defaultDescription === expected.description &&
      seo?.defaultOgImage === expected.ogImage &&
      seo?.favicon === expected.favicon &&
      seo?.robots?.extraRules === expected.robotsRule,
    `SEO API did not include saved defaults: ${JSON.stringify(seo).slice(0, 1000)}`,
  );
  assert(
    site?.settings?.commentPolicy?.requireEmail === true &&
      site?.settings?.commentPolicy?.enableReports === false &&
      site?.settings?.commentPolicy?.moderationMode === 'auto-approve' &&
      site?.settings?.commentPolicy?.sort === 'oldest' &&
      site?.settings?.commentPolicy?.closedMessage === expected.commentClosedMessage &&
      site?.settings?.commentPolicy?.blockedTerms?.includes(expected.commentBlockedTerm),
    `Site API did not include saved comment policy: ${JSON.stringify(site?.settings?.commentPolicy).slice(0, 1000)}`,
  );
  assert(
    frontendDesign?.status === 'synced' &&
      frontendDesign?.source?.type === 'custom-frontend' &&
      frontendDesign?.source?.label === expected.frontendLabel &&
      frontendDesign?.source?.url === expected.frontendUrl &&
      frontendDesign?.source?.repository === expected.frontendRepository &&
      frontendDesign?.source?.branch === expected.frontendBranch &&
      frontendDesign?.tokens?.colors?.primary === '#0f766e' &&
      frontendDesign?.chrome?.header?.component === 'SmokeHeader' &&
      frontendDesign?.templates?.some((template) => template.id === 'smoke-page-contract' && template.type === 'page') &&
      frontendDesign?.editableMap?.some((entry) => entry.role === 'site.header'),
    `Frontend design API did not include saved contract: ${JSON.stringify(frontendDesign).slice(0, 1500)}`,
  );

  return { navigation, redirects, seo, frontendDesign, site };
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-site-detail-${Date.now()}`);
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
      // The site detail smoke owns only temporary sites.
    }
  }
};

const main = async () => {
  let client;
  let childProcess;
  let userDataDir;
  let siteId;
  const suffix = Date.now().toString(36);
  const siteName = `Site Detail Smoke ${suffix}`;
  const slug = `site-detail-smoke-${suffix}`;
  const expected = {
    routeLabel: `Smoke Route ${suffix}`,
    routePath: `/smoke-route-${suffix}`,
    footerLabel: `Smoke Docs ${suffix}`,
    footerHref: `https://docs.example.com/${suffix}`,
    redirectFrom: `/old-smoke-${suffix}`,
    redirectTo: `/new-smoke-${suffix}`,
    titleTemplate: `%s | ${siteName}`,
    description: `Default SEO description for ${siteName}.`,
    ogImage: `/uploads/${slug}/social-card.png`,
    favicon: `/uploads/${slug}/favicon.ico`,
    robotsRule: `Disallow: /private-${suffix}`,
    commentBlockedTerm: `blocked-${suffix}`,
    commentClosedMessage: `Comments are closed for ${siteName}.`,
    frontendLabel: `Smoke Frontend ${suffix}`,
    frontendUrl: `https://${slug}.example.com`,
    frontendRepository: `backy/smoke-${suffix}`,
    frontendBranch: `design-${suffix}`,
  };

  try {
    await loginAdminApi();
    const existing = await findSiteBySlug(slug);
    assert(!existing, `Temporary site already exists: ${slug}`);

    const site = await createSite({
      name: siteName,
      slug,
      customDomain: `${slug}.example.com`,
    });
    siteId = site.id;

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

    await navigateToSites(client, siteName);
    await navigateToSiteDetail(client, site.id, siteName);
    await assertSiteDetailLayout(client, siteName);

    await configureNavigationThroughUi(client, expected);
    await configureFrontendDesignThroughUi(client, expected);
    await configureRedirectsThroughUi(client, {
      from: expected.redirectFrom,
      to: expected.redirectTo,
    });
    await configureSeoThroughUi(client, expected);
    await configureCommentPolicyThroughUi(client, {
      blockedTerm: expected.commentBlockedTerm,
      closedMessage: expected.commentClosedMessage,
    });
    await assertApiReadback(site.id, expected);

    await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }).then((result) => {
      fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(result.data, 'base64'));
    });

    await deleteSite(siteId);
    await waitForSiteMissing(slug);
    siteId = null;

    console.log(JSON.stringify({
      ok: true,
      siteName,
      slug,
      screenshot: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, siteId });
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
