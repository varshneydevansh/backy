#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_ORDERS_SMOKE_SITE_ID || 'site-demo';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_ORDERS_CDP_PORT || 9389);
const SCREENSHOT_PATH = process.env.BACKY_ORDERS_SCREENSHOT || path.join(os.tmpdir(), 'backy-orders-smoke.png');

const ORDERS_COLLECTION_SLUG = 'orders';
const CUSTOMERS_COLLECTION_SLUG = 'customers';
const COMMERCE_WEBHOOK_SECRET = 'smoke-commerce-webhook-secret';
const COMMERCE_WEBHOOK_SECRET_REFERENCE = 'env:BACKY_COMMERCE_WEBHOOK_SECRET';
const ORDER_REQUIRED_FIELD_COUNT = 33;
let apiAdminSessionToken = '';

const ORDER_FIELDS = [
  { key: 'ordernumber', label: 'Order Number', type: 'text', required: true, unique: true, sortOrder: 10 },
  { key: 'customername', label: 'Customer Name', type: 'text', required: true, unique: false, sortOrder: 20 },
  { key: 'email', label: 'Email', type: 'email', required: true, unique: false, sortOrder: 30 },
  { key: 'phone', label: 'Phone', type: 'text', required: false, unique: false, sortOrder: 40 },
  { key: 'total', label: 'Total', type: 'number', required: true, unique: false, sortOrder: 50 },
  { key: 'subtotal', label: 'Subtotal', type: 'number', required: false, unique: false, sortOrder: 55 },
  { key: 'taxamount', label: 'Tax Amount', type: 'number', required: false, unique: false, sortOrder: 56 },
  { key: 'shippingamount', label: 'Shipping Amount', type: 'number', required: false, unique: false, sortOrder: 57 },
  { key: 'discountamount', label: 'Discount Amount', type: 'number', required: false, unique: false, sortOrder: 58 },
  { key: 'currency', label: 'Currency', type: 'text', required: true, unique: false, sortOrder: 60, defaultValue: 'USD' },
  { key: 'items', label: 'Items', type: 'richText', required: true, unique: false, sortOrder: 70 },
  { key: 'ordersource', label: 'Order Source', type: 'select', required: false, unique: false, sortOrder: 75, options: ['web', 'manual', 'api', 'import', 'pos'], defaultValue: 'web' },
  { key: 'checkoutsessionid', label: 'Checkout Session ID', type: 'text', required: false, unique: false, sortOrder: 76 },
  { key: 'customerid', label: 'Customer ID', type: 'text', required: false, unique: false, sortOrder: 77 },
  { key: 'orderstatus', label: 'Order Status', type: 'select', required: true, unique: false, sortOrder: 80, options: ['open', 'paid', 'fulfilled', 'cancelled', 'refunded'], defaultValue: 'open' },
  { key: 'paymentstatus', label: 'Payment Status', type: 'select', required: true, unique: false, sortOrder: 90, options: ['pending', 'paid', 'failed', 'refunded'], defaultValue: 'pending' },
  { key: 'paymentprovider', label: 'Payment Provider', type: 'text', required: false, unique: false, sortOrder: 100 },
  { key: 'paymentreference', label: 'Payment Reference', type: 'text', required: false, unique: false, sortOrder: 110 },
  { key: 'paidat', label: 'Paid At', type: 'date', required: false, unique: false, sortOrder: 120 },
  { key: 'fulfillmentstatus', label: 'Fulfillment Status', type: 'select', required: true, unique: false, sortOrder: 130, options: ['unfulfilled', 'processing', 'fulfilled', 'cancelled'], defaultValue: 'unfulfilled' },
  { key: 'fulfillmentcarrier', label: 'Fulfillment Carrier', type: 'text', required: false, unique: false, sortOrder: 140 },
  { key: 'trackingnumber', label: 'Tracking Number', type: 'text', required: false, unique: false, sortOrder: 150 },
  { key: 'trackingurl', label: 'Tracking URL', type: 'url', required: false, unique: false, sortOrder: 160 },
  { key: 'fulfilledat', label: 'Fulfilled At', type: 'date', required: false, unique: false, sortOrder: 170 },
  { key: 'riskscore', label: 'Risk Score', type: 'number', required: false, unique: false, sortOrder: 172, defaultValue: 0 },
  { key: 'risklevel', label: 'Risk Level', type: 'select', required: false, unique: false, sortOrder: 174, options: ['low', 'medium', 'high'], defaultValue: 'low' },
  { key: 'riskreasons', label: 'Risk Reasons', type: 'richText', required: false, unique: false, sortOrder: 176 },
  { key: 'riskreviewstatus', label: 'Risk Review Status', type: 'select', required: false, unique: false, sortOrder: 178, options: ['cleared', 'pending_review', 'approved', 'held'], defaultValue: 'cleared' },
  { key: 'shippingaddress', label: 'Shipping Address', type: 'richText', required: false, unique: false, sortOrder: 180 },
  { key: 'billingaddress', label: 'Billing Address', type: 'richText', required: false, unique: false, sortOrder: 190 },
  { key: 'refundamount', label: 'Refund Amount', type: 'number', required: false, unique: false, sortOrder: 200 },
  { key: 'refundreason', label: 'Refund Reason', type: 'richText', required: false, unique: false, sortOrder: 210 },
  { key: 'notes', label: 'Internal Notes', type: 'richText', required: false, unique: false, sortOrder: 220 },
];

const CUSTOMER_FIELDS = [
  { key: 'name', label: 'Name', type: 'text', required: true, unique: false, sortOrder: 10 },
  { key: 'email', label: 'Email', type: 'email', required: true, unique: true, sortOrder: 20 },
  { key: 'phone', label: 'Phone', type: 'text', required: false, unique: false, sortOrder: 30 },
  { key: 'status', label: 'Status', type: 'select', required: false, unique: false, sortOrder: 40, options: ['lead', 'customer', 'vip', 'inactive'], defaultValue: 'customer' },
  { key: 'source', label: 'Source', type: 'text', required: false, unique: false, sortOrder: 50 },
  { key: 'lastorderid', label: 'Last Order ID', type: 'text', required: false, unique: false, sortOrder: 60 },
  { key: 'lastordernumber', label: 'Last Order Number', type: 'text', required: false, unique: false, sortOrder: 70 },
  { key: 'lastorderat', label: 'Last Order At', type: 'date', required: false, unique: false, sortOrder: 80 },
  { key: 'ordercount', label: 'Order Count', type: 'number', required: false, unique: false, sortOrder: 90 },
  { key: 'totalspent', label: 'Total Spent', type: 'number', required: false, unique: false, sortOrder: 100 },
  { key: 'notes', label: 'Notes', type: 'richText', required: false, unique: false, sortOrder: 110 },
  { key: 'sourcevalues', label: 'Source Values', type: 'json', required: false, unique: false, sortOrder: 120 },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertOrdersBulkWorkflowHandlesPartialResults = () => {
  const source = fs.readFileSync(new URL('../src/routes/orders.tsx', import.meta.url), 'utf8');
  assert(source.includes('failedResults'), 'Orders bulk workflow must collect failed per-order updates');
  assert(source.includes('updatedOrders.length === 0'), 'Orders bulk workflow must distinguish total failure from partial success');
  assert(source.includes('could not be updated'), 'Orders bulk workflow must report partial failures to admins');
  assert(!source.includes('const updatedOrders = await Promise.all(selectedOrders.map((order) => ('), 'Orders bulk workflow must not collapse all selected updates into one generic Promise.all failure');
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
  if (endpoint.startsWith('/api/admin/') && apiAdminSessionToken && !headers.has('authorization') && !headers.has('x-backy-admin-key')) {
    headers.set('authorization', `Bearer ${apiAdminSessionToken}`);
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

const commerceWebhookSignature = (body) => `sha256=${createHmac('sha256', COMMERCE_WEBHOOK_SECRET).update(body, 'utf8').digest('hex')}`;

const postCommerceWebhook = async (body, headers = {}) => {
  const rawBody = JSON.stringify(body);
  return requestApi(`/api/sites/${SITE_ID}/commerce/webhook`, {
    method: 'POST',
    headers: {
      ...headers,
      'x-backy-webhook-signature': commerceWebhookSignature(rawBody),
    },
    body: rawBody,
  });
};

const getSettings = async () => {
  const payload = await requestApi('/api/admin/settings');
  const settings = payload.data?.settings;
  assert(settings?.integrations, `Settings response did not include integrations: ${JSON.stringify(payload).slice(0, 500)}`);
  return JSON.parse(JSON.stringify(settings));
};

const patchSettingsFromSnapshot = async (settings) => {
  const payload = await requestApi('/api/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify({
      deliveryMode: settings.deliveryMode,
      auth: settings.auth,
      storage: settings.storage,
      integrations: settings.integrations,
    }),
  });
  return payload.data?.settings;
};

