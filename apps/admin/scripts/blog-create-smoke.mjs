#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_BLOG_CREATE_SMOKE_SITE_ID || 'site-demo';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_BLOG_CREATE_CDP_PORT || 9371);
const SCREENSHOT_PATH = process.env.BACKY_BLOG_CREATE_SCREENSHOT || path.join(os.tmpdir(), 'backy-blog-create-smoke.png');
const VISUAL_SCREENSHOT_DIR = process.env.BACKY_BLOG_CREATE_VISUAL_DIR || path.join(os.tmpdir(), 'backy-blog-create-visual');
const DESKTOP_VISUAL_SCREENSHOT_PATH = path.join(VISUAL_SCREENSHOT_DIR, 'backy-blog-create-desktop.png');
const FOCUS_VISUAL_SCREENSHOT_PATH = path.join(VISUAL_SCREENSHOT_DIR, 'backy-blog-create-focus.png');
const FRONTEND_BLOG_TEMPLATE_ID = 'smoke-blog-contract-template';
const FRONTEND_BLOG_TEMPLATE_NAME = 'Smoke Blog Contract';
let apiAdminSessionToken = '';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const isIgnorableBrowserLogError = (event) => (
  event.method === 'Log.entryAdded' &&
  event.params?.entry?.source === 'intervention' &&
  /beforeunload.*confirmation panel/i.test(event.params?.entry?.text || '')
);

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
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(endpoint.startsWith('/api/admin/') && apiAdminSessionToken ? { authorization: `Bearer ${apiAdminSessionToken}` } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(payload.error || payload).slice(0, 300)}`);
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
  assert(updated?.schemaVersion === 'backy.frontend-design.v1', `Patch did not return frontend design: ${JSON.stringify(payload).slice(0, 500)}`);
  return updated;
};

const smokeFrontendDesignContract = () => ({
  schemaVersion: 'backy.frontend-design.v1',
  status: 'synced',
  source: {
    type: 'custom-frontend',
    label: 'Smoke blog frontend',
    url: 'https://example.com/smoke-blog-frontend',
    repository: 'example/backy-smoke-blog-frontend',
    branch: 'main',
  },
  tokens: {
    colors: {
      primary: '#0f766e',
      text: '#111827',
    },
    fonts: {
      heading: 'Inter',
      body: 'Inter',
    },
    customCss: ':root { --backy-smoke-blog-primary: #0f766e; }',
  },
  chrome: {
    header: { component: 'SmokeBlogHeader', source: 'site.navigation.primary' },
    navigation: { component: 'SmokeBlogNavigation', source: 'site.navigation.primary' },
    footer: { component: 'SmokeBlogFooter', source: 'site.navigation.footer' },
  },
  templates: [
    {
      id: FRONTEND_BLOG_TEMPLATE_ID,
      type: 'blogPost',
      name: FRONTEND_BLOG_TEMPLATE_NAME,
      routePattern: '/blog/smoke-contract',
      description: 'Frontend contract blog template used by the blog create smoke.',
      canvasSize: { width: 1260, height: 940 },
      bindingHints: [
        { role: 'post.title', binding: 'post.title' },
        { role: 'post.content', binding: 'post.content' },
      ],
    },
  ],
  editableMap: [
    {
      selector: '[data-backy-role="post-title"]',
      role: 'post.title',
      binding: 'post.title',
      fields: ['content'],
    },
  ],
  notes: 'Temporary contract for validating blog creation from custom frontend templates.',
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

const captureScreenshot = async (client, screenshotPath, options = {}) => {
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  const screenshot = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    ...options,
  });
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  return screenshotPath;
};

const assertBlogCreateVisualState = async (client, label, screenshotPath, { focus = false } = {}) => {
  await evaluate(client, `(() => {
    window.scrollTo(0, 0);
    return true;
  })()`);
  await sleep(250);

  const state = await evaluate(client, `(() => {
    const bodyText = document.body?.innerText || '';
    const commandCenter = document.querySelector('[data-testid="blog-create-command-center"]');
    const workspaceGrid = document.querySelector('[data-testid="blog-create-workspace-grid"]');
    const canvasShell = document.querySelector('[data-testid="blog-create-canvas-shell"]');
    const editorCanvas = document.querySelector('[data-testid="editor-canvas"]');
    const componentLibrary = document.querySelector('[data-testid="editor-component-library"]');
    const inspector = document.querySelector('[data-testid="editor-inspector"]');
    const focusBanner = document.querySelector('[data-testid="blog-create-focus-banner"]');
    const frontendTemplatePanel = document.querySelector('[data-testid="blog-frontend-template-panel"]');
    const writingPanel = document.querySelector('[data-testid="blog-create-writing-panel"]');
    const frontendTemplateRoot = document.querySelector('[data-element-id="frontend-blog-template-${FRONTEND_BLOG_TEMPLATE_ID}"]');
    const activeTemplate = document.querySelector('[data-testid="blog-frontend-template-${FRONTEND_BLOG_TEMPLATE_ID}"]');
    const payload = document.querySelector('[data-testid="blog-create-payload"]');
    const rect = (node) => {
      const box = node?.getBoundingClientRect();
      return box ? {
        width: Math.round(box.width),
        height: Math.round(box.height),
        left: Math.round(box.left),
        right: Math.round(box.right),
        top: Math.round(box.top),
      } : null;
    };

    return {
      label: ${JSON.stringify(label)},
      focus: ${JSON.stringify(focus)},
      viewport: { width: window.innerWidth, height: window.innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      commandVisible: Boolean(commandCenter && rect(commandCenter)?.width > 320 && rect(commandCenter)?.height > 120),
      workspaceVisible: Boolean(workspaceGrid && rect(workspaceGrid)?.width > 320 && rect(workspaceGrid)?.height > 400),
      canvasVisible: Boolean(canvasShell && rect(canvasShell)?.width > 320 && rect(canvasShell)?.height > 500),
      editorCanvasVisible: Boolean(editorCanvas && rect(editorCanvas)?.width > 260 && rect(editorCanvas)?.height > 240),
      componentLibraryVisible: Boolean(componentLibrary && rect(componentLibrary)?.width > 180 && rect(componentLibrary)?.height > 240),
      inspectorVisible: Boolean(inspector && rect(inspector)?.width > 180 && rect(inspector)?.height > 240),
      focusBannerVisible: Boolean(focusBanner && rect(focusBanner)?.width > 320 && rect(focusBanner)?.height > 80),
      draftPanel: Boolean(document.querySelector('#blog-create-draft')),
      seoPanel: Boolean(document.querySelector('#blog-create-seo')),
      mediaPanel: Boolean(document.querySelector('#blog-create-media')),
      publishPanel: Boolean(document.querySelector('#blog-create-publish')),
      taxonomyPanel: Boolean(document.querySelector('#blog-create-taxonomy')),
      writingPanel: Boolean(writingPanel),
      writingMetrics: Boolean(document.querySelector('[data-testid="blog-create-writing-metrics"]')),
      addSection: Boolean(document.querySelector('[data-testid="blog-create-add-section"]')),
      addQuote: Boolean(document.querySelector('[data-testid="blog-create-add-quote"]')),
      frontendTemplatePanel: Boolean(frontendTemplatePanel),
      frontendTemplateRoot: Boolean(frontendTemplateRoot),
      activeTemplate: activeTemplate?.getAttribute('data-active') || '',
      payloadTemplateId: (() => {
        try {
          return JSON.parse(payload?.textContent || '{}')?.template?.id || '';
        } catch {
          return 'invalid-json';
        }
      })(),
      hasSavePreviewAction: bodyText.includes('Save draft and preview'),
      hasFocusAction: bodyText.includes('Focus canvas'),
      hasShowPanelsAction: bodyText.includes('Show panels'),
      hasGroupingMeta: bodyText.includes('Cmd/Ctrl+G grouping'),
      hasBreakpointControls: bodyText.includes('Desktop') && bodyText.includes('Tablet') && bodyText.includes('Mobile'),
      hasFrameworkOverlay: /Failed to compile|Unhandled Runtime Error|Vite Error|Internal Server Error/i.test(bodyText),
      body: bodyText.slice(0, 3000),
    };
  })()`);

  assert(state.workspaceVisible, `${label} workspace grid was not visibly rendered: ${JSON.stringify(state)}`);
  assert(state.canvasVisible && state.editorCanvasVisible, `${label} editor canvas was not visibly rendered: ${JSON.stringify(state)}`);
  assert(state.componentLibraryVisible && state.inspectorVisible, `${label} editor side panels were not visibly rendered: ${JSON.stringify(state)}`);
  assert(state.hasBreakpointControls && state.hasGroupingMeta, `${label} editor breakpoint/grouping controls missing: ${JSON.stringify(state)}`);
  assert(state.hasSavePreviewAction, `${label} save-preview action missing: ${JSON.stringify(state)}`);
  assert(state.horizontalOverflow <= 4, `${label} has horizontal overflow: ${JSON.stringify(state)}`);
  assert(!state.hasFrameworkOverlay, `${label} rendered a framework/runtime overlay: ${JSON.stringify(state)}`);

  if (focus) {
    assert(state.focusBannerVisible && state.hasShowPanelsAction, `${label} focus banner/actions missing: ${JSON.stringify(state)}`);
    assert(!state.commandVisible && !state.draftPanel && !state.publishPanel, `${label} focus mode did not hide create panels: ${JSON.stringify(state)}`);
  } else {
    assert(state.commandVisible, `${label} command center missing: ${JSON.stringify(state)}`);
    assert(state.draftPanel && state.seoPanel && state.mediaPanel && state.publishPanel && state.taxonomyPanel && state.writingPanel, `${label} create panels missing: ${JSON.stringify(state)}`);
    assert(state.writingMetrics && state.addSection && state.addQuote, `${label} writing structure controls missing: ${JSON.stringify(state)}`);
    assert(state.frontendTemplatePanel && state.frontendTemplateRoot && state.activeTemplate === 'true' && state.payloadTemplateId === FRONTEND_BLOG_TEMPLATE_ID, `${label} frontend template handoff missing: ${JSON.stringify(state)}`);
    assert(state.hasFocusAction, `${label} focus canvas action missing: ${JSON.stringify(state)}`);
  }

  await captureScreenshot(client, screenshotPath);
  return { ...state, screenshotPath };
};

const parseCssPixel = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getElementBox = async (client, elementId) => (
  evaluate(client, `(() => {
    const node = document.querySelector('[data-element-id="${elementId}"]');
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return {
      id: node.getAttribute('data-element-id'),
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      left: style.left,
      top: style.top,
      cssWidth: style.width,
      cssHeight: style.height,
      text: node.textContent.trim().slice(0, 100),
    };
  })()`)
);

const readEditorElementState = async (client, elementIds) => {
  const entries = await Promise.all(elementIds.map(async (elementId) => {
    const box = await getElementBox(client, elementId);
    assert(box, `Missing element ${elementId} while reading editor state`);

    return [
      elementId,
      {
        x: Math.round(parseCssPixel(box.left) ?? box.x),
        y: Math.round(parseCssPixel(box.top) ?? box.y),
        width: Math.round(parseCssPixel(box.cssWidth) ?? box.width),
        height: Math.round(parseCssPixel(box.cssHeight) ?? box.height),
      },
    ];
  }));

  return Object.fromEntries(entries);
};

const clickButtonByAriaLabel = async (client, ariaLabel) => {
  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector('button[aria-label="${ariaLabel}"]');
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);

  assert(clicked, `Unable to click button with aria-label ${ariaLabel}`);
  await sleep(250);
};

const switchToPropertiesPanel = async (client) => {
  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="editor-tab-properties"]');
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);

  assert(clicked, 'Unable to switch editor inspector to Properties panel');
  await sleep(250);
};

const selectLayerById = async (client, elementId) => {
  const layersReady = await evaluate(client, `(() => {
    const layersButton = document.querySelector('[data-testid="editor-tab-layers"]');
    if (!(layersButton instanceof HTMLButtonElement)) {
      return {
        ok: false,
        reason: 'missing-layers-tab',
        inspectorText: document.querySelector('[data-testid="editor-inspector"]')?.textContent || '',
      };
    }
    layersButton.click();
    return { ok: true };
  })()`);

  assert(layersReady?.ok, `Unable to open Layers panel: ${JSON.stringify(layersReady)}`);
  await sleep(150);

  let clicked = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    clicked = await evaluate(client, `(() => {
      const layer = document.querySelector(${JSON.stringify(`[data-layer-id="${elementId}"]`)});
      if (!(layer instanceof HTMLElement)) {
        return {
          ok: false,
          availableLayerIds: Array.from(document.querySelectorAll('[data-layer-id]'))
            .map((node) => node.getAttribute('data-layer-id')),
          panelText: document.querySelector('[data-testid="editor-inspector"]')?.textContent || '',
        };
      }
      layer.click();
      return { ok: true };
    })()`);

    if (clicked?.ok) {
      break;
    }
    await sleep(100);
  }

  assert(clicked?.ok, `Unable to select layer ${elementId}: ${JSON.stringify(clicked)}`);
  await sleep(250);
  await switchToPropertiesPanel(client);
};

const setLayoutNumberInput = async (client, label, value) => {
  const testIdByLabel = {
    X: 'editor-layout-x',
    Y: 'editor-layout-y',
    Width: 'editor-layout-width',
    Height: 'editor-layout-height',
  };
  const testId = testIdByLabel[label];
  assert(testId, `Unknown layout label ${label}`);

  const focused = await evaluate(client, `(() => {
    const input = document.querySelector('[data-testid="${testId}"]');
    if (!(input instanceof HTMLInputElement)) {
      return {
        ok: false,
        testId: ${JSON.stringify(testId)},
        inspectorText: document.querySelector('[data-testid="editor-inspector"]')?.textContent || '',
      };
    }
    input.focus();
    input.select();
    return { ok: true };
  })()`);

  assert(focused?.ok, `Unable to focus ${label} layout input: ${JSON.stringify(focused)}`);
  const changed = await evaluate(client, `(() => {
    const input = document.querySelector('[data-testid="${testId}"]');
    if (!(input instanceof HTMLInputElement)) {
      return false;
    }
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, ${JSON.stringify(String(value))});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.value === ${JSON.stringify(String(value))};
  })()`);

  assert(changed, `Unable to change ${label} layout input to ${value}`);
  await sleep(250);
};

const waitForElementState = async (client, elementId, predicate, label) => {
  let lastState = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    lastState = (await readEditorElementState(client, [elementId]))[elementId];
    if (predicate(lastState)) {
      return lastState;
    }
    await sleep(100);
  }
  throw new Error(`${label}: ${JSON.stringify(lastState)}`);
};

const readBreakpointOverrideControls = async (client) => {
  const controls = await evaluate(client, `(() => {
    const panel = document.querySelector('[data-testid="editor-breakpoint-override"]');
    const layoutButton = document.querySelector('[data-testid="editor-breakpoint-reset-layout"]');
    return {
      panelText: panel?.textContent || '',
      layoutReset: layoutButton instanceof HTMLButtonElement
        ? { exists: true, disabled: layoutButton.disabled, title: layoutButton.getAttribute('title') || '' }
        : { exists: false },
    };
  })()`);

  assert(controls?.panelText, `Unable to read breakpoint override controls: ${JSON.stringify(controls)}`);
  return controls;
};

const assertMobileBreakpointAuthoring = async (client) => {
  const headingId = `frontend-blog-template-${FRONTEND_BLOG_TEMPLATE_ID}-heading`;
  await selectLayerById(client, headingId);
  await clickButtonByAriaLabel(client, 'Desktop canvas');
  await selectLayerById(client, headingId);
  const desktopBefore = (await readEditorElementState(client, [headingId]))[headingId];

  await clickButtonByAriaLabel(client, 'Mobile canvas');
  await selectLayerById(client, headingId);
  await setLayoutNumberInput(client, 'X', 24);
  await setLayoutNumberInput(client, 'Width', 320);

  const mobileAfter = await waitForElementState(
    client,
    headingId,
    (state) => state.x === 24 && state.width === 320,
    'Mobile heading override did not update editor element state',
  );
  const overrideControls = await readBreakpointOverrideControls(client);
  assert(
    /mobile override/i.test(overrideControls.panelText) && overrideControls.layoutReset.exists && overrideControls.layoutReset.disabled === false,
    `Mobile override controls did not expose active layout state: ${JSON.stringify(overrideControls)}`,
  );

  await clickButtonByAriaLabel(client, 'Desktop canvas');
  const desktopAfter = (await readEditorElementState(client, [headingId]))[headingId];
  assert(
    desktopAfter.x === desktopBefore.x && desktopAfter.width === desktopBefore.width,
    `Desktop layout changed while authoring mobile override: ${JSON.stringify({ desktopBefore, desktopAfter })}`,
  );

  await clickButtonByAriaLabel(client, 'Mobile canvas');
  await waitForElementState(
    client,
    headingId,
    (state) => state.x === 24 && state.width === 320,
    'Mobile heading override did not hydrate after breakpoint switch',
  );

  return {
    headingId,
    desktopBefore,
    desktopAfter,
    mobileAfter,
    overridePanel: overrideControls.panelText,
  };
};

const assertWritingStructureTools = async (client) => {
  for (const testId of ['blog-create-add-section', 'blog-create-add-quote']) {
    const clicked = await evaluate(client, `(() => {
      const button = document.querySelector('[data-testid="${testId}"]');
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return { ok: false, found: Boolean(button), disabled: button instanceof HTMLButtonElement ? button.disabled : null };
      }
      button.click();
      return { ok: true };
    })()`);
    assert(clicked?.ok, `Unable to click ${testId}: ${JSON.stringify(clicked)}`);
    await sleep(300);
  }

  const state = await evaluate(client, `(() => {
    const metrics = document.querySelector('[data-testid="blog-create-writing-metrics"]')?.textContent || '';
    const section = document.querySelector('[data-element-id^="blog-longform-section-"]');
    const quote = document.querySelector('[data-element-id^="blog-longform-quote-"]');
    return {
      metrics,
      sectionId: section?.getAttribute('data-element-id') || '',
      quoteId: quote?.getAttribute('data-element-id') || '',
      hasSectionText: document.body?.innerText?.includes('New article section') || false,
      hasQuoteText: document.body?.innerText?.includes('memorable pull quote') || false,
    };
  })()`);

  assert(state.sectionId && state.quoteId, `Long-form canvas blocks were not inserted: ${JSON.stringify(state)}`);
  assert(state.hasSectionText && state.hasQuoteText, `Long-form inserted block text missing: ${JSON.stringify(state)}`);
  assert(/Total words/i.test(state.metrics) && /Reading time/i.test(state.metrics), `Writing metrics did not render: ${JSON.stringify(state)}`);
  return state;
};

const navigateToBlogCreate = async (client) => {
  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}/blog/new?siteId=${encodeURIComponent(SITE_ID)}&designTemplate=${encodeURIComponent(FRONTEND_BLOG_TEMPLATE_ID)}` });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="blog-create-command-center"]')),
      title: document.body?.innerText?.includes('New Blog Post') || false,
      seo: Boolean(document.querySelector('#blog-create-seo')),
      media: Boolean(document.querySelector('#blog-create-media')),
      canvas: Boolean(document.querySelector('[data-testid="editor-canvas"]')),
      frontendTemplateRoot: Boolean(document.querySelector('[data-element-id="frontend-blog-template-${FRONTEND_BLOG_TEMPLATE_ID}"]')),
      frontendPanel: Boolean(document.querySelector('[data-testid="blog-frontend-template-options"]')),
      frontendTemplateActive: document.querySelector('[data-testid="blog-frontend-template-${FRONTEND_BLOG_TEMPLATE_ID}"]')?.getAttribute('data-active') || '',
      payloadTemplateId: JSON.parse(document.querySelector('[data-testid="blog-create-payload"]')?.textContent || '{}')?.template?.id || '',
      payloadTemplateSource: JSON.parse(document.querySelector('[data-testid="blog-create-payload"]')?.textContent || '{}')?.template?.source || '',
      body: document.body?.innerText?.slice(0, 200) || '',
    }))()`);

    if (
      state.ready
      && state.title
      && state.seo
      && state.media
      && state.canvas
      && state.frontendTemplateRoot
      && state.frontendPanel
      && state.frontendTemplateActive === 'true'
      && state.payloadTemplateId === FRONTEND_BLOG_TEMPLATE_ID
      && state.payloadTemplateSource === 'frontend-design'
    ) {
      return state;
    }

    if (attempt === 99) {
      throw new Error(`Blog create page did not render expected controls: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const fillBlogCreateForm = async (client, slug) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const ready = await evaluate(client, `(() => {
      const title = document.querySelector('#blog-create-title');
      const checkbox = Array.from(document.querySelectorAll('#blog-create-seo label')).find((candidate) => (
        /No index/.test(candidate.textContent || '')
      ))?.querySelector('input[type="checkbox"]');
      return {
        titleReady: title instanceof HTMLInputElement && !title.disabled,
        checkboxReady: checkbox instanceof HTMLInputElement && !checkbox.disabled,
      };
    })()`);

    if (ready.titleReady && ready.checkboxReady) {
      break;
    }

    if (attempt === 79) {
      throw new Error(`Blog create controls stayed disabled: ${JSON.stringify(ready)}`);
    }

    await sleep(250);
  }

  const result = await evaluate(client, `(() => {
    const setInput = (selector, value) => {
      const node = document.querySelector(selector);
      if (!node) return false;
      const proto = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      setter?.call(node, value);
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };

    return {
      title: setInput('#blog-create-title', 'Smoke Blog Create'),
      slug: setInput('#blog-create-slug', '${slug}'),
      excerpt: setInput('#blog-create-excerpt', 'Smoke summary long enough for readiness, feeds, and search previews.'),
      seoTitle: setInput('#blog-create-seo-title', 'Smoke Blog Create SEO Title'),
      canonical: setInput('#blog-create-canonical', '/blog/${slug}'),
      seoDescription: setInput('#blog-create-seo-description', 'Smoke SEO description long enough to satisfy search preview readiness and frontend handoff validation.'),
      ogImage: setInput('#blog-create-og-image', 'https://example.com/smoke-og.jpg'),
      noIndex: (() => {
        const label = Array.from(document.querySelectorAll('#blog-create-seo label')).find((candidate) => (
          /No index/.test(candidate.textContent || '')
        ));
        const node = label?.querySelector('input[type="checkbox"]');
        if (!(node instanceof HTMLInputElement)) return false;
        if (!node.checked) {
          node.click();
        }
        return true;
      })(),
    };
  })()`);

  assert(Object.values(result).every(Boolean), `Unable to fill blog create controls: ${JSON.stringify(result)}`);
  await sleep(1100);
  return result;
};

