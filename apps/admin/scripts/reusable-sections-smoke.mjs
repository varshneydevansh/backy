#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_REUSABLE_SECTIONS_SMOKE_SITE_ID || 'site-demo';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_REUSABLE_SECTIONS_CDP_PORT || 9387);
const SCREENSHOT_PATH = process.env.BACKY_REUSABLE_SECTIONS_SCREENSHOT || path.join(os.tmpdir(), 'backy-reusable-sections-smoke.png');
const RESPONSIVE_SCREENSHOT_DIR = process.env.BACKY_REUSABLE_SECTIONS_RESPONSIVE_SCREENSHOT_DIR || os.tmpdir();
const FRONTEND_SECTION_TEMPLATE_ID = 'smoke-section-contract-template';
const FRONTEND_SECTION_TEMPLATE_NAME = 'Smoke Frontend Hero Section';
let apiAdminSessionToken = '';

const RESPONSIVE_VIEWPORTS = [
  { key: 'mobile', width: 390, height: 900, expectedBreakpoint: 'mobile' },
  { key: 'tablet', width: 820, height: 1024, expectedBreakpoint: 'tablet' },
];

const RESPONSIVE_SCREENSHOT_THRESHOLDS = {
  minSampledPixels: 45000,
  minLumaRange: 90,
  minCanvasNonWhiteRatio: 0.003,
  minCanvasDarkRatio: 0.00045,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertReusableSectionsRouteSourceContract = () => {
  const source = fs.readFileSync(new URL('../src/routes/reusable-sections.tsx', import.meta.url), 'utf8');
  assert(source.includes("import { EmptyState } from '@/components/ui/EmptyState';"), 'Reusable sections route must use the shared EmptyState component for library empty states');
  assert(source.includes("'No reusable sections yet'"), 'Reusable sections empty state must distinguish a new library from filtered results');
  assert(source.includes('frontend handoff APIs'), 'Reusable sections empty state must explain the frontend handoff value');
  assert(source.includes('title="No section versions yet"'), 'Reusable sections workflow must keep the empty version-history title visible');
  assert(source.includes('Save this reusable section or restore an imported version to start building a backend version history.'), 'Reusable sections empty version history must explain how versions are created');
  assert(source.includes('title="Version history not loaded"'), 'Reusable sections workflow must keep the unloaded version-history title visible');
  assert(source.includes('Load workflow state to inspect saved versions before restoring a captured section.'), 'Reusable sections unloaded version history must explain the next action');
  assert(source.includes('title="No frontend section templates captured"'), 'Reusable sections frontend contract panel must keep the empty template title visible');
  assert(source.includes('Save section templates in the connected frontend design contract to create reusable editor blocks'), 'Reusable sections frontend template empty state must explain how templates are captured');
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

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...(endpoint.startsWith('/api/admin/') && apiAdminSessionToken ? { authorization: `Bearer ${apiAdminSessionToken}` } : {}),
      ...Object.fromEntries(headers.entries()),
    },
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
  const smokeMfaCode = process.env.BACKY_REUSABLE_SECTIONS_SMOKE_MFA_CODE
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

const getFrontendDesign = async () => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/frontend-design`);
  const frontendDesign = payload.data?.frontendDesign;
  assert(frontendDesign?.schemaVersion === 'backy.frontend-design.v1', `Unexpected frontend design response: ${JSON.stringify(payload).slice(0, 500)}`);
  return frontendDesign;
};

const patchFrontendDesign = async (frontendDesign) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/frontend-design`, {
    method: 'PATCH',
    body: JSON.stringify({ frontendDesign }),
  });
  const updated = payload.data?.frontendDesign;
  assert(updated?.schemaVersion === 'backy.frontend-design.v1', `Frontend design patch failed: ${JSON.stringify(payload).slice(0, 500)}`);
  return updated;
};

