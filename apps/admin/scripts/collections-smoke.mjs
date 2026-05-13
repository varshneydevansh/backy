#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_COLLECTIONS_SMOKE_SITE_ID || 'site-demo';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_COLLECTIONS_CDP_PORT || 9386);
const SCREENSHOT_PATH = process.env.BACKY_COLLECTIONS_SCREENSHOT || path.join(os.tmpdir(), 'backy-collections-smoke.png');
const FRONTEND_COLLECTION_TEMPLATE_ID = 'smoke-collection-contract';
const FRONTEND_COLLECTION_TEMPLATE_NAME = 'Smoke frontend directory';
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
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : await response.text();

  if (!response.ok || payload?.success === false) {
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(payload?.error || payload).slice(0, 500)}`);
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
    label: 'Smoke collections frontend',
    url: 'https://example.com/smoke-collections-frontend',
    repository: 'example/backy-smoke-collections-frontend',
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
    customCss: ':root { --backy-smoke-collection-primary: #0f766e; }',
  },
  chrome: {
    header: { component: 'SmokeCollectionsHeader', source: 'site.navigation.primary' },
    navigation: { component: 'SmokeCollectionsNavigation', source: 'site.navigation.primary' },
    footer: { component: 'SmokeCollectionsFooter', source: 'site.navigation.footer' },
  },
  templates: [
    {
      id: FRONTEND_COLLECTION_TEMPLATE_ID,
      type: 'collection',
      name: FRONTEND_COLLECTION_TEMPLATE_NAME,
      routePattern: '/smoke-contract-directory/:recordSlug',
      description: 'Frontend contract collection template used by the collections smoke.',
      content: {
        name: 'Smoke contract directory',
        slug: `smoke-contract-directory-${Date.now().toString(36)}`,
        description: 'A directory schema seeded from the connected frontend design contract.',
        listRoutePattern: '/smoke-contract-directory',
        publicRead: true,
        publicCreate: true,
        fields: [
          { key: 'title', label: 'Title', type: 'text', required: true, unique: true },
          { key: 'category', label: 'Category', type: 'select', required: true, options: ['Featured', 'Smoke', 'Reference'] },
          { key: 'summary', label: 'Summary', type: 'richText', required: false },
          { key: 'image', label: 'Image', type: 'image', required: false },
          { key: 'website', label: 'Website', type: 'url', required: false },
        ],
      },
      bindingHints: [
        { role: 'collection.list', binding: 'collections.smokeContractDirectory.records' },
        { role: 'collection.item.title', binding: 'record.title' },
        { role: 'collection.item.image', binding: 'record.image' },
      ],
    },
  ],
  editableMap: [
    { role: 'collection.list', binding: 'collections.smokeContractDirectory.records', fields: ['title', 'category', 'summary', 'image'] },
  ],
  notes: 'Temporary frontend design contract for collections smoke validation.',
  updatedAt: new Date().toISOString(),
});

const createCollection = async ({ name, slug, extraFields = [] }) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      slug,
      description: 'Temporary smoke collection for dynamic frontend datasets.',
      status: 'published',
      routePattern: `/${slug}/:recordSlug`,
      listRoutePattern: `/${slug}`,
      permissions: {
        publicRead: true,
        publicCreate: true,
        publicUpdate: false,
        publicDelete: false,
      },
      fields: [
        {
          key: 'title',
          label: 'Title',
          type: 'text',
          required: true,
          unique: true,
          sortOrder: 10,
        },
        {
          key: 'category',
          label: 'Category',
          type: 'select',
          required: true,
          unique: false,
          sortOrder: 20,
          options: ['Smoke', 'Reference', 'Live'],
        },
        {
          key: 'summary',
          label: 'Summary',
          type: 'richText',
          required: false,
          unique: false,
          sortOrder: 30,
        },
        {
          key: 'featured',
          label: 'Featured',
          type: 'boolean',
          required: false,
          unique: false,
          sortOrder: 40,
          defaultValue: false,
        },
        {
          key: 'website',
          label: 'Website',
          type: 'url',
          required: false,
          unique: false,
          sortOrder: 50,
        },
        ...extraFields,
      ],
    }),
  });
  const collection = payload.data?.collection || payload.collection;
  assert(collection?.id, `Create collection did not return a collection: ${JSON.stringify(payload).slice(0, 500)}`);
  return collection;
};

const deleteCollection = async (collectionId) => {
  if (!collectionId) return;
  await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collectionId}`, { method: 'DELETE' });
};

