#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_COMMERCE_SMOKE_SITE_ID || 'site-demo';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_COMMERCE_CDP_PORT || 9378);
const SCREENSHOT_PATH = process.env.BACKY_COMMERCE_SCREENSHOT || path.join(os.tmpdir(), 'backy-commerce-smoke.png');
const STRIPE_MOCK_PORT = Number(process.env.BACKY_STRIPE_MOCK_PORT || 45678);
const STRIPE_MOCK_BASE_URL = `http://127.0.0.1:${STRIPE_MOCK_PORT}`;

const PRODUCT_COLLECTION_SLUG = 'products';
const ORDERS_COLLECTION_SLUG = 'orders';
const CUSTOMERS_COLLECTION_SLUG = 'customers';
const PRODUCT_REQUIRED_FIELD_COUNT = 30;
const ORDER_REQUIRED_FIELD_COUNT = 57;
const FRONTEND_PRODUCT_TEMPLATE_ID = 'smoke-product-contract-template';
const FRONTEND_PRODUCT_TEMPLATE_NAME = 'Smoke Frontend Product';
const COMMERCE_WEBHOOK_SECRET = 'smoke-commerce-webhook-secret';
const COMMERCE_WEBHOOK_SECRET_REFERENCE = 'env:BACKY_COMMERCE_WEBHOOK_SECRET';
let apiAdminSessionToken = '';
let stripeCheckoutMock = null;

const PRODUCT_VALUE_KEYS = {
  title: 'title',
  sku: 'sku',
  variants: 'variants',
  price: 'price',
  compareAtPrice: 'compareatprice',
  currency: 'currency',
  inventory: 'inventory',
  lowStockThreshold: 'lowstockthreshold',
  inventoryPolicy: 'inventorypolicy',
  productType: 'producttype',
  downloadUrl: 'downloadurl',
  checkoutUrl: 'checkouturl',
  subscriptionEnabled: 'subscriptionenabled',
  subscriptionInterval: 'subscriptioninterval',
  subscriptionTrialDays: 'subscriptiontrialdays',
  shippingRequired: 'shippingrequired',
  shippingProfile: 'shippingprofile',
  weight: 'weight',
  taxClass: 'taxclass',
  discountCode: 'discountcode',
  returnPolicy: 'returnpolicy',
  imageUrl: 'imageurl',
  galleryImages: 'galleryimages',
  category: 'category',
  tags: 'tags',
  vendor: 'vendor',
  description: 'description',
  seoTitle: 'seotitle',
  featured: 'featured',
  taxable: 'taxable',
};

const productFieldKey = (key) => PRODUCT_VALUE_KEYS[key] || key;
const readProductValue = (values, key) => (
  Object.prototype.hasOwnProperty.call(values || {}, productFieldKey(key))
    ? values[productFieldKey(key)]
    : values?.[key]
);

const PRODUCT_SCHEMA_FIELDS = [
  { key: 'title', label: 'Title', type: 'text', required: true, unique: false, sortOrder: 10 },
  { key: 'sku', label: 'SKU', type: 'text', required: true, unique: true, sortOrder: 20 },
  { key: 'price', label: 'Price', type: 'number', required: true, unique: false, sortOrder: 30 },
  { key: productFieldKey('compareAtPrice'), label: 'Compare at price', type: 'number', required: false, unique: false, sortOrder: 40 },
  { key: 'currency', label: 'Currency', type: 'text', required: true, unique: false, sortOrder: 50, defaultValue: 'USD' },
  { key: 'variants', label: 'Variants', type: 'json', required: false, unique: false, sortOrder: 60, defaultValue: [] },
  { key: 'inventory', label: 'Inventory', type: 'number', required: false, unique: false, sortOrder: 70, defaultValue: 0 },
  { key: productFieldKey('lowStockThreshold'), label: 'Low Stock Threshold', type: 'number', required: false, unique: false, sortOrder: 80, defaultValue: 5 },
  { key: productFieldKey('inventoryPolicy'), label: 'Inventory Policy', type: 'select', required: false, unique: false, sortOrder: 90, options: ['deny', 'continue', 'preorder'], defaultValue: 'deny' },
  { key: productFieldKey('productType'), label: 'Product Type', type: 'select', required: true, unique: false, sortOrder: 100, options: ['physical', 'digital', 'service'], defaultValue: 'physical' },
  { key: productFieldKey('downloadUrl'), label: 'Digital Delivery URL', type: 'url', required: false, unique: false, sortOrder: 110 },
  { key: productFieldKey('checkoutUrl'), label: 'Checkout URL', type: 'url', required: false, unique: false, sortOrder: 120 },
  { key: productFieldKey('subscriptionEnabled'), label: 'Subscription Enabled', type: 'boolean', required: false, unique: false, sortOrder: 130, defaultValue: false },
  { key: productFieldKey('subscriptionInterval'), label: 'Subscription Interval', type: 'select', required: false, unique: false, sortOrder: 140, options: ['weekly', 'monthly', 'quarterly', 'yearly'], defaultValue: 'monthly' },
  { key: productFieldKey('subscriptionTrialDays'), label: 'Subscription Trial Days', type: 'number', required: false, unique: false, sortOrder: 150, defaultValue: 0 },
  { key: productFieldKey('shippingRequired'), label: 'Requires Shipping', type: 'boolean', required: false, unique: false, sortOrder: 160, defaultValue: true },
  { key: productFieldKey('shippingProfile'), label: 'Shipping Profile', type: 'text', required: false, unique: false, sortOrder: 170 },
  { key: 'weight', label: 'Weight', type: 'number', required: false, unique: false, sortOrder: 180 },
  { key: productFieldKey('taxClass'), label: 'Tax Class', type: 'text', required: false, unique: false, sortOrder: 190 },
  { key: productFieldKey('discountCode'), label: 'Discount Code', type: 'text', required: false, unique: false, sortOrder: 200 },
  { key: productFieldKey('returnPolicy'), label: 'Return Policy', type: 'richText', required: false, unique: false, sortOrder: 210 },
  { key: productFieldKey('imageUrl'), label: 'Image URL', type: 'url', required: false, unique: false, sortOrder: 220 },
  { key: productFieldKey('galleryImages'), label: 'Gallery Images', type: 'json', required: false, unique: false, sortOrder: 230, defaultValue: [] },
  { key: 'category', label: 'Category', type: 'text', required: false, unique: false, sortOrder: 240 },
  { key: 'tags', label: 'Tags', type: 'tags', required: false, unique: false, sortOrder: 250 },
  { key: 'vendor', label: 'Vendor', type: 'text', required: false, unique: false, sortOrder: 260 },
  { key: 'description', label: 'Description', type: 'richText', required: false, unique: false, sortOrder: 270 },
  { key: productFieldKey('seoTitle'), label: 'SEO Title', type: 'text', required: false, unique: false, sortOrder: 280 },
  { key: 'featured', label: 'Featured', type: 'boolean', required: false, unique: false, sortOrder: 290, defaultValue: false },
  { key: 'taxable', label: 'Taxable', type: 'boolean', required: false, unique: false, sortOrder: 300, defaultValue: true },
];

const ORDER_SCHEMA_FIELDS = [
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
  { key: 'trackingstatus', label: 'Tracking Status', type: 'text', required: false, unique: false, sortOrder: 165 },
  { key: 'trackinglastcheckedat', label: 'Tracking Last Checked At', type: 'date', required: false, unique: false, sortOrder: 166 },
  { key: 'fulfilledat', label: 'Fulfilled At', type: 'date', required: false, unique: false, sortOrder: 170 },
  { key: 'shippinglabelstatus', label: 'Shipping Label Status', type: 'select', required: false, unique: false, sortOrder: 171, options: ['none', 'draft', 'purchased', 'voided'], defaultValue: 'none' },
  { key: 'shippinglabelprovider', label: 'Shipping Label Provider', type: 'text', required: false, unique: false, sortOrder: 172 },
  { key: 'shippinglabelid', label: 'Shipping Label ID', type: 'text', required: false, unique: false, sortOrder: 173 },
  { key: 'shippinglabelurl', label: 'Shipping Label URL', type: 'url', required: false, unique: false, sortOrder: 174 },
  { key: 'shippingservicelevel', label: 'Shipping Service Level', type: 'text', required: false, unique: false, sortOrder: 175 },
  { key: 'shippinglabelcost', label: 'Shipping Label Cost', type: 'number', required: false, unique: false, sortOrder: 176 },
  { key: 'shippinglabelcreatedat', label: 'Shipping Label Created At', type: 'date', required: false, unique: false, sortOrder: 177 },
  { key: 'fulfillmentdispatchstatus', label: 'Fulfillment Dispatch Status', type: 'select', required: false, unique: false, sortOrder: 178, options: ['none', 'requested', 'succeeded', 'failed', 'requires_action'], defaultValue: 'none' },
  { key: 'fulfillmentprovider', label: 'Fulfillment Provider', type: 'text', required: false, unique: false, sortOrder: 179 },
  { key: 'fulfillmentid', label: 'Fulfillment ID', type: 'text', required: false, unique: false, sortOrder: 180 },
  { key: 'fulfillmentrequestedat', label: 'Fulfillment Requested At', type: 'date', required: false, unique: false, sortOrder: 181 },
  { key: 'fulfillmentcompletedat', label: 'Fulfillment Completed At', type: 'date', required: false, unique: false, sortOrder: 182 },
  { key: 'fulfillmentpayload', label: 'Fulfillment Payload', type: 'richText', required: false, unique: false, sortOrder: 183 },
  { key: 'riskscore', label: 'Risk Score', type: 'number', required: false, unique: false, sortOrder: 180, defaultValue: 0 },
  { key: 'risklevel', label: 'Risk Level', type: 'select', required: false, unique: false, sortOrder: 182, options: ['low', 'medium', 'high'], defaultValue: 'low' },
  { key: 'riskreasons', label: 'Risk Reasons', type: 'richText', required: false, unique: false, sortOrder: 184 },
  { key: 'riskreviewstatus', label: 'Risk Review Status', type: 'select', required: false, unique: false, sortOrder: 186, options: ['cleared', 'pending_review', 'approved', 'held'], defaultValue: 'cleared' },
  { key: 'shippingaddress', label: 'Shipping Address', type: 'richText', required: false, unique: false, sortOrder: 190 },
  { key: 'billingaddress', label: 'Billing Address', type: 'richText', required: false, unique: false, sortOrder: 200 },
  { key: 'refundamount', label: 'Refund Amount', type: 'number', required: false, unique: false, sortOrder: 210 },
  { key: 'refundreason', label: 'Refund Reason', type: 'richText', required: false, unique: false, sortOrder: 220 },
  { key: 'providerrefundstatus', label: 'Provider Refund Status', type: 'select', required: false, unique: false, sortOrder: 221, options: ['none', 'requested', 'succeeded', 'failed', 'requires_action'], defaultValue: 'none' },
  { key: 'providerrefundprovider', label: 'Provider Refund Provider', type: 'text', required: false, unique: false, sortOrder: 222 },
  { key: 'providerrefundid', label: 'Provider Refund ID', type: 'text', required: false, unique: false, sortOrder: 223 },
  { key: 'providerrefundreference', label: 'Provider Refund Reference', type: 'text', required: false, unique: false, sortOrder: 224 },
  { key: 'providerrefundamount', label: 'Provider Refund Amount', type: 'number', required: false, unique: false, sortOrder: 225 },
  { key: 'providerrefundreason', label: 'Provider Refund Reason', type: 'richText', required: false, unique: false, sortOrder: 226 },
  { key: 'providerrefundrequestedat', label: 'Provider Refund Requested At', type: 'date', required: false, unique: false, sortOrder: 227 },
  { key: 'providerrefundcompletedat', label: 'Provider Refund Completed At', type: 'date', required: false, unique: false, sortOrder: 228 },
  { key: 'providerrefundpayload', label: 'Provider Refund Payload', type: 'richText', required: false, unique: false, sortOrder: 229 },
  { key: 'notes', label: 'Internal Notes', type: 'richText', required: false, unique: false, sortOrder: 240 },
];

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
      ...((endpoint.startsWith('/api/admin/') || endpoint.includes('/events?')) && apiAdminSessionToken ? { authorization: `Bearer ${apiAdminSessionToken}` } : {}),
      ...(options.headers || {}),
    },
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