const enableCommerceWebhookSettings = async (settings) => {
  const next = JSON.parse(JSON.stringify(settings));
  next.integrations = {
    ...(next.integrations || {}),
    commerce: {
      ...(next.integrations?.commerce || {}),
      mode: 'checkout-provider',
      paymentProvider: 'manual',
      providerMode: 'test',
      providerWebhookUrl: 'https://hooks.example.com/backy-orders-smoke',
      providerWebhookSecretId: COMMERCE_WEBHOOK_SECRET_REFERENCE,
      providerWebhookEvents: 'checkout.session.completed,charge.refunded,payment_intent.payment_failed',
      webhookEventsEnabled: true,
      reconciliationMode: 'webhook',
    },
  };
  return patchSettingsFromSnapshot(next);
};

const issueScheduledReconciliationServiceKey = async (suffix) => {
  const configuredKey = (process.env.BACKY_ADMIN_API_KEY || process.env.BACKY_ADMIN_SECRET_KEY || '').trim();
  if (configuredKey) {
    return configuredKey;
  }

  const payload = await requestApi('/api/admin/settings', {
    method: 'POST',
    body: JSON.stringify({
      action: 'issue-admin-api-key',
      label: `Orders scheduled reconciliation ${suffix}`,
    }),
  });
  const key = payload.data?.issuedKey?.adminApiKey;
  assert(key, `Settings did not issue a scheduled reconciliation service key: ${JSON.stringify(payload).slice(0, 500)}`);
  return key;
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

const listCollections = async () => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections`);
  return payload.data?.collections || payload.collections || [];
};

const findCollection = async (slug) => {
  const collections = await listCollections();
  const listedCollection = collections.find((collection) => collection.slug === slug) || null;
  if (listedCollection) return listedCollection;

  try {
    const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections/${encodeURIComponent(slug)}`);
    return payload.data?.collection || payload.collection || null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || '');
    if (/COLLECTION_NOT_FOUND|404/.test(message)) return null;
    throw error;
  }
};

const snapshotCollection = (collection) => (
  collection
    ? JSON.parse(JSON.stringify({
        id: collection.id,
        name: collection.name,
        slug: collection.slug,
        description: collection.description,
        status: collection.status,
        fields: collection.fields || [],
        permissions: collection.permissions || {},
        routePattern: collection.routePattern || null,
        listRoutePattern: collection.listRoutePattern || null,
      }))
    : null
);

const restoreCollection = async (snapshot, currentCollection) => {
  if (snapshot) {
    await requestApi(`/api/admin/sites/${SITE_ID}/collections/${snapshot.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: snapshot.name,
        slug: snapshot.slug,
        description: snapshot.description,
        status: snapshot.status,
        fields: sanitizeCollectionFields(snapshot.fields),
        permissions: snapshot.permissions,
        routePattern: snapshot.routePattern,
        listRoutePattern: snapshot.listRoutePattern,
      }),
    });
    return;
  }

  if (currentCollection?.id) {
    await requestApi(`/api/admin/sites/${SITE_ID}/collections/${currentCollection.id}`, {
      method: 'DELETE',
    });
  }
};

const sanitizeCollectionFields = (fields = []) => fields.map((field) => {
  if (field.type === 'select' || field.type === 'tags') {
    return field;
  }

  const { options, ...rest } = field;
  return rest;
});

const createCollection = async (input) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return payload.data?.collection || payload.collection;
};

const updateCollection = async (collectionId, input) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collectionId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return payload.data?.collection || payload.collection;
};

const listCollectionRecords = async (collectionId, query = '') => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collectionId}/records${query}`);
  return payload.data?.records || payload.records || [];
};

const getCollectionRecordBySlug = async (collectionId, slug) => {
  const records = await listCollectionRecords(collectionId, `?slug=${encodeURIComponent(slug)}`);
  return records[0] || null;
};

const createCollectionRecord = async (collectionId, input) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collectionId}/records`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return payload.data?.record || payload.record;
};

const deleteCollectionRecord = async (collectionId, recordId) => {
  if (!collectionId || !recordId) return;

  await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collectionId}/records/${recordId}`, {
    method: 'DELETE',
  });
};

const updateCollectionRecord = async (collectionId, recordId, input) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collectionId}/records/${recordId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return payload.data?.record || payload.record;
};

const csvEscape = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const waitForOrderValue = async (collectionId, slug, predicate, description) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const order = await getCollectionRecordBySlug(collectionId, slug);
    if (order && predicate(order.values || {}, order)) {
      return order;
    }
    await sleep(250);
  }

  const order = await getCollectionRecordBySlug(collectionId, slug);
  const values = order?.values || {};
  throw new Error(`${description}: ${JSON.stringify({
    orderstatus: values.orderstatus,
    paymentstatus: values.paymentstatus,
    fulfillmentstatus: values.fulfillmentstatus,
    refundamount: values.refundamount,
    refundreason: values.refundreason,
    notes: values.notes,
    ordernumber: values.ordernumber,
    slug: order?.slug,
  }).slice(0, 1200)}`);
};

const ensureCustomerSmokeProfile = async (suffix) => {
  const existing = await findCollection(CUSTOMERS_COLLECTION_SLUG);
  const collection = existing?.id
    ? await updateCollection(existing.id, {
        name: existing.name || 'Customers',
        slug: CUSTOMERS_COLLECTION_SLUG,
        description: existing.description || 'Private customer profiles promoted from Backy contacts and commerce workflows.',
        status: existing.status || 'published',
        listRoutePattern: existing.listRoutePattern || '/customers',
        routePattern: existing.routePattern || '/customers/:recordSlug',
        fields: sanitizeCollectionFields(CUSTOMER_FIELDS),
        permissions: {
          ...existing.permissions,
          publicRead: false,
          publicCreate: false,
          publicUpdate: false,
          publicDelete: false,
        },
      })
    : await createCollection({
        name: 'Customers',
        slug: CUSTOMERS_COLLECTION_SLUG,
        description: 'Private customer profiles promoted from Backy contacts and commerce workflows.',
        status: 'published',
        listRoutePattern: '/customers',
        routePattern: '/customers/:recordSlug',
        fields: CUSTOMER_FIELDS,
        permissions: {
          publicRead: false,
          publicCreate: false,
          publicUpdate: false,
          publicDelete: false,
        },
      });

  const slug = `orders-smoke-customer-${suffix}`;
  const record = await createCollectionRecord(collection.id, {
    slug,
    status: 'published',
    values: {
      name: 'Order Smoke Buyer',
      email: 'orders-smoke@example.com',
      phone: '+1 555 0202',
      status: 'customer',
      source: 'orders-smoke',
      ordercount: 0,
      totalspent: 0,
      notes: 'Created by orders smoke.',
      sourcevalues: { smoke: true, suffix },
    },
  });

  return { collection, record };
};

