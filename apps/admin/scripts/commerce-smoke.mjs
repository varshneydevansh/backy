#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_COMMERCE_SMOKE_SITE_ID || 'site-demo';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_COMMERCE_CDP_PORT || 9378);
const SCREENSHOT_PATH = process.env.BACKY_COMMERCE_SCREENSHOT || path.join(os.tmpdir(), 'backy-commerce-smoke.png');

const PRODUCT_COLLECTION_SLUG = 'products';
const ORDERS_COLLECTION_SLUG = 'orders';
const PRODUCT_REQUIRED_FIELD_COUNT = 23;
const ORDER_REQUIRED_FIELD_COUNT = 29;

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
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(payload.error || payload).slice(0, 500)}`);
  }

  return payload;
};

const listCollections = async () => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections`);
  return payload.data?.collections || [];
};

const findCollection = async (slug) => {
  const collections = await listCollections();
  return collections.find((collection) => collection.slug === slug) || null;
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
        fields: snapshot.fields,
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

const listCollectionRecords = async (collectionId, query = '') => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collectionId}/records${query}`);
  return payload.data?.records || [];
};

const getCollectionRecordBySlug = async (collectionId, slug) => {
  const records = await listCollectionRecords(collectionId, `?slug=${encodeURIComponent(slug)}`);
  return records[0] || null;
};

const deleteCollectionRecord = async (collectionId, recordId) => {
  if (!collectionId || !recordId) return;

  await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collectionId}/records/${recordId}`, {
    method: 'DELETE',
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

const navigateToRoute = async (client, route, testId, expectedText) => {
  await client.send('Page.navigate', { url: `${ADMIN_BASE_URL}${route}?siteId=${encodeURIComponent(SITE_ID)}` });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="${testId}"]')),
      expected: document.body?.innerText?.includes(${JSON.stringify(expectedText)}) || false,
      body: document.body?.innerText?.slice(0, 500) || '',
    }))()`);

    if (state.ready && state.expected) {
      return state;
    }

    if (attempt === 119) {
      throw new Error(`${route} did not render expected controls: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const clickByText = async (client, text, options = {}) => {
  const result = await evaluate(client, `(() => {
    const text = ${JSON.stringify(text)};
    const exact = ${JSON.stringify(Boolean(options.exact))};
    const candidates = Array.from(document.querySelectorAll('button, a'));
    const target = candidates.find((candidate) => {
      const label = (candidate.textContent || '').replace(/\\s+/g, ' ').trim();
      return exact ? label === text : label.includes(text);
    });
    if (!(target instanceof HTMLElement)) {
      return { ok: false, text };
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
      return { ok: false, text, disabled: target?.disabled || false };
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
      hasBusyButton: Array.from(document.querySelectorAll('button')).some((button) => /Saving|Setting up|Loading/.test(button.textContent || '')),
      notice: Array.from(document.querySelectorAll('div')).some((node) => /created|synced|updated|ready/i.test(node.textContent || '')),
      error: document.body?.innerText?.includes('Unable to') || false,
      body: document.body?.innerText?.slice(0, 400) || '',
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

const setLabeledControl = async (client, labelText, value, options = {}) => {
  const result = await evaluate(client, `(() => {
    const labelText = ${JSON.stringify(labelText)};
    const value = ${JSON.stringify(value)};
    const exact = ${JSON.stringify(Boolean(options.exact))};
    const labels = Array.from(document.querySelectorAll('label'));
    const normalized = (text) => (text || '').replace(/\\s+/g, ' ').trim();
    const label = labels.find((candidate) => {
      const text = normalized(candidate.textContent);
      return exact ? text === labelText : text.includes(labelText);
    });
    if (!(label instanceof HTMLLabelElement)) {
      return { ok: false, reason: 'label-not-found', labelText };
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
    if (control instanceof HTMLInputElement && control.type === 'checkbox') {
      if (control.checked !== Boolean(value)) {
        control.click();
      }
      return { ok: true, labelText, type: control.type, value: control.checked };
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

const setAriaControl = async (client, ariaLabel, value) => {
  const result = await evaluate(client, `(() => {
    const ariaLabel = ${JSON.stringify(ariaLabel)};
    const value = ${JSON.stringify(value)};
    const control = document.querySelector('[aria-label="' + CSS.escape(ariaLabel) + '"]');
    if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)) {
      return { ok: false, reason: 'control-not-found', ariaLabel };
    }
    if (control.disabled) {
      return { ok: false, reason: 'control-disabled', ariaLabel };
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
    return { ok: true, ariaLabel, value: control.value };
  })()`);
  assert(result.ok, `Unable to set aria control ${ariaLabel}: ${JSON.stringify(result)}`);
  await sleep(75);
  return result;
};

const ensureCollectionReadyFromUi = async (client, route, testId, expectedText, setupText, readyCheck) => {
  await navigateToRoute(client, route, testId, expectedText);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await readyCheck();
    if (state.ready) {
      return state;
    }

    const clickedSetup = await clickIfPresent(client, setupText);
    if (clickedSetup) {
      await waitUntilIdle(client, route);
    }

    const clickedSync = await clickIfPresent(client, 'Sync Schema');
    if (clickedSync) {
      await waitUntilIdle(client, route);
    }

    if (attempt === 79) {
      throw new Error(`${route} collection did not become ready: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const ensureOrdersReady = async (client) => ensureCollectionReadyFromUi(
  client,
  '/orders',
  'orders-command-center',
  'Order command center',
  'Set up orders',
  async () => {
    const collection = await findCollection(ORDERS_COLLECTION_SLUG);
    return {
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
  },
);

const ensureProductsReady = async (client) => ensureCollectionReadyFromUi(
  client,
  '/products',
  'products-command-center',
  'Catalog command center',
  'Set up products',
  async () => {
    const collection = await findCollection(PRODUCT_COLLECTION_SLUG);
    return {
      ready: Boolean(
        collection?.id &&
        collection.status === 'published' &&
        collection.permissions?.publicRead &&
        (collection.fields?.length || 0) >= PRODUCT_REQUIRED_FIELD_COUNT
      ),
      collectionId: collection?.id,
      fieldCount: collection?.fields?.length || 0,
      permissions: collection?.permissions,
    };
  },
);

const fillProductEditor = async (client, suffix) => {
  const slug = `commerce-smoke-${suffix}`;
  await setLabeledControl(client, 'Title', `Commerce Smoke ${suffix}`);
  await setLabeledControl(client, 'Slug', slug);
  await setLabeledControl(client, 'SKU', `SMOKE-${suffix.toUpperCase()}`);
  await setLabeledControl(client, 'Price', '49');
  await setLabeledControl(client, 'Compare at', '79');
  await setLabeledControl(client, 'Currency', 'USD');
  await setLabeledControl(client, 'Stock', '7');
  await setLabeledControl(client, 'Low stock at', '2');
  await setLabeledControl(client, 'Inventory policy', 'deny');
  await setLabeledControl(client, 'Type', 'physical');
  await setLabeledControl(client, 'Checkout URL', `https://checkout.example.com/${slug}`);
  await setAriaControl(client, 'Image URL', 'https://images.unsplash.com/photo-1498050108023-c5249f4df085');
  await setLabeledControl(client, 'Category', 'Templates');
  await setLabeledControl(client, 'Vendor', 'Backy');
  await setLabeledControl(client, 'Description', 'A smoke-tested commerce product that verifies catalog publishing, storefront API handoff, and order intake inventory reservation.');
  await setLabeledControl(client, 'SEO title', `Commerce Smoke ${suffix} | Backy`);
  await setLabeledControl(client, 'Status', 'published');
  await setLabeledControl(client, 'Featured', true);
  await setLabeledControl(client, 'Taxable', true);
  await setLabeledControl(client, 'Ships', true);

  await sleep(500);
  await clickByText(client, 'Create Product', { exact: true });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      created: document.body?.innerText?.includes('Product created.') || false,
      titleVisible: document.body?.innerText?.includes(${JSON.stringify(`Commerce Smoke ${suffix}`)}) || false,
      buttonText: Array.from(document.querySelectorAll('button')).map((button) => button.textContent || '').join(' | '),
      body: document.body?.innerText?.slice(0, 500) || '',
    }))()`);

    if (state.created && state.titleVisible) {
      return { slug, state };
    }

    if (attempt === 79) {
      throw new Error(`Product was not created from UI: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return { slug };
};

const assertPublicCommerce = async ({ productCollection, ordersCollection, slug }) => {
  const productRecord = await getCollectionRecordBySlug(productCollection.id, slug);
  assert(productRecord, `Created product record was not found by slug ${slug}`);
  assert(productRecord.status === 'published', `Created product was not published: ${productRecord.status}`);
  assert(productRecord.values?.inventory === 7, `Created product inventory was unexpected: ${productRecord.values?.inventory}`);

  const catalog = await requestApi(`/api/sites/${SITE_ID}/commerce/catalog?slug=${encodeURIComponent(slug)}`);
  const product = catalog.data?.products?.[0] || catalog.products?.[0];
  assert(product, `Public catalog did not return ${slug}`);
  assert(product.price === 49, `Public product price was unexpected: ${product.price}`);
  assert(product.inventory?.quantity === 7, `Public product inventory was unexpected: ${JSON.stringify(product.inventory)}`);
  assert(product.featured === true, 'Public product featured flag was not true');
  assert(product.checkout?.url === `https://checkout.example.com/${slug}`, `Public checkout URL was unexpected: ${JSON.stringify(product.checkout)}`);

  const orderPayload = await requestApi(`/api/sites/${SITE_ID}/commerce/orders`, {
    method: 'POST',
    body: JSON.stringify({
      customer: {
        name: 'Commerce Smoke Buyer',
        email: 'commerce-smoke@example.com',
        phone: '+1 555 0101',
      },
      items: [{ slug, quantity: 2 }],
      shippingAddress: '100 Test Street, New York, NY',
      billingAddress: '100 Test Street, New York, NY',
      notes: 'Smoke order created through public commerce order intake.',
      paymentProvider: 'manual',
      paymentReference: `manual-${slug}`,
      checkoutSessionId: `cs_${slug}`,
    }),
  });

  const order = orderPayload.data?.order;
  assert(order?.id, `Public order intake did not return an order: ${JSON.stringify(orderPayload).slice(0, 500)}`);
  assert(order.total === 98, `Order total was unexpected: ${order.total}`);
  assert(order.itemCount === 2, `Order item count was unexpected: ${order.itemCount}`);

  const updatedProduct = await getCollectionRecordBySlug(productCollection.id, slug);
  assert(updatedProduct.values?.inventory === 5, `Inventory reservation did not reduce stock to 5: ${updatedProduct.values?.inventory}`);

  const orderRecord = await getCollectionRecordBySlug(ordersCollection.id, order.slug);
  assert(orderRecord?.id, `Order record was not available in private queue by slug ${order.slug}`);
  assert(orderRecord.values?.customername === 'Commerce Smoke Buyer', 'Order customer name was not persisted');

  return { productRecord, updatedProduct, order, orderRecord };
};

const assertProductsLayout = async (client) => {
  const layout = await evaluate(client, `(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    hasCommandCenter: Boolean(document.querySelector('[data-testid="products-command-center"]')),
    hasApiPanel: document.body?.innerText?.includes('Storefront API') || false,
    hasEditor: document.body?.innerText?.includes('New product') || document.body?.innerText?.includes('Edit product') || false,
  }))()`);
  assert(layout.scrollWidth <= layout.width + 8, `Products page has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(layout.hasCommandCenter && layout.hasApiPanel && layout.hasEditor, `Products page missing expected regions: ${JSON.stringify(layout)}`);
  return layout;
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-commerce-${Date.now()}`);
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

const cleanupBrowser = async ({ client, childProcess, userDataDir }) => {
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
  const suffix = Date.now().toString(36);
  const originalProductCollection = snapshotCollection(await findCollection(PRODUCT_COLLECTION_SLUG));
  const originalOrdersCollection = snapshotCollection(await findCollection(ORDERS_COLLECTION_SLUG));
  const { childProcess, userDataDir } = launchChrome();
  let client;
  let productRecordId = null;
  let orderRecordId = null;
  let finalProductCollection = null;
  let finalOrdersCollection = null;
  let restored = false;

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

    const ordersReady = await ensureOrdersReady(client);
    const productsReady = await ensureProductsReady(client);
    const { slug } = await fillProductEditor(client, suffix);

    finalProductCollection = await findCollection(PRODUCT_COLLECTION_SLUG);
    finalOrdersCollection = await findCollection(ORDERS_COLLECTION_SLUG);
    assert(finalProductCollection?.id, 'Products collection was not available after UI setup');
    assert(finalOrdersCollection?.id, 'Orders collection was not available after UI setup');

    const publicCommerce = await assertPublicCommerce({
      productCollection: finalProductCollection,
      ordersCollection: finalOrdersCollection,
      slug,
    });
    productRecordId = publicCommerce.productRecord.id;
    orderRecordId = publicCommerce.orderRecord.id;

    const layout = await assertProductsLayout(client);
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));

    const browserErrors = client.events
      .filter((event) => (
        event.method === 'Runtime.exceptionThrown'
        || (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error')
      ))
      .map((event) => event.params);

    assert(browserErrors.length === 0, `Browser emitted errors: ${JSON.stringify(browserErrors.slice(0, 3))}`);

    await deleteCollectionRecord(finalOrdersCollection.id, orderRecordId);
    await deleteCollectionRecord(finalProductCollection.id, productRecordId);
    productRecordId = null;
    orderRecordId = null;

    await restoreCollection(originalProductCollection, finalProductCollection);
    await restoreCollection(originalOrdersCollection, finalOrdersCollection);
    restored = true;

    console.log(JSON.stringify({
      ok: true,
      siteId: SITE_ID,
      routes: {
        products: `${ADMIN_BASE_URL}/products?siteId=${SITE_ID}`,
        orders: `${ADMIN_BASE_URL}/orders?siteId=${SITE_ID}`,
        catalog: `${API_BASE_URL}/api/sites/${SITE_ID}/commerce/catalog?slug=${slug}`,
        orderIntake: `${API_BASE_URL}/api/sites/${SITE_ID}/commerce/orders`,
      },
      ordersReady,
      productsReady,
      product: {
        slug,
        recordId: publicCommerce.productRecord.id,
        startingInventory: publicCommerce.productRecord.values?.inventory,
        endingInventory: publicCommerce.updatedProduct.values?.inventory,
      },
      order: {
        id: publicCommerce.order.id,
        slug: publicCommerce.order.slug,
        total: publicCommerce.order.total,
        itemCount: publicCommerce.order.itemCount,
      },
      layout,
      restored,
      screenshotPath: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    if (!restored) {
      if (finalOrdersCollection?.id && orderRecordId) {
        await deleteCollectionRecord(finalOrdersCollection.id, orderRecordId).catch((error) => {
          console.warn('Unable to delete smoke order:', error instanceof Error ? error.message : error);
        });
      }
      if (finalProductCollection?.id && productRecordId) {
        await deleteCollectionRecord(finalProductCollection.id, productRecordId).catch((error) => {
          console.warn('Unable to delete smoke product:', error instanceof Error ? error.message : error);
        });
      }
      await restoreCollection(originalProductCollection, finalProductCollection || await findCollection(PRODUCT_COLLECTION_SLUG)).catch((error) => {
        console.warn('Unable to restore product collection:', error instanceof Error ? error.message : error);
      });
      await restoreCollection(originalOrdersCollection, finalOrdersCollection || await findCollection(ORDERS_COLLECTION_SLUG)).catch((error) => {
        console.warn('Unable to restore orders collection:', error instanceof Error ? error.message : error);
      });
    }

    await cleanupBrowser({ client, childProcess, userDataDir });
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