const stripeCheckoutExecutionEnabled = () => {
  const secret = process.env.BACKY_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || '';
  const apiBaseUrl = process.env.BACKY_STRIPE_API_BASE_URL || process.env.STRIPE_API_BASE_URL || '';
  return Boolean(secret && apiBaseUrl === STRIPE_MOCK_BASE_URL);
};

const readRequestBody = (request) => new Promise((resolve, reject) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  request.on('error', reject);
});

const startStripeCheckoutMock = async () => {
  const requests = [];
  const server = createServer(async (request, response) => {
    const body = await readRequestBody(request);
    requests.push({
      method: request.method,
      url: request.url,
      headers: request.headers,
      body,
      form: Object.fromEntries(new URLSearchParams(body).entries()),
    });

    if (request.method !== 'POST' || request.url !== '/v1/checkout/sessions') {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'Not found' } }));
      return;
    }

    const form = new URLSearchParams(body);
    const id = `cs_mock_${requests.length}`;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      id,
      object: 'checkout.session',
      url: `${STRIPE_MOCK_BASE_URL}/checkout/${id}`,
      status: 'open',
      payment_status: 'unpaid',
      livemode: false,
      client_reference_id: form.get('client_reference_id'),
      metadata: {
        siteId: form.get('metadata[siteId]'),
        orderNumber: form.get('metadata[orderNumber]'),
        orderSlug: form.get('metadata[orderSlug]'),
        requestId: form.get('metadata[requestId]'),
      },
    }));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(STRIPE_MOCK_PORT, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  return {
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
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

const enableCommercePricingSettings = async (settings) => {
  const next = JSON.parse(JSON.stringify(settings));
  next.integrations = {
    ...(next.integrations || {}),
    commerce: {
      ...(next.integrations?.commerce || {}),
      mode: 'checkout-provider',
      paymentProvider: 'manual',
      providerMode: 'test',
      checkoutSuccessPath: '/checkout/success',
      checkoutCancelPath: '/checkout/cancel',
      providerWebhookUrl: 'https://hooks.example.com/backy-commerce-smoke',
      providerWebhookSecretId: COMMERCE_WEBHOOK_SECRET_REFERENCE,
      providerWebhookEvents: 'checkout.session.completed,charge.refunded,payment_intent.payment_failed',
      webhookEventsEnabled: true,
      reconciliationMode: 'webhook',
      taxEnabled: true,
      shippingEnabled: true,
      discountsEnabled: true,
      taxRatePercent: 10,
      digitalTaxRatePercent: 5,
      shippingBaseAmount: 12,
      shippingWeightRate: 2,
      discountPercent: 12,
    },
    notifications: {
      ...(next.integrations?.notifications || {}),
      digestFrequency: 'instant',
      email: {
        ...(next.integrations?.notifications?.email || {}),
        orderCreated: true,
        productLowStock: true,
        recipient: 'commerce-ops@example.com',
      },
    },
  };
  return patchSettingsFromSnapshot(next);
};

const enableStripeCommerceSettings = async () => {
  const current = await getSettings();
  const next = JSON.parse(JSON.stringify(current));
  next.integrations = {
    ...(next.integrations || {}),
    commerce: {
      ...(next.integrations?.commerce || {}),
      mode: 'checkout-provider',
      paymentProvider: 'stripe',
      providerMode: 'test',
      checkoutSuccessPath: '/checkout/success',
      checkoutCancelPath: '/checkout/cancel',
      providerWebhookUrl: 'https://hooks.example.com/backy-commerce-smoke',
      providerWebhookSecretId: COMMERCE_WEBHOOK_SECRET_REFERENCE,
      providerWebhookEvents: 'checkout.session.completed,charge.refunded,payment_intent.payment_failed',
      webhookEventsEnabled: true,
      reconciliationMode: 'webhook',
    },
  };
  return patchSettingsFromSnapshot(next);
};

const smokeFrontendDesignContract = () => ({
  schemaVersion: 'backy.frontend-design.v1',
  status: 'synced',
  source: {
    type: 'custom-frontend',
    label: 'Smoke commerce frontend',
    url: 'https://example.com/smoke-commerce-frontend',
    repository: 'example/backy-smoke-commerce-frontend',
    branch: 'main',
  },
  tokens: {
    colors: {
      primary: '#0f766e',
      accent: '#f59e0b',
    },
    fonts: {
      heading: 'Inter',
      body: 'Inter',
    },
    customCss: ':root { --backy-smoke-commerce-primary: #0f766e; }',
  },
  chrome: {
    header: { component: 'SmokeCommerceHeader', source: 'site.navigation.primary' },
    navigation: { component: 'SmokeCommerceNavigation', source: 'site.navigation.primary' },
    footer: { component: 'SmokeCommerceFooter', source: 'site.navigation.footer' },
  },
  templates: [
    {
      id: FRONTEND_PRODUCT_TEMPLATE_ID,
      type: 'product',
      name: FRONTEND_PRODUCT_TEMPLATE_NAME,
      routePattern: '/products/smoke-contract-product',
      description: 'Frontend contract product template used by the commerce smoke.',
      content: {
        title: 'Smoke frontend product',
        slug: 'smoke-frontend-product',
        sku: 'SMOKE-FRONTEND-PRODUCT',
        price: 39,
        compareAtPrice: 59,
        currency: 'USD',
        inventory: 11,
        lowStockThreshold: 3,
        inventoryPolicy: 'deny',
        productType: 'physical',
        checkoutUrl: 'https://checkout.example.com/smoke-frontend-product',
        shippingRequired: true,
        shippingProfile: 'standard-box',
        weight: 1.25,
        taxClass: 'standard',
        discountCode: 'FRONTEND10',
        returnPolicy: 'Frontend template products allow returns within 30 days.',
        imageUrl: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085',
        galleryImages: ['https://images.unsplash.com/photo-1498050108023-c5249f4df085'],
        category: 'Frontend templates',
        tags: ['frontend-design', 'commerce'],
        vendor: 'Backy',
        description: 'A product seeded from a custom frontend design contract.',
        seoTitle: 'Smoke frontend product | Backy',
        featured: true,
        taxable: true,
      },
      bindingHints: [
        { role: 'product.title', binding: 'product.title' },
        { role: 'product.price', binding: 'product.price' },
        { role: 'product.media', binding: 'product.imageUrl' },
      ],
    },
  ],
  editableMap: [
    {
      selector: '[data-backy-role="product-card"]',
      role: 'product.card',
      binding: 'product',
      fields: ['title', 'price', 'imageUrl', 'checkoutUrl'],
    },
  ],
  notes: 'Temporary contract for validating product creation from custom frontend templates.',
});

const listCollections = async () => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections?limit=200`);
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
        fields: (collection.fields || []).map(sanitizeSchemaField),
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
        fields: (snapshot.fields || []).map(sanitizeSchemaField),
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

const updateCollectionPermissions = async (collection, permissions) => {
  assert(collection?.id, `Cannot update permissions for missing collection: ${JSON.stringify(collection)}`);
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collection.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ permissions }),
  });

  return payload.data?.collection || payload.data || payload.collection;
};

const assertOrderIntakeReadinessRequiresPrivateOrders = async (ordersCollection) => {
  assert(ordersCollection?.id, 'Orders collection was not available for order intake readiness check');
  const originalPermissions = {
    publicRead: false,
    publicCreate: false,
    publicUpdate: false,
    publicDelete: false,
    ...(ordersCollection.permissions || {}),
  };
  const exposedUpdatePermissions = {
    ...originalPermissions,
    publicRead: false,
    publicCreate: false,
    publicUpdate: true,
    publicDelete: false,
  };

  try {
    await updateCollectionPermissions(ordersCollection, exposedUpdatePermissions);

    const catalogPayload = await requestApi(`/api/sites/${SITE_ID}/commerce/catalog?limit=1`);
    const catalogCommerce = catalogPayload.data?.commerce || catalogPayload.commerce;
    assert(catalogCommerce?.capabilities?.catalog === true, `Catalog capability should remain available: ${JSON.stringify(catalogCommerce)}`);
    assert(catalogCommerce.capabilities.orderIntake === false, `Catalog advertised order intake while orders.publicUpdate was enabled: ${JSON.stringify(catalogCommerce)}`);

    const manifestPayload = await requestApi(`/api/sites/${SITE_ID}/manifest`);
    const manifestCommerce = manifestPayload.data?.site?.commerce ||
      manifestPayload.site?.commerce ||
      manifestPayload.data?.commerce ||
      manifestPayload.commerce ||
      (typeof manifestPayload.data?.capabilities?.commerceOrderIntake === 'boolean'
        ? { capabilities: { orderIntake: manifestPayload.data.capabilities.commerceOrderIntake } }
        : undefined);
    assert(manifestCommerce?.capabilities?.orderIntake === false, `Manifest advertised order intake while orders.publicUpdate was enabled: ${JSON.stringify(manifestCommerce)}`);

    const orderContractResponse = await fetch(`${API_BASE_URL}/api/sites/${SITE_ID}/commerce/orders`);
    const orderContractPayload = await orderContractResponse.json().catch(() => ({}));
    assert(orderContractResponse.status === 409, `Order contract should reject public order collection access: ${orderContractResponse.status} ${JSON.stringify(orderContractPayload)}`);
    assert(orderContractPayload?.error?.code === 'ORDER_QUEUE_NOT_PRIVATE', `Order contract returned wrong private queue error: ${JSON.stringify(orderContractPayload)}`);
  } finally {
    await updateCollectionPermissions(ordersCollection, originalPermissions);
  }

  const restored = await findCollection(ORDERS_COLLECTION_SLUG);
  assert(
    restored?.permissions?.publicRead === originalPermissions.publicRead &&
    restored?.permissions?.publicCreate === originalPermissions.publicCreate &&
    restored?.permissions?.publicUpdate === originalPermissions.publicUpdate &&
    restored?.permissions?.publicDelete === originalPermissions.publicDelete,
    `Orders permissions were not restored after readiness check: ${JSON.stringify(restored?.permissions)}`,
  );

  return restored;
};

const mergeSchemaFields = (currentFields = [], requiredFields = []) => {
  const currentByKey = new Map(currentFields.map((field) => [field.key, field]));
  const requiredKeys = new Set(requiredFields.map((field) => field.key));
  const mergedRequired = requiredFields.map((field) => sanitizeSchemaField({
    ...(currentByKey.get(field.key) || {}),
    ...field,
    sortOrder: field.sortOrder,
  }));
  const customFields = currentFields.filter((field) => !requiredKeys.has(field.key));
  return [...mergedRequired, ...customFields].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
};

const sanitizeSchemaField = (field) => {
  const nextField = { ...field };
  if (!['select', 'tags'].includes(nextField.type)) {
    delete nextField.options;
  }
  return nextField;
};

const upsertCollectionSchema = async ({
  slug,
  name,
  description,
  listRoutePattern,
  routePattern,
  fields,
  permissions,
}) => {
  const current = await findCollection(slug);
  const body = current
    ? {
        name: current.name || name,
        slug,
        description: current.description || description,
        status: 'published',
        listRoutePattern: current.listRoutePattern || listRoutePattern,
        routePattern: current.routePattern || routePattern,
        fields: mergeSchemaFields(current.fields || [], fields),
        permissions: {
          ...(current.permissions || {}),
          ...permissions,
        },
      }
    : {
        name,
        slug,
        description,
        status: 'published',
        listRoutePattern,
        routePattern,
        fields,
        permissions,
      };

  const payload = await requestApi(
    current
      ? `/api/admin/sites/${SITE_ID}/collections/${current.id}`
      : `/api/admin/sites/${SITE_ID}/collections`,
    {
      method: current ? 'PATCH' : 'POST',
      body: JSON.stringify(body),
    },
  );

  return payload.data?.collection || payload.data || payload.collection;
};

const ensureCommerceSchemasReadyViaApi = async () => {
  const products = await upsertCollectionSchema({
    slug: PRODUCT_COLLECTION_SLUG,
    name: 'Products',
    description: 'Sellable products controlled by Backy and available to custom frontends through collection APIs.',
    listRoutePattern: '/products',
    routePattern: '/products/:recordSlug',
    fields: PRODUCT_SCHEMA_FIELDS,
    permissions: {
      publicRead: true,
      publicCreate: false,
      publicUpdate: false,
      publicDelete: false,
    },
  });
  const orders = await upsertCollectionSchema({
    slug: ORDERS_COLLECTION_SLUG,
    name: 'Orders',
    description: 'Commerce orders for storefronts, custom checkout flows, and fulfillment dashboards.',
    listRoutePattern: '/orders',
    routePattern: '/orders/:recordSlug',
    fields: ORDER_SCHEMA_FIELDS,
    permissions: {
      publicRead: false,
      publicCreate: false,
      publicUpdate: false,
      publicDelete: false,
    },
  });

  return {
    products: {
      id: products?.id,
      fieldCount: products?.fields?.length || 0,
      permissions: products?.permissions,
    },
    orders: {
      id: orders?.id,
      fieldCount: orders?.fields?.length || 0,
      permissions: orders?.permissions,
    },
  };
};

const listCollectionRecords = async (collectionId, query = '') => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collectionId}/records${query}`);
  return payload.data?.records || [];
};

