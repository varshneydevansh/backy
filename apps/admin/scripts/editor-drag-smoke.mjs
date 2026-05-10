#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_EDITOR_SMOKE_SITE_ID || 'site-demo';
const EDITOR_PATH = process.env.BACKY_EDITOR_SMOKE_PATH || '';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_CDP_PORT || 9365);
const SCREENSHOT_PATH = process.env.BACKY_EDITOR_DRAG_SCREENSHOT || path.join(os.tmpdir(), 'backy-editor-drag-smoke.png');
let apiAdminSessionToken = '';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

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

const createSmokePage = async () => {
  const slug = `editor-drag-smoke-${Date.now().toString(36)}`;
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Editor Drag Smoke',
      slug,
      status: 'draft',
      content: {
        elements: [
          {
            id: 'smoke-heading',
            type: 'heading',
            x: 120,
            y: 100,
            width: 420,
            height: 72,
            zIndex: 1,
            props: {
              content: 'Drag Smoke Heading',
              level: 'h1',
              fontSize: '54px',
              fontWeight: 'bold',
              color: '#111827',
            },
            styles: {
              position: 'relative',
              left: '4px',
              top: '6px',
              width: '80px',
              height: '40px',
              transform: 'translateX(30px)',
            },
          },
          {
            id: 'smoke-image',
            type: 'image',
            x: 120,
            y: 220,
            width: 260,
            height: 170,
            zIndex: 2,
            props: {
              src: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085',
              alt: 'Workspace',
              objectFit: 'cover',
            },
          },
          {
            id: 'smoke-top-edge',
            type: 'paragraph',
            x: 360,
            y: 10,
            width: 300,
            height: 64,
            zIndex: 5,
            props: {
              content: 'Top edge handle check',
              fontSize: 18,
              color: '#0f172a',
            },
          },
          {
            id: 'smoke-box',
            type: 'box',
            x: 460,
            y: 220,
            width: 330,
            height: 220,
            zIndex: 3,
            props: {
              backgroundColor: '#f8fafc',
              borderRadius: 8,
              borderColor: '#cbd5e1',
              borderWidth: 1,
            },
            children: [
              {
                id: 'smoke-child-button',
                type: 'button',
                x: 32,
                y: 36,
                width: 160,
                height: 48,
                zIndex: 1,
                props: {
                  label: 'Nested button',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  borderRadius: 6,
                  fontSize: 16,
                },
              },
            ],
          },
          {
            id: 'smoke-form',
            type: 'form',
            x: 120,
            y: 460,
            width: 360,
            height: 220,
            zIndex: 4,
            props: {
              formTitle: 'Smoke form',
              backgroundColor: '#ffffff',
              borderRadius: 8,
            },
          },
        ],
        canvasSize: {
          width: 1200,
          height: 900,
        },
      },
    }),
  });

  const pageId = payload.data?.page?.id;
  assert(pageId, `Unable to create smoke page: ${JSON.stringify(payload).slice(0, 300)}`);
  return pageId;
};

const deleteSmokePage = async (pageId) => {
  if (!pageId) {
    return;
  }

  try {
    await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`, { method: 'DELETE' });
  } catch (error) {
    console.warn(`Unable to delete smoke page ${pageId}:`, error instanceof Error ? error.message : error);
  }
};

const createSmokeReusableSection = async () => {
  const slug = `editor-smoke-synced-section-${Date.now().toString(36)}`;
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/reusable-sections`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Editor Smoke Synced Section',
      slug,
      category: 'saved',
      status: 'active',
      tags: ['editor-smoke', 'synced'],
      sourceElementId: 'editor-smoke-source',
      content: {
        canvasSize: { width: 240, height: 90 },
        elements: [
          {
            id: 'editor-smoke-reusable-root',
            type: 'box',
            x: 0,
            y: 0,
            width: 240,
            height: 90,
            zIndex: 1,
            props: {
              backgroundColor: '#eef2ff',
              borderColor: '#818cf8',
              borderWidth: 1,
              borderRadius: 10,
            },
            children: [
              {
                id: 'editor-smoke-reusable-label',
                type: 'heading',
                x: 20,
                y: 20,
                width: 180,
                height: 40,
                zIndex: 1,
                props: {
                  content: 'Reusable v1',
                  level: 'h2',
                  fontSize: 24,
                  color: '#312e81',
                },
              },
            ],
          },
        ],
      },
      createdBy: 'admin',
      updatedBy: 'admin',
    }),
  });

  const sectionId = payload.data?.section?.id;
  assert(sectionId, `Unable to create smoke reusable section: ${JSON.stringify(payload).slice(0, 300)}`);
  return sectionId;
};

const deleteSmokeReusableSection = async (sectionId) => {
  if (!sectionId) {
    return;
  }

  try {
    await requestApi(`/api/admin/sites/${SITE_ID}/reusable-sections/${sectionId}`, { method: 'DELETE' });
  } catch (error) {
    console.warn(`Unable to delete smoke reusable section ${sectionId}:`, error instanceof Error ? error.message : error);
  }
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

const AUTH_STORAGE_SCRIPT = `localStorage.setItem('backy-auth-storage', JSON.stringify({ state: { user: { id: '1', email: 'admin@backy.io', fullName: 'Admin User', role: 'admin' } }, version: 0 }));`;

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

const openAuthenticatedEditorTab = async (parentClient, url) => {
  const target = await parentClient.send('Target.createTarget', { url: 'about:blank' });
  const page = (await fetchJson('/json/list')).find((candidate) => candidate.id === target.targetId);
  assert(page?.webSocketDebuggerUrl, `No Chrome target found for reload check ${target.targetId}`);

  const client = connectCdp(page.webSocketDebuggerUrl);
  await client.opened;
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  await client.send('DOM.enable');
  await client.send('Log.enable');
  await client.send('Page.addScriptToEvaluateOnNewDocument', {
    source: AUTH_STORAGE_SCRIPT,
  });
  await client.send('Page.navigate', { url });
  return client;
};

const waitForEditorElements = async (client, elementIds) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const ready = await evaluate(client, `(() => ({
      canvas: Boolean(document.querySelector('[data-testid="editor-canvas"]')),
      elements: ${JSON.stringify(elementIds)}.map((id) => Boolean(document.querySelector('[data-element-id="' + id + '"]'))),
      body: document.body?.innerText?.slice(0, 160) || '',
    }))()`);

    if (ready.canvas && ready.elements.every(Boolean)) {
      return ready;
    }

    if (attempt === 119) {
      throw new Error(`Editor did not render expected elements: ${JSON.stringify(ready)}`);
    }

    await sleep(250);
  }

  return null;
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

const getElementDragStartPoint = async (client, elementId, box) => {
  const fallback = {
    x: Math.round(box.x + Math.min(box.width / 2, 90)),
    y: Math.round(box.y + Math.min(box.height / 2, 30)),
  };
  const point = await evaluate(client, `(() => {
    const node = document.querySelector('[data-element-id="${elementId}"]');
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    const inset = Math.min(14, Math.max(4, Math.min(rect.width, rect.height) / 5));
    const candidates = [
      [rect.left + inset, rect.top + inset],
      [rect.right - inset, rect.top + inset],
      [rect.left + inset, rect.bottom - inset],
      [rect.right - inset, rect.bottom - inset],
      [rect.left + rect.width / 2, rect.top + inset],
      [rect.left + inset, rect.top + rect.height / 2],
      [rect.left + rect.width / 2, rect.top + rect.height / 2],
    ];

    for (const [x, y] of candidates) {
      const target = document.elementFromPoint(x, y);
      const host = target instanceof Element ? target.closest('[data-element-id]') : null;
      if (host?.getAttribute('data-element-id') === '${elementId}') {
        return { x: Math.round(x), y: Math.round(y) };
      }
    }

    return null;
  })()`);

  return point || fallback;
};

const scrollElementIntoView = async (client, elementId) => {
  await evaluate(client, `(() => {
    const node = document.querySelector('[data-element-id="${elementId}"]');
    if (!node) return;

    node.scrollIntoView({ block: 'center', inline: 'center' });

    const scrollers = [];
    let scroller = node.parentElement;
    while (scroller) {
      const style = window.getComputedStyle(scroller);
      const canScrollX = scroller.scrollWidth > scroller.clientWidth && /(auto|scroll)/.test(style.overflowX);
      const canScrollY = scroller.scrollHeight > scroller.clientHeight && /(auto|scroll)/.test(style.overflowY);
      if (canScrollX || canScrollY) {
        scrollers.push(scroller);
      }
      scroller = scroller.parentElement;
    }

    const pageScroller = document.scrollingElement || document.documentElement;
    if (pageScroller && !scrollers.includes(pageScroller)) {
      scrollers.push(pageScroller);
    }

    const margin = 160;

    for (const currentScroller of scrollers.reverse()) {
      const nodeRect = node.getBoundingClientRect();
      const scrollerRect = currentScroller === pageScroller
        ? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
        : currentScroller.getBoundingClientRect();

      if (nodeRect.left < scrollerRect.left + margin) {
        currentScroller.scrollLeft -= (scrollerRect.left + margin) - nodeRect.left;
      } else if (nodeRect.right > scrollerRect.right - margin) {
        currentScroller.scrollLeft += nodeRect.right - (scrollerRect.right - margin);
      }

      if (nodeRect.top < scrollerRect.top + margin) {
        currentScroller.scrollTop -= (scrollerRect.top + margin) - nodeRect.top;
      } else if (nodeRect.bottom > scrollerRect.bottom - margin) {
        currentScroller.scrollTop += nodeRect.bottom - (scrollerRect.bottom - margin);
      }
    }

    const finalRect = node.getBoundingClientRect();
    if (finalRect.top < margin || finalRect.bottom > window.innerHeight - margin) {
      window.scrollBy({
        top: finalRect.top + finalRect.height / 2 - window.innerHeight / 2,
        left: 0,
        behavior: 'instant',
      });
    }
  })()`);
  await sleep(120);
};

const parseCssPixel = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getVisualScale = (box, axis) => {
  const cssSize = parseCssPixel(axis === 'x' ? box.cssWidth : box.cssHeight);
  const visualSize = axis === 'x' ? box.width : box.height;

  if (!cssSize || !Number.isFinite(cssSize) || !Number.isFinite(visualSize) || visualSize <= 0) {
    return null;
  }

  return visualSize / cssSize;
};