const smokeFrontendDesignContract = () => ({
  schemaVersion: 'backy.frontend-design.v1',
  status: 'synced',
  source: {
    type: 'custom-frontend',
    label: 'Smoke reusable sections frontend',
    url: 'https://example.com/smoke-reusable-sections-frontend',
    repository: 'example/backy-smoke-reusable-sections-frontend',
    branch: 'main',
  },
  tokens: {
    colors: {
      primary: '#0f766e',
      surface: '#f8fafc',
      text: '#111827',
      muted: '#475569',
    },
    fonts: {
      heading: 'Inter',
      body: 'Inter',
    },
    customCss: ':root { --backy-smoke-section-primary: #0f766e; }',
  },
  chrome: {
    header: { component: 'SmokeSectionsHeader', source: 'site.navigation.primary' },
    navigation: { component: 'SmokeSectionsNavigation', source: 'site.navigation.primary' },
    footer: { component: 'SmokeSectionsFooter', source: 'site.navigation.footer' },
  },
  templates: [
    {
      id: FRONTEND_SECTION_TEMPLATE_ID,
      type: 'section',
      name: FRONTEND_SECTION_TEMPLATE_NAME,
      routePattern: '/smoke-section',
      description: 'Frontend contract reusable section template used by the smoke test.',
      content: {
        name: 'Smoke contract hero section',
        slug: `smoke-contract-hero-section-${Date.now().toString(36)}`,
        description: 'Reusable hero section seeded from a connected custom frontend contract.',
        category: 'hero',
        tags: ['hero', 'smoke', 'frontend-contract'],
        canvasSize: { width: 1200, height: 540 },
        customCSS: '.smoke-contract-hero { color: var(--backy-smoke-section-primary); }',
        customJS: '',
        elements: [
          {
            id: 'smoke-section-root',
            type: 'section',
            name: 'Smoke contract hero',
            x: 0,
            y: 0,
            width: 1200,
            height: 540,
            zIndex: 1,
            props: {
              content: 'Smoke contract hero section',
              className: 'smoke-contract-hero',
            },
            styles: {
              backgroundColor: '#f8fafc',
              color: '#111827',
              padding: 64,
            },
            children: [
              {
                id: 'smoke-section-heading',
                type: 'heading',
                name: 'Smoke contract hero heading',
                x: 72,
                y: 104,
                width: 760,
                height: 86,
                zIndex: 2,
                props: { content: 'Design-preserved backend section', level: 'h2' },
                styles: { fontFamily: 'Inter', fontSize: 52, fontWeight: 700, color: '#111827' },
              },
              {
                id: 'smoke-section-copy',
                type: 'paragraph',
                name: 'Smoke contract hero copy',
                x: 72,
                y: 216,
                width: 680,
                height: 112,
                zIndex: 2,
                props: { content: 'Backy should retain frontend section structure, tokens, chrome, and binding hints.' },
                styles: { fontFamily: 'Inter', fontSize: 18, lineHeight: 1.6, color: '#475569' },
              },
            ],
          },
        ],
      },
      bindingHints: [
        { role: 'section.root', binding: 'sections.smokeHero.root' },
        { role: 'section.heading', binding: 'sections.smokeHero.heading' },
        { role: 'section.copy', binding: 'sections.smokeHero.copy' },
      ],
    },
  ],
  editableMap: [
    { role: 'section.heading', binding: 'sections.smokeHero.heading', fields: ['content'] },
    { role: 'section.copy', binding: 'sections.smokeHero.copy', fields: ['content'] },
  ],
  notes: 'Temporary frontend design contract for reusable sections smoke validation.',
  updatedAt: new Date().toISOString(),
});

const listReusableSections = async () => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/reusable-sections?status=all`);
  return payload.data?.sections || payload.sections || [];
};

const deleteReusableSection = async (sectionId) => {
  if (!sectionId) return;
  await requestApi(`/api/admin/sites/${SITE_ID}/reusable-sections/${sectionId}`, { method: 'DELETE' });
};

const exportReusableSections = async (sectionIds = []) => {
  const query = new URLSearchParams({ status: 'all' });
  if (sectionIds.length > 0) query.set('sectionIds', sectionIds.join(','));
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/reusable-sections/export?${query.toString()}`);
  assert(payload.data?.export?.schemaVersion === 'backy.reusable-sections.export.v1', `Unexpected reusable section export: ${JSON.stringify(payload).slice(0, 500)}`);
  return payload.data;
};

const updateReusableSection = async (sectionId, body) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/reusable-sections/${sectionId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return payload.data?.section;
};

const createDemoPageWithReusableSectionInstance = async (section, pageIds = []) => {
  const suffix = Date.now().toString(36);
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages`, {
    method: 'POST',
    body: JSON.stringify({
      title: `Reusable section smoke page ${suffix}`,
      slug: `reusable-section-smoke-page-${suffix}`,
      status: 'draft',
      content: {
        elements: [
          {
            id: `smoke-instance-${suffix}`,
            type: 'section',
            name: 'Smoke reusable section instance',
            x: 0,
            y: 0,
            width: 1200,
            height: 520,
            zIndex: 1,
            props: {
              reusableSection: {
                mode: 'synced',
                sectionId: section.id,
                slug: section.slug,
                name: section.name,
                sourceUpdatedAt: '2000-01-01T00:00:00.000Z',
              },
            },
            styles: {},
            children: [],
          },
        ],
        canvasSize: { width: 1200, height: 520 },
      },
      seo: {},
    }),
  });
  const page = payload.data?.page;
  assert(page?.id, `Unable to create reusable section smoke page: ${JSON.stringify(payload).slice(0, 500)}`);
  pageIds.push(page.id);
  return page;
};

const createPreviewPageFromReusableSectionContent = async (section, pageIds = []) => {
  const suffix = Date.now().toString(36);
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages`, {
    method: 'POST',
    body: JSON.stringify({
      title: `Reusable section responsive preview ${suffix}`,
      slug: `reusable-section-responsive-preview-${suffix}`,
      status: 'draft',
      content: {
        elements: section.content?.elements || [],
        canvasSize: section.content?.canvasSize || { width: 1200, height: 540 },
        customCSS: section.content?.customCSS || '',
      },
      seo: {},
    }),
  });
  const page = payload.data?.page;
  assert(page?.id, `Unable to create reusable section responsive preview page: ${JSON.stringify(payload).slice(0, 500)}`);
  pageIds.push(page.id);
  return page;
};