const listAllCollectionRecords = async (collectionId, query = '') => {
  const baseParams = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  const records = [];
  let offset = Number(baseParams.get('offset') || 0);
  const limit = Number(baseParams.get('limit') || 100);

  for (let pageIndex = 0; pageIndex < 1000; pageIndex += 1) {
    const params = new URLSearchParams(baseParams);
    params.set('limit', String(limit));
    params.set('offset', String(offset));

    const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collectionId}/records?${params.toString()}`);
    const pageRecords = payload.data?.records || [];
    const pagination = payload.data?.pagination || {
      limit,
      offset,
      hasMore: false,
    };

    records.push(...pageRecords);
    const nextOffset = Number(pagination.offset || offset) + Number(pagination.limit || limit);
    if (!pagination.hasMore || nextOffset <= offset) {
      break;
    }

    offset = nextOffset;
  }

  return records;
};

const getCollectionRecordBySlug = async (collectionId, slug) => {
  const records = await listCollectionRecords(collectionId, `?slug=${encodeURIComponent(slug)}`);
  return records[0] || null;
};

const deleteCollectionRecord = async (collectionId, recordId) => {
  if (!collectionId || !recordId) return;

  try {
    await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collectionId}/records/${recordId}`, {
      method: 'DELETE',
    });
  } catch {
    await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collectionId}/records/bulk`, {
      method: 'POST',
      body: JSON.stringify({
        action: 'delete',
        recordIds: [recordId],
      }),
    });
  }
};

const csvEscape = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
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
    const matches = candidates.filter((candidate) => (candidate.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase().includes(text.toLowerCase()));
    const target = matches.find((candidate) => candidate instanceof HTMLElement && candidate.getAttribute('aria-disabled') !== 'true' && !candidate.disabled);
    if (!(target instanceof HTMLElement)) {
      return {
        ok: false,
        text,
        matches: matches.map((candidate) => ({
          text: (candidate.textContent || '').replace(/\\s+/g, ' ').trim(),
          disabled: candidate.disabled || candidate.getAttribute('aria-disabled') === 'true',
        })).slice(0, 6),
      };
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
        !collection.permissions?.publicUpdate &&
        !collection.permissions?.publicDelete &&
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
  await setLabeledControl(client, 'Low stock at', '4');
  await setLabeledControl(client, 'Inventory policy', 'deny');
  await setLabeledControl(client, 'Type', 'physical');
  await setLabeledControl(client, 'Checkout URL', `https://checkout.example.com/${slug}`);
  await setLabeledControl(client, 'Subscription', true);
  await sleep(150);
  await setLabeledControl(client, 'Subscription interval', 'monthly');
  await setLabeledControl(client, 'Trial days', '14');
  await setLabeledControl(client, 'Tax class', 'standard');
  await setLabeledControl(client, 'Shipping profile', 'standard-box');
  await setLabeledControl(client, 'Discount code', 'SMOKE10');
  await setLabeledControl(client, 'Return policy', '30-day returns for unopened smoke-test products.');
  await setAriaControl(client, 'Image URL', 'https://images.unsplash.com/photo-1498050108023-c5249f4df085');
  await setLabeledControl(client, 'Category', 'Templates');
  await setLabeledControl(client, 'Vendor', 'Backy');
  await setLabeledControl(client, 'Description', 'A smoke-tested commerce product that verifies catalog publishing, storefront API handoff, and order intake inventory reservation.');
  await setLabeledControl(client, 'SEO title', `Commerce Smoke ${suffix} | Backy`);
  await setLabeledControl(client, 'Status', 'published');
  await setLabeledControl(client, 'Featured', true);
  await setLabeledControl(client, 'Taxable', true);
  await setLabeledControl(client, 'Ships', true);
  const generatedVariantMatrix = await evaluate(client, `(() => {
    const setNativeValue = (element, value) => {
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value');
      descriptor?.set?.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const options = document.querySelector('[data-testid="products-variant-matrix-options"]');
    const prefix = document.querySelector('[data-testid="products-variant-matrix-sku-prefix"]');
    const price = document.querySelector('[data-testid="products-variant-matrix-price"]');
    const stock = document.querySelector('[data-testid="products-variant-matrix-stock"]');
    const button = document.querySelector('[data-testid="products-variant-matrix-generate"]');
    if (!(options instanceof HTMLTextAreaElement) || !(prefix instanceof HTMLInputElement) || !(price instanceof HTMLInputElement) || !(stock instanceof HTMLInputElement) || !(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        reason: 'missing-matrix-controls',
        hasOptions: Boolean(options),
        hasPrefix: Boolean(prefix),
        hasPrice: Boolean(price),
        hasStock: Boolean(stock),
        hasButton: Boolean(button),
        body: document.body?.innerText?.slice(0, 800) || '',
      };
    }

    setNativeValue(options, 'Size: S, M\\nColor: Black, White');
    setNativeValue(prefix, 'SMOKE-${suffix.toUpperCase()}');
    setNativeValue(price, '59');
    setNativeValue(stock, '4');
    button.click();
    return { ok: true };
  })()`);
  assert(generatedVariantMatrix.ok, `Unable to generate product variant matrix: ${JSON.stringify(generatedVariantMatrix)}`);
  await sleep(500);
  const generatedVariantState = await evaluate(client, `(() => {
    const text = document.querySelector('[data-testid="products-variant-matrix"]')?.parentElement?.textContent || document.body?.innerText || '';
    return {
      hasSmallBlack: text.includes('S / Black') && text.includes('Size: S / Color: Black'),
      hasMediumWhite: text.includes('M / White') && text.includes('Size: M / Color: White'),
      countText: text.match(/\\d+\\/50/)?.[0] || '',
      text: text.slice(0, 1400),
    };
  })()`);
  assert(
    generatedVariantState.hasSmallBlack &&
      generatedVariantState.hasMediumWhite &&
      generatedVariantState.countText === '4/50',
    `Product variant matrix did not render generated combinations: ${JSON.stringify(generatedVariantState)}`,
  );

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

const clickFrontendTemplateCreateProduct = async (client) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(client, `(() => {
      const section = document.querySelector('[data-testid="products-frontend-template-options"]');
      const button = document.querySelector('[data-testid="products-frontend-template-${FRONTEND_PRODUCT_TEMPLATE_ID}"]');
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return {
          ok: false,
          section: Boolean(section),
          button: button?.textContent || null,
          disabled: button instanceof HTMLButtonElement ? button.disabled : null,
          body: document.body?.innerText?.slice(0, 700) || '',
        };
      }
      button.click();
      return { ok: true, text: button.textContent || '' };
    })()`);

    if (result.ok) {
      return;
    }

    if (attempt === 79) {
      throw new Error(`Unable to click frontend product template Create product: ${JSON.stringify(result)}`);
    }

    await sleep(250);
  }
};

const waitForFrontendTemplateProduct = async (productCollection) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const records = await listAllCollectionRecords(productCollection.id, '?limit=100&status=all');
    const record = records.find((candidate) => candidate.values?.frontendDesignTemplateId === FRONTEND_PRODUCT_TEMPLATE_ID);

    if (record) {
      return record;
    }

    if (attempt === 99) {
      throw new Error(`Frontend product template was not created: ${JSON.stringify(records.map((record) => ({
        id: record.id,
        slug: record.slug,
        values: record.values,
      })).slice(0, 8))}`);
    }

    await sleep(250);
  }

  return null;
};

const deleteExistingFrontendTemplateProducts = async (productCollection) => {
  const records = await listAllCollectionRecords(productCollection.id, '?limit=100&status=all');
  const staleRecords = records.filter((record) => record.values?.frontendDesignTemplateId === FRONTEND_PRODUCT_TEMPLATE_ID);

  for (const record of staleRecords) {
    await deleteCollectionRecord(productCollection.id, record.id);
  }
};