const assertCanvasFocusMode = async (client) => {
  let clicked = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    clicked = await evaluate(client, `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
        (candidate.textContent || '').trim() === 'Focus canvas'
      ));
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return { ok: false, label: button?.textContent || null, disabled: button instanceof HTMLButtonElement ? button.disabled : null };
      }
      button.click();
      return { ok: true };
    })()`);

    if (clicked.ok) {
      break;
    }

    await sleep(200);
  }
  assert(clicked.ok, `Focus canvas button was not ready: ${JSON.stringify(clicked)}`);

  let focused = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    focused = await evaluate(client, `(() => ({
      path: window.location.pathname,
      search: window.location.search,
      banner: Boolean(document.querySelector('[data-testid="blog-create-focus-banner"]')),
      commandCenter: Boolean(document.querySelector('[data-testid="blog-create-command-center"]')),
      draftPanel: Boolean(document.querySelector('#blog-create-draft')),
      publishPanel: Boolean(document.querySelector('#blog-create-publish')),
      canvas: Boolean(document.querySelector('[data-testid="editor-canvas"]')),
      adminSidebar: Boolean(document.querySelector('[data-testid="admin-sidebar-shell"]')),
      adminHeader: Boolean(document.querySelector('[data-testid="admin-header-shell"]')),
      showPanels: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent || '').trim() === 'Show panels'),
    }))()`);

    if (focused.banner && focused.canvas && focused.showPanels && !focused.commandCenter && !focused.draftPanel && !focused.publishPanel && !focused.adminSidebar && !focused.adminHeader && focused.search.includes('focus=canvas')) {
      break;
    }

    if (attempt === 59) {
      throw new Error(`Canvas focus mode did not hide create panels: ${JSON.stringify(focused)}`);
    }

    await sleep(200);
  }

  const focusVisualState = await assertBlogCreateVisualState(client, 'blog create focus', FOCUS_VISUAL_SCREENSHOT_PATH, { focus: true });

  let restored = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    restored = await evaluate(client, `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
        (candidate.textContent || '').trim() === 'Show panels'
      ));
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return { ok: false, label: button?.textContent || null, disabled: button instanceof HTMLButtonElement ? button.disabled : null };
      }
      button.click();
      return { ok: true };
    })()`);

    if (restored.ok) {
      break;
    }

    await sleep(200);
  }
  assert(restored.ok, `Show panels button was not ready: ${JSON.stringify(restored)}`);

  let normal = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    normal = await evaluate(client, `(() => ({
      search: window.location.search,
      banner: Boolean(document.querySelector('[data-testid="blog-create-focus-banner"]')),
      commandCenter: Boolean(document.querySelector('[data-testid="blog-create-command-center"]')),
      draftPanel: Boolean(document.querySelector('#blog-create-draft')),
      publishPanel: Boolean(document.querySelector('#blog-create-publish')),
      adminSidebar: Boolean(document.querySelector('[data-testid="admin-sidebar-shell"]')),
      adminHeader: Boolean(document.querySelector('[data-testid="admin-header-shell"]')),
    }))()`);

    if (!normal.banner && normal.commandCenter && normal.draftPanel && normal.publishPanel && normal.adminSidebar && normal.adminHeader && !normal.search.includes('focus=canvas')) {
      break;
    }

    if (attempt === 59) {
      throw new Error(`Show panels did not restore create workspace: ${JSON.stringify(normal)}`);
    }

    await sleep(200);
  }

  return {
    focused,
    focusVisualState: {
      screenshotPath: focusVisualState.screenshotPath,
      horizontalOverflow: focusVisualState.horizontalOverflow,
      viewport: focusVisualState.viewport,
    },
    normal,
  };
};