const ensureOrdersSmokeCollection = async () => {
  const existing = await findCollection(ORDERS_COLLECTION_SLUG);
  if (existing?.id) {
    return updateCollection(existing.id, {
      name: existing.name || 'Orders',
      slug: ORDERS_COLLECTION_SLUG,
      description: existing.description || 'Commerce orders for storefronts, custom checkout flows, and fulfillment dashboards.',
      status: 'published',
      listRoutePattern: existing.listRoutePattern || '/orders',
      routePattern: existing.routePattern || '/orders/:recordSlug',
      fields: sanitizeCollectionFields(ORDER_FIELDS),
      permissions: {
        ...existing.permissions,
        publicRead: false,
        publicCreate: false,
        publicUpdate: false,
        publicDelete: false,
      },
    });
  }

  return createCollection({
    name: 'Orders',
    slug: ORDERS_COLLECTION_SLUG,
    description: 'Commerce orders for storefronts, custom checkout flows, and fulfillment dashboards.',
    status: 'published',
    listRoutePattern: '/orders',
    routePattern: '/orders/:recordSlug',
    fields: ORDER_FIELDS,
    permissions: {
      publicRead: false,
      publicCreate: false,
      publicUpdate: false,
      publicDelete: false,
    },
  });
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

const navigateToOrders = async (client) => {
  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}/orders?siteId=${encodeURIComponent(SITE_ID)}` });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="orders-command-center"]')) &&
        document.body?.innerText?.includes('Order command center'),
      command: Boolean(document.querySelector('[data-testid="orders-command-center"]')),
      text: document.body?.innerText?.slice(0, 600) || '',
    }))()`);

    if (state.ready) {
      return state;
    }

    if (attempt === 119) {
      throw new Error(`Orders page did not render expected controls: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const clickByText = async (client, text, options = {}) => {
  const result = await evaluate(client, `(() => {
    const text = ${JSON.stringify(text)};
    const exact = ${JSON.stringify(Boolean(options.exact))};
    const rootSelector = ${JSON.stringify(options.rootSelector || '')};
    const root = rootSelector ? document.querySelector(rootSelector) : document;
    const candidates = Array.from((root || document).querySelectorAll('button, a'));
    const target = candidates.find((candidate) => {
      const label = (candidate.textContent || '').replace(/\\s+/g, ' ').trim();
      return exact ? label === text : label.includes(text);
    });
    if (!(target instanceof HTMLElement) || target.getAttribute('aria-disabled') === 'true' || target.disabled) {
      return { ok: false, text, disabled: target instanceof HTMLButtonElement ? target.disabled : false };
    }
    target.click();
    return { ok: true, text: target.textContent || '', tag: target.tagName };
  })()`);
  assert(result.ok, `Unable to click control with text ${text}: ${JSON.stringify(result)}`);
  await sleep(250);
  return result;
};

const clickIfPresent = async (client, text) => {
  const result = await evaluate(client, `(() => {
    const text = ${JSON.stringify(text)};
    const candidates = Array.from(document.querySelectorAll('button, a'));
    const target = candidates.find((candidate) => (candidate.textContent || '').replace(/\\s+/g, ' ').trim().includes(text));
    if (!(target instanceof HTMLElement) || target.getAttribute('aria-disabled') === 'true' || target.disabled) {
      return { ok: false, text, disabled: target instanceof HTMLButtonElement ? target.disabled : false };
    }
    target.click();
    return { ok: true, text: target.textContent || '' };
  })()`);

  if (result.ok) {
    await sleep(500);
  }

  return result.ok;
};

const waitUntilIdle = async (client, pageName) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      hasBusyButton: Array.from(document.querySelectorAll('button')).some((button) => /Saving|Setting up|Loading|Syncing/.test(button.textContent || '')),
      unable: document.body?.innerText?.includes('Unable to') || false,
      body: document.body?.innerText?.slice(0, 500) || '',
    }))()`);

    if (!state.hasBusyButton) {
      return state;
    }

    if (attempt === 99) {
      throw new Error(`${pageName} did not become idle: ${JSON.stringify(state)}`);
    }

    await sleep(200);
  }

  return null;
};