const deletePage = async (pageId) => {
  if (!pageId) return;
  await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`, { method: 'DELETE' });
};

const createAuthoredTemplatePage = async ({ kind, suffix }) => {
  const isList = kind === 'list';
  const rootId = isList ? 'authored-dynamic-list-root' : 'authored-dynamic-item-root';
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages`, {
    method: 'POST',
    body: JSON.stringify({
      title: `Smoke authored ${kind} template ${suffix}`,
      slug: `smoke-authored-${kind}-template-${suffix}`,
      description: `Temporary authored ${kind} template for collections smoke.`,
      status: 'draft',
      content: {
        canvasSize: { width: 1200, height: 760 },
        elements: [
          {
            id: rootId,
            type: 'section',
            x: 0,
            y: 0,
            width: 1200,
            height: 680,
            props: { backgroundColor: '#ffffff' },
            styles: {},
            actions: [],
            dataBindings: [],
            children: isList
              ? [
                  {
                    id: 'authored-dynamic-list-title',
                    type: 'heading',
                    x: 72,
                    y: 72,
                    width: 720,
                    height: 72,
                    props: {
                      content: 'Authored collection list',
                      binding: 'collection.name',
                      level: 1,
                      fontSize: 48,
                      fontWeight: 800,
                    },
                    styles: {},
                    actions: [],
                    dataBindings: [],
                    children: [],
                  },
                  {
                    id: 'authored-dynamic-list-repeater',
                    type: 'repeater',
                    x: 72,
                    y: 192,
                    width: 1056,
                    height: 320,
                    props: {
                      binding: 'collection.records',
                      columns: 3,
                      gap: 16,
                    },
                    styles: {},
                    actions: [],
                    dataBindings: [],
                    children: [],
                  },
                ]
              : [
                  {
                    id: 'authored-dynamic-item-title',
                    type: 'heading',
                    x: 72,
                    y: 72,
                    width: 760,
                    height: 82,
                    props: {
                      content: 'Authored record title',
                      binding: 'record.title',
                      level: 1,
                      fontSize: 48,
                      fontWeight: 800,
                    },
                    styles: {},
                    actions: [],
                    dataBindings: [],
                    children: [],
                  },
                  {
                    id: 'authored-dynamic-item-summary',
                    type: 'text',
                    x: 76,
                    y: 176,
                    width: 720,
                    height: 96,
                    props: {
                      content: 'Authored record summary',
                      binding: 'record.summary',
                      fontSize: 18,
                      lineHeight: 1.6,
                    },
                    styles: {},
                    actions: [],
                    dataBindings: [],
                    children: [],
                  },
                ],
          },
        ],
      },
      meta: {
        title: `Smoke authored ${kind} template ${suffix}`,
        description: `Temporary authored ${kind} template for collections smoke.`,
      },
    }),
  });
  const page = payload.data?.page || payload.page;
  assert(page?.id, `Create authored ${kind} template page did not return a page: ${JSON.stringify(payload).slice(0, 500)}`);
  return page;
};

const createRecord = async ({ collectionId, slug, title }) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collectionId}/records`, {
    method: 'POST',
    body: JSON.stringify({
      slug,
      status: 'draft',
      values: {
        title,
        category: 'Smoke',
        summary: 'Record created by the Collections smoke test.',
        featured: true,
        website: 'https://backy.local/smoke',
      },
    }),
  });
  const record = payload.data?.record || payload.record;
  assert(record?.id, `Create collection record did not return a record: ${JSON.stringify(payload).slice(0, 500)}`);
  return record;
};

const fetchRecordBySlug = async (collectionId, recordSlug) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collectionId}/records?slug=${encodeURIComponent(recordSlug)}`);
  const records = payload.data?.records || payload.records || [];
  return records[0] || null;
};