const deleteDemoPage = async (pageId) => {
  if (!pageId) return;
  await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`, { method: 'DELETE' });
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

const captureScreenshotData = async (client, screenshotPath) => {
  const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  return {
    screenshotPath,
    data: screenshot.data,
  };
};

const assertScreenshotPixelThresholds = async (client, label, screenshotData) => {
  const metrics = await evaluate(client, `(async () => {
    const image = new Image();
    image.src = ${JSON.stringify(`data:image/png;base64,${screenshotData}`)};
    await image.decode();

    const scale = Math.min(1, 360 / image.width, 360 / image.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, image.width, image.height, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

    let nonWhitePixels = 0;
    let darkPixels = 0;
    let sampledPixels = 0;
    let minLuma = 255;
    let maxLuma = 0;

    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3];
      if (alpha < 16) continue;

      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const luma = (red * 0.2126) + (green * 0.7152) + (blue * 0.0722);
      sampledPixels += 1;
      minLuma = Math.min(minLuma, luma);
      maxLuma = Math.max(maxLuma, luma);

      if ((Math.abs(255 - red) + Math.abs(255 - green) + Math.abs(255 - blue)) > 36) {
        nonWhitePixels += 1;
      }

      if (luma < 190) {
        darkPixels += 1;
      }
    }

    return {
      width: image.width,
      height: image.height,
      sampledPixels,
      nonWhiteRatio: sampledPixels > 0 ? nonWhitePixels / sampledPixels : 0,
      darkRatio: sampledPixels > 0 ? darkPixels / sampledPixels : 0,
      minLuma: Math.round(minLuma),
      maxLuma: Math.round(maxLuma),
      lumaRange: Math.round(maxLuma - minLuma),
    };
  })()`);

  assert(metrics.sampledPixels >= RESPONSIVE_SCREENSHOT_THRESHOLDS.minSampledPixels, `${label} screenshot sample was too small: ${JSON.stringify(metrics)}`);
  assert(metrics.nonWhiteRatio >= RESPONSIVE_SCREENSHOT_THRESHOLDS.minCanvasNonWhiteRatio, `${label} screenshot appears visually blank: ${JSON.stringify(metrics)}`);
  assert(metrics.darkRatio >= RESPONSIVE_SCREENSHOT_THRESHOLDS.minCanvasDarkRatio, `${label} screenshot is missing rendered text/detail contrast: ${JSON.stringify(metrics)}`);
  assert(metrics.lumaRange >= RESPONSIVE_SCREENSHOT_THRESHOLDS.minLumaRange, `${label} screenshot is missing visual contrast range: ${JSON.stringify(metrics)}`);
  return metrics;
};

const requestPagePreview = async (pageId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}/preview`, {
    method: 'POST',
    body: JSON.stringify({ ttlSeconds: 600 }),
  });
  const preview = payload.data || {};
  assert(preview.hostedUrl && preview.previewToken, `Unable to create page preview: ${JSON.stringify(payload).slice(0, 500)}`);
  return preview;
};

const openPublicPreviewTab = async (parentClient, url, viewport) => {
  const target = await parentClient.send('Target.createTarget', { url: 'about:blank' });
  const page = (await fetchJson('/json/list')).find((candidate) => candidate.id === target.targetId);
  assert(page?.webSocketDebuggerUrl, `No Chrome target found for public preview check ${target.targetId}`);

  const client = connectCdp(page.webSocketDebuggerUrl);
  await client.opened;
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  await client.send('DOM.enable');
  await client.send('Log.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.expectedBreakpoint === 'mobile',
  });
  await client.send('Page.navigate', { url });
  return client;
};