const assertAutosaveWritten = async (client, slug) => {
  let state = null;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    state = await evaluate(client, `(() => {
      const raw = localStorage.getItem('backy:blog-new:draft:v1');
      const parsed = raw ? JSON.parse(raw) : null;
      const visit = (element) => {
        if (!element || typeof element !== 'object') return false;
        if (element.id === 'frontend-blog-template-${FRONTEND_BLOG_TEMPLATE_ID}' || element.props?.frontendTemplateId === '${FRONTEND_BLOG_TEMPLATE_ID}') {
          return true;
        }
        return Array.isArray(element.children) && element.children.some(visit);
      };
      const find = (elements, elementId) => {
        for (const element of elements || []) {
          if (element?.id === elementId) return element;
          const child = find(element?.children, elementId);
          if (child) return child;
        }
        return null;
      };
      const heading = find(parsed?.canvasElements || [], 'frontend-blog-template-${FRONTEND_BLOG_TEMPLATE_ID}-heading');
      const hasLongFormSection = Boolean((parsed?.canvasElements || []).some((element) => JSON.stringify(element).includes('blog-longform-section-')));
      const hasLongFormQuote = Boolean((parsed?.canvasElements || []).some((element) => JSON.stringify(element).includes('blog-longform-quote-')));
      return {
        hasDraft: Boolean(parsed),
        slug: parsed?.slug || null,
        title: parsed?.title || null,
        seoDescription: parsed?.seoDescription || null,
        noIndex: parsed?.noIndex ?? null,
        canvasCount: parsed?.canvasElements?.length || 0,
        designTemplateId: parsed?.designTemplateId || null,
        hasFrontendTemplateRoot: Array.isArray(parsed?.canvasElements) && parsed.canvasElements.some(visit),
        mobileOverride: heading?.responsive?.mobile || null,
        hasLongFormSection,
        hasLongFormQuote,
        badge: Array.from(document.querySelectorAll('span')).map((node) => node.textContent || '').find((text) => /Autosaved|Saving draft|Autosave/.test(text)) || '',
      };
    })()`);

    if (state.hasDraft) {
      break;
    }

    await sleep(250);
  }

  assert(state.hasDraft, `Autosave draft was not written: ${JSON.stringify(state)}`);
  assert(state.title === 'Smoke Blog Create', `Autosave draft title mismatch: ${JSON.stringify(state)}`);
  assert(state.slug === slug, `Autosave draft slug mismatch: ${JSON.stringify(state)}`);
  assert(state.noIndex === true, `Autosave did not retain robots toggle: ${JSON.stringify(state)}`);
  assert(state.canvasCount > 0, `Autosave did not retain canvas elements: ${JSON.stringify(state)}`);
  assert(state.designTemplateId === FRONTEND_BLOG_TEMPLATE_ID, `Autosave did not retain frontend template id: ${JSON.stringify(state)}`);
  assert(state.hasFrontendTemplateRoot === true, `Autosave did not retain frontend template canvas root: ${JSON.stringify(state)}`);
  assert(state.mobileOverride?.x === 24 && state.mobileOverride?.width === 320, `Autosave did not retain mobile breakpoint override: ${JSON.stringify(state)}`);
  assert(state.hasLongFormSection && state.hasLongFormQuote, `Autosave did not retain long-form writing blocks: ${JSON.stringify(state)}`);
  return state;
};