const assertFrontendTemplateProduct = async ({ productCollection, record }) => {
  assert(record?.values?.title === 'Smoke frontend product', `Frontend product title mismatch: ${JSON.stringify(record?.values)}`);
  assert(record.values.frontendDesignTemplateId === FRONTEND_PRODUCT_TEMPLATE_ID, `Frontend template id was not stored: ${JSON.stringify(record.values)}`);
  assert(record.values.frontendDesignTemplateName === FRONTEND_PRODUCT_TEMPLATE_NAME, `Frontend template name was not stored: ${JSON.stringify(record.values)}`);
  assert(record.values.frontendDesignSource?.label === 'Smoke commerce frontend', `Frontend source snapshot missing: ${JSON.stringify(record.values)}`);
  assert(record.values.frontendDesignRoutePattern === '/products/smoke-contract-product', `Frontend route pattern missing: ${JSON.stringify(record.values)}`);
  assert(record.values.frontendDesignChrome?.header?.component === 'SmokeCommerceHeader', `Frontend chrome snapshot missing: ${JSON.stringify(record.values)}`);
  assert(record.values.frontendDesignTokens?.fonts?.heading === 'Inter', `Frontend token snapshot missing: ${JSON.stringify(record.values)}`);
  assert(Array.isArray(record.values.frontendDesignBindingHints) && record.values.frontendDesignBindingHints.length === 3, `Frontend binding hints missing: ${JSON.stringify(record.values)}`);
  assert(readProductValue(record.values, 'price') === 39, `Frontend product price mismatch: ${readProductValue(record.values, 'price')}`);
  assert(readProductValue(record.values, 'inventory') === 11, `Frontend product inventory mismatch: ${readProductValue(record.values, 'inventory')}`);
  assert(readProductValue(record.values, 'shippingProfile') === 'standard-box', `Frontend product shipping profile mismatch: ${readProductValue(record.values, 'shippingProfile')}`);
  assert(readProductValue(record.values, 'taxClass') === 'standard', `Frontend product tax class mismatch: ${readProductValue(record.values, 'taxClass')}`);
  assert(readProductValue(record.values, 'discountCode') === 'FRONTEND10', `Frontend product discount code mismatch: ${readProductValue(record.values, 'discountCode')}`);
  assert(readProductValue(record.values, 'returnPolicy') === 'Frontend template products allow returns within 30 days.', `Frontend product return policy mismatch: ${readProductValue(record.values, 'returnPolicy')}`);

  const publishPayload = await requestApi(`/api/admin/sites/${SITE_ID}/collections/${productCollection.id}/records/bulk`, {
    method: 'POST',
    body: JSON.stringify({
      action: 'updateStatus',
      status: 'published',
      recordIds: [record.id],
    }),
  });
  assert(publishPayload.data?.updated === 1, `Frontend template product was not published: ${JSON.stringify(publishPayload).slice(0, 500)}`);

  const catalog = await requestApi(`/api/sites/${SITE_ID}/commerce/catalog?slug=${encodeURIComponent(record.slug)}`);
  const product = catalog.data?.products?.[0] || catalog.products?.[0];
  assert(product?.design?.frontendDesignTemplateId === FRONTEND_PRODUCT_TEMPLATE_ID, `Public catalog did not expose frontend product design metadata: ${JSON.stringify(product)}`);
  assert(product.design.frontendDesignTemplateName === FRONTEND_PRODUCT_TEMPLATE_NAME, `Public catalog did not expose frontend template name: ${JSON.stringify(product.design)}`);
  assert(product.design.frontendDesignSource?.label === 'Smoke commerce frontend', `Public catalog did not expose frontend source: ${JSON.stringify(product.design)}`);
  assert(product.design.frontendDesignBindingHints?.length === 3, `Public catalog did not expose binding hints: ${JSON.stringify(product.design)}`);

  return product;
};