const navigateToReusableSections = async (client) => {
  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}/reusable-sections?siteId=${encodeURIComponent(SITE_ID)}` });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const body = document.body?.innerText || '';
      return {
        ready: Boolean(document.querySelector('[data-testid="reusable-sections-command-center"]')) &&
          Boolean(document.querySelector('[data-testid="reusable-sections-library"]')) &&
          Boolean(document.querySelector('[data-testid="reusable-sections-frontend-template-options"]')) &&
          Boolean(document.querySelector(${JSON.stringify(`[data-testid="reusable-sections-frontend-template-${FRONTEND_SECTION_TEMPLATE_ID}"]`)})) &&
          body.includes('Reusable section command center') &&
          body.includes(${JSON.stringify(FRONTEND_SECTION_TEMPLATE_NAME)}),
        body: body.slice(0, 1200),
        path: window.location.pathname,
        search: window.location.search,
      };
    })()`);

    if (state.ready) {
      return state;
    }

    if (attempt === 119) {
      throw new Error(`Reusable sections page did not render expected controls: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const assertReusableSectionsLayout = async (client) => {
  const layout = await evaluate(client, `(() => {
    const body = document.body?.innerText || '';
    return {
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      hasCommandCenter: Boolean(document.querySelector('[data-testid="reusable-sections-command-center"]')),
      hasFrontendTemplates: Boolean(document.querySelector('[data-testid="reusable-sections-frontend-template-options"]')) &&
        Boolean(document.querySelector(${JSON.stringify(`[data-testid="reusable-sections-frontend-template-${FRONTEND_SECTION_TEMPLATE_ID}"]`)})) &&
        body.includes('Frontend design sections') &&
        body.includes(${JSON.stringify(FRONTEND_SECTION_TEMPLATE_NAME)}),
      hasLibrary: Boolean(document.querySelector('[data-testid="reusable-sections-library"]')) &&
        body.includes('Section library'),
      hasEditor: body.includes('Create section') && body.includes('Content JSON'),
      hasVisualEditor: Boolean(document.querySelector('[data-testid="reusable-sections-visual-editor"]')) &&
        Boolean(document.querySelector('[data-testid="reusable-section-canvas-editor"]')) &&
        Boolean(document.querySelector('[data-testid="editor-save-status"]')) &&
        body.includes('Visual section editor'),
      hasWorkflowPanel: Boolean(document.querySelector('[data-testid="reusable-sections-workflows"]')) &&
        Boolean(document.querySelector('[data-testid="reusable-sections-export-visible"]')) &&
        Boolean(document.querySelector('[data-testid="reusable-sections-import"]')) &&
        body.includes('Import, versions, and instances') &&
        body.includes('Instance propagation'),
    };
  })()`);

  assert(layout.scrollWidth <= layout.width + 8, `Reusable sections page has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(
    layout.hasCommandCenter && layout.hasFrontendTemplates && layout.hasLibrary && layout.hasEditor && layout.hasVisualEditor && layout.hasWorkflowPanel,
    `Reusable sections page missing expected regions: ${JSON.stringify(layout)}`,
  );
  return layout;
};

const setReusableSectionField = async (client, testId, value) => evaluate(client, `(() => {
  const element = document.querySelector(${JSON.stringify(`[data-testid="${testId}"]`)});
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) {
    return { ok: false, reason: 'field-missing', testId: ${JSON.stringify(testId)}, body: document.body?.innerText?.slice(0, 1200) || '' };
  }

  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value');
  descriptor?.set?.call(element, ${JSON.stringify(value)});
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true };
})()`);

const clickReusableSectionControl = async (client, testId) => evaluate(client, `(() => {
  const button = document.querySelector(${JSON.stringify(`[data-testid="${testId}"]`)});
  if (!(button instanceof HTMLButtonElement)) {
    return { ok: false, reason: 'button-missing', testId: ${JSON.stringify(testId)}, body: document.body?.innerText?.slice(0, 1200) || '' };
  }
  if (button.disabled) return { ok: false, reason: 'button-disabled', testId: ${JSON.stringify(testId)} };
  button.click();
  return { ok: true };
})()`);

const waitForPageText = async (client, expectedText, label) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const body = document.body?.innerText || '';
      return { found: body.includes(${JSON.stringify(expectedText)}), body: body.slice(0, 1600) };
    })()`);

    if (state.found) return state;
    await sleep(100);
  }

  throw new Error(`Timed out waiting for ${label}: ${expectedText}`);
};

const createManualReusableSectionThroughUi = async (client) => {
  const before = await listReusableSections();
  const beforeIds = new Set(before.map((section) => section.id));
  const suffix = Date.now().toString(36);
  const slug = `manual-smoke-section-${suffix}`;

  const reset = await clickReusableSectionControl(client, 'reusable-section-reset');
  assert(reset.ok, `Unable to reset reusable section form: ${JSON.stringify(reset)}`);

  for (const [testId, value] of [
    ['reusable-section-name', `Manual smoke section ${suffix}`],
    ['reusable-section-slug', slug],
    ['reusable-section-category', 'manual-smoke'],
    ['reusable-section-description', 'Manual reusable section created by the smoke test.'],
    ['reusable-section-status', 'active'],
    ['reusable-section-tags', 'manual, smoke, starter'],
    ['reusable-section-content-json', '{"elements":[]}'],
  ]) {
    const changed = await setReusableSectionField(client, testId, value);
    assert(changed.ok, `Unable to set ${testId}: ${JSON.stringify(changed)}`);
  }

  const invalidSave = await clickReusableSectionControl(client, 'reusable-section-save');
  assert(invalidSave.ok, `Unable to submit invalid reusable section content: ${JSON.stringify(invalidSave)}`);
  await waitForPageText(client, 'Reusable section content must include at least one element.', 'manual JSON validation error');

  const starter = await clickReusableSectionControl(client, 'reusable-section-insert-starter');
  assert(starter.ok, `Unable to insert starter reusable section content: ${JSON.stringify(starter)}`);
  await waitForPageText(client, 'Starter section content inserted.', 'starter content message');

  const formatted = await clickReusableSectionControl(client, 'reusable-section-format-json');
  assert(formatted.ok, `Unable to format starter reusable section content: ${JSON.stringify(formatted)}`);
  await waitForPageText(client, '1 reusable root ready.', 'formatted content message');

  const saved = await clickReusableSectionControl(client, 'reusable-section-save');
  assert(saved.ok, `Unable to save manual reusable section: ${JSON.stringify(saved)}`);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const sections = await listReusableSections();
    const created = sections.find((section) => !beforeIds.has(section.id) && section.slug === slug);

    if (created) {
      assert(created.name === `Manual smoke section ${suffix}`, `Manual section name was not saved: ${created.name}`);
      assert(created.category === 'manual-smoke', `Manual section category was not saved: ${created.category}`);
      assert(created.tags?.includes('starter'), `Manual section tags were not saved: ${JSON.stringify(created.tags)}`);
      assert(created.content?.elements?.length === 1, `Manual section starter element was not saved: ${JSON.stringify(created.content)}`);
      assert(created.content?.canvasSize?.width === 1200 && created.content?.canvasSize?.height === 520, `Manual section canvas size was not normalized: ${JSON.stringify(created.content?.canvasSize)}`);
      assert(typeof created.content?.customCSS === 'string', `Manual section custom CSS was not persisted: ${JSON.stringify(created.content)}`);
      return created;
    }

    await sleep(250);
  }

  throw new Error('Manual reusable section was not created');
};

const deleteReusableSectionThroughUi = async (client, section) => {
  const deleteTestId = `reusable-section-delete-${section.id}`;

  const firstDelete = await clickReusableSectionControl(client, deleteTestId);
  assert(firstDelete.ok, `Unable to open reusable section delete confirmation: ${JSON.stringify(firstDelete)}`);

  await waitForPageText(client, 'Delete reusable section?', 'delete confirmation title');
  await waitForPageText(client, section.name, 'delete confirmation section name');

  const cancelled = await clickReusableSectionControl(client, 'reusable-section-delete-cancel');
  assert(cancelled.ok, `Unable to cancel reusable section deletion: ${JSON.stringify(cancelled)}`);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      dialogOpen: Boolean(document.querySelector('[data-testid="reusable-section-delete-confirmation"]')),
      cardVisible: Boolean(document.querySelector(${JSON.stringify(`[data-testid="reusable-section-card-${section.id}"]`)})),
    }))()`);
    if (!state.dialogOpen && state.cardVisible) break;
    if (attempt === 39) {
      throw new Error(`Reusable section delete cancel did not keep the section: ${JSON.stringify(state)}`);
    }
    await sleep(100);
  }

  const secondDelete = await clickReusableSectionControl(client, deleteTestId);
  assert(secondDelete.ok, `Unable to reopen reusable section delete confirmation: ${JSON.stringify(secondDelete)}`);
  const confirmed = await clickReusableSectionControl(client, 'reusable-section-delete-confirm');
  assert(confirmed.ok, `Unable to confirm reusable section deletion: ${JSON.stringify(confirmed)}`);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const sections = await listReusableSections();
    const deleted = !sections.some((candidate) => candidate.id === section.id);
    const state = await evaluate(client, `(() => {
      const body = document.body?.innerText || '';
      return {
        deleted: ${JSON.stringify(section.id)} && !document.querySelector(${JSON.stringify(`[data-testid="reusable-section-card-${section.id}"]`)}),
        hasNotice: body.includes(${JSON.stringify(`${section.name} deleted.`)}),
      };
    })()`);

    if (deleted && state.deleted && state.hasNotice) return true;
    await sleep(250);
  }

  throw new Error('Reusable section delete confirmation did not remove the section');
};