const ensureOrdersReady = async (client) => {
  await navigateToOrders(client);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const collection = await findCollection(ORDERS_COLLECTION_SLUG);
    const state = {
      ready: Boolean(
        collection?.id &&
        collection.status === 'published' &&
        !collection.permissions?.publicRead &&
        !collection.permissions?.publicCreate &&
        (collection.fields?.length || 0) >= ORDER_REQUIRED_FIELD_COUNT
      ),
      collectionId: collection?.id,
      fieldCount: collection?.fields?.length || 0,
      permissions: collection?.permissions,
    };

    if (state.ready) {
      return state;
    }

    const clickedSetup = await clickIfPresent(client, 'Set up orders');
    if (clickedSetup) {
      await waitUntilIdle(client, '/orders');
    }

    const clickedSync = await clickIfPresent(client, 'Sync Schema');
    if (clickedSync) {
      await waitUntilIdle(client, '/orders');
    }

    if (attempt === 79) {
      throw new Error(`/orders collection did not become ready: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const setLabeledControl = async (client, labelText, value, options = {}) => {
  const result = await evaluate(client, `(() => {
    const labelText = ${JSON.stringify(labelText)};
    const value = ${JSON.stringify(value)};
    const exact = ${JSON.stringify(Boolean(options.exact))};
    const rootSelector = ${JSON.stringify(options.rootSelector || '#orders-editor')};
    const root = document.querySelector(rootSelector) || document;
    const labels = Array.from(root.querySelectorAll('label'));
    const normalized = (text) => (text || '').replace(/\\s+/g, ' ').trim();
    const labelTextFor = (candidate) => normalized(candidate.querySelector('span')?.textContent || candidate.textContent);
    const label = labels.find((candidate) => {
      const text = labelTextFor(candidate);
      return exact ? text === labelText : text.includes(labelText);
    });
    if (!(label instanceof HTMLLabelElement)) {
      return {
        ok: false,
        reason: 'label-not-found',
        labelText,
        labels: labels.map((candidate) => labelTextFor(candidate)).slice(0, 80),
        rootText: normalized(root.textContent).slice(0, 800),
      };
    }
    const control = label.querySelector('input, select, textarea') || (
      label.htmlFor ? document.getElementById(label.htmlFor) : null
    );
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) {
      return { ok: false, reason: 'control-not-found', labelText, text: normalized(label.textContent) };
    }
    if (control.disabled) {
      return { ok: false, reason: 'control-disabled', labelText };
    }
    const prototype = control instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : control instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(control, String(value));
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, labelText, value: control.value, tag: control.tagName };
  })()`);
  assert(result.ok, `Unable to set ${labelText}: ${JSON.stringify(result)}`);
  await sleep(75);
  return result;
};

const setNthEditorSelect = async (client, index, value, label) => {
  const result = await evaluate(client, `(() => {
    const selects = Array.from(document.querySelectorAll('#orders-editor select'));
    const control = selects[${JSON.stringify(index)}];
    const value = ${JSON.stringify(value)};
    if (!(control instanceof HTMLSelectElement)) {
      return { ok: false, reason: 'select-not-found', label: ${JSON.stringify(label)}, count: selects.length };
    }
    if (control.disabled) {
      return { ok: false, reason: 'control-disabled', label: ${JSON.stringify(label)} };
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    setter?.call(control, String(value));
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, label: ${JSON.stringify(label)}, value: control.value, index: ${JSON.stringify(index)} };
  })()`);
  assert(result.ok, `Unable to set ${label}: ${JSON.stringify(result)}`);
  await sleep(75);
  return result;
};

const setAriaControl = async (client, ariaLabel, value) => {
  const result = await evaluate(client, `(() => {
    const control = document.querySelector('[aria-label="' + CSS.escape(${JSON.stringify(ariaLabel)}) + '"]');
    const value = ${JSON.stringify(value)};
    if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)) {
      return { ok: false, reason: 'control-not-found', ariaLabel: ${JSON.stringify(ariaLabel)} };
    }
    if (control.disabled) {
      return { ok: false, reason: 'control-disabled', ariaLabel: ${JSON.stringify(ariaLabel)} };
    }
    const prototype = control instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : control instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(control, String(value));
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: control.value };
  })()`);
  assert(result.ok, `Unable to set aria control ${ariaLabel}: ${JSON.stringify(result)}`);
  await sleep(75);
  return result;
};

const assertOrdersLayout = async (client) => {
  let layout = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    layout = await evaluate(client, `(() => ({
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      command: Boolean(document.querySelector('[data-testid="orders-command-center"]')),
      api: Boolean(document.querySelector('#orders-api')),
      metrics: Boolean(document.querySelector('#orders-metrics')),
      analytics: Boolean(document.querySelector('[data-testid="orders-analytics-panel"]')),
      notificationDelivery: Boolean(document.querySelector('[data-testid="orders-notification-delivery"]')),
      queue: Boolean(document.querySelector('#orders-queue')),
      editor: Boolean(document.querySelector('#orders-editor')),
      riskControls: Boolean(document.querySelector('[data-testid="orders-risk-controls"]')),
      hasCustomerProfileManager: Boolean(document.querySelector('[data-testid="orders-customer-profile-manager"]')),
      checkout: document.body?.innerText?.includes('/commerce/orders') || false,
      privateContract: document.body?.innerText?.includes('Private order backend contract') || false,
      analyticsEndpoint: document.body?.innerText?.includes('/commerce/orders/analytics') || false,
      deliveryEndpoint: document.body?.innerText?.includes('/events?kind=commerce-order') || false,
      hasImportControls: document.body?.innerText?.includes('Import CSV') && document.body?.innerText?.includes('CSV template'),
      hasBulkControls: Boolean(document.querySelector('[aria-label="Select all visible orders"]')) &&
        Array.from(document.querySelectorAll('#orders-queue button')).some((button) => (button.textContent || '').replace(/\\s+/g, ' ').trim() === 'Processing'),
      adminApiOpensWithButton: (() => {
        const controls = Array.from(document.querySelectorAll('#orders-api button, #orders-api a'));
        const control = controls.find((candidate) => (candidate.textContent || '').replace(/\\s+/g, ' ').trim() === 'Open admin API');
        return control instanceof HTMLButtonElement;
      })(),
      body: (document.body?.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 1000),
    }))()`);
    assert(layout.scrollWidth <= layout.width + 8, `Orders page has horizontal overflow: ${JSON.stringify(layout)}`);
    if (layout.command && layout.api && layout.metrics && layout.analytics && layout.notificationDelivery && layout.queue && layout.editor && layout.riskControls && layout.hasCustomerProfileManager && layout.checkout && layout.privateContract && layout.analyticsEndpoint && layout.deliveryEndpoint && layout.hasImportControls && layout.hasBulkControls && layout.adminApiOpensWithButton) {
      return layout;
    }
    await sleep(250);
  }
  assert(false, `Orders page missing expected regions: ${JSON.stringify(layout)}`);
};

const assertOrderCsvImport = async ({ collectionId, suffix }) => {
  const orderNumber = `ORD-IMPORT-${suffix.toUpperCase()}`;
  const slug = orderNumber.toLowerCase();
  const lineItems = [{
    id: 'csv-order-item',
    productId: '',
    slug: 'imported-order-product',
    title: `Imported Order Product ${suffix}`,
    sku: `IMP-${suffix.toUpperCase()}`,
    variant: {
      title: 'CSV',
      option: 'CSV',
      sku: `IMP-${suffix.toUpperCase()}-CSV`,
    },
    quantity: 3,
    price: 20,
    currency: 'USD',
    lineTotal: 60,
  }];
  const headers = [
    'slug',
    'status',
    'ordernumber',
    'customername',
    'email',
    'phone',
    'total',
    'subtotal',
    'taxamount',
    'shippingamount',
    'discountamount',
    'currency',
    'items',
    'ordersource',
    'checkoutsessionid',
    'customerid',
    'orderstatus',
    'paymentstatus',
    'paymentprovider',
    'paymentreference',
    'paidat',
    'fulfillmentstatus',
    'fulfillmentcarrier',
    'trackingnumber',
    'trackingurl',
    'fulfilledat',
    'riskscore',
    'risklevel',
    'riskreasons',
    'riskreviewstatus',
    'shippingaddress',
    'billingaddress',
    'refundamount',
    'refundreason',
    'notes',
  ];
  const row = [
    slug,
    'published',
    orderNumber,
    'Imported Order Buyer',
    'imported-order@example.com',
    '+1 555 0303',
    '65',
    '60',
    '4',
    '6',
    '5',
    'USD',
    JSON.stringify(lineItems),
    'import',
    `cs_import_${suffix}`,
    `cus_import_${suffix}`,
    'paid',
    'paid',
    'manual',
    `pi_import_${suffix}`,
    '2026-05-10T10:00:00.000Z',
    'processing',
    'UPS',
    `1ZIMPORT${suffix.toUpperCase()}`,
    `https://carrier.example/import/${suffix}`,
    '',
    '12',
    'low',
    'CSV import baseline risk.',
    'cleared',
    'Imported shipping address',
    'Imported billing address',
    '0',
    '',
    'Imported order through CSV smoke.',
  ];
  const csv = `${headers.join(',')}\n${row.map(csvEscape).join(',')}\n`;
  const result = await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collectionId}/records/import?upsert=true`, {
    method: 'POST',
    headers: { 'content-type': 'text/csv; charset=utf-8' },
    body: csv,
  });
  const summary = result.data?.import;
  assert(summary?.created === 1 || summary?.updated === 1, `Order CSV import did not save a record: ${JSON.stringify(summary)}`);
  assert(summary.skipped === 0, `Order CSV import skipped rows: ${JSON.stringify(summary)}`);

  const record = await getCollectionRecordBySlug(collectionId, slug);
  assert(record?.id, `Imported order was not found by slug ${slug}`);
  assert(record.values?.ordernumber === orderNumber, `Imported order number did not persist: ${JSON.stringify(record.values)}`);
  assert(record.values?.total === 65, `Imported total did not stay numeric: ${JSON.stringify(record.values?.total)}`);
  assert(record.values?.taxamount === 4, `Imported tax did not stay numeric: ${JSON.stringify(record.values?.taxamount)}`);
  assert(record.values?.shippingamount === 6, `Imported shipping did not stay numeric: ${JSON.stringify(record.values?.shippingamount)}`);
  assert(record.values?.discountamount === 5, `Imported discount did not stay numeric: ${JSON.stringify(record.values?.discountamount)}`);
  assert(record.values?.ordersource === 'import', `Imported source was unexpected: ${JSON.stringify(record.values?.ordersource)}`);
  assert(record.values?.paymentstatus === 'paid', `Imported payment status was unexpected: ${JSON.stringify(record.values?.paymentstatus)}`);
  assert(record.values?.fulfillmentstatus === 'processing', `Imported fulfillment status was unexpected: ${JSON.stringify(record.values?.fulfillmentstatus)}`);
  assert(record.values?.riskscore === 12 && record.values?.risklevel === 'low' && record.values?.riskreviewstatus === 'cleared', `Imported risk fields were unexpected: ${JSON.stringify(record.values)}`);
  assert(JSON.parse(record.values?.items || '[]')?.[0]?.quantity === 3, `Imported items JSON was unexpected: ${JSON.stringify(record.values?.items)}`);

  return record;
};

const fillOrderEditor = async (client, suffix, customerRecord) => {
  const orderNumber = `ORD-SMOKE-${suffix.toUpperCase()}`;
  const slug = orderNumber.toLowerCase();
  const customerValues = customerRecord?.values || {};

  await clickByText(client, 'New order', { exact: true });
  await setLabeledControl(client, 'Order number', orderNumber, { exact: true });
  await setLabeledControl(client, 'Customer', String(customerValues.name || 'Order Smoke Buyer'), { exact: true });
  await setLabeledControl(client, 'Email', String(customerValues.email || 'orders-smoke@example.com'), { exact: true });
  await setLabeledControl(client, 'Phone', String(customerValues.phone || '+1 555 0202'), { exact: true });
  await setLabeledControl(client, 'Total', '85', { exact: true });
  await setLabeledControl(client, 'Currency', 'USD', { exact: true });
  await setLabeledControl(client, 'Subtotal', '80', { exact: true });
  await setLabeledControl(client, 'Tax', '5', { exact: true });
  await setLabeledControl(client, 'Shipping', '7', { exact: true });
  await setLabeledControl(client, 'Discount', '7', { exact: true });
  await setNthEditorSelect(client, 1, 'manual', 'Source');
  await setLabeledControl(client, 'Checkout session', `cs_orders_${suffix}`, { exact: true });
  await setLabeledControl(client, 'Customer ID', customerRecord?.id || `cus_orders_${suffix}`, { exact: true });
  await setLabeledControl(client, 'Provider', 'manual', { exact: true });
  await setLabeledControl(client, 'Payment ref', `pi_orders_${suffix}`, { exact: true });
  await setLabeledControl(client, 'Order', 'open', { exact: true });
  await setLabeledControl(client, 'Payment', 'pending', { exact: true });
  await setLabeledControl(client, 'Fulfillment', 'unfulfilled', { exact: true });
  await setLabeledControl(client, 'Carrier', 'UPS', { exact: true });
  await setLabeledControl(client, 'Tracking number', `1Z${suffix.toUpperCase()}`, { exact: true });
  await setLabeledControl(client, 'Tracking URL', `https://carrier.example/track/${suffix}`, { exact: true });

  await setAriaControl(client, 'Line item title', `Orders Smoke Product ${suffix}`);
  await setAriaControl(client, 'Line item variant', 'Standard');
  await setAriaControl(client, 'Line item quantity', '2');
  await setAriaControl(client, 'Line item price', '40');
  await setAriaControl(client, 'Line item SKU', `ORDER-SMOKE-${suffix.toUpperCase()}`);
  await clickByText(client, 'Add', { exact: true, rootSelector: '#orders-editor' });

  await setLabeledControl(client, 'Shipping address', '100 Commerce Smoke Street, New York, NY', { exact: true });
  await setLabeledControl(client, 'Billing address', '100 Commerce Smoke Street, New York, NY', { exact: true });
  await setLabeledControl(client, 'Notes', 'Order smoke initial private note.', { exact: true });
  await setLabeledControl(client, 'Refund amount', '0', { exact: true });
  await setLabeledControl(client, 'Refund reason', '', { exact: true });

  await clickByText(client, 'Create Order', { exact: true });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      recorded: document.body?.innerText?.includes('Order recorded.') || false,
      visible: document.body?.innerText?.includes(${JSON.stringify(orderNumber)}) || false,
      body: document.body?.innerText?.slice(0, 800) || '',
    }))()`);
    if (state.recorded && state.visible) {
      return { orderNumber, slug };
    }
    if (attempt === 79) {
      throw new Error(`Order was not created from UI: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return { orderNumber, slug };
};

