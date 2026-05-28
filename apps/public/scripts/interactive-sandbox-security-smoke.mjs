#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolve } from 'node:path';

const root = resolve(new URL('../..', import.meta.url).pathname, '..');
const chromeBin = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cdpPort = Number(process.env.BACKY_INTERACTIVE_SANDBOX_CDP_PORT || 9418);
const serverPort = Number(process.env.BACKY_INTERACTIVE_SANDBOX_SMOKE_PORT || 54218);

let chrome = null;
let client = null;
let server = null;
let userDataDir = '';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

const waitForExit = (childProcess, timeoutMs = 1500) => new Promise((resolveWait) => {
  if (!childProcess || childProcess.exitCode !== null || childProcess.signalCode !== null) {
    resolveWait(true);
    return;
  }
  const timeout = setTimeout(() => {
    childProcess.off('exit', onExit);
    resolveWait(false);
  }, timeoutMs);
  const onExit = () => {
    clearTimeout(timeout);
    resolveWait(true);
  };
  childProcess.once('exit', onExit);
});

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed for ${url}: ${response.status}`);
  return response.json();
}

async function waitForCdp() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    try {
      const targets = await fetchJson(`http://127.0.0.1:${cdpPort}/json/list`);
      const target = targets.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl);
      if (target) return target.webSocketDebuggerUrl;
    } catch {
      // Retry until Chrome exposes the debugger endpoint.
    }
    await sleep(150);
  }
  throw new Error(`Chrome did not expose CDP on port ${cdpPort}`);
}

function connectCdp(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve: resolvePending, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      reject(new Error(`${message.error.message}: ${message.error.data || ''}`));
    } else {
      resolvePending(message.result || {});
    }
  });

  return new Promise((resolveConnect, rejectConnect) => {
    socket.addEventListener('open', () => {
      resolveConnect({
        send(method, params = {}) {
          const id = nextId;
          nextId += 1;
          socket.send(JSON.stringify({ id, method, params }));
          return new Promise((resolveMethod, rejectMethod) => {
            pending.set(id, { resolve: resolveMethod, reject: rejectMethod });
          });
        },
        close() {
          socket.close();
        },
      });
    });
    socket.addEventListener('error', () => {
      rejectConnect(new Error('Unable to connect to Chrome DevTools Protocol'));
    });
  });
}

async function evaluate(expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(`Browser evaluation failed: ${JSON.stringify(result.exceptionDetails).slice(0, 500)}`);
  }
  return result.result?.value;
}