const measureDragDelta = (before, after, expectedScreenDeltaX, expectedScreenDeltaY) => {
  const cssDeltaX = parseCssPixel(after.left) !== null && parseCssPixel(before.left) !== null
    ? parseCssPixel(after.left) - parseCssPixel(before.left)
    : null;
  const cssDeltaY = parseCssPixel(after.top) !== null && parseCssPixel(before.top) !== null
    ? parseCssPixel(after.top) - parseCssPixel(before.top)
    : null;
  const screenDeltaX = after.x - before.x;
  const screenDeltaY = after.y - before.y;
  const scaleX = getVisualScale(before, 'x');
  const scaleY = getVisualScale(before, 'y');
  const expectedCanvasDeltaX = scaleX && cssDeltaX !== null
    ? expectedScreenDeltaX / scaleX
    : expectedScreenDeltaX;
  const expectedCanvasDeltaY = scaleY && cssDeltaY !== null
    ? expectedScreenDeltaY / scaleY
    : expectedScreenDeltaY;

  return {
    screen: {
      x: Math.round(screenDeltaX),
      y: Math.round(screenDeltaY),
      expectedX: expectedScreenDeltaX,
      expectedY: expectedScreenDeltaY,
    },
    canvas: {
      x: Math.round(cssDeltaX ?? screenDeltaX),
      y: Math.round(cssDeltaY ?? screenDeltaY),
      expectedX: Math.round(expectedCanvasDeltaX),
      expectedY: Math.round(expectedCanvasDeltaY),
    },
    scale: {
      x: scaleX,
      y: scaleY,
    },
  };
};

const assertDragDelta = (delta, label) => {
  const canvasMatches = Math.abs(delta.canvas.x - delta.canvas.expectedX) <= 18 &&
    Math.abs(delta.canvas.y - delta.canvas.expectedY) <= 18;

  assert(
    canvasMatches,
    `${label}: expected screen ${delta.screen.expectedX},${delta.screen.expectedY} and canvas ${delta.canvas.expectedX},${delta.canvas.expectedY}; got screen ${delta.screen.x},${delta.screen.y}, canvas ${delta.canvas.x},${delta.canvas.y}; scale ${JSON.stringify(delta.scale)}`,
  );
};

const findCanvasElement = (elements, elementId) => {
  for (const element of elements || []) {
    if (element?.id === elementId) {
      return element;
    }

    const child = findCanvasElement(element?.children, elementId);
    if (child) {
      return child;
    }
  }

  return null;
};

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

