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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(payload.error || payload).slice(0, 300)}`);
  }

  return payload;
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
    assert(state.emptyCreateVisible && /Create (First Page|the first page for this site)/.test(state.body), `${label} did not render the empty state controls: ${JSON.stringify(state)}`);
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
      && state.createDisabled === false
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

        if (
          !refreshed.rowDisabled
          && refreshed.deliveryText.includes('Health')
          && refreshed.deliveryText.includes('Recent probes')
          && refreshed.historyText.includes('render 200')
          && refreshed.historyText.includes('resolve 200')
          && !refreshed.deliveryText.includes('Refreshing public, render, and resolve endpoint health.')
        ) {
          return { url, state, clicked, refreshed };
        }

        await sleep(250);
      }

      throw new Error('Delivery refresh control did not finish refreshing.');
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
  const checkboxes = [...document.querySelectorAll('input[type="checkbox"]')]
    .filter((input) => input.getAttribute('aria-label')?.startsWith('Select '));
  checkboxes.forEach((checkbox) => {
    if (checkbox.checked) {
      checkbox.click();
    }
  });

  const select = [...document.querySelectorAll('select')]
    .find((candidate) => [...candidate.options].some((option) => option.value === 'publish' && option.textContent.includes('Publish selected')));
  if (select) {
    select.value = '';
    select.dispatchEvent(new Event('change', { bubbles: true }));
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
      const checkbox = [...document.querySelectorAll('input[type="checkbox"]')]
        .find((input) => input.getAttribute('aria-label') === ${JSON.stringify(`Select ${page.title}`)});
      const select = [...document.querySelectorAll('select')]
        .find((candidate) => [...candidate.options].some((option) => option.value === 'publish' && option.textContent.includes('Publish selected')));
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        checkbox: Boolean(checkbox),
        checked: checkbox?.checked === true,
        select: Boolean(select),
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`);

    if (state.ready && state.checkbox && state.select) {
      break;
    }

    if (attempt === 99) {
      throw new Error(`Bulk publish controls were not ready: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  await clearVisibleBulkSelection(client);

  const prepared = await evaluate(client, `(() => {
    const checkbox = [...document.querySelectorAll('input[type="checkbox"]')]
      .find((input) => input.getAttribute('aria-label') === ${JSON.stringify(`Select ${page.title}`)});
    if (checkbox && !checkbox.checked) {
      checkbox.click();
    }

    const select = [...document.querySelectorAll('select')]
      .find((candidate) => [...candidate.options].some((option) => option.value === 'publish' && option.textContent.includes('Publish selected')));
    if (select) {
      select.value = 'publish';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    return {
      prepared: Boolean(checkbox && select),
      checked: checkbox?.checked === true,
    };
  })()`);

  assert(prepared.prepared, `Unable to prepare bulk publish controls: ${JSON.stringify(prepared)}`);

  let openedState = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const opened = await evaluate(client, `(() => {
      const modal = document.querySelector('[data-testid="pages-bulk-publish-modal"]');
      const applyButton = modal ? null : [...document.querySelectorAll('button')]
        .find((button) => (
          button.textContent.includes('Publish selected')
          || button.textContent.includes('Review publish for 1 page')
          || button.textContent.includes('Publish 1 page')
        ));
      if (!modal && applyButton && !applyButton.disabled) {
        applyButton.click();
      }
      return {
        hasButton: Boolean(applyButton || modal),
        disabled: applyButton?.disabled === true,
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
  await client.send('Page.navigate', { url });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const checkbox = [...document.querySelectorAll('input[type="checkbox"]')]
        .find((input) => input.getAttribute('aria-label') === ${JSON.stringify(`Select ${page.title}`)});
      const row = [...document.querySelectorAll('tr')]
        .find((candidate) => (candidate.textContent || '').includes(${JSON.stringify(page.title)}));
      const select = [...document.querySelectorAll('select')]
        .find((candidate) => [...candidate.options].some((option) => option.value === 'publish' && option.textContent.includes('Publish selected')));
      return {
        ready: Boolean(document.querySelector('[data-testid="pages-command-center"]')),
        checkbox: Boolean(checkbox),
        rowText: row?.textContent || '',
        select: Boolean(select),
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`);

    if (
      state.ready
      && state.checkbox
      && state.select
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

  const prepared = await evaluate(client, `(() => {
    const checkbox = [...document.querySelectorAll('input[type="checkbox"]')]
      .find((input) => input.getAttribute('aria-label') === ${JSON.stringify(`Select ${page.title}`)});
    if (checkbox && !checkbox.checked) {
      checkbox.click();
    }

    const select = [...document.querySelectorAll('select')]
      .find((candidate) => [...candidate.options].some((option) => option.value === 'publish' && option.textContent.includes('Publish selected')));
    if (select) {
      select.value = 'publish';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    return {
      prepared: Boolean(checkbox && select),
      checked: checkbox?.checked === true,
      selectValue: select?.value || '',
    };
  })()`);
  assert(prepared.prepared && prepared.checked && prepared.selectValue === 'publish', `Unable to prepare bulk publish mutation controls: ${JSON.stringify(prepared)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const opened = await evaluate(client, `(() => {
      const modal = document.querySelector('[data-testid="pages-bulk-publish-modal"]');
      const applyButton = modal ? null : [...document.querySelectorAll('button')]
        .find((button) => (
          button.textContent.includes('Publish selected')
          || button.textContent.includes('Review publish for 1 page')
          || button.textContent.includes('Publish 1 page')
        ));
      if (!modal && applyButton && !applyButton.disabled) {
        applyButton.click();
      }
      return {
        hasButton: Boolean(applyButton || modal),
        disabled: applyButton?.disabled === true,
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
        bulkSelectValue: [...document.querySelectorAll('select')]
          .find((candidate) => [...candidate.options].some((option) => option.value === 'publish' && option.textContent.includes('Publish selected')))
          ?.value || '',
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

  return {
    url,
    prepared,
    confirmed,
    uiState,
    api: {
      pageId: page.id,
      status,
      publishedAt: apiPage.data?.page?.publishedAt || null,
    },
  };
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

const cleanup = async ({ client, childProcess, userDataDir, hierarchyPages }) => {
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
  const { childProcess, userDataDir } = launchChrome();
  let client;
  let hierarchyPages = null;

  try {
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
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: AUTH_STORAGE_SCRIPT,
    });

    const initialRender = await waitForPagesEmptyState(client);
    const emptyVisual = await assertPagesVisualState(client, 'pages empty state', VISUAL_SCREENSHOT_PATHS.empty, {
      empty: true,
      expectedText: 'Create the first page for this site.',
    });
    const emptyCreate = await clickEmptyCreate(
      client,
      'pages-empty-create',
      ['template=landing', 'title=Home', 'slug=home', 'isHomepage=true', 'nav=primary', 'navLabel=Home'],
      { title: 'Home', slug: 'home', template: 'landing', homepage: true },
    );
    await waitForPagesEmptyState(client);
    const registrationShortcut = await clickEmptyCreate(
      client,
      'pages-empty-create-registration',
      ['template=registration'],
      { title: 'Member registration', slug: 'register', template: 'registration', homepage: false },
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
    const parentDeliveryHealth = await waitForDeliveryRow(
      client,
      hierarchyPages.parentPage,
      'Health',
    );
    const deliveryVisual = await assertPagesVisualState(client, 'pages delivery row', VISUAL_SCREENSHOT_PATHS.delivery, {
      table: true,
      expectedText: 'Recent probes',
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
      hierarchyPages.parentPage,
      hierarchyPages.parentPage.title,
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
      registrationShortcut,
      childHierarchy,
      parentHierarchy,
      parentDeliveryHealth,
      deliveryRefresh,
      childRevisions,
      childRoute,
      childDelivery,
      publishReview,
      bulkPublishReview,
      bulkPublishMutation,
      visualScreenshotPaths: VISUAL_SCREENSHOT_PATHS,
      screenshotPath: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await cleanup({ client, childProcess, userDataDir, hierarchyPages });
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