const fetchCollections = async () => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections`);
  return payload.data?.collections || payload.collections || [];
};

const waitForRecordStatus = async (collectionId, recordSlug, status) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const record = await fetchRecordBySlug(collectionId, recordSlug);
    if (record?.status === status) {
      return record;
    }
    await sleep(250);
  }

  throw new Error(`Collection record ${recordSlug} did not reach status ${status}`);
};

const assertPublicRecord = async (collectionSlug, recordSlug) => {
  const payload = await requestApi(`/api/sites/${SITE_ID}/collections/${collectionSlug}/records?slug=${encodeURIComponent(recordSlug)}`);
  const records = payload.data?.records || payload.records || [];
  assert(
    records.some((record) => record.slug === recordSlug && record.status === 'published'),
    `Public collection endpoint did not return published record ${recordSlug}: ${JSON.stringify(payload).slice(0, 500)}`,
  );
  return records[0];
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

const navigateToCollections = (client, { collectionId, recordSlug }) => {
  const params = new URLSearchParams({
    siteId: SITE_ID,
    collectionId,
    search: recordSlug,
  });

  return navigate(
    client,
    `${ADMIN_BASE_URL}/collections?${params.toString()}`,
    `(() => ({
      ready: Boolean(document.querySelector('[data-testid="collections-command-center"]')) &&
        Boolean(document.querySelector('[data-testid="collections-templates"]')) &&
        Boolean(document.querySelector('[data-testid="collections-audit-panel"]')) &&
        Boolean(document.querySelector(${JSON.stringify(`[data-testid="collections-frontend-template-${FRONTEND_COLLECTION_TEMPLATE_ID}"]`)})) &&
        document.body?.innerText?.includes('Collections command center') &&
        document.body?.innerText?.includes('Collections access and activity') &&
        document.body?.innerText?.includes('Collection created') &&
        document.body?.innerText?.includes('Collection record created') &&
        document.body?.innerText?.includes(${JSON.stringify(FRONTEND_COLLECTION_TEMPLATE_NAME)}) &&
        document.body?.innerText?.includes(${JSON.stringify(recordSlug)}),
      body: document.body?.innerText?.slice(0, 1200) || '',
      path: window.location.pathname,
      search: window.location.search,
    }))()`,
    'Collections page',
  );
};

const assertCollectionsLayout = async (client, { collectionId, collectionName, collectionSlug, recordSlug, targetCollectionName, incomingCollectionName }) => {
  const layout = await evaluate(client, `(() => {
    const body = document.body?.innerText || '';
    const relationshipText = document.querySelector('[data-testid="collections-relationship-browser"]')?.textContent || '';
    const authoringText = document.querySelector('[data-testid="collections-authoring-shortcuts"]')?.textContent || '';
    return {
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      path: window.location.pathname,
      hasCommandCenter: Boolean(document.querySelector('[data-testid="collections-command-center"]')),
      hasTemplates: Boolean(document.querySelector('[data-testid="collections-templates"]')),
      hasFrontendTemplates: Boolean(document.querySelector('[data-testid="collections-frontend-template-options"]')) &&
        Boolean(document.querySelector(${JSON.stringify(`[data-testid="collections-frontend-template-${FRONTEND_COLLECTION_TEMPLATE_ID}"]`)})) &&
        body.includes('Frontend design collections') &&
        body.includes(${JSON.stringify(FRONTEND_COLLECTION_TEMPLATE_NAME)}),
      hasApiContract: body.includes('Collection API contract') && body.includes('Public records') && body.includes('Bulk records'),
      hasFrontendContract: body.includes('Dynamic data frontend contract') && body.includes('Frontend wiring'),
      hasBindingContract: Boolean(document.querySelector('[data-testid="collections-binding-contract"]')) &&
        body.includes('Editor data-binding contract') &&
        body.includes('Repeater/list sections') &&
        body.includes('Public write flows'),
      hasAuthoringShortcuts: Boolean(document.querySelector('[data-testid="collections-authoring-shortcuts"]')) &&
        Boolean(document.querySelector('[data-testid="collections-authoring-copy-repeater"]')) &&
        Boolean(document.querySelector('[data-testid="collections-authoring-copy-binding"]')) &&
        Boolean(document.querySelector('[data-testid="collections-authoring-copy-list-brief"]')) &&
        Boolean(document.querySelector('[data-testid="collections-authoring-copy-item-brief"]')) &&
        Boolean(document.querySelector('[data-testid="collections-authoring-open-list-builder"]')) &&
        Boolean(document.querySelector('[data-testid="collections-authoring-open-item-builder"]')) &&
        Boolean(document.querySelector('[data-testid="collections-list-authored-template"]')) &&
        Boolean(document.querySelector('[data-testid="collections-item-authored-template"]')) &&
        Boolean(document.querySelector('[data-testid="collections-list-authored-template-select"]')) &&
        Boolean(document.querySelector('[data-testid="collections-item-authored-template-select"]')) &&
        Boolean(document.querySelector('[data-testid="collections-visitor-write-policy"]')) &&
        Boolean(document.querySelector('[data-testid="collections-visitor-write-policy-mode"]')) &&
        authoringText.includes('Dataset authoring shortcuts') &&
        authoringText.includes(${JSON.stringify(`dataset_${collectionId}`)}) &&
        authoringText.includes('Copy repeater preset') &&
        authoringText.includes('Copy field binding') &&
        authoringText.includes('Open list builder') &&
        authoringText.includes('Open item builder') &&
        authoringText.includes('/pages/new?siteId='),
      hasRelationshipBrowser: Boolean(document.querySelector('[data-testid="collections-relationship-browser"]')) &&
        Boolean(document.querySelector('[data-testid="collections-relationship-outgoing"]')) &&
        Boolean(document.querySelector('[data-testid="collections-relationship-incoming"]')) &&
        relationshipText.includes('Relationship browser') &&
        relationshipText.includes('Outgoing references') &&
        relationshipText.includes('Incoming references') &&
        relationshipText.includes(${JSON.stringify(targetCollectionName)}) &&
        relationshipText.includes(${JSON.stringify(incomingCollectionName)}) &&
        relationshipText.includes('related_target') &&
        relationshipText.includes('Directory reference'),
      hasDynamicTemplateControl: Boolean(document.querySelector('[data-testid="collections-dynamic-template-controls"]')) &&
        Boolean(document.querySelector('[data-testid="collections-frontend-template-control"]')) &&
        Boolean(document.querySelector('[data-testid="collections-frontend-template-select"]')) &&
        body.includes('Captured frontend template') &&
        body.includes('Use generated Backy templates') &&
        body.includes(${JSON.stringify(FRONTEND_COLLECTION_TEMPLATE_NAME)}),
      hasAuditPanel: Boolean(document.querySelector('[data-testid="collections-audit-panel"]')) &&
        Boolean(document.querySelector('[data-testid="collections-permission-contract"]')) &&
        Boolean(document.querySelector('[data-testid="collections-audit-list"]')) &&
        body.includes('Collections access and activity') &&
        body.includes('collections.view') &&
        body.includes('collections.edit') &&
        body.includes('Collection created') &&
        body.includes('Collection record created'),
      hasBuilder: body.includes('Schema builder') && body.includes('Public read') && body.includes('Visitor create'),
      hasRecords: body.includes('Records') && body.includes('Import CSV') && body.includes('Export CSV') && body.includes('New record'),
      hasCollection: body.includes(${JSON.stringify(collectionName)}) && body.includes(${JSON.stringify(`/${collectionSlug}`)}),
      hasRecord: body.includes(${JSON.stringify(recordSlug)}) && body.includes(${JSON.stringify(`/${collectionSlug}/${recordSlug}`)}),
      hasFieldControls: body.includes('Title') && body.includes('Category') && body.includes('Featured') && body.includes('Website'),
      hasSelectionControl: Boolean(Array.from(document.querySelectorAll('input')).find((input) => (
        (input.getAttribute('aria-label') || '') === ${JSON.stringify(`Select record ${recordSlug}`)}
      ))),
      relationshipText,
      authoringText,
    };
  })()`);

  assert(layout.scrollWidth <= layout.width + 8, `Collections page has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(
    layout.path === '/collections' &&
    layout.hasCommandCenter &&
    layout.hasTemplates &&
    layout.hasFrontendTemplates &&
    layout.hasApiContract &&
      layout.hasFrontendContract &&
      layout.hasBindingContract &&
      layout.hasAuthoringShortcuts &&
      layout.hasRelationshipBrowser &&
      layout.hasDynamicTemplateControl &&
      layout.hasAuditPanel &&
      layout.hasBuilder &&
      layout.hasRecords &&
      layout.hasCollection &&
      layout.hasRecord &&
      layout.hasFieldControls &&
      layout.hasSelectionControl,
    `Collections page missing expected regions: ${JSON.stringify(layout)}`,
  );
  return layout;
};

