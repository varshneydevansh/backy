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
const FRONTEND_SECTION_TEMPLATE_ID = 'smoke-section-contract-template';
const FRONTEND_SECTION_TEMPLATE_NAME = 'Smoke Frontend Hero Section';

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
    };
  })()`);

  assert(layout.scrollWidth <= layout.width + 8, `Reusable sections page has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(
    layout.hasCommandCenter && layout.hasFrontendTemplates && layout.hasLibrary && layout.hasEditor,
    `Reusable sections page missing expected regions: ${JSON.stringify(layout)}`,
  );
  return layout;
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

const cleanup = async ({ client, childProcess, userDataDir, sectionId, originalFrontendDesign }) => {
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

  if (sectionId) {
    try {
      await deleteReusableSection(sectionId);
    } catch {
      // Temporary smoke sections are deleted best-effort.
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
  let sectionId;
  let originalFrontendDesign;

  try {
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
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: AUTH_STORAGE_SCRIPT });

    await navigateToReusableSections(client);
    await assertReusableSectionsLayout(client);
    const section = await createFrontendTemplateSectionThroughUi(client);
    sectionId = section.id;

    await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }).then((result) => {
      fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(result.data, 'base64'));
    });

    await deleteReusableSection(sectionId);
    sectionId = null;
    await patchFrontendDesign(originalFrontendDesign);
    originalFrontendDesign = null;

    console.log(JSON.stringify({
      ok: true,
      siteId: SITE_ID,
      sectionId: section.id,
      sectionSlug: section.slug,
      frontendTemplateId: FRONTEND_SECTION_TEMPLATE_ID,
      screenshot: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await cleanup({
      client,
      childProcess,
      userDataDir,
      sectionId,
      originalFrontendDesign,
    });
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