const assertElementState = (actualState, expectedState, label) => {
  for (const [elementId, expected] of Object.entries(expectedState)) {
    const actual = actualState[elementId];
    assert(actual, `${label}: missing ${elementId}`);
    assert(
      Math.abs(actual.x - expected.x) <= 1 &&
      Math.abs(actual.y - expected.y) <= 1 &&
      Math.abs(actual.width - expected.width) <= 1 &&
      Math.abs(actual.height - expected.height) <= 1,
      `${label}: ${elementId} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
};

const selectElement = async (client, elementId) => {
  const box = await getElementBox(client, elementId);
  assert(box, `Missing selectable element ${elementId}`);

  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: Math.round(box.x + Math.min(box.width / 2, 60)),
    y: Math.round(box.y + Math.min(box.height / 2, 24)),
    button: 'none',
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: Math.round(box.x + Math.min(box.width / 2, 60)),
    y: Math.round(box.y + Math.min(box.height / 2, 24)),
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: Math.round(box.x + Math.min(box.width / 2, 60)),
    y: Math.round(box.y + Math.min(box.height / 2, 24)),
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  await sleep(150);
};

const pressKey = async (client, key, options = {}) => {
  const codeByKey = {
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    a: 'KeyA',
    g: 'KeyG',
    z: 'KeyZ',
  };
  const virtualKeyByKey = {
    ArrowLeft: 37,
    ArrowRight: 39,
    ArrowUp: 38,
    ArrowDown: 40,
    a: 65,
    g: 71,
    z: 90,
  };
  const modifiers =
    (options.shiftKey ? 8 : 0) |
    (options.ctrlKey ? 2 : 0) |
    (options.metaKey ? 4 : 0);

  await client.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code: codeByKey[key] || key,
    windowsVirtualKeyCode: virtualKeyByKey[key] || key.toUpperCase?.().charCodeAt(0) || 0,
    nativeVirtualKeyCode: virtualKeyByKey[key] || key.toUpperCase?.().charCodeAt(0) || 0,
    modifiers,
  });
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code: codeByKey[key] || key,
    windowsVirtualKeyCode: virtualKeyByKey[key] || key.toUpperCase?.().charCodeAt(0) || 0,
    nativeVirtualKeyCode: virtualKeyByKey[key] || key.toUpperCase?.().charCodeAt(0) || 0,
    modifiers,
  });
  await sleep(150);
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

const setLayoutNumberInput = async (client, label, value) => {
  const testIdByLabel = {
    X: 'editor-layout-x',
    Y: 'editor-layout-y',
    Width: 'editor-layout-width',
    Height: 'editor-layout-height',
    'Z-Index': 'editor-layout-z-index',
    Rotation: 'editor-layout-rotation',
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
    return { ok: true, testId: ${JSON.stringify(testId)} };
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
  const layerSelector = `[data-layer-id="${elementId}"]`;
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
    const layer = document.querySelector(${JSON.stringify(layerSelector)});
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

const readLayerActionState = async (client, elementId) => {
  const opened = await evaluate(client, `(() => {
    const layersButton = document.querySelector('[data-testid="editor-tab-layers"]');
    if (!(layersButton instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'missing-layers-tab' };
    }
    layersButton.click();
    return { ok: true };
  })()`);

  assert(opened?.ok, `Unable to open layers panel for ${elementId}: ${JSON.stringify(opened)}`);
  await sleep(150);

  let state = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    state = await evaluate(client, `(() => {
    const row = document.querySelector('[data-layer-id="${elementId}"]');
    if (!(row instanceof HTMLElement)) {
      return {
        ok: false,
        reason: 'missing-layer-row',
        availableLayerIds: Array.from(document.querySelectorAll('[data-layer-id]'))
          .map((node) => node.getAttribute('data-layer-id')),
      };
    }
    return {
      ok: true,
      hidden: row.classList.contains('hidden'),
      locked: row.classList.contains('locked'),
      visibilityLabel: document.querySelector('[data-layer-action="visibility"][data-layer-action-id="${elementId}"]')?.getAttribute('aria-label') || '',
      lockLabel: document.querySelector('[data-layer-action="lock"][data-layer-action-id="${elementId}"]')?.getAttribute('aria-label') || '',
    };
  })()`);

    if (state?.ok) {
      break;
    }
    await sleep(100);
  }

  assert(state?.ok, `Unable to read layer action state for ${elementId}: ${JSON.stringify(state)}`);
  return state;
};

const setLayerHiddenState = async (client, elementId, hidden) => {
  const state = await readLayerActionState(client, elementId);
  if (state.hidden === hidden) {
    return state;
  }

  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector('[data-layer-action="visibility"][data-layer-action-id="${elementId}"]');
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);

  assert(clicked, `Unable to toggle visibility for layer ${elementId}`);
  await sleep(250);
  const nextState = await readLayerActionState(client, elementId);
  assert(nextState.hidden === hidden, `Layer ${elementId} hidden state did not become ${hidden}: ${JSON.stringify(nextState)}`);
  return nextState;
};

const setLayerLockedState = async (client, elementId, locked) => {
  const state = await readLayerActionState(client, elementId);
  if (state.locked === locked) {
    return state;
  }

  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector('[data-layer-action="lock"][data-layer-action-id="${elementId}"]');
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);

  assert(clicked, `Unable to toggle lock for layer ${elementId}`);
  await sleep(250);
  const nextState = await readLayerActionState(client, elementId);
  assert(nextState.locked === locked, `Layer ${elementId} locked state did not become ${locked}: ${JSON.stringify(nextState)}`);
  return nextState;
};

const clickLayerAction = async (client, action, elementId) => {
  const opened = await evaluate(client, `(() => {
    const layersButton = document.querySelector('[data-testid="editor-tab-layers"]');
    if (!(layersButton instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'missing-layers-tab' };
    }
    layersButton.click();
    return { ok: true };
  })()`);

  assert(opened?.ok, `Unable to open layers panel before ${action} on ${elementId}: ${JSON.stringify(opened)}`);
  await sleep(150);

  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector('[data-layer-action="${action}"][data-layer-action-id="${elementId}"]');
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        reason: 'missing-button',
        availableActions: Array.from(document.querySelectorAll('[data-layer-action]')).map((node) => ({
          action: node.getAttribute('data-layer-action'),
          id: node.getAttribute('data-layer-action-id'),
          disabled: node instanceof HTMLButtonElement ? node.disabled : null,
        })),
      };
    }

    if (button.disabled) {
      return {
        ok: false,
        reason: 'disabled',
        label: button.getAttribute('aria-label') || '',
      };
    }

    button.click();
    return {
      ok: true,
      label: button.getAttribute('aria-label') || '',
    };
  })()`);

  assert(clicked?.ok, `Unable to click layer ${action} for ${elementId}: ${JSON.stringify(clicked)}`);
  await sleep(300);
  return clicked;
};

const readLayerTreeState = async (client, elementIds) => {
  const opened = await evaluate(client, `(() => {
    const layersButton = document.querySelector('[data-testid="editor-tab-layers"]');
    if (!(layersButton instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'missing-layers-tab' };
    }
    layersButton.click();
    return { ok: true };
  })()`);

  assert(opened?.ok, `Unable to open layers panel for tree state: ${JSON.stringify(opened)}`);
  await sleep(150);

  const state = await evaluate(client, `(() => {
    const wanted = ${JSON.stringify(elementIds)};
    const rows = Array.from(document.querySelectorAll('[data-layer-id]')).map((row, index) => ({
      id: row.getAttribute('data-layer-id'),
      depth: Number(row.getAttribute('data-layer-depth') || 0),
      selected: row.getAttribute('data-layer-selected') === 'true',
      index,
    }));
    return {
      rows,
      byId: Object.fromEntries(wanted.map((id) => [
        id,
        rows.find((row) => row.id === id) || null,
      ])),
    };
  })()`);

  assert(
    elementIds.every((elementId) => state.byId?.[elementId]),
    `Layer tree state missing expected rows: ${JSON.stringify(state)}`,
  );

  return state;
};

const readBreakpointOverrideControls = async (client) => {
  const controls = await evaluate(client, `(() => {
    const panel = document.querySelector('[data-testid="editor-breakpoint-override"]');
    const groups = Object.fromEntries(
      ['layout', 'layer', 'content', 'style'].map((group) => {
        const button = document.querySelector('[data-testid="editor-breakpoint-reset-' + group + '"]');
        return [group, button instanceof HTMLButtonElement
          ? {
              exists: true,
              disabled: button.disabled,
              text: button.textContent || '',
              title: button.getAttribute('title') || '',
            }
          : { exists: false }];
      }),
    );
    return {
      panelText: panel?.textContent || '',
      groups,
    };
  })()`);

  assert(controls?.panelText, `Unable to read breakpoint override controls: ${JSON.stringify(controls)}`);
  return controls;
};

const clickBreakpointResetGroup = async (client, group) => {
  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="editor-breakpoint-reset-${group}"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return false;
    }
    button.click();
    return true;
  })()`);

  assert(clicked, `Unable to click breakpoint ${group} reset control`);
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

const readPersistedElement = async (pageId, elementId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const elements = payload.data?.page?.content?.elements || [];
  return findCanvasElement(elements, elementId);
};

const assertResponsiveBreakpointEditing = async (client, pageId, elementId, options = {}) => {
  const breakpoint = options.breakpoint || 'mobile';
  const breakpointLabel = breakpoint.charAt(0).toUpperCase() + breakpoint.slice(1);
  const breakpointCanvasLabel = `${breakpointLabel} canvas`;
  const expectedBreakpointX = options.expectedX ?? (breakpoint === 'tablet' ? 64 : 24);
  const expectedBreakpointWidth = options.expectedWidth ?? (breakpoint === 'tablet' ? 360 : 300);

  await selectLayerById(client, elementId);
  await clickButtonByAriaLabel(client, 'Desktop canvas');
  await selectLayerById(client, elementId);
  const desktopBefore = (await readEditorElementState(client, [elementId]))[elementId];
  assert(desktopBefore, `Unable to read current desktop editor state before responsive edit: ${elementId}`);
  await clickButtonByAriaLabel(client, breakpointCanvasLabel);
  await selectLayerById(client, elementId);
  await setLayoutNumberInput(client, 'X', expectedBreakpointX);
  await setLayoutNumberInput(client, 'Width', expectedBreakpointWidth);

  const breakpointStateForElement = await waitForElementState(
    client,
    elementId,
    (state) => state.x === expectedBreakpointX && state.width === expectedBreakpointWidth,
    `${breakpointLabel} override did not update editor element state`,
  );
  const breakpointState = { [elementId]: breakpointStateForElement };
  assert(
    breakpointState[elementId].x === expectedBreakpointX && breakpointState[elementId].width === expectedBreakpointWidth,
    `${breakpointLabel} override did not update editor element state: ${JSON.stringify(breakpointState[elementId])}`,
  );

  const overridePanel = await evaluate(client, `(() => {
    const panel = document.querySelector('[data-testid="editor-breakpoint-override"]');
    return {
      exists: Boolean(panel),
      text: panel?.textContent || '',
    };
  })()`);
  assert(
    overridePanel.exists && new RegExp(`${breakpoint} override`, 'i').test(overridePanel.text),
    `Responsive override panel did not appear: ${JSON.stringify(overridePanel)}`,
  );

  const layoutControls = await readBreakpointOverrideControls(client);
  assert(
    layoutControls.groups.layout.exists &&
      layoutControls.groups.layout.disabled === false &&
      layoutControls.groups.layer.exists &&
      layoutControls.groups.layer.disabled === Boolean(!options.expectExistingLayerOverride),
    `Breakpoint override controls did not expose active layout inheritance state: ${JSON.stringify(layoutControls)}`,
  );

  await clickBreakpointResetGroup(client, 'layout');
  await waitForElementState(
    client,
    elementId,
    (state) => state.x === Math.round(desktopBefore.x) && state.width === Math.round(desktopBefore.width),
    'Layout reset control did not restore inherited desktop layout',
  );
  await setLayoutNumberInput(client, 'X', expectedBreakpointX);
  await setLayoutNumberInput(client, 'Width', expectedBreakpointWidth);
  await waitForElementState(
    client,
    elementId,
    (state) => state.x === expectedBreakpointX && state.width === expectedBreakpointWidth,
    `${breakpointLabel} override did not reapply after layout reset`,
  );

  const breakpointLayerHidden = await setLayerHiddenState(client, elementId, true);
  const breakpointLayerLocked = await setLayerLockedState(client, elementId, true);
  const layerControls = await readBreakpointOverrideControls(client);
  assert(
    layerControls.groups.layout.disabled === false &&
      layerControls.groups.layer.disabled === false,
    `Breakpoint override controls did not expose active layout and layer state: ${JSON.stringify(layerControls)}`,
  );

  await clickBreakpointResetGroup(client, 'layer');
  const resetLayerState = await readLayerActionState(client, elementId);
  assert(
    resetLayerState.hidden === false && resetLayerState.locked === false,
    `Layer reset control did not restore inherited desktop layer state: ${JSON.stringify(resetLayerState)}`,
  );
  await setLayerHiddenState(client, elementId, true);
  await setLayerLockedState(client, elementId, true);

  await clickSave(client);

  let persistedElement = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    persistedElement = await readPersistedElement(pageId, elementId);
    const persistedOverride = persistedElement?.responsive?.[breakpoint];
    if (
      persistedOverride?.x === expectedBreakpointX &&
      persistedOverride?.width === expectedBreakpointWidth &&
      persistedOverride?.visible === false &&
      persistedOverride?.locked === true
    ) {
      break;
    }
    await sleep(250);
  }

  assert(
    (() => {
      const persistedOverride = persistedElement?.responsive?.[breakpoint];
      return (
        persistedElement?.x === desktopBefore.x &&
        persistedElement?.width === desktopBefore.width &&
        persistedOverride?.x === expectedBreakpointX &&
        persistedOverride?.width === expectedBreakpointWidth &&
        persistedOverride?.visible === false &&
        persistedOverride?.locked === true
      );
    })(),
    `Responsive override was not persisted without changing desktop layout: ${JSON.stringify({ desktopBefore, persistedElement })}`,
  );

  await clickButtonByAriaLabel(client, 'Desktop canvas');
  const desktopAfter = await readEditorElementState(client, [elementId]);
  assert(
    desktopAfter[elementId].x === Math.round(desktopBefore.x) &&
      desktopAfter[elementId].width === Math.round(desktopBefore.width),
    `Desktop canvas did not retain base layout after ${breakpoint} override: ${JSON.stringify({ desktopBefore, desktopAfter })}`,
  );

  await clickButtonByAriaLabel(client, breakpointCanvasLabel);
  const breakpointLayerAfter = await readLayerActionState(client, elementId);
  assert(
    breakpointLayerAfter.hidden === true && breakpointLayerAfter.locked === true,
    `${breakpointLabel} layer override did not hydrate after switching breakpoints: ${JSON.stringify(breakpointLayerAfter)}`,
  );

  return {
    breakpoint,
    elementId,
    desktopBefore: {
      x: desktopBefore.x,
      width: desktopBefore.width,
    },
    breakpointOverride: persistedElement.responsive[breakpoint],
    breakpointLayerHidden,
    breakpointLayerLocked,
    desktopAfter: desktopAfter[elementId],
    breakpointAfter: {
      ...breakpointState[elementId],
      hidden: breakpointLayerAfter.hidden,
      locked: breakpointLayerAfter.locked,
    },
  };
};

const testKeyboardNudge = async (client, elementId) => {
  await selectElement(client, elementId);
  const before = await readEditorElementState(client, [elementId]);
  await pressKey(client, 'ArrowRight', { shiftKey: true });
  await pressKey(client, 'ArrowDown', { shiftKey: true });
  const after = await readEditorElementState(client, [elementId]);

  assert(
    after[elementId].x === before[elementId].x + 10 &&
    after[elementId].y === before[elementId].y + 10,
    `${elementId} keyboard nudge failed: before ${JSON.stringify(before[elementId])}, after ${JSON.stringify(after[elementId])}`,
  );

  return {
    elementId,
    before: before[elementId],
    after: after[elementId],
    delta: {
      x: after[elementId].x - before[elementId].x,
      y: after[elementId].y - before[elementId].y,
    },
  };
};

const testUndoRedoAfterDrag = async (client, elementId) => {
  const before = await readEditorElementState(client, [elementId]);
  const drag = await dragElement(client, elementId, 30, 20);
  const moved = await readEditorElementState(client, [elementId]);

  await pressKey(client, 'z', { ctrlKey: true });
  const undone = await readEditorElementState(client, [elementId]);
  assertElementState(undone, before, `${elementId} Ctrl+Z`);

  await pressKey(client, 'z', { ctrlKey: true, shiftKey: true });
  const redone = await readEditorElementState(client, [elementId]);
  assertElementState(redone, moved, `${elementId} Ctrl+Shift+Z`);

  return {
    elementId,
    drag,
    before: before[elementId],
    moved: moved[elementId],
    undone: undone[elementId],
    redone: redone[elementId],
  };
};

const activateTextEditing = async (client, elementId) => {
  const box = await getElementBox(client, elementId);
  assert(box, `Missing text-editable element ${elementId}`);

  const x = Math.round(box.x + Math.min(box.width / 2, 120));
  const y = Math.round(box.y + Math.min(box.height / 2, 30));

  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x,
    y,
    button: 'none',
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    buttons: 1,
    clickCount: 2,
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    buttons: 0,
    clickCount: 2,
  });
  await sleep(250);

  const state = await evaluate(client, `(() => {
    const node = document.querySelector('[data-element-id="${elementId}"]');
    return {
      selected: Boolean(node?.className?.toString?.().includes('ring-sky-500')),
      editable: node?.getAttribute('data-backy-text-editor-editable') === 'true',
      hasMoveHandle: Boolean(node?.querySelector('[data-role="canvas-move-handle"]')),
    };
  })()`);

  assert(state?.editable, `Text editing did not activate for ${elementId}: ${JSON.stringify(state)}`);
  assert(state.hasMoveHandle, `Move handle missing while editing ${elementId}: ${JSON.stringify(state)}`);
  return state;
};

const clickSave = async (client) => {
  const clicked = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => {
      const label = (candidate.textContent || '').trim();
      return label === 'Save' || label === 'Saving...';
    });
    if (!button) return false;
    button.click();
    return true;
  })()`);

  assert(clicked, 'Unable to find Save button in editor');
};