function assertSourceGuards() {
  const publicRenderer = read('apps/public/src/components/PageRenderer.tsx');
  const adminCanvas = read('apps/admin/src/components/editor/Canvas.tsx');
  const validation = read('apps/public/src/lib/interactiveComponentValidation.ts');
  const sandboxRoute = read('apps/public/src/app/api/sites/[siteId]/interactive-components/[componentKey]/[version]/sandbox/route.ts');
  const runtimeEventsRoute = read('apps/public/src/app/api/sites/[siteId]/interactive-components/runtime-events/route.ts');

  for (const [label, source] of [['public renderer', publicRenderer], ['admin preview renderer', adminCanvas]]) {
    const tokenSet = source.match(/const INTERACTIVE_IFRAME_SANDBOX_TOKENS = new Set\(\[[\s\S]*?\]\);/)?.[0] || '';
    assert(tokenSet, `${label} missing explicit interactive iframe sandbox token allowlist`);
    assert(tokenSet.includes("'allow-scripts'") && tokenSet.includes("'allow-forms'"), `${label} missing minimal script/form sandbox tokens`);
    assert(!tokenSet.includes("'allow-same-origin'"), `${label} must not allow same-origin sandbox escape`);
    assert(!tokenSet.includes("'allow-top-navigation'"), `${label} must not allow top navigation`);
    assert(!tokenSet.includes("'allow-popups-to-escape-sandbox'"), `${label} must not allow popup sandbox escape`);
    assert(source.includes('sandbox={iframeSandbox}'), `${label} must apply normalized sandbox tokens to the iframe`);
    assert(source.includes('referrerPolicy="no-referrer"'), `${label} must suppress iframe referrer leakage`);
    assert(source.includes('interactiveIframeUsesOpaqueOrigin'), `${label} must treat sandboxed frames as opaque origins`);
  }

  assert(validation.includes("'allow-same-origin', 'allow-top-navigation', 'allow-popups-to-escape-sandbox'"), 'server validation must reject dangerous iframe sandbox flags');
  assert(validation.includes("const allowedPermissionSet = new Set(['fullscreen'])"), 'server validation must keep code-component permissions tightly allowlisted');
  assert(validation.includes('safeRelativeSandboxUrl'), 'server validation must use a dedicated relative sandbox URL validator');
  assert(validation.includes('/api/sites/:siteId/interactive-components/:componentKey/:version/sandbox'), 'server validation must require Backy-owned sandbox route URLs');
  assert(validation.includes('routeComponentKey === componentKey') && validation.includes('routeVersion === version'), 'server validation must bind sandbox route URLs to the component key and version');
  assert(validation.includes('validateDependencyPolicy'), 'server validation must enforce interactive component dependency policy metadata');
  assert(validation.includes('dependencyMetadata.dependencyPolicy.remoteRuntimeUrls must be false'), 'server validation must reject remote runtime URL dependency policies');
  assert(validation.includes('validateCompatibility'), 'server validation must enforce interactive component compatibility metadata');
  assert(validation.includes('dependencyMetadata.compatibility.renderTargets must include the component renderMode'), 'server validation must bind compatibility targets to the selected render mode');
  assert(validation.includes('dependencyMetadata.compatibility.backyRuntime must be a pinned or bounded Backy runtime version'), 'server validation must require bounded Backy runtime compatibility metadata');
  assert(validation.includes('validateDataBindingPresets'), 'server validation must validate registry-declared data binding presets');

  assert(sandboxRoute.includes("'Content-Security-Policy': contentSecurityPolicy"), 'sandbox route must return a response CSP header');
  assert(sandboxRoute.includes("'Permissions-Policy': sandboxPermissionsPolicy"), 'sandbox route must return an explicit permissions policy header');
  assert(sandboxRoute.includes("SANDBOX_SCHEMA_VERSION = 'backy.interactive-component-sandbox.v1'"), 'sandbox route must expose a stable schema version');
  assert(sandboxRoute.includes('publicContractResponse('), 'sandbox route must use the public contract response wrapper');
  assert(sandboxRoute.includes("cache: 'discovery'") && sandboxRoute.includes("cache: 'error'"), 'sandbox route must distinguish active discovery cache from error no-store cache');
  assert(sandboxRoute.includes('etagSeed') && sandboxRoute.includes('schemaVersion: SANDBOX_SCHEMA_VERSION'), 'sandbox route must expose ETag and schema headers');
  for (const directive of ['camera=()', 'microphone=()', 'geolocation=()', 'payment=()', 'usb=()', 'serial=()', 'clipboard-read=()', 'clipboard-write=()']) {
    assert(sandboxRoute.includes(directive), `sandbox permissions policy must deny ${directive}`);
  }
  for (const directive of ["default-src 'none'", "object-src 'none'", "frame-src 'none'", "worker-src 'none'", "base-uri 'none'", "form-action 'none'"]) {
    assert(sandboxRoute.includes(directive), `sandbox CSP must include ${directive}`);
  }

  assert(runtimeEventsRoute.includes('normalizeTelemetryMessageType'), 'runtime telemetry route must normalize bounded lifecycle message types');
  assert(runtimeEventsRoute.includes('COMPONENT_NOT_FOUND'), 'runtime telemetry route must reject unknown component telemetry');
  assert(runtimeEventsRoute.includes('MISSING_MESSAGE'), 'runtime telemetry route must require an explicit runtime message');
  assert(runtimeEventsRoute.includes('INVALID_EVENT_TYPE'), 'runtime telemetry route must reject unbounded runtime event types');
  assert(runtimeEventsRoute.includes('buildPublicInteractiveComponentRegistry'), 'runtime telemetry route must validate against the public component registry');
  for (const type of ['ready', 'init', 'resize', 'error', 'fallback', 'blocked']) {
    assert(runtimeEventsRoute.includes(`'${type}'`), `runtime telemetry route must allow the ${type} lifecycle type`);
  }
}