const assertPublicCommerce = async ({ productCollection, ordersCollection, slug }) => {
  const productRecord = await getCollectionRecordBySlug(productCollection.id, slug);
  assert(productRecord, `Created product record was not found by slug ${slug}`);
  assert(productRecord.status === 'published', `Created product was not published: ${productRecord.status}`);
  assert(productRecord.values?.inventory === 7, `Created product inventory was unexpected: ${productRecord.values?.inventory}`);
  assert(readProductValue(productRecord.values, 'subscriptionEnabled') === true, `Created product subscription flag was unexpected: ${JSON.stringify(productRecord.values)}`);
  assert(readProductValue(productRecord.values, 'subscriptionInterval') === 'monthly', `Created product subscription interval was unexpected: ${JSON.stringify(productRecord.values)}`);
  assert(readProductValue(productRecord.values, 'subscriptionTrialDays') === 14, `Created product subscription trial days was unexpected: ${JSON.stringify(productRecord.values)}`);
  assert(
    Array.isArray(productRecord.values?.variants) &&
      productRecord.values.variants.length === 4 &&
      productRecord.values.variants.some((variant) => variant?.title === 'S / Black' && variant?.option === 'Size: S / Color: Black' && variant?.price === 59 && variant?.inventory === 4),
    `Created product variant matrix did not persist: ${JSON.stringify(productRecord.values?.variants)}`,
  );

  const catalog = await requestApi(`/api/sites/${SITE_ID}/commerce/catalog?slug=${encodeURIComponent(slug)}`);
  const product = catalog.data?.products?.[0] || catalog.products?.[0];
  assert(product, `Public catalog did not return ${slug}`);
  assert(product.price === 49, `Public product price was unexpected: ${product.price}`);
  assert(product.compareAtPrice === 79, `Public compare-at price was unexpected: ${product.compareAtPrice}`);
  assert(product.productType === 'physical', `Public product type was unexpected: ${product.productType}`);
  assert(product.imageUrl === 'https://images.unsplash.com/photo-1498050108023-c5249f4df085', `Public image URL was unexpected: ${product.imageUrl}`);
  assert(product.variants?.length === 4, `Public product variants were not generated from matrix: ${JSON.stringify(product.variants)}`);
  assert(product.variants.some((variant) => variant.sku === `SMOKE-${slug.split('-').at(-1)?.toUpperCase()}-S-BLACK` || (variant.title === 'S / Black' && variant.option === 'Size: S / Color: Black')), `Public product variant matrix missing S / Black: ${JSON.stringify(product.variants)}`);
  assert(product.inventory?.quantity === 7, `Public product inventory was unexpected: ${JSON.stringify(product.inventory)}`);
  assert(product.inventory?.lowStockThreshold === 4, `Public low stock threshold was unexpected: ${JSON.stringify(product.inventory)}`);
  assert(product.inventory?.policy === 'deny', `Public inventory policy was unexpected: ${JSON.stringify(product.inventory)}`);
  assert(product.featured === true, 'Public product featured flag was not true');
  assert(product.checkout?.url === `https://checkout.example.com/${slug}`, `Public checkout URL was unexpected: ${JSON.stringify(product.checkout)}`);
  assert(product.checkout?.discountCode === 'SMOKE10', `Public discount code was unexpected: ${JSON.stringify(product.checkout)}`);
  assert(product.subscription?.enabled === true, `Public subscription flag was unexpected: ${JSON.stringify(product.subscription)}`);
  assert(product.subscription?.interval === 'monthly', `Public subscription interval was unexpected: ${JSON.stringify(product.subscription)}`);
  assert(product.subscription?.trialDays === 14, `Public subscription trial days was unexpected: ${JSON.stringify(product.subscription)}`);
  assert(product.delivery?.shippingProfile === 'standard-box', `Public shipping profile was unexpected: ${JSON.stringify(product.delivery)}`);
  assert(product.delivery?.taxClass === 'standard', `Public tax class was unexpected: ${JSON.stringify(product.delivery)}`);
  assert(product.delivery?.returnPolicy === '30-day returns for unopened smoke-test products.', `Public return policy was unexpected: ${JSON.stringify(product.delivery)}`);

  const invalidQuantityResponse = await fetch(`${API_BASE_URL}/api/sites/${SITE_ID}/commerce/orders`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      customer: {
        name: 'Commerce Smoke Buyer',
        email: 'commerce-smoke-invalid-quantity@example.com',
      },
      items: [{ slug, quantity: 1.5 }],
    }),
  });
  const invalidQuantityPayload = await invalidQuantityResponse.json().catch(() => ({}));
  assert(invalidQuantityResponse.status === 400, `Fractional checkout quantity should be rejected: ${invalidQuantityResponse.status} ${JSON.stringify(invalidQuantityPayload).slice(0, 500)}`);
  assert(invalidQuantityPayload.error?.code === 'VALIDATION_ERROR', `Fractional checkout quantity returned wrong error: ${JSON.stringify(invalidQuantityPayload).slice(0, 500)}`);
  assert(
    JSON.stringify(invalidQuantityPayload.error?.details || []).includes('whole number between 1 and 999'),
    `Fractional checkout quantity did not expose the quantity validation detail: ${JSON.stringify(invalidQuantityPayload).slice(0, 500)}`,
  );

  const defaultQuantityPayload = await requestApi(`/api/sites/${SITE_ID}/commerce/orders`, {
    method: 'POST',
    body: JSON.stringify({
      customer: {
        name: 'Commerce Smoke Default Quantity',
        email: 'commerce-smoke-default-quantity@example.com',
      },
      items: [{ slug }],
      paymentProvider: 'manual',
      paymentReference: `manual-default-${slug}`,
      checkoutSessionId: `cs_default_${slug}`,
    }),
  });
  const defaultQuantityOrder = defaultQuantityPayload.data?.order;
  const defaultQuantityLineItem = defaultQuantityPayload.data?.lineItems?.[0];
  assert(defaultQuantityOrder?.itemCount === 1, `Omitted checkout quantity did not default order item count to 1: ${JSON.stringify(defaultQuantityPayload).slice(0, 500)}`);
  assert(defaultQuantityLineItem?.quantity === 1, `Omitted checkout quantity did not default line item quantity to 1: ${JSON.stringify(defaultQuantityPayload).slice(0, 500)}`);

  const productAfterDefaultQuantity = await getCollectionRecordBySlug(productCollection.id, slug);
  assert(productAfterDefaultQuantity.values?.inventory === 6, `Default checkout quantity did not reserve exactly one item: ${productAfterDefaultQuantity.values?.inventory}`);

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
      discountCode: 'SMOKE10',
    }),
  });

  const order = orderPayload.data?.order;
  const customer = orderPayload.data?.customer;
  const checkoutSession = orderPayload.data?.checkoutSession;
  const quote = orderPayload.data?.quote;
  const deliveries = orderPayload.data?.deliveries || [];
  assert(order?.id, `Public order intake did not return an order: ${JSON.stringify(orderPayload).slice(0, 500)}`);
  assert(customer?.id, `Public order intake did not return a customer link: ${JSON.stringify(orderPayload).slice(0, 500)}`);
  assert(deliveries.some((delivery) => delivery.channel === 'email' && delivery.status === 'succeeded' && delivery.provider === 'local-outbox'), `Public order intake did not report local order email delivery: ${JSON.stringify(deliveries)}`);
  assert(deliveries.some((delivery) => delivery.channel === 'email' && delivery.event === 'product.low_stock' && delivery.status === 'succeeded' && delivery.provider === 'local-outbox'), `Public order intake did not report product low-stock email delivery: ${JSON.stringify(deliveries)}`);
  assert(checkoutSession?.id === `cs_${slug}`, `Checkout session id was unexpected: ${JSON.stringify(checkoutSession)}`);
  assert(checkoutSession.provider === 'manual', `Checkout session provider was unexpected: ${JSON.stringify(checkoutSession)}`);
  assert(checkoutSession.amountTotal === 106.86, `Checkout session amount was unexpected: ${JSON.stringify(checkoutSession)}`);
  assert(checkoutSession.url?.includes('/checkout/success'), `Checkout session handoff URL was unexpected: ${JSON.stringify(checkoutSession)}`);
  assert(quote?.subtotal === 98, `Quote subtotal was unexpected: ${JSON.stringify(quote)}`);
  assert(quote.discountAmount === 11.76, `Quote discount was unexpected: ${JSON.stringify(quote)}`);
  assert(quote.shippingAmount === 12, `Quote shipping was unexpected: ${JSON.stringify(quote)}`);
  assert(quote.taxAmount === 8.62, `Quote tax was unexpected: ${JSON.stringify(quote)}`);
  assert(order.total === 106.86, `Order total was unexpected: ${JSON.stringify({ order, quote })}`);
  assert(quote.pricing?.rules?.taxRatePercent === 10, `Quote pricing rules were not exposed: ${JSON.stringify(quote)}`);
  assert(order.itemCount === 2, `Order item count was unexpected: ${order.itemCount}`);
  assert(orderPayload.data?.risk?.level === 'medium' && orderPayload.data?.risk?.reviewStatus === 'pending_review', `Order risk assessment was not returned: ${JSON.stringify(orderPayload.data?.risk)}`);

  const updatedProduct = await getCollectionRecordBySlug(productCollection.id, slug);
  assert(updatedProduct.values?.inventory === 4, `Inventory reservation did not reduce stock to 4 after default and explicit checkout quantities: ${updatedProduct.values?.inventory}`);

  const orderRecord = await getCollectionRecordBySlug(ordersCollection.id, order.slug);
  assert(orderRecord?.id, `Order record was not available in private queue by slug ${order.slug}`);
  assert(orderRecord.values?.customername === 'Commerce Smoke Buyer', 'Order customer name was not persisted');
  assert(orderRecord.values?.customerid === customer.id, `Order did not link to the private customer profile: ${JSON.stringify(orderRecord.values)}`);
  assert(orderRecord.values?.checkoutsessionid === checkoutSession.id, `Order checkout session was not persisted: ${JSON.stringify(orderRecord.values)}`);
  assert(orderRecord.values?.paymentprovider === checkoutSession.provider, `Order payment provider was not persisted: ${JSON.stringify(orderRecord.values)}`);
  assert(orderRecord.values?.paymentreference === checkoutSession.reference, `Order payment reference was not persisted: ${JSON.stringify(orderRecord.values)}`);
  assert(orderRecord.values?.subtotal === 98, `Order subtotal was not persisted: ${JSON.stringify(orderRecord.values)}`);
  assert(orderRecord.values?.discountamount === 11.76, `Order discount was not persisted: ${JSON.stringify(orderRecord.values)}`);
  assert(orderRecord.values?.shippingamount === 12, `Order shipping was not persisted: ${JSON.stringify(orderRecord.values)}`);
  assert(orderRecord.values?.taxamount === 8.62, `Order tax was not persisted: ${JSON.stringify(orderRecord.values)}`);
  assert(orderRecord.values?.riskscore === 25, `Order risk score was not persisted: ${JSON.stringify(orderRecord.values)}`);
  assert(orderRecord.values?.risklevel === 'medium', `Order risk level was not persisted: ${JSON.stringify(orderRecord.values)}`);
  assert(orderRecord.values?.riskreviewstatus === 'pending_review', `Order risk review status was not persisted: ${JSON.stringify(orderRecord.values)}`);
  assert(String(orderRecord.values?.riskreasons || '').includes('Manual payment capture'), `Order risk reasons were not persisted: ${JSON.stringify(orderRecord.values)}`);
  assert(orderRecord.values?.shippinglabelstatus === 'none', `Order shipping label default was not persisted: ${JSON.stringify(orderRecord.values)}`);
  assert(orderRecord.values?.providerrefundstatus === 'none', `Order provider refund default was not persisted: ${JSON.stringify(orderRecord.values)}`);

  const orderEventsPayload = await requestApi(`/api/sites/${SITE_ID}/events?kind=commerce-order&requestId=${encodeURIComponent(orderPayload.requestId || '')}&limit=20`);
  const orderEvents = orderEventsPayload.data?.events || orderEventsPayload.events || [];
  const orderDeliveryEvents = orderEvents.filter((event) => event.metadata?.orderId === order.id && event.metadata?.channel === 'email');
  const orderDeliveryStatuses = new Set(orderDeliveryEvents.map((event) => event.status));
  assert(orderDeliveryStatuses.has('queued') && orderDeliveryStatuses.has('succeeded'), `Commerce order delivery events were not exposed through /events: ${JSON.stringify(orderEventsPayload)}`);
  const succeededOrderEmailEvent = orderDeliveryEvents.find((event) => event.status === 'succeeded');
  assert(succeededOrderEmailEvent?.target === 'mailto:commerce-ops@example.com', `Commerce order delivery target was unexpected: ${JSON.stringify(succeededOrderEmailEvent)}`);
  assert(succeededOrderEmailEvent?.metadata?.provider === 'local-outbox', `Commerce order delivery provider metadata was unexpected: ${JSON.stringify(succeededOrderEmailEvent)}`);
  assert(succeededOrderEmailEvent?.metadata?.orderNumber === order.orderNumber, `Commerce order delivery metadata did not include order number: ${JSON.stringify(succeededOrderEmailEvent)}`);
  const productEventsPayload = await requestApi(`/api/sites/${SITE_ID}/events?kind=commerce-product&requestId=${encodeURIComponent(orderPayload.requestId || '')}&limit=20`);
  const productEvents = productEventsPayload.data?.events || productEventsPayload.events || [];
  const productDeliveryEvents = productEvents.filter((event) => event.metadata?.productSlug === slug && event.metadata?.event === 'product.low_stock');
  const productDeliveryStatuses = new Set(productDeliveryEvents.map((event) => event.status));
  assert(productDeliveryStatuses.has('queued') && productDeliveryStatuses.has('succeeded'), `Product low-stock delivery events were not exposed through /events: ${JSON.stringify(productEventsPayload)}`);
  const succeededProductEmailEvent = productDeliveryEvents.find((event) => event.status === 'succeeded');
  assert(succeededProductEmailEvent?.target === 'mailto:commerce-ops@example.com', `Product low-stock delivery target was unexpected: ${JSON.stringify(succeededProductEmailEvent)}`);
  assert(succeededProductEmailEvent?.metadata?.provider === 'local-outbox', `Product low-stock provider metadata was unexpected: ${JSON.stringify(succeededProductEmailEvent)}`);
  assert(succeededProductEmailEvent?.metadata?.inventory === 4, `Product low-stock inventory metadata was unexpected: ${JSON.stringify(succeededProductEmailEvent)}`);
  assert(succeededProductEmailEvent?.metadata?.lowStockThreshold === 4, `Product low-stock threshold metadata was unexpected: ${JSON.stringify(succeededProductEmailEvent)}`);
  assert(orderRecord.values?.total === 106.86, `Order quote total was not persisted: ${JSON.stringify(orderRecord.values)}`);

  const customersCollection = await findCollection(CUSTOMERS_COLLECTION_SLUG);
  assert(customersCollection?.id, 'Private customers collection was not created from checkout intake');
  assert(customersCollection.permissions?.publicRead === false && customersCollection.permissions?.publicCreate === false, `Customers collection was not private: ${JSON.stringify(customersCollection.permissions)}`);
  const customerRecord = await getCollectionRecordBySlug(customersCollection.id, customer.slug);
  assert(customerRecord?.id === customer.id, `Customer record was not available by slug ${customer.slug}: ${JSON.stringify(customerRecord)}`);
  assert(customerRecord.values?.email === 'commerce-smoke@example.com', `Customer email was not persisted: ${JSON.stringify(customerRecord.values)}`);
  assert(customerRecord.values?.ordercount === 1, `Customer order count was unexpected: ${JSON.stringify(customerRecord.values)}`);
  assert(customerRecord.values?.totalspent === 106.86, `Customer total spent was unexpected: ${JSON.stringify(customerRecord.values)}`);
  assert(customerRecord.values?.lastorderid === order.id, `Customer last order id was unexpected: ${JSON.stringify(customerRecord.values)}`);
  assert(customerRecord.values?.lastordernumber === order.orderNumber, `Customer last order number was unexpected: ${JSON.stringify(customerRecord.values)}`);
  assert(customerRecord.values?.sourcevalues?.lastCheckoutOrder?.orderId === order.id, `Customer source order id was unexpected: ${JSON.stringify(customerRecord.values?.sourcevalues)}`);

  const webhookRequestId = `commerce-webhook-${slug}`;
  const webhookBody = {
    id: `evt_${slug}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: checkoutSession.id,
        payment_intent: `pi_${slug}`,
        amount_total: Math.round(checkoutSession.amountTotal * 100),
        currency: checkoutSession.currency.toLowerCase(),
        metadata: {
          orderNumber: order.orderNumber,
          orderSlug: order.slug,
        },
      },
    },
  };
  const invalidSignatureResponse = await fetch(`${API_BASE_URL}/api/sites/${SITE_ID}/commerce/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': `${webhookRequestId}-invalid-signature`,
      'x-backy-webhook-signature': 'sha256=0000000000000000000000000000000000000000000000000000000000000000',
    },
    body: JSON.stringify(webhookBody),
  });
  const invalidSignaturePayload = await invalidSignatureResponse.json().catch(() => ({}));
  assert(invalidSignatureResponse.status === 401, `Invalid commerce webhook signature should be rejected: ${invalidSignatureResponse.status} ${JSON.stringify(invalidSignaturePayload)}`);
  assert(invalidSignaturePayload?.error?.code === 'COMMERCE_WEBHOOK_SIGNATURE_INVALID', `Invalid commerce webhook signature returned wrong code: ${JSON.stringify(invalidSignaturePayload)}`);

  const webhookPayload = await postCommerceWebhook(webhookBody, { 'x-request-id': webhookRequestId });
  assert(webhookPayload.data?.event?.status === 'paid', `Commerce webhook did not mark payment paid: ${JSON.stringify(webhookPayload)}`);
  assert(webhookPayload.data?.order?.paymentStatus === 'paid', `Commerce webhook order response was unexpected: ${JSON.stringify(webhookPayload)}`);

  const settledOrderRecord = await getCollectionRecordBySlug(ordersCollection.id, order.slug);
  assert(settledOrderRecord.values?.orderstatus === 'paid', `Webhook did not persist paid order status: ${JSON.stringify(settledOrderRecord.values)}`);
  assert(settledOrderRecord.values?.paymentstatus === 'paid', `Webhook did not persist paid payment status: ${JSON.stringify(settledOrderRecord.values)}`);
  assert(settledOrderRecord.values?.paymentreference === `pi_${slug}`, `Webhook did not persist payment reference: ${JSON.stringify(settledOrderRecord.values)}`);
  assert(Boolean(settledOrderRecord.values?.paidat), `Webhook did not persist paid timestamp: ${JSON.stringify(settledOrderRecord.values)}`);
  assert(String(settledOrderRecord.values?.notes || '').includes('checkout.session.completed'), `Webhook settlement note missing: ${JSON.stringify(settledOrderRecord.values)}`);

  const duplicateWebhookPayload = await postCommerceWebhook(webhookBody, { 'x-request-id': `${webhookRequestId}-duplicate` });
  assert(duplicateWebhookPayload.data?.event?.status === 'duplicate', `Duplicate commerce webhook was not idempotent: ${JSON.stringify(duplicateWebhookPayload)}`);
  const duplicateOrderRecord = await getCollectionRecordBySlug(ordersCollection.id, order.slug);
  const settlementNoteMatches = String(duplicateOrderRecord.values?.notes || '').match(/checkout\.session\.completed/g) || [];
  assert(settlementNoteMatches.length === 1, `Duplicate commerce webhook appended a second settlement note: ${JSON.stringify(duplicateOrderRecord.values)}`);

  const commerceEventsPayload = await requestApi(`/api/sites/${SITE_ID}/events?kind=commerce-webhook&requestId=${encodeURIComponent(webhookRequestId)}`);
  const commerceEvents = commerceEventsPayload.data?.events || commerceEventsPayload.events || [];
  const commerceEvent = commerceEvents.find((event) => event.metadata?.providerEventId === `evt_${slug}`);
  assert(commerceEvent?.status === 'succeeded', `Commerce webhook event was not exposed through /events: ${JSON.stringify(commerceEventsPayload)}`);
  assert(commerceEvent.metadata?.orderId === order.id, `Commerce webhook event did not include order id: ${JSON.stringify(commerceEvent)}`);

  const stripeCheckoutExecution = await assertStripeCheckoutExecution({
    productCollection,
    ordersCollection,
    customersCollection,
    slug,
  });

  return { productRecord, updatedProduct, order, orderRecord: settledOrderRecord, customersCollection, customerRecord, stripeCheckoutExecution };
};