const readEditorSaveStatus = async (client) => {
  const status = await evaluate(client, `(() => {
    const node = document.querySelector('[data-testid="editor-save-status"]');
    return {
      exists: Boolean(node),
      text: node?.textContent || '',
      title: node?.getAttribute('title') || '',
    };
  })()`);

  assert(status.exists, `Editor save status is missing: ${JSON.stringify(status)}`);
  return status;
};

const waitForEditorMutationReady = async (client, label = 'editor mutation readiness') => {
  let lastState = null;

  for (let attempt = 0; attempt < 60; attempt += 1) {
    lastState = await evaluate(client, `(() => {
      const status = document.querySelector('[data-testid="editor-save-status"]');
      const saveButton = Array.from(document.querySelectorAll('button')).find((candidate) => {
        const label = (candidate.textContent || '').trim();
        return label === 'Save' || label === 'Saving...';
      });
      return {
        statusText: status?.textContent || '',
        statusTitle: status?.getAttribute('title') || '',
        saveDisabled: saveButton instanceof HTMLButtonElement ? saveButton.disabled : null,
      };
    })()`);

    if (!/Saving|Writing to backend/i.test(lastState.statusText) && lastState.saveDisabled !== true) {
      return lastState;
    }

    await sleep(250);
  }

  throw new Error(`${label}: editor stayed busy too long: ${JSON.stringify(lastState)}`);
};

const waitForPersistedCanvasState = async (pageId, expectedState) => {
  let lastState = null;

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
    const elements = payload.data?.page?.content?.elements || [];
    const persistedState = {};

    for (const [elementId, expected] of Object.entries(expectedState)) {
      const element = findCanvasElement(elements, elementId);
      persistedState[elementId] = element
        ? {
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height,
          }
        : null;

      if (!element) {
        break;
      }

      const matches =
        Math.abs(element.x - expected.x) <= 1 &&
        Math.abs(element.y - expected.y) <= 1 &&
        Math.abs(element.width - expected.width) <= 1 &&
        Math.abs(element.height - expected.height) <= 1;

      if (!matches) {
        break;
      }
    }

    lastState = persistedState;

    const complete = Object.entries(expectedState).every(([elementId, expected]) => {
      const persisted = persistedState[elementId];
      return persisted &&
        Math.abs(persisted.x - expected.x) <= 1 &&
        Math.abs(persisted.y - expected.y) <= 1 &&
        Math.abs(persisted.width - expected.width) <= 1 &&
        Math.abs(persisted.height - expected.height) <= 1;
    });

    if (complete) {
      return persistedState;
    }

    await sleep(250);
  }

  throw new Error(`Saved canvas state did not match editor state. Expected ${JSON.stringify(expectedState)}, got ${JSON.stringify(lastState)}`);
};

const dragElement = async (client, elementId, deltaX, deltaY) => {
  await scrollElementIntoView(client, elementId);
  const before = await getElementBox(client, elementId);
  assert(before, `Missing draggable element ${elementId}`);

  const startPoint = await getElementDragStartPoint(client, elementId, before);
  const startX = startPoint.x;
  const startY = startPoint.y;
  const endX = startX + deltaX;
  const endY = startY + deltaY;
  const hitTarget = await evaluate(client, `(() => {
    const node = document.elementFromPoint(${startX}, ${startY});
    const element = node instanceof Element ? node : node?.parentElement;
    const host = element?.closest?.('[data-element-id]');
    return {
      tag: element?.tagName || null,
      className: element?.className?.toString?.() || '',
      elementId: host?.getAttribute('data-element-id') || null,
      role: element?.getAttribute?.('data-role') || null,
      editable: host?.getAttribute('data-backy-text-editor-editable') || null,
      text: element?.textContent?.trim?.().slice(0, 120) || '',
      viewport: { width: window.innerWidth, height: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY },
    };
  })()`);

  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: startX,
    y: startY,
    button: 'none',
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: startX,
    y: startY,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });

  for (let step = 1; step <= 10; step += 1) {
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(startX + (deltaX * step) / 10),
      y: Math.round(startY + (deltaY * step) / 10),
      button: 'left',
      buttons: 1,
    });
    await sleep(30);
  }

  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: endX,
    y: endY,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  await sleep(300);

  const after = await getElementBox(client, elementId);
  assert(after, `Element ${elementId} disappeared after drag`);

  const delta = measureDragDelta(before, after, deltaX, deltaY);
  assertDragDelta(
    delta,
    `${elementId} did not drag correctly; before ${JSON.stringify(before)}; start ${startX},${startY}; hit ${JSON.stringify(hitTarget)}`,
  );

  return {
    elementId,
    before: { x: Math.round(before.x), y: Math.round(before.y), left: before.left, top: before.top },
    after: { x: Math.round(after.x), y: Math.round(after.y), left: after.left, top: after.top },
    delta,
  };
};

const getMoveHandleBox = async (client, elementId) => {
  const { result } = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const handle = document.querySelector('[data-element-id="${elementId}"] [data-role="canvas-move-handle"]');
      if (!handle) return null;
      const rect = handle.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
    })()`,
    returnByValue: true,
  });

  return result.value || null;
};

const waitForMoveHandleBox = async (client, elementId) => {
  let lastHandle = null;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    lastHandle = await getMoveHandleBox(client, elementId);
    if (lastHandle) {
      return lastHandle;
    }
    await sleep(75);
  }

  return lastHandle;
};

const readInspectorState = async (client) => {
  const { result } = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const inspector = document.querySelector('[data-testid="editor-inspector"]');
      const selected = document.querySelector('[data-testid="editor-inspector-selection"]');
      const empty = document.querySelector('[data-testid="editor-inspector-empty"]');
      const workflow = document.querySelector('[data-testid="page-workflow-panel"]');
      const inspectorRect = inspector?.getBoundingClientRect();
      const workflowRect = workflow?.getBoundingClientRect();
      const overlapsWorkflow = Boolean(inspectorRect && workflowRect && !(
        workflowRect.right <= inspectorRect.left ||
        workflowRect.left >= inspectorRect.right ||
        workflowRect.bottom <= inspectorRect.top ||
        workflowRect.top >= inspectorRect.bottom
      ));
      return {
        hasInspector: Boolean(inspector),
        hasSelection: Boolean(selected),
        hasEmpty: Boolean(empty),
        selectedText: selected?.textContent || '',
        overlapsWorkflow,
      };
    })()`,
    returnByValue: true,
  });

  return result.value || null;
};

const assertInspectorSelection = async (client, elementId) => {
  await selectElement(client, elementId);
  const state = await readInspectorState(client);
  assert(state?.hasInspector, 'Editor inspector dock was not rendered');
  assert(state.hasSelection, `Inspector did not show selection for ${elementId}: ${JSON.stringify(state)}`);
  assert(!state.hasEmpty, `Inspector still showed empty state for ${elementId}: ${JSON.stringify(state)}`);
  assert(!state.overlapsWorkflow, `Workflow panel overlaps editor inspector: ${JSON.stringify(state)}`);
  return state;
};

const assertFontMediaPicker = async (client) => {
  const state = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="editor-font-media-picker"]');
    return {
      exists: Boolean(button),
      text: button?.textContent || '',
      disabled: button instanceof HTMLButtonElement ? button.disabled : false,
    };
  })()`);

  assert(state?.exists, `Font upload/select control missing from inspector: ${JSON.stringify(state)}`);
  assert(!state.disabled, `Font upload/select control disabled unexpectedly: ${JSON.stringify(state)}`);
  assert(/upload or select font/i.test(state.text), `Font upload/select control label changed: ${JSON.stringify(state)}`);
  return state;
};

const testComponentClickAdd = async (client, componentKey = 'divider') => {
  const before = await evaluate(client, `(() => ({
    count: document.querySelectorAll('[data-element-id]').length,
    selected: document.querySelector('[data-testid="editor-inspector-selection"]')?.textContent || '',
  }))()`);

  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector('[data-component-add="${componentKey}"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'missing-add-button' };
    }
    button.click();
    return { ok: true, label: button.getAttribute('aria-label') || button.textContent || '' };
  })()`);

  assert(clicked?.ok, `Unable to click component add button for ${componentKey}: ${JSON.stringify(clicked)}`);
  await sleep(250);

  const after = await evaluate(client, `(() => {
    const selected = document.querySelector('[data-testid="editor-inspector-selection"]');
    const selectedElement = Array.from(document.querySelectorAll('[data-element-id]')).find((node) => (
      node.querySelector('[data-role="canvas-move-handle"]')
    ));
    return {
      count: document.querySelectorAll('[data-element-id]').length,
      selectedText: selected?.textContent || '',
      selectedElementId: selectedElement?.getAttribute('data-element-id') || null,
    };
  })()`);

  assert(
    after.count === before.count + 1,
    `Component click-add did not insert exactly one element: before ${JSON.stringify(before)}, after ${JSON.stringify(after)}`,
  );
  assert(after.selectedElementId, `Component click-add did not select the inserted element: ${JSON.stringify(after)}`);

  return {
    componentKey,
    clicked,
    before,
    after,
  };
};