function hostileFrameHtml() {
  const script = `
    (function () {
      var attempts = {};
      function capture(name, fn) {
        try {
          attempts[name] = { ok: true, value: String(fn()) };
        } catch (error) {
          attempts[name] = {
            ok: false,
            error: error && error.name ? error.name : String(error),
            message: error && error.message ? error.message : ''
          };
        }
      }

      capture('parentDocumentRead', function () {
        return parent.document.body.getAttribute('data-parent-secret');
      });
      capture('parentLocationRead', function () {
        return parent.location.href;
      });
      capture('topNavigationWrite', function () {
        top.location.href = 'https://example.com/backy-sandbox-escape';
        return 'assigned';
      });
      capture('popupOpen', function () {
        var popup = window.open('https://example.com/backy-popup-escape', '_blank');
        return popup ? 'opened' : 'blocked';
      });
      capture('localStorageRead', function () {
        return localStorage.getItem('backy-parent-secret');
      });
      capture('cookieRead', function () {
        document.cookie = 'backy_sandbox_escape=1; SameSite=Lax';
        return document.cookie;
      });

      parent.postMessage({
        type: 'backy.hostile-sandbox-results',
        protocol: 'backy.interactive-component.v1',
        attempts: attempts,
        origin: location.origin
      }, '*');
    }());
  `;

  return `<!doctype html><html><body><script>${script.replace(/<\/script>/g, '<\\/script>')}</script></body></html>`;
}

function parentHtml() {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Backy hostile sandbox smoke</title></head>
<body data-parent-secret="parent-dom-secret">
  <main>
    <h1>Backy hostile sandbox smoke</h1>
    <iframe
      id="hostile-frame"
      title="Hostile Backy component"
      sandbox="allow-scripts allow-forms"
      referrerpolicy="no-referrer"
      srcdoc="${hostileFrameHtml().replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"
    ></iframe>
  </main>
  <script>
    document.cookie = 'backy_parent_secret=parent-cookie; SameSite=Lax';
    localStorage.setItem('backy-parent-secret', 'parent-storage-secret');
    window.__hostileMessages = [];
    window.addEventListener('message', function (event) {
      window.__hostileMessages.push(event.data);
    });
  </script>
</body>
</html>`;
}

function animationFrameHtml() {
  const script = `
    (function () {
      var canvas = document.getElementById('animation-canvas');
      var context = canvas.getContext('2d', { willReadFrequently: true });
      var protocol = 'backy.interactive-component.v1';
      var samples = [];
      var initPayload = null;
      var frame = 0;

      function samplePixel() {
        var pixel = context.getImageData(8, 8, 1, 1).data;
        return [pixel[0], pixel[1], pixel[2], pixel[3]].join(',');
      }

      function draw() {
        frame += 1;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = frame % 2 === 0 ? '#0ea5e9' : '#f97316';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#111827';
        context.beginPath();
        context.arc(24 + frame * 9, 36, 14, 0, Math.PI * 2);
        context.fill();
        samples.push(samplePixel());

        parent.postMessage({
          type: 'backy.animation-runtime.frame',
          protocol: protocol,
          frame: frame,
          sample: samples[samples.length - 1]
        }, '*');

        if (frame < 4) {
          requestAnimationFrame(draw);
        } else {
          parent.postMessage({
            type: 'backy.animation-runtime.complete',
            protocol: protocol,
            frames: frame,
            samples: samples,
            initPayload: initPayload,
            width: canvas.width,
            height: canvas.height
          }, '*');
        }
      }

      window.addEventListener('message', function (event) {
        var data = event.data || {};
        if (data.type !== 'backy.interactive-component.init' || data.protocol !== protocol) {
          return;
        }
        initPayload = {
          componentKey: data.componentKey,
          version: data.version,
          props: data.props || {},
          dataBindings: data.dataBindings || []
        };
        parent.postMessage({
          type: 'backy.interactive-component.ready',
          protocol: protocol,
          componentKey: initPayload.componentKey,
          version: initPayload.version
        }, '*');
        parent.postMessage({
          type: 'backy.interactive-component.resize',
          protocol: protocol,
          height: canvas.height
        }, '*');
        requestAnimationFrame(draw);
      });
    }());
  `;

  return `<!doctype html><html><body style="margin:0"><canvas id="animation-canvas" width="180" height="90"></canvas><script>${script.replace(/<\/script>/g, '<\\/script>')}</script></body></html>`;
}

function animationParentHtml() {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Backy animation sandbox smoke</title></head>
<body>
  <main>
    <h1>Backy animation sandbox smoke</h1>
    <iframe
      id="animation-frame"
      title="Backy animation runtime"
      sandbox="allow-scripts allow-forms"
      referrerpolicy="no-referrer"
      srcdoc="${animationFrameHtml().replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"
    ></iframe>
  </main>
  <script>
    window.__animationMessages = [];
    window.addEventListener('message', function (event) {
      window.__animationMessages.push(event.data);
    });
    (function () {
      var sent = false;
      function sendInit() {
        var frame = document.getElementById('animation-frame');
        if (!frame || !frame.contentWindow || sent) {
          return;
        }
        sent = true;
        frame.contentWindow.postMessage({
          type: 'backy.interactive-component.init',
          protocol: 'backy.interactive-component.v1',
          componentKey: 'backy.canvas.sandboxed',
          version: '1.0.0',
          props: { playback: 'auto', intensity: 75 },
          dataBindings: [{ id: 'fixture-binding', targetPath: 'props.frames' }]
        }, '*');
      }
      var frame = document.getElementById('animation-frame');
      if (frame) {
        frame.addEventListener('load', sendInit);
      }
      window.addEventListener('load', function () {
        setTimeout(sendInit, 50);
      });
    }());
  </script>
</body>
</html>`;
}