const assertOrderCustomerProfileManagement = async (client, customersCollection, customerRecord) => {
  assert(customersCollection?.id, 'Customers collection is required for order profile management smoke coverage');
  assert(customerRecord?.id, 'Customer record is required for order profile management smoke coverage');

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const manager = document.querySelector('[data-testid="orders-customer-profile-manager"]');
      const selector = document.querySelector('[aria-label="Order customer profile"]');
      return {
        hasManager: Boolean(manager),
        hasSelector: selector instanceof HTMLSelectElement,
        hasCustomerOption: selector instanceof HTMLSelectElement
          ? Array.from(selector.options).some((option) => option.value === ${JSON.stringify(customerRecord.id)})
          : false,
        hasSave: Boolean(document.querySelector('[data-testid="orders-customer-profile-save"]')),
        body: document.body?.innerText?.slice(0, 1000) || '',
      };
    })()`);
    if (state.hasManager && state.hasSelector && state.hasCustomerOption && state.hasSave) {
      break;
    }
    if (attempt === 99) {
      throw new Error(`Order customer profile manager did not load linked customer: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  await setAriaControl(client, 'Order customer profile', customerRecord.id);
  await setLabeledControl(client, 'Profile name', 'Order Smoke VIP Buyer', { exact: true });
  await setLabeledControl(client, 'Profile phone', '+1 555 0299', { exact: true });
  await setLabeledControl(client, 'Profile status', 'vip', { exact: true });
  await setLabeledControl(client, 'Profile notes', 'Managed from orders smoke profile panel.', { exact: true });
  await clickByText(client, 'Save profile', { exact: true, rootSelector: '#orders-editor' });
  await waitUntilIdle(client, '/orders customer profile');

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const updated = await getCollectionRecordBySlug(customersCollection.id, customerRecord.slug);
    if (
      updated?.values?.name === 'Order Smoke VIP Buyer' &&
      updated.values?.status === 'vip' &&
      updated.values?.phone === '+1 555 0299' &&
      String(updated.values?.notes || '').includes('orders smoke profile panel')
    ) {
      return updated;
    }
    await sleep(250);
  }

  const current = await getCollectionRecordBySlug(customersCollection.id, customerRecord.slug);
  throw new Error(`Order customer profile management did not persist changes: ${JSON.stringify(current?.values)}`);
};