const assertStripeCheckoutExecution = async ({
  productCollection,
  ordersCollection,
  customersCollection,
  slug,
}) => {
  if (!stripeCheckoutExecutionEnabled()) {
    return { skipped: true, reason: 'BACKY_STRIPE_SECRET_KEY and BACKY_STRIPE_API_BASE_URL mock env were not configured' };
  }

  const beforeRequests = stripeCheckoutMock?.requests.length || 0;
  const settingsBefore = await getSettings();
  await enableStripeCommerceSettings();

  try {
    const stripePayload = await requestApi(`/api/sites/${SITE_ID}/commerce/orders`, {
      method: 'POST',
      body: JSON.stringify({
        customer: {
          name: 'Commerce Stripe Smoke Buyer',
          email: 'commerce-stripe-smoke@example.com',
        },
        items: [{ slug, quantity: 1 }],
        shippingAddress: '200 Provider Street, New York, NY',
        billingAddress: '200 Provider Street, New York, NY',
        notes: 'Smoke order created through Stripe checkout execution.',
      }),
    });

    const checkoutSession = stripePayload.data?.checkoutSession;
    const order = stripePayload.data?.order;
    assert(checkoutSession?.provider === 'stripe', `Stripe checkout did not select Stripe provider: ${JSON.stringify(checkoutSession)}`);
    assert(checkoutSession.status === 'provider_created', `Stripe checkout was not executed: ${JSON.stringify(checkoutSession)}`);
    assert(/^cs_mock_/.test(checkoutSession.id), `Stripe checkout did not return provider session id: ${JSON.stringify(checkoutSession)}`);
    assert(checkoutSession.url === `${STRIPE_MOCK_BASE_URL}/checkout/${checkoutSession.id}`, `Stripe checkout did not expose provider URL: ${JSON.stringify(checkoutSession)}`);
    assert(checkoutSession.reference === `stripe:${checkoutSession.id}`, `Stripe checkout reference did not use provider session id: ${JSON.stringify(checkoutSession)}`);
    assert(checkoutSession.providerPayload?.providerResponse?.id === checkoutSession.id, `Stripe provider response was not exposed safely: ${JSON.stringify(checkoutSession.providerPayload)}`);

    const stripeRequest = stripeCheckoutMock.requests[beforeRequests];
    assert(stripeRequest?.method === 'POST' && stripeRequest.url === '/v1/checkout/sessions', `Stripe mock did not receive checkout session create: ${JSON.stringify(stripeCheckoutMock.requests)}`);
    const expectedSecret = process.env.BACKY_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
    assert(stripeRequest.headers.authorization === `Bearer ${expectedSecret}`, `Stripe mock did not receive bearer auth: ${JSON.stringify(stripeRequest.headers)}`);
    assert(stripeRequest.form.mode === 'payment', `Stripe checkout form did not request payment mode: ${JSON.stringify(stripeRequest.form)}`);
    assert(stripeRequest.form.client_reference_id === checkoutSession.metadata.orderNumber, `Stripe checkout form did not include order reference: ${JSON.stringify(stripeRequest.form)}`);
    assert(stripeRequest.form['metadata[siteId]'] === SITE_ID, `Stripe checkout form did not include site metadata: ${JSON.stringify(stripeRequest.form)}`);
    assert(stripeRequest.form['metadata[orderSlug]'] === checkoutSession.metadata.orderSlug, `Stripe checkout form did not include order slug metadata: ${JSON.stringify(stripeRequest.form)}`);
    assert(stripeRequest.form.success_url?.includes('{CHECKOUT_SESSION_ID}'), `Stripe checkout success URL did not include provider session placeholder: ${JSON.stringify(stripeRequest.form)}`);
    assert(Number(stripeRequest.form['line_items[0][price_data][unit_amount]']) === Math.round(checkoutSession.amountTotal * 100), `Stripe checkout amount did not match quote total: ${JSON.stringify({ form: stripeRequest.form, checkoutSession })}`);

    const orderRecord = await getCollectionRecordBySlug(ordersCollection.id, order.slug);
    assert(orderRecord.values?.checkoutsessionid === checkoutSession.id, `Stripe checkout session id was not persisted: ${JSON.stringify(orderRecord.values)}`);
    assert(orderRecord.values?.paymentprovider === 'stripe', `Stripe payment provider was not persisted: ${JSON.stringify(orderRecord.values)}`);
    assert(orderRecord.values?.paymentreference === `stripe:${checkoutSession.id}`, `Stripe payment reference was not persisted: ${JSON.stringify(orderRecord.values)}`);

    const stripeCustomerRecord = customersCollection?.id
      ? await getCollectionRecordBySlug(customersCollection.id, 'commerce-stripe-smoke-at-example-com')
      : null;
    if (stripeCustomerRecord?.id) {
      await deleteCollectionRecord(customersCollection.id, stripeCustomerRecord.id);
    }
    if (orderRecord?.id) {
      await deleteCollectionRecord(ordersCollection.id, orderRecord.id);
    }

    return {
      skipped: false,
      sessionId: checkoutSession.id,
      providerUrl: checkoutSession.url,
      amountTotal: checkoutSession.amountTotal,
      requestCount: stripeCheckoutMock.requests.length - beforeRequests,
    };
  } finally {
    await patchSettingsFromSnapshot(settingsBefore);
  }
};

const assertProductCsvImport = async ({ productCollection, suffix }) => {
  const slug = `commerce-import-${suffix}`;
  const headers = [
    'slug',
    'status',
    'scheduledAt',
    'title',
    'sku',
    'price',
    productFieldKey('compareAtPrice'),
    'currency',
    'variants',
    'inventory',
    productFieldKey('lowStockThreshold'),
    productFieldKey('inventoryPolicy'),
    productFieldKey('productType'),
    productFieldKey('downloadUrl'),
    productFieldKey('checkoutUrl'),
    productFieldKey('subscriptionEnabled'),
    productFieldKey('subscriptionInterval'),
    productFieldKey('subscriptionTrialDays'),
    productFieldKey('shippingRequired'),
    productFieldKey('shippingProfile'),
    'weight',
    productFieldKey('taxClass'),
    productFieldKey('discountCode'),
    productFieldKey('returnPolicy'),
    productFieldKey('imageUrl'),
    productFieldKey('galleryImages'),
    'category',
    'tags',
    'vendor',
    'description',
    productFieldKey('seoTitle'),
    'featured',
    'taxable',
  ];
  const row = [
    slug,
    'published',
    '',
    `Imported Commerce ${suffix}`,
    `CSV-${suffix.toUpperCase()}`,
    '99',
    '129',
    'USD',
    JSON.stringify([{ id: 'csv-team', title: 'Team', sku: `CSV-${suffix.toUpperCase()}-TEAM`, option: 'Seats', price: 149, inventory: 3 }]),
    '0',
    '4',
    'continue',
    'digital',
    `https://downloads.example.com/${slug}.zip`,
    '',
    'true',
    'yearly',
    '30',
    'false',
    'digital-delivery',
    '',
    'digital-standard',
    'CSV10',
    'CSV imports can be refunded within 7 days.',
    'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 fill=%22%230f766e%22/%3E%3Ctext x=%2232%22 y=%2238%22 text-anchor=%22middle%22 font-size=%2214%22 fill=%22white%22%3ECSV%3C/text%3E%3C/svg%3E',
    JSON.stringify(['data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 fill=%22%230f766e%22/%3E%3Ctext x=%2232%22 y=%2238%22 text-anchor=%22middle%22 font-size=%2214%22 fill=%22white%22%3ECSV%3C/text%3E%3C/svg%3E']),
    'Templates',
    'csv,imported',
    'Backy',
    'Imported by the commerce smoke test.',
    `Imported Commerce ${suffix}`,
    'true',
    'false',
  ];
  const csv = `${headers.join(',')}\n${row.map(csvEscape).join(',')}\n`;

  const result = await requestApi(`/api/admin/sites/${SITE_ID}/collections/${productCollection.id}/records/import?upsert=true`, {
    method: 'POST',
    headers: { 'content-type': 'text/csv; charset=utf-8' },
    body: csv,
  });
  const summary = result.data?.import;
  assert(summary?.created === 1 || summary?.updated === 1, `Product CSV import did not save a record: ${JSON.stringify(summary)}`);
  assert(summary.skipped === 0, `Product CSV import skipped rows: ${JSON.stringify(summary)}`);

  const record = await getCollectionRecordBySlug(productCollection.id, slug);
  assert(record?.id, `Imported product was not found by slug ${slug}`);
  assert(record.values?.price === 99, `Imported price did not stay numeric: ${JSON.stringify(record.values?.price)}`);
  assert(record.values?.inventory === 0, `Imported digital inventory did not stay numeric zero: ${JSON.stringify(record.values?.inventory)}`);
  assert(readProductValue(record.values, 'subscriptionEnabled') === true, `Imported subscription flag did not stay boolean true: ${JSON.stringify(readProductValue(record.values, 'subscriptionEnabled'))}`);
  assert(readProductValue(record.values, 'subscriptionInterval') === 'yearly', `Imported subscription interval did not persist: ${JSON.stringify(readProductValue(record.values, 'subscriptionInterval'))}`);
  assert(readProductValue(record.values, 'subscriptionTrialDays') === 30, `Imported subscription trial days did not stay numeric: ${JSON.stringify(readProductValue(record.values, 'subscriptionTrialDays'))}`);
  assert(readProductValue(record.values, 'shippingRequired') === false, `Imported shipping flag did not stay boolean false: ${JSON.stringify(readProductValue(record.values, 'shippingRequired'))}`);
  assert(readProductValue(record.values, 'shippingProfile') === 'digital-delivery', `Imported shipping profile did not persist: ${JSON.stringify(readProductValue(record.values, 'shippingProfile'))}`);
  assert(readProductValue(record.values, 'taxClass') === 'digital-standard', `Imported tax class did not persist: ${JSON.stringify(readProductValue(record.values, 'taxClass'))}`);
  assert(readProductValue(record.values, 'discountCode') === 'CSV10', `Imported discount code did not persist: ${JSON.stringify(readProductValue(record.values, 'discountCode'))}`);
  assert(readProductValue(record.values, 'returnPolicy') === 'CSV imports can be refunded within 7 days.', `Imported return policy did not persist: ${JSON.stringify(readProductValue(record.values, 'returnPolicy'))}`);
  assert(record.values?.taxable === false, `Imported taxable flag did not stay boolean false: ${JSON.stringify(record.values?.taxable)}`);
  assert(record.values?.featured === true, `Imported featured flag did not stay boolean true: ${JSON.stringify(record.values?.featured)}`);
  assert(Array.isArray(record.values?.tags) && record.values.tags.includes('imported'), `Imported tags did not parse as an array: ${JSON.stringify(record.values?.tags)}`);
  assert(Array.isArray(record.values?.variants) && record.values.variants.length === 1, `Imported variants did not parse JSON: ${JSON.stringify(record.values?.variants)}`);

  const catalog = await requestApi(`/api/sites/${SITE_ID}/commerce/catalog?slug=${encodeURIComponent(slug)}`);
  const product = catalog.data?.products?.[0] || catalog.products?.[0];
  assert(product?.productType === 'digital', `Imported public product type was unexpected: ${JSON.stringify(product)}`);
  assert(product.inventory?.quantity === 0, `Imported public inventory quantity was unexpected: ${JSON.stringify(product?.inventory)}`);
  assert(product.inventory?.inStock === true, `Imported zero-inventory digital product should be in stock: ${JSON.stringify(product?.inventory)}`);
  assert(product.inventory?.lowStock === false, `Imported zero-inventory digital product should not be low stock: ${JSON.stringify(product?.inventory)}`);
  assert(product.subscription?.enabled === true && product.subscription?.interval === 'yearly' && product.subscription?.trialDays === 30, `Imported public subscription metadata was unexpected: ${JSON.stringify(product?.subscription)}`);

  return record;
};