const assertAuthoringShortcutCopy = async (client) => {
  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="collections-authoring-copy-repeater"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'authoring-copy-button-missing' };
    }
    if (button.disabled) return { ok: false, reason: 'authoring-copy-button-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(clicked.ok, `Unable to use authoring shortcut copy action: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const body = document.body?.innerText || '';
      return {
        ready: body.includes('Repeater dataset preset copied.') ||
          (body.includes('backy.dataset-authoring.v1') && body.includes('collection-repeater')),
        body: body.slice(0, 1200),
      };
    })()`);
    if (state.ready) return state;
    await sleep(100);
  }

  throw new Error('Authoring shortcut copy action did not surface copied preset feedback');
};

const createFrontendTemplateCollectionThroughUi = async (client) => {
  const before = await fetchCollections();
  const beforeIds = new Set(before.map((collection) => collection.id));

  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector(${JSON.stringify(`[data-testid="collections-frontend-template-${FRONTEND_COLLECTION_TEMPLATE_ID}"]`)});
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'frontend-template-button-missing', body: document.body?.innerText?.slice(0, 1200) || '' };
    }
    if (button.disabled) return { ok: false, reason: 'frontend-template-button-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(clicked.ok, `Unable to create collection from frontend template: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const collections = await fetchCollections();
    const created = collections.find((collection) => (
      !beforeIds.has(collection.id) &&
      collection.metadata?.frontendDesignTemplateId === FRONTEND_COLLECTION_TEMPLATE_ID
    ));
    if (created) {
      assert(created.metadata?.frontendDesignTemplateName === FRONTEND_COLLECTION_TEMPLATE_NAME, `Frontend template name was not stored: ${JSON.stringify(created.metadata)}`);
      assert(created.metadata?.frontendDesignSource?.label === 'Smoke collections frontend', `Frontend source snapshot missing: ${JSON.stringify(created.metadata)}`);
      assert(created.metadata?.frontendDesignRoutePattern === '/smoke-contract-directory/:recordSlug', `Frontend route pattern missing: ${JSON.stringify(created.metadata)}`);
      assert(created.metadata?.frontendDesignChrome?.header?.component === 'SmokeCollectionsHeader', `Frontend chrome snapshot missing: ${JSON.stringify(created.metadata)}`);
      assert(created.metadata?.frontendDesignTokens?.fonts?.heading === 'Inter', `Frontend token snapshot missing: ${JSON.stringify(created.metadata)}`);
      assert(Array.isArray(created.metadata?.frontendDesignBindingHints) && created.metadata.frontendDesignBindingHints.length === 3, `Frontend binding hints missing: ${JSON.stringify(created.metadata)}`);
      assert(created.permissions?.publicCreate === true, `Frontend template permissions were not applied: ${JSON.stringify(created.permissions)}`);
      assert(created.fields?.some((field) => field.key === 'category' && field.type === 'select'), `Frontend template fields were not applied: ${JSON.stringify(created.fields)}`);
      return created;
    }
    await sleep(250);
  }

  throw new Error('Frontend template collection was not created');
};