const assertFeaturedMediaPicker = async (client) => {
  const clicked = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
      /Select image|Replace image/.test(candidate.textContent || '')
    ));
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { ok: false, label: button?.textContent || null, disabled: button instanceof HTMLButtonElement ? button.disabled : null };
    }
    button.click();
    return { ok: true, label: button.textContent || '' };
  })()`);

  assert(clicked.ok, `Featured media picker button was not ready: ${JSON.stringify(clicked)}`);

  let state = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    state = await evaluate(client, `(() => ({
      hasModal: document.body?.innerText?.includes('Media library') || false,
      hasContext: document.body?.innerText?.includes('Context:') && document.body?.innerText?.includes('Smoke Blog Create'),
      hasUploadTab: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent || '').trim() === 'upload'),
      hasImageFilter: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent || '').trim() === 'image'),
      hasScopeControls: document.body?.innerText?.includes('Selection controls') || false,
      closeButton: Boolean(document.querySelector('button[aria-label="Close media library"]')),
    }))()`);

    if (state.hasModal && state.hasContext && state.hasUploadTab && state.hasImageFilter && state.hasScopeControls && state.closeButton) {
      break;
    }

    if (attempt === 79) {
      throw new Error(`Featured media picker did not render expected controls: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  const closed = await evaluate(client, `(() => {
    const button = document.querySelector('button[aria-label="Close media library"]');
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`);
  assert(closed, 'Unable to close featured media picker');
  await sleep(250);

  return {
    opened: clicked,
    modal: state,
  };
};