const assertGroupingControls = async (client) => {
  const state = await evaluate(client, `(() => {
    const groupButton = document.querySelector('[data-testid="editor-group-selection"]');
    const ungroupButton = document.querySelector('[data-testid="editor-ungroup-selection"]');
    const selectSiblingsButton = document.querySelector('[data-testid="editor-select-sibling-layers"]');
    const distributeHorizontalButton = document.querySelector('[data-testid="editor-distribute-horizontal"]');
    const distributeVerticalButton = document.querySelector('[data-testid="editor-distribute-vertical"]');
    return {
      hasGroupButton: Boolean(groupButton),
      hasUngroupButton: Boolean(ungroupButton),
      hasSelectSiblingsButton: Boolean(selectSiblingsButton),
      hasDistributeHorizontalButton: Boolean(distributeHorizontalButton),
      hasDistributeVerticalButton: Boolean(distributeVerticalButton),
      groupDisabled: groupButton instanceof HTMLButtonElement ? groupButton.disabled : null,
      ungroupDisabled: ungroupButton instanceof HTMLButtonElement ? ungroupButton.disabled : null,
      selectSiblingsDisabled: selectSiblingsButton instanceof HTMLButtonElement ? selectSiblingsButton.disabled : null,
      distributeHorizontalDisabled: distributeHorizontalButton instanceof HTMLButtonElement ? distributeHorizontalButton.disabled : null,
      distributeVerticalDisabled: distributeVerticalButton instanceof HTMLButtonElement ? distributeVerticalButton.disabled : null,
    };
  })()`);

  assert(state?.hasGroupButton, `Group control missing from editor toolbar: ${JSON.stringify(state)}`);
  assert(state?.hasUngroupButton, `Ungroup control missing from editor toolbar: ${JSON.stringify(state)}`);
  assert(state?.hasSelectSiblingsButton, `Select sibling layers control missing from editor toolbar: ${JSON.stringify(state)}`);
  assert(state?.hasDistributeHorizontalButton, `Horizontal distribute control missing from editor toolbar: ${JSON.stringify(state)}`);
  assert(state?.hasDistributeVerticalButton, `Vertical distribute control missing from editor toolbar: ${JSON.stringify(state)}`);
  return state;
};

const testSiblingScopeSelectionShortcut = async (client, requiredElementIds) => {
  const [firstId] = requiredElementIds;
  await selectElement(client, firstId);

  await evaluate(client, `(() => {
    const layersButton = Array.from(document.querySelectorAll('button')).find((button) => (
      (button.textContent || '').trim() === 'Layers'
    ));
    layersButton?.click();
    return true;
  })()`);
  await sleep(150);
  await pressKey(client, 'a', { ctrlKey: true });
  await sleep(250);

  const state = await evaluate(client, `(() => {
    const groupButton = document.querySelector('[data-testid="editor-group-selection"]');
    const multiSelection = document.querySelector('[data-testid="editor-inspector-multi-selection"]');
    const selectedLayers = Array.from(document.querySelectorAll('[data-layer-selected="true"]'))
      .map((node) => node.getAttribute('data-layer-id'))
      .filter(Boolean);

    return {
      selectedLayers,
      hasMultiSelection: Boolean(multiSelection),
      groupDisabled: groupButton instanceof HTMLButtonElement ? groupButton.disabled : null,
      inspectorText: multiSelection?.textContent || '',
    };
  })()`);

  assert(state.hasMultiSelection, `Ctrl+A sibling selection did not reach multi-selection inspector: ${JSON.stringify(state)}`);
  assert(state.groupDisabled === false, `Ctrl+A sibling selection did not enable grouping: ${JSON.stringify(state)}`);
  assert(
    requiredElementIds.every((id) => state.selectedLayers.includes(id)),
    `Ctrl+A sibling selection missed expected layers: ${JSON.stringify({ requiredElementIds, state })}`,
  );

  return state;
};

const testLayerGrouping = async (client, elementIds) => {
  assert(elementIds.length >= 2, 'Layer grouping test needs at least two elements');
  const [firstId, secondId] = elementIds;
  const before = await readEditorElementState(client, [firstId, secondId]);

  await evaluate(client, `(() => {
    if (!document.querySelector('[data-layer-id="${firstId}"]')) {
      const layersButton = Array.from(document.querySelectorAll('button')).find((button) => (
        (button.textContent || '').trim() === 'Layers'
      ));
      layersButton?.click();
    }
    return true;
  })()`);

  let layersReady = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    layersReady = await evaluate(client, `(() => ({
      first: Boolean(document.querySelector('[data-layer-id="${firstId}"]')),
      second: Boolean(document.querySelector('[data-layer-id="${secondId}"]')),
      body: document.body?.innerText?.slice(0, 300) || '',
    }))()`);
    if (layersReady.first && layersReady.second) {
      break;
    }
    await sleep(100);
  }

  assert(layersReady?.first && layersReady?.second, `Layer rows did not render for grouping: ${JSON.stringify(layersReady)}`);

  const selected = await evaluate(client, `(() => {

    const first = document.querySelector('[data-layer-id="${firstId}"]');
    const second = document.querySelector('[data-layer-id="${secondId}"]');
    if (!first || !second) {
      return { ok: false, reason: 'missing-layer-item' };
    }

    first.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    second.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));

    return {
      ok: true,
      selectedLayers: Array.from(document.querySelectorAll('[data-layer-selected="true"]')).map((node) => node.getAttribute('data-layer-id')),
      groupDisabled: document.querySelector('[data-testid="editor-group-selection"]') instanceof HTMLButtonElement
        ? document.querySelector('[data-testid="editor-group-selection"]').disabled
        : null,
    };
  })()`);

  await sleep(250);
  const ready = await evaluate(client, `(() => {
    const groupButton = document.querySelector('[data-testid="editor-group-selection"]');
    const multiSelection = document.querySelector('[data-testid="editor-inspector-multi-selection"]');
    return {
      selectedLayers: Array.from(document.querySelectorAll('[data-layer-selected="true"]')).map((node) => node.getAttribute('data-layer-id')),
      hasMultiSelection: Boolean(multiSelection),
      groupDisabled: groupButton instanceof HTMLButtonElement ? groupButton.disabled : null,
    };
  })()`);

  assert(selected?.ok, `Unable to select layers for grouping: ${JSON.stringify(selected)}`);
  assert(ready.hasMultiSelection, `Layer multi-selection did not reach inspector: ${JSON.stringify(ready)}`);
  assert(ready.groupDisabled === false, `Group button did not enable for sibling layers: ${JSON.stringify(ready)}`);

  await pressKey(client, 'g', { ctrlKey: true });
  await sleep(250);
  const grouped = await evaluate(client, `(() => {
    const ungroupButton = document.querySelector('[data-testid="editor-ungroup-selection"]');
    const selected = document.querySelector('[data-testid="editor-inspector-selection"]');
    return {
      hasSelection: Boolean(selected),
      selectedText: selected?.textContent || '',
      ungroupDisabled: ungroupButton instanceof HTMLButtonElement ? ungroupButton.disabled : null,
    };
  })()`);

  assert(grouped.hasSelection, `Grouped selection was not shown in inspector: ${JSON.stringify(grouped)}`);
  assert(grouped.ungroupDisabled === false, `Ungroup button did not enable after grouping: ${JSON.stringify(grouped)}`);

  await pressKey(client, 'g', { ctrlKey: true, shiftKey: true });
  await sleep(250);
  const after = await readEditorElementState(client, [firstId, secondId]);
  assertElementState(after, before, 'group/ungroup roundtrip');

  return {
    selected: ready,
    grouped,
    before,
    after,
  };
};

const selectLayerIds = async (client, elementIds) => {
  const [firstId] = elementIds;

  await evaluate(client, `(() => {
    if (!document.querySelector('[data-layer-id="${firstId}"]')) {
      const layersButton = Array.from(document.querySelectorAll('button')).find((button) => (
        (button.textContent || '').trim() === 'Layers'
      ));
      layersButton?.click();
    }
    return true;
  })()`);

  let layersReady = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    layersReady = await evaluate(client, `(() => ({
      ready: ${JSON.stringify(elementIds)}.every((id) => Boolean(document.querySelector('[data-layer-id="' + id + '"]'))),
      body: document.body?.innerText?.slice(0, 300) || '',
    }))()`);
    if (layersReady.ready) {
      break;
    }
    await sleep(100);
  }

  assert(layersReady?.ready, `Layer rows did not render for multi-selection: ${JSON.stringify(layersReady)}`);

  let selected = null;
  for (const [index, id] of elementIds.entries()) {
    selected = await evaluate(client, `(() => {
      const id = ${JSON.stringify(id)};
      const layer = document.querySelector('[data-layer-id="' + id + '"]');
      if (!layer) {
        return { ok: false, reason: 'missing-layer-item', id };
      }
      layer.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        ctrlKey: ${index > 0 ? 'true' : 'false'},
        metaKey: false,
      }));

      return { ok: true };
    })()`);
    assert(selected?.ok, `Unable to select layer ${id}: ${JSON.stringify(selected)}`);
    await sleep(120);
  }

  const ready = await evaluate(client, `(() => ({
    selectedLayers: Array.from(document.querySelectorAll('[data-layer-selected="true"]')).map((node) => node.getAttribute('data-layer-id')),
    hasMultiSelection: Boolean(document.querySelector('[data-testid="editor-inspector-multi-selection"]')),
  }))()`);

  assert(
    elementIds.every((id) => ready.selectedLayers?.includes(id)),
    `Layer multi-selection missing expected ids: ${JSON.stringify(ready)}`,
  );

  return ready;
};

const testMultiSelectionCanvasDrag = async (client, elementIds) => {
  assert(elementIds.length >= 2, 'Multi-selection drag test needs at least two elements');
  await selectLayerIds(client, elementIds);

  const before = await readEditorElementState(client, elementIds);
  const drag = await dragSelectionHandle(client, elementIds[0], 50, 30, { selectFirst: false });
  const after = await readEditorElementState(client, elementIds);
  const expectedCanvasDeltaX = drag.delta?.canvas?.x ?? 50;
  const expectedCanvasDeltaY = drag.delta?.canvas?.y ?? 30;

  for (const elementId of elementIds) {
    const actualDeltaX = after[elementId].x - before[elementId].x;
    const actualDeltaY = after[elementId].y - before[elementId].y;
    assert(
      Math.abs(actualDeltaX - expectedCanvasDeltaX) <= 12 &&
      Math.abs(actualDeltaY - expectedCanvasDeltaY) <= 12,
      `${elementId} did not move with multi-selection drag: expected canvas ${expectedCanvasDeltaX},${expectedCanvasDeltaY}; got ${actualDeltaX},${actualDeltaY}; before ${JSON.stringify(before[elementId])}, after ${JSON.stringify(after[elementId])}`,
    );
  }

  return {
    selected: elementIds,
    drag,
    before,
    after,
  };
};