const attachFrontendTemplateThroughUi = async (client, collectionId) => {
  const selected = await evaluate(client, `(() => {
    const select = document.querySelector('[data-testid="collections-frontend-template-select"]');
    if (!(select instanceof HTMLSelectElement)) {
      return { ok: false, reason: 'template-select-missing', body: document.body?.innerText?.slice(0, 1200) || '' };
    }
    const hasOption = Array.from(select.options).some((option) => option.value === ${JSON.stringify(FRONTEND_COLLECTION_TEMPLATE_ID)});
    if (!hasOption) return { ok: false, reason: 'template-option-missing', options: Array.from(select.options).map((option) => option.value) };
    select.value = ${JSON.stringify(FRONTEND_COLLECTION_TEMPLATE_ID)};
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return {
      ok: true,
      summary: document.querySelector('[data-testid="collections-frontend-template-summary"]')?.textContent || '',
    };
  })()`);
  assert(selected.ok, `Unable to choose captured collection template: ${JSON.stringify(selected)}`);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      selected: document.querySelector('[data-testid="collections-frontend-template-select"]')?.value || '',
      summary: document.querySelector('[data-testid="collections-frontend-template-summary"]')?.textContent || '',
    }))()`);
    if (
      state.selected === FRONTEND_COLLECTION_TEMPLATE_ID &&
      state.summary.includes(FRONTEND_COLLECTION_TEMPLATE_NAME) &&
      state.summary.includes(FRONTEND_COLLECTION_TEMPLATE_ID)
    ) {
      break;
    }
    if (attempt === 19) {
      throw new Error(`Captured collection template summary did not update: ${JSON.stringify(state)}`);
    }
    await sleep(100);
  }

  let clicked = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    clicked = await evaluate(client, `(() => {
      const form = document.querySelector('#collections-schema');
      const button = form
        ? Array.from(form.querySelectorAll('button')).find((candidate) => (candidate.textContent || '').includes('Save schema'))
        : null;
      if (!(button instanceof HTMLButtonElement)) {
        return { ok: false, reason: 'save-button-missing' };
      }
      if (button.disabled) {
        return {
          ok: false,
          reason: 'save-button-disabled',
          selected: document.querySelector('[data-testid="collections-frontend-template-select"]')?.value || '',
          summary: document.querySelector('[data-testid="collections-frontend-template-summary"]')?.textContent || '',
          busyText: document.body?.innerText?.includes('Loading') || false,
        };
      }
      button.click();
      return { ok: true };
    })()`);
    if (clicked.ok) break;
    await sleep(250);
  }
  assert(clicked.ok, `Unable to save captured collection template selection: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const collections = await fetchCollections();
    const collection = collections.find((candidate) => candidate.id === collectionId);
    if (
      collection?.metadata?.frontendDesignTemplateId === FRONTEND_COLLECTION_TEMPLATE_ID &&
      collection?.metadata?.frontendDesignTemplateName === FRONTEND_COLLECTION_TEMPLATE_NAME &&
      collection?.metadata?.frontendDesignSource?.label === 'Smoke collections frontend' &&
      Array.isArray(collection?.metadata?.frontendDesignBindingHints)
    ) {
      return collection;
    }
    await sleep(250);
  }

  throw new Error('Captured collection template selection did not persist');
};

