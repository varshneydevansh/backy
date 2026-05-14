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

const cleanup = async ({ client, childProcess, userDataDir, sectionIds, originalFrontendDesign }) => {
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
  let originalFrontendDesign;

  try {
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
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: AUTH_STORAGE_SCRIPT });

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
      screenshot: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await cleanup({
      client,
      childProcess,
      userDataDir,
      sectionIds,
      originalFrontendDesign,
    });
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