const getStateBounds = (state) => {
  const entries = Object.values(state);
  const minX = Math.min(...entries.map((entry) => entry.x));
  const minY = Math.min(...entries.map((entry) => entry.y));
  const maxX = Math.max(...entries.map((entry) => entry.x + entry.width));
  const maxY = Math.max(...entries.map((entry) => entry.y + entry.height));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

const testMultiSelectionResize = async (client, elementIds) => {
  assert(elementIds.length >= 2, 'Multi-selection resize test needs at least two sibling elements');
  const [activeElementId] = elementIds;

  await selectLayerIds(client, elementIds);
  await scrollElementIntoView(client, activeElementId);
  const before = await readEditorElementState(client, elementIds);
  const beforeBounds = getStateBounds(before);

  const handle = await evaluate(client, `(() => {
    const handle = document.querySelector('[data-element-id="${activeElementId}"] [data-role="canvas-resize-handle"][data-resize-handle="se"]');
    if (!handle) {
      return {
        ok: false,
        reason: 'missing-se-handle',
        selected: Array.from(document.querySelectorAll('[data-layer-selected="true"]')).map((node) => node.getAttribute('data-layer-id')),
        handles: Array.from(document.querySelectorAll('[data-role="canvas-resize-handle"]')).map((node) => ({
          elementId: node.closest('[data-element-id]')?.getAttribute('data-element-id') || null,
          position: node.getAttribute('data-resize-handle'),
        })),
      };
    }
    const rect = handle.getBoundingClientRect();
    return {
      ok: true,
      x: Math.round(rect.x + rect.width / 2),
      y: Math.round(rect.y + rect.height / 2),
    };
  })()`);

  assert(handle?.ok, `Unable to find multi-selection resize handle: ${JSON.stringify(handle)}`);

  const deltaX = 70;
  const deltaY = 50;
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: handle.x,
    y: handle.y,
    button: 'none',
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: handle.x,
    y: handle.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });

  for (let step = 1; step <= 8; step += 1) {
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(handle.x + (deltaX * step) / 8),
      y: Math.round(handle.y + (deltaY * step) / 8),
      button: 'left',
      buttons: 1,
    });
    await sleep(30);
  }

  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: handle.x + deltaX,
    y: handle.y + deltaY,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  await sleep(300);

  const after = await readEditorElementState(client, elementIds);
  const afterBounds = getStateBounds(after);

  for (const elementId of elementIds) {
    assert(
      after[elementId].width > before[elementId].width &&
        after[elementId].height > before[elementId].height,
      `${elementId} did not scale during multi-selection resize: before ${JSON.stringify(before[elementId])}, after ${JSON.stringify(after[elementId])}`,
    );
  }

  assert(
    afterBounds.width > beforeBounds.width && afterBounds.height > beforeBounds.height,
    `Multi-selection bounds did not expand after resize: before ${JSON.stringify(beforeBounds)}, after ${JSON.stringify(afterBounds)}`,
  );

  return {
    selected: elementIds,
    before,
    after,
    beforeBounds,
    afterBounds,
  };
};

const centerGaps = (state, axis) => {
  const entries = Object.values(state).sort((left, right) => (
    axis === 'horizontal'
      ? (left.x + left.width / 2) - (right.x + right.width / 2)
      : (left.y + left.height / 2) - (right.y + right.height / 2)
  ));

  return entries.slice(0, -1).map((entry, index) => {
    const next = entries[index + 1];
    return axis === 'horizontal'
      ? Math.round((next.x + next.width / 2) - (entry.x + entry.width / 2))
      : Math.round((next.y + next.height / 2) - (entry.y + entry.height / 2));
  });
};

const assertEvenSpacing = (state, axis, label) => {
  const gaps = centerGaps(state, axis);
  const min = Math.min(...gaps);
  const max = Math.max(...gaps);
  assert(
    gaps.length >= 2 && Math.abs(max - min) <= 2,
    `${label}: expected even ${axis} center spacing, got ${JSON.stringify({ gaps, state })}`,
  );
  return gaps;
};

const testMultiSelectionDistribution = async (client, elementIds) => {
  assert(elementIds.length >= 3, 'Multi-selection distribution test needs at least three sibling elements');
  await selectLayerIds(client, elementIds);

  const ready = await evaluate(client, `(() => {
    const horizontal = document.querySelector('[data-testid="editor-distribute-horizontal"]');
    const vertical = document.querySelector('[data-testid="editor-distribute-vertical"]');
    const inspectorHorizontal = document.querySelector('[data-testid="editor-inspector-distribute-horizontal"]');
    const inspectorVertical = document.querySelector('[data-testid="editor-inspector-distribute-vertical"]');
    return {
      selectedLayers: Array.from(document.querySelectorAll('[data-layer-selected="true"]')).map((node) => node.getAttribute('data-layer-id')),
      horizontalDisabled: horizontal instanceof HTMLButtonElement ? horizontal.disabled : null,
      verticalDisabled: vertical instanceof HTMLButtonElement ? vertical.disabled : null,
      inspectorHorizontalDisabled: inspectorHorizontal instanceof HTMLButtonElement ? inspectorHorizontal.disabled : null,
      inspectorVerticalDisabled: inspectorVertical instanceof HTMLButtonElement ? inspectorVertical.disabled : null,
      inspectorText: document.querySelector('[data-testid="editor-inspector-multi-selection"]')?.textContent || '',
    };
  })()`);

  assert(ready.horizontalDisabled === false, `Horizontal distribute did not enable for three selected layers: ${JSON.stringify(ready)}`);
  assert(ready.verticalDisabled === false, `Vertical distribute did not enable for three selected layers: ${JSON.stringify(ready)}`);
  assert(ready.inspectorHorizontalDisabled === false, `Inspector horizontal distribute did not enable: ${JSON.stringify(ready)}`);
  assert(ready.inspectorVerticalDisabled === false, `Inspector vertical distribute did not enable: ${JSON.stringify(ready)}`);

  await clickButtonByAriaLabel(client, 'Distribute horizontal spacing');
  await sleep(200);
  const afterHorizontal = await readEditorElementState(client, elementIds);
  const horizontalGaps = assertEvenSpacing(afterHorizontal, 'horizontal', 'horizontal distribution');

  await clickButtonByAriaLabel(client, 'Distribute vertical spacing');
  await sleep(200);
  const afterVertical = await readEditorElementState(client, elementIds);
  const verticalGaps = assertEvenSpacing(afterVertical, 'vertical', 'vertical distribution');

  return {
    ready,
    afterHorizontal,
    afterVertical,
    horizontalGaps,
    verticalGaps,
  };
};

const testLayerHierarchyControls = async (client) => {
  await selectLayerIds(client, ['smoke-image']);
  const beforeImageBox = await getElementBox(client, 'smoke-image');
  const beforeChildBox = await getElementBox(client, 'smoke-child-button');
  const beforeState = await readEditorElementState(client, ['smoke-image', 'smoke-box', 'smoke-child-button']);
  assert(beforeImageBox && beforeChildBox, 'Unable to read visual boxes before layer hierarchy controls');

  const nestedClick = await clickLayerAction(client, 'nest-selection', 'smoke-box');
  const afterNestTree = await readLayerTreeState(client, ['smoke-image', 'smoke-box', 'smoke-child-button']);
  const afterNestedImageBox = await getElementBox(client, 'smoke-image');
  const afterNestedState = await readEditorElementState(client, ['smoke-image']);
  assert(afterNestedImageBox, 'Unable to read image box after nesting');
  assert(
    afterNestTree.byId['smoke-image'].depth > afterNestTree.byId['smoke-box'].depth,
    `Nesting selected layer did not move smoke-image under smoke-box: ${JSON.stringify(afterNestTree)}`,
  );
  assert(
    Math.abs(afterNestedImageBox.x - beforeImageBox.x) <= 3 &&
      Math.abs(afterNestedImageBox.y - beforeImageBox.y) <= 3,
    `Nesting selected layer did not preserve visual position: before ${JSON.stringify(beforeImageBox)}, after ${JSON.stringify(afterNestedImageBox)}`,
  );
  assert(
    Math.abs(afterNestedState['smoke-image'].x - (beforeState['smoke-image'].x - beforeState['smoke-box'].x)) <= 1 &&
      Math.abs(afterNestedState['smoke-image'].y - (beforeState['smoke-image'].y - beforeState['smoke-box'].y)) <= 1,
    `Nested image did not convert to parent-relative coordinates: ${JSON.stringify({ beforeState, afterNestedState })}`,
  );

  const outdentClick = await clickLayerAction(client, 'outdent', 'smoke-child-button');
  const afterOutdentTree = await readLayerTreeState(client, ['smoke-child-button', 'smoke-box']);
  const afterOutdentChildBox = await getElementBox(client, 'smoke-child-button');
  const afterOutdentState = await readEditorElementState(client, ['smoke-child-button']);
  assert(afterOutdentChildBox, 'Unable to read child button after outdent');
  assert(
    afterOutdentTree.byId['smoke-child-button'].depth === afterOutdentTree.byId['smoke-box'].depth,
    `Outdent did not promote nested child to parent layer level: ${JSON.stringify(afterOutdentTree)}`,
  );
  assert(
    Math.abs(afterOutdentChildBox.x - beforeChildBox.x) <= 3 &&
      Math.abs(afterOutdentChildBox.y - beforeChildBox.y) <= 3,
    `Outdent did not preserve visual position: before ${JSON.stringify(beforeChildBox)}, after ${JSON.stringify(afterOutdentChildBox)}`,
  );
  assert(
    afterOutdentState['smoke-child-button'].x > beforeState['smoke-child-button'].x &&
      afterOutdentState['smoke-child-button'].y > beforeState['smoke-child-button'].y,
    `Outdent did not convert nested child to root-relative coordinates: ${JSON.stringify({ beforeState, afterOutdentState })}`,
  );

  return {
    nestedClick,
    outdentClick,
    beforeState,
    afterNestedState,
    afterNestTree,
    afterOutdentState,
    afterOutdentTree,
  };
};