const assertOrderVisible = async (client, orderNumber, message) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      visible: document.body?.innerText?.includes(${JSON.stringify(orderNumber)}) || false,
      body: document.body?.innerText?.slice(0, 800) || '',
    }))()`);
    if (state.visible) {
      return state;
    }
    if (attempt === 39) {
      throw new Error(`${message}: ${JSON.stringify(state)}`);
    }
    await sleep(200);
  }

  return null;
};

const exerciseFilters = async (client, orderNumber) => {
  await setAriaControl(client, 'Search orders', orderNumber);
  await assertOrderVisible(client, orderNumber, 'Search filter hid the smoke order');

  await setAriaControl(client, 'Payment status filter', 'pending');
  await assertOrderVisible(client, orderNumber, 'Payment filter hid the smoke order');

  await setAriaControl(client, 'Fulfillment status filter', 'unfulfilled');
  await assertOrderVisible(client, orderNumber, 'Fulfillment filter hid the smoke order');

  await setAriaControl(client, 'Order source filter', 'manual');
  await assertOrderVisible(client, orderNumber, 'Source filter hid the smoke order');

  await clickByText(client, 'Clear filters', { exact: true });
  await assertOrderVisible(client, orderNumber, 'Smoke order disappeared after clearing filters');
};

const clickOrderCardButton = async (client, orderNumber, buttonText) => {
  let result = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    result = await evaluate(client, `(() => {
      const orderNumber = ${JSON.stringify(orderNumber)};
      const buttonText = ${JSON.stringify(buttonText)};
      const cards = Array.from(document.querySelectorAll('article'));
      const card = cards.find((candidate) => (candidate.textContent || '').includes(orderNumber));
      const button = Array.from((card || document).querySelectorAll('button')).find((candidate) => (
        (candidate.textContent || '').replace(/\\s+/g, ' ').trim() === buttonText
      ));
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return {
          ok: false,
          hasCard: Boolean(card),
          buttonText,
          disabled: button instanceof HTMLButtonElement ? button.disabled : null,
          cardText: (card?.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 600),
        };
      }
      button.click();
      return { ok: true };
    })()`);
    if (result.ok) break;
    await sleep(250);
  }
  assert(result?.ok, `Unable to click ${buttonText} for ${orderNumber}: ${JSON.stringify(result)}`);
  await sleep(350);
  return result;
};

const selectOrderForBulk = async (client, orderNumber) => {
  const result = await evaluate(client, `(() => {
    const checkbox = document.querySelector('[aria-label="' + CSS.escape(${JSON.stringify(`Select order ${orderNumber}`)}) + '"]');
    if (!(checkbox instanceof HTMLInputElement) || checkbox.type !== 'checkbox' || checkbox.disabled) {
      return { ok: false, reason: 'checkbox-not-ready', disabled: checkbox instanceof HTMLInputElement ? checkbox.disabled : null };
    }
    if (!checkbox.checked) {
      checkbox.click();
    }
    return { ok: true, checked: checkbox.checked };
  })()`);
  assert(result.ok && result.checked, `Unable to select order for bulk action: ${JSON.stringify(result)}`);
  await sleep(200);
  return result;
};

const editOrderAfterWorkflow = async (client, orderNumber) => {
  await clickOrderCardButton(client, orderNumber, 'Edit');
  await setLabeledControl(client, 'Refund amount', '5', { exact: true });
  await setLabeledControl(client, 'Refund reason', 'Smoke refund adjustment', { exact: true });
  await setLabeledControl(client, 'Notes', 'Order smoke edited private note after fulfillment.', { exact: true });
  await setLabeledControl(client, 'Payment', 'refunded', { exact: true });
  await clickByText(client, 'Save Order', { exact: true });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      updated: document.body?.innerText?.includes('Order updated.') || false,
      refundVisible: document.body?.innerText?.includes('Refund $5.00') || false,
      body: document.body?.innerText?.slice(0, 1000) || '',
    }))()`);
    if (state.updated || state.refundVisible) {
      return state;
    }
    if (attempt === 79) {
      throw new Error(`Order edit did not save: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const clickReconcileProvider = async (client) => {
  const result = await evaluate(client, `(() => {
    const button = document.querySelector('[data-testid="orders-reconcile-provider"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { ok: false, disabled: button instanceof HTMLButtonElement ? button.disabled : null, text: button?.textContent || '' };
    }
    button.click();
    return { ok: true, text: button.textContent || '' };
  })()`);
  assert(result.ok, `Unable to click provider reconciliation control: ${JSON.stringify(result)}`);
  await sleep(500);
};

const waitForReconciliationPanel = async (client) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="orders-reconciliation-result"]');
      return {
        ready: Boolean(panel),
        text: panel?.textContent || '',
      };
    })()`);
    if (state.ready && /orders updated/.test(state.text)) {
      return state;
    }
    await sleep(250);
  }

  throw new Error('Provider reconciliation result panel did not render');
};