const assertProductsLayout = async (client) => {
  await clickByText(client, 'Refresh', { exact: true }).catch(() => null);
  await waitUntilIdle(client, '/products refresh before layout assertion');

  let layout = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    layout = await evaluate(client, `(() => {
      const productPerformance = document.querySelector('[data-testid="products-product-performance"]');
      const productPerformanceText = productPerformance?.textContent || '';
      const productAutomation = document.querySelector('[data-testid="products-notification-automation"]');
      const productAutomationText = productAutomation?.textContent || '';
      return {
        width: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        hasCommandCenter: Boolean(document.querySelector('[data-testid="products-command-center"]')),
        hasApiPanel: document.body?.innerText?.includes('Storefront API') || false,
        hasCommerceAnalytics: Boolean(document.querySelector('[data-testid="products-commerce-analytics"]')) &&
          document.body?.innerText?.includes('Commerce analytics and customer profiles') &&
          document.body?.innerText?.includes('Paid revenue') &&
          document.body?.innerText?.includes('Customer profiles'),
        hasProductPerformance: Boolean(productPerformance) &&
          productPerformanceText.includes('Product performance') &&
          productPerformanceText.includes('ranked') &&
          /\\b[1-9][0-9]*\\s+unit/.test(productPerformanceText),
        productPerformanceText,
        hasProductAutomation: Boolean(productAutomation) &&
          productAutomationText.includes('Product automation') &&
          productAutomationText.includes('/events?kind=commerce-product') &&
          productAutomationText.includes('product.low_stock') &&
          productAutomationText.includes('4 in stock'),
        productAutomationText,
        hasCustomerProfileManager: Boolean(document.querySelector('[data-testid="products-customer-profile-manager"]')) &&
          document.body?.innerText?.includes('Manage profile') &&
          document.body?.innerText?.includes('Save profile'),
        hasSubscriptionMetadata: Boolean(document.querySelector('[data-testid="products-subscription-metadata"]')) &&
          document.body?.innerText?.includes('Subscription metadata') &&
          document.body?.innerText?.includes('Trial days'),
        hasPageBindingContract: Boolean(document.querySelector('[data-testid="products-page-binding-contract"]')) &&
          document.body?.innerText?.includes('Page and editor binding contract') &&
          document.body?.innerText?.includes('Product card blocks') &&
          document.body?.innerText?.includes('Cart and order intake'),
        hasProductPageTemplates: Boolean(document.querySelector('[data-testid="products-page-templates"]')) &&
          Boolean(document.querySelector('[data-testid="products-page-template-list"]')) &&
          Boolean(document.querySelector('[data-testid="products-page-template-item"]')) &&
          Boolean(document.querySelector('[data-testid="products-page-template-featured-collection"]')) &&
          Boolean(document.querySelector('[data-testid="products-page-template-product-launch"]')) &&
          document.body?.innerText?.includes('Product page templates') &&
          document.body?.innerText?.includes('Featured collection') &&
          document.body?.innerText?.includes('Product launch') &&
          document.body?.innerText?.includes('Route model'),
        hasEditor: document.body?.innerText?.includes('New product') || document.body?.innerText?.includes('Edit product') || false,
        hasImportControls: document.body?.innerText?.includes('Import CSV') && document.body?.innerText?.includes('CSV template'),
      };
    })()`);
    if (layout.hasProductPerformance && layout.hasProductAutomation) {
      break;
    }
    await sleep(250);
  }

  assert(layout.scrollWidth <= layout.width + 8, `Products page has horizontal overflow: ${JSON.stringify(layout)}`);
  assert(layout.hasCommandCenter && layout.hasApiPanel && layout.hasCommerceAnalytics && layout.hasProductPerformance && layout.hasProductAutomation && layout.hasCustomerProfileManager && layout.hasSubscriptionMetadata && layout.hasPageBindingContract && layout.hasProductPageTemplates && layout.hasEditor && layout.hasImportControls, `Products page missing expected regions: ${JSON.stringify(layout)}`);
  return layout;
};

const assertCustomerProfileManagement = async (client, customersCollection, customerRecord) => {
  assert(customersCollection?.id, 'Customers collection is required for profile management smoke coverage');
  assert(customerRecord?.id, 'Customer record is required for profile management smoke coverage');

  await navigateToRoute(client, '/products', 'products-command-center', 'Catalog command center');

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const selector = document.querySelector('[aria-label="Customer profile"]');
      const manager = document.querySelector('[data-testid="products-customer-profile-manager"]');
      return {
        hasSelector: selector instanceof HTMLSelectElement,
        hasCustomerOption: selector instanceof HTMLSelectElement
          ? Array.from(selector.options).some((option) => option.value === ${JSON.stringify(customerRecord.id)})
          : false,
        hasManager: Boolean(manager),
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`);
    if (state.hasSelector && state.hasCustomerOption && state.hasManager) {
      break;
    }
    if (attempt === 99) {
      throw new Error(`Customer profile manager did not load checkout customer: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  await setAriaControl(client, 'Customer profile', customerRecord.id);
  await setLabeledControl(client, 'Customer name', 'Commerce Smoke VIP Buyer', { exact: true });
  await setLabeledControl(client, 'Customer phone', '+1 555 0199', { exact: true });
  await setLabeledControl(client, 'Customer status', 'vip');
  await setLabeledControl(client, 'Customer notes', 'Flagged by commerce smoke profile management.', { exact: true });
  await clickByText(client, 'Save profile', { exact: true });
  await waitUntilIdle(client, '/products customer profile');

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const updated = await getCollectionRecordBySlug(customersCollection.id, customerRecord.slug);
    if (
      updated?.values?.name === 'Commerce Smoke VIP Buyer' &&
      updated.values?.status === 'vip' &&
      updated.values?.phone === '+1 555 0199' &&
      String(updated.values?.notes || '').includes('commerce smoke profile management')
    ) {
      return updated;
    }
    await sleep(250);
  }

  const current = await getCollectionRecordBySlug(customersCollection.id, customerRecord.slug);
  throw new Error(`Customer profile management did not persist changes: ${JSON.stringify(current?.values)}`);
};

