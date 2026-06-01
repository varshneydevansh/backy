#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const read = (relativePath) => fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_HELP_CDP_PORT || 9396);
const RENDERED_SMOKE = process.env.BACKY_HELP_RENDERED_SMOKE === '1';
const HELP_SMOKE_SITE_ID = process.env.BACKY_HELP_SMOKE_SITE_ID || 'site-help-rendered-smoke';
const SCREENSHOT_PATH = process.env.BACKY_HELP_SCREENSHOT || path.join(os.tmpdir(), 'backy-help-smoke.png');

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

const fetchJson = async (endpoint) => {
  const response = await fetch(`http://127.0.0.1:${PORT}${endpoint}`);
  if (!response.ok) {
    throw new Error(`${endpoint} returned ${response.status}`);
  }
  return response.json();
};

const isUsablePageTarget = (target) => {
  if (!target || target.type !== 'page' || !target.webSocketDebuggerUrl) return false;
  const url = target.url || '';
  return !(
    url.startsWith('chrome://') ||
    url.startsWith('devtools://') ||
    url.startsWith('chrome-error://') ||
    url.startsWith('chrome-extension://')
  );
};

const getTargetScore = (target) => {
  const url = target.url || '';
  if (url.startsWith(ADMIN_BASE_URL)) return 0;
  if (url === 'about:blank') return 1;
  if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) return 2;
  if (url.startsWith('http://') || url.startsWith('https://')) return 3;
  return 4;
};

const selectUsablePageTarget = (targets) => (
  [...targets]
    .filter(isUsablePageTarget)
    .sort((left, right) => getTargetScore(left) - getTargetScore(right))[0]
);

const waitForCdp = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const pages = await fetchJson('/json/list');
      const page = selectUsablePageTarget(pages);
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

const waitForHttp = async (url, description) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok || response.status < 500) {
        return true;
      }
    } catch {
      await sleep(250);
    }
  }

  throw new Error(`${description} is not reachable at ${url}. Start the admin dev server with npm run dev:smoke:admin --workspace @backy-cms/admin.`);
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

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-help-smoke-${Date.now()}`);
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

const cleanupChrome = async ({ client, childProcess, userDataDir }) => {
  if (client) {
    try {
      await client.send('Browser.close');
    } catch {
      // Chrome may already be closed.
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
};

const captureScreenshot = async (client) => {
  fs.mkdirSync(path.dirname(SCREENSHOT_PATH), { recursive: true });
  const screenshot = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));
  return SCREENSHOT_PATH;
};

const authAndClipboardBootstrapScript = () => {
  const now = new Date();
  const session = {
    token: `help-rendered-smoke-${Date.now()}`,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    authMode: 'local-demo',
  };
  const user = {
    id: 'user-admin',
    email: 'admin@backy.io',
    fullName: 'Admin User',
    role: 'owner',
  };
  const persistedAuth = JSON.stringify({
    state: {
      user,
      session,
    },
    version: 0,
  });
  const sessionResponse = JSON.stringify({
    success: true,
    data: {
      user,
      session,
    },
  });

  return `