const deleteOrderThroughUi = async (client, orderNumber) => {
  await clickOrderCardButton(client, orderNumber, 'Delete');
  await clickByText(client, 'Delete order', { exact: true });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      deleted: document.body?.innerText?.includes('Order deleted.') || false,
      stillVisible: document.body?.innerText?.includes(${JSON.stringify(orderNumber)}) || false,
      body: document.body?.innerText?.slice(0, 800) || '',
    }))()`);
    if (state.deleted && !state.stillVisible) {
      return state;
    }
    if (attempt === 79) {
      throw new Error(`Order delete did not settle: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-orders-${Date.now()}`);
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

const cleanup = async ({
  client,
  childProcess,
  userDataDir,
  collectionId,
  orderRecordId,
  importedOrderRecordId,
  customerCollectionId,
  customerRecordId,
  originalOrdersCollection,
  originalCustomerCollection,
  originalSettings,
}) => {
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

  if (collectionId && orderRecordId) {
    try {
      await deleteCollectionRecord(collectionId, orderRecordId);
    } catch {
      // The smoke deletes through UI first; this is only a fallback.
    }
  }

  if (collectionId && importedOrderRecordId) {
    try {
      await deleteCollectionRecord(collectionId, importedOrderRecordId);
    } catch {
      // The smoke deletes imported records after assertion; this is only a fallback.
    }
  }

  if (customerCollectionId && customerRecordId) {
    try {
      await deleteCollectionRecord(customerCollectionId, customerRecordId);
    } catch {
      // Customer collection restore below is the authoritative cleanup path.
    }
  }

  try {
    const current = await findCollection(ORDERS_COLLECTION_SLUG);
    await restoreCollection(originalOrdersCollection, current);
  } catch {
    // Schema restore is best-effort because the smoke snapshots before mutation.
  }

  try {
    const current = await findCollection(CUSTOMERS_COLLECTION_SLUG);
    await restoreCollection(originalCustomerCollection, current);
  } catch {
    // Schema restore is best-effort because the smoke snapshots before mutation.
  }

  if (originalSettings) {
    try {
      await patchSettingsFromSnapshot(originalSettings);
    } catch {
      // Settings restore is best-effort; later smokes should snapshot their own requirements.
    }
  }
};

const main = async () => {
  let client;
  let childProcess;
  let userDataDir;
  let collectionId;
  let orderRecordId;
  let importedOrderRecordId;
  let customerCollectionId;
  let customerRecordId;
  let customerFixture;
  assertOrdersBulkWorkflowHandlesPartialResults();
  await loginAdminApi();
  const originalSettings = await getSettings();
  const originalOrdersCollection = snapshotCollection(await findCollection(ORDERS_COLLECTION_SLUG));
  const originalCustomerCollection = snapshotCollection(await findCollection(CUSTOMERS_COLLECTION_SLUG));
  const suffix = Date.now().toString(36);

  try {
    await enableCommerceWebhookSettings(originalSettings);
    const scheduledExecutionAdminKey = await issueScheduledReconciliationServiceKey(suffix);
    await ensureOrdersSmokeCollection();
    customerFixture = await ensureCustomerSmokeProfile(suffix);
    customerCollectionId = customerFixture.collection.id;
    customerRecordId = customerFixture.record.id;

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

    const readyState = await ensureOrdersReady(client);
    const ordersCollection = await findCollection(ORDERS_COLLECTION_SLUG);
    collectionId = ordersCollection?.id;
    assert(collectionId, 'Orders collection was not available after setup');

    const importedOrder = await assertOrderCsvImport({ collectionId, suffix });
    importedOrderRecordId = importedOrder.id;
    await deleteCollectionRecord(collectionId, importedOrderRecordId);
    importedOrderRecordId = null;

    await assertOrdersLayout(client);
    const { orderNumber, slug } = await fillOrderEditor(client, suffix, customerFixture.record);
    const createdOrder = await waitForOrderValue(
      collectionId,
      slug,
      (values) => (
        values.ordernumber === orderNumber &&
        values.paymentstatus === 'pending' &&
        values.fulfillmentstatus === 'unfulfilled' &&
        values.customerid === customerFixture.record.id &&
        Number(values.riskscore) === 0 &&
        values.risklevel === 'low' &&
        values.riskreviewstatus === 'cleared'
      ),
      'Created order did not persist expected initial values',
    );
    orderRecordId = createdOrder.id;

    const initialAnalyticsPayload = await requestApi(`/api/admin/sites/${SITE_ID}/commerce/orders/analytics`);
    const initialAnalytics = initialAnalyticsPayload.data?.analytics;
    assert(initialAnalytics?.schemaVersion === 'backy.order-analytics.v1', `Order analytics returned wrong schema: ${JSON.stringify(initialAnalyticsPayload).slice(0, 500)}`);
    assert(initialAnalytics.orderCount >= 1, `Order analytics did not count the created order: ${JSON.stringify(initialAnalytics).slice(0, 500)}`);
    assert(initialAnalytics.payment?.pending?.count >= 1, `Order analytics did not report pending payment state: ${JSON.stringify(initialAnalytics).slice(0, 500)}`);
    assert(initialAnalytics.operations?.manualOrderCount >= 1, `Order analytics did not report manual orders: ${JSON.stringify(initialAnalytics).slice(0, 500)}`);

    await assertOrderCustomerProfileManagement(client, customerFixture.collection, customerFixture.record);

    await exerciseFilters(client, orderNumber);

    await selectOrderForBulk(client, orderNumber);
    await clickByText(client, 'Mark Paid', { exact: true, rootSelector: '#orders-queue' });
    await waitForOrderValue(
      collectionId,
      slug,
      (values) => (
        values.orderstatus === 'paid' &&
        values.paymentstatus === 'paid' &&
        Boolean(values.paidat) &&
        (values.refundamount === null || values.refundamount === undefined) &&
        (values.refundreason === '' || values.refundreason === undefined)
      ),
      'Bulk Mark Paid did not persist coherent payment workflow fields',
    );

    await clickByText(client, 'Processing', { exact: true, rootSelector: '#orders-queue' });
    await waitForOrderValue(
      collectionId,
      slug,
      (values) => values.orderstatus === 'paid' && values.paymentstatus === 'paid' && values.fulfillmentstatus === 'processing',
      'Bulk processing action did not persist coherent fulfillment workflow fields',
    );

    await clickOrderCardButton(client, orderNumber, 'Fulfill');
    await waitForOrderValue(
      collectionId,
      slug,
      (values) => (
        values.orderstatus === 'fulfilled' &&
        values.paymentstatus === 'paid' &&
        values.fulfillmentstatus === 'fulfilled' &&
        Boolean(values.paidat) &&
        Boolean(values.fulfilledat) &&
        (values.refundamount === null || values.refundamount === undefined) &&
        (values.refundreason === '' || values.refundreason === undefined)
      ),
      'Fulfill did not persist fulfillment workflow fields',
    );

    await clickOrderCardButton(client, orderNumber, 'Record Refund/Return');
    await waitForOrderValue(
      collectionId,
      slug,
      (values) => (
        values.orderstatus === 'refunded' &&
        values.paymentstatus === 'refunded' &&
        values.fulfillmentstatus === 'cancelled' &&
        Number(values.refundamount) === 85 &&
        values.refundreason === 'Customer return/refund manually recorded from Backy order workflow.' &&
        /Manual refund\/return state recorded in Backy/.test(String(values.notes || '')) &&
        /Provider refund, if required, must be completed in the payment provider/.test(String(values.notes || ''))
      ),
      'Refund/Return did not persist refund workflow fields',
    );

    await editOrderAfterWorkflow(client, orderNumber);
    await waitForOrderValue(
      collectionId,
      slug,
      (values) => values.paymentstatus === 'refunded' && Number(values.refundamount) === 5 && values.refundreason === 'Smoke refund adjustment' && /edited private note/.test(String(values.notes || '')),
      'Order edit did not persist refund and note fields',
    );

    await updateCollectionRecord(collectionId, orderRecordId, {
      status: 'published',
      values: {
        ...(await getCollectionRecordBySlug(collectionId, slug)).values,
        orderstatus: 'paid',
        paymentstatus: 'paid',
        fulfillmentstatus: 'processing',
        refundamount: null,
        refundreason: '',
        notes: 'Order smoke reset to paid before cancellation.',
      },
    });
    await clickByText(client, 'Refresh', { exact: true });
    await waitUntilIdle(client, '/orders cancellation refresh');
    await assertOrderVisible(client, orderNumber, 'Smoke order disappeared before cancellation test');
    await clickOrderCardButton(client, orderNumber, 'Record Cancel');
    await waitForOrderValue(
      collectionId,
      slug,
      (values) => (
        values.orderstatus === 'cancelled' &&
        values.paymentstatus === 'refunded' &&
        values.fulfillmentstatus === 'cancelled' &&
        Number(values.refundamount) === 85 &&
        values.refundreason === 'Order cancellation manually recorded from Backy order workflow.' &&
        /Manual cancellation state recorded in Backy/.test(String(values.notes || '')) &&
        /Provider cancellation\/refund, if required, must be completed in the payment provider/.test(String(values.notes || ''))
      ),
      'Cancel did not persist coherent payment and fulfillment workflow fields',
    );

    await updateCollectionRecord(collectionId, orderRecordId, {
      status: 'published',
      values: {
        ...(await getCollectionRecordBySlug(collectionId, slug)).values,
        orderstatus: 'open',
        paymentstatus: 'pending',
        paidat: '',
        fulfillmentstatus: 'unfulfilled',
        fulfilledat: '',
        refundamount: 12,
        refundreason: 'Stale refund metadata should be cleared.',
        notes: 'Order smoke reset to pending before unpaid cancellation.',
      },
    });
    await clickByText(client, 'Refresh', { exact: true });
    await waitUntilIdle(client, '/orders unpaid cancellation refresh');
    await assertOrderVisible(client, orderNumber, 'Smoke order disappeared before unpaid cancellation test');
    await clickOrderCardButton(client, orderNumber, 'Record Cancel');
    await waitForOrderValue(
      collectionId,
      slug,
      (values) => (
        values.orderstatus === 'cancelled' &&
        values.paymentstatus === 'failed' &&
        values.fulfillmentstatus === 'cancelled' &&
        (values.refundamount === null || values.refundamount === undefined || Number(values.refundamount) === 0) &&
        (values.refundreason === '' || values.refundreason === null || values.refundreason === undefined) &&
        /marked failed before fulfillment/.test(String(values.notes || ''))
      ),
      'Unpaid cancel did not clear stale refund fields and mark payment failed',
    );

    const staleOrder = await updateCollectionRecord(collectionId, orderRecordId, {
      status: 'published',
      values: {
        ...(await getCollectionRecordBySlug(collectionId, slug)).values,
        orderstatus: 'open',
        paymentstatus: 'pending',
        paymentreference: `pi_reconcile_${suffix}`,
        paidat: '',
        notes: 'Order smoke reset to pending before reconciliation.',
      },
    });
    await postCommerceWebhook(
      {
        id: `evt_orders_reconcile_${suffix}`,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: staleOrder.values.checkoutsessionid,
            payment_intent: `pi_reconcile_${suffix}`,
            metadata: {
              orderNumber,
              orderSlug: slug,
            },
          },
        },
      },
      { 'x-request-id': `orders-reconcile-event-${suffix}` },
    );
    await updateCollectionRecord(collectionId, orderRecordId, {
      status: 'published',
      values: {
        ...(await getCollectionRecordBySlug(collectionId, slug)).values,
        orderstatus: 'open',
        paymentstatus: 'pending',
        paidat: '',
        notes: 'Order smoke reset after provider webhook to verify admin reconciliation.',
      },
    });
    const scheduledDryRunPayload = await requestApi(`/api/admin/sites/${SITE_ID}/commerce/reconcile?limit=50`, {
      method: 'POST',
      body: JSON.stringify({
        runMode: 'scheduled',
        dryRun: true,
        actor: 'orders-smoke-scheduled-reconciliation',
      }),
    });
    const scheduledDryRun = scheduledDryRunPayload.data;
    assert(scheduledDryRun?.schemaVersion === 'backy.commerce-reconciliation.v1', `Scheduled reconciliation dry-run returned wrong schema: ${JSON.stringify(scheduledDryRunPayload).slice(0, 500)}`);
    assert(scheduledDryRun.runMode === 'scheduled', `Scheduled reconciliation dry-run did not preserve run mode: ${JSON.stringify(scheduledDryRun).slice(0, 500)}`);
    assert(scheduledDryRun.dryRun === true, `Scheduled reconciliation dry-run did not report dryRun: ${JSON.stringify(scheduledDryRun).slice(0, 500)}`);
    assert(scheduledDryRun.updatedCount === 0, `Scheduled reconciliation dry-run should not mutate orders: ${JSON.stringify(scheduledDryRun).slice(0, 500)}`);
    assert(scheduledDryRun.eligibleUpdateCount >= 1, `Scheduled reconciliation dry-run did not find the stale order: ${JSON.stringify(scheduledDryRun).slice(0, 500)}`);
    assert(
      scheduledDryRun.updates?.some((update) => update.orderId === orderRecordId && update.paymentStatus === 'paid' && update.eventId === `evt_orders_reconcile_${suffix}`),
      `Scheduled reconciliation dry-run did not expose the expected order update: ${JSON.stringify(scheduledDryRun).slice(0, 500)}`,
    );
    const pendingAfterDryRun = await getCollectionRecordBySlug(collectionId, slug);
    assert(pendingAfterDryRun.values?.paymentstatus === 'pending', `Scheduled reconciliation dry-run mutated the order: ${JSON.stringify(pendingAfterDryRun.values).slice(0, 500)}`);

    const scheduledExecutionPayload = await requestApi(`/api/admin/commerce/reconcile?siteId=${encodeURIComponent(SITE_ID)}&limit=50`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${scheduledExecutionAdminKey}`,
        'x-backy-actor': 'orders-smoke-scheduled-reconciliation',
        'x-request-id': `orders-reconcile-scheduled-execution-${suffix}`,
      },
    });
    const scheduledExecution = scheduledExecutionPayload.data;
    assert(scheduledExecution?.schemaVersion === 'backy.commerce-reconciliation-batch.v1', `Scheduled reconciliation execution returned wrong schema: ${JSON.stringify(scheduledExecutionPayload).slice(0, 500)}`);
    assert(scheduledExecution.runMode === 'scheduled', `Scheduled reconciliation execution did not use scheduled run mode: ${JSON.stringify(scheduledExecution).slice(0, 500)}`);
    assert(scheduledExecution.dryRun === false, `Scheduled reconciliation execution should mutate by default: ${JSON.stringify(scheduledExecution).slice(0, 500)}`);
    assert(scheduledExecution.updatedCount >= 1, `Scheduled reconciliation execution did not update the stale order: ${JSON.stringify(scheduledExecution).slice(0, 500)}`);
    assert(
      scheduledExecution.results?.some((result) => result.siteId === SITE_ID && result.updates?.some((update) => update.orderId === orderRecordId && update.paymentStatus === 'paid' && update.eventId === `evt_orders_reconcile_${suffix}`)),
      `Scheduled reconciliation execution did not report the expected order update: ${JSON.stringify(scheduledExecution).slice(0, 500)}`,
    );
    await waitForOrderValue(
      collectionId,
      slug,
      (values) => values.orderstatus === 'paid' && values.paymentstatus === 'paid' && values.paymentreference === `pi_reconcile_${suffix}` && /Commerce reconciliation applied/.test(String(values.notes || '')),
      'Scheduled reconciliation execution did not repair stale payment state',
    );
    const reconciledAnalyticsPayload = await requestApi(`/api/admin/sites/${SITE_ID}/commerce/orders/analytics`);
    const reconciledAnalytics = reconciledAnalyticsPayload.data?.analytics;
    assert(reconciledAnalytics?.schemaVersion === 'backy.order-analytics.v1', `Reconciled order analytics returned wrong schema: ${JSON.stringify(reconciledAnalyticsPayload).slice(0, 500)}`);
    assert(reconciledAnalytics.payment?.paid?.count >= 1, `Order analytics did not report paid orders after reconciliation: ${JSON.stringify(reconciledAnalytics).slice(0, 500)}`);
    assert(reconciledAnalytics.revenue?.paidTotal >= 85, `Order analytics paid revenue was too low after reconciliation: ${JSON.stringify(reconciledAnalytics).slice(0, 500)}`);
    assert(reconciledAnalytics.operations?.fulfillmentBacklogCount >= 1, `Order analytics did not report fulfillment backlog after reconciliation: ${JSON.stringify(reconciledAnalytics).slice(0, 500)}`);

    await clickReconcileProvider(client);
    await waitForReconciliationPanel(client);
    await waitForOrderValue(
      collectionId,
      slug,
      (values) => values.orderstatus === 'paid' && values.paymentstatus === 'paid' && values.paymentreference === `pi_reconcile_${suffix}` && /Commerce reconciliation applied/.test(String(values.notes || '')),
      'Provider reconciliation did not repair stale payment state',
    );

    await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }).then((result) => {
      fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(result.data, 'base64'));
    });

    await deleteOrderThroughUi(client, orderNumber);
    await sleep(500);
    const deleted = await getCollectionRecordBySlug(collectionId, slug);
    assert(!deleted, `Order still existed after UI delete: ${JSON.stringify(deleted).slice(0, 500)}`);
    orderRecordId = null;

    await restoreCollection(originalOrdersCollection, await findCollection(ORDERS_COLLECTION_SLUG));

    console.log(JSON.stringify({
      ok: true,
      siteId: SITE_ID,
      orderNumber,
      slug,
      ordersReady: readyState,
      managedCustomerStatus: 'vip',
      screenshot: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await cleanup({
      client,
      childProcess,
      userDataDir,
      collectionId,
      orderRecordId,
      importedOrderRecordId,
      customerCollectionId,
      customerRecordId,
      originalOrdersCollection,
      originalCustomerCollection,
      originalSettings,
    });
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