async function startServer() {
  server = createServer((request, response) => {
    if (request.url === '/hostile-sandbox') {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy': "default-src 'self' 'unsafe-inline'; frame-src 'self'; base-uri 'none'",
      });
      response.end(parentHtml());
      return;
    }

    if (request.url === '/animation-runtime') {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy': "default-src 'self' 'unsafe-inline'; frame-src 'self'; base-uri 'none'",
      });
      response.end(animationParentHtml());
      return;
    }

    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(serverPort, '127.0.0.1', () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });
}

function launchChrome() {
  userDataDir = path.join(os.tmpdir(), `backy-interactive-sandbox-${Date.now()}`);
  chrome = spawn(chromeBin, [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1200,800',
    'about:blank',
  ], { stdio: 'ignore' });
}

async function waitForHostileResults() {
  const startedAt = Date.now();
  let state = null;
  while (Date.now() - startedAt < 10000) {
    state = await evaluate(`(() => {
      const messages = window.__hostileMessages || [];
      const result = messages.find((message) => message && message.type === 'backy.hostile-sandbox-results');
      const frame = document.getElementById('hostile-frame');
      return {
        ready: Boolean(result),
        url: location.href,
        cookie: document.cookie,
        localStorageValue: localStorage.getItem('backy-parent-secret'),
        frameSandbox: frame ? frame.getAttribute('sandbox') : null,
        frameReferrerPolicy: frame ? frame.getAttribute('referrerpolicy') : null,
        result: result || null
      };
    })()`);

    if (state?.ready) return state;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for hostile sandbox results: ${JSON.stringify(state).slice(0, 1000)}`);
}

async function waitForAnimationResults() {
  const startedAt = Date.now();
  let state = null;
  while (Date.now() - startedAt < 10000) {
    state = await evaluate(`(() => {
      const messages = window.__animationMessages || [];
      const ready = messages.find((message) => message && message.type === 'backy.interactive-component.ready');
      const resize = messages.find((message) => message && message.type === 'backy.interactive-component.resize');
      const complete = messages.find((message) => message && message.type === 'backy.animation-runtime.complete');
      const frameMessages = messages.filter((message) => message && message.type === 'backy.animation-runtime.frame');
      const frame = document.getElementById('animation-frame');
      return {
        ready: Boolean(ready && resize && complete),
        url: location.href,
        frameSandbox: frame ? frame.getAttribute('sandbox') : null,
        frameReferrerPolicy: frame ? frame.getAttribute('referrerpolicy') : null,
        readyMessage: ready || null,
        resizeMessage: resize || null,
        completeMessage: complete || null,
        frameMessages
      };
    })()`);

    if (state?.ready) return state;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for animation sandbox results: ${JSON.stringify(state).slice(0, 1000)}`);
}