(() => {
  const persistedAuth = ${JSON.stringify(persistedAuth)};
  const sessionResponse = ${JSON.stringify(sessionResponse)};

  try {
    window.localStorage.setItem('backy-auth-storage', persistedAuth);
  } catch {}

  try {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__backyHelpSmokeClipboard = String(text || '');
        },
      },
    });
  } catch {
    navigator.clipboard = {
      writeText: async (text) => {
        window.__backyHelpSmokeClipboard = String(text || '');
      },
    };
  }

  const nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  if (nativeFetch && !window.__backyHelpSmokeFetchWrapped) {
    window.__backyHelpSmokeFetchWrapped = true;
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (String(url).includes('/api/admin/auth/session')) {
        return Promise.resolve(new Response(sessionResponse, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }));
      }
      return nativeFetch(input, init);
    };
  }
})();
`;
};

const setInputValue = (testId, value) => `
(() => {
  const input = document.querySelector('[data-testid="${testId}"]');
  if (!(input instanceof HTMLInputElement)) {
    return { ok: false, reason: 'input-missing' };
  }
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, ${JSON.stringify(value)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, value: input.value };
})()
`;

const clickElement = (testId) => `
(() => {
  const element = document.querySelector('[data-testid="${testId}"]');
  if (!(element instanceof HTMLElement)) {
    return { ok: false, reason: 'element-missing' };
  }
  element.click();
  return { ok: true };
})()
`;

const waitForRenderedState = async (client, expression, description) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, expression);
    if (state.ready) {
      return state;
    }
    if (attempt === 79) {
      throw new Error(`${description} did not become ready: ${JSON.stringify(state)}`);
    }
    await sleep(100);
  }

  return null;
};

const assertHelpSourceContracts = () => {
  const helpSource = read('../src/routes/help.tsx');
  const sidebarModelSource = read('../src/components/layout/sidebarModel.ts');
  const headerModelSource = read('../src/components/layout/headerModel.ts');
  const headerSource = read('../src/components/layout/Header.tsx');
  const routeTreeSource = read('../src/routeTree.gen.ts');
  const newsletterSmokeSource = read('newsletter-smoke.mjs');
  const adminPackageSource = read('../package.json');

  const requiredTopicIds = [
    'switch-sites',
    'subdomains',
    'verified-domain-routing',
    'deployment-topology',
    'canvas-basics',
    'canvas-zoom-selection',
    'navigation-shared-chrome',
    'apiable-elements',
    'custom-frontend-agent-start',
    'connect-custom-frontend',
    'frontend-design-state',
    'newsletter-subscribers',
    'newsletter-mail-boundary',
    'roles',
    'provider-certification-partials',
  ];

  assert(
    requiredTopicIds.every((topicId) => helpSource.includes(`id: '${topicId}'`)),
    `Help route is missing required topics: ${requiredTopicIds.filter((topicId) => !helpSource.includes(`id: '${topicId}'`)).join(', ')}`,
  );

  assert(
    helpSource.includes('GET /api/sites/:siteId/agent-handoff') &&
      helpSource.includes('GET /api/sites/:siteId/manifest') &&
      helpSource.includes('GET /api/sites/:siteId/openapi') &&
      helpSource.includes('GET /api/sites/:siteId/render?path=/...') &&
      helpSource.includes('GET /api/sites/:siteId/resolve?path=/...') &&
      helpSource.includes("id: 'component-contract'") &&
      helpSource.includes("id: 'deployment-topology'") &&
      helpSource.includes('agent-handoff.componentApiContract.componentTypeContracts + componentApiContract.propertyMap') &&
      helpSource.includes('agent-handoff.deploymentTopology.verification.previewReadinessSmoke = npm run test:vercel-preview-readiness') &&
      helpSource.includes('Every canvas element is API-addressable by id, type, props, styles, responsive overrides, token refs, assets, actions, data bindings, binding slots, accessibility, metadata, and children.') &&
      helpSource.includes('specs/custom-frontend-agent-handoff.md') &&
      helpSource.includes('backy.canvas-component-api-contract.v1') &&
      helpSource.includes('starterValueForSite(item.value, activeSiteId)') &&
      helpSource.includes('buildAgentCopyBrief(activeSiteId)') &&
      helpSource.includes('navigator.clipboard?.writeText(text)') &&
      helpSource.includes('data-testid="help-copy-agent-brief"') &&
      helpSource.includes('data-testid={`help-copy-agent-starter-${item.id}`}') &&
      helpSource.includes('data-target-site-id={activeSiteId}') &&
      helpSource.includes('data-testid="help-agent-starter-grid"') &&
      helpSource.includes('data-testid="help-agent-human-guide"'),
    'Help route must expose canonical custom frontend agent endpoints, schema, copy controls, site-scoped values, and human guide.',
  );

  assert(
    helpSource.includes("id: 'connect-custom-frontend'") &&
      helpSource.includes('Host the public website as its own frontend project and keep Backy as the CMS/API source of truth.') &&
      helpSource.includes('Attach the production domain to the custom frontend Vercel project, not to backy-admin.') &&
      helpSource.includes('Backy-public remains the public API/render origin.') &&
      helpSource.includes('customDomain or domainAliases host') &&
      helpSource.includes('Create a separate Backy site when a subdomain needs independent content, navigation, SEO, design tokens, or launch state.') &&
      helpSource.includes('Site Detail -> Separate custom frontend project -> Verify deployed frontend') &&
      helpSource.includes('Site Detail -> Separate custom frontend project -> Download starter project') &&
      helpSource.includes('/api/admin/sites/${siteId}/custom-frontend/connection') &&
      helpSource.includes('/api/admin/sites/${siteId}/custom-frontend/starter') &&
      helpSource.includes("id: 'starter-export'") &&
      helpSource.includes('backy.custom-frontend-starter-export.v1') &&
      helpSource.includes('backy.custom-frontend-starter-project.v1') &&
      helpSource.includes('files[]=complete project file list') &&
      helpSource.includes('Write every files[].path') &&
      helpSource.includes('examples/custom-frontend-next') &&
      helpSource.includes('BACKY_FRONTEND_STARTER.md') &&
      helpSource.includes('preserveFiles') &&
      helpSource.includes('verification.cliCommand') &&
      helpSource.includes('/api/backy-connection') &&
      helpSource.includes('required data-backy-* DOM attributes') &&
      helpSource.includes('forbidden private env names') &&
      helpSource.includes('data-testid="help-custom-frontend-checklist"') &&
      helpSource.includes('data-testid="help-custom-frontend-steps"') &&
      helpSource.includes('data-testid="help-custom-frontend-env-grid"') &&
      helpSource.includes('NEXT_PUBLIC_BACKY_API_BASE_URL=https://<backy-public-domain>/api') &&
      helpSource.includes('NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST=<your-domain.com>') &&
      helpSource.includes('BACKY_PUBLIC_API_BASE_URL=https://<backy-public-domain>/api') &&
      helpSource.includes('BACKY_SITE_PUBLIC_HOST=<your-domain.com>') &&
      helpSource.includes("id: 'sdk-bootstrap'") &&
      helpSource.includes("id: 'admin-verifier'") &&
      helpSource.includes('createBackyCustomFrontendClient') &&
      helpSource.includes('GET /api/sites/${siteId}/resolve?path=/&domain=<your-domain.com>') &&
      helpSource.includes('GET /api/sites/${siteId}/render?path=/&domain=<your-domain.com>') &&
      helpSource.includes('SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY / SUPABASE_JWT_SECRET') &&
      helpSource.includes('BACKY_ADMIN_BOOTSTRAP_TOKEN / BACKY_ADMIN_SESSION_SECRET / BACKY_CRON_SECRET') &&
      helpSource.includes('Admin API keys, session cookies, provider secrets, SMTP passwords, webhook secrets, and raw subscriber/order exports') &&
      helpSource.includes('data-testid={`help-copy-custom-frontend-${card.id}`}') &&
      helpSource.includes('data-target-site-id={activeSiteId}'),
    'Help route must expose a copyable separate-custom-frontend checklist with safe env, host-aware endpoints, and forbidden secret boundaries.',
  );

  assert(
    helpSource.includes('SITE_SCOPED_HELP_ROUTES') &&
      helpSource.includes('search={getTopicRouteSearch(topic.route)}') &&
      helpSource.includes('const routeSearch = Route.useSearch()') &&
      helpSource.includes("const activeSiteId = routeSearch.siteId || 'site-demo'") &&
      helpSource.includes('Use the top-left Site selector in the sidebar. You do not need to sign out.') &&
      helpSource.includes('The Site dropdown sits directly under the Backy logo in the left sidebar') &&
      helpSource.includes('Use the Manage link beside Backy to open the active site command center') &&
      helpSource.includes('Use the Domains link under the sidebar Site selector, or the Domains shortcut beside the desktop header Site selector'),
    'Help route links and copyable endpoint values must preserve the active site context.',
  );

  assert(
    helpSource.includes('Canvas zoom should change the work surface, not the whole browser page.') &&
      helpSource.includes('marquee selection should start from the pointer position') &&
      helpSource.includes('Navigation is not one opaque text block') &&
      helpSource.includes('Root sections, headers, footers, and nav bars participate in root-section flow'),
    'Help route must document critical Wix-like canvas controls, selection behavior, navigation child links, and shared chrome flow.',
  );

  assert(
    helpSource.includes('A saved custom domain is setup intent; verified DNS is what allows public discovery and hosted routing.') &&
      helpSource.includes('site.settings.domainVerification.status to be verified for the exact host') &&
      helpSource.includes('pass Host/domain context to resolve/render when routing depends on the browser host') &&
      helpSource.includes('Use one Backy site per independent public subdomain'),
    'Help route must explain verified custom-domain/subdomain routing before deploy.',
  );

  assert(
    helpSource.includes('Run Backy admin, Backy public APIs, and each custom website as separate deployment surfaces.') &&
      helpSource.includes('protected backy-admin Vercel project') &&
      helpSource.includes('public backy-public Vercel project') &&
      helpSource.includes('NEXT_PUBLIC_BACKY_API_BASE_URL, NEXT_PUBLIC_BACKY_SITE_ID, and NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST') &&
      helpSource.includes('server-side loaders may use BACKY_PUBLIC_API_BASE_URL, BACKY_SITE_ID, and BACKY_SITE_PUBLIC_HOST') &&
      helpSource.includes('npm run test:vercel-preview-readiness') &&
      helpSource.includes('apps/public to backy-public and apps/admin to backy-admin') &&
      helpSource.includes('Optional Vercel Agent Code Review') &&
      helpSource.includes('Project Settings -> AI') &&
      helpSource.includes("id: 'frontend-env'") &&
      helpSource.includes("id: 'deployment-topology'") &&
      helpSource.includes('NEXT_PUBLIC_BACKY_API_BASE_URL=https://<backy-public-domain>/api') &&
      helpSource.includes('Custom frontend browser bundles use NEXT_PUBLIC_BACKY_API_BASE_URL, NEXT_PUBLIC_BACKY_SITE_ID, and NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST only.'),
    'Help route must explain protected Backy/admin-public/custom-frontend deployment topology and copyable frontend env.',
  );

  assert(
    helpSource.includes('Actual mailbox hosting, bulk outbound sending, bounces, complaints, provider unsubscribe enforcement, SPF/DKIM/DMARC') &&
      helpSource.includes('subscriptionStatus for audience state and newsletterStatus for provider lifecycle states') &&
      newsletterSmokeSource.includes('Help must explain the report-to-newsletter issue workflow and delivery-provider boundary.'),
    'Help route must document the newsletter management and mail-provider boundary.',
  );

  assert(
    helpSource.includes('signed-in Backy profile role plus the backend permission matrix') &&
      helpSource.includes('navigation groups, quick-create buttons, dashboard shortcuts, Settings panels, and Users controls') &&
      helpSource.includes('role-default navigation active') &&
      helpSource.includes('Hosted login validates the identity provider first') &&
      helpSource.includes('New provider-created identities start invited and inactive') &&
      helpSource.includes('If Settings unavailable appears') &&
      helpSource.includes("routeLabel: 'Open Users'"),
    'Help route must explain role-aware UI filtering, permission-matrix fallback, and provider identity activation boundaries.',
  );

  assert(
    helpSource.includes('The remaining Partial rows are live provider certification evidence') &&
      helpSource.includes('Settings, Settings admin APIs, Products, and Orders as Partial') &&
      helpSource.includes('no raw secrets') &&
      helpSource.includes('release-doctor acceptance'),
    'Help route must explain the current four Partial provider-certification rows without implying missing local editor/API models.',
  );

  assert(
    sidebarModelSource.includes("{ id: 'help', label: 'Help', to: '/help'") &&
      sidebarModelSource.includes("'/help'") &&
      headerModelSource.includes("'/help': 'help'") &&
      headerModelSource.includes("if (path.startsWith('/help')) return 'Help';") &&
      headerSource.includes("{ id: 'tool:help'") &&
      routeTreeSource.includes("path: '/help'"),
    'Help route must remain wired into sidebar, header search, header title, and generated route tree.',
  );

  assert(
    adminPackageSource.includes('"test:help-rendered": "BACKY_HELP_RENDERED_SMOKE=1 node scripts/help-smoke.mjs"') &&
      adminPackageSource.includes('"test:smoke:site": "npm run test:sites && npm run test:site-detail && npm run test:frontend-design && npm run test:help && npm run test:help-rendered"'),
    'Rendered Help handoff coverage must remain exposed as test:help-rendered and included in site smoke coverage.',
  );

  return {
    requiredTopics: requiredTopicIds.length,
  };
};

const runRenderedHelpSmoke = async () => {
  await waitForHttp(`${ADMIN_BASE_URL}/help?siteId=${encodeURIComponent(HELP_SMOKE_SITE_ID)}`, 'Admin Help route');

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
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authAndClipboardBootstrapScript(),
    });

    const initial = await navigate(
      client,
      `${ADMIN_BASE_URL}/help?siteId=${encodeURIComponent(HELP_SMOKE_SITE_ID)}`,
      `(() => {
        const grid = document.querySelector('[data-testid="help-agent-starter-grid"]');
        const body = document.body?.innerText || '';
        return {
          ready: window.location.pathname === '/help' &&
            window.location.search.includes(${JSON.stringify(`siteId=${HELP_SMOKE_SITE_ID}`)}) &&
            grid?.getAttribute('data-target-site-id') === ${JSON.stringify(HELP_SMOKE_SITE_ID)} &&
            body.includes('Where frontend agents should start') &&
            body.includes('Canvas content is API-readable'),
          path: window.location.pathname,
          search: window.location.search,
          targetSiteId: grid?.getAttribute('data-target-site-id') || '',
          body: body.slice(0, 800),
          hasFrameworkOverlay: Boolean(document.querySelector('vite-error-overlay, nextjs-portal')),
        };
      })()`,
      'Help rendered route',
    );
    assert(!initial.hasFrameworkOverlay, 'Help route rendered with a framework error overlay.');

    const endpointState = await evaluate(client, `(() => {
      const grid = document.querySelector('[data-testid="help-agent-starter-grid"]');
      const text = grid?.textContent || '';
      const link = document.querySelector('[data-testid="help-topic-custom-frontend-agent-start-route"]');
      return {
        targetSiteId: grid?.getAttribute('data-target-site-id') || '',
        text,
        linkHref: link instanceof HTMLAnchorElement ? link.href : '',
      };
    })()`);
    assert(endpointState.targetSiteId === HELP_SMOKE_SITE_ID, `Rendered starter grid used wrong site id: ${JSON.stringify(endpointState)}`);
    for (const expected of [
      `/api/sites/${HELP_SMOKE_SITE_ID}/agent-handoff`,
      `/api/sites/${HELP_SMOKE_SITE_ID}/manifest`,
      `/api/sites/${HELP_SMOKE_SITE_ID}/openapi`,
      `/api/sites/${HELP_SMOKE_SITE_ID}/render?path=/...`,
      `/api/sites/${HELP_SMOKE_SITE_ID}/resolve?path=/...`,
      `NEXT_PUBLIC_BACKY_SITE_ID=${HELP_SMOKE_SITE_ID}`,
      'NEXT_PUBLIC_BACKY_API_BASE_URL=https://<backy-public-domain>/api',
      'agent-handoff.deploymentTopology.verification.previewReadinessSmoke = npm run test:vercel-preview-readiness',
    ]) {
      assert(endpointState.text.includes(expected), `Rendered Help starter endpoints are missing ${expected}`);
    }
    assert(
      endpointState.text.includes('agent-handoff.componentApiContract.componentTypeContracts') &&
        endpointState.text.includes('componentApiContract.propertyMap'),
      `Rendered Help starter grid is missing the component API contract pointer: ${JSON.stringify(endpointState)}`,
    );
    assert(
      endpointState.linkHref.includes('/sites') && endpointState.linkHref.includes(`siteId=${encodeURIComponent(HELP_SMOKE_SITE_ID)}`),
      `Help topic route did not preserve siteId: ${JSON.stringify(endpointState)}`,
    );

    await evaluate(client, clickElement('help-copy-agent-brief'));
    const copiedBrief = await waitForRenderedState(client, `(() => {
      const button = document.querySelector('[data-testid="help-copy-agent-brief"]');
      return {
        ready: button?.getAttribute('data-action-state') === 'copied' &&
          String(window.__backyHelpSmokeClipboard || '').includes('/api/sites/${HELP_SMOKE_SITE_ID}/agent-handoff'),
        actionState: button?.getAttribute('data-action-state') || '',
        buttonText: button?.textContent || '',
        clipboard: String(window.__backyHelpSmokeClipboard || '').slice(0, 500),
      };
    })()`, 'Help copy brief action');
    assert(copiedBrief.buttonText.includes('Copied'), `Help copy brief did not expose copied UI state: ${JSON.stringify(copiedBrief)}`);

    await evaluate(client, clickElement('help-copy-agent-starter-agent-handoff'));
    await waitForRenderedState(client, `(() => {
      const button = document.querySelector('[data-testid="help-copy-agent-starter-agent-handoff"]');
      return {
        ready: button?.getAttribute('data-action-state') === 'copied' &&
          String(window.__backyHelpSmokeClipboard || '') === 'GET /api/sites/${HELP_SMOKE_SITE_ID}/agent-handoff',
        actionState: button?.getAttribute('data-action-state') || '',
        clipboard: String(window.__backyHelpSmokeClipboard || ''),
      };
    })()`, 'Help copy agent-handoff starter action');

    await evaluate(client, clickElement('help-copy-agent-starter-component-contract'));
    await waitForRenderedState(client, `(() => {
      const button = document.querySelector('[data-testid="help-copy-agent-starter-component-contract"]');
      return {
        ready: button?.getAttribute('data-action-state') === 'copied' &&
          String(window.__backyHelpSmokeClipboard || '') === 'agent-handoff.componentApiContract.componentTypeContracts + componentApiContract.propertyMap',
        actionState: button?.getAttribute('data-action-state') || '',
        clipboard: String(window.__backyHelpSmokeClipboard || ''),
      };
    })()`, 'Help copy component-contract starter action');

    await evaluate(client, clickElement('help-copy-agent-starter-deployment-topology'));
    await waitForRenderedState(client, `(() => {
      const button = document.querySelector('[data-testid="help-copy-agent-starter-deployment-topology"]');
      return {
        ready: button?.getAttribute('data-action-state') === 'copied' &&
          String(window.__backyHelpSmokeClipboard || '') === 'agent-handoff.deploymentTopology.verification.previewReadinessSmoke = npm run test:vercel-preview-readiness',
        actionState: button?.getAttribute('data-action-state') || '',
        clipboard: String(window.__backyHelpSmokeClipboard || ''),
      };
    })()`, 'Help copy deployment-topology starter action');

    const customFrontendState = await evaluate(client, `(() => {
      const checklist = document.querySelector('[data-testid="help-custom-frontend-checklist"]');
      const envGrid = document.querySelector('[data-testid="help-custom-frontend-env-grid"]');
      const text = checklist?.textContent || '';
      return {
        targetSiteId: envGrid?.getAttribute('data-target-site-id') || '',
        text,
        stepCount: document.querySelectorAll('[data-testid^="help-custom-frontend-step-"]').length,
      };
    })()`);
    assert(customFrontendState.targetSiteId === HELP_SMOKE_SITE_ID, `Custom frontend checklist used wrong site id: ${JSON.stringify(customFrontendState)}`);
    assert(customFrontendState.stepCount === 6, `Custom frontend checklist should expose six steps: ${JSON.stringify(customFrontendState)}`);
    for (const expected of [
      'Connect a separate custom frontend',
      'custom frontend Vercel project',
      'customDomain or domainAliases',
      'Verify connection',
      'Site Detail -> Separate custom frontend project -> Verify deployed frontend',
      'Site Detail -> Separate custom frontend project -> Download starter project',
      'NEXT_PUBLIC_BACKY_API_BASE_URL=https://<backy-public-domain>/api',
      `NEXT_PUBLIC_BACKY_SITE_ID=${HELP_SMOKE_SITE_ID}`,
      'NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST=<your-domain.com>',
      'BACKY_PUBLIC_API_BASE_URL=https://<backy-public-domain>/api',
      `BACKY_SITE_ID=${HELP_SMOKE_SITE_ID}`,
      'BACKY_SITE_PUBLIC_HOST=<your-domain.com>',
      'createBackyCustomFrontendClient',
      `/api/admin/sites/${HELP_SMOKE_SITE_ID}/custom-frontend/connection`,
      `/api/admin/sites/${HELP_SMOKE_SITE_ID}/custom-frontend/starter`,
      'backy.custom-frontend-starter-export.v1',
      'backy.custom-frontend-starter-project.v1',
      'files[]=complete project file list',
      'Write every files[].path',
      'examples/custom-frontend-next',
      'BACKY_FRONTEND_STARTER.md',
      'preserveFiles',
      'verification.cliCommand',
      '/api/backy-connection',
      'data-backy-component-contract-pointer',
      'data-backy-editable-map-pointer',
      'forbidden private env names',
      `/api/sites/${HELP_SMOKE_SITE_ID}/resolve?path=/&domain=<your-domain.com>`,
      `/api/sites/${HELP_SMOKE_SITE_ID}/render?path=/&domain=<your-domain.com>`,
      'SUPABASE_SERVICE_ROLE_KEY',
      'BACKY_ADMIN_BOOTSTRAP_TOKEN',
      'BACKY_CRON_SECRET',
    ]) {
      assert(customFrontendState.text.includes(expected), `Custom frontend checklist is missing ${expected}: ${JSON.stringify(customFrontendState)}`);
    }

    await evaluate(client, clickElement('help-copy-custom-frontend-browser-env'));
    await waitForRenderedState(client, `(() => {
      const button = document.querySelector('[data-testid="help-copy-custom-frontend-browser-env"]');
      const clipboard = String(window.__backyHelpSmokeClipboard || '');
      return {
        ready: button?.getAttribute('data-action-state') === 'copied' &&
          clipboard.includes('NEXT_PUBLIC_BACKY_API_BASE_URL=https://<backy-public-domain>/api') &&
          clipboard.includes('NEXT_PUBLIC_BACKY_SITE_ID=${HELP_SMOKE_SITE_ID}') &&
          clipboard.includes('NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST=<your-domain.com>') &&
          !clipboard.includes('SUPABASE_SERVICE_ROLE_KEY'),
        actionState: button?.getAttribute('data-action-state') || '',
        clipboard,
      };
    })()`, 'Help copy browser frontend env action');

    await evaluate(client, clickElement('help-copy-custom-frontend-frontend-endpoints'));
    await waitForRenderedState(client, `(() => {
      const button = document.querySelector('[data-testid="help-copy-custom-frontend-frontend-endpoints"]');
      const clipboard = String(window.__backyHelpSmokeClipboard || '');
      return {
        ready: button?.getAttribute('data-action-state') === 'copied' &&
          clipboard.includes('GET /api/sites/${HELP_SMOKE_SITE_ID}/agent-handoff') &&
          clipboard.includes('GET /api/sites/${HELP_SMOKE_SITE_ID}/resolve?path=/&domain=<your-domain.com>') &&
          clipboard.includes('GET /api/sites/${HELP_SMOKE_SITE_ID}/render?path=/&domain=<your-domain.com>'),
        actionState: button?.getAttribute('data-action-state') || '',
        clipboard,
      };
    })()`, 'Help copy custom frontend endpoint action');

    await evaluate(client, clickElement('help-copy-custom-frontend-sdk-bootstrap'));
    await waitForRenderedState(client, `(() => {
      const button = document.querySelector('[data-testid="help-copy-custom-frontend-sdk-bootstrap"]');
      const clipboard = String(window.__backyHelpSmokeClipboard || '');
      return {
        ready: button?.getAttribute('data-action-state') === 'copied' &&
          clipboard.includes("createBackyCustomFrontendClient") &&
          clipboard.includes("backy.customFrontendAgentHandoff()") &&
          clipboard.includes("backy.render('/')") &&
          !clipboard.includes('SUPABASE_SERVICE_ROLE_KEY'),
        actionState: button?.getAttribute('data-action-state') || '',
        clipboard,
      };
    })()`, 'Help copy custom frontend SDK bootstrap action');

    const newsletterInput = await evaluate(client, setInputValue('help-search', 'newsletter'));
    assert(newsletterInput.ok, `Help search input could not be updated: ${JSON.stringify(newsletterInput)}`);
    const newsletterSearch = await waitForRenderedState(client, `(() => {
      const visibleTopics = Array.from(document.querySelectorAll('[data-testid^="help-topic-"]'))
        .filter((node) => node instanceof HTMLElement && node.matches('article'))
        .map((node) => node.getAttribute('data-testid') || '');
      return {
        ready: visibleTopics.length > 0 &&
          visibleTopics.length < 11 &&
          visibleTopics.includes('help-topic-newsletter-subscribers') &&
          document.body?.innerText?.includes('newsletterStatus'),
        visibleTopics,
        countText: document.querySelector('[data-testid="help-command-center"]')?.textContent?.match(/\\d+ topics? found/)?.[0] || '',
      };
    })()`, 'Help newsletter search filter');

    const clearedInput = await evaluate(client, setInputValue('help-search', ''));
    assert(clearedInput.ok, `Help search input could not be cleared: ${JSON.stringify(clearedInput)}`);
    await evaluate(client, clickElement('help-category-api'));
    const apiCategory = await waitForRenderedState(client, `(() => {
      const topics = Array.from(document.querySelectorAll('[data-help-category]'));
      const categories = topics.map((node) => node.getAttribute('data-help-category') || '');
      const route = document.querySelector('[data-testid="help-topic-custom-frontend-agent-start-route"]');
      return {
        ready: topics.length > 0 &&
          categories.every((category) => category === 'api') &&
          route instanceof HTMLAnchorElement &&
          route.href.includes('/sites') &&
          route.href.includes('siteId=${encodeURIComponent(HELP_SMOKE_SITE_ID)}'),
        topicCount: topics.length,
        categories,
        routeHref: route instanceof HTMLAnchorElement ? route.href : '',
      };
    })()`, 'Help API category filter');

    const screenshotPath = await captureScreenshot(client);

    return {
      guard: 'help-rendered',
      siteId: HELP_SMOKE_SITE_ID,
      newsletterTopics: newsletterSearch.visibleTopics.length,
      apiTopics: apiCategory.topicCount,
      screenshotPath,
    };
  } finally {
    await cleanupChrome({ client, childProcess, userDataDir });
  }
};

const sourceResult = assertHelpSourceContracts();

if (!RENDERED_SMOKE) {
  console.log(JSON.stringify({
    ok: true,
    guard: 'help-source',
    requiredTopics: sourceResult.requiredTopics,
  }));
} else {
  const renderedResult = await runRenderedHelpSmoke();
  console.log(JSON.stringify({
    ok: true,
    ...renderedResult,
    requiredTopics: sourceResult.requiredTopics,
  }));
}