const captureAuthoredTemplatesThroughUi = async (client, collectionId, { listPageId, itemPageId }) => {
  for (const [kind, pageId] of [['list', listPageId], ['item', itemPageId]]) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const captured = await evaluate(client, `(() => {
        const button = document.querySelector(${JSON.stringify(`[data-testid="collections-${kind}-authored-template-capture"]`)});
        const select = document.querySelector(${JSON.stringify(`[data-testid="collections-${kind}-authored-template-select"]`)});
        const panel = document.querySelector(${JSON.stringify(`[data-testid="collections-${kind}-authored-template"]`)});
        if (!(select instanceof HTMLSelectElement)) {
          return { ok: false, reason: 'select-missing' };
        }
        const hasOption = Array.from(select.options).some((option) => option.value === ${JSON.stringify(pageId)});
        if (!hasOption) {
          return { ok: false, reason: 'page-option-missing', options: Array.from(select.options).map((option) => option.value) };
        }
        if (select.value !== ${JSON.stringify(pageId)}) {
          select.value = ${JSON.stringify(pageId)};
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: false, reason: 'select-updated', value: select.value };
        }
        if (!(button instanceof HTMLButtonElement)) {
          return { ok: false, reason: 'capture-button-missing' };
        }
        if (button.disabled) {
          return { ok: false, reason: 'capture-button-disabled', text: panel?.textContent || '' };
        }
        button.click();
        return { ok: true };
      })()`);
      if (captured.ok) break;
      if (attempt === 79) {
        throw new Error(`Unable to capture ${kind} authored template page: ${JSON.stringify(captured)}`);
      }
      await sleep(250);
    }

    for (let attempt = 0; attempt < 80; attempt += 1) {
      const state = await evaluate(client, `(() => {
        const panel = document.querySelector(${JSON.stringify(`[data-testid="collections-${kind}-authored-template"]`)});
        return { text: panel?.textContent || '' };
      })()`);
      if (state.text.includes('Captured') && state.text.includes('root elements')) break;
      if (attempt === 79) {
        throw new Error(`${kind} authored template capture did not update panel: ${JSON.stringify(state)}`);
      }
      await sleep(250);
    }
  }

  const clicked = await evaluate(client, `(() => {
    const form = document.querySelector('#collections-schema');
    const button = form
      ? Array.from(form.querySelectorAll('button')).find((candidate) => (candidate.textContent || '').includes('Save schema'))
      : null;
    if (!(button instanceof HTMLButtonElement)) return { ok: false, reason: 'save-button-missing' };
    if (button.disabled) return { ok: false, reason: 'save-button-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(clicked.ok, `Unable to save authored template selection: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const collections = await fetchCollections();
    const collection = collections.find((candidate) => candidate.id === collectionId);
    const dynamicTemplates = collection?.metadata?.dynamicTemplates;
    if (
      dynamicTemplates?.list?.authoredCanvas?.pageId === listPageId &&
      dynamicTemplates?.item?.authoredCanvas?.pageId === itemPageId &&
      Array.isArray(dynamicTemplates.list.authoredCanvas.elements) &&
      Array.isArray(dynamicTemplates.item.authoredCanvas.elements)
    ) {
      return collection;
    }
    await sleep(250);
  }

  throw new Error('Authored dynamic template selection did not persist');
};