const assertRecoveryRestore = async (client, slug) => {
  const currentUrl = await evaluate(client, 'window.location.href');
  await client.send('Page.navigate', { url: currentUrl });
  await sleep(500);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      href: window.location.href,
      readyState: document.readyState,
      recovery: document.body?.innerText?.includes('Recovered unsaved blog draft') || false,
      restore: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent || '').trim() === 'Restore draft'),
      body: document.body?.innerText?.slice(0, 220) || '',
      errors: Array.from(document.querySelectorAll('[role="alert"], [data-testid*="error"]')).map((node) => node.textContent || '').slice(0, 3),
    }))()`);

    if (state.recovery && state.restore) {
      break;
    }

    if (attempt === 79) {
      throw new Error(`Autosave recovery banner did not render: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  let restored = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    restored = await evaluate(client, `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((candidate) => (candidate.textContent || '').trim() === 'Restore draft');
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return { clicked: false, disabled: button instanceof HTMLButtonElement ? button.disabled : null };
      }
      button.click();
      return { clicked: true };
    })()`);

    if (restored.clicked) {
      break;
    }

    await sleep(200);
  }
  assert(restored.clicked, `Restore draft button was not clickable: ${JSON.stringify(restored)}`);

  let state = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    state = await evaluate(client, `(() => ({
      slug: document.querySelector('#blog-create-slug')?.value || '',
      title: document.querySelector('#blog-create-title')?.value || '',
      seoDescription: document.querySelector('#blog-create-seo-description')?.value || '',
      noIndex: Array.from(document.querySelectorAll('#blog-create-seo input[type="checkbox"]'))[0]?.checked ?? null,
      frontendTemplateActive: document.querySelector('[data-testid="blog-frontend-template-${FRONTEND_BLOG_TEMPLATE_ID}"]')?.getAttribute('data-active') || '',
      payloadTemplateId: JSON.parse(document.querySelector('[data-testid="blog-create-payload"]')?.textContent || '{}')?.template?.id || '',
      payloadTemplateSource: JSON.parse(document.querySelector('[data-testid="blog-create-payload"]')?.textContent || '{}')?.template?.source || '',
      notice: document.body?.innerText?.includes('Recovered local blog draft.') || false,
    }))()`);

    if (
      state.title === 'Smoke Blog Create'
      && state.slug === slug
      && state.noIndex === true
      && state.seoDescription.length > 50
      && state.frontendTemplateActive === 'true'
      && state.payloadTemplateId === FRONTEND_BLOG_TEMPLATE_ID
      && state.payloadTemplateSource === 'frontend-design'
    ) {
      break;
    }

    await sleep(200);
  }

  assert(state.title === 'Smoke Blog Create', `Recovered draft did not restore title: ${JSON.stringify(state)}`);
  assert(state.slug === slug, `Recovered draft did not restore slug: ${JSON.stringify(state)}`);
  assert(state.noIndex === true, `Recovered draft did not restore robots toggle: ${JSON.stringify(state)}`);
  assert(state.seoDescription.length > 50, `Recovered draft did not restore SEO description: ${JSON.stringify(state)}`);
  assert(state.frontendTemplateActive === 'true', `Recovered draft did not restore frontend design template selection: ${JSON.stringify(state)}`);
  assert(state.payloadTemplateId === FRONTEND_BLOG_TEMPLATE_ID, `Recovered draft did not restore frontend design payload template: ${JSON.stringify(state)}`);
  return state;
};