async function assertBrowserSandbox() {
  await startServer();
  launchChrome();
  const wsUrl = await waitForCdp();
  client = await connectCdp(wsUrl);
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/hostile-sandbox` });

  const state = await waitForHostileResults();
  const attempts = state.result?.attempts || {};

  assert(state.url === `http://127.0.0.1:${serverPort}/hostile-sandbox`, `top window navigated unexpectedly: ${state.url}`);
  assert(state.frameSandbox === 'allow-scripts allow-forms', `hostile iframe used unexpected sandbox flags: ${state.frameSandbox}`);
  assert(state.frameReferrerPolicy === 'no-referrer', `hostile iframe used unexpected referrer policy: ${state.frameReferrerPolicy}`);
  assert(state.cookie.includes('backy_parent_secret=parent-cookie'), 'parent cookie was not set for the browser isolation probe');
  assert(!state.cookie.includes('backy_sandbox_escape=1'), 'sandbox iframe wrote into parent cookie jar');
  assert(state.localStorageValue === 'parent-storage-secret', 'parent localStorage changed during hostile iframe probe');
  assert(attempts.parentDocumentRead?.ok === false, `sandbox iframe read parent DOM: ${JSON.stringify(attempts.parentDocumentRead)}`);
  assert(attempts.parentLocationRead?.ok === false, `sandbox iframe read parent location: ${JSON.stringify(attempts.parentLocationRead)}`);
  assert(attempts.topNavigationWrite?.ok === false || state.url.includes('/hostile-sandbox'), `sandbox iframe escaped top navigation: ${JSON.stringify(attempts.topNavigationWrite)}`);
  assert(attempts.popupOpen?.ok === false || attempts.popupOpen?.value === 'blocked', `sandbox iframe opened a popup: ${JSON.stringify(attempts.popupOpen)}`);
  assert(attempts.localStorageRead?.ok === false || attempts.localStorageRead?.value !== 'parent-storage-secret', `sandbox iframe read parent localStorage: ${JSON.stringify(attempts.localStorageRead)}`);
  assert(attempts.cookieRead?.ok === false || !attempts.cookieRead?.value?.includes('backy_parent_secret'), `sandbox iframe read parent cookies: ${JSON.stringify(attempts.cookieRead)}`);

  const targets = await fetchJson(`http://127.0.0.1:${cdpPort}/json/list`);
  const pageTargets = targets.filter((target) => target.type === 'page');
  assert(pageTargets.length === 1, `sandbox iframe opened unexpected browser targets: ${JSON.stringify(pageTargets.map((target) => target.url))}`);

  await client.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/animation-runtime` });
  const animationState = await waitForAnimationResults();
  const complete = animationState.completeMessage || {};
  const samples = Array.isArray(complete.samples) ? complete.samples : [];
  const uniqueSamples = new Set(samples);

  assert(animationState.url === `http://127.0.0.1:${serverPort}/animation-runtime`, `animation fixture navigated unexpectedly: ${animationState.url}`);
  assert(animationState.frameSandbox === 'allow-scripts allow-forms', `animation iframe used unexpected sandbox flags: ${animationState.frameSandbox}`);
  assert(animationState.frameReferrerPolicy === 'no-referrer', `animation iframe used unexpected referrer policy: ${animationState.frameReferrerPolicy}`);
  assert(animationState.readyMessage?.componentKey === 'backy.canvas.sandboxed', `animation runtime did not echo component identity: ${JSON.stringify(animationState.readyMessage)}`);
  assert(animationState.resizeMessage?.height === 90, `animation runtime did not report expected resize lifecycle: ${JSON.stringify(animationState.resizeMessage)}`);
  assert(complete.frames >= 4, `animation runtime rendered too few frames: ${JSON.stringify(complete)}`);
  assert(samples.length >= 4 && uniqueSamples.size >= 2, `animation runtime did not produce changing canvas samples: ${JSON.stringify(samples)}`);
  assert(complete.initPayload?.props?.playback === 'auto' && complete.initPayload?.props?.intensity === 75, `animation runtime did not receive init props: ${JSON.stringify(complete.initPayload)}`);
  assert(Array.isArray(complete.initPayload?.dataBindings) && complete.initPayload.dataBindings[0]?.targetPath === 'props.frames', `animation runtime did not receive binding payload: ${JSON.stringify(complete.initPayload)}`);
}

async function cleanup() {
  if (client) {
    client.close();
    client = null;
  }
  if (chrome) {
    chrome.kill('SIGTERM');
    const exited = await waitForExit(chrome);
    if (!exited) {
      chrome.kill('SIGKILL');
      await waitForExit(chrome, 1000);
    }
    chrome = null;
  }
  if (server) {
    await new Promise((resolveClose) => server.close(resolveClose));
    server = null;
  }
  if (userDataDir) {
    rmSync(userDataDir, { recursive: true, force: true });
    userDataDir = '';
  }
}

try {
  assertSourceGuards();
  await assertBrowserSandbox();
  console.log('Backy interactive sandbox security smoke passed');
} finally {
  await cleanup();
}