const assertProductPageTemplateShortcut = async (client, productCollection, template) => {
  const mode = template.mode;
  const testId = template.testId || `products-page-template-${mode}`;
  await navigateToRoute(client, '/products', 'products-command-center', 'Catalog command center');

  let clickState = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    clickState = await evaluate(client, `(() => {
      const button = document.querySelector('[data-testid="${testId}"]');
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return {
          ok: false,
          button: button?.textContent || null,
          disabled: button instanceof HTMLButtonElement ? button.disabled : null,
          hasTemplates: Boolean(document.querySelector('[data-testid="products-page-templates"]')),
          body: document.body?.innerText?.slice(0, 900) || '',
        };
      }
      button.click();
      return { ok: true, text: button.textContent || '' };
    })()`);

    if (clickState.ok) {
      break;
    }

    if (attempt === 99) {
      break;
    }

    await sleep(250);
  }

  assert(clickState.ok, `Unable to click product ${mode} page template shortcut: ${JSON.stringify(clickState)}`);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const params = new URLSearchParams(window.location.search);
      const payload = JSON.parse(document.querySelector('#page-payload pre')?.textContent || '{}');
      const importPanel = document.querySelector('[data-testid="page-create-dataset-import"]');
      const createButton = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent || '').includes('Create Page'));
      return {
        path: window.location.pathname,
        template: params.get('template') || '',
        collectionId: params.get('collectionId') || '',
        datasetMode: params.get('datasetMode') || '',
        title: document.querySelector('#page-title')?.value || '',
        slug: document.querySelector('#page-slug')?.value || '',
        nav: document.querySelector('#page-navigation-placement-select')?.value || '',
        payloadTemplate: payload.template || '',
        payloadDatasetMode: payload.datasetImport?.mode || '',
        payloadCollectionId: payload.datasetImport?.collectionId || '',
        importPanel: Boolean(importPanel),
        importText: importPanel?.textContent || '',
        createButtonDisabled: createButton instanceof HTMLButtonElement ? createButton.disabled : null,
        body: document.body?.innerText?.slice(0, 900) || '',
      };
    })()`);

    if (
      state.path === '/pages/new' &&
      state.template === 'storefront' &&
      state.collectionId === productCollection.id &&
      state.datasetMode === mode &&
      state.title === template.title &&
      state.slug === template.slug &&
      state.nav === template.nav &&
      state.payloadTemplate === 'storefront' &&
      state.payloadDatasetMode === mode &&
      state.payloadCollectionId === productCollection.id &&
      state.importPanel &&
      state.importText.includes(productCollection.name) &&
      state.importText.includes(productCollection.id) &&
      state.createButtonDisabled === false
    ) {
      return state;
    }

    if (attempt === 99) {
      throw new Error(`Product ${mode} page template did not open dataset page creation: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const assertDigitalStockFilters = async (client, productTitle) => {
  const navigateToProductFilter = async (stock) => {
    const url = new URL(`${ADMIN_BASE_URL}/products`);
    url.searchParams.set('siteId', SITE_ID);
    url.searchParams.set('type', 'digital');
    url.searchParams.set('stock', stock);
    url.searchParams.set('q', productTitle);
    await client.send('Page.navigate', { url: url.toString() });

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const state = await evaluate(client, `(() => {
        const body = document.body?.innerText || '';
        const stockFilter = document.querySelector('select[aria-label="Product stock filter"]');
        const typeFilter = document.querySelector('select[aria-label="Product type filter"]');
        const search = document.querySelector('input[aria-label="Search products"]');
        return {
          ready: Boolean(document.querySelector('[data-testid="products-command-center"]')),
          stockValue: stockFilter instanceof HTMLSelectElement ? stockFilter.value : null,
          typeValue: typeFilter instanceof HTMLSelectElement ? typeFilter.value : null,
          searchValue: search instanceof HTMLInputElement ? search.value : null,
          hasProduct: body.includes(${JSON.stringify(productTitle)}),
          hasAvailableStock: body.includes('Available') && body.includes('No physical stock limit'),
          hasEmptyState: body.includes('No products match this view') || body.includes('No products found'),
          body: body.slice(0, 1200),
        };
      })()`);

      if (
        state.ready &&
        state.stockValue === stock &&
        state.typeValue === 'digital' &&
        state.searchValue === productTitle &&
        (state.hasProduct || state.hasEmptyState)
      ) {
        return state;
      }

      if (attempt === 99) {
        throw new Error(`Digital stock filter did not hydrate for ${stock}: ${JSON.stringify(state)}`);
      }
      await sleep(250);
    }

    return null;
  };

  const inStockState = await navigateToProductFilter('in-stock');
  assert(inStockState.hasProduct && inStockState.hasAvailableStock, `Zero-inventory digital product should appear in stock: ${JSON.stringify(inStockState)}`);

  const outOfStockState = await navigateToProductFilter('out-of-stock');
  assert(!outOfStockState.hasProduct && outOfStockState.hasEmptyState, `Zero-inventory digital product should not appear out of stock: ${JSON.stringify(outOfStockState)}`);

  await navigateToRoute(client, '/products', 'products-command-center', 'Catalog command center');
  return { inStockState, outOfStockState };
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
  await loginAdminApi();
  const suffix = Date.now().toString(36);
  const originalSettings = await getSettings();
  await enableCommercePricingSettings(originalSettings);
  const originalFrontendDesign = await getFrontendDesign();
  await patchFrontendDesign(smokeFrontendDesignContract());
  const originalProductCollection = snapshotCollection(await findCollection(PRODUCT_COLLECTION_SLUG));
  const originalOrdersCollection = snapshotCollection(await findCollection(ORDERS_COLLECTION_SLUG));
  const originalCustomerCollection = snapshotCollection(await findCollection(CUSTOMERS_COLLECTION_SLUG));
  const apiSchemaSetup = await ensureCommerceSchemasReadyViaApi();
  const { childProcess, userDataDir } = launchChrome();
  let client;
  let frontendProductRecordId = null;
  let productRecordId = null;
  let importedProductRecordId = null;
  let orderRecordId = null;
  let customerRecordId = null;
  let finalProductCollection = null;
  let finalOrdersCollection = null;
  let finalCustomerCollection = null;
  let frontendProductCleaned = false;
  let restored = false;
  let frontendTemplateProduct = null;
  let frontendCatalogProduct = null;
  let managedCustomerProfile = null;

  try {
    stripeCheckoutMock = stripeCheckoutExecutionEnabled() ? await startStripeCheckoutMock() : null;
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

    const ordersReady = await ensureOrdersReady(client);
    const productsReady = await ensureProductsReady(client);

    finalProductCollection = await findCollection(PRODUCT_COLLECTION_SLUG);
    assert(finalProductCollection?.id, 'Products collection was not available after UI setup');
    await deleteExistingFrontendTemplateProducts(finalProductCollection);
    await clickFrontendTemplateCreateProduct(client);
    frontendTemplateProduct = await waitForFrontendTemplateProduct(finalProductCollection);
    frontendProductRecordId = frontendTemplateProduct.id;
    frontendCatalogProduct = await assertFrontendTemplateProduct({
      productCollection: finalProductCollection,
      record: frontendTemplateProduct,
    });
    await deleteCollectionRecord(finalProductCollection.id, frontendProductRecordId);
    frontendProductRecordId = null;
    frontendProductCleaned = true;
    await clickByText(client, 'New product');

    const { slug } = await fillProductEditor(client, suffix);

    finalProductCollection = await findCollection(PRODUCT_COLLECTION_SLUG);
    finalOrdersCollection = await findCollection(ORDERS_COLLECTION_SLUG);
    assert(finalProductCollection?.id, 'Products collection was not available after UI setup');
    assert(finalOrdersCollection?.id, 'Orders collection was not available after UI setup');
    finalOrdersCollection = await assertOrderIntakeReadinessRequiresPrivateOrders(finalOrdersCollection);

    const importedProduct = await assertProductCsvImport({
      productCollection: finalProductCollection,
      suffix,
    });
    importedProductRecordId = importedProduct.id;
    await assertDigitalStockFilters(client, `Imported Commerce ${suffix}`);

    const publicCommerce = await assertPublicCommerce({
      productCollection: finalProductCollection,
      ordersCollection: finalOrdersCollection,
      slug,
    });
    productRecordId = publicCommerce.productRecord.id;
    orderRecordId = publicCommerce.orderRecord.id;
    finalCustomerCollection = publicCommerce.customersCollection;
    customerRecordId = publicCommerce.customerRecord.id;
    managedCustomerProfile = await assertCustomerProfileManagement(client, finalCustomerCollection, publicCommerce.customerRecord);

    const layout = await assertProductsLayout(client);
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));
    const productListPageTemplate = await assertProductPageTemplateShortcut(client, finalProductCollection, {
      mode: 'list',
      testId: 'products-page-template-list',
      title: 'Product catalog',
      slug: 'products-list',
      nav: 'primary',
    });
    const featuredProductPageTemplate = await assertProductPageTemplateShortcut(client, finalProductCollection, {
      mode: 'list',
      testId: 'products-page-template-featured-collection',
      title: 'Featured products',
      slug: 'featured-products',
      nav: 'primary',
    });
    const productDetailPageTemplate = await assertProductPageTemplateShortcut(client, finalProductCollection, {
      mode: 'item',
      testId: 'products-page-template-item',
      title: 'Product detail',
      slug: 'product-detail',
      nav: 'none',
    });
    const productLaunchPageTemplate = await assertProductPageTemplateShortcut(client, finalProductCollection, {
      mode: 'item',
      testId: 'products-page-template-product-launch',
      title: 'Product launch',
      slug: 'product-launch',
      nav: 'none',
    });

    const browserErrors = client.events
      .filter((event) => (
        event.method === 'Runtime.exceptionThrown'
        || (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error')
      ))
      .map((event) => event.params);

    assert(browserErrors.length === 0, `Browser emitted errors: ${JSON.stringify(browserErrors.slice(0, 3))}`);

    await deleteCollectionRecord(finalOrdersCollection.id, orderRecordId);
    await deleteCollectionRecord(finalCustomerCollection.id, customerRecordId);
    await deleteCollectionRecord(finalProductCollection.id, productRecordId);
    await deleteCollectionRecord(finalProductCollection.id, importedProductRecordId);
    productRecordId = null;
    importedProductRecordId = null;
    orderRecordId = null;
    customerRecordId = null;

    await restoreCollection(originalProductCollection, finalProductCollection);
    await restoreCollection(originalOrdersCollection, finalOrdersCollection);
    await restoreCollection(originalCustomerCollection, finalCustomerCollection);
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
      apiSchemaSetup,
      ordersReady,
      productsReady,
      product: {
        slug,
        recordId: publicCommerce.productRecord.id,
        startingInventory: publicCommerce.productRecord.values?.inventory,
        endingInventory: publicCommerce.updatedProduct.values?.inventory,
      },
      frontendTemplateProduct: {
        slug: frontendTemplateProduct.slug,
        recordId: frontendTemplateProduct.id,
        templateId: frontendTemplateProduct.values?.frontendDesignTemplateId,
        publicTemplateId: frontendCatalogProduct.design?.frontendDesignTemplateId,
        bindingHints: frontendCatalogProduct.design?.frontendDesignBindingHints?.length || 0,
      },
      importedProduct: {
        slug: importedProduct.slug,
        recordId: importedProduct.id,
      },
      order: {
        id: publicCommerce.order.id,
        slug: publicCommerce.order.slug,
        total: publicCommerce.order.total,
        itemCount: publicCommerce.order.itemCount,
      },
      stripeCheckoutExecution: publicCommerce.stripeCheckoutExecution,
      customer: {
        id: publicCommerce.customerRecord.id,
        slug: publicCommerce.customerRecord.slug,
        orderCount: publicCommerce.customerRecord.values?.ordercount,
        totalSpent: publicCommerce.customerRecord.values?.totalspent,
        managedStatus: managedCustomerProfile?.values?.status,
      },
      layout,
      productPageTemplates: {
        list: {
          collectionId: productListPageTemplate.collectionId,
          datasetMode: productListPageTemplate.datasetMode,
          slug: productListPageTemplate.slug,
        },
        detail: {
          collectionId: productDetailPageTemplate.collectionId,
          datasetMode: productDetailPageTemplate.datasetMode,
          slug: productDetailPageTemplate.slug,
        },
        featured: {
          collectionId: featuredProductPageTemplate.collectionId,
          datasetMode: featuredProductPageTemplate.datasetMode,
          slug: featuredProductPageTemplate.slug,
        },
        launch: {
          collectionId: productLaunchPageTemplate.collectionId,
          datasetMode: productLaunchPageTemplate.datasetMode,
          slug: productLaunchPageTemplate.slug,
        },
      },
      frontendProductCleaned,
      restored,
      screenshotPath: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    if (!restored) {
      if (finalProductCollection?.id && frontendProductRecordId) {
        await deleteCollectionRecord(finalProductCollection.id, frontendProductRecordId).catch((error) => {
          console.warn('Unable to delete frontend template smoke product:', error instanceof Error ? error.message : error);
        });
      }
      if (finalOrdersCollection?.id && orderRecordId) {
        await deleteCollectionRecord(finalOrdersCollection.id, orderRecordId).catch((error) => {
          console.warn('Unable to delete smoke order:', error instanceof Error ? error.message : error);
        });
      }
      if (finalCustomerCollection?.id && customerRecordId) {
        await deleteCollectionRecord(finalCustomerCollection.id, customerRecordId).catch((error) => {
          console.warn('Unable to delete smoke customer:', error instanceof Error ? error.message : error);
        });
      }
      if (finalProductCollection?.id && productRecordId) {
        await deleteCollectionRecord(finalProductCollection.id, productRecordId).catch((error) => {
          console.warn('Unable to delete smoke product:', error instanceof Error ? error.message : error);
        });
      }
      if (finalProductCollection?.id && importedProductRecordId) {
        await deleteCollectionRecord(finalProductCollection.id, importedProductRecordId).catch((error) => {
          console.warn('Unable to delete imported smoke product:', error instanceof Error ? error.message : error);
        });
      }
      await restoreCollection(originalProductCollection, finalProductCollection || await findCollection(PRODUCT_COLLECTION_SLUG)).catch((error) => {
        console.warn('Unable to restore product collection:', error instanceof Error ? error.message : error);
      });
      await restoreCollection(originalOrdersCollection, finalOrdersCollection || await findCollection(ORDERS_COLLECTION_SLUG)).catch((error) => {
        console.warn('Unable to restore orders collection:', error instanceof Error ? error.message : error);
      });
      await restoreCollection(originalCustomerCollection, finalCustomerCollection || await findCollection(CUSTOMERS_COLLECTION_SLUG)).catch((error) => {
        console.warn('Unable to restore customers collection:', error instanceof Error ? error.message : error);
      });
    }
    await patchFrontendDesign(originalFrontendDesign).catch((error) => {
      console.warn('Unable to restore original frontend design contract:', error instanceof Error ? error.message : error);
    });
    await patchSettingsFromSnapshot(originalSettings).catch((error) => {
      console.warn('Unable to restore original settings:', error instanceof Error ? error.message : error);
    });

    await cleanupBrowser({ client, childProcess, userDataDir });
    if (stripeCheckoutMock) {
      await stripeCheckoutMock.close();
      stripeCheckoutMock = null;
    }
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