const testSyncedReusableSectionInstance = async (client, sectionId) => {
  await selectElement(client, 'smoke-heading');

  const added = await evaluate(client, `(() => {
    const button = document.querySelector('[data-component-add="reusable-section:${sectionId}"]');
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        reason: 'missing-add-button',
        reusableItems: Array.from(document.querySelectorAll('[data-component-library-item^="reusable-section:"]')).map((node) => ({
          item: node.getAttribute('data-component-library-item'),
          text: node.textContent?.trim?.().slice(0, 120) || '',
        })),
      };
    }

    button.click();
    return { ok: true, label: button.getAttribute('aria-label') || '' };
  })()`);
  assert(added?.ok, `Unable to add synced reusable section: ${JSON.stringify(added)}`);
  await sleep(350);

  const inserted = await evaluate(client, `(() => {
    const selectedElement = Array.from(document.querySelectorAll('[data-element-id]')).find((node) => (
      node.querySelector('[data-role="canvas-move-handle"]')
    ));
    const panel = document.querySelector('[data-testid="editor-reusable-instance"]');
    const refresh = document.querySelector('[data-testid="editor-refresh-reusable-instance"]');
    const detach = document.querySelector('[data-testid="editor-detach-reusable-instance"]');
    return {
      selectedElementId: selectedElement?.getAttribute('data-element-id') || null,
      panelText: panel?.textContent || '',
      refreshDisabled: refresh instanceof HTMLButtonElement ? refresh.disabled : null,
      detachDisabled: detach instanceof HTMLButtonElement ? detach.disabled : null,
      body: document.body?.innerText?.slice(0, 300) || '',
    };
  })()`);

  assert(inserted.selectedElementId, `Synced reusable insertion did not select the inserted root: ${JSON.stringify(inserted)}`);
  assert(/Synced section/i.test(inserted.panelText), `Synced reusable inspector card missing: ${JSON.stringify(inserted)}`);
  assert(inserted.refreshDisabled === false, `Synced reusable refresh control disabled: ${JSON.stringify(inserted)}`);
  assert(inserted.detachDisabled === false, `Synced reusable detach control disabled: ${JSON.stringify(inserted)}`);

  const beforeRefresh = await readEditorElementState(client, [inserted.selectedElementId]);

  await requestApi(`/api/admin/sites/${SITE_ID}/reusable-sections/${sectionId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      content: {
        canvasSize: { width: 360, height: 120 },
        elements: [
          {
            id: 'editor-smoke-reusable-root-updated',
            type: 'box',
            x: 0,
            y: 0,
            width: 360,
            height: 120,
            zIndex: 1,
            props: {
              backgroundColor: '#ecfeff',
              borderColor: '#0891b2',
              borderWidth: 1,
              borderRadius: 12,
            },
            children: [
              {
                id: 'editor-smoke-reusable-label-updated',
                type: 'heading',
                x: 24,
                y: 28,
                width: 260,
                height: 44,
                zIndex: 1,
                props: {
                  content: 'Reusable v2',
                  level: 'h2',
                  fontSize: 28,
                  color: '#155e75',
                },
              },
            ],
          },
        ],
      },
      updatedBy: 'admin',
    }),
  });

  const refreshedList = await evaluate(client, `(() => {
    const button = document.querySelector('button[title="Refresh saved sections"]');
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);
  assert(refreshedList, 'Unable to refresh saved section library after source update');
  await sleep(600);

  const refreshClicked = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="editor-refresh-reusable-instance"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return false;
    }
    button.click();
    return true;
  })()`);
  assert(refreshClicked, 'Unable to refresh selected synced reusable instance');
  await sleep(350);

  const afterRefresh = await readEditorElementState(client, [inserted.selectedElementId]);
  const refreshedText = await evaluate(client, `(() => {
    const node = document.querySelector('[data-element-id="${inserted.selectedElementId}"]');
    return node?.textContent || '';
  })()`);
  assert(
    afterRefresh[inserted.selectedElementId].width > beforeRefresh[inserted.selectedElementId].width &&
      afterRefresh[inserted.selectedElementId].height > beforeRefresh[inserted.selectedElementId].height,
    `Synced reusable refresh did not apply source dimensions: before ${JSON.stringify(beforeRefresh)}, after ${JSON.stringify(afterRefresh)}`,
  );
  assert(/Reusable v2/i.test(refreshedText), `Synced reusable refresh did not apply source content: ${JSON.stringify(refreshedText)}`);

  const detachClicked = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="editor-detach-reusable-instance"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return false;
    }
    button.click();
    return true;
  })()`);
  assert(detachClicked, 'Unable to detach synced reusable instance');
  await sleep(250);

  const afterDetach = await evaluate(client, `(() => ({
    hasPanel: Boolean(document.querySelector('[data-testid="editor-reusable-instance"]')),
    selectedElementId: Array.from(document.querySelectorAll('[data-element-id]')).find((node) => (
      node.querySelector('[data-role="canvas-move-handle"]')
    ))?.getAttribute('data-element-id') || null,
  }))()`);
  assert(afterDetach.hasPanel === false, `Reusable section detach did not remove sync card: ${JSON.stringify(afterDetach)}`);

  return {
    sectionId,
    inserted,
    beforeRefresh,
    afterRefresh,
    afterDetach,
  };
};

const dragSelectionHandle = async (client, elementId, deltaX, deltaY, options = {}) => {
  await scrollElementIntoView(client, elementId);
  if (options.selectFirst !== false) {
    await selectElement(client, elementId);
  }
  const before = await getElementBox(client, elementId);
  assert(before, `Missing element ${elementId} before move-handle drag`);
  const handle = await waitForMoveHandleBox(client, elementId);
  if (!handle) {
    const selectionState = await evaluate(client, `(() => {
      const node = document.querySelector('[data-element-id="${elementId}"]');
      const selected = Array.from(document.querySelectorAll('[data-element-id]'))
        .filter((candidate) => candidate.querySelector('[data-role="canvas-move-handle"]'))
        .map((candidate) => ({
          id: candidate.getAttribute('data-element-id'),
          className: candidate.className?.toString?.() || '',
        }));
      return {
        exists: Boolean(node),
        className: node?.className?.toString?.() || '',
        text: node?.textContent?.trim?.().slice(0, 120) || '',
        box: (() => {
          const rect = node?.getBoundingClientRect?.();
          return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
        })(),
        centerHit: (() => {
          const rect = node?.getBoundingClientRect?.();
          if (!rect) return null;
          const hit = document.elementFromPoint(rect.x + Math.min(rect.width / 2, 60), rect.y + Math.min(rect.height / 2, 24));
          const element = hit instanceof Element ? hit : hit?.parentElement;
          const host = element?.closest?.('[data-element-id]');
          return {
            tag: element?.tagName || null,
            text: element?.textContent?.trim?.().slice(0, 80) || '',
            elementId: host?.getAttribute('data-element-id') || null,
            className: element?.className?.toString?.() || '',
          };
        })(),
        selected,
      };
    })()`);
    assert(handle, `Missing move handle for selected element ${elementId}: ${JSON.stringify(selectionState)}`);
  }

  const startX = Math.round(handle.x + Math.min(handle.width / 2, 56));
  const startY = Math.round(handle.y + Math.min(handle.height / 2, 12));
  const endX = startX + deltaX;
  const endY = startY + deltaY;

  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: startX,
    y: startY,
    button: 'none',
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: startX,
    y: startY,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });

  for (let step = 1; step <= 8; step += 1) {
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(startX + (deltaX * step) / 8),
      y: Math.round(startY + (deltaY * step) / 8),
      button: 'left',
      buttons: 1,
    });
    await sleep(30);
  }

  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: endX,
    y: endY,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  await sleep(300);

  const after = await getElementBox(client, elementId);
  assert(after, `Element ${elementId} disappeared after move-handle drag`);

  const delta = measureDragDelta(before, after, deltaX, deltaY);
  assertDragDelta(delta, `${elementId} move handle did not drag correctly`);

  return {
    elementId,
    before: { x: Math.round(before.x), y: Math.round(before.y), left: before.left, top: before.top },
    after: { x: Math.round(after.x), y: Math.round(after.y), left: after.left, top: after.top },
    delta,
  };
};

const dragEditingMoveHandle = async (client, elementId, deltaX, deltaY) => {
  const editing = await activateTextEditing(client, elementId);
  const drag = await dragSelectionHandle(client, elementId, deltaX, deltaY, { selectFirst: false });
  return { editing, drag };
};