const assertAuthoredDynamicTemplateRender = async ({ collectionId, collectionSlug, collectionName, recordSlug, recordTitle }) => {
  const listPayload = await requestApi(`/api/sites/${SITE_ID}/render?path=${encodeURIComponent(`/${collectionSlug}`)}`);
  const listElements = listPayload.data?.content?.elements || [];
  const listRoot = listElements.find((element) => element.id === 'authored-dynamic-list-root');
  const listTitle = listRoot?.children?.find((element) => element.id === 'authored-dynamic-list-title');
  const listRepeater = listRoot?.children?.find((element) => element.id === 'authored-dynamic-list-repeater');
  assert(listPayload.data?.route?.type === 'dynamicList', `Authored list route did not render dynamic list: ${JSON.stringify(listPayload.data?.route)}`);
  assert(listTitle?.props?.content === collectionName, `Authored list title was not bound to collection name: ${JSON.stringify(listTitle)}`);
  assert(listRepeater?.props?.collectionId === collectionId, `Authored list repeater was not bound to collection id: ${JSON.stringify(listRepeater)}`);

  const itemPayload = await requestApi(`/api/sites/${SITE_ID}/render?path=${encodeURIComponent(`/${collectionSlug}/${recordSlug}`)}`);
  const itemElements = itemPayload.data?.content?.elements || [];
  const itemRoot = itemElements.find((element) => element.id === 'authored-dynamic-item-root');
  const itemTitle = itemRoot?.children?.find((element) => element.id === 'authored-dynamic-item-title');
  const itemSummary = itemRoot?.children?.find((element) => element.id === 'authored-dynamic-item-summary');
  assert(itemPayload.data?.route?.type === 'dynamicItem', `Authored item route did not render dynamic item: ${JSON.stringify(itemPayload.data?.route)}`);
  assert(itemTitle?.props?.content === recordTitle, `Authored item title was not bound to record title: ${JSON.stringify(itemTitle)}`);
  assert(
    `${itemSummary?.props?.content || ''} ${itemSummary?.props?.html || ''}`.includes('Record created by the Collections smoke test.'),
    `Authored item summary was not bound to record summary: ${JSON.stringify(itemSummary)}`,
  );
  assert(
    itemPayload.data?.dataBindings?.datasets?.some((dataset) => (
      dataset.collectionId === collectionId &&
      dataset.records?.some((record) => record.slug === recordSlug)
    )),
    'Authored item render did not include collection dataset manifest',
  );
};