const createFrontendTemplateSectionThroughUi = async (client) => {
  const before = await listReusableSections();
  const beforeIds = new Set(before.map((section) => section.id));

  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector(${JSON.stringify(`[data-testid="reusable-sections-frontend-template-${FRONTEND_SECTION_TEMPLATE_ID}"]`)});
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'frontend-template-button-missing', body: document.body?.innerText?.slice(0, 1200) || '' };
    }
    if (button.disabled) return { ok: false, reason: 'frontend-template-button-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(clicked.ok, `Unable to create reusable section from frontend template: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const sections = await listReusableSections();
    const created = sections.find((section) => (
      !beforeIds.has(section.id) &&
      section.metadata?.frontendDesignTemplateId === FRONTEND_SECTION_TEMPLATE_ID
    ));

    if (created) {
      assert(created.name === 'Smoke contract hero section', `Frontend section name was not applied: ${created.name}`);
      assert(created.slug.startsWith('smoke-contract-hero-section'), `Frontend section slug was not applied: ${created.slug}`);
      assert(created.category === 'hero', `Frontend section category was not applied: ${created.category}`);
      assert(created.tags?.includes('frontend-contract'), `Frontend section tags were not applied: ${JSON.stringify(created.tags)}`);
      assert(created.metadata?.frontendDesignTemplateName === FRONTEND_SECTION_TEMPLATE_NAME, `Frontend template name was not stored: ${JSON.stringify(created.metadata)}`);
      assert(created.metadata?.frontendDesignSource?.label === 'Smoke reusable sections frontend', `Frontend source snapshot missing: ${JSON.stringify(created.metadata)}`);
      assert(created.metadata?.frontendDesignRoutePattern === '/smoke-section', `Frontend route pattern missing: ${JSON.stringify(created.metadata)}`);
      assert(created.metadata?.frontendDesignChrome?.header?.component === 'SmokeSectionsHeader', `Frontend chrome snapshot missing: ${JSON.stringify(created.metadata)}`);
      assert(created.metadata?.frontendDesignTokens?.fonts?.heading === 'Inter', `Frontend token snapshot missing: ${JSON.stringify(created.metadata)}`);
      assert(Array.isArray(created.metadata?.frontendDesignBindingHints) && created.metadata.frontendDesignBindingHints.length === 3, `Frontend binding hints missing: ${JSON.stringify(created.metadata)}`);
      assert(created.content?.canvasSize?.width === 1200 && created.content?.canvasSize?.height === 540, `Frontend canvas size was not retained: ${JSON.stringify(created.content?.canvasSize)}`);
      assert(created.content?.customCSS?.includes('smoke-contract-hero'), `Frontend custom CSS was not retained: ${created.content?.customCSS}`);
      assert(created.content?.elements?.[0]?.id === 'smoke-section-root', `Frontend root element was not retained: ${JSON.stringify(created.content?.elements)}`);
      assert(created.content?.elements?.[0]?.children?.length === 2, `Frontend child elements were not retained: ${JSON.stringify(created.content?.elements?.[0]?.children)}`);
      return created;
    }

    await sleep(250);
  }

  throw new Error('Frontend template reusable section was not created');
};