const createPreviewFromUi = async (client) => {
  const beforeTargets = await fetchJson('/json/list');
  let clicked = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    clicked = await evaluate(client, `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((candidate) => (candidate.textContent || '').includes('Save draft and preview'));
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return {
          ok: false,
          label: button?.textContent || null,
          disabled: button instanceof HTMLButtonElement ? button.disabled : null,
          title: document.querySelector('#blog-create-title')?.value || '',
          slug: document.querySelector('#blog-create-slug')?.value || '',
          canonical: document.querySelector('#blog-create-canonical')?.value || '',
          body: document.body?.innerText?.slice(0, 260) || '',
        };
      }
      button.click();
      return { ok: true, label: button.textContent || '' };
    })()`);

    if (clicked.ok) {
      break;
    }

    await sleep(250);
  }
  assert(clicked.ok, `Save draft and preview button was not ready: ${JSON.stringify(clicked)}`);

  let editPath = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      path: window.location.pathname,
      text: document.body?.innerText?.slice(0, 260) || '',
      fullText: document.body?.innerText?.slice(0, 1200) || '',
      storedDraft: localStorage.getItem('backy:blog-new:draft:v1'),
    }))()`);

    if (state.path.startsWith('/blog/') && state.path !== '/blog/new') {
      editPath = state.path;
      assert(state.storedDraft === null, `Autosave draft was not cleared after create: ${JSON.stringify(state)}`);
      break;
    }

    if (attempt === 99) {
      const browserErrors = client.events
        .filter((event) => (
          event.method === 'Runtime.exceptionThrown'
          || (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error' && !isIgnorableBrowserLogError(event))
        ))
        .map((event) => event.params)
        .slice(0, 5);
      state.browserErrors = browserErrors;
      throw new Error(`Create preview did not navigate to edit page: ${JSON.stringify(state)}`);
    }

    await sleep(300);
  }

  const afterTargets = await fetchJson('/json/list');
  return {
    editPath,
    openedPreviewTargets: Math.max(0, afterTargets.length - beforeTargets.length),
  };
};

const normalizeCreatedContent = (content) => {
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    return content;
  }
  return {};
};

const flattenElements = (elements = []) => {
  const flat = [];
  const visit = (element) => {
    if (!element || typeof element !== 'object') return;
    flat.push(element);
    if (Array.isArray(element.children)) {
      element.children.forEach(visit);
    }
  };
  elements.forEach(visit);
  return flat;
};

const assertCreatedFrontendBlogPost = async (postId, slug) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/blog/${postId}`);
  const post = payload.data?.post;

  assert(post, `Created blog post ${postId} detail was not returned`);
  assert(post.slug === slug, `Created blog slug mismatch: ${JSON.stringify({ slug: post.slug, expected: slug })}`);
  assert(post.meta?.frontendDesignTemplateId === FRONTEND_BLOG_TEMPLATE_ID, `Created blog did not store frontend template id: ${JSON.stringify(post.meta)}`);
  assert(post.meta?.frontendDesignTemplateName === FRONTEND_BLOG_TEMPLATE_NAME, `Created blog did not store frontend template name: ${JSON.stringify(post.meta)}`);
  assert(post.meta?.frontendDesignSource?.type === 'custom-frontend', `Created blog did not store frontend design source: ${JSON.stringify(post.meta)}`);
  assert(Array.isArray(post.meta?.frontendDesignBindingHints) && post.meta.frontendDesignBindingHints.length === 2, `Created blog did not store frontend binding hints: ${JSON.stringify(post.meta)}`);

  const content = normalizeCreatedContent(post.content);
  const elements = Array.isArray(content.elements) ? content.elements : [];
  const allElements = flattenElements(elements);
  const byId = new Map(allElements.map((element) => [element.id, element]));
  const canvasSize = content.canvasSize || content.contentDocument?.metadata?.canvasSize || {};
  const wrapper = byId.get(`frontend-blog-template-${FRONTEND_BLOG_TEMPLATE_ID}`);
  const heading = byId.get(`frontend-blog-template-${FRONTEND_BLOG_TEMPLATE_ID}-heading`);
  const bodyRegion = byId.get(`frontend-blog-template-${FRONTEND_BLOG_TEMPLATE_ID}-body-region`);
  const longFormSection = allElements.find((element) => typeof element.id === 'string' && element.id.startsWith('blog-longform-section-'));
  const longFormQuote = allElements.find((element) => typeof element.id === 'string' && element.id.startsWith('blog-longform-quote-'));

  assert(wrapper?.type === 'section', `Frontend blog template wrapper missing: ${JSON.stringify({ ids: allElements.map((element) => element.id).slice(0, 40) })}`);
  assert(wrapper.props?.frontendTemplateId === FRONTEND_BLOG_TEMPLATE_ID, `Frontend blog wrapper metadata mismatch: ${JSON.stringify(wrapper)}`);
  assert(heading?.props?.content === 'Smoke Blog Create', `Frontend blog heading does not use post title: ${JSON.stringify(heading?.props)}`);
  assert(heading?.responsive?.mobile?.x === 24 && heading?.responsive?.mobile?.width === 320, `Frontend blog heading did not persist mobile breakpoint override: ${JSON.stringify(heading?.responsive)}`);
  assert(Array.isArray(bodyRegion?.props?.bindingHints) && bodyRegion.props.bindingHints.length === 2, `Frontend blog body region missing binding hints: ${JSON.stringify(bodyRegion?.props)}`);
  assert(longFormSection && longFormQuote, `Created blog did not persist long-form writing blocks: ${JSON.stringify({ ids: allElements.map((element) => element.id).slice(0, 80) })}`);
  assert(canvasSize.width === 1260 && canvasSize.height >= 940, `Frontend blog canvas size mismatch: ${JSON.stringify(canvasSize)}`);
  assert(typeof content.customCSS === 'string' && content.customCSS.includes('--backy-smoke-blog-primary'), `Frontend blog custom CSS was not persisted: ${JSON.stringify(content.customCSS)}`);

  return {
    postId,
    slug: post.slug,
    meta: {
      frontendDesignTemplateId: post.meta?.frontendDesignTemplateId,
      frontendDesignTemplateName: post.meta?.frontendDesignTemplateName,
      frontendDesignSourceType: post.meta?.frontendDesignSource?.type,
      bindingHintCount: post.meta?.frontendDesignBindingHints?.length || 0,
    },
    content: {
      rootElementCount: elements.length,
      totalElementCount: allElements.length,
      canvasSize,
      wrapperId: wrapper.id,
      heading: heading?.props?.content,
      headingMobileOverride: heading?.responsive?.mobile,
      longFormSectionId: longFormSection?.id,
      longFormQuoteId: longFormQuote?.id,
      customCssStored: typeof content.customCSS === 'string',
    },
  };
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-blog-create-${Date.now()}`);
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

const cleanup = async ({ client, childProcess, userDataDir, postId }) => {
  if (postId) {
    try {
      await requestApi(`/api/admin/sites/${SITE_ID}/blog/${postId}`, { method: 'DELETE' });
    } catch (error) {
      console.warn(`Unable to delete smoke post ${postId}:`, error instanceof Error ? error.message : error);
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
  await loginAdminApi();
  const slug = `blog-create-smoke-${Date.now().toString(36)}`;
  const { childProcess, userDataDir } = launchChrome();
  let client;
  let postId = null;
  let originalFrontendDesign = null;

  try {
    originalFrontendDesign = await getFrontendDesign();
    await patchFrontendDesign(smokeFrontendDesignContract());
    await waitForCdp();
    const page = (await fetchJson('/json/list')).find((candidate) => candidate.type === 'page');
    assert(page?.webSocketDebuggerUrl, 'No Chrome page target found');

    client = connectCdp(page.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('Log.enable');
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(apiAdminSessionToken),
    });

    const initialRender = await navigateToBlogCreate(client);
    const desktopVisual = await assertBlogCreateVisualState(client, 'blog create desktop', DESKTOP_VISUAL_SCREENSHOT_PATH);
    const focusMode = await assertCanvasFocusMode(client);
    const mobileBreakpoint = await assertMobileBreakpointAuthoring(client);
    const writingStructure = await assertWritingStructureTools(client);
    const filled = await fillBlogCreateForm(client, slug);
    const mediaPicker = await assertFeaturedMediaPicker(client);
    const autosave = await assertAutosaveWritten(client, slug);
    const recovery = await assertRecoveryRestore(client, slug);
    const preview = await createPreviewFromUi(client);
    postId = preview.editPath.split('/').filter(Boolean).at(-1);
    const frontendBlogPost = await assertCreatedFrontendBlogPost(postId, slug);

    await captureScreenshot(client, SCREENSHOT_PATH);

    const browserErrors = client.events
      .filter((event) => (
        event.method === 'Runtime.exceptionThrown'
        || (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error' && !isIgnorableBrowserLogError(event))
      ))
      .map((event) => event.params);

    assert(browserErrors.length === 0, `Browser emitted errors: ${JSON.stringify(browserErrors.slice(0, 3))}`);

    console.log(JSON.stringify({
      ok: true,
      url: `${ADMIN_BASE_URL}/blog/new?siteId=${encodeURIComponent(SITE_ID)}`,
      initialRender,
      desktopVisual: {
        screenshotPath: desktopVisual.screenshotPath,
        horizontalOverflow: desktopVisual.horizontalOverflow,
        viewport: desktopVisual.viewport,
      },
      focusMode,
      mobileBreakpoint,
      writingStructure,
      filled,
      mediaPicker,
      autosave,
      recovery,
      preview,
      frontendBlogPost,
      postId,
      screenshotPath: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    if (originalFrontendDesign) {
      try {
        await patchFrontendDesign(originalFrontendDesign);
      } catch (error) {
        console.warn('Unable to restore original frontend design contract:', error instanceof Error ? error.message : error);
      }
    }
    await cleanup({ client, childProcess, userDataDir, postId });
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