const publishRecordThroughUi = async (client, recordSlug) => {
  const selected = await evaluate(client, `(() => {
    const checkbox = Array.from(document.querySelectorAll('input')).find((input) => (
      (input.getAttribute('aria-label') || '') === ${JSON.stringify(`Select record ${recordSlug}`)}
    ));
    if (!(checkbox instanceof HTMLInputElement)) {
      return { ok: false, reason: 'record-checkbox-missing' };
    }
    if (!checkbox.checked) checkbox.click();
    return { ok: true, checked: checkbox.checked };
  })()`);
  assert(selected.ok, `Unable to select collection record: ${JSON.stringify(selected)}`);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="collections-record-bulk-toolbar"]')) &&
        (document.querySelector('[data-testid="collections-record-bulk-toolbar"]')?.textContent || '').includes('1 selected'),
      body: document.body?.innerText?.slice(0, 800) || '',
    }))()`);
    if (state.ready) break;
    if (attempt === 39) {
      throw new Error(`Selected collection record toolbar did not appear: ${JSON.stringify(state)}`);
    }
    await sleep(100);
  }

  const clicked = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="collections-record-bulk-publish"]');
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        reason: 'publish-button-missing',
        toolbar: document.querySelector('[data-testid="collections-record-bulk-toolbar"]')?.textContent || '',
        buttons: Array.from(document.querySelectorAll('button')).map((candidate) => candidate.textContent?.trim()).filter(Boolean).slice(0, 100),
      };
    }
    if (button.disabled) return { ok: false, reason: 'publish-button-disabled' };
    button.click();
    return { ok: true };
  })()`);
  assert(clicked.ok, `Unable to publish selected collection record: ${JSON.stringify(clicked)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: document.body?.innerText?.includes('records moved to published') ||
        document.body?.innerText?.includes('1 records moved to published') ||
        false,
      hasPublishedBadge: document.body?.innerText?.includes('Published') || false,
      hasRecordAudit: document.body?.innerText?.includes('Collection record bulk-updated') &&
        document.body?.innerText?.includes('bulk updateStatus'),
      body: document.body?.innerText?.slice(0, 1000) || '',
    }))()`);
    if ((state.ready || state.hasPublishedBadge) && state.hasRecordAudit) {
      return state;
    }
    if (attempt === 79) {
      throw new Error(`Collection record publish action did not settle: ${JSON.stringify(state)}`);
    }
    await sleep(150);
  }

  return null;
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-collections-${Date.now()}`);
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

const cleanup = async ({ client, childProcess, userDataDir, collectionIds, pageIds, originalFrontendDesign }) => {
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

  for (const collectionId of collectionIds || []) {
    if (collectionId) {
      try {
        await deleteCollection(collectionId);
      } catch {
        // The smoke creates temporary collections and deletes them best-effort.
      }
    }
  }

  for (const pageId of pageIds || []) {
    if (pageId) {
      try {
        await deletePage(pageId);
      } catch {
        // The smoke creates temporary pages and deletes them best-effort.
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
  let collectionId;
  let targetCollectionId;
  let incomingCollectionId;
  let frontendTemplateCollectionId;
  let authoredListPageId;
  let authoredItemPageId;
  let originalFrontendDesign;
  const suffix = Date.now().toString(36);
  const collectionName = `Smoke Directory ${suffix}`;
  const collectionSlug = `smoke-directory-${suffix}`;
  const targetCollectionName = `Smoke Target ${suffix}`;
  const targetCollectionSlug = `smoke-target-${suffix}`;
  const incomingCollectionName = `Smoke Related ${suffix}`;
  const incomingCollectionSlug = `smoke-related-${suffix}`;
  const recordSlug = `smoke-record-${suffix}`;
  const recordTitle = `Smoke record ${suffix}`;

  try {
    await loginAdminApi();
    originalFrontendDesign = await getFrontendDesign();
    await patchFrontendDesign(smokeFrontendDesignContract());

    const targetCollection = await createCollection({ name: targetCollectionName, slug: targetCollectionSlug });
    targetCollectionId = targetCollection.id;

    const collection = await createCollection({
      name: collectionName,
      slug: collectionSlug,
      extraFields: [
        {
          key: 'related_target',
          label: 'Related target',
          type: 'reference',
          required: false,
          unique: false,
          sortOrder: 60,
          referenceCollectionId: targetCollection.id,
        },
      ],
    });
    collectionId = collection.id;
    const incomingCollection = await createCollection({
      name: incomingCollectionName,
      slug: incomingCollectionSlug,
      extraFields: [
        {
          key: 'directory_ref',
          label: 'Directory reference',
          type: 'reference',
          required: false,
          unique: false,
          sortOrder: 60,
          referenceCollectionId: collection.id,
        },
      ],
    });
    incomingCollectionId = incomingCollection.id;
    await createRecord({ collectionId, slug: recordSlug, title: recordTitle });
    const authoredListPage = await createAuthoredTemplatePage({ kind: 'list', suffix });
    authoredListPageId = authoredListPage.id;
    const authoredItemPage = await createAuthoredTemplatePage({ kind: 'item', suffix });
    authoredItemPageId = authoredItemPage.id;

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
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: authStorageScript(apiAdminSessionToken) });

    await navigateToCollections(client, { collectionId, recordSlug });
    await assertCollectionsLayout(client, { collectionId, collectionName, collectionSlug, recordSlug, targetCollectionName, incomingCollectionName });
    await assertAuthoringShortcutCopy(client);
    await captureAuthoredTemplatesThroughUi(client, collectionId, { listPageId: authoredListPageId, itemPageId: authoredItemPageId });
    await publishRecordThroughUi(client, recordSlug);
    await waitForRecordStatus(collectionId, recordSlug, 'published');
    await assertAuthoredDynamicTemplateRender({ collectionId, collectionSlug, collectionName, recordSlug, recordTitle });
    await assertPublicRecord(collectionSlug, recordSlug);
    await attachFrontendTemplateThroughUi(client, collectionId);
    const frontendTemplateCollection = await createFrontendTemplateCollectionThroughUi(client);
    frontendTemplateCollectionId = frontendTemplateCollection.id;
    await navigateToCollections(client, { collectionId, recordSlug });

    await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }).then((result) => {
      fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(result.data, 'base64'));
    });

    await deleteCollection(incomingCollectionId);
    incomingCollectionId = null;
    await deleteCollection(collectionId);
    collectionId = null;
    await deleteCollection(targetCollectionId);
    targetCollectionId = null;
    await deleteCollection(frontendTemplateCollectionId);
    frontendTemplateCollectionId = null;
    await deletePage(authoredListPageId);
    authoredListPageId = null;
    await deletePage(authoredItemPageId);
    authoredItemPageId = null;
    await patchFrontendDesign(originalFrontendDesign);
    originalFrontendDesign = null;

    console.log(JSON.stringify({
      ok: true,
      siteId: SITE_ID,
      collectionName,
      collectionSlug,
      recordSlug,
      frontendTemplateCollectionId: frontendTemplateCollection.id,
      screenshot: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await cleanup({
      client,
      childProcess,
      userDataDir,
      collectionIds: [incomingCollectionId, collectionId, targetCollectionId, frontendTemplateCollectionId],
      pageIds: [authoredListPageId, authoredItemPageId],
      originalFrontendDesign,
    });
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
