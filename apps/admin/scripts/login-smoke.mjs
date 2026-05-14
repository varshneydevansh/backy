#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_LOGIN_CDP_PORT || 9392);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
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
  if (!response.ok) throw new Error(`${endpoint} returned ${response.status}`);
  return response.json();
};

const waitForCdp = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const pages = await fetchJson('/json/list');
      const page = pages.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) return page;
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
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
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
    if (state.ready) return state;
    if (attempt === 119) throw new Error(`${description} did not become ready: ${JSON.stringify(state)}`);
    await sleep(250);
  }

  return null;
};

const waitForState = async (client, readyExpression, description) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, readyExpression);
    if (state.ready) return state;
    if (attempt === 119) throw new Error(`${description} did not become ready: ${JSON.stringify(state)}`);
    await sleep(250);
  }

  return null;
};

const setInputValue = async (client, selector, value) => {
  const result = await evaluate(client, `(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!(input instanceof HTMLInputElement)) return { ok: false, reason: 'input-missing', selector: ${JSON.stringify(selector)} };
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: input.value };
  })()`);
  assert(result.ok, `Unable to set ${selector}: ${JSON.stringify(result)}`);
  return result;
};

const clickButton = async (client, label) => {
  const result = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
      (candidate.textContent || '').trim() === ${JSON.stringify(label)}
    ));
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'button-missing', label: ${JSON.stringify(label)} };
    }
    if (button.disabled) return { ok: false, reason: 'button-disabled', label: ${JSON.stringify(label)} };
    button.click();
    return { ok: true };
  })()`);
  assert(result.ok, `Unable to click ${label}: ${JSON.stringify(result)}`);
};

const waitForText = async (client, text) => {
  let lastState = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      hasText: document.body?.innerText?.includes(${JSON.stringify(text)}) || false,
      body: document.body?.innerText?.slice(0, 900) || '',
    }))()`);
    lastState = state;
    if (state.hasText) return state;
    await sleep(250);
  }

  throw new Error(`Timed out waiting for text ${text}: ${JSON.stringify(lastState)}`);
};

const waitForDashboard = async (client) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const stored = JSON.parse(localStorage.getItem('backy-auth-storage') || '{}');
      return {
        ready: window.location.pathname === '/' && Boolean(document.querySelector('[data-testid="dashboard-command-center"]')),
        path: window.location.pathname,
        userEmail: stored?.state?.user?.email || '',
        hasToken: Boolean(stored?.state?.session?.token),
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`);
    if (state.ready && state.userEmail === 'admin@backy.io' && state.hasToken) return state;
    await sleep(250);
  }

  throw new Error('Dashboard did not load after backend-backed login');
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-login-${Date.now()}`);
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

  if (childProcess && !(await waitForExit(childProcess))) {
    childProcess.kill('SIGTERM');
    if (!(await waitForExit(childProcess, 1000))) childProcess.kill('SIGKILL');
  }

  if (userDataDir) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
};

const main = async () => {
  let client;
  let childProcess;
  let userDataDir;

  try {
    ({ childProcess, userDataDir } = launchChrome());
    const target = await waitForCdp();
    client = connectCdp(target.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');

    await navigate(
      client,
      `${ADMIN_BASE_URL}/login`,
      `(() => ({
        ready: document.body?.innerText?.includes('Authenticated admin access') &&
          document.body?.innerText?.includes('Demo access'),
        body: document.body?.innerText?.slice(0, 900) || '',
      }))()`,
      'Login page',
    );

    await setInputValue(client, '#email', 'admin@backy.io');
    await setInputValue(client, '#password', 'wrong-password');
    await clickButton(client, 'Sign in');
    await waitForText(client, 'Invalid email or password.');

    await clickButton(client, 'Forgot password?');
    await waitForState(
      client,
      `(() => {
        const input = document.querySelector('#recovery-email');
        return {
          ready: window.location.pathname === '/forgot-password' &&
            window.location.search.includes('email=admin%40backy.io') &&
            document.body?.innerText?.includes('Forgot Password') &&
            document.body?.innerText?.includes('Request Recovery') &&
            input instanceof HTMLInputElement &&
            input.value === 'admin@backy.io',
          path: window.location.pathname,
          search: window.location.search,
          email: input instanceof HTMLInputElement ? input.value : '',
          body: document.body?.innerText?.slice(0, 900) || '',
        };
      })()`,
      'Forgot password page',
    );
    await clickButton(client, 'Request Recovery');
    await waitForState(
      client,
      `(() => {
        const body = document.body?.innerText || '';
        return {
          ready: window.location.pathname === '/forgot-password' &&
            body.includes('If recovery is available for this account'),
          path: window.location.pathname,
          body: body.slice(0, 900),
        };
      })()`,
      'Forgot password request confirmation',
    );
    await clickButton(client, 'Back to login');
    await waitForState(
      client,
      `(() => {
        const input = document.querySelector('#email');
        return {
          ready: window.location.pathname === '/login' &&
            window.location.search.includes('email=admin%40backy.io') &&
            document.body?.innerText?.includes('Authenticated admin access') &&
            input instanceof HTMLInputElement &&
            input.value === 'admin@backy.io',
          path: window.location.pathname,
          search: window.location.search,
          email: input instanceof HTMLInputElement ? input.value : '',
          body: document.body?.innerText?.slice(0, 900) || '',
        };
      })()`,
      'Login page after password recovery return',
    );
    await setInputValue(client, '#password', 'admin123');
    await clickButton(client, 'Sign in');
    await waitForDashboard(client);

    console.log(JSON.stringify({ ok: true, route: '/login', auth: 'backend-backed' }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir });
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