const assertReusableSectionHostedResponsiveRender = async (parentClient, section, pageIds = []) => {
  const page = await createPreviewPageFromReusableSectionContent(section, pageIds);
  const preview = await requestPagePreview(page.id);
  const requiredElementIds = ['smoke-section-root', 'smoke-section-heading', 'smoke-section-copy'];
  const results = {};

  try {
    for (const viewport of RESPONSIVE_VIEWPORTS) {
      let publicClient = null;
      try {
        publicClient = await openPublicPreviewTab(parentClient, preview.hostedUrl, viewport);
        let renderState = null;

        for (let attempt = 0; attempt < 100; attempt += 1) {
          renderState = await evaluate(publicClient, `(() => {
            const root = document.querySelector('[data-backy-render-breakpoint]');
            const canvas = document.querySelector('.backy-canvas');
            const elements = Array.from(document.querySelectorAll('[data-element-id]'));
            const requiredElementIds = ${JSON.stringify(requiredElementIds)};
            const byId = new Map(elements.map((element) => [element.getAttribute('data-element-id'), element]));
            const requiredRects = requiredElementIds.map((id) => {
              const element = byId.get(id);
              const rect = element?.getBoundingClientRect();
              return {
                id,
                present: Boolean(element),
                width: Math.round(rect?.width || 0),
                height: Math.round(rect?.height || 0),
                left: Math.round(rect?.left || 0),
                top: Math.round(rect?.top || 0),
              };
            });
            const canvasRect = canvas?.getBoundingClientRect();
            const body = document.body?.innerText || '';
            return {
              viewport: { width: window.innerWidth, height: window.innerHeight },
              breakpoint: root?.getAttribute('data-backy-render-breakpoint') || '',
              renderScale: Number(root?.getAttribute('data-backy-render-scale') || 0),
              canvasScale: Number(document.querySelector('[data-backy-canvas-scale]')?.getAttribute('data-backy-canvas-scale') || 0),
              canvasWidth: Math.round(canvasRect?.width || 0),
              canvasHeight: Math.round(canvasRect?.height || 0),
              renderedElementCount: elements.length,
              missingElementIds: requiredRects.filter((rect) => !rect.present).map((rect) => rect.id),
              collapsedElementIds: requiredRects.filter((rect) => rect.present && (rect.width <= 0 || rect.height <= 0)).map((rect) => rect.id),
              requiredRects,
              horizontalOverflow: (document.documentElement?.scrollWidth || window.innerWidth) - window.innerWidth,
              hasFrontendHeading: body.includes('Design-preserved backend section'),
              hasFrontendCopy: body.includes('Backy should retain frontend section structure'),
              notFoundVisible: /not found|could not find|404/i.test(body),
              body: body.slice(0, 360),
            };
          })()`);

          if (
            renderState.breakpoint === viewport.expectedBreakpoint
            && renderState.renderedElementCount >= requiredElementIds.length
            && renderState.missingElementIds.length === 0
            && renderState.collapsedElementIds.length === 0
            && renderState.canvasWidth > 0
            && renderState.canvasHeight > 0
            && renderState.renderScale > 0
            && renderState.canvasScale > 0
            && renderState.horizontalOverflow <= 4
            && renderState.hasFrontendHeading
            && renderState.hasFrontendCopy
            && !renderState.notFoundVisible
          ) {
            break;
          }

          if (attempt === 99) {
            throw new Error(`Reusable section hosted ${viewport.key} preview did not render expected content: ${JSON.stringify(renderState)}`);
          }

          await sleep(200);
        }

        const screenshotPath = path.join(RESPONSIVE_SCREENSHOT_DIR, `backy-reusable-section-public-${viewport.key}.png`);
        const screenshot = await captureScreenshotData(publicClient, screenshotPath);
        const screenshotMetrics = await assertScreenshotPixelThresholds(
          publicClient,
          `Reusable section hosted ${viewport.key} preview`,
          screenshot.data,
        );

        results[viewport.key] = {
          ...renderState,
          screenshotPath,
          screenshotMetrics,
        };
      } finally {
        if (publicClient) {
          try {
            await publicClient.send('Page.close');
          } catch {
            // The target may already be closed by Chrome during cleanup.
          }
          publicClient.close();
        }
      }
    }
  } finally {
    await deleteDemoPage(page.id);
    const pageIndex = pageIds.indexOf(page.id);
    if (pageIndex !== -1) {
      pageIds.splice(pageIndex, 1);
    }
  }

  return {
    pageId: page.id,
    preview: {
      hostedUrl: preview.hostedUrl,
      renderUrl: preview.renderUrl,
      expiresAt: preview.expiresAt,
    },
    results,
  };
};