const resizeElement = async (client, elementId, deltaX, deltaY) => {
  await scrollElementIntoView(client, elementId);
  const selectionBox = await getElementBox(client, elementId);
  assert(selectionBox, `Missing element ${elementId}`);
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: Math.round(selectionBox.x + 12),
    y: Math.round(selectionBox.y + 12),
    button: 'none',
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: Math.round(selectionBox.x + 12),
    y: Math.round(selectionBox.y + 12),
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: Math.round(selectionBox.x + 12),
    y: Math.round(selectionBox.y + 12),
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  await sleep(150);

  const before = await getElementBox(client, elementId);
  const handle = await evaluate(client, `(() => {
    const node = document.querySelector('[data-element-id="${elementId}"]');
    if (!node) return null;
    const handles = Array.from(node.children).filter((child) => child.getAttribute('data-role') === 'canvas-resize-handle').map((handle) => {
      const rect = handle.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    return handles.sort((a, b) => (b.x + b.y) - (a.x + a.y))[0] || null;
  })()`);
  assert(before && handle, `Missing resize handle for ${elementId}`);

  const startX = Math.round(handle.x + handle.width / 2);
  const startY = Math.round(handle.y + handle.height / 2);
  const endX = startX + deltaX;
  const endY = startY + deltaY;

  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: startX,
    y: startY,
    button: 'none',
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: startX,
    y: startY,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  await sleep(50);
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: endX,
    y: endY,
    button: 'left',
    buttons: 1,
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: endX,
    y: endY,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  await sleep(300);

  const after = await getElementBox(client, elementId);
  assert(after, `Element ${elementId} disappeared after resize`);
  assert(
    after.width > before.width && after.height > before.height,
    `${elementId} did not resize larger: before ${Math.round(before.width)}x${Math.round(before.height)}, after ${Math.round(after.width)}x${Math.round(after.height)}`,
  );

  return {
    elementId,
    before: { width: Math.round(before.width), height: Math.round(before.height) },
    after: { width: Math.round(after.width), height: Math.round(after.height) },
  };
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-editor-drag-${Date.now()}`);
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

const cleanup = async ({ client, childProcess, userDataDir }) => {
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
  const tempPageId = EDITOR_PATH ? null : await createSmokePage();
  const tempReusableSectionId = EDITOR_PATH ? null : await createSmokeReusableSection();
  const editorPath = EDITOR_PATH || `/pages/${tempPageId}/edit`;
  const { childProcess, userDataDir } = launchChrome();
  let client;

  try {
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
      source: AUTH_STORAGE_SCRIPT,
    });
    await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}${editorPath}` });

    await waitForEditorElements(client, EDITOR_PATH
      ? ['home-heading', 'home-cta']
      : ['smoke-heading', 'smoke-child-button', 'smoke-top-edge']);

    const clickAdd = await testComponentClickAdd(client, 'divider');

    const drags = EDITOR_PATH
      ? [
          await dragElement(client, 'home-heading', 90, 40),
          await dragElement(client, 'home-cta', 70, 30),
        ]
      : [
          await dragElement(client, 'smoke-heading', 90, 40),
          await dragElement(client, 'smoke-image', 80, 40),
          await dragElement(client, 'smoke-box', 70, 30),
          await dragElement(client, 'smoke-child-button', 40, 20),
          await dragElement(client, 'smoke-form', 60, 30),
        ];
    const moveHandleDrags = EDITOR_PATH
      ? [
          await dragSelectionHandle(client, 'home-heading', 40, 20),
        ]
      : [
          await dragSelectionHandle(client, 'smoke-heading', 40, 20),
          await dragSelectionHandle(client, 'smoke-top-edge', 30, 20),
        ];
    const editingMoveHandleDrags = EDITOR_PATH
      ? [
          await dragEditingMoveHandle(client, 'home-heading', 25, 15),
        ]
      : [
          await dragEditingMoveHandle(client, 'smoke-heading', 25, 15),
        ];
    const resizes = EDITOR_PATH ? [] : [
      await resizeElement(client, 'smoke-image', 50, 40),
      await resizeElement(client, 'smoke-form', 50, 40),
    ];
    const keyboard = EDITOR_PATH
      ? {
          nudges: [
            await testKeyboardNudge(client, 'home-cta'),
          ],
          undoRedo: [
            await testUndoRedoAfterDrag(client, 'home-heading'),
          ],
        }
      : {
          nudges: [
            await testKeyboardNudge(client, 'smoke-child-button'),
          ],
          undoRedo: [
            await testUndoRedoAfterDrag(client, 'smoke-box'),
          ],
        };
    const inspector = await assertInspectorSelection(client, EDITOR_PATH ? 'home-heading' : 'smoke-heading');
    const dirtySaveStatus = await readEditorSaveStatus(client);
    assert(
      /Unsaved|Autosaving|Saving|Saved|Save failed/.test(dirtySaveStatus.text),
      `Editor save status did not expose a known state: ${JSON.stringify(dirtySaveStatus)}`,
    );
    const fontPicker = await assertFontMediaPicker(client);
    const groupingControls = await assertGroupingControls(client);
    const siblingScopeSelection = await testSiblingScopeSelectionShortcut(
      client,
      EDITOR_PATH ? ['home-heading', 'home-cta'] : ['smoke-heading', 'smoke-image'],
    );
    const multiSelectionDrag = await testMultiSelectionCanvasDrag(
      client,
      EDITOR_PATH ? ['home-heading', 'home-cta'] : ['smoke-heading', 'smoke-image'],
    );
    const multiSelectionResize = EDITOR_PATH
      ? null
      : await testMultiSelectionResize(client, ['smoke-heading', 'smoke-image']);
    const multiSelectionDistribution = EDITOR_PATH
      ? null
      : await testMultiSelectionDistribution(client, ['smoke-heading', 'smoke-image', 'smoke-box']);
    const grouping = await testLayerGrouping(
      client,
      EDITOR_PATH ? ['home-heading', 'home-cta'] : ['smoke-heading', 'smoke-image'],
    );
    const layerHierarchy = EDITOR_PATH
      ? null
      : await testLayerHierarchyControls(client);
    const syncedReusableSection = tempReusableSectionId
      ? await testSyncedReusableSectionInstance(client, tempReusableSectionId)
      : null;
    const afterReusableMutationReady = tempReusableSectionId
      ? await waitForEditorMutationReady(client, 'after synced reusable section actions')
      : null;

    let persistedState = null;
    let reloadedState = null;
    let responsiveEditing = null;
    let reloadedResponsiveEditing = null;
    let postSaveInspector = null;
    let savedStatus = null;
    if (tempPageId) {
      const elementIds = ['smoke-heading', 'smoke-image', 'smoke-top-edge', 'smoke-box', 'smoke-child-button', 'smoke-form'];
      responsiveEditing = {
        mobile: await assertResponsiveBreakpointEditing(client, tempPageId, 'smoke-heading', {
          breakpoint: 'mobile',
          expectedX: 24,
          expectedWidth: 300,
        }),
        tablet: await assertResponsiveBreakpointEditing(client, tempPageId, 'smoke-heading', {
          breakpoint: 'tablet',
          expectedX: 64,
          expectedWidth: 360,
        }),
      };
      await clickButtonByAriaLabel(client, 'Desktop canvas');
      const expectedState = await readEditorElementState(client, elementIds);
      await clickSave(client);
      savedStatus = await readEditorSaveStatus(client);
      assert(
        /Saved|Saving|Autosaving/.test(savedStatus.text),
        `Editor save status did not update after save: ${JSON.stringify(savedStatus)}`,
      );
      postSaveInspector = await readInspectorState(client);
      assert(
        postSaveInspector?.hasSelection && !postSaveInspector.hasEmpty,
        `Inspector selection was not preserved after save: ${JSON.stringify(postSaveInspector)}`,
      );
      assert(
        !postSaveInspector.overlapsWorkflow,
        `Workflow panel overlaps editor inspector after save: ${JSON.stringify(postSaveInspector)}`,
      );
      persistedState = await waitForPersistedCanvasState(tempPageId, expectedState);

      let reloadClient = null;
      try {
        reloadClient = await openAuthenticatedEditorTab(client, `${ADMIN_BASE_URL}${editorPath}`);
        await waitForEditorElements(reloadClient, ['smoke-heading', 'smoke-form']);
        reloadedState = await readEditorElementState(reloadClient, elementIds);
        reloadedResponsiveEditing = {
          mobile: await assertResponsiveBreakpointEditing(
            reloadClient,
            tempPageId,
            'smoke-heading',
            {
              breakpoint: 'mobile',
              expectedX: 24,
              expectedWidth: 300,
              expectExistingLayerOverride: true,
            },
          ),
          tablet: await assertResponsiveBreakpointEditing(
            reloadClient,
            tempPageId,
            'smoke-heading',
            {
              breakpoint: 'tablet',
              expectedX: 64,
              expectedWidth: 360,
              expectExistingLayerOverride: true,
            },
          ),
        };
      } finally {
        if (reloadClient) {
          try {
            await reloadClient.send('Page.close');
          } catch {
            // The target may already be closed by Chrome during cleanup.
          }
          reloadClient.close();
        }
      }

      assert(
        Object.entries(expectedState).every(([elementId, expected]) => {
          const reloaded = reloadedState[elementId];
          return reloaded &&
            Math.abs(reloaded.x - expected.x) <= 1 &&
            Math.abs(reloaded.y - expected.y) <= 1 &&
            Math.abs(reloaded.width - expected.width) <= 1 &&
            Math.abs(reloaded.height - expected.height) <= 1;
        }),
        `Reloaded canvas state did not match saved state. Expected ${JSON.stringify(expectedState)}, got ${JSON.stringify(reloadedState)}`,
      );
      assert(
        reloadedResponsiveEditing &&
          responsiveEditing &&
          reloadedResponsiveEditing.mobile.breakpointAfter.x === responsiveEditing.mobile.breakpointAfter.x &&
          reloadedResponsiveEditing.mobile.breakpointAfter.width === responsiveEditing.mobile.breakpointAfter.width &&
          reloadedResponsiveEditing.tablet.breakpointAfter.x === responsiveEditing.tablet.breakpointAfter.x &&
          reloadedResponsiveEditing.tablet.breakpointAfter.width === responsiveEditing.tablet.breakpointAfter.width,
        `Reloaded editor did not hydrate saved responsive overrides: ${JSON.stringify({ responsiveEditing, reloadedResponsiveEditing })}`,
      );
    }

    const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));

    const browserErrors = client.events
      .filter((event) => (
        event.method === 'Runtime.exceptionThrown'
        || (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error')
      ))
      .map((event) => event.params);
    const invalidInputWarnings = client.events
      .filter((event) => (
        event.method === 'Log.entryAdded'
        && event.params?.entry?.level === 'warning'
        && /cannot be parsed|out of range/i.test(event.params.entry.text || '')
      ))
      .map((event) => event.params.entry.text);

    assert(browserErrors.length === 0, `Browser emitted errors: ${JSON.stringify(browserErrors.slice(0, 3))}`);
    assert(invalidInputWarnings.length === 0, `Browser emitted invalid input warnings: ${JSON.stringify(invalidInputWarnings.slice(0, 3))}`);

    console.log(JSON.stringify({
      ok: true,
      url: `${ADMIN_BASE_URL}${editorPath}`,
      drags,
      moveHandleDrags,
      editingMoveHandleDrags,
      resizes,
      keyboard,
      inspector,
      dirtySaveStatus,
      fontPicker,
      groupingControls,
      siblingScopeSelection,
      clickAdd,
      multiSelectionDrag,
      multiSelectionResize,
      multiSelectionDistribution,
      grouping,
      layerHierarchy,
      syncedReusableSection,
      afterReusableMutationReady,
      responsiveEditing,
      reloadedResponsiveEditing,
      postSaveInspector,
      savedStatus,
      persistedState,
      reloadedState,
      invalidInputWarnings: invalidInputWarnings.length,
      screenshotPath: SCREENSHOT_PATH,
    }, null, 2));
  } catch (error) {
    throw error;
  } finally {
    await cleanup({ client, childProcess, userDataDir });
    await deleteSmokePage(tempPageId);
    await deleteSmokeReusableSection(tempReusableSectionId);
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