const exerciseReusableSectionWorkflows = async (client, section, pageIds = []) => {
  const visualSaved = await clickReusableSectionControl(client, 'editor-save-page');
  assert(visualSaved.ok, `Unable to save reusable section through visual editor: ${JSON.stringify(visualSaved)}`);
  await waitForPageText(client, `${section.name} saved from the visual editor.`, 'visual reusable section save notice');

  const exported = await exportReusableSections([section.id]);
  assert(exported.export.sectionCount === 1, `Selected reusable section export should contain one section: ${JSON.stringify(exported.export)}`);
  assert(exported.sections?.[0]?.slug === section.slug, `Selected reusable section export did not include expected slug: ${JSON.stringify(exported.sections?.[0])}`);

  const page = await createDemoPageWithReusableSectionInstance(section, pageIds);
  try {
    const workflowLoaded = await clickReusableSectionControl(client, 'reusable-section-workflow-load');
    assert(workflowLoaded.ok, `Unable to load reusable section workflow state: ${JSON.stringify(workflowLoaded)}`);

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const state = await evaluate(client, `(() => {
        const body = document.body?.innerText || '';
        return {
          hasInstanceTotals: body.includes('1 stale') || body.includes('1\\nStale'),
          hasVersionHistory: body.includes('Version history') && body.includes('v1'),
          hasMetadataButton: Boolean(document.querySelector('[data-testid="reusable-section-metadata-save"]')),
          body: body.slice(0, 1800),
        };
      })()`);
      if (state.hasInstanceTotals && state.hasVersionHistory && state.hasMetadataButton) break;
      if (attempt === 99) {
        throw new Error(`Reusable section workflow state did not load: ${JSON.stringify(state)}`);
      }
      await sleep(250);
    }

    const metadataSaved = await clickReusableSectionControl(client, 'reusable-section-metadata-save');
    assert(metadataSaved.ok, `Unable to save reusable section metadata: ${JSON.stringify(metadataSaved)}`);
    await waitForPageText(client, `${section.name} metadata saved.`, 'metadata save notice');

    const changed = await updateReusableSection(section.id, {
      name: section.name,
      content: {
        ...section.content,
        elements: [
          {
            ...section.content.elements[0],
            props: {
              ...(section.content.elements[0]?.props || {}),
              content: 'Reusable section smoke version changed',
            },
          },
        ],
      },
      updatedBy: 'smoke',
    });
    assert(changed?.id === section.id, `Unable to update reusable section for version smoke: ${JSON.stringify(changed)}`);

    await navigateToReusableSections(client);
    const selected = await evaluate(client, `(() => {
      const cardButton = document.querySelector(${JSON.stringify(`[data-testid="reusable-section-card-${section.id}"] button`)});
      if (!(cardButton instanceof HTMLButtonElement)) return { ok: false, reason: 'section-card-button-missing' };
      cardButton.click();
      return { ok: true };
    })()`);
    assert(selected.ok, `Unable to reselect reusable section after version update: ${JSON.stringify(selected)}`);

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const state = await evaluate(client, `(() => {
        const body = document.body?.innerText || '';
        return {
          hasCurrentVersion: body.includes('v4 current'),
          hasPreviousVersion: body.includes('v3') && body.includes('v2') && body.includes('v1'),
          body: body.slice(0, 1800),
        };
      })()`);
      if (state.hasCurrentVersion && state.hasPreviousVersion) break;
      if (attempt === 99) {
        throw new Error(`Reusable section versions did not show update history: ${JSON.stringify(state)}`);
      }
      await sleep(250);
    }
  } finally {
    await deleteDemoPage(page.id);
    const pageIndex = pageIds.indexOf(page.id);
    if (pageIndex !== -1) {
      pageIds.splice(pageIndex, 1);
    }
  }
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-reusable-sections-${Date.now()}`);
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

const cleanup = async ({ client, childProcess, userDataDir, sectionIds, pageIds, originalFrontendDesign }) => {
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

  for (const pageId of pageIds || []) {
    if (pageId) {
      try {
        await deleteDemoPage(pageId);
      } catch {
        // Temporary smoke pages are deleted best-effort.
      }
    }
  }

  for (const sectionId of sectionIds || []) {
    if (sectionId) {
      try {
        await deleteReusableSection(sectionId);
      } catch {
        // Temporary smoke sections are deleted best-effort.
      }
    }
  }

  if (originalFrontendDesign) {
    try {
      await patchFrontendDesign(originalFrontendDesign);
    } catch {
      // Restore is best-effort so cleanup does not mask the primary failure.
    }
  }
};

const main = async () => {
  let client;
  let childProcess;
  let userDataDir;
  const sectionIds = [];
  const pageIds = [];
  let originalFrontendDesign;

  try {
    assertReusableSectionsRouteSourceContract();
    await loginAdminApi();
    originalFrontendDesign = await getFrontendDesign();
    await patchFrontendDesign(smokeFrontendDesignContract());

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
    await seedBrowserSessionCookie(client, apiAdminSessionToken);
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: authStorageScript(apiAdminSessionToken) });

    await navigateToReusableSections(client);
    await assertReusableSectionsLayout(client);
    const manualSection = await createManualReusableSectionThroughUi(client);
    sectionIds.push(manualSection.id);
    await deleteReusableSectionThroughUi(client, manualSection);
    const deletedManualIndex = sectionIds.indexOf(manualSection.id);
    if (deletedManualIndex !== -1) {
      sectionIds.splice(deletedManualIndex, 1);
    }
    const section = await createFrontendTemplateSectionThroughUi(client);
    sectionIds.push(section.id);
    const hostedResponsiveRender = await assertReusableSectionHostedResponsiveRender(client, section, pageIds);
    await exerciseReusableSectionWorkflows(client, section, pageIds);

    await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }).then((result) => {
      fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(result.data, 'base64'));
    });

    await Promise.all(sectionIds.splice(0).map((createdSectionId) => deleteReusableSection(createdSectionId)));
    await patchFrontendDesign(originalFrontendDesign);
    originalFrontendDesign = null;

    console.log(JSON.stringify({
      ok: true,
      siteId: SITE_ID,
      manualSectionId: manualSection.id,
      manualSectionSlug: manualSection.slug,
      frontendSectionId: section.id,
      frontendSectionSlug: section.slug,
      frontendTemplateId: FRONTEND_SECTION_TEMPLATE_ID,
      hostedResponsiveRender,
      screenshot: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await cleanup({
      client,
      childProcess,
      userDataDir,
      sectionIds,
      pageIds,
      originalFrontendDesign,
    });
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
